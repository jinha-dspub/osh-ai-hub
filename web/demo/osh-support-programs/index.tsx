import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import "../../app/globals.css";
import "../../../design/osh-family/osh-family.css";
import "./style.css";
import { divisions, sections } from "./ksic";
import { createLog, type LogEvent } from "./log";
import {
  amount,
  branches,
  businessLabel,
  evaluate,
  regions,
  searchText,
  type Business,
  type Condition,
  type Hazard,
  type Item,
  type Judged,
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
  사업: Program[];
  품목: Item[];
};
const start: Condition = {
  who: "전체",
  workers: 30,
  industry: "C25",
  region: "전국",
  business: "모름",
  hazard: "모름",
  query: "",
};
const presets: [string, Partial<Condition>][] = [
  [
    "30명 · 금속가공(C25)",
    { workers: 30, industry: "C25", business: "모름", hazard: "모름" },
  ],
  [
    "8명 · 인쇄업(C18) · 소기업",
    { workers: 8, industry: "C18", business: "소", hazard: "Y" },
  ],
  [
    "120명 · 종합건설(F41) · 중소기업",
    { workers: 120, industry: "F41", business: "중", hazard: "모름" },
  ],
  [
    "50명 · 전체 업종",
    { workers: 50, industry: "전체", business: "모름", hazard: "모름" },
  ],
];
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
}: {
  judged: Judged;
  items: Item[];
  full: boolean;
  rank?: number;
  count?: number;
  log?: (event: LogEvent, now?: boolean) => void;
}) {
  const id = judged.row["사업ID"];
  const out = (kind: "official" | "apply") =>
    log?.(
      {
        행동: "링크이동",
        사업ID: id,
        종류: kind,
        범주: judged.row["지원범주"],
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
        <span className="osh-badge">{r["지원범주"]}</span>
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
  const [branch, setBranch] = useState("");
  const [category, setCategory] = useState("");
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
  const out = useMemo(
    () =>
      data ? evaluate(data.사업, text, cond, branch, category) : undefined,
    [data, text, cond, branch, category],
  );
  const set = (patch: Partial<Condition>) =>
    setCond((c) => ({ ...c, ...patch }));

  // ---- demand log: starts once the table is on screen ----
  useEffect(() => {
    condRef.current = cond;
  }, [cond]);
  useEffect(() => {
    if (!data || logRef.current) return;
    const c = () => condRef.current;
    logRef.current = createLog(__SP_BUILD__, () => ({
      신청주체: c().who,
      근로자수: c().workers,
      업종: c().industry,
      지역: c().region,
      기업: c().business,
      유해인자: c().hazard,
    }));
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
  const eligibleCount = out?.tiles.eligible;
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(
      () =>
        logRef.current?.record({
          행동: "검색",
          검색어: query,
          결과건수: eligibleCount,
        }),
      900,
    );
    return () => clearTimeout(timer);
  }, [query, eligibleCount]);
  // Exposure is logged only when cards are on screen, so 이동 ÷ 노출 is not inflated.
  const shownIds =
    branch && category && out ? out.eligible.map((j) => j.row["사업ID"]) : null;
  const exposureKey = shownIds
    ? [category, query, ...shownIds.slice(0, 20)].join("|")
    : "";
  useEffect(() => {
    if (!shownIds || exposureKey === lastExposure.current) return;
    lastExposure.current = exposureKey;
    if (!shownIds.length)
      logRef.current?.record({ 행동: "0건", 범주: category, 검색어: query });
    else
      logRef.current?.record({
        행동: "노출",
        목록: shownIds.slice(0, 20),
        결과건수: shownIds.length,
        범주: category,
        검색어: query,
      });
    // shownIds is derived from exposureKey's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposureKey]);
  const workerMode = cond.who === "근로자";
  const picked = branches.find((b) => b.id === branch);
  const total = data?.사업.length ?? 0;
  const judgedTotal = out ? out.tiles.eligible + out.tiles.excluded : 0;
  const industryName =
    cond.industry === "전체"
      ? "전체 업종"
      : `${cond.industry} ${[...sections, ...divisions].find((s) => s.code === cond.industry)?.name ?? ""}`;

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
            상시근로자 수와 업종을 넣으면 요건표에서 해당하는 지원사업을 골라
            줍니다. 규모·업종·지역· 유해인자 요건만으로 판정하며,{" "}
            <strong>
              신청기간과 예산 소진 여부는 각 사업의 공식 페이지에서 확인
            </strong>
            해야 합니다.
          </p>
          <p className="osh-note sp-notice">
            <strong>수요조사 기록 안내</strong> — 이 화면은 어떤 지원이 필요한지
            알아보려는 수요조사용 시험판입니다. <b>수집 항목</b>: 누른 갈래·지원
            종류, 검색어, 사업장 조건(신청 주체·근로자 수·업종·지역·기업
            규모·유해인자), 목록에 보인 사업, 눌러서 이동한 공식·신청 페이지.
            이름·연락처·사업장명·IP는 받지 않습니다. <b>목적</b>: 지원사업 수요
            파악과 제도 개선 근거. <b>보관</b>: 연구 종료 시 파기.{" "}
            <b>제3자 제공</b>: 없음. 판정 자체는 브라우저에서 하며 AI가 만든
            설명은 없습니다.
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
            <form
              id="finder"
              className="osh-card osh-stack"
              onSubmit={(e) => e.preventDefault()}
            >
              <label className="osh-field">
                <span className="osh-label">검색어</span>
                <input
                  className="osh-input"
                  type="search"
                  value={cond.query}
                  maxLength={100}
                  placeholder="예: 프레스, 지게차, 국소배기, 끼임, 융자, 온열질환"
                  onChange={(e) => set({ query: e.target.value })}
                />
                <span className="osh-help">
                  사업명·기관·지원품목·위험요인·대상 문구를 한꺼번에 찾습니다.
                </span>
              </label>
              <h2 className="osh-card-title">사업장 조건</h2>
              <div className="sp-fields">
                <label className="osh-field">
                  <span className="osh-label">누가 신청하나</span>
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
                  <span className="osh-label">상시근로자 수</span>
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
                  <span className="osh-label">업종 (KSIC 11차)</span>
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
                  <span className="osh-label">지역</span>
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
                  <span className="osh-label">기업 여부</span>
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
                  <legend className="osh-label">유해인자 보유</legend>
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
              <div className="sp-presets">
                <span className="osh-help">예시 조건</span>
                <div className="osh-actions">
                  {presets.map(([label, p]) => (
                    <button
                      key={label}
                      type="button"
                      className="osh-button osh-button--secondary"
                      onClick={() => {
                        set({ ...p, region: "전국" });
                        setCategory("");
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                  : `${judgedTotal}건. 나머지 ${total - judgedTotal}건은 ${cond.query.trim() ? "검색어" : "고른 신청 주체"}에 걸리지 않아 판정하지 않았습니다.`}{" "}
                가운데 칸은 받을 수 있는 것 안에서 나눈 수입니다.
              </p>
              <p className="osh-help">
                조건 —{" "}
                {workerMode
                  ? `근로자 · ${cond.region}`
                  : `상시근로자 ${cond.workers}명 · ${industryName} · ${cond.region} · 기업 ${businessLabel[cond.business]} · 유해인자 ${cond.hazard}`}
                {cond.query.trim() && ` · 검색 ‘${cond.query.trim()}’`}
              </p>
            </section>

            <section className="osh-section" aria-labelledby="need">
              <h2 className="osh-heading" id="need">
                무엇이 필요하세요?
              </h2>
              <p className="osh-help">
                두 번 고르면 사업이 나옵니다. 숫자는 목록에 오르는 사업 수로,
                받을 수 있는 것과 해당 안 되는 것을 모두 셉니다.
              </p>
              <div className="sp-branches">
                {branches.map((b) => {
                  const n = b.categories.reduce(
                    (s, c) => s + out.categoryCounts[c],
                    0,
                  );
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className="sp-branch"
                      aria-pressed={branch === b.id}
                      onClick={() => {
                        if (branch !== b.id)
                          record({ 행동: "갈래선택", 범주: b.id });
                        setBranch(branch === b.id ? "" : b.id);
                        setCategory("");
                      }}
                    >
                      <b>{b.name}</b>
                      <span>{b.note}</span>
                      <em>{n}건</em>
                    </button>
                  );
                })}
              </div>
              {picked && (
                <div className="sp-map">
                  <p className="sp-map-root">
                    {picked.name}{" "}
                    <em>
                      {picked.categories.reduce(
                        (s, c) => s + out.categoryCounts[c],
                        0,
                      )}
                      건
                    </em>
                  </p>
                  <ul aria-label={`${picked.name}의 지원 종류`}>
                    {picked.categories.map((c) => (
                      <li key={c}>
                        <button
                          type="button"
                          className="sp-kind"
                          aria-pressed={category === c}
                          onClick={() => {
                            record({ 행동: "범주선택", 범주: c });
                            setCategory(c);
                          }}
                        >
                          {c} <b>{out.categoryCounts[c]}</b>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!branch && (
                <p className="osh-note">
                  위에서 하나를 고르면 그 안의 지원 종류가 나옵니다.
                </p>
              )}
              {branch && !category && (
                <p className="osh-note">
                  지원 종류를 하나 고르면 사업이 펼쳐집니다.
                </p>
              )}
            </section>

            {branch && category && (
              <section className="osh-section" aria-labelledby="list">
                <h2 className="osh-heading" id="list">
                  {category}{" "}
                  <span className="sp-count">
                    {out.eligible.length + out.excluded.length}건
                  </span>
                </h2>
                {out.eligible.length + out.excluded.length === 0 ? (
                  <p className="osh-note">
                    {category}에는 이 조건으로 걸리는 사업이 없습니다. 검색어를
                    지우거나 근로자 수·업종· 신청 주체를 바꿔 보세요.
                  </p>
                ) : (
                  <>
                    <p className="osh-help">
                      받을 수 있는 {out.eligible.length}건
                      {out.excluded.length > 0 &&
                        `, 조건에 안 맞는 ${out.excluded.length}건은 끝에 흐리게 붙였습니다`}
                      . 차례는 확실한 것 → 사업장 상황 조건 → 확인 필요 → 근로자
                      본인 신청 → 지역 한정입니다.
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
