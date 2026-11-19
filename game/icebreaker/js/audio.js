// ICEBREAKER — procedural WebAudio synth. Zero audio files.
export class Synth {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.last = {}; this.xpCombo = 0; this.xpLast = 0; this.noiseBuf = null;
  }
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }
  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now; return true;
  }
  tone(type, f0, f1, dur, vol, delay = 0, dest = this.master) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, filter = 'bandpass', f0 = 2000, f1 = f0, q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = filter; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  pew()   { if (this.ok('pew', 0.05)) this.tone('square', 1500, 320, 0.07, 0.05); }
  swarm() { if (this.ok('swarm', 0.08)) this.tone('sine', 300, 900, 0.12, 0.06); }
  rail() {
    if (!this.ok('rail', 0.1)) return;
    this.noise(0.25, 0.35, 'highpass', 6000, 1500, 0.7);
    this.tone('sawtooth', 180, 40, 0.38, 0.14);
    this.tone('square', 2400, 600, 0.06, 0.06);
  }
  slice() { if (this.ok('slice', 0.06)) { this.noise(0.14, 0.22, 'bandpass', 4200, 700, 4); this.tone('sawtooth', 900, 1800, 0.06, 0.03); } }
  nova()  { if (this.ok('nova', 0.2)) { this.tone('sine', 240, 50, 0.45, 0.22); this.noise(0.4, 0.12, 'lowpass', 2500, 200); } }
  boom()  { if (this.ok('boom', 0.05)) { this.noise(0.22, 0.2, 'lowpass', 1600, 120); this.tone('sine', 140, 45, 0.2, 0.12); } }
  blade() { if (this.ok('blade', 0.07)) this.tone('triangle', 2200, 1400, 0.04, 0.035); }
  hit()   { if (this.ok('hit', 0.035)) this.tone('square', 220, 120, 0.035, 0.025); }
  kill()  { if (this.ok('kill', 0.04)) { this.tone('square', 680, 90, 0.09, 0.04); this.noise(0.08, 0.06, 'bandpass', 1800, 400, 2); } }
  xp() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    this.xpCombo = now - this.xpLast < 0.6 ? Math.min(this.xpCombo + 1, 24) : 0;
    this.xpLast = now;
    if (!this.ok('xp', 0.03)) return;
    const f = 660 * Math.pow(2, this.xpCombo / 12);
    this.tone('sine', f, f, 0.1, 0.07); this.tone('triangle', f * 2, f * 2, 0.06, 0.025);
  }
  eddy() { if (this.ok('eddy', 0.04)) { this.tone('square', 1760, 1760, 0.04, 0.03); this.tone('square', 2637, 2637, 0.06, 0.03, 0.04); } }
  levelup() {
    if (!this.ok('lvl', 0.2)) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.14, 0.07, i * 0.07));
    this.tone('sawtooth', 131, 131, 0.6, 0.08, 0.3); this.tone('sawtooth', 196, 196, 0.6, 0.06, 0.3);
  }
  pick() { if (this.ok('pick', 0.05)) { this.tone('square', 880, 1760, 0.1, 0.06); this.noise(0.15, 0.08, 'highpass', 3000, 8000); } }
  chronoOn() {
    if (!this.ok('chrono', 0.3)) return;
    this.tone('sine', 260, 32, 1.1, 0.4);
    this.tone('sawtooth', 110, 28, 1.0, 0.12);
    this.noise(0.9, 0.18, 'lowpass', 6000, 120, 2);
  }
  chronoOff() { if (this.ok('chronoOff', 0.3)) { this.tone('sine', 50, 320, 0.5, 0.2); this.noise(0.4, 0.06, 'highpass', 300, 5000); } }
  alarm() {
    if (!this.ok('alarm', 1)) return;
    for (let i = 0; i < 6; i++) this.tone('sawtooth', i % 2 ? 330 : 466, i % 2 ? 330 : 466, 0.22, 0.12, i * 0.24);
    this.tone('sine', 55, 40, 1.6, 0.3);
  }
  burst() { if (this.ok('burst', 0.3)) { this.tone('square', 600, 150, 0.25, 0.08); this.noise(0.2, 0.1, 'bandpass', 900, 300, 3); } }
  hurt() {
    if (!this.ok('hurt', 0.12)) return;
    for (let i = 0; i < 5; i++) this.tone('square', 80 + Math.random() * 900, 60 + Math.random() * 300, 0.035, 0.08, i * 0.03);
    this.noise(0.18, 0.18, 'bandpass', 1200, 300, 1.5);
  }
  victory() { [392, 523, 659, 784, 1047].forEach((f, i) => { this.tone('square', f, f, 0.3, 0.07, i * 0.12); this.tone('sine', f / 2, f / 2, 0.5, 0.08, i * 0.12); }); }
  defeat()  { [440, 349, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.35, 0.08, i * 0.2)); this.noise(1.2, 0.2, 'lowpass', 3000, 60); }
  click()   { if (this.ok('click', 0.03)) this.tone('square', 1200, 900, 0.03, 0.04); }
}
