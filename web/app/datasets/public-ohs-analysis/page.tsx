import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { publicOhsPublic } from "@/lib/catalog";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "공공기관 안전보건 분석" };

// Files are served by the /demo gateway from NAS 공공기관안전보건분석/serving/current
// (pinned set, ai-api/app/public_ohs_readiness.py). Counts from serving v2 (2026-10-01).
const TOOL = "/demo/public-ohs-readiness/";
const DOWNLOAD = "/demo/public-ohs-readiness/download/";
type File = readonly [label: string, path: string, note: string];
const sections: readonly {
  id: string;
  title: string;
  lead: string;
  files: readonly File[];
}[] = [
  {
    id: "criteria",
    title: "입찰·계약 안전보건 판정기준",
    lead: "공공기관 입찰과 계약에서 업체의 안전보건이 어떻게 평가되는지, 원문 인용과 함께 정리한 기준입니다. 점검 도구가 이 파일만으로 판정합니다.",
    files: [
      ["전체 (zip)", "public-ohs-readiness-0.1.zip", "아래 파일 모두"],
      [
        "입찰 점수기준",
        "data/criteria_scoring.csv",
        "조달청 시설공사 적격·종합심사, 일반용역·물품 적격심사의 안전 항목 47행",
      ],
      [
        "법정 의무 적용 기준",
        "data/duty_thresholds.csv",
        "안전관리자·보건관리자 등 업종·상시근로자 기준 233행",
      ],
      [
        "판정 항목",
        "data/checklist.csv",
        "31개 항목의 판정 규칙·영향·준비할 것 (JSONL도 있음)",
      ],
      [
        "근거 인용",
        "data/criteria_citations.csv",
        "항목별 문서·조항·원문 인용",
      ],
      [
        "근거 문서",
        "data/sources.csv",
        "법령·행정규칙·지침 12건, 시행일·원문 링크",
      ],
      [
        "업체 프로필 스키마",
        "data/profile.schema.json",
        "자연어 설명을 넣는 34개 칸",
      ],
    ],
  },
  {
    id: "alio",
    title: "공공기관 355곳 안전 공시 (ALIO)",
    lead: "공공기관 경영정보 공개시스템의 안전관리 공시 전부를 기관별로 모았습니다. 공시 값은 그대로 두고('-'·'해당없음'을 0으로 바꾸지 않음) 담당자 개인정보는 뺐습니다.",
    files: [
      [
        "전체 (zip)",
        "alio/public-ohs-alio-20261001.zip",
        "아래 파일 + 임직원 수 공시 표(분모용), 약 1.9MB",
      ],
      [
        "기관별 안전 요약",
        "alio/data/safety_summary.csv",
        "355곳 × 연도별 사고사망자(승인)·중대재해 부상자·안전관리 종합등급",
      ],
      [
        "안전 공시 표 전체",
        "alio/data/safety_disclosures.csv",
        "38,625행: 직영·도급·건설발주별, 발생(분기)·승인(연도)",
      ],
      ["기관 목록", "alio/data/institutions.csv", "기관 유형·주무부처"],
      [
        "안전경영책임보고서 목록",
        "alio/data/safety_reports.csv",
        "1,681개 첨부의 연도·원문 링크",
      ],
      [
        "국회·감사 지적사항",
        "alio/data/audit_points.csv",
        "안전·재해·사고·도급 관련 1,109건",
      ],
      [
        "내부규정 목록",
        "alio/data/internal_rules.csv",
        "안전·계약·입찰·적격심사 관련 3,974건(원문 링크)",
      ],
      [
        "정부 지침 목록",
        "alio/data/guidelines.csv",
        "공공기관 안전관리 지침 등 80건",
      ],
    ],
  },
];

export default async function PublicOhsPage() {
  if (!publicOhsPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 자료 · 2026-10-01 수집</span>
          <h1 className="osh-title">공공기관 안전보건 분석</h1>
          <p className="osh-copy">
            공공기관의 안전보건 공시와, 공공기관 입찰·계약에서 업체에 요구되는
            안전보건 기준을 함께 모았습니다. “우리 회사가 공공기관 용역 입찰에서
            안전 점수를 잃는 부분은?”, “이 기관은 최근 사고사망자가 있었나?”에
            답하기 위한 자료입니다.
          </p>
          <p className="osh-copy">
            <strong>
              공공기관 355곳 · 안전 공시 38,625행 · 판정 항목 31개 · 입찰
              점수기준 47행
            </strong>{" "}
            · 근거 법령·행정규칙 32건
          </p>
          <div className="osh-actions">
            <a className="osh-button" href={TOOL}>
              우리 업체 안전보건 입찰 준비 점검 →
            </a>
            <a className="osh-button osh-button--secondary" href="#download">
              데이터 받기
            </a>
          </div>
        </header>

        <section className="osh-section">
          <h2 className="osh-heading">이렇게 활용하세요</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 업체 점검 (MVP)</h3>
              <p>
                하려는 일(공공 건설공사·용역·물품·현장 작업)을 고르고 업체를
                글로 설명하면 AI가 칸을 채웁니다. 항목마다 충족·부족·확인 필요와
                가·감점, 준비할 것, 근거 조항이 나옵니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 기준 자체를 내려받기</h3>
              <p>
                점수기준·법정 의무 기준표·판정 항목·근거 인용을 따로 받을 수
                있습니다. 모든 인용은 만들 때 원문과 대조했습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 발주 기관 살펴보기</h3>
              <p>
                기관별 사고사망자·중대재해 부상자·안전관리등급 추이와
                안전경영책임보고서, 국회·감사 지적사항을 확인합니다.
              </p>
            </article>
          </div>
        </section>

        <section className="osh-section" id="download">
          <h2 className="osh-heading">데이터 받기</h2>
          {sections.map((s) => (
            <div key={s.id} className="osh-stack" style={{ marginBottom: 32 }}>
              <h3 className="osh-card-title" id={s.id}>
                {s.title}
              </h3>
              <p className="osh-copy">{s.lead}</p>
              <div
                className="osh-table-scroll"
                tabIndex={0}
                role="region"
                aria-label={s.title}
              >
                <table className="osh-table">
                  <thead>
                    <tr>
                      <th>자료</th>
                      <th>파일</th>
                      <th>내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.files.map(([label, path, note]) => (
                      <tr key={path}>
                        <td>{label}</td>
                        <td>
                          <a
                            className="osh-link"
                            href={`${DOWNLOAD}${path}`}
                            download
                          >
                            {path.split("/").pop()}
                          </a>
                        </td>
                        <td>{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">자료 구성과 한계</h2>
          <p className="osh-copy">
            점수기준은 조달청 기준입니다. 공공기관마다 자체 적격심사·계약 기준이
            있을 수 있어 입찰공고가 우선합니다. 기관별 내부규정 원문은 수집
            중이며 다음 판에서 반영합니다. PQ(입찰참가자격사전심사)·용역
            종합심사·협상계약 제안서 평가의 안전 항목도 원문을 받아 두었고 아직
            판정에 넣지 않았습니다.
          </p>
          <p className="osh-copy">
            원청이 수급업체를 평가하는 항목은 고용노동부 매뉴얼(2020)의 예시
            평가표를 따랐습니다. 법정 의무의 업종 기준은 KSIC 중분류로 단순화해
            같은 분류 안에 기준이 다르면 ‘확인 필요’로 둡니다. 법률 자문이
            아니며, 충족해도 낙찰을 보장하지 않습니다.
          </p>
          <p className="osh-copy">
            ALIO 공시는 2026-10-01 시점의 최신 공시입니다. 사고사망자 ‘발생’은
            분기 공시, ‘승인’은 연도별 5개년이며 둘을 더하지 않습니다.
            직영·도급·건설발주는 책임 범위로 근로자 범위와 다릅니다.
          </p>
          <p className="osh-help">
            출처: 국가법령정보센터(법령·행정규칙), ALIO 공공기관 경영정보
            공개시스템, 고용노동부, 국토안전관리원. 가공: OSH AI Hub. 별도
            라이선스 표기 없음.
          </p>
        </section>
      </div>
    </div>
  );
}
