"""Collect the laws, contract rules and bid-evaluation criteria behind public-institution
procurement safety, from 국가법령정보센터 (law.go.kr), for 공공기관 안전보건 분석.

Usage: python3 scripts/collect_public_ohs_law.py <out-dir>
Then: nas-put 공공기관안전보건분석 raw <out-dir> law

Each document is looked up by its exact name (law.go.kr/<법령|행정규칙>/<이름> resolves to the
version in force), and saved as received: the resolver page, the body HTML and every 별표·서식
file linked from the body. law.go.kr robots.txt allows crawling; requests are sequential.
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

BASE = "https://www.law.go.kr"
PAUSE = 0.6
AGENT = "OSH-AI-Hub research collector (osh.ai.kr; public-institution safety analysis)"
# (분류, 종류, 이름). 종류 법령 = statute/decree/rule, 행정규칙 = 예규·고시·지침.
DOCUMENTS = [
    # 낙찰자 결정과 입찰 자격: 안전·산업재해 가감점이 들어가는 기준
    ("입찰기준", "행정규칙", "(계약예규)적격심사기준"),
    ("입찰기준", "행정규칙", "(계약예규)입찰참가자격사전심사요령"),
    ("입찰기준", "행정규칙", "(계약예규)공사계약 종합심사낙찰제 심사기준"),
    ("입찰기준", "행정규칙", "(계약예규)용역계약 종합심사낙찰제 심사기준"),
    ("입찰기준", "행정규칙", "(계약예규)정부 입찰ㆍ계약 집행기준"),
    ("입찰기준", "행정규칙", "(계약예규)협상에 의한 계약체결기준"),
    ("입찰기준", "행정규칙", "(계약예규)공사계약 일반조건"),
    ("입찰기준", "행정규칙", "(계약예규)용역계약 일반조건"),
    ("입찰기준", "행정규칙", "조달청시설공사적격심사세부기준"),
    ("입찰기준", "행정규칙", "조달청기술용역적격심사세부기준"),
    ("입찰기준", "행정규칙", "조달청일반용역적격심사세부기준"),
    ("입찰기준", "행정규칙", "조달청물품구매적격심사세부기준"),
    ("입찰기준", "행정규칙", "조달청입찰참가자격사전심사기준"),
    ("입찰기준", "행정규칙", "조달청 공사계약 종합심사낙찰제 심사세부기준"),
    ("입찰기준", "행정규칙", "조달청 협상에 의한 계약 제안서평가 세부기준"),
    # 공공기관 계약 규정
    ("계약법령", "법령", "공기업ㆍ준정부기관 계약사무규칙"),
    ("계약법령", "행정규칙", "기타공공기관 계약사무 운영규정"),
    ("계약법령", "법령", "국가를 당사자로 하는 계약에 관한 법률"),
    ("계약법령", "법령", "국가를 당사자로 하는 계약에 관한 법률 시행령"),
    ("계약법령", "법령", "국가를 당사자로 하는 계약에 관한 법률 시행규칙"),
    ("계약법령", "법령", "공공기관의 운영에 관한 법률"),
    # 도급·발주자 안전 의무
    ("안전법령", "법령", "산업안전보건법"),
    ("안전법령", "법령", "산업안전보건법 시행령"),
    ("안전법령", "법령", "산업안전보건법 시행규칙"),
    ("안전법령", "법령", "중대재해 처벌 등에 관한 법률"),
    ("안전법령", "법령", "중대재해 처벌 등에 관한 법률 시행령"),
    ("안전법령", "법령", "건설기술 진흥법"),
    ("안전법령", "법령", "건설기술 진흥법 시행령"),
    ("안전법령", "행정규칙", "건설공사 안전관리 업무수행 지침"),
    ("안전법령", "행정규칙", "건설업 산업안전보건관리비 계상 및 사용기준"),
    ("안전법령", "행정규칙", "공공기관의 안전활동 수준평가에 관한 고시"),
]


class Client:
    def __init__(self, out: Path):
        self.log = (out / "requests.jsonl").open("a", encoding="utf-8")

    def get(self, url, data=None):
        for attempt in range(4):
            try:
                time.sleep(PAUSE)
                body = urllib.parse.urlencode(data).encode() if data else None
                request = urllib.request.Request(url, data=body, headers={"User-Agent": AGENT})
                with urllib.request.urlopen(request, timeout=90) as response:
                    content = response.read()
                    final = response.geturl()
                self.log.write(
                    json.dumps(
                        {
                            "at": datetime.now(UTC).isoformat(timespec="seconds"),
                            "url": url,
                            "data": data,
                            "final": final,
                            "bytes": len(content),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                self.log.flush()
                return content, final
            except OSError as error:
                if attempt == 3:
                    print(f"  failed {url}: {error}", flush=True)
                    return None, url
                time.sleep(5 * (attempt + 1))


def file_links(html):
    """(flSeq, label) for every 별표·서식 file. 행정규칙 links carry the name (flNm=); 법령 links
    sit after a "[별표 N] 제목" anchor and say only which format they are."""
    found = re.findall(r"flDownload\.do\?flSeq=(\d+)&amp;flNm=([^&\"']*)", html)
    for title, tail in re.findall(
        r"bylInfoDiv\('\d+'\);\" href=\"#AJAX\">\s*([^<]+?)\s*</a>(.{0,600})", html, re.DOTALL
    ):
        for seq, kind in re.findall(
            r"flDownload\.do\?gubun=&amp;flSeq=(\d+)&amp;bylClsCd=\d+\"[^>]*>\s*<img alt=\"(\w+)파일",
            tail,
        ):
            found.append((seq, urllib.parse.quote_plus(f"{title} {kind}")))
    return found


def collect(c: Client, out: Path, group, kind, name):
    slug = re.sub(r"[\\/:*?\"<>|\s()ㆍ·]+", "", name)
    folder = out / group / slug
    if (folder / "meta.json").exists():
        return json.loads((folder / "meta.json").read_text())
    folder.mkdir(parents=True, exist_ok=True)
    meta = {"분류": group, "종류": kind, "이름": name, "found": False}
    page, _final = c.get(
        f"{BASE}/{urllib.parse.quote(kind)}/{urllib.parse.quote(name.replace(' ', ''))}"
    )
    if not page:
        (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
        return meta
    (folder / "resolve.html").write_bytes(page)
    text = page.decode("utf-8", "ignore")
    title = re.search(r"<title>([^<]*)", text)
    meta["resolved_title"] = title.group(1).strip() if title else ""
    if kind == "행정규칙":
        seq = re.search(r"admRulSeq=(\d+)", text)
        if seq:
            meta["admRulSeq"] = seq.group(1)
            body, _ = c.get(
                f"{BASE}/LSW/admRulLsInfoR.do", {"admRulSeq": seq.group(1), "chrClsCd": "010201"}
            )
    else:
        seq = re.search(r"lsiSeq=(\d+)[^\"']*?efYd=(\d+)", text) or re.search(r"lsiSeq=(\d+)", text)
        if seq:
            meta["lsiSeq"] = seq.group(1)
            data = {"lsiSeq": seq.group(1), "chrClsCd": "010202", "ancYnChk": "0"}
            if seq.lastindex and seq.lastindex > 1:
                data["efYd"] = meta["efYd"] = seq.group(2)
            body, _ = c.get(f"{BASE}/LSW/lsInfoR.do", data)
    if seq and body:
        meta["found"] = True
        (folder / "body.html").write_bytes(body)
        plain = re.sub(
            r"<[^>]+>",
            "\n",
            re.sub(r"<script.*?</script>", "", body.decode("utf-8", "ignore"), flags=re.DOTALL),
        )
        head = [line.strip() for line in plain.splitlines() if line.strip().startswith("[시행")]
        meta["시행"] = head[0] if head else ""
        links = dict.fromkeys(file_links(body.decode("utf-8", "ignore")))
        meta["files"] = []
        for fl_seq, fl_name in links:
            label = urllib.parse.unquote_plus(fl_name)
            content, _ = c.get(f"{BASE}/LSW/flDownload.do?flSeq={fl_seq}")
            if content:
                ext = {b"%PDF": ".pdf", b"\xd0\xcf\x11\xe0": ".hwp", b"PK\x03\x04": ".zip"}.get(
                    content[:4], ".bin"
                )
                # Korean is 3 bytes a character; keep names well under the 255-byte limit.
                short = re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", label)[:50]
                target = folder / f"{fl_seq}_{short}{ext}"
                target.write_bytes(content)
                meta["files"].append(
                    {"flSeq": fl_seq, "label": label, "file": target.name, "bytes": len(content)}
                )
    (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return meta


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    c = Client(out)
    found = []
    for group, kind, name in DOCUMENTS:
        meta = collect(c, out, group, kind, name)
        print(
            f"{'OK ' if meta['found'] else 'MISS'} {group} {name} {meta.get('시행', '')} "
            f"별표·서식 {len(meta.get('files', []))}",
            flush=True,
        )
        found.append(meta)
    (out / "documents.json").write_text(json.dumps(found, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
