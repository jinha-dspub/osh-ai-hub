"""Versioned, gateway-only SANJE datasets. No user-selected filesystem or object paths."""

import csv
import json
import os
import re
import sqlite3
import threading
import urllib.parse
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app import copd, storage

ROOT = Path(__file__).resolve().parents[2]
GROUPS = ("copd", "cardio", "cancer", "infection", "hearing", "musculoskeletal", "other")
LOAD_LOCK = threading.Lock()
csv.field_size_limit(16 * 1024 * 1024)


def config_path():
    return Path(os.environ.get("SANJE_RELEASE_CONFIG", ROOT / "local_asset/sanje-current.json"))


def enabled():
    return config_path().is_file()


def release():
    try:
        data = json.loads(config_path().read_text())
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\.v[0-9]+", data["version"]):
            raise ValueError("Invalid release")
        return data
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(503, "산재 자료 버전을 확인 중입니다.") from None


def group_id(group):
    if group not in GROUPS:
        raise HTTPException(404, "등록된 질환군이 아닙니다.")
    return group


class SearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: str = Field(default="", max_length=300)
    mode: Literal["keyword", "hybrid"] = "hybrid"
    year: str | list[str] = ""
    approval: str | list[str] = ""
    occupation: str | list[str] = ""
    qa: str | list[str] = ""
    page: int = Field(default=1, ge=1, le=5000)

    @field_validator("year", "approval", "occupation", "qa")
    @classmethod
    def bounded_filters(cls, value, info):
        values = value if isinstance(value, list) else [value]
        if len(values) > 50 or any(len(v) > 100 for v in values):
            raise ValueError("Too many filter values")
        allowed = {
            "approval": {"", "인정", "불인정", "일부인정"},
            "qa": {"", "matched", "mismatch", "unverified"},
        }
        if info.field_name in allowed and any(v not in allowed[info.field_name] for v in values):
            raise ValueError("Unknown filter")
        if info.field_name == "year" and any(
            v and not re.fullmatch(r"(19|20)[0-9]{2}", v) for v in values
        ):
            raise ValueError("Invalid year")
        return value


class Dataset(copd.Dataset):
    def __init__(self, root, group, summary, index):
        super().__init__(root)
        self.group = group
        self.summary = summary
        self.label_index = index
        self.hybrid_lock = threading.Lock()
        self.hybrid_index = None
        self.worktime = defaultdict(list)
        self.worktime_summary = {}
        for name, target in [
            ("worktime_records.csv", self.worktime),
            ("worktime.csv", self.worktime_summary),
        ]:
            with (root / name).open(encoding="utf-8-sig", newline="") as stream:
                for row in csv.DictReader(stream):
                    if row["accnum"] not in self.cases:
                        raise ValueError("Orphan worktime")
                    if name == "worktime.csv":
                        target[row["accnum"]] = row
                    else:
                        target[row["accnum"]].append(row)
        self.summary = {
            **super().info(),
            **summary,
            "occupations": sorted(
                {r["ai_occupation_std"] for r in self.rows if r["ai_occupation_std"]}
            ),
        }

    def info(self):
        return {
            **self.summary,
            "search_modes": ["hybrid", "keyword"] if release().get("search_index") else ["keyword"],
        }

    def search(self, body, embedder=None):
        if body.mode not in {"keyword", "hybrid", "local"}:
            raise HTTPException(422, "지원하지 않는 검색 방식입니다.")

        def match(actual, wanted):
            return not wanted or actual in (wanted if isinstance(wanted, list) else [wanted])

        candidates = [
            i
            for i, r in enumerate(self.rows)
            if match(r["src_claim_year"], body.year)
            and match(r["src_approval_status"], body.approval)
            and match(r["ai_occupation_std"], body.occupation)
            and match(copd.qa_status(r), body.qa)
        ]
        filtered = len(candidates)
        terms = body.q.strip().lower().split()
        if terms and body.mode in {"hybrid", "local"} and candidates:
            from app import sanje_search

            try:
                candidates = sanje_search.load(self).rank(body.q.strip(), candidates, embedder)
            except HTTPException:
                raise
            except (OSError, ValueError, KeyError, TypeError):
                raise HTTPException(
                    503, "자연어 검색 인덱스를 확인 중입니다. 키워드 검색을 이용해 주세요."
                ) from None
        elif terms and body.mode == "keyword":
            candidates = [i for i in candidates if all(t in self.search_text[i] for t in terms)]
            candidates.sort(
                key=lambda i: sum(self.search_text[i].count(t) for t in terms), reverse=True
            )
        start = (body.page - 1) * 20
        return {
            "results": [self.brief(self.rows[i]) for i in candidates[start : start + 20]],
            "total": len(candidates),
            "filtered_total": filtered,
            "page": body.page,
            "page_size": 20,
            "ranking": ("hybrid" if body.mode in {"hybrid", "local"} else "keyword")
            if terms
            else "catalog",
            "candidate_limit": 200 if terms and body.mode in {"hybrid", "local"} else None,
            "version": self.summary["version"],
            "group": self.group,
        }

    def labels(self, accnum, page=1):
        if accnum not in self.cases:
            raise HTTPException(404, "사례를 찾을 수 없습니다.")
        if not 1 <= page <= 10000:
            raise HTTPException(422, "페이지를 확인해 주세요.")
        with sqlite3.connect(
            Path(self.label_index).resolve().as_uri() + "?mode=ro", uri=True
        ) as db:
            total = db.execute(
                "SELECT count(*) FROM labels WHERE group_id=? AND accnum=?", (self.group, accnum)
            ).fetchone()[0]
            rows = db.execute(
                "SELECT data FROM labels WHERE group_id=? AND accnum=? ORDER BY ordinal LIMIT 50 OFFSET ?",
                (self.group, accnum, (page - 1) * 50),
            ).fetchall()
        return {
            "rows": [json.loads(row[0]) for row in rows],
            "total": total,
            "page": page,
            "page_size": 50,
        }

    def detail(self, accnum):
        if accnum not in self.cases:
            raise HTTPException(404, "사례를 찾을 수 없습니다.")
        return {
            **self.brief(self.cases[accnum]),
            "fields": self.cases[accnum],
            "text": self.texts[accnum],
            "measurement_rows": self.measurements[accnum],
            "worktime": self.worktime_summary.get(accnum),
            "worktime_rows": self.worktime[accnum],
            "standard_labels": self.labels(accnum),
            "version": self.summary["version"],
            "group": self.group,
        }


@lru_cache(maxsize=7)
def _load(source, group, catalog, index):
    summary = next(
        item for item in json.loads(Path(catalog).read_text())["groups"] if item["id"] == group
    )
    return Dataset(Path(source) / group, group, summary, index)


def dataset(group):
    group_id(group)
    data = release()
    try:
        with LOAD_LOCK:
            return _load(data["source"], group, data["catalog"], data["labels_index"])
    except (OSError, ValueError, KeyError, TypeError, StopIteration, sqlite3.Error):
        raise HTTPException(503, "질환 자료를 불러오지 못했습니다.") from None


def storage_settings():
    data = release()
    return {**storage.config(), "bucket": "sanje-research", "prefix": "sanje/" + data["version"]}


def manifest():
    try:
        data = release()
        result = json.loads(Path(data["storage_manifest"]).read_text())
        if result.get("verified") is not True or result["version"] != data["version"]:
            raise ValueError("Unverified release")
        return result
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(503, "해당 버전의 다운로드를 준비 중입니다.") from None


def files(group):
    group_id(group)
    data = manifest()
    return {
        "version": data["version"],
        "files": [
            {k: item[k] for k in ("id", "name", "bytes", "sha256")}
            for item in data["groups"][group]
        ],
    }


def signed_download(group, body):
    group_id(group)
    settings = storage_settings()
    data = manifest()
    if data.get("project") != settings["url"] or data.get("bucket") != settings["bucket"]:
        raise HTTPException(503, "저장소 구성을 확인 중입니다.")
    item = next((item for item in data["groups"][group] if item["id"] == body.id), None)
    if item is None:
        raise HTTPException(404, "등록된 파일이 아닙니다.")
    prefix = settings["prefix"] + "/" + group + "/"
    path = item["object"]
    if not path.startswith(prefix) or ".." in path or not re.fullmatch(r"[A-Za-z0-9/_.-]+", path):
        raise HTTPException(503, "파일 경로를 확인 중입니다.")
    storage.private_bucket(settings)
    route = "object/sign/" + settings["bucket"] + "/" + urllib.parse.quote(path, safe="/")
    result = storage.storage_request(settings, route, {"expiresIn": 60})
    signed = result.get("signedURL", "")
    if not signed.startswith("/" + route + "?"):
        raise HTTPException(503, "다운로드 주소를 확인 중입니다.")
    return {
        "url": settings["url"]
        + "/storage/v1"
        + signed
        + "&download="
        + urllib.parse.quote(item["name"], safe=""),
        "expires_in": 60,
    }
