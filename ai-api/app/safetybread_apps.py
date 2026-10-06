"""Research handoff apps served as packaged under the /demo gateway, plus private object-storage
downloads for the three 2026-10-06 safetybread datasets.

판례 (osh-precedents) and 유사어휘 (osh-synonym-vocab) ship a read-only FastAPI + Jinja2 search
app whose links are built from the ASGI root_path, so each is mounted at /demo/<slug> from NAS
serving/current (rule 6) with semantic search off (no embedding model on this server) and the
forwarded client address trusted for its own per-IP limit. The whole release is pinned by one
digest: a changed, added or missing file makes the app answer 503 instead of serving it. The
packaged /files/<id> downloads are redirected to the gateway's download route, which hands out a
60-second signed URL from the dataset's private bucket (never proxying file bytes), the same way
the lanyard and sanje datasets are offered.

osh.ai.kr's /demo/:path* rewrite drops the trailing slash, and Starlette would answer the bare
mount path with a redirect back to the slashed form, so the bare path is rewritten in place.
"""

import asyncio
import hashlib
import importlib
import json
import os
import re
import sys
import urllib.parse
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

from app import storage

NAS = Path(os.environ.get("NAS_DATA", "/nas"))
REPO = Path(__file__).resolve().parents[2]
# digest: sha256 of "\n".join(sorted(f"{path}\t{sha256}")) over every file under serving/current
# except RELEASE.md (written by nas-put). A new release needs a new digest here.
PACKAGES = {
    "osh-precedents": {
        "title": "산업안전 판례 검색",
        "module": "oshp.app",
        "env": "OSHP",
        "version": "1.0.0",
        "bucket": "osh-precedents-research",
        # serving v2 = the 2026-10-06 handoff package with four remaining name strings removed
        # on the owner's instruction (CHANGES-v2.md; 343 files).
        "digest": "bece32593194a8fa5fc296525530fd4926c18c07d558a31cf79d11b5717c70b9",
    },
    "osh-synonym-vocab": {
        "title": "산업안전 유사어휘 검색",
        "module": "oshv.app",
        "env": "OSHV",
        "version": "1.0.0",
        "bucket": "osh-synonym-vocab-research",
        # serving v1 = the 2026-10-06 handoff package copied by nas-put (172 files).
        "digest": "ee07444314b08f61038fdbb57e6b266a50f519e7b73f617c4dc382f6bc639b33",
    },
    "kosha-guide-graphrag": {
        "title": "KOSHA GUIDE 그래프 검색",
        "module": None,  # screen and API live in app.kosha_graphrag
        "version": "1.0.0",
        "bucket": "kosha-graphrag-research",
        "digest": None,  # pinned by app.kosha_graphrag.DIGEST
    },
}
# The packaged templates set margins with inline style attributes; scripts stay 'self' only.
CSP = (
    b"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    b"font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
    b"base-uri 'self'"
)
FILE_ID = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,79}$")


def prefix(slug: str):
    return f"/demo/{slug}"


def root(slug: str):
    return NAS / slug / "serving/current"


def sha256_of(path: Path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


@lru_cache(maxsize=8)
def verify(slug: str):
    """Raises ValueError unless every file under serving/current matches the pinned digest."""
    lines = []
    for path in sorted(root(slug).rglob("*")):
        rel = path.relative_to(root(slug)).as_posix()
        if path.is_file() and rel != "RELEASE.md":
            lines.append(f"{rel}\t{sha256_of(path)}")
    if hashlib.sha256("\n".join(sorted(lines)).encode()).hexdigest() != PACKAGES[slug]["digest"]:
        raise ValueError(f"{slug}: release does not match the pinned digest")
    return True


def load_module(slug: str):
    """Import the packaged app from serving/current/demo with semantic search off."""
    spec = PACKAGES[slug]
    os.environ.setdefault(f"{spec['env']}_SEMANTIC", "off")
    os.environ.setdefault(f"{spec['env']}_TRUST_FORWARDED", "1")
    demo = str(root(slug) / "demo")
    if demo not in sys.path:
        sys.path.insert(0, demo)
    return importlib.import_module(spec["module"])


class Packaged:
    """ASGI wrapper: pinned release, lazy start of the packaged app, CSP, download redirect."""

    def __init__(self, slug: str):
        self.slug = slug
        self.app = None
        self.error = None
        self.lifespan = None
        self.lock = asyncio.Lock()

    async def start(self):
        if self.app is not None or self.error is not None:
            return
        async with self.lock:
            if self.app is not None or self.error is not None:
                return
            try:
                await run_in_threadpool(verify, self.slug)
                module = await run_in_threadpool(load_module, self.slug)
                lifespan = module.app.router.lifespan_context(module.app)
                await lifespan.__aenter__()
                self.lifespan, self.app = lifespan, module.app
            except Exception as error:  # noqa: BLE001 - any failure means "not served"
                self.error = f"{type(error).__name__}: {error}"

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return
        await self.start()
        # Starlette keeps the full path in scope["path"]; the mounted app's own path follows
        # root_path.
        path = scope.get("path", "")[len(scope.get("root_path", "")) :]
        if self.app is None:
            response = JSONResponse(
                {"error": "검색 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."},
                status_code=503,
            )
            await response(scope, receive, send)
            return
        if path.startswith("/files/"):
            file_id = path[len("/files/") :]
            response = RedirectResponse(
                f"{prefix(self.slug)}/download/{urllib.parse.quote(file_id, safe='')}",
                status_code=302,
            )
            await response(scope, receive, send)
            return

        async def send_with_csp(message):
            if message["type"] == "http.response.start":
                headers = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() != b"content-security-policy"
                ]
                headers.append((b"content-security-policy", CSP))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_csp)


class BareMountPath:
    """Rewrites /demo/<slug> (no trailing slash, as osh.ai.kr forwards it) to /demo/<slug>/."""

    def __init__(self, app, paths):
        self.app = app
        self.paths = set(paths)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path") in self.paths:
            scope = {
                **scope,
                "path": scope["path"] + "/",
                "raw_path": scope.get("raw_path", scope["path"].encode()) + b"/",
            }
        await self.app(scope, receive, send)


# ---- downloads: private object storage, never proxied --------------------------------------


def storage_settings(slug: str):
    spec = PACKAGES[slug]
    return {**storage.config(), "bucket": spec["bucket"], "prefix": f"{slug}/{spec['version']}"}


def manifest_path(slug: str):
    return REPO / "local_asset" / f"{slug}-storage-manifest.json"


def dataset_manifest(slug: str):
    try:
        data = json.loads(manifest_path(slug).read_text())
        if data.get("verified") is not True or not data.get("files"):
            raise ValueError("Unverified upload")
        return data
    except (OSError, ValueError, TypeError):
        raise HTTPException(503, "다운로드 파일을 준비 중입니다.") from None


def dataset_files(slug: str):
    data = dataset_manifest(slug)
    return {
        "dataset": f"{slug}-{data['version']}",
        "files": [{k: f[k] for k in ("id", "name", "bytes", "sha256")} for f in data["files"]],
    }


def dataset_download(slug: str, file_id: str):
    cfg, data = storage_settings(slug), dataset_manifest(slug)
    if data.get("project") != cfg["url"] or data.get("bucket") != cfg["bucket"]:
        raise HTTPException(503, "파일 저장소 구성을 확인 중입니다.")
    item = next((f for f in data["files"] if f["id"] == file_id), None)
    if item is None:
        raise HTTPException(404, "등록된 파일이 아닙니다.")
    key = item["object"]
    if not key.startswith(cfg["prefix"] + "/") or ".." in key or "\\" in key:
        raise HTTPException(503, "파일 경로를 확인 중입니다.")
    storage.private_bucket(cfg)
    route = "object/sign/" + cfg["bucket"] + "/" + urllib.parse.quote(key, safe="/")
    signed = storage.storage_request(cfg, route, {"expiresIn": 60}).get("signedURL", "")
    if not signed.startswith("/" + route + "?"):
        raise HTTPException(503, "다운로드 주소를 생성하지 못했습니다.")
    name = urllib.parse.quote(item["name"], safe="")
    return {"url": f"{cfg['url']}/storage/v1{signed}&download={name}", "expires_in": 60}


def register(app):
    mounted = []
    for slug, spec in PACKAGES.items():
        # Routes first: a mount would otherwise swallow /api/downloads and /download/.

        def make(slug=slug):
            @app.get(prefix(slug) + "/api/downloads")
            def downloads():
                return dataset_files(slug)

            @app.api_route(prefix(slug) + "/download/{file_id}", methods=["GET", "HEAD"])
            def download(file_id: str):
                if not FILE_ID.match(file_id):
                    raise HTTPException(404, "등록된 파일이 아닙니다.")
                link = dataset_download(slug, file_id)
                return RedirectResponse(
                    link["url"], status_code=302, headers={"Cache-Control": "no-store"}
                )

        make()
        if spec["module"]:
            app.mount(prefix(slug), Packaged(slug), name=f"{slug}-app")
            mounted.append(prefix(slug))
    app.add_middleware(BareMountPath, paths=mounted)
