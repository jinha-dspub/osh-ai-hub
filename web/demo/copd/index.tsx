import { createRoot } from "react-dom/client";
import { CopdExplorer } from "../../components/copd-explorer";
import { SanjeHeading } from "../../components/sanje-heading";
import { getStudy } from "../../lib/sanje";
import "../../app/globals.css";
import "../../app/datasets/copd/copd.css";
const initialFilters: Record<string, string> = {};
const params = new URLSearchParams(window.location.search);
for (const key of ["q", "mode", "year", "approval", "occupation", "qa"]) {
  const value = params.get(key);
  if (value) initialFilters[key] = value;
}
const group = window.location.pathname.startsWith("/demo/sanje/")
  ? window.location.pathname.split("/")[3]
  : "copd";
const study = getStudy(group);
if (!study) throw new Error("등록된 질환군이 아닙니다.");
document.title = `${study.title} | OSH AI Hub`;
createRoot(document.getElementById("root")!).render(
  <>
    <header className="header">
      <div className="container header-inner">
        <a className="brand" href="https://osh.ai.kr/">
          OSH AI Hub
        </a>
        <a className="text-link" href="/demo/sanje/">
          전체 질환군 →
        </a>
      </div>
    </header>
    <main className="container copd-page">
      <SanjeHeading study={study} demo />
      <p className="copd-caption">
        산재 신청·판정 사례이며 개인의 승인 확률이나 전체 노동자의 질병 위험을
        뜻하지 않습니다.
      </p>
      <CopdExplorer
        study={study}
        enabled
        initialFilters={initialFilters}
        initialTab={params.get("tab") || "search"}
        apiBase={
          group === "copd" &&
          !window.location.pathname.startsWith("/demo/sanje/")
            ? "/demo/copd/api"
            : `/demo/sanje/${group}/api`
        }
      />
    </main>
  </>,
);
