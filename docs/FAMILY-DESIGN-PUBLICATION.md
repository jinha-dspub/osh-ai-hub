# OSH Family Design 공개 디자인 브리프

작성일: 2026-09-19 · 기준: [공통 디자인 가이드](DESIGN-GUIDELINES.md)

## 목적과 범위

다른 앱 제작자와 AI가 OSH의 색상·폰트·카드·버튼을 공유한다. 사용자가 요청한 데이터 찾기 공개 카드와 `/datasets/family-design`에서 키트를 배포한다. 공통 CSS·사용법·예시 HTML·Noto Sans KR Variable 폰트와 SIL OFL 라이선스를 ZIP에 포함한다.

## 화면과 동작

- 데이터 찾기: 디자인 리소스 분야와 ZIP 형식으로 검색·필터링한다.
- 상세 화면: 키트 다운로드 → 사용 순서 → 색상 → 실제 입력·버튼·표 예시 → AI 지시문 → 개별 다운로드.
- OSH Family Design 1.0을 적용한다. 모바일은 한 열, 표만 내부 스크롤을 사용한다.
- 합성 예시 3개는 DEMO로 표시하고 브라우저에서만 검색한다. 빈 결과를 안내하고 초기화할 수 있다.
- 지시문 복사는 실제 clipboard 성공 후 알린다. 거부되면 직접 선택·복사를 안내한다.
- 공개 디자인 파일은 로그인 없이 Supabase Storage에서 직접 받는다. 연구자료와 인증 정책은 변경하지 않는다.

## 파일 배포

`osh-design-assets` 공개 버킷에 디자인 파일만 업로드했다. `family-design/1.0/<ZIP SHA256 앞 16자리>/` 경로를 사용하고 덮어쓰지 않는다. 기존 `copd-research` 비공개 버킷은 유지한다. 공개 URL·크기·해시는 `web/lib/family-design-release.json`에 기록한다. 비밀 키는 포함하지 않는다.

키트 재생성: `python3 design/osh-family/export.py --output local_asset/<새 출력 폴더>`.
폰트가 설치된 저장소에서 실행한다. 새 버전은 ZIP manifest 검증, 별도 경로 업로드 및 공개 다운로드 바이트·해시 확인 후 release JSON을 갱신한다. 문서만 고쳐도 기존 업로드 파일은 자동으로 바뀌지 않는다.

## 함께 수정한 기존 필터

실서비스 데스크톱에서 floated legend 옆 첫 label의 너비가 0이 되는 문제를 재현했다. label이 제목 아래에서 시작하도록 clear를 적용한다. 1440·1024·851px 및 360·393px에서 첫 선택 항목의 너비·위치와 페이지 넘침을 검사한다.

## 검증 상태

공개 파일 3개의 다운로드 바이트와 attachment 헤더를 검증했다. ZIP은 폰트 라이선스와 파일별 manifest를 포함한다. lint·typecheck·단위 검사 35개·프로덕션 빌드 및 데스크톱/모바일 E2E 32개가 통과했다. 필터 배치 5가지 너비, 디자인 예시 검색·빈 결과·초기화, clipboard 거부 안내, 공개 다운로드 연결을 확인했다. 운영 배포 결과는 배포 후 별도로 확인한다.
