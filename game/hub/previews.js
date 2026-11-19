// Animated mini-scenes for each game card. One shared rAF loop; only visible canvases render.
import { hexA } from './bg.js?v=20261120';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- 1. Tower defense: packets along a circuit path, turrets firing lasers ----------
function defender(c, w, h, t, s) {
  if (!s.init) {
    s.init = true;
    s.path = [[0, .3], [.32, .3], [.32, .72], [.68, .72], [.68, .36], [1, .36]].map(([x, y]) => [x * w, y * h]);
    s.turrets = [[.2, .55], [.5, .5], [.84, .58], [.5, .9]].map(([x, y]) => ({ x: x * w, y: y * h, cd: rand(0, .5) }));
    s.enemies = []; s.spawn = 0; s.beams = [];
    let L = 0; s.seg = s.path.slice(1).map((p, i) => { const a = s.path[i]; const l = Math.hypot(p[0] - a[0], p[1] - a[1]); L += l; return l; }); s.len = L;
  }
  const dt = s.dt;
  const glow = s.lowFps ? 0 : 1;
  c.fillStyle = '#05070b'; c.fillRect(0, 0, w, h);
  // rack grid
  c.strokeStyle = 'rgba(252,238,9,.06)'; c.lineWidth = 1;
  for (let x = 0; x < w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 0; y < h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  // path
  c.strokeStyle = 'rgba(252,238,9,.35)'; c.lineWidth = 10; c.lineJoin = 'round';
  c.beginPath(); s.path.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  c.strokeStyle = '#fcee09'; c.lineWidth = 1; c.setLineDash([4, 6]); c.lineDashOffset = -t * 30; c.stroke(); c.setLineDash([]);
  // spawn
  s.spawn -= dt; if (s.spawn <= 0) { s.spawn = rand(.35, .8); s.enemies.push({ d: 0, hp: 3, hue: Math.random() < .3 ? '#ff003c' : '#00f0ff' }); }
  const posAt = (d) => { for (let i = 0; i < s.seg.length; i++) { if (d <= s.seg[i]) { const a = s.path[i], b = s.path[i + 1], k = d / s.seg[i]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; } d -= s.seg[i]; } return s.path[s.path.length - 1]; };
  for (const e of s.enemies) { e.d += dt * w * .12; [e.x, e.y] = posAt(e.d); }
  s.enemies = s.enemies.filter((e) => e.d < s.len && e.hp > 0);
  for (const e of s.enemies) { c.fillStyle = e.hue; c.shadowColor = e.hue; c.shadowBlur = 8 * glow; c.fillRect(e.x - 4, e.y - 4, 8, 8); }
  c.shadowBlur = 0;
  // turrets
  for (const tu of s.turrets) {
    tu.cd -= dt;
    const tgt = s.enemies.find((e) => Math.hypot(e.x - tu.x, e.y - tu.y) < h * .45);
    if (tgt && tu.cd <= 0) { tu.cd = .45; tgt.hp--; s.beams.push({ x1: tu.x, y1: tu.y, x2: tgt.x, y2: tgt.y, life: .15 }); }
    c.fillStyle = '#161926'; c.strokeStyle = '#fcee09'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(tu.x, tu.y - 8); c.lineTo(tu.x + 7, tu.y + 5); c.lineTo(tu.x - 7, tu.y + 5); c.closePath(); c.fill(); c.stroke();
  }
  for (const b of s.beams) { b.life -= dt; c.strokeStyle = hexA('#fcee09', Math.max(0, b.life / .15)); c.lineWidth = 2; c.shadowColor = '#fcee09'; c.shadowBlur = 10 * glow; c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke(); }
  c.shadowBlur = 0; s.beams = s.beams.filter((b) => b.life > 0);
}

// ---------- 2. Arena survivor: swarm closing in, orbiting blades, periodic slow-mo pulse ----------
function icebreaker(c, w, h, t, s) {
  if (!s.init) { s.init = true; s.foes = []; s.shots = []; s.cd = 0; }
  const phase = t % 6; const slow = phase > 4.2 && phase < 5.6;
  const dt = s.dt * (slow ? .2 : 1);
  const glow = s.lowFps ? 0 : 1;
  c.fillStyle = slow ? 'rgba(10,20,40,.35)' : 'rgba(5,7,11,.55)'; c.fillRect(0, 0, w, h);
  const px = w / 2 + Math.cos(t * .7) * w * .12, py = h / 2 + Math.sin(t * 1.1) * h * .14;
  if (s.foes.length < 60 && Math.random() < .5) { const a = rand(0, TAU), r = Math.max(w, h) * .62; s.foes.push({ x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, v: rand(18, 34) }); }
  for (const f of s.foes) { const a = Math.atan2(py - f.y, px - f.x); f.x += Math.cos(a) * f.v * dt; f.y += Math.sin(a) * f.v * dt; }
  // blades
  const blades = [0, 1, 2].map((i) => { const a = t * 3.2 + i * TAU / 3; return [px + Math.cos(a) * 26, py + Math.sin(a) * 26]; });
  s.cd -= dt; if (s.cd <= 0 && s.foes.length) { s.cd = .2; const f = s.foes[Math.floor(Math.random() * s.foes.length)]; const a = Math.atan2(f.y - py, f.x - px); s.shots.push({ x: px, y: py, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, l: 1 }); }
  for (const sh of s.shots) { sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.l -= dt; }
  s.foes = s.foes.filter((f) => {
    if (blades.some(([bx, by]) => Math.hypot(bx - f.x, by - f.y) < 9)) return false;
    const hit = s.shots.find((sh) => sh.l > 0 && Math.hypot(sh.x - f.x, sh.y - f.y) < 7); if (hit) { hit.l = 0; return false; }
    return Math.hypot(px - f.x, py - f.y) > 10;
  });
  s.shots = s.shots.filter((sh) => sh.l > 0);
  c.fillStyle = '#ff003c'; for (const f of s.foes) { c.beginPath(); c.arc(f.x, f.y, 3.5, 0, TAU); c.fill(); }
  c.fillStyle = '#fcee09'; for (const sh of s.shots) c.fillRect(sh.x - 1.5, sh.y - 1.5, 3, 3);
  c.shadowColor = '#00f0ff'; c.shadowBlur = 12 * glow; c.fillStyle = '#00f0ff';
  for (const [bx, by] of blades) { c.beginPath(); c.arc(bx, by, 3, 0, TAU); c.fill(); }
  c.beginPath(); c.arc(px, py, 6, 0, TAU); c.fill();
  if (slow) {
    // afterimages + ring
    for (let i = 1; i < 5; i++) { c.fillStyle = hexA(i % 2 ? '#00f0ff' : '#00ff9f', .25 / i); c.beginPath(); c.arc(px - i * 7, py + i * 2, 6, 0, TAU); c.fill(); }
    c.strokeStyle = hexA('#00ff9f', .6); c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, (phase - 4.2) * 120, 0, TAU); c.stroke();
  }
  c.shadowBlur = 0;
}

// ---------- 3. Missile defense: salvos falling on a skyline, interceptor bursts ----------
function blackwall(c, w, h, t, s) {
  if (!s.init) {
    s.init = true; s.m = []; s.booms = []; s.cd = 0; s.icd = 0; s.ints = [];
    s.city = []; let x = 0; while (x < w) { const bw = rand(10, 26); s.city.push([x, bw, rand(h * .08, h * .26)]); x += bw + 2; }
  }
  const dt = s.dt; const ground = h * .92;
  const glow = s.lowFps ? 0 : 1;
  c.fillStyle = 'rgba(6,4,10,.5)'; c.fillRect(0, 0, w, h);
  s.cd -= dt; if (s.cd <= 0) { s.cd = rand(.25, .6); const sx = rand(0, w); s.m.push({ sx, sy: -5, x: sx, y: -5, tx: rand(w * .1, w * .9), v: rand(30, 50) }); }
  for (const m of s.m) { const a = Math.atan2(ground - m.sy, m.tx - m.sx); m.x += Math.cos(a) * m.v * dt; m.y += Math.sin(a) * m.v * dt; }
  s.icd -= dt;
  if (s.icd <= 0 && s.m.length) { s.icd = .35; const tg = s.m.reduce((a, b) => (b.y > a.y ? b : a)); s.ints.push({ x: w / 2, y: ground, tx: tg.x, ty: tg.y + 14, p: 0 }); }
  for (const i of s.ints) { i.p += dt * 2.6; if (i.p >= 1) s.booms.push({ x: i.tx, y: i.ty, r: 0, l: 1 }); }
  s.ints = s.ints.filter((i) => i.p < 1);
  for (const b of s.booms) { b.r = Math.min(26, b.r + dt * 90); b.l -= dt * 1.4; }
  s.m = s.m.filter((m) => { if (s.booms.some((b) => b.l > 0 && Math.hypot(b.x - m.x, b.y - m.y) < b.r)) return false; if (m.y >= ground - 6) { s.booms.push({ x: m.x, y: ground - 6, r: 0, l: .7, bad: true }); return false; } return true; });
  s.booms = s.booms.filter((b) => b.l > 0);
  // city
  c.fillStyle = '#0c0d16'; for (const [x, bw, bh] of s.city) c.fillRect(x, ground - bh, bw, bh);
  c.fillStyle = 'rgba(0,240,255,.35)'; for (const [x, bw, bh] of s.city) for (let y = ground - bh + 4; y < ground - 3; y += 6) if ((x + y) % 5 < 2) c.fillRect(x + 3, y, 2, 2);
  // shield dome
  c.strokeStyle = hexA('#00f0ff', .25 + .1 * Math.sin(t * 2)); c.lineWidth = 1.5; c.beginPath(); c.ellipse(w / 2, ground, w * .55, h * .5, 0, Math.PI, TAU); c.stroke();
  c.fillStyle = '#ff003c'; c.fillRect(0, ground, w, h - ground);
  // trails
  c.lineWidth = 1.2;
  for (const m of s.m) { c.strokeStyle = 'rgba(255,0,60,.55)'; c.beginPath(); c.moveTo(m.sx, m.sy); c.lineTo(m.x, m.y); c.stroke(); c.fillStyle = '#fff'; c.fillRect(m.x - 1.5, m.y - 1.5, 3, 3); }
  for (const i of s.ints) { const x = i.x + (i.tx - i.x) * i.p, y = i.y + (i.ty - i.y) * i.p; c.strokeStyle = 'rgba(0,240,255,.7)'; c.beginPath(); c.moveTo(i.x, i.y); c.lineTo(x, y); c.stroke(); }
  for (const b of s.booms) { c.fillStyle = hexA(b.bad ? '#ff2a55' : '#fcee09', b.l * .5); c.shadowColor = b.bad ? '#ff2a55' : '#fcee09'; c.shadowBlur = 16 * glow; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); }
  c.shadowBlur = 0;
}

// ---------- 4. Vertical shmup: scrolling synth grid, ship weaving through bullet spirals ----------
function neonvector(c, w, h, t, s) {
  if (!s.init) { s.init = true; s.b = []; s.shots = []; s.stars = Array.from({ length: 40 }, () => [rand(0, w), rand(0, h), rand(.3, 1)]); }
  const dt = s.dt;
  const glow = s.lowFps ? 0 : 1;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#12051f'); g.addColorStop(1, '#05030a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (const st of s.stars) { st[1] = (st[1] + dt * 80 * st[2]) % h; c.fillStyle = hexA('#d946ef', st[2] * .7); c.fillRect(st[0], st[1], 1.5, st[2] * 6); }
  // grid floor scrolling
  c.strokeStyle = 'rgba(217,70,239,.18)'; c.lineWidth = 1;
  const off = (t * 40) % 20; for (let y = -20 + off; y < h; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  // boss emitter
  const bx = w / 2 + Math.sin(t * .8) * w * .25, by = h * .18;
  c.fillStyle = '#ff003c'; c.shadowColor = '#ff003c'; c.shadowBlur = 14 * glow;
  c.beginPath(); c.moveTo(bx, by + 10); c.lineTo(bx + 16, by - 6); c.lineTo(bx - 16, by - 6); c.closePath(); c.fill();
  if (Math.floor(t * 10) !== s.lastEmit) { s.lastEmit = Math.floor(t * 10); for (let k = 0; k < 6; k++) { const a = t * 1.7 + k * TAU / 6; s.b.push({ x: bx, y: by, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55 + 20 }); } }
  for (const b of s.b) { b.x += b.vx * dt; b.y += b.vy * dt; }
  s.b = s.b.filter((b) => b.x > -5 && b.x < w + 5 && b.y > -5 && b.y < h + 5);
  c.shadowColor = '#d946ef'; c.shadowBlur = 8 * glow; c.fillStyle = '#f0abfc';
  for (const b of s.b) { c.beginPath(); c.arc(b.x, b.y, 2.4, 0, TAU); c.fill(); }
  // ship
  const sx = w / 2 + Math.sin(t * 1.3) * w * .3, sy = h * .8 + Math.sin(t * 2.1) * h * .05;
  if (Math.floor(t * 12) !== s.lastShot) { s.lastShot = Math.floor(t * 12); s.shots.push({ x: sx - 4, y: sy - 8 }, { x: sx + 4, y: sy - 8 }); }
  for (const sh of s.shots) sh.y -= dt * 320;
  s.shots = s.shots.filter((sh) => sh.y > -10);
  c.fillStyle = '#00f0ff'; c.shadowColor = '#00f0ff'; for (const sh of s.shots) c.fillRect(sh.x - 1, sh.y - 6, 2, 8);
  c.beginPath(); c.moveTo(sx, sy - 11); c.lineTo(sx + 9, sy + 8); c.lineTo(sx, sy + 3); c.lineTo(sx - 9, sy + 8); c.closePath(); c.fill();
  // graze sparks
  for (const b of s.b) if (Math.hypot(b.x - sx, b.y - sy) < 20) { c.strokeStyle = '#fcee09'; c.beginPath(); c.moveTo(sx, sy); c.lineTo(b.x, b.y); c.stroke(); }
  c.shadowBlur = 0;
  // overdrive meter
  const od = (t * .2) % 1; c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(8, h - 10, w * .3, 3); c.fillStyle = '#fcee09'; c.fillRect(8, h - 10, w * .3 * od, 3);
}

// ---------- 5. Hex matrix: grid of byte codes, alternating row/column cursor building a sequence ----------
const CODES = ['1C', '55', 'BD', 'E9', '7A', 'FF'];
function protocol(c, w, h, t, s) {
  if (!s.init) {
    s.init = true; s.n = 5; s.grid = Array.from({ length: 25 }, () => CODES[Math.floor(Math.random() * CODES.length)]);
    s.used = new Set(); s.seq = []; s.pos = 0; s.axis = 'row'; s.line = 0; s.step = 0;
  }
  const n = s.n;
  const glow = s.lowFps ? 0 : 1;
  c.fillStyle = '#04080a'; c.fillRect(0, 0, w, h);
  const cell = Math.min((w * .58) / n, (h * .82) / n), gx = w * .06, gy = (h - cell * n) / 2;
  // advance every 0.7s
  const step = Math.floor(t / .7);
  if (step !== s.step) {
    s.step = step;
    let cand = [];
    for (let i = 0; i < n; i++) { const idx = s.axis === 'row' ? s.line * n + i : i * n + s.line; if (!s.used.has(idx)) cand.push(idx); }
    if (!cand.length || s.seq.length >= 6) {
      s.used.clear(); s.seq = []; s.pos = 0; s.axis = 'row'; s.line = 0;
      cand = Array.from({ length: n }, (_, i) => i);
    }
    const pick = cand[Math.floor(Math.random() * cand.length)];
    s.used.add(pick); s.seq.push(s.grid[pick]);
    s.axis = s.axis === 'row' ? 'col' : 'row'; s.line = s.axis === 'row' ? Math.floor(pick / n) : pick % n; s.pos = pick;
  }
  // highlight active line
  c.fillStyle = 'rgba(0,255,159,.09)';
  if (s.axis === 'row') c.fillRect(gx, gy + s.line * cell, cell * n, cell); else c.fillRect(gx + s.line * cell, gy, cell, cell * n);
  c.font = `600 ${Math.floor(cell * .36)}px "Plex Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < n * n; i++) {
    const x = gx + (i % n) * cell + cell / 2, y = gy + Math.floor(i / n) * cell + cell / 2;
    const used = s.used.has(i);
    c.fillStyle = used ? 'rgba(0,255,159,.18)' : (Math.sin(t * 4 + i) > .97 ? '#fcee09' : 'rgba(208,255,232,.75)');
    c.fillText(used ? '[ ]' : s.grid[i], x, y);
  }
  // cursor
  const cx = gx + (s.pos % n) * cell, cy = gy + Math.floor(s.pos / n) * cell;
  c.strokeStyle = '#00ff9f'; c.shadowColor = '#00ff9f'; c.shadowBlur = 10 * glow; c.lineWidth = 1.5;
  c.strokeRect(cx + 2, cy + 2, cell - 4, cell - 4); c.shadowBlur = 0;
  // buffer
  const bx = gx + cell * n + w * .05, bw = w - bx - w * .05;
  c.textAlign = 'start'; c.fillStyle = '#00ff9f'; c.font = `600 ${Math.max(8, Math.floor(cell * .26))}px "Plex Mono", monospace`;
  c.fillText('BUFFER', bx, gy + 6);
  for (let i = 0; i < 6; i++) {
    const y = gy + 22 + i * (cell * .62); c.strokeStyle = 'rgba(0,255,159,.35)'; c.strokeRect(bx, y - cell * .25, bw, cell * .5);
    if (s.seq[i]) { c.fillStyle = '#d0ffe8'; c.fillText(s.seq[i], bx + 6, y); }
  }
  // ICE timer
  const timer = 1 - ((t % 4.2) / 4.2);
  c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(gx, h - 8, cell * n, 3); c.fillStyle = timer < .25 ? '#ff2a55' : '#00ff9f'; c.fillRect(gx, h - 8, cell * n * timer, 3);
}

// ---------- 6. OVERCLOCK // ICE Shatter: neon brick wall, cyber paddle, plasma ball + sparks + twin lasers ----------
function overclock(c, w, h, t, s) {
  const rebuildBricks = () => {
    const cols = 9, rows = 4, padX = w * .08, topY = h * .12, gap = 3;
    const bw = (w - padX * 2 - gap * (cols - 1)) / cols, bh = Math.max(7, h * .075);
    const palette = ['#ff003c', '#ffaa00', '#fcee09', '#00f0ff'];
    s.bricks = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const cap = (r === 1 && (col === 2 || col === 6)) || (r === 2 && col === 4);
        s.bricks.push({ x: padX + col * (bw + gap), y: topY + r * (bh + gap), w: bw, h: bh, c: cap ? '#fcee09' : palette[r % palette.length], cap, alive: true });
      }
    }
  };
  if (!s.init) {
    s.init = true; rebuildBricks();
    s.ball = { x: w * .5, y: h * .72, vx: w * .34, vy: -h * .68, trail: [] };
    s.px = w * .5; s.sparks = []; s.lasers = []; s.rings = []; s.lcd = .8;
  }
  const dt = s.dt;
  const glow = s.lowFps ? 0 : 1;
  c.fillStyle = 'rgba(6,7,13,.65)'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,170,0,.06)'; c.lineWidth = 1;
  for (let x = 0; x < w; x += 20) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 0; y < h; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }

  const pw = Math.max(38, w * .22), py = h * .88;
  const targetX = Math.max(pw * .55, Math.min(w - pw * .55, s.ball.x + Math.sin(t * 2.1) * 10));
  s.px += (targetX - s.px) * Math.min(1, dt * 11);

  // Twin laser bursts
  s.lcd -= dt;
  if (s.lcd <= 0) {
    s.lcd = 1.15;
    s.lasers.push({ x: s.px - pw * .36, y: py - 5 }, { x: s.px + pw * .36, y: py - 5 });
  }
  for (const lz of s.lasers) lz.y -= dt * h * 1.9;
  const shatter = (b) => {
    b.alive = false;
    for (let k = 0; k < (b.cap ? 14 : 7); k++) {
      const a = rand(0, TAU), sp = rand(30, b.cap ? 130 : 85);
      s.sparks.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l: rand(.22, .5), c: b.c });
    }
    if (b.cap) {
      s.rings.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: 4, l: .4 });
      for (const o of s.bricks) {
        if (o.alive && Math.hypot((o.x + o.w / 2) - (b.x + b.w / 2), (o.y + o.h / 2) - (b.y + b.h / 2)) < b.w * 1.9) {
          o.alive = false;
          s.sparks.push({ x: o.x + o.w / 2, y: o.y + o.h / 2, vx: rand(-60, 60), vy: rand(-60, 60), l: .35, c: o.c });
        }
      }
    }
  };
  s.lasers = s.lasers.filter((lz) => {
    if (lz.y < 0) return false;
    const hit = s.bricks.find((b) => b.alive && lz.x >= b.x && lz.x <= b.x + b.w && lz.y >= b.y && lz.y <= b.y + b.h);
    if (hit) { shatter(hit); return false; }
    return true;
  });

  // Ball physics
  const b = s.ball;
  b.trail.push([b.x, b.y]); if (b.trail.length > 9) b.trail.shift();
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < 5) { b.x = 5; b.vx = Math.abs(b.vx); }
  if (b.x > w - 5) { b.x = w - 5; b.vx = -Math.abs(b.vx); }
  if (b.y < 5) { b.y = 5; b.vy = Math.abs(b.vy); }
  if (b.y > py - 6 && b.y < py + 8 && Math.abs(b.x - s.px) < pw * .58 && b.vy > 0) {
    b.y = py - 6; b.vy = -Math.abs(b.vy);
    b.vx = ((b.x - s.px) / (pw * .5)) * w * .52;
  }
  if (b.y > h + 8) { b.x = s.px; b.y = py - 10; b.vy = -h * .72; b.vx = rand(-w * .3, w * .3); }

  for (const br of s.bricks) {
    if (!br.alive) continue;
    if (b.x + 4 > br.x && b.x - 4 < br.x + br.w && b.y + 4 > br.y && b.y - 4 < br.y + br.h) {
      b.vy = -b.vy; shatter(br); break;
    }
  }
  if (s.bricks.filter((br) => br.alive).length < 6) rebuildBricks();

  // Draw bricks
  for (const br of s.bricks) {
    if (!br.alive) continue;
    c.fillStyle = hexA(br.c, br.cap ? .9 : .72);
    c.fillRect(br.x, br.y, br.w, br.h);
    c.strokeStyle = br.c; c.lineWidth = 1; c.strokeRect(br.x + .5, br.y + .5, br.w - 1, br.h - 1);
    if (br.cap) {
      c.fillStyle = '#07080d'; c.fillRect(br.x + br.w * .36, br.y + br.h * .28, br.w * .28, br.h * .44);
    }
  }
  // Lasers
  c.fillStyle = '#00f0ff'; c.shadowColor = '#00f0ff'; c.shadowBlur = 8 * glow;
  for (const lz of s.lasers) c.fillRect(lz.x - 1, lz.y - 6, 2, 10);
  // Shockwaves + sparks
  for (const r of s.rings) { r.r += dt * 110; r.l -= dt; c.strokeStyle = hexA('#fcee09', Math.max(0, r.l * 2.2)); c.lineWidth = 1.5; c.beginPath(); c.arc(r.x, r.y, r.r, 0, TAU); c.stroke(); }
  s.rings = s.rings.filter((r) => r.l > 0);
  for (const sp of s.sparks) { sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.l -= dt; c.fillStyle = hexA(sp.c, Math.max(0, sp.l * 2)); c.fillRect(sp.x - 1.5, sp.y - 1.5, 3, 3); }
  s.sparks = s.sparks.filter((sp) => sp.l > 0);
  // Ball trail + orb
  for (let i = 0; i < b.trail.length; i++) {
    const [tx, ty] = b.trail[i]; const k = (i + 1) / b.trail.length;
    c.fillStyle = hexA('#ffaa00', k * .45); c.beginPath(); c.arc(tx, ty, 3.6 * k, 0, TAU); c.fill();
  }
  c.shadowColor = '#fcee09'; c.shadowBlur = 14 * glow; c.fillStyle = '#fff5b8';
  c.beginPath(); c.arc(b.x, b.y, 4.2, 0, TAU); c.fill();
  // Cyber paddle
  c.shadowColor = '#ffaa00'; c.shadowBlur = 12 * glow; c.fillStyle = '#ffaa00';
  c.fillRect(s.px - pw / 2, py, pw, 6);
  c.fillStyle = '#00f0ff'; c.fillRect(s.px - pw * .25, py + 1.5, pw * .5, 3);
  c.shadowBlur = 0;
}

// ---------- 7. LIGHTCYCLE // Trace: Tron light-cycles leaving neon ribbons + Phase Cloak shimmer ----------
function lightcycle(c, w, h, t, s) {
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const spawnBike = (color, x, y, d) => ({ color, x, y, d, pts: [[x, y]], turnCd: rand(.35, .9), spd: Math.max(58, w * .34) });
  if (!s.init) {
    s.init = true;
    s.bikes = [
      spawnBike('#00e5ff', w * .2, h * .55, 0),
      spawnBike('#ff003c', w * .8, h * .35, 2),
      spawnBike('#fcee09', w * .52, h * .2, 1),
    ];
    s.sparks = [];
  }
  const dt = s.dt;
  const glow = s.lowFps ? 0 : 1;
  c.fillStyle = '#04070e'; c.fillRect(0, 0, w, h);
  // Dark neon arena grid
  c.strokeStyle = 'rgba(0,229,255,.1)'; c.lineWidth = 1;
  const step = 18;
  for (let x = (t * 8) % step; x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = (t * 8) % step; y < h; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  c.strokeStyle = 'rgba(0,229,255,.32)'; c.strokeRect(4, 4, w - 8, h - 8);

  const cloak = (t % 4.6) > 3.2;

  for (let idx = 0; idx < s.bikes.length; idx++) {
    const bk = s.bikes[idx];
    const [dx, dy] = dirs[bk.d];
    bk.x += dx * bk.spd * dt;
    bk.y += dy * bk.spd * dt;
    bk.turnCd -= dt;
    const nearEdge = bk.x < 16 || bk.x > w - 16 || bk.y < 16 || bk.y > h - 16;
    if (nearEdge || bk.turnCd <= 0) {
      const clampedX = Math.max(12, Math.min(w - 12, bk.x));
      const clampedY = Math.max(12, Math.min(h - 12, bk.y));
      bk.x = clampedX; bk.y = clampedY;
      bk.pts.push([bk.x, bk.y]);
      // Choose an inward orthogonal turn
      const choices = [(bk.d + 1) % 4, (bk.d + 3) % 4].filter((nd) => {
        const [nx, ny] = dirs[nd];
        const px = bk.x + nx * 24, py = bk.y + ny * 24;
        return px > 10 && px < w - 10 && py > 10 && py < h - 10;
      });
      bk.d = choices.length ? choices[Math.floor(Math.random() * choices.length)] : (bk.d + 1) % 4;
      bk.turnCd = rand(.35, .95);
    }
    if (bk.pts.length > 14) bk.pts.shift();
    if (Math.random() < .02 && idx > 0) {
      for (let k = 0; k < 5; k++) s.sparks.push({ x: bk.x, y: bk.y, vx: rand(-60, 60), vy: rand(-60, 60), l: .3, c: bk.color });
    }
  }

  // Draw glowing neon ribbon trails
  c.lineJoin = 'miter';
  for (let idx = 0; idx < s.bikes.length; idx++) {
    const bk = s.bikes[idx];
    const isPlayer = idx === 0;
    c.strokeStyle = hexA(bk.color, isPlayer && cloak ? .45 : .9);
    c.shadowColor = bk.color;
    c.shadowBlur = (isPlayer && cloak ? 16 : 10) * glow;
    c.lineWidth = isPlayer ? 3 : 2.2;
    c.beginPath();
    bk.pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.lineTo(bk.x, bk.y);
    c.stroke();

    // Bike chassis head flare
    c.fillStyle = '#ffffff';
    c.fillRect(bk.x - 2.5, bk.y - 2.5, 5, 5);
    if (isPlayer && cloak) {
      c.strokeStyle = hexA('#00ff9f', .75);
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(bk.x, bk.y, 8 + Math.sin(t * 16) * 2, 0, TAU); c.stroke();
    }
  }
  c.shadowBlur = 0;
  for (const sp of s.sparks) { sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.l -= dt; c.fillStyle = hexA(sp.c, Math.max(0, sp.l * 2.5)); c.fillRect(sp.x - 1, sp.y - 1, 2.5, 2.5); }
  s.sparks = s.sparks.filter((sp) => sp.l > 0);
}

const SCENES = { defender, icebreaker, blackwall, neonvector, protocol, overclock, lightcycle };

export function startPreviews(canvases) {
  const reduce = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = canvases.map((cv) => ({ cv, ctx: cv.getContext('2d'), scene: SCENES[cv.dataset.scene], state: {}, visible: true, w: 0, h: 0 }));
  const sizeAll = () => {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    for (const it of items) {
      const r = it.cv.getBoundingClientRect();
      if (!r.width) continue;
      it.w = r.width; it.h = r.height; it.cv.width = Math.round(r.width * dpr); it.cv.height = Math.round(r.height * dpr);
      it.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); it.state = {};
    }
  };
  const io = 'IntersectionObserver' in globalThis ? new IntersectionObserver((es) => es.forEach((e) => { const it = items.find((i) => i.cv === e.target); if (it) it.visible = e.isIntersecting; })) : null;
  items.forEach((it) => io && io.observe(it.cv));
  let last = performance.now(), raf = 0, avgDt = 0.016, stopped = false;
  const tick = (now) => {
    raf = 0;
    if (stopped) return;
    const rawDt = Math.max(0, (now - last) / 1000);
    avgDt = avgDt * 0.9 + Math.min(0.1, rawDt) * 0.1;
    const lowFps = avgDt > 0.025;
    const dt = Math.min(0.05, rawDt); last = now;
    const t = now / 1000;
    for (const it of items) {
      if (!it.visible || !it.scene || !it.w || it.cv.closest('[hidden]')) continue;
      it.state.dt = dt;
      it.state.lowFps = lowFps;
      it.ctx.save();
      try { it.scene(it.ctx, it.w, it.h, t, it.state); } catch (e) { it.state = {}; }
      it.ctx.restore();
    }
    if (!reduce && !stopped && !document.hidden) raf = requestAnimationFrame(tick);
  };
  sizeAll();
  if (reduce) {
    // Render a settled still frame: simulate ~3s once.
    for (let i = 0; i < 90; i++) { const now = 1000 + i * 33; for (const it of items) if (it.scene && it.w) { it.state.dt = 0.033; it.ctx.save(); it.scene(it.ctx, it.w, it.h, now / 1000, it.state); it.ctx.restore(); } }
  } else if (!document.hidden) {
    raf = requestAnimationFrame(tick);
  }
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (stopped) return; sizeAll(); if (reduce) tick(performance.now()); }, 150); };
  const onVisibilityChange = () => {
    if (reduce || stopped) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!document.hidden && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(rt);
    if (io) io.disconnect();
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  return { resize: sizeAll, stop };
}
