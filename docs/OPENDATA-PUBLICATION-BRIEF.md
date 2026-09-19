# 데이터 제작 가이드 공개 디자인 브리프

2026-09-19 · 기준: DESIGN-GUIDELINES.md / OSH Family Design 1.0

## 목적과 범위

협업자가 데이터 패키지 양식과 AI 지시문을 로그인 없이 받아 자료 제작을 시작한다. 데이터 찾기에 공개 제작 양식 카드를 등록하고 `/datasets/opendata-guide`에 사용 순서, 필수 7개 파일, Python 의존성, 연구자·버전 관리 설명을 제공한다. 자동 업로드 기능은 없다고 명시한다.

## 화면과 상태

Family Design 공통 색상·폰트·카드·버튼을 사용한다. 첫 화면의 주요 행동은 ZIP 다운로드다. 모바일에서는 카드가 한 열로 배치된다. 실제 연구자료가 아닌 템플릿이며 포함된 3행에는 DEMO 합성 예시를 명시한다. requirements.txt는 주석만 있는 양식이며 앱 설치 완료를 뜻하지 않는다.

## 파일과 보안

약 27KB의 문서 전용 ZIP을 정적 파일로 제공한다. 실제 연구자료·대용량 파일은 기존 object storage 정책을 따른다. exporter는 가이드·AI 지시문·템플릿 12개 파일의 명시적 목록만 읽고 경로 전체를 압축하지 않는다. 키·COPD 원본·로컬 설정은 포함하지 않는다. 번들 밖 참고 문서는 GitHub 공개 문서로 연결한다. ZIP manifest와 release JSON에 파일 크기·해시를 기록한다.

재생성: `python3 scripts/export-opendata-kit.py`. 버전 변경 시 exporter의 VERSION·날짜와 공개 문서를 함께 갱신하고 다운로드 해시를 확인한다. 가이드 문서 버전 1.2와 데이터 JSON 규약 버전 1.1은 각각 관리한다.

기존 필터의 float 기반 제목 배치는 새 카테고리 추가 검사에서 초기 너비 0 문제가 재현되어 제거했다. native fieldset/legend 흐름으로 배치하며 5가지 화면 너비를 확인한다.

## 검증

문서/JSON/manifest·합성 데이터 해시·ZIP 링크를 확인한다. 코드 lint·typecheck·unit·build와 데스크톱/모바일 E2E에서 공개 카드·다운로드 응답 해시·화면 넘침·Family Design 이동을 검사한다. 외부 연구자의 실제 Python 환경 재현 결과는 해당 제작자가 기록하며 이 양식의 검증과 구분한다.
