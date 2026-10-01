import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import "../../app/globals.css";
import "../../../design/osh-family/osh-family.css";
import "./style.css";
import { divisions, sections } from "./ksic";
import { beacon, createLog, type FormField, type LogEvent } from "./log";
import {
  amount,
  businessLabel,
  evaluate,
  regions,
  searchText,
  ways,
  type Business,
  type Condition,
  type Hazard,
  type Item,
  type Judged,
  shuffleKeys,
  type Picks,
  type Program,
  type Verdict,
  type Who,
} from "./rules";

// Hash of this folder's sources, set by scripts/build-support-programs-demo.mjs.
declare const __SP_BUILD__: string;
type Log = (event: LogEvent, now?: boolean) => void;
type Catalogue = {
  version: string;
  version_date: string;
  release: string;
  분류: { 이름: string; 설명: string }[];
  사업: Program[];
  품목: Item[];
};
type Proposal = {
  요청ID: string;
  제안: {
    신청주체: Who;
    근로자수: number | null;
    업종: string;
    지역: string;
    기업: Business;
    유해인자: Hazard;
    분류: string[];
    키워드: string[];
  };
  근거: Partial<Record<FormField, string>>;
};
// Form fields Claude may fill, with the value that means "not in the description".
const unknown: Partial<Record<FormField, string | null>> = {
  신청주체: "전체",
  근로자수: null,
  업종: "전체",
  지역: "전국",
  기업: "모름",
  유해인자: "모름",
};
const fieldOf: Record<keyof Condition, FormField> = {
  who: "신청주체",
  workers: "근로자수",
  industry: "업종",
  region: "지역",
  business: "기업",
  hazard: "유해인자",
  query: "키워드",
};
function proposedFields(p: Proposal): FormField[] {
  const scalars = (Object.keys(unknown) as FormField[]).filter(
    (f) => p.제안[f as keyof Proposal["제안"]] !== unknown[f],
  );
  return [
    ...scalars,
    ...(p.제안.분류.length ? (["분류"] as const) : []),
    ...(p.제안.키워드.length ? (["키워드"] as const) : []),
  ];
}
const industryLabel = (code: string) =>
  code === "전체"
    ? "전체 업종"
    : `${code} ${[...sections, ...divisions].find((s) => s.code === code)?.name ?? ""}`;
function shown(f: FormField, p: Proposal["제안"]) {
  if (f === "근로자수") return `${p.근로자수}명`;
  if (f === "업종") return industryLabel(p.업종);
  if (f === "기업") return businessLabel[p.기업];
  if (f === "유해인자") return p.유해인자 === "Y" ? "있음" : "없음";
  if (f === "분류") return p.분류.join(", ");
  if (f === "키워드") return p.키워드.join(", ");
  return String(p[f]);
}
const start: Condition = {
  who: "전체",
  workers: 30,
  industry: "C25",
  region: "전국",
  business: "모름",
  hazard: "모름",
  query: "",
};
const verdictLabel: Partial<Record<Verdict, string>> = {
  확인필요: "확인 필요",
  조건부: "사업장 상황 조건",
  개인대상: "근로자 본인이 신청",
  지역사업: "지역 한정",
  타지역: "다른 지역 사업",
  제외: "해당 안 됨",
};
const tone = (v: Verdict) =>
  v === "해당" || v === "조건부"
    ? "ok"
    : v === "확인필요"
      ? "check"
      : v === "제외" || v === "타지역"
        ? "no"
        : "info";

function ProgramCard({
  judged,
  items,
  full,
  rank,
  count,
  log,
  searched,
}: {
  judged: Judged;
  items: Item[];
  full: boolean;
  rank?: number;
  count?: number;
  searched?: boolean;
  log?: (event: LogEvent, now?: boolean) => void;
}) {
  const id = judged.row["사업ID"];
  const out = (kind: "official" | "apply") =>
    log?.(
      {
        행동: "링크이동",
        사업ID: id,
        종류: kind,
        범주: judged.row["분류"],
        순위: rank,
        결과건수: count,
      },
      true,
    );
  const { row: r, verdict, why } = judged;
  const money = amount(r);
  const label =
    verdict === "지역사업" ? `지역 한정 · ${why[0]}` : verdictLabel[verdict];
  return (
    <article
      className={`sp-program sp-${tone(verdict)}`}
      aria-label={r["세부사업명"]}
    >
      <div className="sp-program-tags">
        <span className="osh-badge">{r["분류"]}</span>
        {searched && judged.match > 0 && (
          <span className="sp-tag sp-tag--match">검색어 일치</span>
        )}
        <span className="sp-tag">
          {r["기관구분"] === "지자체"
            ? r["지역"]
            : r["수행기관"] || r["기관구분"]}
        </span>
        {label && (
          <span className={`sp-tag sp-tag--${tone(verdict)}`}>{label}</span>
        )}
      </div>
      <h4 className="sp-program-title">
        {r["세부사업명"]}
        <small>{r["사업명"]}</small>
      </h4>
      {full && money && <p className="sp-money">{money}</p>}
      <ul className="sp-why">
        {why.slice(0, full ? 6 : 1).map((w) => {
          const warn = full && /필요|확인|이상이지만/.test(w);
          return (
            <li key={w} className={warn ? "sp-warn" : undefined}>
              {warn && <span className="sp-sr">확인할 조건: </span>}
              {w}
            </li>
          );
        })}
      </ul>
      {full && r["위험요인"] && (
        <p className="sp-risks">
          <span className="sp-sr">위험요인: </span>
          {r["위험요인"]
            .split(";")
            .filter(Boolean)
            .map((x) => (
              <span key={x} className="sp-tag">
                {x}
              </span>
            ))}
        </p>
      )}
      {full && (
        <div className="sp-foot">
          <p className="osh-help">
            {r["신청방법"]}
            {r["문의처"] && ` · ${r["문의처"]}`} ·{" "}
            <span className="sp-verify">근거 {r["검증상태"]}</span>
          </p>
          <div className="osh-actions">
            {r["공식링크"] && (
              <a
                className="osh-button osh-button--secondary"
                href={r["공식링크"]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => out("official")}
              >
                공식 페이지 ↗<span className="sp-sr">(새 창)</span>
              </a>
            )}
            {r["신청링크"] && (
              <a
                className="osh-button osh-button--secondary"
                href={r["신청링크"]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => out("apply")}
              >
                신청하기 ↗<span className="sp-sr">(새 창)</span>
              </a>
            )}
          </div>
          {items.length > 0 && (
            <details
              className="sp-items"
              onToggle={(e) =>
                e.currentTarget.open && log?.({ 행동: "품목펼침", 사업ID: id })
              }
            >
              <summary>지원 품목 {items.length}종 보기</summary>
              <ul>
                {items.map((i) => (
                  <li key={i["품목ID"]}>
                    <span>{i["품목명"]}</span>
                    <span className="sp-tag">{i["품목구분"]}</span>
                    {i["종수"] && i["종수"] !== "1" && (
                      <span className="sp-tag">{i["종수"]}종</span>
                    )}
                    {i["관리품목"] === "Y" && (
                      <span className="sp-tag">관리품목</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="osh-help">
                안전보건공단 재정지원 8개 사업의 지정품목만 자료에 있습니다.
                품목이 적히지 않은 사업은 공식 페이지에서 확인하세요.
              </p>
            </details>
          )}
        </div>
      )}
    </article>
  );
}

function Meter({ title, parts }: { title: string; parts: [string, number][] }) {
  const total = parts.reduce((n, [, v]) => n + v, 0);
  return (
    <div className="sp-meter">
      <h4>{title}</h4>
      <div className="sp-bar" aria-hidden="true">
        {parts.map(
          ([k, v], i) =>
            v > 0 && (
              <i
                key={k}
                className={`sp-bar-${i}`}
                style={{ width: `${(v / total) * 100}%` }}
              />
            ),
        )}
      </div>
      <ul>
        {parts.map(([k, v], i) => (
          <li key={k}>
            <i className={`sp-bar-${i}`} aria-hidden="true" />
            {k} <b>{v}건</b> ({Math.round((v / total) * 100)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sources({ data }: { data: Catalogue }) {
  const count = (col: string, keys: string[]) =>
    data.사업.filter((r) => keys.includes(r[col])).length;
  const years = [...new Set(data.사업.map((r) => r["기준연도"]))].sort();
  const opened = ["출처로 사용(값을 읽은 페이지)", "열어서 내용 확인"];
  const titled = ["열어서 제목 확인", "검색결과 제목 확인"];
  return (
    <section className="osh-section" aria-labelledby="sources">
      <h2 className="osh-heading" id="sources">
        자료 카드와 출처
      </h2>
      <p className="osh-copy">
        모르는 값은 채우지 않고 미확인으로 둡니다. 판정 결과는 참고용이며 실제
        지원 여부는 각 기관의 공고문과 심사로 정해집니다.
      </p>
      <div
        className="osh-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="자료 카드"
      >
        <table className="osh-table">
          <tbody>
            {[
              [
                "자료",
                `안전보건 지원사업 요건 데이터셋 · v${data.version} (${data.version_date}) · 실제 자료, 합성 행 없음`,
              ],
              [
                "규모",
                `지원사업 ${data.사업.length}건 · 지정 지원품목 ${data.품목.length}건`,
              ],
              [
                "기준연도",
                `${years[0]}–${years[years.length - 1]} · 행마다 다르며 2026년이 아닌 행은 카드에 표시`,
              ],
              [
                "원문 제공자",
                "고용노동부·안전보건공단·근로복지공단·타 중앙부처·지자체 등. 행마다 근거 URL",
              ],
              ["가공 주체 · 연구책임자 · 문의처", "미확인"],
              [
                "원문·가공물 이용 조건",
                "미확인 — 기관별 이용허락범위를 확인하지 않았습니다",
              ],
              [
                "신청기간·접수상태·잔여예산",
                "담지 않음 — 자주 바뀌므로 각 사업의 공식 페이지에서 확인",
              ],
            ].map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sp-meters">
        <Meter
          title="값을 어디에서 읽었나 (카드의 ‘근거’와 같은 값)"
          parts={[
            ["공식 문서·법령", count("검증상태", ["공식", "법령", "법령해설"])],
            ["포털·공고 안내", count("검증상태", ["포털안내", "공고요약"])],
            [
              "언론·민간 — 공고 원문 대조 남음",
              count("검증상태", ["언론", "민간", "미확인"]),
            ],
          ]}
        />
        <Meter
          title="붙여 둔 공식 링크를 어디까지 열어 봤나"
          parts={[
            ["열어서 내용 확인", count("링크확인", opened)],
            ["제목만 확인", count("링크확인", titled)],
            [
              "못 찾음",
              data.사업.length - count("링크확인", [...opened, ...titled]),
            ],
          ]}
        />
      </div>
      <h3 className="osh-card-title">검사한 것과 안 한 것</h3>
      <ul className="sp-checks">
        <li>수치가 출처 문구에 있는지 — 제작자 기계 대조 152/152 일치</li>
        <li>
          <b>그 수치가 그 세부사업의 값인지 — 사람 대조 없음</b>
        </li>
        <li>지원품목 위험요인 — 키워드 규칙 추정값, 사람 검토 전</li>
        <li>
          업종 판정 — KSIC 11차(2024) 코드와 한글 업종명을 잇는 표가
          임시표입니다. 정식 대응표로 바꾸면 결과가 달라질 수 있습니다
        </li>
      </ul>
    </section>
  );
}

function App() {
  const [data, setData] = useState<Catalogue>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [cond, setCond] = useState<Condition>(start);
  const [picks, setPicks] = useState<Picks>({ categories: [], ways: [] });
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [proposal, setProposal] = useState<Proposal>();
  const [accept, setAccept] = useState<Set<FormField>>(new Set());
  // Fields the visitor took from the AI and has not changed since.
  const [aiFields, setAiFields] = useState<Set<FormField>>(new Set());
  const aiRequest = useRef("");
  const condRef = useRef(cond);
  const logRef = useRef<ReturnType<typeof createLog>>(undefined);
  const lastExposure = useRef("");
  const record: Log = (event, now) => logRef.current?.record(event, now);
  useEffect(() => {
    let active = true;
    fetch("/demo/osh-support-programs/api/catalogue", {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            (await r.json().catch(() => ({}))).detail ||
              "자료를 불러오지 못했습니다.",
          );
        return r.json() as Promise<Catalogue>;
      })
      .then((d) => active && setData(d))
      .catch(
        (e) =>
          active &&
          setError(
            e instanceof Error && e.name !== "TimeoutError"
              ? e.message
              : "응답이 늦어 자료를 불러오지 못했습니다.",
          ),
      );
    return () => {
      active = false;
    };
  }, [reload]);
  const text = useMemo(
    () => (data ? searchText(data.사업, data.품목) : {}),
    [data],
  );
  const itemsOf = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const i of data?.품목 ?? []) (map[i["사업ID"]] ??= []).push(i);
    return map;
  }, [data]);
  // One random order per visit; it stays put while the visitor changes conditions.
  const shuffle = useMemo(() => (data ? shuffleKeys(data.사업) : {}), [data]);
  const out = useMemo(
    () => (data ? evaluate(data.사업, text, cond, picks, shuffle) : undefined),
    [data, text, cond, picks, shuffle],
  );
  // The visitor changing an AI-filled field is the correction the demand log is after.
  const edited = (fields: FormField[]) => {
    const changed = fields.filter((f) => aiFields.has(f));
    if (!changed.length) return;
    record({ 행동: "AI수정", 요청ID: aiRequest.current, 항목: changed });
    setAiFields((s) => new Set([...s].filter((f) => !changed.includes(f))));
  };
  const set = (patch: Partial<Condition>) => {
    edited((Object.keys(patch) as (keyof Condition)[]).map((k) => fieldOf[k]));
    setCond((c) => ({ ...c, ...patch }));
  };
  const toggle = (facet: keyof Picks, value: string) => {
    const on = !picks[facet].includes(value);
    const kind = facet === "categories" ? "분류" : "받는방식";
    record({
      행동: `${kind}${on ? "선택" : "해제"}`,
      [kind]: [value],
    } as LogEvent);
    if (facet === "categories") edited(["분류"]);
    setPicks((p) => ({
      ...p,
      [facet]: on ? [...p[facet], value] : p[facet].filter((v) => v !== value),
    }));
  };

  async function ask() {
    setBusy(true);
    setAiError("");
    setProposal(undefined);
    try {
      const r = await fetch("/demo/osh-support-programs/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          설명: desc.trim(),
          세션ID: logRef.current?.session ?? "",
          판본: __SP_BUILD__,
        }),
        signal: AbortSignal.timeout(70000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(body.detail || "AI 조건 채우기에 실패했습니다.");
      const p = body as Proposal;
      const fields = proposedFields(p);
      setProposal(p);
      setAccept(new Set(fields));
      record({ 행동: "AI제안", 요청ID: p.요청ID, 항목: fields }, true);
    } catch (e) {
      setAiError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "응답이 늦어 AI 조건 채우기를 멈췄습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    if (!proposal) return;
    const p = proposal.제안;
    const patch: Partial<Condition> = {};
    if (accept.has("신청주체")) patch.who = p.신청주체;
    if (accept.has("근로자수") && p.근로자수) patch.workers = p.근로자수;
    if (accept.has("업종")) patch.industry = p.업종;
    if (accept.has("지역")) patch.region = p.지역;
    if (accept.has("기업")) patch.business = p.기업;
    if (accept.has("유해인자")) patch.hazard = p.유해인자;
    if (accept.has("키워드")) patch.query = p.키워드.join(" ");
    setCond((c) => ({ ...c, ...patch }));
    if (accept.has("분류")) setPicks((x) => ({ ...x, categories: p.분류 }));
    aiRequest.current = proposal.요청ID;
    setAiFields(new Set(accept));
    record(
      { 행동: "AI적용", 요청ID: proposal.요청ID, 항목: [...accept] },
      true,
    );
    setProposal(undefined);
    document.getElementById("need")?.scrollIntoView({ block: "start" });
  }
  const mark = (f: FormField) =>
    aiFields.has(f) && (
      <span className="sp-ai-mark" title="AI 제안으로 채운 값">
        AI
      </span>
    );

  // ---- demand log: starts once the table is on screen ----
  useEffect(() => {
    condRef.current = cond;
  }, [cond]);
  useEffect(() => {
    if (!data || logRef.current) return;
    const c = () => condRef.current;
    logRef.current = createLog(
      __SP_BUILD__,
      () => ({
        신청주체: c().who,
        근로자수: c().workers,
        업종: c().industry,
        지역: c().region,
        기업: c().business,
        유해인자: c().hazard,
      }),
      beacon,
      Date.now,
      data.release,
    );
    logRef.current.record({ 행동: "열기" });
    const flush = () => void logRef.current?.flush();
    const hidden = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [data]);
  const conditionKey = [
    cond.who,
    cond.workers,
    cond.industry,
    cond.region,
    cond.business,
    cond.hazard,
  ].join("|");
  const firstConditions = useRef(conditionKey);
  useEffect(() => {
    if (conditionKey === firstConditions.current) return;
    firstConditions.current = conditionKey;
    logRef.current?.record({ 행동: "조건변경" });
  }, [conditionKey]);
  const query = cond.query.trim();
  const matchCount = out?.matches;
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(
      () =>
        logRef.current?.record({
          행동: "검색",
          검색어: query,
          결과건수: matchCount,
        }),
      900,
    );
    return () => clearTimeout(timer);
  }, [query, matchCount]);
  const picked = picks.categories.length + picks.ways.length > 0;
  const listing = picked || !!query;
  // Exposure is logged only when cards are on screen, so 이동 ÷ 노출 is not inflated.
  const shownIds =
    listing && out ? out.eligible.map((j) => j.row["사업ID"]) : null;
  const exposureKey = shownIds
    ? [
        picks.categories.join(","),
        picks.ways.join(","),
        query,
        ...shownIds.slice(0, 20),
      ].join("|")
    : "";
  useEffect(() => {
    if (!shownIds || exposureKey === lastExposure.current) return;
    lastExposure.current = exposureKey;
    const where = {
      분류: picks.categories,
      받는방식: picks.ways,
      검색어: query,
    };
    if (!shownIds.length) logRef.current?.record({ 행동: "0건", ...where });
    else
      logRef.current?.record({
        행동: "노출",
        목록: shownIds.slice(0, 20),
        결과건수: shownIds.length,
        ...where,
      });
    // shownIds is derived from exposureKey's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposureKey]);
  const workerMode = cond.who === "근로자";
  const total = data?.사업.length ?? 0;
  const judgedTotal = out ? out.tiles.eligible + out.tiles.excluded : 0;
  const listTitle =
    [...picks.categories, ...picks.ways].join(" · ") || `검색 ‘${query}’`;
  const fields = proposal ? proposedFields(proposal) : [];

  return (
    <div className="osh-app">
      <a className="osh-skip" href="#finder">
        조건 입력으로 건너뛰기
      </a>
      <main className="osh-container osh-main">
        <a
          className="osh-link"
          href="https://osh.ai.kr/datasets/osh-support-programs"
        >
          ← 자료 소개로
        </a>
        <header className="osh-section osh-intro">
          <span className="osh-badge osh-badge--demo">
            DEMO · 실제 자료
            {data ? ` v${data.version} · 지원사업 ${total}건` : ""}
          </span>
          <h1 className="osh-title">
            우리 사업장이 받을 수 있는 산업안전보건 지원
          </h1>
          <p className="osh-copy">
            사업장을 글로 설명하면 AI가 조건을 채워 주고, 직접 고를 수도
            있습니다. 판정은 규모·업종·지역·유해인자 요건 규칙으로만 하며,{" "}
            <strong>
              신청기간과 예산 소진 여부는 각 사업의 공식 페이지에서 확인
            </strong>
            해야 합니다.
          </p>
          <p className="osh-note sp-notice">
            <strong>수요조사 기록 안내</strong> — 이 화면은 어떤 지원이 필요한지
            알아보려는 수요조사용 시험판입니다. <b>수집 항목</b>: 고른 분류·받는
            방식, 검색어, 사업장 조건(신청 주체·근로자 수·업종·지역·기업
            규모·유해인자), 목록에 보인 사업, 눌러서 이동한 공식·신청 페이지. AI
            조건 채우기를 쓰면 <b>직접 쓴 사업장 설명 원문</b>과 AI 제안,
            적용·수정 여부도 기록합니다. 이름·연락처·IP는 받지 않으며, 설명에
            적힌 전화번호·이메일·사업자번호는 서버가 가린 뒤 저장합니다.{" "}
            <b>목적</b>: 지원사업 수요 파악과 제도 개선 근거. <b>보관</b>: 연구
            종료 시 파기. <b>제3자 제공</b>: AI 조건 채우기를 누를 때만 설명이
            Anthropic(Claude API)으로 전송됩니다. 판정은 브라우저에서 하며 AI는
            조건 제안에만 씁니다.
          </p>
        </header>

        {error && (
          <div className="osh-note osh-note--error sp-error" role="alert">
            <span>{error}</span>
            <button
              className="osh-button osh-button--secondary"
              type="button"
              onClick={() => {
                setError("");
                setReload((n) => n + 1);
              }}
            >
              다시 불러오기
            </button>
          </div>
        )}
        {!data && !error && (
          <p className="osh-note" role="status">
            요건표를 불러오는 중입니다…
          </p>
        )}

        {data && out && (
          <>
            <section
              className="osh-card osh-stack sp-ai"
              aria-labelledby="ai-title"
            >
              <h2 className="osh-card-title" id="ai-title">
                사업장 설명으로 조건 채우기{" "}
                <span className="osh-badge">AI</span>
              </h2>
              <label className="osh-field">
                <span className="osh-label">우리 사업장 설명</span>
                <textarea
                  className="osh-input sp-textarea"
                  rows={3}
                  maxLength={500}
                  value={desc}
                  placeholder="예: 경기 화성에서 프레스로 금속 부품을 가공합니다. 직원은 23명이고 지게차를 쓰며 여름에 작업장이 많이 덥습니다."
                  onChange={(e) => setDesc(e.target.value)}
                />
                <span className="osh-help">
                  {desc.length}/500자 · 업종, 직원 수, 지역, 쓰는 설비, 걱정되는
                  위험이나 필요한 지원을 적으면 됩니다.
                </span>
              </label>
              <p className="osh-help">
                버튼을 누르면 이 설명이 Anthropic(Claude)으로 전송되고, 설명
                원문과 AI 제안이 수요조사 기록으로 저장됩니다. 사업장명·이름은
                적지 마세요. AI는 조건만 제안하며, 받을 수 있는지는 아래 요건
                규칙으로 판정합니다.
              </p>
              <div className="osh-actions">
                <button
                  className="osh-button"
                  type="button"
                  disabled={busy || desc.trim().length < 5}
                  onClick={() => void ask()}
                >
                  {busy ? "설명을 읽는 중…" : "동의하고 AI로 조건 채우기"}
                </button>
              </div>
              {busy && (
                <p className="osh-help" role="status">
                  보통 10초 안팎 걸립니다.
                </p>
              )}
              {aiError && (
                <p className="osh-note osh-note--error" role="alert">
                  {aiError} 아래에서 조건을 직접 고를 수 있습니다.
                </p>
              )}
              {proposal && (
                <div className="sp-proposal" role="status">
                  <h3 className="osh-card-title">
                    이렇게 이해했어요 — 맞는 것만 남기고 적용하세요
                  </h3>
                  {fields.length ? (
                    <ul>
                      {fields.map((f) => (
                        <li key={f}>
                          <label>
                            <input
                              type="checkbox"
                              checked={accept.has(f)}
                              onChange={(e) =>
                                setAccept((s) => {
                                  const next = new Set(s);
                                  if (e.target.checked) next.add(f);
                                  else next.delete(f);
                                  return next;
                                })
                              }
                            />
                            <span className="sp-proposal-field">{f}</span>
                            <b>{shown(f, proposal.제안)}</b>
                          </label>
                          {proposal.근거[f] && (
                            <span className="osh-help">
                              설명의 ‘{proposal.근거[f]}’에서
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="osh-note">
                      설명에서 채울 조건을 찾지 못했습니다. 직원 수·업종·지역·
                      필요한 지원을 적어 다시 보내 보세요.
                    </p>
                  )}
                  <p className="osh-help">
                    설명에 나오지 않은 조건은 지금 값 그대로 둡니다. 적용한
                    뒤에도 아래에서 바꿀 수 있습니다.
                  </p>
                  <div className="osh-actions">
                    <button
                      className="osh-button"
                      type="button"
                      disabled={!accept.size}
                      onClick={apply}
                    >
                      고른 {accept.size}개 조건 적용
                    </button>
                    <button
                      className="osh-button osh-button--secondary"
                      type="button"
                      onClick={() => setProposal(undefined)}
                    >
                      적용하지 않기
                    </button>
                  </div>
                </div>
              )}
            </section>

            <form
              id="finder"
              className="osh-card osh-stack"
              onSubmit={(e) => e.preventDefault()}
            >
              <label className="osh-field">
                <span className="osh-label">검색어{mark("키워드")}</span>
                <input
                  className="osh-input"
                  type="search"
                  value={cond.query}
                  maxLength={100}
                  placeholder="예: 프레스, 지게차, 국소배기, 끼임, 융자, 온열질환"
                  onChange={(e) => set({ query: e.target.value })}
                />
                <span className="osh-help">
                  사업명·기관·지원품목·위험요인·대상 문구에서 찾아 맞는 사업을
                  앞에 둡니다. 띄어쓰기는 무시하고 비슷한 말(보호구·안전장비,
                  더위·온열 등)도 찾습니다.
                </span>
              </label>
              <h2 className="osh-card-title">사업장 조건</h2>
              <div className="sp-fields">
                <label className="osh-field">
                  <span className="osh-label">
                    누가 신청하나{mark("신청주체")}
                  </span>
                  <select
                    className="osh-input"
                    value={cond.who}
                    onChange={(e) => set({ who: e.target.value as Who })}
                  >
                    <option value="전체">전체</option>
                    <option value="사업주">사업주 사업장</option>
                    <option value="근로자">근로자</option>
                  </select>
                  {workerMode && (
                    <span className="osh-help">
                      근로자 신청 사업은 사업장 규모·업종을 보지 않습니다.
                      지역만 적용합니다.
                    </span>
                  )}
                </label>
                <label className="osh-field">
                  <span className="osh-label">
                    상시근로자 수{mark("근로자수")}
                  </span>
                  <input
                    className="osh-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99999}
                    value={cond.workers}
                    disabled={workerMode}
                    onChange={(e) =>
                      set({
                        workers: Math.min(
                          99999,
                          Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                        ),
                      })
                    }
                  />
                </label>
                <label className="osh-field">
                  <span className="osh-label">
                    업종 (KSIC 11차){mark("업종")}
                  </span>
                  <select
                    className="osh-input"
                    value={cond.industry}
                    disabled={workerMode}
                    onChange={(e) => set({ industry: e.target.value })}
                  >
                    <option value="전체">
                      전체 업종 — 업종으로 거르지 않음
                    </option>
                    {sections.map((s) => (
                      <optgroup key={s.code} label={`${s.code} ${s.name}`}>
                        <option value={s.code}>
                          {s.code} 전체 —{" "}
                          {s.name.replace(/\([^)]*\)$/, "").trim()}
                        </option>
                        {divisions
                          .filter((d) => d.parent === s.code)
                          .map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.code} {d.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="osh-field">
                  <span className="osh-label">지역{mark("지역")}</span>
                  <select
                    className="osh-input"
                    value={cond.region}
                    onChange={(e) => set({ region: e.target.value })}
                  >
                    <option value="전국">전국 (지자체 사업은 따로 셈)</option>
                    <optgroup label="시·도">
                      {regions(data.사업).map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <label className="osh-field">
                  <span className="osh-label">기업 여부{mark("기업")}</span>
                  <select
                    className="osh-input"
                    value={cond.business}
                    disabled={workerMode}
                    onChange={(e) =>
                      set({ business: e.target.value as Business })
                    }
                  >
                    {(Object.keys(businessLabel) as Business[]).map((b) => (
                      <option key={b} value={b}>
                        {businessLabel[b]}
                      </option>
                    ))}
                  </select>
                  <span className="osh-help">
                    ‘중소기업’은 소기업이 아닌 중소기업입니다.
                  </span>
                </label>
                <fieldset className="osh-field sp-radios" disabled={workerMode}>
                  <legend className="osh-label">
                    유해인자 보유{mark("유해인자")}
                  </legend>
                  <div>
                    {(["Y", "N", "모름"] as Hazard[]).map((h) => (
                      <label key={h}>
                        <input
                          type="radio"
                          name="hazard"
                          value={h}
                          checked={cond.hazard === h}
                          onChange={() => set({ hazard: h })}
                        />
                        {h === "Y" ? "예" : h === "N" ? "아니오" : "모름"}
                      </label>
                    ))}
                  </div>
                  <span className="osh-help">
                    소음·분진·화학물질 등 작업환경측정 대상 인자
                  </span>
                </fieldset>
              </div>
            </form>

            <section
              className="osh-section"
              aria-labelledby="summary"
              aria-live="polite"
            >
              <h2 className="osh-heading" id="summary">
                판정 요약
              </h2>
              <div className="sp-tiles">
                <p className="sp-tile sp-ok">
                  <b>{out.tiles.eligible}건</b>
                  {workerMode
                    ? "근로자가 신청할 수 있는 지원"
                    : "받을 수 있는 지원사업"}
                </p>
                {out.tiles.personal > 0 && (
                  <p className="sp-tile sp-info">
                    <b>{out.tiles.personal}건</b>그중 근로자 본인 신청
                  </p>
                )}
                {out.tiles.regional > 0 && (
                  <p className="sp-tile sp-info">
                    <b>{out.tiles.regional}건</b>그중 지역 한정
                  </p>
                )}
                <p className="sp-tile sp-no">
                  <b>{out.tiles.excluded}건</b>해당 안 됨
                </p>
              </div>
              <p className="osh-help">
                받을 수 있는 {out.tiles.eligible}건 + 해당 안 됨{" "}
                {out.tiles.excluded}건 ={" "}
                {judgedTotal === total
                  ? `전체 ${total}건.`
                  : `${judgedTotal}건. 나머지 ${total - judgedTotal}건은 고른 신청 주체가 신청하는 사업이 아니어서 판정하지 않았습니다.`}{" "}
                가운데 칸은 받을 수 있는 것 안에서 나눈 수입니다. 검색어와
                분류는 이 수를 줄이지 않습니다.
              </p>
              <p className="osh-help">
                조건 —{" "}
                {workerMode
                  ? `근로자 · ${cond.region}`
                  : `상시근로자 ${cond.workers}명 · ${industryLabel(cond.industry)} · ${cond.region} · 기업 ${businessLabel[cond.business]} · 유해인자 ${cond.hazard}`}
                {query && ` · 검색 ‘${query}’ 맞는 사업 ${out.matches}건`}
              </p>
            </section>

            <section className="osh-section" aria-labelledby="need">
              <h2 className="osh-heading" id="need">
                무엇이 필요하세요?{mark("분류")}
              </h2>
              <p className="osh-help">
                여러 개 고를 수 있습니다. 숫자는 목록에 오르는 사업 수로, 받을
                수 있는 것과 해당 안 되는 것을 모두 셉니다
                {query && ". ‘검색’은 그중 검색어와 맞는 수입니다"}.
              </p>
              <div className="sp-branches sp-categories">
                {data.분류.map(({ 이름, 설명 }) => (
                  <button
                    key={이름}
                    type="button"
                    className="sp-branch"
                    aria-pressed={picks.categories.includes(이름)}
                    onClick={() => toggle("categories", 이름)}
                  >
                    <b>{이름}</b>
                    <span>{설명}</span>
                    <em>
                      {out.categoryCounts[이름] ?? 0}건
                      {query && ` · 검색 ${out.categoryMatches[이름] ?? 0}`}
                    </em>
                  </button>
                ))}
              </div>
              <div className="sp-ways" role="group" aria-labelledby="ways">
                <span className="osh-label" id="ways">
                  어떻게 받나
                </span>
                <div className="osh-actions">
                  {Object.keys(ways).map((w) => (
                    <button
                      key={w}
                      type="button"
                      className="sp-kind"
                      aria-pressed={picks.ways.includes(w)}
                      onClick={() => toggle("ways", w)}
                    >
                      {w} <b>{out.wayCounts[w]}</b>
                    </button>
                  ))}
                  {picked && (
                    <button
                      type="button"
                      className="osh-button osh-button--secondary"
                      onClick={() => {
                        edited(["분류"]);
                        setPicks({ categories: [], ways: [] });
                      }}
                    >
                      고른 것 모두 풀기
                    </button>
                  )}
                </div>
              </div>
              {!listing && (
                <p className="osh-note">
                  분류나 받는 방식을 고르거나 검색어를 넣으면 사업이 나옵니다.
                </p>
              )}
            </section>

            {listing && (
              <section className="osh-section" aria-labelledby="list">
                <h2 className="osh-heading" id="list">
                  {listTitle}{" "}
                  <span className="sp-count">
                    {out.eligible.length + out.excluded.length}건
                  </span>
                </h2>
                {out.eligible.length + out.excluded.length === 0 ? (
                  <p className="osh-note">
                    {picked
                      ? "고른 분류·받는 방식에는 이 조건으로 걸리는 사업이 없습니다. 다른 분류를 함께 고르거나 근로자 수·업종·신청 주체를 바꿔 보세요."
                      : "검색어와 맞는 사업이 없습니다. 다른 말로 찾거나 위에서 분류를 골라 보세요."}
                  </p>
                ) : (
                  <>
                    <p className="osh-help">
                      받을 수 있는 {out.eligible.length}건
                      {out.excluded.length > 0 &&
                        `, 조건에 안 맞는 ${out.excluded.length}건은 끝에 흐리게 붙였습니다`}
                      .{" "}
                      {query && picked
                        ? `검색어와 맞는 ${out.matches}건을 앞에 두었습니다. `
                        : ""}
                      차례는 확실한 것 → 사업장 상황 조건 → 확인 필요 → 근로자
                      본인 신청 → 지역 한정이고, 같은 단계 안에서는 방문마다
                      무작위 순서입니다.
                    </p>
                    <div className="sp-programs">
                      {out.eligible.map((j, index) => (
                        <ProgramCard
                          key={j.row["사업ID"]}
                          judged={j}
                          items={itemsOf[j.row["사업ID"]] ?? []}
                          full
                          rank={index + 1}
                          count={out.eligible.length}
                          log={record}
                          searched={!!query}
                        />
                      ))}
                    </div>
                    {out.excluded.length > 0 && (
                      <>
                        <h3 className="osh-card-title sp-excluded-title">
                          조건에 안 맞는 사업 {out.excluded.length}건
                        </h3>
                        <div className="sp-programs">
                          {out.excluded.map((j) => (
                            <ProgramCard
                              key={j.row["사업ID"]}
                              judged={j}
                              items={[]}
                              full={false}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            )}

            <Sources data={data} />
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
