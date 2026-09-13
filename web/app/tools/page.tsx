import Link from "next/link";
import {
  ChartNoAxesCombined,
  HeartPulse,
  FlaskConical,
  ScanLine,
  ArrowUpRight,
} from "lucide-react";
import { PageIntro } from "@/components/ui";
export const metadata = { title: "분석·체험" };
export default function Tools() {
  return (
    <>
      <PageIntro
        eyebrow="EXPLORE & EXPERIENCE"
        title="직접 살펴보면, 데이터가 달라 보입니다"
        description="분석 도구와 AI 체험을 통해 데이터의 의미를 탐색하세요."
      />
      <div className="container section">
        <div className="info-note teal-note">
          DEMO 화면입니다. 기존 분석 앱은 후속 단계에서 연결하며, 지금은 도구
          소개와 AI 체험 화면을 살펴볼 수 있습니다.
        </div>
        <div className="tool-grid">
          {[
            {
              title: "직업 코호트 SIR 대시보드",
              desc: "직업 코호트의 표준화발생비를 탐색하는 기존 분석 앱입니다.",
              icon: ChartNoAxesCombined,
            },
            {
              title: "업종별 암발생 탐색기",
              desc: "업종별 암발생 분석 결과를 살펴보는 기존 Streamlit 앱입니다.",
              icon: HeartPulse,
            },
            {
              title: "R 기반 분석 도구",
              desc: "R 기반 분석 도구를 모아 제공할 예정입니다. 실제 앱 연결은 준비 중입니다.",
              icon: FlaskConical,
            },
          ].map(({ title, desc, icon: Icon }) => (
            <article key={title} className="tool-card">
              <Icon size={29} />
              <div>
                <span className="badge">DEMO · 연결 준비 중</span>
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
              <button type="button" className="button secondary" disabled>
                분석 앱 연결 준비 중
              </button>
            </article>
          ))}
          <article className="tool-card">
            <ScanLine size={29} />
            <div>
              <span className="badge">디자인 프리뷰</span>
            </div>
            <h3>이미지 AI Playground</h3>
            <p>
              이미지를 선택하고 추론 결과를 살펴볼 체험 화면입니다. 실제 모델은
              준비 중입니다.
            </p>
            <Link href="/playground" className="button secondary">
              체험 화면 보기 <ArrowUpRight size={14} />
            </Link>
          </article>
        </div>
      </div>
    </>
  );
}
