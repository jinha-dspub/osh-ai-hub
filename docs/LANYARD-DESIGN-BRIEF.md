# 안전대 죔줄 체결 판정 디자인 브리프

상태: 구현 완료 · 공개 전 (.3 nginx 공개 경로와 Anthropic 크레딧 대기)
작성일: 2026-09-30
기준: [OSH AI Hub 디자인 가이드](DESIGN-GUIDELINES.md)

## 목적

- 사용하는 사람: 건설현장 안전관리자, 산업안전 연구자, 일반 방문자
- 해결할 일 한 가지: 현장 사진에서 안전대 죔줄이 구조물에 체결되어 있는지 빠르게 확인
- 도구 설명 한 문장: 현장 사진을 올리면 작업자 안전대의 죔줄이 구조물에 걸려 있는지 AI가 판정합니다.
- 이번 작업 범위: 사진 1장 판정(1단계 검출·형태 규칙 + 선택 2단계 Claude), 판정 기록 축적, 이용자 의견 수집, 자료·모델 소개 페이지

## OSH Family Design 적용

- 적용 키트 버전: OSH Family Design 1.0 (소개 페이지), 도구 화면은 `globals.css` 토큰 + 음성 DEMO와 같은 패널 구성
- 공통 색상·Noto Sans KR Variable·카드 12px·버튼/입력 7px 적용: 적용
- 폰트 실제 로드 확인: 로컬 미리보기에서 확인
- 앱에 맞게 달라지는 레이아웃: 결과 칸이 넓다(0.8 : 1.2). 사진 위에 판정을 겹쳐 보여야 하기 때문
- 공통 스타일 예외: 판정 색(체결 `#0e4a9f`, 미체결 `#b42318`, 거치 `#8a4b00`, 불명 `#52627a`). 색만으로 구분하지 않고 번호·판정 글자를 함께 표시

## 입력과 결과

| 항목 | 결정 내용 |
|---|---|
| 입력 자료·형식·용량 | JPG·PNG·WEBP 20MB 이하 선택 → 브라우저에서 긴 변 1,600px JPG로 줄여 전송(서버 한도 4MB). 서버가 다시 인코딩해 EXIF 제거 |
| 주요 행동 버튼 | `체결 상태 판정` |
| 결과 형식 | 사진 위 죔줄 선·안전대 점선·작업자 네모, 판정별 개수, 죔줄별 표(최종·1단계·근거), Claude가 본 작업자 목록 |
| 다운로드 내용 | 없음 |
| 근거·출처 표시 | 판정 근거 코드(형태 규칙 R1~R7, Claude 체인), 배포본 이름 |
| 자료 전송·보관·삭제 | 1단계는 .6 서버 안에서만 처리. 2단계 선택 시 사진을 Anthropic으로 전송. 판정 기록(좌표·판정·의견)은 사진 없이 .6 로컬 SQLite에 저장. 사진은 보관 동의 시에만 .6 로컬에 저장. 2단계용 사진은 메모리에 최대 15분, 한 번 쓰면 삭제 |
| 로그인·권한 | 로그인 없음(공개). .3을 거친 요청만 받음 |

## 실제 연결 범위

- 실제로 작동하는 기능: 1단계 검출·형태 규칙(GPU 사진당 약 0.01초, 첫 요청은 CUDA 초기화로 약 1.3초 — .6 로컬 측정. GPU 여유 메모리가 2GB 미만이거나 메모리 부족이면 CPU 약 0.5초로 전환), 판정 기록·사진 보관·의견 저장, 사용량 한도
- DEMO 자료·예시 결과: 없음. 모든 결과는 이용자가 올린 사진의 실제 판정
- 연결 준비 중인 기능: 2단계 Claude 확인 — 코드와 테스트는 완료, 실제 호출은 2026-09-30 `credit balance is too low`(400)로 실패. 크레딧 충전 후 실제 사진 1장으로 확인 필요
- 확인하지 못한 외부 동작: Vercel 재작성 경로의 업로드 본문 한도·응답 시간, .3 nginx 공개 경로, Claude 응답 품질·시간

## 판정 구조

1. **배포본**: `/nas/보호구체결현황파악/serving/current` → `lanyard-analyzer-20260930-v1`만 읽는다. `ai-api/app/lanyard.py`의 `PINNED` sha256과 다르면 503. NAS는 누구나 파일을 바꿀 수 있어서 가중치(pickle)와 `rule_judge.py`를 검증 없이 실행하지 않는다. 새 배포본은 `RELEASE`·`PINNED`를 함께 바꾼다.
2. **1단계**: `LANYARD_DEVICE=auto`(여유 메모리가 가장 많은 GPU, torch 2.11.0+cu128 — 드라이버 570/CUDA 12.8용). YOLO11m-pose(imgsz 1600, conf 0.25) → 죔줄 7점·안전대 박스. 0번 점 기준으로 안전대 짝을 찾고 `rule_judge.judge_v05`(형태 규칙 v0.5) 적용.
3. **2단계**: `prompt_service.txt` 그대로 Claude Sonnet 5.5(effort medium)에 전송. 형태 규칙이 `불명`인 죔줄에만 `rule_judge.judge_chain`으로 Claude의 `clipped` 여부를 반영한다. 형태 규칙의 판정은 바꾸지 않는다.
   - 죔줄 ↔ 작업자 연결(0번 점이 들어간 가장 작은 작업자 네모)과 안전대 짝짓기는 이 서비스에서 새로 쓴 연결 코드다. 원 MVP(`mvp/web`, rag 서버)와 같은지 확인하지 못했다.
4. **키**: `dever/claude_client.py` → `dever/.env` → `local_asset/anthropic_api_key.txt`. 키는 브라우저·로그에 나가지 않는다.

## 비용 한도

- 공통 원장 `budget.py`(하루 8,000원) 안에서 이 도구 몫을 `LANYARD_DAILY_KRW`(기본 3,000원)로 따로 제한한다. 공개 도구가 다른 AI 기능 몫을 다 쓰지 않게 하기 위함.
- 요청마다 최악값(입력 5,500 + 출력 8,000토큰, $2/$10 per MTok, 3,000원/USD)으로 예약 → 실제 사용량으로 정산. API가 거절한 요청은 0원 정산, 결과를 모르는 오류(시간 초과·연결)는 예약 유지.
- 기기별 하루 1단계 30회·2단계 10회(`LANYARD_ANALYZE_PER_CLIENT`, `LANYARD_REVIEW_PER_CLIENT`). 기기 구분은 `X-Forwarded-For` 첫 값이라 위조할 수 있다 — 실제 방어선은 하루 한도와 .3 `limit_req`.
- 업로드 1건당 2단계는 1회, 올린 기기에서만 가능.

## 축적 데이터

`.6`의 `local_asset/lanyard-runs/`(git 제외, 0700):

| 파일 | 내용 |
|---|---|
| `runs.sqlite` `runs` | 판정 id, 시각, 배포본, 크기, 사진 sha256, 보관 여부, 1단계 결과, 2단계 결과·상태, 토큰 사용량 |
| `runs.sqlite` `feedback` | 판정 id, 시각, correct/wrong/unsure, 메모(300자) |
| `images/YYYY-MM-DD/<id>.jpg` | 보관 동의한 사진만 (EXIF 제거) |

NAS 규칙 3에 따라 서비스가 계속 쓰는 DB는 NAS에 두지 않는다. 모은 자료를 연구에 쓸 때는 서비스를 멈추지 않고 사본을 떠서 올린다:

```bash
sqlite3 local_asset/lanyard-runs/runs.sqlite ".backup /tmp/lanyard-runs-$(date +%Y%m%d).sqlite"
nas-put 보호구체결현황파악 raw <사본 폴더> osh-uploads   # raw/osh-uploads-YYYYMMDD/ + MANIFEST.md
```

MANIFEST에는 “이용자 업로드 · 보관 동의분만 · 개인 식별 가능 사진 포함 가능 · 외부 공유 금지”를 적는다.

## 화면 구성

- 데스크톱: 제목 → 왼쪽 사진 선택·2단계 선택·보관 동의·판정 버튼 → 오른쪽 상태·사진 위 판정·요약·표·Claude 작업자·의견
- 모바일: 같은 순서로 한 열, 표는 내부 가로 스크롤
- 공유할 화면: 로컬 미리보기 스크린샷(데스크톱 1280px, 모바일 360px) — 가로 넘침 없음 확인

| 상태 | 표시 문구 | 가능한 행동 |
|---|---|---|
| 초기 | 사진을 선택하면 판정을 시작할 수 있습니다. | 사진 선택 (버튼 비활성 이유 표시) |
| 입력 오류 | JPG·PNG·WEBP 사진만… / 20MB 이하… | 다른 사진 선택 |
| 업로드·처리 중 | 1단계: 죔줄과 안전대를 찾고 있습니다 → 2단계: Claude가 확인하고 있습니다 | 중복 실행 방지 |
| 성공 | 판정을 마쳤습니다. 죔줄 N개, 작업자 N명 | 의견 보내기, 다른 사진 |
| 빈 결과 | 죔줄을 찾지 못했습니다. 작업자와 죔줄이 크게 보이는 사진으로… | 다른 사진 |
| 실패·부분 실패 | 1단계 판정만 완료했습니다. 2단계 확인은 실패했습니다. + 원인 | 1단계 결과 확인, 다시 시도 |
| 한도 초과 | 오늘의 AI 이용 한도… / 이 기기에서 이용할 수 있는 판정 횟수… | 1단계만 사용 |

## 결정과 검증

- 사용자와 합의한 사항(2026-09-30): 로그인 없이 공개, 2단계 Claude 사용, 이용자 판정 결과 축적, `dever/`에 등록된 Anthropic 키 사용. AIHub 가공 데이터 공개 가능 여부는 사용자 판단.
- 임시 가정: 사진 보관은 개인정보(작업자 얼굴) 때문에 선택 동의로 둠. 도구 몫 하루 3,000원.
- 코드·브라우저 검증: ai-api 59개 테스트(공개 경로 범위·경로 우회, 해시 위조, 업로드 형식·용량, EXIF 제거, 보관 동의, 비용 몫 초과 시 호출 전 차단, 거절 0원 정산, 업로드 기기 바인딩, 기기 한도, 의견 한도), web lint·typecheck·unit. 실제 사진 3장으로 1단계 로컬 실행, 헤드리스 브라우저 데스크톱·모바일 업로드→판정→의견 흐름.
- 미해결: Anthropic 크레딧, .3 nginx 적용, osh-demo 재시작(작업 트리에 다른 미커밋 변경이 있어 보류), `lanyardPublic` 전환.
- 운영 배포 여부: 미배포.

## 공개 절차

1. Anthropic 크레딧 충전 → 로컬 미리보기에서 2단계 1회 확인.
2. `.6`: `ai-api/.venv`에 `pip install -e '.[lanyard]'`(패키지는 2026-09-30 설치 완료), `npm run build:lanyard-demo --workspace web`, `ai-api/deploy/osh-demo.service`를 `~/.config/systemd/user/`에 반영 후 `systemctl --user daemon-reload && systemctl --user restart osh-demo`.
3. `.3`: [nginx-lanyard.conf](../ai-api/deploy/nginx-lanyard.conf)를 `/demo/` location보다 앞에 추가, `nginx -t` 후 reload. 확인: 로그인 없이 `https://tools.osh.ai.kr/demo/lanyard/` 200, `/demo/copd/`는 여전히 401.
4. Hub: `web/lib/catalog.ts`의 `lanyardPublic = true` → 커밋·Vercel 배포. 그 전까지 도구 카드·소개 페이지는 관리자에게만 보인다.
