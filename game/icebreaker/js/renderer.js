// ICEBREAKER // Netrunner Survivor — 60fps Cyberpunk 2077 Canvas 2D Renderer.
import { ARENA, orbitalPositions, activeBoss } from './engine.js';

const SANDEVISTAN_COLORS = ['#00f0ff', '#00ff9f', '#fcee09', '#ff003c', '#b967ff'];

const ENEMY_COLORS = {
  scout: '#ff3b5c',
  hound: '#ff006e',
  shooter: '#b967ff',
  juggernaut: '#ff8c00',
  elite: '#fcee09',
  boss: '#ff003c',
};

const MAX_PARTICLES = 260;
const MAX_NUMBERS = 75;
const MAX_TRAILS = 18;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 960;
    this.h = 600;
    this.dpr = 1;

    this.cam = { x: 0, y: 0, init: false };
    this.shake = 0;
    this.hurtFlash = 0;
    this.clock = 0;
    this.avgDt = 0.016;
    this.lowQuality = false;
    this.trailAccum = 0;
    this.trailColorIdx = 0;

    // Transient VFX pools
    this.particles = [];
    this.numbers = [];
    this.beams = [];    // railgun beams
    this.whips = [];    // monowire arcs
    this.novas = [];    // EMP / Quickhack nova rings
    this.booms = [];    // swarm micro-daemon blasts
    this.trails = [];   // Sandevistan & movement afterimages
  }

  resize() {
    const parent = this.cv.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(320, Math.floor(rect.width));
    this.h = Math.max(240, Math.floor(rect.height));
    this.cv.width = Math.floor(this.w * this.dpr);
    this.cv.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  reset(state) {
    this.particles.length = 0;
    this.numbers.length = 0;
    this.beams.length = 0;
    this.whips.length = 0;
    this.novas.length = 0;
    this.booms.length = 0;
    this.trails.length = 0;
    this.shake = 0;
    this.hurtFlash = 0;
    if (state && state.player) {
      this.cam.x = state.player.x;
      this.cam.y = state.player.y;
      this.cam.init = true;
    } else {
      this.cam.x = 0;
      this.cam.y = 0;
      this.cam.init = false;
    }
  }

  addShake(amount) {
    this.shake = Math.min(18, Math.max(this.shake, amount));
  }

  spawnParticles(x, y, color, count, speedMin = 40, speedMax = 200, size = 3, life = 0.45) {
    const lowQ = this.avgDt > 0.025;
    const emitCount = lowQ ? Math.min(4, Math.max(1, Math.ceil(count * 0.35))) : count;
    const cap = lowQ ? Math.floor(MAX_PARTICLES * 0.45) : MAX_PARTICLES;
    for (let i = 0; i < emitCount; i++) {
      if (this.particles.length >= cap) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color,
        size: size * (0.65 + Math.random() * 0.7),
        life: life * (0.65 + Math.random() * 0.6),
        maxLife: life,
      });
    }
  }

  spawnNumber(x, y, text, color, scale = 1) {
    if (this.numbers.length >= MAX_NUMBERS) this.numbers.shift();
    this.numbers.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 6,
      vy: -52 - Math.random() * 20,
      text,
      color,
      scale,
      life: 0.65,
      maxLife: 0.65,
    });
  }

  ingestEvents(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'rail':
          this.beams.push({ x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, width: ev.width || 16, life: 0.24, maxLife: 0.24 });
          this.addShake(5);
          this.spawnParticles(ev.x1, ev.y1, '#00f0ff', 7, 60, 180, 2.5, 0.25);
          break;
        case 'whip':
          this.whips.push({
            x: ev.x, y: ev.y, angle: ev.angle, arc: ev.arc, range: ev.range, side: ev.side,
            life: 0.22, maxLife: 0.22,
          });
          this.addShake(2.2);
          break;
        case 'nova':
          this.novas.push({ x: ev.x, y: ev.y, radius: ev.radius, life: 0.42, maxLife: 0.42 });
          this.addShake(6);
          this.spawnParticles(ev.x, ev.y, '#2bff88', 18, 90, 240, 3, 0.45);
          break;
        case 'boom':
          this.booms.push({ x: ev.x, y: ev.y, radius: ev.radius, life: 0.32, maxLife: 0.32 });
          this.addShake(4);
          this.spawnParticles(ev.x, ev.y, '#b967ff', 14, 70, 240, 3.2, 0.4);
          break;
        case 'blade':
          this.spawnParticles(ev.x, ev.y, '#ff3b3b', 4, 50, 140, 2.2, 0.22);
          break;
        case 'hit':
          this.spawnNumber(
            ev.x,
            ev.y,
            ev.crit ? `${ev.amount}!` : `${ev.amount}`,
            ev.crit ? '#fcee09' : '#f0f2fa',
            ev.crit ? 1.28 : 0.94,
          );
          if (ev.crit) this.spawnParticles(ev.x, ev.y, '#fcee09', 4, 50, 140, 2, 0.24);
          break;
        case 'kill': {
          const col = ENEMY_COLORS[ev.enemy] || '#ff3b5c';
          const cnt = ev.enemy === 'boss' ? 48 : ev.enemy === 'elite' ? 24 : ev.enemy === 'juggernaut' ? 16 : 9;
          this.spawnParticles(ev.x, ev.y, col, cnt, 60, ev.enemy === 'boss' ? 420 : 220, ev.enemy === 'boss' ? 5 : 3.2, ev.enemy === 'boss' ? 0.9 : 0.45);
          if (ev.enemy === 'juggernaut' || ev.enemy === 'elite') this.addShake(5);
          break;
        }
        case 'boss':
          this.addShake(12);
          this.novas.push({ x: ev.x, y: ev.y, radius: 220, color: '#ff003c', life: 0.65, maxLife: 0.65 });
          break;
        case 'boss_down':
          this.addShake(16);
          this.novas.push({ x: ev.x, y: ev.y, radius: 340, color: '#fcee09', life: 0.75, maxLife: 0.75 });
          break;
        case 'hurt':
          this.hurtFlash = 0.42;
          this.addShake(9);
          this.spawnParticles(ev.x, ev.y, '#ff003c', 12, 80, 220, 3, 0.35);
          this.spawnNumber(ev.x, ev.y - 16, `-${ev.amount}`, '#ff003c', 1.15);
          break;
        case 'heal':
          this.spawnNumber(ev.x, ev.y - 16, `+${ev.value} HP`, '#00ff9f', 1.05);
          this.spawnParticles(ev.x, ev.y, '#00ff9f', 8, 40, 120, 2.5, 0.35);
          break;
        case 'eddy':
          if (ev.value >= 5) this.spawnNumber(ev.x, ev.y - 14, `+${ev.value} €$`, '#fcee09', 0.95);
          break;
        case 'chest':
          this.novas.push({ x: ev.x, y: ev.y, radius: 130, color: '#fcee09', life: 0.45, maxLife: 0.45 });
          this.spawnParticles(ev.x, ev.y, '#fcee09', 20, 60, 220, 3.2, 0.55);
          break;
        case 'chrono_on':
          this.addShake(6);
          break;
        case 'burst':
          this.spawnParticles(ev.x, ev.y, '#ff003c', 14, 100, 240, 3, 0.35);
          break;
        case 'dash':
          this.spawnParticles(ev.x, ev.y, '#fcee09', 8, 60, 160, 2.5, 0.28);
          break;
      }
    }
  }

  updateVfx(state, dt) {
    if (dt > 0) {
      this.avgDt = this.avgDt * 0.9 + dt * 0.1;
      this.lowQuality = this.avgDt > 0.025;
    }
    this.clock += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 32);
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);

    // Smooth camera tracking
    if (state && state.player) {
      if (!this.cam.init) {
        this.cam.x = state.player.x;
        this.cam.y = state.player.y;
        this.cam.init = true;
      } else {
        const k = 1 - Math.exp(-10 * dt);
        this.cam.x += (state.player.x - this.cam.x) * k;
        this.cam.y += (state.player.y - this.cam.y) * k;
      }

      // Sandevistan iconic rainbow afterimage trails
      const p = state.player;
      const moving = Math.hypot(p.vx, p.vy) > 15;
      const chronoOn = state.chrono && state.chrono.active;
      if ((chronoOn || moving) && dt > 0) {
        this.trailAccum += dt;
        const interval = chronoOn ? 0.022 : 0.085;
        if (this.trailAccum >= interval) {
          this.trailAccum = 0;
          const color = chronoOn
            ? SANDEVISTAN_COLORS[this.trailColorIdx++ % SANDEVISTAN_COLORS.length]
            : '#00f0ff';
          this.trails.push({
            x: p.x,
            y: p.y,
            facing: p.facing,
            r: p.r,
            color,
            chrono: chronoOn,
            life: chronoOn ? 0.42 : 0.16,
            maxLife: chronoOn ? 0.42 : 0.16,
          });
          if (this.trails.length > MAX_TRAILS) this.trails.shift();
        }
      }
    } else {
      // Slow drift camera on Start Menu attract background
      this.cam.x = Math.cos(this.clock * 0.16) * 260;
      this.cam.y = Math.sin(this.clock * 0.12) * 180;
    }

    if (dt <= 0) return;

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      const drag = Math.max(0, 1 - 4.5 * dt);
      pt.vx *= drag;
      pt.vy *= drag;
    }

    // Update floating damage numbers
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      if (n.life <= 0) { this.numbers.splice(i, 1); continue; }
      n.y += n.vy * dt;
      n.vy *= Math.max(0, 1 - 3.5 * dt);
    }

    // Update transient weapon visuals
    const decayArr = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].life -= dt;
        if (arr[i].life <= 0) arr.splice(i, 1);
      }
    };
    decayArr(this.beams);
    decayArr(this.whips);
    decayArr(this.novas);
    decayArr(this.booms);
    decayArr(this.trails);
  }

  draw(state, dt, joy = null) {
    this.updateVfx(state, dt);

    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const chronoOn = !!(state && state.chrono && state.chrono.active);

    // Clear void
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, w, h);

    // Compute camera with shake
    const sx = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const sy = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const ox = w * 0.5 - this.cam.x + sx;
    const oy = h * 0.5 - this.cam.y + sy;

    ctx.save();
    ctx.translate(ox, oy);

    this.drawArenaFloor(ctx, chronoOn);

    if (state) {
      this.drawPickups(ctx, state);
      this.drawNovasAndBooms(ctx);
      this.drawTrails(ctx);
      this.drawEnemies(ctx, state);
      this.drawEnemyShots(ctx, state);
      this.drawPlayer(ctx, state);
      this.drawOrbitals(ctx, state);
      this.drawBullets(ctx, state);
      this.drawWhipsAndBeams(ctx);
      this.drawParticles(ctx);
      this.drawNumbers(ctx);
    } else {
      this.drawIdlePulse(ctx);
    }

    ctx.restore();

    // Screen-space overlays
    if (state) {
      this.drawOffscreenIndicators(ctx, state);
    }
    if (chronoOn) {
      this.drawSandevistanOverlay(ctx, state);
    }
    if (this.hurtFlash > 0) {
      this.drawHurtVignette(ctx);
    }
    if (joy && joy.active) {
      this.drawVirtualJoystick(ctx, joy);
    }
  }

  drawArenaFloor(ctx, chronoOn) {
    const left = this.cam.x - this.w * 0.5 - 80;
    const right = this.cam.x + this.w * 0.5 + 80;
    const top = this.cam.y - this.h * 0.5 - 80;
    const bottom = this.cam.y + this.h * 0.5 + 80;

    const minX = Math.max(-ARENA, Math.floor(left / 80) * 80);
    const maxX = Math.min(ARENA, Math.ceil(right / 80) * 80);
    const minY = Math.max(-ARENA, Math.floor(top / 80) * 80);
    const maxY = Math.min(ARENA, Math.ceil(bottom / 80) * 80);

    // Minor 80px grid
    ctx.beginPath();
    for (let x = minX; x <= maxX; x += 80) {
      if (x % 320 === 0) continue;
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    for (let y = minY; y <= maxY; y += 80) {
      if (y % 320 === 0) continue;
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
    }
    ctx.strokeStyle = chronoOn ? 'rgba(0, 240, 255, 0.11)' : 'rgba(0, 240, 255, 0.055)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Major 320px sector lines
    const majMinX = Math.max(-ARENA, Math.floor(left / 320) * 320);
    const majMaxX = Math.min(ARENA, Math.ceil(right / 320) * 320);
    const majMinY = Math.max(-ARENA, Math.floor(top / 320) * 320);
    const majMaxY = Math.min(ARENA, Math.ceil(bottom / 320) * 320);

    ctx.beginPath();
    for (let x = majMinX; x <= majMaxX; x += 320) {
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    for (let y = majMinY; y <= majMaxY; y += 320) {
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
    }
    ctx.strokeStyle = chronoOn ? 'rgba(252, 238, 9, 0.18)' : 'rgba(0, 240, 255, 0.14)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // Glowing sector nodes & coordinates
    ctx.font = '600 10px "Plex Mono", monospace';
    ctx.fillStyle = chronoOn ? 'rgba(252, 238, 9, 0.34)' : 'rgba(0, 240, 255, 0.24)';
    for (let x = majMinX; x <= majMaxX; x += 320) {
      for (let y = majMinY; y <= majMaxY; y += 320) {
        if (Math.abs(x) >= ARENA || Math.abs(y) >= ARENA) continue;
        ctx.fillRect(x - 2, y - 2, 4, 4);
        const sx = (x / 320) + 5;
        const sy = (y / 320) + 5;
        ctx.fillText(`S${sx}:${sy}`, x + 7, y + 13);
      }
    }

    // Arena pulsing red boundary wall
    const pulse = 0.55 + 0.45 * Math.sin(this.clock * 4.2);
    ctx.save();
    // Outer danger zone tint
    ctx.strokeStyle = `rgba(255, 0, 60, ${0.14 + pulse * 0.12})`;
    ctx.lineWidth = 36;
    ctx.strokeRect(-ARENA - 18, -ARENA - 18, ARENA * 2 + 36, ARENA * 2 + 36);

    // Crisp neon boundary
    ctx.strokeStyle = `rgba(255, 0, 60, ${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 3;
    if (this.avgDt <= 0.025) {
      ctx.shadowColor = '#ff003c';
      ctx.shadowBlur = 16;
    }
    ctx.strokeRect(-ARENA, -ARENA, ARENA * 2, ARENA * 2);

    // Dashed inner warning line
    ctx.shadowBlur = 0;
    ctx.setLineDash([14, 14]);
    ctx.strokeStyle = `rgba(252, 238, 9, ${0.25 + pulse * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-ARENA + 12, -ARENA + 12, (ARENA - 12) * 2, (ARENA - 12) * 2);
    ctx.restore();
  }

  drawIdlePulse(ctx) {
    const r = (this.clock * 140) % 620;
    const alpha = Math.max(0, 1 - r / 620) * 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawPickups(ctx, state) {
    const pad = 40;
    const minX = this.cam.x - this.w * 0.5 - pad;
    const maxX = this.cam.x + this.w * 0.5 + pad;
    const minY = this.cam.y - this.h * 0.5 - pad;
    const maxY = this.cam.y + this.h * 0.5 + pad;

    for (const k of state.pickups) {
      if (k.x < minX || k.x > maxX || k.y < minY || k.y > maxY) continue;
      const bob = Math.sin(this.clock * 5 + (k.id || 0)) * 2.2;

      if (k.kind === 'xp') {
        const big = k.value >= 5;
        const sz = big ? 6.5 : 4.5;
        ctx.save();
        ctx.translate(k.x, k.y + bob);
        ctx.fillStyle = big ? '#00ff9f' : '#00f0ff';
        ctx.beginPath();
        ctx.moveTo(0, -sz);
        ctx.lineTo(sz * 0.78, 0);
        ctx.lineTo(0, sz);
        ctx.lineTo(-sz * 0.78, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
        ctx.restore();
      } else if (k.kind === 'eddy') {
        ctx.save();
        ctx.translate(k.x, k.y + bob);
        ctx.rotate(this.clock * 3 + (k.id || 0));
        ctx.fillStyle = '#fcee09';
        ctx.strokeStyle = '#ff9900';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-5, -5, 10, 10);
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.fillStyle = '#07080d';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      } else if (k.kind === 'heal') {
        ctx.save();
        ctx.translate(k.x, k.y + bob);
        ctx.fillStyle = 'rgba(0, 255, 159, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#00ff9f';
        ctx.fillRect(-2.5, -7, 5, 14);
        ctx.fillRect(-7, -2.5, 14, 5);
        ctx.restore();
      } else if (k.kind === 'chest') {
        const pulse = 0.65 + 0.35 * Math.sin(this.clock * 7);
        ctx.save();
        ctx.translate(k.x, k.y + bob);
        ctx.strokeStyle = `rgba(252, 238, 9, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 17 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fcee09';
        ctx.strokeStyle = '#ff003c';
        ctx.lineWidth = 2;
        ctx.fillRect(-10, -8, 20, 16);
        ctx.strokeRect(-10, -8, 20, 16);
        ctx.fillStyle = '#07080d';
        ctx.fillRect(-10, -1.5, 20, 3);
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
    }
  }

  drawTrails(ctx) {
    if (!this.trails.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const tr of this.trails) {
      const a = (tr.life / tr.maxLife) * (tr.chrono ? 0.62 : 0.26);
      ctx.save();
      ctx.translate(tr.x, tr.y);
      ctx.rotate(tr.facing);
      ctx.globalAlpha = a;
      ctx.fillStyle = tr.color;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = tr.chrono ? 2.2 : 1.2;
      this.traceRunnerPath(ctx, tr.r);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  traceRunnerPath(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(r * 1.25, 0);
    ctx.lineTo(r * 0.15, r * 0.92);
    ctx.lineTo(-r * 1.05, r * 0.6);
    ctx.lineTo(-r * 0.68, 0);
    ctx.lineTo(-r * 1.05, -r * 0.6);
    ctx.lineTo(r * 0.15, -r * 0.92);
    ctx.closePath();
  }

  drawPlayer(ctx, state) {
    const p = state.player;
    const chronoOn = state.chrono && state.chrono.active;

    // Subtle magnet pickup radius ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.pickupRange, 0, Math.PI * 2);
    ctx.strokeStyle = chronoOn ? 'rgba(252, 238, 9, 0.12)' : 'rgba(0, 240, 255, 0.07)';
    ctx.setLineDash([6, 10]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Invulnerability blink
    if (p.invuln > 0 && Math.floor(this.clock * 24) % 2 === 0) return;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Sandevistan golden aura ring
    if (chronoOn) {
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 9 + Math.sin(this.clock * 18) * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(252, 238, 9, 0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.rotate(p.facing);
    ctx.shadowColor = chronoOn ? '#fcee09' : '#00f0ff';
    ctx.shadowBlur = chronoOn ? 18 : 12;

    // Outer cyber-runner shell
    this.traceRunnerPath(ctx, p.r);
    ctx.fillStyle = '#0c1324';
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = chronoOn ? '#fcee09' : '#00f0ff';
    ctx.stroke();

    // Glowing yellow cyber-visor & core
    ctx.shadowBlur = 0;
    ctx.fillStyle = chronoOn ? '#00f0ff' : '#fcee09';
    ctx.beginPath();
    ctx.moveTo(p.r * 0.8, 0);
    ctx.lineTo(0, p.r * 0.42);
    ctx.lineTo(-p.r * 0.35, 0);
    ctx.lineTo(0, -p.r * 0.42);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  drawEnemies(ctx, state) {
    const pad = 70;
    const minX = this.cam.x - this.w * 0.5 - pad;
    const maxX = this.cam.x + this.w * 0.5 + pad;
    const minY = this.cam.y - this.h * 0.5 - pad;
    const maxY = this.cam.y + this.h * 0.5 + pad;

    for (const e of state.enemies) {
      if (e.dead) continue;
      if (e.x < minX || e.x > maxX || e.y < minY || e.y > maxY) continue;

      const flash = e.flash > 0;
      const slowed = e.slowT > 0;
      const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);

      ctx.save();
      ctx.translate(e.x, e.y);

      // EMP slow frost ring
      if (slowed) {
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(43, 255, 136, 0.6)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      switch (e.type) {
        case 'scout': {
          const a = (e.vx || e.vy) ? Math.atan2(e.vy, e.vx) : angle;
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(e.r * 1.2, 0);
          ctx.lineTo(-e.r * 0.9, e.r * 0.85);
          ctx.lineTo(-e.r * 0.45, 0);
          ctx.lineTo(-e.r * 0.9, -e.r * 0.85);
          ctx.closePath();
          ctx.fillStyle = flash ? '#ffffff' : '#260812';
          ctx.strokeStyle = flash ? '#ffffff' : '#ff3b5c';
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'hound': {
          if (e.mode === 'windup') {
            // Telegraph charge line
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo((e.dirX || Math.cos(angle)) * 180, (e.dirY || Math.sin(angle)) * 180);
            ctx.strokeStyle = 'rgba(255, 0, 110, 0.55)';
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }
          const a = e.mode === 'charge' ? Math.atan2(e.dirY || e.vy, e.dirX || e.vx) : angle;
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(e.r * 1.35, 0);
          ctx.lineTo(-e.r * 0.3, e.r * 0.95);
          ctx.lineTo(-e.r * 1.1, e.r * 0.45);
          ctx.lineTo(-e.r * 0.55, 0);
          ctx.lineTo(-e.r * 1.1, -e.r * 0.45);
          ctx.lineTo(-e.r * 0.3, -e.r * 0.95);
          ctx.closePath();
          ctx.fillStyle = flash ? '#ffffff' : (e.mode === 'charge' ? '#ff006e' : '#29061b');
          ctx.strokeStyle = flash ? '#ffffff' : (e.mode === 'windup' ? '#fcee09' : '#ff006e');
          ctx.lineWidth = 2.2;
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'shooter': {
          ctx.save();
          ctx.rotate(this.clock * 2.2);
          ctx.beginPath();
          ctx.arc(0, 0, e.r + 3, 0, Math.PI * 1.4);
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();

          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(e.r, 0);
          ctx.lineTo(0, e.r);
          ctx.lineTo(-e.r, 0);
          ctx.lineTo(0, -e.r);
          ctx.closePath();
          ctx.fillStyle = flash ? '#ffffff' : '#1b0d30';
          ctx.strokeStyle = flash ? '#ffffff' : '#b967ff';
          ctx.lineWidth = 2.2;
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#00f0ff';
          ctx.beginPath();
          ctx.arc(3, 0, 3.2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'juggernaut': {
          this.drawPolygon(ctx, 8, e.r, Math.PI / 8);
          ctx.fillStyle = flash ? '#ffffff' : '#261306';
          ctx.strokeStyle = flash ? '#ffffff' : '#ff8c00';
          ctx.lineWidth = 3;
          ctx.fill();
          ctx.stroke();

          this.drawPolygon(ctx, 6, e.r * 0.56, this.clock * 0.5);
          ctx.strokeStyle = flash ? '#ffffff' : '#ff2a55';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        }
        case 'elite': {
          const pulse = 0.7 + 0.3 * Math.sin(this.clock * 9);
          ctx.beginPath();
          ctx.arc(0, 0, e.r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(252, 238, 9, ${pulse * 0.65})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.rotate(this.clock * 1.8);
          this.drawPolygon(ctx, 6, e.r, 0);
          ctx.fillStyle = flash ? '#ffffff' : '#260822';
          ctx.strokeStyle = flash ? '#ffffff' : '#fcee09';
          ctx.lineWidth = 2.6;
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ff003c';
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'boss': {
          const enraged = e.hp < e.maxHp * 0.5;
          const auraPulse = 0.6 + 0.4 * Math.sin(this.clock * (enraged ? 11 : 5));
          // Blackwall menacing aura
          const grad = ctx.createRadialGradient(0, 0, e.r * 0.5, 0, 0, e.r * 1.85);
          grad.addColorStop(0, enraged ? 'rgba(255, 0, 60, 0.38)' : 'rgba(255, 0, 60, 0.24)');
          grad.addColorStop(0.6, enraged ? 'rgba(252, 238, 9, 0.14)' : 'rgba(185, 103, 255, 0.1)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 1.85, 0, Math.PI * 2);
          ctx.fill();

          // Outer spinning firewall teeth
          ctx.save();
          ctx.rotate(e.spin || this.clock);
          const teeth = 8;
          ctx.beginPath();
          for (let i = 0; i < teeth * 2; i++) {
            const a = (i / (teeth * 2)) * Math.PI * 2;
            const rr = i % 2 === 0 ? e.r + 7 : e.r - 5;
            if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fillStyle = flash ? '#ffffff' : '#1a040c';
          ctx.strokeStyle = flash ? '#ffffff' : (enraged ? '#fcee09' : '#ff003c');
          ctx.lineWidth = 3.2;
          ctx.shadowColor = enraged ? '#fcee09' : '#ff003c';
          ctx.shadowBlur = 18;
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Counter-rotating inner octagon
          ctx.save();
          ctx.rotate(-(e.spin || this.clock) * 1.4);
          this.drawPolygon(ctx, 8, e.r * 0.62, 0);
          ctx.strokeStyle = enraged ? '#ff003c' : '#00f0ff';
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.restore();

          // Blazing core eye
          ctx.fillStyle = enraged ? '#fcee09' : '#ff003c';
          ctx.beginPath();
          ctx.arc(0, 0, 12 + auraPulse * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }

      ctx.restore();

      // Mini HP bar for damaged heavies / elites (boss uses top HUD bar)
      if ((e.type === 'juggernaut' || e.type === 'elite') && e.hp < e.maxHp) {
        const bw = e.r * 2.1;
        const bx = e.x - bw * 0.5;
        const by = e.y - e.r - 10;
        const pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(7, 8, 13, 0.8)';
        ctx.fillRect(bx, by, bw, 4);
        ctx.fillStyle = e.type === 'elite' ? '#fcee09' : '#ff8c00';
        ctx.fillRect(bx, by, bw * pct, 4);
      }
    }
  }

  drawPolygon(ctx, sides, r, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  drawEnemyShots(ctx, state) {
    for (const b of state.eshots) {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.boss) {
        ctx.fillStyle = 'rgba(255, 0, 60, 0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, b.r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff003c';
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe0ea';
        ctx.beginPath();
        ctx.arc(0, 0, b.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(185, 103, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, b.r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff2a6d';
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, b.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawOrbitals(ctx, state) {
    const blades = orbitalPositions(state);
    if (!blades.length) return;
    const p = state.player;
    const first = blades[0];
    const radius = Math.hypot(first.x - p.x, first.y - p.y);

    // Faint orbital ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 59, 59, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (const bl of blades) {
      ctx.save();
      ctx.translate(bl.x, bl.y);
      ctx.rotate(this.clock * 14 + bl.a);
      if (this.avgDt <= 0.025) {
        ctx.shadowColor = '#ff3b3b';
        ctx.shadowBlur = 10;
      }

      // 4-tooth cyber-saw
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? bl.size : bl.size * 0.48;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#ff3b3b';
      ctx.fill();
      ctx.strokeStyle = '#ffd1d1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#07080d';
      ctx.beginPath();
      ctx.arc(0, 0, bl.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawBullets(ctx, state) {
    for (const b of state.bullets) {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);

      if (b.kind === 'bolt') {
        // Smart-Pistol cyber-yellow tracking bolt
        ctx.strokeStyle = 'rgba(252, 238, 9, 0.45)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();

        ctx.fillStyle = '#fcee09';
        ctx.beginPath();
        ctx.ellipse(2, 0, 7, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, -1, 6, 2);
      } else if (b.kind === 'orb') {
        // Homing Micro-Daemon plasma orb
        ctx.strokeStyle = 'rgba(185, 103, 255, 0.4)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();

        ctx.fillStyle = 'rgba(185, 103, 255, 0.32)';
        ctx.beginPath();
        ctx.arc(0, 0, b.r + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#c87aff';
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(2, 0, b.r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawWhipsAndBeams(ctx) {
    // Monowire sweeping magenta filament arcs
    for (const w of this.whips) {
      const t = w.life / w.maxLife;
      const startA = w.angle - w.arc * 0.5;
      const endA = w.angle + w.arc * 0.5;
      ctx.save();
      ctx.translate(w.x, w.y);

      // Swept glow wedge
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, w.range, startA, endA);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 42, 109, ${t * 0.16})`;
      ctx.fill();

      // Hot filament edge
      ctx.beginPath();
      ctx.arc(0, 0, w.range, startA, endA);
      ctx.strokeStyle = `rgba(255, 42, 109, ${t})`;
      ctx.lineWidth = 6 * t + 2;
      if (this.avgDt <= 0.025) {
        ctx.shadowColor = '#ff2a6d';
        ctx.shadowBlur = 16;
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, w.range - 2, startA, endA);
      ctx.strokeStyle = `rgba(255, 255, 255, ${t * 0.9})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Piercing cyan Railgun beams
    for (const b of this.beams) {
      const t = b.life / b.maxLife;
      ctx.save();
      ctx.lineCap = 'round';

      // Outer cyan plasma sheath
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.strokeStyle = `rgba(0, 240, 255, ${t * 0.42})`;
      ctx.lineWidth = b.width * (0.9 + (1 - t) * 0.5);
      if (this.avgDt <= 0.025) {
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 22;
      }
      ctx.stroke();

      // Inner bright core
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${t})`;
      ctx.lineWidth = Math.max(2, b.width * 0.34 * t);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawNovasAndBooms(ctx) {
    // Quickhack EMP Nova expanding shockwaves
    for (const n of this.novas) {
      const prog = 1 - n.life / n.maxLife;
      const r = Math.max(8, n.radius * (0.18 + 0.82 * prog));
      const alpha = (n.life / n.maxLife);
      const col = n.color || '#2bff88';
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * 0.9;
      ctx.lineWidth = 5 * alpha + 1.5;
      if (this.avgDt <= 0.025) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 16;
      }
      ctx.stroke();

      ctx.globalAlpha = alpha * 0.14;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }

    // Micro-Daemon explosions
    for (const bm of this.booms) {
      const prog = 1 - bm.life / bm.maxLife;
      const r = Math.max(6, bm.radius * (0.25 + 0.75 * prog));
      const alpha = bm.life / bm.maxLife;
      ctx.save();
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(185, 103, 255, ${alpha * 0.28})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(240, 180, 255, ${alpha * 0.95})`;
      ctx.lineWidth = 3 * alpha + 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const pt of this.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size * 0.5, pt.y - pt.size * 0.5, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  drawNumbers(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.numbers) {
      const a = Math.min(1, (n.life / n.maxLife) * 1.4);
      const px = Math.round(13 * n.scale);
      ctx.font = `700 ${px}px "Plex Mono", monospace`;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#07080d';
      ctx.fillText(n.text, n.x + 1.2, n.y + 1.2);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }

  drawOffscreenIndicators(ctx, state) {
    const targets = [];
    const boss = activeBoss(state);
    if (boss) targets.push({ x: boss.x, y: boss.y, color: '#ff003c', size: 12 });
    for (const k of state.pickups) {
      if (k.kind === 'chest') targets.push({ x: k.x, y: k.y, color: '#fcee09', size: 9 });
    }
    if (!targets.length) return;

    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const margin = 34;

    for (const tg of targets) {
      const sx = tg.x - this.cam.x + hw;
      const sy = tg.y - this.cam.y + hh;
      if (sx > 24 && sx < this.w - 24 && sy > 24 && sy < this.h - 24) continue;

      const ang = Math.atan2(sy - hh, sx - hw);
      const px = Math.max(margin, Math.min(this.w - margin, hw + Math.cos(ang) * (hw - margin)));
      const py = Math.max(margin + 36, Math.min(this.h - margin, hh + Math.sin(ang) * (hh - margin)));

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = tg.color;
      ctx.shadowColor = tg.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(tg.size, 0);
      ctx.lineTo(-tg.size * 0.7, tg.size * 0.7);
      ctx.lineTo(-tg.size * 0.35, 0);
      ctx.lineTo(-tg.size * 0.7, -tg.size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawSandevistanOverlay(ctx, state) {
    const w = this.w;
    const h = this.h;
    const pulse = 0.75 + 0.25 * Math.sin(this.clock * 12);

    // Subtle chromatic radial tint
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.26, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.03)');
    grad.addColorStop(0.7, `rgba(0, 240, 255, ${0.09 * pulse})`);
    grad.addColorStop(1, `rgba(255, 0, 60, ${0.18 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Chromatic edge frames
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(252, 238, 9, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.restore();
  }

  drawHurtVignette(ctx) {
    const w = this.w;
    const h = this.h;
    const a = Math.min(0.55, this.hurtFlash * 1.2);
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(255, 0, 60, 0)');
    grad.addColorStop(1, `rgba(255, 0, 60, ${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  drawVirtualJoystick(ctx, joy) {
    ctx.save();
    // Base ring
    ctx.beginPath();
    ctx.arc(joy.ox, joy.oy, joy.maxR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Direction tether
    ctx.beginPath();
    ctx.moveTo(joy.ox, joy.oy);
    ctx.lineTo(joy.cx, joy.cy);
    ctx.strokeStyle = 'rgba(252, 238, 9, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Thumb puck
    ctx.beginPath();
    ctx.arc(joy.cx, joy.cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.fill();
    ctx.strokeStyle = '#fcee09';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }
}
