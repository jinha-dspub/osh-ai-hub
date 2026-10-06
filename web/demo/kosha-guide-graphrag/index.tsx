import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "../../app/globals.css";
import "../../../design/osh-family/osh-family.css";
import "./style.css";

declare const __KG_BUILD__: string;
const BASE = "/demo/kosha-guide-graphrag";
const INTRO = "https://osh.ai.kr/datasets/kosha-guide-graphrag";
const MAX_CHUNKS = 6;
const MAX_LAWS = 3;

type Result = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  domain: string;
  heading: string;
  pages: number[];
  snippet: string;
  laws: string[];
  score: number;
  similarity?: number | null;
  via?: string[];
};
type Edge = {
  source: string;
  source_type: string;
  relation: string;
  target: string;
  target_type: string;
  chunk_id: string | null;
  document_id: string | null;
  document_title: string;
};
type Law = {
  key: string;
  law: string;
  kind: string;
  article: string;
  title: string;
  effective: string;
  cited: number;
  cases: number;
  case_numbers: string[];
  excerpt?: string;
  text?: string;
};
type Search = {
  query: string;
  domain: string;
  page: number;
  pages: number;
  total: number;
  shown: number;
  semantic?: "on" | "off" | "down";
  matched_terms: string[];
  highlight: string[];
  expansion: { from: string; to: string; kind: string }[];
  concepts: { surface: string; chunks: number }[];
  results: Result[];
  graph: { nodes: { label: string; matched: boolean }[]; edges: Edge[] };
  laws: Law[];
};
type Chunk = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  document_title: string;
  domain: string;
  heading_path: string[];
  pages: number[];
  text: string;
  previous: string | null;
  next: string | null;
  position: number;
  document_chunks: number;
  laws: Law[];
  graph: { source: string; relation: string; target: string }[];
};
type Answer = {
  statements: { text: string; cites: string[] }[];
  insufficient: boolean;
  note: string;
  dropped: number;
  sources: Record<
    string,
    | { type: "guide"; chunk_id: string; document_title: string }
    | { type: "law"; key: string; law: string; article: string }
    | { type: "report"; community_id: string; title: string }
    | {
        type: "relation";
        chunk_id: string;
        source: string;
        target: string;
        document_title: string;
      }
  >;
  model: string;
};
type ContextResult = {
  understanding: {
    concepts: { name: string; type: string }[];
    terms: string[];
    scope: "specific" | "overview";
  };
  nodes: { id: string; name: string; type: string; degree: number; stages: string[] }[];
  edges: {
    source: string;
    target: string;
    type: string;
    label: string;
    description: string;
    evidence: { quote: string; chunk_id: string }[];
    document_title: string;
    stages: string[];
  }[];
  reports: {
    community_id: string;
    title: string;
    summary: string;
    findings: { text: string; chunk_ids: string[]; evidence: string[] }[];
    keywords: string[];
    importance: number;
    level: number;
  }[];
  chunks: Result[];
  laws: Law[];
  highlight: string[];
  answer: Answer;
  model: string;
};
type Status = {
  chunks: number;
  documents: number;
  domains: string[];
  entities: number;
  relations: number;
  laws: number;
  cited_laws: number;
  vocab: number;
  ai: { model: string; daily_krw: number };
};

const examples = [
  "아시바 위에서 작업할 때 안전난간",
  "밀폐공간 산소농도 측정",
  "지게차 후진 경보 충돌",
  "용접 불티 화재 감시자",
  "공구리 타설 중 펌프카",
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/${path}`, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error || `요청 실패 (${res.status})`);
  return body;
}
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lawName = (l: Law | { law: string; article: string }) =>
  `${l.law} ${l.article}`;

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function fromUrl() {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get("q") ?? "",
    domain: p.get("domain") ?? "",
    page: Math.max(1, Number.parseInt(p.get("page") ?? "1", 10) || 1),
  };
}

// The address the visitor arrived with (?q=&domain=&page=), read once.
const first = fromUrl();

function App() {
  const [q, setQ] = useState(first.q);
  const [domain, setDomain] = useState(first.domain);
  const [status, setStatus] = useState<Status | null>(null);
  const [data, setData] = useState<Search | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedLaws, setPickedLaws] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, Chunk | "loading" | undefined>>({});
  const [lawOpen, setLawOpen] = useState<Record<string, Law | "loading" | undefined>>({});
  const [question, setQuestion] = useState(first.q);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"keyword" | "context">("keyword");
  const [ctxQuestion, setCtxQuestion] = useState(first.q);
  const [ctx, setCtx] = useState<ContextResult | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState("");

  async function askContext() {
    const question = ctxQuestion.trim();
    if (question.length < 5) {
      setCtxError("질문은 5자 이상 적어 주세요.");
      return;
    }
    setCtxLoading(true);
    setCtxError("");
    setCtx(null);
    setOpen({});
    setLawOpen({});
    try {
      setCtx(
        await api<ContextResult>("context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 질문: question }),
        }),
      );
    } catch (e) {
      setCtxError(e instanceof Error ? e.message : "맥락 검색에 실패했습니다.");
    } finally {
      setCtxLoading(false);
    }
  }

  useEffect(() => {
    api<Status>("status").then(setStatus).catch(() => setStatus(null));
  }, []);

  async function run(query: string, dom: string, page: number, push = true) {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("검색어를 적어 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setAnswer(null);
    setAskError("");
    try {
      const p = new URLSearchParams({ q: trimmed, page: String(page) });
      if (dom) p.set("domain", dom);
      const got = await api<Search>(`search?${p}`);
      setData(got);
      setOpen({});
      setLawOpen({});
      setPicked(got.results.slice(0, MAX_CHUNKS).map((r) => r.chunk_id));
      setPickedLaws(got.laws.slice(0, MAX_LAWS).map((l) => l.key));
      setQuestion(trimmed);
      if (push) history.replaceState(null, "", `${BASE}/?${p}`);
      if (page > 1) resultsRef.current?.scrollIntoView({ block: "start" });
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Runs once for the address the visitor arrived with; the fetch starts after mount.
    if (first.q) queueMicrotask(() => void run(first.q, first.domain, first.page, false));
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(q, domain, 1);
  }

  async function toggleChunk(id: string) {
    if (open[id]) {
      setOpen((o) => ({ ...o, [id]: undefined }));
      return;
    }
    setOpen((o) => ({ ...o, [id]: "loading" }));
    try {
      const got = await api<Chunk>(`chunk/${id}`);
      setOpen((o) => ({ ...o, [id]: got }));
    } catch (e) {
      setOpen((o) => ({ ...o, [id]: undefined }));
      setError(e instanceof Error ? e.message : "발췌를 불러오지 못했습니다.");
    }
  }

  async function moveChunk(fromId: string, toId: string) {
    setOpen((o) => ({ ...o, [fromId]: "loading" }));
    try {
      const got = await api<Chunk>(`chunk/${toId}`);
      setOpen((o) => ({ ...o, [fromId]: got }));
    } catch (e) {
      setOpen((o) => ({ ...o, [fromId]: undefined }));
      setError(e instanceof Error ? e.message : "발췌를 불러오지 못했습니다.");
    }
  }

  async function toggleLaw(key: string) {
    if (lawOpen[key]) {
      setLawOpen((o) => ({ ...o, [key]: undefined }));
      return;
    }
    setLawOpen((o) => ({ ...o, [key]: "loading" }));
    try {
      const got = await api<Law>(`law/${encodeURIComponent(key)}`);
      setLawOpen((o) => ({ ...o, [key]: got }));
    } catch (e) {
      setLawOpen((o) => ({ ...o, [key]: undefined }));
      setError(e instanceof Error ? e.message : "조문을 불러오지 못했습니다.");
    }
  }

  function pick(id: string) {
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length >= MAX_CHUNKS
          ? p
          : [...p, id],
    );
  }
  function pickLaw(key: string) {
    setPickedLaws((p) =>
      p.includes(key)
        ? p.filter((x) => x !== key)
        : p.length >= MAX_LAWS
          ? p
          : [...p, key],
    );
  }

  async function ask() {
    if (!data || !picked.length) return;
    setAsking(true);
    setAskError("");
    setAnswer(null);
    try {
      const got = await api<Answer>("answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          질문: question.trim(),
          청크: picked,
          조문: pickedLaws,
        }),
      });
      setAnswer(got);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "AI 답변에 실패했습니다.");
    } finally {
      setAsking(false);
    }
  }

  const words = data?.highlight ?? [];
  const sourceLabel = (cite: string) => {
    const s = answer?.sources[cite];
    if (!s) return cite;
    if (s.type === "guide") return `${cite} ${s.document_title}`;
    if (s.type === "law") return `${cite} ${s.law} ${s.article}`;
    if (s.type === "report") return `${cite} ${s.title}`;
    return `${cite} ${s.source} → ${s.target}`;
  };
  const jumpTo = (cite: string) => {
    const s = answer?.sources[cite];
    if (!s) return;
    const id =
      s.type === "guide"
        ? `r-${s.chunk_id}`
        : s.type === "law"
          ? `law-${s.key}`
          : `src-${cite}`;
    document.getElementById(id)?.scrollIntoView({ block: "center" });
    document.getElementById(id)?.focus();
  };

  return (
    <div className="osh-app">
      <a className="osh-skip" href="#main">
        본문으로 건너뛰기
      </a>
      <header className="osh-header">
        <div className="osh-header-inner">
          <a className="osh-brand" href={INTRO}>
            <span className="osh-brand-mark" aria-hidden="true" />
            OSH AI Hub · 자료 소개
          </a>
          <span className="osh-badge">실제 자료 · 검토 중</span>
        </div>
      </header>
      <main className="osh-main" id="main">
        <div className="osh-container">
          <section className="osh-intro">
            <h1 className="osh-title">KOSHA GUIDE 그래프 검색</h1>
            <p className="osh-copy">
              한국산업안전보건공단 기술지침 {status ? status.documents.toLocaleString() : "658"}건의
              본문 {status ? status.chunks.toLocaleString() : "18,659"}구간을 현장 말로 검색합니다.
              결과마다 지침이 인용한 법령 조문과, 지침에서 뽑은 개념 관계를 함께 보여 줍니다.
              원하면 선택한 발췌와 조문만 근거로 AI(Claude)가 짧게 답합니다.
            </p>
          </section>

          <div className="kg-modes" role="tablist" aria-label="검색 방식">
            <button
              type="button"
              role="tab"
              className="kg-mode"
              aria-selected={mode === "keyword"}
              onClick={() => setMode("keyword")}
            >
              낱말 검색
            </button>
            <button
              type="button"
              role="tab"
              className="kg-mode"
              aria-selected={mode === "context"}
              onClick={() => setMode("context")}
            >
              맥락 검색 <span className="osh-badge">AI · 그래프</span>
            </button>
          </div>

          {mode === "context" && (
            <ContextSearch
              question={ctxQuestion}
              setQuestion={setCtxQuestion}
              loading={ctxLoading}
              error={ctxError}
              result={ctx}
              onAsk={() => void askContext()}
              open={open}
              toggleChunk={(id) => void toggleChunk(id)}
              moveChunk={(from, to) => void moveChunk(from, to)}
              lawOpen={lawOpen}
              toggleLaw={(key) => void toggleLaw(key)}
            />
          )}

          {mode === "keyword" && (
          <form className="osh-panel kg-search" role="search" onSubmit={submit}>
            <label className="osh-field kg-grow">
              <span className="osh-label">검색어</span>
              <input
                className="osh-input"
                type="search"
                value={q}
                maxLength={200}
                placeholder="예: 아시바 위에서 작업할 때 안전난간"
                onChange={(e) => setQ(e.target.value)}
                required
              />
            </label>
            <label className="osh-field">
              <span className="osh-label">분야</span>
              <select
                className="osh-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option value="">전체</option>
                {(status?.domains ?? []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <div className="osh-actions kg-actions">
              <button className="osh-button" type="submit" disabled={loading}>
                {loading ? "검색 중…" : "검색"}
              </button>
            </div>
            <p className="osh-help kg-examples">
              예시:{" "}
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="kg-chip"
                  onClick={() => {
                    setQ(ex);
                    void run(ex, domain, 1);
                  }}
                >
                  {ex}
                </button>
              ))}
            </p>
          </form>

          )}

          {error && (
            <p className="osh-note osh-note--error" role="alert">
              {error}
            </p>
          )}

          {mode === "keyword" && data && (
            <div className="kg-layout" ref={resultsRef}>
              <div className="kg-results">
                <p className="osh-copy kg-summary" aria-live="polite">
                  <strong>{data.total.toLocaleString()}</strong>개 구간이 “{data.query}”에
                  맞습니다{data.domain ? ` (${data.domain})` : ""}.
                  {data.total > data.pages * 10 && data.pages > 0
                    ? ` 점수가 높은 ${data.pages * 10}개까지 보여 줍니다.`
                    : ""}
                  {data.semantic === "on"
                    ? " 낱말 일치와 의미(벡터) 검색을 합쳤습니다."
                    : data.semantic === "down"
                      ? " 의미 검색 서버가 응답하지 않아 낱말 일치만 썼습니다."
                      : ""}
                  {data.expansion.length > 0 && (
                    <>
                      {" "}
                      현장 용어를 표준 용어로도 찾았습니다:{" "}
                      {data.expansion.map((x) => (
                        <span className="kg-expand" key={`${x.from}-${x.to}`}>
                          {x.from} → {x.to}
                          <small> {x.kind}</small>
                        </span>
                      ))}
                    </>
                  )}
                </p>

                <section className="osh-card kg-ai" aria-labelledby="ai-title">
                  <h2 className="osh-card-title" id="ai-title">
                    AI 답변 <span className="osh-badge">Claude · 선택한 근거만</span>
                  </h2>
                  <p className="osh-help">
                    아래 결과에서 체크한 발췌(최대 {MAX_CHUNKS}개)와 오른쪽에서 체크한 조문(최대{" "}
                    {MAX_LAWS}개)만 읽고 답합니다. 문장마다 근거 번호가 붙고, 근거가 확인되지 않는
                    문장은 표시하지 않습니다. 질문과 발췌는 저장하지 않으며 하루 이용 한도가 있습니다.
                    법적 판단이 아닌 자료 요약입니다.
                  </p>
                  <div className="kg-ask">
                    <label className="osh-field kg-grow">
                      <span className="osh-label">질문</span>
                      <input
                        className="osh-input"
                        value={question}
                        maxLength={300}
                        onChange={(e) => setQuestion(e.target.value)}
                      />
                    </label>
                    <div className="osh-actions kg-actions">
                      <button
                        type="button"
                        className="osh-button"
                        disabled={asking || !picked.length || question.trim().length < 2}
                        onClick={() => void ask()}
                      >
                        {asking ? "답변 만드는 중…" : `발췌 ${picked.length}개로 답변`}
                      </button>
                    </div>
                  </div>
                  {askError && (
                    <p className="osh-note osh-note--error" role="alert">
                      {askError}
                    </p>
                  )}
                  {answer && (
                    <div className="kg-answer" aria-live="polite">
                      {answer.statements.length > 0 ? (
                        <ol>
                          {answer.statements.map((s, i) => (
                            <li key={i}>
                              {s.text}{" "}
                              {s.cites.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className="kg-cite"
                                  title={sourceLabel(c)}
                                  onClick={() => jumpTo(c)}
                                >
                                  {c}
                                </button>
                              ))}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      {answer.insufficient && (
                        <p className="osh-note">
                          선택한 자료만으로는 충분히 답하지 못했습니다.
                          {answer.note ? ` ${answer.note}` : ""} 발췌나 조문을 바꿔 보세요.
                        </p>
                      )}
                      {answer.dropped > 0 && (
                        <p className="osh-help">
                          근거가 확인되지 않은 문장 {answer.dropped}개는 표시하지 않았습니다.
                        </p>
                      )}
                      <p className="osh-help">
                        근거: {Object.keys(answer.sources).map(sourceLabel).join(" · ")}
                      </p>
                    </div>
                  )}
                </section>

                {data.results.length === 0 ? (
                  <p className="osh-note">
                    맞는 구간이 없습니다. 다른 말로 바꾸거나 분야를 ‘전체’로 해 보세요.
                  </p>
                ) : (
                  <ol className="kg-list">
                    {data.results.map((r, i) => {
                      const detail = open[r.chunk_id];
                      const n = (data.page - 1) * 10 + i + 1;
                      return (
                        <li
                          key={r.chunk_id}
                          className="osh-card kg-result"
                          id={`r-${r.chunk_id}`}
                          tabIndex={-1}
                        >
                          <div className="kg-result-head">
                            <span className="kg-n">{n}</span>
                            <div className="kg-grow">
                              <h3 className="osh-card-title">{r.document_title}</h3>
                              <p className="osh-help">
                                <span className="osh-badge">{r.domain}</span>
                                {r.heading ? ` ${r.heading}` : ""}
                                {r.pages.length ? ` · 원문 ${r.pages.join(", ")}쪽` : ""}
                                {r.via?.includes("의미") ? (
                                  <>
                                    {" "}
                                    <span className="kg-via">
                                      의미{r.similarity ? ` ${r.similarity.toFixed(2)}` : ""}
                                    </span>
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <label className="kg-pick">
                              <input
                                type="checkbox"
                                checked={picked.includes(r.chunk_id)}
                                disabled={
                                  !picked.includes(r.chunk_id) && picked.length >= MAX_CHUNKS
                                }
                                onChange={() => pick(r.chunk_id)}
                              />
                              AI 근거
                            </label>
                          </div>
                          <p className="kg-snippet">
                            <Highlight text={r.snippet} words={words} />
                          </p>
                          {r.laws.length > 0 && (
                            <p className="osh-help">
                              이 지침이 인용한 조문:{" "}
                              {r.laws.map((k) => (
                                <button
                                  key={k}
                                  type="button"
                                  className="kg-chip"
                                  onClick={() => {
                                    document
                                      .getElementById(`law-${k}`)
                                      ?.scrollIntoView({ block: "center" });
                                    void toggleLaw(k);
                                  }}
                                >
                                  {k.replace("_", " ")}
                                </button>
                              ))}
                            </p>
                          )}
                          <div className="osh-actions">
                            <button
                              type="button"
                              className="osh-button osh-button--secondary"
                              aria-expanded={Boolean(detail && detail !== "loading")}
                              onClick={() => void toggleChunk(r.chunk_id)}
                            >
                              {detail === "loading"
                                ? "불러오는 중…"
                                : detail
                                  ? "발췌 닫기"
                                  : "발췌 전체 보기"}
                            </button>
                          </div>
                          {detail && detail !== "loading" && (
                            <div className="kg-detail">
                              <p className="osh-help">
                                {detail.document_name} · {detail.position}/{detail.document_chunks}{" "}
                                구간
                                {detail.heading_path.length
                                  ? ` · ${detail.heading_path.join(" / ")}`
                                  : ""}
                              </p>
                              <pre className="kg-text">
                                <Highlight text={detail.text} words={words} />
                              </pre>
                              <div className="osh-actions">
                                <button
                                  type="button"
                                  className="osh-button osh-button--secondary"
                                  disabled={!detail.previous}
                                  onClick={() =>
                                    detail.previous && void moveChunk(r.chunk_id, detail.previous)
                                  }
                                >
                                  ← 앞 구간
                                </button>
                                <button
                                  type="button"
                                  className="osh-button osh-button--secondary"
                                  disabled={!detail.next}
                                  onClick={() =>
                                    detail.next && void moveChunk(r.chunk_id, detail.next)
                                  }
                                >
                                  다음 구간 →
                                </button>
                              </div>
                              {detail.graph.length > 0 && (
                                <p className="osh-help">
                                  이 구간에서 뽑힌 관계:{" "}
                                  {detail.graph
                                    .map((g) => `${g.source} →${g.relation}→ ${g.target}`)
                                    .join(" · ")}
                                </p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {data.pages > 1 && (
                  <nav className="osh-actions kg-pager" aria-label="결과 페이지">
                    <button
                      type="button"
                      className="osh-button osh-button--secondary"
                      disabled={data.page <= 1 || loading}
                      onClick={() => void run(data.query, data.domain, data.page - 1)}
                    >
                      ← 이전
                    </button>
                    <span className="osh-help">
                      {data.page} / {data.pages}
                    </span>
                    <button
                      type="button"
                      className="osh-button osh-button--secondary"
                      disabled={data.page >= data.pages || loading}
                      onClick={() => void run(data.query, data.domain, data.page + 1)}
                    >
                      다음 →
                    </button>
                  </nav>
                )}
              </div>

              <aside className="kg-side" aria-label="관련 조문과 개념">
                <section className="osh-card">
                  <h2 className="osh-card-title">관련 법령 조문</h2>
                  <p className="osh-help">
                    결과 지침들이 인용한 조문(인용 횟수순)과 제목이 검색어와 맞는 조문입니다.
                    체크하면 AI 답변의 근거에 들어갑니다.
                  </p>
                  {data.laws.length === 0 ? (
                    <p className="osh-help">이 결과와 연결된 조문이 없습니다.</p>
                  ) : (
                    <ul className="kg-laws">
                      {data.laws.map((l) => {
                        const full = lawOpen[l.key];
                        return (
                          <li key={l.key} id={`law-${l.key}`} tabIndex={-1}>
                            <label className="kg-pick">
                              <input
                                type="checkbox"
                                checked={pickedLaws.includes(l.key)}
                                disabled={
                                  !pickedLaws.includes(l.key) && pickedLaws.length >= MAX_LAWS
                                }
                                onChange={() => pickLaw(l.key)}
                              />
                              <strong>{lawName(l)}</strong>
                            </label>
                            <p className="osh-help">
                              {l.title}
                              {l.cited ? ` · 결과 지침 ${l.cited}건이 인용` : ""}
                              {l.cases ? ` · 관련 판례 ${l.cases}건` : ""}
                            </p>
                            <p className="kg-excerpt">
                              {full && full !== "loading" ? full.text : l.excerpt}
                              {!full && l.excerpt && l.excerpt.length >= 200 ? "…" : ""}
                            </p>
                            <button
                              type="button"
                              className="osh-link kg-inline"
                              onClick={() => void toggleLaw(l.key)}
                            >
                              {full === "loading"
                                ? "불러오는 중…"
                                : full
                                  ? "조문 접기"
                                  : "조문 전체 보기"}
                            </button>
                            {full && full !== "loading" && full.case_numbers.length > 0 && (
                              <p className="osh-help">
                                이 조문을 인용한 판례: {full.case_numbers.join(", ")}
                                {full.cases > full.case_numbers.length
                                  ? ` 외 ${full.cases - full.case_numbers.length}건`
                                  : ""}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="osh-card">
                  <h2 className="osh-card-title">연관 개념</h2>
                  <p className="osh-help">
                    지침 본문에서 AI가 뽑은 개체 관계입니다. 탐색용이며 근거가 아닙니다. 관계를
                    누르면 그 지침을 검색합니다.
                  </p>
                  {data.graph.edges.length === 0 ? (
                    <p className="osh-help">검색어와 연결된 개념이 없습니다.</p>
                  ) : (
                    <ul className="kg-graph">
                      {data.graph.edges.map((e, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            className="kg-edge"
                            onClick={() => {
                              const next = e.target === data.query ? e.source : e.target;
                              setQ(next);
                              void run(next, domain, 1);
                            }}
                          >
                            <b>{e.source}</b>
                            <span className="kg-rel">{e.relation}</span>
                            <b>{e.target}</b>
                          </button>
                          {e.document_title && (
                            <small className="osh-help">{e.document_title}</small>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.concepts.length > 0 && (
                    <p className="osh-help">
                      검색어 속 개념:{" "}
                      {data.concepts
                        .map((c) => `${c.surface} (${c.chunks.toLocaleString()}구간)`)
                        .join(" · ")}
                    </p>
                  )}
                </section>
              </aside>
            </div>
          )}

          <section className="osh-section kg-notes">
            <h2 className="osh-heading">알아 둘 것</h2>
            <ul className="osh-copy">
              <li>
                본문은 지침 PDF를 문자 인식(OCR)한 글이라 오자와 깨진 표가 있습니다. 원문은 KOSHA
                GUIDE 번호로 공단 누리집에서 확인하세요.
              </li>
              <li>
                검색은 낱말 일치(BM25)와 현장 용어→표준 용어 확장으로 찾습니다. 뜻이 비슷한 다른
                표현은 못 찾을 수 있습니다.
              </li>
              <li>
                연관 개념은 지침 구간의 9.8%에서만 추출된 관계이며 정확도 검증이 끝나지 않았습니다.
              </li>
              <li>
                AI 답변은 선택한 발췌와 조문의 요약이며 법적 판단이 아닙니다. 자료 이용 조건은
                자료 소개 페이지를 보세요.
              </li>
            </ul>
            <p className="osh-help">
              자료: KOSHA Guide GraphRAG 데이터 1.0.0 (연세대학교 산업보건연구소, 2026-10-06) ·
              화면 {__KG_BUILD__}
            </p>
          </section>
        </div>
      </main>
      <footer className="osh-footer">
        <div className="osh-container">
          <a className="osh-link" href={INTRO}>
            자료 소개와 이용 조건
          </a>
        </div>
      </footer>
    </div>
  );
}

type ContextProps = {
  question: string;
  setQuestion: (q: string) => void;
  loading: boolean;
  error: string;
  result: ContextResult | null;
  onAsk: () => void;
  open: Record<string, Chunk | "loading" | undefined>;
  toggleChunk: (id: string) => void;
  moveChunk: (from: string, to: string) => void;
  lawOpen: Record<string, Law | "loading" | undefined>;
  toggleLaw: (key: string) => void;
};

const contextExamples = [
  "용접 작업할 때 불티 때문에 화재 날 위험이 있는데 어떤 조치를 해야 하나요?",
  "아시바 위에서 작업하다 난간이 없으면 어떻게 해야 하나요?",
  "밀폐공간에 들어가기 전에 무엇을 측정하고 누가 확인해야 하나요?",
];

function ContextSearch(p: ContextProps) {
  const r = p.result;
  const sources = r?.answer.sources ?? {};
  const jump = (cite: string) => {
    const el = document.getElementById(`src-${cite}`);
    el?.scrollIntoView({ block: "center" });
    el?.focus();
  };
  const order = Object.keys(sources).sort((a, b) => {
    const rank = (c: string) => "CRGL".indexOf(c[0]);
    return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
  });
  const chunkOf = (id: string) => r?.chunks.find((c) => c.chunk_id === id);
  return (
    <>
      <section className="osh-panel kg-search kg-context" aria-labelledby="ctx-title">
        <h2 className="osh-card-title" id="ctx-title">
          맥락 검색
        </h2>
        <p className="osh-help kg-wide">
          질문을 상황 그대로 적으면 AI가 개념으로 풀어 지식 그래프(지침에서 뽑은 개체·관계,
          커뮤니티 보고서)와 지침 본문·조문을 함께 찾고, 찾은 근거만으로 답합니다. 두 번의 AI
          호출로 10~20초 걸리며 하루 이용 한도가 있습니다. 질문은 저장하지 않습니다.
        </p>
        <label className="osh-field kg-grow kg-wide">
          <span className="osh-label">질문</span>
          <textarea
            className="osh-input kg-textarea"
            value={p.question}
            maxLength={400}
            rows={3}
            placeholder="예: 용접 작업할 때 불티 때문에 화재 날 위험이 있는데 어떤 조치를 해야 하나요?"
            onChange={(e) => p.setQuestion(e.target.value)}
          />
        </label>
        <div className="osh-actions kg-actions kg-wide">
          <button
            type="button"
            className="osh-button"
            disabled={p.loading || p.question.trim().length < 5}
            onClick={p.onAsk}
          >
            {p.loading ? "질문 이해 → 그래프 탐색 → 답변 작성 중…" : "맥락으로 찾기"}
          </button>
        </div>
        <p className="osh-help kg-examples">
          예시:{" "}
          {contextExamples.map((ex) => (
            <button
              key={ex}
              type="button"
              className="kg-chip"
              onClick={() => p.setQuestion(ex)}
            >
              {ex}
            </button>
          ))}
        </p>
      </section>

      {p.error && (
        <p className="osh-note osh-note--error" role="alert">
          {p.error}
        </p>
      )}

      {r && (
        <div className="kg-layout">
          <div className="kg-results">
            <section className="osh-card kg-ai" aria-labelledby="ctx-answer" aria-live="polite">
              <h2 className="osh-card-title" id="ctx-answer">
                답변 <span className="osh-badge">Claude · 아래 근거만</span>
              </h2>
              {r.answer.statements.length > 0 ? (
                <ol className="kg-answer-list">
                  {r.answer.statements.map((s, i) => (
                    <li key={i}>
                      {s.text}{" "}
                      {s.cites.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="kg-cite"
                          onClick={() => jump(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </li>
                  ))}
                </ol>
              ) : null}
              {r.answer.insufficient && (
                <p className="osh-note">
                  찾은 자료만으로는 충분히 답하지 못했습니다.
                  {r.answer.note ? ` ${r.answer.note}` : ""}
                </p>
              )}
              {r.answer.dropped > 0 && (
                <p className="osh-help">
                  근거가 확인되지 않은 문장 {r.answer.dropped}개는 표시하지 않았습니다.
                </p>
              )}
              <p className="osh-help">
                AI가 이해한 개념:{" "}
                {r.understanding.concepts.map((c) => (
                  <span className="kg-expand" key={c.name}>
                    {c.name}
                    <small> {c.type}</small>
                  </span>
                ))}
                {r.understanding.scope === "overview" ? " · 전체를 훑는 질문으로 보았습니다." : ""}
              </p>
            </section>

            <section className="osh-section" aria-labelledby="ctx-sources">
              <h2 className="osh-heading" id="ctx-sources">
                근거
              </h2>
              <p className="osh-help">
                C는 커뮤니티 보고서, R은 지침에서 뽑은 관계와 인용 구절, G는 지침 발췌, L은 조문입니다.
                답변의 번호를 누르면 여기로 옵니다.
              </p>
              <ol className="kg-list">
                {order.map((cite) => {
                  const src = sources[cite];
                  const base = { id: `src-${cite}`, tabIndex: -1 } as const;
                  if (src.type === "report") {
                    const rep = r.reports.find((x) => x.community_id === src.community_id);
                    return (
                      <li key={cite} className="osh-card kg-result" {...base}>
                        <div className="kg-result-head">
                          <span className="kg-n">{cite}</span>
                          <div className="kg-grow">
                            <h3 className="osh-card-title">{src.title}</h3>
                            <p className="osh-help">
                              <span className="osh-badge">커뮤니티 보고서</span>
                              {rep ? ` 중요도 ${rep.importance}/10 · ${rep.keywords.slice(0, 6).join(", ")}` : ""}
                            </p>
                          </div>
                        </div>
                        {rep && (
                          <>
                            <p className="kg-snippet">{rep.summary}</p>
                            {rep.findings.length > 0 && (
                              <ul className="kg-findings">
                                {rep.findings.map((f, i) => (
                                  <li key={i}>
                                    {f.text}{" "}
                                    {f.chunk_ids.slice(0, 2).map((id) => (
                                      <button
                                        key={id}
                                        type="button"
                                        className="kg-chip"
                                        onClick={() => p.toggleChunk(id)}
                                      >
                                        {p.open[id] === "loading" ? "불러오는 중…" : p.open[id] ? "구간 닫기" : "구간 보기"}
                                      </button>
                                    ))}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {rep.findings.flatMap((f) => f.chunk_ids.slice(0, 2)).map((id) => {
                              const d = p.open[id];
                              return d && d !== "loading" ? (
                                <pre key={id} className="kg-text">
                                  {d.document_name} · {d.heading_path.join(" / ")}
                                  {"\n\n"}
                                  {d.text}
                                </pre>
                              ) : null;
                            })}
                          </>
                        )}
                      </li>
                    );
                  }
                  if (src.type === "relation") {
                    const edge = r.edges.find(
                      (e) => e.source === src.source && e.target === src.target && e.evidence[0]?.chunk_id === src.chunk_id,
                    );
                    const d = p.open[src.chunk_id];
                    return (
                      <li key={cite} className="osh-card kg-result" {...base}>
                        <div className="kg-result-head">
                          <span className="kg-n">{cite}</span>
                          <div className="kg-grow">
                            <h3 className="osh-card-title">
                              {src.source} <span className="kg-rel">{edge?.label ?? "관계"}</span> {src.target}
                            </h3>
                            <p className="osh-help">
                              <span className="osh-badge">관계 근거</span> {src.document_title}
                              {edge?.stages.includes("stage2") ? " · 2단계(Claude 추출)" : " · 1단계(패키지)"}
                            </p>
                          </div>
                        </div>
                        {edge?.evidence[0] && <p className="kg-snippet">“{edge.evidence[0].quote}”</p>}
                        {edge?.description && <p className="osh-help">{edge.description}</p>}
                        <div className="osh-actions">
                          <button
                            type="button"
                            className="osh-button osh-button--secondary"
                            onClick={() => p.toggleChunk(src.chunk_id)}
                          >
                            {d === "loading" ? "불러오는 중…" : d ? "구간 닫기" : "인용 구간 전체 보기"}
                          </button>
                        </div>
                        {d && d !== "loading" && (
                          <pre className="kg-text">
                            {d.document_name} · {d.heading_path.join(" / ")}
                            {"\n\n"}
                            {d.text}
                          </pre>
                        )}
                      </li>
                    );
                  }
                  if (src.type === "guide") {
                    const c = chunkOf(src.chunk_id);
                    const d = p.open[src.chunk_id];
                    return (
                      <li key={cite} className="osh-card kg-result" {...base}>
                        <div className="kg-result-head">
                          <span className="kg-n">{cite}</span>
                          <div className="kg-grow">
                            <h3 className="osh-card-title">{src.document_title}</h3>
                            <p className="osh-help">
                              <span className="osh-badge">{c?.domain ?? "지침 발췌"}</span>
                              {c?.heading ? ` ${c.heading}` : ""}
                              {c?.pages.length ? ` · 원문 ${c.pages.join(", ")}쪽` : ""}
                            </p>
                          </div>
                        </div>
                        {c && (
                          <p className="kg-snippet">
                            <Highlight text={c.snippet} words={r.highlight} />
                          </p>
                        )}
                        <div className="osh-actions">
                          <button
                            type="button"
                            className="osh-button osh-button--secondary"
                            onClick={() => p.toggleChunk(src.chunk_id)}
                          >
                            {d === "loading" ? "불러오는 중…" : d ? "발췌 닫기" : "발췌 전체 보기"}
                          </button>
                        </div>
                        {d && d !== "loading" && (
                          <div className="kg-detail">
                            <pre className="kg-text">
                              <Highlight text={d.text} words={r.highlight} />
                            </pre>
                            <div className="osh-actions">
                              <button
                                type="button"
                                className="osh-button osh-button--secondary"
                                disabled={!d.previous}
                                onClick={() => d.previous && p.moveChunk(src.chunk_id, d.previous)}
                              >
                                ← 앞 구간
                              </button>
                              <button
                                type="button"
                                className="osh-button osh-button--secondary"
                                disabled={!d.next}
                                onClick={() => d.next && p.moveChunk(src.chunk_id, d.next)}
                              >
                                다음 구간 →
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  }
                  const law = r.laws.find((l) => l.key === src.key);
                  const full = p.lawOpen[src.key];
                  return (
                    <li key={cite} className="osh-card kg-result" {...base}>
                      <div className="kg-result-head">
                        <span className="kg-n">{cite}</span>
                        <div className="kg-grow">
                          <h3 className="osh-card-title">
                            {src.law} {src.article}
                            {law ? ` (${law.title})` : ""}
                          </h3>
                          <p className="osh-help">
                            <span className="osh-badge">법령 조문</span>
                            {law?.cases ? ` · 관련 판례 ${law.cases}건` : ""}
                          </p>
                        </div>
                      </div>
                      <p className="kg-excerpt">{full && full !== "loading" ? full.text : law?.excerpt}</p>
                      <button type="button" className="osh-link kg-inline" onClick={() => p.toggleLaw(src.key)}>
                        {full === "loading" ? "불러오는 중…" : full ? "조문 접기" : "조문 전체 보기"}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          <aside className="kg-side" aria-label="그래프 탐색 결과">
            <section className="osh-card">
              <h2 className="osh-card-title">그래프에서 찾은 개체</h2>
              <p className="osh-help">질문의 개념과 이어진 지식 그래프의 노드입니다.</p>
              <p>
                {r.nodes.map((n) => (
                  <span className="kg-expand" key={n.id}>
                    {n.name}
                    <small> {n.type} · 연결 {n.degree}</small>
                  </span>
                ))}
              </p>
            </section>
            <section className="osh-card">
              <h2 className="osh-card-title">탐색한 관계</h2>
              <p className="osh-help">
                인용 구절이 있는 관계는 근거(R)로 올라갑니다. 1단계는 패키지의 추출, 2단계는 Claude가
                본문에서 추가로 뽑은 관계입니다.
              </p>
              <ul className="kg-graph">
                {r.edges.map((e, i) => (
                  <li key={i}>
                    <span className="kg-edge kg-edge--static">
                      <b>{e.source}</b>
                      <span className="kg-rel">{e.label}</span>
                      <b>{e.target}</b>
                      <small className="osh-help">
                        {e.stages.includes("stage2") ? "2단계" : "1단계"}
                        {e.document_title ? ` · ${e.document_title}` : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {r.reports.length > 0 && (
              <section className="osh-card">
                <h2 className="osh-card-title">관련 커뮤니티</h2>
                <ul className="kg-graph">
                  {r.reports.map((rep) => (
                    <li key={rep.community_id}>
                      <b>{rep.title}</b>
                      <small className="osh-help">
                        중요도 {rep.importance}/10 · {rep.keywords.slice(0, 5).join(", ")}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
