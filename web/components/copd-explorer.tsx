"use client";
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
  year: string;
  approval: string;
  occupation: string;
  qa: string;
  page: number;
};
const initial: Filters = {
  q: "",
  mode: "keyword",
  year: "",
  approval: "",
  occupation: "",
  qa: "",
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
}: {
  enabled: boolean;
  initialFilters?: Record<string, string>;
  initialTab?: string;
  apiBase?: string;
}) {
  const api = useCallback(
    (action: string, payload?: unknown) => requestApi(apiBase, action, payload),
    [apiBase],
  );
  const [tab, setTab] = useState(initialTab === "files" ? "files" : enabled ? "search" : "overview");
  const [filters, setFilters] = useState<Filters>({
    ...initial,
    ...initialFilters,
  });
  const [applied, setApplied] = useState<Filters>({
    ...initial,
    ...initialFilters,
  });
  const [occupations, setOccupations] = useState<string[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailTab, setDetailTab] = useState("text");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [downloads, setDownloads] = useState<{id: string; name: string; bytes: number; sha256: string}[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileBusy, setFileBusy] = useState("");
  const requestId = useRef(0);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api("files").then(data => { if (active) setDownloads(data.files); }).catch(() => {
      if (active) setFileError("파일 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.");
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
    setFileBusy(id); setFileError("");
    try {
      const result = await api("download", { id });
      const url = new URL(result.url);
      if (url.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || !url.pathname.startsWith("/storage/v1/object/sign/")) throw new Error("다운로드 주소를 확인하지 못했습니다.");
      window.location.assign(url.toString());
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "다운로드를 준비하지 못했습니다.");
    } finally { setFileBusy(""); }
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
        if (value && key !== "page") params.set(key, String(value));
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
  const set = (key: keyof Filters, value: string) =>
    setFilters((old) => ({ ...old, [key]: value, page: 1 }));
  return (
    <>
      <p className="copd-caption">
        원문 출처: <a href="https://jilbyungcase.comwel.or.kr/" target="_blank" rel="noopener noreferrer">근로복지공단 원문 자료 ↗</a>
        <br />표준화 직종·요약 등 AI 가공 항목은 원문과 구분하여 제공합니다.
      </p>
      <nav className="copd-tabs" aria-label="COPD 데이터 메뉴">
        {[
          ["overview", "소개"],
          ["search", "사례 검색"],
          ["quality", "품질·한계"],
          ["files", "파일·활용법"],
        ].filter(([key]) => enabled || key !== "search").map(([key, label]) => (
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
            근로복지공단 질병판정서에서 COPD 관련 사례를 정리하고,
            직종·상병·유해인자와 노출 측정치를 가공한 연구용 자료입니다. 원문을
            만든 기관과 AI 라벨을 만든 주체는 구분됩니다.
          </p>
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
            2026-09-17 CSV와 저장된 검증 플래그를 재집계했습니다. 원문 해석이나
            AI 라벨 정확도를 새로 전수 검증한 결과는 아닙니다.
          </p>
          <div className="copd-quality-grid">
            {[
              ["대조 일치", "1,950 / 1,953", "대조 가능한 사례 중 99.85%"],
              ["판정 미대조", "129건", "일치·불일치와 별도 구분"],
              [
                "직종 값 채움",
                "2,043 / 2,082",
                "98.13% · 정확도가 아닌 채움 비율",
              ],
              [
                "측정치 수 불일치",
                "2개 사례",
                "사례 표 합계 650 · 측정 파일 646",
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
            <li>판정 대조 불일치 3건과 미대조 129건을 결과에서 구분합니다.</li>
            <li>
              노출 측정치는 79개 사례에만 있습니다. 측정치가 없다는 것은 노출이
              없다는 뜻이 아닙니다.
            </li>
            <li>
              본인 사업장·유사 사업장·문헌 수치를 구분하고, 다른 단위를 한
              평균으로 합치지 않습니다.
            </li>
            <li>
              원문·요약의 공개 범위와 익명화 검토가 완료되기 전에는 원본을
              배포하지 않습니다.
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
                <tr>
                  <td>cases.csv</td>
                  <td>2,082행 · 20열</td>
                  <td>사례와 가공 라벨</td>
                </tr>
                <tr>
                  <td>case_texts.csv</td>
                  <td>2,082행 · 3열</td>
                  <td>판정문 원문</td>
                </tr>
                <tr>
                  <td>exposure_measurements.csv</td>
                  <td>646행 · 23열</td>
                  <td>노출 측정치와 맥락</td>
                </tr>
                <tr>
                  <td>embeddings.parquet</td>
                  <td>2,082건 · 모델별 768차원</td>
                  <td>검색 인덱스</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            세 CSV는 사건번호로 연결합니다. 행 순서로 연결하지 않습니다. 검색용
            벡터는 문서와 같은 모델·설정으로 만든 질의와 비교해야 합니다.
          </p>
          {enabled ? <section aria-label="원본 파일 다운로드">
            <h3>원본 다운로드 · 내부 검토용</h3>
            <p>인증된 이용자에게 제공하는 실제 연구자료입니다. 전체 ZIP에는 반입 원본과 활용 예제가 함께 들어 있습니다. 공개 범위·라이선스·가공 라벨은 검토 중입니다.</p>
            {fileError && <p role="alert">{fileError}</p>}
            {!downloads.length && !fileError && <p role="status">파일 목록을 불러오는 중입니다.</p>}
            <ul className="copd-downloads">{downloads.map(file => <li key={file.id}>
              <div><strong>{file.name}</strong><span>{(file.bytes / 1_000_000).toFixed(2)} MB</span></div>
              <button className="button secondary" disabled={Boolean(fileBusy)} onClick={() => void downloadFile(file.id)}>
                {fileBusy === file.id ? "주소 준비 중…" : `${file.name} 다운로드`}
              </button>
              <details><summary>파일 검증값 SHA-256</summary><code>{file.sha256}</code></details>
            </li>)}</ul>
            <p className="copd-caption">다운로드 주소는 60초간 유효하며 Supabase Storage에서 직접 전송됩니다. 만료되면 버튼을 다시 누르세요.</p>
          </section> : <a className="button secondary" href="/demo/copd/?tab=files">인증된 화면에서 원본 다운로드 →</a>}
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
                placeholder="직종 또는 유해인자 입력"
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
                  <option value="keyword">키워드 · 원문 포함</option>
                  <option value="local">로컬 의미 검색</option>
                  <option value="gemini">Gemini 의미 검색</option>
                </select>
              </label>
              <label>
                청구 연도
                <select
                  value={filters.year}
                  disabled={!enabled || !!busy}
                  onChange={(e) => set("year", e.target.value)}
                >
                  <option value="">전체 연도</option>
                  {[2016, 2017, 2018, 2019, 2020, 2021].map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label>
                원문 기반 판정
                <select
                  value={filters.approval}
                  disabled={!enabled || !!busy}
                  onChange={(e) => set("approval", e.target.value)}
                >
                  <option value="">전체 판정</option>
                  {["인정", "불인정", "일부인정"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                AI 표준 직종
                <select
                  value={filters.occupation}
                  disabled={!enabled || !!busy}
                  onChange={(e) => set("occupation", e.target.value)}
                >
                  <option value="">전체 직종</option>
                  {occupations.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                판정 대조
                <select
                  value={filters.qa}
                  disabled={!enabled || !!busy}
                  onChange={(e) => set("qa", e.target.value)}
                >
                  <option value="">전체 상태</option>
                  <option value="matched">일치</option>
                  <option value="mismatch">불일치</option>
                  <option value="unverified">미대조</option>
                </select>
              </label>
            </div>
            <p className="copd-caption">
              {filters.mode === "gemini"
                ? "Gemini에는 검색어만 전송합니다. 개인 식별정보를 검색어에 입력하지 마세요."
                : filters.mode === "local"
                  ? "로컬 검색 모델이 의미가 가까운 사례와 키워드 결과를 함께 찾습니다."
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
                    {["local", "gemini"].includes(results.ranking)
                      ? `의미 검색 후보 · 필터 대상 ${results.filtered_total.toLocaleString()}건`
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
