import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Header, Brand } from "@/components/header";
import "./globals.css";
import { isAdmin } from "@/lib/admin";
import { authConfigured, currentUser } from "@/lib/auth";
export const metadata: Metadata = {
  title: {
    default: "OSH AI Hub — 더 안전한 내일을 위한 데이터",
    template: "%s | OSH AI Hub",
  },
  description:
    "산업안전보건 데이터, AI 모델, 분석 도구와 API를 연결하는 개방 플랫폼. 현재 디자인 미리보기입니다.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Header
          isAdmin={await isAdmin()}
          loginEnabled={authConfigured()}
          signedIn={Boolean(await currentUser())}
        />
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="container">
            <div className="footer-top">
              <Link href="/">
                <Brand />
              </Link>
              <p>
                열린 데이터로 연결하는
                <br />더 안전한 일의 미래.
              </p>
              <div>
                <Link href="/about">
                  플랫폼 소개 <ArrowUpRight size={14} />
                </Link>
                <Link href="/collaboration">
                  협업 안내 <ArrowUpRight size={14} />
                </Link>
                <Link href="/about#data-policy">
                  데이터 이용 안내 <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
            <p className="footer-operator">
              개발·운영: <a href="https://yioh.ai.kr">연세대학교 산업보건연구소</a>
              {" "}소속 <strong>Team SHIELD</strong>
            </p>
            <div className="footer-bottom">
              <span>© 2026 OSH AI Hub</span>
              <span>
                <i className="status-dot" /> 예시 자료는 DEMO로 표시 · 실제
                자료는 공개 상태 확인
              </span>
              <span>Built for safer work.</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
