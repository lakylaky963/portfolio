// LIGHTCYCLE // Netrunner Trace — Crisp glowing Tron / Cyberpunk 2077 Canvas 2D Renderer.

import { W, H, getArena, DIRS, TUNING } from './engine.js';

const DIR_ANGLE = {
  right: 0,
  down: Math.PI * 0.5,
  left: Math.PI,
  up: -Math.PI * 0.5,
};

const MAX_PARTICLES = 220;
const MAX_RINGS = 24;
const MAX_POPUPS = 24;

export class LightcycleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 960;
    this.h = 576;
    this.cell = 16;
    this.ox = 0;
    this.oy = 0;
    this.time = 0;
    this.avgDt = 0.016;

    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.shake = 0;
    this.flash = { alpha: 0, color: '#00f0ff' };
    this.glitch = 0;
    this.labels = {
      derez: 'DEREZZED!',
      combo: 'COMBO',
      emp: 'EMP SHOCKWAVE!',
      cloak: 'PHASE CLOAK',
    };
  }

  setLabels(labels) {
    Object.assign(this.labels, labels);
  }

  clearEffects() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.popups.length = 0;
    this.shake = 0;
    this.glitch = 0;
    this.flash.alpha = 0;
    this.avgDt = 0.016;
  }

  _pushParticle(p) {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  _pushRing(r) {
    if (this.rings.length >= MAX_RINGS) {
      this.rings.shift();
    }
    this.rings.push(r);
  }

  _pushPopup(pop) {
    if (this.popups.length >= MAX_POPUPS) {
      this.popups.shift();
    }
    this.popups.push(pop);
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const cw = Math.max(300, Math.floor(rect.width));
    const ch = Math.max(200, Math.floor(rect.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(cw * this.dpr);
    this.canvas.height = Math.floor(ch * this.dpr);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.w = cw;
    this.h = ch;

    const pad = Math.min(18, Math.floor(Math.min(cw, ch) * 0.025));
    const cellW = (cw - pad * 2) / W;
    const cellH = (ch - pad * 2) / H;
    this.cell = Math.max(4, Math.floor(Math.min(cellW, cellH) * 2) / 2);
    this.ox = Math.floor((cw - this.cell * W) * 0.5);
    this.oy = Math.floor((ch - this.cell * H) * 0.5);
  }

  cellCenter(gx, gy) {
    return {
      x: this.ox + (gx + 0.5) * this.cell,
      y: this.oy + (gy + 0.5) * this.cell,
    };
  }

  addEvents(events) {
    if (!events || !events.length) return;
    for (const e of events) {
      const pos = this.cellCenter(e.x ?? W / 2, e.y ?? H / 2);
      if (e.type === 'derez') {
        const col = e.color || '#ff2bd6';
        this._spawnExplosion(pos.x, pos.y, col, 32, 1.15);
        this._pushRing({ x: pos.x, y: pos.y, r: this.cell * 0.5, maxR: this.cell * 7.5, color: col, life: 0.52, maxLife: 0.52, lw: 3 });
        this._pushRing({ x: pos.x, y: pos.y, r: this.cell * 0.2, maxR: this.cell * 4.5, color: '#ffffff', life: 0.3, maxLife: 0.3, lw: 2 });
        const comboTxt = e.combo > 1 ? ` ${e.combo}× ${this.labels.combo}!` : '';
        this._pushPopup({
          x: pos.x, y: pos.y - this.cell * 0.6,
          text: `+${e.points} ${this.labels.derez}${comboTxt}`,
          color: e.combo > 1 ? '#fcee09' : col,
          life: 1.35, maxLife: 1.35, scale: e.combo > 1 ? 1.18 : 1.0,
        });
        this.shake = Math.max(this.shake, 7);
        this.flash = { alpha: 0.14, color: col };
      } else if (e.type === 'emp') {
        const maxR = Math.hypot(this.cell * W, this.cell * H) * 0.72;
        this._pushRing({ x: pos.x, y: pos.y, r: this.cell * 0.8, maxR, color: '#00f0ff', life: 0.75, maxLife: 0.75, lw: 5 });
        this._pushRing({ x: pos.x, y: pos.y, r: this.cell * 0.4, maxR: maxR * 0.85, color: '#ff003c', life: 0.65, maxLife: 0.65, lw: 3 });
        this._spawnExplosion(pos.x, pos.y, '#00f0ff', 28, 1.3);
        this._pushPopup({
          x: pos.x, y: pos.y - this.cell,
          text: this.labels.emp,
          color: '#00f0ff',
          life: 1.4, maxLife: 1.4, scale: 1.25,
        });
        this.shake = Math.max(this.shake, 9);
        this.flash = { alpha: 0.24, color: '#00f0ff' };
      } else if (e.type === 'shard') {
        const col = e.kind === 'emp' ? '#ff003c' : '#fcee09';
        this._spawnExplosion(pos.x, pos.y, col, 16, 0.75);
        this._pushRing({ x: pos.x, y: pos.y, r: this.cell * 0.3, maxR: this.cell * 3.8, color: col, life: 0.38, maxLife: 0.38, lw: 2.5 });
        this._pushPopup({
          x: pos.x, y: pos.y - this.cell * 0.5,
          text: `+${e.points}`,
          color: col,
          life: 0.95, maxLife: 0.95, scale: 0.92,
        });
      } else if (e.type === 'cloak') {
        this._pushRing({ x: pos.x, y: pos.y, r: this.cell * 0.3, maxR: this.cell * 4.5, color: '#00f0ff', life: 0.4, maxLife: 0.4, lw: 2.5 });
        this._spawnExplosion(pos.x, pos.y, '#7ef9ff', 14, 0.6);
        this._pushPopup({
          x: pos.x, y: pos.y - this.cell * 0.8,
          text: this.labels.cloak,
          color: '#7ef9ff',
          life: 0.9, maxLife: 0.9, scale: 0.9,
        });
      } else if (e.type === 'crash') {
        this._spawnExplosion(pos.x, pos.y, '#00f0ff', 24, 1.15);
        this._spawnExplosion(pos.x, pos.y, '#ff003c', 22, 1.35);
        this._pushRing({ x: pos.x, y: pos.y, r: this.cell * 0.4, maxR: this.cell * 8, color: '#ff003c', life: 0.6, maxLife: 0.6, lw: 4 });
        this.shake = Math.max(this.shake, 13);
        this.glitch = 0.45;
        this.flash = { alpha: 0.32, color: '#ff003c' };
      } else if (e.type === 'roundClear' || e.type === 'victory') {
        const cx = this.ox + this.cell * W * 0.5;
        const cy = this.oy + this.cell * H * 0.5;
        this._spawnExplosion(cx, cy, '#fcee09', 36, 1.5);
        this._spawnExplosion(cx, cy, '#00ff9f', 26, 1.3);
        this.flash = { alpha: 0.18, color: '#00ff9f' };
      }
    }
  }

  _spawnExplosion(x, y, color, count, speedMult = 1) {
    const baseSpd = this.cell * 9 * speedMult;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const spd = baseSpd * (0.35 + Math.random() * 0.95);
      const life = 0.32 + Math.random() * 0.45;
      this._pushParticle({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 1.5 + Math.random() * (this.cell * 0.24),
        color: i % 5 === 0 ? '#ffffff' : color,
        life, maxLife: life,
        rect: i % 2 === 0,
      });
    }
  }

  _spawnBoostSparks(state, alpha) {
    const p = state.player;
    if (!p || !p.alive || !p.boosting || p.boost < TUNING.boostMin) return;
    const pos = this._interpPos(p, alpha);
    const d = DIRS[p.dir];
    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * this.cell * 2.4;
      const back = this.cell * (4 + Math.random() * 5);
      const life = 0.14 + Math.random() * 0.16;
      this._pushParticle({
        x: pos.x - d.x * this.cell * 0.45 + (Math.random() - 0.5) * 3,
        y: pos.y - d.y * this.cell * 0.45 + (Math.random() - 0.5) * 3,
        vx: -d.x * back + (d.y !== 0 ? spread : 0),
        vy: -d.y * back + (d.x !== 0 ? spread : 0),
        size: 1.6 + Math.random() * 2.2,
        color: Math.random() < 0.55 ? '#fcee09' : '#00f0ff',
        life, maxLife: life,
        rect: true,
      });
    }
  }

  _interpPos(c, alpha) {
    const dx = c.x - c.px;
    const dy = c.y - c.py;
    // Skip interpolation across Blackwall edge wrap jumps
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      return this.cellCenter(c.x, c.y);
    }
    return this.cellCenter(c.px + dx * alpha, c.py + dy * alpha);
  }

  _updateEffects(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 28);
    if (this.glitch > 0) this.glitch = Math.max(0, this.glitch - dt);
    if (this.flash.alpha > 0) this.flash.alpha = Math.max(0, this.flash.alpha - dt * 0.85);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.08, dt);
      p.vy *= Math.pow(0.08, dt);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const p = 1 - r.life / r.maxLife;
      r.r = r.maxR * (1 - Math.pow(1 - p, 2.6));
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      if (pop.life <= 0) { this.popups.splice(i, 1); continue; }
      pop.y -= 28 * dt;
    }
  }

  draw(state, dt = 0.016, alpha = 1) {
    if (dt > 0) {
      this.avgDt = this.avgDt * 0.9 + Math.min(0.1, dt) * 0.1;
      this._updateEffects(dt);
      if (state && state.phase === 'playing') this._spawnBoostSparks(state, alpha);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Clear full viewport with deep void
    ctx.fillStyle = '#05060b';
    ctx.fillRect(0, 0, this.w, this.h);

    if (!state) {
      ctx.restore();
      return;
    }

    // Screen shake offset
    if (this.shake > 0.2) {
      const sx = (Math.random() - 0.5) * this.shake * 2;
      const sy = (Math.random() - 0.5) * this.shake * 2;
      ctx.translate(sx, sy);
    }

    const arena = getArena(state.arenaId);
    const aw = this.cell * W;
    const ah = this.cell * H;

    // 1. Arena floor & neon grid
    this._drawArenaFloor(ctx, arena, aw, ah);

    // 2. Kabuki obstacles
    if (arena.obstacles.length) {
      this._drawObstacles(ctx, arena.obstacles);
    }

    // 3. Pulsing Data & EMP Shards
    this._drawShards(ctx, state.shards);

    // 4. Ghost trails (Phase Cloak)
    for (const c of state.cycles) {
      if (c.ghost && c.ghost.length && (c.cloakTicks > 0 || c.kind === 'player')) {
        if (c.cloakTicks > 0) this._drawGhostTrail(ctx, c);
      }
    }

    // 5. Solid luminous light-cycle trails
    for (const c of state.cycles) {
      if (!c.alive && c !== state.player) continue;
      this._drawTrail(ctx, c, alpha);
    }

    // 6. Light-cycle bike heads
    for (const c of state.cycles) {
      if (!c.alive) continue;
      this._drawCycleHead(ctx, c, alpha, state);
    }

    // 7. Arena border / Blackwall Warp energy edges
    this._drawBorder(ctx, arena, aw, ah);

    // 8. Expanding rings, particles, and floating popups
    this._drawVfx(ctx);

    // 9. Screen flash / crash chromatic glitch
    if (this.flash.alpha > 0.005) {
      ctx.fillStyle = this.flash.color;
      ctx.globalAlpha = this.flash.alpha;
      ctx.fillRect(this.ox, this.oy, aw, ah);
      ctx.globalAlpha = 1;
    }
    if (this.glitch > 0) {
      const slices = 5;
      ctx.globalAlpha = Math.min(0.4, this.glitch * 0.9);
      for (let i = 0; i < slices; i++) {
        const gy = this.oy + Math.random() * ah;
        const gh = 2 + Math.random() * 8;
        ctx.fillStyle = i % 2 === 0 ? '#ff003c' : '#00f0ff';
        ctx.fillRect(this.ox + (Math.random() - 0.5) * 22, gy, aw, gh);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  _drawArenaFloor(ctx, arena, aw, ah) {
    // Deep dark gradient floor
    const grad = ctx.createRadialGradient(
      this.ox + aw * 0.5, this.oy + ah * 0.5, this.cell * 2,
      this.ox + aw * 0.5, this.oy + ah * 0.5, Math.max(aw, ah) * 0.72
    );
    grad.addColorStop(0, '#0c1020');
    grad.addColorStop(1, '#06070e');
    ctx.fillStyle = grad;
    ctx.fillRect(this.ox, this.oy, aw, ah);

    // Subtle sub-grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.055)';
    ctx.beginPath();
    for (let x = 1; x < W; x++) {
      if (x % 6 === 0) continue;
      const px = this.ox + x * this.cell + 0.5;
      ctx.moveTo(px, this.oy);
      ctx.lineTo(px, this.oy + ah);
    }
    for (let y = 1; y < H; y++) {
      if (y % 6 === 0) continue;
      const py = this.oy + y * this.cell + 0.5;
      ctx.moveTo(this.ox, py);
      ctx.lineTo(this.ox + aw, py);
    }
    ctx.stroke();

    // Major sector grid lines every 6 cells
    ctx.strokeStyle = arena.id === 'blackwall'
      ? 'rgba(255, 0, 60, 0.14)'
      : arena.id === 'kabuki'
        ? 'rgba(255, 43, 214, 0.13)'
        : 'rgba(0, 240, 255, 0.13)';
    ctx.beginPath();
    for (let x = 6; x < W; x += 6) {
      const px = this.ox + x * this.cell + 0.5;
      ctx.moveTo(px, this.oy);
      ctx.lineTo(px, this.oy + ah);
    }
    for (let y = 6; y < H; y += 6) {
      const py = this.oy + y * this.cell + 0.5;
      ctx.moveTo(this.ox, py);
      ctx.lineTo(this.ox + aw, py);
    }
    ctx.stroke();

    // Glowing intersection reticles
    ctx.fillStyle = arena.color;
    ctx.globalAlpha = 0.28;
    for (let x = 6; x < W; x += 6) {
      for (let y = 6; y < H; y += 6) {
        const px = this.ox + x * this.cell;
        const py = this.oy + y * this.cell;
        ctx.fillRect(px - 1, py - 1, 2.5, 2.5);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawObstacles(ctx, obstacles) {
    const pulse = 0.72 + Math.sin(this.time * 3.2) * 0.18;
    for (const [gx, gy, gw, gh] of obstacles) {
      const x = this.ox + gx * this.cell;
      const y = this.oy + gy * this.cell;
      const w = gw * this.cell;
      const h = gh * this.cell;
      const cut = Math.min(7, this.cell * 0.55);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + cut, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h - cut);
      ctx.lineTo(x + w - cut, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + cut);
      ctx.closePath();

      // Dark cyber monolith fill
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#1e102b');
      g.addColorStop(1, '#11091c');
      ctx.fillStyle = g;
      ctx.fill();

      // Subtle internal tech stripes clipped inside pillar
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 43, 214, 0.22)';
      ctx.lineWidth = 1;
      for (let d = -h; d < w + h; d += Math.max(6, this.cell * 0.65)) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d - h * 0.5, y + h);
        ctx.stroke();
      }
      ctx.restore();

      // Neon glowing border
      ctx.shadowColor = '#ff2bd6';
      ctx.shadowBlur = 12 * pulse;
      ctx.strokeStyle = '#ff2bd6';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Inner bright core rim
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 190, 245, 0.55)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      ctx.restore();
    }
  }

  _drawShards(ctx, shards) {
    if (!shards || !shards.length) return;
    for (const sh of shards) {
      const pos = this.cellCenter(sh.x, sh.y);
      const isEmp = sh.kind === 'emp';
      const primary = isEmp ? '#ff003c' : '#fcee09';
      const secondary = isEmp ? '#00f0ff' : '#00ff9f';
      const pulse = 1 + Math.sin(this.time * (isEmp ? 8 : 5.5) + sh.x) * 0.22;
      const r = this.cell * (isEmp ? 0.54 : 0.46) * pulse;

      ctx.save();
      ctx.translate(pos.x, pos.y);

      // Pulsing outer beacon ring
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2);
      ctx.strokeStyle = secondary;
      ctx.globalAlpha = 0.35 + Math.sin(this.time * 6) * 0.2;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Rotating segmented halo
      ctx.rotate(this.time * (isEmp ? -3.2 : 2.1));
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.25, 0, Math.PI * 1.35);
      ctx.strokeStyle = primary;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Diamond crystal
      ctx.rotate(this.time * 1.1);
      ctx.shadowColor = primary;
      ctx.shadowBlur = 14;
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.78, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.78, 0);
      ctx.closePath();
      ctx.fill();

      // Bright core
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawGhostTrail(ctx, c) {
    const ghost = c.ghost;
    if (!ghost.length) return;
    ctx.save();
    ctx.strokeStyle = '#7ef9ff';
    ctx.globalAlpha = 0.42 + Math.sin(this.time * 18) * 0.14;
    ctx.lineWidth = Math.max(2, this.cell * 0.32);
    ctx.setLineDash([this.cell * 0.4, this.cell * 0.35]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let prevX = -99, prevY = -99;
    for (let k = 0; k < ghost.length; k++) {
      const i = ghost[k];
      const gx = i % W;
      const gy = (i / W) | 0;
      const px = this.ox + (gx + 0.5) * this.cell;
      const py = this.oy + (gy + 0.5) * this.cell;
      if (Math.abs(gx - prevX) + Math.abs(gy - prevY) === 1) {
        ctx.lineTo(px, py);
      } else {
        ctx.moveTo(px, py);
      }
      prevX = gx;
      prevY = gy;
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawTrail(ctx, c, alpha) {
    const tr = c.trail;
    if (!tr || !tr.length) return;
    const isBoost = c.kind === 'player' && c.boosting && c.boost >= TUNING.boostMin;

    const buildPath = () => {
      ctx.beginPath();
      let prevX = -99, prevY = -99;
      for (let k = 0; k < tr.length; k++) {
        const i = tr[k];
        const gx = i % W;
        const gy = (i / W) | 0;
        const px = this.ox + (gx + 0.5) * this.cell;
        const py = this.oy + (gy + 0.5) * this.cell;
        if (Math.abs(gx - prevX) + Math.abs(gy - prevY) === 1) {
          ctx.lineTo(px, py);
        } else {
          ctx.moveTo(px, py);
          ctx.lineTo(px + 0.01, py);
        }
        prevX = gx;
        prevY = gy;
      }
      // Smoothly extend the very tip to the interpolated bike head (when not cloaked or warping)
      if (c.alive && c.cloakTicks === 0 && tr.length > 0) {
        const lastIdx = tr[tr.length - 1];
        const lx = lastIdx % W;
        const ly = (lastIdx / W) | 0;
        if (Math.abs(c.x - lx) + Math.abs(c.y - ly) <= 2 && Math.abs(c.x - c.px) <= 2 && Math.abs(c.y - c.py) <= 2) {
          const head = this._interpPos(c, alpha);
          ctx.lineTo(head.x, head.y);
        }
      }
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const highQuality = this.avgDt <= 0.025;

    // Outer neon bloom
    buildPath();
    ctx.strokeStyle = c.color;
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = Math.max(4, this.cell * (isBoost ? 0.88 : 0.72));
    if (highQuality) {
      ctx.shadowColor = c.color;
      ctx.shadowBlur = isBoost ? 18 : 12;
    }
    ctx.stroke();

    // Saturated neon ribbon
    buildPath();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = Math.max(2.4, this.cell * 0.42);
    ctx.shadowBlur = highQuality ? 6 : 0;
    ctx.stroke();

    // Hot white-tinted center filament
    buildPath();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isBoost ? '#fff9a6' : '#ffffff';
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = Math.max(1.1, this.cell * 0.16);
    ctx.stroke();

    ctx.restore();
  }

  _drawCycleHead(ctx, c, alpha, state) {
    const pos = this._interpPos(c, alpha);
    const angle = DIR_ANGLE[c.dir] ?? 0;
    const isPlayer = c.kind === 'player';
    const isCloaked = c.cloakTicks > 0;
    const isBoost = isPlayer && c.boosting && c.boost >= TUNING.boostMin;
    const len = this.cell * 1.15;
    const wid = this.cell * 0.64;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // Phase Cloak aura + remaining timer arc
    if (isCloaked) {
      const maxTicks = Math.max(1, Math.ceil(TUNING.cloakMs / (state.tickMs || 110)));
      const frac = Math.min(1, c.cloakTicks / maxTicks);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, this.cell * 1.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.strokeStyle = '#7ef9ff';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }

    // EMP Stun electric flicker around stunned hunters
    if (c.stun > 0) {
      ctx.save();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = this.time * 14 + k * 1.05;
        const r1 = this.cell * 0.7;
        const r2 = this.cell * (0.95 + (k % 2) * 0.25);
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a + 0.35) * r2, Math.sin(a + 0.35) * r2);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(angle);
    if (isCloaked) ctx.globalAlpha = 0.56 + Math.sin(this.time * 24) * 0.18;

    // Nitro afterburner flame
    if (isBoost) {
      const flameLen = len * (0.85 + Math.random() * 0.45);
      const fg = ctx.createLinearGradient(-len * 0.45, 0, -len * 0.45 - flameLen, 0);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.35, '#fcee09');
      fg.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-len * 0.42, -wid * 0.36);
      ctx.lineTo(-len * 0.42 - flameLen, 0);
      ctx.lineTo(-len * 0.42, wid * 0.36);
      ctx.closePath();
      ctx.fill();
    }

    // Headlight cone ahead of bike
    const hl = ctx.createLinearGradient(len * 0.4, 0, len * 2.1, 0);
    hl.addColorStop(0, isPlayer ? 'rgba(0, 240, 255, 0.32)' : 'rgba(255, 43, 214, 0.22)');
    hl.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.moveTo(len * 0.4, -wid * 0.25);
    ctx.lineTo(len * 2.1, -wid * 0.9);
    ctx.lineTo(len * 2.1, wid * 0.9);
    ctx.lineTo(len * 0.4, wid * 0.25);
    ctx.closePath();
    ctx.fill();

    // Sleek chamfered lightcycle body
    ctx.shadowColor = isCloaked ? '#7ef9ff' : c.color;
    ctx.shadowBlur = isPlayer ? 16 : 12;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.moveTo(len * 0.58, 0);
    ctx.lineTo(len * 0.22, -wid * 0.48);
    ctx.lineTo(-len * 0.46, -wid * 0.42);
    ctx.lineTo(-len * 0.55, 0);
    ctx.lineTo(-len * 0.46, wid * 0.42);
    ctx.lineTo(len * 0.22, wid * 0.48);
    ctx.closePath();
    ctx.fill();

    // Dark cockpit recess + bright neon visor core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#070912';
    ctx.beginPath();
    ctx.moveTo(len * 0.28, 0);
    ctx.lineTo(-len * 0.08, -wid * 0.24);
    ctx.lineTo(-len * 0.32, 0);
    ctx.lineTo(-len * 0.08, wid * 0.24);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(len * 0.44, 0);
    ctx.lineTo(len * 0.14, -wid * 0.14);
    ctx.lineTo(-len * 0.18, 0);
    ctx.lineTo(len * 0.14, wid * 0.14);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawBorder(ctx, arena, aw, ah) {
    ctx.save();
    const highQuality = this.avgDt <= 0.025;
    if (arena.wrap) {
      // Blackwall Warp — pulsing portal energy seams
      const dash = Math.max(8, this.cell * 1.1);
      ctx.shadowColor = '#ff003c';
      ctx.shadowBlur = highQuality ? 14 : 0;
      ctx.strokeStyle = '#ff003c';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([dash, dash * 0.65]);
      ctx.lineDashOffset = -this.time * 42;
      ctx.strokeRect(this.ox, this.oy, aw, ah);

      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = highQuality ? 10 : 0;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.78)';
      ctx.lineWidth = 1.4;
      ctx.lineDashOffset = this.time * 32;
      ctx.strokeRect(this.ox - 2, this.oy - 2, aw + 4, ah + 4);
      ctx.setLineDash([]);
    } else {
      // Solid lethal perimeter wall
      ctx.shadowColor = arena.color;
      ctx.shadowBlur = highQuality ? 14 : 0;
      ctx.strokeStyle = arena.color;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(this.ox, this.oy, aw, ah);

      // Corner cyber brackets
      const br = Math.min(22, this.cell * 2.2);
      ctx.strokeStyle = '#fcee09';
      ctx.shadowColor = '#fcee09';
      ctx.shadowBlur = highQuality ? 10 : 0;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(this.ox - 3, this.oy + br); ctx.lineTo(this.ox - 3, this.oy - 3); ctx.lineTo(this.ox + br, this.oy - 3);
      // Top-right
      ctx.moveTo(this.ox + aw - br, this.oy - 3); ctx.lineTo(this.ox + aw + 3, this.oy - 3); ctx.lineTo(this.ox + aw + 3, this.oy + br);
      // Bottom-left
      ctx.moveTo(this.ox - 3, this.oy + ah - br); ctx.lineTo(this.ox - 3, this.oy + ah + 3); ctx.lineTo(this.ox + br, this.oy + ah + 3);
      // Bottom-right
      ctx.moveTo(this.ox + aw - br, this.oy + ah + 3); ctx.lineTo(this.ox + aw + 3, this.oy + ah + 3); ctx.lineTo(this.ox + aw + 3, this.oy + ah - br);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawVfx(ctx) {
    // Expanding shockwave rings
    for (const r of this.rings) {
      const a = Math.max(0, r.life / r.maxLife);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = a * 0.85;
      ctx.lineWidth = r.lw * a + 0.6;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.restore();
    }

    // Shatter particles & nitro sparks (no per-particle shadowBlur for hot-loop performance)
    ctx.save();
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.rect) {
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Floating score / status popups
    for (const pop of this.popups) {
      const a = Math.min(1, (pop.life / pop.maxLife) * 1.6);
      const fontSize = Math.round(Math.max(12, this.cell * 0.92) * pop.scale);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 ${fontSize}px 'Plex Mono', ui-monospace, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#07080d';
      ctx.fillText(pop.text, pop.x + 1.5, pop.y + 1.5);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }
}
