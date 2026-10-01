"""Collect ALIO safety-and-health material for 공공기관 안전보건 분석 into one raw snapshot.

Usage: python3 scripts/collect_public_ohs_alio.py <out-dir> [part ...]
Parts (default all): organs items reports guidelines rules points
Then: nas-put 공공기관안전보건분석 raw <out-dir> alio

Everything is saved as received (HTML, JSON, HWP/PDF) with the request that produced it in
requests.jsonl, so the snapshot can be re-parsed later. Reruns skip files already saved.
ALIO robots.txt allows crawling and its copyright policy allows free reuse of public data;
requests are sequential with a pause. Disclosure pages carry the filing officer's name and
phone number as published; processing must drop them.
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

BASE = "https://www.alio.go.kr"
PAUSE = 0.4
AGENT = "OSH-AI-Hub research collector (osh.ai.kr; public-institution safety analysis)"
# 안전관리 (ESG S) disclosures plus staff numbers (denominator), every quarter code.
ITEMS = {
    "70401": "안전관리현황(안전경영책임보고서)",
    "70442": "안전관리현황(안전관리등급)",
    "70451": "산업재해 사고 사망자수 및 안전사고 사망자 수(발생) 1분기",
    "70452": "산업재해 사고 사망자수 및 안전사고 사망자 수(발생) 2분기",
    "70453": "산업재해 사고 사망자수 및 안전사고 사망자 수(발생) 3분기",
    "70454": "산업재해 사고 사망자수 및 안전사고 사망자 수(발생) 4분기",
    "70461": "산업재해 사고 사망자 수 및 안전사고 사망자 수(승인)",
    "70471": "중대재해에 해당하는 부상자수",
    "20201": "임직원 수 1분기",
    "20202": "임직원 수 2분기",
    "20203": "임직원 수 3분기",
    "20204": "임직원 수 4분기",
}
# Internal rules (21110) worth reading for safety and for bidding: keyword search on titles.
RULE_WORDS = [
    "안전",
    "보건",
    "재해",
    "계약",
    "입찰",
    "낙찰",
    "적격",
    "심사",
    "협력",
    "도급",
    "하도급",
    "용역",
    "공사",
    "구매",
    "조달",
    "협력사",
    "수급",
]
# Titles that are about employment contracts, not procurement.
RULE_SKIP = re.compile(r"계약직|근로계약|기간제|무기계약")
POINT_WORDS = ["안전", "재해", "사고", "중대", "협력", "하도급", "도급", "위험", "사망"]


class Client:
    def __init__(self, out: Path):
        self.out = out
        self.log = (out / "requests.jsonl").open("a", encoding="utf-8")
        self.count = 0

    def fetch(self, path, params=None, body=None, binary=False):
        url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
        data = json.dumps(body).encode() if body is not None else None
        headers = {"User-Agent": AGENT, "Referer": BASE + "/"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        for attempt in range(4):
            try:
                time.sleep(PAUSE)
                request = urllib.request.Request(url, data=data, headers=headers)
                with urllib.request.urlopen(request, timeout=90) as response:
                    content = response.read()
                    disposition = response.headers.get("Content-Disposition", "")
                self.count += 1
                self.log.write(
                    json.dumps(
                        {
                            "at": datetime.now(UTC).isoformat(timespec="seconds"),
                            "method": "POST" if data else "GET",
                            "url": url,
                            "body": body,
                            "bytes": len(content),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                self.log.flush()
                return content, disposition
            except OSError as error:
                if attempt == 3:
                    print(f"  failed {url}: {error}", flush=True)
                    return None, ""
                time.sleep(5 * (attempt + 1))

    def json(self, path, params=None, body=None):
        content, _ = self.fetch(path, params, body)
        if content is None:
            return None
        parsed = json.loads(content)
        return parsed.get("data") if isinstance(parsed, dict) else parsed


def save(path: Path, content: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def dump(path: Path, value):
    save(path, json.dumps(value, ensure_ascii=False, indent=1).encode())


def safe_name(name: str):
    name = urllib.parse.unquote(name).strip().strip('"')
    return re.sub(r'[\\/:*?"<>|\s]+', "_", name)[:150] or "file"


def organs(c: Client, out: Path):
    dump(out / "organs/apba_list.json", c.json("/organ/findApbaList.json"))


def org_list(c: Client, code: str):
    return c.json(
        "/item/itemOrganListJung.json",
        body={
            "apbaType": [],
            "jidtDptm": [],
            "area": [],
            "apbaId": "",
            "reportFormRootNo": code,
            "quart": "",
        },
    )


def items(c: Client, out: Path):
    dump(
        out / "items/form_list.json",
        c.json(
            "/item/formList.json",
            body={
                "lcd": [],
                "nmcd": [],
                "mcd": [],
                "scd": [],
                "reportType": [],
                "reportYn": [],
                "quart": [],
            },
        ),
    )
    for code, name in ITEMS.items():
        data = org_list(c, code)
        if not data:
            continue
        dump(out / f"items/{code}/list.json", data)
        rows = [o for o in data["organList"] if o.get("disclosureNo")]
        print(f"{code} {name}: {len(rows)} disclosures", flush=True)
        for o in rows:
            target = out / f"items/{code}/{o['apbaId']}_{o['disclosureNo']}.html"
            if target.exists():
                continue
            content, _ = c.fetch("/item/itemReportRight.do", {"disclosureNo": o["disclosureNo"]})
            if content:
                save(target, content)


def reports(c: Client, out: Path):
    """Attachments of 70401 (안전경영책임보고서), every file listed per institution."""
    data = (
        json.loads((out / "items/70401/list.json").read_text())
        if (out / "items/70401/list.json").exists()
        else org_list(c, "70401")
    )
    rows = [
        o for o in data["organList"] if o.get("disclosureNo") and o.get("files") not in (None, "@")
    ]
    print(f"70401 attachments: {len(rows)} institutions", flush=True)
    for o in rows:
        for entry in o["files"].split("|"):
            if "@" not in entry:
                continue
            file_no, name = entry.split("@", 1)
            target = out / f"reports/{o['apbaId']}/{file_no}_{safe_name(name)}"
            if target.exists() or not file_no:
                continue
            content, _ = c.fetch("/download/file.json", {"f": file_no, "d": o["disclosureNo"]})
            if content:
                save(target, content)


def guidelines(c: Client, out: Path):
    """ALIO 법령자료: every government guideline with its attachments."""
    rows, page = [], 1
    while True:
        data = c.json("/etc/findEtcLawList.json", {"type": "title", "word": "", "pageNo": page})
        if not data or not data.get("result"):
            break
        rows += data["result"]
        if page >= data["page"]["totalPage"]:
            break
        page += 1
    dump(out / "guidelines/list.json", rows)
    print(f"guidelines: {len(rows)}", flush=True)
    for r in rows:
        detail = c.json("/etc/findEtcLawDtl.json", {"boardNo": r["boardNo"]})
        if not detail:
            continue
        dump(out / f"guidelines/{r['boardNo']}/detail.json", detail)
        for f in detail.get("fileList") or []:
            target = out / f"guidelines/{r['boardNo']}/{f['fileNo']}_{safe_name(f['fileNm'])}"
            if target.exists():
                continue
            content, _ = c.fetch("/download/download.json", {"fileNo": f["fileNo"]})
            if content:
                save(target, content)


def search_all(c: Client, path, params):
    rows, page = [], 1
    while True:
        data = c.json(path, {**params, "pageNo": page})
        if not data or not data.get("result"):
            break
        rows += data["result"]
        total_pages = (data.get("page") or {}).get("totalPage") or 1
        if page >= total_pages:
            break
        page += 1
    return rows


def rules(c: Client, out: Path):
    """Internal rules (21110) whose titles match safety or procurement words: latest file each."""
    found = {}
    for word in RULE_WORDS:
        for r in search_all(
            c, "/occasional/findRuleList.json", {"type": "title", "word": word, "divis": ""}
        ):
            found.setdefault(r["seq"], {**r, "matched": []})["matched"].append(word)
    dump(out / "rules/search.json", list(found.values()))
    wanted = [r for r in found.values() if not RULE_SKIP.search(r["title"])]
    print(f"rules: {len(found)} matched, {len(wanted)} kept", flush=True)
    for r in wanted:
        folder = out / f"rules/{r['apbaId']}/{r['seq']}"
        if (folder / "detail.json").exists():
            continue
        detail = c.json("/occasional/findRuleDtl.json", {"seq": r["seq"]})
        if not detail:
            continue
        files = [f.split("|", 1) for f in (detail.get("bFiles") or "").split(",") if "|" in f]
        if files:
            file_no, name = files[-1]  # The list runs oldest to newest; keep the current text.
            content, _ = c.fetch("/download/rulefiledown.json", {"fileNo": file_no})
            if content:
                save(folder / f"{file_no}_{safe_name(name)}", content)
        dump(folder / "detail.json", detail)


def points(c: Client, out: Path):
    """국회·감사원·주무부처 지적사항 titles (the attachments are whole committee reports)."""
    for form in ["B1210", "B1220"]:
        found = {}
        for word in POINT_WORDS:
            for r in search_all(
                c,
                "/occasional/findPointList.json",
                {
                    "type": "title",
                    "word": word,
                    "sortType": "",
                    "reportFormNo": form,
                    "countPerPage": 100,
                },
            ):
                key = r.get("submissionNo") or json.dumps(r, ensure_ascii=False)
                found.setdefault(key, {**r, "matched": []})["matched"].append(word)
        dump(out / f"points/{form}.json", list(found.values()))
        print(f"points {form}: {len(found)}", flush=True)


PARTS = {
    "organs": organs,
    "items": items,
    "reports": reports,
    "guidelines": guidelines,
    "rules": rules,
    "points": points,
}


def main(out: Path, parts):
    out.mkdir(parents=True, exist_ok=True)
    c = Client(out)
    for name in parts:
        print(f"== {name}", flush=True)
        PARTS[name](c, out)
    print(f"done: {c.count} requests", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), sys.argv[2:] or list(PARTS))
