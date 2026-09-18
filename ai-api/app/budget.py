"""Durable, shared spending guard. Reservations precede every paid request.

Amounts are conservative KRW estimates, not provider invoices. Unknown charges
remain reserved across restarts and midnight until manually reconciled.
"""

import math
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]
DAILY_LIMIT = 8000
KRW_PER_USD = 3000  # Deliberate FX/tax cushion, not a live exchange rate.
VOICE_RESERVE = 1200


def day():
    return datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()


@contextmanager
def database():
    path = Path(os.environ.get("AI_BUDGET_DB", ROOT / "local_asset/ai-budget.sqlite"))
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    try:
        path.chmod(0o600)
        db.execute("""CREATE TABLE IF NOT EXISTS charges (
            id TEXT PRIMARY KEY, provider TEXT NOT NULL, started TEXT NOT NULL,
            finished TEXT, amount INTEGER NOT NULL, reserved INTEGER NOT NULL)""")
        db.execute("CREATE TABLE IF NOT EXISTS guard (id INTEGER PRIMARY KEY, frozen INTEGER)")
        db.execute("INSERT OR IGNORE INTO guard VALUES (1, 0)")
        db.commit()
        db.execute("BEGIN IMMEDIATE")
        yield db
        db.commit()
    except (sqlite3.Error, OSError):
        db.rollback()
        raise HTTPException(503, "사용량을 확인할 수 없어 AI 요청을 중단했습니다.") from None
    finally:
        db.close()


def used(db, today):
    # Both days count a request crossing midnight. Uncertain charges never expire.
    return db.execute(
        "SELECT COALESCE(SUM(amount),0) FROM charges "
        "WHERE started=? OR finished=? OR finished IS NULL",
        (today, today),
    ).fetchone()[0]


def reserve(provider: str, amount: int):
    if amount <= 0:
        raise ValueError("Positive reservation required")
    with database() as db:
        today = day()
        if db.execute("SELECT frozen FROM guard WHERE id=1").fetchone()[0]:
            raise HTTPException(503, "AI 사용량 점검 중입니다. 일반 검색을 이용해 주세요.")
        if used(db, today) + amount > DAILY_LIMIT:
            raise HTTPException(
                429, "오늘의 AI 이용 한도에 도달했습니다. 일반 검색은 계속 이용할 수 있습니다."
            )
        token = uuid.uuid4().hex
        db.execute(
            "INSERT INTO charges VALUES (?,?,?,NULL,?,?)", (token, provider, today, amount, amount)
        )
    return token


def settle(token: str, amount: int):
    if not isinstance(amount, int) or amount < 0:
        raise ValueError("Invalid usage")
    with database() as db:
        row = db.execute("SELECT reserved,finished FROM charges WHERE id=?", (token,)).fetchone()
        if row is None or row[1] is not None:
            return  # Idempotent; an already settled request can never refund twice.
        if amount > row[0]:
            db.execute("UPDATE guard SET frozen=1 WHERE id=1")
        db.execute("UPDATE charges SET amount=?,finished=? WHERE id=?", (amount, day(), token))


def voice_cost(usage):
    # Charge all tokens at the more expensive audio rates; ignore cache discounts.
    # No input transcription, web search, images, or other billable tools enabled.
    incoming, outgoing = usage["input_tokens"], usage["output_tokens"]
    if type(incoming) is not int or type(outgoing) is not int or min(incoming, outgoing) < 0:
        raise ValueError("Invalid usage")
    return max(1, math.ceil((incoming * 10 + outgoing * 20) * KRW_PER_USD / 1_000_000))
