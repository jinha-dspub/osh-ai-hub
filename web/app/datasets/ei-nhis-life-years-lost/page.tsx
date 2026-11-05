import Link from "next/link";
import "../../../../design/osh-family/osh-family.css";

export const metadata = { title: "고용보험–건보 집계표·손실연수 계산 DEMO" };
const demo = "/demo/ei-nhis-life-years-lost/";
const files = [
  ["DEMO 합성 집계표 3행 · 전체 열", "preview.csv"],
  ["집계표 작성 및 지표 재산출 가이드", "AGGREGATION-GUIDE.md"],
  ["빈 집계표 양식", "aggregate.csv"],
  ["데이터 사전", "data_dictionary.csv"],
  ["표준인구 양식", "standard_population.csv"],
  ["외삽 기준 사망률 양식", "reference_mortality.csv"],
  ["분석 메타정보 양식", "metadata.json"],
  ["Python 계산 코드", "calculate.py"],
  ["CSV 결합 코드", "make_bundle.py"],
  ["실행 환경·사용법", "ENVIRONMENT.md"],
  ["논문 표 7 보고값 · 실제 보고값", "thesis_table7_reported.csv"],
] as const;

export default function LifeYearsPage() {
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge osh-badge--demo">
            DEMO · 합성자료 계산
          </span>
          <h1 className="osh-title">고용보험–건보 집계표와 손실연수</h1>
          <p className="osh-copy">
            고용보험–국민건강보험 연계자료의 집계 기준과
            생명표·손실연수·YPLL 재산출 방법을 안내합니다. 집계표 작성 가이드,
            빈 입력 양식, Python 코드와 합성자료 기반 계산 도구를 제공합니다.
          </p>
          <p className="osh-help">
            자료 버전 0.1.0-local · 원 제작일 2026-10-30 · Hub 반영
            2026-11-05.v1 · 업데이트 계획 미정
          </p>
          <a className="osh-button" href={demo}>
            손실연수 계산 DEMO 열기 →
          </a>
        </header>
        <p className="osh-note">
          <strong>실제 연령별 반출 집계자료는 아직 연결되지 않았습니다.</strong>{" "}
          예제 9종은 명시적인 합성자료입니다. 논문 표 7의 실제 보고값은 별도
          참고 자료이며, 계산기에 사용되는 입력이나 합성 계산 결과가 아닙니다.
        </p>
        <section className="osh-section">
          <h2 className="osh-heading">집계표 작성 및 지표 산출 절차</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3 className="osh-card-title">1. 집계표 형식 확인</h3>
              <p>
                분석설계·성별·분류·집단·연령을 고정하고 사망 건수, 관찰 인년, 셀 상태를
                기록합니다. 누락·비공개 셀은 0으로 채우지 않습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">2. 합성 예제로 계산</h3>
              <p>
                10년 추적·40세 분류·1년 단면과 업종·직종·피보험 여부를 조합한
                DEMO 9종으로 계산 흐름을 확인합니다.
              </p>
            </article>
            <article className="osh-card">
              <h3 className="osh-card-title">3. 결과와 코드 내려받기</h3>
              <p>
                결과 CSV, 결과·설정 JSON, 입력 JSON, 연령별 생명표 CSV를 받을 수
                있습니다. Python 코드로 같은 입력을 재계산할 수 있습니다.
              </p>
            </article>
          </div>
        </section>
        <section className="osh-card osh-section">
          <h2 className="osh-heading">DEMO · 합성 집계표 3행 미리보기</h2>
          <p>
            10년 추적·업종 예제의 첫 3행에서 일부 열을 골랐습니다. 실제 사람이나
            기관의 관측값이 아닙니다.
          </p>
          <div
            className="osh-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="합성 집계표 미리보기"
          >
            <table className="osh-table">
              <thead>
                <tr>
                  <th>행</th>
                  <th>집단</th>
                  <th>만 나이</th>
                  <th>관찰 인년</th>
                  <th>사망 건수</th>
                  <th>셀 상태</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [40, 100000, 90],
                  [41, 98800, 95],
                  [42, 97600, 100],
                ].map(([age, years, deaths], i) => (
                  <tr key={age}>
                    <td>{i + 1}</td>
                    <td>제조업 · 합성</td>
                    <td>{age}세</td>
                    <td>{years.toLocaleString("ko-KR")}</td>
                    <td>{deaths}</td>
                    <td>observed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <a className="osh-link" href={`${demo}downloads/preview.csv`}>
              DEMO 미리보기 CSV 다운로드 · 전체 17개 열
            </a>
          </p>
        </section>
        <section className="osh-card osh-section">
          <h2 className="osh-heading">자료와 코드 다운로드</h2>
          <p>
            집계표 작성 양식과 지표 산출 도구입니다. 논문 보고값 CSV는 합성 예제와
            구분해서 사용하세요.
          </p>
          <ul>
            {files.map(([title, name]) => (
              <li key={name}>
                <a className="osh-link" href={`${demo}downloads/${name}`}>
                  {title} · {name}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section className="osh-card osh-section">
          <h2 className="osh-heading">출처와 확인한 범위</h2>
          <p>
            방법과 보고값 출처는 오주연의 연세대학교 대학원 보건학과 학위논문
            v2(프로그램·그림번호 수정본)입니다. 방법 2.3.2절, 고찰 4.11절, 표
            7·18·19를 참고한 제작 패키지입니다. 원문 공개 URL은 제공되지
            않았습니다.
          </p>
          <p>
            가공 주체는 사용자 요청에 따른 Codex 패키징으로 기록되어 있습니다.
            논문 저자와 별개로 이 패키지의 연구책임자·대표 연구자·공개
            문의처·갱신 담당은 미확인입니다. 원천·가공물의 라이선스는 미확인이며
            새 오픈 라이선스를 부여하지 않았습니다.
          </p>
          <ul>
            <li>
              합성 입력의 계산·경계 조건 검사는 완료했으나, 실제 집계자료로 논문
              수치를 재현한 검증은 아직 수행하지 않았습니다.
            </li>
            <li>
              집단 간 독립 근사와 64세 외삽 가정이 포함됩니다. 겸직 중복의
              공분산과 외삽 가정 자체의 불확실성은 반영하지 않습니다.
            </li>
            <li>
              사망 20건 미만의 추론 생략은 통계 규칙이며 기관의 소수 셀 공개
              기준을 대신하지 않습니다.
            </li>
          </ul>
        </section>
        <section className="osh-card osh-section">
          <h2 className="osh-heading">입력자료 처리 안내</h2>
          <p>
            합성 예제를 선택하거나 CSV 결합 코드로 만든 집계 JSON을 가져올 수
            있습니다(최대 10MB). 계산 실행 시 OSH 계산 서버로 전송하며
            메모리에서 처리하고 파일로 저장하지 않습니다. 외부 AI API는 사용하지
            않습니다. 전송 가능한 집계자료만 사용하고 개인자료는 넣지 마세요.
          </p>
          <p className="osh-help">
            변경 이력: 2026-10-30 제작 패키지 0.1.0-local → 2026-11-04 Hub
            소개·계산 DEMO·다운로드 연결 및 가이드·화면·계산 안내 문구 갱신.
            2026-11-05 합성 집계표 전체 열 미리보기·CSV 다운로드 추가.
            계산식과 자료 값은 변경하지
            않았습니다.
          </p>
          <a className="osh-button" href={demo}>
            합성 예제로 계산 시작하기 →
          </a>
        </section>
      </div>
    </div>
  );
}
