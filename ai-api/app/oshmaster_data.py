"""Versioned OSHMASTER dictionary search, adapted from the reviewed handoff demo."""

import json
import re
import sqlite3
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "opendata/oshmaster/releases/2026-09-21.1"


def norm(value):
    return re.sub(r"[\s·ㆍ]", "", value).lower()


def tokens(value):
    words = []
    for word in re.findall(r"[가-힣]+|[a-z0-9]+", value.lower()):
        words.append(word)
        if len(word) > 2 and re.fullmatch("[가-힣]+", word):
            words.extend(word[i : i + 2] for i in range(len(word) - 1))
    return list(dict.fromkeys(words))


class Demo:
    def __init__(self, root=ROOT):
        self.root = Path(root)

    def connection(self):
        cx = sqlite3.connect(
            (self.root / "data/search.sqlite").resolve().as_uri() + "?mode=ro", uri=True
        )
        cx.row_factory = sqlite3.Row
        return cx

    def api(self, route, args):
        cx = self.connection()
        try:
            return self.query(cx, route, args)
        finally:
            cx.close()

    def query(self, cx, route, args):
        if route == "catalogue":
            if args:
                raise ValueError("자료 목록에는 검색 조건을 넣지 마세요.")
            scopes = [
                dict(r)
                for r in cx.execute(
                    "SELECT axis,std,std_version,count(*) AS count FROM codes GROUP BY 1,2,3 ORDER BY 1,2,3"
                )
            ]
            return {
                "scopes": scopes,
                **json.loads((self.root / "demo/settings.json").read_text()),
                "mode": "dictionary_search_no_llm",
            }
        if route == "search":
            if set(args) - {"q", "axis", "std", "version", "offset", "limit"}:
                raise ValueError("지원하지 않는 검색 조건입니다.")
            q = args.get("q", "").strip()
            if not q or len(q) > 200:
                raise ValueError("검색어를 1~200자로 입력해 주세요.")
            scope = (args.get("axis"), args.get("std"), args.get("version"))
            if not cx.execute(
                "SELECT 1 FROM codes WHERE axis=? AND std=? AND std_version=? LIMIT 1",
                scope,
            ).fetchone():
                raise ValueError("목록에서 분류와 판본을 선택해 주세요.")
            offset, limit = int(args.get("offset", 0)), int(args.get("limit", 10))
            if not 0 <= offset <= 1_000_000 or not 1 <= limit <= 50:
                raise ValueError("페이지 범위가 올바르지 않습니다.")
            match = " OR ".join('"' + w + '"' for w in tokens(q)) or '"zz_unmatched"'
            sql = """WITH direct AS (
                SELECT t.record_id, min(CASE kind WHEN 'code' THEN 0 WHEN 'exact' THEN 1 ELSE 2 END) priority
                FROM terms t JOIN codes c ON c.record_id=t.record_id
                WHERE norm=? AND c.axis=? AND c.std=? AND c.std_version=? GROUP BY t.record_id
              ), related AS (
                SELECT s.record_id, 3 priority FROM search s JOIN codes c ON c.record_id=s.record_id
                WHERE search MATCH ? AND c.axis=? AND c.std=? AND c.std_version=?
              ), hits AS (SELECT record_id,min(priority) priority FROM
                (SELECT * FROM direct UNION ALL SELECT * FROM related) GROUP BY record_id)
            """
            params = [norm(q), *scope, match, *scope]
            total = cx.execute(sql + "SELECT count(*) FROM hits", params).fetchone()[0]
            rows = [
                dict(r)
                for r in cx.execute(
                    sql
                    + """SELECT c.record_id,c.axis,c.std,c.std_version,c.code,c.label,c.level,c.parent_code,h.priority
                FROM hits h JOIN codes c ON c.record_id=h.record_id ORDER BY h.priority,CAST(c.level AS INTEGER),c.code,c.record_id LIMIT ? OFFSET ?""",
                    params + [limit, offset],
                )
            ]
            for row in rows:
                row["match_kind"] = ("code", "exact", "alias", "related")[row.pop("priority")]
            return {
                "results": rows,
                "total": total,
                "offset": offset,
                "limit": limit,
                "next_offset": offset + limit if offset + limit < total else None,
                "needs_review": True,
                "note": "사전·어휘 후보입니다. 검색어의 부정·과거력·대상자를 자동 판정하지 않습니다.",
            }
        if route == "detail":
            if set(args) - {"id", "include_descendants", "offset", "limit"}:
                raise ValueError("지원하지 않는 상세 조건입니다.")
            rid = args.get("id", "")
            if not re.fullmatch("code-[0-9a-f]{24}", rid):
                raise ValueError("올바른 코드 ID를 선택해 주세요.")
            got = cx.execute("SELECT * FROM codes WHERE record_id=?", (rid,)).fetchone()
            if not got:
                raise LookupError("해당 코드를 찾을 수 없습니다.")
            selected = dict(got)
            scope = (got["axis"], got["std"], got["std_version"])
            rows = {
                r["code"]: dict(r)
                for r in cx.execute(
                    "SELECT record_id,axis,std,std_version,code,label,parent_code,level FROM codes WHERE axis=? AND std=? AND std_version=?",
                    scope,
                )
            }
            ancestors, issues, seen, parent = [], [], {got["code"]}, got["parent_code"]
            while parent:
                if parent in seen or parent not in rows:
                    issues.append("상위 연결을 확인해야 합니다: " + parent)
                    break
                ancestors.insert(0, rows[parent])
                seen.add(parent)
                parent = rows[parent]["parent_code"]
            children = defaultdict(list)
            for r in rows.values():
                if r["parent_code"]:
                    children[r["parent_code"]].append(r)
            for values in children.values():
                values.sort(key=lambda r: r["code"])
            descendants, seen = [], {got["code"]}
            queue = deque(children[got["code"]])
            while queue:
                r = queue.popleft()
                if r["code"] in seen:
                    issues.append("순환 연결을 확인해야 합니다.")
                    continue
                seen.add(r["code"])
                descendants.append(r)
                queue.extend(children[r["code"]])
            include = args.get("include_descendants", "false")
            if include not in ("true", "false"):
                raise ValueError("하위 포함 여부가 올바르지 않습니다.")
            offset, limit = int(args.get("offset", 0)), int(args.get("limit", 50))
            if not 0 <= offset <= 1_000_000 or not 1 <= limit <= 100:
                raise ValueError("페이지 범위가 올바르지 않습니다.")
            chosen = [rows[got["code"]]] + (descendants if include == "true" else [])
            return {
                "node": selected,
                "ancestors": ancestors,
                "children": children[got["code"]][:100],
                "children_total": len(children[got["code"]]),
                "descendants_total": len(descendants),
                "scope": chosen[offset : offset + limit],
                "scope_total": len(chosen),
                "next_offset": offset + limit if offset + limit < len(chosen) else None,
                "issues": issues,
                "case_label_approved": False,
            }
        raise LookupError("요청한 API가 없습니다.")
