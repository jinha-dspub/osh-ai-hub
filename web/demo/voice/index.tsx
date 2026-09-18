import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2, ArrowUpRight } from "lucide-react";
import { VoiceConnection } from "./audio";
import "../../app/globals.css";
import "./voice.css";

function VoiceDemo() {
  const [consent, setConsent] = useState(false);
  const [slow, setSlow] = useState(false);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("질문을 기다리고 있습니다.");
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; total: number } | null>(null);
  const connection = useRef<VoiceConnection | null>(null);
  useEffect(() => {
    const stop = () => connection.current?.stop();
    window.addEventListener("pagehide", stop);
    return () => { stop(); window.removeEventListener("pagehide", stop); };
  }, []);
  function start(input = "") {
    connection.current?.stop();
    setError(""); setAnswer(""); setResult(null); setActive(true); setListening(false);
    setStatus(input ? "질문을 보내고 있습니다." : "마이크와 음성 연결을 준비합니다.");
    const voice = new VoiceConnection(event => {
      if (connection.current !== voice) return;
      if (event.type === "text") setAnswer(value => value + (event.text || ""));
      if (event.type === "listening") { setListening(true); setStatus("듣고 있습니다. 말을 마치면 자동으로 답합니다."); }
      if (event.type === "thinking") { setListening(false); setStatus("답변을 준비하고 있습니다."); }
      if (event.type === "speaking") setStatus("AI 음성으로 안내하고 있습니다.");
      if (event.type === "search" && event.url?.startsWith("/demo/copd/?")) setResult({ url: event.url, total: event.total ?? 0 });
      if (event.type === "error") { setError(event.message || "연결을 확인해 주세요."); setActive(false); setListening(false); setStatus("안내가 중단되었습니다."); }
      if (event.type === "done") { setActive(false); setListening(false); setStatus("안내가 끝났습니다. 새 질문을 할 수 있습니다."); }
    });
    connection.current = voice;
    void voice.start(input, slow);
  }
  function stop() {
    connection.current?.stop(); connection.current = null;
    setActive(false); setListening(false); setStatus("마이크와 음성 안내를 멈췄습니다.");
  }
  return <>
    <header className="header"><div className="container header-inner"><a className="brand" href="https://osh.ai.kr/">OSH AI Hub</a><a href="https://osh.ai.kr/tools">분석·체험</a></div></header>
    <main className="container voice-page">
      <header><span className="badge demo">DEMO · AI 음성 안내</span><h1>말로 묻고, 소리로 안내받으세요</h1><p>사이트 이용 방법과 COPD 사례 검색을 음성으로 도와드립니다.</p></header>
      <div className="voice-grid">
        <section className="voice-panel" aria-labelledby="ask-title">
          <h2 id="ask-title"><Mic aria-hidden="true" size={24} /> 질문하기</h2>
          <p>한 번에 한 질문, 최대 20초입니다. 말을 마친 뒤 잠시 기다리거나 ‘질문 보내기’를 누르세요.</p>
          <p className="voice-example">DEMO 질문 예시: “용접 일을 한 COPD 사례를 찾아줘.”</p>
          <label className="voice-check"><input type="checkbox" checked={consent} disabled={active} onChange={e => setConsent(e.target.checked)} />음성·질문을 OpenAI로 전송하여 답변받는 데 동의합니다.</label>
          <p className="voice-privacy">이 앱은 녹음과 대화 내용을 파일로 저장하지 않습니다. 외부 AI의 데이터 처리는 제공자의 정책을 따릅니다. 이름·건강검진 결과 등 개인정보는 말하지 마세요. 판정문 원문은 음성 AI로 보내지 않습니다.</p>
          <label className="voice-check"><input type="checkbox" checked={slow} disabled={active} onChange={e => setSlow(e.target.checked)} />천천히 읽기</label>
          <div className="voice-actions">
            {!active ? <button className="button" disabled={!consent} onClick={() => start()}><Mic size={20} aria-hidden="true" />말로 질문하기</button> : <>
              {listening && <button className="button" onClick={() => void connection.current?.finish()}>질문 보내기</button>}
              <button className="button secondary" onClick={stop}><Square size={18} aria-hidden="true" />마이크·답변 멈추기</button>
            </>}
          </div>
          <form onSubmit={e => { e.preventDefault(); if (consent && text.trim() && !active) start(text.trim()); }}>
            <label htmlFor="voice-text">글로 질문하기</label>
            <textarea id="voice-text" value={text} maxLength={300} disabled={active} onChange={e => setText(e.target.value)} rows={3} placeholder="이 사이트에서 어떤 자료를 볼 수 있나요?" />
            <button type="submit" className="button secondary" disabled={!consent || active || !text.trim()}>글로 질문 보내기</button>
          </form>
        </section>
        <section className="voice-panel" aria-labelledby="answer-title">
          <h2 id="answer-title"><Volume2 size={24} aria-hidden="true" />음성·자막 안내</h2>
          <p role="status" aria-live="polite" className="voice-status">{status}</p>
          {error && <p role="alert" className="voice-error">{error}</p>}
          <div className="voice-answer" aria-label="AI 답변 자막">{answer || "답변이 나오면 이곳에서 글로도 확인할 수 있습니다."}</div>
          {result && <a className="button" href={result.url} onClick={stop}>COPD 검색 결과 {result.total}건 열기 <ArrowUpRight size={18} aria-hidden="true" /></a>}
          <p>AI 생성 음성이며 안내가 틀릴 수 있습니다. 진단이나 산재 승인 가능성을 판단하지 않습니다.</p>
          <nav aria-label="음성 없이 이용하기" className="voice-links"><a href="/demo/copd/">COPD 직접 검색</a><a href="https://tools.osh.ai.kr/hwpx/">한글 변환기</a><a href="https://tools.osh.ai.kr/myhealthexam/">건강검진 확인</a></nav>
        </section>
      </div>
      <p className="voice-limit">전체 이용자의 하루 AI 사용량을 함께 제한합니다. 한도에 도달하면 음성 안내와 Gemini 검색을 쉬고, 키워드 검색은 계속 이용할 수 있습니다.</p>
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<VoiceDemo />);
