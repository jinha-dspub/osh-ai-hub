import { createRoot } from "react-dom/client";
import { ActivityDashboard } from "../components/activity-dashboard";
import "../app/globals.css";

// Browser-only component fixture, never a production route or an auth bypass.
createRoot(document.getElementById("root")!).render(
  <main className="container section">
    <h1>DEMO · 방문 현황 화면 검사</h1>
    <p>브라우저 테스트용 합성 값입니다. 실제 로그인이나 운영 통계가 아닙니다.</p>
    <ActivityDashboard />
  </main>,
);
