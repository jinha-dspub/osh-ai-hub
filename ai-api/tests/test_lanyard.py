import hashlib
import io
import sqlite3
import types

import anthropic
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app import budget, lanyard
from app.demo_gateway import app

ORIGIN = {"Origin": "https://osh.ai.kr"}


def fake_rules():
    module = types.SimpleNamespace()
    module.features = lambda polyline, belt: {"belt": belt}
    module.judge_v05 = lambda f, polyline, belt: (
        ("불명", ["ambiguous"]) if polyline[0][0] > 100 else ("미체결", ["R3_hang"])
    )

    def judge_chain(shape, r5, fallback="불명"):
        if shape != "불명":
            return shape, "shape"
        if r5 == "structure":
            return "체결", "chain_R5_structure"
        return ("불명", "R5_none") if r5 is None else (fallback, "chain_R5_not_structure")

    module.judge_chain = judge_chain
    return module


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    monkeypatch.setenv("LANYARD_STORE_DIR", str(tmp_path / "store"))
    monkeypatch.setenv("OSH_PUBLIC_DEMOS", "lanyard")
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    monkeypatch.setattr(budget, "day", lambda: "2026-09-30")
    monkeypatch.setattr(lanyard, "rules", fake_rules)
    monkeypatch.setattr(lanyard, "service_prompt", lambda: "DEMO prompt")
    lanyard.counters.clear()
    lanyard.pending.clear()

    def detect(image):
        lanyards = [
            {"box": [10, 10, 50, 90], "conf": 0.9, "polyline": [[20, 20]] * 7},
            {"box": [150, 10, 190, 90], "conf": 0.8, "polyline": [[160, 20]] * 7},
        ]
        return lanyards, [[5, 5, 60, 60]]

    monkeypatch.setattr(lanyard, "run_detector", detect)


def photo(exif=False):
    out = io.BytesIO()
    image = Image.new("RGB", (400, 300), "white")
    if exif:
        data = image.getexif()
        data[0x010F] = "DEMO-camera"
        image.save(out, "JPEG", exif=data)
    else:
        image.save(out, "JPEG")
    return out.getvalue()


def gateway(peer="192.168.0.3"):
    return TestClient(app, client=(peer, 1234))


def upload(client, data=None, keep=False, headers=None):
    return client.post(
        f"/demo/lanyard/api/analyze?keep={'true' if keep else 'false'}",
        content=photo() if data is None else data,
        headers={"Content-Type": "image/jpeg", **ORIGIN, **(headers or {})},
    )


def test_public_path_opens_only_listed_demo_through_gateway(monkeypatch):
    client = gateway()
    assert client.get("/demo/lanyard/api/status").status_code == 200
    assert client.get("/demo/copd/api?action=info").status_code == 403
    assert client.get("/demo/lanyard/../copd/").status_code == 403
    assert client.get("/demo/lanyard//x").status_code == 403
    assert gateway("192.168.0.55").get("/demo/lanyard/api/status").status_code == 403
    monkeypatch.setenv("OSH_PUBLIC_DEMOS", "")
    assert client.get("/demo/lanyard/api/status").status_code == 403
    authed = client.get("/demo/lanyard/api/status", headers={"X-OSH-Authenticated-User": "DEMO"})
    assert authed.status_code == 200


def test_release_files_must_match_pinned_hashes(tmp_path, monkeypatch):
    nas = tmp_path / "nas"
    base = nas / lanyard.PROJECT / "serving"
    (base / lanyard.RELEASE).mkdir(parents=True)
    (base / "current").symlink_to(lanyard.RELEASE)
    (nas / "README.md").write_text("DEMO")
    monkeypatch.setenv("NAS_DATA", str(nas))
    target = base / lanyard.RELEASE / "prompt_service.txt"
    target.write_text("tampered DEMO prompt")
    with pytest.raises(HTTPException) as error:
        lanyard.verified_bytes("prompt_service.txt")
    assert error.value.status_code == 503
    monkeypatch.setitem(
        lanyard.PINNED, "prompt_service.txt", hashlib.sha256(target.read_bytes()).hexdigest()
    )
    assert lanyard.verified_bytes("prompt_service.txt") == target.read_bytes()
    (base / "current").unlink()
    (base / "other-v2").mkdir()
    (base / "other-v2" / "prompt_service.txt").write_bytes(target.read_bytes())
    (base / "current").symlink_to("other-v2")
    with pytest.raises(HTTPException):
        lanyard.verified_bytes("prompt_service.txt")
    (nas / "README.md").unlink()
    with pytest.raises(HTTPException) as error:
        lanyard.verified_bytes("prompt_service.txt")
    assert "NAS" in error.value.detail


def test_upload_validation():
    client = gateway()
    assert upload(client, headers={"Origin": "https://evil.test"}).status_code == 403
    wrong_type = client.post(
        "/demo/lanyard/api/analyze",
        content=photo(),
        headers={"Content-Type": "text/plain", **ORIGIN},
    )
    assert wrong_type.status_code == 415
    assert upload(client, data=b"not an image").status_code == 415
    assert upload(client, data=b"x" * (lanyard.MAX_UPLOAD + 1)).status_code == 413
    assert upload(client, data=b"").status_code == 422


def test_run_is_logged_and_photo_kept_only_with_consent(tmp_path):
    client = gateway()
    plain = upload(client).json()
    assert plain["summary"] == {"체결": 0, "미체결": 1, "거치": 0, "불명": 1}
    assert plain["lanyards"][0]["harness_box"] == [5, 5, 60, 60]
    kept = upload(client, data=photo(exif=True), keep=True).json()
    images = list((tmp_path / "store" / "images").rglob("*.jpg"))
    assert [p.stem for p in images] == [kept["id"]]
    assert not Image.open(images[0]).getexif()  # EXIF removed before storage
    rows = sqlite3.connect(tmp_path / "store" / "runs.sqlite").execute(
        "SELECT id,image_kept FROM runs ORDER BY image_kept"
    )
    assert rows.fetchall() == [(plain["id"], 0), (kept["id"], 1)]


class FakeMessages:
    def __init__(self, outcome):
        self.outcome = outcome
        self.calls = 0

    def create(self, **params):
        self.calls += 1
        assert params["model"] == lanyard.VLM_MODEL
        if isinstance(self.outcome, Exception):
            raise self.outcome
        usage = types.SimpleNamespace(input_tokens=3000, output_tokens=900)
        block = types.SimpleNamespace(type="text", text=self.outcome)
        return types.SimpleNamespace(usage=usage, stop_reason="end_turn", content=[block])


def use_claude(monkeypatch, outcome):
    messages = FakeMessages(outcome)
    monkeypatch.setattr(lanyard, "claude_client", lambda: types.SimpleNamespace(messages=messages))
    return messages


WORKERS = (
    '{"workers": [{"box": [300, 0, 600, 400], "label": "clipped", "location": "fall_risk",'
    ' "reason": "DEMO 난간에 체결"}]}'
)


def test_review_resolves_only_unknown_shape_and_settles_usage(monkeypatch):
    messages = use_claude(monkeypatch, WORKERS)
    client = gateway()
    run = upload(client).json()
    result = client.post("/demo/lanyard/api/review", json={"id": run["id"]}, headers=ORIGIN).json()
    finals = [item["final"] for item in result["lanyards"]]
    assert finals == [
        {"label": "미체결", "source": "shape"},
        {"label": "체결", "source": "chain_R5_structure"},
    ]
    assert result["workers"][0]["fall_risk"] is True
    assert result["workers"][0]["has_lanyard"] is True
    with budget.database() as db:
        assert budget.used_by(db, "2026-09-30", lanyard.PROVIDER) == lanyard.vlm_cost(
            types.SimpleNamespace(input_tokens=3000, output_tokens=900)
        )
    again = client.post("/demo/lanyard/api/review", json={"id": run["id"]}, headers=ORIGIN)
    assert again.status_code == 404  # one paid check per upload
    assert messages.calls == 1


def test_review_is_bound_to_uploader(monkeypatch):
    messages = use_claude(monkeypatch, WORKERS)
    client = gateway()
    run = upload(client, headers={"X-Forwarded-For": "203.0.113.1"}).json()
    other = client.post(
        "/demo/lanyard/api/review",
        json={"id": run["id"]},
        headers={"X-Forwarded-For": "203.0.113.2", **ORIGIN},
    )
    assert other.status_code == 404
    assert messages.calls == 0


def test_service_budget_share_blocks_before_paid_call(monkeypatch):
    monkeypatch.setenv("LANYARD_DAILY_KRW", str(lanyard.VLM_RESERVE - 1))
    messages = use_claude(monkeypatch, WORKERS)
    client = gateway()
    run = upload(client).json()
    response = client.post("/demo/lanyard/api/review", json={"id": run["id"]}, headers=ORIGIN)
    assert response.status_code == 429
    assert messages.calls == 0


def test_rejected_request_is_settled_at_zero(monkeypatch):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.BadRequestError(
        "DEMO rejected", response=httpx.Response(400, request=request), body=None
    )
    use_claude(monkeypatch, error)
    client = gateway()
    run = upload(client).json()
    response = client.post("/demo/lanyard/api/review", json={"id": run["id"]}, headers=ORIGIN)
    assert response.status_code == 502
    with budget.database() as db:
        assert budget.used(db, "2026-09-30") == 0


def test_malformed_ai_answer_is_rejected(monkeypatch):
    use_claude(
        monkeypatch,
        '{"workers": [{"box": [0, 0, 2000, 10], "label": "clipped", "location": "ground"}]}',
    )
    client = gateway()
    run = upload(client).json()
    response = client.post("/demo/lanyard/api/review", json={"id": run["id"]}, headers=ORIGIN)
    assert response.status_code == 502


def test_per_client_daily_limit(monkeypatch):
    monkeypatch.setenv("LANYARD_ANALYZE_PER_CLIENT", "2")
    client = gateway()
    assert upload(client).status_code == 200
    assert upload(client).status_code == 200
    assert upload(client).status_code == 429


def test_feedback_requires_known_run_and_is_bounded():
    client = gateway()
    run = upload(client).json()
    body = {"id": run["id"], "verdict": "wrong", "note": "DEMO 두 번째 작업자는 체결"}
    for _ in range(3):
        assert client.post("/demo/lanyard/api/feedback", json=body, headers=ORIGIN).json()["ok"]
    assert client.post("/demo/lanyard/api/feedback", json=body, headers=ORIGIN).status_code == 429
    unknown = {**body, "id": "0" * 32}
    assert (
        client.post("/demo/lanyard/api/feedback", json=unknown, headers=ORIGIN).status_code == 404
    )
    bad = {**body, "verdict": "maybe"}
    assert client.post("/demo/lanyard/api/feedback", json=bad, headers=ORIGIN).status_code == 422
