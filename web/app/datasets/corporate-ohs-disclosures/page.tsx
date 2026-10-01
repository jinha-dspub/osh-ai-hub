import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { corporateOhsPublic } from "@/lib/catalog";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "기업·기관 안전보건 공개정보" };

// Counts from the 1.0.0-internal-rc2.2 package README and QUALITY.md (2026-10-01).
// Files stay on the NAS and are served by the /demo gateway, never bundled into the web build.
const DEMO = "/demo/corporate-ohs-disclosures/demo/";
const RELEASE = "/demo/corporate-ohs-disclosures/release/rc2_2";

const contents = [
  ["기업·기관", "47곳", "상장기업과 공공기관. 원천마다 포함 범위가 다릅니다"],
  [
    "안전보건 지표 관측",
    "845행",
    "ESG 보고서 434행 + ALIO 411행. 원문 지표 × 연도 × 범위의 보고값",
  ],
  [
    "공통 지표",
    "27개",
    "관측이 있는 지표 12개, 현재 연결된 관측이 없는 지표 15개",
  ],
  [
    "DART 사고",
    "53건",
    "별도 공시 78건 · 연결 207건. 공시를 피해자 수로 합산하지 않습니다",
  ],
  [
    "고용노동부 산재공표",
    "843행",
    "공표 행 기준이며 사고 건수와 다릅니다. 기업과 검증 연결된 행은 13개",
  ],
  ["통계", "12종", "사고유형·업종·연도별 사고, 지표 공개현황, 근로자 범위 등"],
] as const;

const sources = [
  [
    "KRX ESG·KIND, 기업 지속가능경영보고서",
    "안전보건 지표",
    "보고연도 2021–2025",
  ],
  [
    "공공기관 경영정보 공개시스템(ALIO)",
    "공공기관 안전 경영공시",
    "보고연도 2023–2026",
  ],
  ["금융감독원 DART·OpenDART", "사고 관련 공시", "2024 – 2026-09-28"],
  [
    "고용노동부 산업재해 발생건수 등 공표",
    "공표 대상 사업장",
    "2024·2025년 공표 목록(실적 2018–2024)",
  ],
] as const;

const files = [
  [
    "안전보건 지표 관측",
    "company_ohs_observations.csv",
    `${RELEASE}/data/company_ohs_observations.csv`,
  ],
  ["DART 사고", "incident_events.csv", `${RELEASE}/data/incident_events.csv`],
  ["기업·기관 목록", "entities.csv", `${RELEASE}/data/entities.csv`],
  ["코드북", "CODEBOOK.md", `${RELEASE}/docs/CODEBOOK.md`],
  [
    "지표 사전",
    "INDICATOR_DICTIONARY.csv",
    `${RELEASE}/docs/INDICATOR_DICTIONARY.csv`,
  ],
] as const;

export default async function CorporateOhsPage() {
  if (!corporateOhsPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 자료 · RC2.2</span>
          <h1 className="osh-title">기업·기관 안전보건 공개정보</h1>
          <p className="osh-copy">
            지속가능경영보고서·공공기관 경영공시·DART 공시·고용노동부 산재공표에
            흩어진 안전보건 정보를 기업·기관 단위로 모았습니다. 원문 지표의
            정의·범위·기간을 그대로 두고 공통 지표 27개에 연결해, 어느 기업이
            무엇을 공개했는지 원문과 함께 확인할 수 있습니다.
          </p>
          <p className="osh-copy">
            <strong>기업·기관 47곳 · 지표 관측 845행 · DART 사고 53건</strong> ·
            공통 지표 27개 · 내용군 6개
          </p>
          <p className="osh-help">
            버전 1.0.0-internal-rc2.2 · 버전 날짜 2026-10-01(원천 수집일 아님) ·
            다음 업데이트는 원천 정정·매핑 승인 시
          </p>
          <div className="osh-grid">
            <a className="osh-button" href={DEMO}>
              공개정보 탐색 DEMO 열기 →
            </a>
            <a
              className="osh-button osh-button--secondary"
              href={`${DEMO}#downloads`}
            >
              데이터 다운로드
            </a>
          </div>
        </header>

        <section className="osh-section">
          <h2 className="osh-heading">이렇게 활용하세요</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 업종 현황</h3>
              <p>
                업종별 공개 사고와 사고유형, 안전보건 지표를 공개한 기업 수를
                봅니다. 업종 전체 재해현황이 아니라 수집된 공개자료의
                구성입니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 기업 조회·비교</h3>
              <p>
                기업명·종목코드로 찾아 사고·지표·근로자 범위·원문표·공시를 한
                화면에서 봅니다. 기업 2–3곳, 업종 2–4개를 나란히 비교할 수
                있습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 지표 사전·원문</h3>
              <p>
                27개 지표의 정의와 기업별 원문값·단위·산식을 확인하고, 출처
                문서와 페이지로 이동합니다.
              </p>
            </article>
          </div>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">무엇이 들어 있나</h2>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="자료 구성"
          >
            <table className="osh-table">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>규모</th>
                  <th>한 행의 의미</th>
                </tr>
              </thead>
              <tbody>
                {contents.map(([k, n, note]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{n}</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">원천과 기간</h2>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="원천과 기간"
          >
            <table className="osh-table">
              <thead>
                <tr>
                  <th>원천</th>
                  <th>내용</th>
                  <th>기간</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(([k, what, when]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{what}</td>
                    <td>{when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="osh-help">
            2026년은 부분기간입니다. 행마다 원문 URL·문서·페이지가 있으며 원문
            PDF·첨부는 배포하지 않습니다. GRI·ESRS·SASB·K-ESG는 개념 근거일 뿐
            준수·인증을 뜻하지 않습니다.
          </p>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">데이터 받기</h2>
          <div className="osh-grid">
            {files.map(([label, name, href]) => (
              <article className="osh-card" key={name}>
                <h3 className="osh-card-title">{label}</h3>
                <p>
                  <a className="osh-link" href={href} download>
                    {name}
                  </a>
                </p>
              </article>
            ))}
            <article className="osh-card">
              <h3 className="osh-card-title">전체 패키지</h3>
              <p>
                <a
                  className="osh-link"
                  href="/demo/corporate-ohs-disclosures/demo/data/rc2_2_candidate.zip"
                  download
                >
                  rc2_2_candidate.zip
                </a>{" "}
                · 데이터 21 · 통계 14 · 문서 13개 파일과 README·manifest
              </p>
            </article>
          </div>
          <p className="osh-help">
            CSV는 UTF-8입니다. 식별자와 원문값은 문자열로 읽으세요. 엑셀에서
            바로 열면 접수번호의 앞자리 0이 사라질 수 있으니 데이터 가져오기로
            모든 열을 텍스트로 지정하세요.
          </p>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">해석할 때 주의할 점</h2>
          <p className="osh-copy">
            기업의 안전수준이나 입찰 적격성을 평가하는 자료가 아닙니다.
            단위·분모· 배율·근로자 범위가 서로 다른 값을 합산·평균·순위화하지
            마세요. 공통 지표 연결은 개념 연결이며 값을 직접 비교해도 된다는
            승인이 아닙니다.
          </p>
          <p className="osh-copy">
            0은 미공개나 무사고를 뜻하지 않습니다. 원문 대시·미확인·해당없음과
            숫자 0을 구분해 두었습니다. 사망 관련 지표가 있다고 실제 사망자가
            있었다는 뜻도 아닙니다. 수집 기업은 대표표본이 아닙니다.
          </p>
          <p className="osh-copy">
            원천별 권리는 각 제공기관에 있으며 이 자료는 단일 오픈 라이선스를
            선언하지 않습니다. 원천별 재사용 범위 검토(HR01–HR07)가 끝나지 않은
            상태에서 2026-10-01 공개했습니다. 재배포·상업적 이용 전에는 각
            원천의 이용 조건을 확인하세요. 연구책임자·가공 주체·공개 문의처는
            확인 중입니다.
          </p>
          <p className="osh-copy">
            인용할 때는 자료명·버전(1.0.0-internal-rc2.2)과 각 원천
            문서·페이지를 함께 적어 주세요.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">함께 보면 좋은 데이터</h2>
          <p className="osh-copy">
            이 데이터의 ALIO 기관 8곳을 포함한 공공기관 355곳의 안전 공시 전체는{" "}
            <Link className="osh-link" href="/datasets/public-ohs-analysis">
              공공기관 안전보건 분석
            </Link>
            에서 받을 수 있습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
