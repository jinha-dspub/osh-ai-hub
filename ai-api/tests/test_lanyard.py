import base64
import hashlib
import io
import json
import random
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
    (tmp_path / "nas").mkdir()
    (tmp_path / "nas" / "README.md").write_text("DEMO NAS")
    monkeypatch.setenv("NAS_DATA", str(tmp_path / "nas"))  # never write the real NAS in tests
    monkeypatch.setattr(lanyard, "today", lambda: "2026-09-30")
    monkeypatch.setenv("OSH_PUBLIC_DEMOS", "lanyard")
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    monkeypatch.setattr(budget, "day", lambda: "2026-09-30")
    monkeypatch.setattr(lanyard, "rules", fake_rules)
    monkeypatch.setattr(lanyard, "service_prompt", lambda: "DEMO prompt")
    lanyard.counters.clear()
    lanyard.pending.clear()
    lanyard.uploads.clear()

    def detect(image):
        lanyards = [
            {"box": [10, 10, 50, 90], "conf": 0.9, "polyline": [[20, 20]] * 7},
            {"box": [150, 10, 190, 90], "conf": 0.8, "polyline": [[160, 20]] * 7},
        ]
        return lanyards, [[5, 5, 60, 60]]

    monkeypatch.setattr(lanyard, "run_detector", detect)


def photo(exif=False):
    out = io.BytesIO()
    # Noise so the JPEG spans several 11 KB chunks.
    rng = random.Random(0)
    image = Image.frombytes("RGB", (400, 300), bytes(rng.randrange(256) for _ in range(360000)))
    if exif:
        data = image.getexif()
        data[0x010F] = "DEMO-camera"
        image.save(out, "JPEG", exif=data)
    else:
        image.save(out, "JPEG")
    return out.getvalue()


def gateway(peer="192.168.0.3"):
    return TestClient(app, client=(peer, 1234))


def post(client, path, body, headers=None):
    return client.post(
        f"/demo/lanyard/api/{path}", json=body, headers={**ORIGIN, **(headers or {})}
    )


def upload(client, data=None, headers=None):
    """Chunked upload exactly as the browser does it under the .3 16k body limit."""
    data = photo() if data is None else data
    start = post(client, "upload/start", {"size": len(data)}, headers)
    if start.status_code != 200:
        return start
    upload_id, size = start.json()["id"], start.json()["chunk_bytes"]
    for seq, offset in enumerate(range(0, len(data), size)):
        chunk = base64.b64encode(data[offset : offset + size]).decode()
        response = post(
            client, "upload/chunk", {"id": upload_id, "seq": seq, "data": chunk}, headers
        )
        assert response.status_code == 200, response.text
    return post(client, "upload/finish", {"id": upload_id}, headers)


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
    assert len(photo()) > 2 * lanyard.CHUNK_BYTES
    assert upload(client, headers={"Origin": "https://evil.test"}).status_code == 403
    text = client.post(
        "/demo/lanyard/api/upload/start",
        content="{}",
        headers={"Content-Type": "text/plain", **ORIGIN},
    )
    assert text.status_code == 415
    assert upload(client, data=b"not an image").status_code == 415
    too_big = post(client, "upload/start", {"size": lanyard.MAX_UPLOAD + 1})
    assert too_big.status_code == 422
    assert post(client, "upload/start", {"size": 0}).status_code == 422


def test_chunks_fit_gateway_limit_and_are_ordered_and_bound():
    client = gateway()
    data = photo()
    upload_id = post(client, "upload/start", {"size": len(data)}).json()["id"]
    first = base64.b64encode(data[: lanyard.CHUNK_BYTES]).decode()
    body = {"id": upload_id, "seq": 0, "data": first}
    assert len(str(body).encode()) < lanyard.BODY_LIMIT < 16 * 1024
    assert post(client, "upload/chunk", body).json()["received"] == lanyard.CHUNK_BYTES
    assert post(client, "upload/chunk", body).json()["received"] == lanyard.CHUNK_BYTES  # replay
    skip = {"id": upload_id, "seq": 5, "data": first}
    assert post(client, "upload/chunk", skip).status_code == 409
    other = post(client, "upload/chunk", {**body, "seq": 1}, {"X-Forwarded-For": "203.0.113.9"})
    assert other.status_code == 404
    oversized = base64.b64encode(b"x" * (lanyard.CHUNK_BYTES + 3)).decode()
    assert post(client, "upload/chunk", {**body, "seq": 1, "data": oversized}).status_code == 422
    assert post(client, "upload/finish", {"id": upload_id}).status_code == 422  # incomplete
    huge = client.post(
        "/demo/lanyard/api/upload/chunk",
        content=b"{" + b" " * lanyard.BODY_LIMIT + b"}",
        headers={"Content-Type": "application/json", **ORIGIN},
    )
    assert huge.status_code == 413
    small = post(client, "upload/start", {"size": 10}).json()["id"]
    over = {"id": small, "seq": 0, "data": base64.b64encode(b"x" * 11).decode()}
    assert post(client, "upload/chunk", over).status_code == 413


def project(tmp_path):
    return tmp_path / "nas" / lanyard.PROJECT


def test_originals_go_to_nas_raw_and_labels_to_processed(tmp_path):
    client = gateway()
    first = upload(client).json()
    assert first["summary"] == {"체결": 0, "미체결": 1, "거치": 0, "불명": 1}
    assert first["lanyards"][0]["harness_box"] == [5, 5, 60, 60]
    second = upload(client, data=photo(exif=True)).json()
    raw = project(tmp_path) / "raw/osh-uploads-20260930"
    labels = project(tmp_path) / "processed/osh-labels-20260930-v1"
    images = sorted(raw.glob("*.jpg"))
    assert sorted(p.stem for p in images) == sorted([first["id"], second["id"]])
    assert not any(Image.open(p).getexif() for p in images)  # EXIF removed before storage
    assert "외부 공유 금지" in (raw / "MANIFEST.md").read_text()
    assert (labels / "README.md").exists() and not list(raw.glob("*.json"))
    stage1 = json.loads((labels / f"{first['id']}.stage1.json").read_text())
    assert stage1["image"] == f"raw/osh-uploads-20260930/{first['id']}.jpg"
    assert stage1["summary"] == first["summary"] and len(stage1["lanyards"]) == 2
    assert not (tmp_path / "store" / "images").exists()  # no second local copy
    rows = sqlite3.connect(tmp_path / "store" / "runs.sqlite").execute(
        "SELECT id,image_kept FROM runs ORDER BY id"
    )
    assert rows.fetchall() == sorted([(first["id"], 1), (second["id"], 1)])
    body = {"id": first["id"], "verdict": "wrong", "note": "DEMO 메모"}
    post(client, "feedback", body)
    post(client, "feedback", {**body, "verdict": "correct"})
    notes = sorted(labels.glob(f"{first['id']}.feedback-*.json"))
    assert [json.loads(p.read_text())["verdict"] for p in notes] == ["wrong", "correct"]
    consent = post(client, "upload/start", {"size": 10, "keep": False})
    assert consent.status_code == 422  # no per-upload storage option any more


def test_archive_never_overwrites_and_waits_locally_when_nas_is_down(tmp_path):
    lanyard.archive("raw", "2026-09-30", "DEMO.jpg", b"first")
    lanyard.archive("raw", "2026-09-30", "DEMO.jpg", b"second")
    assert (project(tmp_path) / "raw/osh-uploads-20260930/DEMO.jpg").read_bytes() == b"first"
    (tmp_path / "nas" / "README.md").unlink()
    lanyard.archive_json("2026-09-30", "DEMO.stage1.json", {"id": "DEMO"})
    waiting = tmp_path / "store/nas-pending" / lanyard.PROJECT / "processed/osh-labels-20260930-v1"
    assert json.loads((waiting / "DEMO.stage1.json").read_text()) == {"id": "DEMO"}
    assert not (project(tmp_path) / "processed").exists()


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


def test_review_resolves_only_unknown_shape_and_settles_usage(tmp_path, monkeypatch):
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
    saved = project(tmp_path) / f"processed/osh-labels-20260930-v1/{run['id']}.stage2.json"
    assert json.loads(saved.read_text())["model"] == lanyard.VLM_MODEL
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


def test_overlapping_duplicate_lanyards_keep_the_more_confident():
    same = {"box": [981.8, 477.6, 1007.9, 527.5], "conf": 0.304, "polyline": [[0, 0]] * 7}
    twin = {"box": [981.6, 476.2, 1014.6, 553.3], "conf": 0.278, "polyline": [[1, 1]] * 7}
    other = {"box": [1447.7, 232.6, 1592.0, 429.8], "conf": 0.293, "polyline": [[2, 2]] * 7}
    assert lanyard.dedupe([twin, other, same]) == [same, other]


def test_dataset_download_is_withdrawn():
    client = gateway()
    assert client.get("/demo/lanyard/api/files").status_code in {404, 405}
    assert post(client, "download", {"id": "labels-json"}).status_code in {404, 405}


def test_sync_moves_pending_backfills_old_runs_and_locks_past_days(tmp_path):
    import importlib.util

    script = lanyard.Path(lanyard.__file__).parents[1] / "scripts/sync_lanyard_nas.py"
    spec = importlib.util.spec_from_file_location("sync_lanyard_nas", script)
    sync = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sync)
    (tmp_path / "nas" / "README.md").unlink()
    run = upload(gateway()).json()  # NAS down: photo and stage1 wait locally
    (tmp_path / "nas" / "README.md").write_text("DEMO NAS")
    assert sync.flush_pending() == 2
    raw = project(tmp_path) / "raw/osh-uploads-20260930"
    assert (raw / f"{run['id']}.jpg").exists() and (raw / "MANIFEST.md").exists()
    assert not list((tmp_path / "store/nas-pending").rglob("*.jpg"))
    # A run from before NAS archiving: local image + DB row only.
    old = tmp_path / "store/images/2026-09-29"
    old.mkdir(parents=True)
    (old / ("a" * 32 + ".jpg")).write_bytes(b"DEMO old photo")
    with lanyard.runs_db() as db:
        db.execute(
            "INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL)",
            (
                "a" * 32,
                "2026-09-29T10:00:00+09:00",
                lanyard.RELEASE,
                4,
                3,
                "0",
                1,
                json.dumps({"lanyards": [], "harnesses": []}),
            ),
        )
    assert sync.backfill() == 1
    past = project(tmp_path) / "raw/osh-uploads-20260929"
    assert (past / ("a" * 32 + ".jpg")).read_bytes() == b"DEMO old photo"
    assert not (old / ("a" * 32 + ".jpg")).exists()
    labels = project(tmp_path) / "processed/osh-labels-20260929-v1"
    assert json.loads((labels / ("a" * 32 + ".stage1.json")).read_text())["summary"]["체결"] == 0
    assert sync.backfill() == 0  # idempotent
    assert sync.lock_finished_days() > 0
    assert not (past.stat().st_mode & 0o222) and raw.stat().st_mode & 0o200  # today stays open
