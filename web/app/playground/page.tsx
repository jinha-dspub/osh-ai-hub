import { requireAdmin } from "@/lib/admin";
import { PageIntro } from "@/components/ui";
import { Playground } from "@/components/playground";
export const metadata = { title: "AI Playground" };
export default async function PlaygroundPage() {
  await requireAdmin();
  return (
    <>
      <PageIntro
        eyebrow="AI PLAYGROUND"
        title="이미지에서 발견하는 새로운 가능성"
        description="AI 체험의 입력과 결과 화면을 미리 살펴보세요."
      />
      <div className="container section">
        <div className="info-note">
          디자인 프리뷰입니다. 실제 추론이나 위험 판정은 실행하지 않습니다.
        </div>
        <Playground />
      </div>
    </>
  );
}
