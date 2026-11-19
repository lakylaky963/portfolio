// Procedural WebAudio SFX. No audio files. Unlocks on the first user gesture.
let ctx = null, master = null, muted = false, last = {};

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : 0.5;
}

/** Call from any pointer/key handler; safe to call repeatedly. */
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ f = 440, f2 = null, t = 0.1, type = 'square', v = 0.15, at = 0, curve = 'exp' }) {
  const now = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency[curve === 'exp' ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](f2, now + t);
  g.gain.setValueAtTime(v, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  o.connect(g); g.connect(master);
  o.start(now); o.stop(now + t + 0.02);
}

function noise({ t = 0.2, v = 0.2, lp = 1800, hp = 0, at = 0 }) {
  const now = ctx.currentTime + at;
  const n = Math.floor(ctx.sampleRate * t);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(lp, now);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, lp / 6), now + t);
  const g = ctx.createGain(); g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  let node = src;
  if (hp) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; src.connect(h); node = h; }
  node.connect(f); f.connect(g); g.connect(master);
  src.start(now);
}

const SFX = {
  pew:     () => tone({ f: 900, f2: 300, t: 0.08, type: 'square', v: 0.08 }),
  laser:   () => tone({ f: 220, f2: 260, t: 0.12, type: 'sawtooth', v: 0.035, curve: 'lin' }),
  splash:  () => { noise({ t: 0.35, v: 0.28, lp: 900 }); tone({ f: 120, f2: 40, t: 0.3, type: 'sine', v: 0.25 }); },
  zap:     () => { noise({ t: 0.14, v: 0.12, lp: 6000, hp: 1500 }); tone({ f: 1400, f2: 300, t: 0.12, type: 'sawtooth', v: 0.07 }); },
  slow:    () => { tone({ f: 700, f2: 250, t: 0.3, type: 'sine', v: 0.1 }); tone({ f: 1050, f2: 380, t: 0.3, type: 'sine', v: 0.05 }); },
  place:   () => { tone({ f: 330, t: 0.07, type: 'triangle', v: 0.16 }); tone({ f: 495, t: 0.1, type: 'triangle', v: 0.16, at: 0.06 }); },
  upgrade: () => [392, 494, 587, 784].forEach((f, i) => tone({ f, t: 0.14, type: 'triangle', v: 0.14, at: i * 0.07 })),
  sell:    () => { tone({ f: 600, f2: 300, t: 0.14, type: 'triangle', v: 0.14 }); },
  cash:    () => { tone({ f: 1318, t: 0.06, type: 'square', v: 0.06 }); tone({ f: 1760, t: 0.12, type: 'square', v: 0.06, at: 0.05 }); },
  kill:    () => noise({ t: 0.12, v: 0.1, lp: 2500 }),
  boom:    () => { noise({ t: 0.7, v: 0.45, lp: 1400 }); tone({ f: 90, f2: 25, t: 0.6, type: 'sine', v: 0.4 }); },
  horn:    () => { tone({ f: 196, t: 0.55, type: 'sawtooth', v: 0.14 }); tone({ f: 294, t: 0.55, type: 'sawtooth', v: 0.1 }); tone({ f: 392, t: 0.45, type: 'sawtooth', v: 0.06, at: 0.1 }); },
  bosshorn:() => { tone({ f: 98, f2: 82, t: 1.0, type: 'sawtooth', v: 0.2 }); tone({ f: 147, f2: 123, t: 1.0, type: 'sawtooth', v: 0.14 }); },
  emp:     () => { noise({ t: 0.8, v: 0.3, lp: 8000 }); tone({ f: 1800, f2: 60, t: 0.8, type: 'sawtooth', v: 0.2 }); },
  overclock: () => { tone({ f: 200, f2: 1200, t: 0.5, type: 'sawtooth', v: 0.14 }); },
  leak:    () => { tone({ f: 180, f2: 90, t: 0.3, type: 'square', v: 0.2 }); },
  deny:    () => tone({ f: 140, t: 0.12, type: 'square', v: 0.12 }),
  clear:   () => [523, 659, 784].forEach((f, i) => tone({ f, t: 0.16, type: 'triangle', v: 0.14, at: i * 0.08 })),
  badge:   () => [659, 880, 1175, 1568].forEach((f, i) => tone({ f, t: 0.18, type: 'triangle', v: 0.12, at: i * 0.09 })),
  defeat:  () => [392, 349, 311, 262, 196].forEach((f, i) => tone({ f, t: 0.35, type: 'sawtooth', v: 0.14, at: i * 0.22 })),
  victory: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ f, t: 0.22, type: 'triangle', v: 0.16, at: i * 0.12 })),
};

// minimum gap between repeats (seconds) so dense fights do not turn into noise
const GAP = { pew: 0.045, laser: 0.14, splash: 0.08, zap: 0.07, slow: 0.2, kill: 0.04, cash: 0.06, leak: 0.1 };

export function play(name) {
  if (!ctx || muted || !SFX[name]) return;
  const now = ctx.currentTime, gap = GAP[name] || 0;
  if (gap && last[name] && now - last[name] < gap) return;
  last[name] = now;
  try { SFX[name](); } catch (e) { /* audio is optional */ }
}
