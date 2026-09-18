export type VoiceEvent = { type: string; text?: string; message?: string; total?: number; url?: string };
type ServerEvent = VoiceEvent & { id: number; audio?: string };
export class VoiceConnection {
  private token = "";
  private stopped = false;
  private context?: AudioContext;
  private stream?: MediaStream;
  private worklet?: AudioWorkletNode;
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private sequence = 0;
  private playingAt = 0;
  private capturing = false;
  private finishing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private lastSpeech = 0;
  private heardSpeech = false;
  constructor(private onEvent: (event: VoiceEvent) => void) {}

  private async request(action: string, data?: unknown) {
    const response = await fetch(`/demo/voice/api/${action}`, {
      method: action.startsWith("events") ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Voice-Session": this.token },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "연결이 끊겼습니다. 다시 시작해 주세요.");
    return body;
  }

  async start(text: string, slow: boolean) {
    try {
      this.context = new AudioContext();
      await this.context.resume();
      if (!text) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저에서는 마이크를 사용할 수 없습니다. 글로 질문해 주세요.");
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
        if (this.stopped) { this.stream.getTracks().forEach(t => t.stop()); return; }
        await this.context.audioWorklet.addModule("/demo/voice/assets/capture.js");
      }
      if (this.stopped) return;
      const data = await this.request("start", { text, slow, consent: true });
      this.token = data.token;
      if (this.stopped) { this.stop(); return; }
      await this.poll(!text);
    } catch (error) {
      if (!this.stopped) this.onEvent({ type: "error", message: error instanceof Error && error.name === "NotAllowedError" ? "마이크 권한이 필요합니다. 브라우저 설정을 확인하거나 글로 질문해 주세요." : error instanceof Error ? error.message : "음성 연결에 실패했습니다." });
      this.stop();
    }
  }

  private capture() {
    if (!this.context || !this.stream || this.stopped) return;
    this.capturing = true;
    const source = this.context.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.context, "voice-capture");
    source.connect(this.worklet);
    this.worklet.connect(this.context.destination); // Worklet emits silence to avoid mic feedback.
    this.timer = setTimeout(() => void this.finish(), 19500);
    this.onEvent({ type: "listening" });
    this.worklet.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      if (!this.capturing) return;
      const now = performance.now();
      if (event.data.level > 0.018) { this.lastSpeech = now; this.heardSpeech = true; }
      const bytes = new Uint8Array(event.data.pcm);
      const audio = btoa(String.fromCharCode(...bytes));
      const seq = this.sequence++;
      if (++this.queued > 30) {
        this.onEvent({ type: "error", message: "음성 전송이 느립니다. 연결 상태를 확인하거나 글로 질문해 주세요." });
        this.stop(); return;
      }
      this.queue = this.queue.then(async () => {
        if (!this.stopped) await this.request("audio", { seq, audio });
      }).catch(() => {
        if (!this.stopped) this.onEvent({ type: "error", message: "음성 전송이 끊겼습니다. 다시 시작해 주세요." });
        this.stop();
      }).finally(() => { this.queued--; });
      if (this.heardSpeech && now - this.lastSpeech > 1500) void this.finish();
    };
  }

  private releaseMic() {
    this.capturing = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach(track => track.stop());
    this.worklet?.disconnect();
    if (this.worklet) this.worklet.port.onmessage = null;
  }

  async finish() {
    if (this.finishing || !this.capturing || this.stopped) return;
    this.finishing = true;
    this.releaseMic();
    this.onEvent({ type: "thinking" });
    await this.queue;
    if (this.stopped) return;
    try { await this.request("finish", {}); }
    catch (error) {
      this.onEvent({ type: "error", message: error instanceof Error ? error.message : "질문을 보내지 못했습니다." });
      this.stop();
    }
  }

  private play(encoded: string) {
    if (!this.context || this.stopped) return;
    const raw = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const samples = new DataView(raw.buffer);
    const buffer = this.context.createBuffer(1, raw.length / 2, 24000);
    const values = buffer.getChannelData(0);
    for (let i = 0; i < values.length; i++) values[i] = samples.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.playingAt = Math.max(this.context.currentTime + 0.04, this.playingAt);
    source.start(this.playingAt);
    this.playingAt += buffer.duration;
  }

  private async poll(microphone: boolean) {
    let after = 0;
    let started = false;
    while (!this.stopped) {
      const data = await this.request(`events?after=${after}`);
      if (this.stopped) break;
      if (data.ready && !started && !data.closed) {
        started = true;
        if (microphone) this.capture();
        else this.onEvent({ type: "thinking" });
      }
      for (const event of data.events as ServerEvent[]) {
        after = event.id;
        if (event.type === "audio" && event.audio) { this.play(event.audio); this.onEvent({ type: "speaking" }); }
        else if (event.type !== "done") this.onEvent(event);
      }
      if (data.closed) {
        this.releaseMic();
        const delay = Math.max(0, this.playingAt - (this.context?.currentTime ?? 0));
        this.timer = setTimeout(() => {
          if (!this.stopped) this.onEvent({ type: "done" });
          this.stop();
        }, delay * 1000 + 100);
        break;
      }
    }
  }

  stop() {
    this.stopped = true;
    this.releaseMic();
    void this.context?.close().catch(() => {});
    if (this.token) {
      void fetch("/demo/voice/api/stop", {
        method: "POST", headers: { "X-Voice-Session": this.token }, keepalive: true,
      }).catch(() => {});
      this.token = "";
    }
  }
}
