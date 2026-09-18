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
      <Link href="/datasets" className="text-link">
        <ArrowLeft size={15} /> 데이터 목록으로
      </Link>
      <header className="copd-heading">
        <div className="copd-labels">
          <span className="badge">산업보건 · 한국어</span>
          <span className="badge">실제 자료 · 검수 중</span>
          <span className="badge">데이터 소개</span>
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
      <section className="copd-start" aria-labelledby="copd-start-title">
        <div>
          <span className="badge demo">검색 DEMO</span>
          <h2 id="copd-start-title">실제 사례를 직접 찾아보세요</h2>
          <p>이 페이지에서는 자료의 구성과 활용 방법을 안내합니다. 검색 DEMO를 열면 직종·유해인자로 사례를 찾고 원문을 읽을 수 있습니다.</p>
          <Link href="/demo/copd/" className="button">COPD 검색 DEMO 열기 →</Link>
          <p className="copd-caption">검색·원문 열람·다운로드는 별도 검토 화면에서 제공합니다. 접근 인증이 필요할 수 있습니다.</p>
        </div>
        <div className="copd-howto">
          <h3>이렇게 활용하세요</h3>
          <ol>
            <li><strong>검색 조건 정하기</strong><span>직종이나 유해인자를 입력하고 청구 연도·판정 조건으로 범위를 좁힙니다.</span></li>
            <li><strong>원문과 가공 정보 비교하기</strong><span>사례를 열어 판정문, AI 요약·라벨, 노출 측정치를 함께 확인합니다.</span></li>
            <li><strong>연구자료 내려받기</strong><span>DEMO의 파일·활용법에서 원본 ZIP이나 CSV를 받아 분석에 활용합니다.</span></li>
          </ol>
        </div>
      </section>
      <CopdExplorer
        enabled={internalCopdEnabled()}
        initialFilters={initialFilters}
      />
    </div>
  );
}
