"use client";
import { useCallback, useEffect, useState } from "react";
import type { ActivitySummary } from "@/lib/activity";
import styles from "./activity-dashboard.module.css";

const time = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export function ActivityDashboard() {
  const [data, setData] = useState<ActivitySummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const timeout = AbortSignal.timeout(15000);
      const response = await fetch("/api/admin/activity", { cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (response.status === 404) { setData(null); throw Error("관리자 로그인을 확인해 주세요."); }
      if (!response.ok) throw Error("방문 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
      setData(await response.json());
      setError("");
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "조회 실패");
    } finally { if (!signal?.aborted) setBusy(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void refresh(controller.signal), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
    }, 60000);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);
  return <div className={styles.dashboard}>
    <div className={styles.toolbar}>
      <p role="status">{error || (data ? `최근 갱신 ${time(data.updatedAt)} · 1분마다 갱신` : "실제 방문 현황을 불러오는 중입니다.")}</p>
      <button type="button" className="button secondary" disabled={busy} onClick={() => { setBusy(true); void refresh(); }}>{busy ? "불러오는 중…" : "새로고침"}</button>
    </div>
    {data && <>
      {error && <p className="info-note">아래는 마지막으로 확인한 값입니다.</p>}
      <div className={styles.cards}>
        {[
          ["현재 방문 브라우저", data.activeBrowsers, "최근 5분 내 활동"],
          ["활동 중인 로그인 사용자", data.activeUsers.length, "동일 계정은 한 명으로 집계"],
          ["오늘 방문", data.todayVisits, "한국시간 · 30분 이상 쉬면 새 방문"],
          ["누적 방문", data.totalVisits, "집계 시작 이후 방문 횟수"],
          ["누적 방문 브라우저", data.totalBrowsers, "쿠키 기준 · 사람 수와 다름"],
          ["가입 계정", data.registeredUsers, "현재 등록된 Google 로그인 계정"],
        ].map(([label, value, help]) => <article className={styles.card} key={label}>
          <h2>{label}</h2><strong>{Number(value).toLocaleString("ko-KR")}</strong><p>{help}</p>
        </article>)}
      </div>
      <section className={styles.section}>
        <h2>지금 활동 중인 로그인 사용자</h2>
        <p>최근 5분 내 열린 화면에서 활동이 확인된 계정입니다. 로그인 상태가 유지된 모든 계정의 목록은 아닙니다.</p>
        {data.activeUsers.length ? <div className={styles.scroll} tabIndex={0} role="region" aria-label="활동 중인 사용자 표"><table>
          <thead><tr><th>이름</th><th>이메일</th><th>마지막 활동 · 한국시간</th></tr></thead>
          <tbody>{data.activeUsers.map(u => <tr key={u.id}><td>{u.name || "이름 없음"}</td><td>{u.email}</td><td>{time(u.lastSeen)}</td></tr>)}</tbody>
        </table></div> : <p>최근 5분 내 활동 중인 로그인 사용자가 없습니다.</p>}
      </section>
      <section className={styles.section}>
        <h2>최근 로그인 계정</h2><p>계정별 마지막 로그인 시각입니다. 최대 50개를 표시하며, 현재 접속 여부와는 다릅니다.</p>
        {data.recentLogins.length ? <div className={styles.scroll} tabIndex={0} role="region" aria-label="최근 로그인 표"><table>
          <thead><tr><th>이름</th><th>이메일</th><th>마지막 로그인 · 한국시간</th></tr></thead>
          <tbody>{data.recentLogins.map(u => <tr key={u.id}><td>{u.name || "이름 없음"}</td><td>{u.email}</td><td>{time(u.lastSignIn)}</td></tr>)}</tbody>
        </table></div> : <p>로그인 기록이 없습니다.</p>}
      </section>
      <section className={styles.section}>
        <h2>최근 30일 방문 기록</h2>
        {data.daily.length ? <div className={styles.scroll} tabIndex={0} role="region" aria-label="일별 방문 표"><table>
          <thead><tr><th>날짜 · 한국시간</th><th>방문 횟수</th></tr></thead>
          <tbody>{data.daily.map(d => <tr key={d.day}><td>{d.day}</td><td>{d.visits.toLocaleString("ko-KR")}</td></tr>)}</tbody>
        </table></div> : <p>아직 집계된 방문이 없습니다.</p>}
      </section>
      <p className="info-note">집계 시작: {time(data.startedAt)}. 이전 방문은 포함하지 않습니다.
        같은 브라우저의 탭·새로고침은 합치며, 30분 이상 활동이 없었다가 돌아오면 새 방문으로 셉니다.
        쿠키 삭제·다른 기기·자동화 접근으로 수치가 달라질 수 있으며 실제 인원수나 감사 로그가 아닙니다.</p>
    </>}
  </div>;
}
