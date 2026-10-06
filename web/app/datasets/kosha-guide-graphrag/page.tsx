import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { koshaGraphragPublic } from "@/lib/catalog";
import {
  DataIndex,
  type IndexSource,
  type IndexTable,
} from "@/components/data-index";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "KOSHA GUIDE 그래프 검색 자료" };

// Counts from the 1.0.0 handoff package (dataset.json, README.md, 2026-10-06) and the
// serving release the gateway reads (ai-api/app/kosha_graphrag.py). Files stay on the NAS;
// nothing is bundled into the web build. Downloads are 60-second signed links from private
// object storage (ai-api/app/safetybread_apps.py, scripts/upload_safetybread_storage.py).
const TOOL = "/demo/kosha-guide-graphrag/";
const DOWNLOAD = "/demo/kosha-guide-graphrag/download/";
const downloads = [
  [
    "전체 패키지 (zip)",
    "full-zip",
    "청크 본문·임베딩 벡터·어휘 색인·BM25 색인 5종·개체 관계·법령 751건·점검 MVP 산출물·설명 문서 전부 (약 880MB를 압축)",
  ],
  [
    "핵심 묶음 (zip)",
    "release-zip",
    "청크 18,659·문서·제목 계층·개체 관계·법령 마크다운 751건 + 설명 문서. 약 14MB",
  ],
] as const;

// preview.csv of the package: guide name, domain, chunk and heading counts (no text).
const preview = [
  ["A-R-1-2026 자율안전보건체계 구축 및 운영에 관한 기술지원규정", "리스크관리", "719", "981"],
  ["C-C-56-2026 사고피해예측 기법에 관한 기술지원규정", "화학안전", "213", "260"],
  ["E-94-2011 산업용 기계설비의 전기장치 설치에 관한 기술 기준", "전기안전", "200", "243"],
] as const;

const indexTables: readonly IndexTable[] = [
  {
    name: "지침 본문 구간 (chunks.jsonl)",
    size: "18,659행 × 24칸 · 42MB",
    row: "지침 한 건의 본문 한 구간: 지침명·분야·제목 경로·본문·원문 쪽",
    source: "KOSHA GUIDE 658건 PDF를 문자 인식(OCR)해 구간으로 나눔",
  },
  {
    name: "지침 목록 (documents.jsonl)",
    size: "658행",
    row: "지침 한 건: ID·이름·분야 (화학 234 · 기계 138 · 전기 95 · 일반 84 · 건설 76 · 리스크 31)",
    source: "지침 PDF 파일명과 표지",
  },
  {
    name: "BM25 낱말 색인",
    size: "용어 128만 · 포스팅 349만 · 84MB",
    row: "낱말(단어·두 단어 쌍) 하나가 어느 구간에 몇 번 나오는지",
    source: "구간 본문에서 패키지 제작자가 만든 색인 5종 중 u2-r60 하나",
  },
  {
    name: "개념 색인 (concepts·postings)",
    size: "개념 3,000 · 포스팅 219,984",
    row: "지침 제목에서 뽑은 개념 하나와 그 개념이 나오는 구간",
    source: "제목 계층에서 규칙으로 추출 (provisional/v1)",
  },
  {
    name: "개체 관계 그래프 (entities·relations)",
    size: "개체 3,808 · 관계 2,558",
    row: "구간 안에서 함께 나온 두 개체의 관계(발생원인·예방조치·위험요인·보호구·측정항목·관련작업)와 근거 구간",
    source: "로컬 LLM(qwen3.6:35b) 추출. 구간의 9.8%에서만 나옴. 근거가 아닌 탐색용",
  },
  {
    name: "관계 캐시 (graph_relations_cache.json)",
    size: "13,064행",
    row: "지침 단위로 뽑은 (개념, 술어, 개념) 세 짝과 그 지침 이름",
    source: "제작자의 점검 파이프라인 산출물",
  },
  {
    name: "법령 조문 원문 (docstore.json)",
    size: "조문 3,027개 (안전보건규칙 669 · 시행규칙 250 · 산안법 185 · 시행령 124 등)",
    row: "조문 하나의 본문과 법령명·조번호·조제목·시행일",
    source: "국가법령정보센터 본문 78건을 조문 단위로 나눔",
  },
  {
    name: "지침→조문 인용표 (kosha_citation_map.json)",
    size: "조문 416개 ↔ 지침 199건",
    row: "조문 하나를 본문에서 인용한 지침 목록",
    source: "지침 본문의 조문 언급을 규칙으로 찾음",
  },
  {
    name: "조문→판례 인용표 (precedent_citation_map.json)",
    size: "조문 414개 ↔ 사건번호",
    row: "조문 하나를 인용한 판결 사건번호 목록",
    source: "산업안전 판례 169건 (osh-precedents 패키지와 같은 원천)",
  },
  {
    name: "통제어휘 (통제어휘.db)",
    size: "개념 22,365 · 표기 26,119 · 12MB",
    row: "표기 하나(현장 은어·순화 대상어·비표준 표기)와 그 표준 용어",
    source: "osh-synonym-vocab 패키지와 같은 원천. 검색어 확장에만 씀",
  },
];
const indexSources: readonly IndexSource[] = [
  {
    name: "한국산업안전보건공단 KOSHA GUIDE 안전보건기술지침",
    href: "https://www.kosha.or.kr/kosha/info/searchTechnicalGuidelines.do",
    got: "수집일 기록 없음(가공 실행 2026-08-01). 지침 PDF 658건을 OCR한 본문. 원본 PDF(약 3GB)는 싣지 않음",
    terms:
      "미확인. 공공누리 유형과 재배포 조건을 원문 페이지에서 확인하지 못함 — 그래서 본문 파일은 내려받지 못하고 화면에 발췌만 보여 줌",
  },
  {
    name: "국가법령정보센터 (법제처)",
    href: "https://www.law.go.kr/",
    got: "수집일 기록 없음. 산업안전보건 법령·고시·예규 본문 78건, 별표 673건. 파일마다 개정 번호·시행일 기록",
    terms: "법령·행정규칙 (저작권법 제7조 제1·2호, 보호받지 못하는 저작물). 2차 출처로만 확인",
  },
  {
    name: "대법원 사법정보공개포털",
    href: "https://portal.scourt.go.kr/",
    got: "판결문 169건에서 뽑은 조문 인용 관계만. 재판부·대법관 이름 삭제",
    terms: "판결문 (저작권법 제7조 제3호). 포털 이용약관의 수집·재배포 조건은 미확인",
  },
  {
    name: "통제어휘 원천 9곳",
    got: "공공데이터포털 용어집 5종(이용허락 제한 없음)과 KOSHA 용어 목록·KOSHA GUIDE 용어 정의·우리말샘·국립국어원 다듬은 말",
    terms: "뒤의 4종은 이용 조건 미확인 (표기의 31%). 검색어 확장에만 쓰고 내려받기는 없음",
  },
];

export default async function KoshaGraphragPage() {
  if (!koshaGraphragPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 자료 · 검토 중 · 1.0.0 (2026-10-06)</span>
          <h1 className="osh-title">KOSHA GUIDE 그래프 검색 자료</h1>
          <p className="osh-copy">
            한국산업안전보건공단의 안전보건기술지침(KOSHA GUIDE) 658건을 검색할 수
            있게 가공한 자료입니다. 본문을 18,659구간으로 나누고, 낱말 색인과
            개념 색인, 지침에서 뽑은 개체 관계 그래프, 지침이 인용한 법령 조문
            원문, 조문을 인용한 판례 번호, 현장 용어→표준 용어 사전을 한 묶음으로
            연결했습니다. “아시바 위에서 작업할 때 난간은 어떻게 해야 하나?”처럼
            현장 말로 물어 관련 지침 구간과 조문을 함께 찾기 위한 자료입니다.
          </p>
          <p className="osh-copy">
            <strong>
              지침 658건 · 본문 18,659구간 · 조문 3,027개 · 개체 3,808 · 관계
              2,558 · 어휘 표기 26,119
            </strong>
          </p>
          <div className="osh-actions">
            <a className="osh-button" href={TOOL}>
              KOSHA GUIDE 그래프 검색 →
            </a>
            <a className="osh-button osh-button--secondary" href="#download">
              데이터 받기
            </a>
          </div>
          <p className="osh-help">
            연구책임자 윤진하 · 대표 연구자·가공 변재욱 (연세대학교
            산업보건연구소). 공개 문의처와 갱신 계획은 아직 정해지지 않았습니다.
          </p>
        </header>

        <section className="osh-section">
          <h2 className="osh-heading">미리보기</h2>
          <p className="osh-copy">
            DEMO 미리보기 · 실제 자료 일부. 패키지가 공개용으로 고른 3행이며
            지침 이름·분야·구간 수만 있습니다(본문 없음). 대표성을 주장하지
            않습니다.
          </p>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="미리보기: 지침 3건"
          >
            <table className="osh-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>지침</th>
                  <th>분야</th>
                  <th>구간 수</th>
                  <th>제목 수</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(([name, domain, chunks, headings], i) => (
                  <tr key={name}>
                    <td>{i + 1}</td>
                    <td>{name}</td>
                    <td>{domain}</td>
                    <td>{chunks}</td>
                    <td>{headings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <DataIndex
          lead="검색 화면이 읽는 파일은 아래와 같습니다. 패키지에는 이 밖에 Qwen3-Embedding-4B 임베딩 벡터(183MB), BM25 색인 변형 4개, 서술문 점검 MVP의 판정 규칙·참조 앱이 더 있으며 Hub 서비스는 그것들을 쓰지 않습니다."
          tables={indexTables}
          sources={indexSources}
          note="가공물(구간 분할·색인·그래프·인용표)의 권리는 연세대학교 산업보건연구소에 있고 라이선스 문구는 아직 정하지 않았습니다. 패키지는 전체 파일을 ‘누구나 공개’로 표시했지만 공개 상태는 모두 ‘검토(review)’입니다."
        />

        <section className="osh-section">
          <h2 className="osh-heading">이렇게 활용하세요</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 현장 말로 검색</h3>
              <p>
                낱말 일치(BM25)로 지침 구간을 찾습니다. ‘아시바’, ‘공구리’ 같은
                현장 용어는 통제어휘로 ‘비계·작업발판’, ‘콘크리트’를 함께 찾고,
                ‘안전난간을’처럼 조사가 붙은 말도 맞춥니다. 뜻이 비슷한 다른
                표현은 못 찾을 수 있습니다(의미 검색 없음).
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 조문과 개념으로 넓히기</h3>
              <p>
                결과 지침이 인용한 법령 조문의 원문과, 그 조문을 인용한 판례
                번호를 함께 봅니다. 지침에서 뽑힌 개체 관계(발생원인·예방조치
                등)는 다음 검색어를 고르는 탐색용이며 근거로 쓰지 않습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 선택한 근거로 AI 답변</h3>
              <p>
                체크한 발췌(최대 6개)와 조문(최대 3개)만 Claude(Sonnet 5.5)에
                보내 짧게 답합니다. 문장마다 근거 번호가 붙고, 근거가 확인되지
                않는 문장은 서버가 지웁니다. 질문과 발췌는 저장하지 않으며 하루
                이용 한도가 있습니다. 법적 판단이 아닙니다.
              </p>
            </article>
          </div>
        </section>

        <section className="osh-section" id="download">
          <h2 className="osh-heading">데이터 받기</h2>
          <p className="osh-copy">
            버튼을 누르면 60초 동안 유효한 주소로 바로 내려받습니다. 파일의 SHA-256은
            전체 패키지 안의 files.csv에 있습니다. 임베딩 벡터(Qwen3-Embedding-4B,
            18,659 × 2560 float32, 183MB)와 BM25·어휘 색인은 전체 패키지에 들어
            있습니다.
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

        <section className="osh-section" id="terms">
          <h2 className="osh-heading">이용 조건</h2>
          <p className="osh-copy">
            KOSHA GUIDE 본문은 자료 소유자가 이용 허락을 받았다고 확인해 2026-10-06
            공개했습니다. 패키지의 ACCESS.md에는 재배포 조건이 ‘미확인’으로 남아
            있으니, 다시 배포할 때는 한국산업안전보건공단의 조건을 직접 확인하세요.
          </p>
          <p className="osh-copy">
            법령 조문은 보호받지 못하는 저작물이고, 판례 인용 관계와 통제어휘는
            각각 산업안전 판례 자료와 유사어휘 자료의 이용 조건을 따릅니다. 이
            자료의 AI 추출물(개체 관계, 관계 캐시)은 정확도 검증이 끝나지
            않았습니다. 제작자 평가에서 정답 관계 243개 중 그대로 찾은 것은
            4개였습니다.
          </p>
          <p className="osh-copy">
            본문은 PDF를 문자 인식한 글이라 오자와 깨진 표·수식이 있습니다.
            지침의 제·개정 연도는 지침 이름에 있으며 현행 여부는 공단 누리집에서
            확인하세요.
          </p>
          <p className="osh-help">
            출처: 한국산업안전보건공단, 국가법령정보센터, 대법원
            사법정보공개포털, 통제어휘 원천 9곳. 가공: 변재욱(연세대학교
            산업보건연구소). 인용: 윤진하·변재욱, 「KOSHA Guide GraphRAG 데이터」
            1.0.0, 연세대학교 산업보건연구소, 2026-10-06.
          </p>
        </section>
      </div>
    </div>
  );
}
