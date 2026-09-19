import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/header";
import { AuthSubmit } from "@/components/auth-submit";
import { authConfigured, currentUser, safeReturnPath } from "@/lib/auth";
export const metadata = { title: "로그인" };
export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; logged_out?: string }>;
}) {
  const ready = authConfigured();
  const params = await searchParams;
  const next = safeReturnPath(params.next ?? null);
  if (await currentUser()) redirect(next);
  const message =
    params.error === "cancelled"
      ? "Google 로그인이 취소되었습니다. 원하실 때 다시 시작해 주세요."
      : "로그인을 완료하지 못했습니다. Google로 계속하기를 눌러 다시 시도해 주세요.";
  return (
    <section className="login-section">
      <div className="login-card">
        <Brand />
        <h1>OSH AI Hub 로그인</h1>
        <p>
          Google 계정으로 시작하세요.
          <br />
          Gmail과 Google Workspace 계정을 사용할 수 있습니다.
        </p>
        {params.logged_out === "1" && (
          <div className="info-note" role="status">
            이 브라우저에서 로그아웃했습니다.
          </div>
        )}
        {params.error && (
          <div className="info-note" role="alert">
            {message}
          </div>
        )}
        <form action="/auth/google" method="post">
          <input type="hidden" name="next" value={next} />
          <AuthSubmit
            className="google-button"
            disabled={!ready}
            pendingLabel="Google로 이동 중…"
          >
            Google로 계속하기
          </AuthSubmit>
        </form>
        {!ready && (
          <div className="info-note">
            Google 로그인을 준비 중입니다. 공개 자료 소개는 로그인 없이 살펴볼
            수 있습니다.
          </div>
        )}
        <p className="login-footnote">
          로그인에는 Google 계정의 기본 프로필과 이메일을 사용합니다. 메일함이나
          Drive 파일 접근 권한은 요청하지 않습니다.
        </p>
        <Link href="/datasets" className="text-link">
          <ArrowLeft size={16} /> 로그인 없이 데이터 둘러보기
        </Link>
      </div>
    </section>
  );
}
