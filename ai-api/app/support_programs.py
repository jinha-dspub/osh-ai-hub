"""Safety and health support programme finder and its demand log, under the /demo gateway.

The requirement table is real but its reuse terms are unconfirmed, so rows are served from
the gateway API and never bundled into the public web build. Release v2 adds the Hub's nine
support categories (categories.csv) next to the package tables, which stay unchanged. What visitors pick (branches,
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
RELEASE = "20261001-v3"
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
    "분류": (
        "2_자료/data/categories.csv",
        "7f33842e647874edc20d7b3003828782df5f79b3a150d09657fafb952ce7bd66",
    ),
}
CATEGORY_TABLE = TABLES["분류"][0]
# The downloadable Hub dataset (web/scripts/build-support-programs-dataset.mjs) and its zip,
# shipped in serving v3 under 6_허브판/. Only these files are served, pinned as one set:
# sha256 of "\n".join(sorted(f"{path}\t{sha256}")) with paths relative to 6_허브판/.
DATASET_DIR = "6_허브판"
DATASET = "osh-support-programs-0.7-hub.1"
DATASET_DIGEST = "e603404df9997033d9c13c1c01ab9e7420d312051595d445fe4af4bf29c151eb"
CATEGORY_COLUMNS = ["사업ID", "분류", "원_지원범주"]
# Hub categories (scripts/build_support_programs_categories.py). The notes are shown on the
# category buttons and given to Claude, so both read the same meaning.
CATEGORY_NOTES = {
    "설비개선": "위험한 기계·설비 교체, 방호장치, 추락방지 등 안전시설 설치·개선 비용",
    "환경개선": "환기장치, 온열질환 예방, 냉방, 휴게시설 등 작업환경 개선",
    "장비지원": "스마트 안전장비·감지기·보호구 구입비 지원이나 무상 대여·설치",
    "컨설팅": "위험성평가, 안전보건관리체계 구축, 화학물질 관리 컨설팅",
    "점검·기술지도": "전문가가 현장을 찾아가 위험요인을 점검하고 기술지도",
    "측정·검진": "작업환경측정, 특수·배치전 건강진단, 국소배기 성능평가 비용",
    "교육": "VR·현장 안전교육, 외국인·현장실습생 교육",
    "보험료·감면·인증": "산재·안전보험료 지원, 산재보험요율 인하, 세액공제, 위험성평가 인정",
    "건강상담·산재복귀": "근로자 건강·심리 상담, 노동 상담, 산재근로자 직장복귀·재활·생활 지원",
}
CATEGORIES = list(CATEGORY_NOTES)
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
    "분류": CATEGORY_COLUMNS,
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
    of = {r["사업ID"]: r["분류"] for r in data.pop("분류")}
    for row in data["사업"]:
        category = of.get(row["사업ID"])
        if category not in CATEGORY_NOTES:
            raise ValueError(f"{row['사업ID']} has no Hub category")
        row["분류"] = category
    return {
        "version": VERSION,
        "version_date": VERSION_DATE,
        "release": RELEASE,
        "분류": [{"이름": k, "설명": v} for k, v in CATEGORY_NOTES.items()],
        **data,
    }


@lru_cache(maxsize=1)
def dataset_files():
    """{download name: bytes}: the zip by its own name, dataset files by their path inside it."""
    base = ROOT / DATASET_DIR
    found = {}
    for path in sorted(base.rglob("*")):
        if path.is_file():
            found[path.relative_to(base).as_posix()] = path.read_bytes()
    listing = "\n".join(
        sorted(f"{name}\t{hashlib.sha256(data).hexdigest()}" for name, data in found.items())
    )
    if hashlib.sha256(listing.encode()).hexdigest() != DATASET_DIGEST:
        raise ValueError("dataset does not match the pinned release")
    files = {f"{DATASET}.zip": found[f"{DATASET}.zip"]}
    for name, data in found.items():
        if name.startswith(DATASET + "/"):
            files[name.removeprefix(DATASET + "/")] = data
    return files


def jsonl_programs():
    return [json.loads(line) for line in dataset_files()["data/programs.jsonl"].splitlines()]


DOWNLOAD_TYPES = {
    ".zip": "application/zip",
    ".csv": "text/csv; charset=utf-8",
    ".jsonl": "application/x-ndjson; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}


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
- AI 조건 채우기: `<세션ID>-ai-<요청ID>.json` 1개 = 요청 1건. 방문자가 직접 쓴 사업장 설명 원문
  (전화번호·이메일·사업자번호는 서버가 가림)과 Claude 제안·검증 결과. 설명은 Anthropic API로 보냄.
  화면이 보내기 전에 알리며, 이 파일은 묶음 파일과 형식이 다르다.
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


Category = Literal[tuple(CATEGORIES)]
Way = Literal["보조금·비용지원", "융자", "무료 서비스", "보험료·세금 혜택"]
FormField = Literal[
    "신청주체", "근로자수", "업종", "지역", "기업", "유해인자", "분류", "키워드", "관련사업"
]


class Event(Strict):
    t: int = Field(ge=0, le=7 * 24 * 3600 * 1000)
    # 갈래선택·범주선택 are schema 2 (before 2026-10-01 v2); the rest of 분류…AI수정 are schema 3.
    행동: Literal[
        "열기",
        "갈래선택",
        "범주선택",
        "분류선택",
        "분류해제",
        "받는방식선택",
        "받는방식해제",
        "검색",
        "조건변경",
        "노출",
        "품목펼침",
        "링크이동",
        "0건",
        "AI제안",
        "AI적용",
        "AI수정",
    ]
    사업ID: ProgramId | None = None
    범주: Annotated[str, Field(max_length=40)] | None = None
    분류: list[Category] | None = Field(default=None, max_length=len(CATEGORIES))
    받는방식: list[Way] | None = Field(default=None, max_length=4)
    항목: list[FormField] | None = Field(default=None, max_length=8)
    요청ID: str | None = Field(default=None, pattern=r"^[0-9a-f]{12}$")
    순위: int | None = Field(default=None, ge=1, le=1000)
    결과건수: int | None = Field(default=None, ge=0, le=1000)
    검색어: Text | None = None
    목록: list[ProgramId] | None = Field(default=None, max_length=20)
    종류: Literal["official", "apply"] | None = None


class Batch(Strict):
    스키마: Literal[2, 3]
    판본: str = Field(pattern=r"^[a-z]+-[0-9a-f]{10}$")
    자료판: str | None = Field(default=None, pattern=r"^\d{8}-v\d+$")
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


AI_MANIFEST = """# MANIFEST-AI
- 이 폴더의 `<세션ID>-ai-<요청ID>.json`은 AI 조건 채우기 요청 기록이다(MANIFEST.md의 묶음과 다른 형식).
- 방문자가 직접 쓴 사업장 설명 원문(전화번호·이메일·사업자번호는 서버가 가림), Claude 원응답과
  검증 뒤 제안, 토큰 수. 설명은 Anthropic API로 보냈고 화면이 보내기 전에 알렸다.
- 외부 공유 전 연구책임자 확인 필요. 설명에 사업장명 등이 남아 있을 수 있다.
"""


def archive(day: str, name: str, data: bytes):
    relative = log_path(day, name)
    try:
        if not (nas_root() / "README.md").exists():
            raise OSError("NAS not mounted")
        target = nas_root() / relative
        if not (target.parent / "MANIFEST.md").exists():
            put_new(target.parent / "MANIFEST.md", RAW_MANIFEST.format(day=day).encode())
        if "-ai-" in name and not (target.parent / "MANIFEST-AI.md").exists():
            put_new(target.parent / "MANIFEST-AI.md", AI_MANIFEST.encode())
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
    from app import support_programs_ai

    support_programs_ai.register(app)

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

    @app.api_route(PREFIX + "/download/{name:path}", methods=["GET", "HEAD"])
    def download(name: str, request: Request):
        try:
            files = dataset_files()
        except (OSError, ValueError, KeyError):
            raise HTTPException(503, "데이터셋을 불러오지 못했습니다.") from None
        if name not in files:
            raise HTTPException(404, "없는 파일입니다.")
        filename = name.rsplit("/", 1)[-1]
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        media = DOWNLOAD_TYPES.get(Path(name).suffix, "application/octet-stream")
        if request.method == "HEAD":
            headers["Content-Length"] = str(len(files[name]))
            return Response(status_code=200, headers=headers, media_type=media)
        return Response(files[name], headers=headers, media_type=media)

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
