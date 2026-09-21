"""Prepare a versioned local SANJE snapshot and a derived label index, never publish raw data."""

import csv
import hashlib
import json
import os
import shutil
import sqlite3
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSION = "2026-09-19.v1"
GROUPS = {
    "copd": "COPD",
    "cardio": "뇌심혈관",
    "cancer": "암",
    "infection": "감염성질환",
    "hearing": "난청",
    "musculoskeletal": "근골격계",
    "other": "기타",
}


def main():
    os.umask(0o077)
    csv.field_size_limit(sys.maxsize)
    incoming = ROOT / "opendata/_incoming" / f"sanje-opendata-{VERSION}"
    source = ROOT / "opendata/sanje/releases" / VERSION
    if not source.exists():
        shutil.copytree(incoming, source)
    for rel, expected in json.loads((source / "MANIFEST.json").read_text())["files"].items():
        path = (source / rel).resolve()
        path.relative_to(source.resolve())
        if (
            path.is_symlink()
            or hashlib.file_digest(path.open("rb"), "sha256").hexdigest() != expected
        ):
            raise ValueError("Snapshot manifest mismatch")
    output = ROOT / "local_asset/sanje" / VERSION
    output.mkdir(parents=True, exist_ok=True)
    index = output / "labels.sqlite"
    temporary = output / "labels.building.sqlite"
    if temporary.exists():
        raise ValueError("Previous unfinished index exists")
    summaries = []
    with sqlite3.connect(temporary) as db:
        db.execute("CREATE TABLE labels (group_id TEXT, accnum TEXT, ordinal INTEGER, data TEXT)")
        for group, title in GROUPS.items():
            folder = source / group

            def read(name, folder=folder):
                with (folder / name).open(encoding="utf-8-sig", newline="") as stream:
                    return list(csv.DictReader(stream))

            cases = read("cases.csv")
            exposures = read("exposure_measurements.csv")
            worktime = read("worktime.csv")
            records = read("worktime_records.csv")
            qa = Counter(
                {"true": "mismatch", "false": "matched"}.get(
                    r["qa_approval_mismatch"], "unverified"
                )
                for r in cases
            )
            counts = Counter(r["accnum"] for r in exposures)
            nlabels = 0
            with (folder / "standard_labels.jsonl").open() as stream:
                batch = []
                for ordinal, line in enumerate(stream):
                    row = json.loads(line)
                    batch.append((group, row["accnum"], ordinal, line.strip()))
                    nlabels += 1
                    if len(batch) == 2000:
                        db.executemany("INSERT INTO labels VALUES (?,?,?,?)", batch)
                        batch = []
                db.executemany("INSERT INTO labels VALUES (?,?,?,?)", batch)
            years = sorted({r["src_claim_year"] for r in cases if r["src_claim_year"]})
            summaries.append(
                {
                    "id": group,
                    "name": title,
                    "title": f"{title} 산재 판정 사례",
                    "cases": len(cases),
                    "measurements": len(exposures),
                    "measured_cases": len(counts),
                    "worktime_cases": len(worktime),
                    "worktime_records": len(records),
                    "labels": nlabels,
                    "years": years,
                    "qa": dict(qa),
                    "occupation_filled": sum(bool(r["ai_occupation_std"]) for r in cases),
                    "count_mismatches": sum(
                        int(r["n_measurements"]) != counts[r["accnum"]] for r in cases
                    ),
                    "case_columns": len(cases[0]),
                    "version": VERSION,
                    "version_date": "2026-09-19",
                    "researcher": "윤진하",
                    "affiliation": "연세대학교 산업보건연구소",
                    "search_modes": ["keyword"],
                }
            )
            print(group, len(cases), "cases", nlabels, "labels", flush=True)
        db.execute("CREATE INDEX labels_case ON labels (group_id,accnum,ordinal)")
        db.commit()
    temporary.replace(index)
    metadata = {
        "id": "sanje",
        "title": "산재 판정사례",
        "version": VERSION,
        "version_date": "2026-09-19",
        "researcher": "윤진하",
        "affiliation": "연세대학교 산업보건연구소",
        "source_url": "https://jilbyungcase.comwel.or.kr/",
        "groups": summaries,
        "total_cases": sum(g["cases"] for g in summaries),
        "update_plan": "미정",
    }
    (ROOT / "web/lib/sanje-catalog.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n"
    )
    (output / "catalog.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    (output / "research-info.json").write_text(
        json.dumps(
            {
                "researcher": "윤진하",
                "affiliation": "연세대학교 산업보건연구소",
                "confirmed_on": "2026-09-20",
                "source": "사이트 관리자의 이번 인수 지시",
                "note": "원본 인수 문서는 보존합니다. 연구책임자 등 세부 역할과 업데이트 계획은 추후 정리합니다. 소개는 공개, 검색·원문·다운로드는 기존 인증 관문을 유지합니다.",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    pending = {
        "version": VERSION,
        "source": str(source),
        "labels_index": str(index),
        "catalog": str(output / "catalog.json"),
        "storage_manifest": str(output / "storage-manifest.json"),
    }
    (output / "release.json").write_text(json.dumps(pending, indent=2) + "\n")
    print("Prepared candidate release; active service unchanged")


if __name__ == "__main__":
    main()
