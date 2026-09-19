import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Database,
  FileText,
  Braces,
  Search,
  Download,
  Palette,
  ChartNoAxesCombined,
} from "lucide-react";
import type { Dataset } from "@/lib/catalog";
export function SearchForm({
  value = "",
  large = false,
}: {
  value?: string;
  large?: boolean;
}) {
  return (
    <form
      action="/datasets"
      className={`search-form ${large ? "large" : ""}`}
      role="search"
    >
      <Search size={large ? 23 : 19} />
      <input
        aria-label="데이터 검색어"
        name="q"
        defaultValue={value}
        placeholder="어떤 산업안전보건 데이터가 필요하신가요?"
      />
      <button type="submit">
        검색 <ArrowRight size={18} />
      </button>
    </form>
  );
}
export function DemoBadge() {
  return <span className="badge demo">DEMO</span>;
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  link = "전체 보기",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="text-link">
          {link} <ArrowUpRight size={18} />
        </Link>
      )}
    </div>
  );
}
export function DatasetArt({
  dataset,
  large = false,
}: {
  dataset: Dataset;
  large?: boolean;
}) {
  return (
    <div
      className={`dataset-art art-${dataset.accent} art-${dataset.kind} ${large ? "art-large" : ""}`}
      aria-hidden="true"
    >
      <span className="art-grid" />
      <span className="art-type">
        {dataset.kind === "guide" ? "OPENDATA STARTER KIT" : dataset.kind === "design"
          ? "OSH FAMILY DESIGN"
          : dataset.kind === "statistics"
          ? "DATA INSIGHT"
          : dataset.kind === "image"
            ? "VISION DATASET"
            : "STRUCTURED KNOWLEDGE"}
      </span>
      {dataset.kind === "guide" ? (
        <div className="art-code"><FileText size={48} /><span>DATA · DOCUMENTS · CODE</span></div>
      ) : dataset.kind === "design" ? (
        <div className="art-code"><Palette size={48} /><span>같은 색상 · 폰트 · 컴포넌트</span><div className="family-art-swatches" aria-hidden="true"><i /><i /><i /><i /></div></div>
      ) : dataset.isReal ? (
        <div className="art-code"><FileText size={56} /><span>COPD · 판정 사례</span><span>원문 · 직종 · 유해인자</span></div>
      ) : dataset.kind === "statistics" ? (
        <>
          <div className="art-bars">
            {[36, 62, 49, 81, 65, 94, 72, 100, 83, 115].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <span className="art-axis">2021 — 2025</span>
          <ChartNoAxesCombined className="art-symbol" />
        </>
      ) : dataset.kind === "image" ? (
        <div className="vision-scene">
          <div className="vision-person">
            <span className="helmet" />
            <span className="person-head" />
            <span className="person-body" />
          </div>
          <div className="vision-box">
            <span>
              {dataset.slug.includes("fire")
                ? "smoke"
                : dataset.slug.includes("forklift")
                  ? "forklift"
                  : "helmet"}
            </span>
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="vision-caption">ANNOTATION PREVIEW</span>
        </div>
      ) : (
        <div className="art-code">
          <span>
            <b>{"{"}</b>
          </span>
          <span>
            &nbsp; &quot;type&quot;: <em>&quot;open_data&quot;</em>,
          </span>
          <span>
            &nbsp; &quot;domain&quot;: <em>&quot;OSH&quot;</em>,
          </span>
          <span>
            &nbsp; &quot;ready&quot;: <em>true</em>
          </span>
          <span>
            <b>{"}"}</b>
          </span>
        </div>
      )}
      <span className="art-format">{dataset.format}</span>
    </div>
  );
}
export function DatasetCard({ dataset: d }: { dataset: Dataset }) {
  return (
    <article className="dataset-card">
      <Link
        href={`/datasets/${d.slug}`}
        className="card-art-link"
        tabIndex={-1}
        aria-hidden="true"
      >
        <DatasetArt dataset={d} />
      </Link>
      <div className="dataset-card-body">
        <div className="card-meta">
          <span>{d.category}</span>
          {d.kind === "guide" ? <span className="badge">공개 제작 양식</span> : d.kind === "design" ? <span className="badge">공개 디자인 키트</span> : d.isReal ? <span className="badge">실제 자료 · 검수 중</span> : <DemoBadge />}
        </div>
        <h3>
          <Link href={`/datasets/${d.slug}`}>{d.title}</Link>
        </h3>
        <p>{d.description}</p>
        <div className="tags">
          {d.tags.slice(0, 2).map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
        <div className="card-bottom">
          <span>
            <Database size={13} /> {d.kind === "guide" ? "가이드 · 양식 · AI 지시문" : d.kind === "design" ? "CSS · 폰트 · 가이드" : d.isReal ? "연구자료 · 내부 검토" : "예제 자료"}
          </span>
          <span>
            {d.api && <b>API</b>}
            {d.ai && <b>AI 학습</b>}
            <ArrowUpRight size={16} />
          </span>
        </div>
      </div>
    </article>
  );
}
export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-intro">
      <div className="container">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
    </section>
  );
}
export function Breadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="breadcrumb" aria-label="현재 위치">
      <Link href="/">홈</Link>
      {items.map((item, i) => (
        <span key={i}>
          /{" "}
          {item.href ? (
            <Link href={item.href}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
export function EmptyState({
  title = "조건에 맞는 데이터가 없어요",
  description = "검색어를 바꾸거나 필터를 초기화해 보세요.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <Search size={36} />
      <h3>{title}</h3>
      <p>{description}</p>
      <Link href="/datasets" className="button secondary">
        전체 데이터 보기 <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function DataTable({ dataset }: { dataset: Dataset }) {
  const keys = dataset.variables.map((v) => v.name);
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="데이터 샘플"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            {keys.map((k) => (
              <th scope="col" key={k}>
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.sample.map((row, i) => (
            <tr key={i}>
              <td className="muted">{String(i + 1).padStart(2, "0")}</td>
              {keys.map((k) => (
                <td key={k}>{row[k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export const resourceIcons = {
  data: Database,
  file: FileText,
  api: Braces,
  download: Download,
};
