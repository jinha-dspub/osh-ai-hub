# ChemReg 1.0.0 인수 검토와 Hub 연결

2026-10-22. 변의섭 님이 `/nas/의섭-Chem/ChemReg-1.0.0-deploy.zip`으로 전달한 ChemReg 1.0.0(화학제품 사진 → SDS 확인 → MSDS 작성·보관 → 경고표지 출력)을 osh.ai.kr의 공통 `/demo/` 관문 아래 `/demo/chemreg/`로 연결했다. 안내 페이지는 `/datasets/chemreg`.

## 패키지와 결정

- 전달물: FastAPI 코드, 데이터 약 700MB(원본 1,377개·가공 인덱스·CSV 20개), 브라우저 OCR 자산(tesseract.js), Noto Sans KR, 테스트 61개, 운영 문서. `.env`·API 키·운영 DB는 포함되지 않는다.
- 패키지 문서(DEPLOYMENT.md)는 **전용 HTTPS 서브도메인 루트**만 지원하고 하위 경로 설치를 지원하지 않는다고 적었다. 소유자는 2026-10-22 Hub의 기존 방식(`/demo/<이름>/`)으로 넣고, 그에 필요한 소량 코드 수정과 새 버전마다의 재패치를 받아들였다.
- 패키지 문서는 제조사 SDS·제공 PDF의 일괄 재배포를 승인하지 않았다고 적었다. 소유자는 같은 날 "SDS는 재배포해도 된다"고 결정했다. 원문 권리는 각 제공자에게 있다는 문구는 안내 페이지에 남겼다.
- 앱 자체의 운영 비밀번호 로그인은 그대로 둔다. 조직 단위 계정 하나이며, 같은 비밀번호를 쓰는 사람은 업로드·작성본을 함께 본다. Hub의 Google 로그인과는 별개다.
- KOSHA API 키는 설정하지 않았다. `/nas/의섭-Chem/API KEY.xlsx`는 열지 않았다. 키를 넣으면 공단 온라인 조회가 켜진다(`.env`의 `KOSHA_SERVICE_KEY`, 서비스 재시작).

## 배치

| 위치 | 내용 |
|---|---|
| `/nas/chemreg/raw/ukbyun-handoff-20261022/` | 받은 zip(SHA-256 기록)과 DEPLOYMENT.md. 정본 |
| `local_asset/chemreg/releases/1.0.0/ChemReg` | 압축 해제 + 패치본 + 전용 `.venv` + `.env`(0600). NAS가 NFS라 SQLite 운영 DB를 로컬에 둔다 |
| `local_asset/chemreg/current` | 위 릴리스로 가는 심링크. 서비스가 이 경로를 쓴다 |
| `local_asset/chemreg/ADMIN-PASSWORD.txt` | 운영 비밀번호(0600). 채팅·git·NAS에 넣지 않는다 |
| `~/.config/systemd/user/osh-chemreg.service` | `ai-api/deploy/osh-chemreg.service`. 127.0.0.1:8766, enabled |
| `ai-api/app/chemreg.py` | 관문의 `/demo/chemreg/<path>` → `127.0.0.1:8766/<path>` 역프록시 |
| `ai-api/scripts/patch_chemreg.py` | 릴리스 트리를 하위 경로용으로 패치. 새 버전마다 재실행 |

운영 데이터(`data/private/`, `data/registry.sqlite3`)는 로컬 릴리스 폴더 안에 쌓인다. 백업은 패키지 DEPLOYMENT.md대로 서비스를 멈춘 뒤 `data/` 전체와 `.env`를 따로 보관한다.

## 패치 내용 (patch_chemreg.py, 128곳)

ChemReg의 패키지 이름이 관문과 같은 `app`이라 한 프로세스에 마운트할 수 없어 별도 프로세스 + 프록시로 간다. 프록시가 접두어를 떼고 넘기므로 서버 라우트는 그대로이고 **브라우저가 해석하는 링크만** 접두어를 붙였다.

- `app/static/*.js`, `index.html`: 따옴표 안 `/static/`, `/api/` 링크 118곳 → `/demo/chemreg/...`.
- `app/labels.py`, `app/msds.py`: 서버가 만드는 라벨·MSDS 인쇄 HTML의 `href=`·`src=` 8곳.
- `app/security.py`: 세션 쿠키 `path='/'` → `path='/demo/chemreg'` (osh.ai.kr 전체로 쿠키가 가지 않도록).
- `run.py`: `proxy_headers=True, forwarded_allow_ips='127.0.0.1'` (로그인 시도 제한이 관문 뒤에서도 실제 주소를 보도록).

패치 후 패키지 테스트는 61개 중 58개 통과. 실패 3개(`test_hosting.py`)는 테스트가 앱을 루트에서 띄우기 때문이다: 쿠키 경로가 `/demo/chemreg`라 TestClient가 `/api/...`에 쿠키를 보내지 않는 것 2개, `<script src>`가 `/static/`으로 시작하는지 보는 것 1개. 패치 전에는 61개 모두 통과했다.

`.env`: `APP_MODE=public`, `HOST=127.0.0.1`, `PORT=8766`, `PUBLIC_ORIGIN=https://osh.ai.kr`, `ALLOWED_HOSTS=osh.ai.kr`, 새 비밀번호 해시와 세션 비밀값. 프록시는 Host를 `osh.ai.kr`로 고정해 넘기므로 tools.osh.ai.kr로 직접 들어온 POST는 앱의 Origin 검사에서 403이 된다(의도한 동작).

## 인수 검사 (DEPLOYMENT.md 1–5, 2026-10-22)

로컬 미리보기 관문(127.0.0.1:8199, `COPD_ALLOW_LOCAL_PREVIEW=true`)을 거쳐 실제 설치본에 실행했다. 44개 확인 중 43개 통과, 나머지 1개는 검사 스크립트의 문자열 오류(링크 접두어 누락 0건 확인).

1. 첫 접속에서 로그인 화면, 정적 자산·폰트·그림문자·OCR 언어 파일 200, 앱 CSP 유지, 슬래시 없는 `/demo/chemreg`도 같은 화면.
2. 미로그인 `/api/msds/workbooks`·`/api/msds/uploads`·`/api/documents/...`·CSV·문서 모두 401. 다른 Origin의 POST 403, 확인 헤더 없는 POST 403, 틀린 비밀번호 401.
3. 로그인 후 쿠키 `HttpOnly; Secure; SameSite=strict; Path=/demo/chemreg`. 제품 검색, 참고물질 67-64-1, MSDS 4항, CSV 내려받기, 테스트 PDF 업로드와 원본 내려받기, MSDS 작성본 저장, MSDS 인쇄 미리보기, 라벨 초안 저장(fisher-acetone-us, 200×350mm)과 라벨 인쇄 미리보기·독립 HTML 내려받기(접두어 붙은 CSS·JS 경로) 정상.
4. `osh-chemreg` 재시작 후 업로드·작성본 유지.
5. 로그아웃 후 이전 원본 내려받기 주소 401.
6. 실제 프린터 출력(100% 배율·잘림)은 미검사.

관문 재시작 뒤 공개 주소에서도 확인했다: `https://osh.ai.kr/demo/chemreg/`(슬래시 유무 모두) 200, 정적 JS·OCR 언어 파일 200, 미로그인 `/api/status` 401, 이웃 데모(corporate-ohs, copd) 200.

검사에 쓴 DEMO 업로드·작성본은 검사 뒤 `data/private/`와 `registry.sqlite3`를 지우고 재시작해 초기 상태로 되돌렸다.

## 로그인 제거 (2026-10-22 저녁, 소유자 요청)

소유자가 "다른 데모처럼 보안을 다 없애라"고 해서 앱을 패키지의 `local` 모드로 바꾼다. 이 모드는 로그인이 없고 모든 조회·업로드·작성이 열린다. 패키지 문서가 공개 운영에 요구한 비밀번호·HTTPS Origin 검사를 끈 것이므로 기록해 둔다.

- `.env`: `APP_MODE=public` → `APP_MODE=local`. 나머지 값은 그대로 두며 쓰이지 않는다.
- `ai-api/app/chemreg.py`: local 모드는 Host가 loopback이어야 하므로 프록시가 Host를 `127.0.0.1`로 보내고, 앱이 자기 주소와 비교하는 Origin 헤더는 떼고 넘긴다. POST의 Origin 검사는 관문의 gate가 이미 한다. 쓰기 확인 헤더(X-ChemRegistry)와 16MB/1MB 본문 제한은 남는다.
- `ai-api/tests/test_chemreg.py`: Origin이 전달된다는 단언 1개를 "전달되지 않는다"로 바꾼다.
- 반영: `systemctl --user restart osh-chemreg osh-demo`. 확인: `https://osh.ai.kr/demo/chemreg/api/session` 이 `{"authenticated":true,"login_required":false}`, `/api/status` 가 로그인 없이 200.
- 패밀리 디자인: 앱은 OSH Family Design 1.0(osh-family.css, Noto Sans KR 동봉)을 그대로 쓰며, 공개 주소에서 6개 스타일시트와 폰트가 모두 200으로 확인됐다. 패치는 링크 경로만 바꿨고 화면은 건드리지 않았다.

`local_asset/chemreg/ADMIN-PASSWORD.txt` 는 더 이상 쓰이지 않는다(돌아갈 때를 위해 둔다).

## 새 버전 받을 때

1. zip을 `/nas/chemreg/raw/ukbyun-handoff-<날짜>/`에 두고 SHA-256을 기록한다.
2. `local_asset/chemreg/releases/<버전>/`에 풀고 `python3.12 -m venv .venv && .venv/bin/pip install -r requirements.lock.txt`.
3. `python ai-api/scripts/patch_chemreg.py local_asset/chemreg/releases/<버전>/ChemReg`.
4. 서비스를 멈추고 이전 릴리스의 `data/private/`, `registry.sqlite3`, `.env`를 새 트리로 옮긴다(패키지 DEPLOYMENT.md "업그레이드"). `current` 심링크를 바꾸고 `systemctl --user restart osh-chemreg`.
5. 이 문서의 인수 검사를 다시 돌린다.
