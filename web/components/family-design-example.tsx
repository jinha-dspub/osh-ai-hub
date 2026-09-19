"use client";
import { useState } from "react";

export const familyPrompt =
  "이 앱에 OSH Family Design을 적용해 줘. 제공된 osh-family.css와 Noto Sans KR Variable 폰트를 사용해서 osh.ai.kr와 같은 색상·카드·버튼·입력창·여백으로 맞춰 줘. 기능과 작업 순서는 이 앱의 목적에 맞게 구성하고, 새 브랜드 색이나 별도 폰트를 임의로 만들지 마. preview.html을 시각 기준으로 삼고 360px 모바일·키보드·오류 상태까지 확인해 줘. 실제 기능이 없는 예시는 DEMO로 표시해 줘.";

const samples = [
  { id: "DEMO-001", title: "문서 변환 예시", purpose: "입력·결과 배치" },
  { id: "DEMO-002", title: "데이터 검색 예시", purpose: "필터·목록 배치" },
  { id: "DEMO-003", title: "건강 기록 예시", purpose: "단계·확인 배치" },
];

export function FamilyDesignExample() {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const results = samples.filter((row) => row.title.includes(applied.trim()));
  return (
    <div className="osh-card osh-stack">
      <span className="osh-badge osh-badge--demo">DEMO · 컴포넌트 예시</span>
      <h3 className="osh-card-title">입력·버튼·표를 직접 확인하세요</h3>
      <p className="osh-help">
        아래 검색은 합성 예시 3개를 브라우저 안에서만 필터링합니다.
      </p>
      <form
        className="osh-stack"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(query);
        }}
      >
        <div className="osh-field">
          <label className="osh-label" htmlFor="family-query">
            예시 검색어
          </label>
          <input
            className="osh-input"
            id="family-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 문서"
          />
        </div>
        <div className="osh-actions">
          <button type="submit" className="osh-button">
            예시 검색
          </button>
          <button
            type="button"
            className="osh-button osh-button--secondary"
            onClick={() => {
              setQuery("");
              setApplied("");
            }}
          >
            초기화
          </button>
        </div>
      </form>
      <p className="osh-help" role="status">
        {results.length
          ? `DEMO 합성 예시 ${results.length}개`
          : "일치하는 예시가 없습니다. 검색어를 바꿔 주세요."}
      </p>
      <div
        className="osh-table-scroll"
        role="region"
        tabIndex={0}
        aria-label="디자인 예시 표"
      >
        <table className="osh-table family-example-table">
          <caption>DEMO · 실제 연구자료가 아닌 합성 예시</caption>
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">예시 자료</th>
              <th scope="col">용도</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.title}</td>
                <td>{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="osh-help">
        좁은 화면에서는 표 안에서 좌우로 이동할 수 있습니다.
      </p>
    </div>
  );
}

export function FamilyDesignPrompt() {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(familyPrompt);
      setStatus("작업 지시문을 복사했습니다.");
    } catch {
      setStatus(
        "자동 복사를 사용할 수 없습니다. 아래 지시문을 직접 선택해 복사해 주세요.",
      );
    }
  }
  return (
    <div className="osh-card osh-stack">
      <label className="osh-label" htmlFor="family-prompt">
        다른 AI에게 전달할 작업 지시문
      </label>
      <textarea
        className="osh-input family-prompt"
        id="family-prompt"
        readOnly
        value={familyPrompt}
      />
      <div className="osh-actions">
        <button
          type="button"
          className="osh-button osh-button--secondary"
          onClick={copy}
        >
          지시문 복사
        </button>
        <span className="osh-help" role="status">
          {status}
        </span>
      </div>
    </div>
  );
}
