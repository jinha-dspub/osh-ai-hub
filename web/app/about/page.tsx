import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { PageIntro } from "@/components/ui";
export const metadata = { title: "플랫폼 소개" };
export default async function About() {
  const admin = await isAdmin();
  return (
    <>
      <PageIntro
        eyebrow="ABOUT OSH AI HUB"
        title="열린 데이터로, 더 안전한 일의 미래"
        description="데이터와 연구, 기술과 현장을 연결하는 산업안전보건 플랫폼을 만듭니다."
      />
      <div className="container">
        <article className="prose">
          <span className="badge teal">OSH AI HUB</span>
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
            <li>COPD 산재 판정 사례 소개와 데이터 탐색</li>
            <li>자료 미리보기와 활용 방법, 협업용 제작·디자인 템플릿</li>
            <li>브라우저에서 실제로 호출하는 공개 샘플 API</li>
            <li>한글 변환기, 건강검진 확인과 COPD 사례 검색 도구 바로가기</li>
            {admin && <li>관리자 전용 모델·분석 앱·API 관리 초안</li>}
          </ul>
          <h2 id="data-policy">데이터 이용 안내</h2>
          <p>
            DEMO로 표시한 자료는 UI와 API의 동작 확인을 위해 만든 합성
            예제입니다. 실제 기관 통계, 의료 정보, 검증된 모델 성능을 의미하지
            않습니다. 연구 결과나 현장 판단의 근거로 사용하지 마세요.
          </p>
          <p>
            예제는 플랫폼 동작 확인과 교육에 사용할 수 있습니다. 실제 자료는
            출처, 라이선스, 공개 가능 여부와 버전을 검수한 뒤 별도로 등록합니다.
          </p>
          <div className="content-actions">
            <Link href="/datasets" className="button">
              데이터 둘러보기
            </Link>
            <Link href="/collaboration" className="button secondary">
              협업 안내
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
