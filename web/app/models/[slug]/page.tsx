import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { models } from "@/lib/models";
import { Breadcrumb, DatasetCard } from "@/components/ui";
import { findDataset } from "@/lib/catalog";
export default async function ModelDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const slug = (await params).slug;
  const model = models.find((x) => x.slug === slug);
  if (!model) notFound();
  const data = findDataset(model.dataset)!;
  return (
    <div className="container">
      <Breadcrumb
        items={[{ label: "AI 모델", href: "/models" }, { label: model.name }]}
      />
      <div className="detail-heading">
        <div>
          <span className="badge">DEMO MODEL CARD</span>
          <h1>{model.name}</h1>
          <p>
            {model.subtitle} · {model.desc}
          </p>
        </div>
      </div>
      <div className="detail-layout">
        <div className="detail-content">
          <div className="info-note">
            실제 모델은 준비 중입니다. 아래 정보는 모델 카드의 구성 예제이며,
            성능이나 사용 가능성을 보장하지 않습니다.
          </div>
          <h2>모델 소개</h2>
          <p>
            {model.desc} 공개 전에 가중치와 이용 조건을 확보하고 실제 평가
            결과를 기록할 예정입니다.
          </p>
          <h3>현재 제공 상태</h3>
          <div className="table-scroll">
            <table>
              <tbody>
                {[
                  ["가중치", "미등록"],
                  ["아키텍처", "선정 전"],
                  ["학습 데이터 버전", "확인 전"],
                  ["평가 결과", "미측정"],
                  ["라이선스", "확인 전"],
                  ["추론 API", "미제공"],
                ].map(([a, b]) => (
                  <tr key={a}>
                    <th>{a}</th>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>관련 데이터 구성 예제</h3>
          <p>
            실제 학습 데이터 연결이 아닌, 모델과 데이터의 관계를 살펴보기 위한
            예제입니다.
          </p>
          <div style={{ maxWidth: 320 }}>
            <DatasetCard dataset={data} />
          </div>
        </div>
        <aside className="detail-aside">
          <div className="aside-card">
            <h3>AI 체험 화면</h3>
            <p>이미지 선택과 결과 화면의 구성을 미리 살펴볼 수 있습니다.</p>
            <Link href="/playground" className="button secondary">
              체험 화면 보기 <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
