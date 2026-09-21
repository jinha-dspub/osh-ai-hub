import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import data from "../../lib/oshmaster-catalog.json";
import "../../app/globals.css";
import "../../../design/osh-family/osh-family.css";
import "./style.css";
type Scope = { axis: string; std: string; std_version: string; count: number };
type Code = {
  record_id: string;
  code: string;
  label: string;
  std: string;
  std_version: string;
  axis: string;
  match_kind?: string;
};
type Catalogue = {
  scopes: Scope[];
  axis_labels: Record<string, string>;
  standard_labels: Record<string, string>;
};
type Result = {
  results: Code[];
  total: number;
  offset: number;
  next_offset: number | null;
};
type Detail = {
  node: Code;
  ancestors: Code[];
  children: Code[];
  children_total: number;
  scope: Code[];
  scope_total: number;
  issues: string[];
  next_offset: number | null;
};
type FileEntry = { id: string; name: string; bytes: number; sha256: string };
const base = "/demo/oshmaster/api/";
async function api<T>(
  action: string,
  params: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(
    base + action + "?" + new URLSearchParams(params),
    { cache: "no-store", signal: AbortSignal.timeout(20000) },
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "요청을 완료하지 못했습니다.");
  return result;
}
function save(value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "oshmaster-selected-codes.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [scope, setScope] = useState({
    axis: "DISEASE",
    std: "KCD",
    version: "9차_2026",
  });
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result>();
  const [detail, setDetail] = useState<Detail>();
  const [include, setInclude] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Catalogue>("catalogue"),
      api<{ files: FileEntry[] }>("files"),
    ])
      .then(([cat, f]) => {
        if (active) {
          setCatalogue(cat);
          setFiles(f.files);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [reload]);
  function clear() {
    setResult(undefined);
    setDetail(undefined);
    setConfirmed(false);
    setInclude(false);
    setError("");
  }
  function select(axis: string, std?: string) {
    const found = catalogue?.scopes.find(
      (s) => s.axis === axis && (!std || s.std === std),
    );
    if (found)
      setScope({
        axis: found.axis,
        std: found.std,
        version: found.std_version,
      });
    clear();
  }
  async function search(offset = 0) {
    setBusy("search");
    setError("");
    setDetail(undefined);
    setConfirmed(false);
    setInclude(false);
    try {
      setResult(
        await api<Result>("search", {
          q,
          ...scope,
          offset: String(offset),
          limit: "10",
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }
  async function open(id: string, desc = false, offset = 0) {
    setBusy("detail");
    setInclude(desc);
    setError("");
    setConfirmed(false);
    try {
      const value = await api<Detail>("detail", {
        id,
        include_descendants: String(desc),
        offset: String(offset),
        limit: "100",
      });
      setDetail(value);
      setInclude(desc);
    } catch (e) {
      setInclude(include);
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setBusy("");
    }
  }
  async function exportSelection() {
    if (!detail || !confirmed) return;
    setBusy("export");
    setError("");
    try {
      let value = await api<Detail>("detail", {
        id: detail.node.record_id,
        include_descendants: String(include),
        limit: "100",
      });
      const rows = [...value.scope];
      if (value.issues.length) throw Error("계층 문제를 확인해 주세요.");
      while (value.next_offset !== null) {
        value = await api<Detail>("detail", {
          id: detail.node.record_id,
          include_descendants: String(include),
          offset: String(value.next_offset),
          limit: "100",
        });
        if (value.issues.length) throw Error("계층 문제를 확인해 주세요.");
        rows.push(...value.scope);
        if (rows.length > 100000) throw Error("선택 범위가 너무 큽니다.");
      }
      if (
        rows.length !== detail.scope_total ||
        new Set(rows.map((r) => r.record_id)).size !== rows.length
      )
        throw Error("선택 코드 수를 확인하지 못했습니다.");
      save({
        demo: true,
        dataset: "oshmaster",
        version: data.version,
        case_label_approved: false,
        include_descendants: include,
        root: detail.node,
        codes: rows,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "선택 파일 생성 실패");
    } finally {
      setBusy("");
    }
  }
  async function download(id: string) {
    setBusy("download");
    setError("");
    try {
      const response = await fetch(base + "download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(20000),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "다운로드 실패");
      const url = new URL(value.url);
      if (
        url.protocol !== "https:" ||
        !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
        !url.pathname.startsWith(
          "/storage/v1/object/sign/oshmaster-research/oshmaster/" +
            data.version +
            "/",
        )
      )
        throw Error("다운로드 주소가 올바르지 않습니다.");
      window.location.assign(url.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다운로드 실패");
    } finally {
      setBusy("");
    }
  }
  const axes = [...new Set(catalogue?.scopes.map((s) => s.axis) || [])];
  const standards = [
    ...new Set(
      catalogue?.scopes
        .filter((s) => s.axis === scope.axis)
        .map((s) => s.std) || [],
    ),
  ];
  return (
    <div className="osh-app">
      <main className="osh-container osh-main">
        <a className="osh-link" href="https://osh.ai.kr/datasets/oshmaster">
          ← 자료 소개로
        </a>
        <header className="osh-section">
          <span className="osh-badge">DEMO · 실제 코드집 검색</span>
          <h1 className="osh-title">표준분류 마스터 검색</h1>
          <p className="osh-copy">
            표현·코드로 후보를 찾고 판본별 계층과 선택 범위를 확인하세요.
          </p>
          <p className="osh-help">
            {data.version} · 사전·어휘 검색 · 사건 라벨 승인이나 자연어 의도
            판정 기능은 아닙니다.
          </p>
        </header>
        <form
          className="osh-card osh-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <label className="osh-field">
            검색어 또는 코드
            <input
              className="osh-input"
              value={q}
              maxLength={200}
              required
              disabled={!!busy}
              placeholder="예: 폐암, 용접, C34"
              onChange={(e) => {
                setQ(e.target.value);
                clear();
              }}
            />
          </label>
          <div className="master-filters">
            <label className="osh-field">
              분류
              <select
                className="osh-input"
                value={scope.axis}
                disabled={!!busy || !catalogue}
                onChange={(e) => select(e.target.value)}
              >
                {axes.map((a) => (
                  <option key={a} value={a}>
                    {catalogue?.axis_labels[a] || a}
                  </option>
                ))}
              </select>
            </label>
            <label className="osh-field">
              표준
              <select
                className="osh-input"
                value={scope.std}
                disabled={!!busy || !catalogue}
                onChange={(e) => select(scope.axis, e.target.value)}
              >
                {standards.map((s) => (
                  <option key={s} value={s}>
                    {catalogue?.standard_labels[s] || s} ({s})
                  </option>
                ))}
              </select>
            </label>
            <label className="osh-field">
              판본
              <select
                className="osh-input"
                value={scope.version}
                disabled={!!busy || !catalogue}
                onChange={(e) => {
                  setScope({ ...scope, version: e.target.value });
                  clear();
                }}
              >
                {catalogue?.scopes
                  .filter((s) => s.axis === scope.axis && s.std === scope.std)
                  .map((s) => (
                    <option key={s.std_version} value={s.std_version}>
                      {s.std_version}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <button
            className="osh-button"
            disabled={!!busy || !catalogue || !q.trim()}
          >
            표준분류 검색
          </button>
        </form>
        {error && (
          <div className="osh-note" role="alert">
            {error}
            {!catalogue && (
              <button
                className="osh-button"
                onClick={() => { setBusy("load"); setError(""); setReload(reload + 1); }}
              >
                다시 연결
              </button>
            )}
          </div>
        )}
        <p role="status" className="osh-help">
          {busy
            ? "요청을 처리하고 있습니다…"
            : result
              ? `${result.total.toLocaleString()}개 어휘 후보`
              : "검색어와 판본을 선택해 시작하세요."}
        </p>
        <div className="master-workspace">
          <section className="osh-stack" aria-label="검색 결과">
            {result?.results.map((row) => (
              <button
                className="osh-card master-hit"
                key={row.record_id}
                disabled={!!busy}
                onClick={() => void open(row.record_id)}
              >
                <span className="osh-badge">
                  {
                    (
                      {
                        code: "코드 일치",
                        exact: "표준명 일치",
                        alias: "동의어",
                        related: "관련 어휘",
                      } as Record<string, string>
                    )[row.match_kind || "related"]
                  }
                </span>
                <strong>
                  {row.code} · {row.label}
                </strong>
                <small>
                  {row.std} · {row.std_version}
                </small>
              </button>
            ))}
            {result && !result.results.length && (
              <p>조건에 맞는 코드가 없습니다. 검색어나 판본을 바꿔보세요.</p>
            )}
            {result && (
              <div className="osh-actions">
                <button
                  className="osh-button osh-button--secondary"
                  disabled={!!busy || result.offset === 0}
                  onClick={() => void search(Math.max(0, result.offset - 10))}
                >
                  이전 결과
                </button>
                <button
                  className="osh-button osh-button--secondary"
                  disabled={!!busy || result.next_offset === null}
                  onClick={() => void search(result.next_offset!)}
                >
                  다음 결과
                </button>
              </div>
            )}
          </section>
          {detail && (
            <section className="osh-card osh-stack" aria-label="코드 상세">
              <h2 className="osh-heading">
                {detail.node.code} · {detail.node.label}
              </h2>
              <p>
                {detail.node.std} · {detail.node.std_version}
              </p>
              <h3>상위 분류</h3>
              <div className="osh-actions">
                {detail.ancestors.map((row) => (
                  <button
                    className="osh-button osh-button--secondary"
                    disabled={!!busy}
                    key={row.record_id}
                    onClick={() => void open(row.record_id)}
                  >
                    {row.code} {row.label}
                  </button>
                ))}
              </div>
              <h3>직접 하위 분류 ({detail.children_total})</h3>
              <div className="master-children">
                {detail.children.map((row) => (
                  <button
                    className="osh-button osh-button--secondary"
                    disabled={!!busy}
                    key={row.record_id}
                    onClick={() => void open(row.record_id)}
                  >
                    {row.code} {row.label}
                  </button>
                ))}
              </div>
              {detail.children_total > detail.children.length && (
                <p>
                  직접 하위 목록은 100개까지 표시합니다. 전체 범위는 하위 포함
                  후 JSON으로 받을 수 있습니다.
                </p>
              )}
              <label className="master-check">
                <input
                  type="checkbox"
                  checked={include}
                  disabled={!!busy}
                  onChange={(e) =>
                    void open(detail.node.record_id, e.target.checked)
                  }
                />
                하위 코드까지 포함
              </label>
              <p>선택 범위: {detail.scope_total.toLocaleString()}개 코드</p>
              {detail.issues.map((issue) => (
                <p role="alert" key={issue}>
                  {issue}
                </p>
              ))}
              <p className="osh-help">
                관련어는 동의어 확정이 아니며, 범위 확인은 사건 라벨이나 인과성
                승인이 아닙니다.
              </p>
              <label className="master-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!!busy || !!detail.issues.length}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                선택한 판본과 코드 범위를 확인했습니다
              </label>
              <button
                className="osh-button"
                disabled={!!busy || !confirmed || !!detail.issues.length}
                onClick={() => void exportSelection()}
              >
                선택 코드 JSON 받기
              </button>
            </section>
          )}
        </div>
        <section className="osh-section" id="files">
          <h2 className="osh-heading">파일 다운로드 · 연구용 검토</h2>
          <p className="osh-copy">
            전체 인수 ZIP과 Excel 안전 CSV 묶음입니다. 출처별 이용 조건은 확인
            중입니다. Excel에서 코드 열을 텍스트로 가져오세요.
          </p>
          <div className="osh-stack">
            {files.map((file) => (
              <article className="osh-card" key={file.id}>
                <h3>
                  {file.id === "excel"
                    ? "Excel용 CSV 묶음"
                    : "전체 데이터 패키지"}
                </h3>
                <p>
                  {file.name} · {(file.bytes / 1024 / 1024).toFixed(1)} MB
                </p>
                <button
                  className="osh-button osh-button--secondary"
                  disabled={!!busy}
                  onClick={() => void download(file.id)}
                >
                  파일 다운로드
                </button>
                <details>
                  <summary>파일 SHA-256</summary>
                  <code className="master-hash">{file.sha256}</code>
                </details>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
