"use client";
import { useState } from "react";
import { Copy, Check, Play, LoaderCircle } from "lucide-react";
type Language = "Python" | "R" | "curl";
export function CodeExamples({
  slug = "industrial-accidents",
}: {
  slug?: string;
}) {
  const [language, setLanguage] = useState<Language>("Python");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const path = `/openapi/v1/statistics/${slug}`;
  const examples: Record<Language, string> = {
    Python: `import requests\n\n# 로컬 프리뷰 주소 · 데이터는 모두 합성 예제입니다.\nbase_url = "http://localhost:3100"\nresponse = requests.get(\n    f"{base_url}${path}",\n    params={"limit": 10}, timeout=10\n)\nresponse.raise_for_status()\nresult = response.json()\nprint(result["data"])`,
    R: `library(httr2)\n\n# 로컬 프리뷰 · 합성 예제 자료\nbase_url <- "http://localhost:3100"\nresult <- request(paste0(base_url, "${path}")) |>\n  req_url_query(limit = 10) |>\n  req_perform() |>\n  resp_body_json()\n\nprint(result$data)`,
    curl: `# 로컬 프리뷰 · 합성 예제 자료\ncurl --fail-with-body \\\n  "http://localhost:3100${path}?limit=10"`,
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(examples[language]);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <div className="code-panel">
      <div className="code-header">
        <div className="code-tabs" role="group" aria-label="예제 언어">
          {Object.keys(examples).map((l) => (
            <button
              key={l}
              type="button"
              className={language === l ? "active" : ""}
              aria-pressed={language === l}
              onClick={() => {
                setLanguage(l as Language);
                setCopied(false);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <button className="code-copy" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
          {copied
            ? "복사됨"
            : copyError
              ? "코드를 직접 선택해 복사하세요"
              : "코드 복사"}
        </button>
      </div>
      <pre>
        <code>{examples[language]}</code>
      </pre>
    </div>
  );
}
export function ApiExplorer({
  options,
  initialSlug,
}: {
  options: { slug: string; title: string }[];
  initialSlug: string;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string>();
  const [status, setStatus] = useState<string>();
  async function run() {
    setLoading(true);
    setStatus(undefined);
    try {
      const result = await fetch(
        `/openapi/v1/statistics/${encodeURIComponent(slug)}?limit=5`,
        { signal: AbortSignal.timeout(10000) },
      );
      const body = await result.json();
      setResponse(JSON.stringify(body, null, 2));
      setStatus(
        `${result.status} ${result.ok ? "OK · 샘플 응답" : "요청 오류"}`,
      );
    } catch {
      setResponse("요청을 완료하지 못했습니다. 잠시 후 다시 실행해 주세요.");
      setStatus("연결 오류");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="api-tester">
      <label htmlFor="api-dataset">조회할 예제 데이터</label>
      <div className="test-controls">
        <select
          id="api-dataset"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setResponse(undefined);
            setStatus(undefined);
          }}
        >
          {options.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.title}
            </option>
          ))}
        </select>
        <button className="button" onClick={run} disabled={loading}>
          {loading ? <LoaderCircle size={15} /> : <Play size={15} />}{" "}
          {loading ? "조회 중" : "API 실행"}
        </button>
      </div>
      <div aria-live="polite">
        {status && <div className="response-caption">{status}</div>}
        {response && <pre className="response-box">{response}</pre>}
      </div>
    </div>
  );
}
