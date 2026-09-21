"use client";
import { useState } from "react";
export type LabelPage = {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
};
export function SanjeEvidence({
  apiBase,
  id,
  labels,
  worktime,
  worktimeRows,
}: {
  apiBase: string;
  id: string;
  labels?: LabelPage;
  worktime?: Record<string, string> | null;
  worktimeRows?: Record<string, string>[];
}) {
  const [current, setCurrent] = useState(labels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(page: number) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${apiBase}?action=labels&id=${encodeURIComponent(id)}&page=${page}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "라벨을 불러오지 못했습니다.");
      setCurrent(result);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "라벨을 불러오지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sanje-evidence">
      <h3>근무시간 자료</h3>
      {!worktime && !worktimeRows?.length ? (
        <p>
          추출된 근무시간 자료가 없습니다. 과로나 부담이 없었다는 뜻은 아닙니다.
        </p>
      ) : (
        <>
          {worktime && (
            <details>
              <summary>근무시간 요약 필드</summary>
              <dl className="copd-fields">
                {Object.entries(worktime)
                  .filter(([key]) => key !== "accnum")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value || "기재 없음"}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
          {worktimeRows?.map((row, i) => (
            <article className="copd-exposure" key={row.id || i}>
              <h4>{row.period || "기간 미상"}</h4>
              <p>
                주당 시간: {row.weekly_hours || "미기재"} · {row.hours_text}
              </p>
              <p>{row.quote || "근거 인용 없음"}</p>
              <small>
                출처: {row.figure_source || "미기재"} · 원문 일치:{" "}
                {row.text_in_source || "미확인"}
              </small>
            </article>
          ))}
        </>
      )}
      <h3>표준 라벨 후보와 근거</h3>
      <p className="copd-caption">
        자동 추출·매핑 후보입니다. 코드 매핑은 노출 확인이나 산재 판정을
        의미하지 않습니다. 인용 위치는 Unicode 문자 기준입니다.
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">
        {current
          ? `${current.total.toLocaleString()}개 후보 · ${current.page}페이지`
          : "라벨 정보 없음"}
      </p>
      {current?.rows.map((row, index) => (
        <article className="copd-exposure" key={String(row.label_id || index)}>
          <h4>{String(row.raw_term || row.axis || "표현 미상")}</h4>
          <p>
            축: {String(row.axis || "미상")} · 검토:{" "}
            {String(row.review_status || "미검토")} · 근거:{" "}
            {String(row.evidence_status || "미확인")}
          </p>
          <details>
            <summary>후보 코드·원문 근거 전체 보기</summary>
            <pre>{JSON.stringify(row, null, 2)}</pre>
          </details>
        </article>
      ))}
      {current && current.total > current.page_size && (
        <div className="content-actions">
          <button
            className="button secondary"
            disabled={busy || current.page <= 1}
            onClick={() => void load(current.page - 1)}
          >
            이전 라벨
          </button>
          <button
            className="button secondary"
            disabled={busy || current.page * current.page_size >= current.total}
            onClick={() => void load(current.page + 1)}
          >
            다음 라벨
          </button>
        </div>
      )}
    </div>
  );
}
