"""Build the AI-only label package: detector + shape-rule output for every training photo.

Labels only. Photos stay with AIHub (users join by `aihub_image`). Confidence is the
detector score; its meaning is measured against the human-reviewed set ① (455 lanyards):
agreement with the human verdict per confidence band.

Usage: python scripts/build_lanyard_ai_labels.py <output dir>
"""

import csv
import hashlib
import json
import math
import os
import sys
import zipfile
from collections import Counter
from itertools import pairwise
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import lanyard

VERSION = "2026-09-30.1"
NAS = Path(os.environ.get("NAS_DATA", "/nas")) / "보호구체결현황파악"
SPLITS = NAS / "processed/derived-20260929/kp_yolo/images"
ORIGINAL_PREFIX = "/home/rag/safetybread/보호구체결현황파악/data/raw/aihub163/"
RAW = NAS / "raw/aihub163-20260921"
REVIEW = NAS / "processed/labeling_archive-20260927"
BANDS = [(0.25, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.01)]


def source(link: Path):
    """kp_yolo images are links into the rag server's data dir; read the NAS raw copy."""
    target = os.readlink(link)
    if not target.startswith(ORIGINAL_PREFIX):
        raise ValueError(f"Unexpected image link: {link.name}")
    return RAW / target[len(ORIGINAL_PREFIX) :]


def predict(path: Path):
    from PIL import Image, ImageOps

    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    result = lanyard.detector().predict(
        image, verbose=False, device=lanyard.device(), **lanyard.DETECTOR
    )[0]
    rules = lanyard.rules()
    lanyards, harnesses = [], []
    if result.boxes is not None and len(result.boxes):
        points = result.keypoints.xy.tolist()
        point_conf = result.keypoints.conf.tolist() if result.keypoints.conf is not None else None
        for i, (cls, box, conf) in enumerate(
            zip(result.boxes.cls.tolist(), result.boxes.xyxy.tolist(), result.boxes.conf.tolist())
        ):
            box = [round(v, 1) for v in box]
            if int(cls) == lanyard.HARNESS:
                harnesses.append({"box": box, "conf": round(conf, 3)})
            elif int(cls) == lanyard.LANYARD and len(points[i]) == 7:
                lanyards.append(
                    {
                        "box": box,
                        "conf": round(conf, 3),
                        "polyline": [[round(x, 1), round(y, 1)] for x, y in points[i]],
                        "point_conf": [round(c, 3) for c in point_conf[i]] if point_conf else None,
                    }
                )
    lanyards = lanyard.dedupe(lanyards)
    belts = [h["box"] for h in harnesses]
    for item in lanyards:
        belt = lanyard.pair_harness(item["polyline"][0], belts)
        label, why = rules.judge_v05(rules.features(item["polyline"], belt), item["polyline"], belt)
        item["harness_box"] = belt
        item["label"] = label
        item["why"] = why
    return image.size, lanyards, harnesses


def distance(a, b):
    forward = sum(math.dist(p, q) for p, q in zip(a, b)) / 7
    backward = sum(math.dist(p, q) for p, q in zip(a, reversed(b))) / 7
    return min(forward, backward)


def band(conf):
    return next(f"{lo:.2f}–{min(hi, 1):.2f}" for lo, hi in BANDS if lo <= conf < hi)


def calibrate():
    """Match predictions to human set ① and measure agreement per confidence band."""
    auto = json.loads((REVIEW / "02_AI표기/①_평가셋_안전고리상태/자동표기.json").read_text())
    with (REVIEW / "03_사람수정/①_평가셋_안전고리상태/answers.csv").open(encoding="utf-8") as f:
        human = {row["no"]: row["label"] for row in csv.DictReader(f)}
    cache, rows = {}, []
    for task in auto:
        answer = human.get(str(task["no"]))
        if answer is None:
            continue
        name = task["image"]
        if name not in cache:
            cache[name] = predict(REVIEW / "01_원데이터/images" / name)[1]
        reference = task["auto_polyline_163"]
        length = sum(math.dist(p, q) for p, q in pairwise(reference)) or 1
        best = min(cache[name], key=lambda p: distance(p["polyline"], reference), default=None)
        if best is None or distance(best["polyline"], reference) > 0.5 * length:
            rows.append({"human": answer, "matched": False})
            continue
        rows.append({"human": answer, "matched": True, "conf": best["conf"], "ai": best["label"]})
    table = []
    for lo, hi in BANDS:
        inside = [r for r in rows if r["matched"] and lo <= r["conf"] < hi]
        decided = [r for r in inside if r["human"] != "불명" and r["ai"] != "불명"]
        agree = sum(r["human"] == r["ai"] for r in decided)
        # 체결 vs not (미체결·거치 both mean "not on a structure").
        clipped = sum((r["human"] == "체결") == (r["ai"] == "체결") for r in decided)
        table.append(
            {
                "band": band(lo),
                "lanyards": len(inside),
                "both_decided": len(decided),
                "agree": agree,
                "agreement": round(agree / len(decided), 3) if decided else None,
                "clipped_agree": clipped,
                "clipped_agreement": round(clipped / len(decided), 3) if decided else None,
                "ai_unknown": sum(r["ai"] == "불명" for r in inside),
            }
        )
    return {
        "reference": "사람 검토 세트 ① 평가셋 안전고리상태 (죔줄 455개)",
        "reviewed": len(rows),
        "not_detected": sum(not r["matched"] for r in rows),
        "bands": table,
        "human_labels": dict(Counter(r["human"] for r in rows)),
        "note": (
            "일치율 = 사람과 AI가 모두 체결·미체결·거치 중 하나로 판정한 죔줄 중 같은 판정 비율. "
            "체결 여부 일치율 = 같은 죔줄에서 '체결'과 '체결 아님(미체결·거치)'이 일치한 비율"
        ),
    }


def pct(part, whole):
    return f"{part / whole:.0%} ({part}/{whole})" if whole else "-"


README = """# 안전대 체결 AI 라벨 (사람 검토 전) {version}

OSH AI Hub 1단계 검출기(YOLO11m-pose, 배포본 {release})와 형태 규칙 v0.5가 AIHub「공사현장
안전장비 인식 데이터」(163) 사진 {images:,}장에 붙인 라벨입니다. **사람이 확인하지 않은 AI 라벨**이며
사진은 들어 있지 않습니다. AIHub에서 사진을 신청한 뒤 `aihub_image`로 맞추세요.

## 규모
- 사진 {images:,}장 (train {train:,} · val {val:,} · test {test:,})
- 검출된 죔줄 {lanyards:,}개, 안전대 {harnesses:,}개
- 판정: {labels}

## 파일
- `ai-labels.jsonl` — 사진 1장당 한 줄. 좌표는 원본 사진 픽셀.
  `lanyards[]`: `box`, `conf`(검출 신뢰도), `polyline`(7점, 0=부착 쪽·6=고리 쪽 끝), `point_conf`(점별 신뢰도),
  `harness_box`, `label`(체결·미체결·거치·불명), `why`(규칙 근거). `harnesses[]`: `box`, `conf`.
- `confidence.json` — 신뢰 범위(아래 표).
- `SHA256SUMS`

## 신뢰 범위
검출 신뢰도는 모델 점수이지 정확도가 아닙니다. 의미를 가늠하도록 사람 검토 세트 ①(죔줄 {reviewed}개)에
같은 모델을 돌려 신뢰도 구간별로 사람 판정과 비교했습니다. 이 중 {not_detected}개는 검출되지 않았습니다.
사람 판정 분포: {human_labels}. 사람은 ‘거치’를 많이 골랐지만 형태 규칙은 거치를 드물게 내므로,
3종 판정 일치율보다 ‘체결 여부’(체결 vs 미체결·거치) 일치율이 실제 쓰임에 가깝습니다.
비교에 쓴 사진은 검출기 학습에 쓰지 않은 test 425장·분할 밖 30장입니다(train·val 0장).

| 검출 신뢰도 | 죔줄 | 둘 다 판정 | 판정 일치율 (3종) | 체결 여부 일치율 | AI 불명 |
|---|---|---|---|---|---|
{table}

## 한계
- `split`이 train·val인 사진은 검출기 학습에 쓰였습니다. 이 사진들의 신뢰도는 새 사진보다 높게 나옵니다.
- 형태 규칙은 죔줄 모양만 봅니다. 안전고리 자체는 검출하지 않습니다.
- 라벨 파일의 재배포·상업 이용 조건은 확정 전입니다. 연구에 쓸 때는 출처(OSH AI Hub, AIHub 163)를 밝혀 주세요.
"""


def stats(lines):
    counts, labels, lanyards, harnesses = Counter(), Counter(), 0, 0
    for line in lines:
        item = json.loads(line)
        counts[item["split"]] += 1
        lanyards += len(item["lanyards"])
        harnesses += len(item["harnesses"])
        labels.update(x["label"] for x in item["lanyards"])
    return counts, labels, lanyards, harnesses


def main(output: Path, reuse=False):
    output.mkdir(parents=True, exist_ok=True)
    lines, counts, labels = [], Counter(), Counter()
    lanyards = harnesses = 0
    if reuse:  # recompute confidence only, keep the per-photo labels already built
        with zipfile.ZipFile(output / f"lanyard-ai-labels-{VERSION}.zip") as old:
            lines = old.read("ai-labels.jsonl").decode("utf-8").rstrip("\n").split("\n")
        counts, labels, lanyards, harnesses = stats(lines)
    for split in () if reuse else ("train", "val", "test"):
        for link in sorted((SPLITS / split).iterdir()):
            (width, height), found, belts = predict(source(link))
            lines.append(
                json.dumps(
                    {
                        "aihub_image": link.name,
                        "aihub_label_file": link.stem + ".json",
                        "split": split,
                        "used_in_training": split in ("train", "val"),
                        "width": width,
                        "height": height,
                        "lanyards": found,
                        "harnesses": belts,
                    },
                    ensure_ascii=False,
                )
            )
            counts[split] += 1
            lanyards += len(found)
            harnesses += len(belts)
            labels.update(item["label"] for item in found)
            if sum(counts.values()) % 1000 == 0:
                print("images", sum(counts.values()), flush=True)
    confidence = calibrate()
    jsonl = ("\n".join(lines) + "\n").encode("utf-8")
    conf_json = json.dumps(confidence, ensure_ascii=False, indent=1).encode("utf-8")
    table = "\n".join(
        f"| {b['band']} | {b['lanyards']} | {b['both_decided']} | "
        f"{pct(b['agree'], b['both_decided'])} | {pct(b['clipped_agree'], b['both_decided'])} | "
        f"{b['ai_unknown']} |"
        for b in confidence["bands"]
    )
    readme = README.format(
        version=VERSION,
        release=lanyard.RELEASE,
        images=sum(counts.values()),
        lanyards=lanyards,
        harnesses=harnesses,
        labels=", ".join(f"{k} {v:,}" for k, v in labels.most_common()),
        reviewed=confidence["reviewed"],
        not_detected=confidence["not_detected"],
        human_labels=", ".join(f"{k} {v}" for k, v in confidence["human_labels"].items()),
        table=table,
        **counts,
    ).encode("utf-8")
    files = {"README.md": readme, "ai-labels.jsonl": jsonl, "confidence.json": conf_json}
    files["SHA256SUMS"] = "".join(
        f"{hashlib.sha256(body).hexdigest()}  {path}\n" for path, body in files.items()
    ).encode()
    zip_path = output / f"lanyard-ai-labels-{VERSION}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, body in files.items():
            info = zipfile.ZipInfo(path, date_time=(2026, 9, 30, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, body)
    (output / "README.md").write_bytes(readme)
    (output / "confidence.json").write_bytes(conf_json)
    print(dict(counts), lanyards, harnesses, zip_path.stat().st_size)
    print(table)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--confidence-only":
        main(Path(sys.argv[2]), reuse=True)
    elif len(sys.argv) == 2:
        main(Path(sys.argv[1]))
    else:
        sys.exit(__doc__)
