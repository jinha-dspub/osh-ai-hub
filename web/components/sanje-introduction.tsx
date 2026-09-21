import Link from "next/link";
import { CopdExplorer } from "./copd-explorer";
import { SanjeHeading } from "./sanje-heading";
import { type SanjeStudy, studyDemo } from "@/lib/sanje";
import "../app/datasets/copd/copd.css";
export function SanjeIntroduction({ study }: { study: SanjeStudy }) {
  const demo = studyDemo(study.id);
  return (
    <div className="container copd-page">
      <Link href="/datasets/sanje" className="text-link">
        ← 산재 판정사례 전체 보기
      </Link>
      <SanjeHeading study={study} />
      <section className="copd-start" aria-labelledby="copd-start-title">
        <div>
          <span className="badge demo">검색 DEMO</span>
          <h2 id="copd-start-title">실제 사례를 직접 찾아보세요</h2>
          <p>
            이 페이지에서는 자료의 구성과 활용 방법을 안내합니다. 검색 DEMO에서
            조건을 선택하고 원문과 근거를 확인하세요.
          </p>
          <a href={demo} className="button">
            {study.name} 검색 DEMO 열기 →
          </a>
          <p className="copd-caption">
            검색·원문·다운로드는 기존 인증 관문 뒤에서 제공합니다.
          </p>
        </div>
        <div className="copd-howto">
          <h3>이렇게 활용하세요</h3>
          <ol>
            <li>
              <strong>검색 조건 정하기</strong>
              <span>직종·연도·판정 조건을 여러 개 선택해 범위를 좁힙니다.</span>
            </li>
            <li>
              <strong>원문과 근거 비교하기</strong>
              <span>
                AI 요약·표준 라벨 후보·측정치·근무시간을 원문과 비교합니다.
              </span>
            </li>
            <li>
              <strong>자료 내려받기</strong>
              <span>
                파일·활용법에서 해당 질환 ZIP·CSV·JSONL을 내려받습니다.
              </span>
            </li>
          </ol>
        </div>
      </section>
      <CopdExplorer study={study} enabled={false} />
    </div>
  );
}
