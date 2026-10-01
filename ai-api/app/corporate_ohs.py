"""Corporate safety and health disclosures (ukbyun RC2.2 package) under the /demo gateway.

The package ships a finished static app (demo/) whose download tab links to the immutable
release (release/rc2_2/) by relative path, so both folders are served from the same prefix
exactly as packaged: /demo/corporate-ohs-disclosures/demo/ and .../release/rc2_2/.
Files are read only from NAS serving/current (rule 6). Only paths listed in the package's
files.csv under those two folders are served, and the whole set is pinned by one digest, so
a changed, added or missing file makes the app answer 503 instead of serving it.
The largest file is under 6 MB and the release files are under 1 MB each, so they are served
like any other demo asset rather than through object storage.
"""

import csv
import gzip
import hashlib
import io
import mimetypes
import os
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, Request, Response
from fastapi.responses import RedirectResponse

VERSION = "1.0.0-internal-rc2.2"
VERSION_DATE = "2026-10-01"
PREFIX = "/demo/corporate-ohs-disclosures"
PROJECT = "corporate-ohs-disclosures"
ROOT = Path(os.environ.get("NAS_DATA", "/nas")) / PROJECT / "serving/current"
SERVED = ("demo/", "release/rc2_2/")
# sha256 of "\n".join(sorted(f"{path}\t{sha256}")) over the 189 served files of serving v2:
# the 2026-10-01 handoff (ZIP 885f29fa…) with the app's internal-candidate wording removed
# (3 demo files, see its RELEASE.md). A new release needs a new digest here.
RELEASE_DIGEST = "6774d40c2ffb0f982658d134e722abe66d18408b4eeed1125ee3bfe71491025c"
COMPRESSIBLE = {".html", ".js", ".css", ".csv", ".md", ".json"}
TYPES = {
    ".csv": "text/csv; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".woff2": "font/woff2",
}
# The packaged app draws its bars with inline style attributes; scripts stay 'self' only.
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
    "base-uri 'self'"
)


def digest(files):
    lines = sorted(
        f"{path}\t{hashlib.sha256(content).hexdigest()}" for path, content in files.items()
    )
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


@lru_cache(maxsize=1)
def release():
    listing = (ROOT / "files.csv").read_bytes().decode("utf-8-sig")
    files = {}
    for row in csv.DictReader(io.StringIO(listing, newline="")):
        path = row["path"]
        if not path.startswith(SERVED):
            continue
        if ".." in path.split("/") or path.startswith("/") or "\\" in path:
            raise ValueError(f"unsafe path in files.csv: {path}")
        content = (ROOT / path).read_bytes()
        if row["sha256"] and hashlib.sha256(content).hexdigest() != row["sha256"]:
            raise ValueError(f"{path} does not match files.csv")
        files[path] = content
    if digest(files) != RELEASE_DIGEST:
        raise ValueError("served files do not match the pinned release")
    return files


ENTRY = "demo/index.html"
# osh.ai.kr's /demo/:path* rewrite drops the trailing slash, so the entry page may be requested
# as .../demo. A <base> keeps the package's relative links working without a slash redirect.
BASE = f'<base href="{PREFIX}/demo/">'.encode()


def body(path):
    content = release()[path]
    if path == ENTRY:
        head = b'<meta charset="utf-8">'
        if head not in content:
            raise ValueError("entry page has no charset meta")
        content = content.replace(head, head + BASE, 1)
    return content


@lru_cache(maxsize=256)
def compressed(path):
    return gzip.compress(body(path), compresslevel=6, mtime=0)


def serve(path, request: Request):
    try:
        files = release()
    except (OSError, ValueError, KeyError):
        raise HTTPException(
            503, "자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        ) from None
    if path in {"demo", "demo/"}:
        path = ENTRY
    if path not in files:
        raise HTTPException(404, "없는 파일입니다.")
    suffix = Path(path).suffix.lower()
    headers = {"Content-Security-Policy": CSP, "Vary": "Accept-Encoding"}
    if path.startswith("release/") and suffix in {".csv", ".md"}:
        headers["Content-Disposition"] = "attachment"
    try:
        content = body(path)
    except ValueError:
        raise HTTPException(503, "화면을 준비하지 못했습니다.") from None
    if suffix in COMPRESSIBLE and "gzip" in request.headers.get("accept-encoding", ""):
        content = compressed(path)
        headers["Content-Encoding"] = "gzip"
    media = TYPES.get(suffix) or mimetypes.guess_type(path)[0] or "application/octet-stream"
    if request.method == "HEAD":
        headers["Content-Length"] = str(len(content))
        return Response(status_code=200, headers=headers, media_type=media)
    return Response(content, headers=headers, media_type=media)


def register(app):
    @app.api_route(PREFIX, methods=["GET", "HEAD"])
    @app.api_route(PREFIX + "/", methods=["GET", "HEAD"])
    def home():
        return RedirectResponse(PREFIX + "/demo/", status_code=308)

    @app.api_route(PREFIX + "/{path:path}", methods=["GET", "HEAD"])
    def read(path: str, request: Request):
        return serve(path, request)
