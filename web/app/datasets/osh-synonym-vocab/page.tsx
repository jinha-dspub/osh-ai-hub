import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { synonymVocabPublic } from "@/lib/catalog";
import {
  DataIndex,
  type IndexSource,
  type IndexTable,
} from "@/components/data-index";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "산업안전 유사어휘 데이터" };

// Counts from the 1.0.0 handoff package (dataset.json, README.md, data/sources.csv,
// reports/synonym_retrieval_eval.json, 2026-10-06). The search app and files come from NAS
// osh-synonym-vocab/serving/current, served by the /demo gateway; downloads are 60-second
// signed links from private object storage.
const TOOL = "/demo/osh-synonym-vocab/";
const DOWNLOAD = "/demo/osh-synonym-vocab/download/";

// preview.csv of the package: surface form, standard term, kind, source (3 team-made rows).
const preview = [
  ["사상", "연삭", "현장은어", "현장용어_동의어"],
  ["안전벨트", "안전대", "현장은어", "현장용어_동의어"],
  ["아시바", "비계", "현장은어", "현장용어_동의어"],
] as const;

const downloads = [
  ["전체 패키지 (zip)", "full-zip", "표 5개·벡터 색인·설명 문서·참조 앱 전부"],
  ["공개 묶음 (zip)", "release-zip", "표 5개 + 설명 문서(NOTICE 포함). 약 1.8MB"],
  ["검색 벡터", "idx-doc-vectors.f16", "34,497 × 2560 float16 (Qwen3-Embedding-4B). 약 176MB"],
  ["벡터 ↔ 문서 대응표", "idx-doc-vector-index", "행 번호 → 문서 ID·개념·본문 해시"],
  ["임베딩 설정", "idx-embedding-metadata", "모델·리비전·차원·풀링·정규화"],
] as const;

const indexTables: readonly IndexTable[] = [
  {
    name: "개념 (concepts.csv)",
    size: "22,365행",
    row: "개념 1개: 대표 표기·분야·출처 권위·정의(8,378개에만 있음)",
    source: "KOSHA 용어 3,560 · KOSHA GUIDE 용어 정의 1,756 · 공공 용어사전 16,499 · 학회 550(표기만)",
  },
  {
    name: "한글 표기 (terms.csv)",
    size: "26,119행",
    row: "개념을 부르는 한글 표기 1개: 종류(표준어 22,089 · 나열분리 1,386 · 사전동의어 1,330 · 순화대상어 1,166 · 비표준표기 75 · 현장은어 70)·출처·검토 메모",
    source: "원자료 표제어와 우리말샘·다듬은 말·연구팀 대응표",
  },
  {
    name: "영문·한자 표기 (foreign_terms.csv)",
    size: "24,228행",
    row: "영문 또는 한자 표기 1개. 6,179행은 개념에 잇지 못한 약어",
    source: "원자료의 영문·약어 열",
  },
  {
    name: "상하위 관계 (edges.csv)",
    size: "8,617행",
    row: "하위 개념 → 상위 개념 1쌍과 근거·검토 상태",
    source: "7,779건은 접미어 규칙, 205건은 미검수",
  },
  {
    name: "출처 (sources.csv)",
    size: "12행",
    row: "원자료 1개: 제공자·주소·수집일·이용 조건·건수",
    source: "연구팀 기록",
  },
  {
    name: "검색 벡터 (indexes)",
    size: "34,497 × 2560 float16 · 176MB",
    row: "한글 표기 1개 또는 ‘표기: 정의’ 1건의 벡터",
    source: "Qwen3-Embedding-4B. Hub 검색은 쓰지 않음(글자 일치만)",
  },
];
const indexSources: readonly IndexSource[] = [
  {
    name: "공공데이터포털 용어집 5종",
    href: "https://www.data.go.kr/",
    got: "2026-08-14 받음. 국토교통부 건설용어사전, 한수원 원전 표준 용어집·KOPEC 약어집, 남부발전 영문건설 용어, 산업통상부 금속표준용어",
    terms: "이용허락범위 제한 없음 (2026-10-06 포털에서 확인)",
  },
  {
    name: "한국산업안전보건공단 용어 목록 · KOSHA GUIDE 용어 정의",
    href: "https://www.kosha.or.kr/kosha/info/searchTechnicalGuidelines.do",
    got: "용어 목록 3,613건(내려받은 페이지·날짜 기록 없음), 지침 ‘용어의 정의’ 절 3,953건",
    terms: "미확인. 자료 소유자가 KOSHA GUIDE 이용 허락을 받았다고 확인",
  },
  {
    name: "국립국어원 우리말샘 · 다듬은 말",
    href: "https://opendict.korean.go.kr/",
    got: "우리말샘 뜻풀이 동의어·규범 표기, 다듬은 말 목록(2026-08-14)",
    terms: "미확인. 우리말샘은 CC BY-SA 2.0 KR로 알려져 있으나 정책 페이지를 열지 못함. 맞다면 해당 행 1,405개에 동일조건변경허락이 붙음",
  },
  {
    name: "연구팀 제작 3종",
    got: "사고유형·발생형태 표기, 현장 용어 → 표준 용어 대응표 70건, 콘솔 등록 1건",
    terms: "가공물 — 라이선스 문구 미정 (연세대학교 산업보건연구소)",
  },
];

export default async function SynonymVocabPage() {
  if (!synonymVocabPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 자료 · 1.0.0 (2026-10-06)</span>
          <h1 className="osh-title">산업안전 유사어휘 데이터</h1>
          <p className="osh-copy">
            KOSHA 용어와 공공기관 용어사전을 개념 단위로 묶고, 현장에서 쓰는 말·순화
            대상어·사전 동의어·비표준 표기·영문 표기를 표준 용어에 이은 어휘
            자료입니다. “아시바가 뭐지?”, “공구리를 표준 용어로 바꾸면?”에 답하고,
            검색어를 같은 뜻의 다른 표기로 넓히기 위한 자료입니다.
          </p>
          <p className="osh-copy">
            <strong>
              개념 22,365 · 한글 표기 26,119 · 영문·한자 표기 24,228 · 상하위 관계
              8,617 · 출처 12
            </strong>
          </p>
          <div className="osh-actions">
            <a className="osh-button" href={TOOL}>
              유사어휘 검색 →
            </a>
            <a className="osh-button osh-button--secondary" href="#download">
              데이터 받기
            </a>
          </div>
          <p className="osh-help">
            연구책임자 윤진하 · 대표 연구자·가공 변재욱 (연세대학교 산업보건연구소).
            공개 문의처와 갱신 계획은 아직 정해지지 않았습니다.
          </p>
        </header>

        <section className="osh-section">
          <h2 className="osh-heading">미리보기</h2>
          <p className="osh-copy">
            DEMO 미리보기 · 실제 자료 일부. 연구팀이 직접 만든 현장 용어 대응표의
            3행입니다. 대표성을 주장하지 않습니다.
          </p>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="미리보기: 표기 3건"
          >
            <table className="osh-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>표기</th>
                  <th>표준 용어</th>
                  <th>종류</th>
                  <th>출처</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(([surface, standard, kind, source], i) => (
                  <tr key={surface}>
                    <td>{i + 1}</td>
                    <td>{surface}</td>
                    <td>{standard}</td>
                    <td>{kind}</td>
                    <td>{source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <DataIndex
          lead="모든 표는 concept_id로 개념 표에 붙고, 표기의 source는 출처 표에 붙습니다. 한글 표기가 2개 이상인 개념은 2,495개이고 나머지 19,870개는 표기가 하나뿐이라 ‘유사어’가 없습니다. 개념 묶기와 상하위 관계는 규칙으로 만들었고 LLM 생성값은 없습니다."
          tables={indexTables}
          sources={indexSources}
          note="행마다 출처가 적혀 있습니다. 재배포할 때는 행별 출처를 함께 밝히고, 이용 조건이 미확인인 출처(KOSHA 2종·국립국어원 2종, 한글 표기의 31%)는 조건을 확인한 뒤 쓰세요(패키지 NOTICE.md). 2026-10-06 자료 소유자 결정으로 공개합니다."
        />

        <section className="osh-section">
          <h2 className="osh-heading">이렇게 활용하세요</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 현장 말 → 표준 용어</h3>
              <p>
                표기를 그대로, 앞부분, 포함으로 찾습니다. ‘아시바’는 비계와 작업발판
                두 개념으로 나옵니다. 의미(벡터) 검색은 꺼져 있고, 켜도 임베딩 단독
                recall@10이 0.40(2,368개 비표준 표기 기준)이라 보조용입니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 검색어 확장</h3>
              <p>
                한 개념의 모든 표기를 한 번에 받아 다른 검색의 질의를 넓힙니다. KOSHA
                GUIDE 그래프 검색이 같은 통제어휘로 ‘공구리 → 콘크리트’를 확장합니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 표 내려받기</h3>
              <p>
                개념·표기·영문·상하위·출처 표 5개와 벡터 색인을 받습니다. 알려진
                잘못 묶임(예: ‘직류’ ← ‘데이터 검사’)은 패키지 QUALITY.md에 있습니다.
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
            영문 표기의 lang 값은 한자 2,567건에도 ‘en’으로 적혀 있습니다. 447개
            표기에는 ‘정의 불일치 — 동음이의 의심’ 메모가 있습니다. 한국안전학회
            용어표준화(2013) 용어집과 웹에서 모은 은어는 이용 조건 문제로 뺐고, 학회
            유래 개념 550개는 표기만 남겼습니다. 용어 자료라 개인정보 검토 대상이
            아니며 외부 AI 전송은 없었습니다.
          </p>
          <p className="osh-help">
            출처: 한국산업안전보건공단, 국토교통부, 한국수력원자력(주),
            한국남부발전(주), 산업통상부, 국립국어원. 가공: 변재욱(연세대학교
            산업보건연구소). 인용: 윤진하·변재욱, 「산업안전 유사어휘 데이터」 1.0.0,
            연세대학교 산업보건연구소, 2026-10-06.
          </p>
        </section>
      </div>
    </div>
  );
}
