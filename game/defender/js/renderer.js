// Canvas 2D renderer (Cyberpunk 2077 Netwatch look). Reads engine state, never mutates it. HiDPI aware; draws everything procedurally.
import { towerStats } from './engine.js';

const BG = '#07080d', RACK = '#0b0e19', RACK_LINE = '#16213a', AMBER = '#fcee09', CYAN = '#00f0ff', MAGENTA = '#ff003c', NEON_OK = '#00ff9f', INK = '#07080d';
export const TOWER_COLOR = { firewall: '#ff6a3d', beam: '#00ff9f', mortar: '#d36bff', tesla: '#00f0ff', cryo: '#6ea8ff' };
const ENEMY_COLOR = { bot: '#aab8d0', sprinter: '#fcee09', trojan: '#ff9a3d', phantom: '#b794f6', worm: '#00ff9f', ransomware: '#ff003c' };

const TAU = Math.PI * 2;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function createRenderer(canvas) {
  const mainCtx = canvas.getContext('2d');
  let ctx = mainCtx;
  let W = 0, H = 0, cell = 40, ox = 0, oy = 0, dpr = 1, cols = 16, rows = 10;
  let bg = null, bgKey = '';
  let avgDt = 0.016;
  const fx = { tracers: [], beams: new Map(), arcs: [], ripples: [], parts: [], floats: [], flash: 0, flashColor: '#fff', redFlash: 0, shake: 0, ocGlow: 0 };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth)), h = Math.max(1, Math.floor(canvas.clientHeight));
    W = w; H = h;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    cell = Math.min(w / cols, h / rows);
    ox = (w - cell * cols) / 2; oy = (h - cell * rows) / 2;
    bg = null;
  }

  /** Client (CSS) pixel -> grid cell, or null outside the grid. */
  function cellAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) * (W / r.width) - ox, y = (clientY - r.top) * (H / r.height) - oy;
    const c = Math.floor(x / cell), rr = Math.floor(y / cell);
    if (c < 0 || rr < 0 || c >= cols || rr >= rows) return null;
    return { c, r: rr };
  }

  // ------------------------------------------------------------ static background
  function buildBg(s) {
    const cv = document.createElement('canvas');
    cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.translate(ox, oy);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const x = c * cell, y = r * cell, blocked = s.blocked.has(c + ',' + r);
      if (blocked) continue;
      g.fillStyle = RACK; g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      g.strokeStyle = RACK_LINE; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      // chamfer corner tick (cyan) for the cyber-grid feel
      g.strokeStyle = 'rgba(0,240,255,.22)'; g.beginPath(); g.moveTo(x + 1.5, y + cell * 0.22); g.lineTo(x + 1.5, y + 1.5); g.lineTo(x + cell * 0.22, y + 1.5); g.stroke();
      // rack-unit slots + status LEDs
      g.fillStyle = '#10152a';
      for (let k = 0; k < 3; k++) g.fillRect(x + cell * 0.14, y + cell * (0.2 + k * 0.26), cell * 0.72, cell * 0.14);
      const h = hash(c * 31 + r * 7 + 1);
      g.fillStyle = h > 0.66 ? 'rgba(0,255,159,.6)' : h > 0.4 ? 'rgba(0,240,255,.5)' : 'rgba(255,0,60,.35)';
      g.fillRect(x + cell * 0.8, y + cell * 0.23, cell * 0.06, cell * 0.06);
    }
    // bus bed
    g.lineCap = 'butt'; g.lineJoin = 'miter';
    g.strokeStyle = '#0a1830'; g.lineWidth = cell * 0.82;
    pathStroke(g, s);
    g.strokeStyle = '#04050a'; g.lineWidth = cell * 0.62;
    pathStroke(g, s);
    g.save();
    // neon cyan edge traces either side of the yellow bus (shadowBlur only baked once into the cached bg)
    g.shadowColor = CYAN; g.shadowBlur = cell * 0.3;
    g.strokeStyle = 'rgba(0,240,255,.75)'; g.lineWidth = Math.max(1.5, cell * 0.04);
    g.lineWidth = cell * 0.66; g.globalCompositeOperation = 'source-over';
    g.setLineDash([]); pathStroke(g, s);
    g.strokeStyle = '#04050a'; g.shadowBlur = 0; g.lineWidth = cell * 0.6; pathStroke(g, s);
    g.shadowColor = AMBER; g.shadowBlur = cell * 0.35;
    g.strokeStyle = 'rgba(252,238,9,.6)'; g.lineWidth = Math.max(2, cell * 0.1);
    pathStroke(g, s);
    g.restore();
    bg = cv;
  }
  function pathStroke(g, s) {
    g.beginPath();
    s.pts.forEach(([x, y], i) => { if (i) g.lineTo(x * cell, y * cell); else g.moveTo(x * cell, y * cell); });
    g.stroke();
  }

  // ------------------------------------------------------------ effects intake
  function burst(x, y, color, n, speed = 2.5, size = 0.07, life = 0.5) {
    for (let i = 0; i < n; i++) {
      if (fx.parts.length >= 240) break;
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.9);
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.7), max: life, color, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  const ripple = (x, y, r, color, life = 0.45) => { if (fx.ripples.length < 30) fx.ripples.push({ x, y, r, color, life, max: life }); };
  const floater = (x, y, text, color, big) => { if (fx.floats.length < 70) fx.floats.push({ x, y, text, color, life: 0.9, max: 0.9, big }); };

  function handleEvents(events, state) {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (fx.tracers.length < 80) fx.tracers.push({ x0: e.x, y0: e.y, x1: e.tx, y1: e.ty, life: 0.09, color: TOWER_COLOR.firewall });
          burst(e.tx, e.ty, TOWER_COLOR.firewall, 2, 1.2, 0.05, 0.25);
          break;
        case 'beam': fx.beams.set(e.id, { x0: e.x, y0: e.y, x1: e.tx, y1: e.ty, life: 0.07, level: e.level }); break;
        case 'splash':
          if (fx.tracers.length < 80) fx.tracers.push({ x0: e.x, y0: e.y, x1: e.tx, y1: e.ty, life: 0.12, color: TOWER_COLOR.mortar, thick: 2 });
          ripple(e.tx, e.ty, e.r, TOWER_COLOR.mortar, 0.4);
          burst(e.tx, e.ty, TOWER_COLOR.mortar, 14, 3, 0.08, 0.5);
          fx.shake = Math.max(fx.shake, 2);
          break;
        case 'arc': if (fx.arcs.length < 40) fx.arcs.push({ pts: e.pts, life: 0.2, seed: Math.random() * 99 }); break;
        case 'pulse': ripple(e.x, e.y, e.r, TOWER_COLOR.cryo, 0.55); break;
        case 'hit': if (e.dmg >= 1 && fx.floats.length < 40) floater(e.x + (Math.random() - 0.5) * 0.4, e.y - 0.3, String(e.dmg), '#e8f4ff', false); break;
        case 'kill':
          burst(e.x, e.y, ENEMY_COLOR[e.enemy] || '#fff', e.boss ? 60 : 12, e.boss ? 6 : 3, e.boss ? 0.14 : 0.07, e.boss ? 1.1 : 0.5);
          burst(e.x, e.y, AMBER, e.boss ? 20 : 4, 2, 0.05, 0.6);
          floater(e.x, e.y - 0.1, '+€$' + e.bounty, AMBER, e.boss);
          if (e.boss) { fx.shake = 12; fx.flash = 0.5; fx.flashColor = '#fcee09'; ripple(e.x, e.y, 3, '#ff003c', 0.8); }
          break;
        case 'split': ripple(e.x, e.y, 0.8, '#00ff9f', 0.35); break;
        case 'leak': fx.redFlash = e.boss ? 0.7 : 0.35; fx.shake = Math.max(fx.shake, e.boss ? 14 : 6); break;
        case 'place': ripple(e.x, e.y, 0.9, '#00ff9f', 0.35); break;
        case 'upgrade': ripple(e.x, e.y, 1.1, AMBER, 0.5); burst(e.x, e.y, AMBER, 14, 2.5, 0.06, 0.6); break;
        case 'sell': burst(e.x, e.y, AMBER, 10, 2, 0.06, 0.5); floater(e.x, e.y - 0.3, '+€$' + e.value, AMBER, false); break;
        case 'emp': fx.flash = 0.8; fx.flashColor = '#00f0ff'; fx.shake = 8; if (state) { ripple(state.cols / 2, state.rows / 2, 18, '#00f0ff', 0.9); ripple(state.cols / 2, state.rows / 2, 12, '#ff003c', 0.7); ripple(state.cols / 2, state.rows / 2, 7, '#fcee09', 0.55); } break;
        case 'overclock': fx.ocGlow = 1; break;
        case 'clear': break;
        default:
      }
    }
  }

  // ------------------------------------------------------------ sprite helpers
  function glowCircle(x, y, r, color, a = 0.35) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color + Math.round(a * 255).toString(16).padStart(2, '0'));
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawTowerSprite(type, level, px, py, size, angle, time, boosted) {
    const col = TOWER_COLOR[type], u = size;
    ctx.save(); ctx.translate(px, py);
    // base plate
    ctx.fillStyle = '#0d1122'; rr(-u * 0.42, -u * 0.42, u * 0.84, u * 0.84, u * 0.14); ctx.fill();
    ctx.strokeStyle = col + (level >= 3 ? 'ff' : '88'); ctx.lineWidth = Math.max(1.5, u * 0.045);
    rr(-u * 0.42, -u * 0.42, u * 0.84, u * 0.84, u * 0.14); ctx.stroke();
    if (level >= 3) glowCircle(0, 0, u * 0.7, col, 0.28);
    if (boosted) glowCircle(0, 0, u * 0.7, AMBER, 0.2 + 0.1 * Math.sin(time * 14));
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, u * 0.27, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1.5, u * 0.05); ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.save(); ctx.rotate(angle);
    if (type === 'firewall') {
      const w = u * (0.1 + level * 0.02);
      ctx.fillRect(0, -w, u * 0.46, w * 2);
      if (level >= 2) { ctx.fillRect(u * 0.1, -w * 2.4, u * 0.3, w * 0.9); ctx.fillRect(u * 0.1, w * 1.5, u * 0.3, w * 0.9); }
      ctx.beginPath(); ctx.arc(0, 0, u * 0.17, 0, TAU); ctx.fill();
    } else if (type === 'beam') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * u * 0.24, Math.sin(a) * u * 0.24); }
      ctx.closePath(); ctx.fill();
      ctx.fillRect(u * 0.1, -u * 0.045, u * 0.36, u * 0.09);
      ctx.fillStyle = '#eafff6'; ctx.beginPath(); ctx.arc(u * 0.46, 0, u * (0.05 + level * 0.012), 0, TAU); ctx.fill();
    } else if (type === 'mortar') {
      ctx.beginPath(); ctx.arc(0, 0, u * 0.22, 0, TAU); ctx.fill();
      rr(u * 0.05, -u * (0.14 + level * 0.015), u * 0.38, u * (0.28 + level * 0.03), u * 0.04); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(u * 0.38, -u * 0.07, u * 0.06, u * 0.14);
    } else if (type === 'tesla') {
      ctx.rotate(time * 0.8 - angle);
      for (let i = 0; i < 3 + (level >= 2 ? 1 : 0); i++) {
        const a = (i / (3 + (level >= 2 ? 1 : 0))) * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * u * 0.1, Math.sin(a) * u * 0.1); ctx.lineTo(Math.cos(a) * u * 0.34, Math.sin(a) * u * 0.34); ctx.stroke();
        ctx.beginPath(); ctx.arc(Math.cos(a) * u * 0.34, Math.sin(a) * u * 0.34, u * 0.05, 0, TAU); ctx.fill();
      }
      glowCircle(0, 0, u * 0.3, col, 0.8);
      ctx.fillStyle = '#e6eeff'; ctx.beginPath(); ctx.arc(0, 0, u * 0.09, 0, TAU); ctx.fill();
    } else if (type === 'cryo') {
      ctx.rotate(time * 0.5 - angle);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(TAU / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(u * 0.34, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(u * 0.22, 0); ctx.lineTo(u * 0.3, u * 0.07); ctx.moveTo(u * 0.22, 0); ctx.lineTo(u * 0.3, -u * 0.07); ctx.stroke();
      }
      ctx.fillStyle = '#e8fdff'; ctx.beginPath(); ctx.arc(0, 0, u * 0.07, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // tier pips
    ctx.fillStyle = col;
    for (let i = 0; i < level; i++) { ctx.beginPath(); ctx.arc(-u * 0.24 + i * u * 0.18, u * 0.34, u * 0.05, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawEnemy(e, time) {
    const px = ox + e.x * cell, py = oy + e.y * cell, col = ENEMY_COLOR[e.type];
    let u = cell * (e.boss ? 0.95 : e.mini ? 0.38 : 0.62);
    const bob = Math.sin(time * 8 + e.id) * cell * 0.02;
    ctx.save(); ctx.translate(px, py + bob);
    ctx.globalAlpha = e.type === 'phantom' ? 0.78 + 0.2 * Math.sin(time * 5 + e.id) : 1;
    if (e.hitT > 0) ctx.globalAlpha = 1;
    glowCircle(0, 0, u * 0.95, col, e.boss ? 0.3 : 0.16);
    if (e.boss) {
      // Ransomware aura: pulsing magenta rings + orbiting glitch shards
      const pu = 0.5 + 0.5 * Math.sin(time * 4);
      glowCircle(0, 0, u * (1.5 + pu * 0.35), MAGENTA, 0.22 + pu * 0.12);
      ctx.save(); ctx.strokeStyle = MAGENTA; ctx.shadowColor = MAGENTA; ctx.shadowBlur = 10; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + pu * 0.4; ctx.beginPath(); ctx.arc(0, 0, u * (0.85 + pu * 0.12), 0, TAU); ctx.stroke();
      ctx.setLineDash([u * 0.12, u * 0.2]); ctx.lineDashOffset = -time * u; ctx.beginPath(); ctx.arc(0, 0, u * 1.12, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    const body = e.hitT > 0 ? '#ffffff' : col;
    ctx.fillStyle = body; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, u * 0.07);
    switch (e.type) {
      case 'bot':
        rr(-u * 0.4, -u * 0.34, u * 0.8, u * 0.68, u * 0.14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff003c'; ctx.fillRect(-u * 0.2, -u * 0.1, u * 0.12, u * 0.12); ctx.fillRect(u * 0.08, -u * 0.1, u * 0.12, u * 0.12);
        break;
      case 'sprinter':
        ctx.rotate(Math.atan2(0.0001, 1));
        ctx.beginPath(); ctx.moveTo(u * 0.5, 0); ctx.lineTo(-u * 0.4, -u * 0.36); ctx.lineTo(-u * 0.2, 0); ctx.lineTo(-u * 0.4, u * 0.36); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case 'trojan':
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * u * 0.46, Math.sin(a) * u * 0.46); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.arc(0, 0, u * 0.2, 0, TAU); ctx.fill();
        break;
      case 'phantom':
        ctx.beginPath(); ctx.arc(0, -u * 0.05, u * 0.38, Math.PI, 0);
        ctx.lineTo(u * 0.38, u * 0.38); ctx.lineTo(u * 0.19, u * 0.26); ctx.lineTo(0, u * 0.38); ctx.lineTo(-u * 0.19, u * 0.26); ctx.lineTo(-u * 0.38, u * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.fillRect(-u * 0.2, -u * 0.12, u * 0.12, u * 0.16); ctx.fillRect(u * 0.08, -u * 0.12, u * 0.12, u * 0.16);
        break;
      case 'worm': {
        const n = e.mini ? 2 : 4;
        for (let i = n - 1; i >= 0; i--) {
          const off = Math.sin(time * 9 + i * 1.2 + e.id) * u * 0.12;
          ctx.beginPath(); ctx.arc(-i * u * 0.3 + u * 0.2, off, u * (i ? 0.26 : 0.32), 0, TAU); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = INK; ctx.fillRect(u * 0.25, -u * 0.12, u * 0.07, u * 0.07);
        break;
      }
      case 'ransomware': {
        rr(-u * 0.45, -u * 0.4, u * 0.9, u * 0.8, u * 0.12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; rr(-u * 0.2, -u * 0.08, u * 0.4, u * 0.3, u * 0.05); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = u * 0.08; ctx.beginPath(); ctx.arc(0, -u * 0.08, u * 0.14, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = body; ctx.fillRect(-u * 0.03, u * 0.03, u * 0.06, u * 0.12);
        break;
      }
      default:
    }
    ctx.globalAlpha = 1;
    if (e.slowT > 0) { ctx.strokeStyle = '#6ea8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, u * 0.62, 0, TAU); ctx.stroke(); }
    if (e.stun > 0) {
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const a = time * 9 + i * Math.PI; ctx.beginPath(); ctx.arc(0, -u * 0.62, u * 0.12, a, a + 2); ctx.stroke(); }
    }
    ctx.restore();
    // bars
    if (e.hp < e.maxHp || e.shield < e.maxShield || e.boss) {
      const bw = u * (e.boss ? 1.15 : 0.95), bh = Math.max(3, cell * 0.07), bx = px - bw / 2, by = py - u * 0.62 - bh - 2;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh * (e.maxShield ? 2 : 1) + 2 + (e.maxShield ? 1 : 0));
      const f = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = f > 0.5 ? '#00ff9f' : f > 0.25 ? '#fcee09' : '#ff003c';
      ctx.fillRect(bx, by, bw * f, bh);
      if (e.maxShield) { ctx.fillStyle = '#00f0ff'; ctx.fillRect(bx, by + bh + 1, bw * Math.max(0, e.shield / e.maxShield), bh); }
    }
  }

  function jagged(pts, seed, jitter) {
    ctx.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const segs = 6;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
        const j = k === 0 || k === segs ? 0 : (hash(seed + i * 17 + k * 3.3 + Math.floor(performance.now() / 40)) - 0.5) * jitter;
        const x = ox + (x0 + (x1 - x0) * t + (nx / l) * j) * cell, y = oy + (y0 + (y1 - y0) * t + (ny / l) * j) * cell;
        if (i === 0 && k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  // ------------------------------------------------------------ main draw
  function render(s, view, dt) {
    if (!W) resize();
    avgDt = avgDt * 0.9 + dt * 0.1;
    const lowPerf = avgDt > 0.025;
    const key = s.map.id + '|' + W + 'x' + H + '|' + dpr;
    if (key !== bgKey || !bg) { bgKey = key; buildBg(s); }
    const time = view.time || 0;

    // fx update
    fx.shake *= Math.pow(0.001, dt); if (fx.shake < 0.2) fx.shake = 0;
    fx.flash = Math.max(0, fx.flash - dt * 1.8); fx.redFlash = Math.max(0, fx.redFlash - dt * 1.6); fx.ocGlow = Math.max(0, fx.ocGlow - dt * 0.5);
    for (const p of fx.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    fx.parts = fx.parts.filter((p) => p.life > 0);
    for (const f of fx.floats) { f.life -= dt; f.y -= dt * 0.7; }
    fx.floats = fx.floats.filter((f) => f.life > 0);
    for (const q of [fx.tracers, fx.arcs, fx.ripples]) for (const o of q) o.life -= dt;
    fx.tracers = fx.tracers.filter((o) => o.life > 0); fx.arcs = fx.arcs.filter((o) => o.life > 0); fx.ripples = fx.ripples.filter((o) => o.life > 0);
    for (const [id, b] of fx.beams) { b.life -= dt; if (b.life <= 0) fx.beams.delete(id); }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (fx.shake) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    ctx.drawImage(bg, 0, 0, W, H);

    // flowing data on the bus
    ctx.save();
    ctx.translate(ox, oy);
    ctx.strokeStyle = AMBER; ctx.lineWidth = Math.max(2, cell * 0.06); ctx.lineCap = 'round';
    ctx.save(); ctx.shadowColor = CYAN; ctx.shadowBlur = 6; ctx.strokeStyle = CYAN; ctx.globalAlpha = 0.85;
    ctx.setLineDash([cell * 0.06, cell * 0.94]); ctx.lineDashOffset = time * cell * 0.8; ctx.lineWidth = Math.max(1.5, cell * 0.035);
    ctx.translate(0, -cell * 0.24); ctx.beginPath(); s.pts.forEach(([x, y], i) => { if (i) ctx.lineTo(x * cell, y * cell); else ctx.moveTo(x * cell, y * cell); }); ctx.stroke();
    ctx.restore();
    // pulsing circuit nodes at the bus corners
    for (let i = 1; i < s.pts.length - 1; i++) {
      const pu = 0.5 + 0.5 * Math.sin(time * 3 + i * 1.7), [nx, ny] = s.pts[i];
      glowCircle(nx * cell, ny * cell, cell * (0.28 + pu * 0.1), CYAN, 0.18 + pu * 0.22);
      ctx.fillStyle = i % 2 ? CYAN : AMBER; ctx.globalAlpha = 0.5 + pu * 0.5; ctx.fillRect(nx * cell - 2, ny * cell - 2, 4, 4); ctx.globalAlpha = 1;
    }
    ctx.setLineDash([cell * 0.12, cell * 0.5]); ctx.lineDashOffset = -time * cell * 1.2;
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => { if (i) ctx.lineTo(x * cell, y * cell); else ctx.moveTo(x * cell, y * cell); });
    ctx.stroke(); ctx.setLineDash([]);
    // entry marker and core
    const a = s.pts[0], z = s.pts[s.pts.length - 1];
    ctx.fillStyle = AMBER; ctx.font = `600 ${Math.max(9, cell * 0.2)}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ax = Math.max(0.35, Math.min(s.cols - 0.35, a[0])) * cell, ay = Math.max(0.35, Math.min(s.rows - 0.35, a[1])) * cell;
    ctx.fillText('IN ▶', ax + (a[0] < 0 ? cell * 0.35 : 0), ay - cell * 0.62);
    const zx = Math.max(0.5, Math.min(s.cols - 0.5, z[0])) * cell, zy = Math.max(0.5, Math.min(s.rows - 0.5, z[1])) * cell;
    const lf = s.lives / s.maxLives, coreCol = lf > 0.5 ? '#00ff9f' : lf > 0.25 ? '#fcee09' : '#ff003c';
    glowCircle(zx, zy, cell * 1.1, coreCol, 0.4);
    ctx.fillStyle = INK; ctx.strokeStyle = coreCol; ctx.lineWidth = 2;
    rr(zx - cell * 0.34, zy - cell * 0.4, cell * 0.68, cell * 0.8, cell * 0.08); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = coreCol; ctx.fillRect(zx - cell * 0.24, zy - cell * 0.28 + i * cell * 0.22, cell * 0.48, cell * 0.1); }
    ctx.restore();

    // placement hover
    const { hover, build, selected } = view;
    if (hover && build) {
      const ok = hover.ok;
      ctx.fillStyle = ok ? 'rgba(0,255,159,.18)' : 'rgba(255,0,60,.22)';
      ctx.fillRect(ox + hover.c * cell, oy + hover.r * cell, cell, cell);
      const st = towerStats(build, 0);
      ctx.strokeStyle = ok ? 'rgba(0,240,255,.55)' : 'rgba(255,0,60,.5)'; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(255,255,255,.04)';
      ctx.beginPath(); ctx.arc(ox + (hover.c + 0.5) * cell, oy + (hover.r + 0.5) * cell, st.range * cell, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.6; drawTowerSprite(build, 0, ox + (hover.c + 0.5) * cell, oy + (hover.r + 0.5) * cell, cell, -Math.PI / 2, time, false); ctx.globalAlpha = 1;
    } else if (hover && !build) {
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.strokeRect(ox + hover.c * cell + 0.5, oy + hover.r * cell + 0.5, cell - 1, cell - 1);
    }

    // towers
    const boosted = s.abilities.overclock.active > 0;
    for (const t of s.towers) {
      const px = ox + t.x * cell, py = oy + t.y * cell;
      if (t.id === selected) {
        const st = towerStats(t.type, t.level);
        ctx.strokeStyle = TOWER_COLOR[t.type]; ctx.lineWidth = 1.5; ctx.fillStyle = TOWER_COLOR[t.type] + '12';
        ctx.beginPath(); ctx.arc(px, py, st.range * cell, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2; rr(px - cell * 0.46, py - cell * 0.46, cell * 0.92, cell * 0.92, cell * 0.14); ctx.stroke();
      }
      drawTowerSprite(t.type, t.level, px, py, cell, t.angle, time, boosted);
    }

    // beams under enemies
    ctx.lineCap = 'round';
    for (const b of fx.beams.values()) {
      const w = cell * (0.06 + b.level * 0.025);
      ctx.save(); ctx.shadowColor = NEON_OK; ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(0,255,159,.4)'; ctx.lineWidth = w * 3;
      ctx.beginPath(); ctx.moveTo(ox + b.x0 * cell, oy + b.y0 * cell); ctx.lineTo(ox + b.x1 * cell, oy + b.y1 * cell); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#eafff6'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(ox + b.x0 * cell, oy + b.y0 * cell); ctx.lineTo(ox + b.x1 * cell, oy + b.y1 * cell); ctx.stroke();
      glowCircle(ox + b.x1 * cell, oy + b.y1 * cell, cell * 0.3, NEON_OK, 0.7);
    }

    // enemies: draw far-along ones first so leaders sit on top
    const list = s.enemies.slice().sort((p, q) => p.dist - q.dist);
    for (const e of list) drawEnemy(e, time);

    // shots
    for (const tr of fx.tracers) {
      ctx.globalAlpha = Math.min(1, tr.life / 0.08); ctx.strokeStyle = tr.color; ctx.lineWidth = (tr.thick || 1.5) * (cell / 40);
      if (!lowPerf) { ctx.shadowColor = tr.color; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.moveTo(ox + tr.x0 * cell, oy + tr.y0 * cell); ctx.lineTo(ox + tr.x1 * cell, oy + tr.y1 * cell); ctx.stroke();
      if (!lowPerf) ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    for (const ar of fx.arcs) {
      ctx.globalAlpha = Math.min(1, ar.life / 0.12);
      if (!lowPerf) { ctx.shadowColor = CYAN; ctx.shadowBlur = 14; }
      ctx.strokeStyle = 'rgba(0,240,255,.55)'; ctx.lineWidth = cell * 0.12; jagged(ar.pts, ar.seed, 0.45);
      if (!lowPerf) ctx.shadowBlur = 0;
      ctx.strokeStyle = '#eaffff'; ctx.lineWidth = Math.max(1.5, cell * 0.04); jagged(ar.pts, ar.seed, 0.45);
      ctx.strokeStyle = 'rgba(252,238,9,.8)'; ctx.lineWidth = Math.max(1, cell * 0.015); jagged(ar.pts, ar.seed + 5, 0.6);
    }
    ctx.globalAlpha = 1;
    for (const rp of fx.ripples) {
      const k = 1 - rp.life / rp.max;
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = rp.color; ctx.lineWidth = rp.r > 10 ? 4 : 2.5; ctx.shadowColor = rp.color; ctx.shadowBlur = rp.r > 10 ? 18 : 8;
      ctx.beginPath(); ctx.arc(ox + rp.x * cell, oy + rp.y * cell, rp.r * cell * (0.2 + 0.8 * k), 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = (1 - k) * 0.12; ctx.fillStyle = rp.color; ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const p of fx.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
      const sz = p.size * cell; ctx.fillRect(ox + p.x * cell - sz / 2, oy + p.y * cell - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of fx.floats) {
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.font = `${f.big ? 700 : 600} ${Math.round(cell * (f.big ? 0.5 : 0.3))}px "IBM Plex Mono", monospace`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,8,13,.9)'; ctx.strokeText(f.text, ox + f.x * cell, oy + f.y * cell);
      ctx.fillStyle = f.color; ctx.fillText(f.text, ox + f.x * cell, oy + f.y * cell);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // screen overlays (no shake)
    if (fx.flash > 0) { ctx.globalAlpha = Math.min(0.5, fx.flash * 0.5); ctx.fillStyle = fx.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (fx.redFlash > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,60,0)'); g.addColorStop(1, `rgba(255,0,60,${Math.min(0.6, fx.redFlash)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (boosted || fx.ocGlow > 0) {
      ctx.strokeStyle = `rgba(252,238,9,${boosted ? 0.35 + 0.15 * Math.sin(time * 10) : fx.ocGlow * 0.4})`; ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);
    }
  }

  /** Draw a tower sprite into a small standalone canvas (used for the build palette). */
  function paintIcon(cv, type) {
    const d = Math.min(2, window.devicePixelRatio || 1), size = cv.clientWidth || 40;
    cv.width = cv.height = Math.floor(size * d);
    ctx = cv.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawTowerSprite(type, 0, size / 2, size / 2, size * 0.98, -Math.PI / 2, 0, false);
    ctx = mainCtx;
  }

  return { resize, cellAt, handleEvents, render, paintIcon, get cell() { return cell; } };
}
