// OVERCLOCK // ICE Shatter — procedural WebAudio Cyberpunk 2077 synth SFX.
// Zero external audio assets; safe to import in Node.

const COMBO_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

export function createAudio(initialMuted = false) {
  let ctx = null;
  let noiseBuf = null;
  let muted = !!initialMuted;

  function ensure() {
    if (muted) return null;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function getNoise(c) {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
    const len = Math.floor(c.sampleRate * 0.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseBuf = buf;
    return buf;
  }

  function tone({ type = 'triangle', f0 = 440, f1 = null, dur = 0.1, gain = 0.14, delay = 0, attack = 0.005, filterFreq = 0 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 != null && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(attack, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    if (filterFreq > 0) {
      const flt = c.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(filterFreq, t0);
      osc.connect(flt);
      flt.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.18, gain = 0.16, freq = 900, f1 = null, q = 1.2, type = 'bandpass', delay = 0 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(Math.max(40, freq), t0);
    if (f1 != null) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const sfx = {
    unlock() {
      const was = muted;
      muted = false;
      ensure();
      muted = was;
    },
    setMuted(m) { muted = !!m; },
    isMuted() { return muted; },

    paddle() {
      tone({ type: 'triangle', f0: 210, f1: 420, dur: 0.085, gain: 0.16 });
      tone({ type: 'sine', f0: 110, f1: 72, dur: 0.09, gain: 0.13 });
    },

    wall() {
      tone({ type: 'square', f0: 520, f1: 310, dur: 0.045, gain: 0.06, filterFreq: 1600 });
    },

    launch() {
      tone({ type: 'sawtooth', f0: 220, f1: 760, dur: 0.16, gain: 0.11, filterFreq: 2400 });
      tone({ type: 'triangle', f0: 330, f1: 880, dur: 0.14, gain: 0.09, delay: 0.03 });
    },

    brick(combo = 1, kind = 'node') {
      const idx = Math.min(COMBO_SEMITONES.length - 1, Math.max(0, Math.floor((combo - 1) / 2)));
      const semi = COMBO_SEMITONES[idx];
      const base = kind === 'sentinel' ? 392 : kind === 'vault' ? 523.25 : 329.63;
      const freq = base * Math.pow(2, semi / 12);
      tone({ type: 'triangle', f0: freq, f1: freq * 1.48, dur: 0.11, gain: 0.14 });
      tone({ type: 'square', f0: freq * 2, f1: freq * 1.15, dur: 0.06, gain: 0.055, filterFreq: 3200 });
      noise({ dur: 0.045, gain: 0.06, freq: 2600 + semi * 90, q: 2.2 });
    },

    crack() {
      tone({ type: 'sawtooth', f0: 260, f1: 120, dur: 0.09, gain: 0.12, filterFreq: 1200 });
      noise({ dur: 0.08, gain: 0.12, freq: 1800, f1: 520, q: 2.5 });
    },

    chrome() {
      tone({ type: 'square', f0: 1280, f1: 980, dur: 0.07, gain: 0.085, filterFreq: 3600 });
      tone({ type: 'sine', f0: 1920, f1: 1640, dur: 0.09, gain: 0.07 });
    },

    explode() {
      tone({ type: 'sine', f0: 135, f1: 32, dur: 0.34, gain: 0.24 });
      tone({ type: 'sawtooth', f0: 98, f1: 28, dur: 0.28, gain: 0.13, filterFreq: 480 });
      noise({ dur: 0.34, gain: 0.22, freq: 950, f1: 120, type: 'lowpass', q: 1.0 });
    },

    vault() {
      [587.33, 880, 1174.66, 1567.98].forEach((f, i) => {
        tone({ type: 'triangle', f0: f, f1: f * 1.04, dur: 0.12, gain: 0.11, delay: i * 0.04 });
      });
    },

    laser() {
      tone({ type: 'sawtooth', f0: 1320, f1: 280, dur: 0.085, gain: 0.09, filterFreq: 3200 });
      tone({ type: 'square', f0: 960, f1: 240, dur: 0.07, gain: 0.05, delay: 0.015, filterFreq: 2400 });
    },

    powerup(kind = 'multi') {
      const notes = kind === 'eddy'
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
        : kind === 'pierce'
          ? [329.63, 440, 659.25, 880]
          : [440, 554.37, 659.25, 880];
      notes.forEach((f, i) => {
        tone({ type: 'triangle', f0: f, f1: f * 1.02, dur: 0.13, gain: 0.11, delay: i * 0.048 });
      });
    },

    slowmo() {
      tone({ type: 'sawtooth', f0: 260, f1: 42, dur: 0.55, gain: 0.2, filterFreq: 720 });
      tone({ type: 'sine', f0: 110, f1: 36, dur: 0.62, gain: 0.24 });
      noise({ dur: 0.38, gain: 0.12, freq: 1800, f1: 180, type: 'bandpass', q: 3.0 });
    },

    shieldSave() {
      tone({ type: 'sine', f0: 320, f1: 980, dur: 0.18, gain: 0.15 });
      tone({ type: 'triangle', f0: 640, f1: 1280, dur: 0.14, gain: 0.1, delay: 0.04 });
    },

    shieldHit() {
      tone({ type: 'square', f0: 680, f1: 420, dur: 0.08, gain: 0.09, filterFreq: 2200 });
    },

    shieldBreak() {
      tone({ type: 'sawtooth', f0: 720, f1: 180, dur: 0.18, gain: 0.13, filterFreq: 2000 });
      noise({ dur: 0.16, gain: 0.14, freq: 2200, f1: 400, q: 1.5 });
    },

    bossHit() {
      tone({ type: 'sawtooth', f0: 185, f1: 72, dur: 0.14, gain: 0.17, filterFreq: 850 });
      tone({ type: 'square', f0: 420, f1: 190, dur: 0.09, gain: 0.09, filterFreq: 1600 });
    },

    bossFire() {
      tone({ type: 'sawtooth', f0: 480, f1: 140, dur: 0.16, gain: 0.09, filterFreq: 1100 });
    },

    stun() {
      for (let i = 0; i < 4; i++) {
        tone({ type: 'sawtooth', f0: 190 - i * 28, f1: 85, dur: 0.07, gain: 0.13, delay: i * 0.045, filterFreq: 900 });
      }
      noise({ dur: 0.22, gain: 0.13, freq: 1400, f1: 260, q: 2 });
    },

    bossDown() {
      tone({ type: 'sine', f0: 140, f1: 28, dur: 0.65, gain: 0.26 });
      noise({ dur: 0.55, gain: 0.24, freq: 1100, f1: 90, type: 'lowpass' });
      [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => {
        tone({ type: 'sawtooth', f0: f, f1: f, dur: 0.28, gain: 0.09, delay: 0.12 + i * 0.06, filterFreq: 2400 });
      });
    },

    lose() {
      [340, 250, 175, 110].forEach((f, i) => {
        tone({ type: 'sawtooth', f0: f, f1: f * 0.72, dur: 0.11, gain: 0.14, delay: i * 0.065, filterFreq: 1100 });
      });
      noise({ dur: 0.26, gain: 0.14, freq: 1200, f1: 160, q: 2.2 });
    },

    stage() {
      [329.63, 440, 659.25].forEach((f, i) => {
        tone({ type: 'triangle', f0: f, dur: 0.12, gain: 0.09, delay: i * 0.055 });
      });
    },

    clear() {
      [440, 554.37, 659.25, 880, 1108.73].forEach((f, i) => {
        tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.12, delay: i * 0.065 });
      });
    },

    victory() {
      [392, 493.88, 587.33, 783.99, 987.77, 1174.66].forEach((f, i) => {
        tone({ type: 'sawtooth', f0: f, dur: 0.26, gain: 0.1, delay: i * 0.075, filterFreq: 2600 });
      });
    },

    gameover() {
      [293.66, 246.94, 196, 130.81, 82.41].forEach((f, i) => {
        tone({ type: 'sawtooth', f0: f, f1: f * 0.85, dur: 0.2, gain: 0.13, delay: i * 0.09, filterFreq: 950 });
      });
    },

    playEvent(ev) {
      if (!ev || muted) return;
      switch (ev.type) {
        case 'paddle': sfx.paddle(); break;
        case 'wall': sfx.wall(); break;
        case 'launch': sfx.launch(); break;
        case 'brick': sfx.brick(ev.combo || 1, ev.kind); break;
        case 'crack': sfx.crack(); break;
        case 'chrome': sfx.chrome(); break;
        case 'explode': sfx.explode(); break;
        case 'vault': sfx.vault(); break;
        case 'laser': sfx.laser(); break;
        case 'powerup': sfx.powerup(ev.kind); break;
        case 'slowmo': sfx.slowmo(); break;
        case 'shieldSave': sfx.shieldSave(); break;
        case 'shieldHit': sfx.shieldHit(); break;
        case 'shieldBreak': sfx.shieldBreak(); break;
        case 'bossHit': sfx.bossHit(); break;
        case 'bossFire': sfx.bossFire(); break;
        case 'stun': sfx.stun(); break;
        case 'bossDown': sfx.bossDown(); break;
        case 'lose': sfx.lose(); break;
        case 'stage': sfx.stage(); break;
        case 'clear': sfx.clear(); break;
        case 'victory': sfx.victory(); break;
        case 'gameover': sfx.gameover(); break;
        default: break;
      }
    },
  };

  return sfx;
}
