import asyncio
import base64
import json

import pytest
from fastapi.testclient import TestClient

from app import budget, voice
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user", "Origin": "https://osh.ai.kr"}


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    monkeypatch.setattr(voice, "read_openai_api_key", lambda: "DEMO-TEST-ONLY")
    voice.sessions.clear()
    yield
    voice.sessions.clear()


def test_voice_gate_origin_and_provider_controls():
    client = TestClient(app, client=("192.168.0.55", 123))
    assert (
        client.post("/demo/voice/api/start", headers=HEADERS, json={"consent": True}).status_code
        == 403
    )
    client = TestClient(app, client=("192.168.0.3", 123))
    assert (
        client.post(
            "/demo/voice/api/start",
            headers={**HEADERS, "Origin": "https://evil.test"},
            json={"consent": True},
        ).status_code
        == 403
    )
    for data in [
        {"consent": False},
        {"consent": True, "model": "expensive"},
        {"consent": True, "text": "x" * 301},
    ]:
        assert client.post("/demo/voice/api/start", headers=HEADERS, json=data).status_code == 422
    assert (
        client.post(
            "/demo/voice/api/start", headers=HEADERS, json={"text": "x" * 20000}
        ).status_code
        == 413
    )


def test_budget_exhaustion_prevents_upstream_connection(monkeypatch):
    budget.reserve("DEMO", 8000)
    monkeypatch.setattr(voice, "connect", lambda *a, **kw: pytest.fail("Paid connection opened"))
    client = TestClient(app, client=("192.168.0.3", 123))
    assert (
        client.post("/demo/voice/api/start", headers=HEADERS, json={"consent": True}).status_code
        == 429
    )
    assert not voice.sessions


def test_session_token_bound_to_gateway_user_and_input_limits():
    session = voice.Session("DEMO-user", voice.Start(consent=True), "DEMO-charge")
    voice.sessions[session.token] = session
    session.ready.set()
    client = TestClient(app, client=("192.168.0.3", 123))
    headers = {**HEADERS, "X-Voice-Session": session.token}
    assert (
        client.get(
            "/demo/voice/api/events", headers={**headers, "X-OSH-Authenticated-User": "other"}
        ).status_code
        == 404
    )
    assert client.get("/demo/voice/api/events?after=-1", headers=headers).status_code == 422
    assert (
        client.post(
            "/demo/voice/api/audio", headers=headers, json={"seq": 0, "audio": "invalid!"}
        ).status_code
        == 422
    )
    session.received = voice.MAX_AUDIO_BYTES
    assert (
        client.post(
            "/demo/voice/api/audio",
            headers=headers,
            json={"seq": 0, "audio": base64.b64encode(b"\0\0").decode()},
        ).status_code
        == 413
    )
    assert session.seq == 0


class FakeSocket:
    def __init__(self, missing_usage=False):
        self.queue = asyncio.Queue()
        self.sent = []
        self.missing_usage = missing_usage

    async def __aenter__(self):
        await self.queue.put({"type": "session.created"})
        return self

    async def __aexit__(self, *args):
        pass

    def __aiter__(self):
        return self

    async def recv(self):
        return json.dumps(await self.queue.get())

    async def __anext__(self):
        return await self.recv()

    async def send(self, raw):
        event = json.loads(raw)
        self.sent.append(event)
        if event["type"] == "session.update":
            await self.queue.put({"type": "session.updated"})
        if event["type"] == "response.create":
            await self.queue.put({"type": "response.output_audio.delta", "delta": "AAA="})
            await self.queue.put(
                {"type": "response.output_audio_transcript.delta", "delta": "DEMO 답변"}
            )
            await self.queue.put(
                {
                    "type": "response.done",
                    "response": {
                        "status": "completed",
                        "output": [],
                        "usage": None
                        if self.missing_usage
                        else {"input_tokens": 100, "output_tokens": 100},
                    },
                }
            )


def test_paid_session_settles_and_only_forwards_allowlisted_events(monkeypatch):
    async def run():
        socket = FakeSocket()
        monkeypatch.setattr(voice, "connect", lambda *a, **kw: socket)
        token = budget.reserve("DEMO", budget.VOICE_RESERVE)
        session = voice.Session("DEMO-user", voice.Start(consent=True, text="DEMO 질문"), token)
        await session.run()
        assert session.closed and session.charge is None
        assert [event["type"] for event in session.events] == ["audio", "text", "done"]
        config = socket.sent[0]["session"]
        assert config["max_output_tokens"] == 512
        assert config["audio"]["input"]["turn_detection"] is None
        assert "transcription" not in config["audio"]["input"]
        with budget.database() as db:
            assert budget.used(db, budget.day()) == 9

    asyncio.run(run())


def test_missing_usage_keeps_reservation_and_fails_closed(monkeypatch):
    async def run():
        monkeypatch.setattr(voice, "connect", lambda *a, **kw: FakeSocket(missing_usage=True))
        token = budget.reserve("DEMO", budget.VOICE_RESERVE)
        session = voice.Session("DEMO-user", voice.Start(consent=True, text="DEMO 질문"), token)
        await session.run()
        assert session.closed
        assert session.events[-1]["type"] == "error"
        with budget.database() as db:
            assert budget.used(db, budget.day()) == 1200

    asyncio.run(run())
