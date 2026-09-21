import {
  type SanjeStudy,
  sanjeCatalog,
  studyDemo,
  studyPage,
} from "@/lib/sanje";
export function SanjeHeading({
  study,
  demo = false,
}: {
  study: SanjeStudy;
  demo?: boolean;
}) {
  return (
    <header className="copd-heading">
      <div className="copd-labels">
        <span className="badge">산업보건 · 한국어</span>
        <span className="badge">실제 자료 · 연구용 검토</span>
        <span className={`badge ${demo ? "demo" : ""}`}>
          {demo ? "DEMO 검색 인터페이스" : "데이터 소개"}
        </span>
      </div>
      <h1>{study.title}</h1>
      <p>
        사례를 찾아 원문·AI 가공 정보·표준 라벨 후보와 근무시간 근거를 함께
        살펴보세요.
      </p>
      <div className="copd-metrics">
        <span>
          <strong>{study.cases.toLocaleString()}</strong>사례
        </span>
        <span>
          <strong>
            {study.years[0]}–{study.years.at(-1)}
          </strong>
          청구 연도
        </span>
        <span>
          <strong>{study.measurements.toLocaleString()}</strong>측정치 ·{" "}
          {study.measured_cases}개 사례
        </span>
      </div>
      <p className="copd-caption">
        연구자: {study.researcher} · {study.affiliation}
        <br />
        자료 버전 {study.version} · 최종 버전 날짜 {study.version_date} ·
        업데이트 계획 미정
      </p>
      {study.id === "copd" && (
        <p className="copd-caption">
          이전 2,082건 중 암 20건·감염성질환 13건을 해당 질환군으로
          배정했습니다. 7개 질환군은 서로 중복되지 않습니다.
        </p>
      )}
      <nav className="sanje-group-links" aria-label="질환군 선택">
        {sanjeCatalog.groups.map((group) => (
          <a
            key={group.id}
            href={demo ? studyDemo(group.id) : studyPage(group.id)}
            aria-current={group.id === study.id ? "page" : undefined}
          >
            {group.name}
          </a>
        ))}
      </nav>
    </header>
  );
}
