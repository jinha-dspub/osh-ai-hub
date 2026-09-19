import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { AuthSubmit } from "@/components/auth-submit";
export const metadata = { title: "내 계정" };
export const dynamic = "force-dynamic";

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Faccount");
  const admin = await isAdmin();
  const params = await searchParams;
  return (
    <section className="section container account-section">
      <div className="account-card">
        <h1>내 계정</h1>
        <p>로그인한 계정과 이용 권한을 확인하세요.</p>
        <dl className="account-details">
          <div>
            <dt>이메일</dt>
            <dd>{user.email || "이메일 정보 없음"}</dd>
          </div>
          <div>
            <dt>이용 권한</dt>
            <dd>{admin ? "관리자" : "일반 회원"}</dd>
          </div>
        </dl>
        <p className="info-note">
          제한된 연구자료의 열람·다운로드에는 별도의 접근 권한이 필요합니다.
        </p>
        {params.error === "logout" && (
          <p role="alert" className="info-note">
            로그아웃을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        <div className="account-actions">
          <Link className="button" href="/datasets">
            데이터 둘러보기
          </Link>
          {admin && (
            <Link className="button secondary" href="/admin/drafts">
              관리자 초안
            </Link>
          )}
          <form method="post" action="/auth/logout">
            <AuthSubmit
              className="button secondary"
              pendingLabel="로그아웃 중…"
            >
              로그아웃
            </AuthSubmit>
          </form>
        </div>
        <p className="account-note">로그아웃은 현재 브라우저에 적용됩니다.</p>
      </div>
    </section>
  );
}
