import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  visibleDatasets,
  categories,
  filterDatasets,
  type CatalogFilters,
} from "@/lib/catalog";
import {
  PageIntro,
  SearchForm,
  DatasetCard,
  EmptyState,
} from "@/components/ui";
export const metadata = { title: "데이터 찾기" };
export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const f: CatalogFilters = {};
  for (const key of ["q", "category", "format", "ai", "api", "sort"] as const) {
    const value = params[key];
    if (typeof value === "string") f[key] = value;
  }
  const admin = await isAdmin();
  const datasets = visibleDatasets(admin);
  const results = filterDatasets(f, datasets);
  const active = Object.entries(f).filter(
    ([key, value]) => value && key !== "sort" && value !== "전체",
  );
  return (
    <>
      <PageIntro
        eyebrow="DATA EXPLORER"
        title="데이터에서 답을 찾아보세요"
        description="연구와 현장에 필요한 데이터를 찾고 출처와 활용 방법을 살펴보세요."
      >
        <SearchForm value={f.q} />
      </PageIntro>
      <div className="container catalog-layout">
        <form action="/datasets" className="filter-sidebar">
          <div className="filter-title">
            <strong>
              <SlidersHorizontal size={14} /> 검색 필터
            </strong>
            <Link href="/datasets">
              <RotateCcw size={11} /> 초기화
            </Link>
          </div>
          {f.q && <input type="hidden" name="q" value={f.q} />}
          <fieldset className="filter-group">
            <legend>분야</legend>
            {categories
              .filter(
                (c) => c === "전체" || datasets.some((d) => d.category === c),
              )
              .map((c) => (
                <label key={c}>
                  <input
                    type="radio"
                    name="category"
                    value={c}
                    defaultChecked={(f.category || "전체") === c}
                  />
                  {c}
                  <span>
                    {c === "전체"
                      ? datasets.length
                      : datasets.filter((d) => d.category === c).length}
                  </span>
                </label>
              ))}
          </fieldset>
          <fieldset className="filter-group">
            <legend>데이터 형식</legend>
            {[
              ["", "전체 형식"],
              ["CSV", "CSV · 표 데이터"],
              ["JSON", "JSON · 구조화 데이터"],
              ["IMAGE", "이미지 메타데이터"],
              ["ZIP", "ZIP · 압축 파일"],
            ]
              .filter(
                ([value]) =>
                  !value ||
                  datasets.some((dataset) => dataset.format === value),
              )
              .map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="format"
                    value={value}
                    defaultChecked={(f.format || "") === value}
                  />
                  {label}
                </label>
              ))}
          </fieldset>
          {admin && (
            <>
              <fieldset className="filter-group">
                <legend>활용 방식</legend>
                <label>
                  <input
                    type="checkbox"
                    name="api"
                    value="true"
                    defaultChecked={f.api === "true"}
                  />
                  샘플 API 제공
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="ai"
                    value="true"
                    defaultChecked={f.ai === "true"}
                  />
                  AI 학습 데이터 예제
                </label>
              </fieldset>
            </>
          )}
          <button className="button small full-width" type="submit">
            필터 적용
          </button>
        </form>
        <div className="catalog-results">
          {(!f.category ||
            f.category === "전체" ||
            f.category === "산업보건") && (
            <div className="info-note teal-note">
              <strong>산재 판정사례 · 7개 질환군</strong>
              <p>61,566개 사례의 질환별 소개·검색·검증 현황을 살펴보세요.</p>
              <Link href="/datasets/sanje" className="text-link">
                질환별 자료 보기 →
              </Link>
            </div>
          )}
          <div className="catalog-top">
            <span>
              {f.q && <>‘{f.q}’ 검색 결과 · </>}전체{" "}
              <strong>{results.length}</strong>개{" "}
              <span className="muted">
                데이터{admin ? " · 관리자 예제 포함" : ""}
              </span>
            </span>
            <form action="/datasets">
              {Object.entries(f)
                .filter(([k]) => k !== "sort")
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <select
                name="sort"
                aria-label="정렬 방식"
                defaultValue={f.sort || "updated"}
              >
                <option value="updated">최근 업데이트순</option>
                <option value="title">이름순</option>
              </select>{" "}
              <button className="button small secondary" type="submit">
                정렬
              </button>
            </form>
          </div>
          {active.length > 0 && (
            <div className="active-filters">
              {active.map(([key, value]) => {
                const next = new URLSearchParams(
                  Object.entries(f).filter(([k, v]) => k !== key && v),
                );
                return (
                  <Link
                    key={key}
                    href={`/datasets?${next}`}
                    aria-label={`${key === "ai" ? "AI 학습" : key === "api" ? "API" : value} 필터 해제`}
                  >
                    {key === "ai" ? "AI 학습" : key === "api" ? "API" : value}
                    <X size={11} />
                  </Link>
                );
              })}
            </div>
          )}
          {results.length ? (
            <div className="dataset-grid">
              {results.map((d) => (
                <DatasetCard dataset={d} key={d.slug} />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </>
  );
}
