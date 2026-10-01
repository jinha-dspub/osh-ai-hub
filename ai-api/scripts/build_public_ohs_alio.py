"""Turn the ALIO raw snapshot into the 공공기관 안전보건 공시 dataset.

Usage: python3 scripts/build_public_ohs_alio.py <alio-raw-dir> <out-dir> [law-raw-dir ...]
  alio-raw-dir  /nas/공공기관안전보건분석/raw/alio-20261001 (collect_public_ohs_alio.py)
  law-raw-dir   raw/law-20261001, raw/law-annex-20261001 (collect_public_ohs_law.py), for the
                law part of the source-link index
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


ALIO = "https://www.alio.go.kr"
LAW = "https://www.law.go.kr"


def rule_kind(title: str):
    if re.search(r"안전|보건|재해|위험|사고", title):
        return "안전·보건"
    if re.search(r"계약|입찰|낙찰|적격|구매|조달|도급|용역|공사|협력", title):
        return "계약·입찰"
    return "기타"


def links(raw: Path, laws: list[Path], data: Path, institutions: dict):
    """원문 위치 색인: where every source document can be fetched directly. Files are not
    redistributed; the links point to ALIO and law.go.kr (checked to open without a session
    on 2026-10-01). ALIO disclosure numbers change when an institution files again."""
    folder = data / "links"
    folder.mkdir()
    name = lambda i: institutions.get(i, {}).get("기관명", "")
    rows = []
    for o in json.loads((raw / "items/70401/list.json").read_text())["organList"]:
        for entry in (o.get("files") or "").split("|"):
            if "@" in entry and entry.split("@")[0]:
                file_no, file_name = entry.split("@", 1)
                year = re.search(r"(20\d{2})", file_name)
                rows.append(
                    {
                        "기관ID": o["apbaId"],
                        "기관명": o["apbaNa"],
                        "보고서연도": year.group(1) if year else "",
                        "파일명": file_name,
                        "내려받기": f"{ALIO}/download/file.json?f={file_no}&d={o['disclosureNo']}",
                        "공시화면": f"{ALIO}/item/itemReportTerm.do?apbaId={o['apbaId']}"
                        f"&reportFormRootNo=70401&disclosureNo={o['disclosureNo']}",
                    }
                )
    write_csv(
        folder / "safety_reports.csv",
        rows,
        ["기관ID", "기관명", "보고서연도", "파일명", "내려받기", "공시화면"],
    )
    counts = {"safety_reports.csv": len(rows)}

    rows = []
    for detail in sorted(raw.glob("rules/*/*/detail.json")):
        d = json.loads(detail.read_text())
        files = [f.split("|", 1) for f in (d.get("bFiles") or "").split(",") if "|" in f]
        seq = detail.parent.name
        latest = files[-1] if files else ("", "")
        rows.append(
            {
                "분류": rule_kind(d.get("title", "")),
                "기관ID": detail.parent.parent.name,
                "기관명": d.get("pname") or name(detail.parent.parent.name),
                "규정명": d.get("title", ""),
                "규정구분": d.get("insdRuleDivis", ""),
                "최근개정": d.get("retryRvsnYmd", ""),
                "판수": len(files),
                "최신파일": latest[1],
                "내려받기": f"{ALIO}/download/rulefiledown.json?fileNo={latest[0]}"
                if latest[0]
                else "",
                "규정화면": f"{ALIO}/occasional/ruleDtl.do?seq={seq}",
            }
        )
    rows.sort(key=lambda r: (r["분류"], r["기관명"], r["규정명"]))
    write_csv(
        folder / "internal_rules.csv",
        rows,
        [
            "분류",
            "기관ID",
            "기관명",
            "규정명",
            "규정구분",
            "최근개정",
            "판수",
            "최신파일",
            "내려받기",
            "규정화면",
        ],
    )
    counts["internal_rules.csv"] = len(rows)

    rows = []
    for g in json.loads((raw / "guidelines/list.json").read_text()):
        detail = raw / f"guidelines/{g['boardNo']}/detail.json"
        files = json.loads(detail.read_text()).get("fileList") or [] if detail.exists() else []
        for f in files or [{"fileNo": "", "fileNm": ""}]:
            rows.append(
                {
                    "제목": g["rtitle"],
                    "게시일": g["bdate"],
                    "파일명": f["fileNm"],
                    "내려받기": f"{ALIO}/download/download.json?fileNo={f['fileNo']}"
                    if f["fileNo"]
                    else "",
                    "게시화면": f"{ALIO}/etc/etcLawDtl.do?boardNo={g['boardNo']}",
                }
            )
    write_csv(folder / "guidelines.csv", rows, ["제목", "게시일", "파일명", "내려받기", "게시화면"])
    counts["guidelines.csv"] = len(rows)

    rows = []
    for code, label in {**SAFETY, **STAFF}.items():
        listing = raw / f"items/{code}/list.json"
        if not listing.exists():
            continue
        for o in json.loads(listing.read_text())["organList"]:
            if o.get("disclosureNo"):
                rows.append(
                    {
                        "기관ID": o["apbaId"],
                        "기관명": o["apbaNa"],
                        "항목코드": code,
                        "항목": label,
                        "공시연도": o["critYyyy"],
                        "공시분기": o["critQuar"],
                        "공시PDF": f"{ALIO}/download/pdf.json?disclosureNo={o['disclosureNo']}",
                        "공시화면": f"{ALIO}/item/itemReportTerm.do?apbaId={o['apbaId']}"
                        f"&reportFormRootNo={code}&disclosureNo={o['disclosureNo']}",
                    }
                )
    write_csv(
        folder / "disclosures.csv",
        rows,
        ["기관ID", "기관명", "항목코드", "항목", "공시연도", "공시분기", "공시PDF", "공시화면"],
    )
    counts["disclosures.csv"] = len(rows)

    rows, seen = [], set()
    for root in laws:
        for meta_path in sorted(root.glob("*/*/meta.json")):
            meta = json.loads(meta_path.read_text())
            if not meta.get("found"):
                continue
            page = (
                f"{LAW}/LSW/admRulInfoP.do?admRulSeq={meta['admRulSeq']}"
                if meta.get("admRulSeq")
                else f"{LAW}/LSW/lsInfoP.do?lsiSeq={meta.get('lsiSeq', '')}"
            )
            key = (meta["이름"], "본문")
            if key not in seen:
                seen.add(key)
                rows.append(
                    {
                        "분류": meta["분류"],
                        "문서": meta["이름"],
                        "시행": meta.get("시행", ""),
                        "자료": "본문",
                        "내려받기": "",
                        "원문화면": page,
                    }
                )
            for f in meta.get("files", []):
                key = (meta["이름"], f["flSeq"])
                if key in seen:
                    continue
                seen.add(key)
                rows.append(
                    {
                        "분류": meta["분류"],
                        "문서": meta["이름"],
                        "시행": meta.get("시행", ""),
                        "자료": f["label"],
                        "내려받기": f"{LAW}/LSW/flDownload.do?flSeq={f['flSeq']}",
                        "원문화면": page,
                    }
                )
    write_csv(folder / "laws.csv", rows, ["분류", "문서", "시행", "자료", "내려받기", "원문화면"])
    counts["laws.csv"] = len(rows)
    return counts


def main(raw: Path, out: Path, laws: list[Path]):
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
    link_counts = links(raw, laws, data, institutions)
    print("원문 위치 색인:", link_counts)
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

## 원문 위치 색인 (`data/links/`)

원문 파일은 다시 배포하지 않고, 원래 사이트에서 바로 받는 주소를 분류해 둔다(2026-10-01, 세션 없이 열리는 것 확인).

| 파일 | 행 | 내용 |
|---|---|---|
| `links/safety_reports.csv` | {link_counts["safety_reports.csv"]:,} | 안전경영책임보고서: 기관·보고서 연도·파일명 → ALIO 내려받기 주소, 공시 화면 |
| `links/internal_rules.csv` | {link_counts["internal_rules.csv"]:,} | 내부규정(분류: 안전·보건 / 계약·입찰 / 기타): 최신 원문 내려받기 주소, 규정 화면, 개정 판수 |
| `links/guidelines.csv` | {link_counts["guidelines.csv"]:,} | 정부 지침(공공기관 안전관리 지침 전 판본 등): 첨부 내려받기 주소, 게시 화면 |
| `links/disclosures.csv` | {link_counts["disclosures.csv"]:,} | 안전 공시·임직원 수 공시: 기관별 공시 PDF 주소, 공시 화면 |
| `links/laws.csv` | {link_counts["laws.csv"]:,} | 법령·행정규칙(입찰기준·계약법령·안전법령): 국가법령정보센터 본문 화면, 별표·서식 내려받기 주소 |

ALIO 주소의 공시번호는 기관이 새로 공시하면 바뀐다. 주소가 열리지 않으면 공시 화면이나 ALIO에서 기관·항목으로 다시 찾는다.

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
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]), [Path(p) for p in sys.argv[3:]])
