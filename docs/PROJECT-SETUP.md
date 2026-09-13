# 새 프로젝트 설정 안내

2026-09-13 결정: **이번 배포는 DEMO로 진행**합니다. GitHub와 Vercel만 연결하고 Supabase·Google 설정은 후속 단계로 둡니다. 현재는 환경변수가 필요하지 않습니다. 아래 Supabase·Google 절차는 실제 회원 기능을 개발할 때 적용합니다.

## 1. 반드시 새 프로젝트로 분리

사용자 지시(2026-09-12): Supabase와 Vercel에는 이미 다른 프로젝트가 있으므로 **둘 다 새 프로젝트**로 만든다.

- 새 이름 제안: `osh-ai-hub`
- 기존 DB, 인증 공급자, 환경변수, DNS, 도메인 설정은 재사용하거나 덮어쓰지 않는다.
- Google Cloud도 별도 프로젝트를 권장한다.
- 아직 `osh.ai.kr`을 Vercel에 연결하거나 기존 DNS를 변경하지 않는다.

## 2. Supabase — 사용자가 준비할 것

1. 원하는 조직에서 새 프로젝트를 만든다.
2. 이름을 `osh-ai-hub`로 정하고, 강한 DB 비밀번호를 비밀번호 관리자에 보관한다.
3. 주 사용자와 AI 서버의 위치를 고려해 가까운 리전을 선택한다.
4. 프로젝트의 **Project URL**과 **Publishable key**를 확인한다.
5. Google 인증 설정에 표시된 **Supabase callback URL**을 복사해 둔다.

프로젝트 URL과 Publishable key는 웹 연결에 사용한다. DB 비밀번호, Secret key, service_role 키는 채팅으로 보내지 않는다. 현재 프리뷰에는 service_role 키가 필요하지 않다.

## 3. Google Cloud — 로그인 설정

1. 별도 프로젝트에서 OAuth 동의 화면을 구성한다.
2. 테스트 단계에서는 테스트 사용자 계정을 등록한다.
3. 웹 애플리케이션용 OAuth Client ID와 Client Secret을 만든다.
4. Authorized redirect URI에 **Supabase 대시보드가 표시한 callback URL**을 정확히 입력한다.
5. Client ID와 Secret을 **새 Supabase 프로젝트**의 Google 공급자 설정에 입력하고 활성화한다.

Google에 등록하는 주소는 일반적으로 `https://<project-ref>.supabase.co/auth/v1/callback` 형태다. 직접 추측하지 말고 대시보드의 값을 사용한다.

Google의 callback과 우리 웹의 callback은 서로 다르다:
- Google → Supabase: Supabase가 표시한 `/auth/v1/callback`
- Supabase → 웹: 웹 주소의 `/auth/callback`

공식 가이드: https://supabase.com/docs/guides/auth/social-login/auth-google

## 4. Vercel — 저장소 준비 후 새 프로젝트 연결

1. 새 Git 저장소 `osh-ai-hub`를 준비한다. 로컬 구현만으로 원격 저장소가 자동 생성되지는 않는다.
2. Vercel에서 Add New Project로 그 저장소를 가져온다.
3. Framework는 Next.js, **Root Directory는 web**으로 설정한다.
4. 모노레포의 루트 package-lock과 workspace를 설치할 수 있도록 Root Directory 밖의 파일 포함 설정을 확인한다.
5. Node.js는 **24.x**를 선택한다.
6. 기본 빌드 명령은 `npm run build`이며 root directory가 web인 상태에서 실행한다.
7. 우선 기본 Vercel 프로젝트 주소에서 공개 화면을 확인한다.

Vercel 실제 프로젝트 설정 화면에서 모노레포 감지 결과와 설치 로그를 확인해야 한다. 현재 코드에는 Vercel CLI 배포나 원격 저장소 생성이 실행되어 있지 않다.

## 5. 환경변수

Vercel의 새 프로젝트와 로컬 `web/.env.local`에 다음 세 값을 설정한다.

| 이름 | 값 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | 새 Supabase Project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 새 프로젝트의 Publishable key |
| APP_URL | 해당 배포의 정확한 웹 origin. 끝의 /는 생략 권장 |
| ENABLE_GOOGLE_AUTH | 실제 로그인 통합이 완료된 뒤에만 true. DEMO는 미설정 또는 false |

로컬 예제:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
APP_URL=http://localhost:3100
```

APP_URL은 로컬, 검증, 운영에서 각각 다르다. 로그인 POST 요청의 origin과 일치해야 한다. localhost와 127.0.0.1을 섞으면 거부될 수 있다.

## 6. Supabase의 웹 복귀 URL

- Site URL: 검증에 사용할 고정 웹 주소
- Redirect URL 허용 목록: `http://localhost:3100/auth/callback` 및 정확한 검증 사이트의 `/auth/callback`
- 무분별하게 모든 Vercel 프로젝트를 허용하는 와일드카드를 추가하지 않는다.
- 정식 전환 시 `https://osh.ai.kr/auth/callback`과 APP_URL을 함께 변경한다.

환경변수 변경 뒤 웹을 다시 배포·실행한다. 로그인 버튼이 활성화되어도 실제 통합 테스트 전에는 설정이 완료되었다고 단정하지 않는다.

## 7. 내가 진행할 작업

- 저장소·화면·공개 샘플 API 구현과 테스트
- 마이그레이션 검토 및 적용 절차 준비
- Google 로그인 연결 검증과 세션·로그아웃·회원 프로필 완성
- 관리자 MFA와 권한, 업로드, 개인 API 키·한도 연결
- 검증 배포 확인 후 도메인 전환안을 준비

실제 OAuth 계정, 조직 결제, Google 동의 화면과 비밀 키 입력은 계정 소유자가 처리해야 한다. 필요한 경우 설정된 환경변수의 이름과 존재 여부만 확인하고 원문은 출력하지 않는다.
