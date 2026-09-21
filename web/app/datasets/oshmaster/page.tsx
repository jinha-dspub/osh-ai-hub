import Link from "next/link";
import data from "@/lib/oshmaster-catalog.json";
import "../../../../design/osh-family/osh-family.css";
export const metadata = { title: "산업안전보건 표준분류 마스터" };
export default function OshmasterPage() {
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">실제 코드집 · 검토 중</span>
          <h1 className="osh-title">{data.title}</h1>
          <p className="osh-copy">
            질병·직업·산업·유해인자 등 표준 코드와 동의어, 판본별 상하위 관계를
            함께 찾아봅니다.
          </p>
          <p className="osh-copy">
            <strong>원 코드 {data.codes.toLocaleString()}개</strong> · 통합 코드{" "}
            {data.unified_codes.toLocaleString()}개 · {data.standards}개 표준
            식별자
          </p>
          <p className="osh-help">
            버전 {data.version} · 최종 버전 날짜 {data.version_date} · 업데이트
            계획 미정
          </p>
          <a className="osh-button" href="/demo/oshmaster/">
            표준분류 검색 DEMO 열기 →
          </a>
        </header>
        <section className="osh-section">
          <h2 className="osh-heading">이렇게 활용하세요</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3>1. 표현이나 코드 검색</h3>
              <p>
                분류와 판본을 고르고 “폐암”, “용접”, “C34”처럼 입력합니다.
                표준명·동의어·관련 어휘 후보를 구분합니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>2. 계층과 범위 확인</h3>
              <p>
                상위·하위 코드를 살펴보고 선택한 코드만 사용할지, 하위 분류까지
                포함할지 정합니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>3. 선택 코드 활용</h3>
              <p>
                선택 범위를 확인한 뒤 JSON을 받습니다. 코드 선택은 사건 라벨이나
                인과관계의 승인과 별개입니다.
              </p>
            </article>
          </div>
          <p className="osh-help">
            검색은 사전·어휘 기반입니다. 이 DEMO에는 임베딩·LLM 자연어 의도
            추출이 포함되지 않습니다.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">데이터 미리보기</h2>
          <p className="osh-help">
            DEMO 미리보기 · 실제 코드집 일부. KCD 9차의 C33·C34·C34.0을 선택한
            3행이며 대표 표본이 아닙니다.
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="표준분류 3행 미리보기"
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>표준</th>
                  <th>판본</th>
                  <th>코드</th>
                  <th>명칭</th>
                </tr>
              </thead>
              <tbody>
                {data.preview.map((row) => (
                  <tr key={row.code}>
                    <td>{row.std}</td>
                    <td>{row.std_version}</td>
                    <td>{row.code}</td>
                    <td>{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">자료 구성과 한계</h2>
          <p className="osh-copy">
            원 코드·통합 코드·매핑·검색 보조표와 판본별 계층을 포함합니다. 각
            표의 행은 다른 단위이므로 합산해 고유 코드 수로 해석하지 않습니다.
          </p>
          <p className="osh-copy">
            미연결 보조정보 26행, 미연결 매핑 20행, 원 판본 미기록 교차 매핑
            5,008행, 미해결 탐색 노드 14행을 보존했습니다. 판본 사이 매핑을 자동
            정답으로 사용하지 마세요.
          </p>
          <p className="osh-copy">
            원문 제공자는 코드집별로 다릅니다. KCD·KSCO·KSIC·KECO·OIICS·ESAW
            등을 포함하며 개별 출처 기록은 자료에 있습니다. 출처별 재배포 조건,
            연구책임자·대표 연구자와 갱신 담당은 확인 중입니다. Hugging Face
            게시 계획은 없습니다.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">파일 다운로드</h2>
          <p className="osh-copy">
            전체 인수 ZIP과 Excel용 CSV ZIP을 제공합니다. Excel에서는 코드 열을
            텍스트로 가져와 선행 0을 보존하세요. 소개는 공개하며 검색·상세·원본
            다운로드는 기존 인증 관문을 이용합니다.
          </p>
          <a
            className="osh-button osh-button--secondary"
            href="/demo/oshmaster/#files"
          >
            인증된 화면에서 파일 받기
          </a>
        </section>
      </div>
    </div>
  );
}
