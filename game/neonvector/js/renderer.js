// Canvas 2D renderer. Logical playfield 480x720, scaled to canvas.
import { W, H } from './engine.js';
import { bossName, t } from './i18n.js';

const COL = { cyan: '#19f3ff', mag: '#ff2bd6', yellow: '#fcee0a', orange: '#ff8a1f', ok: '#39ff88', bg: '#05020f' };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.fx = []; this.scroll = 0; this.trail = []; this.pillars = [];
    this.avgDt = 1 / 60; this.lowFps = false;
    for (let i = 0; i < 14; i++) this.pillars.push({ z: Math.random(), side: i % 2 ? 1 : -1, h: 40 + Math.random() * 120, c: i % 3 ? COL.cyan : COL.mag });
    this.resize();
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.scale = Math.min(this.cv.width / W, this.cv.height / H);
    this.ox = (this.cv.width - W * this.scale) / 2; this.oy = (this.cv.height - H * this.scale) / 2;
  }
  toLogical(clientX, clientY) {
    const r = this.cv.getBoundingClientRect(), dpr = this.cv.width / r.width;
    return { x: ((clientX - r.left) * dpr - this.ox) / this.scale, y: ((clientY - r.top) * dpr - this.oy) / this.scale };
  }
  addEvents(events) {
    for (const e of events) {
      if (e.type === 'explode') this.fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, d: 0.5, r: (e.size || 12) * 3, c: COL.orange });
      else if (e.type === 'bossDead') for (let i = 0; i < 5; i++) this.fx.push({ k: 'ring', x: e.x + (Math.random() - 0.5) * 80, y: e.y + (Math.random() - 0.5) * 60, t: -i * 0.12, d: 0.8, r: 110, c: i % 2 ? COL.mag : COL.cyan });
      else if (e.type === 'graze') this.fx.push({ k: 'spark', x: e.x, y: e.y, t: 0, d: 0.25, r: 14, c: COL.cyan });
      else if (e.type === 'hit') this.fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, d: 0.7, r: 120, c: COL.mag });
      else if (e.type === 'overdrive') this.fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, d: 0.9, r: 900, c: COL.yellow, w: 10 }, { k: 'ring', x: e.x, y: e.y, t: -0.1, d: 0.9, r: 700, c: COL.cyan, w: 6 });
      else if (e.type === 'pickup') this.fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, d: 0.4, r: 40, c: COL.ok });
      else if (e.type === 'shieldBreak') this.fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, d: 0.5, r: 100, c: COL.cyan });
    }
  }
  poly(pts, close = true) { const c = this.ctx; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); }
  glow(col, w = 2, blur = 12) { const c = this.ctx; c.strokeStyle = col; c.lineWidth = w; c.shadowColor = col; c.shadowBlur = this.lowFps ? 0 : blur; c.lineJoin = 'round'; }
  background(s, dt) {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0220'); g.addColorStop(0.55, '#14052e'); g.addColorStop(1, '#2a0840');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // sun
    c.fillStyle = 'rgba(255,43,214,0.13)'; c.beginPath(); c.arc(W / 2, 250, 140, 0, 7); c.fill();
    this.scroll = (this.scroll + dt * (0.35 + (s.phase === 'boss' ? 0.15 : 0))) % 1;
    const hz = 200;
    c.save(); this.glow(COL.mag, 1, 6); c.globalAlpha = 0.55;
    // horizontal perspective lines
    for (let i = 0; i < 14; i++) {
      const f = (i + this.scroll) / 14, y = hz + (H - hz) * f * f; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    // converging verticals
    this.glow(COL.cyan, 1, 6); c.globalAlpha = 0.35;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(W / 2 + i * 14, hz); c.lineTo(W / 2 + i * 90, H); c.stroke(); }
    c.restore();
    // data pillars on margins
    c.save();
    for (const p of this.pillars) {
      p.z = (p.z + dt * 0.5) % 1; const f = p.z * p.z, y = hz + (H - hz) * f, x = W / 2 + p.side * (30 + 230 * f * 0.95 + 40), hh = p.h * (0.2 + f * 1.2), w = 4 + f * 14;
      c.globalAlpha = 0.25 + f * 0.6; c.fillStyle = p.c; c.shadowColor = p.c; c.shadowBlur = this.lowFps ? 0 : 10; c.fillRect(x - w / 2, y - hh, w, hh);
    }
    c.restore();
  }
  ship(x, y, col, inv, flash) {
    const c = this.ctx; c.save(); c.translate(x, y);
    if (inv && Math.floor(performance.now() / 70) % 2) c.globalAlpha = 0.4;
    this.glow(col, 2, 14); c.fillStyle = 'rgba(25,243,255,0.12)';
    this.poly([[0, -18], [8, 4], [16, 14], [4, 10], [0, 16], [-4, 10], [-16, 14], [-8, 4]]); c.fill(); c.stroke();
    c.restore();
  }
  draw(s, dt, lang = 'en') {
    if (dt > 0) {
      this.avgDt = this.avgDt * 0.9 + dt * 0.1;
      this.lowFps = this.avgDt > 0.025;
    }
    const c = this.ctx, p = s.player;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = COL.bg; c.fillRect(0, 0, this.cv.width, this.cv.height);
    const sh = s.shake > 0 ? s.shake * 8 : 0;
    c.setTransform(this.scale, 0, 0, this.scale, this.ox + (Math.random() - 0.5) * sh * this.scale, this.oy + (Math.random() - 0.5) * sh * this.scale);
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    this.background(s, dt);
    // lanes
    for (const l of s.lanes) {
      c.save();
      if (l.active) { c.shadowColor = COL.mag; c.shadowBlur = this.lowFps ? 0 : 24; c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(l.x - l.w / 4, 0, l.w / 2, H); c.fillStyle = 'rgba(255,43,214,0.55)'; c.fillRect(l.x - l.w / 2, 0, l.w, H); }
      else { c.strokeStyle = COL.yellow; c.globalAlpha = 0.35 + 0.5 * l.charge; c.lineWidth = 2; c.setLineDash([10, 8]); c.strokeRect(l.x - l.w / 2, 0, l.w, H); c.fillStyle = 'rgba(252,238,10,' + (0.05 + l.charge * 0.15) + ')'; c.fillRect(l.x - l.w / 2, 0, l.w, H); }
      c.restore();
    }
    // pickups
    for (const k of s.pickups) {
      const col = { P: COL.yellow, D: COL.cyan, S: COL.ok, C: COL.mag }[k.type];
      c.save(); this.glow(col, 2, 14); c.beginPath(); c.arc(k.x, k.y, 11, 0, 7); c.stroke();
      c.fillStyle = col; c.font = k.type === 'C' ? 'bold 10px monospace' : 'bold 12px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowBlur = 0;
      c.fillText(k.type === 'C' ? '€$' : k.type, k.x, k.y + 1); c.restore();
    }
    // enemies
    for (const e of s.enemies) this.enemy(e);
    if (s.boss) this.boss(s.boss);
    // player bullets
    c.save(); c.shadowColor = COL.cyan; c.shadowBlur = this.lowFps ? 0 : 8;
    for (const b of s.pbullets) { c.fillStyle = b.homing ? COL.yellow : b.drone ? COL.ok : '#bffcff'; c.fillRect(b.x - 1.5, b.y - 8, 3, 14); }
    c.restore();
    // enemy bullets: fast translucent outer halo + solid ring + white core (no per-bullet shadowBlur)
    c.save(); c.shadowBlur = 0;
    for (const b of s.bullets) {
      const big = b.r > 5;
      c.fillStyle = big ? 'rgba(255,138,31,0.28)' : 'rgba(255,43,214,0.28)';
      c.beginPath(); c.arc(b.x, b.y, b.r + 3.8, 0, 7); c.fill();
      c.fillStyle = big ? COL.orange : COL.mag;
      c.beginPath(); c.arc(b.x, b.y, b.r + 1.5, 0, 7); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(b.x, b.y, b.r * 0.55, 0, 7); c.fill();
    }
    c.restore();
    // player
    if (s.phase !== 'dead') {
      this.trail.push({ x: p.x, y: p.y + 14, t: 0 }); if (this.trail.length > 14) this.trail.shift();
      c.save(); this.trail.forEach((tr, i) => { c.globalAlpha = i / 18; c.fillStyle = COL.cyan; c.fillRect(tr.x - 2, tr.y + (14 - i) * 1.2, 4, 3); }); c.restore();
      for (let i = 0; i < p.drones; i++) { const dx = i ? 30 : -30; c.save(); this.glow(COL.ok, 2, 10); this.poly([[p.x + dx, p.y - 8], [p.x + dx + 6, p.y + 6], [p.x + dx - 6, p.y + 6]]); c.stroke(); c.restore(); }
      this.ship(p.x, p.y, COL.cyan, p.invuln > 0);
      c.save(); c.shadowColor = COL.cyan; c.shadowBlur = this.lowFps ? 0 : 12; c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, p.hitR, 0, 7); c.fill(); c.fillStyle = COL.cyan; c.beginPath(); c.arc(p.x, p.y, p.hitR - 1.5, 0, 7); c.fill();
      c.strokeStyle = 'rgba(25,243,255,0.28)'; c.lineWidth = 1; c.setLineDash([3, 4]); c.beginPath(); c.arc(p.x, p.y, p.grazeR, 0, 7); c.stroke(); c.restore();
      if (p.shield > 0) { c.save(); this.glow(COL.ok, 2, 14); c.beginPath(); c.arc(p.x, p.y, 24, 0, 7); c.stroke(); c.restore(); }
    }
    // fx
    for (const f of this.fx) {
      f.t += dt; if (f.t < 0) continue; const u = f.t / f.d; if (u >= 1) continue;
      c.save(); c.globalAlpha = 1 - u; const r = f.r * (f.k === 'spark' ? 0.4 + u : u);
      if (f.k === 'ring') { c.strokeStyle = '#ff0040'; c.lineWidth = (f.w || 3) * (1 - u) + 1; c.beginPath(); c.arc(f.x - 2, f.y, r, 0, 7); c.stroke(); c.strokeStyle = '#00e5ff'; c.beginPath(); c.arc(f.x + 2, f.y, r, 0, 7); c.stroke(); c.strokeStyle = f.c; c.shadowColor = f.c; c.shadowBlur = this.lowFps ? 0 : 14; c.beginPath(); c.arc(f.x, f.y, r, 0, 7); c.stroke(); }
      else { c.strokeStyle = f.c; c.lineWidth = 2; c.shadowColor = f.c; c.shadowBlur = this.lowFps ? 0 : 10; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * 1.57 + f.x; c.moveTo(f.x + Math.cos(a) * r * 0.4, f.y + Math.sin(a) * r * 0.4); c.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); } c.stroke(); }
      c.restore();
    }
    this.fx = this.fx.filter((f) => f.t < f.d);
    if (this.fx.length > 200) this.fx.splice(0, this.fx.length - 200);
    // boss HP bar
    if (s.boss && !s.boss.entering) this.bossBar(s.boss, lang);
    c.restore();
  }
  enemy(e) {
    const c = this.ctx; c.save(); c.translate(e.x, e.y);
    const col = e.flash ? '#fff' : { swarm: COL.cyan, interceptor: COL.orange, turret: COL.yellow, kamikaze: COL.mag, gunship: COL.orange }[e.type];
    this.glow(col, 2, 12); c.fillStyle = 'rgba(255,43,214,0.10)';
    if (e.type === 'swarm') this.poly([[0, 9], [9, -6], [0, -2], [-9, -6]]);
    else if (e.type === 'interceptor') this.poly([[0, 14], [14, -8], [4, -4], [0, -12], [-4, -4], [-14, -8]]);
    else if (e.type === 'turret') this.poly([[-14, -10], [14, -10], [14, 6], [0, 14], [-14, 6]]);
    else if (e.type === 'kamikaze') { c.rotate(e.vx !== undefined ? Math.atan2(e.vy, e.vx) - Math.PI / 2 : 0); this.poly([[0, 12], [6, -6], [0, -2], [-6, -6]]); }
    else this.poly([[-20, -10], [20, -10], [14, 8], [0, 18], [-14, 8]]);
    c.fill(); c.stroke(); c.restore();
  }
  boss(b) {
    const c = this.ctx; c.save(); c.translate(b.x, b.y);
    const col = b.flash ? '#fff' : [COL.orange, COL.cyan, COL.mag, COL.yellow, '#ffffff'][['centipede', 'prism', 'spider', 'archon', 'seraph'].indexOf(b.kind)];
    this.glow(col, 3, 20); c.fillStyle = 'rgba(255,43,214,0.12)';
    const r = b.r;
    if (b.kind === 'centipede') { for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(i * 18, Math.abs(i) * 3, 12 - Math.abs(i), 0, 7); c.fill(); c.stroke(); } }
    else if (b.kind === 'prism') { c.rotate(b.t); this.poly([[0, -r], [r, r * 0.7], [-r, r * 0.7]]); c.fill(); c.stroke(); c.rotate(-b.t * 2); this.poly([[0, -r * 0.5], [r * 0.5, r * 0.35], [-r * 0.5, r * 0.35]]); c.stroke(); }
    else if (b.kind === 'spider') {
      this.poly([[-24, -14], [24, -14], [30, 10], [0, 26], [-30, 10]]); c.fill(); c.stroke();
      for (const w of b.wings) { if (w.hp <= 0) continue; c.save(); this.glow(COL.yellow, 2, 12); this.poly([[w.dx - 14, -16], [w.dx + 14, -16], [w.dx + 10, 24], [w.dx - 10, 24]]); c.stroke(); c.fillStyle = COL.yellow; c.fillRect(w.dx - 12, 28, 24 * (w.hp / w.maxHp), 3); c.restore(); }
    }
    else if (b.kind === 'archon') { this.poly([[0, -r], [r, 0], [0, r], [-r, 0]]); c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.4, 0, 7); c.stroke(); }
    else { for (let i = 0; i < 6; i++) { c.save(); c.rotate(b.t * 0.6 + (i * Math.PI) / 3); this.poly([[0, -r * 1.3], [10, -r * 0.4], [-10, -r * 0.4]]); c.stroke(); c.restore(); } c.beginPath(); c.arc(0, 0, r * 0.7, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, 8 + b.phase * 3, 0, 7); c.fillStyle = col; c.fill(); }
    c.restore();
  }
  bossBar(b, lang = 'en') {
    const c = this.ctx, x = 40, y = 52, w = W - 80;
    const idx = typeof b.idx === 'number' ? b.idx : Math.max(0, ['centipede', 'prism', 'spider', 'archon', 'seraph'].indexOf(b.kind));
    const name = bossName(idx, lang, b.name);
    const phaseText = lang === 'he' ? `${t('he', 'phase')} ${b.phase + 1}/${b.phases}` : `P${b.phase + 1}/${b.phases}`;
    c.save(); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x, y, w, 10);
    c.shadowColor = COL.mag; c.shadowBlur = this.lowFps ? 0 : 10; c.fillStyle = COL.mag; c.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 10);
    c.shadowBlur = 0; c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(x, y, w, 10);
    for (let i = 1; i < b.phases; i++) { const px = x + (w * (b.phases - i)) / b.phases; c.beginPath(); c.moveTo(px, y - 3); c.lineTo(px, y + 13); c.stroke(); }
    c.fillStyle = '#fff'; c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.fillText(name + '  ·  ' + phaseText, W / 2, y - 6);
    c.restore();
  }
}
