import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { precedentsPublic } from "@/lib/catalog";
import {
  DataIndex,
  type IndexSource,
  type IndexTable,
} from "@/components/data-index";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "산업안전 판례 데이터" };

// Counts from the 1.0.0 handoff package (dataset.json, README.md, reports/export_stats.json,
// 2026-10-06). The search app and files come from NAS osh-precedents/serving/current (v2 = the
// package with four remaining name strings removed on the owner's instruction), served by the
// /demo gateway; downloads are 60-second signed links from private object storage.
const TOOL = "/demo/osh-precedents/";
const DOWNLOAD = "/demo/osh-precedents/download/";

// preview.csv of the package: court, decision date, case number, title (3 reviewed rows).
const preview = [
  ["대법원", "2026-05-21", "2018다296229", "단체교섭청구의소"],
  [
    "대법원",
    "2026-01-29",
    "2025도15060",
    "산업안전보건법위반ㆍ중대재해처벌등에관한법률위반(산업재해치사)",
  ],
  [
    "대전지방법원",
    "2025-08-27",
    "2025노860",
    "업무상과실치사ㆍ산업안전보건법위반ㆍ중대재해처벌등에관한법률위반(산업재해치사)",
  ],
] as const;

const downloads = [
  ["전체 패키지 (zip)", "full-zip", "표 7개·판결문 169건 이름 삭제본·색인·설명 문서 전부"],
  ["공개 묶음 (zip)", "release-zip", "표 7개 + 판결문 169건 + 설명 문서. 약 3MB"],
  ["검색 벡터", "idx-doc-vectors.f32", "4,883 × 2560 float32 (Qwen3-Embedding-4B). 약 50MB"],
  ["벡터 ↔ 문서 대응표", "idx-doc-vector-index", "행 번호 → 문서 ID·사건번호·본문 해시"],
  ["임베딩 설정", "idx-embedding-metadata", "모델·리비전·차원·풀링·정규화"],
] as const;

const indexTables: readonly IndexTable[] = [
  {
    name: "판결문 (cases.csv)",
    size: "169행",
    row: "판결문 1건: 법원·심급·선고일·사건번호·사건명·원문 주소",
    source: "판결문 머리줄과 사건번호 규칙",
  },
  {
    name: "사건 카드 (incident_cards.csv)",
    size: "106행",
    row: "사건 1건의 사고 요약: 사고 유형·업종·사실관계 (39건은 ‘사고없음’)",
    source: "로컬 LLM(qwen2.5:14b) 추출 + 규칙 보정. 사람 검수 없음",
  },
  {
    name: "조문별 판단 (judgment_units.csv)",
    size: "151행",
    row: "사건 × 조문 1쌍의 판시 요지·요건",
    source: "로컬 LLM 추출 + 원문 발췌 대조",
  },
  {
    name: "선고형 (sentence_units.csv)",
    size: "86행",
    row: "사건 × 피고인 1쌍의 주문",
    source: "주문을 규칙으로 파싱",
  },
  {
    name: "인용 조문 (case_articles.csv)",
    size: "1,405행",
    row: "사건 1건이 인용한 조문(항·호) 1개",
    source: "본문에서 규칙으로 추출",
  },
  {
    name: "조문 개정 대응 (article_amendments.csv)",
    size: "27행",
    row: "구법 조문 1개 → 현행 조문",
    source: "규칙",
  },
  {
    name: "본문 구간 (chunks.csv)",
    size: "4,632행",
    row: "판결문의 연속 구간 1개 (약 481자)",
    source: "문단 단위 분할",
  },
  {
    name: "판결문 전문 (raw/txt)",
    size: "169파일",
    row: "판결문 1건의 이름 삭제본",
    source: "사법정보공개포털 공개 판결문",
  },
  {
    name: "검색 벡터 (indexes)",
    size: "4,883 × 2560 · 50MB",
    row: "구간·사건 카드·판시 요지 1건의 벡터",
    source: "Qwen3-Embedding-4B. Hub 검색은 쓰지 않음(키워드만)",
  },
];
const indexSources: readonly IndexSource[] = [
  {
    name: "대법원 사법정보공개포털",
    href: "https://portal.scourt.go.kr/",
    got: "2026-08-15 이전 수집(정확한 날짜·검색어·선별 기준 기록 없음). 건별 원문 주소는 cases.csv의 source_url",
    terms:
      "판결문 (저작권법 제7조 제3호, 보호받지 못하는 저작물로 판단). 포털 이용약관의 수집·재배포 조건은 미확인",
  },
];

export default async function PrecedentsPage() {
  if (!precedentsPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 자료 · 1.0.0 (2026-10-06)</span>
          <h1 className="osh-title">산업안전 판례 데이터</h1>
          <p className="osh-copy">
            산업안전보건법 위반, 업무상과실치사상, 산재 손해배상·행정처분 사건의 공개
            판결문 169건(선고 1985-01-15 ~ 2026-05-21)과, 그 판결문에서 뽑은 사건
            요약·조문별 판단·선고형, 인용 조문 관계를 모았습니다. “비슷한 사고에서
            법원은 어떤 조문을 어떻게 판단했나”를 사고 상황과 조문으로 찾아 읽기 위한
            자료입니다.
          </p>
          <p className="osh-copy">
            <strong>
              판결문 169건 · 사건 카드 106 · 조문별 판단 151 · 선고형 86 · 인용 조문
              1,405 · 본문 구간 4,632
            </strong>
          </p>
          <div className="osh-actions">
            <a className="osh-button" href={TOOL}>
              판례 검색 →
            </a>
            <a className="osh-button osh-button--secondary" href="#download">
              데이터 받기
            </a>
          </div>
          <p className="osh-help">
            연구책임자 윤진하 · 대표 연구자·가공 변재욱 (연세대학교 산업보건연구소).
            이번 169건은 첫 공개분이며, 판례를 차후 계속 추가해 전수 공개하는
            것이 목표입니다(자료 소유자 결정, 2026-10-06). 공개 문의처는 아직
            정해지지 않았습니다.
          </p>
        </header>

        <section className="osh-section">
          <h2 className="osh-heading">미리보기</h2>
          <p className="osh-copy">
            DEMO 미리보기 · 실제 자료 일부. 패키지가 공개용으로 고른 3행이며 법원·선고일·
            사건번호·사건명만 있습니다. 대표성을 주장하지 않습니다.
          </p>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="미리보기: 판결문 3건"
          >
            <table className="osh-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>법원</th>
                  <th>선고일</th>
                  <th>사건번호</th>
                  <th>사건명</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(([court, date, number, title], i) => (
                  <tr key={number}>
                    <td>{i + 1}</td>
                    <td>{court}</td>
                    <td>{date}</td>
                    <td>{number}</td>
                    <td>{title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <DataIndex
          lead="모든 표는 사건번호로 판결문 표에 붙고, 조문은 ‘산업안전보건법_제38조’ 같은 키로 표끼리 이어집니다. 사건 카드와 조문별 판단은 AI가 추출한 값이며 사람이 검수하지 않았습니다."
          tables={indexTables}
          sources={indexSources}
          note="가공물(표·구간·벡터·코드)의 권리는 연세대학교 산업보건연구소에 있고 라이선스 문구는 아직 정하지 않았습니다. 2026-10-06 자료 소유자 결정으로 공개합니다."
        />

        <section className="osh-section">
          <h2 className="osh-heading">이름 삭제</h2>
          <p className="osh-copy">
            당사자는 법원이 이미 ‘피고인 1’, ‘공소외 2’처럼 비실명 처리한 상태입니다.
            여기에 검사·변호인·대리인·재판부 서명·본문의 대법관 이름을 규칙으로 찾아
            515곳을 ‘[삭제: … 이름]’으로 바꿨습니다. 삭제 뒤 남은 후보 26건은 ‘검사
            결과’ 같은 일반 낱말이었고, 자료 소유자가 결과를 육안으로 확인했습니다.
            Hub 배포본(v2)에서는 본문에 남아 있던 이름 표기 4종(대리인·변호사 이름 2,
            법무법인명 2)을 추가로 지웠습니다. 회사·기관 이름은 그대로 있습니다.
          </p>
          <p className="osh-copy">
            원문에서 누락을 발견하면 자료 소개 문의처가 정해질 때까지 Hub 운영진에게
            알려 주세요. 해당 판본을 내리고 고친 판본으로 바꿉니다.
          </p>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">이렇게 활용하세요</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 사고 상황으로 검색</h3>
              <p>
                판결문 원문·사건 요약·판시 요지를 키워드로 찾고, 법원·심급·사건
                유형·사고 유형·업종·관련 조문으로 거릅니다. 결과마다 어느 종류에서
                걸렸는지 표시합니다. 의미(벡터) 검색은 꺼져 있습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 조문으로 넓히기</h3>
              <p>
                한 사건이 인용한 조문 목록과 구법→현행 조문 대응을 함께 봅니다.
                KOSHA GUIDE 그래프 검색의 조문 카드에 나오는 판례 번호가 이
                자료의 사건번호입니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 표와 원문 내려받기</h3>
              <p>
                표 7개와 판결문 169건 이름 삭제본, 벡터 색인을 받습니다. 사건
                카드·조문별 판단의 AI 추출값은 원문과 대조해 쓰세요.
              </p>
            </article>
          </div>
        </section>

        <section className="osh-section" id="download">
          <h2 className="osh-heading">데이터 받기</h2>
          <p className="osh-copy">
            버튼을 누르면 60초 동안 유효한 주소로 바로 내려받습니다. 파일의 SHA-256은
            전체 패키지 안의 files.csv에 있습니다.
          </p>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="내려받기 파일"
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
                {downloads.map(([label, id, note]) => (
                  <tr key={id}>
                    <td>{label}</td>
                    <td>
                      <a className="osh-link" href={`${DOWNLOAD}${id}`}>
                        내려받기
                      </a>
                    </td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">자료 구성과 한계</h2>
          <p className="osh-copy">
            169건은 첫 공개분이며 대표 표본이 아닙니다. 수집 검색어와 선별 기준의
            기록이 없고, 산업안전과 거리가 먼 사건도 섞여 있습니다. 앞으로 판례를
            계속 추가해 전수 공개하는 것이 목표이며, 추가분은 새 판본으로 올리고
            변경 이력에 적습니다. 상소·확정 여부는 추적하지
            않았습니다. 사건 카드는 산업안전 조문이 걸린 106건에만 있고 그중 39건은
            사고를 다루지 않습니다. 사고 유형·업종 통계의 분모는 169가 아니라 106(또는
            67)입니다.
          </p>
          <p className="osh-copy">
            AI 추출값(사건 카드·조문별 판단)의 정확도는 평가하지 않았고, 검색 품질
            평가셋도 없습니다. 판결문 원문 주소 169개가 지금도 열리는지는 확인하지
            않았습니다. 법률 자문이 아닙니다.
          </p>
          <p className="osh-help">
            출처: 대법원 사법정보공개포털. 가공: 변재욱(연세대학교 산업보건연구소).
            인용: 윤진하·변재욱, 「산업안전 판례 데이터」 1.0.0, 연세대학교
            산업보건연구소, 2026-10-06.
          </p>
        </section>
      </div>
    </div>
  );
}
