# 로컬 AI 파일과 Gemini 키

2026-09-17. 키 파일 위치와 서버 로더·COPD 참조 앱 실행기를 준비했다. Gemini는 실제 자료 대신 DEMO 문장 한 건으로 HTTP 200 및 768차원 임베딩을 확인했다. COPD 검색 품질·실제 자료의 외부 전송은 검증하지 않았다.

## 키 넣기

`/home/shield/osh-ai-hub/local_asset/gemini_api_key.txt`에 발급받은 키만 한 줄로 저장한다. 파일은 빈 상태로 준비하며 이미 값이 있다면 덮어쓰지 않는다. `GEMINI_API_KEY=` 접두어와 따옴표는 넣지 않는다. 키를 채팅이나 터미널 명령 인자로 붙이지 않는다.

```bash
nano /home/shield/osh-ai-hub/local_asset/gemini_api_key.txt
```

폴더는 0700, 파일은 0600이며 현재 소유자인 shield만 접근할 수 있다. jinha 관리자 터미널에서는 `sudo -u shield nano /home/shield/osh-ai-hub/local_asset/gemini_api_key.txt`를 사용한다. 웹의 public 폴더나 NEXT_PUBLIC 환경변수에 넣지 않는다.

`local_asset/` 전체와 `gemini_api_key.txt` 파일명은 Git에서 제외한다. Git 제외는 원격 저장소 전송 방지이며 암호화·접근 권한을 대신하지 않는다. 운영 배포에서는 실행 계정이 파일을 읽을 수 있게 마운트하거나 서버의 비밀 환경변수를 사용한다. 로컬 파일은 Vercel 등에 자동 배포되지 않는다.

## 서버에서 읽는 순서

1. `GEMINI_API_KEY` 환경변수
2. `GEMINI_API_KEY_FILE`에 지정된 파일
3. 기본 `local_asset/gemini_api_key.txt`

`ai-api/app/secrets.py`가 이 순서로 읽는다. 누락·빈 파일·여러 줄은 오류로 처리하며 값은 출력하지 않는다. `GOOGLE_API_KEY`를 함께 혼용하지 않고 SDK에 읽은 키를 명시적으로 전달하는 방식을 사용한다.

COPD 참조 웹앱에는 아래 실행기가 키를 환경변수로 전달한다. 키는 명령 인자에 넣지 않는다. 같은 Python 환경에 `opendata/copd/demo/webapp/requirements.txt`의 의존성이 먼저 설치되어야 한다.

```bash
python ai-api/scripts/run_copd_demo.py --backend gemini
# 또는 로컬 Ollama가 준비된 뒤:
python ai-api/scripts/run_copd_demo.py --backend local
```

기본 바인딩은 `127.0.0.1:8101`이다. 실행 전 사용 여부를 확인한다. 이 실행기는 별도 참조 앱이며 Hub의 검색 화면·FastAPI 본 서비스와 아직 통합되지 않았다. 키를 파일에 넣는 것만으로 실행·공개되지 않는다. 원본 예제를 직접 실행하면 이 파일 로더를 사용하지 않으므로 위 실행기를 이용한다.

## 모델 역할

- **EmbeddingGemma**: COPD 패키지의 `embedding_local`에 대응하는 검색 질의 벡터 생성용.
- **Gemini embedding**: 패키지에 기록된 `gemini-embedding-2`, 768차원 벡터와 호환되는 질의 생성용. 실제 모델 접근 권한과 제작 설정 확인이 필요하다.
- **Gemma 4**: 답변 생성용 별도 모델. 기존 EmbeddingGemma 검색 벡터를 대체하지 않는다.

모델 파일은 `local_asset/models/`에 보관할 수 있다. Ollama를 쓸 때는 `OLLAMA_MODELS`를 해당 경로로 설정해야 실제 모델이 그곳에 저장된다. 이미 실행 중인 공유 GPU 서비스는 중지하거나 모델을 내려 메모리를 확보하지 않는다. 다운로드와 실행·성능 검증은 별도 작업이다.

공식 안내:
- https://ai.google.dev/gemini-api/docs/api-key
- https://ollama.com/library/embeddinggemma
- https://ollama.com/library/gemma4


## 프로젝트 전용 Ollama 실행

공식 Linux 배포본을 `local_asset/runtime/`에 설치한다. 시스템 Ollama 서비스나 GPU 드라이버를 변경하지 않는다. 모델은 `local_asset/models/`, 모델 이름·해시·크기 목록은 다운로드 완료 후 `local_asset/models-manifest.json`에 기록한다.

```bash
bash ai-api/scripts/start_local_ollama.sh
```

`127.0.0.1:11435`에서 실행하며 기본값은 CPU다. 종료는 해당 터미널에서 Ctrl+C로 한다. 운영에서는 아래 사용자 systemd 서비스가 자동 시작을 담당하므로 수동 서버를 중복 실행하지 않는다. COPD 실행기는 로컬 백엔드에서 이 주소를 기본으로 사용한다. GPU 사용은 기존 작업과 사용량을 확인한 뒤 `OSH_OLLAMA_GPU`로 별도 지정한다.

준비할 모델은 `embeddinggemma:latest`(검색 임베딩)와 `gemma4:e4b`(답변 생성)다. 다운로드 완료 여부와 모델 해시는 manifest를 확인한다. Gemma 4는 공통 DEMO의 사례 설명 생성에 연결했다. 답변 품질 평가는 별도이며 검색 벡터 생성에는 EmbeddingGemma를 사용한다.


## 설치 확인 (2026-09-17)

Ollama 0.34.1과 아래 두 모델의 다운로드를 완료했다. 임시 다운로드 서버는 종료했다. 후속 기능 확인에서 키워드·로컬 임베딩·Gemini 검색이 HTTP 200을 반환했고, Gemma 4 CPU 설명 생성 1건이 약 71초에 완료됐다. 이는 기능 확인이며 검색·답변 품질 평가나 동시 접속 성능 검증이 아니다.

- `gemma4:e4b`: 9,608,350,718 bytes, digest `c6eb396dbd5992bbe3f5cdb947e8bbc0ee413d7c17e2beaae69f5d569cf982eb`
- `embeddinggemma:latest`: 621,875,917 bytes, digest `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1`

## 공통 DEMO 서비스

공개 예정 주소는 `https://osh.ai.kr/demo/copd/`이다. Hub rewrite → .3 nginx → .6 공통 gateway로 연결한다. .3 요청과 UFW 규칙은 [관문 설정 요청](DEMO-GATEWAY-REQUEST.md)을 참고한다. .3의 nginx 적용과 Vercel을 거치는 인증·장시간 요청은 아직 검증하지 않았다.

정적 화면 빌드: 저장소 루트에서 `npm run build:copd-demo --workspace web`. 생성물 `ai-api/static/copd/`와 원본 `opendata/copd/`, 모델·키 `local_asset/`는 Git에 포함되지 않으므로 .6에 별도로 준비한다.

shield의 사용자 systemd 서비스 `osh-demo.service`와 `osh-ollama.service`를 등록하고 enabled/active를 확인했다. Linger=yes이며 실제 재부팅 검증은 하지 않았다. 서비스 원본은 `ai-api/deploy/`에 있다.

- 공통 gateway: `192.168.0.6:8103`, `app.demo_gateway:app`.
- 모델: `127.0.0.1:11435`, CPU 사용, 외부 공개하지 않는다.
- gateway는 .3 소켓 주소와 .3이 덮어쓴 인증 사용자 헤더를 모두 요구한다. 직접 요청과 위조 헤더만 보낸 요청은 403으로 확인했다.
- Gemini 검색은 질의만 외부로 전송한다. 원문은 로컬에서 조회하고 Gemma 설명도 로컬에서 처리한다.
- AI 호출은 단일 동시 실행과 일일 제한을 적용한다. 사용량 SQLite는 local_asset에 저장하며 원문·질의를 기록하지 않는다.

```bash
systemctl --user status osh-demo osh-ollama
```
