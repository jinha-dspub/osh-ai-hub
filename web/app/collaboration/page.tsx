import Link from "next/link";
import { DatasetCard } from "@/components/ui";
import { collaborationTemplates } from "@/lib/catalog";
import "../../../design/osh-family/osh-family.css";
import "./collaboration.css";

export const metadata = {
  title: "협업",
  description:
    "OSH AI Hub 데이터·앱 협업 소개, 데이터 제작 템플릿과 Family Design, 협업 문의 안내.",
};
export default function CollaborationPage() {
  return (
    <div className="osh-app collaboration-page">
      <div className="osh-container osh-main">
        <header className="osh-section">
          <span className="osh-badge">
            OSH AI Hub · 함께 만드는 데이터와 도구
          </span>
          <h1 className="osh-title">협업</h1>
          <p className="osh-copy osh-muted">
            연구자료를 정리하거나 산업안전보건 앱을 만들고 있나요? 공통 양식과
            디자인으로 준비하고, OSH AI Hub와 연결할 방법을 함께 논의하세요.
          </p>
          <nav className="osh-actions" aria-label="협업 안내">
            <a className="osh-button" href="#templates">
              협업 템플릿 보기
            </a>
            <a
              className="osh-button osh-button--secondary"
              href="#introduction"
            >
              협업 소개
            </a>
            <a className="osh-button osh-button--secondary" href="#contact">
              협업 요청
            </a>
          </nav>
        </header>
        <section
          className="osh-section"
          id="introduction"
          aria-labelledby="collaboration-intro"
        >
          <h2 className="osh-heading" id="collaboration-intro">
            협업 소개
          </h2>
          <div className="osh-workspace">
            <article className="osh-card">
              <h3 className="osh-card-title">연구자·자료 제작자</h3>
              <p className="osh-copy">
                원자료와 설명, 검증 결과를 하나의 데이터 패키지로 준비합니다.
                자료의 출처·연구자·공개 범위를 확인하고 소개 페이지와 활용
                방법을 함께 정합니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">개발자·앱 제작자</h3>
              <p className="osh-copy">
                공통 디자인을 적용한 DEMO와 실행 환경을 준비합니다. 데이터 연결,
                화면 구성, API 활용과 운영에 필요한 내용을 함께 검토합니다.
              </p>
            </article>
          </div>
          <p className="osh-copy collaboration-explore">
            자료를 이용하고 싶다면{" "}
            <Link className="osh-link" href="/datasets">
              데이터 찾기
            </Link>
            에서, 도구를 사용하고 싶다면{" "}
            <Link className="osh-link" href="/tools">
              분석·체험
            </Link>
            에서 시작하세요.
          </p>
        </section>
        <section
          className="osh-section"
          id="templates"
          aria-labelledby="collaboration-templates"
        >
          <h2 className="osh-heading" id="collaboration-templates">
            협업 템플릿
          </h2>
          <p className="osh-copy osh-muted">
            자료를 만드는 양식과 앱의 공통 디자인을 제공합니다. 사람이나 제작
            AI에게 전달해 사용할 수 있으며 로그인 없이 다운로드할 수 있습니다.
          </p>
          <div className="collaboration-template-grid">
            {collaborationTemplates.map((template) => (
              <DatasetCard dataset={template} key={template.slug} />
            ))}
          </div>
        </section>
        <section
          className="osh-section"
          id="contact"
          aria-labelledby="collaboration-contact"
        >
          <article className="osh-card osh-stack">
            <h2 className="osh-heading" id="collaboration-contact">
              협업 요청
            </h2>
            <p className="osh-copy">
              데이터 제공, 공동 연구, DEMO 제작이나 앱 연결을 논의하고 싶다면
              아래 이메일로 연락해 주세요.
            </p>
            <a
              className="osh-button collaboration-email"
              href="mailto:jinha@dspubs.org"
            >
              jinha@dspubs.org
            </a>
            <p className="osh-help">
              이름·소속, 자료 또는 앱의 간단한 소개, 현재 준비 상태와 원하는
              협업 내용을 알려주시면 논의에 도움이 됩니다.
            </p>
            <p className="osh-help">
              이메일 앱이 열리지 않으면 주소를 복사해 사용하세요. 실제 자료의
              전달 방법과 공개 범위는 협의 후 정합니다.
            </p>
          </article>
        </section>
        <section
          className="osh-section"
          aria-labelledby="collaboration-developers"
        >
          <h2 className="osh-heading" id="collaboration-developers">
            개발자 문서
          </h2>
          <p className="osh-copy osh-muted">
            API 연결을 검토하는 개발자는 호출 예제와 API 목록을 확인하세요. 현재
            공개 샘플 API는 DEMO 합성 자료를 제공합니다.
          </p>
          <div className="osh-actions">
            <Link
              className="osh-button osh-button--secondary"
              href="/developers"
            >
              API 문서·호출 예제
            </Link>
            <Link className="osh-button osh-button--secondary" href="/apis">
              API 목록 보기
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
