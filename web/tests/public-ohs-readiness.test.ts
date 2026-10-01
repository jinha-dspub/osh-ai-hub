import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applies,
  evaluate,
  judge,
  type Item,
  type Threshold,
} from "../demo/public-ohs-readiness/rules";

// DEMO rules and thresholds shaped like data/checklist.jsonl and duty_thresholds.json.
const table: Threshold = {
  근거: ["DEMO", "별표"],
  표: [
    { 업종: ["C25", "C29"], 최소: 50 },
    { 업종: ["K64", "C26"], 최소: 300 },
  ],
  애매: ["J58"],
  건설: "공사금액 20억원 이상 현장",
  기본: 100,
};
const thresholds = { 안전관리자: table };
const item = (over: Partial<Item>): Item => ({
  id: "DEMO-01",
  목적: ["건설공사"],
  구분: "입찰 감점",
  제목: "DEMO",
  판정: { 종류: "감점", 필드: "f", 점수: { 없음: 0, 있음: -3 } },
  영향: "",
  준비: [],
  근거: [],
  ...over,
});

describe("public OHS readiness rules", () => {
  it("judges penalties and bonuses, unknown means check", () => {
    const penalty = item({});
    expect(judge(penalty, { f: "있음" }, thresholds)).toMatchObject({
      status: "부족",
      points: -3,
    });
    expect(judge(penalty, { f: "없음" }, thresholds).status).toBe("충족");
    expect(judge(penalty, { f: "모름" }, thresholds).status).toBe("확인 필요");
    const bonus = item({
      구분: "입찰 가점",
      판정: {
        종류: "가점",
        필드: "f",
        점수: { A: 1, B: 0.8, 없음: 0 },
        조건: { 필드: "c", 값: "예", 아니면: "건설분야 인증만 인정" },
      },
    });
    expect(judge(bonus, { f: "B", c: "예" }, thresholds)).toMatchObject({
      status: "충족",
      points: 0.8,
    });
    expect(judge(bonus, { f: "A", c: "아니오" }, thresholds).status).toBe(
      "부족",
    );
    expect(judge(bonus, { f: "A", c: "모름" }, thresholds).status).toBe(
      "확인 필요",
    );
    expect(judge(bonus, { f: "없음" }, thresholds).status).toBe("부족");
  });

  it("applies duty thresholds by industry and size", () => {
    expect(applies(table, "C25", 60).applies).toBe(true);
    expect(applies(table, "C25", 40).applies).toBe(false);
    expect(applies(table, "K64", 120).applies).toBe(false);
    expect(applies(table, "G47", 120).applies).toBe(true); // 기본 100
    expect(applies(table, "J58", 120).applies).toBe(null); // 애매
    expect(applies(table, "J58", 10).applies).toBe(false); // below every bar
    expect(applies(table, "F41", 500).applies).toBe(null); // 건설은 현장 기준
    expect(applies(table, "C", 120).applies).toBe(null); // section split across rows
    expect(applies(table, "모름", 120).applies).toBe(null);
    expect(applies(table, "C25", null).applies).toBe(null);
    const none = { ...table, 기본: null };
    expect(applies(none, "G47", 900).applies).toBe(false);
  });

  it("marks duties as not applicable, missing or met", () => {
    const duty = item({
      구분: "법정 의무",
      판정: {
        종류: "의무",
        필드: "안전관리자",
        적용: "기준표",
        기준표: "안전관리자",
      },
    });
    const p = { 업종: "C25", 상시근로자수: 60 };
    expect(judge(duty, { ...p, 안전관리자: "아니오" }, thresholds).status).toBe(
      "부족",
    );
    expect(judge(duty, { ...p, 안전관리자: "예" }, thresholds).status).toBe(
      "충족",
    );
    expect(
      judge(duty, { ...p, 상시근로자수: 10, 안전관리자: "아니오" }, thresholds)
        .status,
    ).toBe("해당 없음");
    const subcontract = item({
      판정: { 종류: "의무", 필드: "수급인_평가기준", 적용: "하도급" },
    });
    expect(
      judge(
        subcontract,
        { 하도급사용: "아니오", 수급인_평가기준: "아니오" },
        thresholds,
      ).status,
    ).toBe("해당 없음");
    expect(
      judge(
        subcontract,
        { 하도급사용: "예", 수급인_평가기준: "아니오" },
        thresholds,
      ).status,
    ).toBe("부족");
    const five = item({ 판정: { 종류: "의무", 필드: "x", 적용: "5인이상" } });
    expect(
      judge(five, { 상시근로자수: 3, x: "아니오" }, thresholds).status,
    ).toBe("확인 필요");
    expect(
      judge(five, { 상시근로자수: 30, x: "아니오" }, thresholds).status,
    ).toBe("부족");
  });

  it("evaluates only the picked purposes", () => {
    const items = [item({}), item({ id: "DEMO-02", 목적: ["물품"] })];
    const out = evaluate(items, { f: "있음" }, thresholds, ["물품"]);
    expect(out.judged.map((j) => j.item.id)).toEqual(["DEMO-02"]);
    expect(out.counts.부족).toBe(1);
  });
});

// The real dataset on the NAS: every field a rule reads exists in the profile schema.
const root = `${process.env.NAS_DATA ?? "/nas"}/공공기관안전보건분석/serving/current/data`;
describe.skipIf(!existsSync(`${root}/checklist.jsonl`))(
  "readiness dataset",
  () => {
    it("reads only known fields and judges an empty profile without errors", () => {
      const items = readFileSync(`${root}/checklist.jsonl`, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as Item);
      const fields = readFileSync(`${root}/profile_fields.csv`, "utf8")
        .split(/\r?\n/)
        .slice(1)
        .map((l) => l.replace(/^\uFEFF/, "").split(",")[0]);
      for (const i of items) expect(fields).toContain(i.판정.필드);
      const t = JSON.parse(
        readFileSync(`${root}/duty_thresholds.json`, "utf8"),
      );
      const out = evaluate(items, {}, t, [
        "건설공사",
        "일반용역",
        "물품",
        "현장작업",
      ]);
      expect(out.judged).toHaveLength(items.length);
      expect(out.counts.충족).toBe(0);
    });
  },
);
