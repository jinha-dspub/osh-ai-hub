# DEMO 데이터 패키지 템플릿

이 폴더는 **합성 예시 3행을 포함한 인수 양식**이다. 실제 연구자료·기관 자료·운영 DEMO가 아니다. 새 작업 위치로 복사하고 실제 자료에 맞춰 내용을 교체한다. 모르는 항목은 미확인으로 남긴다.

## 자료 카드

| 항목 | 작성 내용 |
|---|---|
| 자료명 / ID / 버전 | DEMO 데이터 패키지 템플릿 / demo-dataset / 0.0.0-demo |
| 자료 구분 | synthetic · 합성 예시 |
| 목적 | 패키지 구조와 표 형식을 설명 |
| 포함·제외 기준 | 고정 합성 값 3행만 포함. 실제 사건·사람·기관 자료 없음 |
| 한 행의 의미 | 가상의 문서 1개 |
| 기간 | 예시 연도 2020–2022. 실제 조사·수집 기간 아님 |
| 원문 제공자·출처·수집일 | 해당 없음(합성 템플릿). 실제 자료에서 근거 입력 |
| 가공 주체 | 실제 패키지 작성 시 입력 |
| 원문/가공물 이용 조건 | 각각 ACCESS.md에 기록. 임의 라이선스 부여 금지 |
| 권장 활용 / 한계 | 형식 이해용. 연구 결과·분포·AI 성능의 근거가 아님 |
| 인용 | 실제 제공자·자료명·버전·발행일·URL을 확인해 작성. 없는 DOI/URL을 만들지 않음 |

## 파일

- [dataset.json](dataset.json): 버전·표·기능 상태. 웹 자동 등록 설정이 아님.
- [data_dictionary.csv](data_dictionary.csv): 네 열의 타입·출처·의미.
- [files.csv](files.csv): 데이터 파일의 bytes·SHA-256·행 수.
- [preview.csv](preview.csv): DEMO 합성 예시 3행. 실제 자료 교체 시 공개 범위 재검토.
- [QUALITY.md](QUALITY.md), [ACCESS.md](ACCESS.md), [HANDOFF.md](HANDOFF.md): 검사·접근·인수 기록.
- [PROCESSING.md](PROCESSING.md), [DEMO.md](DEMO.md): 가공/DEMO가 있을 때 작성할 양식. 실행 앱 없음.

실제 패키지에서는 data/records.csv, raw/md/ 등의 실제 파일을 추가하고 manifest·사전·설명을 함께 갱신한다. 템플릿 합성 값을 실제 데이터에 섞지 않는다.

## 읽는 법

Excel에서 preview.csv를 UTF-8로 가져오고 식별자는 문자열로 읽는다. Python 표준 라이브러리 예:

```python
import csv
from pathlib import Path

# 패키지 루트에서 실행. 이 파일은 합성 DEMO 값만 포함.
with Path("preview.csv").open(encoding="utf-8-sig", newline="") as source:
    for row in csv.DictReader(source):
        print(row["record_id"], row["title"])
```

실제 개인정보·원문을 예제 로그에 출력하지 않는다. 실제 활용 예, 포함·제외 편향, 결측/내용 검수 범위와 재배포 조건은 자료별로 작성한다.

## 변경 이력

- 0.0.0-demo / 2026-09-19: 합성 인수 템플릿. 실제 자료 등록·운영 배포 없음.
