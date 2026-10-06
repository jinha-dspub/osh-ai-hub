"""Merge the two graph stages into one node/edge set.

Stage 1 (the handoff package, untouched): entity_relations/entities.jsonl + relations.jsonl
(1,836 chunks) and the 13,064 (source, predicate, target, guide) triples of
data/runtime/storage/graph_relations_cache.json.
Stage 2 (Claude, scripts/graphrag/extract.py): <out>/extract/results.jsonl.

    python scripts/graphrag/merge.py            # writes <out>/graph/nodes.jsonl, edges.jsonl, stats.json

Entities merge on (normalized name, type) as the stage-1 schema does, after mapping field
spellings to their standard term with the package's controlled vocabulary (아시바 → 비계), so
the same thing extracted under two spellings becomes one node. Every node and edge keeps which
stage(s) produced it and which chunks are its evidence; nothing from stage 1 is dropped.
"""

import json
import os
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import OUT, PACKAGE, load_chunks

STOP_TYPES = {"기타"}


def normalize(name: str):
    text = unicodedata.normalize("NFKC", name).casefold()
    return "".join(ch for ch in text if ch.isalnum())


def load_vocab():
    """normalized non-standard spelling → standard label (one concept only; ambiguous ones skipped)."""
    db = sqlite3.connect(
        f"file:{(PACKAGE / 'data/runtime/storage/통제어휘.db').as_posix()}?mode=ro&immutable=1",
        uri=True,
    )
    rows = db.execute(
        "SELECT t.normalized, c.label FROM term t JOIN concept c ON c.id = t.concept_id WHERE t.kind != '표준어'"
    ).fetchall()
    db.close()
    by = defaultdict(set)
    for normalized, label in rows:
        by[normalize(normalized)].add(label)
    return {k: next(iter(v)) for k, v in by.items() if len(v) == 1}


def canonical(name: str, vocab):
    key = normalize(name)
    return vocab.get(key, name), key


class Graph:
    def __init__(self, vocab):
        self.vocab = vocab
        self.nodes = {}  # key -> node
        self.edges = {}  # (skey, type, tkey) -> edge

    def node(self, name, etype, chunk_id, description, stage, document_id=None):
        label, key = canonical(name.strip(), self.vocab)
        key = (normalize(label), etype)
        n = self.nodes.get(key)
        if n is None:
            n = self.nodes[key] = {
                "name": label,
                "type": etype,
                "aliases": set(),
                "descriptions": [],
                "chunk_ids": set(),
                "document_ids": set(),
                "stages": set(),
                "mentions": 0,
            }
        if name.strip() != label:
            n["aliases"].add(name.strip())
        if (
            description
            and len(n["descriptions"]) < 12
            and description not in {d["text"] for d in n["descriptions"]}
        ):
            n["descriptions"].append({"text": description, "chunk_id": chunk_id})
        if chunk_id:
            n["chunk_ids"].add(chunk_id)
        if document_id:
            n["document_ids"].add(document_id)
        n["stages"].add(stage)
        n["mentions"] += 1
        return key

    def edge(
        self, skey, tkey, rtype, label, chunk_id, description, evidence, stage, document_id=None
    ):
        if skey == tkey:
            return
        key = (skey, rtype, tkey)
        e = self.edges.get(key)
        if e is None:
            e = self.edges[key] = {
                "source": skey,
                "target": tkey,
                "type": rtype,
                "labels": Counter(),
                "descriptions": [],
                "evidence": [],
                "chunk_ids": set(),
                "document_ids": set(),
                "stages": set(),
                "weight": 0,
            }
        e["labels"][label or rtype] += 1
        if description and len(e["descriptions"]) < 8:
            e["descriptions"].append({"text": description, "chunk_id": chunk_id})
        if evidence and len(e["evidence"]) < 8:
            e["evidence"].append({"quote": evidence, "chunk_id": chunk_id})
        if chunk_id:
            e["chunk_ids"].add(chunk_id)
        if document_id:
            e["document_ids"].add(document_id)
        e["stages"].add(stage)
        e["weight"] += 1


def main():
    os.umask(0o077)
    chunks = load_chunks()
    vocab = load_vocab()
    g = Graph(vocab)
    # Stage 1a: typed entities/relations with chunk evidence.
    legacy = {}
    with open(PACKAGE / "data/graphrag/entity_relations/entities.jsonl", encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            cid = (e.get("evidence_chunk_ids") or [None])[0]
            legacy[e["entity_id"]] = g.node(
                e["label"],
                e["entity_type"],
                cid,
                "",
                "stage1",
                chunks[cid]["document_id"] if cid in chunks else None,
            )
            for cid2 in (e.get("evidence_chunk_ids") or [])[1:]:
                g.nodes[legacy[e["entity_id"]]]["chunk_ids"].add(cid2)
    with open(PACKAGE / "data/graphrag/entity_relations/relations.jsonl", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            s, t = legacy.get(r["source_entity_id"]), legacy.get(r["target_entity_id"])
            if not s or not t:
                continue
            for cid in r.get("evidence_chunk_ids") or [None]:
                g.edge(
                    s,
                    t,
                    r["relation_type"],
                    r["relation_type"],
                    cid,
                    "",
                    "",
                    "stage1",
                    chunks[cid]["document_id"] if cid in chunks else None,
                )
    # Stage 1b: untyped predicate triples per guide (no chunk evidence; linked to the guide).
    documents = {}
    with open(PACKAGE / "data/graphrag/metadata/documents.jsonl", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            documents[re.sub(r"_part\d+$", "", d["document_name"])] = d["document_id"]
    with open(PACKAGE / "data/runtime/storage/graph_relations_cache.json", encoding="utf-8") as f:
        for t in json.load(f):
            doc = documents.get(re.sub(r"_part\d+$", "", t["file"]))
            s = g.node(t["source"], "기타", None, "", "stage1-cache", doc)
            o = g.node(t["target"], "기타", None, "", "stage1-cache", doc)
            g.edge(s, o, "기타", t["relation"], None, "", "", "stage1-cache", doc)
    # Stage 2: Claude extraction with verified evidence quotes.
    results = OUT / "extract/results.jsonl"
    n2 = 0
    if results.exists():
        with open(results, encoding="utf-8") as f:
            for line in f:
                row = json.loads(line)
                if "error" in row or not row.get("substantive"):
                    continue
                n2 += 1
                cid = row["chunk_id"]
                doc = chunks[cid]["document_id"]
                keys = {}
                for e in row["entities"]:
                    keys[e["name"]] = g.node(
                        e["name"], e["type"], cid, e["description"], "stage2", doc
                    )
                for r in row["relations"]:
                    g.edge(
                        keys[r["source"]],
                        keys[r["target"]],
                        r["type"],
                        r["type"],
                        cid,
                        r["description"],
                        r["evidence"],
                        "stage2",
                        doc,
                    )
    # Untyped "기타" nodes from the cache that coincide with a typed node of the same name are
    # folded into the typed node so communities do not split on type alone.
    typed = {}
    for (norm, etype), n in g.nodes.items():
        if etype not in STOP_TYPES:
            typed.setdefault(norm, (norm, etype))
    remap = {}
    for key in list(g.nodes):
        norm, etype = key
        if etype in STOP_TYPES and norm in typed:
            target = typed[norm]
            tn, sn = g.nodes[target], g.nodes[key]
            tn["aliases"] |= sn["aliases"]
            tn["chunk_ids"] |= sn["chunk_ids"]
            tn["document_ids"] |= sn["document_ids"]
            tn["stages"] |= sn["stages"]
            tn["mentions"] += sn["mentions"]
            remap[key] = target
            del g.nodes[key]
    if remap:
        edges = {}
        for (s, rtype, t), e in g.edges.items():
            s2, t2 = remap.get(s, s), remap.get(t, t)
            if s2 == t2:
                continue
            k = (s2, rtype, t2)
            if k in edges:
                old = edges[k]
                old["weight"] += e["weight"]
                old["labels"] += e["labels"]
                old["chunk_ids"] |= e["chunk_ids"]
                old["document_ids"] |= e["document_ids"]
                old["stages"] |= e["stages"]
                old["evidence"] = (old["evidence"] + e["evidence"])[:8]
                old["descriptions"] = (old["descriptions"] + e["descriptions"])[:8]
            else:
                e["source"], e["target"] = s2, t2
                edges[k] = e
        g.edges = edges
    # Write.
    ids = {
        key: f"n{index:06d}"
        for index, key in enumerate(sorted(g.nodes, key=lambda k: (-g.nodes[k]["mentions"], k)))
    }
    degree = Counter()
    for s, _, t in g.edges:
        degree[s] += 1
        degree[t] += 1
    out = OUT / "graph"
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "nodes.jsonl", "w", encoding="utf-8") as f:
        for key, nid in ids.items():
            n = g.nodes[key]
            f.write(
                json.dumps(
                    {
                        "id": nid,
                        "name": n["name"],
                        "type": n["type"],
                        "aliases": sorted(n["aliases"])[:10],
                        "descriptions": n["descriptions"],
                        "chunk_ids": sorted(n["chunk_ids"]),
                        "document_ids": sorted(n["document_ids"]),
                        "stages": sorted(n["stages"]),
                        "mentions": n["mentions"],
                        "degree": degree[key],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    with open(out / "edges.jsonl", "w", encoding="utf-8") as f:
        for (s, rtype, t), e in g.edges.items():
            f.write(
                json.dumps(
                    {
                        "source": ids[s],
                        "target": ids[t],
                        "type": rtype,
                        "label": e["labels"].most_common(1)[0][0],
                        "descriptions": e["descriptions"],
                        "evidence": e["evidence"],
                        "chunk_ids": sorted(e["chunk_ids"]),
                        "document_ids": sorted(e["document_ids"]),
                        "stages": sorted(e["stages"]),
                        "weight": e["weight"],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    stats = {
        "nodes": len(g.nodes),
        "edges": len(g.edges),
        "stage2_chunks": n2,
        "nodes_by_stage": dict(Counter(st for n in g.nodes.values() for st in n["stages"])),
        "edges_by_stage": dict(Counter(st for e in g.edges.values() for st in e["stages"])),
        "nodes_by_type": dict(Counter(n["type"] for n in g.nodes.values()).most_common()),
        "edges_by_type": dict(Counter(e["type"] for e in g.edges.values()).most_common()),
        "vocab_merges": sum(1 for n in g.nodes.values() if n["aliases"]),
    }
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1))
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
