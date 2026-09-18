/* PCM16 mono 24 kHz, bounded 5760-sample chunks. No sound is written to output. */
class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(5760);
    this.position = 0;
    this.phase = 0;
    this.energy = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const step = sampleRate / 24000;
    while (this.phase < input.length) {
      const value = Math.max(-1, Math.min(1, input[Math.floor(this.phase)]));
      this.samples[this.position++] = Math.round(value * (value < 0 ? 32768 : 32767));
      this.energy += value * value;
      this.phase += step;
      if (this.position === 5760) {
        this.port.postMessage({ pcm: this.samples.buffer, level: Math.sqrt(this.energy / 5760) }, [this.samples.buffer]);
        this.samples = new Int16Array(5760);
        this.position = 0;
        this.energy = 0;
      }
    }
    this.phase -= input.length;
    return true;
  }
}
registerProcessor("voice-capture", VoiceCapture);
