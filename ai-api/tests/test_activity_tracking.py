import gzip

from fastapi import FastAPI, Response
from fastapi.testclient import TestClient

from app.activity_tracking import TAG, ActivityTrackingMiddleware


def test_only_html_pages_receive_first_party_script():
    app = FastAPI()
    app.add_middleware(ActivityTrackingMiddleware)

    @app.get("/{kind}")
    def sample(kind):
        if kind == "json":
            return {"value": "DEMO"}
        body = b"<html><body>DEMO</body></html>"
        headers = {"ETag": "old", "Last-Modified": "old"}
        if kind == "download":
            headers["Content-Disposition"] = "attachment"
        if kind == "gzip":
            body = gzip.compress(body)
            headers["Content-Encoding"] = "gzip"
        return Response(body, media_type="text/html", headers=headers)

    with TestClient(app) as client:
        for kind in ["html", "gzip"]:
            response = client.get("/" + kind)
            assert response.content.count(TAG) == 1
            assert "etag" not in response.headers
            assert "last-modified" not in response.headers
            if kind == "html":
                assert int(response.headers["content-length"]) == len(response.content)
        assert TAG not in client.get("/download").content
        assert client.get("/json").json() == {"value": "DEMO"}
