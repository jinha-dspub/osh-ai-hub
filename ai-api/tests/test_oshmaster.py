import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import oshmaster, storage
from app.demo_gateway import app
from app.oshmaster_data import Demo, tokens

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user", "Origin": "https://osh.ai.kr"}


@pytest.fixture
def demo(tmp_path, monkeypatch):
    (tmp_path / "data").mkdir()
    (tmp_path / "demo").mkdir()
    (tmp_path / "demo/settings.json").write_text("{}")
    with sqlite3.connect(tmp_path / "data/search.sqlite") as db:
        db.execute(
            "CREATE TABLE codes(record_id TEXT,axis TEXT,std TEXT,std_version TEXT,code TEXT,label TEXT,level INTEGER,parent_code TEXT)"
        )
        db.execute("CREATE TABLE terms(record_id TEXT,norm TEXT,kind TEXT)")
        db.execute("CREATE VIRTUAL TABLE search USING fts5(record_id UNINDEXED,words)")
        for i, (edition, code, parent) in enumerate(
            [("DEMO-v1", "D34", ""), ("DEMO-v1", "D34.0", "D34"), ("DEMO-v2", "D34", "")]
        ):
            rid = "code-" + str(i) * 24
            db.execute(
                "INSERT INTO codes VALUES (?,?,?,?,?,?,?,?)",
                (rid, "DEMO", "DEMO", edition, code, "DEMO 폐암", i, parent),
            )
            db.execute("INSERT INTO terms VALUES (?,?,?)", (rid, "폐암", "alias"))
            db.execute("INSERT INTO search VALUES (?,?)", (rid, " ".join(tokens("DEMO 폐암"))))
    monkeypatch.setattr(oshmaster, "master", lambda: Demo(tmp_path))
    manifest = tmp_path / "storage.json"
    manifest.write_text(
        json.dumps(
            {
                "version": oshmaster.VERSION,
                "verified": True,
                "project": "https://demo.supabase.co",
                "bucket": "oshmaster-research",
                "files": [
                    {
                        "id": "excel",
                        "name": "DEMO.zip",
                        "bytes": 12,
                        "sha256": "a" * 64,
                        "object": "oshmaster/" + oshmaster.VERSION + "/DEMO/DEMO.zip",
                    }
                ],
            }
        )
    )
    monkeypatch.setattr(oshmaster, "MANIFEST", manifest)
    monkeypatch.setattr(
        oshmaster,
        "settings",
        lambda: {
            "url": "https://demo.supabase.co",
            "bucket": "oshmaster-research",
            "prefix": "oshmaster/" + oshmaster.VERSION,
            "secret_key": "sb_secret_DEMO",
        },
    )
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    return manifest


def test_gateway_origin_and_query_validation(demo):
    trusted = TestClient(app, client=("192.168.0.3", 1))
    direct = TestClient(app, client=("192.168.0.6", 1))
    for path in [
        "/",
        "/api/catalogue",
        "/api/search?q=DEMO",
        "/api/detail?id=DEMO",
        "/api/files",
        "/assets/app.js",
    ]:
        assert direct.get("/demo/oshmaster" + path, headers=HEADERS).status_code == 403
        assert trusted.get("/demo/oshmaster" + path).status_code == 403
    assert (
        trusted.post(
            "/demo/oshmaster/api/download",
            headers={**HEADERS, "Origin": "https://evil.test"},
            json={"id": "excel"},
        ).status_code
        == 403
    )
    assert trusted.get("/demo/oshmaster/api/search?q=a&q=b", headers=HEADERS).status_code == 400
    assert (
        trusted.get("/demo/oshmaster/api/detail?id=../../etc/passwd", headers=HEADERS).status_code
        == 400
    )
    assert trusted.get("/demo/oshmaster/api/unknown", headers=HEADERS).status_code == 404
    assert (
        trusted.post(
            "/demo/oshmaster/api/download", headers=HEADERS, json={"id": "x" * 2000}
        ).status_code
        == 413
    )


def test_edition_hierarchy_and_selection_are_not_case_approval(demo):
    client = TestClient(app, client=("192.168.0.3", 1))
    path = "/demo/oshmaster/api/search"
    params = {"q": "폐암", "axis": "DEMO", "std": "DEMO", "version": "DEMO-v1", "limit": 1}
    first = client.get(path, params=params, headers=HEADERS).json()
    second = client.get(path, params={**params, "offset": 1}, headers=HEADERS).json()
    assert first["total"] == 2 and first["results"][0]["match_kind"] == "alias"
    assert first["results"][0]["record_id"] != second["results"][0]["record_id"]
    detail = client.get(
        "/demo/oshmaster/api/detail",
        params={"id": first["results"][0]["record_id"], "include_descendants": "true"},
        headers=HEADERS,
    ).json()
    assert detail["scope_total"] == 2 and detail["case_label_approved"] is False
    assert all(r["std_version"] == "DEMO-v1" for r in detail["scope"])
    assert (
        client.get(path, params={**params, "q": "zzzznomatch"}, headers=HEADERS).json()["total"]
        == 0
    )
    assert (
        client.get(path, params={**params, "version": "missing"}, headers=HEADERS).status_code
        == 400
    )


def test_download_scoping_and_private_storage(demo, monkeypatch):
    calls = []

    def provider(cfg, path, payload=None):
        calls.append((path, payload))
        return (
            {"public": False}
            if path.startswith("bucket/")
            else {"signedURL": "/" + path + "?token=DEMO"}
        )

    monkeypatch.setattr(storage, "storage_request", provider)
    client = TestClient(app, client=("192.168.0.3", 1))
    path = "/demo/oshmaster/api/download"
    files = client.get("/demo/oshmaster/api/files", headers=HEADERS).json()
    assert "object" not in files["files"][0]
    response = client.post(path, headers=HEADERS, json={"id": "excel"}).json()
    assert response["expires_in"] == 60 and calls[-1][1] == {"expiresIn": 60}
    assert (
        client.post(path, headers=HEADERS, json={"id": "excel", "object": "secret"}).status_code
        == 422
    )
    assert client.post(path, headers=HEADERS, json={"id": "missing"}).status_code == 404
    data = json.loads(demo.read_text())
    data["files"][0]["object"] = "sanje/secret.zip"
    demo.write_text(json.dumps(data))
    assert client.post(path, headers=HEADERS, json={"id": "excel"}).status_code == 503
    data["files"][0]["object"] = "oshmaster/" + oshmaster.VERSION + "/DEMO.zip"
    demo.write_text(json.dumps(data))
    monkeypatch.setattr(storage, "storage_request", lambda *args: {"public": True})
    assert client.post(path, headers=HEADERS, json={"id": "excel"}).status_code == 503
