"""Attach the same first-party heartbeat to HTML DEMOs; never inspect request data."""

import gzip
from pathlib import Path

from fastapi.responses import FileResponse

TAG = b'<script src="/demo/activity.js" defer></script>'
SCRIPT = Path(__file__).resolve().parents[2] / "web/public/activity.js"


class ActivityTrackingMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "GET":
            return await self.app(scope, receive, send)
        start = None
        body = bytearray()
        compressed = False

        async def tracked_send(message):
            nonlocal start, compressed
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                encoding = headers.get(b"content-encoding", b"")
                if (
                    message["status"] == 200
                    and headers.get(b"content-type", b"").startswith(b"text/html")
                    and b"content-disposition" not in headers
                    and encoding in (b"", b"gzip")
                ):
                    start = message
                    compressed = encoding == b"gzip"
                    return
            if message["type"] == "http.response.body" and start is not None:
                body.extend(message.get("body", b""))
                if len(body) > 2 * 1024 * 1024:
                    await send(start)
                    await send({"type": "http.response.body", "body": bytes(body),
                                "more_body": message.get("more_body", False)})
                    start = None
                    body.clear()
                    return
                if message.get("more_body"):
                    return
                original = bytes(body)
                content = gzip.decompress(original) if compressed else original
                if b"</body>" in content and TAG not in content:
                    content = content.replace(b"</body>", TAG + b"</body>", 1)
                    payload = gzip.compress(content, mtime=0) if compressed else content
                    start["headers"] = [
                        (k, v) for k, v in start["headers"]
                        if k not in (b"content-length", b"etag", b"last-modified")
                    ] + [(b"content-length", str(len(payload)).encode())]
                else:
                    payload = original
                await send(start)
                await send({"type": "http.response.body", "body": payload})
                return
            await send(message)

        await self.app(scope, receive, tracked_send)


def register(app):
    app.add_middleware(ActivityTrackingMiddleware)

    @app.get("/demo/activity.js")
    def activity_script():
        return FileResponse(SCRIPT, media_type="text/javascript", headers={"Cache-Control": "no-cache"})
