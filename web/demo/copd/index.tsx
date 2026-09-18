import { createRoot } from "react-dom/client";
import { CopdExplorer } from "../../components/copd-explorer";
import "../../app/globals.css";
import "../../app/datasets/copd/copd.css";
const initialFilters: Record<string, string> = {};
const params = new URLSearchParams(window.location.search);
for (const key of ["q", "mode", "year", "approval", "occupation", "qa"]) {
  const value = params.get(key);
  if (value) initialFilters[key] = value;
}
createRoot(document.getElementById("root")!).render(
  <>
    <header className="header">
      <div className="container header-inner">
        <a className="brand" href="https://osh.ai.kr/">
          OSH AI Hub
        </a>
        <a className="text-link" href="https://osh.ai.kr/tools">
          분석·체험으로 →
        </a>
      </div>
    </header>
    <main className="container copd-page">
      <header className="copd-heading">
        <div className="copd-labels">
          <span className="badge">산업보건 · 한국어</span>
          <span className="badge">실제 자료 · 내부 검토</span>
          <span className="badge demo">DEMO 검색 인터페이스</span>
        </div>
        <h1>COPD 산재 판정 사례</h1>
        <p>
          직종과 노출 맥락으로 사례를 찾고, 원문과 AI 가공 정보를 함께
          살펴보세요.
        </p>
        <div className="copd-metrics">
          <span>
            <strong>2,082</strong>사례
          </span>
          <span>
            <strong>2016–2021</strong>청구 연도
          </span>
          <span>
            <strong>646</strong>측정치 · 79개 사례
          </span>
        </div>
        <p className="copd-caption">
          산재를 신청해 판정까지 이루어진 사례입니다. 개인의 승인 확률이나 전체
          노동자의 질병 위험을 뜻하지 않습니다.
        </p>
      </header>
      <CopdExplorer enabled initialFilters={initialFilters} initialTab={params.get("tab") || "search"} apiBase="./api" />
    </main>
  </>,
);
