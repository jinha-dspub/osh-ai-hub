"""Bounded native-audio DEMO. Only the server can control the paid connection.

HTTP chunks/polling reuse the existing /demo proxy; no browser API credentials,
WebSocket proxy changes, arbitrary provider events, or unbounded conversations.
"""

import asyncio
import base64
import binascii
import json
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool
from websockets.asyncio.client import connect

from app import budget
from app.copd import SearchInput, search
from app.secrets import read_openai_api_key

MODEL = "gpt-realtime-2.1-mini"
PREFIX = "/demo/voice"
STATIC = Path(__file__).resolve().parents[1] / "static/voice"
router = APIRouter(prefix=PREFIX)
MAX_AUDIO_BYTES = 24_000 * 2 * 20
INSTRUCTIONS = """당신은 OSH AI Hub의 한국어 음성 이용 안내 도우미입니다.
짧고 분명한 한국어로 두세 문장만 답하세요. AI 음성 안내 DEMO입니다.
서비스: COPD 산재 판정 사례 검색, 한글 HWPX 변환, 건강검진 확인.
COPD 사례를 찾으려면 search_copd 함수를 사용하세요. 직종·유해인자는 q,
청구연도는 year, 인정 여부는 approval에 넣으세요. 알 수 없는 조건은 빈 문자열.
함수가 반환한 개수만 읽고 화면의 검색 결과 링크를 안내하세요. 없는 결과를 지어내지 마세요.
판정문 원문은 제공되지 않습니다. 의료·법률 판단이나 승인 확률을 추측하지 마세요.
건강검진은 tools.osh.ai.kr/myhealthexam/, 한글 변환은 tools.osh.ai.kr/hwpx/입니다.
본인인증을 대신하거나 다운로드·저장·로그인 완료를 주장하지 마세요.
이 대화는 한 질문씩 진행합니다. 다른 질문은 화면의 말로 질문하기 버튼을 안내하세요."""
TOOL = {
    "type": "function",
    "name": "search_copd",
    "description": "COPD 사례를 키워드로 검색한다. 원문은 전송하지 않고 개수와 링크만 반환한다.",
    "parameters": {
        "type": "object",
        "properties": {
            "q": {"type": "string", "maxLength": 300},
            "year": {
                "type": "string",
                "enum": ["", "2016", "2017", "2018", "2019", "2020", "2021"],
            },
            "approval": {"type": "string", "enum": ["", "인정", "불인정", "일부인정"]},
        },
        "required": ["q", "year", "approval"],
        "additionalProperties": False,
    },
}


class Start(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(default="", max_length=300)
    slow: bool = False
    consent: bool


class Audio(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seq: int = Field(ge=0)
    audio: str = Field(max_length=15500)


async def body(request, model):
    if request.headers.get("content-type", "").split(";")[0] != "application/json":
        raise HTTPException(415, "JSON 요청이 필요합니다.")
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 16000:
            raise HTTPException(413, "요청 크기를 초과했습니다.")
    try:
        return model.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(422, "입력 조건을 확인해 주세요.") from None


sessions = {}
start_lock = asyncio.Lock()


class Session:
    def __init__(self, owner, options, charge):
        self.token = secrets.token_urlsafe(32)
        self.owner = owner
        self.options = options
        self.charge = charge
        self.events = []
        self.event_bytes = 0
        self.changed = asyncio.Event()
        self.ready = asyncio.Event()
        self.lock = asyncio.Lock()
        self.ws = None
        self.task = None
        self.closed = False
        self.committed = False
        self.received = 0
        self.seq = 0
        self.responses = 0
        self.created = time.monotonic()

    def emit(self, kind, **data):
        event = {"id": len(self.events) + 1, "type": kind, **data}
        self.event_bytes += len(json.dumps(event))
        if self.event_bytes > 4_000_000:
            raise RuntimeError("Output bound exceeded")
        self.events.append(event)
        self.changed.set()

    async def send(self, event):
        await self.ws.send(json.dumps(event))

    async def finish_input(self):
        async with self.lock:
            if self.committed or self.closed:
                return
            if self.received < 4800:
                raise HTTPException(422, "조금 더 길게 말씀해 주세요.")
            self.committed = True
            await self.send({"type": "input_audio_buffer.commit"})
            await self.respond()
            self.emit("thinking")

    async def respond(self):
        if self.responses:
            self.charge = budget.reserve(MODEL, budget.VOICE_RESERVE)
        self.responses += 1
        await self.send({"type": "response.create"})

    async def run(self):
        try:
            async with asyncio.timeout(65):
                async with connect(
                    "wss://api.openai.com/v1/realtime?" + urlencode({"model": MODEL}),
                    additional_headers={"Authorization": "Bearer " + read_openai_api_key()},
                    open_timeout=10,
                    close_timeout=2,
                    max_size=2_000_000,
                ) as ws:
                    self.ws = ws
                    initial = json.loads(await ws.recv())
                    if initial.get("type") == "error":
                        if initial.get("error", {}).get("code") == "credit_balance_exhausted":
                            # Rejected before any input/response: known zero usage.
                            budget.settle(self.charge, 0)
                            self.charge = None
                        raise HTTPException(
                            503, "음성 서비스 이용 설정을 확인 중입니다. 직접 검색을 이용해 주세요."
                        )
                    if initial.get("type") != "session.created":
                        raise RuntimeError("Unexpected session event")
                    await self.send(
                        {
                            "type": "session.update",
                            "session": {
                                "type": "realtime",
                                "model": MODEL,
                                "instructions": INSTRUCTIONS,
                                "output_modalities": ["audio"],
                                "max_output_tokens": 512,
                                "audio": {
                                    "input": {
                                        "format": {"type": "audio/pcm", "rate": 24000},
                                        "turn_detection": None,
                                    },
                                    "output": {
                                        "format": {"type": "audio/pcm", "rate": 24000},
                                        "voice": "marin",
                                        "speed": 0.85 if self.options.slow else 1.0,
                                    },
                                },
                                "tools": [TOOL],
                                "tool_choice": "auto",
                            },
                        }
                    )
                    async for raw in ws:
                        event = json.loads(raw)
                        kind = event.get("type")
                        if kind == "session.updated":
                            self.ready.set()
                            if self.options.text:
                                self.committed = True
                                await self.send(
                                    {
                                        "type": "conversation.item.create",
                                        "item": {
                                            "type": "message",
                                            "role": "user",
                                            "content": [
                                                {"type": "input_text", "text": self.options.text}
                                            ],
                                        },
                                    }
                                )
                                await self.respond()
                        elif kind == "response.output_audio.delta":
                            self.emit("audio", audio=event["delta"])
                        elif kind == "response.output_audio_transcript.delta":
                            self.emit("text", text=event["delta"])
                        elif kind == "error":
                            raise RuntimeError("Provider rejected request")
                        elif kind == "response.done":
                            response = event["response"]
                            usage = response.get("usage")
                            if usage:
                                budget.settle(self.charge, budget.voice_cost(usage))
                                self.charge = None
                            else:
                                # No usage means no refund; do not start another response.
                                raise RuntimeError("Missing usage")
                            if response.get("status") != "completed":
                                raise RuntimeError("Incomplete response")
                            calls = [
                                item
                                for item in response.get("output", [])
                                if item.get("type") == "function_call"
                            ]
                            if calls and self.responses == 1:
                                # Exactly one validated local tool. No cloud case-text access.
                                call = calls[0]
                                if len(calls) != 1 or call.get("name") != "search_copd":
                                    raise RuntimeError("Unsupported tool")
                                values = json.loads(call["arguments"])
                                if set(values) - {"q", "year", "approval"}:
                                    raise ValueError("Invalid filters")
                                filters = SearchInput.model_validate(values)
                                result = await run_in_threadpool(search, filters)
                                url = "/demo/copd/?" + urlencode(
                                    {
                                        "q": filters.q,
                                        "year": filters.year,
                                        "approval": filters.approval,
                                        "mode": "keyword",
                                    }
                                )
                                self.emit("search", total=result["total"], url=url)
                                await self.send(
                                    {
                                        "type": "conversation.item.create",
                                        "item": {
                                            "type": "function_call_output",
                                            "call_id": call["call_id"],
                                            "output": json.dumps(
                                                {"count": result["total"], "url": url}
                                            ),
                                        },
                                    }
                                )
                                await self.send(
                                    {
                                        "type": "session.update",
                                        "session": {
                                            "type": "realtime",
                                            "tool_choice": "none",
                                        },
                                    }
                                )
                                await self.respond()
                            else:
                                self.emit("done")
                                break
        except asyncio.CancelledError:
            pass
        except HTTPException as error:
            self.emit("error", message=error.detail)
        except Exception:  # noqa: BLE001 — provider errors may contain sensitive data
            # Never expose upstream errors, keys, transcripts or raw provider events.
            self.emit(
                "error",
                message="음성 안내를 완료하지 못했습니다. 잠시 후 다시 시도하거나 일반 검색을 이용해 주세요.",
            )
        finally:
            self.closed = True
            self.ready.set()
            self.changed.set()
            # Unsettled reservations are intentionally retained (including crashes).
            asyncio.get_running_loop().call_later(60, sessions.pop, self.token, None)


def get_session(request):
    item = sessions.get(request.headers.get("x-voice-session", ""))
    if item is None or item.owner != request.headers.get("x-osh-authenticated-user", "local"):
        raise HTTPException(404, "음성 대화가 종료되었습니다. 다시 시작해 주세요.")
    return item


@router.api_route("/", methods=["GET", "HEAD"])
@router.get("")
def page():
    if not (STATIC / "index.html").exists():
        raise HTTPException(503, "음성 화면을 준비 중입니다.")
    return FileResponse(STATIC / "index.html")


@router.post("/api/start")
async def start(request: Request):
    options = await body(request, Start)
    if not options.consent:
        raise HTTPException(422, "음성·질문의 외부 AI 전송 안내를 확인해 주세요.")
    try:
        read_openai_api_key()
    except RuntimeError:
        raise HTTPException(503, "음성 안내 설정을 확인 중입니다.") from None
    async with start_lock:
        if sum(not item.closed for item in sessions.values()) >= 3:
            raise HTTPException(429, "다른 음성 안내를 진행 중입니다. 잠시 후 다시 시도해 주세요.")
        charge = budget.reserve(MODEL, budget.VOICE_RESERVE)
        session = Session(request.headers.get("x-osh-authenticated-user", "local"), options, charge)
        sessions[session.token] = session
        session.task = asyncio.create_task(session.run())
    # Return promptly, before the upstream connection, to avoid proxy timeout/retry.
    return {"token": session.token, "max_seconds": 20}


@router.post("/api/audio")
async def audio(request: Request):
    session = get_session(request)
    data = await body(request, Audio)
    try:
        chunk = base64.b64decode(data.audio, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "음성 형식을 확인해 주세요.") from None
    if not chunk or len(chunk) > 11520 or len(chunk) % 2:
        raise HTTPException(422, "음성 크기를 확인해 주세요.")
    if not session.ready.is_set():
        raise HTTPException(409, "음성 연결을 준비 중입니다.")
    async with session.lock:
        if session.closed or session.committed:
            return {"accepted": False}
        if data.seq < session.seq:
            return {"accepted": True}  # A replay never appends or bills again.
        if data.seq != session.seq:
            raise HTTPException(409, "음성 전송 순서를 확인해 주세요.")
        if session.received + len(chunk) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "한 질문은 20초까지 가능합니다.")
        session.received += len(chunk)
        session.seq += 1
        await session.send({"type": "input_audio_buffer.append", "audio": data.audio})
    return {"accepted": True}


@router.post("/api/finish")
async def finish(request: Request):
    await get_session(request).finish_input()
    return {"ok": True}


@router.post("/api/stop")
async def stop(request: Request):
    session = get_session(request)
    session.closed = True
    session.task.cancel()
    return {"ok": True}


@router.get("/api/events")
async def events(request: Request, after: int = 0):
    session = get_session(request)
    if after < 0 or after > len(session.events):
        raise HTTPException(422, "응답 순서를 확인해 주세요.")
    if after == len(session.events) and not session.closed:
        session.changed.clear()
        try:
            await asyncio.wait_for(session.changed.wait(), timeout=0.5)
        except TimeoutError:
            pass
    return {
        "events": session.events[after : after + 20],
        "ready": session.ready.is_set(),
        "closed": session.closed and after + 20 >= len(session.events),
    }


def register(app):
    app.include_router(router)
    app.mount(
        PREFIX + "/assets",
        StaticFiles(directory=STATIC / "assets", check_dir=False),
        name="voice-assets",
    )
