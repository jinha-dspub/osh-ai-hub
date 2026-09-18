import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  HardHat,
  HeartPulse,
  Factory,
  FlaskConical,
  PersonStanding,
  Clock3,
  Database,
  Braces,
  Layers3,
  MoveUpRight,
  Sparkles,
} from "lucide-react";
import { visibleDatasets } from "@/lib/catalog";
import { isAdmin } from "@/lib/admin";
import { SearchForm, SectionHeading, DatasetCard } from "@/components/ui";
const topics = [
  { name: "산업재해", icon: HardHat },
  { name: "산업보건", icon: HeartPulse },
  { name: "작업환경", icon: Factory },
  { name: "근로환경", icon: Clock3 },
  { name: "화학물질", icon: FlaskConical },
  { name: "인간공학", icon: PersonStanding },
];
export default async function Home() {
  const admin = await isAdmin();
  const datasets = visibleDatasets(admin);
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span className="status-dot" /> OPEN DATA. SAFER WORK.
            </div>
            <h1>
              데이터를 연결하고,
              <br />
              <span>더 안전한 내일</span>을 만듭니다.
            </h1>
            <p>
              산업안전보건 데이터부터 AI 모델, 분석 도구까지.
              <br />
              연구의 발견이 현장의 변화로 이어지는 곳, OSH AI Hub.
            </p>
            <div className="hero-links">
              <Link href="/datasets">
                데이터 둘러보기 <ArrowUpRight size={18} />
              </Link>
              <span>연구자와 개발자를 위한 열린 플랫폼</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="orbit-axis" />
            <div className="hub-core">
              <span className="hub-core-icon">
                <Layers3 size={38} />
              </span>
              <b>OSH</b>
              <small>CONNECTED INTELLIGENCE</small>
            </div>
            <div className="orbit-node node-data">
              <Database size={19} />
              <span>
                DATA<small>발견의 시작</small>
              </span>
            </div>
            <div className="orbit-node node-ai">
              <Sparkles size={19} />
              <span>
                AI MODEL<small>새로운 가능성</small>
              </span>
            </div>
            <div className="orbit-node node-api">
              <Braces size={19} />
              <span>
                OPEN API<small>활용으로 연결</small>
              </span>
            </div>
            <span className="orbit-point point-one" />
            <span className="orbit-point point-two" />
            <span className="visual-label">FROM DATA TO REAL-WORLD IMPACT</span>
          </div>
        </div>
        <div className="container hero-search">
          <SearchForm large />
          <div className="recommended">
            <span>추천 검색어</span>
            {["COPD", "만성폐쇄성폐질환", "산재 판정", "분진"].map((q) => (
              <Link key={q} href={`/datasets?q=${encodeURIComponent(q)}`}>
                #{q}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="topic-section container">
        <div className="topic-label">
          <span className="eyebrow">EXPLORE BY TOPIC</span>
          <h2>
            어떤 분야를
            <br />
            찾고 계신가요?
          </h2>
        </div>
        <div className="topic-grid">
          {topics.filter(topic => datasets.some(d => d.category === topic.name)).map(({ name, icon: Icon }) => (
            <Link
              className="topic"
              href={`/datasets?category=${encodeURIComponent(name)}`}
              key={name}
            >
              <span>
                <Icon size={27} strokeWidth={1.55} />
              </span>
              <b>{name}</b>
              <small>
                {datasets.filter((d) => d.category === name).length}개 데이터
              </small>
            </Link>
          ))}
        </div>
      </section>
      <section className="section featured-section">
        <div className="container">
          <SectionHeading
            eyebrow="CURATED DATA"
            title="데이터에서 시작하는 새로운 발견"
            description="다양한 산업안전보건 데이터를 미리 살펴보세요."
            href="/datasets"
            link="모든 데이터 보기"
          />
          <div className="section-notice">
            <span className="badge">실제 자료 · 검수 중</span>
            <span>
              COPD 산재 판정 사례를 살펴보세요. 원문 다운로드는 공개 범위 검토 후 제공합니다.
            </span>
          </div>
          <div className="dataset-grid">
            {datasets.slice(0, 4).map((d) => (
              <DatasetCard key={d.slug} dataset={d} />
            ))}
          </div>
        </div>
      </section>
      <section className="section container">
        <SectionHeading
          eyebrow="EXPLORE & BUILD"
          title="찾은 데이터, 그다음은 무엇일까요?"
          description="브라우저에서 살펴보고, 내 연구와 서비스에 연결하세요."
        />
        <div className="feature-grid">
          <Link href="/tools" className="feature-panel feature-light">
            <span className="feature-number">01 / EXPLORE</span>
            <div className="feature-icon">
              <HeartPulse size={33} />
            </div>
            <h3>
              데이터를 읽는
              <br />
              새로운 관점
            </h3>
            <p>
              직업성 암부터 작업환경까지,
              <br />
              분석 도구로 데이터의 의미를 발견하세요.
            </p>
            <span className="feature-link">
              분석 도구 둘러보기 <ArrowUpRight size={19} />
            </span>
            <div className="mini-chart" aria-hidden="true">
              {[30, 55, 42, 74, 60, 86, 70, 100].map((h, i) => (
                <i key={i} style={{ height: h + "%" }} />
              ))}
            </div>
          </Link>
          <Link href="/developers" className="feature-panel feature-dark">
            <span className="feature-number">02 / BUILD</span>
            <div className="feature-icon">
              <Braces size={33} />
            </div>
            <h3>
              몇 줄의 코드로
              <br />더 넓은 가능성
            </h3>
            <p>
              데이터를 내 프로젝트 안으로.
              <br />
              Python, R, API로 바로 시작하세요.
            </p>
            <span className="feature-link">
              API 시작하기 <ArrowUpRight size={19} />
            </span>
            <div className="mini-code" aria-hidden="true">
              <span>GET</span> /openapi/v1/datasets
              <br />
              <em>
                {'{ "success": true,'}
                <br />
                &nbsp;&nbsp;{'"is_demo": true }'}
              </em>
            </div>
          </Link>
        </div>
      </section>
      <section className="update-section">
        <div className="container update-grid">
          <div>
            <p className="eyebrow">WHAT’S NEW</p>
            <h2>
              함께 만드는
              <br />
              열린 데이터 생태계
            </h2>
            <p className="muted">플랫폼의 새로운 소식을 전합니다.</p>
            <Link href="/about" className="text-link">
              플랫폼 알아보기 <ArrowRight size={17} />
            </Link>
          </div>
          <div className="update-list">
            <Link href="/about">
              <span className="badge">플랫폼 소식</span>
              <h3>OSH AI Hub, 새로운 시작을 준비합니다</h3>
              <time>2026.09.12</time>
              <MoveUpRight size={18} />
            </Link>
            <Link href="/developers">
              <span className="badge">개발자 안내</span>
              <h3>샘플 데이터 API를 직접 호출해 보세요</h3>
              <time>2026.09.12</time>
              <MoveUpRight size={18} />
            </Link>
            <Link href="/datasets">
              <span className="badge">데이터 안내</span>
              <h3>12개 데이터 데이터로 탐색하는 플랫폼</h3>
              <time>2026.09.17</time>
              <MoveUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
