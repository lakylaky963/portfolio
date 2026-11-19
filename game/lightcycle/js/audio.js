// LIGHTCYCLE // Netrunner Trace — WebAudio procedural synthwave SFX.
// Zero external assets; safe no-op if WebAudio is unavailable or muted.

export class LightcycleAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noiseBuf = null;
    this._lastBoostAt = 0;
  }

  unlock() {
    if (this.muted) return;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.28;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch { /* ignore */ }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master && this.ctx) {
      try {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.28, this.ctx.currentTime, 0.02);
      } catch { /* ignore */ }
    }
  }

  _ready() {
    if (this.muted) return false;
    if (!this.ctx) this.unlock();
    return !!(this.ctx && this.master && this.ctx.state !== 'closed');
  }

  _noise() {
    if (this._noiseBuf || !this.ctx) return this._noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  _tone(type, f0, f1, dur, vol = 0.25, delay = 0) {
    if (!this._ready()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _burst(filterType, freq0, freq1, dur, vol = 0.3, delay = 0) {
    if (!this._ready()) return;
    const buf = this._noise();
    if (!buf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(Math.max(40, freq0), t0);
    if (freq1 && freq1 !== freq0) {
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, freq1), t0 + dur);
    }
    flt.Q.value = 2.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Crisp lightcycle 90-degree turn chirp
  turn() {
    this._tone('triangle', 340, 620, 0.055, 0.16);
    this._tone('sine', 780, 520, 0.04, 0.08, 0.01);
  }

  // Nitro boost turbine whoosh (throttled so holding Shift pulses smoothly)
  nitro() {
    if (!this._ready()) return;
    const now = performance.now();
    if (now - this._lastBoostAt < 180) return;
    this._lastBoostAt = now;
    this._burst('bandpass', 480, 2200, 0.18, 0.22);
    this._tone('sawtooth', 130, 320, 0.16, 0.12);
  }

  // Phase-cloak ethereal shimmer
  cloak() {
    this._tone('sine', 440, 1320, 0.26, 0.2);
    this._tone('triangle', 660, 1760, 0.28, 0.14, 0.03);
    this._tone('sine', 880, 2200, 0.24, 0.1, 0.06);
  }

  uncloak() {
    this._tone('sine', 960, 380, 0.16, 0.14);
    this._tone('triangle', 620, 260, 0.14, 0.1, 0.02);
  }

  // Data Shard pickup synth chime
  shard(kind = 'data') {
    const notes = kind === 'emp' ? [523.25, 659.25, 1046.5] : [587.33, 880, 1174.66];
    notes.forEach((f, i) => {
      this._tone('triangle', f, f * 1.02, 0.14, 0.2, i * 0.045);
    });
  }

  // Hunter derez shatter explosion + rising combo pitch
  derez(combo = 1) {
    const mult = 1 + Math.min(4, Math.max(0, combo - 1)) * 0.14;
    this._burst('lowpass', 1800, 140, 0.34, 0.38);
    this._tone('sawtooth', 220 * mult, 55, 0.3, 0.26);
    this._tone('square', 440 * mult, 880 * mult, 0.15, 0.14, 0.04);
  }

  // EMP shockwave bass drop + resonant sweep
  emp() {
    this._tone('sine', 180, 36, 0.55, 0.42);
    this._tone('sawtooth', 980, 110, 0.45, 0.22);
    this._burst('bandpass', 2600, 180, 0.48, 0.32);
  }

  // Round cleared neon synthwave chord
  roundClear() {
    const chord = [261.63, 329.63, 392.0, 523.25, 659.25];
    chord.forEach((f, i) => {
      this._tone('sawtooth', f, f, 0.36, 0.11, i * 0.055);
      this._tone('triangle', f * 2, f * 2, 0.3, 0.07, i * 0.055);
    });
  }

  // Full 10-round Victory fanfare
  victory() {
    const seq = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      this._tone('sawtooth', f, f * 1.005, 0.45, 0.12, i * 0.065);
      this._tone('triangle', f, f, 0.4, 0.1, i * 0.065 + 0.02);
    });
  }

  // Player crash digital glitch
  crash() {
    this._burst('bandpass', 2400, 260, 0.36, 0.4);
    this._tone('sawtooth', 260, 48, 0.34, 0.28);
    this._tone('square', 610, 92, 0.12, 0.18, 0.03);
    this._tone('square', 190, 40, 0.18, 0.2, 0.1);
  }

  gameOver() {
    [293.66, 261.63, 220.0, 146.83].forEach((f, i) => {
      this._tone('sawtooth', f, f * 0.96, 0.32, 0.16, i * 0.11);
    });
  }

  handle(ev) {
    if (!ev) return;
    switch (ev.type) {
      case 'cloak': this.cloak(); break;
      case 'uncloak': this.uncloak(); break;
      case 'shard': this.shard(ev.kind); break;
      case 'emp': this.emp(); break;
      case 'derez': this.derez(ev.combo || 1); break;
      case 'crash': this.crash(); break;
      case 'roundClear': this.roundClear(); break;
      case 'victory': this.victory(); break;
      case 'gameOver': this.gameOver(); break;
      default: break;
    }
  }
}
