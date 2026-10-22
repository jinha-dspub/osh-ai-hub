import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { chemregPublic } from "@/lib/catalog";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "ChemReg 화학제품 SDS·MSDS 도구" };

// Counts from the ChemReg 1.0.0 package docs/DATASET.md (2026-10-22). The app runs as its own
// process behind the /demo gateway; nothing from it is bundled into the web build.
const TOOL = "/demo/chemreg/";

const contents = [
  ["참고물질", "69종", "CAS별 공단 참고물질. 68종은 MSDS 16항목 확보, 1종은 식별자 후보"],
  ["제품", "7개 + 후보 107개", "SDS 1·2·3항을 대조한 제품과, 제조사·제품 코드·지역 기준 후보"],
  ["SDS 문서 기록", "127행", "하나의 원본이 여러 기록과 연결될 수 있어 고유 PDF 수와 다릅니다"],
  ["출처 문서", "1,532개", "고유 원본 1,377개. 웹 목록·XML·PDF·참조 이미지, SHA-256으로 보존"],
  [
    "규제 검색",
    "47,520행",
    "KOSHA 목록 20,664 · 등록 현황 2,540 · H/P 문구 198 · 업무 매뉴얼 18. 고유 물질 수로 합산하지 않습니다",
  ],
  ["국제 식별자", "22,898행", "독일 GESTIS 8,741행 · UBA WGK 14,157행"],
  ["공개 CSV 스냅샷", "20개", "물질·제품·SDS·GHS·식별자·규제 등. 도구 안에서 내려받습니다"],
] as const;

const menus = [
  ["라벨 분석", "제품 사진의 글자를 브라우저 안에서 읽어 제품·CAS 후보를 찾습니다. 사진은 서버로 보내지 않습니다."],
  ["MSDS 작성 및 보관", "빈 양식·보유 PDF·기존 SDS·공단 참고물질에서 시작해 16항목 초안을 저장하고 버전을 남깁니다."],
  ["라벨 만들기", "H·P 문구와 그림문자를 원문과 연결해 mm 단위 경고표지 초안을 만들고 인쇄 미리보기를 엽니다."],
  ["물질 및 제품 찾기", "제품명·제조사·CAS로 검색하고 원본 SDS, 국가·개정일, 검토 상태를 확인합니다."],
  ["등록 규제 문구", "KREACH·KOSHA·ECHA 목록, 규제·등록 현황과 공식 조회 링크를 검색합니다."],
  ["노출 사고 시 대처", "대피·신고 순서와 참고물질 MSDS 4항(응급조치) 원문을 바로 봅니다."],
] as const;

const sources = [
  ["제조사 SDS 발행자", "제품 SDS 원본 PDF", "문서별 개정일"],
  ["안전보건공단(KOSHA)", "참고물질 MSDS, 물질 목록", "수집 시점 기준"],
  ["화학물질정보처리시스템(KREACH)", "등록·규제 현황, 업무 매뉴얼", "수집 시점 기준"],
  ["ECHA · DGUV GESTIS · UBA WGK · OSHA · PubChem", "국제 식별자·분류", "수집 시점 기준"],
] as const;

export default async function ChemregPage() {
  if (!chemregPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 자료 · 1.0.0 (2026-10-22)</span>
          <h1 className="osh-title">ChemReg 화학제품 SDS·MSDS 도구</h1>
          <p className="osh-copy">
            화학제품 사진에서 제품과 SDS를 확인하고, MSDS 작성·보관과 경고표지
            출력으로 이어지는 산업안전보건 업무 도구입니다. 제조사 SDS와
            공단·KREACH·국제 기관의 공개 자료를 원본 그대로 보존하고, 검색과
            작성 보조에 씁니다.
          </p>
          <p className="osh-copy">
            <strong>참고물질 69종 · 제품 7개 · 규제 47,520행 · 출처 문서 1,532개</strong>{" "}
            · 메뉴 6개
          </p>
          <p className="osh-help">
            다른 DEMO와 같이 로그인 없이 바로 엽니다. 올린 PDF와 작성본은 이
            도구를 쓰는 모든 사람이 함께 봅니다.
          </p>
          <div className="osh-grid">
            <a className="osh-button" href={TOOL}>
              ChemReg 열기 →
            </a>
          </div>
        </header>

        <section className="osh-section">
          <h2 className="osh-heading">여섯 개 메뉴</h2>
          <div className="osh-grid">
            {menus.map(([title, text], i) => (
              <article className="osh-card" key={title}>
                <h3 className="osh-card-title">
                  {i + 1}. {title}
                </h3>
                <p>{text}</p>
              </article>
            ))}
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
          <p className="osh-help">
            CSV 20개는 도구 안의 ‘물질 및 제품 찾기’와 ‘등록 규제 문구’ 화면에서
            내려받습니다. 사용자가 작성한 MSDS와 라벨은 각 작성본의 JSON·인쇄
            기능으로 내보냅니다.
          </p>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">원천</h2>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="원천"
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
            문서별 출처·URL·수집일·SHA-256은 도구 안 자료 설명(DATASET.md)과
            seed 목록에 있습니다. 공단 API 키는 설정하지 않아 새 자료의 온라인
            조회는 꺼져 있고 보존 자료만 검색합니다.
          </p>
        </section>

        <section className="osh-section">
          <h2 className="osh-heading">해석할 때 주의할 점</h2>
          <p className="osh-copy">
            이 도구가 만드는 MSDS와 경고표지는 검토용 초안입니다. 공단 제출,
            제출번호 발급, 혼합물의 자동 유해성 판정은 하지 않습니다. OCR 일치나
            CAS 발견만으로 실제 제품의 성분·분류를 확정하지 마세요.
          </p>
          <p className="osh-copy">
            원문 제공자의 권리는 각 제공자에게 있으며 이 패키지는 전체 자료에
            단일 오픈 라이선스를 선언하지 않습니다. 소유자의 결정으로 2026-10-22
            공개했습니다. 법령·자료 최신성과 실제 용도·농도별 규제 적용은 별도로
            확인하세요.
          </p>
          <p className="osh-copy">
            저장 공간은 하나뿐이라 올린 PDF와 작성본은 모든 이용자가 함께
            봅니다. 개인 의료정보나 영업비밀은 올리지 마세요.
          </p>
          <p className="osh-copy">
            인용할 때는 자료명·버전(ChemReg 1.0.0, 2026-10-22)과 각 원문 문서의
            출처·개정일을 함께 적어 주세요.
          </p>
        </section>
      </div>
    </div>
  );
}
