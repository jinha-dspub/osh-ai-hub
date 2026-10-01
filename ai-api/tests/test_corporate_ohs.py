import csv
import gzip
import hashlib
import io

import pytest
from fastapi.testclient import TestClient

from app import corporate_ohs
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user"}
PREFIX = corporate_ohs.PREFIX
INDEX = (
    b'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>DEMO</title>'
    b'<script defer src="app.js"></script></head><body><div id="app"></div></body></html>'
)
FILES = {
    "demo/index.html": INDEX,
    "demo/app.js": b"document.getElementById('app').textContent = 'DEMO';\n" * 40,
    "demo/data/release.zip": b"PK\x05\x06" + b"\0" * 18,
    "release/rc2_2/data/observations.csv": "﻿기업,값\r\nDEMO 기업,DEMO\r\n".encode(),
    "release/rc2_2/README.md": b"# DEMO\n",
}
# Listed in files.csv but outside the served folders, and on disk but not listed at all.
NOT_SERVED = {
    "data/observations.csv": FILES["release/rc2_2/data/observations.csv"],
    "HANDOFF.md": b"# DEMO\n",
}


def write_release(root, files, unlisted=()):
    listing = io.StringIO()
    out = csv.DictWriter(listing, ["path", "sha256"])
    out.writeheader()
    for path, content in {**files, **NOT_SERVED}.items():
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_bytes(content)
        # The package leaves explanatory Markdown unhashed (kit 1.2); keep one such row.
        sha = "" if path.endswith(".md") else hashlib.sha256(content).hexdigest()
        out.writerow({"path": path, "sha256": sha})
    for path in unlisted:
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_bytes(b"DEMO unlisted")
    (root / "files.csv").write_text("﻿" + listing.getvalue(), encoding="utf-8")


def clear():
    corporate_ohs.release.cache_clear()
    corporate_ohs.compressed.cache_clear()


@pytest.fixture
def release(tmp_path, monkeypatch):
    write_release(tmp_path, FILES, unlisted=["demo/notes.txt"])
    monkeypatch.setattr(corporate_ohs, "ROOT", tmp_path)
    monkeypatch.setattr(corporate_ohs, "RELEASE_DIGEST", corporate_ohs.digest(FILES))
    clear()
    yield tmp_path
    clear()


@pytest.fixture
def client(release):
    return TestClient(app, client=("192.168.0.3", 1234), headers=HEADERS)


def test_only_gateway_requests_are_served(release, monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    direct = TestClient(app, client=("192.168.0.55", 1234))
    assert direct.get(PREFIX + "/demo/", headers=HEADERS).status_code == 403
    trusted_no_user = TestClient(app, client=("192.168.0.3", 1234))
    assert trusted_no_user.get(PREFIX + "/demo/app.js").status_code == 403


def test_root_redirects_to_entry_on_the_same_host(client):
    for path in (PREFIX, PREFIX + "/"):
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 308
        assert response.headers["location"] == PREFIX + "/demo/"


def test_entry_page_works_with_and_without_trailing_slash(client):
    # osh.ai.kr's rewrite drops the slash, so ".../demo" must not redirect back to ".../demo/".
    for path in ("/demo", "/demo/"):
        response = client.get(PREFIX + path, follow_redirects=False)
        assert response.status_code == 200
        assert f'<base href="{PREFIX}/demo/">' in response.text
        assert response.text.count("<base ") == 1
        assert response.headers["content-type"].startswith("text/html")


def test_packaged_app_gets_inline_styles_but_not_inline_scripts(client):
    csp = client.get(PREFIX + "/demo/").headers["content-security-policy"]
    assert "style-src 'self' 'unsafe-inline'" in csp
    assert "script-src 'self';" in csp
    assert "frame-ancestors 'none'" in csp
    other = client.get("/demo/").headers["content-security-policy"]
    assert "unsafe-inline" not in other


def test_release_files_download_unchanged(client):
    path = "/release/rc2_2/data/observations.csv"
    response = client.get(PREFIX + path, headers={"Accept-Encoding": "identity"})
    assert response.status_code == 200
    assert response.content == FILES["release/rc2_2/data/observations.csv"]
    assert response.headers["content-disposition"] == "attachment"
    assert response.headers["content-type"].startswith("text/csv")
    assert client.get(PREFIX + "/demo/data/release.zip").content == FILES["demo/data/release.zip"]


def test_text_is_gzipped_when_accepted(client):
    raw = client.get(PREFIX + "/demo/app.js", headers={"Accept-Encoding": "gzip"})
    # httpx decodes transparently; check the header and that the bytes round-trip.
    assert raw.headers["content-encoding"] == "gzip"
    assert raw.content == FILES["demo/app.js"]
    assert gzip.decompress(corporate_ohs.compressed("demo/app.js")) == FILES["demo/app.js"]
    plain = client.get(PREFIX + "/demo/app.js", headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in plain.headers


def test_head_reports_length_without_body(client):
    response = client.head(PREFIX + "/demo/app.js", headers={"Accept-Encoding": "identity"})
    assert response.status_code == 200
    assert response.headers["content-length"] == str(len(FILES["demo/app.js"]))
    assert response.content == b""


@pytest.mark.parametrize(
    "path",
    [
        "/files.csv",
        "/HANDOFF.md",
        "/data/observations.csv",
        "/demo/notes.txt",
        "/demo/../files.csv",
        "/demo/%2e%2e/files.csv",
        "/release/rc2_2/../../HANDOFF.md",
        "/release/rc2_2/",
        "/demo//app.js",
    ],
)
def test_unlisted_and_traversal_paths_are_not_served(client, path):
    assert client.get(PREFIX + path).status_code == 404


def test_post_is_not_allowed(client):
    response = client.post(PREFIX + "/demo/app.js", headers={"Origin": "https://osh.ai.kr"})
    assert response.status_code == 405


def test_changed_file_is_refused(client, release):
    (release / "demo/app.js").write_bytes(b"alert('changed')")
    clear()
    assert client.get(PREFIX + "/demo/app.js").status_code == 503
    assert client.get(PREFIX + "/demo/").status_code == 503


def test_unhashed_file_is_still_pinned(client, release):
    (release / "release/rc2_2/README.md").write_bytes(b"# changed\n")
    clear()
    assert client.get(PREFIX + "/release/rc2_2/README.md").status_code == 503


def test_added_file_is_refused(client, release):
    write_release(release, {**FILES, "demo/extra.js": b"alert(1)"})
    clear()
    assert client.get(PREFIX + "/demo/extra.js").status_code == 503


def test_unsafe_listed_path_is_refused(client, release):
    listing = (release / "files.csv").read_text(encoding="utf-8")
    (release / "files.csv").write_text(listing + '"demo/../HANDOFF.md",""\r\n', encoding="utf-8")
    clear()
    assert client.get(PREFIX + "/demo/app.js").status_code == 503


def test_missing_release_answers_503(client, release):
    (release / "files.csv").unlink()
    clear()
    assert client.get(PREFIX + "/demo/").status_code == 503
