# 구현 현황

작성: 2026-09-12

## 환경 조사

- 작업 시작 시 /home/shield에는 기존 앱 저장소나 새 플랫폼 저장소가 없었다.
- 시스템 Node 20.20.2, npm 10.8.2, Python 3.12.3, Git 2.43.0.
- Docker Compose v5.1.1 확인.
- osh-portal, osh-autoinds, osh-indscancer는 arc 계정에서 active 상태이며 /home/arc/shield_open 하위 경로를 사용한다.
- shiny-server도 active. 실제 앱별 동작은 조사하지 않았다.
- /home/arc/shield_open은 현재 계정에서 읽기 권한이 없다.
- 기존 3000, 3838, 8600~8602 포트 등은 사용 중이다. 새 프리뷰는 127.0.0.1:3100으로 분리한다.
- 기존 서비스·계정·프록시·DNS는 수정하지 않았다.

## 첫 구현의 범위

디자인 핵심 화면, 공개 DEMO 데이터 탐색·다운로드·API, 로그인 시작/콜백 코드, AI 서비스 skeleton, DB/RLS 초안.

Next.js, Supabase API 사용법은 구현 시 공식 문서를 확인했다:
- https://nextjs.org/docs/app/getting-started/installation
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/social-login/auth-google

## 다음 단계

1. 사용자와 데스크톱·모바일 시안 리뷰.
2. 새 Supabase/Vercel/Google 프로젝트 설정.
3. 실제 Google 인증, 세션 갱신, 로그아웃, 약관 동의와 프로필 구현.
4. 새 개발 DB에서 migration 실행 및 RLS 역할별 통합 테스트.
5. 카탈로그의 DB 읽기 연결, 관리자·제공자 CRUD와 MFA.
6. 원자료 확보·검수·버전 적재와 object storage 직접 전송.
7. 개인 API 키 저장·검증·폐기·한도·사용량.
8. 실제 모델 가중치 확보·검증 및 추론 통합.
9. 기존 분석 앱별 점검과 URL 전환.
10. 백업 복원·운영 점검 후 도메인 전환.

## 제한 사항

- 외부 인증 설정 없이는 로그인 불가. 현재의 API 키 화면은 정적인 미리보기이며 계정 정보를 표시하지 않는다.
- 실제 통계·이미지·학습 가중치가 없다. DEMO 데이터는 연구 근거로 사용할 수 없다.
- 샘플 API에는 운영용 키 인증·rate limiting이 없다. 소규모 프리뷰용이다.
- DB/RLS 파일은 원격 DB에 미적용. 실행 검증 전 운영 적용 금지.
- FastAPI readiness는 실제 모델을 연결하기 전까지 503이 정상이다.
- 웹은 모듈화된 CSS 디자인 시스템을 사용한다. Tailwind/shadcn은 현재 의존성에 추가하지 않았다.

## 2026-09-13 점검

- 이미지 미리보기의 URL 생성과 정리를 이벤트·정리 효과로 분리했다.
- 소스 포맷을 정리했고 린트가 통과했다.
- 사용자가 만든 원격 저장소를 origin으로 등록했다: https://github.com/jinha-dspub/osh-ai-hub.git
- 외부 연결 메모에 Supabase URL·Publishable key·Vercel 주소가 입력된 것을 확인했다. 실제 값은 로그에 출력하지 않았다.
- Google OAuth와 Supabase Google 공급자는 메모상 미설정이다. 원격 대시보드의 실제 상태는 확인하지 않았다.
- 운영 도메인 전환은 미실행. 기존 분석 앱을 별도 호스트로 유지하는 방안을 제안했으며 확정·적용 전이다.

## 첫 GitHub 공개 범위

사용자 지시: GitHub 업로드를 먼저 진행하고 연결된 Vercel로 DEMO를 배포한다. Supabase는 연결하지 않으며 기존 분석 앱 연결은 후속 단계로 미룬다.

- 분석 앱 링크를 연결 준비 중 상태로 변경했다.
- Google 인증은 명시적인 ENABLE_GOOGLE_AUTH=true 설정 전까지 비활성화한다.
- 기존 서비스·DNS·운영 데이터는 변경하지 않는다.


## 2026-09-16 도구 바로가기

- `/tools/`에 한글 변환기(HWPX)와 건강검진 확인(My Health Exam) 바로가기를 배치했다.
- 연결 주소: `https://tools.osh.ai.kr/hwpx/`, `https://tools.osh.ai.kr/myhealthexam/`.
- 확인 시 한글 변환기는 HTTP 200, 건강검진 확인은 HTTP 404였다. 건강검진 카드는 연결 준비 중으로 표시한다. 공개 연결 후 안내 문구를 갱신해야 한다.
- 건강검진 공개 연결에는 해당 프로젝트의 `deploy/nginx-location.conf`에 따른 외부 프록시 설정이 필요하다. 이번 변경에서는 서비스·포트·프록시를 수정하지 않았다.
- 실제 문서 변환, 본인인증 및 건강검진 조회는 이번 작업에서 검증하지 않았다. Hub 운영 반영 여부는 배포 후 별도 확인이 필요하다.

## 2026-09-17 초안 노출 정리

미완성 기능은 서버에서 관리자 역할을 확인한 경우에만 표시한다. 공개 화면·직접 URL·인증 미설정 시 동작은 [초안 공개 기준](DRAFT-VISIBILITY.md)을 참고한다. Google 로그인과 원본 다운로드 도입은 다음 작업으로 보류했다.
