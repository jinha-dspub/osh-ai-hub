import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  amount,
  evaluate,
  industryMatches,
  judge,
  normalize,
  score,
  searchText,
  wayOf,
  type Condition,
  type Program,
} from "../demo/osh-support-programs/rules";
import { divisions, sections } from "../demo/osh-support-programs/ksic";

const base: Condition = {
  who: "전체",
  workers: 30,
  industry: "C25",
  region: "전국",
  business: "모름",
  hazard: "모름",
  query: "",
};
// DEMO rows only; field names follow programs.csv.
function row(over: Partial<Program>): Program {
  const blank = Object.fromEntries(
    [
      "사업ID",
      "사업명",
      "세부사업명",
      "지원범주",
      "지원형태",
      "대상단위",
      "기관구분",
      "근로자수_하한",
      "근로자수_상한_미만",
      "근로자수_기준",
      "규모조건_결합",
      "공사금액_상한_억원_미만",
      "대상업종",
      "제외업종",
      "지역",
      "산재보험_가입필요",
      "보험료체납_제외",
      "유해인자_보유필요",
      "유해인자_종류",
      "기타대상조건",
      "제외대상",
      "중복지원_제한",
      "원청부담",
      "원문_대상표현",
      "검증상태",
      "기준연도",
      "지원비율_최대_퍼센트",
      "지원한도_원",
      "한도단위",
      "추가한도_원",
      "융자금리_퍼센트",
      "거치_년",
      "분할상환_년",
      "보험료_인하_퍼센트",
      "혜택기간_년",
      "지원횟수",
    ].map((k) => [k, ""]),
  );
  return {
    ...blank,
    사업ID: "DEMO-01",
    사업명: "DEMO 사업",
    지원범주: "설비·시설 개선",
    분류: "설비개선",
    지원형태: "보조금",
    대상단위: "사업주",
    기관구분: "DEMO",
    근로자수_기준: "상시근로자",
    규모조건_결합: "단독",
    대상업종: "전체",
    지역: "전국",
    검증상태: "공식",
    기준연도: "2026",
    ...over,
  };
}

describe("support programme rules", () => {
  it("excludes by size unless the small-business alternative is unknown or met", () => {
    const r = row({ 근로자수_상한_미만: "50", 규모조건_결합: "또는_소기업" });
    expect(judge(r, { ...base, workers: 49 })[0]).toBe("해당");
    expect(judge(r, { ...base, workers: 80 })[0]).toBe("확인필요");
    expect(judge(r, { ...base, workers: 80, business: "소" })[0]).toBe("해당");
    expect(judge(r, { ...base, workers: 80, business: "중" })).toEqual([
      "제외",
      ["50인 미만만(소기업 아님)"],
    ]);
    expect(judge(row({ 근로자수_하한: "5" }), { ...base, workers: 4 })[0]).toBe(
      "제외",
    );
  });

  it("matches KSIC prefixes in both directions and provisional names", () => {
    expect(industryMatches("제조업", "C25")).toBe(true);
    expect(industryMatches("C31", "C")).toBe(true);
    expect(industryMatches("조선", "C31")).toBe(true);
    expect(industryMatches("건설업", "C25")).toBe(false);
    expect(industryMatches("서비스 및 기타업종", "F41")).toBe(false);
  });

  it("keeps construction-site size as a check instead of asking contract value", () => {
    const site = row({
      공사금액_상한_억원_미만: "50",
      근로자수_기준: "해당없음(공사금액 기준)",
      대상업종: "건설업",
    });
    expect(judge(site, base)).toEqual(["제외", ["건설현장 대상"]]);
    expect(judge(site, { ...base, industry: "F41" })[0]).toBe("확인필요");
  });

  it("separates regional and personal programmes", () => {
    const local = row({ 지역: "울산 북구" });
    expect(judge(local, base)[0]).toBe("지역사업");
    expect(judge(local, { ...base, region: "부산" })[0]).toBe("타지역");
    expect(judge(local, { ...base, region: "울산" })[0]).toBe("확인필요");
    expect(judge(row({ 대상단위: "근로자" }), base)[0]).toBe("개인대상");
  });

  it("requires hazards only when the programme does", () => {
    const r = row({ 유해인자_보유필요: "Y", 유해인자_종류: "소음" });
    expect(judge(r, { ...base, hazard: "N" })[0]).toBe("제외");
    expect(judge(r, { ...base, hazard: "Y" })[0]).toBe("해당");
    expect(judge(r, base)[0]).toBe("확인필요");
  });

  it("formats support amounts without inventing values", () => {
    expect(
      amount(
        row({
          지원비율_최대_퍼센트: "90",
          지원한도_원: "30000000",
          한도단위: "사업장당",
        }),
      ),
    ).toBe("90% · 최대 3,000만원(사업장당)");
    expect(amount(row({ 지원형태: "무상서비스" }))).toBe("");
    expect(amount(row({}))).toBe("금액 미기재");
  });

  it("lists picked categories while tiles and counts stay whole", () => {
    const programs = [
      row({}),
      row({ 사업ID: "DEMO-02", 분류: "건강상담·산재복귀", 지원형태: "융자" }),
    ];
    const text = searchText(programs, []);
    const out = evaluate(programs, text, base, {
      categories: ["설비개선"],
      ways: [],
    });
    expect(out.eligible.map((j) => j.row["사업ID"])).toEqual(["DEMO-01"]);
    expect(out.tiles.eligible).toBe(2);
    expect(out.categoryCounts["건강상담·산재복귀"]).toBe(1);
    expect(out.wayCounts["보조금·비용지원"]).toBe(1);
    expect(out.wayCounts["융자"]).toBe(0);
    // Category counts follow the way pick, and the other way round.
    const byWay = evaluate(programs, text, base, {
      categories: [],
      ways: ["융자"],
    });
    expect(byWay.categoryCounts["설비개선"]).toBeUndefined();
    expect(byWay.eligible.map((j) => j.row["사업ID"])).toEqual(["DEMO-02"]);
    expect(wayOf(row({ 지원형태: "인정제도" }))).toBe("보험료·세금 혜택");
  });

  it("ranks search matches first and never removes picked rows", () => {
    const programs = [
      row({ 사업ID: "DEMO-01", 세부사업명: "DEMO 교육" }),
      row({ 사업ID: "DEMO-02", 세부사업명: "DEMO 환기장치 설치" }),
    ];
    const text = searchText(programs, []);
    const picked = evaluate(
      programs,
      text,
      { ...base, query: "환기 장치" },
      { categories: ["설비개선"], ways: [] },
    );
    expect(picked.eligible.map((j) => j.row["사업ID"])).toEqual([
      "DEMO-02",
      "DEMO-01",
    ]);
    expect(picked.matches).toBe(1);
    expect(picked.tiles.eligible).toBe(2);
    // With nothing picked, the list is the matches only.
    const searched = evaluate(programs, text, { ...base, query: "국소배기" });
    expect(searched.eligible.map((j) => j.row["사업ID"])).toEqual(["DEMO-02"]);
    expect(searched.categoryMatches["설비개선"]).toBe(1);
    expect(evaluate(programs, text, base).eligible).toEqual([]);
  });

  it("ignores spaces and reads synonyms in search", () => {
    const text = normalize("DEMO 안전장비 구입 · 끼임 방지");
    expect(score(text, "보호구")).toBe(1);
    expect(score(text, "협착")).toBe(1);
    expect(score(text, "안전 장비")).toBeGreaterThan(0);
    expect(score(text, "끼임 안전장비")).toBe(2);
    expect(score(text, "융자")).toBe(0);
    expect(score(text, "  ")).toBe(0);
  });

  it("lists KSIC 11 sections and divisions", () => {
    expect(sections).toHaveLength(21);
    expect(divisions).toHaveLength(77);
  });
});

// The release lives on the NAS (serving/current); compare with its DEMO.md counts when mounted.
const current = `${process.env.NAS_DATA ?? "/nas"}/osh-support-programs/serving/current`;
const release = `${current}/5_데모/demo/data.json`;
const categoryFile = `${current}/2_자료/data/categories.csv`;
describe.skipIf(!existsSync(release))(
  "support programme release counts",
  () => {
    const data = JSON.parse(readFileSync(release, "utf8")) as {
      사업: Program[];
      품목: Program[];
    };
    const text = searchText(data.사업, data.품목);
    it.each([
      [{ workers: 30, industry: "C25" }, [102, 22, 40, 12]],
      [
        { workers: 8, industry: "C18", business: "소", hazard: "Y" },
        [103, 22, 40, 11],
      ],
      [{ workers: 120, industry: "F41", business: "중" }, [88, 22, 40, 26]],
    ] as const)("%o", (over, expected) => {
      const { tiles } = evaluate(data.사업, text, {
        ...base,
        ...over,
      } as Condition);
      expect([
        tiles.eligible,
        tiles.personal,
        tiles.regional,
        tiles.excluded,
      ]).toEqual(expected);
      expect(tiles.eligible + tiles.excluded).toBe(114);
    });

    it.skipIf(!existsSync(categoryFile))(
      "Hub categories cover every programme once (v2)",
      () => {
        const lines = readFileSync(categoryFile, "utf8")
          .replace(/^\uFEFF/, "")
          .trim()
          .split(/\r?\n/)
          .slice(1)
          .map((l) => l.split(","));
        const of = Object.fromEntries(lines.map(([id, c]) => [id, c]));
        const rows = data.사업.map((r) => ({ ...r, 분류: of[r["사업ID"]] }));
        expect(rows.every((r) => r["분류"])).toBe(true);
        const { categoryCounts } = evaluate(rows, text, base);
        expect(categoryCounts).toEqual({
          설비개선: 15,
          환경개선: 5,
          장비지원: 6,
          컨설팅: 14,
          "점검·기술지도": 17,
          "측정·검진": 12,
          교육: 4,
          "보험료·감면·인증": 20,
          "건강상담·산재복귀": 21,
        });
      },
    );
  },
);
