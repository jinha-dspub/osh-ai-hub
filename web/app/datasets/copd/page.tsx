import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CopdExplorer } from "@/components/copd-explorer";
import { internalCopdEnabled } from "@/lib/copd-access";
import "./copd.css";

export const metadata = { title: "COPD 산재 판정 사례" };
export const dynamic = "force-dynamic";
export default async function CopdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialFilters: Record<string, string> = {};
  for (const key of ["q", "mode", "year", "approval", "occupation", "qa"]) {
    const value = params[key];
    if (typeof value === "string") initialFilters[key] = value;
  }
  return (
    <div className="container copd-page">
      <Link href="/tools" className="text-link">
        <ArrowLeft size={15} /> 분석·체험으로
      </Link>
      <header className="copd-heading">
        <div className="copd-labels">
          <span className="badge">산업보건 · 한국어</span>
          <span className="badge">실제 자료 · 검수 중</span>
          <span className="badge demo">DEMO 검색 인터페이스</span>
        </div>
        <h1>COPD 산재 판정 사례</h1>
        <p>
          직종과 노출 맥락으로 사례를 찾고, 원문과 AI 가공 정보를 함께
          살펴보세요.
        </p>
        <div className="copd-metrics">
          <span>
            <strong>2,082</strong>사례
          </span>
          <span>
            <strong>2016–2021</strong>청구 연도
          </span>
          <span>
            <strong>646</strong>측정치 · 79개 사례
          </span>
        </div>
        <p className="copd-caption">
          2026-09-17 반입 파일 집계 · 연구용 초안 · 원문 및 가공 라벨의 공개
          범위 검토 중
        </p>
      </header>
      <Link href="/demo/copd/" className="button" style={{ marginBottom: 24 }}>
        COPD 검색 DEMO 열기 →
      </Link>
      <CopdExplorer
        enabled={internalCopdEnabled()}
        showDrafts={await isAdmin()}
        initialFilters={initialFilters}
      />
    </div>
  );
}
