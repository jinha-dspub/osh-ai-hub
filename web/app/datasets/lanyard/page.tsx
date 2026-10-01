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

// confidence.json of lanyard-ai-labels-2026-09-30.1 (set ①, 455 lanyards, none used in training).
const confidenceBands = [
  ["0.25–0.40", 85, "24% (17/71)", "96% (68/71)", 12],
  ["0.40–0.60", 112, "16% (16/99)", "90% (89/99)", 10],
  ["0.60–0.80", 81, "48% (30/63)", "89% (56/63)", 15],
  ["0.80–1.00", 63, "96% (46/48)", "96% (46/48)", 15],
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
          <p className="osh-help">배포본 lanyard-analyzer-20261001-v2 · 2026-10-01</p>
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
                체결 여부를 가리는 형태 규칙 v0.5를 적용합니다. 죔줄 끝이 사진 위·왼쪽·오른쪽
                테두리에 닿아 잘렸으면 ‘불명’으로 둡니다. OSH AI Hub 서버에서 실행하며
                사진을 외부로 보내지 않습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>2단계 · Claude 확인</h3>
              <p>
                사진을 Anthropic Claude로 보내 작업자별 죔줄(7개 점)·안전고리 위치·안전대와 추락
                위험 위치를 판독합니다. 형태 규칙이 ‘불명’으로 남긴 죔줄에만 가장 가까운
                안전고리에 대한 Claude의 답을 반영하고, 형태 규칙이 내린 판정은 바꾸지 않습니다.
                검출기가 놓친 작업자는 Claude가 그린 죔줄에 같은 형태 규칙을 적용합니다.
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
            연구팀은 이 자료에서 과제별로 사람이 다시 검토한 라벨링 세트를 만들었습니다. 아래
            ‘데이터셋 받기’에서 JSON과 CSV로 받을 수 있습니다.
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
          <h2 className="osh-heading">데이터셋 받기</h2>
          <p className="osh-copy">
            버전 2026-10-01.1 · AIHub 사진에 대한 라벨은 사진 없이 제공합니다. AIHub에서 사진을 신청한 뒤 사진
            파일명으로 맞춰 쓰세요. AIHub 밖 공개 사진(Roboflow Universe, CC BY 4.0)은 사진과 라벨을 함께 받을 수
            있습니다.
          </p>
          <div className="osh-grid">
            <article className="osh-card">
              <h3>사람 검토 라벨 · 연구팀 판정·교정 1,636건</h3>
              <p>
                학습·검토에 쓴 7개 세트. JSON(1.4MB)과 ZIP(JSON + 세트별 CSV + README, 0.3MB). 죔줄 7점·안전대
                박스와 사람 판정·메모가 들어 있습니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>AI 자동 판정 라벨 · 사람 검토 전 13,549장</h3>
              <p>
                사람이 답하지 않은 학습 사진 전체에 1단계 검출기와 형태 규칙이 붙인 라벨(ZIP 1.6MB). 죔줄 16,158개·
                안전대 22,105개, 검출 신뢰도·점별 신뢰도·판정 근거와 아래 신뢰 범위를 함께 제공합니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>Roboflow 안전대 사진 7개 세트 · CC BY 4.0</h3>
              <p>
                Roboflow Universe에 공개된 안전대·안전고리 사진 2,828개 파일(원본 고유 1,917장)을 COCO 라벨과 함께
                받은 그대로 묶었습니다(세트별 ZIP, 합계 556MB). 세트마다 저작자·원본 주소·전처리를 SOURCE.md에
                적었습니다. 원 사진의 촬영 출처는 확인되지 않았고, dyd-safe는 AIHub 자료일 가능성이 있어 이용 전
                확인이 필요합니다. 일부 세트는 늘림·회전 증강본이라 죔줄 형태가 실제와 다릅니다.
              </p>
            </article>
            <article className="osh-card">
              <h3>외부 공개 사진 AI 라벨 · 사람 검토 전</h3>
              <p>
                같은 판정기와 Claude Opus 5.5가 Roboflow 사진 1,118장(작업자 1,409명: 체결 1,112·미체결 83·거치 26·
                불명 188)과 Ultralytics Construction-PPE 사진 1,416장(작업자 70명)에 붙인 라벨(ZIP 0.4MB).
                Construction-PPE 사진(AGPL-3.0)은 Ultralytics에서 받으세요.
              </p>
            </article>
          </div>
          <h3 className="osh-heading">AI 자동 판정 라벨의 신뢰 범위</h3>
          <p className="osh-copy">
            검출 신뢰도는 점수이지 정확도가 아닙니다. 사람 검토 세트 ①(죔줄 455개, 검출기 학습에 쓰지 않은
            사진)에 같은 모델을 돌려 구간별로 사람 판정과 비교했습니다. 114개는 검출되지 않았습니다. 사람은
            ‘거치’를 많이 골라(256개) 3종 판정 일치율은 낮고, 실제 쓰임에 가까운 ‘체결 여부’(체결 vs
            미체결·거치) 일치율은 89~96%입니다.
          </p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="AI 자동 판정 라벨의 신뢰 범위">
            <table className="data-table">
              <thead>
                <tr>
                  <th>검출 신뢰도</th><th>죔줄</th><th>판정 일치율(3종)</th><th>체결 여부 일치율</th><th>AI 불명</th>
                </tr>
              </thead>
              <tbody>
                {confidenceBands.map(([band, count, three, clipped, unknown]) => (
                  <tr key={band}><td>{band}</td><td>{count}</td><td>{three}</td><td>{clipped}</td><td>{unknown}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="osh-help">
            괄호는 (일치 / 사람과 AI가 모두 판정한 죔줄). 사람 검토 455개 기준의 참고값이며 전체 정확도 평가가
            아닙니다. 이용자가 올린 사진과 라벨링 도구 원본(작업자 계정 번호 포함)은 포함하지 않습니다. 라벨
            파일의 재배포·상업 이용 조건은 확정 전이며, 연구에 쓸 때는 출처를 밝혀 주세요.
          </p>
          <a className="osh-button osh-button--secondary" href="/demo/lanyard/#files">
            데이터셋 받기
          </a>
        </section>
        <section className="osh-section">
          <h2 className="osh-heading">한계와 자료 처리</h2>
          <p className="osh-copy">
            AI 판정은 틀릴 수 있으며 현장 안전 점검을 대신하지 않습니다. 사람 판정과의 일치율은 위
            신뢰 범위 표를 참고하세요. 전체 정확도 평가는 검토를 마친 뒤 공개합니다. 사진은 긴 변 1,600픽셀로 줄이고 위치정보(EXIF)를 뺀 뒤
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
