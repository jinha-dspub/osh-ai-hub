import Link from "next/link";
import { sanjeCatalog as data, studyPage, studyDemo } from "@/lib/sanje";
import "../copd/copd.css";
export const metadata = { title: "산재 판정사례 · 7개 질환군" };
export default function SanjePage() {
  return (
    <div className="container copd-page">
      <Link href="/datasets" className="text-link">
        ← 데이터 목록으로
      </Link>
      <header className="copd-heading">
        <span className="badge">실제 자료 · 연구용 검토</span>
        <h1>산재 판정사례</h1>
        <p>
          7개 질환군의 판정 사례를 모았습니다. 질환별 소개와 검색 DEMO에서
          자료의 구성과 근거를 확인하세요.
        </p>
        <div className="copd-metrics">
          <span>
            <strong>{data.total_cases.toLocaleString()}</strong>중복 없는 사례
          </span>
          <span>
            <strong>7</strong>질환군
          </span>
          <span>
            <strong>2015–2021</strong>청구 연도
          </span>
        </div>
        <p className="copd-caption">
          원문 제공자: <a href={data.source_url}>근로복지공단</a>
          <br />
          연구자: {data.researcher} · {data.affiliation}
          <br />
          버전 {data.version} · 최종 버전 날짜 {data.version_date} · 업데이트
          계획 {data.update_plan}
        </p>
      </header>
      <div className="tool-grid">
        {data.groups.map((group) => (
          <article className="tool-card" key={group.id}>
            <span className="badge">{group.cases.toLocaleString()}개 사례</span>
            <h2>
              <Link href={studyPage(group.id)}>{group.title}</Link>
            </h2>
            <p>
              측정치 {group.measurements.toLocaleString()}행 · 근무시간{" "}
              {group.worktime_cases.toLocaleString()}사례 · 표준 라벨 후보{" "}
              {group.labels.toLocaleString()}개
            </p>
            <Link href={studyPage(group.id)} className="button secondary">
              {group.name} 자료 소개
            </Link>
            <a href={studyDemo(group.id)} className="text-link">
              {group.name} 검색 DEMO →
            </a>
          </article>
        ))}
      </div>
      <section className="copd-prose">
        <h2>자료의 분류와 활용</h2>
        <p>
          뇌심혈관·암·감염성질환·난청·근골격계 분류를 우선하고, 남은 사례 중
          COPD 조건에 해당하는 사례와 기타를 구분했습니다. 임상적 재진단이 아닌
          인수 자료의 분할 규칙입니다.
        </p>
        <p>
          이전 COPD 2,082건에서 암 20건·감염성질환 13건을 해당 군으로 배정해
          COPD는 2,049건입니다. 기존 자료와 비교할 때 버전과 분모를 함께
          확인하세요.
        </p>
        <p>
          소개와 집계는 공개하며 실제 원문·검색·다운로드는 기존 인증 관문을
          이용합니다. 표준 라벨은 미검토 후보이고 최종 라이선스·내용 검수는 진행
          중입니다. Hugging Face 게시 계획은 없습니다.
        </p>
      </section>
    </div>
  );
}
