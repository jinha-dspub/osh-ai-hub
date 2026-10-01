"""Flatten support programme demand-log batches into one event table.

Reads  $NAS_DATA/osh-support-programs/raw/demand-log-YYYYMMDD/*.json (one file per batch)
Writes <out>/events.csv  one row per event, with the session's conditions repeated
       <out>/README.md   what the columns mean and which raw days were read

Usage: python3 scripts/build_support_programs_demand.py <out-dir>
Then publish with `nas-put osh-support-programs processed <out-dir> demand-events`.
Raw files are only read. Demand is read as 링크이동 ÷ 노출 per programme, not raw clicks.
"""

import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import support_programs as sp

CONDITIONS = ["신청주체", "근로자수", "업종", "지역", "기업", "유해인자"]
EVENT = ["t", "행동", "사업ID", "범주", "순위", "결과건수", "검색어", "종류"]
COLUMNS = ["날짜", "받은시각", "세션ID", "순번", "판본", *CONDITIONS, *EVENT, "목록"]


def batches(root: Path):
    for folder in sorted(root.glob("demand-log-*")):
        for path in sorted(folder.glob("*.json")):
            yield folder.name.removeprefix("demand-log-"), json.loads(path.read_text())


def rows(root: Path):
    for day, b in batches(root):
        base = {
            "날짜": f"{day[:4]}-{day[4:6]}-{day[6:]}",
            "받은시각": b["받은시각"],
            "세션ID": b["세션ID"],
            "순번": b["순번"],
            "판본": b["판본"],
            **{k: b["조건"][k] for k in CONDITIONS},
        }
        for e in b["이벤트"]:
            yield {
                **base,
                **{k: e.get(k, "") for k in EVENT},
                "목록": ";".join(e.get("목록") or []),
            }


def main(out: Path):
    raw = sp.nas_root() / sp.PROJECT / "raw"
    if not (sp.nas_root() / "README.md").exists():
        sys.exit("NAS not mounted: check `findmnt /nas`")
    out.mkdir(parents=True, exist_ok=False)
    days = sorted(p.name for p in raw.glob("demand-log-*"))
    count = 0
    with (out / "events.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, COLUMNS)
        writer.writeheader()
        for row in rows(raw):
            writer.writerow(row)
            count += 1
    (out / "README.md").write_text(
        f"""# demand-events

`raw/demand-log-*` 묶음을 사건 1개 = 1행으로 편 표. 원천: {days[0] if days else "-"} … {days[-1] if days else "-"} ({len(days)}일), {count:,}행.

- `날짜`·`받은시각`: 서버가 받은 날(KST)과 시각. `t`: 화면을 연 뒤 흐른 밀리초
- `세션ID`·`순번`: 같은 방문의 묶음 차례. 조건 6칸은 그 묶음을 보낼 때의 사업장 조건
- `행동`: 열기·갈래선택·범주선택·검색·조건변경·노출·품목펼침·링크이동·0건
- `목록`: `노출`일 때 화면에 보인 상위 20개 사업ID(`;`로 구분). 이용률 = 사업별 링크이동 ÷ 노출 포함 횟수
- 이름·연락처·사업장명·IP는 원천에도 없다
""",
        encoding="utf-8",
    )
    print(f"{count} events from {len(days)} days → {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
