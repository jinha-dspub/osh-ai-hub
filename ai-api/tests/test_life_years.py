import hashlib
import json
import threading

import pytest
from fastapi.testclient import TestClient

from app import life_years
from app.demo_gateway import app

PREFIX = life_years.PREFIX
HEADERS = {"X-OSH-Authenticated-User": "DEMO-user", "Origin": "https://osh.ai.kr"}


@pytest.fixture
def release(tmp_path, monkeypatch):
    (tmp_path / "README.md").write_text("DEMO NAS")
    files = {
        "demo/dist/index.html": b'<html><head><base href="/demo/ei-nhis-life-years-lost/"></head>DEMO</html>',
        "demo/dist/downloads/aggregate.csv": b"DEMO,value\nDEMO,0\n",
        "scripts/calculate.py": b"class InputError(ValueError): pass\ndef calculate(bundle, end_age, reference):\n return {'metadata': bundle['metadata'], 'results': [], 'settings': {'end_age': end_age}}\n",
    }
    for name, content in files.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    manifest = json.dumps({k: hashlib.sha256(v).hexdigest() for k, v in files.items()}).encode()
    (tmp_path / "hub-manifest.json").write_bytes(manifest)
    monkeypatch.setattr(life_years, "NAS", tmp_path)
    monkeypatch.setattr(life_years, "ROOT", tmp_path)
    monkeypatch.setattr(life_years, "RELEASE_DIGEST", hashlib.sha256(manifest).hexdigest())
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    life_years.release.cache_clear()
    yield tmp_path
    life_years.release.cache_clear()


@pytest.fixture
def client(release):
    return TestClient(app, client=("192.168.0.3", 123), headers=HEADERS)


def test_gateway_and_origin_boundaries(release, client):
    direct = TestClient(app, client=("192.168.0.55", 123), headers=HEADERS)
    for suffix in ["/", "/downloads/aggregate.csv", "/api/calculate"]:
        assert direct.get(PREFIX + suffix).status_code == 403
    assert direct.post(PREFIX + "/api/calculate", json={}).status_code == 403
    untrusted = TestClient(app, client=("192.168.0.3", 123))
    assert untrusted.get(PREFIX + "/").status_code == 403
    assert (
        client.post(
            PREFIX + "/api/calculate", json={}, headers={"Origin": "https://evil.test"}
        ).status_code
        == 403
    )


def test_static_files_and_subpath_without_trailing_slash(client):
    for suffix in ["", "/"]:
        response = client.get(PREFIX + suffix)
        assert response.status_code == 200
        assert '<base href="' + PREFIX + '/">' in response.text
    download = client.get(PREFIX + "/downloads/aggregate.csv")
    assert download.content == b"DEMO,value\nDEMO,0\n"
    assert download.headers["content-disposition"] == "attachment"
    assert client.head(PREFIX + "/downloads/aggregate.csv").content == b""
    for suffix in [
        "/scripts/calculate.py",
        "/hub-manifest.json",
        "/downloads/../../README.md",
        "/notes.txt",
    ]:
        assert client.get(PREFIX + suffix).status_code == 404


@pytest.mark.parametrize(
    "target", ["hub-manifest.json", "scripts/calculate.py", "demo/dist/index.html"]
)
def test_release_tampering_fails_closed(release, client, target):
    (release / target).write_bytes(b"tampered")
    assert client.get(PREFIX + "/").status_code == 503
    assert (
        client.post(PREFIX + "/api/calculate", json={"bundle": {"metadata": {}}}).status_code == 503
    )


def test_calculation_request_limits_and_no_writes(release, client, monkeypatch):
    endpoint = PREFIX + "/api/calculate"
    before = sorted(str(p.relative_to(release)) for p in release.rglob("*"))
    response = client.post(
        endpoint, json={"bundle": {"metadata": {"data_kind": "synthetic"}}, "end_age": 65}
    )
    assert response.status_code == 200 and response.json()["settings"]["end_age"] == 65
    assert sorted(str(p.relative_to(release)) for p in release.rglob("*")) == before
    assert (
        client.post(endpoint, content="{}", headers={"Content-Type": "text/plain"}).status_code
        == 415
    )
    for payload in [
        [],
        {},
        {"bundle": []},
        {"bundle": {"metadata": {}, "aggregate": "bad"}},
        {"bundle": {"metadata": {}}, "end_age": True},
    ]:
        assert client.post(endpoint, json=payload).status_code == 400
    assert (
        client.post(endpoint, content="[", headers={"Content-Type": "application/json"}).status_code
        == 400
    )
    monkeypatch.setattr(life_years, "LIMIT", 32)
    assert (
        client.post(
            endpoint, content=b" " * 33, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )
    monkeypatch.setattr(life_years, "SLOTS", threading.BoundedSemaphore(0))
    assert client.post(endpoint, json={}).status_code == 429


def test_missing_nas_fails_closed(release, client):
    (release / "README.md").unlink()
    assert client.get(PREFIX + "/").status_code == 503
