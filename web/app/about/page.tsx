import Link from "next/link";
import { PageIntro } from "@/components/ui";
export const metadata = { title: "플랫폼 소개" };
export default function About() {
  return (
    <>
      <PageIntro
        eyebrow="ABOUT OSH AI HUB"
        title="열린 데이터로, 더 안전한 일의 미래"
        description="데이터와 연구, 기술과 현장을 연결하는 산업안전보건 플랫폼을 만듭니다."
      />
      <div className="container">
        <article className="prose">
          <span className="badge teal">DESIGN PREVIEW · 2026.09</span>
          <h2>산업안전보건 데이터의 연결점</h2>
          <p>
            OSH AI Hub는 데이터 검색, 파일 다운로드, AI 모델, Open API와 분석
            도구를 한곳에서 활용할 수 있도록 기존 osh.ai.kr을 새롭게 만드는
            프로젝트입니다.
          </p>
          <p>
            연구자가 자료를 발견하고 의미를 이해하며, 개발자가 자신의 서비스에
            연결하고, 현장 실무자가 분석 도구로 결과를 살펴보는 경험을 목표로
            합니다.
          </p>
          <h2>지금 살펴볼 수 있는 기능</h2>
          <ul>
            <li>12개 합성 예제 데이터 검색과 필터</li>
            <li>변수 설명, 샘플 미리보기와 CSV 다운로드</li>
            <li>브라우저에서 실제로 호출하는 공개 샘플 API</li>
            <li>모델 카드, 개인 API 관리와 AI 체험 화면의 디자인</li>
            <li>기존 산업안전보건 분석 도구의 소개 화면 (연결 준비 중)</li>
          </ul>
          <h2 id="data-policy">데이터 이용 안내</h2>
          <p>
            현재 자료는 UI와 API의 동작 확인을 위해 만든 합성 예제입니다. 실제
            기관 통계, 의료 정보, 검증된 모델 성능을 의미하지 않습니다. 연구
            결과나 현장 판단의 근거로 사용하지 마세요.
          </p>
          <p>
            예제는 플랫폼 동작 확인과 교육에 사용할 수 있습니다. 실제 자료는
            출처, 라이선스, 공개 가능 여부와 버전을 검수한 뒤 별도로 등록합니다.
          </p>
          <h2>로그인과 개인정보</h2>
          <p>
            Google 로그인을 기본 인증 방식으로 준비하고 있습니다. 현재 인증
            서비스가 설정되지 않은 상태에서는 회원가입이 이루어지지 않습니다.
            API 키 발급과 개인 사용량 관리, 관리자 기능은 후속 단계에서
            연결합니다.
          </p>
          <p>
            AI 체험에서 선택한 이미지는 브라우저 안에서만 미리보기로 표시되며
            서버로 업로드하지 않습니다. 현재 사이트의 서버 접근 로그와 로그인
            연동 이후의 처리 방침은 정식 공개 전에 운영 환경에 맞게 정리합니다.
          </p>
          <div className="content-actions">
            <Link href="/datasets" className="button">
              데이터 둘러보기
            </Link>
            <Link href="/developers" className="button secondary">
              개발자 문서
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
