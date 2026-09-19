# osh.ai.kr · Supabase Storage와 Google 로그인 설정

작성: 2026-09-18. 현재 저장소 설정을 기준으로 한 안내. 외부 콘솔 설정·실계정 로그인·Storage 업로드를 완료했다는 뜻은 아니다.

## 1. 사용할 Supabase 프로젝트

Supabase 대시보드에서 OSH AI Hub 전용 프로젝트를 선택한다. 유료 플랜만 결제하고 프로젝트가 없다면 새 프로젝트를 만든다. 기존 프로젝트를 무조건 새로 만들거나 초기화할 필요는 없다. Project URL과 Publishable key는 프로젝트의 Connect 또는 Settings → API Keys에서 확인한다.

- `NEXT_PUBLIC_SUPABASE_URL`: `https://프로젝트REF.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Publishable key. 공개 클라이언트용이며 DB 접근은 RLS로 제한한다.
- Secret key / legacy service_role key는 관리 작업 전용이다. `NEXT_PUBLIC_` 변수나 브라우저에 넣지 않는다.
- DB 비밀번호는 Google 로그인 설정에 필요하지 않다.

## 2. Google 로그인 — Gmail과 Google Workspace

Google 로그인과 Gmail 주소만 허용하는 정책은 다르다. 이 사이트는 Google을 로그인 제공자로 사용한다. 일반 `@gmail.com` 계정과 Google Workspace 계정을 함께 허용하는 구성이 적절하다. `jinha@dspubs.org`가 Workspace/Google 계정이면 같은 버튼으로 로그인한다. 로그인만으로 관리자가 되지는 않는다.

1. Google Cloud Console → Google Auth Platform에서 OSH AI Hub 프로젝트를 선택하거나 만든다.
2. Branding: 앱 이름 `OSH AI Hub`, 사용자 지원 이메일과 개발자 연락처를 입력한다. 운영 공개 시 실제 서비스 홈페이지·개인정보처리방침·약관 주소를 사용한다.
3. Audience: 일반 Gmail 이용자도 받으려면 **External**. 테스트 중에는 **Test users**에 사용할 Gmail과 관리자 Google 계정을 추가한다. 공개 이용 전 Publishing status를 Production으로 전환한다. 콘솔이 요구하는 브랜드/도메인 검증은 별도로 완료한다.
4. Data Access: 기본 `openid`, 이메일, 프로필만 사용한다. Gmail 메일함 읽기나 Drive 권한은 필요 없다.
5. Clients → Create client → **Web application**.
6. Authorized JavaScript origins: `https://osh.ai.kr`.
7. Authorized redirect URIs: **Supabase → Authentication → Sign In / Providers → Google에 표시되는 Callback URL을 그대로 복사**한다. 보통 `https://프로젝트REF.supabase.co/auth/v1/callback`이다. 여기에 osh.ai.kr/auth/callback을 대신 넣으면 안 된다.
8. 생성한 Client ID와 Client Secret을 Supabase의 Google provider에 입력하고 활성화한다. Google Client Secret은 Supabase 콘솔에만 저장하면 된다.

## 3. Supabase로 돌아와 URL 설정

Authentication → URL Configuration:

| 항목 | 값 |
|---|---|
| Site URL | `https://osh.ai.kr` |
| Redirect URLs | `https://osh.ai.kr/auth/callback` |
| 로컬 테스트를 할 때만 추가 | `http://localhost:3100/auth/callback` |

Google 콘솔의 callback은 **Google → Supabase**, 위 Redirect URL은 **Supabase → 우리 사이트**이다. Google provider만 켜고 다른 제공자·이메일 비밀번호 로그인은 이번 범위에서 사용하지 않는다.

## 4. 앱 환경변수

로컬은 Git에서 제외된 `web/.env.local`, 실제 사이트는 Vercel → OSH AI Hub project → Settings → Environment Variables에 설정한다. 로컬 파일은 Vercel에 자동 전달되지 않는다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://프로젝트REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=프로젝트의_Publishable_key
APP_URL=https://osh.ai.kr
ENABLE_GOOGLE_AUTH=true
```

2026-09-19: 로그인 시작·callback·세션 갱신·내 계정·로그아웃 UI를 구현했다. 콘솔 설정과 위 네 환경변수를 등록하고 재배포한다. `/login`에서 실제 Google 계정으로 로그인·새로고침·로그아웃을 확인한다. 로컬 테스트의 APP_URL은 `http://localhost:3100`이다. 운영과 Preview 환경의 APP_URL 및 허용 callback을 섞지 않는다. 비활성화하려면 ENABLE_GOOGLE_AUTH=false로 설정하고 재배포한다. [구현·검증 범위](GOOGLE-LOGIN-DESIGN-BRIEF.md).

관리자 권한은 검증된 사용자 UUID에 대한 서버 관리 `role_assignments`로 부여한다. 자기 프로필이나 이메일 입력만으로 관리자 역할을 부여하지 않는다. 기존 migration은 초안이므로 원격 DB 현황을 확인한 뒤 적용한다.

## 5. COPD 파일용 Storage

Storage → New bucket:

- 이름: `copd-research`
- **Public bucket: OFF** (검토 중 원문은 비공개)
- 300 MB 단일 파일을 올릴 계획이면 프로젝트 전역 및 bucket 파일 크기 제한을 실제 파일보다 크게 설정한다. 예: 512 MB. 폴더 전체 합계가 300 MB인 경우 개별 파일 크기를 기준으로 한다.
- 예시 저장 경로: `copd/2026-09-17/source.zip`, `copd/2026-09-17/index.xlsx`, `copd/2026-09-17/README.md`. 실제 존재하는 파일만 등록한다.
- 큰 파일은 Storage로 직접 TUS 재개 업로드한다. Next/Vercel API가 파일 본문을 중계하지 않는다.
- bucket만 만들면 일반 이용자는 다운로드할 수 없다. RLS와 연구자료 접근 정책을 정한 뒤, 권한을 확인한 서버가 짧은 유효기간의 signed URL을 발급하고 브라우저가 Storage에서 직접 다운로드하게 연결한다.
- 현재 홈·데이터 목록에 노출하는 것은 COPD **소개 메타데이터**다. 원문을 Storage에 업로드하거나 공개했다는 의미가 아니다.

기존 `local_asset/supabase_storage.json`은 관리 작업용 로컬 설정 자리다. 값은 채팅에 붙이지 않는다. Google 로그인용 publishable key와 Storage 관리용 secret key는 역할이 다르다. Hugging Face 게시는 계획하지 않는다.

## 확인 순서

Google 테스트 계정 로그인 → callback 성공 → 새로고침/만료 후 세션 갱신 → 로그아웃 → 일반 사용자 관리자 페이지 차단 → 승인 사용자만 private 파일 다운로드. 각 단계가 실제 환경에서 확인되어야 운영 완료다. `.3`의 기존 DEMO Basic 인증은 별개이며 Google 설정만으로 사라지지 않는다.

공식 문서:
- [Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

2026-09-18 업데이트: copd-research의 private 상태와 실제 연결을 확인했다. 원본 5개 배포 객체를 업로드·해시 검증했으며, 기존 인증 관문에서 60초 signed URL로 다운로드한다. [구현·접근 정책](COPD-DOWNLOAD-DESIGN-BRIEF.md). Google 로그인 통합은 별도다.

## 이번 프로젝트에 입력할 주소

- Google Authorized JavaScript origins: `https://osh.ai.kr`
- Google Authorized redirect URIs: `https://wrtpuznoqrjgxfdqpqpf.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://osh.ai.kr`
- Supabase Redirect URLs: `https://osh.ai.kr/auth/callback`
- Publishable key 위치: Supabase → Settings → API Keys → Publishable key (`sb_publishable_`로 시작).
- Google Client Secret은 Supabase Google provider에만 입력. Vercel에는 넣지 않는다.
- Vercel의 Production 네 환경변수 등록 후 Git 배포. 기존 CLI 인증은 자동 갱신으로 복구했다. Production의 Supabase 두 변수를 확인하고 누락된 APP_URL과 ENABLE_GOOGLE_AUTH를 등록했다.
