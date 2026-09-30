"""Build the public 안전대 체결 라벨링 데이터셋 package from the NAS labeling archive.

Only the research team's own annotations are published. AIHub 163 photos and
labels (01_원데이터, 02_AI표기 images) stay out: users apply to AIHub and join
by `aihub_image`. Label Studio exports are dropped because they carry annotator
account ids; everything else they hold is in answers.csv / 사람점_7점.json.

Usage: python scripts/build_lanyard_dataset.py <output dir>
"""

import csv
import hashlib
import io
import json
import os
import sys
import zipfile
from pathlib import Path

VERSION = "2026-09-30.1"
NAME = "안전대 체결 라벨링 데이터셋"
ARCHIVE = (
    Path(os.environ.get("NAS_DATA", "/nas"))
    / "보호구체결현황파악/processed/labeling_archive-20260927"
)
SETS = {
    "①_평가셋_안전고리상태": "죔줄 1개마다 안전고리 상태를 판정 (체결·미체결·거치·불명)",
    "①-b_평가셋_작업자위치": "같은 죔줄의 작업자 위치를 판정 (안정된 지면·추락위험공간)과 추정 근거",
    "①-c_죔줄점_교정": "자동 변환한 죔줄 7점을 사람이 확인·교정한 좌표",
    "①-d_다른현장_평가": "다른 현장 사진 200건의 안전고리 상태 (체결·미체결·거치·unclear)",
    "②_Val불일치_검수": "AIHub 검증셋 라벨과 모델 판정이 다른 56건을 다시 검수",
    "④_블라인드": "자동 표기를 보여 주지 않고 판정한 블라인드 세트",
    "⑤_안전고리_AB": "고리 끝 후보 A/B 중 실제 끝과, 고리가 물린 대상 (structure·body·free·unclear)",
}
HUMAN_FIELDS = [
    "label",
    "memo",
    "line_error",
    "drew_line",
    "lead_time_s",
    "elevated",
    "guessed",
    "guess_reason",
    "hook_end",
    "used_full",
    "absorber",
    "u_hitch",
]
POINT_FIELDS = ["check", "end7", "hidden_guessed", "end1_not_visible", "flipped_by_human"]


def value(raw):
    if raw in ("", None):
        return None
    if raw in ("True", "False"):
        return raw == "True"
    try:
        return float(raw) if "." in raw else int(raw)
    except ValueError:
        return raw


def human(row):
    out = {}
    for key in HUMAN_FIELDS:
        item = value(row.get(key, ""))
        if key == "guess_reason" and item:
            item = item.split("|")
        if item is not None:
            out[key] = item
    return out


def load_set(name):
    auto = json.loads((ARCHIVE / "02_AI표기" / name / "자동표기.json").read_text("utf-8"))
    answers_path = ARCHIVE / "03_사람수정" / name / "answers.csv"
    answers = {}
    if answers_path.exists():
        with answers_path.open(encoding="utf-8") as stream:
            answers = {row["no"]: row for row in csv.DictReader(stream)}
    points = {}
    points_path = ARCHIVE / "03_사람수정" / name / "사람점_7점.json"
    if points_path.exists():
        for row in json.loads(points_path.read_text("utf-8")):
            points[(row["image"], row["instance_id"])] = row
    ab = {}
    ab_path = ARCHIVE / "02_AI표기" / name / "AB_배정.csv"
    if ab_path.exists():
        with ab_path.open(encoding="utf-8") as stream:
            ab = {row["no"]: row for row in csv.DictReader(stream)}
    items = []
    for task in auto:
        no = str(task["no"])
        item = {
            "no": int(no),
            "aihub_image": task["image"],
            "aihub_label_file": Path(task["image"]).stem + ".json",
            "instance_id": task["instance_id"],
            "auto": {
                "polyline": task["auto_polyline_163"],
                "belt_box": task["belt_box"],
                "prelabel": task["prelabel"],
            },
        }
        if no in answers:
            item["human"] = human(answers[no])
        point = points.get((task["image"], task["instance_id"]))
        if point:
            item["human_points"] = {
                **{k: point[k] for k in POINT_FIELDS},
                "polyline": point["polyline"] if point.get("polyline") else None,
            }
        if no in ab:
            item["ab"] = {
                "A_is_auto_end": ab[no]["A_is_auto7"] == "True",
                "weak_label": ab[no]["weak_label"],
            }
        if "human" in item or "human_points" in item:
            items.append(item)  # only tasks someone actually answered
    return sorted(items, key=lambda x: x["no"])


def to_csv(items):
    out = io.StringIO()
    fields = ["no", "aihub_image", "aihub_label_file", "instance_id", "auto_polyline", "belt_box"]
    fields += [f"human_{k}" for k in HUMAN_FIELDS] + ["human_points_check", "human_polyline"]
    fields += ["ab_A_is_auto_end", "ab_weak_label"]
    writer = csv.DictWriter(out, fieldnames=fields)
    writer.writeheader()
    for item in items:
        row = {k: item[k] for k in ("no", "aihub_image", "aihub_label_file", "instance_id")}
        row["auto_polyline"] = json.dumps(item["auto"]["polyline"])
        row["belt_box"] = json.dumps(item["auto"]["belt_box"])
        for key, val in item.get("human", {}).items():
            row[f"human_{key}"] = "|".join(val) if isinstance(val, list) else val
        if "human_points" in item:
            row["human_points_check"] = item["human_points"]["check"]
            row["human_polyline"] = json.dumps(item["human_points"]["polyline"])
        if "ab" in item:
            row["ab_A_is_auto_end"] = item["ab"]["A_is_auto_end"]
            row["ab_weak_label"] = item["ab"]["weak_label"]
        writer.writerow(row)
    return out.getvalue().encode("utf-8-sig")  # BOM so Excel reads Korean


README = """# {name} {version}

OSH AI Hub · 공사현장 사진의 안전대 죔줄 체결 상태를 사람이 검토한 라벨 모음입니다.

## 들어 있는 것
- `lanyard-labels.json` — 전체 라벨(아래 구조). 같은 파일을 단독으로도 받을 수 있습니다.
- `csv/<세트>.csv` — 세트별 표(UTF-8, Excel용 BOM 포함). 좌표는 JSON 문자열입니다.
- `SHA256SUMS` — 파일 확인값.

## 들어 있지 않은 것
- 사진과 AIHub 원본 라벨. 원천은 AIHub「공사현장 안전장비 인식 데이터」(163)이며 이용약관상
  이 패키지로 다시 배포하지 않습니다. AIHub에서 직접 신청한 뒤 `aihub_image`(사진 파일명),
  `aihub_label_file`, `instance_id`(AIHub 라벨의 죔줄 번호)로 맞춰 쓰세요.
- 라벨링 도구 원본 내보내기(작업자 계정 번호 포함).
- OSH AI Hub 판정 화면에 이용자가 올린 사진.

## 좌표
- AIHub 원본 사진의 픽셀 좌표입니다.
- `polyline` 7점: 0번 = 안전대 부착 쪽, 6번 = 안전고리 쪽 끝.
- `auto` = AIHub 폴리곤에서 자동 변환한 값, `human_points` = 사람이 확인·교정한 값(①-c).
- `belt_box` = AIHub 안전대 박스 [x1, y1, x2, y2].

## 세트
{sets}

## 한계와 이용
- 세트마다 질문이 달라 라벨 값을 서로 합산하지 마세요(예: ①은 체결·미체결·거치·불명,
  ⑤는 고리가 물린 대상).
- 사람 판정도 사진으로 구분이 어려운 경우 `불명`·`unclear`로 남겼습니다. 메모는 검토자의 판단 근거입니다.
- 라벨 파일의 재배포·상업 이용 조건은 확정 전입니다. 연구에 쓸 때는 출처(OSH AI Hub 안전대 체결
  라벨링 데이터셋 {version}, AIHub 163)를 밝혀 주세요.
"""


def main(output):
    output.mkdir(parents=True, exist_ok=True)
    sets = []
    for name, description in SETS.items():
        items = load_set(name)
        sets.append({"id": name, "description": description, "count": len(items), "items": items})
    data = {
        "name": NAME,
        "version": VERSION,
        "source": {
            "dataset": "AIHub 공사현장 안전장비 인식 데이터 (163)",
            "images_included": False,
            "join_keys": ["aihub_image", "aihub_label_file", "instance_id"],
        },
        "coordinates": "AIHub original image pixels; polyline[0]=attachment end, [6]=hook end",
        "sets": sets,
    }
    labels = json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8")
    json_path = output / f"lanyard-labels-{VERSION}.json"
    json_path.write_bytes(labels)
    readme = README.format(
        name=NAME,
        version=VERSION,
        sets="\n".join(f"- `{s['id']}` ({s['count']}건) — {s['description']}" for s in sets),
    ).encode("utf-8")
    members = {"README.md": readme, "lanyard-labels.json": labels}
    for s in sets:
        members[f"csv/{s['id']}.csv"] = to_csv(s["items"])
    members["SHA256SUMS"] = "".join(
        f"{hashlib.sha256(body).hexdigest()}  {path}\n" for path, body in members.items()
    ).encode()
    zip_path = output / f"lanyard-labels-{VERSION}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, body in members.items():
            info = zipfile.ZipInfo(path, date_time=(2026, 9, 30, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, body)
    for s in sets:
        print(f"{s['id']}: {s['count']}")
    print(json_path.name, json_path.stat().st_size, zip_path.name, zip_path.stat().st_size)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
