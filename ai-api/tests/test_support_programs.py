import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import support_programs
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user"}
API = support_programs.PREFIX + "/api/catalogue"


def write_release(root, extra_column=True):
    tables = {}
    for name, (path, _) in support_programs.TABLES.items():
        columns = support_programs.COLUMNS[name] + (["내부메모"] if extra_column else [])
        values = [f"DEMO {c}" for c in columns]
        if name == "분류":  # joins the DEMO programme row to a real Hub category
            values[:3] = ["DEMO 사업ID", "설비개선", "DEMO"]
        content = ("﻿" + ",".join(columns) + "\r\n" + ",".join(values) + "\r\n").encode()
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_bytes(content)
        tables[name] = (path, hashlib.sha256(content).hexdigest())
    return tables


@pytest.fixture
def release(tmp_path, monkeypatch):
    monkeypatch.setattr(support_programs, "ROOT", tmp_path)
    monkeypatch.setattr(support_programs, "TABLES", write_release(tmp_path))
    support_programs.catalogue.cache_clear()
    yield tmp_path
    support_programs.catalogue.cache_clear()


def test_catalogue_requires_gateway_user(release, monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    direct = TestClient(app, client=("192.168.0.55", 1234))
    assert direct.get(API, headers=HEADERS).status_code == 403
    trusted = TestClient(app, client=("192.168.0.3", 1234))
    assert trusted.get(API).status_code == 403
    assert trusted.get(support_programs.PREFIX + "/").status_code == 403


def test_catalogue_serves_only_display_columns(release):
    client = TestClient(app, client=("192.168.0.3", 1234))
    body = client.get(API, headers=HEADERS).json()
    assert body["version"] == support_programs.VERSION
    assert list(body["사업"][0]) == support_programs.COLUMNS["사업"] + ["분류"]
    assert list(body["품목"][0]) == support_programs.COLUMNS["품목"]
    assert "내부메모" not in body["사업"][0]
    assert body["사업"][0]["분류"] == "설비개선"
    assert [c["이름"] for c in body["분류"]] == support_programs.CATEGORIES
    assert body["release"] == support_programs.RELEASE
    assert "분류" not in support_programs.COLUMNS["사업"]


def test_programme_without_category_is_refused(release, monkeypatch):
    path, _ = support_programs.TABLES["분류"]
    content = (release / path).read_bytes().replace("설비개선".encode(), b"DEMO")
    (release / path).write_bytes(content)
    import hashlib

    tables = dict(support_programs.TABLES)
    tables["분류"] = (path, hashlib.sha256(content).hexdigest())
    monkeypatch.setattr(support_programs, "TABLES", tables)
    support_programs.catalogue.cache_clear()
    client = TestClient(app, client=("192.168.0.3", 1234))
    assert client.get(API, headers=HEADERS).status_code == 503


def test_changed_release_is_refused(release):
    path = release / support_programs.TABLES["사업"][0]
    path.write_bytes(path.read_bytes() + b"tampered\r\n")
    support_programs.catalogue.cache_clear()
    client = TestClient(app, client=("192.168.0.3", 1234))
    response = client.get(API, headers=HEADERS)
    assert response.status_code == 503
    assert "tampered" not in response.text


def test_missing_release_is_unavailable(tmp_path, monkeypatch):
    monkeypatch.setattr(support_programs, "ROOT", tmp_path)
    support_programs.catalogue.cache_clear()
    client = TestClient(app, client=("192.168.0.3", 1234))
    assert client.get(API, headers=HEADERS).status_code == 503
    support_programs.catalogue.cache_clear()


# ---- demand log ----------------------------------------------------------------

LOG = support_programs.PREFIX + "/api/log"
POST = {**HEADERS, "Origin": "https://osh.ai.kr", "Content-Type": "text/plain;charset=UTF-8"}


def batch(**over):
    body = {
        "스키마": 2,
        "판본": "react-0123456789",
        "세션ID": "2026-10-01-demo1234ab",
        "순번": 1,
        "시작": "2026-10-01T03:00:00Z",
        "갱신": "2026-10-01T03:00:05Z",
        "조건": {
            "신청주체": "전체",
            "근로자수": 30,
            "업종": "C25",
            "지역": "전국",
            "기업": "모름",
            "유해인자": "모름",
        },
        "이벤트": [
            {"t": 0, "행동": "열기"},
            {
                "t": 900,
                "행동": "노출",
                "목록": ["2026-01", "2026-L03"],
                "결과건수": 2,
                "범주": "DEMO",
            },
            {"t": 1200, "행동": "링크이동", "사업ID": "2026-01", "종류": "apply", "순위": 1},
        ],
    }
    return json.dumps({**body, **over}, ensure_ascii=False).encode()


@pytest.fixture
def nas(tmp_path, monkeypatch):
    root = tmp_path / "nas"
    root.mkdir()
    (root / "README.md").write_text("DEMO NAS")
    monkeypatch.setenv("NAS_DATA", str(root))
    monkeypatch.setenv("SUPPORT_PROGRAMS_STORE_DIR", str(tmp_path / "local"))
    monkeypatch.setattr(support_programs, "_counter", {"day": "", "count": 0})
    return root


def stored(nas_root):
    return sorted((nas_root / "osh-support-programs/raw").rglob("*.json"))


def test_log_batch_lands_once_in_nas_raw_with_manifest(nas):
    client = TestClient(app, client=("192.168.0.3", 1234))
    assert client.post(LOG, headers=POST, content=batch()).status_code == 204
    assert client.post(LOG, headers=POST, content=batch(순번=1)).status_code == 204
    [path] = stored(nas)
    assert (
        path.parent.name.startswith("demand-log-")
        and path.name == "2026-10-01-demo1234ab-00001.json"
    )
    assert (path.parent / "MANIFEST.md").read_text().startswith("# MANIFEST")
    record = json.loads(path.read_text())
    assert record["이벤트"][2]["종류"] == "apply" and "받은시각" in record
    assert "192.168" not in path.read_text()


def test_log_schema_3_events(nas):
    client = TestClient(app, client=("192.168.0.3", 1234))
    events = [
        {"t": 0, "행동": "분류선택", "분류": ["설비개선"]},
        {"t": 10, "행동": "받는방식선택", "받는방식": ["융자"]},
        {"t": 20, "행동": "AI제안", "요청ID": "0123456789ab", "항목": ["업종", "분류"]},
        {"t": 30, "행동": "AI적용", "요청ID": "0123456789ab", "항목": ["업종"]},
        {"t": 40, "행동": "AI수정", "요청ID": "0123456789ab", "항목": ["업종"]},
        {"t": 50, "행동": "노출", "목록": ["2026-01"], "분류": ["설비개선", "교육"]},
    ]
    body = batch(스키마=3, 자료판="20261001-v2", 이벤트=events)
    assert client.post(LOG, headers=POST, content=body).status_code == 204
    [path] = stored(nas)
    record = json.loads(path.read_text())
    assert record["자료판"] == "20261001-v2" and record["이벤트"][4]["항목"] == ["업종"]


def test_log_waits_locally_when_nas_is_missing(nas, tmp_path):
    (nas / "README.md").unlink()
    client = TestClient(app, client=("192.168.0.3", 1234))
    assert client.post(LOG, headers=POST, content=batch()).status_code == 204
    assert not stored(nas)
    assert list((tmp_path / "local/nas-pending").rglob("*.json"))


@pytest.mark.parametrize(
    "body",
    [
        batch(스키마=1),
        batch(세션ID="../../etc"),
        batch(이벤트=[]),
        batch(이벤트=[{"t": 0, "행동": "열기", "이름": "홍길동"}]),
        batch(이벤트=[{"t": 0, "행동": "링크이동", "사업ID": "../x"}]),
        batch(조건={"신청주체": "전체"}),
        batch(연락처="010"),
        batch(스키마=3, 이벤트=[{"t": 0, "행동": "분류선택", "분류": ["없는분류"]}]),
        batch(스키마=3, 이벤트=[{"t": 0, "행동": "AI적용", "항목": ["이름"]}]),
        batch(스키마=3, 이벤트=[{"t": 0, "행동": "AI제안", "요청ID": "../x"}]),
        batch(스키마=3, 이벤트=[{"t": 0, "행동": "AI제안", "설명": "DEMO 원문"}]),
        batch(스키마=3, 자료판="../v2"),
        b"not json",
    ],
)
def test_log_rejects_unexpected_shapes(nas, body):
    client = TestClient(app, client=("192.168.0.3", 1234))
    assert client.post(LOG, headers=POST, content=body).status_code == 422
    assert not stored(nas)


def test_log_boundaries(nas, monkeypatch):
    client = TestClient(app, client=("192.168.0.3", 1234))
    assert (
        client.post(
            LOG, headers={**POST, "Origin": "https://evil.test"}, content=batch()
        ).status_code
        == 403
    )
    assert (
        client.post(
            LOG, headers={**POST, "Content-Type": "application/json"}, content=batch()
        ).status_code
        == 415
    )
    assert client.post(LOG, headers=POST, content=b"x" * 13000).status_code == 413
    monkeypatch.setattr(support_programs, "DAILY_BATCHES", 1)
    assert client.post(LOG, headers=POST, content=batch(순번=1)).status_code == 204
    assert client.post(LOG, headers=POST, content=batch(순번=2)).status_code == 429
    assert len(stored(nas)) == 1


def test_sync_moves_pending_and_locks_past_days(nas, tmp_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "sync", Path(__file__).resolve().parents[1] / "scripts/sync_support_programs_nas.py"
    )
    sync = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sync)
    pending = (
        tmp_path / "local/nas-pending" / support_programs.log_path("2026-09-30", "a-00001.json")
    )
    pending.parent.mkdir(parents=True)
    pending.write_text("{}")
    assert sync.flush_pending() == 1 and not pending.exists()
    folder = nas / "osh-support-programs/raw/demand-log-20260930"
    assert (folder / "MANIFEST.md").exists()
    assert sync.lock_finished_days(today="20261001") >= 2
    assert not (folder.stat().st_mode & 0o222)
    folder.chmod(0o755)  # let pytest clean up
