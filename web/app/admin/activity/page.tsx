import Link from "next/link";
import { PageIntro } from "@/components/ui";
import { ActivityDashboard } from "@/components/activity-dashboard";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "방문·로그인 현황", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function ActivityPage() {
  await requireAdmin();
  return <>
    <PageIntro eyebrow="ADMIN" title="방문·로그인 현황" description="현재 활동과 오늘·누적 방문을 확인합니다. 사용자 정보는 관리자에게만 표시됩니다." />
    <div className="container section">
      <ActivityDashboard />
      <p><Link className="button secondary" href="/admin/drafts">관리자 초안 보기</Link></p>
    </div>
  </>;
}
