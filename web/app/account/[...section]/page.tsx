import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import {
  KeyRound,
  ChartNoAxesCombined,
  LockKeyhole,
  ShieldCheck,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { PageIntro } from "@/components/ui";
import { notFound } from "next/navigation";
export const metadata = { title: "내 API 워크스페이스" };
export default async function Account({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  await requireAdmin();
  const segments = (await params).section ?? [];
  if (
    segments.length > 1 ||
    (segments.length === 1 && !["api-keys", "usage"].includes(segments[0]))
  )
    notFound();
  const usage = segments[0] === "usage";
  return (
    <>
      <PageIntro
        eyebrow="MY WORKSPACE"
        title="연구와 개발을 위한 나의 공간"
        description="API 키와 사용량을 한곳에서 관리하세요."
      />
      <div className="container account-layout">
        <nav className="account-menu" aria-label="내 계정">
          <Link className={!usage ? "active" : ""} href="/account/api-keys">
            <KeyRound size={17} /> API 키 관리
          </Link>
          <Link className={usage ? "active" : ""} href="/account/usage">
            <ChartNoAxesCombined size={17} /> API 사용량
          </Link>
        </nav>
        <div>
          <div className="account-title">
            <h2>{usage ? "API 사용량" : "API 키 관리"}</h2>
            <button
              className="button"
              disabled
              title="회원 API 기능은 준비 중입니다"
            >
              <Plus size={15} /> 새 API 키
            </button>
          </div>
          <p className="muted">
            개인 API 기능을 준비하고 있습니다. 아래는 관리 화면 미리보기입니다.
          </p>
          <div className="metric-grid">
            <div className="metric">
              <span>활성 API 키</span>
              <strong>—</strong>
              <small>계정 연결 후 제공</small>
            </div>
            <div className="metric">
              <span>이번 달 호출</span>
              <strong>—</strong>
              <small>아직 집계하지 않음</small>
            </div>
            <div className="metric">
              <span>사용 가능 한도</span>
              <strong>—</strong>
              <small>운영 정책 준비 중</small>
            </div>
          </div>
          <div className="locked-state">
            <span className="locked-icon">
              <LockKeyhole size={27} />
            </span>
            <h3>개인 API 워크스페이스를 준비 중이에요</h3>
            <p>
              Google 로그인과 개인 키 발급 기능이 연결되면 API 키를 만들고
              사용량을 확인할 수 있습니다. 공개 샘플 API는 지금 바로 사용할 수
              있어요.
            </p>
            <Link href="/developers#try-api" className="button">
              샘플 API 실행하기 <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="account-tip">
            <ShieldCheck size={21} />
            <span>
              API 키는 발급 직후 한 번만 표시하고, 권한·만료·폐기를 관리하도록
              설계합니다. 현재 화면에서는 키를 발급하거나 계정 사용량을 수집하지
              않습니다.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
