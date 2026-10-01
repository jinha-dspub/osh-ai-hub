"""Safety and health support programme finder and its demand log, under the /demo gateway.

The requirement table is real but its reuse terms are unconfirmed, so rows are served from
the gateway API and never bundled into the public web build. What visitors pick (branches,
kinds, searches, exposures, outbound clicks) is the second dataset: each beacon batch is
stored once, unchanged, in the NAS raw area (see /nas/README.md).
"""

import csv
import hashlib
import io
import json
import os
import threading
import uuid
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool

VERSION = "0.7"
VERSION_DATE = "2026-09-28"
PREFIX = "/demo/osh-support-programs"
PROJECT = "osh-support-programs"
# NAS rule 6: the service reads only serving/current (switch with `ln -sfn`, then restart).
# No local fallback: if the NAS is missing the catalogue answers 503.
ROOT = Path(os.environ.get("NAS_DATA", "/nas")) / PROJECT / "serving/current"
STATIC = Path(__file__).resolve().parents[1] / "static/osh-support-programs"
# Pinned from the package files.csv. A new release needs new hashes here.
TABLES = {
    "사업": (
        "2_자료/data/programs.csv",
        "067a863cdd5d71ff2da663e5f54e1cad934f28aea1ed8f24ee4e0029df2928ae",
    ),
    "품목": (
        "2_자료/data/items.csv",
        "ffa08c5def0239168efb477fc703ed7fa0a7c595ca95ead8b2a89547654bd11b",
    ),
}
# Same columns as the package's 데모_데이터.py; the rest are not displayed.
COLUMNS = {
    "사업": [
        "사업ID",
        "사업명",
        "세부사업명",
        "지원범주",
        "지원유형",
        "지원형태",
        "대상단위",
        "소관기관",
        "수행기관",
        "기관구분",
        "근로자수_하한",
        "근로자수_상한_미만",
        "근로자수_기준",
        "규모조건_결합",
        "공사금액_상한_억원_미만",
        "대상업종",
        "대상업종_분류체계",
        "제외업종",
        "지역",
        "산재보험_가입필요",
        "보험료체납_제외",
        "유해인자_보유필요",
        "유해인자_종류",
        "기타대상조건",
        "제외대상",
        "지원비율_최대_퍼센트",
        "지원비율_비고",
        "지원한도_원",
        "한도단위",
        "추가한도_원",
        "추가한도_조건",
        "최소사업비_원",
        "원청부담",
        "중복지원_제한",
        "기지원_차감",
        "지원횟수",
        "융자금리_퍼센트",
        "거치_년",
        "분할상환_년",
        "보험료_인하_퍼센트",
        "혜택기간_년",
        "위험요인",
        "신청방법",
        "문의처",
        "원문_대상표현",
        "근거URL",
        "공식링크",
        "공식링크_종류",
        "링크확인",
        "신청링크",
        "검증상태",
        "기준연도",
    ],
    "품목": [
        "품목ID",
        "사업ID",
        "세부사업명",
        "품목구분",
        "품목명",
        "종수",
        "관리품목",
        "위험요인",
    ],
}


def read_table(name):
    path, digest = TABLES[name]
    content = (ROOT / path).read_bytes()
    if hashlib.sha256(content).hexdigest() != digest:
        raise ValueError(f"{path} does not match the pinned release")
    rows = list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"), newline="")))
    missing = set(COLUMNS[name]) - set(rows[0] if rows else {})
    if missing:
        raise ValueError(f"{path} is missing {sorted(missing)}")
    return [{k: row[k] for k in COLUMNS[name]} for row in rows]


@lru_cache(maxsize=1)
def catalogue():
    data = {name: read_table(name) for name in TABLES}
    return {"version": VERSION, "version_date": VERSION_DATE, **data}


# ---- demand log on the NAS ---------------------------------------------------
# raw/demand-log-YYYYMMDD/<세션ID>-<순번>.json (+ MANIFEST.md), one file per beacon batch.
# Files are only added, never overwritten, so a retried batch is stored once. If the NAS is
# down the batch waits in local_asset/support-programs-log/nas-pending/ and
# scripts/sync_support_programs_nas.py moves it and locks finished days.

KST = ZoneInfo("Asia/Seoul")
BODY_LIMIT = 12_000  # .3 nginx caps /demo/ request bodies at 16k
DAILY_BATCHES = int(os.environ.get("SUPPORT_PROGRAMS_DAILY_BATCHES", "20000"))
RAW_MANIFEST = """# MANIFEST
- 출처: OSH AI Hub 안전보건 지원사업 찾기 화면의 수요 로그 (/demo/osh-support-programs/)
- 입수일: {day} / 입수자: osh-demo 서비스(.6) 자동 적재
- 라이선스·반출 제한: 이용 기록. 이름·연락처·사업장명·IP는 받지 않음. 외부 공유 전 연구책임자 확인 필요.
  수집 항목·목적·보관은 화면 첫 안내로 고지함.
- 규모: 하루(KST) 단위 폴더. 파일 1개 = 화면이 보낸 묶음 1개 = `<세션ID>-<순번>.json`.
  같은 세션은 순번 1, 2, 3…으로 이어 붙여 읽는다. `받은시각`만 서버가 덧붙였다.
- 비고: 다음 날 scripts/sync_support_programs_nas.py가 쓰기 권한을 뗀다.
  수요는 클릭 수가 아니라 `링크이동 ÷ 노출`로 읽는다(목록 상위 노출 편향 보정).
"""

Text = Annotated[str, Field(max_length=100)]
ProgramId = Annotated[str, Field(pattern=r"^\d{4}-[A-Z]?\d{2}$")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Conditions(Strict):
    신청주체: Literal["전체", "사업주", "근로자"]
    근로자수: int = Field(ge=1, le=99999)
    업종: str = Field(pattern=r"^(전체|[A-U]\d{0,2})$")
    지역: str = Field(max_length=30)
    기업: Literal["모름", "소", "중", "대"]
    유해인자: Literal["Y", "N", "모름"]


class Event(Strict):
    t: int = Field(ge=0, le=7 * 24 * 3600 * 1000)
    행동: Literal[
        "열기", "갈래선택", "범주선택", "검색", "조건변경", "노출", "품목펼침", "링크이동", "0건"
    ]
    사업ID: ProgramId | None = None
    범주: Annotated[str, Field(max_length=40)] | None = None
    순위: int | None = Field(default=None, ge=1, le=1000)
    결과건수: int | None = Field(default=None, ge=0, le=1000)
    검색어: Text | None = None
    목록: list[ProgramId] | None = Field(default=None, max_length=20)
    종류: Literal["official", "apply"] | None = None


class Batch(Strict):
    스키마: Literal[2]
    판본: str = Field(pattern=r"^[a-z]+-[0-9a-f]{10}$")
    세션ID: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}-[a-z0-9]{8,16}$")
    순번: int = Field(ge=1, le=5000)
    시작: datetime
    갱신: datetime
    조건: Conditions
    이벤트: list[Event] = Field(min_length=1, max_length=60)


def nas_root():
    return Path(os.environ.get("NAS_DATA", "/nas"))


def store_dir():
    default = Path(__file__).resolve().parents[2] / "local_asset/support-programs-log"
    return Path(os.environ.get("SUPPORT_PROGRAMS_STORE_DIR", default))


def log_path(day: str, name: str):
    return Path(PROJECT) / "raw" / f"demand-log-{day.replace('-', '')}" / name


def put_new(path: Path, data: bytes):
    """Create path with data; never replace an existing file (link is atomic and exclusive)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp.write_bytes(data)
    try:
        os.link(temp, path)
    except FileExistsError:
        pass
    finally:
        temp.unlink(missing_ok=True)


def archive(day: str, name: str, data: bytes):
    relative = log_path(day, name)
    try:
        if not (nas_root() / "README.md").exists():
            raise OSError("NAS not mounted")
        target = nas_root() / relative
        if not (target.parent / "MANIFEST.md").exists():
            put_new(target.parent / "MANIFEST.md", RAW_MANIFEST.format(day=day).encode())
        put_new(target, data)
    except OSError:
        put_new(store_dir() / "nas-pending" / relative, data)


_counter_lock = threading.Lock()
_counter = {"day": "", "count": 0}


def admit(day: str):
    with _counter_lock:
        if _counter["day"] != day:
            _counter.update(day=day, count=0)
        if _counter["count"] >= DAILY_BATCHES:
            return False
        _counter["count"] += 1
        return True


def receive(content: bytes, now: datetime | None = None):
    try:
        batch = Batch.model_validate_json(content)
    except ValidationError:
        raise HTTPException(422, "기록 형식을 확인해 주세요.") from None
    now = now or datetime.now(KST)
    day = now.strftime("%Y-%m-%d")
    if not admit(day):
        raise HTTPException(429, "오늘 받을 수 있는 기록을 넘었습니다.")
    record = {
        "받은시각": now.isoformat(timespec="seconds"),
        **batch.model_dump(mode="json", exclude_none=True),
    }
    data = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode()
    try:
        archive(day, f"{batch.세션ID}-{batch.순번:05d}.json", data)
    except OSError:
        raise HTTPException(503, "기록을 저장하지 못했습니다.") from None


def register(app):
    @app.api_route(PREFIX + "/", methods=["GET", "HEAD"])
    def page():
        if not (STATIC / "index.html").is_file():
            raise HTTPException(503, "화면을 준비 중입니다.")
        return FileResponse(STATIC / "index.html")

    @app.get(PREFIX + "/api/catalogue")
    def read():
        try:
            return catalogue()
        except (OSError, ValueError):
            raise HTTPException(
                503, "자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
            ) from None

    @app.post(PREFIX + "/api/log", status_code=204)
    async def post_log(request: Request):
        # sendBeacon sends text/plain to avoid a CORS preflight; the body is still JSON.
        if request.headers.get("content-type", "").split(";")[0] != "text/plain":
            raise HTTPException(415, "text/plain 요청이 필요합니다.")
        content = b""
        async for chunk in request.stream():
            content += chunk
            if len(content) > BODY_LIMIT:
                raise HTTPException(413, "기록이 너무 큽니다.")
        # NAS writes can block (hard NFS mount); keep them off the event loop.
        await run_in_threadpool(receive, content)
        return Response(status_code=204)

    app.mount(
        PREFIX + "/assets",
        StaticFiles(directory=STATIC / "assets", check_dir=False),
        name="osh-support-programs-assets",
    )
