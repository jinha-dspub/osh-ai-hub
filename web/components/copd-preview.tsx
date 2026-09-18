import { copdPreview } from "@/lib/copd-preview";

export function CopdPreview() {
  return (
    <section className="copd-preview" aria-labelledby="copd-preview-title">
      <div className="copd-preview-heading">
        <h3 id="copd-preview-title">데이터 미리보기</h3>
        <span className="badge demo">DEMO 미리보기 · 실제 자료 3행</span>
      </div>
      <p>엑셀에서 보듯 행과 열로 살펴보세요. 실제 cases.csv의 첫 3행에서 주요 항목만 표시했습니다.</p>
      <div className="copd-sheet-scroll" role="region" aria-label="COPD 데이터 미리보기 표 · 가로 스크롤 가능" tabIndex={0}>
        <table className="copd-sheet">
          <caption className="sr-only">COPD 실제 자료 첫 3행의 청구 연도, 판정, AI 표준 직종과 AI 유해인자</caption>
          <thead>
            <tr className="copd-sheet-letters" aria-hidden="true"><td></td>{["A", "B", "C", "D"].map(letter => <td key={letter}>{letter}</td>)}</tr>
            <tr>
              <th scope="col" className="copd-sheet-number">행</th>
              <th scope="col">청구 연도<small>원문 기반</small></th>
              <th scope="col">판정<small>원문 기반</small></th>
              <th scope="col">직종<small>AI 표준화</small></th>
              <th scope="col">유해인자<small>AI 추출</small></th>
            </tr>
          </thead>
          <tbody>{copdPreview.map((row, index) => <tr key={index}>
            <th scope="row" className="copd-sheet-number">{index + 1}</th>
            <td>{row.year}</td><td>{row.approval}</td><td>{row.occupation || "미분류"}</td><td>{row.hazards || "기록 없음"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="copd-caption">읽기 전용 · 작은 화면에서는 표를 좌우로 움직여 보세요. 사건번호와 원문은 표시하지 않습니다. AI 가공 항목은 원문 대조가 필요합니다.</p>
      <a className="text-link" href="/demo/copd/">DEMO에서 전체 사례 검색하기 →</a>
    </section>
  );
}
