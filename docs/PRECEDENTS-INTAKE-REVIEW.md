# 산업안전 판례 데이터 인수 검토

검토일: 2026-10-06 · 대상: `/nas/safetybread/processed/osh-precedents-20261006-v1/` (자료 ID `osh-precedents`, 1.0.0, 제작 변재욱)
범위: 패키지 확인, 서비스 배포본(v1·v2), Hub 연결(소개 + 참조 앱 그대로 + Storage 다운로드).

## 판단

대법원 사법정보공개포털의 공개 판결문 169건(선고 1985~2026)과 그 가공물(사건 카드 106·조문별 판단 151·선고형 86·인용 조문 1,405·구간 4,632·벡터 4,883)이다. **실제 자료**이며 합성 행은 없다. 패키지에 읽기 전용 FastAPI + Jinja2 검색 앱이 들어 있고, 관문 venv와 같은 fastapi 0.141.1·starlette 1.6.0·jinja2 3.1.6로 고정되어 있어 **참조 앱을 그대로 관문에 올렸다**(의미검색은 모델이 없어 끔).

**공개 결정:** 패키지 `ACCESS.md`는 네 기능 모두 `review`/`public`이고, 포털 이용약관·가공물 라이선스·공개 문의처가 미확인이다. 이름 삭제는 규칙 기반(515곳)이고 사람 표본 검수가 없었다. 2026-10-06 자료 소유자가 "기계로 제거했고 눈으로 확인했다"며 공개를 결정했고, 본문에 남아 있던 이름 표기 4종(대리인·변호사 이름 2, 법무법인명 2)을 지우라고 지시해 배포본 v2에서 지웠다. 소개 페이지에 삭제 방식과 남은 미확인 사항을 그대로 적었다.

## 직접 확인한 내용

| 항목 | 결과 |
|---|---|
| 패키지 | 184개 파일(`files.csv`), `reports/validation.json` 45 통과. 잔여 후보 26건은 전부 "검사 결과"류 일반 낱말 |
| 이름 잔여 검사 | 직함(판사·검사·변호사·대리인·법무법인) 뒤 낱말 38종을 전수 확인. 사람 이름 2, 법인명 2를 제외하면 일반 낱말 |
| 배포본 v1 | `nas-put`으로 그대로 복사(342개 파일, 차이 0건). 다이제스트 `fc8fef4b…` |
| 배포본 v2 | v1 복사본에서 4종 표기를 `[삭제: 이름]`으로 치환: `data/chunks.csv` 4곳, 판결문 3건 5곳. 릴리스 zip 재생성, `files.csv` 5행 해시·크기 갱신, `CHANGES-v2.md` 기록. 잔여 0건. 343개 파일, 다이제스트 `bece3259…`, `current` |
| 참조 앱 | 관문에 마운트해 `/`, 검색, `/about`, `/api/status`(169건·문서 4,883), 정적 CSS 200. 링크는 `root_path` 기준. 첫 적재 0.7초 |
| 패키지 자체 점검 | 제작자 smoke test 33개는 이 세션의 권한 제한으로 실행하지 못함(유사어휘 패키지의 같은 테스트는 40개 통과) |
| 검사 | ai-api ruff·pytest 통과(`test_safetybread_apps.py` 7개 포함), web lint·typecheck·vitest·next build |

## 배치

| 무엇 | 위치 | git |
|---|---|---|
| 인계 패키지 | `/nas/safetybread/processed/osh-precedents-20261006-v1/` | 제외 |
| 배포본 | `/nas/osh-precedents/serving/osh-precedents-20261006-v1` (롤백용), `…-v2` (`current`) | 제외 |
| 관문 | `ai-api/app/safetybread_apps.py` → `/demo/osh-precedents/` (마운트), `/download/<id>` (서명 주소), `/api/downloads` | 코드만 |
| 소개 | `web/app/datasets/osh-precedents/page.tsx`, `web/lib/catalog.ts`(`precedentsDataset`, `precedentsPublic`) | 포함 |
| 다운로드 | 버킷 `osh-precedents-research`, 접두 `osh-precedents/1.0.0/<해시16>/`, 매니페스트 `local_asset/osh-precedents-storage-manifest.json` | 제외 |

## 관문 동작

- 배포본 전체 파일(RELEASE.md 제외)의 (경로, SHA-256)을 다이제스트 하나로 고정. 다르면 503.
- 앱은 첫 요청 때 적재(`lifespan`을 직접 들어감), `OSHP_SEMANTIC=off`, `OSHP_TRUST_FORWARDED=1`(앱의 분당 120회 제한이 방문자 주소 기준이 되게). 관문의 공통 미들웨어(.3 소켓·인증 헤더·보안 헤더)는 그대로 적용되고, 템플릿의 인라인 `style` 때문에 이 경로만 CSP `style-src 'unsafe-inline'`.
- `/demo/osh-precedents`(끝 슬래시 없음, osh.ai.kr rewrite가 떼어 보냄)는 미들웨어가 `/`를 붙여 그대로 서비스(리다이렉트 루프 없음).
- 앱의 `/files/<id>`는 302로 `/download/<id>`로 보내고, 거기서 60초 서명 주소로 302. 파일 바이트는 관문을 지나지 않는다.

## 남은 일

1. **Storage 업로드**: `python ai-api/scripts/upload_safetybread_storage.py osh-precedents` (전체 zip·릴리스 zip·벡터 3개 → 재다운로드 해시 확인 → 매니페스트). 이 세션의 권한 제한으로 실행하지 못했다.
2. **공개 플래그**: `web/lib/catalog.ts`의 `precedentsPublic = true` 후 배포.
3. 포털 이용약관, 가공물 라이선스 문구, 공개 문의처·갱신 계획(연구팀).
4. 이름 누락 신고 창구: 문의처가 정해질 때까지 Hub 운영진. 고친 판본은 새 serving 버전 + 다이제스트 갱신 + 재시작.
5. 새 판본: `nas-put osh-precedents serving <폴더>` → `safetybread_apps.py`의 digest 갱신 → `current` 전환 → 관문 재시작.
