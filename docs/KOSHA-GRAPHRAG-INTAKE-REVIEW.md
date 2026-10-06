# KOSHA Guide GraphRAG 인수 검토

검토일: 2026-10-06 · 대상: `/nas/safetybread/processed/kosha-guide-graphrag-20261006-v1/` (자료 ID `kosha-guide-graphrag`, 1.0.0, 2026-10-06, 제작 변재욱)
범위: 패키지 확인, 서비스 배포본 생성, Hub 연결(소개 + 검색 DEMO + Claude 답변 + Storage 다운로드).

같은 날 들어온 `osh-precedents`·`osh-synonym-vocab`은 [PRECEDENTS-INTAKE-REVIEW.md](PRECEDENTS-INTAKE-REVIEW.md), [SYNONYM-VOCAB-INTAKE-REVIEW.md](SYNONYM-VOCAB-INTAKE-REVIEW.md).

## 판단

KOSHA GUIDE 658건을 OCR해 구간 18,659개로 나눈 **실제 자료**와 그 가공물(BM25 색인·개념 색인·개체 관계 그래프·법령 조문·인용표·통제어휘)이다. 제작자의 참조 앱은 "서술문 점검 MVP"로, Qwen3-Embedding-4B(GPU 9~11GB)와 Ollama qwen2.5:14b가 있어야 돈다. 이 서버의 GPU 두 장은 다른 vLLM 프로세스가 각 90GB를 점유하고 있고 두 모델 모두 없어서 **참조 앱은 쓰지 않았다.**

대신 패키지 안의 모델 없는 검색 재료만으로 검색 화면을 새로 만들고(질의 2~6ms, 적재 1.1초, 메모리 266MB), 답변 생성은 Hub가 이미 쓰는 Claude 연결(Sonnet 5.5, 공통 예산 장부)로 붙였다. 2026-10-06 소유자 결정.

**공개 결정:** 패키지 `ACCESS.md`는 네 기능 모두 `review`/`public`이고, KOSHA GUIDE 본문의 재배포 조건은 패키지 기준 **미확인**이다. 처음에는 다운로드 없이 관리자 초안·인증 관문 뒤에 두었으나, 2026-10-06 자료 소유자가 "KOSHA GUIDE는 공개 자료이고 이용 허락을 받았다"며 소개·DEMO·다운로드 전부 공개를 결정했다. 소개 페이지에 이 결정과 패키지의 미확인 표기를 함께 적었다. 다운로드는 인계 패키지 전체 zip과 제작자의 핵심 zip을 비공개 버킷 서명 주소로 제공한다(`safetybread_apps.py`, `upload_safetybread_storage.py`).

## 직접 확인한 내용

| 항목 | 결과 |
|---|---|
| 패키지 | 869개 파일 881,714,389바이트, `files.csv` SHA-256 전부 일치(`reports/validation.json` 44 통과) |
| 배포본 | 화면이 읽는 42개 파일만 바이트 그대로 복사(203MB). 해시가 있는 35개는 `files.csv`와 일치, 설명 문서 7개는 규약상 해시 없음 |
| 뺀 것 | Qwen3 임베딩 183MB(모델 없음), BM25 변형 4개(u2-r60 채택), occurrences·chunk_texts·절 매핑(화면이 안 씀), 점검 MVP 산출물, 법령 마크다운 751건(조문 원문은 docstore.json), 참조 앱·스크립트, release zip |
| 검색 품질 | "아시바 위에서 작업할 때 안전난간" → 통제어휘로 비계·작업발판 확장, D-C-7-2026 비계 지침이 1~3위, 안전보건규칙 제13조(안전난간) 연결. "공구리 타설 중 펌프카" → 콘크리트 확장. 제작자 평가(상호참조 대리 정답 107건, Hit@30)에서 BM25 단독 45.8%가 최고였고 그래프 채널은 순이득 없음 |
| 조사 처리 | 패키지 색인은 띄어쓰기 단위라 "안전난간을"이 "안전난간"에 안 잡힌다. 같은 낱말 + 1~2글자 용어를 0.5 가중으로 함께 찾게 해 보완(최대 24개) |
| Claude 답변 | 실제 호출 1건: 발췌 4 + 조문 2, 8초, 6문장 모두 근거 번호, 64원(예약 141원). 구조화 출력(JSON schema)으로 받고 서버가 인용 ID를 검증 |
| 화면 | Chromium 1280·390px: 가로 넘침 0, 콘솔 오류 0, Noto Sans KR Variable 로드. 요청 수·.3 요청 제한은 운영 주소에서 확인 필요 |
| 검사 | ai-api ruff·pytest 158 통과(`test_lanyard.py` 25개는 NAS 경로 관련 기존 실패로 제외), web lint·typecheck·vitest 63·next build 통과 |

## 배치

| 무엇 | 위치 | git |
|---|---|---|
| 인계 패키지 | `/nas/safetybread/processed/kosha-guide-graphrag-20261006-v1/` (`kosha-guide-graphrag-current` 링크) | 제외 |
| 서비스 배포본 | `/nas/kosha-guide-graphrag/serving/kosha-guide-graphrag-20261006-v1/` = `current` (RELEASE.md에 선별 기준) | 제외 |
| 관문 | `ai-api/app/kosha_graphrag.py` → `/demo/kosha-guide-graphrag/` (검색·발췌·지침·조문·답변 API, 다이제스트 고정) | 코드만 |
| 화면 | `web/demo/kosha-guide-graphrag/` → `npm run build:kosha-guide-graphrag-demo --workspace web` → `ai-api/static/kosha-guide-graphrag/` | 소스만 |
| 소개 | `web/app/datasets/kosha-guide-graphrag/page.tsx`, `web/lib/catalog.ts`(`koshaGraphragDataset`, `koshaGraphragPublic`) | 포함 |
| 서비스 설정 | `osh-demo.service`에 `KOSHA_GRAPHRAG_AI_DAILY_KRW=3000` | `ai-api/deploy/` |

## 관문 동작

- `serving/current`의 모든 파일(RELEASE.md 제외) (경로, SHA-256)을 `DIGEST` 하나로 고정. 다르면 503.
- 검색: 패키지 BM25 희소 색인을 mmap으로 읽고 질의를 같은 분석기(NFKC·소문자·단어 1~2그램)로 토큰화. 통제어휘(표준어가 아닌 표기 4,030개 → 표준 용어)로 확장(0.6 가중). 분야 필터, 10개씩 5쪽.
- 함께 주는 것: 검색어 속 개념(제목 유래 3,000개, 낱말 단위 일치만), 개체 관계(ER 그래프 2,558 + 관계 캐시 13,064, 최대 12개, 근거 구간·지침 연결), 결과 지침이 인용한 조문(인용 횟수순) + 제목이 3글자 이상 낱말과 맞는 조문, 조문별 판례 수와 번호 5개.
- 답변: `POST api/answer` {질문, 청크 ≤6, 조문 ≤3}. 자료 9,000자 상한, Sonnet 5.5 `effort=low`, `max_tokens` 1,500, JSON schema 출력. 인용 ID가 자료 밖이거나 없는 문장은 버리고 `dropped`로 개수만 알린다. 예산: 예약 141원, 하루 3,000원(`KOSHA_GRAPHRAG_AI_DAILY_KRW`), 기기별 20회(`KOSHA_GRAPHRAG_AI_PER_CLIENT`), 동시 2건. 질문·발췌는 저장하지 않는다.
- 경로 검사: 발췌 `chk_[0-9a-f]{16}`, 지침 `doc_…`, 조문 키는 허용 문자만. 다른 데모와 같은 관문 미들웨어(.3 소켓 + 인증 헤더, POST Origin, CSP).

## 남은 일

1. **Storage 업로드**: `python ai-api/scripts/upload_safetybread_storage.py kosha-guide-graphrag` (전체 zip·핵심 zip → 재다운로드 해시 확인 → `local_asset/kosha-graphrag-storage-manifest.json`). 이 세션의 권한 제한으로 실행하지 못했다.
2. **공개 플래그**: `web/lib/catalog.ts`의 `koshaGraphragPublic = true` 후 배포. 운영 주소에서 확인. (`OSH_PUBLIC_DEMOS`는 하이픈 이름을 받지 않지만, 공개된 다른 데모와 같이 `.3`이 인증 헤더를 붙여 보내므로 변경 불필요.)
3. 가공물 라이선스 문구·공개 문의처·갱신 계획(연구팀 미정).
4. 의미 검색: 원하면 EmbeddingGemma로 CPU 재임베딩(약 33분)해 산재 검색과 같은 하이브리드로. 패키지 벡터는 Qwen3 전용이라 못 쓴다.
5. 판례 DEMO(`osh-precedents`)가 공개되면 조문의 판례 번호를 링크로.
6. 새 판본: 패키지 → 선별 복사 스크립트로 `serving/<이름>-<날짜>-v<N>` → `kosha_graphrag.py`의 `DIGEST` 갱신 → `current` 전환 → 관문 재시작.

## 2026-10-06 추가: 2단계 그래프, 의미 검색, 맥락 검색

소유자 지시("기존 그래프는 두고 추가로 뽑고, 커뮤니티 요약도")와 번들 `/nas/safetybread/serving/graph_rag-배포-20261006-v1/배포/이관`(임베딩 모델 등 20G) 반입에 따라 다음을 붙였다.

| 무엇 | 내용 | 위치 |
|---|---|---|
| 2단계 추출 | 패키지가 비워 둔 청크 16,823개에서 Claude Sonnet 5.5(Message Batches, 구조화 출력)로 개체·관계 추출. 관계는 본문 인용 구절이 글에 있을 때만 채택(탈락 526). 실질 내용 청크 12,123 → 개체 81,499·관계 45,976. 토큰 입력 950만·출력 957만(캐시 적용, 배치 50% 할인 ≈ 57달러) | `ai-api/scripts/graphrag/extract.py`, 결과 `/nas/kosha-guide-graphrag/processed/graphrag-claude-20261006-v1/extract/` |
| 합본 그래프 | 1단계(패키지 개체 3,794·관계 2,557 + 관계 캐시 13,064) + 2단계. 통제어휘로 표기 통일(379건 병합). 노드 66,450·엣지 59,664 | `scripts/graphrag/merge.py` → `graph/nodes.jsonl`, `edges.jsonl` |
| 커뮤니티 | networkx Louvain 2단계: 0단계 2,713 · 1단계 1,611 = 보고서 대상 4,324 | `scripts/graphrag/communities.py` |
| 커뮤니티 보고서 | 커뮤니티마다 제목·요약·근거 번호가 붙은 발견·키워드·중요도(Claude Batch). 근거 목록 밖 인용은 삭제 | `scripts/graphrag/summarize.py` → `graph/reports.jsonl` (배치 진행 중, 완료 후 serving v3) |
| 의미 검색 | 번들의 Qwen3-Embedding-4B(rev 5cf2132)를 CPU로 올린 루프백 서비스 `osh-embed`(127.0.0.1:8104, 별도 venv `local_asset/venv-embed`). 패키지 청크 벡터와 코사인 0.998로 재현 확인. 질의 0.5초. BM25와 RRF(k=60) 융합 | `ai-api/embed_service.py`, `app/embed_client.py`, `deploy/osh-embed.service` |
| 맥락 검색 | 질문 → Claude 이해(개념·검색어·범위) → 그래프 노드 매칭·이웃 관계(인용 구절 포함)·커뮤니티 보고서·하이브리드 발췌·조문 → Claude 답변(C/R/G/L 근거 인용, 미인용 문장 삭제). 호출 2회 약 100~150원, 같은 일일 한도 | `ai-api/app/kosha_context.py`, 화면 "맥락 검색" 탭 |
| 배포본 v2 | v1 42개 파일 + 벡터 3개 + `graph/` = 49개, 다이제스트 `47342f12…`, `current` | `/nas/kosha-guide-graphrag/serving/kosha-guide-graphrag-20261006-v2` |

확인: ai-api pytest 174 통과(`test_kosha_context.py` 8개 포함), 운영 주소에서 의미 채널 on·질의 0.3~0.8초, 맥락 검색 1건(아시바 난간) 정상. GPU는 다른 팀 vLLM이 점유해 CPU로 운영하며, 비면 `EMBED_DEVICE=cuda`로 바꾼다.

남은 일: 커뮤니티 보고서 배치 완료 후 `summarize.py fetch` → serving v3(`graph/reports.jsonl` 추가) → DIGEST 갱신 → `current` → osh-demo 재시작. 2단계 그래프의 정확도 평가는 하지 않았다(인용 구절 검증만).
