// Judging rules of the 공공기관 안전보건 입찰 준비 dataset (data/checklist.jsonl). Kept free of
// DOM code so every rule can be unit tested. The dataset README describes the same rules.

export type Profile = Record<string, string | number | null | string[]>;
export type Citation = { source: string; 위치: string; 인용: string };
export type Rule = {
  종류: "감점" | "가점" | "의무";
  필드: string;
  점수?: Record<string, number>;
  조건?: { 필드: string; 값: string; 아니면: string };
  적용?: "전체" | "기준표" | "5인이상" | "하도급";
  기준표?: string;
};
export type Item = {
  id: string;
  목적: string[];
  구분: string;
  제목: string;
  판정: Rule;
  영향: string;
  준비: string[];
  근거: Citation[];
};
export type Threshold = {
  근거: [string, string];
  표: { 업종: string[]; 최소: number; 미만?: number }[];
  애매: string[];
  건설: string | null;
  기본: number | null;
};
export type Status = "충족" | "부족" | "확인 필요" | "해당 없음";
export type Judged = {
  item: Item;
  status: Status;
  points: number | null;
  why: string;
};

const UNKNOWN = "모름";

function workers(p: Profile) {
  const n = p["상시근로자수"];
  return typeof n === "number" && n > 0 ? n : null;
}

// Does a duty with a threshold table apply? true / false / null (cannot tell).
export function applies(
  t: Threshold,
  industry: string,
  count: number | null,
): { applies: boolean | null; note: string } {
  if (!industry || industry === UNKNOWN || industry === "전체")
    return { applies: null, note: "업종을 알아야 판단할 수 있습니다" };
  if (industry[0] === "F")
    return t.건설
      ? { applies: null, note: `건설업은 현장 기준: ${t.건설}` }
      : t.기본 === null
        ? { applies: false, note: "건설업은 대상 업종이 아닙니다" }
        : count === null
          ? { applies: null, note: "상시근로자 수를 알아야 합니다" }
          : {
              applies: count >= t.기본,
              note: `상시근로자 ${t.기본}명 이상`,
            };
  const rows = t.표.filter((r) =>
    industry.length === 1
      ? r.업종.some((c) => c.startsWith(industry))
      : r.업종.includes(industry),
  );
  const ambiguous =
    t.애매.some((c) => c === industry || c.startsWith(industry)) ||
    // A section picked as a whole whose divisions fall under different rows.
    (industry.length === 1 && rows.length > 1);
  if (ambiguous) {
    const lowest = Math.min(
      ...[...t.표.map((r) => r.최소), t.기본 ?? Infinity],
    );
    if (count !== null && count < lowest)
      return { applies: false, note: `상시근로자 ${lowest}명 미만` };
    return {
      applies: null,
      note: "같은 업종 분류 안에서 기준이 달라 세부 업종 확인이 필요합니다",
    };
  }
  const row = rows[0];
  const min = row ? row.최소 : t.기본;
  if (min === null || min === undefined)
    return { applies: false, note: "이 업종은 선임 대상 업종이 아닙니다" };
  const upper = row?.미만;
  const label = `상시근로자 ${min}명 이상${upper ? ` ${upper}명 미만` : ""}`;
  if (count === null)
    return { applies: null, note: `${label}이면 대상 — 근로자 수 필요` };
  return { applies: count >= min && (!upper || count < upper), note: label };
}

export function judge(
  item: Item,
  p: Profile,
  thresholds: Record<string, Threshold>,
): Judged {
  const r = item.판정;
  const value = p[r.필드];
  const v =
    typeof value === "string" ? value : value == null ? "" : String(value);
  const known = v !== "" && v !== UNKNOWN;
  if (r.종류 === "감점" || r.종류 === "가점") {
    if (!known)
      return {
        item,
        status: "확인 필요",
        points: null,
        why: `${r.필드}: 모름`,
      };
    let points = r.점수?.[v] ?? 0;
    if (r.조건 && points) {
      const c = p[r.조건.필드];
      if (c !== r.조건.값) {
        if (c === "아니오")
          return { item, status: "부족", points: 0, why: r.조건.아니면 };
        return {
          item,
          status: "확인 필요",
          points: null,
          why: `${r.조건.아니면} — ${r.조건.필드} 확인 필요`,
        };
      }
    }
    points = Math.round(points * 10) / 10;
    if (r.종류 === "감점")
      return points < 0
        ? { item, status: "부족", points, why: `${v} → ${points}점` }
        : {
            item,
            status: "충족",
            points,
            why: points > 0 ? `${v} → +${points}점` : `${v} → 감점 없음`,
          };
    return points > 0
      ? { item, status: "충족", points, why: `${v} → +${points}점` }
      : { item, status: "부족", points: 0, why: `${v} → 가점 없음` };
  }
  // 의무: first decide whether it applies.
  const count = workers(p);
  let scope: boolean | null = true;
  let note = "모든 사업주";
  if (r.적용 === "기준표" && r.기준표) {
    const a = applies(thresholds[r.기준표], String(p["업종"] ?? ""), count);
    scope = a.applies;
    note = a.note;
  } else if (r.적용 === "5인이상") {
    note = "상시근로자 5명 이상(5명 미만 개인사업주 제외)";
    scope = count === null ? null : count >= 5 ? true : null;
    if (count !== null && count < 5)
      note = "5명 미만 — 개인사업주면 제외, 법인이면 대상";
  } else if (r.적용 === "하도급") {
    const s = p["하도급사용"];
    note = "도급·용역·위탁을 줄 때";
    scope = s === "예" ? true : s === "아니오" ? false : null;
  }
  if (scope === false)
    return { item, status: "해당 없음", points: null, why: note };
  if (v === "예")
    return { item, status: "충족", points: null, why: `${r.필드}: 예` };
  if (scope === null)
    return { item, status: "확인 필요", points: null, why: note };
  if (v === "아니오")
    return {
      item,
      status: "부족",
      points: null,
      why: `대상(${note})인데 아니오`,
    };
  return {
    item,
    status: "확인 필요",
    points: null,
    why: `대상(${note}) — ${r.필드} 모름`,
  };
}

export const statusOrder: Status[] = ["부족", "확인 필요", "충족", "해당 없음"];

export function evaluate(
  items: Item[],
  p: Profile,
  thresholds: Record<string, Threshold>,
  purposes: string[],
) {
  const picked = items.filter((i) => i.목적.some((m) => purposes.includes(m)));
  const judged = picked.map((i) => judge(i, p, thresholds));
  const counts = Object.fromEntries(
    statusOrder.map((s) => [s, judged.filter((j) => j.status === s).length]),
  ) as Record<Status, number>;
  // Scores are not summed: the criteria weigh them on different scales (e.g. 일반신인도 ×1/5).
  return { judged, counts };
}
