import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import "../../app/globals.css";
import "../../../design/osh-family/osh-family.css";
import "./style.css";
import { divisions, sections } from "../osh-support-programs/ksic";
import {
  evaluate,
  statusOrder,
  type Item,
  type Judged,
  type Profile,
  type Status,
  type Threshold,
} from "./rules";

const BASE = "/demo/public-ohs-readiness";
type Row = Record<string, string>;
type Criteria = {
  dataset: string;
  purposes: Row[];
  profile: Row[];
  checklist: Item[];
  scoring: Row[];
  thresholds: Record<string, Threshold>;
  threshold_rows: Row[];
  sources: Row[];
  downloads: string[];
};
type Proposal = {
  프로필: Profile & { 목적: string[] };
  근거: Record<string, string>;
  버린칸: string[];
};

const tone: Record<Status, string> = {
  충족: "ok",
  부족: "no",
  "확인 필요": "check",
  "해당 없음": "info",
};
const blank = (rows: Row[]): Profile =>
  Object.fromEntries(
    rows.map((f) => [f.필드, f.형식.startsWith("integer") ? null : "모름"]),
  );
const industryName = (code: string) =>
  [...sections, ...divisions].find((s) => s.code === code)?.name ?? "";

function csvOf(rows: string[][]) {
  return (
    "﻿" +
    rows
      .map((r) =>
        r
          .map((c) => (/[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c))
          .join(","),
      )
      .join("\r\n")
  );
}

function ItemCard({ j, sources }: { j: Judged; sources: Record<string, Row> }) {
  const { item, status, points, why } = j;
  return (
    <article className={`ro-item ro-${tone[status]}`} aria-label={item.제목}>
      <div className="ro-item-tags">
        <span className={`ro-status ro-status--${tone[status]}`}>{status}</span>
        <span className="osh-badge">{item.구분}</span>
        {points !== null && points !== 0 && (
          <span className="ro-points">
            {points > 0 ? `+${points}` : points}점
          </span>
        )}
        <span className="ro-id">{item.id}</span>
      </div>
      <h4 className="ro-item-title">{item.제목}</h4>
      <p className="ro-why">{why}</p>
      <p className="osh-help">{item.영향}</p>
      {status !== "충족" && status !== "해당 없음" && (
        <ul className="ro-prep" aria-label="준비할 것">
          {item.준비.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <details className="ro-cite">
        <summary>근거 {item.근거.length}건</summary>
        <ul>
          {item.근거.map((c) => (
            <li key={c.source + c.위치 + c.인용}>
              <b>{sources[c.source]?.이름 ?? c.source}</b> {c.위치}
              <span className="osh-help">
                {" "}
                · 시행 {sources[c.source]?.시행}
              </span>
              <q>{c.인용}</q>
              {sources[c.source]?.원문_URL && (
                <a
                  className="osh-link"
                  href={sources[c.source].원문_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  원문 ↗<span className="ro-sr">(새 창)</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function App() {
  const [data, setData] = useState<Criteria>();
  const [error, setError] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile>({});
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [proposal, setProposal] = useState<Proposal>();
  const [accept, setAccept] = useState<Set<string>>(new Set());
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Status | "">("");
  const [tab, setTab] = useState("scoring");
  const [bidType, setBidType] = useState("");

  useEffect(() => {
    fetch(`${BASE}/api/criteria`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            (await r.json().catch(() => ({}))).detail ||
              "기준 자료를 불러오지 못했습니다.",
          );
        return r.json() as Promise<Criteria>;
      })
      .then((d) => {
        setData(d);
        setProfile(blank(d.profile));
      })
      .catch((e) =>
        setError(
          e instanceof Error && e.name !== "TimeoutError"
            ? e.message
            : "응답이 늦어 기준 자료를 불러오지 못했습니다.",
        ),
      );
  }, []);

  const sources = useMemo(
    () =>
      Object.fromEntries((data?.sources ?? []).map((s) => [s.source_id, s])),
    [data],
  );
  const out = useMemo(
    () =>
      data && purposes.length
        ? evaluate(data.checklist, profile, data.thresholds, purposes)
        : undefined,
    [data, profile, purposes],
  );
  const statusOf = useMemo(
    () =>
      Object.fromEntries(
        (data && Object.keys(profile).length
          ? evaluate(
              data.checklist,
              profile,
              data.thresholds,
              data.purposes.map((p) => p.id),
            ).judged
          : []
        ).map((j) => [j.item.id, j]),
      ),
    [data, profile],
  );

  const set = (field: string, value: string | number | null) => {
    setProfile((p) => ({ ...p, [field]: value }));
    setAiFields((s) => {
      if (!s.has(field)) return s;
      const next = new Set(s);
      next.delete(field);
      return next;
    });
  };
  const togglePurpose = (id: string) =>
    setPurposes((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  async function ask() {
    setBusy(true);
    setAiError("");
    setProposal(undefined);
    try {
      const r = await fetch(`${BASE}/api/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 설명: desc.trim() }),
        signal: AbortSignal.timeout(70000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(body.detail || "AI 프로필 채우기에 실패했습니다.");
      const p = body as Proposal;
      setProposal(p);
      setAccept(new Set(Object.keys(p.근거)));
    } catch (e) {
      setAiError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "응답이 늦어 AI 프로필 채우기를 멈췄습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    if (!proposal) return;
    const patch: Profile = {};
    for (const f of accept) patch[f] = proposal.프로필[f] as string;
    setProfile((p) => ({ ...p, ...patch }));
    setAiFields(new Set(accept));
    if (proposal.프로필.목적.length)
      setPurposes((p) => [...new Set([...p, ...proposal.프로필.목적])]);
    setProposal(undefined);
    document.getElementById("profile")?.scrollIntoView({ block: "start" });
  }
  function downloadResult() {
    if (!out) return;
    const rows = [
      ["id", "구분", "항목", "판정", "점수", "이유", "준비할 것", "근거"],
      ...out.judged.map((j) => [
        j.item.id,
        j.item.구분,
        j.item.제목,
        j.status,
        j.points === null ? "" : String(j.points),
        j.why,
        j.item.준비.join("; "),
        j.item.근거
          .map((c) => `${sources[c.source]?.이름 ?? c.source} ${c.위치}`)
          .join(" | "),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([csvOf(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "안전보건-입찰준비-점검결과.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const groups = useMemo(() => {
    const list = (out?.judged ?? [])
      .filter((j) => !filter || j.status === filter)
      .sort(
        (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
      );
    const by: Record<string, Judged[]> = {};
    for (const j of list) (by[j.item.구분] ??= []).push(j);
    return Object.entries(by);
  }, [out, filter]);

  const groupsOfFields = useMemo(() => {
    const by: Record<string, Row[]> = {};
    for (const f of data?.profile ?? []) (by[f.묶음] ??= []).push(f);
    return Object.entries(by);
  }, [data]);

  const myIndustry = String(profile["업종"] ?? "모름");
  const scoringRows = (data?.scoring ?? []).filter(
    (r) => !bidType || r.입찰유형 === bidType,
  );
  const thresholdRows = (data?.threshold_rows ?? []).filter(
    (r) =>
      myIndustry === "모름" ||
      r.업종 === myIndustry ||
      (myIndustry.length === 1 && r.업종.startsWith(myIndustry)) ||
      (myIndustry[0] === "F" && r.업종.startsWith("F")) ||
      r.업종 === "그 밖의 업종",
  );
  const mark = (f: string) =>
    aiFields.has(f) && (
      <span className="ro-ai-mark" title="AI 제안으로 채운 값">
        AI
      </span>
    );

  return (
    <div className="osh-app">
      <a className="osh-skip" href="#profile">
        업체 정보 입력으로 건너뛰기
      </a>
      <main className="osh-container osh-main">
        <a
          className="osh-link"
          href="https://osh.ai.kr/datasets/public-ohs-analysis"
        >
          ← 공공기관 안전보건 분석 자료로
        </a>
        <header className="osh-section osh-intro">
          <span className="osh-badge">
            실제 기준 · 2026-10-01 판
            {data ? ` · 판정 항목 ${data.checklist.length}개` : ""}
          </span>
          <h1 className="osh-title">공공기관 안전보건 입찰 준비 점검</h1>
          <p className="osh-copy">
            공공기관 입찰·계약에서 업체의 안전보건이 어떻게 평가되는지 원문
            기준으로 점검합니다. 하려는 일을 고르고 업체 정보를 넣으면 항목마다
            <strong> 충족 · 부족 · 확인 필요</strong>와 준비할 것, 근거 조항을
            보여 줍니다.
          </p>
          <p className="osh-note ro-notice">
            판정은 공개된 기준표 규칙으로 브라우저에서 합니다. 점수는 조달청
            기준이며 기관마다 자체 기준이 있을 수 있어 <b>입찰공고가 우선</b>
            합니다. 법률 자문이 아니고, 충족해도 낙찰을 보장하지 않습니다.
          </p>
        </header>

        {error && (
          <p className="osh-note osh-note--error" role="alert">
            {error}
          </p>
        )}
        {!data && !error && (
          <p className="osh-note" role="status">
            기준 자료를 불러오는 중입니다…
          </p>
        )}

        {data && (
          <>
            <section className="osh-card osh-stack" aria-labelledby="purpose">
              <h2 className="osh-card-title" id="purpose">
                1. 하려는 일 <span className="osh-help">(여러 개 선택)</span>
              </h2>
              <div className="ro-purposes">
                {data.purposes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ro-purpose"
                    aria-pressed={purposes.includes(p.id)}
                    onClick={() => togglePurpose(p.id)}
                  >
                    <b>{p.이름}</b>
                    <span>{p.설명}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="osh-card osh-stack" aria-labelledby="ai-title">
              <h2 className="osh-card-title" id="ai-title">
                2. 업체 설명으로 채우기 <span className="osh-badge">AI</span>
              </h2>
              <label className="osh-field">
                <span className="osh-label">우리 업체 설명</span>
                <textarea
                  className="osh-input ro-textarea"
                  rows={4}
                  maxLength={600}
                  value={desc}
                  placeholder="예: 경기도에서 시설관리 용역을 하는 직원 80명 회사입니다. KOSHA-MS 인증이 있고 위험성평가는 매년 하지만 근로자 참여 기록은 없습니다. 최근 2년 동안 재해 공표는 없었습니다."
                  onChange={(e) => setDesc(e.target.value)}
                />
                <span className="osh-help">
                  {desc.length}/600자 · 업종, 직원 수, 인증, 재해 이력, 안전관리
                  체계를 적을수록 많이 채워집니다.
                </span>
              </label>
              <p className="osh-help">
                버튼을 누르면 설명이 Anthropic(Claude)으로 전송되어 아래 칸을
                제안받습니다. 이 화면은 설명을 저장하지 않습니다. 전화번호·
                이메일·사업자번호는 보내기 전에 가립니다. 회사명은 적지 않아도
                됩니다.
              </p>
              <div className="osh-actions">
                <button
                  className="osh-button"
                  type="button"
                  disabled={busy || desc.trim().length < 5}
                  onClick={() => void ask()}
                >
                  {busy ? "설명을 읽는 중…" : "AI로 업체 정보 채우기"}
                </button>
              </div>
              {aiError && (
                <p className="osh-note osh-note--error" role="alert">
                  {aiError} 아래에서 직접 고를 수 있습니다.
                </p>
              )}
              {proposal && (
                <div className="ro-proposal" role="status">
                  <h3 className="osh-card-title">
                    이렇게 이해했어요 — 맞는 것만 남기고 적용하세요
                  </h3>
                  {Object.keys(proposal.근거).length ? (
                    <ul>
                      {Object.keys(proposal.근거).map((f) => (
                        <li key={f}>
                          <label>
                            <input
                              type="checkbox"
                              checked={accept.has(f)}
                              onChange={(e) =>
                                setAccept((s) => {
                                  const next = new Set(s);
                                  if (e.target.checked) next.add(f);
                                  else next.delete(f);
                                  return next;
                                })
                              }
                            />
                            <span className="ro-field">{f}</span>
                            <b>
                              {f === "업종"
                                ? `${proposal.프로필[f]} ${industryName(String(proposal.프로필[f]))}`
                                : String(proposal.프로필[f])}
                            </b>
                          </label>
                          <span className="osh-help">
                            설명의 ‘{proposal.근거[f]}’에서
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="osh-note">
                      설명에서 채울 정보를 찾지 못했습니다.
                    </p>
                  )}
                  {proposal.프로필.목적.length > 0 && (
                    <p className="osh-help">
                      하려는 일도 함께 고릅니다:{" "}
                      {proposal.프로필.목적.join(", ")}
                    </p>
                  )}
                  <p className="osh-help">
                    설명에 없는 칸은 ‘모름’으로 둡니다. 근거 문구가 설명에 없던
                    칸 {proposal.버린칸.length}개는 버렸습니다.
                  </p>
                  <div className="osh-actions">
                    <button
                      className="osh-button"
                      type="button"
                      onClick={apply}
                    >
                      고른 {accept.size}개 적용
                    </button>
                    <button
                      className="osh-button osh-button--secondary"
                      type="button"
                      onClick={() => setProposal(undefined)}
                    >
                      적용하지 않기
                    </button>
                  </div>
                </div>
              )}
            </section>

            <form
              id="profile"
              className="osh-card osh-stack"
              onSubmit={(e) => e.preventDefault()}
              aria-labelledby="profile-title"
            >
              <h2 className="osh-card-title" id="profile-title">
                3. 업체 정보{" "}
                <span className="osh-help">모르는 칸은 ‘모름’으로 두세요</span>
              </h2>
              {groupsOfFields.map(([group, rows]) => (
                <fieldset key={group} className="ro-group">
                  <legend>{group}</legend>
                  <div className="ro-fields">
                    {rows.map((f) => (
                      <label key={f.필드} className="osh-field">
                        <span className="osh-label">
                          {f.필드.replaceAll("_", " ")}
                          {mark(f.필드)}
                        </span>
                        {f.필드 === "업종" ? (
                          <select
                            className="osh-input"
                            value={String(profile[f.필드] ?? "모름")}
                            onChange={(e) => set(f.필드, e.target.value)}
                          >
                            <option value="모름">모름</option>
                            {sections.map((s) => (
                              <optgroup
                                key={s.code}
                                label={`${s.code} ${s.name}`}
                              >
                                <option value={s.code}>{s.code} 전체</option>
                                {divisions
                                  .filter((d) => d.parent === s.code)
                                  .map((d) => (
                                    <option key={d.code} value={d.code}>
                                      {d.code} {d.name}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : f.형식.startsWith("integer") ? (
                          <input
                            className="osh-input"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={99999}
                            value={
                              profile[f.필드] === null
                                ? ""
                                : String(profile[f.필드] ?? "")
                            }
                            placeholder="모름"
                            onChange={(e) =>
                              set(
                                f.필드,
                                e.target.value
                                  ? Math.min(
                                      99999,
                                      Math.max(
                                        1,
                                        Number.parseInt(e.target.value, 10) ||
                                          1,
                                      ),
                                    )
                                  : null,
                              )
                            }
                          />
                        ) : (
                          <select
                            className="osh-input"
                            value={String(profile[f.필드] ?? "모름")}
                            onChange={(e) => set(f.필드, e.target.value)}
                          >
                            {f.선택지.split(";").map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}
                        <span className="osh-help">{f.설명}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </form>

            <section
              className="osh-section"
              aria-labelledby="result"
              aria-live="polite"
            >
              <h2 className="osh-heading" id="result">
                4. 점검 결과
              </h2>
              {!out ? (
                <p className="osh-note">
                  위에서 하려는 일을 하나 이상 고르면 결과가 나옵니다.
                </p>
              ) : (
                <>
                  <div className="ro-tiles">
                    {statusOrder.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`ro-tile ro-${tone[s]}`}
                        aria-pressed={filter === s}
                        onClick={() => setFilter(filter === s ? "" : s)}
                      >
                        <b>{out.counts[s]}개</b>
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="osh-help">
                    숫자를 누르면 그 판정만 봅니다. ‘확인 필요’는 정보가 없거나
                    업종 세부 확인이 필요한 항목입니다.{" "}
                    <button
                      type="button"
                      className="osh-link ro-inline"
                      onClick={downloadResult}
                    >
                      내 점검 결과 CSV 내려받기
                    </button>
                  </p>
                  {out.counts.부족 > 0 && (
                    <p className="osh-note">
                      부족한 항목은 정부·지자체 지원으로 채울 수 있습니다.
                      위험성평가·안전보건관리체계 컨설팅, 안전장비·시설 개선비
                      등은{" "}
                      <a
                        className="osh-link"
                        href="/demo/osh-support-programs/"
                      >
                        안전보건 지원사업 찾기
                      </a>
                      에서 찾아보세요.
                    </p>
                  )}
                  {groups.map(([group, list]) => (
                    <div key={group} className="ro-result-group">
                      <h3 className="osh-card-title">
                        {group} <span className="ro-count">{list.length}</span>
                      </h3>
                      <div className="ro-items">
                        {list.map((j) => (
                          <ItemCard key={j.item.id} j={j} sources={sources} />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>

            <section className="osh-section" aria-labelledby="criteria">
              <h2 className="osh-heading" id="criteria">
                5. 판정기준 자료
              </h2>
              <p className="osh-help">
                점검에 쓴 기준을 그대로 공개합니다. 표마다 내 판정을 옆에 붙여
                보여 주고, 각 표를 따로 내려받을 수 있습니다.
              </p>
              <div className="ro-tabs" role="tablist" aria-label="기준 자료">
                {[
                  ["scoring", "입찰 점수기준"],
                  ["duties", "법정 의무 기준표"],
                  ["sources", "근거 문서"],
                  ["downloads", "내려받기"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className="ro-tab"
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "scoring" && (
                <div role="tabpanel" className="osh-stack">
                  <label className="osh-field ro-narrow">
                    <span className="osh-label">입찰 유형</span>
                    <select
                      className="osh-input"
                      value={bidType}
                      onChange={(e) => setBidType(e.target.value)}
                    >
                      <option value="">전체</option>
                      {[...new Set(data.scoring.map((r) => r.입찰유형))].map(
                        (t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <div
                    className="osh-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="입찰 점수기준"
                  >
                    <table className="osh-table">
                      <thead>
                        <tr>
                          <th>입찰·심사</th>
                          <th>항목</th>
                          <th>등급·조건</th>
                          <th>점수</th>
                          <th>근거</th>
                          <th>내 판정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scoringRows.map((r, i) => {
                          const mine = statusOf[r.판정항목];
                          return (
                            <tr key={i}>
                              <td>
                                {r.입찰유형}
                                <br />
                                <span className="osh-help">{r.심사}</span>
                              </td>
                              <td>{r.항목}</td>
                              <td>{r.등급_조건}</td>
                              <td className="ro-num">{r.점수}</td>
                              <td>
                                {sources[r.source]?.이름} {r.위치}
                                {r.비고 && (
                                  <span className="osh-help"> · {r.비고}</span>
                                )}
                              </td>
                              <td>
                                {mine && (
                                  <span
                                    className={`ro-status ro-status--${tone[mine.status as Status]}`}
                                  >
                                    {mine.status}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "duties" && (
                <div role="tabpanel" className="osh-stack">
                  <p className="osh-help">
                    {myIndustry === "모름"
                      ? "업체 정보에서 업종을 고르면 내 업종에 해당하는 줄만 보여 줍니다."
                      : `내 업종 ${myIndustry} ${industryName(myIndustry)} 기준과 ‘그 밖의 업종’ 기준만 보여 줍니다.`}
                  </p>
                  <div
                    className="osh-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="법정 의무 기준표"
                  >
                    <table className="osh-table">
                      <thead>
                        <tr>
                          <th>의무</th>
                          <th>업종</th>
                          <th>기준</th>
                          <th>근거</th>
                          <th>내 판정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {thresholdRows.map((r, i) => {
                          const item = data.checklist.find(
                            (c) => c.판정.기준표 === r.의무,
                          );
                          const mine = item && statusOf[item.id];
                          return (
                            <tr key={i}>
                              <td>{r.의무}</td>
                              <td>
                                {r.업종}{" "}
                                <span className="osh-help">
                                  {industryName(r.업종)}
                                </span>
                              </td>
                              <td>
                                {r.상시근로자_이상}
                                {/^\d+$/.test(r.상시근로자_이상) && "명 이상"}
                                {r.미만 && ` ${r.미만}명 미만`}
                              </td>
                              <td>
                                {sources[r.근거.split(" ")[0]]?.이름}{" "}
                                {r.근거.split(" ").slice(1).join(" ")}
                              </td>
                              <td>
                                {mine && (
                                  <span
                                    className={`ro-status ro-status--${tone[mine.status as Status]}`}
                                  >
                                    {mine.status}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "sources" && (
                <div
                  role="tabpanel"
                  className="osh-table-scroll"
                  tabIndex={0}
                  aria-label="근거 문서"
                >
                  <table className="osh-table">
                    <thead>
                      <tr>
                        <th>문서</th>
                        <th>종류</th>
                        <th>시행</th>
                        <th>번호</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sources.map((s) => (
                        <tr key={s.source_id}>
                          <td>
                            <a
                              className="osh-link"
                              href={s.원문_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {s.이름} ↗<span className="ro-sr">(새 창)</span>
                            </a>
                          </td>
                          <td>{s.종류}</td>
                          <td>{s.시행}</td>
                          <td>{s.번호}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "downloads" && (
                <div role="tabpanel" className="osh-stack">
                  <ul className="ro-downloads">
                    {data.downloads.map((d) => (
                      <li key={d}>
                        <a
                          className="osh-link"
                          href={`${BASE}/download/${d}`}
                          download
                        >
                          {d}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="osh-help">
                    README.md에 각 파일의 뜻과 판정 규칙, 한계가 있습니다.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
