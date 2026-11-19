// BLACKWALL DEFENSE — Night City Orbital Cyber-Command Canvas Renderer.
import {
  W,
  H,
  GROUND,
  BATTERY_Y,
  DISTRICT_HALF,
  BATTERY_HALF,
  CIWS_TURRETS,
  BLAST_GROW,
  BLAST_ACTIVE,
  BLAST_DUR,
  SANDY_DUR,
  blastRadius,
  reloadTime,
} from './engine.js';
import { t, getStrings } from './i18n.js';

const MAX_PARTICLES = 420;

// Deterministic PRNG for procedural city skyline geometry.
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Prebuild atmospheric stars, background skyline, rain, and the 4 megatower districts.
function buildWorldGeometry() {
  const rnd = mulberry32(2077);

  const stars = [];
  for (let i = 0; i < 95; i++) {
    stars.push({
      x: rnd() * W,
      y: rnd() * (GROUND - 260),
      r: 0.6 + rnd() * 1.4,
      phase: rnd() * Math.PI * 2,
      speed: 0.8 + rnd() * 2.2,
      hue: rnd() < 0.25 ? '#00f0ff' : rnd() < 0.4 ? '#fcee09' : '#c8d6ff',
    });
  }

  const rain = [];
  for (let i = 0; i < 110; i++) {
    rain.push({
      x: rnd() * W,
      y: rnd() * GROUND,
      len: 14 + rnd() * 26,
      speed: 420 + rnd() * 340,
      alpha: 0.08 + rnd() * 0.16,
      cyan: rnd() < 0.68,
    });
  }

  // Far horizon silhouette towers
  const bgTowers = [];
  let bx = -10;
  while (bx < W + 20) {
    const w = 26 + Math.floor(rnd() * 44);
    const h = 75 + Math.floor(rnd() * 190);
    bgTowers.push({
      x: bx,
      w,
      h,
      beacon: h > 190 && rnd() < 0.55,
      phase: rnd() * Math.PI * 2,
    });
    bx += w - 4 + Math.floor(rnd() * 10);
  }

  // 4 signature Night City megatower districts
  const paletteByDistrict = {
    watson: { primary: '#00f0ff', secondary: '#ffaa00', sign: 'WATSON' },
    westbrook: { primary: '#ff003c', secondary: '#fcee09', sign: 'CORPO' },
    heywood: { primary: '#00ff9f', secondary: '#00f0ff', sign: 'HEYWOOD' },
    center: { primary: '#fcee09', secondary: '#00f0ff', sign: 'ARASAKA' },
  };

  const districtArt = {};
  const specs = [
    { id: 'watson', x: 330, seed: 101 },
    { id: 'westbrook', x: 590, seed: 202 },
    { id: 'heywood', x: 1010, seed: 303 },
    { id: 'center', x: 1270, seed: 404 },
  ];

  for (const sp of specs) {
    const dr = mulberry32(sp.seed);
    const pal = paletteByDistrict[sp.id];
    const towers = [];
    const offsets = [-64, -36, -6, 26, 52];
    offsets.forEach((ox, idx) => {
      const centerBoost = idx === 2 ? 48 : idx === 1 || idx === 3 ? 22 : 0;
      const w = 22 + Math.floor(dr() * 14) + (idx === 2 ? 10 : 0);
      const h = 88 + centerBoost + Math.floor(dr() * 68);
      const cols = Math.max(2, Math.floor((w - 6) / 6));
      const rows = Math.max(4, Math.floor((h - 18) / 9));
      const windows = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (dr() < 0.62) {
            windows.push({
              rx: 4 + c * 6,
              ry: 10 + r * 9,
              lit: dr() < 0.82 ? pal.primary : pal.secondary,
              alpha: 0.35 + dr() * 0.55,
            });
          }
        }
      }
      towers.push({
        ox: ox - w / 2,
        w,
        h,
        spire: idx === 2 || dr() < 0.45,
        spireH: 18 + Math.floor(dr() * 28),
        chamfer: dr() < 0.5 ? 6 : 0,
        sign: idx === 2 || idx === 1,
        signColor: idx === 2 ? pal.primary : pal.secondary,
        windows,
      });
    });

    // Ruin silhouette for destroyed state
    const ruins = [];
    for (let i = -72; i <= 60; i += 18) {
      ruins.push({ ox: i, w: 16 + dr() * 10, h: 14 + dr() * 34 });
    }
    districtArt[sp.id] = { pal, towers, ruins };
  }

  return { stars, rain, bgTowers, districtArt };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const world = buildWorldGeometry();

  // Pre-render static background layers (sky gradient, stars, orbital radar arcs, background silhouette towers)
  // onto offscreen 1600x1000 canvases created once so render() blits with ctx.drawImage(bgCanvas, 0, 0).
  const bgCanvas = createStaticBgCanvas(false);
  const bgSandyCanvas = createStaticBgCanvas(true);

  function createStaticBgCanvas(sandy) {
    let off = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      off = document.createElement('canvas');
      off.width = W;
      off.height = H;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      off = new OffscreenCanvas(W, H);
    }
    if (!off) return null;
    const bctx = off.getContext('2d');
    if (!bctx) return null;

    // 1. Sky gradient + horizon light pollution
    const g = bctx.createLinearGradient(0, 0, 0, H);
    if (sandy) {
      g.addColorStop(0, '#04111c');
      g.addColorStop(0.58, '#072235');
      g.addColorStop(0.88, '#172330');
      g.addColorStop(1, '#080c14');
    } else {
      g.addColorStop(0, '#04060d');
      g.addColorStop(0.52, '#090d1f');
      g.addColorStop(0.84, '#1b0d24');
      g.addColorStop(0.92, '#240f25');
      g.addColorStop(1, '#07080d');
    }
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, W, H);

    const hg = bctx.createRadialGradient(W / 2, GROUND + 30, 60, W / 2, GROUND + 30, 820);
    hg.addColorStop(0, sandy ? 'rgba(0, 240, 255, 0.22)' : 'rgba(255, 0, 60, 0.2)');
    hg.addColorStop(0.5, 'rgba(0, 240, 255, 0.08)');
    hg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    bctx.fillStyle = hg;
    bctx.fillRect(0, GROUND - 380, W, 420);

    // 2. Stars
    for (const s of world.stars) {
      const tw = 0.45 + 0.55 * Math.sin(s.phase);
      bctx.globalAlpha = tw * 0.7;
      bctx.fillStyle = s.hue;
      bctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
    }
    bctx.globalAlpha = 1;

    // 3. Distant orbital radar arcs & elevation lines
    bctx.strokeStyle = sandy ? 'rgba(0, 240, 255, 0.11)' : 'rgba(0, 240, 255, 0.055)';
    bctx.lineWidth = 1;
    for (const rad of [380, 620, 860, 1100]) {
      bctx.beginPath();
      bctx.arc(W / 2, GROUND + 140, rad, Math.PI * 1.08, Math.PI * 1.92);
      bctx.stroke();
    }
    for (let y = 180; y < GROUND - 80; y += 180) {
      bctx.beginPath();
      bctx.moveTo(0, y);
      bctx.lineTo(W, y);
      bctx.stroke();
    }

    // 4. Background silhouette towers
    for (const b of world.bgTowers) {
      bctx.fillStyle = '#0c1020';
      bctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
      bctx.fillStyle = 'rgba(0, 240, 255, 0.04)';
      bctx.fillRect(b.x, GROUND - b.h, 2, b.h);
      if (b.beacon) {
        bctx.fillStyle = '#ff003c';
        bctx.fillRect(b.x + b.w / 2 - 1.5, GROUND - b.h - 4, 3, 3);
      }
    }

    return off;
  }

  let fx = freshFx();

  function freshFx() {
    return {
      time: 0,
      particles: [],
      floaters: [],
      zaps: [],
      muzzles: [0, 0, 0],
      recoils: [0, 0, 0],
      shieldPulse: [0, 0, 0, 0],
      empWave: null,
      flash: { alpha: 0, color: '#00f0ff' },
      banner: null,
      shake: 0,
      smokeT: 0,
    };
  }

  function reset() {
    fx = freshFx();
  }

  function addShake(amount) {
    fx.shake = Math.min(24, fx.shake + amount);
  }

  function spawnParticles(x, y, count, opts = {}) {
    const {
      color = '#00f0ff',
      color2 = '#fcee09',
      speedMin = 40,
      speedMax = 240,
      lifeMin = 0.25,
      lifeMax = 0.75,
      sizeMin = 1.5,
      sizeMax = 4,
      gravity = 90,
      angleMin = 0,
      angleMax = Math.PI * 2,
    } = opts;
    for (let i = 0; i < count; i++) {
      if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
      const ang = angleMin + Math.random() * (angleMax - angleMin);
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      fx.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life,
        maxLife: life,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        color: Math.random() < 0.55 ? color : color2,
        gravity,
      });
    }
  }

  function addFloater(x, y, text, opts = {}) {
    fx.floaters.push({
      x,
      y,
      text,
      color: opts.color || '#fcee09',
      size: opts.size || 20,
      vy: opts.vy ?? -55,
      life: opts.life || 1.0,
      maxLife: opts.life || 1.0,
      bold: opts.bold ?? true,
    });
  }

  function showBanner(text, color = '#00f0ff', dur = 2.1, sub = '') {
    fx.banner = { text, color, sub, life: dur, maxLife: dur };
  }

  function handleEvent(ev, state, lang) {
    const names = getStrings(lang).districtNames || {};
    switch (ev.type) {
      case 'waveStart':
        if (ev.boss) {
          showBanner(t(lang, 'bossIncoming'), '#ff003c', 3.0, t(lang, 'waveIncoming', { n: ev.wave }));
          addShake(8);
        } else {
          showBanner(t(lang, 'waveIncoming', { n: ev.wave }), '#fcee09', 1.8);
        }
        break;
      case 'launch':
        if (ev.battery != null && ev.battery >= 0 && ev.battery < 3) {
          fx.muzzles[ev.battery] = 0.14;
          fx.recoils[ev.battery] = 1.0;
        }
        spawnParticles(ev.x, ev.y - 10, 7, {
          color: '#00f0ff',
          color2: '#fcee09',
          speedMin: 60,
          speedMax: 180,
          lifeMin: 0.12,
          lifeMax: 0.28,
          sizeMin: 1.5,
          sizeMax: 3,
          gravity: 20,
          angleMin: -Math.PI,
          angleMax: 0,
        });
        break;
      case 'blast':
        spawnParticles(ev.x, ev.y, ev.kind === 'chain' ? 18 : 22, {
          color: ev.kind === 'chain' ? '#fcee09' : '#00f0ff',
          color2: ev.kind === 'chain' ? '#ff003c' : '#fcee09',
          speedMin: 60,
          speedMax: 280,
          lifeMin: 0.25,
          lifeMax: 0.65,
          sizeMin: 1.5,
          sizeMax: 3.8,
          gravity: 65,
        });
        if (ev.kind === 'chain') addShake(2.2);
        break;
      case 'kill':
        spawnParticles(ev.x, ev.y, ev.etype === 'dreadnought' ? 50 : 12, {
          color: '#ff003c',
          color2: '#fcee09',
          speedMin: 50,
          speedMax: 240,
          lifeMin: 0.2,
          lifeMax: 0.55,
          sizeMin: 1.5,
          sizeMax: 3.5,
        });
        if (ev.score) {
          addFloater(ev.x, ev.y - 12, `+${ev.score}`, {
            color: ev.cause === 'emp' ? '#00f0ff' : '#fcee09',
            size: 16,
            life: 0.75,
            vy: -48,
          });
        }
        break;
      case 'chain': {
        const big = ev.count >= 8;
        const label = ev.label ? ev.label.replace('x', '×') : `${ev.count}×`;
        addFloater(ev.x, ev.y - 26, label, {
          color: big ? '#ff003c' : ev.count >= 5 ? '#fcee09' : '#00f0ff',
          size: big ? 36 : ev.count >= 5 ? 30 : 24,
          life: big ? 1.5 : 1.15,
          vy: -62,
        });
        addShake(big ? 10 : 4);
        break;
      }
      case 'impact':
        spawnParticles(ev.x, ev.y, 26, {
          color: '#ff003c',
          color2: '#ffaa00',
          speedMin: 70,
          speedMax: 310,
          lifeMin: 0.35,
          lifeMax: 0.9,
          sizeMin: 2,
          sizeMax: 5,
          gravity: 220,
          angleMin: -Math.PI,
          angleMax: 0,
        });
        addShake(ev.kind === 'district' ? 14 : ev.kind === 'battery' ? 10 : 4);
        break;
      case 'districtLost': {
        const dname = names[ev.id] || ev.id.toUpperCase();
        showBanner(t(lang, 'districtLost', { name: dname }), '#ff003c', 2.4);
        fx.flash = { alpha: 0.42, color: '#ff003c' };
        addShake(18);
        spawnParticles(ev.x, GROUND - 45, 45, {
          color: '#ff003c',
          color2: '#ffaa00',
          speedMin: 60,
          speedMax: 340,
          lifeMin: 0.5,
          lifeMax: 1.3,
          sizeMin: 2.5,
          sizeMax: 6,
          gravity: 190,
          angleMin: -Math.PI,
          angleMax: 0,
        });
        break;
      }
      case 'batteryLost':
        addShake(11);
        fx.flash = { alpha: 0.22, color: '#ffaa00' };
        break;
      case 'shieldHit':
        if (ev.idx != null && ev.idx >= 0 && ev.idx < 4) fx.shieldPulse[ev.idx] = 1.0;
        spawnParticles(ev.x, ev.y, 16, {
          color: '#00f0ff',
          color2: '#ffffff',
          speedMin: 50,
          speedMax: 200,
          lifeMin: 0.2,
          lifeMax: 0.5,
          gravity: 30,
        });
        if (ev.shield === 0) {
          addFloater(ev.x, ev.y - 30, t(lang, 'shieldDown'), { color: '#ff003c', size: 20, life: 1.2 });
        }
        break;
      case 'shieldUp':
        if (ev.idx != null && ev.idx >= 0 && ev.idx < 4) fx.shieldPulse[ev.idx] = 0.7;
        break;
      case 'zap':
        fx.zaps.push({ x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, life: 0.18, maxLife: 0.18 });
        spawnParticles(ev.x2, ev.y2, 8, {
          color: '#00ff9f',
          color2: '#00f0ff',
          speedMin: 40,
          speedMax: 150,
          lifeMin: 0.15,
          lifeMax: 0.35,
          gravity: 40,
        });
        break;
      case 'emp':
        fx.empWave = { r: 20, maxR: W * 1.15, life: 0.85, maxLife: 0.85 };
        fx.flash = { alpha: 0.55, color: '#00f0ff' };
        addShake(9);
        showBanner(t(lang, 'empFired', { k: ev.kills }), '#00f0ff', 1.8);
        break;
      case 'sandy':
        fx.flash = { alpha: 0.38, color: '#fcee09' };
        showBanner(t(lang, 'sandyOn'), '#fcee09', 1.5);
        break;
      case 'bomberEnter':
        addFloater(Math.max(160, Math.min(W - 160, ev.x)), ev.y + 38, t(lang, 'bomber'), {
          color: '#ffaa00',
          size: 20,
          life: 1.5,
          vy: -18,
        });
        break;
      case 'mirvSplit':
        spawnParticles(ev.x, ev.y, 16, {
          color: '#ffaa00',
          color2: '#ff003c',
          speedMin: 50,
          speedMax: 190,
          lifeMin: 0.2,
          lifeMax: 0.5,
        });
        break;
      case 'armorHit':
        spawnParticles(ev.x, ev.y, 10, {
          color: '#ffffff',
          color2: '#ffaa00',
          speedMin: 50,
          speedMax: 170,
          lifeMin: 0.15,
          lifeMax: 0.35,
        });
        break;
      case 'bossHit':
        spawnParticles(ev.x, ev.y, 14, {
          color: ev.part === 'shield' ? '#00f0ff' : '#ff003c',
          color2: '#fcee09',
          speedMin: 70,
          speedMax: 220,
          lifeMin: 0.2,
          lifeMax: 0.45,
        });
        addShake(3);
        break;
      case 'bossShieldDown':
        showBanner(t(lang, 'shieldDown'), '#00f0ff', 1.7);
        addShake(11);
        fx.flash = { alpha: 0.3, color: '#00f0ff' };
        break;
      case 'bossDefeated':
        addShake(22);
        fx.flash = { alpha: 0.55, color: '#fcee09' };
        spawnParticles(ev.x, ev.y, 75, {
          color: '#fcee09',
          color2: '#ff003c',
          speedMin: 80,
          speedMax: 420,
          lifeMin: 0.5,
          lifeMax: 1.5,
          sizeMin: 2.5,
          sizeMax: 6.5,
          gravity: 110,
        });
        break;
      case 'dry':
        addFloater(ev.x, ev.y - 16, t(lang, 'dry'), { color: '#ff003c', size: 17, life: 0.75, vy: -36 });
        break;
      default:
        break;
    }
  }

  function update(dt, state) {
    fx.time += dt;
    const sandy = state && state.abilities.sandy.active > 0;
    const rainMul = sandy ? 0.25 : 1;

    // Rain streaks
    for (const r of world.rain) {
      r.x -= r.speed * 0.14 * dt * rainMul;
      r.y += r.speed * dt * rainMul;
      if (r.y > GROUND + 20) {
        r.y = -30;
        r.x = Math.random() * (W + 140);
      }
      if (r.x < -20) r.x += W + 40;
    }

    // Smoke rising from destroyed districts
    if (state) {
      fx.smokeT -= dt;
      if (fx.smokeT <= 0) {
        fx.smokeT = 0.12;
        for (const d of state.districts) {
          if (!d.alive && fx.particles.length < MAX_PARTICLES) {
            fx.particles.push({
              x: d.x + (Math.random() - 0.5) * 110,
              y: GROUND - 16 - Math.random() * 20,
              vx: (Math.random() - 0.5) * 18 - 8,
              vy: -24 - Math.random() * 34,
              life: 1.2 + Math.random() * 1.1,
              maxLife: 2.3,
              size: 4 + Math.random() * 6,
              color: Math.random() < 0.2 ? '#ff3b30' : '#3a3f54',
              gravity: -8,
              smoke: true,
            });
          }
        }
      }
    }

    // Particles
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        fx.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Floaters
    for (let i = fx.floaters.length - 1; i >= 0; i--) {
      const f = fx.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) fx.floaters.splice(i, 1);
    }

    // CIWS zaps
    for (let i = fx.zaps.length - 1; i >= 0; i--) {
      fx.zaps[i].life -= dt;
      if (fx.zaps[i].life <= 0) fx.zaps.splice(i, 1);
    }

    for (let i = 0; i < 3; i++) {
      if (fx.muzzles[i] > 0) fx.muzzles[i] = Math.max(0, fx.muzzles[i] - dt);
      if (fx.recoils[i] > 0) fx.recoils[i] = Math.max(0, fx.recoils[i] - dt * 5);
    }
    for (let i = 0; i < 4; i++) {
      if (fx.shieldPulse[i] > 0) fx.shieldPulse[i] = Math.max(0, fx.shieldPulse[i] - dt * 2.4);
    }

    if (fx.empWave) {
      fx.empWave.life -= dt;
      const prog = 1 - fx.empWave.life / fx.empWave.maxLife;
      fx.empWave.r = 20 + prog * fx.empWave.maxR;
      if (fx.empWave.life <= 0) fx.empWave = null;
    }

    if (fx.flash.alpha > 0) fx.flash.alpha = Math.max(0, fx.flash.alpha - dt * 1.4);
    if (fx.banner) {
      fx.banner.life -= dt;
      if (fx.banner.life <= 0) fx.banner = null;
    }
    if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 28);
  }

  function render(state, ui = {}) {
    const sandy = state && state.abilities.sandy.active > 0;
    const lang = ui.lang || 'en';
    const names = getStrings(lang).districtNames || {};

    ctx.save();
    if (fx.shake > 0.2) {
      const ox = (Math.random() - 0.5) * fx.shake * 1.4;
      const oy = (Math.random() - 0.5) * fx.shake * 1.4;
      ctx.translate(ox, oy);
    }

    const activeBg = sandy ? bgSandyCanvas : bgCanvas;
    if (activeBg) {
      ctx.drawImage(activeBg, 0, 0);
    } else {
      drawSky(sandy);
      drawStars();
      drawOrbitalGrid(sandy);
      drawBgSkyline();
    }
    drawRain(sandy);

    if (state) {
      drawDistricts(state, names);
      drawCiwsTurrets(state);
      drawGroundWall();
      drawBatteries(state, ui, lang);
      drawEnemies(state, lang);
      drawInterceptors(state);
      drawBlasts(state);
      drawZaps();
      drawParticles();
      drawEmpWave();
      drawSandyOverlay(state);
      drawFloaters();
      drawBanner();
      drawHint(state, ui, lang);
      drawCrosshair(state, ui);
    }

    if (fx.flash.alpha > 0.005) {
      ctx.save();
      ctx.globalAlpha = fx.flash.alpha;
      ctx.fillStyle = fx.flash.color;
      ctx.fillRect(-30, -30, W + 60, H + 60);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawSky(sandy) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (sandy) {
      g.addColorStop(0, '#04111c');
      g.addColorStop(0.58, '#072235');
      g.addColorStop(0.88, '#172330');
      g.addColorStop(1, '#080c14');
    } else {
      g.addColorStop(0, '#04060d');
      g.addColorStop(0.52, '#090d1f');
      g.addColorStop(0.84, '#1b0d24');
      g.addColorStop(0.92, '#240f25');
      g.addColorStop(1, '#07080d');
    }
    ctx.fillStyle = g;
    ctx.fillRect(-30, -30, W + 60, H + 60);

    // Horizon neon city light-pollution glow
    const hg = ctx.createRadialGradient(W / 2, GROUND + 30, 60, W / 2, GROUND + 30, 820);
    hg.addColorStop(0, sandy ? 'rgba(0, 240, 255, 0.22)' : 'rgba(255, 0, 60, 0.2)');
    hg.addColorStop(0.5, 'rgba(0, 240, 255, 0.08)');
    hg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, GROUND - 380, W, 420);
  }

  function drawStars() {
    for (const s of world.stars) {
      const tw = 0.45 + 0.55 * Math.sin(fx.time * s.speed + s.phase);
      ctx.globalAlpha = tw * 0.7;
      ctx.fillStyle = s.hue;
      ctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawOrbitalGrid(sandy) {
    ctx.save();
    ctx.strokeStyle = sandy ? 'rgba(0, 240, 255, 0.11)' : 'rgba(0, 240, 255, 0.055)';
    ctx.lineWidth = 1;
    // Concentric orbital radar arcs centered below skyline
    for (const rad of [380, 620, 860, 1100]) {
      ctx.beginPath();
      ctx.arc(W / 2, GROUND + 140, rad, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    // Elevation lines
    for (let y = 180; y < GROUND - 80; y += 180) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBgSkyline() {
    ctx.save();
    for (const b of world.bgTowers) {
      ctx.fillStyle = '#0c1020';
      ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.04)';
      ctx.fillRect(b.x, GROUND - b.h, 2, b.h);
      if (b.beacon) {
        const blink = Math.sin(fx.time * 3 + b.phase) > 0.2;
        if (blink) {
          ctx.fillStyle = '#ff003c';
          ctx.fillRect(b.x + b.w / 2 - 1.5, GROUND - b.h - 4, 3, 3);
        }
      }
    }
    ctx.restore();
  }

  function drawRain(sandy) {
    ctx.save();
    ctx.lineWidth = 1;
    for (const r of world.rain) {
      ctx.strokeStyle = r.cyan
        ? `rgba(0, 240, 255, ${sandy ? r.alpha * 1.4 : r.alpha})`
        : `rgba(255, 0, 60, ${r.alpha * 0.85})`;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.len * 0.14, r.y + r.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDistricts(state, names) {
    for (const d of state.districts) {
      const art = world.districtArt[d.id];
      if (!art) continue;

      if (d.alive) {
        // Subtle ambient district backlight
        const glow = ctx.createRadialGradient(d.x, GROUND - 40, 10, d.x, GROUND - 40, 110);
        glow.addColorStop(0, art.pal.primary + '2a');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(d.x - 110, GROUND - 180, 220, 180);

        for (const tw of art.towers) {
          const tx = d.x + tw.ox;
          const ty = GROUND - tw.h;

          // Tower body with optional chamfered roof
          ctx.fillStyle = '#111629';
          ctx.beginPath();
          ctx.moveTo(tx, GROUND);
          ctx.lineTo(tx, ty + tw.chamfer);
          ctx.lineTo(tx + tw.chamfer, ty);
          ctx.lineTo(tx + tw.w, ty);
          ctx.lineTo(tx + tw.w, GROUND);
          ctx.closePath();
          ctx.fill();

          // Neon edge highlight
          ctx.strokeStyle = art.pal.primary + '55';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Rooftop spire
          if (tw.spire) {
            ctx.strokeStyle = art.pal.primary + 'aa';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(tx + tw.w / 2, ty);
            ctx.lineTo(tx + tw.w / 2, ty - tw.spireH);
            ctx.stroke();
            if (Math.sin(fx.time * 4 + d.idx) > 0) {
              ctx.fillStyle = '#ff003c';
              ctx.fillRect(tx + tw.w / 2 - 2, ty - tw.spireH - 2, 4, 4);
            }
          }

          // Lit windows
          for (const win of tw.windows) {
            ctx.globalAlpha = win.alpha;
            ctx.fillStyle = win.lit;
            ctx.fillRect(tx + win.rx, ty + win.ry, 3.5, 5);
          }
          ctx.globalAlpha = 1;

          // Vertical holo-sign strip
          if (tw.sign) {
            const pulse = 0.72 + 0.28 * Math.sin(fx.time * 5 + d.idx * 1.7);
            ctx.fillStyle = tw.signColor;
            ctx.globalAlpha = pulse;
            ctx.fillRect(tx + tw.w - 4, ty + 14, 3, Math.min(44, tw.h * 0.45));
            ctx.globalAlpha = 1;
          }
        }

        // Holo-Shield Dome when shielded
        if (d.shield > 0) {
          const pulse = fx.shieldPulse[d.idx] || 0;
          const domeR = DISTRICT_HALF + 16;
          const shimmer = 0.55 + 0.2 * Math.sin(fx.time * 6 + d.idx);

          ctx.save();
          ctx.beginPath();
          ctx.arc(d.x, GROUND - 8, domeR, Math.PI, 0, false);
          const sg = ctx.createRadialGradient(d.x, GROUND - 8, domeR * 0.4, d.x, GROUND - 8, domeR);
          sg.addColorStop(0, 'rgba(0, 240, 255, 0.02)');
          sg.addColorStop(0.75, `rgba(0, 240, 255, ${0.12 + pulse * 0.25})`);
          sg.addColorStop(1, `rgba(0, 255, 159, ${0.32 + pulse * 0.45})`);
          ctx.fillStyle = sg;
          ctx.fill();

          // Concentric rings per shield layer
          for (let layer = 0; layer < d.shield; layer++) {
            ctx.beginPath();
            ctx.arc(d.x, GROUND - 8, domeR - layer * 7, Math.PI, 0, false);
            ctx.strokeStyle = layer === 0 ? `rgba(0, 240, 255, ${shimmer + pulse * 0.4})` : 'rgba(0, 255, 159, 0.5)';
            ctx.lineWidth = layer === 0 ? 2.5 + pulse * 2 : 1.4;
            ctx.stroke();
          }

          // Electric crackle arc along dome rim
          const arcA = Math.PI + ((fx.time * 1.6 + d.idx * 0.9) % 1) * Math.PI * 0.78;
          ctx.beginPath();
          ctx.arc(d.x, GROUND - 8, domeR + 1, arcA, arcA + 0.35);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.restore();
        }
      } else {
        // Smoking ruins
        ctx.save();
        for (const r of art.ruins) {
          ctx.fillStyle = '#18141d';
          ctx.beginPath();
          ctx.moveTo(d.x + r.ox, GROUND);
          ctx.lineTo(d.x + r.ox + 2, GROUND - r.h);
          ctx.lineTo(d.x + r.ox + r.w * 0.55, GROUND - r.h * 0.65);
          ctx.lineTo(d.x + r.ox + r.w, GROUND - r.h * 0.85);
          ctx.lineTo(d.x + r.ox + r.w, GROUND);
          ctx.closePath();
          ctx.fill();
        }
        // Flickering ember glow
        const ember = 0.4 + 0.4 * Math.sin(fx.time * 9 + d.idx * 2);
        const eg = ctx.createRadialGradient(d.x, GROUND - 6, 4, d.x, GROUND - 6, 75);
        eg.addColorStop(0, `rgba(255, 42, 85, ${ember * 0.55})`);
        eg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = eg;
        ctx.fillRect(d.x - 80, GROUND - 65, 160, 65);
        ctx.restore();
      }

      // District nameplate beneath ground line
      ctx.save();
      ctx.font = '600 13px "Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = d.alive ? (d.shield > 0 ? '#00ff9f' : '#00f0ff') : 'rgba(255, 0, 60, 0.55)';
      const label = names[d.id] || d.id.toUpperCase();
      ctx.fillText(label, d.x, GROUND + 58);
      if (d.alive && d.shield > 0) {
        ctx.fillStyle = '#00ff9f';
        ctx.font = '600 11px "Plex Mono", monospace';
        ctx.fillText('⛨'.repeat(d.shield), d.x, GROUND + 76);
      }
      ctx.restore();
    }
  }

  function drawCiwsTurrets(state) {
    const count = state.upgrades.ciws || 0;
    if (count <= 0) return;
    ctx.save();
    for (let i = 0; i < Math.min(count, CIWS_TURRETS.length); i++) {
      const tur = CIWS_TURRETS[i];
      // Pedestal
      ctx.fillStyle = '#151c2e';
      ctx.strokeStyle = '#00ff9f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tur.x - 10, tur.y + 12);
      ctx.lineTo(tur.x - 6, tur.y - 6);
      ctx.lineTo(tur.x + 6, tur.y - 6);
      ctx.lineTo(tur.x + 10, tur.y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Rotating laser lens pulse
      const glow = 0.65 + 0.35 * Math.sin(fx.time * 8 + i);
      ctx.fillStyle = `rgba(0, 255, 159, ${glow})`;
      ctx.beginPath();
      ctx.arc(tur.x, tur.y - 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGroundWall() {
    const g = ctx.createLinearGradient(0, GROUND, 0, H);
    g.addColorStop(0, '#13182a');
    g.addColorStop(0.25, '#0b0e18');
    g.addColorStop(1, '#05060b');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND, W, H - GROUND);

    // Neon horizon defense rail
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

    // Subtle hazard hash marks along the wall
    ctx.fillStyle = 'rgba(252, 238, 9, 0.08)';
    for (let x = 20; x < W; x += 64) {
      ctx.fillRect(x, GROUND + 8, 28, 3);
    }
  }

  function drawBatteries(state, ui, lang = 'en') {
    const ptr = ui.pointer || { x: W / 2, y: 300 };
    const pref = ui.preferredBattery;
    const rt = reloadTime(state);

    for (const b of state.batteries) {
      const isPref = pref === b.idx;
      ctx.save();

      if (b.alive) {
        // Aim angle toward pointer
        let ang = Math.atan2(Math.min(GROUND - 70, ptr.y) - BATTERY_Y, ptr.x - b.x);
        ang = Math.max(-Math.PI + 0.18, Math.min(-0.18, ang));

        // Preferred lock ring
        if (isPref) {
          ctx.strokeStyle = 'rgba(252, 238, 9, 0.8)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(b.x, BATTERY_Y + 8, 48, Math.PI, 0);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Rotating dual railgun barrels
        const recoil = fx.recoils[b.idx] * 9;
        ctx.save();
        ctx.translate(b.x, BATTERY_Y);
        ctx.rotate(ang);
        ctx.fillStyle = isPref ? '#fcee09' : '#00f0ff';
        ctx.fillRect(4 - recoil, -6, 36, 4);
        ctx.fillRect(4 - recoil, 2, 36, 4);
        ctx.fillStyle = '#0e1322';
        ctx.strokeStyle = isPref ? '#fcee09' : '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-10 - recoil * 0.4, -10, 22, 20);
        ctx.strokeRect(-10 - recoil * 0.4, -10, 22, 20);

        // Muzzle flash
        if (fx.muzzles[b.idx] > 0) {
          const mf = fx.muzzles[b.idx] / 0.14;
          ctx.fillStyle = `rgba(252, 238, 9, ${mf})`;
          ctx.beginPath();
          ctx.arc(44, 0, 14 * mf, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(0, 240, 255, ${mf})`;
          ctx.beginPath();
          ctx.arc(44, 0, 7 * mf, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Chamfered armored bunker base
        ctx.fillStyle = '#14192b';
        ctx.strokeStyle = isPref ? '#fcee09' : b.ammo === 0 ? '#ff003c' : '#00f0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - BATTERY_HALF, GROUND + 4);
        ctx.lineTo(b.x - BATTERY_HALF + 14, BATTERY_Y + 8);
        ctx.lineTo(b.x - 18, BATTERY_Y - 2);
        ctx.lineTo(b.x + 18, BATTERY_Y - 2);
        ctx.lineTo(b.x + BATTERY_HALF - 14, BATTERY_Y + 8);
        ctx.lineTo(b.x + BATTERY_HALF, GROUND + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Diegetic ammo bar & reload bar below bunker
        const barW = 86;
        const barX = b.x - barW / 2;
        const ammoFrac = b.maxAmmo > 0 ? b.ammo / b.maxAmmo : 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(barX, GROUND + 14, barW, 7);
        ctx.fillStyle = b.ammo === 0 ? '#ff003c' : ammoFrac <= 0.3 ? '#ffaa00' : isPref ? '#fcee09' : '#00f0ff';
        ctx.fillRect(barX, GROUND + 14, barW * ammoFrac, 7);

        if (b.ammo < b.maxAmmo) {
          const rf = Math.min(1, b.reload / rt);
          ctx.fillStyle = 'rgba(252, 238, 9, 0.75)';
          ctx.fillRect(barX, GROUND + 23, barW * rf, 3);
        }

        // Key label + numeric ammo
        ctx.font = '700 13px "Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = isPref ? '#fcee09' : '#e6ecff';
        ctx.fillText(`[${b.idx + 1}] ${b.ammo}/${b.maxAmmo}`, b.x, GROUND + 44);
      } else {
        // Destroyed battery crater
        ctx.fillStyle = '#1b1119';
        ctx.strokeStyle = 'rgba(255, 0, 60, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x - 42, GROUND + 4);
        ctx.lineTo(b.x - 24, GROUND - 16);
        ctx.lineTo(b.x - 4, GROUND - 6);
        ctx.lineTo(b.x + 16, GROUND - 18);
        ctx.lineTo(b.x + 42, GROUND + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.font = '700 12px "Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff003c';
        ctx.fillText(`[${b.idx + 1}] ${t(lang, 'batOffline')}`, b.x, GROUND + 36);
      }

      ctx.restore();
    }
  }

  function drawEnemies(state, lang = 'en') {
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (e.type === 'dreadnought') {
        drawDreadnought(e, lang);
      } else if (e.type === 'emp_bomber') {
        drawBomber(e);
      } else if (e.type === 'meteor') {
        drawMeteor(e);
      } else if (e.type === 'stealth') {
        drawStealth(e);
      } else if (e.type === 'mirv') {
        drawMirv(e);
      } else {
        drawBallistic(e);
      }
    }
  }

  function drawBallistic(e) {
    const isSub = e.type === 'sub';
    const isBomb = e.type === 'bomb';
    const color = isBomb ? '#ffaa00' : isSub ? '#ff4d6d' : '#ff003c';

    // Luminous contrail back to launch origin
    if (e.sx != null && e.sy != null) {
      const tg = ctx.createLinearGradient(e.sx, e.sy, e.x, e.y);
      tg.addColorStop(0, 'rgba(255, 0, 60, 0.02)');
      tg.addColorStop(0.65, isBomb ? 'rgba(255, 170, 0, 0.25)' : 'rgba(255, 0, 60, 0.35)');
      tg.addColorStop(1, color);
      ctx.strokeStyle = tg;
      ctx.lineWidth = isBomb ? 2.2 : 1.8;
      ctx.beginPath();
      ctx.moveTo(e.sx, e.sy);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }

    // Warhead body aligned to velocity
    const ang = Math.atan2(e.vy, e.vx);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -4.5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 4.5);
    ctx.closePath();
    ctx.fill();

    // Hot white core tip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(3, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMirv(e) {
    if (e.sx != null) {
      const tg = ctx.createLinearGradient(e.sx, e.sy, e.x, e.y);
      tg.addColorStop(0, 'rgba(255, 170, 0, 0.02)');
      tg.addColorStop(1, 'rgba(255, 170, 0, 0.85)');
      ctx.strokeStyle = tg;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(e.sx, e.sy);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }

    const ang = Math.atan2(e.vy, e.vx);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    // Larger tri-payload warhead
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ff003c';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Pulsing split core
    const pulse = 0.65 + 0.35 * Math.sin(fx.time * 16);
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
    ctx.beginPath();
    ctx.arc(2, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStealth(e) {
    const cloaked = !!e.cloaked;
    const alpha = cloaked ? 0.16 + 0.08 * Math.sin(fx.time * 28) : 0.92;

    ctx.save();
    ctx.globalAlpha = alpha;
    // Faint optical-camo ghost trail
    ctx.strokeStyle = cloaked ? 'rgba(180, 120, 255, 0.25)' : 'rgba(196, 75, 255, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(e.x - e.vx * 0.4, e.y - e.vy * 0.4);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const ang = Math.atan2(e.vy, e.vx);
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    ctx.fillStyle = cloaked ? '#8b5cf6' : '#d946ef';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBomber(e) {
    const dir = e.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Underside tactical scanner cone
    const sg = ctx.createLinearGradient(0, 12, 0, 110);
    sg.addColorStop(0, 'rgba(255, 170, 0, 0.22)');
    sg.addColorStop(1, 'rgba(255, 170, 0, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-12, 12);
    ctx.lineTo(12, 12);
    ctx.lineTo(42, 110);
    ctx.lineTo(-42, 110);
    ctx.closePath();
    ctx.fill();

    // Gunship hull
    ctx.scale(dir, 1);
    ctx.fillStyle = '#1b1d2e';
    ctx.strokeStyle = e.slow > 0 ? '#00f0ff' : '#ffaa00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(42, 2);
    ctx.lineTo(18, -14);
    ctx.lineTo(-32, -16);
    ctx.lineTo(-44, -4);
    ctx.lineTo(-34, 12);
    ctx.lineTo(24, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Thruster flame
    const fl = 10 + 8 * Math.sin(fx.time * 24);
    ctx.fillStyle = '#ff003c';
    ctx.beginPath();
    ctx.moveTo(-42, -3);
    ctx.lineTo(-42 - fl, 2);
    ctx.lineTo(-42, 7);
    ctx.closePath();
    ctx.fill();

    // Cockpit visor
    ctx.fillStyle = '#ff003c';
    ctx.fillRect(14, -7, 14, 5);
    ctx.restore();

    // HP pips above carrier
    const maxHp = e.maxHp || 2;
    const pipW = 12;
    const startX = e.x - (maxHp * (pipW + 3)) / 2;
    for (let i = 0; i < maxHp; i++) {
      ctx.fillStyle = i < e.hp ? '#ffaa00' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(startX + i * (pipW + 3), e.y - 26, pipW, 4);
    }
  }

  function drawMeteor(e) {
    // Reentry plasma trail
    if (e.sx != null) {
      const tg = ctx.createLinearGradient(e.sx, e.sy, e.x, e.y);
      tg.addColorStop(0, 'rgba(255, 110, 0, 0.02)');
      tg.addColorStop(1, 'rgba(255, 170, 0, 0.7)');
      ctx.strokeStyle = tg;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(e.sx, e.sy);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(e.x, e.y);

    // Outer plasma glow
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, e.r + 12);
    glow.addColorStop(0, 'rgba(255, 220, 80, 0.9)');
    glow.addColorStop(0.55, 'rgba(255, 60, 0, 0.45)');
    glow.addColorStop(1, 'rgba(255, 0, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 12, 0, Math.PI * 2);
    ctx.fill();

    // Armored hexagonal drop pod
    ctx.rotate(fx.time * 1.4);
    ctx.fillStyle = e.hp <= 1 ? '#3a1420' : '#25293d';
    ctx.strokeStyle = e.slow > 0 ? '#00f0ff' : e.hp <= 1 ? '#ff003c' : '#ffaa00';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * e.r;
      const py = Math.sin(a) * e.r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cracked core indicator when damaged
    ctx.fillStyle = e.hp <= 1 ? '#ff003c' : '#fcee09';
    ctx.beginPath();
    ctx.arc(0, 0, e.hp <= 1 ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDreadnought(e, lang = 'en') {
    ctx.save();
    ctx.translate(e.x, e.y);

    // Menacing crimson aura
    const aura = ctx.createRadialGradient(0, 0, 20, 0, 0, 145);
    aura.addColorStop(0, 'rgba(255, 0, 60, 0.34)');
    aura.addColorStop(0.6, 'rgba(255, 0, 60, 0.08)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 145, 0, Math.PI * 2);
    ctx.fill();

    // Main armored chassis + twin orbital wings
    ctx.fillStyle = '#131320';
    ctx.strokeStyle = '#ff003c';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.lineTo(54, -36);
    ctx.lineTo(118, -14);
    ctx.lineTo(106, 22);
    ctx.lineTo(66, 18);
    ctx.lineTo(44, 42);
    ctx.lineTo(-44, 42);
    ctx.lineTo(-66, 18);
    ctx.lineTo(-106, 22);
    ctx.lineTo(-118, -14);
    ctx.lineTo(-54, -36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Secondary hull plating lines
    ctx.strokeStyle = 'rgba(252, 238, 9, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-78, -6);
    ctx.lineTo(-34, -22);
    ctx.lineTo(34, -22);
    ctx.lineTo(78, -6);
    ctx.stroke();

    // Salvo launch bays along underside
    for (const bx of [-52, -26, 0, 26, 52]) {
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(bx - 5, 32, 10, 6);
    }

    // Pulsing Blackwall Core
    const pulse = 0.72 + 0.28 * Math.sin(fx.time * 9);
    const coreExposed = e.shield <= 0;
    const cg = ctx.createRadialGradient(0, 4, 4, 0, 4, 28);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.35, coreExposed ? '#ff003c' : '#fcee09');
    cg.addColorStop(1, 'rgba(255, 0, 60, 0)');
    ctx.fillStyle = cg;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(0, 4, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = coreExposed ? '#ff003c' : '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 4, 18, 0, Math.PI * 2);
    ctx.stroke();

    // Crackling cyan energy shield shell if shield > 0
    if (e.shield > 0) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 2, 128, 56, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 240, 255, 0.09)';
      ctx.fill();
    }

    ctx.restore();

    // Imposing overhead Boss Bars (SHIELD + CORE)
    const bw = 240;
    const bx = e.x - bw / 2;
    const by = e.y - 84;

    ctx.save();
    ctx.font = '700 12px "Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff003c';
    ctx.fillText(t(lang, 'bossName'), e.x, by - 10);

    // Shield bar
    ctx.fillStyle = 'rgba(7, 8, 13, 0.85)';
    ctx.fillRect(bx, by, bw, 8);
    const sf = e.shieldMax > 0 ? Math.max(0, e.shield / e.shieldMax) : 0;
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(bx, by, bw * sf, 8);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, 8);

    // Core bar
    ctx.fillStyle = 'rgba(7, 8, 13, 0.85)';
    ctx.fillRect(bx, by + 11, bw, 9);
    const cf = e.coreMax > 0 ? Math.max(0, e.core / e.coreMax) : 0;
    ctx.fillStyle = '#ff003c';
    ctx.fillRect(bx, by + 11, bw * cf, 9);
    ctx.strokeStyle = 'rgba(255, 0, 60, 0.65)';
    ctx.strokeRect(bx, by + 11, bw, 9);
    ctx.restore();
  }

  function drawInterceptors(state) {
    ctx.save();
    for (const it of state.interceptors) {
      // Target lock marker X
      ctx.strokeStyle = 'rgba(252, 238, 9, 0.72)';
      ctx.lineWidth = 1.6;
      const m = 7;
      ctx.beginPath();
      ctx.moveTo(it.tx - m, it.ty - m);
      ctx.lineTo(it.tx + m, it.ty + m);
      ctx.moveTo(it.tx + m, it.ty - m);
      ctx.lineTo(it.tx - m, it.ty + m);
      ctx.stroke();

      // Blazing cyan/yellow railgun beam trail
      const g = ctx.createLinearGradient(it.sx, it.sy, it.x, it.y);
      g.addColorStop(0, 'rgba(0, 240, 255, 0.05)');
      g.addColorStop(0.5, 'rgba(0, 240, 255, 0.55)');
      g.addColorStop(1, '#fcee09');
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(it.sx, it.sy);
      ctx.lineTo(it.x, it.y);
      ctx.stroke();

      // Glowing projectile head
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(it.x, it.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(it.x, it.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBlasts(state) {
    ctx.save();
    for (const b of state.blasts) {
      if (b.r <= 0.5) continue;
      const fading = b.t > BLAST_ACTIVE;
      const alpha = fading ? Math.max(0, 1 - (b.t - BLAST_ACTIVE) / (BLAST_DUR - BLAST_ACTIVE)) : 1;
      const isChain = b.kind === 'chain';

      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      if (isChain) {
        g.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.92})`);
        g.addColorStop(0.4, `rgba(252, 238, 9, ${alpha * 0.65})`);
        g.addColorStop(0.75, `rgba(255, 0, 60, ${alpha * 0.42})`);
        g.addColorStop(1, 'rgba(255, 0, 60, 0)');
      } else {
        g.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.92})`);
        g.addColorStop(0.38, `rgba(252, 238, 9, ${alpha * 0.58})`);
        g.addColorStop(0.76, `rgba(0, 240, 255, ${alpha * 0.48})`);
        g.addColorStop(1, 'rgba(0, 240, 255, 0)');
      }

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // Crisp outer plasma shockwave ring
      ctx.strokeStyle = isChain
        ? `rgba(252, 238, 9, ${alpha * 0.92})`
        : `rgba(0, 240, 255, ${alpha * 0.92})`;
      ctx.lineWidth = b.t < BLAST_GROW ? 3.2 : 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();

      // Secondary inner resonance ring
      if (b.r > 22) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.68, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawZaps() {
    ctx.save();
    for (const z of fx.zaps) {
      const a = z.life / z.maxLife;
      ctx.strokeStyle = `rgba(0, 255, 159, ${a})`;
      ctx.lineWidth = 4 * a;
      ctx.beginPath();
      ctx.moveTo(z.x1, z.y1);
      const mx = (z.x1 + z.x2) / 2 + (Math.random() - 0.5) * 18;
      const my = (z.y1 + z.y2) / 2 + (Math.random() - 0.5) * 18;
      ctx.lineTo(mx, my);
      ctx.lineTo(z.x2, z.y2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = p.smoke ? a * 0.42 : a;
      ctx.fillStyle = p.color;
      if (p.smoke) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.4 - a * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawEmpWave() {
    if (!fx.empWave) return;
    const a = fx.empWave.life / fx.empWave.maxLife;
    ctx.save();
    ctx.strokeStyle = `rgba(0, 240, 255, ${a * 0.95})`;
    ctx.lineWidth = 10 * a;
    ctx.beginPath();
    ctx.arc(W / 2, GROUND - 20, fx.empWave.r, Math.PI, 0);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.7})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, GROUND - 20, Math.max(1, fx.empWave.r - 18), Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawSandyOverlay(state) {
    const rem = state.abilities.sandy.active;
    if (rem <= 0) return;
    const intensity = Math.min(1, rem / 0.8);
    ctx.save();
    // Vignette tint
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.65);
    vg.addColorStop(0, 'rgba(0, 240, 255, 0)');
    vg.addColorStop(1, `rgba(0, 240, 255, ${0.22 * intensity})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Top Sandevistan timer bar
    const frac = Math.max(0, rem / SANDY_DUR);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(W / 2 - 180, 18, 360, 8);
    ctx.fillStyle = '#fcee09';
    ctx.fillRect(W / 2 - 180, 18, 360 * frac, 8);
    ctx.restore();
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of fx.floaters) {
      const a = Math.min(1, (f.life / f.maxLife) * 1.6);
      ctx.globalAlpha = a;
      ctx.font = `${f.bold ? '700' : '600'} ${f.size}px "Plex Mono", monospace`;
      ctx.fillStyle = 'rgba(4, 6, 13, 0.8)';
      ctx.fillText(f.text, f.x + 2, f.y + 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBanner() {
    if (!fx.banner) return;
    const b = fx.banner;
    const p = b.life / b.maxLife;
    const a = p > 0.82 ? (1 - p) / 0.18 : p < 0.22 ? p / 0.22 : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const cy = 220;
    ctx.fillStyle = 'rgba(7, 8, 13, 0.72)';
    ctx.fillRect(0, cy - 34, W, 68);
    ctx.fillStyle = b.color;
    ctx.fillRect(0, cy - 34, W, 2);
    ctx.fillRect(0, cy + 32, W, 2);

    ctx.font = '700 34px "Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, W / 2, b.sub ? cy - 6 : cy);

    if (b.sub) {
      ctx.font = '600 15px "Plex Mono", monospace';
      ctx.fillStyle = '#e6ecff';
      ctx.fillText(b.sub, W / 2, cy + 19);
    }
    ctx.restore();
  }

  function drawHint(state, ui, lang) {
    if (!ui.started || ui.paused || state.phase !== 'wave') return;
    if (state.wave !== 1 || state.stats.shots > 0) return;
    const pulse = 0.5 + 0.45 * Math.sin(fx.time * 4);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = '600 20px "Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fcee09';
    ctx.fillText(t(lang, 'hint'), W / 2, 540);
    ctx.restore();
  }

  function drawCrosshair(state, ui) {
    if (!ui.pointerActive || !ui.started || ui.paused || state.phase !== 'wave') return;
    const px = Math.max(10, Math.min(W - 10, ui.pointer.x));
    const py = Math.max(10, Math.min(GROUND - 70, ui.pointer.y));
    const br = blastRadius(state);

    ctx.save();
    ctx.translate(px, py);

    // Subtle blast-radius preview ring
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, br, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rotating outer reticle bracket
    ctx.strokeStyle = ui.preferredBattery != null ? '#fcee09' : '#00f0ff';
    ctx.lineWidth = 1.8;
    const r = 16;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Precision crosshair ticks
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-9, 0);
    ctx.moveTo(9, 0);
    ctx.lineTo(24, 0);
    ctx.moveTo(0, -24);
    ctx.lineTo(0, -9);
    ctx.moveTo(0, 9);
    ctx.lineTo(0, 24);
    ctx.stroke();

    // Center lock dot
    ctx.fillStyle = '#fcee09';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return { handleEvent, update, render, reset };
}
