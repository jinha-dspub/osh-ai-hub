"""Resumable local-only embedding build; original dataset remains immutable."""

import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import sanje
from app import sanje_search as search


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--endpoint",
        choices=["http://127.0.0.1:11435", "http://127.0.0.1:11436"],
        default="http://127.0.0.1:11435",
    )
    args = parser.parse_args()
    release = sanje.release()
    target = sanje.config_path().parent / "search-embeddinggemma-v1"
    target.mkdir(exist_ok=True)
    with urllib.request.urlopen(args.endpoint + "/api/tags", timeout=10) as r:
        models = json.load(r)["models"]
    assert any(m["name"] == search.MODEL and m["digest"] == search.DIGEST for m in models)
    for group in sanje.GROUPS:
        source = Path(release["source"]) / group / "cases.csv"
        with source.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        spec = {
            "version": release["version"],
            "group": group,
            "cases_sha256": digest(source),
            "model": search.MODEL,
            "digest": search.DIGEST,
            "dimensions": search.DIMENSIONS,
            "recipe": search.RECIPE,
        }
        folder = target / group
        folder.mkdir(exist_ok=True)
        resume = folder / "build.json"
        if resume.exists() and json.loads(resume.read_text()) != spec:
            raise ValueError("Build specification changed; use a new index version")
        resume.write_text(json.dumps(spec))
        batches = []
        for start in range(0, len(rows), 64):
            file = folder / f"batch-{start:06}.npy"
            texts = [search.document(r) for r in rows[start : start + 64]]
            if not file.exists():
                payload = {
                    "model": search.MODEL,
                    "input": texts,
                    "truncate": False,
                    "keep_alive": "10m",
                    "options": {
                        "num_ctx": 2048,
                        "num_batch": 2048,
                        "num_gpu": 99 if args.endpoint.endswith("11436") else 0,
                        "num_thread": 4,
                    },
                }
                request = urllib.request.Request(
                    args.endpoint + "/api/embed",
                    data=json.dumps(payload).encode(),
                    headers={"Content-Type": "application/json"},
                )
                for attempt in range(3):
                    try:
                        with urllib.request.urlopen(request, timeout=180) as r:
                            vectors = np.asarray(json.load(r)["embeddings"], dtype=np.float32)
                        break
                    except (urllib.error.URLError, TimeoutError):
                        if attempt == 2:
                            raise RuntimeError(
                                "Local embedding batch failed; resume checkpoints"
                            ) from None
                        time.sleep(1)

                if (
                    vectors.shape != (len(texts), search.DIMENSIONS)
                    or not np.isfinite(vectors).all()
                ):
                    raise ValueError("Invalid vector batch")
                norms = np.linalg.norm(vectors, axis=1)
                if (norms == 0).any():
                    raise ValueError("Zero vector")
                with file.with_suffix(".tmp").open("wb") as f:
                    np.save(f, vectors / norms[:, None], allow_pickle=False)
                file.with_suffix(".tmp").replace(file)
            batch = np.load(file, allow_pickle=False)
            if batch.shape != (len(texts), search.DIMENSIONS) or not np.isfinite(batch).all():
                raise ValueError("Invalid checkpoint")
            batches.append(batch)
            if start % 640 == 0:
                print(group, min(start + 64, len(rows)), "/", len(rows), flush=True)
        np.save(folder / "vectors.npy", np.concatenate(batches), allow_pickle=False)
        (folder / "ids.json").write_text(json.dumps([r["accnum"] for r in rows]))
        spec["sha256"] = {name: digest(folder / name) for name in ["vectors.npy", "ids.json"]}
        spec["document_scope"] = "직종·유해인자·AI 요약 첫 700자; 원문 전체 임베딩 아님"
        (folder / "manifest.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2))
        print(group, "complete", len(rows), flush=True)
    release["search_index"] = str(target)
    pending = sanje.config_path().with_suffix(".pending")
    pending.write_text(json.dumps(release, ensure_ascii=False, indent=2))
    pending.replace(sanje.config_path())
    print("All seven search indexes complete", flush=True)


if __name__ == "__main__":
    main()
