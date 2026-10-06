import hashlib
import json
import sys
import textwrap

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import safetybread_apps as sb
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user"}
SLUG = "osh-precedents"
PREFIX = sb.prefix(SLUG)
# A DEMO stand-in for the packaged app: same shape (lifespan-loaded engine, root_path links,
# /files route), no real data.
APP_PY = textwrap.dedent(
    """
    import os
    from contextlib import asynccontextmanager
    from fastapi import FastAPI, Request
    from fastapi.responses import HTMLResponse, PlainTextResponse

    engine = None

    @asynccontextmanager
    async def lifespan(_):
        global engine
        engine = {"semantic": os.environ.get("OSHP_SEMANTIC"), "forwarded": os.environ.get("OSHP_TRUST_FORWARDED")}
        yield

    app = FastAPI(lifespan=lifespan)

    @app.get("/", response_class=HTMLResponse)
    def home(request: Request):
        base = request.scope.get("root_path", "")
        return f'<a href="{base}/about">DEMO</a> {engine}'

    @app.get("/files/{file_id}")
    def files(file_id: str):
        return PlainTextResponse("MUST NOT BE SERVED " + file_id)
    """
)


def write_release(root):
    (root / "demo/oshp").mkdir(parents=True)
    (root / "demo/oshp/__init__.py").write_text("")
    (root / "demo/oshp/app.py").write_text(APP_PY)
    (root / "data").mkdir()
    (root / "data/cases.csv").write_text("case_number\nDEMO-1\n")
    (root / "RELEASE.md").write_text("DEMO release notes, not pinned")
    lines = []
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root).as_posix()
        if p.is_file() and rel != "RELEASE.md":
            lines.append(f"{rel}\t{hashlib.sha256(p.read_bytes()).hexdigest()}")
    return hashlib.sha256("\n".join(sorted(lines)).encode()).hexdigest()


@pytest.fixture
def release(tmp_path, monkeypatch):
    monkeypatch.setattr(sb, "NAS", tmp_path)
    root = tmp_path / SLUG / "serving/current"
    digest = write_release(root)
    monkeypatch.setitem(sb.PACKAGES[SLUG], "digest", digest)
    monkeypatch.setenv("OSHP_SEMANTIC", "off")
    monkeypatch.delenv("OSHP_TRUST_FORWARDED", raising=False)
    sb.verify.cache_clear()
    sys.modules.pop("oshp.app", None)
    sys.modules.pop("oshp", None)
    # A fresh wrapper for each test: the gateway's mount keeps its own instance.
    for route in app.router.routes:
        if getattr(route, "name", "") == f"{SLUG}-app":
            route.app = sb.Packaged(SLUG)
    yield root
    sb.verify.cache_clear()
    sys.modules.pop("oshp.app", None)
    sys.modules.pop("oshp", None)


def client():
    return TestClient(app, client=("192.168.0.3", 1234))


def test_mounted_app_starts_once_with_semantic_off(release):
    c = client()
    got = c.get(PREFIX + "/", headers=HEADERS)
    assert got.status_code == 200
    assert f'href="{PREFIX}/about"' in got.text  # links built from the mount's root_path
    assert "'semantic': 'off'" in got.text and "'forwarded': '1'" in got.text
    assert "unsafe-inline" in got.headers["content-security-policy"]
    assert "script-src 'self'" in got.headers["content-security-policy"]


def test_bare_mount_path_is_served_without_redirect(release):
    got = client().get(PREFIX, headers=HEADERS, follow_redirects=False)
    assert got.status_code == 200 and "DEMO" in got.text


def test_packaged_file_links_go_to_the_download_route(release, monkeypatch):
    got = client().get(PREFIX + "/files/release-zip", headers=HEADERS, follow_redirects=False)
    assert got.status_code == 302
    assert got.headers["location"] == PREFIX + "/download/release-zip"
    assert "MUST NOT" not in got.text


def test_changed_release_is_not_served(release):
    (release / "data/cases.csv").write_text("case_number\nDEMO-2\n")
    got = client().get(PREFIX + "/", headers=HEADERS)
    assert got.status_code == 503


def test_gateway_only(release, monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    assert client().get(PREFIX + "/").status_code == 403


def test_download_redirects_to_signed_url(tmp_path, monkeypatch):
    manifest = {
        "version": "1.0.0",
        "verified": True,
        "bucket": "osh-precedents-research",
        "project": "https://demo.supabase.co",
        "files": [
            {
                "id": "release-zip",
                "name": "osh-precedents-1.0.0.zip",
                "object": "osh-precedents/1.0.0/abcd/osh-precedents-1.0.0.zip",
                "bytes": 3,
                "sha256": "0" * 64,
            }
        ],
    }
    (tmp_path / "osh-precedents-storage-manifest.json").write_text(json.dumps(manifest))
    monkeypatch.setattr(sb, "REPO", tmp_path.parent)
    monkeypatch.setattr(
        sb, "manifest_path", lambda slug: tmp_path / f"{slug}-storage-manifest.json"
    )
    monkeypatch.setattr(
        sb.storage,
        "config",
        lambda: {
            "url": "https://demo.supabase.co",
            "secret_key": "sb_secret_DEMO",
            "bucket": "copd-research",
            "prefix": "copd/demo",
        },
    )
    monkeypatch.setattr(sb.storage, "private_bucket", lambda cfg: None)
    calls = []

    def sign(cfg, route, payload):
        calls.append((cfg["bucket"], route, payload))
        return {"signedURL": "/" + route + "?token=DEMO"}

    monkeypatch.setattr(sb.storage, "storage_request", sign)
    c = client()
    listing = c.get(PREFIX + "/api/downloads", headers=HEADERS).json()
    assert listing["files"][0]["id"] == "release-zip" and "object" not in listing["files"][0]
    got = c.get(PREFIX + "/download/release-zip", headers=HEADERS, follow_redirects=False)
    assert got.status_code == 302
    assert got.headers["location"].startswith(
        "https://demo.supabase.co/storage/v1/object/sign/osh-precedents-research/osh-precedents/1.0.0/abcd/"
    )
    assert got.headers["location"].endswith("&download=osh-precedents-1.0.0.zip")
    assert calls[0][0] == "osh-precedents-research" and calls[0][2] == {"expiresIn": 60}
    assert c.get(PREFIX + "/download/nope", headers=HEADERS).status_code == 404
    assert c.get(PREFIX + "/download/..%2Fx", headers=HEADERS).status_code == 404


def test_download_needs_a_verified_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(sb, "manifest_path", lambda slug: tmp_path / "missing.json")
    with pytest.raises(HTTPException) as error:
        sb.dataset_download(SLUG, "release-zip")
    assert error.value.status_code == 503
