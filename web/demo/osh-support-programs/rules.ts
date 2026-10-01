// Eligibility rules ported from the package's demo page (3_코드/scripts/데모_페이지.html),
// which mirrors query.py except that construction amount is not asked: site size stays a
// "확인 필요" condition. Keep this file free of DOM code so the counts can be unit tested.

export type Program = Record<string, string>;
export type Item = Record<string, string>;
export type Business = "모름" | "소" | "중" | "대";
export type Hazard = "Y" | "N" | "모름";
export type Who = "전체" | "사업주" | "근로자";
export type Condition = {
  who: Who;
  workers: number;
  industry: string;
  region: string;
  business: Business;
  hazard: Hazard;
  query: string;
};
export type Verdict =
  | "해당"
  | "조건부"
  | "확인필요"
  | "개인대상"
  | "지역사업"
  | "타지역"
  | "제외";

// Lookup-only mapping of Korean industry names to KSIC prefixes. Provisional (see HANDOFF).
const industryNames: Record<string, string[]> = {
  농업: ["A01"],
  어업: ["A03"],
  조선: ["C31"],
  수리조선: ["C31"],
  자동차: ["C30"],
  화학: ["C20"],
  인쇄업: ["C18"],
  주얼리: ["C33"],
  창고: ["H52"],
  항만물류: ["H52"],
  항만사업장: ["H52"],
  해양수산업: ["A03", "H50"],
  "시설관리 및 사업지원서비스업": ["N"],
  "도소매 및 소비자용품수리업": ["G", "S95"],
  "운수·창고·통신업": ["H", "J61"],
  "위생 및 유사서비스업": ["E", "S96"],
  하수도업: ["E37"],
};
const personal = new Set([
  "근로자",
  "산재근로자",
  "특고·필수노동자",
  "이동노동자",
  "농업인",
  "어업인",
  "건설근로자",
  "현장실습생",
]);
const business: Record<Business, [string, string]> = {
  소: ["Y", "Y"],
  중: ["N", "Y"],
  대: ["N", "N"],
  모름: ["모름", "모름"],
};
export const businessLabel: Record<Business, string> = {
  모름: "전체",
  소: "소기업",
  중: "중소기업",
  대: "중견·대기업",
};

// How the support arrives, grouped from 지원형태. The nine "what" categories (분류) come with
// the catalogue from the serving release, so the screen and the AI prompt read the same list.
export const ways: Record<string, string[]> = {
  "보조금·비용지원": ["보조금", "비용지원"],
  융자: ["융자"],
  "무료 서비스": ["무상서비스"],
  "보험료·세금 혜택": ["보험료지원", "보험료감면", "세제", "인정제도"],
};
export const wayOf = (r: Program) =>
  Object.keys(ways).find((w) => ways[w].includes(r["지원형태"])) ?? "";
const formOrder = [
  "보조금",
  "융자",
  "비용지원",
  "보험료지원",
  "보험료감면",
  "세제",
  "인정제도",
  "무상서비스",
];
const verdictOrder: Verdict[] = [
  "해당",
  "조건부",
  "확인필요",
  "개인대상",
  "지역사업",
  "타지역",
  "제외",
];

export function applicant(r: Program): "근로자" | "둘다" | "사업주" {
  if (personal.has(r["대상단위"])) return "근로자";
  if (r["대상단위"] === "사업장 또는 근로자") return "둘다";
  return "사업주";
}

const overlaps = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

export function industryMatches(target: string, code: string) {
  if (target === "전체") return true;
  return target.split(";").some((raw) => {
    const t = raw.trim();
    if ((t === "제조업" || t === "제조업 등") && code[0] === "C") return true;
    if (t === "건설업" && code[0] === "F") return true;
    if (t === "임업" && code.startsWith("A02")) return true;
    if (t === "광업" && code[0] === "B") return true;
    if (t === "서비스 및 기타업종" && !"CF".includes(code[0])) return true;
    if ((industryNames[t] ?? []).some((k) => overlaps(k, code))) return true;
    return /^[A-Z]\d*$/.test(t) && overlaps(t, code);
  });
}

export function judge(r: Program, a: Condition): [Verdict, string[]] {
  const region = r["지역"].split("(")[0].trim();
  let regionCheck = "";
  if (region !== "전국") {
    if (a.region === "전국") return ["지역사업", [region]];
    if (a.region.split(" ")[0] !== region.split(" ")[0])
      return ["타지역", [region]];
    if (region.includes(" ") && a.region !== region)
      regionCheck = `${region} 사업 — 그 기초지자체 사업장만 해당하는지 확인`;
  }
  if (personal.has(r["대상단위"])) {
    const why = [r["기타대상조건"] || r["원문_대상표현"]];
    if (regionCheck) why.push(regionCheck);
    return ["개인대상", why];
  }
  const note: string[] = [];
  const check: string[] = regionCheck ? [regionCheck] : [];
  const lo = r["근로자수_하한"],
    hi = r["근로자수_상한_미만"],
    cap = r["공사금액_상한_억원_미만"];
  if (cap) {
    const construction = a.industry === "전체" || a.industry[0] === "F";
    if (!lo && !hi && !construction) return ["제외", ["건설현장 대상"]];
    check.push(`공사금액 ${cap}억원 미만 현장만 해당`);
  }
  if (lo && a.workers < Number(lo)) return ["제외", [`${lo}인 이상만`]];
  if (hi && a.workers >= Number(hi)) {
    const combined = r["규모조건_결합"];
    const [small, sme] = business[a.business];
    const basis =
      combined === "또는_소기업"
        ? small
        : combined === "또는_중소기업"
          ? sme
          : null;
    const word = combined === "단독" ? "" : combined.split("_")[1];
    if (basis === null || basis === "N")
      return [
        "제외",
        [`${hi}인 미만만` + (basis === null ? "" : `(${word} 아님)`)],
      ];
    if (basis === "모름")
      check.push(`${hi}인 이상이지만 ${word} 규모 기준 이하면 가능`);
    else note.push(`${hi}인 이상이지만 ${word}라서 해당`);
  }
  if (a.industry === "전체") {
    if (r["대상업종"] !== "전체") note.push(`대상업종: ${r["대상업종"]}`);
    if (r["제외업종"]) note.push(`제외업종: ${r["제외업종"]}`);
  } else {
    if (!industryMatches(r["대상업종"], a.industry))
      return ["제외", [`대상업종 ${r["대상업종"]}`]];
    if (a.industry[0] === "F" && /^(건설업|건설현장)/.test(r["제외업종"]))
      return ["제외", [`제외업종 ${r["제외업종"]}`]];
    if (a.industry[0] === "F" && r["제외업종"].includes("건설"))
      check.push(`제외업종 확인: ${r["제외업종"]}`);
  }
  if (r["유해인자_보유필요"] === "Y") {
    if (a.hazard === "N")
      return ["제외", [`유해인자 보유 필요: ${r["유해인자_종류"]}`]];
    if (a.hazard === "모름")
      check.push(`유해인자 보유 필요: ${r["유해인자_종류"]}`);
  }
  if (r["검증상태"] === "미확인") check.push("요건 미확인(공고문 확인 필요)");
  if (r["기준연도"] < "2026") note.push(`${r["기준연도"]}년 자료`);
  if (r["산재보험_가입필요"] === "Y")
    note.push(
      "산재보험 가입" +
        (r["보험료체납_제외"] === "Y" ? " · 보험료 체납 없음" : ""),
    );
  for (const c of ["기타대상조건", "제외대상", "중복지원_제한", "원청부담"])
    if (r[c]) note.push(`${c.replaceAll("_", " ")}: ${r[c]}`);
  const conditional =
    r["근로자수_기준"].startsWith("해당없음") ||
    r["기타대상조건"].startsWith("다음 중 하나");
  if (check.length) return ["확인필요", [...check, ...note]];
  return [conditional ? "조건부" : "해당", note];
}

function won(v: number) {
  if (v >= 100_000_000) return `${Math.round((v / 100_000_000) * 10) / 10}억원`;
  if (v >= 10_000) return `${(v / 10_000).toLocaleString("ko-KR")}만원`;
  return `${v.toLocaleString("ko-KR")}원`;
}

export function amount(r: Program) {
  const p: string[] = [];
  if (r["지원비율_최대_퍼센트"]) p.push(`${r["지원비율_최대_퍼센트"]}%`);
  if (r["지원한도_원"])
    p.push(
      `최대 ${won(Number(r["지원한도_원"]))}` +
        (r["한도단위"] ? `(${r["한도단위"]})` : ""),
    );
  if (r["추가한도_원"])
    p.push(
      `+추가 ${(Number(r["추가한도_원"]) / 10_000).toLocaleString("ko-KR")}만원`,
    );
  if (r["융자금리_퍼센트"])
    p.push(
      `연 ${r["융자금리_퍼센트"]}%` +
        (r["거치_년"]
          ? ` · ${r["거치_년"]}년 거치 ${r["분할상환_년"]}년 상환`
          : ""),
    );
  if (r["보험료_인하_퍼센트"]) {
    const what =
      /산재/.test(r["사업명"] + r["세부사업명"]) || r["지원형태"] === "인정제도"
        ? "산재보험요율"
        : "보험료";
    p.push(
      `${what} ${r["보험료_인하_퍼센트"]}% 인하` +
        (r["혜택기간_년"] ? ` ${r["혜택기간_년"]}년` : ""),
    );
  }
  if (r["지원횟수"] && r["지원형태"] === "무상서비스") p.push(r["지원횟수"]);
  if (p.length) return p.join(" · ");
  return r["지원형태"] === "무상서비스" ? "" : "금액 미기재";
}

export const searchFields = [
  "사업명",
  "세부사업명",
  "분류",
  "지원범주",
  "지원유형",
  "지원형태",
  "대상단위",
  "소관기관",
  "수행기관",
  "기관구분",
  "지역",
  "대상업종",
  "제외업종",
  "유해인자_종류",
  "기타대상조건",
  "제외대상",
  "위험요인",
  "신청방법",
  "문의처",
  "원문_대상표현",
  "한도단위",
  "지원비율_비고",
  "중복지원_제한",
  "추가한도_조건",
  "검증상태",
];

// Words people use for the same thing. A term matches when any word of its group is present.
export const synonyms = [
  ["보호구", "안전장비", "안전용품", "안전모", "안전대"],
  ["에어컨", "냉방", "냉방기"],
  ["더위", "폭염", "온열", "열사병"],
  ["환기", "국소배기", "환기장치", "배기"],
  ["추락", "떨어짐"],
  ["협착", "끼임"],
  ["충돌", "부딪힘"],
  ["건강검진", "건강진단", "검진"],
  ["심리", "상담", "트라우마"],
  ["대출", "융자"],
  ["세금", "세액공제", "세제"],
  ["보험", "보험료"],
  ["화학", "화학물질"],
  ["질식", "밀폐공간"],
  ["컨설팅", "기술지도"],
  ["휴게", "휴게시설", "쉼터"],
  ["배달", "이륜차"],
];

// Spaces and separators are ignored, so "환기 장치" finds "환기장치".
export const normalize = (s: string) =>
  s.toLowerCase().replace(/[\s·,.()/_-]+/g, "");

export function searchText(programs: Program[], items: Item[]) {
  const text: Record<string, string> = {};
  for (const r of programs)
    text[r["사업ID"]] =
      searchFields.map((c) => r[c] ?? "").join(" ") + " " + r["사업ID"];
  for (const i of items)
    text[i["사업ID"]] += ` ${i["품목명"]} ${i["품목구분"]} ${i["위험요인"]}`;
  for (const id in text) text[id] = normalize(text[id]);
  return text;
}

function terms(query: string) {
  return query
    .split(/[\s,]+/)
    .map(normalize)
    .filter(Boolean)
    .map((t) => [
      t,
      ...synonyms
        .filter((g) => g.includes(t))
        .flat()
        .map(normalize),
    ]);
}

// Search ranks, it never hides: 0 means no term matched.
export function score(text: string, query: string) {
  const whole = normalize(query);
  if (!whole) return 0;
  const groups = terms(query);
  const hits = groups.filter((alts) => alts.some((t) => text.includes(t)));
  return hits.length + (groups.length > 1 && text.includes(whole) ? 1 : 0);
}

export type Judged = {
  row: Program;
  verdict: Verdict;
  why: string[];
  match: number;
};
export type Picks = { categories: string[]; ways: string[] };
export type Outcome = {
  tiles: {
    eligible: number;
    personal: number;
    regional: number;
    excluded: number;
  };
  outOfScope: number;
  // Facet counts: each counts rows inside the other facet's picks.
  categoryCounts: Record<string, number>;
  categoryMatches: Record<string, number>;
  wayCounts: Record<string, number>;
  matches: number;
  eligible: Judged[];
  excluded: Judged[];
};

const rank = (j: Judged) => verdictOrder.indexOf(j.verdict);
// Tiers: search matches, then verdict. Inside a tier the order is the visitor's shuffle (one
// random key per programme per visit), so top-of-list position does not bias the demand log.
// Without a shuffle (tests) the old support-form/agency order is used.
const comparer = (shuffle?: Record<string, number>) => (x: Judged, y: Judged) =>
  y.match - x.match ||
  rank(x) - rank(y) ||
  (shuffle
    ? (shuffle[x.row["사업ID"]] ?? 0) - (shuffle[y.row["사업ID"]] ?? 0)
    : formOrder.indexOf(x.row["지원형태"]) -
        formOrder.indexOf(y.row["지원형태"]) ||
      x.row["기관구분"].localeCompare(y.row["기관구분"], "ko"));

export function shuffleKeys(programs: Program[], random = Math.random) {
  return Object.fromEntries(programs.map((r) => [r["사업ID"], random()]));
}

// Tiles ignore the picks and the search. Lists follow the picks; with no pick, only search
// matches are listed. Matching rows go first.
export function evaluate(
  programs: Program[],
  text: Record<string, string>,
  a: Condition,
  picks: Picks = { categories: [], ways: [] },
  shuffle?: Record<string, number>,
): Outcome {
  const compare = comparer(shuffle);
  const workerMode = a.who === "근로자";
  const tiles = { eligible: 0, personal: 0, regional: 0, excluded: 0 };
  const categoryCounts: Record<string, number> = {};
  const categoryMatches: Record<string, number> = {};
  const wayCounts: Record<string, number> = Object.fromEntries(
    Object.keys(ways).map((w) => [w, 0]),
  );
  let outOfScope = 0;
  let matches = 0;
  const picked = picks.categories.length + picks.ways.length > 0;
  const eligible: Judged[] = [];
  const excluded: Judged[] = [];
  for (const row of programs) {
    const who = applicant(row);
    if (
      (a.who === "사업주" && who === "근로자") ||
      (workerMode && who === "사업주")
    ) {
      outOfScope++;
      continue;
    }
    const [judged, why] = judge(row, a);
    let verdict = judged;
    if (verdict === "제외" || verdict === "타지역") tiles.excluded++;
    else {
      tiles.eligible++;
      if (verdict === "개인대상") tiles.personal++;
      if (verdict === "지역사업") tiles.regional++;
    }
    const match = score(text[row["사업ID"]] ?? "", a.query);
    const category = row["분류"];
    const way = wayOf(row);
    const inCategory =
      !picks.categories.length || picks.categories.includes(category);
    const inWay = !picks.ways.length || picks.ways.includes(way);
    if (inWay) {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      if (match)
        categoryMatches[category] = (categoryMatches[category] ?? 0) + 1;
    }
    if (inCategory && way) wayCounts[way]++;
    if (!inCategory || !inWay) continue;
    if (match) matches++;
    if (!picked && !match) continue;
    // Workers see their own programmes in the main list rather than as a side group.
    if (workerMode && verdict === "개인대상") verdict = "해당";
    (verdict === "제외" || verdict === "타지역" ? excluded : eligible).push({
      row,
      verdict,
      why,
      match,
    });
  }
  if (workerMode) tiles.personal = 0;
  return {
    tiles,
    outOfScope,
    categoryCounts,
    categoryMatches,
    wayCounts,
    matches,
    eligible: eligible.sort(compare),
    excluded: excluded.sort(compare),
  };
}

export function regions(programs: Program[]) {
  const wide = new Set<string>();
  for (const r of programs) {
    const g = r["지역"].split("(")[0].trim().split(" ")[0];
    if (g !== "전국") wide.add(g);
  }
  return [...wide].sort();
}
