import hashlib
import json
import sqlite3
from collections import Counter, defaultdict

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import kosha_graphrag as kg
from app import support_programs_ai as shared
from app.demo_gateway import app

HEADERS = {"X-OSH-Authenticated-User": "DEMO-user"}
POST = {**HEADERS, "Origin": "https://osh.ai.kr", "Content-Type": "application/json"}
SEARCH = kg.PREFIX + "/api/search"
ANSWER = kg.PREFIX + "/api/answer"

# DEMO corpus: three guide chunks in two guides, one law article, one slang entry.
DOC_A, DOC_B = "doc_0000000000000a01", "doc_0000000000000b01"
CHUNKS = [
    {
        "chunk_id": "chk_000000000000a001",
        "document_id": DOC_A,
        "document_title": "D-DEMO-1 비계 안전작업 DEMO 지침",
        "domain": "건설안전",
        "chunk_index": 0,
        "heading_path": ["3. 비계 조립"],
        "text": "비계 위에서 작업할 때에는 안전난간을 설치하여야 한다. 작업발판은 폭 40센티미터 이상.",
        "source_pages": [3],
        "previous_chunk_id": None,
        "next_chunk_id": "chk_000000000000a002",
    },
    {
        "chunk_id": "chk_000000000000a002",
        "document_id": DOC_A,
        "document_title": "D-DEMO-1 비계 안전작업 DEMO 지침",
        "domain": "건설안전",
        "chunk_index": 1,
        "heading_path": ["4. 해체"],
        "text": "비계 해체 작업은 위에서 아래로 한다.",
        "source_pages": [4],
        "previous_chunk_id": "chk_000000000000a001",
        "next_chunk_id": None,
    },
    {
        "chunk_id": "chk_000000000000b001",
        "document_id": DOC_B,
        "document_title": "P-DEMO-2 밀폐공간 DEMO 지침",
        "domain": "화학안전",
        "chunk_index": 0,
        "heading_path": [],
        "text": "밀폐공간 작업 전 산소농도를 측정한다.",
        "source_pages": [1],
        "previous_chunk_id": None,
        "next_chunk_id": None,
    },
]
LAW = "산업안전보건기준에관한규칙_제13조"


def build_bm25(root, chunks):
    """A tiny sparse index in the package's file format (same analyzer as the module)."""
    bm = root / kg.BM25
    bm.mkdir(parents=True)
    postings = defaultdict(list)
    lengths = []
    for row, c in enumerate(chunks):
        tokens = kg.analyze(f"{c['domain']} {c['document_title']} {c['text']}")
        lengths.append(len(tokens))
        for term, tf in Counter(tokens).items():
            postings[term.encode()].append((row, tf))
    terms = sorted(postings)
    blob, term_off, post_off, rows, tfs, df = b"", [0], [0], [], [], []
    for t in terms:
        blob += t
        term_off.append(len(blob))
        for row, tf in sorted(postings[t]):
            rows.append(row)
            tfs.append(tf)
        post_off.append(len(rows))
        df.append(len(postings[t]))
    (bm / "sparse_terms.utf8").write_bytes(blob)
    np.save(bm / "sparse_term_offsets.u64.npy", np.array(term_off, dtype=np.uint64))
    np.save(bm / "sparse_posting_offsets.u64.npy", np.array(post_off, dtype=np.uint64))
    np.save(bm / "sparse_posting_rows.u32.npy", np.array(rows, dtype=np.uint32))
    np.save(bm / "sparse_posting_tfs.u32.npy", np.array(tfs, dtype=np.uint32))
    np.save(bm / "sparse_document_frequencies.u32.npy", np.array(df, dtype=np.uint32))
    np.save(bm / "sparse_doc_lengths.u32.npy", np.array(lengths, dtype=np.uint32))
    (bm / "sparse_manifest.json").write_text(json.dumps({"bm25": {"k1": 1.2, "b": 0.75}}))
    with open(bm / "sparse_documents.jsonl", "w", encoding="utf-8") as f:
        for row, c in enumerate(chunks):
            f.write(json.dumps({"chunk_id": c["chunk_id"], "foundation_row": row}) + "\n")


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)


def write_release(root):
    build_bm25(root, CHUNKS)
    g, rt = root / kg.G, root / kg.RT
    write_jsonl(g / "chunks/chunks.jsonl", CHUNKS)
    write_jsonl(
        g / "metadata/documents.jsonl",
        [
            {
                "document_id": DOC_A,
                "document_name": CHUNKS[0]["document_title"],
                "domain": "건설안전",
            },
            {
                "document_id": DOC_B,
                "document_name": CHUNKS[2]["document_title"],
                "domain": "화학안전",
            },
        ],
    )
    write_jsonl(
        g / "index_bundle/concepts.jsonl",
        [
            {"concept_id": "C1", "surface": "안전난간", "chunk_df": 1},
            {"concept_id": "C2", "surface": "비계", "chunk_df": 2},
            {"concept_id": "C3", "surface": "안전", "chunk_df": 3},
        ],
    )
    write_jsonl(
        g / "index_bundle/concept_to_chunk_postings.jsonl",
        [{"concept_id": "C1", "chunk_uid": CHUNKS[0]["chunk_id"], "tf_in_chunk": 1}],
    )
    write_jsonl(
        g / "entity_relations/entities.jsonl",
        [
            {
                "entity_id": "ent_1",
                "label": "비계",
                "normalized_label": "비계",
                "entity_type": "설비",
            },
            {
                "entity_id": "ent_2",
                "label": "안전난간",
                "normalized_label": "안전난간",
                "entity_type": "예방조치",
            },
        ],
    )
    write_jsonl(
        g / "entity_relations/relations.jsonl",
        [
            {
                "relation_id": "rel_1",
                "source_entity_id": "ent_1",
                "target_entity_id": "ent_2",
                "relation_type": "예방조치",
                "directed": True,
                "evidence_chunk_ids": [CHUNKS[0]["chunk_id"]],
            }
        ],
    )
    rt.mkdir(parents=True, exist_ok=True)
    (rt / "graph_relations_cache.json").write_text(
        json.dumps(
            [
                {
                    "source": "밀폐공간",
                    "relation": "측정항목",
                    "target": "산소농도",
                    "category": "DEMO",
                    "file": CHUNKS[2]["document_title"],
                }
            ],
            ensure_ascii=False,
        )
    )
    (rt / "법령").mkdir()
    (rt / "법령/docstore.json").write_text(
        json.dumps(
            {
                "docstore/data": {
                    "n1": {
                        "__data__": {
                            "metadata": {
                                "법령명": "산업안전보건기준에 관한 규칙",
                                "종류": "고용노동부령",
                                "조번호": "제13조",
                                "조제목": "안전난간의 구조 및 설치요건",
                                "unit_type": "조문",
                                "entity_key": LAW,
                            },
                            "text": "제13조(안전난간의 구조 및 설치요건) 사업주는 안전난간을 설치하는 경우 상부 난간대는 90센티미터 이상.",
                            "embedding": [0.1, 0.2],
                        }
                    }
                }
            },
            ensure_ascii=False,
        )
    )
    (rt / "법령/kosha_citation_map.json").write_text(
        json.dumps({LAW: [f"[건설안전] {CHUNKS[0]['document_title']}_part1"]}, ensure_ascii=False)
    )
    (rt / "판례").mkdir()
    (rt / "판례/precedent_citation_map.json").write_text(json.dumps({LAW: ["2024노DEMO1"]}))
    db = sqlite3.connect(rt / "통제어휘.db")
    db.executescript(
        "CREATE TABLE concept (id INTEGER PRIMARY KEY, label TEXT NOT NULL);"
        "CREATE TABLE term (id INTEGER PRIMARY KEY, surface TEXT, normalized TEXT, concept_id INTEGER, kind TEXT);"
        "INSERT INTO concept VALUES (1, '비계'), (2, '작업발판');"
        "INSERT INTO term VALUES (1, '비계', '비계', 1, '표준어'), (2, '아시바', '아시바', 1, '현장은어'),"
        " (3, '아시바', '아시바', 2, '순화대상어');"
    )
    db.commit()
    db.close()
    (root / "RELEASE.md").write_text("DEMO release notes, not pinned")
    return digest_of(root)


def digest_of(root):
    lines = []
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root).as_posix()
        if p.is_file() and rel != "RELEASE.md":
            lines.append(f"{rel}\t{hashlib.sha256(p.read_bytes()).hexdigest()}")
    return hashlib.sha256("\n".join(sorted(lines)).encode()).hexdigest()


def clear():
    kg.verify.cache_clear()
    kg.index.cache_clear()


@pytest.fixture
def release(tmp_path, monkeypatch):
    monkeypatch.setattr(kg, "ROOT", tmp_path)
    monkeypatch.setattr(kg, "DIGEST", write_release(tmp_path))
    monkeypatch.setenv("AI_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    monkeypatch.setattr(kg, "_counts", {})
    clear()
    yield tmp_path
    clear()


def client():
    return TestClient(app, client=("192.168.0.3", 1234))


def test_search_expands_slang_and_links_graph_and_laws(release):
    body = client().get(SEARCH, params={"q": "아시바 안전난간"}, headers=HEADERS).json()
    assert body["expansion"] == [
        {"from": "아시바", "to": "비계", "kind": "현장은어"},
        {"from": "아시바", "to": "작업발판", "kind": "순화대상어"},
    ]
    assert body["results"][0]["chunk_id"] == CHUNKS[0]["chunk_id"]
    assert body["results"][0]["laws"] == [LAW]
    assert body["total"] == 2 and body["pages"] == 1
    assert [c["surface"] for c in body["concepts"]] == ["안전난간", "비계"]  # whole words only
    assert body["graph"]["edges"][0]["relation"] == "예방조치"
    assert body["graph"]["edges"][0]["chunk_id"] == CHUNKS[0]["chunk_id"]
    assert body["laws"][0]["key"] == LAW and body["laws"][0]["cases"] == 1
    assert "text" not in body["laws"][0] and body["laws"][0]["excerpt"].startswith("제13조")


def test_domain_filter_and_bad_queries(release):
    c = client()
    assert (
        c.get(SEARCH, params={"q": "비계", "domain": "화학안전"}, headers=HEADERS).json()["total"]
        == 0
    )
    cache = c.get(SEARCH, params={"q": "밀폐공간"}, headers=HEADERS).json()
    assert cache["graph"]["edges"][0]["document_id"] == DOC_B  # cached triple linked by guide name
    for params in (
        {"q": ""},
        {"q": "x" * 201},
        {"q": "비계", "domain": "DEMO"},
        {"q": "비계", "page": 9},
    ):
        assert c.get(SEARCH, params=params, headers=HEADERS).status_code == 422


def test_chunk_document_and_law_detail(release):
    c = client()
    chunk = c.get(f"{kg.PREFIX}/api/chunk/{CHUNKS[0]['chunk_id']}", headers=HEADERS).json()
    assert chunk["text"].startswith("비계 위에서") and chunk["position"] == 1
    assert chunk["document_chunks"] == 2 and chunk["laws"][0]["key"] == LAW
    assert chunk["graph"] == [{"source": "비계", "relation": "예방조치", "target": "안전난간"}]
    doc = c.get(f"{kg.PREFIX}/api/document/{DOC_A}", headers=HEADERS).json()
    assert [x["heading"] for x in doc["chunks"]] == ["3. 비계 조립", "4. 해체"]
    law = c.get(f"{kg.PREFIX}/api/law/{LAW}", headers=HEADERS).json()
    assert law["text"].startswith("제13조") and law["case_numbers"] == ["2024노DEMO1"]
    for path in (
        "chunk/../../etc/passwd",
        "chunk/chk_ffffffffffffffff",
        "document/x",
        "law/없는조문_제1조",
    ):
        assert c.get(f"{kg.PREFIX}/api/{path}", headers=HEADERS).status_code in (404, 422)


def test_gateway_only(release, monkeypatch):
    monkeypatch.delenv("COPD_ALLOW_LOCAL_PREVIEW", raising=False)
    assert client().get(SEARCH, params={"q": "비계"}).status_code == 403
    assert TestClient(app).get(SEARCH, params={"q": "비계"}, headers=HEADERS).status_code == 403


def test_changed_release_is_not_served(release):
    (release / kg.G / "chunks/chunks.jsonl").write_text("{}")
    clear()
    assert client().get(SEARCH, params={"q": "비계"}, headers=HEADERS).status_code == 503


def test_answer_keeps_only_cited_statements(release, monkeypatch):
    seen = {}

    def fake(question, material_text):
        seen["question"], seen["material"] = question, material_text
        return {
            "statements": [
                {"text": "비계 위 작업에는 안전난간을 설치한다.", "cites": ["G1"]},
                {"text": "상부 난간대는 90센티미터 이상이다.", "cites": ["L1", "G1"]},
                {"text": "근거 없는 문장.", "cites": []},
                {"text": "자료 밖 인용.", "cites": ["G9"]},
            ],
            "insufficient": False,
            "note": "",
        }

    monkeypatch.setattr(kg, "call_claude", fake)
    body = {"질문": "비계 작업 안전난간 기준은?", "청크": [CHUNKS[0]["chunk_id"]], "조문": [LAW]}
    got = client().post(ANSWER, json=body, headers=POST).json()
    assert [s["cites"] for s in got["statements"]] == [["G1"], ["L1", "G1"]]
    assert got["dropped"] == 2 and got["insufficient"] is False
    assert got["sources"]["G1"]["chunk_id"] == CHUNKS[0]["chunk_id"]
    assert got["sources"]["L1"]["key"] == LAW
    assert (
        "[G1] KOSHA GUIDE D-DEMO-1" in seen["material"]
        and "[L1] 산업안전보건기준" in seen["material"]
    )
    assert seen["question"] == body["질문"]


def test_answer_without_valid_citations_is_insufficient(release, monkeypatch):
    monkeypatch.setattr(
        kg,
        "call_claude",
        lambda q, m: {
            "statements": [{"text": "x", "cites": ["L7"]}],
            "insufficient": False,
            "note": "",
        },
    )
    got = (
        client()
        .post(ANSWER, json={"질문": "질문입니다", "청크": [CHUNKS[1]["chunk_id"]]}, headers=POST)
        .json()
    )
    assert got["statements"] == [] and got["insufficient"] is True and got["dropped"] == 1


@pytest.mark.parametrize(
    "headers, content, status",
    [
        (POST, json.dumps({"질문": "비계", "청크": ["chk_ffffffffffffffff"]}), 422),
        (POST, json.dumps({"질문": "비계", "청크": ["../x"]}), 422),
        (
            POST,
            json.dumps({"질문": "비계", "청크": [CHUNKS[0]["chunk_id"]], "조문": ["없는조문"]}),
            422,
        ),
        (POST, json.dumps({"질문": "x", "청크": [CHUNKS[0]["chunk_id"]]}), 422),
        (POST, json.dumps({"질문": "비계", "청크": []}), 422),
        ({**POST, "Content-Type": "text/plain"}, "비계", 415),
        (
            {**HEADERS, "Content-Type": "application/json"},
            json.dumps({"질문": "비계", "청크": [CHUNKS[0]["chunk_id"]]}),
            403,
        ),
        (POST, json.dumps({"질문": "비계", "청크": [CHUNKS[0]["chunk_id"]], "x": "y" * 5000}), 413),
    ],
)
def test_bad_requests_never_reach_claude(release, monkeypatch, headers, content, status):
    monkeypatch.setattr(
        kg, "call_claude", lambda q, m: (_ for _ in ()).throw(AssertionError("called"))
    )
    assert client().post(ANSWER, content=content, headers=headers).status_code == status


def test_daily_cap_stops_before_claude(release, monkeypatch):
    monkeypatch.setenv("KOSHA_GRAPHRAG_AI_DAILY_KRW", str(kg.RESERVE - 1))
    monkeypatch.setattr(
        shared, "claude_client", lambda: (_ for _ in ()).throw(AssertionError("called"))
    )
    got = client().post(
        ANSWER, json={"질문": "비계 작업", "청크": [CHUNKS[0]["chunk_id"]]}, headers=POST
    )
    assert got.status_code == 429


def test_per_client_cap(release, monkeypatch):
    monkeypatch.setenv("KOSHA_GRAPHRAG_AI_PER_CLIENT", "1")
    monkeypatch.setattr(
        kg, "call_claude", lambda q, m: {"statements": [], "insufficient": True, "note": ""}
    )
    body = {"질문": "비계 작업", "청크": [CHUNKS[0]["chunk_id"]]}
    assert client().post(ANSWER, json=body, headers=POST).status_code == 200
    assert client().post(ANSWER, json=body, headers=POST).status_code == 429
