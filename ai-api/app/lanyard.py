"""Safety-harness lanyard hook-up analyzer under the shared /demo gateway.

Stage 1 runs the NAS serving release (YOLO pose detector + shape rule) on this
server. Stage 2 is an optional Claude check using the release's service prompt.
The release is read only from serving/current and every file is checked against
pinned hashes before use, because the NAS lets any client rewrite files.
Service writes (run log, consented photos) stay on local disk, never on the NAS.
"""

import hashlib
import io
import json
import math
import os
import re
import sqlite3
import sys
import threading
import time
import types
import urllib.parse
import uuid
from contextlib import contextmanager
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from app import budget, storage

PREFIX = "/demo/lanyard"
ROOT = Path(__file__).resolve().parents[2]
STATIC = Path(__file__).resolve().parents[1] / "static/lanyard"
PROJECT = "보호구체결현황파악"
RELEASE = "lanyard-analyzer-20260930-v1"
# Pinned from the release manifest.json. A new release needs new hashes here.
PINNED = {
    "prompt_service.txt": "e58fb31a190a16f6a07fbf4b67d9fddb7a507eb6ce5de4e8aaa2592ef60cc24f",
    "rule_judge.py": "61be63345720b3dffc2374080043573cb6fb5e0e6ffff1bf6ac8ff085a58223b",
    "weights/e11c_yolo11m_pose_1536_best.pt": (
        "274986f089f979240341e6481864bbbdcd798381b84345f2a3641c2c306e9aa2"
    ),
}
DETECTOR = {"imgsz": 1600, "conf": 0.25}  # manifest detector.setting
LANYARD, HARNESS = 0, 1
MAX_UPLOAD = 4 * 1024 * 1024
# .3 nginx caps every /demo/ request body at 16k, so photos arrive in chunks.
BODY_LIMIT = 16_000
CHUNK_BYTES = 11_000
CHUNK_B64 = 4 * math.ceil(CHUNK_BYTES / 3)
UPLOAD_TTL = 5 * 60
UPLOADS_MAX = 16
MAX_EDGE = 1600
MAX_PIXELS = 40_000_000
VLM_MODEL = "claude-sonnet-5-5"  # manifest vlm_prompt.default_model
VLM_EFFORT = "medium"
VLM_MAX_TOKENS = 8000
USD_PER_MTOK = (2, 10)  # Claude Sonnet 5.5 input/output list price
# Worst case: ~4,800 image + ~700 prompt input tokens and the full output cap.
VLM_RESERVE = math.ceil(
    (5500 * USD_PER_MTOK[0] + VLM_MAX_TOKENS * USD_PER_MTOK[1]) * budget.KRW_PER_USD / 1_000_000
)
PROVIDER = "anthropic-lanyard"
HOOK = {"clipped": "체결", "unclipped": "미체결", "parked": "거치", "unknown": "불명"}
LOCATION = {"fall_risk": "추락 위험 위치", "ground": "바닥", "unknown": "위치 불명"}
PENDING_TTL = 15 * 60
PENDING_MAX = 32
KST = ZoneInfo("Asia/Seoul")


def daily_krw():
    return int(os.environ.get("LANYARD_DAILY_KRW", "3000"))


def per_client_limits():
    return (
        int(os.environ.get("LANYARD_ANALYZE_PER_CLIENT", "30")),
        int(os.environ.get("LANYARD_REVIEW_PER_CLIENT", "10")),
    )


def release_dir():
    return Path(os.environ.get("NAS_DATA", "/nas")) / PROJECT / "serving" / "current"


def store_dir():
    return Path(os.environ.get("LANYARD_STORE_DIR", ROOT / "local_asset/lanyard-runs"))


def today():
    return datetime.now(KST).date().isoformat()


# ---- release loading -------------------------------------------------------


def verified_bytes(name):
    base = release_dir()
    if not (Path(os.environ.get("NAS_DATA", "/nas")) / "README.md").exists():
        raise HTTPException(503, "판정 모델 저장소(NAS)에 연결되지 않았습니다.")
    try:
        if base.resolve().name != RELEASE:
            raise HTTPException(503, "판정 모델 배포본이 바뀌어 확인 중입니다.")
        data = (base / name).read_bytes()
    except OSError:
        raise HTTPException(503, "판정 모델 파일을 읽지 못했습니다.") from None
    if hashlib.sha256(data).hexdigest() != PINNED[name]:
        raise HTTPException(503, "판정 모델 파일 검증에 실패했습니다.")
    return data


@lru_cache(maxsize=1)
def rules():
    code = verified_bytes("rule_judge.py")
    module = types.ModuleType("lanyard_rule_judge")
    module.__file__ = str(release_dir() / "rule_judge.py")
    exec(compile(code, module.__file__, "exec"), module.__dict__)  # noqa: S102 - hash-pinned
    return module


@lru_cache(maxsize=1)
def service_prompt():
    return verified_bytes("prompt_service.txt").decode("utf-8")


detector_lock = threading.Lock()
_detector = None


def detector():
    """Load the verified weights from a local copy so the NAS file cannot change underneath."""
    global _detector
    with detector_lock:
        if _detector is None:
            name = "weights/e11c_yolo11m_pose_1536_best.pt"
            data = verified_bytes(name)
            cache = store_dir() / "model-cache"
            cache.mkdir(mode=0o700, parents=True, exist_ok=True)
            local = cache / f"{PINNED[name]}.pt"
            if not local.exists() or hashlib.sha256(local.read_bytes()).hexdigest() != PINNED[name]:
                temp = local.with_suffix(".tmp")
                temp.write_bytes(data)
                temp.replace(local)
            from ultralytics import YOLO

            _detector = YOLO(str(local), task="pose")
        return _detector


GPU_MIN_FREE = 2 * 1024**3  # YOLO11m-pose at 1600px needs well under this


@lru_cache(maxsize=1)
def device():
    """LANYARD_DEVICE wins (e.g. "0", "cpu"); otherwise the GPU with the most free memory."""
    value = os.environ.get("LANYARD_DEVICE", "auto")
    if value != "auto":
        return value
    try:
        import torch

        if not torch.cuda.is_available():
            return "cpu"
        free = [(torch.cuda.mem_get_info(i)[0], i) for i in range(torch.cuda.device_count())]
    except (ImportError, RuntimeError):
        return "cpu"
    best, index = max(free)
    return str(index) if best >= GPU_MIN_FREE else "cpu"


# ---- image handling --------------------------------------------------------


def load_image(data: bytes):
    from PIL import Image, ImageOps, UnidentifiedImageError

    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in {"JPEG", "PNG", "WEBP"}:
            raise HTTPException(415, "JPG·PNG·WEBP 사진만 판정할 수 있습니다.")
        image = ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise HTTPException(
            415, "사진 파일을 읽을 수 없습니다. JPG·PNG 파일을 선택해 주세요."
        ) from None
    if min(image.size) < 64:
        raise HTTPException(
            422, "사진이 너무 작습니다. 가로·세로 64픽셀 이상 사진을 선택해 주세요."
        )
    if max(image.size) > MAX_EDGE:
        image.thumbnail((MAX_EDGE, MAX_EDGE))
    # Re-encoding drops EXIF (GPS, device) before anything is stored or sent.
    out = io.BytesIO()
    image.save(out, "JPEG", quality=90)
    return image, out.getvalue()


# ---- stage 1: detector + shape rule ----------------------------------------


def pair_harness(start, harnesses):
    """Pick the harness box that holds the lanyard's attachment end (keypoint 0)."""
    best, best_d = None, None
    for box in harnesses:
        x0, y0, x1, y1 = box
        w, h = x1 - x0, y1 - y0
        inside = (
            x0 - 0.2 * w <= start[0] <= x1 + 0.2 * w and y0 - 0.2 * h <= start[1] <= y1 + 0.2 * h
        )
        d = math.hypot(start[0] - (x0 + x1) / 2, start[1] - (y0 + y1) / 2)
        if (inside or d <= 1.5 * math.hypot(w, h)) and (best_d is None or d < best_d):
            best, best_d = box, d
    return best


def judge_detections(lanyards, harnesses):
    rj = rules()
    out = []
    for i, item in enumerate(lanyards):
        polyline = item["polyline"]
        belt = pair_harness(polyline[0], harnesses)
        features = rj.features(polyline, belt)
        label, why = rj.judge_v05(features, polyline, belt)
        out.append(
            {
                "id": i + 1,
                "box": item["box"],
                "conf": item["conf"],
                "polyline": polyline,
                "harness_box": belt,
                "shape": {"label": label, "why": why},
                "final": {"label": label, "source": "shape"},
            }
        )
    return out


def run_detector(image):
    try:
        result = detector().predict(image, verbose=False, device=device(), **DETECTOR)[0]
    except RuntimeError as error:
        # The GPU is shared with other jobs; fall back to CPU for this photo instead of failing.
        if device() == "cpu" or "out of memory" not in str(error).lower():
            raise
        result = detector().predict(image, verbose=False, device="cpu", **DETECTOR)[0]
    lanyards, harnesses = [], []
    if result.boxes is None or not len(result.boxes):
        return lanyards, harnesses
    classes = result.boxes.cls.tolist()
    boxes = result.boxes.xyxy.tolist()
    confs = result.boxes.conf.tolist()
    points = result.keypoints.xy.tolist() if result.keypoints is not None else [None] * len(boxes)
    for cls, box, conf, kp in zip(classes, boxes, confs, points):
        box = [round(v, 1) for v in box]
        if int(cls) == HARNESS:
            harnesses.append(box)
        elif int(cls) == LANYARD and kp and len(kp) == 7:
            lanyards.append(
                {
                    "box": box,
                    "conf": round(conf, 3),
                    "polyline": [[round(x, 1), round(y, 1)] for x, y in kp],
                }
            )
    return dedupe(lanyards), harnesses


DUPLICATE_IOU = 0.5


def iou(a, b):
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def dedupe(lanyards):
    """The pose model can return one lanyard twice with different keypoints (and verdicts).
    Keep the more confident of any pair overlapping by DUPLICATE_IOU or more."""
    kept = []
    for item in sorted(lanyards, key=lambda x: -x["conf"]):
        if all(iou(item["box"], other["box"]) < DUPLICATE_IOU for other in kept):
            kept.append(item)
    return kept


def summary(lanyards):
    counts = {k: 0 for k in ("체결", "미체결", "거치", "불명")}
    for item in lanyards:
        counts[item["final"]["label"]] += 1
    return counts


# ---- stage 2: Claude check -------------------------------------------------


class Worker(BaseModel):
    model_config = ConfigDict(extra="ignore")
    box: list[int] = Field(min_length=4, max_length=4)
    label: str
    location: str
    reason: str = Field(default="", max_length=400)


def parse_workers(text):
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON")
    raw = json.loads(match.group(0)).get("workers")
    if not isinstance(raw, list) or len(raw) > 50:
        raise ValueError("Bad workers")
    workers = []
    for row in raw:
        worker = Worker.model_validate(row)
        if worker.label not in HOOK or worker.location not in LOCATION:
            raise ValueError("Bad label")
        if not all(0 <= v <= 1000 for v in worker.box):
            raise ValueError("Bad box")
        workers.append(worker)
    return workers


def vlm_cost(usage):
    incoming = sum(
        getattr(usage, key, 0) or 0
        for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
    )
    outgoing = usage.output_tokens
    return max(
        1,
        math.ceil(
            (incoming * USD_PER_MTOK[0] + outgoing * USD_PER_MTOK[1])
            * budget.KRW_PER_USD
            / 1_000_000
        ),
    )


def claude_client():
    # Shared key/model settings registered under dever/ (key file stays in local_asset/).
    if str(ROOT / "dever") not in sys.path:
        sys.path.insert(0, str(ROOT / "dever"))
    from claude_client import get_client

    return get_client()


def ask_claude(jpeg: bytes):
    """Returns (workers, usage). Raises HTTPException on failure after settling the charge."""
    import base64

    import anthropic

    token = budget.reserve(PROVIDER, VLM_RESERVE, daily_krw())
    try:
        response = claude_client().messages.create(
            model=VLM_MODEL,
            max_tokens=VLM_MAX_TOKENS,
            output_config={"effort": VLM_EFFORT},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": base64.standard_b64encode(jpeg).decode(),
                            },
                        },
                        {"type": "text", "text": service_prompt()},
                    ],
                }
            ],
        )
    except anthropic.APIStatusError:
        budget.settle(token, 0)  # The API rejected the request; nothing was generated.
        raise HTTPException(
            502, "AI 판정을 지금 이용할 수 없습니다. 1단계 결과를 참고해 주세요."
        ) from None
    except (anthropic.APIError, RuntimeError, OSError):
        # Unknown outcome (timeout, network, missing key): keep the reservation.
        raise HTTPException(503, "AI 판정 서버에 연결하지 못했습니다.") from None
    budget.settle(token, vlm_cost(response.usage))
    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    if response.stop_reason == "refusal":
        raise HTTPException(422, "AI가 이 사진의 판정을 거절했습니다. 1단계 결과를 참고해 주세요.")
    text = "".join(block.text for block in response.content if block.type == "text")
    try:
        return parse_workers(text), usage
    except (ValueError, ValidationError, json.JSONDecodeError):
        raise HTTPException(
            502, "AI 응답 형식을 해석하지 못했습니다. 1단계 결과를 참고해 주세요."
        ) from None


def combine(lanyards, workers, width, height):
    """Shape verdicts stand; only 불명 is resolved by Claude's hook answer (rule judge_chain)."""
    rj = rules()
    boxes = [
        [
            w.box[0] * width / 1000,
            w.box[1] * height / 1000,
            w.box[2] * width / 1000,
            w.box[3] * height / 1000,
        ]
        for w in workers
    ]
    matched = set()
    for item in lanyards:
        x, y = item["polyline"][0]
        hits = [i for i, b in enumerate(boxes) if b[0] <= x <= b[2] and b[1] <= y <= b[3]]
        index = (
            min(hits, key=lambda i: (boxes[i][2] - boxes[i][0]) * (boxes[i][3] - boxes[i][1]))
            if hits
            else None
        )
        worker = workers[index] if index is not None else None
        if index is not None:
            matched.add(index)
        r5 = (
            None
            if worker is None
            else ("structure" if worker.label == "clipped" else "not_structure")
        )
        label, source = rj.judge_chain(item["shape"]["label"], r5)
        item["final"] = {"label": label, "source": source}
        item["worker"] = index + 1 if index is not None else None
    return [
        {
            "id": i + 1,
            "box": [round(v, 1) for v in boxes[i]],
            "hook": HOOK[w.label],
            "location": LOCATION[w.location],
            "fall_risk": w.location == "fall_risk",
            "reason": w.reason,
            "has_lanyard": i in matched,
        }
        for i, w in enumerate(workers)
    ]


# ---- run log (local only) --------------------------------------------------


@contextmanager
def runs_db():
    base = store_dir()
    base.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(base / "runs.sqlite", timeout=10)
    try:
        db.execute(
            """CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY, created TEXT NOT NULL, release TEXT NOT NULL,
            width INTEGER, height INTEGER, image_sha256 TEXT, image_kept INTEGER NOT NULL,
            stage1 TEXT NOT NULL, stage2 TEXT, stage2_status TEXT, usage TEXT)"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS feedback (
            run_id TEXT NOT NULL, created TEXT NOT NULL, verdict TEXT NOT NULL, note TEXT)"""
        )
        yield db
        db.commit()
    except sqlite3.Error:
        db.rollback()
        raise HTTPException(503, "판정 기록을 저장하지 못했습니다.") from None
    finally:
        db.close()


def keep_image(run_id, jpeg):
    folder = store_dir() / "images" / today()
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    (folder / f"{run_id}.jpg").write_bytes(jpeg)


# ---- per-client limits and pending stage-2 images --------------------------

state_lock = threading.Lock()
counters: dict[tuple[str, str, str], int] = {}
pending: dict[str, tuple[float, bytes, str]] = {}
detect_slots = threading.BoundedSemaphore(2)
_salt = os.urandom(16)


def client_key(request: Request):
    # Best effort: the first forwarded hop comes from Vercel/.3; the shared daily cap is the real guard.
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    source = forwarded or (request.client.host if request.client else "")
    return hashlib.sha256(_salt + source.encode()).hexdigest()[:16]


def count(key, kind, limit):
    with state_lock:
        day = today()
        for old in [k for k in counters if k[0] != day]:
            del counters[old]
        slot = (day, key, kind)
        if counters.get(slot, 0) >= limit:
            raise HTTPException(
                429, "오늘 이 기기에서 이용할 수 있는 판정 횟수를 모두 사용했습니다."
            )
        counters[slot] = counters.get(slot, 0) + 1


def remember(run_id, jpeg, key):
    with state_lock:
        now = time.monotonic()
        for old in [k for k, v in pending.items() if v[0] < now]:
            del pending[old]
        while len(pending) >= PENDING_MAX:
            pending.pop(next(iter(pending)))
        pending[run_id] = (now + PENDING_TTL, jpeg, key)


def take(run_id, key):
    with state_lock:
        item = pending.get(run_id)
        if not item or item[0] < time.monotonic() or item[2] != key:
            raise HTTPException(404, "판정 기록이 만료되었습니다. 사진을 다시 올려 주세요.")
        del pending[run_id]  # One Claude check per upload.
        return item[1]


uploads: dict[str, dict] = {}


def upload_start(body, key):
    with state_lock:
        now = time.monotonic()
        for old in [k for k, v in uploads.items() if v["expires"] < now]:
            del uploads[old]
        if len(uploads) >= UPLOADS_MAX:
            raise HTTPException(503, "판정 요청이 많습니다. 잠시 후 다시 시도해 주세요.")
        upload_id = uuid.uuid4().hex
        uploads[upload_id] = {
            "key": key,
            "size": body.size,
            "data": bytearray(),
            "seq": 0,
            "expires": now + UPLOAD_TTL,
        }
    return {"id": upload_id, "chunk_bytes": CHUNK_BYTES}


def own_upload(upload_id, key):
    item = uploads.get(upload_id)
    if not item or item["expires"] < time.monotonic() or item["key"] != key:
        raise HTTPException(404, "업로드가 만료되었습니다. 사진을 다시 올려 주세요.")
    return item


def upload_chunk(body, key):
    import base64
    import binascii

    try:
        chunk = base64.b64decode(body.data, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "사진 조각 형식을 확인해 주세요.") from None
    with state_lock:
        item = own_upload(body.id, key)
        if body.seq < item["seq"]:
            return {"received": len(item["data"])}  # A retried chunk never appends twice.
        if body.seq != item["seq"]:
            raise HTTPException(409, "사진 조각 순서를 확인해 주세요.")
        if not chunk or len(chunk) > CHUNK_BYTES or len(item["data"]) + len(chunk) > item["size"]:
            raise HTTPException(413, "사진 크기가 처음 알린 값과 다릅니다.")
        item["data"].extend(chunk)
        item["seq"] += 1
        return {"received": len(item["data"])}


def upload_finish(upload_id, key):
    with state_lock:
        item = own_upload(upload_id, key)
        if len(item["data"]) != item["size"]:
            raise HTTPException(422, "사진 전송이 끝나지 않았습니다. 다시 올려 주세요.")
        del uploads[upload_id]
    return bytes(item["data"])


# ---- dataset download (private object storage, never proxied) -------------

DATASET_VERSION = "2026-09-30.1"
DATASET_MANIFEST = ROOT / "local_asset/lanyard-storage-manifest.json"


def dataset_settings():
    return {
        **storage.config(),
        "bucket": "lanyard-research",
        "prefix": f"lanyard/{DATASET_VERSION}",
    }


def dataset_manifest():
    try:
        value = json.loads(DATASET_MANIFEST.read_text())
        if (
            value.get("verified") is not True
            or value.get("version") != DATASET_VERSION
            or not value.get("files")
        ):
            raise ValueError("Unverified release")
        return value
    except (OSError, ValueError, TypeError):
        raise HTTPException(503, "데이터셋 파일을 준비 중입니다.") from None


def dataset_files():
    value = dataset_manifest()
    keys = ("id", "name", "bytes", "sha256")
    return {
        "version": DATASET_VERSION,
        "files": [{k: row[k] for k in keys} for row in value["files"]],
    }


def dataset_download(file_id):
    cfg, data = dataset_settings(), dataset_manifest()
    if data.get("project") != cfg["url"] or data.get("bucket") != cfg["bucket"]:
        raise HTTPException(503, "저장소 구성을 확인 중입니다.")
    item = next((r for r in data["files"] if r["id"] == file_id), None)
    if not item:
        raise HTTPException(404, "등록된 파일이 아닙니다.")
    key = item["object"]
    if (
        not key.startswith(cfg["prefix"] + "/")
        or ".." in key
        or not re.fullmatch(r"[A-Za-z0-9/_.-]+", key)
    ):
        raise HTTPException(503, "파일 경로를 확인 중입니다.")
    storage.private_bucket(cfg)
    route = "object/sign/" + cfg["bucket"] + "/" + key
    signed = storage.storage_request(cfg, route, {"expiresIn": 60}).get("signedURL", "")
    if not signed.startswith("/" + route + "?"):
        raise HTTPException(503, "다운로드 주소를 확인 중입니다.")
    name = urllib.parse.quote(item["name"], safe="")
    return {"url": cfg["url"] + "/storage/v1" + signed + "&download=" + name, "expires_in": 60}


# ---- request handlers ------------------------------------------------------


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[0-9a-f]{32}$")


class UploadStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    size: int = Field(ge=1, le=MAX_UPLOAD)


class UploadChunk(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    seq: int = Field(ge=0)
    data: str = Field(min_length=4, max_length=CHUNK_B64)


class Feedback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    verdict: str = Field(pattern=r"^(correct|wrong|unsure)$")
    note: str = Field(default="", max_length=300)


async def read_body(request: Request, limit: int):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > limit:
            raise HTTPException(413, "요청 크기를 초과했습니다.")
    return bytes(raw)


async def json_body(request: Request, model):
    if request.headers.get("content-type", "").split(";")[0] != "application/json":
        raise HTTPException(415, "JSON 요청이 필요합니다.")
    raw = await read_body(request, BODY_LIMIT)
    try:
        return model.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(422, "입력 조건을 확인해 주세요.") from None


def analyze(data: bytes, key: str):
    """Every uploaded photo is kept for research; the page says so before upload."""
    image, jpeg = load_image(data)
    if not detect_slots.acquire(timeout=20):
        raise HTTPException(503, "판정 요청이 많습니다. 잠시 후 다시 시도해 주세요.")
    try:
        raw_lanyards, harnesses = run_detector(image)
    finally:
        detect_slots.release()
    lanyards = judge_detections(raw_lanyards, harnesses)
    run_id = uuid.uuid4().hex
    width, height = image.size
    stage1 = {"lanyards": lanyards, "harnesses": harnesses}
    with runs_db() as db:
        db.execute(
            "INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL)",
            (
                run_id,
                datetime.now(KST).isoformat(timespec="seconds"),
                RELEASE,
                width,
                height,
                hashlib.sha256(jpeg).hexdigest(),
                1,
                json.dumps(stage1, ensure_ascii=False),
            ),
        )
    keep_image(run_id, jpeg)
    remember(run_id, jpeg, key)
    return {
        "id": run_id,
        "release": RELEASE,
        "width": width,
        "height": height,
        "lanyards": lanyards,
        "harnesses": harnesses,
        "summary": summary(lanyards),
    }


def review(run_id: str, key: str):
    jpeg = take(run_id, key)
    with runs_db() as db:
        row = db.execute("SELECT width,height,stage1 FROM runs WHERE id=?", (run_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "판정 기록을 찾을 수 없습니다.")
    width, height, stage1 = row[0], row[1], json.loads(row[2])
    try:
        workers, usage = ask_claude(jpeg)
    except HTTPException as error:
        with runs_db() as db:
            db.execute(
                "UPDATE runs SET stage2_status=? WHERE id=?", (f"error:{error.status_code}", run_id)
            )
        raise
    lanyards = stage1["lanyards"]
    people = combine(lanyards, workers, width, height)
    with runs_db() as db:
        db.execute(
            "UPDATE runs SET stage2=?,stage2_status='ok',usage=? WHERE id=?",
            (
                json.dumps({"workers": people, "lanyards": lanyards}, ensure_ascii=False),
                json.dumps(usage),
                run_id,
            ),
        )
    return {
        "id": run_id,
        "model": VLM_MODEL,
        "workers": people,
        "lanyards": lanyards,
        "summary": summary(lanyards),
    }


def status():
    try:
        rules()
        service_prompt()
        ready = True
    except HTTPException:
        ready = False
    return {
        "release": RELEASE,
        "ready": ready,
        "vlm_model": VLM_MODEL,
        "max_upload_mb": MAX_UPLOAD // (1024 * 1024),
        "max_edge": MAX_EDGE,
    }


def register(app):
    @app.api_route(PREFIX + "/", methods=["GET", "HEAD"])
    def page():
        if not (STATIC / "index.html").is_file():
            raise HTTPException(503, "화면을 준비 중입니다.")
        return FileResponse(STATIC / "index.html")

    @app.get(PREFIX + "/api/status")
    def read_status():
        return status()

    @app.post(PREFIX + "/api/upload/start")
    async def post_upload_start(request: Request):
        body = await json_body(request, UploadStart)
        key = client_key(request)
        count(key, "analyze", per_client_limits()[0])
        return upload_start(body, key)

    @app.post(PREFIX + "/api/upload/chunk")
    async def post_upload_chunk(request: Request):
        return upload_chunk(await json_body(request, UploadChunk), client_key(request))

    @app.post(PREFIX + "/api/upload/finish")
    async def post_upload_finish(request: Request):
        body = await json_body(request, Review)
        key = client_key(request)
        data = upload_finish(body.id, key)
        return await run_in_threadpool(analyze, data, key)

    @app.get(PREFIX + "/api/files")
    def read_files():
        return dataset_files()

    @app.post(PREFIX + "/api/download")
    async def post_download(request: Request):
        body = await json_body(request, storage.DownloadInput)
        return await run_in_threadpool(dataset_download, body.id)

    @app.post(PREFIX + "/api/review")
    async def post_review(request: Request):
        body = await json_body(request, Review)
        key = client_key(request)
        count(key, "review", per_client_limits()[1])
        return await run_in_threadpool(review, body.id, key)

    @app.post(PREFIX + "/api/feedback")
    async def post_feedback(request: Request):
        body = await json_body(request, Feedback)
        with runs_db() as db:
            if not db.execute("SELECT 1 FROM runs WHERE id=?", (body.id,)).fetchone():
                raise HTTPException(404, "판정 기록을 찾을 수 없습니다.")
            if (
                db.execute("SELECT COUNT(*) FROM feedback WHERE run_id=?", (body.id,)).fetchone()[0]
                >= 3
            ):
                raise HTTPException(429, "이 판정에는 의견을 더 남길 수 없습니다.")
            db.execute(
                "INSERT INTO feedback VALUES (?,?,?,?)",
                (
                    body.id,
                    datetime.now(KST).isoformat(timespec="seconds"),
                    body.verdict,
                    body.note.strip(),
                ),
            )
        return {"ok": True}

    app.mount(
        PREFIX + "/assets",
        StaticFiles(directory=STATIC / "assets", check_dir=False),
        name="lanyard-assets",
    )
