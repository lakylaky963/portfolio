// Procedural synthwave SFX via WebAudio. All safe to call before unlock / when muted.
export class NeonAudio {
  constructor() { this.ctx = null; this.muted = false; this.master = null; this.last = {}; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.35; }
  throttle(k, ms) { const n = performance.now(); if (n - (this.last[k] || 0) < ms) return false; this.last[k] = n; return true; }
  tone(type, f0, f1, dur, vol = 0.2, delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
  laser() { if (this.throttle('laser', 70)) this.tone('square', 880, 300, 0.07, 0.05); }
  graze() { if (this.throttle('graze', 45)) this.tone('sawtooth', 2400, 3600, 0.04, 0.06); }
  pickup() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.12, 0.15, i * 0.06)); }
  explosion(big) { this.noise(big ? 0.7 : 0.25, big ? 0.5 : 0.25, big ? 700 : 1500); this.tone('sine', big ? 120 : 160, 30, big ? 0.6 : 0.2, 0.3); }
  overdrive() { this.tone('sine', 140, 28, 1.0, 0.6); this.noise(0.9, 0.45, 500); this.tone('sawtooth', 220, 880, 0.5, 0.1); }
  hit() { this.noise(0.35, 0.4, 900); this.tone('sawtooth', 200, 50, 0.35, 0.25); }
  shieldBreak() { this.tone('triangle', 1200, 200, 0.3, 0.2); }
  ready() { this.tone('triangle', 660, 990, 0.15, 0.15); this.tone('triangle', 990, 1320, 0.15, 0.15, 0.12); }
  siren() { for (let i = 0; i < 4; i++) { this.tone('sawtooth', 500, 900, 0.35, 0.15, i * 0.7); this.tone('sawtooth', 900, 500, 0.35, 0.15, i * 0.7 + 0.35); } }
  win() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.25, 0.12, i * 0.12)); }
  dead() { this.tone('sawtooth', 400, 25, 1.2, 0.3); this.noise(1, 0.4, 600); }
  handle(e) {
    switch (e.type) {
      case 'shoot': return this.laser();
      case 'graze': return this.graze();
      case 'pickup': return this.pickup();
      case 'explode': return this.explosion(false);
      case 'bossDead': return this.explosion(true);
      case 'overdrive': return this.overdrive();
      case 'hit': return this.hit();
      case 'shieldBreak': return this.shieldBreak();
      case 'warning': return this.siren();
      case 'win': return this.win();
      case 'dead': return this.dead();
      case 'laser': return this.tone('sawtooth', 120, 600, 0.5, 0.12);
      case 'bossPhase': return this.tone('square', 300, 80, 0.5, 0.2);
      default:
    }
  }
}
