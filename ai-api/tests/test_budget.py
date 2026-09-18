from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

from app import budget


@pytest.fixture(autouse=True)
def isolated_budget(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    monkeypatch.setattr(budget, "day", lambda: "2026-09-18")


def amount():
    with budget.database() as db:
        return budget.used(db, budget.day())


def test_concurrent_reservations_cannot_overspend():
    def attempt(_):
        try:
            return budget.reserve("DEMO", 1000)
        except HTTPException as error:
            assert error.status_code == 429
            return None

    with ThreadPoolExecutor(max_workers=12) as pool:
        tokens = list(pool.map(attempt, range(24)))
    assert sum(token is not None for token in tokens) == 8
    assert amount() == 8000


def test_settlement_is_idempotent_and_persistent():
    token = budget.reserve("DEMO", 1200)
    budget.settle(token, 33)
    budget.settle(token, 0)
    assert amount() == 33
    assert budget.voice_cost({"input_tokens": 32000, "output_tokens": 512}) < 1200


def test_unknown_usage_survives_midnight_and_late_usage_counts_both_days(monkeypatch):
    token = budget.reserve("DEMO", 1200)
    monkeypatch.setattr(budget, "day", lambda: "2026-09-19")
    assert amount() == 1200
    budget.settle(token, 25)
    assert amount() == 25
    monkeypatch.setattr(budget, "day", lambda: "2026-09-18")
    assert amount() == 25
    monkeypatch.setattr(budget, "day", lambda: "2026-09-20")
    assert amount() == 0


def test_unexpected_price_overrun_freezes_paid_calls():
    token = budget.reserve("DEMO", 5)
    budget.settle(token, 6)
    with pytest.raises(HTTPException) as error:
        budget.reserve("DEMO", 1)
    assert error.value.status_code == 503


def test_missing_or_negative_usage_cannot_refund():
    token = budget.reserve("DEMO", 1200)
    with pytest.raises(ValueError):
        budget.voice_cost({"input_tokens": -1, "output_tokens": 10})
    with pytest.raises(ValueError):
        budget.settle(token, -1)
    assert amount() == 1200
