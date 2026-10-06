# 산업안전 유사어휘 데이터 인수 검토

검토일: 2026-10-06 · 대상: `/nas/safetybread/processed/osh-synonym-vocab-20261006-v1/` (자료 ID `osh-synonym-vocab`, 1.0.0, 제작 변재욱)
범위: 패키지 확인, 서비스 배포본, Hub 연결(소개 + 참조 앱 그대로 + Storage 다운로드).

## 판단

KOSHA 용어·KOSHA GUIDE 용어 정의·공공데이터포털 용어집 5종·국립국어원 자료를 개념 22,365개로 묶고 한글 표기 26,119·영문/한자 24,228·상하위 관계 8,617을 이은 **실제 자료**다. 개인정보 대상이 아니다. 패키지의 읽기 전용 FastAPI + Jinja2 검색 앱을 그대로 관문에 올렸다(의미검색 끔). 제작자의 자체 점검 40개가 관문 venv에서 전부 통과했다.

**공개 결정:** 출처 9곳 중 4곳(KOSHA 용어 목록·KOSHA GUIDE 용어 정의·우리말샘·다듬은 말, 한글 표기의 31%)의 이용 조건이 미확인이고 가공물 라이선스 문구는 미정이다. 2026-10-06 자료 소유자가 공개를 결정했고(KOSHA GUIDE는 이용 허락을 받았다고 확인), 소개 페이지에 출처별 조건과 미확인 사항, 재배포 시 행별 출처 표기 요구(NOTICE.md)를 그대로 적었다.

## 직접 확인한 내용

| 항목 | 결과 |
|---|---|
| 패키지 | 12개 파일(`files.csv`) 전부 public, `reports/validation.json` 42 통과, 비밀·내부 경로 0 |
| 배포본 | `nas-put`으로 그대로 복사(172개 파일, 차이 0건), `current`. 다이제스트 `ee074443…` |
| 참조 앱 | 패키지 smoke test 40개 통과(키워드 모드). 관문 마운트 후 `/`, `?q=아시바`(정확 2·앞 1·포함 5건), `/api/search`, `/api/status`(개념 22,365·검색 항목 44,912) 200. 첫 적재 0.75초 |
| 검색 평가 | 제작자 측정: 비표준 표기 2,368개의 임베딩 단독 recall@10 0.399(현장은어 0.479, 순화대상어 0.199). 의미검색은 보조라는 근거. Hub는 끔 |
| 검사 | ai-api ruff·pytest, web lint·typecheck·vitest·next build |

## 배치

| 무엇 | 위치 | git |
|---|---|---|
| 인계 패키지 | `/nas/safetybread/processed/osh-synonym-vocab-20261006-v1/` | 제외 |
| 배포본 | `/nas/osh-synonym-vocab/serving/osh-synonym-vocab-20261006-v1` (`current`) | 제외 |
| 관문 | `ai-api/app/safetybread_apps.py` → `/demo/osh-synonym-vocab/` (마운트), `/download/<id>`, `/api/downloads` | 코드만 |
| 소개 | `web/app/datasets/osh-synonym-vocab/page.tsx`, `web/lib/catalog.ts`(`synonymVocabDataset`, `synonymVocabPublic`) | 포함 |
| 다운로드 | 버킷 `osh-synonym-vocab-research`, 접두 `osh-synonym-vocab/1.0.0/<해시16>/`, 매니페스트 `local_asset/osh-synonym-vocab-storage-manifest.json` | 제외 |

관문 동작은 [판례 인수 검토](PRECEDENTS-INTAKE-REVIEW.md)의 "관문 동작"과 같다(`OSHV_*` 환경변수).

## 남은 일

1. **Storage 업로드**: `python ai-api/scripts/upload_safetybread_storage.py osh-synonym-vocab` (전체 zip·릴리스 zip·벡터 f16 176MB 등). 이 세션의 권한 제한으로 실행하지 못했다.
2. **공개 플래그**: `web/lib/catalog.ts`의 `synonymVocabPublic = true` 후 배포.
3. 출처 4종 이용 조건 확인(특히 우리말샘 CC BY-SA 여부), 가공물 라이선스 문구, 공개 문의처(연구팀).
4. KOSHA GUIDE 그래프 검색의 질의 확장은 이 패키지와 같은 통제어휘 DB를 쓴다. 새 판본이 나오면 두 자료를 함께 갱신.
