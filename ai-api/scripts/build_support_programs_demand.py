"""Flatten support programme demand-log batches into one event table.

Reads  $NAS_DATA/osh-support-programs/raw/demand-log-YYYYMMDD/*.json (one file per batch)
Writes <out>/events.csv          one row per event, with the session's conditions repeated
       <out>/interpretations.csv one row per AI 조건 채우기 request (<세션ID>-ai-<요청ID>.json)
       <out>/README.md           what the columns mean and which raw days were read

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
EVENT = ["t", "행동", "사업ID", "범주", "순위", "결과건수", "검색어", "종류", "요청ID"]
LISTS = ["목록", "분류", "받는방식", "항목"]
COLUMNS = ["날짜", "받은시각", "세션ID", "순번", "판본", "자료판", *CONDITIONS, *EVENT, *LISTS]
FIELDS = ["신청주체", "근로자수", "업종", "지역", "기업", "유해인자", "분류", "키워드"]
AI_COLUMNS = [
    "날짜",
    "받은시각",
    "세션ID",
    "요청ID",
    "판본",
    "자료판",
    "모델",
    "설명",
    *[f"제안_{k}" for k in FIELDS],
    "버린항목",
    "입력토큰",
    "출력토큰",
    "오류",
]


def files(root: Path, ai: bool):
    for folder in sorted(root.glob("demand-log-*")):
        for path in sorted(folder.glob("*.json")):
            if ("-ai-" in path.name) == ai:
                yield folder.name.removeprefix("demand-log-"), json.loads(path.read_text())


def batches(root: Path):
    return files(root, ai=False)


def interpretations(root: Path):
    for day, r in files(root, ai=True):
        proposal = r.get("제안") or {}
        yield {
            "날짜": f"{day[:4]}-{day[4:6]}-{day[6:]}",
            **{k: r.get(k, "") for k in ["받은시각", "세션ID", "요청ID", "판본", "자료판", "모델"]},
            "설명": r["설명"],
            **{
                f"제안_{k}": ";".join(v) if isinstance(v := proposal.get(k, ""), list) else v
                for k in FIELDS
            },
            "버린항목": ";".join(r.get("버린항목") or []),
            "입력토큰": (r.get("토큰") or {}).get("입력", ""),
            "출력토큰": (r.get("토큰") or {}).get("출력", ""),
            "오류": r.get("오류", ""),
        }


def rows(root: Path):
    for day, b in batches(root):
        base = {
            "날짜": f"{day[:4]}-{day[4:6]}-{day[6:]}",
            "받은시각": b["받은시각"],
            "세션ID": b["세션ID"],
            "순번": b["순번"],
            "판본": b["판본"],
            "자료판": b.get("자료판", ""),
            **{k: b["조건"][k] for k in CONDITIONS},
        }
        for e in b["이벤트"]:
            yield {
                **base,
                **{k: e.get(k, "") for k in EVENT},
                **{k: ";".join(e.get(k) or []) for k in LISTS},
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
    asked = 0
    with (out / "interpretations.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, AI_COLUMNS)
        writer.writeheader()
        for row in interpretations(raw):
            writer.writerow(row)
            asked += 1
    (out / "README.md").write_text(
        f"""# demand-events

`raw/demand-log-*` 묶음을 사건 1개 = 1행으로 편 표. 원천: {days[0] if days else "-"} … {days[-1] if days else "-"} ({len(days)}일), {count:,}행.
AI 조건 채우기 요청은 `interpretations.csv`에 요청 1건 = 1행, {asked:,}행.

- `날짜`·`받은시각`: 서버가 받은 날(KST)과 시각. `t`: 화면을 연 뒤 흐른 밀리초
- `세션ID`·`순번`: 같은 방문의 묶음 차례. 조건 6칸은 그 묶음을 보낼 때의 사업장 조건
- `행동`: 열기·분류선택·분류해제·받는방식선택·받는방식해제·검색·조건변경·노출·품목펼침·링크이동·0건·
  AI제안·AI적용·AI수정. 갈래선택·범주선택은 2026-10-01 v1 화면(스키마 2)의 옛 3갈래·9범주
- `자료판`: 스키마 3 화면이 본 serving 판본(예: 20261001-v2). 비어 있으면 v1 화면
- `분류`·`받는방식`: 그때 고른 분류(9개)와 받는 방식(4개), `;`로 구분
- `목록`: `노출`일 때 화면에 보인 상위 20개 사업ID(`;`로 구분). 이용률 = 사업별 링크이동 ÷ 노출 포함 횟수
- `요청ID`·`항목`: AI제안이 채운 칸, AI적용 때 남긴 칸, AI수정 때 사람이 고친 칸. `interpretations.csv`와 요청ID로 잇는다
- `interpretations.csv`의 `설명`은 방문자가 쓴 원문(전화번호·이메일·사업자번호는 서버가 가림).
  사업장명 등이 남아 있을 수 있으니 외부 공유 전 연구책임자 확인. `버린항목`은 근거 문구가 설명에 없어 버린 칸
- 묶음 파일(events.csv)에는 이름·연락처·사업장명·IP가 없다
""",
        encoding="utf-8",
    )
    print(f"{count} events from {len(days)} days → {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
