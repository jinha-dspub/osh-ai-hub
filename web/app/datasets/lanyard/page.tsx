import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { lanyardPublic } from "@/lib/catalog";
import "../../../../design/osh-family/osh-family.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "안전대 체결 라벨링 데이터셋" };

// Counts come from the NAS release and labeling archive README (2026-09-30).
const labelingSets = [
  ["① 평가셋 안전고리 상태", 455],
  ["①-b 평가셋 작업자 위치", 455],
  ["①-c 죔줄 점 교정", 200],
  ["①-d 다른 현장 평가", 200],
  ["② Val 불일치 검수", 56],
  ["④ 블라인드", 120],
  ["⑤ 안전고리 A/B", 150],
] as const;

const labels = [
  ["체결", "안전고리가 작업자 몸 밖의 고정 구조물(난간·파이프·비계·보·와이어)에 걸려 있음"],
  ["미체결", "안전고리가 어디에도 걸려 있지 않음(늘어짐·바닥·손에 듦)"],
  ["거치", "안전고리를 구조물이 아닌 자기 안전대·벨트에 걸어 둠"],
  ["불명", "사진으로 판단할 수 없음 — 사람이 확인해야 함"],
] as const;

export default async function LanyardPage() {
  if (!lanyardPublic && !(await isAdmin())) notFound();
  return (
    <div className="osh-app">
      <div className="osh-container osh-main">
        <Link className="osh-link" href="/datasets">
          ← 데이터 목록으로
        </Link>
        <header className="osh-section">
          <span className="osh-badge">AI 판정 · 연구용 · 정확도 검증 전</span>
          <h1 className="osh-title">안전대 체결 라벨링 데이터셋</h1>
          <p className="osh-copy">
            공사현장 사진에서 작업자 안전대의 죔줄을 찾아, 안전고리가 구조물에 걸려 있는지
            판정합니다. 추락 위험 위치의 미체결 작업자를 빠르게 찾는 연구용 도구입니다.
          </p>
          <p className="osh-copy">
            <strong>
              판정에 사용한 사진과 판정 결과는 모델 개선 연구를 위해 OSH AI Hub 서버에 저장되며,
              2단계 확인을 위해 Anthropic(Claude)으로 전송됩니다.
            </strong>{" "}
            얼굴·이름표 등 개인을 알아볼 수 있는 부분이 없는 사진을 사용해 주세요.
          </p>
          <p className="osh-help">배포본 lanyard-analyzer-20260930-v1 · 2026-09-30</p>
          <a className="osh-button" href="/demo/lanyard/">
            체결 판정 열기 →
          </a>
        </header>
        <section className="osh-section">
          <h2 className="osh-heading">판정 방식</h2>
          <div className="osh-grid">
            <article className="osh-card">
              <h3>1단계 · 검출과 형태 규칙</h3>
              <p>
                YOLO11m-pose 검출기가 죔줄(7개 점)과 안전대를 찾고, 죔줄의 방향·처짐·끝점 위치로
                체결 여부를 가리는 형태 규칙 v0.5를 적용합니다. OSH AI Hub 서버에서 실행하며
                사진을 외부로 보내지 않습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>2단계 · Claude 확인</h3>
              <p>
                사진을 Anthropic Claude로 보내 작업자별 안전고리 위치와 추락
                위험 위치를 판독합니다. 형태 규칙이 ‘불명’으로 남긴 죔줄에만 Claude의 답을
                반영하고, 형태 규칙이 내린 판정은 바꾸지 않습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>3. 결과와 의견</h3>
              <p>
                사진 위에 죔줄과 판정을 표시합니다. 이용자가 남긴 ‘맞아요/틀렸어요’ 의견과 판정
                기록은 모델 개선에 쓰입니다.
              </p>
            </article>
          </div>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">판정 범주</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="판정 범주">
            <table className="data-table">
              <thead>
                <tr><th>판정</th><th>뜻</th></tr>
              </thead>
              <tbody>
                {labels.map(([name, text]) => (
                  <tr key={name}><td>{name}</td><td>{text}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">학습·검토 자료</h2>
          <p className="osh-copy">
            원천 자료는 AIHub ‘공사현장 안전장비 인식 데이터’(학습·검증 원천과 라벨, 1,409,468개
            파일)입니다. 원본 사진과 라벨은 AIHub 이용약관에 따라 이 사이트에서 다시 배포하지 않으며,
            필요하면 AIHub에서 직접 신청해야 합니다.
          </p>
          <p className="osh-copy">
            연구팀은 이 자료에서 과제별로 사람이 다시 검토한 라벨링 세트를 만들었습니다. 가공
            데이터의 공개 범위와 형식은 정리 중입니다.
          </p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="라벨링 세트">
            <table className="data-table">
              <thead>
                <tr><th>라벨링 세트</th><th>답이 달린 과제 수</th></tr>
              </thead>
              <tbody>
                {labelingSets.map(([name, count]) => (
                  <tr key={name}><td>{name}</td><td>{count.toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="osh-help">일치도 평가 세트(⑥)는 진행 중이라 표에서 뺐습니다.</p>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">한계와 자료 처리</h2>
          <p className="osh-copy">
            AI 판정은 틀릴 수 있으며 현장 안전 점검을 대신하지 않습니다. 정확도 평가 수치는
            검토를 마친 뒤 공개합니다. 사진은 긴 변 1,600픽셀로 줄이고 위치정보(EXIF)를 뺀 뒤
            처리합니다.
          </p>
          <p className="osh-copy">
            판정에 사용한 사진(위치정보 제거)과 판정 결과·의견은 모두 OSH AI Hub 서버에 저장되어
            모델 개선 연구에 쓰입니다. 2단계 확인을 위해 사진이 Anthropic으로 전송되며, 외부 AI의
            데이터 처리는 제공자 정책을 따릅니다.
          </p>
        </section>
      </div>
    </div>
  );
}
