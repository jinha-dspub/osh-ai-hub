import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { ImageUp, ScanSearch, ShieldCheck, ArrowUpRight, Download } from "lucide-react";
import "../../app/globals.css";
import "./lanyard.css";

type Label = "체결" | "미체결" | "거치" | "불명";
type Lanyard = {
  id: number;
  box: number[];
  conf: number | null;
  polyline: number[][];
  harness_box: number[] | null;
  shape: { label: Label; why: string[] };
  final: { label: Label; source: string };
  worker?: number | null;
  // "ai": a worker the detector missed; Claude's 7 points went through the shape rule.
  origin?: "detector" | "ai";
  ai_hook?: string | null;
};
type Worker = {
  id: number;
  box: number[];
  hook: string;
  location: string;
  fall_risk: boolean;
  reason: string;
  has_lanyard: boolean;
};
type Result = {
  id: string;
  release: string;
  width: number;
  height: number;
  lanyards: Lanyard[];
  harnesses: number[][];
  summary: Record<Label, number>;
};
type Stage = "idle" | "ready" | "analyzing" | "reviewing" | "done" | "error";

const MAX_EDGE = 1600;
const MAX_FILE = 20 * 1024 * 1024;
const LABELS: Label[] = ["체결", "미체결", "거치", "불명"];
const COLOR: Record<Label, string> = {
  체결: "#0e4a9f",
  미체결: "#b42318",
  거치: "#8a4b00",
  불명: "#52627a",
};
const SOURCE: Record<string, string> = {
  shape: "1단계 형태 규칙",
  chain_R5_structure: "형태 불명 → Claude가 구조물 체결 확인",
  chain_R5_not_structure: "형태 불명 → Claude도 구조물 체결 아님",
  R5_none: "형태 불명 · Claude 판정과 연결 안 됨",
};

async function shrink(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
  if (!blob) throw new Error("사진을 변환하지 못했습니다.");
  return { blob, url: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function post<T>(path: string, body: BodyInit, type: string): Promise<T> {
  // The .3 gateway rate-limits bursts with a non-JSON 429 before the request reaches the
  // server, so waiting and resending is safe. JSON 429s are the app's own daily limits.
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`/demo/lanyard/api/${path}`, {
      method: "POST",
      body,
      headers: { "Content-Type": type },
    });
    const json = (response.headers.get("content-type") || "").includes("application/json");
    if (response.status === 429 && !json && attempt < 8) {
      await wait(Math.min(8000, 500 * 2 ** attempt));
      continue;
    }
    const data = json ? await response.json().catch(() => ({})) : {};
    if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return data as T;
  }
}

function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

// The /demo gateway accepts at most 16 KB per request, so the photo goes up in chunks.
async function sendPhoto(blob: Blob, progress: (sent: number, total: number) => void) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const json = "application/json";
  const start = await post<{ id: string; chunk_bytes: number }>(
    "upload/start", JSON.stringify({ size: bytes.length }), json);
  for (let seq = 0, offset = 0; offset < bytes.length; seq++, offset += start.chunk_bytes) {
    const body = JSON.stringify({ id: start.id, seq, data: base64(bytes.subarray(offset, offset + start.chunk_bytes)) });
    try {
      await post("upload/chunk", body, json);
    } catch {
      await post("upload/chunk", body, json); // one retry; the server ignores a replayed chunk
    }
    await wait(60); // stay under the gateway's burst limit instead of hitting it every photo
    progress(Math.min(bytes.length, offset + start.chunk_bytes), bytes.length);
  }
  return post<Result>("upload/finish", JSON.stringify({ id: start.id }), json);
}

function Overlay({ result, image, workers }: { result: Result; image: string; workers: Worker[] }) {
  const stroke = Math.max(2, Math.round(result.width / 400));
  return (
    <figure className="ly-figure">
      <div className="ly-canvas">
        {/* eslint-disable-next-line @next/next/no-img-element -- standalone bundle, data: URL */}
        <img src={image} alt="판정한 사진" />
        <svg viewBox={`0 0 ${result.width} ${result.height}`} aria-hidden="true">
          {result.harnesses.map((b, i) => (
            <rect key={`h${i}`} x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]}
              fill="none" stroke="#ffffff" strokeWidth={stroke} strokeDasharray={`${stroke * 3} ${stroke * 2}`} />
          ))}
          {workers.map((w) => (
            <rect key={`w${w.id}`} x={w.box[0]} y={w.box[1]} width={w.box[2] - w.box[0]} height={w.box[3] - w.box[1]}
              fill="none" stroke={w.fall_risk ? "#ffb020" : "#9fb3cc"} strokeWidth={stroke} />
          ))}
          {result.lanyards.map((l) => (
            <g key={l.id}>
              <polyline points={l.polyline.map((p) => p.join(",")).join(" ")} fill="none"
                stroke="#ffffff" strokeWidth={stroke * 3} strokeLinejoin="round" />
              <polyline points={l.polyline.map((p) => p.join(",")).join(" ")} fill="none"
                stroke={COLOR[l.final.label]} strokeWidth={stroke * 1.6} strokeLinejoin="round"
                strokeDasharray={l.origin === "ai" ? `${stroke * 4} ${stroke * 2}` : undefined} />
              <circle cx={l.polyline[6][0]} cy={l.polyline[6][1]} r={stroke * 3} fill={COLOR[l.final.label]}
                stroke="#ffffff" strokeWidth={stroke} />
              <text x={l.box[0]} y={Math.max(stroke * 8, l.box[1] - stroke * 2)} fontSize={stroke * 8}
                fontWeight="700" fill="#ffffff" stroke="#06264c" strokeWidth={stroke * 1.5} paintOrder="stroke">
                {l.id} {l.final.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption>
        선: 죔줄(원은 안전고리 쪽 끝) · 끊긴 선: 검출기가 놓쳐 Claude가 그린 죔줄 · 흰 점선: 안전대 ·
        노란 네모: Claude가 본 추락 위험 위치 작업자
      </figcaption>
    </figure>
  );
}

type DatasetFile = { id: string; name: string; bytes: number; sha256: string };
const FILE_LABEL: Record<string, string> = {
  "labels-json": "사람 검토 라벨 · 연구팀 판정·교정 1,636건 (JSON)",
  "labels-zip": "사람 검토 라벨 · JSON + 세트별 CSV + 설명 (ZIP)",
  "ai-labels-zip": "AI 자동 판정 라벨 · 사람 검토 전, 학습 사진 13,549장 + 신뢰 범위 (ZIP)",
};

function DatasetDownloads() {
  const [files, setFiles] = useState<DatasetFile[] | null>(null);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  useEffect(() => {
    fetch("/demo/lanyard/api/files")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "파일 목록을 불러오지 못했습니다.");
        setFiles(data.files); setVersion(data.version);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  async function download(id: string) {
    setBusyId(id); setError("");
    try {
      const { url } = await post<{ url: string }>("download", JSON.stringify({ id }), "application/json");
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  }
  return (
    <section id="files" className="ly-panel ly-files" aria-labelledby="files-title">
      <h2 id="files-title"><Download size={24} aria-hidden="true" />데이터셋 받기{version && ` · ${version}`}</h2>
      <p>
        사람이 검토한 라벨 7개 세트(1,636건)와, 사람이 답하지 않은 학습 사진 13,549장의 AI 자동 판정 라벨(사람 검토 전, 검출 신뢰도·신뢰 범위 포함)입니다. 모두 라벨만 담았습니다. 사진과 AIHub 원본 라벨은 AIHub 이용약관상 포함하지 않으며,
        AIHub에서 신청한 뒤 사진 파일명·죔줄 번호로 맞춰 쓰면 됩니다.
      </p>
      {error && <p role="alert" className="ly-error">{error}</p>}
      {!files && !error && <p className="ly-help">파일 목록을 불러오고 있습니다.</p>}
      {files && (
        <ul className="ly-file-list">
          {files.map((f) => (
            <li key={f.id}>
              <div>
                <strong>{FILE_LABEL[f.id] ?? f.name}</strong>
                <span>{f.name} · {(f.bytes / 1024 / 1024).toFixed(1)}MB</span>
                <code title="SHA-256">{f.sha256.slice(0, 16)}…</code>
              </div>
              <button className="button secondary" disabled={busyId === f.id} onClick={() => void download(f.id)}>
                {busyId === f.id ? "링크 준비 중" : "받기"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="ly-help">받기를 누르면 60초 동안 유효한 다운로드 주소로 이동합니다.</p>
    </section>
  );
}

function LanyardApp() {
  const [file, setFile] = useState<File | null>(null);
  const [inputError, setInputError] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("사진을 선택하면 판정을 시작할 수 있습니다.");
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [image, setImage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [fileName, setFileName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const busy = stage === "analyzing" || stage === "reviewing";

  useEffect(() => {
    if (stage === "done" || stage === "error") statusRef.current?.focus();
  }, [stage]);

  function choose(next: File | null) {
    setInputError("");
    setFile(null);
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setInputError("JPG·PNG·WEBP 사진만 판정할 수 있습니다. 다른 파일을 선택해 주세요.");
      return;
    }
    if (next.size > MAX_FILE) {
      setInputError("20MB 이하 사진을 선택해 주세요.");
      return;
    }
    setFile(next);
    setFileName(next.name);
    setStage("ready");
    setStatus("선택한 사진을 확인하고 ‘체결 상태 판정’을 눌러 주세요.");
  }

  async function run() {
    if (!file || busy) return;
    setError(""); setReviewError(""); setResult(null); setWorkers([]); setReviewed(false);
    setFeedback(""); setNote(""); setSent(false);
    setStage("analyzing");
    setStatus("사진을 준비하고 있습니다.");
    try {
      const small = await shrink(file);
      setImage(small.url);
      const first = await sendPhoto(small.blob, (sent, total) => {
        setStatus(sent < total
          ? `사진 전송 중 ${Math.round((sent / total) * 100)}% (${Math.round(sent / 1024)} / ${Math.round(total / 1024)}KB)`
          : "1단계: 사진에서 죔줄과 안전대를 찾고 있습니다.");
      });
      setResult(first);
      // Even with no detected lanyard, Claude may find workers the detector missed (chain A+).
      setStage("reviewing");
      setStatus("2단계: Claude가 안전고리와 작업 위치를 확인하고 있습니다. 1분 정도 걸릴 수 있습니다.");
      try {
        const second = await post<{ lanyards: Lanyard[]; workers: Worker[]; summary: Record<Label, number> }>(
          "review", JSON.stringify({ id: first.id }), "application/json");
        setResult({ ...first, lanyards: second.lanyards, summary: second.summary });
        setWorkers(second.workers);
        setReviewed(true);
        setStatus(second.lanyards.length
          ? `판정을 마쳤습니다. 죔줄 ${second.lanyards.length}개, Claude가 본 작업자 ${second.workers.length}명.`
          : "죔줄을 찾지 못했습니다. 작업자와 죔줄이 크게 보이는 사진으로 다시 시도해 보세요.");
      } catch (e) {
        setReviewError((e as Error).message);
        setStatus("1단계 판정만 완료했습니다. 2단계 확인은 실패했습니다.");
      }
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
      setStatus("판정하지 못했습니다. 선택한 사진은 그대로 남아 있어 다시 시도할 수 있습니다.");
    }
  }

  function downloadJson() {
    if (!result) return;
    const data = {
      program: "안전대 체결 라벨링 데이터셋",
      notice: "AI 생성 판정 · 정확도 검증 전 · 현장 안전 점검을 대신하지 않음",
      run_id: result.id,
      release: result.release,
      downloaded_at: new Date().toISOString(),
      source_file: fileName,
      image: { width: result.width, height: result.height, coordinates: "pixels of the uploaded image" },
      summary: result.summary,
      lanyards: result.lanyards,
      harnesses: result.harnesses,
      stage2: reviewed
        ? { status: "ok", model: "claude-sonnet-5-5", workers }
        : { status: reviewError ? "failed" : "not_run", error: reviewError || null, workers: [] },
      keypoints: "polyline[0] = attachment end, polyline[6] = hook end (7 points)",
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `lanyard-${result.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function sendFeedback() {
    if (!result || !feedback) return;
    try {
      await post("feedback", JSON.stringify({ id: result.id, verdict: feedback, note }), "application/json");
      setSent(true);
    } catch (e) {
      setReviewError((e as Error).message);
    }
  }

  const risky = workers.filter((w) => w.fall_risk && w.hook !== "체결");
  return <>
    <header className="header"><div className="container header-inner"><a className="brand" href="https://osh.ai.kr/">OSH AI Hub</a><a href="https://osh.ai.kr/tools">분석·체험</a></div></header>
    <main className="container ly-page">
      <header>
        <span className="badge">AI 판정 · 연구용 · 정확도 검증 전</span>
        <h1>안전대 체결 라벨링 데이터셋</h1>
        <p>현장 사진을 올리면 작업자 안전대의 죔줄이 구조물에 걸려 있는지 AI가 판정합니다.</p>
        <p className="ly-notice">
          <strong>자료 처리 안내</strong> — 올린 사진과 판정 결과는 판정 모델 개선 연구를 위해 OSH AI Hub 서버에
          저장됩니다. 2단계 확인을 위해 사진이 Anthropic(Claude)으로 전송되며, 외부 AI의 데이터 처리는 제공자 정책을
          따릅니다. 얼굴·이름표 등 개인을 알아볼 수 있는 부분이 없는 사진을 사용해 주세요.
        </p>
      </header>
      <div className="ly-grid">
        <section className="ly-panel" aria-labelledby="input-title">
          <h2 id="input-title"><ImageUp size={24} aria-hidden="true" />사진 올리기</h2>
          <p>JPG·PNG·WEBP, 20MB 이하. 브라우저에서 긴 변 1,600픽셀 JPG로 줄이고 위치정보(EXIF)를 뺀 뒤 전송합니다.</p>
          <label className="ly-file">
            <span className="button secondary">사진 선택</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
              onChange={(e) => choose(e.target.files?.[0] ?? null)} aria-describedby="file-state" />
          </label>
          <p id="file-state" className="ly-file-state">
            {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB` : "선택한 사진이 없습니다."}
          </p>
          {inputError && <p role="alert" className="ly-error">{inputError}</p>}
          <button className="button" disabled={!file || busy} onClick={() => void run()}>
            <ScanSearch size={20} aria-hidden="true" />체결 상태 판정
          </button>
          {!file && <p className="ly-help">사진을 선택하면 버튼이 활성화됩니다.</p>}
        </section>
        <section className="ly-panel" aria-labelledby="result-title">
          <h2 id="result-title"><ShieldCheck size={24} aria-hidden="true" />판정 결과</h2>
          <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="ly-status">{status}</p>
          {error && <p role="alert" className="ly-error">{error}</p>}
          {result && image && <Overlay result={result} image={image} workers={workers} />}
          {result && result.lanyards.length > 0 && <>
            <ul className="ly-summary" aria-label="판정 요약">
              {LABELS.map((label) => (
                <li key={label}><span className="ly-dot" data-label={label} aria-hidden="true" />{label} {result.summary[label]}</li>
              ))}
            </ul>
            {risky.length > 0 && (
              <p className="ly-warn">확인 필요: 추락 위험 위치에 있으나 체결로 보이지 않는 작업자 {risky.length}명</p>
            )}
            <div className="table-scroll" tabIndex={0} role="region" aria-label="죔줄별 판정">
              <table className="data-table">
                <thead><tr><th>번호</th><th>최종 판정</th><th>1단계 형태</th><th>검출 신뢰도</th><th>근거</th></tr></thead>
                <tbody>
                  {result.lanyards.map((l) => (
                    <tr key={l.id}>
                      <td>{l.id}</td>
                      <td><strong>{l.final.label}</strong></td>
                      <td>{l.shape.label}</td>
                      <td>{l.conf === null ? "검출 안 됨" : l.conf.toFixed(2)}</td>
                      <td>
                        {l.origin === "ai" ? "검출기 미검출 → Claude가 그린 7점 · " : ""}
                        {SOURCE[l.final.source] ?? l.final.source} · {l.shape.why.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
          {reviewError && <p role="alert" className="ly-error">{reviewError}</p>}
          {reviewed && workers.length > 0 && (
            <div className="ly-workers">
              <h3>Claude가 본 작업자</h3>
              <ol>
                {workers.map((w) => (
                  <li key={w.id}>{w.hook} · {w.location}{w.has_lanyard ? "" : " · 1단계에서 죔줄 미검출"} — {w.reason}</li>
                ))}
              </ol>
            </div>
          )}
          {result && stage === "done" && (
            <button className="button secondary ly-download" onClick={downloadJson}>
              <Download size={18} aria-hidden="true" />판정 결과 JSON 받기
            </button>
          )}
          {result && stage === "done" && (
            <fieldset className="ly-feedback">
              <legend>판정이 맞나요? (선택, 모델 개선에 쓰입니다)</legend>
              <div className="ly-choices">
                {[["correct", "맞아요"], ["wrong", "틀린 곳이 있어요"], ["unsure", "잘 모르겠어요"]].map(([value, text]) => (
                  <label key={value}><input type="radio" name="verdict" value={value} checked={feedback === value}
                    disabled={sent} onChange={() => setFeedback(value)} />{text}</label>
                ))}
              </div>
              <label htmlFor="ly-note">어디가 틀렸는지 (선택, 300자)</label>
              <textarea id="ly-note" rows={2} maxLength={300} value={note} disabled={sent}
                onChange={(e) => setNote(e.target.value)} placeholder="예: 2번 죔줄은 난간에 걸려 있음" />
              <button className="button secondary" disabled={!feedback || sent} onClick={() => void sendFeedback()}>
                {sent ? "의견을 보냈습니다" : "의견 보내기"}
              </button>
            </fieldset>
          )}
          <p className="ly-limit">
            검출 신뢰도는 검출기가 낸 점수이며 정확도가 아닙니다. AI 생성 판정이며 틀릴 수 있습니다. 1단계는 AIHub 공사현장 안전장비 사진으로 학습한 검출기와 형태 규칙,
            2단계는 Claude의 사진 판독입니다. 정확도 평가 수치는 아직 공개하지 않았습니다. 현장 안전 점검을 대신하지 않습니다.
            {result && <> · 모델 {result.release}</>}
          </p>
        </section>
      </div>
      <DatasetDownloads />
      <p className="ly-limit">
        전체 이용자의 하루 AI 사용량을 함께 제한합니다. 한도에 도달하면 2단계 확인을 쉬고 1단계 판정은 계속 이용할 수 있습니다.{" "}
        <a href="https://osh.ai.kr/datasets/lanyard">자료·모델 소개 <ArrowUpRight size={14} aria-hidden="true" /></a>
      </p>
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<LanyardApp />);
