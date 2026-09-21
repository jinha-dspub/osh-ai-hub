import csv
import json
import sqlite3

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import sanje, storage
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user", "Origin": "https://osh.ai.kr"}


@pytest.fixture
def release(tmp_path, monkeypatch):
    source = tmp_path / "source"
    source.mkdir()
    summaries = []
    for group in ["copd", "cardio"]:
        folder = source / group
        folder.mkdir()
        rows = [
            {
                "accnum": f"DEMO-{group}-A",
                "src_claim_year": "2015",
                "src_approval_status": "인정",
                "raw_occupation": "DEMO 작업",
                "ai_occupation_std": "DEMO 광원",
                "ai_hazards": "DEMO 분진",
                "ai_summary": "DEMO 요약",
                "qa_approval_mismatch": "false",
                "n_measurements": "0",
            },
            {
                "accnum": f"DEMO-{group}-B",
                "src_claim_year": "2017",
                "src_approval_status": "불인정",
                "raw_occupation": "DEMO 용접",
                "ai_occupation_std": "DEMO 용접원",
                "ai_hazards": "DEMO 흄",
                "ai_summary": "DEMO 요약",
                "qa_approval_mismatch": "true",
                "n_measurements": "0",
            },
        ]
        files = [
            ("cases.csv", list(rows[0]), rows),
            (
                "case_texts.csv",
                ["accnum", "src_full_text"],
                [{"accnum": r["accnum"], "src_full_text": "DEMO 원문 분진"} for r in rows],
            ),
            ("exposure_measurements.csv", ["accnum", "raw_value"], []),
            ("worktime.csv", ["accnum"], []),
            ("worktime_records.csv", ["id", "accnum"], []),
        ]
        for name, fields, contents in files:
            with (folder / name).open("w", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=fields)
                writer.writeheader()
                writer.writerows(contents)
        summaries.append(
            {"id": group, "version": "2026-09-19.v1", "cases": 2, "search_modes": ["keyword"]}
        )
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps({"groups": summaries}))
    index = tmp_path / "labels.sqlite"
    with sqlite3.connect(index) as db:
        db.execute("CREATE TABLE labels (group_id TEXT,accnum TEXT,ordinal INTEGER,data TEXT)")
        for i in range(65):
            db.execute(
                "INSERT INTO labels VALUES (?,?,?,?)",
                (
                    "copd",
                    "DEMO-copd-A",
                    i,
                    json.dumps({"label_id": f"DEMO-{i}", "review_status": "unreviewed"}),
                ),
            )
    manifest = tmp_path / "storage.json"
    manifest.write_text(
        json.dumps(
            {
                "verified": True,
                "version": "2026-09-19.v1",
                "project": "https://demo.supabase.co",
                "bucket": "sanje-research",
                "groups": {
                    g: [
                        {
                            "id": "source",
                            "name": "DEMO.zip",
                            "bytes": 12,
                            "sha256": "a" * 64,
                            "object": f"sanje/2026-09-19.v1/{g}/DEMO/source.zip",
                        }
                    ]
                    for g in ["copd", "cardio"]
                },
            }
        )
    )
    config = tmp_path / "release.json"
    config.write_text(
        json.dumps(
            {
                "version": "2026-09-19.v1",
                "source": str(source),
                "catalog": str(catalog),
                "labels_index": str(index),
                "storage_manifest": str(manifest),
            }
        )
    )
    monkeypatch.setenv("SANJE_RELEASE_CONFIG", str(config))
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    monkeypatch.setattr(
        storage,
        "config",
        lambda: {
            "url": "https://demo.supabase.co",
            "secret_key": "sb_secret_DEMO",
            "bucket": "copd-research",
            "prefix": "copd/DEMO",
        },
    )
    sanje._load.cache_clear()
    yield manifest
    sanje._load.cache_clear()


def test_all_disease_routes_keep_gateway_and_origin_boundaries(release):
    direct = TestClient(app, client=("192.168.0.55", 1))
    trusted = TestClient(app, client=("192.168.0.3", 1))
    for group in sanje.GROUPS:
        for suffix in [
            "/",
            "/api?action=info",
            "/api?action=case&id=DEMO",
            "/api?action=labels&id=DEMO",
            "/api?action=files",
        ]:
            assert direct.get("/demo/sanje/" + group + suffix, headers=HEADERS).status_code == 403
            assert trusted.get("/demo/sanje/" + group + suffix).status_code == 403
        assert (
            direct.post(
                f"/demo/sanje/{group}/api?action=download", headers=HEADERS, json={"id": "source"}
            ).status_code
            == 403
        )
    assert (
        trusted.post(
            "/demo/sanje/copd/api?action=search",
            headers={**HEADERS, "Origin": "https://evil.test"},
            json={},
        ).status_code
        == 403
    )
    assert trusted.get("/demo/sanje/unknown/api?action=info", headers=HEADERS).status_code == 404
    assert (
        trusted.post(
            "/demo/sanje/copd/api?action=search", headers=HEADERS, json={"q": "x" * 10000}
        ).status_code
        == 413
    )


def test_versioned_search_multi_select_paging_and_group_isolation(release):
    client = TestClient(app, client=("192.168.0.3", 1))
    info = client.get("/demo/copd/api?action=info", headers=HEADERS).json()
    assert info["version"] == "2026-09-19.v1" and info["cases"] == 2
    for path in ["/demo/copd/api", "/demo/sanje/copd/api"]:
        result = client.post(
            path + "?action=search",
            headers=HEADERS,
            json={"occupation": ["DEMO 광원", "DEMO 용접원"], "year": ["2015", "2017"]},
        )
        assert result.status_code == 200 and result.json()["total"] == 2
        assert (
            client.post(
                path + "?action=search",
                headers=HEADERS,
                json={"occupation": ["DEMO 광원", "DEMO 용접원"], "approval": ["인정"]},
            ).json()["total"]
            == 1
        )
        assert (
            client.post(path + "?action=search", headers=HEADERS, json={"page": 2096}).json()[
                "results"
            ]
            == []
        )
        for body in [
            {"mode": "gemini"},
            {"page": 5001},
            {"occupation": ["x"] * 51},
            {"year": ["junk"]},
            {"object": "../../secret"},
        ]:
            assert (
                client.post(path + "?action=search", headers=HEADERS, json=body).status_code == 422
            )
    assert (
        client.get("/demo/sanje/cardio/api?action=case&id=DEMO-copd-A", headers=HEADERS).status_code
        == 404
    )
    detail = client.get("/demo/sanje/copd/api?action=case&id=DEMO-copd-A", headers=HEADERS).json()
    assert len(detail["standard_labels"]["rows"]) == 50 and detail["standard_labels"]["total"] == 65
    assert (
        len(
            client.get(
                "/demo/sanje/copd/api?action=labels&id=DEMO-copd-A&page=2", headers=HEADERS
            ).json()["rows"]
        )
        == 15
    )
    assert (
        client.get(
            "/demo/sanje/copd/api?action=labels&id=DEMO-copd-A&page=0", headers=HEADERS
        ).status_code
        == 422
    )


def test_signing_is_scoped_to_release_and_disease_and_fails_closed(release, monkeypatch):
    calls = []

    def provider(settings, path, payload=None):
        calls.append((path, payload))
        return (
            {"public": False}
            if path.startswith("bucket/")
            else {"signedURL": "/" + path + "?token=DEMO"}
        )

    monkeypatch.setattr(storage, "storage_request", provider)
    client = TestClient(app, client=("192.168.0.3", 1))
    route = "/demo/sanje/cardio/api?action=download"
    for payload in [{"id": "../source"}, {"id": "source", "object": "secret"}]:
        assert client.post(route, headers=HEADERS, json=payload).status_code == 422
    assert client.post(route, headers=HEADERS, json={"id": "missing"}).status_code == 404
    result = client.post(route, headers=HEADERS, json={"id": "source"}).json()
    assert "/sanje/2026-09-19.v1/cardio/" in result["url"] and result["expires_in"] == 60
    assert calls[-1][1] == {"expiresIn": 60}
    data = json.loads(release.read_text())
    data["groups"]["cardio"][0]["object"] = "sanje/2026-09-19.v1/copd/DEMO/source.zip"
    release.write_text(json.dumps(data))
    assert client.post(route, headers=HEADERS, json={"id": "source"}).status_code == 503
    data["verified"] = False
    release.write_text(json.dumps(data))
    assert client.get("/demo/sanje/cardio/api?action=files", headers=HEADERS).status_code == 503


def test_public_bucket_and_provider_redirect_are_rejected(release, monkeypatch):
    monkeypatch.setattr(storage, "storage_request", lambda *args: {"public": True})
    with pytest.raises(HTTPException) as error:
        sanje.signed_download("copd", storage.DownloadInput(id="source"))
    assert error.value.status_code == 503
    monkeypatch.setattr(
        storage,
        "storage_request",
        lambda _, path, *args: (
            {"public": False}
            if path.startswith("bucket/")
            else {"signedURL": "https://evil.test/token"}
        ),
    )
    with pytest.raises(HTTPException):
        sanje.signed_download("copd", storage.DownloadInput(id="source"))


@pytest.fixture
def hybrid_release(release):
    import hashlib

    import numpy as np

    from app import sanje_search as search

    config_path = sanje.config_path()
    config = json.loads(config_path.read_text())
    target = config_path.parent / "search"
    data = sanje.dataset("copd")
    folder = target / "copd"
    folder.mkdir(parents=True)
    vectors = np.zeros((2, 768), dtype=np.float32)
    vectors[0, 0] = 1
    vectors[1, 1] = 1
    np.save(folder / "vectors.npy", vectors)
    (folder / "ids.json").write_text(json.dumps([r["accnum"] for r in data.rows]))
    manifest = {
        "version": data.summary["version"],
        "group": "copd",
        "cases_sha256": data.fingerprint,
        "model": search.MODEL,
        "digest": search.DIGEST,
        "dimensions": 768,
        "recipe": search.RECIPE,
        "sha256": {
            name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
            for name in ["vectors.npy", "ids.json"]
        },
    }
    (folder / "manifest.json").write_text(json.dumps(manifest))
    config["search_index"] = str(target)
    config_path.write_text(json.dumps(config))
    return folder


def test_natural_query_retrieves_without_literal_match_and_filters_first(
    hybrid_release, monkeypatch
):
    import numpy as np

    from app import sanje_search as search

    calls = []

    def embed(query, digest):
        calls.append(query)
        return np.eye(1, 768, dtype=np.float32)[0]

    monkeypatch.setattr(search, "query_vector", embed)
    client = TestClient(app, client=("192.168.0.3", 1))
    path = "/demo/copd/api?action=search"
    query = "DEMO 땅속에서 오래 일하다 숨쉬기 어려워진 사람"
    exact = client.post(path, headers=HEADERS, json={"q": query, "mode": "keyword"}).json()
    assert exact["total"] == 0 and calls == []
    result = client.post(path, headers=HEADERS, json={"q": query}).json()
    assert result["ranking"] == "hybrid" and result["results"][0]["accnum"] == "DEMO-copd-A"
    filtered = client.post(path, headers=HEADERS, json={"q": query, "year": ["2017"]}).json()
    assert filtered["filtered_total"] == 1 and [r["accnum"] for r in filtered["results"]] == [
        "DEMO-copd-B"
    ]
    before = len(calls)
    assert (
        client.post(path, headers=HEADERS, json={"q": query, "year": ["2000"]}).json()["total"] == 0
    )
    assert client.post(path, headers=HEADERS, json={"q": "  "}).json()["ranking"] == "catalog"
    assert len(calls) == before
    assert client.post(path, headers=HEADERS, json={"q": query, "page": 2}).json()["results"] == []


@pytest.mark.parametrize("field", ["version", "digest", "group", "cases_sha256"])
def test_stale_semantic_index_fails_closed_but_keyword_still_works(hybrid_release, field):
    file = hybrid_release / "manifest.json"
    value = json.loads(file.read_text())
    value[field] = "DEMO-invalid"
    file.write_text(json.dumps(value))
    client = TestClient(app, client=("192.168.0.3", 1))
    path = "/demo/copd/api?action=search"
    response = client.post(path, headers=HEADERS, json={"q": "분진에 노출된 사람"})
    assert response.status_code == 503 and "키워드" in response.json()["error"]
    assert (
        client.post(path, headers=HEADERS, json={"q": "분진", "mode": "keyword"}).status_code == 200
    )


def test_model_failure_is_not_reported_as_success(hybrid_release, monkeypatch):
    from app import sanje_search as search

    def unavailable(*args):
        raise HTTPException(503, "DEMO 모델 연결 실패")

    monkeypatch.setattr(search, "query_vector", unavailable)
    client = TestClient(app, client=("192.168.0.3", 1))
    assert (
        client.post(
            "/demo/copd/api?action=search", headers=HEADERS, json={"q": "DEMO 자연어 질문"}
        ).status_code
        == 503
    )
    direct = TestClient(app, client=("192.168.0.55", 1))
    assert (
        direct.post(
            "/demo/copd/api?action=search", headers=HEADERS, json={"q": "DEMO 자연어 질문"}
        ).status_code
        == 403
    )


def test_hybrid_candidate_limit_and_stable_paging():
    from collections import defaultdict

    import numpy as np

    from app import sanje_search as search

    index = search.HybridIndex.__new__(search.HybridIndex)
    index.vectors = np.tile(np.eye(1, 768, dtype=np.float32), (250, 1))
    index.postings = defaultdict(list)
    index.size = 250
    index.lengths = np.ones(250)
    index.average = 1
    ranked = index.rank("DEMO", list(range(250)), lambda *args: np.eye(1, 768)[0])
    assert ranked == list(range(200))
