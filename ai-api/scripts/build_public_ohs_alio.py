"""Turn the ALIO raw snapshot into the 공공기관 안전보건 공시 dataset.

Usage: python3 scripts/build_public_ohs_alio.py <alio-raw-dir> <out-dir>
  alio-raw-dir  /nas/공공기관안전보건분석/raw/alio-20261001 (collect_public_ohs_alio.py)
  out-dir       new folder → nas-put 공공기관안전보건분석 processed <out-dir> alio-dataset

Tables are read cell by cell (row/col spans expanded) and written in long form: one row per
기관 × 항목 × 구분 × 기간. Values stay as published ('-', '해당없음' are kept, never turned
into 0). The officer table under every disclosure (names, departments, phone numbers) is
dropped, and 기준일·제출일 are kept.
"""

import csv
import html
import io
import json
import re
import sys
from pathlib import Path

SAFETY = {
    "70442": "안전관리등급",
    "70451": "사고사망자(발생) 1분기",
    "70452": "사고사망자(발생) 2분기",
    "70453": "사고사망자(발생) 3분기",
    "70454": "사고사망자(발생) 4분기",
    "70461": "사고사망자(승인)",
    "70471": "중대재해 부상자",
}
STAFF = {
    "20201": "임직원 수 1분기",
    "20202": "임직원 수 2분기",
    "20203": "임직원 수 3분기",
    "20204": "임직원 수 4분기",
}
PERIOD = re.compile(r"^(\d{4}년( \d/4분기)?|\d{1,2}월|계)$")
NUMBER = re.compile(r"^-?\d+(\.\d+)?$")


def text(cell):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cell))).strip()


def grids(source):
    out = []
    for table in re.findall(r"<table.*?</table>", source, re.DOTALL):
        grid = {}
        for r, tr in enumerate(re.findall(r"<tr.*?</tr>", table, re.DOTALL)):
            c = 0
            for m in re.finditer(r"<t([hd])([^>]*)>(.*?)</t[hd]>", tr, re.DOTALL):
                while (r, c) in grid:
                    c += 1
                rows = int((re.search(r'rowspan="?(\d+)', m.group(2)) or [0, 1])[1])
                cols = int((re.search(r'colspan="?(\d+)', m.group(2)) or [0, 1])[1])
                value = text(m.group(3))
                for i in range(rows):
                    for j in range(cols):
                        grid[(r + i, c + j)] = value
                c += cols
        if grid:
            height = max(k[0] for k in grid) + 1
            width = max(k[1] for k in grid) + 1
            out.append([[grid.get((i, j), "") for j in range(width)] for i in range(height)])
    return out


def dates(source):
    plain = text(source)
    base = re.search(r"기준일\s*(\d{4})년\s*(\d{2})월\s*(\d{2})일", plain)
    sent = re.search(r"제출일\s*(\d{4})년\s*(\d{2})월\s*(\d{2})일", plain)
    fmt = lambda m: f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else ""
    return fmt(base), fmt(sent)


def long_rows(source):
    """(표번호, 구분, 기간, 값) for every data table; officer tables are skipped."""
    for index, grid in enumerate(grids(source)):
        if len(grid) < 2 or any("담당자명" in c for c in grid[0]):
            continue
        header = grid[0]
        periods = [j for j, h in enumerate(header) if PERIOD.match(h)]
        if not periods:
            continue
        for row in grid[1:]:
            labels = list(dict.fromkeys(c for j, c in enumerate(row) if j < periods[0] and c))
            for j in periods:
                if j < len(row):
                    yield index, " > ".join(labels), header[j], row[j]


def write_csv(path: Path, rows, columns):
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, columns, lineterminator="\r\n", extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    path.write_text("﻿" + buffer.getvalue(), encoding="utf-8")


def main(raw: Path, out: Path):
    if out.exists():
        sys.exit(f"{out} already exists")
    data = out / "data"
    data.mkdir(parents=True)
    organs = json.loads((raw / "organs/apba_list.json").read_text())
    institutions = {
        o["apbaId"]: {
            "기관ID": o["apbaId"],
            "기관명": o["apbaNa"],
            "기관유형": o.get("apbaTypeNa", ""),
            "주무부처": o.get("jidtDptmNa", ""),
        }
        for o in organs
    }
    write_csv(
        data / "institutions.csv",
        institutions.values(),
        ["기관ID", "기관명", "기관유형", "주무부처"],
    )

    def disclosures(codes, target, name):
        rows, count = [], 0
        for code, label in codes.items():
            listing = raw / f"items/{code}/list.json"
            if not listing.exists():
                continue
            for o in json.loads(listing.read_text())["organList"]:
                if not o.get("disclosureNo"):
                    continue
                page = raw / f"items/{code}/{o['apbaId']}_{o['disclosureNo']}.html"
                if not page.exists():
                    continue
                source = page.read_text("utf-8", "ignore")
                base, sent = dates(source)
                count += 1
                for table, label_path, period, value in long_rows(source):
                    rows.append(
                        {
                            "기관ID": o["apbaId"],
                            "기관명": o["apbaNa"],
                            "항목코드": code,
                            "항목": label,
                            "공시연도": o["critYyyy"],
                            "공시분기": o["critQuar"],
                            "공시번호": o["disclosureNo"],
                            "표": table,
                            "구분": label_path,
                            "기간": period,
                            "값": value,
                            "값_숫자": value if NUMBER.match(value.replace(",", "")) else "",
                            "기준일": base,
                            "제출일": sent,
                        }
                    )
        write_csv(
            data / target,
            rows,
            [
                "기관ID",
                "기관명",
                "항목코드",
                "항목",
                "공시연도",
                "공시분기",
                "공시번호",
                "표",
                "구분",
                "기간",
                "값",
                "값_숫자",
                "기준일",
                "제출일",
            ],
        )
        print(f"{name}: {count} disclosures, {len(rows)} rows", flush=True)
        return rows

    safety = disclosures(SAFETY, "safety_disclosures.csv", "안전 공시")
    disclosures(STAFF, "staff.csv", "임직원 수")

    # One row per institution: the yearly totals most people look for first.
    summary = {k: {**v} for k, v in institutions.items()}
    for r in safety:
        s = summary.get(r["기관ID"])
        if s is None:
            continue
        if r["항목코드"] == "70461" and r["구분"] == "산업재해 > 사고 사망자수 > 소계":
            s[f"사고사망자_승인_{r['기간'][:4]}"] = r["값"]
        elif r["항목코드"] == "70471" and r["구분"].endswith("소계"):
            s[f"중대재해부상자_{r['기간'][:4]}"] = r["값"]
        elif r["항목코드"] == "70442" and r["구분"] == "종합 등급":
            s[f"안전관리등급_{r['기간'][:4]}"] = r["값"]
        elif (
            r["항목코드"] in ("70451", "70452")
            and r["구분"] == "산업재해 > 사고 사망자수 > 소계"
            and r["기간"] == "계"
        ):
            s[f"사고사망자_발생_{r['공시연도']}_누계({r['공시분기']}분기까지)"] = r["값"]
    base_columns = ["기관ID", "기관명", "기관유형", "주무부처"]
    columns = base_columns + sorted({k for s in summary.values() for k in s} - set(base_columns))
    write_csv(data / "safety_summary.csv", summary.values(), columns)

    # Safety reports (70401): which files each institution published, and where they are kept.
    reports = []
    listing = raw / "items/70401/list.json"
    if listing.exists():
        for o in json.loads(listing.read_text())["organList"]:
            for entry in (o.get("files") or "").split("|"):
                if "@" in entry and entry.split("@")[0]:
                    file_no, name = entry.split("@", 1)
                    saved = list((raw / f"reports/{o['apbaId']}").glob(f"{file_no}_*"))
                    year = re.search(r"(20\d{2})", name)
                    reports.append(
                        {
                            "기관ID": o["apbaId"],
                            "기관명": o["apbaNa"],
                            "파일번호": file_no,
                            "파일명": name,
                            "보고서연도": year.group(1) if year else "",
                            "공시번호": o["disclosureNo"],
                            "원천파일": str(saved[0].relative_to(raw)) if saved else "",
                            "원문": f"https://www.alio.go.kr/item/itemReportTerm.do?apbaId={o['apbaId']}"
                            f"&reportFormRootNo=70401&disclosureNo={o['disclosureNo']}",
                        }
                    )
    write_csv(
        data / "safety_reports.csv",
        reports,
        ["기관ID", "기관명", "파일번호", "파일명", "보고서연도", "공시번호", "원천파일", "원문"],
    )

    guides = json.loads((raw / "guidelines/list.json").read_text())
    write_csv(
        data / "guidelines.csv",
        [
            {
                "게시번호": g["boardNo"],
                "제목": g["rtitle"],
                "게시일": g["bdate"],
                "기관": g["pname"],
            }
            for g in guides
        ],
        ["게시번호", "제목", "게시일", "기관"],
    )
    rules = json.loads((raw / "rules/search.json").read_text())
    write_csv(
        data / "internal_rules.csv",
        [
            {
                "기관ID": r["apbaId"],
                "기관명": r["pname"],
                "규정번호": r["seq"],
                "규정명": r["title"],
                "규정구분": r.get("insdRuleDivis", ""),
                "최근개정": r.get("ruleStDa", ""),
                "검색어": ";".join(r["matched"]),
                "원문": f"https://www.alio.go.kr/occasional/ruleDtl.do?seq={r['seq']}",
            }
            for r in rules
        ],
        ["기관ID", "기관명", "규정번호", "규정명", "규정구분", "최근개정", "검색어", "원문"],
    )
    points = []
    for form, kind in [("B1210", "국회"), ("B1220", "감사원·주무부처")]:
        path = raw / f"points/{form}.json"
        if path.exists():
            for p in json.loads(path.read_text()):
                points.append(
                    {
                        "구분": kind,
                        "기관ID": p.get("apbaId", ""),
                        "기관명": p.get("apbaNa") or p.get("pname", ""),
                        "지적사항": p.get("rtitle", ""),
                        "등록일": p.get("idate", ""),
                        "조치계획등록": p.get("actnPlanRegYmd") or "",
                        "조치결과등록": p.get("actnResRegYmd") or "",
                        "검색어": ";".join(p.get("matched", [])),
                    }
                )
    write_csv(
        data / "audit_points.csv",
        points,
        [
            "구분",
            "기관ID",
            "기관명",
            "지적사항",
            "등록일",
            "조치계획등록",
            "조치결과등록",
            "검색어",
        ],
    )
    saved = sum(1 for r in reports if r["원천파일"])
    counts = {
        f.name: sum(1 for _ in csv.reader(f.open(encoding="utf-8-sig", newline=""))) - 1
        for f in sorted(data.glob("*.csv"))
    }
    (out / "README.md").write_text(
        f"""# 공공기관 안전보건 공시 데이터셋 (ALIO, 2026-10-01 수집)

공공기관 경영정보 공개시스템(ALIO)의 'ESG 운영 > 안전관리' 공시 전부와 관련 자료를 기관 {len(institutions)}곳에 대해 모은 것.
원천: /nas/공공기관안전보건분석/raw/alio-20261001 (받은 그대로), 가공: ai-api/scripts/build_public_ohs_alio.py.

## 파일

| 파일 | 행 | 내용 |
|---|---|---|
| `data/institutions.csv` | {counts["institutions.csv"]:,} | 기관 ID·이름·유형·주무부처 |
| `data/safety_summary.csv` | {counts["safety_summary.csv"]:,} | 기관 1행: 연도별 사고사망자(승인)·중대재해 부상자·안전관리 종합등급, 2026 발생 누계 |
| `data/safety_disclosures.csv` | {counts["safety_disclosures.csv"]:,} | 안전 공시 표 전체(긴 형식): 안전관리등급, 사고사망자(발생·분기/승인·연도), 중대재해 부상자 × 직영·도급·건설발주 |
| `data/staff.csv` | {counts["staff.csv"]:,} | 임직원 수 공시 표 전체(분모 계산용, zip 안에만) |
| `data/safety_reports.csv` | {counts["safety_reports.csv"]:,} | 안전경영책임보고서 첨부 목록(파일명·연도·원문 링크). 파일 자체는 원천에 {saved:,}개 보관 |
| `data/audit_points.csv` | {counts["audit_points.csv"]:,} | 국회·감사원·주무부처 지적사항 중 안전·재해·사고·도급 등 낱말이 제목에 든 것 |
| `data/internal_rules.csv` | {counts["internal_rules.csv"]:,} | 기관 내부규정 중 안전·보건·계약·입찰·적격·도급 등 낱말이 제목에 든 것(원문 링크). 원문 수집 중 |
| `data/guidelines.csv` | {counts["guidelines.csv"]:,} | ALIO 법령자료(재정경제부 지침) 목록 |

## 값의 뜻

- 값은 공시 그대로다. '-'·'해당없음'·빈칸을 0으로 바꾸지 않았다. 숫자로 읽히는 값만 `값_숫자`에 옮겼다.
- 사고사망자 '발생'은 그해 분기 공시(월별 누계), '승인'은 산재 승인 기준 연도별 5개년이다. 둘을 더하지 않는다.
- 직영·도급·건설발주는 **책임 범위**다. 근로자 범위(정규직 등)와 다르다.
- 안전관리등급은 심사 대상 기관만 등급이 있다(2025년 104곳). 나머지는 '해당없음'.
- 공시 표 아래의 기관 공시 담당자 이름·부서·전화번호는 넣지 않았다.

## 한계

- 2026-10-01 시점 최신 공시만 담았다. 지난 분기 발생 공시는 다시 수집해 쌓아야 한다.
- 안전경영책임보고서는 기관마다 형식이 달라 수치로 정리하지 않았다(파일 목록만).
- 지적사항·내부규정은 제목 낱말 검색 결과라 빠지거나 관계없는 것이 섞일 수 있다.

## 이용

ALIO 저작권 정책: 공공데이터법에 따라 영리 목적을 포함해 자유 이용(제3자 권리가 있는 자료 제외). 가공: OSH AI Hub. 별도 라이선스 표기 없음.
""",
        encoding="utf-8",
    )
    import hashlib

    listing = [
        {
            "path": str(f.relative_to(out)),
            "bytes": f.stat().st_size,
            "sha256": hashlib.sha256(f.read_bytes()).hexdigest(),
        }
        for f in sorted(out.rglob("*"))
        if f.is_file()
    ]
    write_csv(out / "files.csv", listing, ["path", "bytes", "sha256"])
    print(
        f"{len(institutions)} institutions, {len(reports)} report files, {len(guides)} guidelines, "
        f"{len(rules)} rules, {len(points)} audit points → {out}"
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
