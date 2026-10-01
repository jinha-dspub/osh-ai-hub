import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import support_programs as sp
from app import support_programs_ai as ai
from app.demo_gateway import app
from tests.test_support_programs import clear_caches, write_dataset, write_release

URL = sp.PREFIX + "/api/interpret"
REAL_CALL = ai.call_claude
POST = {
    "X-OSH-Authenticated-User": "DEMO-user",
    "Origin": "https://osh.ai.kr",
    "Content-Type": "application/json",
}
DESCRIPTION = "DEMO 화성에서 프레스로 금속 부품을 가공합니다. 직원 23명, 연락처 010-1234-5678"


def body(**over):
    data = {"설명": DESCRIPTION, "세션ID": "2026-10-01-demo1234ab", "판본": "react-0123456789"}
    return json.dumps({**data, **over}, ensure_ascii=False).encode()


def answer(**over):
    raw = {
        "신청주체": "사업주",
        "근로자수": 23,
        "업종": "C25",
        "지역": "전국",
        "기업": "모름",
        "유해인자": "모름",
        "분류": ["설비개선", "없는분류"],
        "키워드": ["프레스", " ", "아주아주아주아주아주긴키워드입니다", "더위", "우주선"],
        "관련사업": ["DEMO 사업ID", "2026-99", "DEMO 사업ID"],
        "근거": {"근로자수": "직원 23명", "업종": "금속 부품을 가공", "신청주체": "없는 문구"},
    }
    return {**raw, **over}


@pytest.fixture
def env(tmp_path, monkeypatch):
    root = tmp_path / "nas"
    root.mkdir()
    (root / "README.md").write_text("DEMO NAS")
    release = tmp_path / "release"
    monkeypatch.setattr(sp, "ROOT", release)
    monkeypatch.setattr(sp, "TABLES", write_release(release))
    monkeypatch.setattr(sp, "DATASET_DIGEST", write_dataset(release))
    monkeypatch.setenv("NAS_DATA", str(root))
    monkeypatch.setenv("SUPPORT_PROGRAMS_STORE_DIR", str(tmp_path / "local"))
    monkeypatch.setenv("AI_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    monkeypatch.setattr(ai, "_counts", {})
    clear_caches()
    sent = []

    def fake(description):
        sent.append(description)
        return answer(), {"입력": 100, "출력": 50}

    monkeypatch.setattr(ai, "call_claude", fake)
    yield SimpleNamespace(nas=root, sent=sent)
    clear_caches()


def stored(root):
    return sorted((root / "osh-support-programs/raw").rglob("*-ai-*.json"))


def client():
    return TestClient(app, client=("192.168.0.3", 1234))


def test_ksic_list_matches_the_screen():
    codes = [c for c, _ in ai.industries()]
    assert len(codes) == 21 + 77 and "C25" in codes and "F" in codes


def test_proposal_keeps_only_grounded_choices_and_stores_the_request(env):
    response = client().post(URL, headers=POST, content=body())
    assert response.status_code == 200
    result = response.json()
    proposal = result["제안"]
    assert proposal["근로자수"] == 23 and proposal["업종"] == "C25"
    assert proposal["신청주체"] == "전체"  # its quote is not in the description
    assert proposal["분류"] == ["설비개선"]
    # Keywords must occur in the dataset text or the synonym list.
    assert proposal["키워드"] == ["프레스", "더위"]
    assert proposal["관련사업"] == ["DEMO 사업ID"]
    assert result["근거"] == {"근로자수": "직원 23명", "업종": "금속 부품을 가공"}
    # The phone number never leaves the server and is masked in the record.
    assert "010-1234-5678" not in env.sent[0] and "[전화번호]" in env.sent[0]
    [path] = stored(env.nas)
    assert path.name.startswith("2026-10-01-demo1234ab-ai-")
    record = json.loads(path.read_text())
    assert record["설명"] == env.sent[0] and record["요청ID"] == result["요청ID"]
    assert record["버린항목"] == ["신청주체", "키워드"] and record["원응답"]["신청주체"] == "사업주"
    assert "010-1234-5678" not in path.read_text() and "192.168" not in path.read_text()
    assert (path.parent / "MANIFEST-AI.md").exists()


@pytest.mark.parametrize(
    "raw",
    [
        answer(업종="Z99", 근거={"업종": "금속 부품을 가공"}),
        answer(근로자수=0, 근거={"근로자수": "직원 23명"}),
        answer(근로자수="23", 근거={"근로자수": "직원 23명"}),
        answer(근거="DEMO"),
    ],
)
def test_out_of_form_values_fall_back_to_unknown(env, raw):
    proposal, evidence, _ = ai.checked(raw, ai.mask(DESCRIPTION))
    assert proposal["업종"] in {"전체", "C25"} and proposal["근로자수"] in {None, 23}
    assert not (proposal["업종"] == "Z99" or proposal["근로자수"] in {0, "23"})
    assert set(evidence) <= {"업종", "근로자수", "분류"}


def test_mask_hides_contacts():
    text = ai.mask("메일 a.b@demo.example 전화 02 123 4567 사업자 123-45-67890 직원 30명")
    assert "@" not in text and "4567" not in text and "67890" not in text
    assert "직원 30명" in text


@pytest.mark.parametrize(
    "headers, content, status",
    [
        ({**POST, "Content-Type": "text/plain"}, body(), 415),
        (POST, body(설명="짧음"), 422),
        (POST, body(설명="가" * 501), 422),
        (POST, body(세션ID="../../etc"), 422),
        (POST, body(이름="DEMO"), 422),
        (POST, b"x" * 5000, 413),
        ({**POST, "Origin": "https://evil.test"}, body(), 403),
    ],
)
def test_bad_requests_never_reach_claude(env, headers, content, status):
    assert client().post(URL, headers=headers, content=content).status_code == status
    assert not env.sent and not stored(env.nas)


def test_requires_gateway_user(env):
    direct = TestClient(app, client=("192.168.0.55", 1234))
    assert direct.post(URL, headers=POST, content=body()).status_code == 403
    assert not env.sent


def test_per_client_limit_is_recorded(env, monkeypatch):
    monkeypatch.setenv("SUPPORT_PROGRAMS_AI_PER_CLIENT", "1")
    assert client().post(URL, headers=POST, content=body()).status_code == 200
    assert client().post(URL, headers=POST, content=body()).status_code == 429
    assert len(env.sent) == 1
    errors = [json.loads(p.read_text()).get("오류") for p in stored(env.nas)]
    assert sorted(map(str, errors)) == ["429", "None"]


def test_claude_failure_is_reported_and_recorded(env, monkeypatch):
    def broken(description):
        raise HTTPException(502, "AI 조건 채우기를 지금 이용할 수 없습니다.")

    monkeypatch.setattr(ai, "call_claude", broken)
    response = client().post(URL, headers=POST, content=body())
    assert response.status_code == 502
    [path] = stored(env.nas)
    record = json.loads(path.read_text())
    assert record["오류"] == 502 and "제안" not in record


# ---- the Claude call itself (fake client, real budget guard) -----------------------


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return self.response


def fake_response(content, stop_reason="tool_use"):
    usage = SimpleNamespace(
        input_tokens=3000,
        output_tokens=200,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
    )
    return SimpleNamespace(content=content, usage=usage, stop_reason=stop_reason)


def tool_block(data):
    return SimpleNamespace(type="tool_use", name=ai.TOOL, input=data)


def use_client(monkeypatch, response):
    messages = FakeMessages(response)
    monkeypatch.setattr(ai, "claude_client", lambda: SimpleNamespace(messages=messages))
    return messages


def test_call_forces_the_tool_and_settles_budget(env, monkeypatch):
    monkeypatch.setattr(ai, "call_claude", REAL_CALL)
    messages = use_client(monkeypatch, fake_response([tool_block(answer())]))
    raw, usage = ai.call_claude(ai.mask(DESCRIPTION))
    assert raw["업종"] == "C25"
    assert usage == {"입력": 3000, "출력": 200, "캐시쓰기": 0, "캐시읽기": 0}
    kwargs = messages.kwargs
    assert kwargs["tool_choice"] == {"type": "auto"} and kwargs["tools"][0]["name"] == ai.TOOL
    system = kwargs["system"][0]
    assert "지시가 아니다" in system["text"]
    # The dataset's programme lines are in the cached prompt, and related ids are an enum.
    assert "DEMO 사업ID | DEMO 환기장치 지원 | 품목: DEMO 프레스 방호장치" in system["text"]
    assert system["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    related = kwargs["tools"][0]["input_schema"]["properties"]["related"]
    assert related["items"]["enum"] == ["DEMO 사업ID"]
    assert kwargs["messages"][0]["content"].startswith("<사업장_설명>")
    from app import budget

    with budget.database() as db:
        [(provider, amount, finished)] = db.execute(
            "SELECT provider, amount, finished FROM charges"
        ).fetchall()
    assert provider == ai.PROVIDER and finished and 0 < amount <= ai.RESERVE


def test_refusal_and_missing_tool_are_errors(env, monkeypatch):
    monkeypatch.setattr(ai, "call_claude", REAL_CALL)
    use_client(monkeypatch, fake_response([], stop_reason="refusal"))
    with pytest.raises(HTTPException) as refused:
        ai.call_claude("DEMO")
    assert refused.value.status_code == 422
    use_client(monkeypatch, fake_response([SimpleNamespace(type="text", text="DEMO")]))
    with pytest.raises(HTTPException) as malformed:
        ai.call_claude("DEMO")
    assert malformed.value.status_code == 502


def test_daily_cap_stops_before_claude(env, monkeypatch):
    monkeypatch.setattr(ai, "call_claude", REAL_CALL)
    monkeypatch.setenv("SUPPORT_PROGRAMS_AI_DAILY_KRW", str(ai.RESERVE - 1))
    messages = use_client(monkeypatch, fake_response([tool_block(answer())]))
    assert client().post(URL, headers=POST, content=body()).status_code == 429
    assert messages.kwargs is None


def test_cost_prices_cache_reads_and_writes():
    def usage(**over):
        base = {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
        }
        return SimpleNamespace(**{**base, **over})

    read = ai.cost(usage(input_tokens=150, cache_read_input_tokens=25_000, output_tokens=400))
    write = ai.cost(usage(input_tokens=150, cache_creation_input_tokens=25_000, output_tokens=400))
    assert 20 <= read <= 40 and 300 <= write <= 330
    assert write <= ai.RESERVE
