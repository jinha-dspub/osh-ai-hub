"""The /demo/chemreg proxy: prefix stripping, forwarded headers, cookies and outages."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import chemreg
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user"}
PREFIX = chemreg.PREFIX


def reply(status, body, headers=None, media="application/json"):
    """An unread upstream response: the proxy streams it, so it must not be pre-consumed."""
    return httpx.Response(
        status,
        stream=httpx.ByteStream(json.dumps(body).encode() if media == "application/json" else body),
        headers=[("content-type", media), *(headers or [])],
    )


class Upstream:
    """Records what ChemReg would receive and answers like it."""

    def __init__(self):
        self.requests = []

    async def __call__(self, request: httpx.Request):
        self.requests.append(request)
        if request.url.path == "/":
            return reply(200, b"<!doctype html><title>DEMO</title>", media="text/html")
        if request.url.path == "/api/login":
            body = await request.aread()
            return reply(
                200,
                {"authenticated": True},
                [
                    ("set-cookie", f"chemreg_session=DEMO; Path={PREFIX}; HttpOnly"),
                    ("set-cookie", "chemreg_hint=DEMO; Path=" + PREFIX),
                    ("x-echo-length", str(len(body))),
                ],
            )
        if request.url.path == "/api/status":
            if "chemreg_session=DEMO" not in request.headers.get("cookie", ""):
                return reply(401, {"detail": "로그인이 필요합니다."})
            return reply(200, {"stats": {}}, [("cache-control", "no-store")])
        return reply(404, {"detail": "DEMO not found"})


@pytest.fixture
def upstream(monkeypatch):
    fake = Upstream()
    monkeypatch.setattr(
        chemreg, "client", httpx.AsyncClient(transport=httpx.MockTransport(fake), base_url="http://chemreg.test")
    )
    return fake


@pytest.fixture
def client(upstream):
    return TestClient(app, client=("192.168.0.3", 1234), headers=HEADERS)


def test_proxy_needs_the_gateway_peer_and_user(upstream, monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    direct = TestClient(app, client=("192.168.0.55", 1234), headers=HEADERS)
    assert direct.get(PREFIX + "/").status_code == 403
    no_user = TestClient(app, client=("192.168.0.3", 1234))
    assert no_user.get(PREFIX + "/api/status").status_code == 403
    assert upstream.requests == []


def test_entry_page_with_and_without_slash_maps_to_root(client, upstream):
    for path in (PREFIX, PREFIX + "/"):
        response = client.get(path)
        assert response.status_code == 200
        assert "DEMO" in response.text
    assert [r.url.path for r in upstream.requests] == ["/", "/"]
    sent = upstream.requests[0].headers
    assert sent["host"] == chemreg.HOST
    assert "x-osh-authenticated-user" not in sent
    assert sent["x-forwarded-for"] == "192.168.0.3"
    assert sent["x-forwarded-proto"] == "https"


def test_prefix_is_stripped_and_query_kept(client, upstream):
    response = client.get(PREFIX + "/api/search?q=DEMO&page=2")
    assert response.status_code == 404
    request = upstream.requests[-1]
    assert request.url.path == "/api/search"
    assert dict(request.url.params) == {"q": "DEMO", "page": "2"}


def test_forwarded_client_address_comes_from_the_gateway_header(client, upstream):
    client.get(PREFIX + "/", headers={"X-Forwarded-For": "203.0.113.9, 192.168.0.3"})
    assert upstream.requests[-1].headers["x-forwarded-for"] == "203.0.113.9"


def test_login_cookies_and_body_pass_through(client, upstream):
    response = client.post(
        PREFIX + "/api/login",
        json={"password": "DEMO"},
        headers={"Origin": "https://osh.ai.kr", "X-ChemRegistry": "1"},
    )
    assert response.status_code == 200
    assert response.headers["x-echo-length"] == str(len(upstream.requests[-1].content))
    assert json.loads(upstream.requests[-1].content) == {"password": "DEMO"}
    assert upstream.requests[-1].headers["x-chemregistry"] == "1"
    # The gate already checked Origin; the app compares it against its own loopback address.
    assert "origin" not in upstream.requests[-1].headers
    cookies = response.headers.get_list("set-cookie")
    assert len(cookies) == 2 and all(f"Path={PREFIX}" in c for c in cookies)
    assert client.get(PREFIX + "/api/status").status_code == 200
    assert client.get(PREFIX + "/api/status").headers["cache-control"] == "no-store"


def test_gateway_refuses_foreign_origins_before_the_app(client, upstream):
    response = client.post(
        PREFIX + "/api/login", json={"password": "DEMO"}, headers={"Origin": "https://evil.test"}
    )
    assert response.status_code == 403
    assert upstream.requests == []


def test_unauthenticated_reads_stay_401(client):
    assert client.get(PREFIX + "/api/status").status_code == 401


def test_outage_answers_503(monkeypatch):
    async def down(request):
        raise httpx.ConnectError("DEMO down", request=request)

    monkeypatch.setattr(
        chemreg, "client", httpx.AsyncClient(transport=httpx.MockTransport(down), base_url="http://chemreg.test")
    )
    client = TestClient(app, client=("192.168.0.3", 1234), headers=HEADERS)
    response = client.get(PREFIX + "/api/status")
    assert response.status_code == 503
    assert "ChemReg" in response.json()["error"]
