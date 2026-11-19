// WebAudio cyberpunk terminal SFX. Lazy-initialised on first user gesture.
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f = 440, f2 = null, d = 0.08, type = 'square', v = 0.08, at = 0 }) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + d + 0.02);
}

function noise({ d = 0.3, v = 0.1, at = 0, lp = 2000 }) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const n = Math.floor(a.sampleRate * d);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource();
  s.buffer = buf;
  const fl = a.createBiquadFilter();
  fl.type = 'bandpass';
  fl.frequency.setValueAtTime(300, t);
  fl.frequency.exponentialRampToValueAtTime(lp, t + d);
  const g = a.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(a.destination);
  s.start(t);
}

export const sfx = {
  setMuted(m) { muted = !!m; },
  unlock() { ac(); },
  pick(i = 0) { tone({ f: 880 + i * 60, d: 0.05, type: 'square', v: 0.06 }); tone({ f: 1760 + i * 60, d: 0.03, type: 'sine', v: 0.03, at: 0.02 }); },
  whoosh() { noise({ d: 0.18, v: 0.05, lp: 3500 }); },
  deny() { tone({ f: 140, d: 0.1, type: 'sawtooth', v: 0.06 }); },
  daemon() { [523, 659, 784].forEach((f, i) => tone({ f, d: 0.16, type: 'triangle', v: 0.09, at: i * 0.08 })); },
  sweep() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, d: 0.22, type: 'triangle', v: 0.09, at: i * 0.09 })); tone({ f: 1047, d: 0.7, type: 'sine', v: 0.05, at: 0.45 }); },
  tick() { tone({ f: 1200, d: 0.04, type: 'square', v: 0.05 }); },
  freeze() { tone({ f: 1500, f2: 300, d: 0.5, type: 'sine', v: 0.07 }); },
  buy() { tone({ f: 660, d: 0.07, type: 'square', v: 0.06 }); tone({ f: 990, d: 0.1, type: 'square', v: 0.06, at: 0.07 }); },
  fail() {
    noise({ d: 0.7, v: 0.14, lp: 1200 });
    tone({ f: 220, f2: 40, d: 0.7, type: 'sawtooth', v: 0.12 });
    tone({ f: 110, f2: 30, d: 0.8, type: 'square', v: 0.08, at: 0.1 });
  },
};
