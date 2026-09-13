import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Header, Brand } from "@/components/header";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "OSH AI Hub — 더 안전한 내일을 위한 데이터",
    template: "%s | OSH AI Hub",
  },
  description:
    "산업안전보건 데이터, AI 모델, 분석 도구와 API를 연결하는 개방 플랫폼. 현재 디자인 미리보기입니다.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Header />
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
                <Link href="/developers">
                  개발자 문서 <ArrowUpRight size={14} />
                </Link>
                <Link href="/about#data-policy">
                  데이터 이용 안내 <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
            <div className="footer-bottom">
              <span>© 2026 OSH AI Hub</span>
              <span>
                <i className="status-dot" /> 디자인 프리뷰 · 모든 데이터는
                DEMO입니다
              </span>
              <span>Built for safer work.</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
