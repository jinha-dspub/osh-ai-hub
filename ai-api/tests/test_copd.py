import csv
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient

from app import copd
from app.main import app

TOKEN = "DEMO-test-only-" * 4


@pytest.fixture
def data(tmp_path):
    fields = [
        "accnum",
        "src_claim_year",
        "src_approval_status",
        "raw_occupation",
        "ai_occupation_std",
        "ai_hazards",
        "ai_summary",
        "qa_approval_mismatch",
        "n_measurements",
    ]
    rows = [
        [
            "DEMO-A",
            "2016",
            "인정",
            "DEMO 광업",
            "DEMO 광원",
            "DEMO 분진",
            "DEMO 요약 A",
            "false",
            "1",
        ],
        [
            "DEMO-B",
            "2017",
            "불인정",
            "DEMO 용접",
            "DEMO 용접원",
            "DEMO 흄",
            "DEMO 요약 B",
            "true",
            "0",
        ],
        ["DEMO-C", "2018", "일부인정", "DEMO 석재", "", "DEMO 분진", "DEMO 요약 C", "", "0"],
    ]
    for name, cols, records in [
        ("cases.csv", fields, rows),
        (
            "case_texts.csv",
            ["accnum", "src_full_text"],
            [
                ["DEMO-A", "DEMO 원문 A 분진"],
                ["DEMO-B", "DEMO 원문 B 흄"],
                ["DEMO-C", "DEMO 원문 C"],
            ],
        ),
        ("exposure_measurements.csv", ["accnum", "raw_value"], [["DEMO-A", "DEMO 측정"]]),
    ]:
        with (tmp_path / name).open("w", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(cols)
            writer.writerows(records)
    return copd.Dataset(tmp_path)


def test_keyword_filters_and_measurements(data):
    result = data.search(copd.SearchInput(q="분진"))
    assert {r["accnum"] for r in result["results"]} == {"DEMO-A", "DEMO-C"}
    assert data.search(copd.SearchInput(q="분진", approval="불인정"))["total"] == 0
    assert data.search(copd.SearchInput(qa="unverified"))["results"][0]["accnum"] == "DEMO-C"
    assert data.info()["qa"] == {"matched": 1, "mismatch": 1, "unverified": 1}
    assert data.info()["measured_cases"] == 1
    assert data.search(copd.SearchInput(page=2))["results"] == []


def test_embeddings_join_by_key_and_never_by_row_position(data):
    (data.root / "demo").mkdir()
    vectors = np.eye(3, 768).tolist()
    pq.write_table(
        pa.table({"accnum": ["DEMO-C", "DEMO-A", "DEMO-B"], "embedding_local": vectors}),
        data.root / "demo/embeddings.parquet",
    )
    matrix = data.matrix("local")
    assert matrix[0, 1] == 1  # A is second in parquet, first in CSV
    result = data.search(
        copd.SearchInput(q="DEMO", mode="local", approval="인정"), lambda mode, q: vectors[1]
    )
    assert [r["accnum"] for r in result["results"]] == ["DEMO-A"]
    with pytest.raises(ValueError):
        data.search(copd.SearchInput(q="DEMO", mode="local"), lambda mode, q: [1, 2])


def test_orphan_data_is_rejected(data):
    with (data.root / "case_texts.csv").open("a") as file:
        file.write("DEMO-orphan,DEMO\n")
    with pytest.raises(ValueError):
        copd.Dataset(data.root)


def test_token_gate_precedes_data_access_and_validates_input(data, monkeypatch):
    monkeypatch.setenv("COPD_API_TOKEN", TOKEN)
    monkeypatch.setattr(copd, "dataset", lambda: data)
    client = TestClient(app)
    assert client.get("/copd/info").status_code == 401
    assert client.get("/copd/cases/DEMO-A").status_code == 401
    headers = {"Authorization": "Bearer " + TOKEN}
    assert client.get("/copd/info", headers=headers).json()["cases"] == 3
    assert client.get("/copd/cases/DEMO-A", headers=headers).json()["text"] == "DEMO 원문 A 분진"
    assert client.get("/copd/cases/DEMO-unknown", headers=headers).status_code == 404
    for body in [
        {"q": "a" * 301},
        {"mode": "arbitrary"},
        {"page": -1},
        {"approval": "all"},
        {"year": "1900"},
        {"token": "injected"},
    ]:
        assert client.post("/copd/search", headers=headers, json=body).status_code == 422
    monkeypatch.delenv("COPD_API_TOKEN")
    assert client.get("/copd/info", headers=headers).status_code == 503


def test_provider_errors_do_not_expose_credentials(data, monkeypatch):
    monkeypatch.setenv("COPD_API_TOKEN", TOKEN)
    monkeypatch.setattr(copd, "dataset", lambda: data)

    def failure(*args):
        raise RuntimeError("DEMO-secret-never-return")

    monkeypatch.setattr(copd, "embed", failure)
    result = TestClient(app).post(
        "/copd/search",
        headers={"Authorization": "Bearer " + TOKEN},
        json={"q": "분진", "mode": "gemini"},
    )
    assert result.status_code == 503
    assert "DEMO-secret" not in result.text


def test_quota_is_durable_and_limited(tmp_path, monkeypatch):
    monkeypatch.setattr(copd, "ROOT", Path(tmp_path))
    for _ in range(200):
        copd.spend()
    with pytest.raises(copd.HTTPException) as error:
        copd.spend()
    assert error.value.status_code == 429
