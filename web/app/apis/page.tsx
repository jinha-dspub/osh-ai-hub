import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { Database, ChartColumn, ScanLine, ArrowUpRight } from "lucide-react";
import { PageIntro } from "@/components/ui";
export const metadata = { title: "API 카탈로그" };
export default async function Apis() {
  const admin = await isAdmin();
  return (
    <>
      <PageIntro
        eyebrow="OPEN API CATALOG"
        title="목적에 맞는 API를 찾아보세요"
        description="자료를 찾는 것부터 데이터를 가져오는 것까지, 하나의 일관된 인터페이스."
      />
      <div className="container section">
        <div className="api-card-grid">
          {[
            {
              title: "데이터 카탈로그 API",
              desc: "공개 예제 자료의 제목, 분류, 형식과 메타데이터를 검색합니다.",
              path: "GET /openapi/v1/datasets",
              icon: Database,
              ready: true,
            },
            {
              title: "샘플 데이터 조회 API",
              desc: "합성 통계와 구조화된 예제 행을 조회합니다. 실제 연구용 통계가 아닙니다.",
              path: "GET /openapi/v1/statistics/{slug}",
              icon: ChartColumn,
              ready: true,
            },
            {
              title: "이미지 추론 API",
              desc: "안전보호구 등 현장 이미지의 탐지 결과를 반환할 예정입니다. 실제 모델을 준비 중입니다.",
              path: "POST /inference/v1/image",
              icon: ScanLine,
              ready: false,
            },
          ]
            .filter((item) => item.ready || admin)
            .map(({ title, desc, path, icon: Icon, ready }) => (
              <article className="api-card" key={title}>
                <Icon size={28} />
                <div>
                  <span className={`badge ${ready ? "teal" : ""}`}>
                    {ready ? "DEMO · 사용 가능" : "준비 중"}
                  </span>
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <div className="endpoint">
                  <code>{path}</code>
                </div>
                <Link
                  href={ready ? "/developers" : "/playground"}
                  className="text-link"
                >
                  {ready ? "문서 및 실행" : "준비 현황 보기"}
                  <ArrowUpRight size={16} />
                </Link>
              </article>
            ))}
        </div>
      </div>
    </>
  );
}
