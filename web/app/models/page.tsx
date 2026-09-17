import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { datasets } from "@/lib/catalog";
import { DatasetArt, PageIntro } from "@/components/ui";
export const metadata = { title: "AI 모델" };
import { models } from "@/lib/models";

export default async function Models() {
  await requireAdmin();
  return (
    <>
      <PageIntro
        eyebrow="MODEL LIBRARY"
        title="데이터에서 현장의 가능성으로"
        description="산업안전보건 AI 모델의 목적, 학습 데이터와 활용 방법을 살펴보세요."
      />
      <div className="container section">
        <div className="info-note">
          모델 카탈로그의 디자인 예제입니다. 실제 가중치·성능 평가·추론 기능은
          아직 제공되지 않습니다.
        </div>
        <div className="model-grid">
          {models.map((m) => (
            <article className="model-card" key={m.slug}>
              <DatasetArt
                dataset={datasets.find((d) => d.slug === m.dataset)!}
              />
              <div className="model-card-body">
                <span className="badge">DEMO · 모델 준비 중</span>
                <h3>{m.name}</h3>
                <span className="eyebrow">{m.subtitle}</span>
                <p>{m.desc}</p>
                <Link href={`/models/${m.slug}`} className="text-link">
                  모델 카드 보기 <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
