"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, ArrowUpRight, Search } from "lucide-react";
const links = [
  ["데이터 찾기", "/datasets"],
  ["AI 모델", "/models"],
  ["분석·체험", "/tools"],
  ["개발자 API", "/developers"],
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
}: {
  isAdmin?: boolean;
  loginEnabled?: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
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
                  className={
                    path.startsWith(href) ||
                    (href === "/developers" && path === "/apis")
                      ? "active"
                      : ""
                  }
                >
                  {label}
                </Link>
              ))}
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
              <Link href="/login" className="login-link">
                로그인 <ArrowUpRight size={15} />
              </Link>
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
