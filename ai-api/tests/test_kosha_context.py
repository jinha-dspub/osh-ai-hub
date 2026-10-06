import json

import pytest
from fastapi.testclient import TestClient

from app import kosha_context as kc
from app import kosha_graphrag as kg
from app.demo_gateway import app
from tests.test_kosha_graphrag import CHUNKS, LAW, write_release

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user"}
POST = {**HEADERS, "Origin": "https://osh.ai.kr", "Content-Type": "application/json"}
CONTEXT = kg.PREFIX + "/api/context"


def write_graph(folder):
    folder.mkdir(parents=True)
    nodes = [
        {
            "id": "n1",
            "name": "비계",
            "type": "설비",
            "aliases": ["아시바"],
            "descriptions": [],
            "chunk_ids": [CHUNKS[0]["chunk_id"]],
            "document_ids": [],
            "stages": ["stage1"],
            "mentions": 3,
            "degree": 2,
        },
        {
            "id": "n2",
            "name": "안전난간 설치",
            "type": "예방조치",
            "aliases": [],
            "descriptions": [{"text": "DEMO", "chunk_id": CHUNKS[0]["chunk_id"]}],
            "chunk_ids": [CHUNKS[0]["chunk_id"]],
            "document_ids": [],
            "stages": ["stage2"],
            "mentions": 1,
            "degree": 1,
        },
        {
            "id": "n3",
            "name": "추락",
            "type": "위험요인",
            "aliases": [],
            "descriptions": [],
            "chunk_ids": [],
            "document_ids": [],
            "stages": ["stage1-cache"],
            "mentions": 1,
            "degree": 1,
        },
    ]
    edges = [
        {
            "source": "n1",
            "target": "n2",
            "type": "예방조치",
            "label": "예방조치",
            "descriptions": [],
            "evidence": [
                {"quote": "안전난간을 설치하여야 한다", "chunk_id": CHUNKS[0]["chunk_id"]}
            ],
            "chunk_ids": [CHUNKS[0]["chunk_id"]],
            "document_ids": [],
            "stages": ["stage2"],
            "weight": 1,
        },
        {
            "source": "n1",
            "target": "n3",
            "type": "기타",
            "label": "유발한다",
            "descriptions": [],
            "evidence": [],
            "chunk_ids": [],
            "document_ids": [],
            "stages": ["stage1-cache"],
            "weight": 2,
        },
    ]
    communities = [
        {
            "id": "c0-0000",
            "level": 0,
            "parent": None,
            "size": 3,
            "edges": 2,
            "node_ids": ["n1", "n2", "n3"],
            "top_documents": [],
            "domains": {},
            "children": [],
        }
    ]
    reports = [
        {
            "community_id": "c0-0000",
            "level": 0,
            "size": 3,
            "title": "비계 작업의 추락 방지",
            "summary": "DEMO 요약",
            "findings": [
                {
                    "text": "비계에는 안전난간을 설치한다.",
                    "chunk_ids": [CHUNKS[0]["chunk_id"]],
                    "evidence": ["E1"],
                }
            ],
            "keywords": ["비계", "안전난간"],
            "importance": 7,
            "evidence": [],
            "top_documents": [],
        }
    ]
    for name, rows in [
        ("nodes", nodes),
        ("edges", edges),
        ("communities", communities),
        ("reports", reports),
    ]:
        (folder / f"{name}.jsonl").write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8"
        )


@pytest.fixture
def world(tmp_path, monkeypatch):
    # The graph folder sits outside the pinned release so the release digest stays valid.
    (tmp_path / "release").mkdir()
    monkeypatch.setattr(kg, "ROOT", tmp_path / "release")
    monkeypatch.setattr(kg, "DIGEST", write_release(tmp_path / "release"))
    write_graph(tmp_path / "graph-test")
    monkeypatch.setattr(kc, "GRAPH", tmp_path / "graph-test")
    monkeypatch.setenv("AI_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    monkeypatch.setattr(kg, "_counts", {})
    kg.verify.cache_clear()
    kg.index.cache_clear()
    kc.knowledge.cache_clear()
    yield tmp_path
    kg.verify.cache_clear()
    kg.index.cache_clear()
    kc.knowledge.cache_clear()


def client():
    return TestClient(app, client=("192.168.0.3", 1234))


def test_status_counts_graph(world):
    got = client().get(CONTEXT + "/status", headers=HEADERS).json()
    assert (
        got["nodes"] == 3 and got["edges"] == 2 and got["stage2_edges"] == 1 and got["reports"] == 1
    )


def test_context_search_grounds_answer_in_graph_material(world, monkeypatch):
    seen = {}
    monkeypatch.setattr(
        kc,
        "understand",
        lambda q: (
            {
                "concepts": [
                    {"name": "아시바", "type": "설비"},
                    {"name": "안전난간", "type": "예방조치"},
                ],
                "terms": ["비계", "안전난간"],
                "scope": "specific",
            },
            10,
        ),
    )

    def fake_answer(question, material_text):
        seen["material"] = material_text
        return (
            {
                "statements": [
                    {"text": "비계에는 안전난간을 설치한다.", "cites": ["R1", "G1"]},
                    {"text": "커뮤니티 요약.", "cites": ["C1"]},
                    {"text": "근거 없음.", "cites": ["R9"]},
                ],
                "insufficient": False,
                "note": "",
            },
            60,
        )

    monkeypatch.setattr(kc, "answer_call", fake_answer)
    got = client().post(CONTEXT, json={"질문": "아시바 위에서 작업할 때 난간은?"}, headers=POST)
    assert got.status_code == 200, got.text
    body = got.json()
    assert [n["name"] for n in body["nodes"]][:2] == [
        "비계",
        "안전난간 설치",
    ]  # alias 아시바 → 비계
    assert body["edges"][0]["evidence"][0]["quote"] == "안전난간을 설치하여야 한다"
    assert body["reports"][0]["title"] == "비계 작업의 추락 방지"
    assert body["chunks"][0]["chunk_id"] == CHUNKS[0]["chunk_id"]
    assert body["laws"][0]["key"] == LAW
    assert "[C1] 커뮤니티 보고서: 비계 작업의 추락 방지" in seen["material"]
    assert "[R1] 비계 --예방조치--> 안전난간 설치" in seen["material"]
    assert (
        "[G1] KOSHA GUIDE D-DEMO-1" in seen["material"]
        and "[L1] 산업안전보건기준" in seen["material"]
    )
    answer = body["answer"]
    assert [s["cites"] for s in answer["statements"]] == [["R1", "G1"], ["C1"]] and answer[
        "dropped"
    ] == 1
    assert answer["sources"]["R1"]["chunk_id"] == CHUNKS[0]["chunk_id"]


def test_context_search_without_graph_is_503(world, monkeypatch):
    monkeypatch.setattr(kc, "GRAPH", world / "nowhere")
    kc.knowledge.cache_clear()
    assert client().get(CONTEXT + "/status", headers=HEADERS).status_code == 503
    assert (
        client().post(CONTEXT, json={"질문": "비계 작업 난간은?"}, headers=POST).status_code == 503
    )


@pytest.mark.parametrize(
    "headers, content, status",
    [
        (POST, json.dumps({"질문": "짧다"}), 422),
        (POST, json.dumps({"질문": "x" * 401}), 422),
        ({**POST, "Content-Type": "text/plain"}, "질문입니다 질문", 415),
        (
            {**HEADERS, "Content-Type": "application/json"},
            json.dumps({"질문": "비계 작업 난간은?"}),
            403,
        ),
    ],
)
def test_bad_requests_never_reach_claude(world, monkeypatch, headers, content, status):
    monkeypatch.setattr(kc, "understand", lambda q: (_ for _ in ()).throw(AssertionError("called")))
    assert client().post(CONTEXT, content=content, headers=headers).status_code == status


def test_daily_cap_stops_before_claude(world, monkeypatch):
    monkeypatch.setenv("KOSHA_GRAPHRAG_AI_DAILY_KRW", str(kc.RESERVE - 1))
    monkeypatch.setattr(kc, "understand", lambda q: (_ for _ in ()).throw(AssertionError("called")))
    assert (
        client().post(CONTEXT, json={"질문": "비계 작업 난간은?"}, headers=POST).status_code == 429
    )
