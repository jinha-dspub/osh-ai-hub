import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageIntro } from "@/components/ui";
import { CodeExamples, ApiExplorer } from "@/components/api-explorer";
import { datasets, findDataset } from "@/lib/catalog";
export const metadata = { title: "개발자 API" };
export default async function Developers({
  searchParams,
}: {
  searchParams: Promise<{ dataset?: string }>;
}) {
  const admin = await isAdmin();
  const selected = findDataset((await searchParams).dataset ?? "");
  const slug = selected?.api ? selected.slug : "industrial-accidents";
  return (
    <>
      <PageIntro
        eyebrow="FOR DEVELOPERS"
        title="데이터를 당신의 프로젝트 안으로"
        description="API를 탐색하고, 샘플을 실행하고, 몇 줄의 코드로 시작하세요."
      />
      <div className="container developer-layout">
        <nav className="docs-nav" aria-label="개발자 문서">
          <h3>GET STARTED</h3>
          <a className="active" href="#quickstart">
            빠른 시작
          </a>
          <a href="#try-api">API 직접 실행</a>
          <a href="#reference">요청 매개변수</a>
          <h3>API REFERENCE</h3>
          <Link href="/apis">API 카탈로그</Link>
          <a href="#authentication">인증과 API 키</a>
          <a href="#errors">오류 처리</a>
          <a href="/openapi.json" target="_blank" rel="noreferrer">
            OpenAPI 명세 ↗
          </a>
          {admin && (
            <>
              <h3>MY WORKSPACE · DRAFT</h3>
              <Link href="/account/api-keys">내 API 키</Link>
              <Link href="/account/usage">사용량</Link>
            </>
          )}
        </nav>
        <div className="docs-content">
          <section id="quickstart">
            <span className="badge teal">PUBLIC SAMPLE API · v1</span>
            <h2 style={{ marginTop: 15 }}>첫 번째 API 호출</h2>
            <p>키 없이 공개 DEMO 샘플을 호출해 응답 구조를 확인하세요.</p>
            <div className="steps">
              <div className="step">
                <b>01</b>
                <h3>데이터 선택</h3>
                <p>필요한 예제 자료를 고르세요.</p>
              </div>
              <div className="step">
                <b>02</b>
                <h3>샘플 호출</h3>
                <p>아래 실행 버튼으로 응답을 확인하세요.</p>
              </div>
              <div className="step">
                <b>03</b>
                <h3>프로젝트에 연결</h3>
                <p>Python·R·curl 예제를 활용하세요.</p>
              </div>
            </div>
            <div className="endpoint">
              <span>GET</span>
              <code>/openapi/v1/statistics/{slug}</code>
            </div>
            <CodeExamples slug={slug} />
          </section>
          <section id="try-api">
            <h2>브라우저에서 직접 실행</h2>
            <p>
              현재 사이트의 실제 샘플 API를 호출합니다. 응답의{" "}
              <code className="inline-code">is_demo: true</code>를 확인하세요.
            </p>
            <ApiExplorer
              initialSlug={slug}
              options={datasets
                .filter((d) => d.api)
                .map((d) => ({ slug: d.slug, title: d.title }))}
            />
          </section>
          <section id="reference">
            <h2>요청 매개변수</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>형식</th>
                    <th>기본값</th>
                    <th>설명</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>page</code>
                    </td>
                    <td>integer</td>
                    <td>1</td>
                    <td>페이지 번호 · 1~100000</td>
                  </tr>
                  <tr>
                    <td>
                      <code>limit</code>
                    </td>
                    <td>integer</td>
                    <td>10</td>
                    <td>페이지 크기 · 1~100</td>
                  </tr>
                  <tr>
                    <td>
                      <code>year</code>
                    </td>
                    <td>string</td>
                    <td>없음</td>
                    <td>year 변수가 있는 자료의 연도 필터</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 15 }}>
              카탈로그 API는{" "}
              <code className="inline-code">
                q, category, format, ai, api, sort
              </code>{" "}
              필터도 지원합니다.
            </p>
          </section>
          <section id="authentication">
            <h2>인증과 API 키</h2>
            <div className="info-note teal-note">
              공개 합성 DEMO API는 로그인이나 API 키 없이 호출할 수 있습니다.
            </div>
            {admin && (
              <Link href="/account/api-keys" className="text-link">
                API 키 관리 초안 <ArrowUpRight size={16} />
              </Link>
            )}
          </section>
          <section id="errors">
            <h2>오류 처리</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>상태</th>
                    <th>의미</th>
                    <th>다음 행동</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>400</td>
                    <td>잘못된 매개변수</td>
                    <td>필터 지원 여부와 정수 범위를 확인하세요.</td>
                  </tr>
                  <tr>
                    <td>404</td>
                    <td>없는 자료 또는 API 미제공</td>
                    <td>카탈로그에서 API 제공 여부를 확인하세요.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 15 }}>
              오류 응답은 <code className="inline-code">error.code</code>와{" "}
              <code className="inline-code">error.message</code>를 포함합니다.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
