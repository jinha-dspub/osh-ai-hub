"""OSHMASTER routes under the existing authenticated demo gateway."""

import hashlib
import json
import re
import sqlite3
import urllib.parse
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app import storage
from app.oshmaster_data import ROOT, Demo

VERSION = "2026-09-21.1"
PREFIX = "/demo/oshmaster"
STATIC = Path(__file__).resolve().parents[1] / "static/oshmaster"
MANIFEST = Path(__file__).resolve().parents[2] / "local_asset/oshmaster-storage-manifest.json"
DB_SHA256 = "1b038a8a5b22dab995c4b8420643dbb18769f95f2ebf0110e7db29517e9f65aa"


@lru_cache(maxsize=1)
def master():
    with (ROOT / "data/search.sqlite").open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != DB_SHA256:
            raise HTTPException(503, "자료 버전을 확인 중입니다.")
    return Demo(ROOT)


def settings():
    return {**storage.config(), "bucket": "oshmaster-research", "prefix": f"oshmaster/{VERSION}"}


def manifest():
    try:
        value = json.loads(MANIFEST.read_text())
        if (
            value.get("verified") is not True
            or value.get("version") != VERSION
            or not value.get("files")
        ):
            raise ValueError("Unverified release")
        return value
    except (OSError, ValueError, TypeError):
        raise HTTPException(503, "다운로드 파일을 확인 중입니다.") from None


def files():
    value = manifest()
    return {
        "version": VERSION,
        "files": [{k: row[k] for k in ("id", "name", "bytes", "sha256")} for row in value["files"]],
    }


def signed_download(body):
    cfg, data = settings(), manifest()
    if data.get("project") != cfg["url"] or data.get("bucket") != cfg["bucket"]:
        raise HTTPException(503, "저장소 구성을 확인 중입니다.")
    item = next((r for r in data["files"] if r["id"] == body.id), None)
    if not item:
        raise HTTPException(404, "등록된 파일이 아닙니다.")
    key = item["object"]
    if (
        not key.startswith(cfg["prefix"] + "/")
        or ".." in key
        or not re.fullmatch(r"[A-Za-z0-9/_.-]+", key)
    ):
        raise HTTPException(503, "파일 경로를 확인 중입니다.")
    storage.private_bucket(cfg)
    route = "object/sign/" + cfg["bucket"] + "/" + key
    response = storage.storage_request(cfg, route, {"expiresIn": 60})
    signed = response.get("signedURL", "")
    if not signed.startswith("/" + route + "?"):
        raise HTTPException(503, "다운로드 주소를 확인 중입니다.")
    return {
        "url": cfg["url"]
        + "/storage/v1"
        + signed
        + "&download="
        + urllib.parse.quote(item["name"], safe=""),
        "expires_in": 60,
    }


def register(app):
    @app.api_route(PREFIX + "/", methods=["GET", "HEAD"])
    def page():
        if not (STATIC / "index.html").is_file():
            raise HTTPException(503, "화면을 준비 중입니다.")
        return FileResponse(STATIC / "index.html")

    @app.get(PREFIX + "/api/{action}")
    def read(action: str, request: Request):
        pairs = list(request.query_params.multi_items())
        if len(pairs) != len({k for k, _ in pairs}):
            raise HTTPException(400, "중복 검색 조건을 제거해 주세요.")
        if len(str(request.url.query)) > 4096:
            raise HTTPException(400, "입력 길이를 확인해 주세요.")
        if action == "files" and not pairs:
            return files()
        if action not in {"catalogue", "search", "detail"}:
            raise HTTPException(404, "지원하지 않는 요청입니다.")
        try:
            return master().api(action, dict(pairs))
        except ValueError:
            raise HTTPException(400, "검색어·분류·판본·페이지 조건을 확인해 주세요.") from None
        except LookupError:
            raise HTTPException(404, "코드를 찾을 수 없습니다.") from None
        except (OSError, sqlite3.Error):
            raise HTTPException(503, "자료를 불러오지 못했습니다. 다시 시도해 주세요.") from None

    @app.post(PREFIX + "/api/download")
    async def download(request: Request):
        if request.headers.get("content-type") != "application/json":
            raise HTTPException(415, "JSON 요청이 필요합니다.")
        content = b""
        async for chunk in request.stream():
            content += chunk
            if len(content) > 1024:
                raise HTTPException(413, "입력 용량을 초과했습니다.")
        try:
            body = storage.DownloadInput.model_validate_json(content)
        except ValidationError:
            raise HTTPException(422, "파일 ID를 확인해 주세요.") from None
        return await run_in_threadpool(signed_download, body)

    app.mount(
        PREFIX + "/assets",
        StaticFiles(directory=STATIC / "assets", check_dir=False),
        name="oshmaster-assets",
    )
