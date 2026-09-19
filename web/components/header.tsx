"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, ArrowUpRight, Search } from "lucide-react";
import { AuthSubmit } from "./auth-submit";
const links = [
  ["데이터 찾기", "/datasets"],
  ["AI 모델", "/models"],
  ["분석·체험", "/tools"],
  ["협업", "/collaboration"],
  ["플랫폼 소개", "/about"],
];
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        OSH<span className="brand-light"> AI Hub</span>
        <small>산업안전보건 데이터·AI 플랫폼</small>
      </span>
    </span>
  );
}
export function Header({
  isAdmin = false,
  loginEnabled = false,
  signedIn = false,
}: {
  isAdmin?: boolean;
  loginEnabled?: boolean;
  signedIn?: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const collaborationPath =
    path.startsWith("/collaboration") ||
    path.startsWith("/developers") ||
    path === "/apis" ||
    path === "/datasets/family-design" ||
    path === "/datasets/opendata-guide";
  const activePath = collaborationPath ? "/collaboration" : path;
  return (
    <>
      <a href="#main" className="skip-link">
        본문으로 바로가기
      </a>
      <header className="header">
        <div className="container header-inner">
          <Link
            href="/"
            aria-label="OSH AI Hub 홈"
            onClick={() => setOpen(false)}
          >
            <Brand />
          </Link>
          <nav
            className={open ? "navigation open" : "navigation"}
            aria-label="주 메뉴"
          >
            {links
              .filter(([, href]) => href !== "/models" || isAdmin)
              .map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={
                    activePath.startsWith(href) ? "page" : undefined
                  }
                  className={activePath.startsWith(href) ? "active" : ""}
                >
                  {label}
                </Link>
              ))}
            {loginEnabled && signedIn && (
              <Link
                href="/account"
                className="mobile-account-link"
                onClick={() => setOpen(false)}
                prefetch={false}
              >
                내 계정
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/drafts" onClick={() => setOpen(false)}>
                관리자 초안
              </Link>
            )}
          </nav>
          <div className="header-actions">
            <Link
              href="/datasets"
              className="icon-button desktop-search"
              aria-label="데이터 검색"
            >
              <Search size={20} />
            </Link>
            {loginEnabled && (
              <Link
                href={
                  signedIn
                    ? "/account"
                    : `/login?next=${encodeURIComponent(path)}`
                }
                className={signedIn ? "login-link account-link" : "login-link"}
                prefetch={false}
              >
                {signedIn ? "내 계정" : "로그인"} <ArrowUpRight size={15} />
              </Link>
            )}
            {loginEnabled && signedIn && (
              <form
                action="/auth/logout"
                method="post"
                className="header-logout-form"
              >
                <AuthSubmit className="header-logout" pendingLabel="처리 중…">
                  로그아웃
                </AuthSubmit>
              </form>
            )}
            <button
              className="icon-button menu-toggle"
              aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
