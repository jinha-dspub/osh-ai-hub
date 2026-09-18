import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import storage
from app.demo_gateway import app


@pytest.fixture
def configured(tmp_path, monkeypatch):
    config = {
        "url": "https://demo.supabase.co",
        "secret_key": "sb_secret_DEMO_ONLY",
        "bucket": "copd-research",
        "prefix": "copd/2026-09-17",
    }
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config))
    monkeypatch.setenv("SUPABASE_STORAGE_CONFIG", str(path))
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "verified": True,
                "project": config["url"],
                "bucket": config["bucket"],
                "version": "DEMO",
                "files": [
                    {
                        "id": "source",
                        "name": "DEMO-source.zip",
                        "bytes": 12,
                        "sha256": "a" * 64,
                        "object": "copd/2026-09-17/DEMO/source.zip",
                    }
                ],
            }
        )
    )
    monkeypatch.setattr(storage, "MANIFEST", manifest)
    return config, manifest


def test_only_trusted_authenticated_gateway_may_list_and_sign(configured, monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    direct = TestClient(app, client=("192.168.0.55", 123))
    headers = {"X-OSH-Authenticated-User": "DEMO-user", "Origin": "https://osh.ai.kr"}
    assert direct.get("/demo/copd/api?action=files", headers=headers).status_code == 403
    assert (
        direct.post(
            "/demo/copd/api?action=download", headers=headers, json={"id": "source"}
        ).status_code
        == 403
    )
    client = TestClient(app, client=("192.168.0.3", 123))
    assert client.get("/demo/copd/api?action=files").status_code == 403
    response = client.get("/demo/copd/api?action=files", headers=headers)
    assert response.status_code == 200
    assert set(response.json()["files"][0]) == {"id", "name", "bytes", "sha256"}
    headers["Origin"] = "https://evil.test"
    assert (
        client.post(
            "/demo/copd/api?action=download", headers=headers, json={"id": "source"}
        ).status_code
        == 403
    )


def test_arbitrary_paths_cannot_be_signed(configured, monkeypatch):
    monkeypatch.setattr(storage, "storage_request", lambda *args: pytest.fail("Provider contacted"))
    client = TestClient(app, client=("192.168.0.3", 123))
    headers = {"X-OSH-Authenticated-User": "DEMO-user", "Origin": "https://osh.ai.kr"}
    for data in [{"id": "../secret"}, {"id": "source", "object": "secret"}]:
        assert (
            client.post("/demo/copd/api?action=download", headers=headers, json=data).status_code
            == 422
        )
    assert (
        client.post(
            "/demo/copd/api?action=download", headers=headers, json={"id": "unknown"}
        ).status_code
        == 404
    )


def test_public_bucket_is_rejected(configured, monkeypatch):
    monkeypatch.setattr(storage, "storage_request", lambda *args: {"public": True})
    with pytest.raises(HTTPException) as error:
        storage.signed_download(storage.DownloadInput(id="source"))
    assert error.value.status_code == 503


def test_signing_expires_in_60_seconds_without_proxying_file(configured, monkeypatch):
    calls = []

    def provider(config, path, payload=None):
        calls.append((path, payload))
        return (
            {"public": False}
            if path.startswith("bucket/")
            else {
                "signedURL": "/object/sign/copd-research/copd/2026-09-17/DEMO/source.zip?token=DEMO"
            }
        )

    monkeypatch.setattr(storage, "storage_request", provider)
    result = storage.signed_download(storage.DownloadInput(id="source"))
    assert result["url"].startswith("https://demo.supabase.co/storage/v1/object/sign/")
    assert result["url"].endswith("&download=DEMO-source.zip")
    assert calls[-1][1] == {"expiresIn": 60}
    assert "secret" not in str(result)


def test_unverified_manifest_or_changed_project_fails_closed(configured):
    _config, path = configured
    data = json.loads(path.read_text())
    data["project"] = "https://other.supabase.co"
    path.write_text(json.dumps(data))
    with pytest.raises(HTTPException):
        storage.signed_download(storage.DownloadInput(id="source"))
    data["verified"] = False
    path.write_text(json.dumps(data))
    with pytest.raises(HTTPException):
        storage.files()
