// Hub UI synth — tiny WebAudio voices, created lazily on first user gesture.
let ctx = null, master = null, muted = false;
let ambient = null;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

function tone({ type = 'square', f0 = 880, f1 = f0, dur = 0.05, vol = 0.08, delay = 0, filter = 0 }) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (filter) { const bq = ctx.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = filter; node = g.connect(bq); node.connect(master); } else g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.25, vol = 0.12, from = 400, to = 4000, delay = 0 }) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bq = ctx.createBiquadFilter(); bq.type = 'bandpass'; bq.Q.value = 2;
  bq.frequency.setValueAtTime(from, t); bq.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq).connect(g).connect(master);
  src.start(t); src.stop(t + dur);
}

export const sfx = {
  unlock() { ensure(); },
  hover() { tone({ type: 'square', f0: 2400, f1: 1800, dur: 0.025, vol: 0.025, filter: 5000 }); },
  click() { tone({ type: 'square', f0: 1200, f1: 600, dur: 0.06, vol: 0.05, filter: 4000 }); },
  toggle(on) { tone({ type: 'triangle', f0: on ? 660 : 990, f1: on ? 990 : 440, dur: 0.09, vol: 0.07 }); },
  swoosh() { noise({ dur: 0.3, vol: 0.09, from: 300, to: 5000 }); },
  error() { tone({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.18, vol: 0.08, filter: 1200 }); },
  jackIn() {
    // Power chord: detuned saws in fifths + sub drop + data-burst noise.
    [110, 164.8, 220, 329.6].forEach((f, i) => {
      tone({ type: 'sawtooth', f0: f, dur: 0.55, vol: 0.06, delay: i * 0.012, filter: 2400 });
      tone({ type: 'sawtooth', f0: f * 1.006, dur: 0.55, vol: 0.04, delay: i * 0.012, filter: 2400 });
    });
    tone({ type: 'sine', f0: 120, f1: 40, dur: 0.5, vol: 0.18 });
    noise({ dur: 0.35, vol: 0.06, from: 6000, to: 400, delay: 0.05 });
  },
  achievement() { [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.06, delay: i * 0.07 })); },
};

export function setMuted(m) {
  muted = !!m;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
}
export function isMuted() { return muted; }

// Dark-synth ambient pulse: low drone + filtered sequenced bass at ~92 BPM.
export function setAmbient(on) {
  if (!on) {
    if (ambient) {
      clearInterval(ambient.timer);
      const t = ctx.currentTime;
      ambient.bus.gain.setTargetAtTime(0, t, 0.3);
      const a = ambient; setTimeout(() => { try { a.drone.forEach((o) => o.stop()); a.bus.disconnect(); } catch (e) { /* stopped */ } }, 1500);
      ambient = null;
    }
    return false;
  }
  if (ambient || !ensure()) return !!ambient;
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(master);
  bus.gain.setTargetAtTime(0.35, ctx.currentTime, 1.2);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 6; lp.connect(bus);
  const lfo = ctx.createOscillator(); const lfoG = ctx.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 220;
  lfo.connect(lfoG).connect(lp.frequency);
  const drone = [55, 55.4, 82.4].map((f) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g).connect(lp); o.start(); return o;
  });
  lfo.start(); drone.push(lfo);
  const seq = [55, 55, 65.4, 55, 49, 55, 73.4, 65.4];
  let step = 0;
  const beat = 60 / 92 / 2;
  const timer = setInterval(() => {
    if (muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = seq[step++ % seq.length] * 2;
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + beat);
    g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.95);
    o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + beat);
  }, beat * 1000);
  ambient = { bus, drone, timer };
  return true;
}
export function isAmbient() { return !!ambient; }
