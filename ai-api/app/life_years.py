"""Pinned aggregate calculator and static handoff, behind the existing DEMO gateway."""

import gzip
import hashlib
import json
import mimetypes
import os
import threading
import types
from functools import lru_cache
from pathlib import Path, PurePosixPath

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

PREFIX = "/demo/ei-nhis-life-years-lost"
NAS = Path(os.environ.get("NAS_DATA", "/nas"))
ROOT = NAS / "ei-nhis-life-years-lost/serving/current"
RELEASE_DIGEST = "1c6a1f5d4e4a795e88eec675cdbcd644104a9099f09c2f4e686ca7dcd72c5e3c"
LIMIT = 10 * 1024 * 1024
SLOTS = threading.BoundedSemaphore(2)


@lru_cache(maxsize=1)
def release():
    try:
        if not (NAS / "README.md").is_file():
            raise ValueError("NAS unavailable")
        manifest = (ROOT / "hub-manifest.json").read_bytes()
        if hashlib.sha256(manifest).hexdigest() != RELEASE_DIGEST:
            raise ValueError("Release mismatch")
        files = {}
        for path, sha in json.loads(manifest).items():
            relative = PurePosixPath(path)
            if relative.is_absolute() or ".." in relative.parts or "\\" in path:
                raise ValueError("Unsafe release path")
            file = ROOT / path
            if not file.resolve().is_relative_to(ROOT.resolve()) or file.is_symlink():
                raise ValueError("Unsafe release file")
            content = file.read_bytes()
            if hashlib.sha256(content).hexdigest() != sha:
                raise ValueError("File mismatch")
            files[path] = content
        module = types.ModuleType("ei_nhis_calculator")
        module.__file__ = str(ROOT / "scripts/calculate.py")
        # Execute only the exact code bytes included in the verified release.
        exec(compile(files["scripts/calculate.py"], module.__file__, "exec"), module.__dict__)  # noqa: S102 -- digest-pinned publisher code, never user input
        return files, module
    except (OSError, ValueError, KeyError, TypeError, SyntaxError):
        raise HTTPException(
            503, "계산 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        ) from None


def serve(path: str, request: Request):
    if ".." in path or "\\" in path or "//" in path or path.startswith("/"):
        raise HTTPException(404, "없는 파일입니다.")
    files, _ = release()
    key = "demo/dist/" + (path or "index.html")
    if key not in files:
        raise HTTPException(404, "없는 파일입니다.")
    content = files[key]
    media = mimetypes.guess_type(key)[0] or "application/octet-stream"
    if key.endswith(".js"):
        media = "text/javascript"
    headers = {"Vary": "Accept-Encoding"}
    if path.startswith("downloads/"):
        headers["Content-Disposition"] = "attachment"
    if "gzip" in request.headers.get("accept-encoding", "") and media.startswith(
        ("text/", "application/json")
    ):
        content = gzip.compress(content, mtime=0)
        headers["Content-Encoding"] = "gzip"
    headers["Content-Length"] = str(len(content))
    return Response(b"" if request.method == "HEAD" else content, media_type=media, headers=headers)


def calculate(body):
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(429, "다른 계산을 처리 중입니다. 잠시 후 다시 시도해 주세요.")
    try:
        _, calculator = release()
        try:
            if not isinstance(body, dict) or set(body) - {"bundle", "end_age", "reference"}:
                raise ValueError()
            bundle = body["bundle"]
            if not isinstance(bundle, dict) or not isinstance(bundle.get("metadata"), dict):
                raise TypeError()
            for key in ("aggregate", "standard_population", "reference_mortality"):
                rows = bundle.get(key, [])
                if (
                    not isinstance(rows, list)
                    or len(rows) > 100000
                    or any(not isinstance(r, dict) for r in rows)
                ):
                    raise ValueError()
            end_age, reference = body.get("end_age", 60), body.get("reference", "C")
            if type(end_age) is not int or not isinstance(reference, str) or len(reference) > 100:
                raise ValueError()
            result = calculator.calculate(bundle, end_age, reference)
            return JSONResponse(result)  # Reject nonfinite results inside the error boundary.
        except calculator.InputError as error:
            raise HTTPException(400, str(error)) from None
        except (ValueError, KeyError, TypeError, AttributeError, OverflowError, ZeroDivisionError):
            raise HTTPException(400, "입력 JSON의 구조·값·계산 조건을 확인해 주세요.") from None
    finally:
        SLOTS.release()


def register(app):
    @app.post(PREFIX + "/api/calculate")
    async def compute(request: Request):
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            raise HTTPException(415, "JSON 입력이 필요합니다.")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > LIMIT:
                raise HTTPException(413, "입력 JSON은 10MB 이하여야 합니다.")
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeError, RecursionError):
            raise HTTPException(400, "JSON 형식을 확인해 주세요.") from None
        return await run_in_threadpool(calculate, payload)

    @app.api_route(PREFIX, methods=["GET", "HEAD"])
    @app.api_route(PREFIX + "/", methods=["GET", "HEAD"])
    def home(request: Request):
        return serve("", request)

    @app.api_route(PREFIX + "/{path:path}", methods=["GET", "HEAD"])
    def asset(path: str, request: Request):
        return serve(path, request)
