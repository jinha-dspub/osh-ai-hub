"""Standalone COPD app behind the authenticated .3 gateway; no raw data in static assets."""

import ipaddress
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app import sanje
from app.copd import ExplainInput, SearchInput, detail, explain, explain_for, info, search
from app.storage import DownloadInput, files, signed_download

PREFIX = "/demo/copd"
STATIC = Path(__file__).resolve().parents[1] / "static/copd"
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def trusted_request(request: Request):
    try:
        address = ipaddress.ip_address(request.client.host)
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
    except ValueError:
        return False
    if address.is_loopback and os.environ.get("COPD_ALLOW_LOCAL_PREVIEW") == "true":
        return True
    return str(address) == "192.168.0.3" and bool(
        request.headers.get("x-osh-authenticated-user", "").strip()
    )


@app.middleware("http")
async def gate(request: Request, call_next):
    if request.url.path == "/health" and request.method == "GET":
        return JSONResponse({"status": "ok", "service": "copd-demo"})
    if not trusted_request(request):
        return JSONResponse(
            {"error": "인증된 관문을 통해 접속해 주세요."},
            status_code=403,
            headers={"Cache-Control": "no-store"},
        )
    if request.method == "POST":
        allowed = {"https://osh.ai.kr", "https://tools.osh.ai.kr"}
        if os.environ.get("COPD_ALLOW_LOCAL_PREVIEW") == "true":
            allowed.update({"http://127.0.0.1:8103", "http://localhost:8103"})
        if request.headers.get("origin") not in allowed:
            return JSONResponse({"error": "허용되지 않은 요청입니다."}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
    )
    return response


@app.exception_handler(HTTPException)
async def http_error(_request, error):
    return JSONResponse({"error": error.detail}, status_code=error.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_request, _error):
    return JSONResponse({"error": "입력 조건을 확인해 주세요."}, status_code=422)


@app.get(PREFIX)
def slash():
    return page()


@app.api_route(PREFIX + "/", methods=["GET", "HEAD"])
def page():
    if not (STATIC / "index.html").exists():
        raise HTTPException(503, "검색 화면 빌드가 필요합니다.")
    return FileResponse(STATIC / "index.html")


@app.get(PREFIX + "/api")
def read_api(action: str, id: str = "", page: int = 1):
    if sanje.enabled():
        return read_sanje("copd", action, id, page)
    if action == "info":
        return info()
    if action == "files":
        return files()
    if action == "case" and 0 < len(id) <= 100:
        return detail(id)
    raise HTTPException(400, "지원하지 않는 요청입니다.")


@app.post(PREFIX + "/api")
async def write_api(request: Request, action: str):
    if request.headers.get("content-type") != "application/json":
        raise HTTPException(415, "JSON 요청이 필요합니다.")
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > 8192:
            raise HTTPException(413, "입력 용량을 초과했습니다.")
    try:
        # AI work runs in a thread so health/static requests remain responsive.
        from starlette.concurrency import run_in_threadpool

        if sanje.enabled():
            return await dispatch_sanje("copd", action, body)
        if action == "download":
            return await run_in_threadpool(signed_download, DownloadInput.model_validate_json(body))
        if action == "search":
            return await run_in_threadpool(search, SearchInput.model_validate_json(body))
        if action == "explain":
            return await run_in_threadpool(explain, ExplainInput.model_validate_json(body))
    except ValidationError:
        raise HTTPException(422, "입력 조건을 확인해 주세요.") from None
    raise HTTPException(400, "지원하지 않는 요청입니다.")


app.mount(
    PREFIX + "/assets", StaticFiles(directory=STATIC / "assets", check_dir=False), name="assets"
)


def read_sanje(group: str, action: str, id: str = "", page: int = 1):
    sanje.group_id(group)
    if action == "files":
        return sanje.files(group)
    data = sanje.dataset(group)
    if action == "info":
        return data.info()
    if action == "case" and 0 < len(id) <= 100:
        return data.detail(id)
    if action == "labels" and 0 < len(id) <= 100:
        return data.labels(id, page)
    raise HTTPException(400, "지원하지 않는 요청입니다.")


async def dispatch_sanje(group, action, body):
    from starlette.concurrency import run_in_threadpool

    sanje.group_id(group)
    if action == "download":
        return await run_in_threadpool(
            sanje.signed_download, group, DownloadInput.model_validate_json(body)
        )
    if action == "search":
        query = sanje.SearchInput.model_validate_json(body)
        return await run_in_threadpool(lambda: sanje.dataset(group).search(query))
    if action == "explain":
        query = ExplainInput.model_validate_json(body)
        return await run_in_threadpool(lambda: explain_for(sanje.dataset(group), query))
    raise HTTPException(400, "지원하지 않는 요청입니다.")


@app.api_route("/demo/sanje/{group}/", methods=["GET", "HEAD"])
def sanje_page(group: str):
    sanje.group_id(group)
    return page()


@app.get("/demo/sanje/{group}/api")
def sanje_read_api(group: str, action: str, id: str = "", page: int = 1):
    return read_sanje(group, action, id, page)


@app.post("/demo/sanje/{group}/api")
async def sanje_write_api(group: str, action: str, request: Request):
    sanje.group_id(group)
    if request.headers.get("content-type") != "application/json":
        raise HTTPException(415, "JSON 요청이 필요합니다.")
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > 8192:
            raise HTTPException(413, "입력 용량을 초과했습니다.")
    try:
        return await dispatch_sanje(group, action, body)
    except ValidationError:
        raise HTTPException(422, "입력 조건을 확인해 주세요.") from None
