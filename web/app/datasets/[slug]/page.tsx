import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Download, FileSpreadsheet, Braces } from "lucide-react";
import { datasets, findDataset, sampleCsv } from "@/lib/catalog";
import { Breadcrumb, DemoBadge, DataTable, DatasetCard } from "@/components/ui";
const tabs = [
  ["overview", "소개"],
  ["preview", "미리보기"],
  ["files", "파일 다운로드"],
  ["api", "API 활용"],
  ["related", "관련 자료·도구"],
];
export function generateStaticParams() {
  return datasets.map((d) => ({ slug: d.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const d = findDataset((await params).slug);
  return { title: d?.title ?? "데이터를 찾을 수 없습니다" };
}
export default async function DatasetDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const d = findDataset((await params).slug);
  if (!d) notFound();
  const requested = (await searchParams).tab;
  const tab = tabs.some(([id]) => id === requested) ? requested : "overview";
  const related = datasets
    .filter((r) => r.slug !== d.slug && r.category === d.category)
    .slice(0, 2);
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { label: "데이터 찾기", href: "/datasets" },
          { label: d.title },
        ]}
      />
      <div className="detail-heading">
        <div>
          <div className="tags">
            <span>{d.category}</span>
            <DemoBadge />
            {d.api && <span>샘플 API</span>}
          </div>
          <h1>{d.title}</h1>
          <p>{d.description}</p>
          <div className="detail-meta">
            <span>
              <b>제공</b>OSH AI Hub 예제
            </span>
            <span>
              <b>갱신일</b>
              {d.updated}
            </span>
            <span>
              <b>버전</b>demo-1.0
            </span>
          </div>
        </div>
        <Link href={`/datasets/${d.slug}?tab=files`} className="button">
          <Download size={16} /> 샘플 다운로드
        </Link>
      </div>
      <nav className="detail-tabs" aria-label="데이터 상세 메뉴">
        {tabs.map(([id, label]) => (
          <Link
            key={id}
            href={`/datasets/${d.slug}?tab=${id}`}
            scroll={false}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="detail-layout">
        <div className="detail-content">
          <div className="info-note">
            <strong>DEMO · 실제 연구·판단에 사용할 수 없는 예제입니다.</strong>
            <br />
            표의 값과 사례는 화면 및 API 동작 확인을 위해 만든 합성 자료입니다.
            실제 기관 통계나 학습 이미지를 제공하지 않습니다.
          </div>
          {tab === "overview" && (
            <>
              <section className="detail-block">
                <h2>데이터 소개</h2>
                <p>
                  {d.description} 이 자료를 통해 데이터 탐색부터 샘플 다운로드,
                  API 활용까지의 흐름을 확인할 수 있습니다.
                </p>
                <h3>이 데이터로 할 수 있는 일</h3>
                <p>
                  변수와 파일 구조를 확인하고 샘플을 분석 코드에서 읽어볼 수
                  있습니다. 실제 분석에 사용하려면 검수된 원자료와 출처, 이용
                  조건이 필요합니다.
                </p>
              </section>
              <section className="detail-block">
                <h2>
                  미리보기{" "}
                  <span className="badge">{d.sample.length}개 샘플 행</span>
                </h2>
                <DataTable dataset={d} />
              </section>
              <section className="detail-block">
                <h2>변수 설명</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>변수명</th>
                        <th>설명</th>
                        <th>단위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.variables.map((v) => (
                        <tr key={v.name}>
                          <td>
                            <code>{v.name}</code>
                          </td>
                          <td>{v.description}</td>
                          <td>{v.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <h2>인용 안내</h2>
              <div className="citation">
                OSH AI Hub. {d.title}. DEMO, version demo-1.0, 2026.
                교육·인터페이스 테스트용 합성 자료.
              </div>
            </>
          )}
          {tab === "preview" && (
            <>
              <h2>샘플 데이터 미리보기</h2>
              <p>
                전체 샘플 {d.sample.length}행을 표시합니다. 이미지형 데이터는
                라벨 메타데이터만 제공됩니다.
              </p>
              <DataTable dataset={d} />
              <div className="content-actions">
                <a href={`/api/samples/${d.slug}`} className="button secondary">
                  <Download size={16} /> CSV 받기
                </a>
                {d.api && (
                  <Link
                    href={`/developers?dataset=${d.slug}#try-api`}
                    className="text-link"
                  >
                    API로 조회하기 <ArrowUpRight size={16} />
                  </Link>
                )}
              </div>
            </>
          )}
          {tab === "files" && (
            <>
              <h2>다운로드할 수 있는 파일</h2>
              <p>
                회원가입 없이 샘플을 내려받을 수 있습니다. 파일에 담긴 모든 값은
                합성 자료입니다.
              </p>
              <div className="file-row">
                <FileSpreadsheet size={29} />
                <div>
                  <h3>{d.slug}-DEMO.csv</h3>
                  <p>
                    CSV · {new TextEncoder().encode(sampleCsv(d)).length + 3}{" "}
                    bytes · {d.sample.length}행 · demo-1.0
                  </p>
                </div>
                <a href={`/api/samples/${d.slug}`} className="button secondary">
                  <Download size={14} /> 다운로드
                </a>
              </div>
              {d.format === "IMAGE" && (
                <div className="info-note">
                  현재는 이미지 파일명과 라벨을 담은 메타데이터만 제공합니다.
                  실제 이미지 묶음은 아직 등록되지 않았습니다.
                </div>
              )}
              <h3>파일 무결성</h3>
              <p>
                다운로드 응답의{" "}
                <code className="inline-code">X-Checksum-SHA256</code> 헤더에서
                파일 해시를 확인할 수 있습니다.
              </p>
            </>
          )}
          {tab === "api" &&
            (d.api ? (
              <>
                <h2>샘플 데이터를 API로 가져오세요</h2>
                <p>이 엔드포인트는 로그인 없이 공개 예제 행을 반환합니다.</p>
                <div className="endpoint">
                  <span>GET</span>
                  <code>/openapi/v1/statistics/{d.slug}</code>
                </div>
                <div className="code-panel">
                  <pre>{`fetch('/openapi/v1/statistics/${d.slug}')\n  .then(response => response.json())\n  .then(result => console.log(result.data));`}</pre>
                </div>
                <Link
                  href={`/developers?dataset=${d.slug}#try-api`}
                  className="button"
                >
                  <Braces size={16} /> 문서에서 직접 실행
                </Link>
              </>
            ) : (
              <>
                <h2>이 자료는 파일로 이용할 수 있습니다</h2>
                <p>이미지 메타데이터는 DEMO 샘플 파일로 확인할 수 있습니다.</p>
                <Link
                  href={`/datasets/${d.slug}?tab=files`}
                  className="button secondary"
                >
                  샘플 파일 보기
                </Link>
              </>
            ))}
          {tab === "related" && (
            <>
              <h2>함께 살펴볼 자료</h2>
              {related.length ? (
                <div
                  className="dataset-grid"
                  style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}
                >
                  {related.map((r) => (
                    <DatasetCard key={r.slug} dataset={r} />
                  ))}
                </div>
              ) : (
                <p>이 분야의 관련 자료를 준비하고 있습니다.</p>
              )}
              <div className="content-actions">
                <Link href="/tools" className="button secondary">
                  분석 도구 살펴보기
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </>
          )}
        </div>
        <aside className="detail-aside">
          <div className="aside-card">
            <h3>데이터 한눈에 보기</h3>
            <dl>
              <div>
                <dt>자료 유형</dt>
                <dd>{d.format}</dd>
              </div>
              <div>
                <dt>기준연도</dt>
                <dd>{d.year} (가상)</dd>
              </div>
              <div>
                <dt>샘플 행</dt>
                <dd>{d.sample.length}행</dd>
              </div>
              <div>
                <dt>접근 범위</dt>
                <dd>공개 예제</dd>
              </div>
              <div>
                <dt>이용 조건</dt>
                <dd>테스트·교육용</dd>
              </div>
              <div>
                <dt>실제 원자료</dt>
                <dd>미제공</dd>
              </div>
            </dl>
            <Link href="/developers" className="button secondary">
              <Braces size={14} /> 개발자 가이드
            </Link>
          </div>
          <div className="aside-card">
            <h3>버전 이력</h3>
            <div className="version-item">
              <b>
                demo-1.0 <span className="badge teal">최신</span>
              </b>
              {d.updated}
              <p>디자인 프리뷰용 샘플 등록</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
