"""Package the external (non-AIHub) lanyard sets for public download.

Inputs (NAS, read only):
  raw/roboflow-harness-20261001/<set>/        Roboflow Universe exports, CC BY 4.0
  processed/roboflow-ai-labels-20261001-v1/   our AI labels on 5 of those sets
  processed/ppe-ai-labels-20261001-v1/        our AI labels on Ultralytics Construction-PPE
Output: one ZIP per Roboflow set (files as received + SOURCE.md) and one ZIP of AI labels.
ZIP entries get a fixed timestamp so a rebuild is byte-identical.

  python scripts/build_lanyard_external.py <output dir>
"""

import collections
import hashlib
import json
import sys
import zipfile
from pathlib import Path

NAS = Path("/nas/보호구체결현황파악")
RAW = NAS / "raw/roboflow-harness-20261001"
AI = {
    "roboflow-ai-labels.jsonl": NAS / "processed/roboflow-ai-labels-20261001-v1/results.jsonl",
    "construction-ppe-ai-labels.jsonl": NAS / "processed/ppe-ai-labels-20261001-v1/results.jsonl",
}
VERSION = "2026-10-01.1"
STAMP = (2026, 10, 1, 0, 0, 0)

# From raw/roboflow-harness-20261001/MANIFEST.md (rag, 2026-10-01).
SETS = {
    "re-j3euq": ("lkw8161/re-j3euq/4", "auto-orient만, 증강 없음", ""),
    "body-harness": (
        "amara-rachita-qhqvo/body-harness/1",
        "640 정사각으로 늘림, train만 회전 ±24°·블러 ×3 증강",
        "train 폴더는 증강본(원본 1장당 3장)입니다. 원본 그대로는 valid·test입니다.",
    ),
    "gantary": ("dataset-ysydy/gantary/1", "640 정사각으로 늘림, 증강 없음", ""),
    "hooks-project": ("zaki/hooks-project/2", "416 정사각으로 늘림, 증강 없음", ""),
    "safebelt1": ("waterbucket/safebelt1/3", "640 정사각으로 늘림", ""),
    "dyd-safe": (
        "korean-bus/dyd-safe/3",
        "1024로 늘림, 좌우 반전·밝기 ×3 증강",
        (
            "파일명(H-211116_A17_A_UA-…)이 AIHub 자료 형식과 비슷합니다. Roboflow에는 CC BY 4.0으로 "
            "올라와 있지만 원 사진이 AIHub 자료라면 AIHub 이용약관이 함께 적용될 수 있습니다. "
            "확인되지 않았으니 이용 전에 직접 확인하세요."
        ),
    ),
    "projectv-uiuat": (
        "jy-vuh4b/projectv-uiuat/3",
        "모든 버전 회전 ±45°·상하·좌우 반전 ×3 증강",
        "회전·상하 반전 때문에 죔줄의 방향·처짐이 실제와 다릅니다. 죔줄 형태 판정 평가에는 쓰지 마세요.",
    ),
}

SOURCE = """# {name} — Roboflow Universe 공개 데이터셋 사본

- 원본: https://universe.roboflow.com/{project} (버전 {version}), 받은 날 2026-10-01 (COCO 내보내기)
- 저작자: Roboflow 작업공간 `{workspace}` 이용자
- 라이선스: **CC BY 4.0** (원본 `README.dataset.txt`의 표기). 다시 배포하거나 쓸 때는 저작자와 위 원본 URL을
  밝혀야 합니다. https://creativecommons.org/licenses/by/4.0/
- 전처리: {prep}. '늘림(Stretch)'은 가로세로 비율을 바꿔 죔줄 각도·처짐이 원래 사진과 다릅니다.
- 원 사진의 촬영자·출처는 Roboflow에 적혀 있지 않습니다(웹에서 모았을 수 있음). 논문 그림 등에는 출처가 분명한
  사진만 쓰세요.
{note}
## 들어 있는 것
OSH AI Hub가 받은 파일을 바꾸지 않고 그대로 묶었습니다(사진 {images}장, `_annotations.coco.json` {annotations}개,
원본 README 2개). 이 `SOURCE.md`만 OSH AI Hub가 덧붙였습니다.

배포: OSH AI Hub 안전대 체결 라벨링 데이터셋 (https://osh.ai.kr/datasets/lanyard), {release}
"""

LABELS_README = """# 외부 공개 사진 안전대 체결 AI 라벨 (사람 검토 전) {version}

OSH AI Hub 판정기(배포본 `lanyard-analyzer-20261001-v1`: YOLO11m-pose 검출기 + 형태 규칙 v0.5 + R8)와
Claude Opus 5.5(effort medium)가 AIHub 밖 공개 사진에 붙인 라벨입니다. **사람이 확인하지 않은 AI 라벨**입니다.

## 파일
| 파일 | 사진 | 사진 받는 곳 |
|---|---|---|
| `roboflow-ai-labels.jsonl` | {rf_rows}장 (Roboflow 5개 세트: {rf_sets}) | 같은 페이지의 `roboflow-harness-<세트>` ZIP |
| `construction-ppe-ai-labels.jsonl` | {ppe_rows}장 | Ultralytics Construction-PPE (AGPL-3.0), https://docs.ultralytics.com/datasets/detect/construction-ppe/ — 사진은 들어 있지 않음 |

`image`는 원본 데이터셋 안 경로입니다(Roboflow는 `roboflow-harness-20261001/<세트>/<분할>/<파일>`).

## 규모
- Roboflow: 작업자가 나온 사진 {rf_with}장, 작업자 {rf_workers}명 — {rf_labels}
- Construction-PPE: 작업자가 나온 사진 {ppe_with}장, 작업자 {ppe_workers}명 — {ppe_labels}
  (나머지 사진은 안전대 죔줄이 보이지 않는다고 판정)
- 각 파일에서 판정 오류 1장씩(`vlm_status`가 ok가 아님)

## 한 줄의 내용
- `vlm_workers[]` — Claude가 본 작업자: `box`(픽셀), `hook_state`(clipped 체결·unclipped 미체결·parked 거치·
  indeterminate 불명), `hooks`(죔줄별 고리 위치), `location`(추락 위험 위치 여부), `reason`(한국어 근거)
- `result` — 판정기 전체 결과(스키마 `lanyard-tieoff/analyzer-result/0.1`): 검출 죔줄 7점 `polyline`,
  안전대 박스, 형태 규칙 판정, 최종 `hook_state`·`decided_by`, `review_needed`, 요약
- 판정 1장당 Claude 사용액은 `result.vlm.cost_usd`

## 한계
- 사람이 검토하지 않았습니다. 검출되지 않은 작업자·죔줄이 있을 수 있고, 미검출은 안전하다는 뜻이 아닙니다.
- 검출기는 AIHub 163 사진으로 학습했습니다. AIHub 밖 사진에서 정확도는 측정하지 않았습니다.
- Roboflow 일부 세트는 '늘림' 전처리로 가로세로 비율이 바뀌어 형태 규칙이 실제와 다르게 볼 수 있습니다.
- 라벨 파일의 재배포·상업 이용 조건은 확정 전입니다. 연구에 쓸 때는 출처(OSH AI Hub)와 사진 데이터셋의
  저작자·URL을 함께 밝혀 주세요.
"""

LABEL_KO = {"clipped": "체결", "unclipped": "미체결", "parked": "거치", "indeterminate": "불명"}


def write_zip(path, entries):
    """entries: [(archive name, bytes)] -> deterministic ZIP."""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for name, data in entries:
            info = zipfile.ZipInfo(name, STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            out.writestr(info, data)


def label_stats(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    counts, with_workers, sets = collections.Counter(), 0, collections.Counter()
    for row in rows:
        workers = row.get("vlm_workers") or []
        with_workers += bool(workers)
        counts.update(w.get("hook_state") for w in workers)
        parts = row["image"].split("/")
        if parts[0].startswith("roboflow"):
            sets[parts[1]] += 1
    text = " · ".join(f"{LABEL_KO[k]} {counts[k]:,}" for k in LABEL_KO if counts[k])
    return len(rows), with_workers, sum(counts.values()), text, sets


def main(output: Path):
    output.mkdir(parents=True, exist_ok=True)
    built = []
    for name, (project, prep, note) in SETS.items():
        folder = RAW / name
        files = sorted(p for p in folder.rglob("*") if p.is_file())
        images = sum(p.suffix.lower() in {".jpg", ".jpeg", ".png"} for p in files)
        annotations = sum(p.name == "_annotations.coco.json" for p in files)
        workspace, _, version = project.split("/")
        source = SOURCE.format(
            name=name,
            project=project.rsplit("/", 1)[0],
            version=version,
            workspace=workspace,
            prep=prep,
            note=f"\n**주의:** {note}\n" if note else "",
            images=images,
            annotations=annotations,
            release=VERSION,
        )
        entries = [(f"{name}/SOURCE.md", source.encode())]
        entries += [(f"{name}/{p.relative_to(folder).as_posix()}", p.read_bytes()) for p in files]
        target = output / f"roboflow-harness-{name}-{VERSION}.zip"
        write_zip(target, entries)
        built.append(target)
    rf = label_stats(AI["roboflow-ai-labels.jsonl"])
    ppe = label_stats(AI["construction-ppe-ai-labels.jsonl"])
    readme = LABELS_README.format(
        version=VERSION,
        rf_rows=f"{rf[0]:,}",
        rf_sets=", ".join(f"{k} {v:,}" for k, v in rf[4].items()),
        ppe_rows=f"{ppe[0]:,}",
        rf_with=f"{rf[1]:,}",
        rf_workers=f"{rf[2]:,}",
        rf_labels=rf[3],
        ppe_with=f"{ppe[1]:,}",
        ppe_workers=f"{ppe[2]:,}",
        ppe_labels=ppe[3],
    )
    entries = [("README.md", readme.encode())]
    entries += [(name, path.read_bytes()) for name, path in AI.items()]
    sums = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in entries)
    entries.append(("SHA256SUMS", sums.encode()))
    target = output / f"lanyard-external-ai-auto-labels-unreviewed-{VERSION}.zip"
    write_zip(target, entries)
    built.append(target)
    for path in built:
        print(f"{path.stat().st_size / 1e6:8.1f} MB  {path.name}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
