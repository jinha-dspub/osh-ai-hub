"""ChemReg (ukbyun, 1.0.0) under the /demo gateway as a reverse proxy.

ChemReg is a separate FastAPI process with its own venv, SQLite index and operator login
(osh-chemreg.service, 127.0.0.1:8766). Its package is also called ``app``, so it cannot be
mounted in this process; the gateway forwards /demo/chemreg/<path> to the app's /<path>
instead. The release tree is patched for the prefix by ai-api/scripts/patch_chemreg.py.

The app keeps its own security: Host and Origin checks against PUBLIC_ORIGIN, a password
login for everything but the entry page and static assets, 16 MB upload and 1 MB body limits.
This proxy only adds the gateway's own gate (.3 peer, authenticated-user header) in front.
"""

import os

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

PREFIX = "/demo/chemreg"
UPSTREAM = os.environ.get("CHEMREG_UPSTREAM", "http://127.0.0.1:8766")
# The Host the app accepts: a loopback name in local mode (ALLOWED_HOSTS in public mode).
HOST = os.environ.get("CHEMREG_HOST", "127.0.0.1")
METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]
# Hop-by-hop and gateway-specific headers never cross the proxy. Origin is checked by the
# gateway's gate and would fail the app's local-mode comparison against 127.0.0.1.
SKIP_REQUEST = {"host", "connection", "keep-alive", "transfer-encoding", "te", "upgrade",
                "proxy-authorization", "x-forwarded-for", "x-forwarded-proto",
                "x-forwarded-host", "x-osh-authenticated-user", "content-length", "origin"}
SKIP_RESPONSE = {"connection", "keep-alive", "transfer-encoding", "content-length", "server",
                 "date"}
TIMEOUT = httpx.Timeout(connect=5.0, read=180.0, write=180.0, pool=5.0)
UNAVAILABLE = {"error": "ChemReg 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."}

client = httpx.AsyncClient(base_url=UPSTREAM, timeout=TIMEOUT)


def forwarded_for(request: Request):
    """The client address .3 recorded, or the peer itself."""
    given = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return given or (request.client.host if request.client else "")


async def proxy(path: str, request: Request):
    headers = {k: v for k, v in request.headers.items() if k.lower() not in SKIP_REQUEST}
    headers["Host"] = HOST
    headers["X-Forwarded-For"] = forwarded_for(request)
    headers["X-Forwarded-Proto"] = "https"
    has_body = request.method in ("POST", "PUT", "PATCH")
    if has_body and "content-length" in request.headers:
        headers["Content-Length"] = request.headers["content-length"]
    upstream = client.build_request(
        request.method,
        "/" + path,
        params=request.query_params,
        headers=headers,
        content=request.stream() if has_body else None,
    )
    try:
        response = await client.send(upstream, stream=True)
    except httpx.HTTPError:
        return JSONResponse(UNAVAILABLE, status_code=503, headers={"Cache-Control": "no-store"})
    out = StreamingResponse(
        response.aiter_raw(),
        status_code=response.status_code,
        background=BackgroundTask(response.aclose),
    )
    # Raw headers keep repeated Set-Cookie lines intact.
    out.raw_headers = [
        (k.lower().encode("latin-1"), v.encode("latin-1"))
        for k, v in response.headers.multi_items()
        if k.lower() not in SKIP_RESPONSE
    ]
    return out


def register(app):
    @app.api_route(PREFIX, methods=["GET", "HEAD"])
    @app.api_route(PREFIX + "/", methods=["GET", "HEAD"])
    async def home(request: Request):
        return await proxy("", request)

    @app.api_route(PREFIX + "/{path:path}", methods=METHODS)
    async def forward(path: str, request: Request):
        return await proxy(path, request)
