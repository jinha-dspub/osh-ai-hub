import hashlib
import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import public_ohs_readiness as ro
from app import support_programs_ai as shared
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user"}
POST = {**HEADERS, "Origin": "https://osh.ai.kr", "Content-Type": "application/json"}
CRITERIA = ro.PREFIX + "/api/criteria"
INTERPRET = ro.PREFIX + "/api/interpret"
DOWNLOAD = ro.PREFIX + "/download/"


def csv_bytes(rows):
    head = list(rows[0])
    lines = [",".join(head)] + [",".join(str(r[h]) for h in head) for r in rows]
    return ("﻿" + "\r\n".join(lines) + "\r\n").encode()


def write_release(root):
    """DEMO release shaped like the real one; returns the pinned digest."""
    files = {
        "README.md": b"# DEMO",
        "readiness.zip": b"PK DEMO",
        "data/purposes.csv": csv_bytes([{"id": "물품", "이름": "DEMO 물품", "설명": "DEMO"}]),
        "data/profile_fields.csv": csv_bytes(
            [
                {"필드": "업종", "형식": "string", "설명": "DEMO", "선택지": "", "묶음": "기본"},
                {
                    "필드": "상시근로자수",
                    "형식": "integer|null",
                    "설명": "DEMO",
                    "선택지": "",
                    "묶음": "기본",
                },
                {
                    "필드": "위험성평가",
                    "형식": "enum",
                    "설명": "DEMO",
                    "선택지": "예;아니오;모름",
                    "묶음": "체계",
                },
            ]
        ),
        "data/checklist.jsonl": (
            json.dumps({"id": "DEMO-01", "판정": {"필드": "위험성평가"}}, ensure_ascii=False) + "\n"
        ).encode(),
        "data/criteria_scoring.csv": csv_bytes([{"기준ID": "DEMO", "점수": "-3"}]),
        "data/duty_thresholds.json": b"{}",
        "data/duty_thresholds.csv": csv_bytes([{"의무": "DEMO", "업종": "C25"}]),
        "data/sources.csv": csv_bytes([{"source_id": "DEMO", "이름": "DEMO"}]),
    }
    for path, data in files.items():
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_bytes(data)
    (root / "RELEASE.md").write_text("DEMO release notes, not pinned")
    listing = "\n".join(sorted(f"{p}\t{hashlib.sha256(d).hexdigest()}" for p, d in files.items()))
    return hashlib.sha256(listing.encode()).hexdigest()


@pytest.fixture
def release(tmp_path, monkeypatch):
    monkeypatch.setattr(ro, "ROOT", tmp_path)
    monkeypatch.setattr(ro, "DIGEST", write_release(tmp_path))
    monkeypatch.setenv("AI_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    monkeypatch.setattr(shared, "_counts", {})
    ro.files.cache_clear()
    ro.criteria.cache_clear()
    yield tmp_path
    ro.files.cache_clear()
    ro.criteria.cache_clear()


def client():
    return TestClient(app, client=("192.168.0.3", 1234))


def test_criteria_and_downloads(release):
    body = client().get(CRITERIA, headers=HEADERS).json()
    assert body["checklist"][0]["id"] == "DEMO-01"
    assert body["purposes"][0]["id"] == "물품"
    assert "RELEASE.md" not in body["downloads"] and "readiness.zip" in body["downloads"]
    got = client().get(DOWNLOAD + "data/criteria_scoring.csv", headers=HEADERS)
    assert got.status_code == 200 and got.headers["content-disposition"].startswith("attachment")


@pytest.mark.parametrize(
    "name", ["RELEASE.md", "../RELEASE.md", "data/../../etc/passwd", "data/missing.csv"]
)
def test_only_pinned_files_download(release, name):
    assert client().get(DOWNLOAD + name, headers=HEADERS).status_code in {403, 404}


def test_changed_release_is_refused(release):
    (release / "data/extra.csv").write_text("DEMO")
    ro.files.cache_clear()
    ro.criteria.cache_clear()
    assert client().get(CRITERIA, headers=HEADERS).status_code == 503


def test_gateway_only(release, monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    direct = TestClient(app, client=("192.168.0.55", 1234))
    assert direct.get(CRITERIA, headers=HEADERS).status_code == 403


def test_interpret_keeps_only_grounded_schema_values(release, monkeypatch):
    sent = []

    def fake(description):
        sent.append(description)
        return {
            "f00": "C25",
            "f01": 80,
            "f02": "예",
            "purposes": ["물품", "없는목적"],
            "evidence": {"f00": "금속 가공", "f01": "직원 80명", "f02": "지어낸 문구"},
        }

    monkeypatch.setattr(ro, "call_claude", fake)
    text = "DEMO 금속 가공 회사, 직원 80명. 연락처 010-1234-5678"
    response = client().post(
        INTERPRET, headers=POST, content=json.dumps({"설명": text}, ensure_ascii=False).encode()
    )
    assert response.status_code == 200
    body = response.json()
    assert body["프로필"]["업종"] == "C25" and body["프로필"]["상시근로자수"] == 80
    assert body["프로필"]["위험성평가"] == "모름" and body["버린칸"] == ["위험성평가"]
    assert body["프로필"]["목적"] == ["물품"]
    assert "010-1234-5678" not in sent[0]


@pytest.mark.parametrize(
    "raw",
    [
        {"f00": "Z99", "evidence": {"f00": "금속"}},
        {"f01": 0, "evidence": {"f01": "80"}},
        {"f02": "아마도", "evidence": {"f02": "금속"}},
    ],
)
def test_out_of_schema_values_become_unknown(release, raw):
    profile, evidence, _ = ro.checked(raw, "DEMO 금속 가공 80")
    assert profile["업종"] == "모름" and profile["상시근로자수"] is None
    assert profile["위험성평가"] == "모름" and not evidence


@pytest.mark.parametrize(
    "headers, content, status",
    [
        ({**POST, "Content-Type": "text/plain"}, json.dumps({"설명": "DEMO 설명입니다"}), 415),
        (POST, json.dumps({"설명": "짧"}), 422),
        (POST, json.dumps({"설명": "DEMO 설명입니다", "이름": "x"}), 422),
        ({**POST, "Origin": "https://evil.test"}, json.dumps({"설명": "DEMO 설명입니다"}), 403),
        (POST, "x" * 5000, 413),
    ],
)
def test_bad_requests_never_reach_claude(release, monkeypatch, headers, content, status):
    def boom(description):
        raise AssertionError("Claude must not be called")

    monkeypatch.setattr(ro, "call_claude", boom)
    response = client().post(INTERPRET, headers=headers, content=content.encode())
    assert response.status_code == status


def test_daily_cap_stops_before_claude(release, monkeypatch):
    monkeypatch.setenv("PUBLIC_OHS_AI_DAILY_KRW", str(ro.RESERVE - 1))
    called = []
    monkeypatch.setattr(
        shared, "claude_client", lambda: called.append(1) or (_ for _ in ()).throw(AssertionError())
    )
    with pytest.raises(HTTPException) as error:
        ro.call_claude("DEMO")
    assert error.value.status_code == 429 and not called
