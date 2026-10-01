import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { supportProgramsPublic } from "@/lib/catalog";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "안전보건 지원사업 요건" };

// Counts from the v0.7 package README and STATS.json (2026-09-28); table rows stay behind /demo/.
const evidence = [
  ["공식 문서·법령", 52, "보도자료·공고·법령해설"],
  ["포털·공고 안내", 37, "산업안전포털 사업안내 등"],
  ["언론·민간", 25, "공고 원문 대조가 남아 있음"],
] as const;

export default async function SupportProgramsPage() {
  if (!supportProgramsPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 자료 · 수요조사 시험판</span>
          <h1 className="osh-title">안전보건 지원사업 요건</h1>
          <p className="osh-copy">
            고용노동부·안전보건공단·근로복지공단·타 중앙부처·지자체의
            산업안전보건 지원사업을 대상 요건과 지원 조건 중심으로 한 표에
            모았습니다. “상시근로자 30명 금속가공업이 받을 수 있는 지원은?”,
            “프레스 안전장치는 어느 사업에서 몇 %를 받나?”에 답하기 위한
            자료입니다.
          </p>
          <p className="osh-copy">
            <strong>지원사업 114건 · 지정 지원품목 114건</strong> · 지원 종류
            9가지 · 기준연도 2021–2027 (2026년 106건)
          </p>
          <p className="osh-help">
            버전 0.7 · 최종 버전 날짜 2026-09-28 · 업데이트 계획 미정
          </p>
          <a className="osh-button" href="/demo/osh-support-programs/">
            지원사업 찾기 DEMO 열기 →
          </a>
        </header>
        <section className="osh-section">
          <h2 className="osh-heading">이렇게 활용하세요</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 사업장 조건 입력</h3>
              <p>
                상시근로자 수, 업종(KSIC 11차), 지역, 기업 규모, 유해인자 보유
                여부를 고릅니다. 지원품목·위험요인으로도 검색할 수 있습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 필요한 지원 고르기</h3>
              <p>
                설비·장비 / 진단·점검·교육 / 비용과 사람 세 갈래 중 하나와 그
                안의 지원 종류를 고르면 받을 수 있는 사업과 확인할 조건이
                나옵니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 공식 페이지에서 신청</h3>
              <p>
                신청기간·접수상태·잔여예산은 자료에 없습니다. 카드의 공식
                페이지·신청 링크에서 최신 공고를 확인하세요.
              </p>
            </article>
          </div>
          <p className="osh-help">
            판정은 요건표의 규칙으로만 합니다. AI 생성 설명·의미 검색은 포함되지
            않으며, 실제 지원 여부는 각 기관의 공고와 심사로 정해집니다.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">값을 어디에서 읽었나</h2>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="근거 수준별 사업 수"
          >
            <table className="osh-table">
              <thead>
                <tr>
                  <th>근거</th>
                  <th>사업 수</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map(([k, n, note]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{n}건</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="osh-help">
            각 사업 카드에 근거 수준을 함께 표시합니다. 행마다 실제로 읽은 근거
            URL이 있습니다.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">자료 구성과 한계</h2>
          <p className="osh-copy">
            제작자 검사는 지원비율·한도·금리·근로자 수 등 수치 152개가 출처
            문구에 있는지 확인했습니다 (152/152). 그 수치가 해당 세부사업의
            값인지는 사람이 대조하지 않았습니다.
          </p>
          <p className="osh-copy">
            지원품목은 안전보건공단 8개 사업에만 있고, 품목의 위험요인은 키워드
            규칙으로 붙인 추정값입니다. 한글 업종명과 KSIC 코드를 잇는 대응표는
            임시표여서 정식 대응표로 바꾸면 판정이 달라질 수 있습니다. 지자체
            사업은 해마다 바뀝니다.
          </p>
          <p className="osh-copy">
            원문 제공자는 기관별로 다릅니다. 기관별 이용 조건, 가공 주체,
            연구책임자·대표 연구자, 공개 문의처는 확인 중입니다. 확인 전까지
            미리보기 표와 파일 다운로드는 제공하지 않습니다.
          </p>
          <p className="osh-copy">
            DEMO 화면은 수요조사 시험판입니다. 누른 갈래·지원 종류, 검색어,
            사업장 조건, 목록에 보인 사업, 이동한 공식·신청 페이지를 기록하며
            이름·연락처· 사업장명·IP는 받지 않습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
