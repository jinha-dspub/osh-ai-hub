import Link from "next/link";
import {
  FamilyDesignExample,
  FamilyDesignPrompt,
} from "@/components/family-design-example";
import release from "@/lib/family-design-release.json";
import "../../../../design/osh-family/osh-family.css";
import "./family-design.css";

export const metadata = {
  title: "OSH Family Design",
  description:
    "OSH AI Hub와 같은 색상·폰트·카드·버튼을 사용하는 공개 디자인 키트. CSS, 한글 폰트, 가이드와 예시 화면을 제공합니다.",
};
const palette = [
  ["주요 행동", "#003876"],
  ["안내 배경", "#E6EFFB"],
  ["브랜드 네이비", "#06264C"],
  ["본문", "#14243D"],
  ["보조 설명", "#52627A"],
  ["카드 테두리", "#D6E0ED"],
  ["페이지 배경", "#F5F8FD"],
  ["작업 카드", "#FFFFFF"],
];
const descriptions: Record<string, string> = {
  kit: "가이드·CSS·예시 HTML·한글 폰트·폰트 라이선스 전체",
  css: "다른 앱에 적용할 공통 스타일 파일",
  guide: "색상·글꼴·박스·버튼 규칙과 AI 작업 지시문",
};
function size(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function FamilyDesignPage() {
  const kit = release.files.find((file) => file.id === "kit")!;
  return (
    <div className="osh-app family-design-page">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="family-intro">
          <div className="osh-actions">
            <span className="osh-badge">디자인 리소스 · 공개</span>
            <span className="osh-badge">v{release.version}</span>
          </div>
          <h1 className="osh-title">OSH Family Design</h1>
          <p className="family-lead">다른 앱도 같은 OSH 디자인으로.</p>
          <p className="osh-copy osh-muted">
            osh.ai.kr의 짙은 파란색, 한글 폰트, 흰 카드와 버튼을 공유하는 공통
            UI 키트입니다. 앱마다 필요한 작업 흐름에 같은 스타일을 적용하세요.
          </p>
          <div className="osh-actions">
            <a className="osh-button" href={kit.url} download={kit.name}>
              전체 키트 다운로드 (ZIP)
            </a>
            <a
              className="osh-button osh-button--secondary"
              href="#family-preview"
            >
              색상·컴포넌트 보기
            </a>
          </div>
          <p className="osh-help">
            {size(kit.bytes)} · 로그인 없이 다운로드 · 공개일{" "}
            {release.published}
          </p>
        </header>
        <section className="osh-section" aria-labelledby="family-howto">
          <h2 id="family-howto" className="osh-heading">
            이렇게 사용하세요
          </h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 키트 받기</h3>
              <p className="osh-copy osh-muted">
                ZIP을 풀고 preview.html을 열어 색상·폰트·컴포넌트를 확인하세요.
                한글 폰트도 함께 들어 있습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 앱에 적용하기</h3>
              <p className="osh-copy osh-muted">
                CSS와 폰트를 로드하고, 적용할 영역에 osh-app 클래스를
                지정하세요. 기존 앱의 기능에 맞춰 화면을 구성합니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. AI에게 전달하기</h3>
              <p className="osh-copy osh-muted">
                키트와 아래 작업 지시문을 전달하세요. 색상·폰트·박스는 공유하고
                메뉴·작업 순서는 앱에 맞게 만듭니다.
              </p>
            </article>
          </div>
        </section>
        <section
          className="osh-section"
          id="family-preview"
          aria-labelledby="family-colors"
        >
          <h2 id="family-colors" className="osh-heading">
            공통 색상
          </h2>
          <div className="family-palette">
            {palette.map(([label, color]) => (
              <div className="family-swatch" key={color}>
                <div
                  className="family-swatch-color"
                  style={{ backgroundColor: color }}
                />
                <div className="family-swatch-text">
                  <strong>{label}</strong>
                  <code>{color}</code>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="osh-section" aria-labelledby="family-components">
          <h2 id="family-components" className="osh-heading">
            폰트와 컴포넌트
          </h2>
          <div className="osh-workspace">
            <FamilyDesignExample />
            <div className="osh-stack">
              <article className="osh-card">
                <h3 className="osh-card-title">Noto Sans KR Variable</h3>
                <p className="osh-copy family-type-sample">
                  읽기 편한 한글, 차분한 작업 화면.
                </p>
                <dl className="family-specs">
                  <div>
                    <dt>본문·입력</dt>
                    <dd>16px · 줄높이 1.7</dd>
                  </div>
                  <div>
                    <dt>카드</dt>
                    <dd>흰색 · 모서리 12px · 안쪽 여백 24px</dd>
                  </div>
                  <div>
                    <dt>버튼·입력창</dt>
                    <dd>모서리 7px · 최소 높이 44px</dd>
                  </div>
                  <div>
                    <dt>모바일</dt>
                    <dd>한 열 배치 · 표 내부 스크롤</dd>
                  </div>
                </dl>
              </article>
              <article className="osh-card osh-stack">
                <span className="osh-badge osh-badge--demo">
                  DEMO · 안내 스타일
                </span>
                <p className="osh-note">
                  안내 예시: 자료를 선택하면 다음 단계를 진행할 수 있습니다.
                </p>
                <p className="osh-note osh-note--error">
                  오류 예시: 파일 형식을 읽을 수 없습니다. 지원 형식을 확인해
                  주세요.
                </p>
                <p className="osh-help">
                  표와 문구는 디자인 확인용 예시입니다. 실제 연구자료 조회나
                  파일 처리를 수행하지 않습니다.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="osh-section" aria-labelledby="family-ai">
          <h2 id="family-ai" className="osh-heading">
            다른 AI에게 전달하기
          </h2>
          <FamilyDesignPrompt />
        </section>
        <section className="osh-section" aria-labelledby="family-downloads">
          <h2 id="family-downloads" className="osh-heading">
            파일 다운로드
          </h2>
          <div className="osh-stack">
            {release.files.map((file) => (
              <article className="osh-card family-download" key={file.id}>
                <div>
                  <h3 className="osh-card-title">{file.name}</h3>
                  <p className="osh-help">
                    {descriptions[file.id]} · {size(file.bytes)}
                  </p>
                  <details className="family-checksum">
                    <summary>SHA-256 확인</summary>
                    <code>{file.sha256}</code>
                  </details>
                </div>
                <a
                  className="osh-button osh-button--secondary"
                  href={file.url}
                  download={file.name}
                >
                  {file.id === "kit"
                    ? "ZIP 다운로드"
                    : file.id === "css"
                      ? "CSS 다운로드"
                      : "가이드 다운로드"}
                </a>
              </article>
            ))}
          </div>
          <p className="osh-help">
            파일은 공개 저장소에서 직접 내려받습니다. 폰트의 SIL Open Font
            License는 ZIP의 fonts/LICENSE에 포함되어 있습니다.
          </p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">적용 범위</h2>
          <p className="osh-copy osh-muted">
            공통 색상·폰트·카드·버튼의 기준을 제공합니다. React·Next.js·일반
            HTML 템플릿 등에 적용할 수 있으며, 기존 앱의 CSS와 모바일 화면을
            확인해 주세요. 인증·자료 접근 권한·API 기능은 각 앱에서 연결합니다.
          </p>
          <p className="osh-help">
            OSH AI Hub 제작 · 버전 {release.version} · 구성 예시는 DEMO로
            표시합니다.
          </p>
        </section>
      </div>
    </div>
  );
}
