from fastapi.testclient import TestClient

from app.demo_gateway import app


def test_gateway_requires_trusted_peer_and_authenticated_user(monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    direct = TestClient(app, client=("192.168.0.55", 1234))
    for path in ["/demo/", "/demo/copd/", "/demo/copd/api?action=info"]:
        assert (
            direct.get(path, headers={"X-OSH-Authenticated-User": "DEMO-user"}).status_code == 403
        )
    trusted = TestClient(app, client=("192.168.0.3", 1234))
    assert trusted.get("/demo/").status_code == 403
    assert (
        trusted.get("/demo/", headers={"X-OSH-Authenticated-User": "DEMO-user"}).status_code == 200
    )
    assert direct.get("/health").json()["status"] == "ok"


def test_post_origin_and_body_limits_are_enforced(monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    client = TestClient(app, client=("192.168.0.3", 1234))
    headers = {"X-OSH-Authenticated-User": "DEMO-user", "Origin": "https://evil.test"}
    assert client.post("/demo/copd/api?action=search", headers=headers, json={}).status_code == 403
    headers["Origin"] = "https://osh.ai.kr"
    assert (
        client.post(
            "/demo/copd/api?action=search", headers=headers, json={"mode": "invalid"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/demo/copd/api?action=search", headers=headers, json={"q": "x" * 10000}
        ).status_code
        == 413
    )
    assert (
        client.post("/demo/copd/api?action=search", headers=headers, content="bad").status_code
        == 415
    )


def test_local_preview_is_explicit(monkeypatch):
    client = TestClient(app, client=("127.0.0.1", 1234))
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    assert client.get("/demo/").status_code == 403
    monkeypatch.setenv("COPD_ALLOW_LOCAL_PREVIEW", "true")
    assert client.get("/demo/").status_code == 200
