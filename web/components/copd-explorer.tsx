"use client";
import { CopdPreview } from "./copd-preview";
import { getStudy, studyDemo, type SanjeStudy } from "@/lib/sanje";
import { SanjeEvidence, type LabelPage } from "./sanje-evidence";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  FileText,
  Sparkles,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";

type Case = {
  accnum: string;
  year: string;
  approval: string;
  occupation: string;
  ai_occupation: string;
  ai_summary: string;
  ai_hazards: string;
  qa: string;
  measurements: number;
};
type Detail = Case & {
  fields: Record<string, string>;
  text: string;
  measurement_rows: Record<string, string>[];
  standard_labels?: LabelPage;
  worktime?: Record<string, string> | null;
  worktime_rows?: Record<string, string>[];
};
type Results = {
  results: Case[];
  total: number;
  filtered_total: number;
  page: number;
  page_size: number;
  ranking: string;
};
type Filters = {
  q: string;
  mode: string;
  year: string[];
  approval: string[];
  occupation: string[];
  qa: string[];
  page: number;
};
const initial: Filters = {
  q: "",
  mode: "hybrid",
  year: [],
  approval: [],
  occupation: [],
  qa: [],
  page: 1,
};
const qaLabel: Record<string, string> = {
  matched: "주문 대조 일치",
  mismatch: "판정 대조 불일치",
  unverified: "판정 미대조",
};
async function requestApi(base: string, action: string, payload?: unknown) {
  const response = await fetch(
    `${base}?action=${action}`,
    payload
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "요청을 완료하지 못했습니다.");
  return data;
}
export function CopdExplorer({
  enabled,
  initialFilters = {},
  initialTab = "search",
  apiBase = "/api/copd",
  study = getStudy("copd")!,
}: {
  enabled: boolean;
  initialFilters?: Record<string, string>;
  initialTab?: string;
  apiBase?: string;
  study?: SanjeStudy;
}) {
  const parsedFilters: Filters = {
    ...initial,
    q: initialFilters.q || "",
    mode: initialFilters.mode === "keyword" ? "keyword" : "hybrid",
  };
  for (const key of ["year", "approval", "occupation", "qa"] as const) {
    const raw = initialFilters[key];
    if (raw) {
      try {
        const value: unknown = JSON.parse(raw);
        parsedFilters[key] =
          Array.isArray(value) &&
          value.every((item) => typeof item === "string")
            ? value
            : [raw];
      } catch {
        parsedFilters[key] = [raw];
      }
    }
  }
  const api = useCallback(
    (action: string, payload?: unknown) => requestApi(apiBase, action, payload),
    [apiBase],
  );
  const [tab, setTab] = useState(
    initialTab === "files" ? "files" : enabled ? "search" : "overview",
  );
  const [filters, setFilters] = useState<Filters>({
    ...parsedFilters,
  });
  const [applied, setApplied] = useState<Filters>({
    ...parsedFilters,
  });
  const [occupations, setOccupations] = useState<string[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailTab, setDetailTab] = useState("text");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [downloads, setDownloads] = useState<
    { id: string; name: string; bytes: number; sha256: string }[]
  >([]);
  const [fileError, setFileError] = useState("");
  const [fileBusy, setFileBusy] = useState("");
  const requestId = useRef(0);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api("files")
      .then((data) => {
        if (active) setDownloads(data.files);
      })
      .catch(() => {
        if (active)
          setFileError(
            "파일 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
          );
      });
    api("info")
      .then((data) => {
        if (active) setOccupations(data.occupations);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [enabled, api]);
  async function downloadFile(id: string) {
    setFileBusy(id);
    setFileError("");
    try {
      const result = await api("download", { id });
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
        !url.pathname.startsWith("/storage/v1/object/sign/")
      )
        throw new Error("다운로드 주소를 확인하지 못했습니다.");
      window.location.assign(url.toString());
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : "다운로드를 준비하지 못했습니다.",
      );
    } finally {
      setFileBusy("");
    }
  }
  async function search(values: Filters) {
    const id = ++requestId.current;
    setBusy("search");
    setError("");
    setDetail(null);
    setAnswer("");
    setResults(null);
    try {
      const data = await api("search", values);
      if (id !== requestId.current) return;
      setResults(data);
      setApplied(values);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(values))
        if (value && key !== "page")
          params.set(
            key,
            Array.isArray(value) ? JSON.stringify(value) : String(value),
          );
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params}`,
      );
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy("");
    }
  }
  async function openCase(id: string) {
    const current = ++requestId.current;
    setBusy("case");
    setError("");
    setDetail(null);
    setAnswer("");
    try {
      const data = await api(`case&id=${encodeURIComponent(id)}`);
      if (current !== requestId.current) return;
      setDetail(data);
      setDetailTab("text");
      setTimeout(() => {
        detailRef.current?.focus();
        if (window.innerWidth <= 850)
          detailRef.current?.scrollIntoView({ behavior: "instant" });
      }, 0);
    } catch (e) {
      if (current === requestId.current) setError((e as Error).message);
    } finally {
      if (current === requestId.current) setBusy("");
    }
  }
  async function explain() {
    if (!detail) return;
    setBusy("explain");
    setError("");
    setAnswer("");
    try {
      const data = await api("explain", { accnum: detail.accnum });
      setAnswer(data.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const set = (key: keyof Filters, value: string | string[]) =>
    setFilters((old) => ({ ...old, [key]: value, page: 1 }));
  return (
    <>
      <p className="copd-caption">
        원문 출처:{" "}
        <a
          href="https://jilbyungcase.comwel.or.kr/"
          target="_blank"
          rel="noopener noreferrer"
        >
          근로복지공단 원문 자료 ↗
        </a>
        <br />
        표준화 직종·요약 등 AI 가공 항목은 원문과 구분하여 제공합니다.
      </p>
      <nav className="copd-tabs" aria-label={`${study.name} 데이터 메뉴`}>
        {[
          ["overview", "소개"],
          ["search", "사례 검색"],
          ["quality", "품질·한계"],
          ["files", "파일·활용법"],
        ]
          .filter(([key]) => enabled || key !== "search")
          .map(([key, label]) => (
            <button
              key={key}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
      </nav>
      {tab === "overview" && (
        <section className="copd-prose">
          <h2>공개 판정문에 검색 가능한 구조를 더했습니다</h2>
          <p>
            근로복지공단 질병판정서에서 {study.name} 관련 사례를 정리하고,
            직종·상병·유해인자와 노출 측정치를 가공한 연구용 자료입니다. 원문을
            만든 기관과 AI 라벨을 만든 주체는 구분됩니다.
          </p>
          {study.id === "copd" ? (
            <CopdPreview />
          ) : (
            <p className="copd-caption">
              사례별 표와 원문은 인증된 검색 DEMO에서 확인할 수 있습니다.
            </p>
          )}
          <div className="copd-feature-grid">
            <article>
              <FileText />
              <h3>원문 기반 정보</h3>
              <p>
                청구 연도, 판정, 원문 직종과 판정문을 함께 확인합니다. 추출값도
                원문 대조가 필요합니다.
              </p>
            </article>
            <article>
              <Sparkles />
              <h3>AI 가공 라벨</h3>
              <p>
                표준 직종·유해인자·요약은 AI 산출물입니다. 검증된 정답이나
                개인의 승인 가능성을 뜻하지 않습니다.
              </p>
            </article>
          </div>
          <h3>이 자료를 읽을 때</h3>
          <p>
            산재를 신청해 판정까지 이루어진 사례만 포함합니다. 여기서 계산한
            인정 비율을 전체 노동자의 질병 위험이나 개인의 승인 확률로 해석할 수
            없습니다.
          </p>
          <p>
            원문 출처: 근로복지공단 질병판정서. 가공 라벨의 권리 귀속과 최종
            라이선스는 검토 중입니다.
          </p>
        </section>
      )}
      {tab === "quality" && (
        <section className="copd-prose">
          <h2>확인한 범위까지, 수치로 보여드립니다</h2>
          <p>
            {study.version}의 실제 CSV와 저장된 검증 플래그를 재집계했습니다. AI
            라벨 의미의 정확도를 전수 검증한 결과는 아닙니다.
          </p>
          <div className="copd-quality-grid">
            {[
              [
                "판정 대조 일치",
                `${study.qa.matched.toLocaleString()}건`,
                `불일치 ${study.qa.mismatch.toLocaleString()}건 · 미대조 ${study.qa.unverified.toLocaleString()}건`,
              ],
              [
                "직종 값 채움",
                `${study.occupation_filled.toLocaleString()} / ${study.cases.toLocaleString()}`,
                "정확도가 아닌 입력값 존재 여부",
              ],
              [
                "측정치 수 불일치",
                `${study.count_mismatches}개 사례`,
                `측정치 ${study.measurements.toLocaleString()}행 · ${study.measured_cases}개 사례`,
              ],
              [
                "표준 라벨 후보",
                `${study.labels.toLocaleString()}개`,
                "전부 미검토 후보 · 사건 수와 구분",
              ],
            ].map(([title, value, note]) => (
              <article key={title}>
                <span>{title}</span>
                <strong>{value}</strong>
                <p>{note}</p>
              </article>
            ))}
          </div>
          <h3>추가 검토가 필요한 부분</h3>
          <ul>
            <li>
              원문·AI 추출·후보 코드·검토 상태를 구분하세요. 매핑 후보는 확정
              판정이 아닙니다.
            </li>
            <li>
              측정치·근무시간이 없다고 노출·업무 부담이 없었던 것은 아닙니다.
            </li>
            <li>
              사례별 판정 대조 플래그는 표준 라벨의 검수 상태와 별개입니다.
            </li>
            <li>
              원문·요약·다운로드는 인증된 검토 화면에서 제공합니다. 최종
              라이선스와 내용 검수는 진행 중입니다.
            </li>
          </ul>
        </section>
      )}
      {tab === "files" && (
        <section className="copd-prose">
          <h2>자료 구성과 활용</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>파일</th>
                  <th>구성</th>
                  <th>용도</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "cases.csv",
                    `${study.cases.toLocaleString()}행 · ${study.case_columns}열`,
                    "사례와 가공 라벨",
                  ],
                  [
                    "case_texts.csv",
                    `${study.cases.toLocaleString()}행`,
                    "마스킹 판정문",
                  ],
                  [
                    "exposure_measurements.csv",
                    `${study.measurements.toLocaleString()}행`,
                    "노출 측정치와 맥락",
                  ],
                  [
                    "worktime.csv / worktime_records.csv",
                    `${study.worktime_cases}사례 / ${study.worktime_records.toLocaleString()}행`,
                    "근무시간 요약과 근거",
                  ],
                  [
                    "standard_labels.jsonl",
                    `${study.labels.toLocaleString()}개 후보`,
                    "표준 코드 후보와 원문 근거",
                  ],
                  [
                    "metadata.jsonl",
                    `${study.cases.toLocaleString()}행`,
                    "사례별 가공·연결 메타데이터",
                  ],
                ].map(([file, count, purpose]) => (
                  <tr key={file}>
                    <td>{file}</td>
                    <td>{count}</td>
                    <td>{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            표와 JSONL은 사건번호로 연결합니다. 자연어 검색은 직종·유해인자·AI 요약을
            바탕으로 관련 사례를 찾습니다. 원문 전체의 단어 포함 여부는 키워드 검색으로 확인하세요.
          </p>
          {enabled ? (
            <section aria-label="원본 파일 다운로드">
              <h3>원본 다운로드 · 내부 검토용</h3>
              <p>
                인증된 이용자에게 제공하는 실제 연구자료입니다. 전체 ZIP에는
                반입 원본과 활용 예제가 함께 들어 있습니다. 공개
                범위·라이선스·가공 라벨은 검토 중입니다.
              </p>
              {fileError && <p role="alert">{fileError}</p>}
              {!downloads.length && !fileError && (
                <p role="status">파일 목록을 불러오는 중입니다.</p>
              )}
              <ul className="copd-downloads">
                {downloads.map((file) => (
                  <li key={file.id}>
                    <div>
                      <strong>{file.name}</strong>
                      <span>{(file.bytes / 1_000_000).toFixed(2)} MB</span>
                    </div>
                    <button
                      className="button secondary"
                      disabled={Boolean(fileBusy)}
                      onClick={() => void downloadFile(file.id)}
                    >
                      {fileBusy === file.id
                        ? "주소 준비 중…"
                        : `${file.name} 다운로드`}
                    </button>
                    <details>
                      <summary>파일 검증값 SHA-256</summary>
                      <code>{file.sha256}</code>
                    </details>
                  </li>
                ))}
              </ul>
              <p className="copd-caption">
                다운로드 주소는 60초간 유효하며 Supabase Storage에서 직접
                전송됩니다. 만료되면 버튼을 다시 누르세요.
              </p>
            </section>
          ) : (
            <a
              className="button secondary"
              href={`${studyDemo(study.id)}?tab=files`}
            >
              인증된 화면에서 원본 다운로드 →
            </a>
          )}
          <p className="copd-caption">Hugging Face 게시 계획 없음.</p>
        </section>
      )}
      {enabled && tab === "search" && (
        <>
          <form
            className="copd-search"
            onSubmit={(e) => {
              e.preventDefault();
              void search({ ...filters, page: 1 });
            }}
          >
            <label htmlFor="copd-query">어떤 사례를 찾으시나요?</label>
            <div className="copd-query">
              <Search size={21} />
              <input
                id="copd-query"
                value={filters.q}
                onChange={(e) => set("q", e.target.value)}
                placeholder="궁금한 작업 상황을 문장으로 입력하세요"
                maxLength={300}
                disabled={!enabled || !!busy}
              />
              <button className="button" disabled={!enabled || !!busy}>
                사례 검색 <ArrowRight size={16} />
              </button>
            </div>
            <div className="copd-filters">
              <label>
                검색 방식
                <select
                  value={filters.mode}
                  disabled={!enabled || !!busy}
                  onChange={(e) => set("mode", e.target.value)}
                >
                  <option value="hybrid">자연어 · 하이브리드</option>
                  <option value="keyword">키워드 · 원문 포함</option>
                </select>
              </label>
              <label>
                청구 연도
                <select
                  multiple
                  size={4}
                  aria-label="청구 연도"
                  value={filters.year}
                  disabled={!enabled || !!busy}
                  onChange={(e) =>
                    set(
                      "year",
                      Array.from(
                        e.target.selectedOptions,
                        (option) => option.value,
                      ),
                    )
                  }
                >
                  {study.years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label>
                원문 기반 판정
                <select
                  multiple
                  size={4}
                  aria-label="원문 기반 판정"
                  value={filters.approval}
                  disabled={!enabled || !!busy}
                  onChange={(e) =>
                    set(
                      "approval",
                      Array.from(
                        e.target.selectedOptions,
                        (option) => option.value,
                      ),
                    )
                  }
                >
                  {["인정", "불인정", "일부인정"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                AI 표준 직종
                <select
                  multiple
                  size={4}
                  aria-label="AI 표준 직종"
                  value={filters.occupation}
                  disabled={!enabled || !!busy}
                  onChange={(e) =>
                    set(
                      "occupation",
                      Array.from(
                        e.target.selectedOptions,
                        (option) => option.value,
                      ),
                    )
                  }
                >
                  {occupations.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                판정 대조
                <select
                  multiple
                  size={4}
                  aria-label="판정 대조"
                  value={filters.qa}
                  disabled={!enabled || !!busy}
                  onChange={(e) =>
                    set(
                      "qa",
                      Array.from(
                        e.target.selectedOptions,
                        (option) => option.value,
                      ),
                    )
                  }
                >
                  <option value="matched">일치</option>
                  <option value="mismatch">불일치</option>
                  <option value="unverified">미대조</option>
                </select>
              </label>
            </div>
            <p className="copd-caption">
              필터는 여러 항목을 선택할 수 있습니다. 같은 필터는 OR, 서로 다른
              필터는 AND로 적용합니다. 선택하지 않으면 전체입니다. PC에서는 Ctrl
              또는 ⌘ 키와 클릭으로 선택을 추가·해제합니다.
            </p>
            <p className="copd-caption">
              {filters.mode === "hybrid"
                ? "작업 상황이나 질문을 문장으로 입력하세요. 서버 안에서 의미와 키워드를 함께 비교해 관련 후보를 최대 200건 보여줍니다. 비워두면 필터에 맞는 전체 목록을 봅니다."
                : "공백으로 구분한 검색어를 모두 포함하는 사례를 찾습니다. 비워두면 필터에 맞는 목록을 봅니다."}
            </p>
          </form>
          {error && (
            <div className="copd-error" role="alert">
              {error}
            </div>
          )}
          <div role="status" aria-live="polite" className="copd-status">
            {busy && (
              <>
                <LoaderCircle className="copd-spinner" size={18} />
                {busy === "search"
                  ? "사례를 찾고 있습니다…"
                  : busy === "case"
                    ? "원문을 불러오고 있습니다…"
                    : "로컬 모델이 원문 발췌를 읽고 있습니다. CPU 실행은 시간이 걸릴 수 있습니다…"}
              </>
            )}
          </div>
          {!results && !busy && (
            <div className="copd-empty">
              <Search size={34} />
              <h2>사례 탐색을 시작해 보세요</h2>
              <p>검색어를 입력하거나 조건을 선택한 뒤 사례 검색을 누르세요.</p>
            </div>
          )}
          {results && (
            <div className="copd-workspace">
              <section className="copd-list" aria-label="검색 결과">
                <div className="copd-result-count">
                  <strong>{results.total.toLocaleString()}건</strong>
                  <span>
                    {["hybrid", "local", "gemini"].includes(results.ranking)
                      ? `자연어 관련 후보 · 필터 대상 ${results.filtered_total.toLocaleString()}건 · 관련성은 원문에서 확인하세요`
                      : "조건에 맞는 사례"}
                  </span>
                </div>
                {!results.results.length && (
                  <div className="copd-empty">
                    <h3>조건에 맞는 사례가 없습니다</h3>
                    <p>검색어를 줄이거나 필터를 바꿔주세요.</p>
                  </div>
                )}
                {results.results.map((row) => (
                  <button
                    key={row.accnum}
                    className={`copd-case ${detail?.accnum === row.accnum ? "selected" : ""}`}
                    disabled={!!busy}
                    onClick={() => void openCase(row.accnum)}
                  >
                    <span className="copd-labels">
                      <span className="badge">원문 기반 · {row.approval}</span>
                      <span className={`copd-qa ${row.qa}`}>
                        {qaLabel[row.qa]}
                      </span>
                    </span>
                    <strong>
                      {row.ai_occupation || "직종 미분류"}
                      <small>AI 표준 직종</small>
                    </strong>
                    <span className="copd-case-summary">{row.ai_summary}</span>
                    <span className="copd-caption">
                      {row.year} · {row.accnum} · 측정치 {row.measurements}건
                    </span>
                  </button>
                ))}
                {results.total > 20 && (
                  <div className="copd-pagination">
                    <button
                      className="button secondary small"
                      disabled={!!busy || results.page === 1}
                      onClick={() =>
                        void search({ ...applied, page: results.page - 1 })
                      }
                    >
                      이전
                    </button>
                    <span>
                      {results.page} / {Math.ceil(results.total / 20)}
                    </span>
                    <button
                      className="button secondary small"
                      disabled={!!busy || results.page * 20 >= results.total}
                      onClick={() =>
                        void search({ ...applied, page: results.page + 1 })
                      }
                    >
                      다음
                    </button>
                  </div>
                )}
              </section>
              <section
                className="copd-detail"
                ref={detailRef}
                tabIndex={-1}
                aria-label="선택한 사례 상세"
              >
                {!detail ? (
                  <div className="copd-empty">
                    <FileText size={34} />
                    <h3>사례를 선택해 주세요</h3>
                    <p>원문·AI 라벨·측정 맥락을 비교할 수 있습니다.</p>
                  </div>
                ) : (
                  <>
                    <div className="copd-labels">
                      <span className="badge">실제 자료 · 내부 검토</span>
                      <span className={`copd-qa ${detail.qa}`}>
                        {qaLabel[detail.qa]}
                      </span>
                    </div>
                    <h2>{detail.occupation}</h2>
                    <p className="copd-caption">
                      {detail.accnum} · {detail.year} · 원문 기반 판정:{" "}
                      {detail.approval}
                    </p>
                    <nav className="copd-subtabs" aria-label="사례 상세 보기">
                      {[
                        ["text", "원문"],
                        ["ai", "AI 요약·라벨"],
                        ["exposure", "노출 측정치"],
                        ["evidence", "라벨·근무시간"],
                      ].map(([k, l]) => (
                        <button
                          key={k}
                          aria-pressed={detailTab === k}
                          onClick={() => setDetailTab(k)}
                        >
                          {l}
                        </button>
                      ))}
                    </nav>
                    {detailTab === "text" && (
                      <div className="copd-source">{detail.text}</div>
                    )}
                    {detailTab === "ai" && (
                      <>
                        <p className="copd-ai-note">
                          AI 가공 정보입니다. 원문에 근거해 검토해야 하며
                          정답이나 승인 확률을 뜻하지 않습니다.
                        </p>
                        <h3>기존 AI 요약</h3>
                        <p>{detail.ai_summary}</p>
                        <dl className="copd-fields">
                          {Object.entries(detail.fields)
                            .filter(
                              ([key]) =>
                                key.startsWith("ai_") && key !== "ai_summary",
                            )
                            .map(([key, value]) => (
                              <div key={key}>
                                <dt>{key}</dt>
                                <dd>{value || "값 없음"}</dd>
                              </div>
                            ))}
                        </dl>
                        <button
                          className="button secondary"
                          onClick={() => void explain()}
                          disabled={!!busy}
                        >
                          <Sparkles size={16} /> 로컬 AI로 설명 생성
                        </button>
                        <p className="copd-caption">
                          Gemma 4가 원문 앞부분 최대 5,000자를 읽습니다. 외부로
                          원문을 전송하지 않습니다.
                        </p>
                        {answer && (
                          <div className="copd-answer">
                            <strong>AI 생성 설명 · Gemma 4</strong>
                            <p>{answer}</p>
                            <span className="copd-caption">
                              근거: 현재 선택한 판정문 발췌. 원문 탭에서
                              확인하세요.
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {detailTab === "evidence" && (
                      <SanjeEvidence
                        key={detail.accnum}
                        apiBase={apiBase}
                        id={detail.accnum}
                        labels={detail.standard_labels}
                        worktime={detail.worktime}
                        worktimeRows={detail.worktime_rows}
                      />
                    )}
                    {detailTab === "exposure" &&
                      (!detail.measurement_rows.length ? (
                        <p>
                          추출된 측정치가 없습니다. 노출이 없었다는 뜻은
                          아닙니다.
                        </p>
                      ) : (
                        <>
                          <p className="copd-caption">
                            대상·조사 주체·단위가 다른 수치를 합산하지 마세요.
                          </p>
                          {detail.measurement_rows.map((row, i) => (
                            <article className="copd-exposure" key={i}>
                              <h3>
                                {row.ai_agent_std} <small>AI 표준화</small>
                              </h3>
                              <p>
                                원문: {row.raw_agent} · {row.raw_value}{" "}
                                {row.raw_unit}
                              </p>
                              <dl>
                                {[
                                  [
                                    "표준화 값",
                                    `${row.ai_value_norm || "값 없음"} ${row.ai_unit_base}`,
                                  ],
                                  ["출처 맥락", row.ctx_source_type],
                                  ["조사 주체", row.ctx_measured_by],
                                  ["통계 유형", row.ctx_stat_type],
                                  ["값의 근거", row.qa_value_provenance],
                                  ["검토 필요", row.qa_needs_review],
                                ].map(([k, v]) => (
                                  <div key={k}>
                                    <dt>{k}</dt>
                                    <dd>{v || "기재 없음"}</dd>
                                  </div>
                                ))}
                              </dl>
                            </article>
                          ))}
                        </>
                      ))}
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
