# 기업·기관 안전보건 공개정보 인수 검토

검토일: 2026-10-01 · 대상: `dever/ukbyun/osh_hub_v1.zip` (자료 ID `corporate-ohs-disclosures`, 1.0.0-internal-rc2.2, 2026-10-01)
범위: 압축 해제, 무결성 확인, Hub 연결(공개 소개 + DEMO + 파일 다운로드).

## 판단

KRX ESG 보고서·ALIO·DART·고용노동부 산재공표를 기업·기관 47곳 단위로 연결한 **실제 자료**다. 합성 행은 없다. 패키지에 빌드가 끝난 정적 앱(`demo/`)과 불변 릴리스(`release/rc2_2/`, 50개 파일)가 함께 들어 있어서, 화면을 새로 만들지 않고 받은 그대로 서비스한다.

**공개 결정:** 패키지 `ACCESS.md`는 소개·DEMO·다운로드의 공개 대상(audience)을 모두 `none`으로, 외부 공개 상태를 `PUBLIC_EXTERNAL_RELEASE_PENDING_RIGHTS_REVIEW`로 적었다. 원천별 권리 검토 HR01~HR07은 미결정이다. 2026-10-01 Hub 소유자가 전면 공개를 결정했고(`corporateOhsPublic = true`), 소개 페이지에 권리 미확인·단일 라이선스 미선언을 그대로 밝혔다. 연구책임자·가공 주체·공개 문의처는 여전히 미확인이다.

## 직접 확인한 내용

| 항목 | 결과 |
|---|---|
| 압축 | 248개 파일, 모두 `opendata/corporate-ohs-disclosures/` 아래. ZIP SHA-256 `885f29fa…86ebb2` |
| 해시 | `files.csv`에 해시가 있는 221개 파일 모두 일치. 27개는 키트 1.2 규칙상 설명 문서라 해시 없음 |
| 기간 | ESG 보고연도 2021–2025, ALIO 2023–2026, DART 2024–2026-09-28, 산재공표 2024·2025년 목록(실적 2018–2024) |
| DEMO | 실제 관문 코드로 실행. 5개 메뉴·기업 상세·CSV/ZIP 다운로드·390px 모바일(가로 넘침 0) 정상, 외부 요청 0, 콘솔 오류 0 |
| 첫 로딩 | 요청 27개(폰트 14개). 6.0MB 데이터 JS는 gzip으로 350KB |

## 배치

| 무엇 | 위치 | git |
|---|---|---|
| 받은 압축본 | `/nas/corporate-ohs-disclosures/raw/ukbyun-handoff-20261001/` + MANIFEST | 제외 |
| 서비스 배포본 | `serving/corporate-ohs-disclosures-20261001-v1/`(받은 그대로, 롤백용), `…-v2/`(화면 문구만 수정, `current`) | 제외 |
| 관문 | `ai-api/app/corporate_ohs.py` → `/demo/corporate-ohs-disclosures/demo/`, `.../release/rc2_2/` | 코드만 |
| 소개 | `/datasets/corporate-ohs-disclosures` | 포함 |

`dever/`는 `.gitignore`에 추가했다(저장소는 GitHub PUBLIC).

## 관문 동작

- `serving/current`의 `files.csv`에 올라 있는 `demo/`·`release/rc2_2/` 파일 189개만 내보낸다. 목록에 없는 파일, 루트 분석용 사본(`data/` 등 release와 바이트 동일), 경로 이탈 요청은 404다.
- 189개 파일의 (경로, SHA-256) 전체를 다이제스트 하나(`RELEASE_DIGEST`)로 고정한다. 파일이 바뀌거나 늘거나 빠지면 503이다. 해시가 없는 MD도 이 다이제스트로 고정된다.
- 189개 파일은 v2 기준이다. v1과 다른 파일은 `demo/index.html`, `demo/content-family.js`, `demo/rc2-design.js`(문구)와 비공개 `files.csv`(해당 3행의 bytes·sha256)뿐이다.
- osh.ai.kr의 `/demo/:path*` rewrite는 끝 `/`를 떼어 넘긴다. 패키지 앱은 상대경로를 쓰므로 `demo/index.html`에 `<base href="/demo/corporate-ohs-disclosures/demo/">`를 넣어 내보낸다. 그 외 바이트는 바꾸지 않는다.
- 패키지 앱은 막대그래프를 인라인 `style` 속성으로 그린다. 이 경로만 CSP `style-src 'self' 'unsafe-inline'`이고, 스크립트는 `'self'`만 허용한다. 공통 미들웨어는 경로가 CSP를 정하지 않았을 때만 기본값을 넣도록 바꿨다(`copd_demo.py`, 다른 경로의 CSP는 그대로).
- 파일은 모두 1MB 이하(데이터 JS 6MB는 화면 의존 파일)여서 object storage 대신 다른 DEMO 자산과 같이 관문에서 내보낸다. 텍스트는 gzip으로 보낸다.

## 남은 일

1. HR01~HR07 원천별 권리 확인, 연구책임자·가공 주체·공개 문의처·갱신 담당자 확인.
2. 2026-10-01 소유자 요청으로 v2에서 화면의 "사내·연구팀 후보", "검토용 MVP", "최종 공개본이 아닙니다", "권리 검토 중" 문구를 지웠다(demo 파일 3개, 변경 목록은 v2 `RELEASE.md`). 권리 안내는 "원천별 이용조건이 다르므로 재배포 전 각 원천의 조건을 확인하세요"로 남겼다. 데이터 값, `release/rc2_2/`와 다운로드 ZIP 안의 제작자 문서는 바꾸지 않았다. 다음 판본은 제작자가 공개판 문구로 만들어 주도록 요청한다.
3. `.3` nginx 요청 제한(빠른 요청 약 30개 후 HTML 429)에 첫 로딩 27개 요청이 가깝다. 메뉴를 옮기며 폰트 조각이 더 내려오면 429가 날 수 있어 운영 주소에서 확인한다.
4. 새 판본: `nas-put corporate-ohs-disclosures serving <폴더>` → `corporate_ohs.py`의 `RELEASE_DIGEST` 갱신 → `current` 전환 → 관문 재시작.
5. 기존 실패: `tests/test_lanyard.py` 3개는 이번 변경 전 HEAD에서도 실패한다(NAS 경로 관련, 이번 작업과 무관).
