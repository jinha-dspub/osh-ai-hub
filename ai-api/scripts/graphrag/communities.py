"""Split the merged graph into communities (two levels) for the community reports.

    python scripts/graphrag/communities.py      # writes <out>/graph/communities.jsonl

Level 0: Louvain on the whole graph (networkx, weighted by co-mention count, fixed seed).
Level 1: Louvain again inside every level-0 community larger than SPLIT nodes, so a report
never has to cover hundreds of entities. Singletons and pairs are not reported.
"""

import json
import os
import sys
from collections import Counter
from pathlib import Path

import networkx as nx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import OUT, load_chunks

SPLIT = 40
MIN_SIZE = 3
SEED = 20261006


def load_graph():
    g = nx.Graph()
    nodes = {}
    with open(OUT / "graph/nodes.jsonl", encoding="utf-8") as f:
        for line in f:
            n = json.loads(line)
            nodes[n["id"]] = n
            g.add_node(n["id"])
    with open(OUT / "graph/edges.jsonl", encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            w = e["weight"] + (2 if "stage2" in e["stages"] else 0)
            if g.has_edge(e["source"], e["target"]):
                g[e["source"]][e["target"]]["weight"] += w
            else:
                g.add_edge(e["source"], e["target"], weight=w)
    return g, nodes


def louvain(g):
    return nx.community.louvain_communities(g, weight="weight", resolution=1.0, seed=SEED)


def main():
    os.umask(0o077)
    g, nodes = load_graph()
    chunks = load_chunks()
    g.remove_nodes_from(list(nx.isolates(g)))
    level0 = [sorted(c) for c in louvain(g)]
    rows = []
    for i, members in enumerate(sorted(level0, key=len, reverse=True)):
        cid = f"c0-{i:04d}"
        children = []
        if len(members) > SPLIT:
            sub = g.subgraph(members)
            for j, part in enumerate(
                sorted((sorted(c) for c in louvain(sub)), key=len, reverse=True)
            ):
                if len(part) >= MIN_SIZE:
                    children.append((f"{cid}-{j:03d}", part))
        for ident, part, level, parent in [(cid, members, 0, None)] + [
            (k, p, 1, cid) for k, p in children
        ]:
            if len(part) < MIN_SIZE:
                continue
            docs = Counter()
            domains = Counter()
            for nid in part:
                for d in nodes[nid]["document_ids"]:
                    docs[d] += 1
            for nid in part:
                for ch in nodes[nid]["chunk_ids"][:50]:
                    if ch in chunks:
                        domains[chunks[ch]["domain"]] += 1
            edges = g.subgraph(part).number_of_edges()
            rows.append(
                {
                    "id": ident,
                    "level": level,
                    "parent": parent,
                    "size": len(part),
                    "edges": edges,
                    "node_ids": part,
                    "top_documents": [d for d, _ in docs.most_common(8)],
                    "domains": dict(domains.most_common(3)),
                    "children": [k for k, _ in children] if level == 0 else [],
                }
            )
    out = OUT / "graph/communities.jsonl"
    with open(out, "w", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    sizes = [r["size"] for r in rows if r["level"] == 0]
    print(
        json.dumps(
            {
                "nodes_in_graph": g.number_of_nodes(),
                "edges_in_graph": g.number_of_edges(),
                "level0": sum(1 for r in rows if r["level"] == 0),
                "level1": sum(1 for r in rows if r["level"] == 1),
                "largest_level0": max(sizes) if sizes else 0,
                "reports_to_write": len(rows),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
