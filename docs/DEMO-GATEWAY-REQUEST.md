# .3 담당자에게 전달: 공통 DEMO 관문 설정

## 요청 요약 — /demo/ 전체를 한 번만 연결

최종 사용자 주소는 `https://osh.ai.kr/demo/`이고, 첫 앱은 `https://osh.ai.kr/demo/copd/`입니다.

현재 osh.ai.kr은 Vercel이 받으므로 Hub 쪽에서 `/demo/:path*`를 `https://tools.osh.ai.kr/demo/:path*`로 rewrite합니다. .3에서는 tools.osh.ai.kr의 기존 HTTPS server에 `/demo/` 전체를 .6의 공통 DEMO 서버로 넘기는 location 하나를 추가해주세요. osh.ai.kr DNS와 기존 서비스 경로는 바꾸지 않습니다.

연결: 이용자 → osh.ai.kr(Vercel) → tools.osh.ai.kr(.3 nginx) → 192.168.0.6:8103.

## .3에서 해주실 작업

1. `location ^~ /demo/`를 `http://192.168.0.6:8103`으로 프록시합니다. proxy_pass 끝에 `/`를 붙이지 않아 하위 경로를 유지합니다.
2. 실제 자료가 포함된 내부 검토 단계이므로 Basic 인증을 적용합니다. `/demo/copd/`의 HTML·자바스크립트·API에 모두 적용되어야 합니다. 기존에 승인된 비밀번호 파일을 사용하거나 별도 DEMO 계정을 만드세요. 비밀번호를 Git이나 채팅에 넣지 마세요.
3. `X-OSH-Authenticated-User`를 반드시 `$remote_user`로 덮어씁니다. .6은 소켓 상대가 192.168.0.3이고 이 값이 있는 요청만 받습니다. 클라이언트가 임의 지정한 헤더를 전달하면 안 됩니다.
4. .3 → .6:8103 접속을 허용합니다. .6:8103을 인터넷에 직접 노출하지 않습니다.
5. CPU 로컬 모델 설명 생성에 시간이 걸릴 수 있어 proxy_read_timeout은 240초로 설정합니다. Vercel 측 proxy timeout은 별개이므로 장시간 설명 생성은 최종 URL에서도 검증해야 합니다. 문제가 있으면 비동기 작업 조회로 전환합니다.
6. nginx -t 후 reload하고 응답을 확인해주세요.

복사 가능한 설정: [nginx-demo.conf](../ai-api/deploy/nginx-demo.conf).
그 파일의 `/etc/nginx/.htpasswd-demo`는 설정 예시 경로입니다. 실제 비밀번호 파일을 만들거나 사용 중인 승인된 파일 경로로 바꾼 후 적용합니다.

```bash
sudo nginx -t && sudo systemctl reload nginx
# 로그인하지 않은 요청은 401이어야 합니다.
curl -I https://tools.osh.ai.kr/demo/copd/
# 비밀번호는 프롬프트에 입력합니다.
curl --user DEMO_USERNAME -I https://tools.osh.ai.kr/demo/copd/
```

인증된 요청은 앱 가동 후 200이어야 합니다. 앱 가동 전 502이면 연결 완료로 판단하지 않습니다. 직접 .6의 `/health`를 호출하면 최소 프로세스 상태를 확인할 수 있지만, 실제 모델 준비 상태를 의미하지는 않습니다.

## .6과 Hub에서 담당하는 작업

- .6: 공통 gateway `app.demo_gateway:app`, 192.168.0.6:8103.
- 첫 앱: `/demo/copd/`, API와 정적 파일도 이 경로 아래에 둡니다.
- 모델 서버: .6 내부 127.0.0.1:11435. nginx에서 이 모델 서버를 노출하지 않습니다.
- Hub: `/demo/:path*` 전체 rewrite와 DEMO 링크, GitHub 반영·Vercel 배포 확인.
- 향후 새 도구는 .6 gateway에 `/demo/도구이름/`을 등록하고 Hub 링크를 추가합니다. 같은 공통 관문을 사용하는 한 .3 nginx 변경은 필요 없습니다.

COPD와 다른 서비스의 기존 포트·프로세스·프록시는 변경하지 않습니다. 데이터셋 다운로드는 별도 object storage 흐름으로 구현할 예정이며 이 DEMO 프록시로 대용량 파일을 중계하지 않습니다.

## 확인할 결과

- 비인증 사용자의 화면·API 접근 401.
- 인증 후 화면과 CSS/JS 정상 표시, 사례 검색·원문 열람 정상.
- `.6:8103` 직접 요청 또는 위조된 인증 헤더만 보낸 요청은 403.
- .3 실제 인증 사용자 헤더가 있는 요청만 .6에서 허용.
- `https://osh.ai.kr/demo/copd/`에서도 인증·POST Origin 검사·검색 정상.
- `/hwpx/`, `/myhealthexam/`, 기존 Hub 경로 영향 없음.

## UFW 허용 규칙

먼저 각 서버에서 `sudo ufw status verbose`로 활성 상태와 기본 정책을 확인합니다. 기존 규칙과 SSH 설정을 유지합니다.

.6에서 .3의 공통 DEMO 접근 허용:

```bash
sudo ufw allow in proto tcp from 192.168.0.3 to 192.168.0.6 port 8103 comment 'OSH demo from gateway'
sudo ufw status numbered
```

이 규칙은 다른 허용 규칙을 취소하지 않습니다. 이미 8103을 Anywhere로 허용했다면 해당 규칙을 확인하고 제한해야 합니다.

.3은 기존 HTTPS 443 허용을 유지합니다. 기본 outgoing 정책이 deny인 경우에만 아래 규칙을 추가합니다.

```bash
sudo ufw allow out proto tcp from 192.168.0.3 to 192.168.0.6 port 8103 comment 'OSH demo upstream'
```

.3에서 연결 확인:

```bash
curl --connect-timeout 5 http://192.168.0.6:8103/health
```

8103을 인터넷 전체에 허용하거나 공유기에서 포트포워딩하지 않습니다. 모델 포트 11435는 loopback 전용이므로 UFW 공개 규칙이 필요 없습니다. 위 명령은 안내이며 UFW에 자동 적용하지 않았습니다.

문법 참고: https://documentation.ubuntu.com/server/how-to/security/firewalls/index.html
