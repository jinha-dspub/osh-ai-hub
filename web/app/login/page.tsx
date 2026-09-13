import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/header";
import { authConfigured } from "@/lib/auth";
export const metadata = { title: "로그인" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ready = authConfigured();
  const error = (await searchParams).error;
  return (
    <section className="login-section">
      <div className="login-card">
        <Brand />
        <h1>새로운 발견을 시작하세요</h1>
        <p>
          하나의 계정으로 데이터를 모으고,
          <br />
          API를 연결하고, 연구의 가능성을 넓히세요.
        </p>
        <form action="/auth/google" method="post">
          <button type="submit" className="google-button" disabled={!ready}>
            <span className="google-g" aria-hidden="true">
              G
            </span>
            Google로 계속하기
          </button>
        </form>
        {!ready && (
          <div className="info-note">
            Google 로그인을 준비 중입니다. 지금은 로그인 없이 공개 예제 데이터를
            탐색하고 샘플 API를 실행할 수 있어요.
          </div>
        )}
        {error && (
          <div className="info-note" role="alert">
            로그인을 완료하지 못했습니다. 다시 시도해 주세요.
          </div>
        )}
        <p className="login-footnote">
          현재는 디자인 프리뷰입니다.
          <br />
          회원 기능과 데이터 제공 정책은 정식 공개 전에 안내합니다.
        </p>
        <Link href="/datasets" className="text-link">
          <ArrowLeft size={13} /> 로그인 없이 데이터 둘러보기
        </Link>
      </div>
    </section>
  );
}
