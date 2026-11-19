// Procedural WebAudio synth SFX — no assets.
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let lastPlay = {};

function ensure() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setMuted(m) {
  muted = !!m;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
}
export const isMuted = () => muted;

// Rate-limit identical sounds so chain reactions don't clip.
function gate(name, ms) {
  const now = performance.now();
  if (lastPlay[name] && now - lastPlay[name] < ms) return false;
  lastPlay[name] = now;
  return true;
}

function ready() {
  return !muted && ensure() && ctx.state === 'running';
}

function tone({ type = 'sine', f0, f1 = f0, dur = 0.2, vol = 0.3, at = 0, attack = 0.005, filter = null }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (filter) {
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type || 'lowpass';
    bq.frequency.value = filter.f;
    bq.Q.value = filter.q || 1;
    node = g.connect(bq);
    bq.connect(master);
  } else g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.4, vol = 0.4, f0 = 2000, f1 = 200, type = 'lowpass', q = 1, at = 0 }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bq = ctx.createBiquadFilter();
  bq.type = type;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f0, t);
  bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  launch() {
    if (!ready() || !gate('launch', 40)) return;
    tone({ type: 'square', f0: 1800, f1: 220, dur: 0.12, vol: 0.12, filter: { f: 3000 } });
    noise({ dur: 0.08, vol: 0.18, f0: 8000, f1: 1500, type: 'highpass' });
  },
  explosion(size = 1) {
    if (!ready() || !gate('boom', 45)) return;
    tone({ type: 'sine', f0: 140 * (1.2 - size * 0.2), f1: 38, dur: 0.5 + size * 0.25, vol: 0.32 * Math.min(1.6, size) });
    tone({ type: 'sawtooth', f0: 420, f1: 60, dur: 0.35, vol: 0.06, filter: { f: 900, q: 6 } });
    noise({ dur: 0.45 + size * 0.3, vol: 0.28 * Math.min(1.5, size), f0: 3200, f1: 120 });
  },
  chain(count) {
    if (!ready()) return;
    const base = 440 * Math.pow(2, Math.min(count, 10) / 12);
    [0, 4, 7, 12].forEach((st, i) =>
      tone({ type: 'triangle', f0: base * Math.pow(2, st / 12), dur: 0.22, vol: 0.13, at: i * 0.045 }),
    );
    if (count >= 8) tone({ type: 'sawtooth', f0: base * 2, f1: base * 4, dur: 0.6, vol: 0.08, at: 0.18, filter: { f: 4000 } });
  },
  emp() {
    if (!ready()) return;
    tone({ type: 'sawtooth', f0: 900, f1: 30, dur: 1.2, vol: 0.25, filter: { f: 1200, q: 8 } });
    tone({ type: 'sine', f0: 60, f1: 25, dur: 1.4, vol: 0.4 });
    noise({ dur: 1.0, vol: 0.2, f0: 6000, f1: 80, type: 'bandpass', q: 3 });
  },
  sandy() {
    if (!ready()) return;
    tone({ type: 'sine', f0: 1200, f1: 180, dur: 0.7, vol: 0.18 });
    tone({ type: 'triangle', f0: 600, f1: 90, dur: 0.9, vol: 0.12, at: 0.05 });
  },
  sandyEnd() {
    if (!ready()) return;
    tone({ type: 'sine', f0: 180, f1: 1100, dur: 0.4, vol: 0.12 });
  },
  klaxon() {
    if (!ready() || !gate('klaxon', 800)) return;
    for (let i = 0; i < 3; i++) {
      tone({ type: 'square', f0: 620, f1: 460, dur: 0.22, vol: 0.09, at: i * 0.28, filter: { f: 1800 } });
    }
  },
  bossAlarm() {
    if (!ready()) return;
    for (let i = 0; i < 4; i++) tone({ type: 'sawtooth', f0: 110, f1: 220, dur: 0.4, vol: 0.14, at: i * 0.45, filter: { f: 900, q: 4 } });
  },
  deflect() {
    if (!ready() || !gate('deflect', 60)) return;
    tone({ type: 'sine', f0: 1320, dur: 0.35, vol: 0.15 });
    tone({ type: 'sine', f0: 1980, dur: 0.45, vol: 0.09, at: 0.04 });
  },
  armor() {
    if (!ready() || !gate('armor', 50)) return;
    tone({ type: 'square', f0: 260, f1: 180, dur: 0.1, vol: 0.1, filter: { f: 1400 } });
  },
  zap() {
    if (!ready() || !gate('zap', 50)) return;
    tone({ type: 'sawtooth', f0: 2400, f1: 900, dur: 0.12, vol: 0.09, filter: { f: 5000 } });
  },
  districtLost() {
    if (!ready()) return;
    tone({ type: 'sine', f0: 90, f1: 25, dur: 1.4, vol: 0.5 });
    noise({ dur: 1.4, vol: 0.4, f0: 1800, f1: 60 });
    tone({ type: 'sawtooth', f0: 330, f1: 110, dur: 0.9, vol: 0.08, at: 0.1, filter: { f: 800 } });
  },
  waveClear() {
    if (!ready()) return;
    [261.6, 329.6, 392, 523.3].forEach((f, i) => {
      tone({ type: 'triangle', f0: f, dur: 1.2, vol: 0.12, at: i * 0.07 });
      tone({ type: 'sawtooth', f0: f / 2, dur: 1.0, vol: 0.03, at: i * 0.07, filter: { f: 1200 } });
    });
  },
  buy() {
    if (!ready()) return;
    tone({ type: 'square', f0: 880, dur: 0.07, vol: 0.08, filter: { f: 3000 } });
    tone({ type: 'square', f0: 1320, dur: 0.1, vol: 0.08, at: 0.07, filter: { f: 3000 } });
  },
  deny() {
    if (!ready() || !gate('deny', 120)) return;
    tone({ type: 'square', f0: 160, dur: 0.15, vol: 0.08, filter: { f: 900 } });
  },
  gameOver() {
    if (!ready()) return;
    [392, 311, 262, 196].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur: 0.6, vol: 0.1, at: i * 0.32, filter: { f: 1000 } }));
  },
  victory() {
    if (!ready()) return;
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.9, vol: 0.12, at: i * 0.12 }));
  },
};
