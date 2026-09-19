import Link from "next/link";
import release from "@/lib/opendata-kit-release.json";
import "../../../../design/osh-family/osh-family.css";

export const metadata = {
  title: "데이터 제작 가이드",
  description:
    "OSH AI Hub 협업자를 위한 데이터 패키지 양식, AI 작업 지시문과 Python 실행 환경 인계 안내.",
};
const required = [
  [
    "README.md",
    "자료 소개, 원문 제공자, 연구책임자·대표 연구자, 버전 날짜·업데이트 계획",
  ],
  ["dataset.json", "자료 ID, 표 연결, 확인된 통계와 기능별 공개 상태"],
  ["data_dictionary.csv", "열의 의미·타입·단위·결측·출처"],
  ["files.csv", "파일 목록·크기·SHA-256·행 수"],
  ["QUALITY.md", "실제로 검사한 내용, 결과와 미검증 항목"],
  ["ACCESS.md", "이용 조건, 개인정보 검토와 공개 가능한 범위"],
  ["HANDOFF.md", "다음 담당자에게 전달할 실행 방법과 미완료 작업"],
];
export default function OpenDataGuide() {
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <div className="osh-actions">
            <span className="osh-badge">데이터 제작 가이드 · 공개</span>
            <span className="osh-badge">v{release.version}</span>
          </div>
          <h1 className="osh-title">데이터 제작 가이드</h1>
          <p className="osh-copy osh-muted">
            협업자가 만든 자료를 OSH AI Hub에 연결할 수 있도록 준비하세요.
            데이터 설명·검증·연구자 정보·실행 환경을 작성하는 양식과 다른 AI에게
            전달할 작업 지시문을 제공합니다.
          </p>
          <a className="osh-button" href={release.url} download={release.name}>
            제작 가이드·템플릿 다운로드 (ZIP)
          </a>
          <p className="osh-help">
            {(release.bytes / 1024).toFixed(1)} KB · 로그인 없이 다운로드 · 최종
            버전 날짜 {release.published}
          </p>
        </header>
        <section className="osh-section" aria-labelledby="workflow">
          <h2 id="workflow" className="osh-heading">
            협업은 이렇게 진행합니다
          </h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 양식과 지시문 받기</h3>
              <p className="osh-copy">
                ZIP의 START-HERE.md부터 읽고 _template 폴더를 새 작업 위치로
                복사하세요. AI 작업 지시문의 A 블록에 자료명과 원본 위치를
                채웁니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 실제 자료로 채우기</h3>
              <p className="osh-copy">
                원본을 보존하면서 표와 문서를 ID로 연결하고,
                출처·연구자·버전·검사 결과를 기록합니다. 모르는 정보는
                미확인으로 남깁니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 담당자에게 전달하기</h3>
              <p className="osh-copy">
                완성한 패키지와 HANDOFF.md를 합의한 경로로 전달하세요. Hub에서
                검증한 뒤 소개·DEMO·다운로드를 연결합니다.
              </p>
            </article>
          </div>
          <p className="osh-note">
            이 페이지는 제작 양식을 제공합니다. 자료 업로드·자동 등록 기능은
            아직 없으며, 원본 전달 경로와 공개 범위는 담당자와 정합니다.
          </p>
        </section>
        <section className="osh-section" aria-labelledby="required">
          <h2 id="required" className="osh-heading">
            기본 설명 파일 7개
          </h2>
          <div className="osh-stack">
            {required.map(([name, description]) => (
              <article className="osh-card" key={name}>
                <h3 className="osh-card-title">{name}</h3>
                <p className="osh-copy osh-muted">{description}</p>
              </article>
            ))}
          </div>
          <p className="osh-help">
            소개 표를 제공하면 preview.csv, 가공하면 PROCESSING.md, DEMO를
            만들면 DEMO.md와 실제 참조 코드를 함께 작성합니다.
          </p>
          <p className="osh-note">
            <strong>DEMO · 합성 예시</strong>
            <br />
            템플릿에 들어 있는 3행은 양식 설명용입니다. 실제 자료와 섞지 말고
            교체하세요.
          </p>
        </section>
        <section className="osh-section" aria-labelledby="python">
          <h2 id="python" className="osh-heading">
            Python 패키지도 함께 보내야 하나요?
          </h2>
          <div className="osh-workspace">
            <article className="osh-card">
              <h3 className="osh-card-title">데이터만 전달할 때</h3>
              <p className="osh-copy">
                CSV·XLSX·MD와 설명만 있다면 requirements.txt는 필수가 아닙니다.
                파일 형식과 읽는 방법을 기록하면 됩니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">Python 코드를 전달할 때</h3>
              <p className="osh-copy">
                requirements.txt 또는 pyproject.toml과 대응 lock 파일에 실제
                사용한 패키지와 검증 버전을 적습니다. ENVIRONMENT.md에는 Python
                버전·설치·실행·검사 명령을 기록하세요.
              </p>
            </article>
          </div>
          <p className="osh-note">
            동봉한 requirements.txt는 주석만 있는 작성 양식입니다. 사용하는
            패키지를 실제 검증한 버전으로 채우고 새 가상환경에서 실행해 보세요.
            표준 라이브러리만 사용하면 외부 패키지 없음이라고 적습니다.
          </p>
          <p className="osh-help">
            필요한 경우에만 OS 프로그램·GPU/CUDA·모델 정보를 추가합니다.
            JavaScript 앱은 package.json·lock 파일·Node 버전을 전달합니다.
            키·토큰·.venv는 포함하지 않습니다.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">연구자·버전 정보도 함께 기록하세요</h2>
          <p className="osh-copy">
            원문 제공자, 연구책임자, 대표 연구자, 가공 주체를 구분합니다. 현재
            버전·최종 버전 날짜·변경 이력과 다음 업데이트 주기·목표일·예정
            변경·담당자를 작성하세요. 업데이트 계획은 계획 있음·미정·계획
            없음·갱신 종료로 구분합니다.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">DEMO 화면도 만들고 있다면</h2>
          <p className="osh-copy">
            공통 색상·한글 폰트·카드·버튼은 Family Design 키트를 적용하세요.
          </p>
          <Link
            className="osh-button osh-button--secondary"
            href="/datasets/family-design"
          >
            OSH Family Design 보기
          </Link>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">키트 버전과 확인</h2>
          <p className="osh-copy">
            가이드 v{release.version} · 공개일 {release.published}. 변경 이력:
            연구자·버전 관리 양식과 실행 환경·의존성 작성 안내를 포함합니다.
            다음 업데이트 일정은 미정이며 규약 변경 시 새 버전으로 제공합니다.
          </p>
          <p className="osh-help">
            ZIP 안의 KIT-MANIFEST.json에서 파일별 크기와 해시를 확인할 수
            있습니다.
          </p>
          <details>
            <summary>ZIP SHA-256 확인</summary>
            <code style={{ overflowWrap: "anywhere" }}>{release.sha256}</code>
          </details>
        </section>
      </div>
    </div>
  );
}
