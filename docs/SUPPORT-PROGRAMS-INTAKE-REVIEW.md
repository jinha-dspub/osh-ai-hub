# 안전보건 지원사업 요건 인수 검토

검토일: 2026-10-01 · 대상: `dever/ukbyun/osh-support-programs 2.zip` (자료 ID `osh-support-programs`, v0.7, 2026-09-28)
범위: 압축 해제, 재현·무결성 확인, Hub 연결(관리자 소개 + DEMO + 수요 로그 NAS 적재). 운영 반영은 하지 않았다.

## 판단

국내 산업안전보건 지원사업 114건의 대상 요건(규모·업종·지역·유해인자)과 지원 조건(비율·한도·금리)을 정리한 **실제 자료**다. 합성 행은 없다. 신청기간·예산은 담지 않고 행마다 공식 링크를 둔다. DB 없이 CSV 2개(`programs.csv`, `items.csv`)로 충분하다.

제작자 설명대로 이 화면의 진짜 산출물은 **수요 로그**다. 요건표는 사람을 불러오는 쪽이고, 누가 어떤 조건으로 무엇을 찾고 어디로 이동했는지가 두 번째 데이터셋이 된다. 그래서 로그 수신과 NAS 적재를 함께 연결했다.

저장소가 공개(GitHub PUBLIC)라서 요건표 행은 git·Vercel 번들에 넣지 않고 `.6` 관문 API로만 보낸다. 2026-10-01 소유자 요청으로 소개 페이지를 공개(`supportProgramsPublic = true`)했다. 연구자·이용 조건은 여전히 미확인이다.

## 접근 범위 — 실제 상태

`docs/DEMO-GATEWAY-REQUEST.md`는 `/demo/`에 Basic 인증을 건다고 적었지만, 2026-10-01 확인 결과 `https://tools.osh.ai.kr/demo/oshmaster/`·`/demo/copd/`가 자격 증명 없이 200을 반환한다. **관문을 재시작하면 지원사업 DEMO와 요건표 API(`/demo/osh-support-programs/api/catalogue`)도 누구나 열 수 있다.** 수요 로그 수집은 이 공개 운영을 전제로 한다. 요건표 재배포 조건이 확인되지 않은 상태에서 공개하는 것이므로 운영 반영 전에 담당자가 판단해야 한다.

## 직접 확인한 내용

| 항목 | 결과 |
|---|---|
| 압축 내용 | 152개 항목(`__MACOSX` 메타 포함). `__MACOSX`·`.DS_Store` 제외 후 해제 |
| 파일명 | macOS NFD 한글 파일명이어서 Linux에서 `rebuild.sh`가 `2_자료`를 못 찾음 → NFC로 정규화 후 실행 |
| `rebuild.sh` | build → verify(수치 152/152) → DEMO 빌드 → 결과 4개가 패키지와 바이트 일치 |
| 데이터 해시 | `programs.csv` `067a863c…`, `items.csv` `ffa08c5d…` — `files.csv`와 일치. 서버에 고정 |
| 판정 규칙 | TypeScript 이식본이 DEMO.md 표 3개 조건(102·22·40·12 / 103·22·40·11 / 88·22·40·26)과 갈래 합 26·49·39를 재현 |
| 수요 로그 | 브라우저 → 관문 → 가짜 NAS 폴더까지 묶음 2개 적재, MANIFEST 생성 확인(실제 `/nas`에는 시험 기록을 쓰지 않음) |
| 엑셀 재생성 | `openpyxl` 미설치로 실행하지 않음 |

## 배치

| 무엇 | 위치 | git |
|---|---|---|
| 받은 압축본(원천) | `/nas/osh-support-programs/raw/ukbyun-handoff-20261001/` + MANIFEST(SHA-256 `fbbd8d5d…`), 쓰기 금지 | 제외 |
| 서비스 배포본(NFC 정규화, 제작자 5갈래 구조 유지) | `/nas/osh-support-programs/serving/osh-support-programs-20261001-v1/` + RELEASE.md, `current`가 가리킴 | 제외 |
| 로컬 링크 | `dever/ukbyun/osh-support-programs`·`…2.zip` → 위 NAS 경로(`opendata/` 사본은 삭제) | 제외 |
| 요건표 API | `GET /demo/osh-support-programs/api/catalogue` (`ai-api/app/support_programs.py`) | 코드만 |
| 수요 로그 수신 | `POST /demo/osh-support-programs/api/log` → `/nas/osh-support-programs/raw/demand-log-YYYYMMDD/` | 코드만 |
| NAS 대기·잠금 | `ai-api/scripts/sync_support_programs_nas.py` | 포함 |
| DEMO 화면 | `web/demo/osh-support-programs/` → `npm run build:support-programs-demo` → `ai-api/static/osh-support-programs/` | 소스 포함, 빌드 제외 |
| 소개 | `/datasets/osh-support-programs`, `supportProgramsPublic = true` (2026-10-01 공개) | 포함 |

## 수요 로그 저장 규칙 (`/nas/README.md` 준수)

- 분류는 `raw`다. 밖(이용자)에서 받아온 그대로이며 지우면 다시 받을 수 없다.
- 하루(KST) 폴더 `raw/demand-log-YYYYMMDD/`에 `MANIFEST.md`와 묶음별 JSON `<세션ID>-<순번 5자리>.json`. 서버는 `받은시각`만 덧붙인다.
- 파일은 추가만 한다. `os.link`로 배타적으로 만들어 같은 묶음이 다시 와도 첫 사본만 남는다(화면은 실패한 묶음을 바이트 그대로 재전송).
- NAS가 없으면(`/nas/README.md` 없음) `.6`의 `local_asset/support-programs-log/nas-pending/`에 같은 경로로 두고, 동기화 스크립트가 옮긴다. lanyard와 같은 방식이다.
- 지난 날짜 폴더는 `sync_support_programs_nas.py`가 쓰기 권한을 뗀다(규칙 1). 정기 실행은 아직 등록하지 않았다.
- NAS 경로는 `NAS_DATA` 환경변수(`osh-demo.service`에 이미 `/nas`, `RequiresMountsFor=/nas`)로 정한다.

### 받는 내용과 막는 것

- 형식은 패키지 DEMO.md 스키마 2(`text/plain` JSON, `sendBeacon`/`fetch keepalive`). 행동 9종(열기·갈래선택·범주선택·검색·조건변경·노출·품목펼침·링크이동·0건).
- 서버가 열·값을 모두 검사한다. 정의되지 않은 필드, 범위를 벗어난 값, 경로 문자가 들어간 ID는 422로 거부하고 저장하지 않는다. 본문 12KB 초과는 413, `text/plain`이 아니면 415, 출처(Origin)가 Hub가 아니면 403, 하루 2만 묶음 초과는 429.
- 이름·연락처·사업장명·IP·User-Agent는 받지도 저장하지도 않는다. 세션ID는 날짜 + 난수다.
- 화면 첫머리에 수집 고지(항목·목적·보관 "연구 종료 시 파기"·제3자 제공 없음)를 둔다. 문구는 제작자 원본 고지를 따랐다.
- 원본과 다른 점: 원본은 카드가 화면에 나오기 전에도 `노출`을 기록했다. 이용률(`링크이동 ÷ 노출`)이 부풀려지지 않도록 사업 카드가 실제로 보일 때만 기록한다. `판본`은 화면 소스의 SHA-256 앞 10자리(`react-…`)로 빌드 때 찍는다.

## v2 개정 (2026-10-01) — 분류 9개, 검색 순위, AI 조건 채우기

- **분류**: 제작자(ukbyun, 이 저장소 소유자) 결정으로 Hub 분류 9개를 붙였다. `programs.csv`·`items.csv`는 바꾸지 않고 `scripts/build_support_programs_categories.py`가 `2_자료/data/categories.csv`(사업ID·분류·원_지원범주, SHA-256 `7f33842e…`)를 만든다. 사업 114건이 정확히 한 번씩 들어가는지 스크립트와 테스트가 확인한다. 배포본은 v1 내용 + 이 파일 = `serving/osh-support-programs-20261001-v2`(60 파일).
- **검색**: 검색어가 사업을 지우지 않는다. 판정 타일은 검색어와 무관하고, 목록에서는 일치하는 사업을 앞에 둔다.
- **AI 조건 채우기**: `POST /demo/osh-support-programs/api/interpret`(`ai-api/app/support_programs_ai.py`). Claude Sonnet 5.5, 키는 `dever/claude_client.py` 설정. 공용 AI 예산(`app/budget.py`)에 `anthropic-support-programs`로 예약·정산, 하루 `SUPPORT_PROGRAMS_AI_DAILY_KRW`(기본 2,000원), 기기당 `SUPPORT_PROGRAMS_AI_PER_CLIENT`(기본 20회), 동시 4건. 화면 선택지(KSIC 98개·시·도·분류)를 도구 스키마 enum으로 주고, 서버가 다시 검사한다. 기본값이 아닌 칸은 근거 문구가 설명 안에 그대로 있어야 남는다. Sonnet 5.5는 강제 도구 호출(`tool_choice: tool`)을 받지 않아 `auto` + 프롬프트로 한 번 호출하게 했다.
- **설명 원문 기록**: 소유자 결정으로 원문을 남긴다. 보내기 전 서버가 전화번호·이메일·사업자번호를 가리고, 가린 글만 Anthropic으로 보내고 저장한다. 실패·한도 초과 요청도 `오류` 코드와 함께 저장한다. 같은 날짜 폴더에 `MANIFEST-AI.md`를 처음 한 번 추가한다(기존 `MANIFEST.md`는 그대로). 사업장명·사람 이름은 가리지 못하므로 외부 공유 전 확인이 필요하다.
- **로그 스키마 3**: `자료판`, 행동 `분류선택·분류해제·받는방식선택·받는방식해제·AI제안·AI적용·AI수정`, 필드 `분류·받는방식·항목·요청ID`. 서버는 스키마 2(갈래선택·범주선택)도 계속 받는다. `build_support_programs_demand.py`가 `interpretations.csv`를 따로 만든다.
- **확인하지 않은 것**: AI 제안의 정확도(시험 설명 3건만 봄), 공개 트래픽에서의 비용·지연.

## 남은 일

0. v2 운영 반영 — 2026-10-01 완료(`current` → v2, 14:51 UTC 관문 재시작). 다음 판본도 같은 순서: ① `nas-put osh-support-programs serving <v1 사본 + categories.csv 폴더> osh-support-programs` → ② `cd /nas/osh-support-programs/serving && ln -sfn osh-support-programs-20261001-v2 current` → ③ `npm run build:support-programs-demo --workspace web` → ④ `systemctl --user restart osh-demo` 후 `/health` 200 확인 → ⑤ 소개 페이지는 Hub 배포. ②를 ④보다 먼저 하면 v1 코드도 같은 `programs.csv`·`items.csv`를 읽으므로 문제가 없다. ③과 ④ 사이에는 새 화면이 옛 API를 보게 되므로 바로 이어서 한다.

1. 운영 반영: 커밋 → `.6` 관문(`osh-demo`) 재시작 → Hub 배포. 이 작업에서는 하지 않았다. 반영과 동시에 DEMO·요건표·로그 수신이 공개된다.
2. `sync_support_programs_nas.py` 정기 실행(타이머) 등록 여부.
3. 새 판본은 `nas-put osh-support-programs serving <폴더> osh-support-programs`로 새 버전 폴더를 만들고 `app/support_programs.py`의 고정 해시를 바꾼 뒤 `current` 전환 → 관문 재시작. 서비스는 `serving/current`만 읽고 NAS가 없으면 503(로컬 대체 없음).
4. 연구책임자·대표 연구자·가공 주체·공개 문의처·기관별 이용 조건 확인(공개 후에도 남은 일). 로그의 모집단 정의(제작자 권고: 무작위 방문자가 아닌 정해진 파일럿 대상).
5. KSIC ↔ 한글 업종명 대응표 정식화, 언론·민간 근거 25행 원문 대조, 품목 위험요인 사람 검토.
6. 가상 1,000세션 예시(`/nas/osh-support-programs/outputs/synthetic-demand-demo-20261001/`)와 `scripts/build_support_programs_demand.py`로 저장·가공·그래프 흐름을 확인했다. 실제 로그와 섞지 않는다.
