# OSH AI Hub

산업안전보건 데이터·AI 플랫폼의 첫 구현입니다. 현재는 **독립적인 디자인 프리뷰와 공개 합성 샘플 API**입니다.

## 실행

시스템 Node 20을 변경하지 않고 프로젝트 안에 Node 24를 설치합니다. npm 스크립트는 프로젝트 런타임을 사용합니다.

```bash
cd /home/shield/osh-ai-hub
npm ci
npm run dev
```

브라우저: http://localhost:3100

원격 서버에서는 VS Code의 Ports 기능으로 **3100**을 전달하거나 SSH 포트 포워딩을 사용하세요. 기존 사이트의 3000, 8600~8602, 3838 포트는 사용하지 않습니다. 개발·미리보기 서버는 기본적으로 127.0.0.1에만 바인딩합니다.

프로덕션 빌드 미리보기:

```bash
npm run build
npm start
```

## 구현된 기능

- 반응형 메인, 분야 탐색, 검색·필터·정렬과 URL 상태
- 12개 DEMO 자료의 상세·변수 설명·미리보기·CSV 다운로드
- 실제 샘플 카탈로그·데이터 API, 매개변수 검사, SHA256 다운로드 헤더
- Python·R·curl 문서, 코드 복사, 브라우저 API 실행, OpenAPI JSON
- 모델 목록·카드, 기존 분석 도구 소개 (연결 준비 중), 로컬 이미지 미리보기
- Google OAuth 시작·콜백 연결 코드와 미설정 안내
- API 키·사용량 화면 미리보기, 오류·404·빈 상태
- FastAPI liveness/readiness 기본 서비스
- 자료·버전·파일·역할·RLS 초기 SQL 마이그레이션

## 아직 운영 기능이 아닌 부분

Google 인증은 외부 프로젝트 설정과 실제 통합 검증이 필요합니다. 로그인 후 사용자 화면·세션 갱신·로그아웃·약관 동의·관리자 MFA 연결은 후속 구현입니다. 현재 API 키 화면은 인증된 사용자 정보를 조회하지 않으며 키를 만들지 않습니다.

DB migration은 작성된 초안이며 연결된 Supabase에서 실행·검증하지 않았습니다. 현재 웹 카탈로그는 `web/lib/catalog.ts`를 읽습니다. 데이터 적재·관리자 CRUD·저장소 대용량 업로드·서명 다운로드·개인 API 키·호출 제한·사용량·실제 모델 추론은 후속 단계입니다.

샘플 CSV는 수 KB의 합성 fixture이므로 웹에서 생성합니다. 운영 대용량 파일은 별도 object storage로 직접 전송해야 합니다. 모든 예제는 DEMO이며 실제 기관 자료나 검증된 모델 성능이 아닙니다.

## 디자인 가이드

새 DEMO AI와 도구 화면은 [공통 디자인 가이드](docs/DESIGN-GUIDELINES.md)를 기준으로 만들고, [디자인 브리프 양식](docs/DESIGN-BRIEF-TEMPLATE.md)으로 화면 구성을 공유합니다.

## 구조

- `web/`: Next.js App Router, TypeScript, CSS 디자인 시스템, 로컬 한글 글꼴
- `ai-api/`: Python/FastAPI 독립 서비스
- `supabase/migrations/`: 데이터 구조와 RLS 초안
- `docs/`: 조사, 프로젝트 설정, 다음 작업
- `compose.yaml`: loopback 8100의 AI 서비스

## DEMO 배포

이번 공개는 Supabase 연결 없이 진행합니다. Vercel의 Root Directory는 `web`, Production Branch는 `main`입니다. 기본 로그인은 비활성화되어 있으며, 기존 분석 앱도 연결하지 않습니다. 환경변수 없이 디자인·샘플 다운로드·API를 사용할 수 있습니다.

## Google 로그인과 배포

[새 Supabase·Vercel·Google 프로젝트 설정](docs/PROJECT-SETUP.md)을 먼저 읽으세요.
기존 프로젝트를 재사용하지 않습니다. 비밀 키는 저장소와 채팅에 넣지 않습니다.

실제 로그인은 후속 통합 완료 후 `ENABLE_GOOGLE_AUTH=true`로 명시적으로 켭니다. 환경변수는 `web/.env.example`에 있습니다. 실제 값은 `web/.env.local`에만 넣습니다. 인증 설정이 없어도 모든 공개 디자인 화면과 샘플 API를 실행할 수 있습니다.

## 검사

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

브라우저 설치:

```bash
./node_modules/node/bin/node ./node_modules/@playwright/test/cli.js install chromium
```

E2E는 인증 환경변수가 없는 디자인 프리뷰를 기준으로 하며 Google 실계정 인증 성공을 주장하지 않습니다. 3101 포트에 독립적인 테스트 서버를 실행하므로, 3100의 기존 미리보기 서버를 재사용하지 않습니다.

## AI 서비스

Gemini 키 저장 위치와 로컬 모델의 역할은 [로컬 AI 설정](docs/LOCAL-AI-SETUP.md)을 참고하세요.

```bash
cd ai-api
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/ruff check .
.venv/bin/pytest
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100
```

`GET /health`는 프로세스 상태를 반환합니다. 실제 모델이 없으므로 `GET /ready`와 `POST /inference/v1/image`는 503을 반환합니다.

저장소 루트에서 `docker compose config --quiet`로 설정을 검사하고 `docker compose up --build -d`로 실행할 수 있습니다. Docker 데몬 사용 권한이 필요합니다.

## 데이터베이스

새 개발 Supabase 프로젝트에서 마이그레이션을 검토한 뒤 적용합니다. 이미 사용 중인 DB에는 적용하지 않습니다. 초기 정책은 공개된 자료만 읽을 수 있고, 일반 사용자는 자신의 프로필만 수정할 수 있습니다. 역할·자료 쓰기와 private bucket 접근은 기본적으로 허용하지 않습니다.

[현재 상태와 다음 단계](docs/IMPLEMENTATION-STATUS.md)를 참고하세요.

## COPD 검토 DEMO

실제 COPD 자료를 사용하는 별도 검토 앱을 `/demo/copd/`에 연결한다. 키워드·로컬/Gemini 임베딩 검색, 원문·측정자료 확인, 로컬 Gemma 설명을 구현했다. 공개 합성 샘플과 구분하며 .3 Basic 인증 뒤에서 제공한다. 자료 배포·다운로드와 검색·답변 품질 평가는 완료되지 않았다.

[공통 관문 설정·UFW 요청](docs/DEMO-GATEWAY-REQUEST.md), [로컬 AI와 서비스 운영](docs/LOCAL-AI-SETUP.md), [데이터 검토](docs/COPD-DATASET-PROPOSAL.md)를 참고한다. .3 nginx 및 Vercel 최종 경로는 적용 후 검증이 필요하다.

## 실제 데이터와 음성 안내

홈과 데이터 목록은 실제 COPD 소개 카드만 공개한다. 합성 예제 카드는 관리자에게만 표시하며 개발자 샘플 API는 DEMO 상태로 유지한다. COPD 원문은 아직 Storage에 게시하지 않았다.

[Supabase Storage·Google 로그인 설정](docs/SUPABASE-GOOGLE-SETUP.md), [음성 안내 설계·예산 제한·검증 상태](docs/VOICE-DESIGN-BRIEF.md)를 참고한다. 음성 DEMO는 `/demo/voice/`이며 OpenAI 크레딧 부족으로 실제 음성 생성 검증 대기 중이다. 카드도 관리자에게만 표시한다.
