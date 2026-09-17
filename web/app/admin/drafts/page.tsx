import Link from "next/link";
import { PageIntro } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";

export const metadata = {
  title: "관리자 초안",
  robots: { index: false, follow: false },
};
export default async function Drafts() {
  await requireAdmin();
  return (
    <>
      <PageIntro
        eyebrow="ADMIN · DRAFT"
        title="공개 전 검토할 기능"
        description="관리자만 볼 수 있는 초안입니다. 실제 연결과 검증을 완료한 뒤 공개합니다."
      />
      <div className="container section tool-grid">
        {[
          [
            "분석 앱 연결",
            "/tools",
            "직업 코호트·업종별 암발생·R 분석 앱 연결 초안",
          ],
          ["AI 모델 카드", "/models", "DEMO 모델 소개와 데이터 연결 화면"],
          [
            "이미지 AI 체험",
            "/playground",
            "DEMO 이미지 선택 화면 · 실제 추론 미연결",
          ],
          ["이미지 추론 API", "/apis", "API 카탈로그 초안"],
          [
            "개인 API 관리",
            "/account/api-keys",
            "키 발급·사용량 화면 초안 · 실제 발급 미구현",
          ],
        ].map(([title, href, description]) => (
          <article className="tool-card" key={href}>
            <span className="badge">DRAFT · 관리자 전용</span>
            <h2>{title}</h2>
            <p>{description}</p>
            <Link href={href} className="button secondary">
              초안 보기
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
