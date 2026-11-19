// OVERCLOCK // ICE Shatter — High-FPS Canvas 2D Cyberpunk renderer.
import {
  W, H, BOSS, DURATION, POWERUP_LETTER,
  paddleWidth, stageFor, comboMultiplier,
} from './engine.js';
import { t, stageTitle } from './i18n.js';

const PU_STYLE = Object.freeze({
  multi:  { bg: '#00f0ff', fg: '#07080d', glow: 'rgba(0, 240, 255, 0.7)' },
  wide:   { bg: '#00ff9f', fg: '#07080d', glow: 'rgba(0, 255, 159, 0.7)' },
  laser:  { bg: '#ff003c', fg: '#ffffff', glow: 'rgba(255, 0, 60, 0.75)' },
  pierce: { bg: '#ff6a00', fg: '#07080d', glow: 'rgba(255, 106, 0, 0.8)' },
  shield: { bg: '#38ef7d', fg: '#07080d', glow: 'rgba(56, 239, 125, 0.75)' },
  eddy:   { bg: '#fcee09', fg: '#07080d', glow: 'rgba(252, 238, 9, 0.8)' },
});

function chamferPath(ctx, x, y, w, h, c) {
  const k = Math.min(c, w * 0.35, h * 0.45);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - k);
  ctx.lineTo(x + w - k, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + k);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let dpr = 1;
  let animT = 0;

  const fx = {
    particles: [],
    popups: [],
    rings: [],
    shake: 0,
    flash: 0,
    flashColor: '#00f0ff',
    stageBanner: null,
  };

  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function spawnParticles(x, y, color, count = 14, speed = 220, size = 3.5) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.35 + Math.random() * 0.85) * speed;
      const life = 0.28 + Math.random() * 0.38;
      fx.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 30,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        life,
        maxLife: life,
        shard: Math.random() < 0.55,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 14,
      });
    }
    if (fx.particles.length > 320) fx.particles.splice(0, fx.particles.length - 320);
  }

  function spawnPopup(x, y, text, color = '#fcee09', scale = 1) {
    fx.popups.push({ x, y, vy: -48, text, color, scale, life: 0.95, maxLife: 0.95 });
    if (fx.popups.length > 36) fx.popups.shift();
  }

  function spawnRing(x, y, maxR, color, dur = 0.38, width = 4) {
    fx.rings.push({ x, y, r: 8, maxR, color, life: dur, maxLife: dur, width });
  }

  function clearFx() {
    fx.particles.length = 0;
    fx.popups.length = 0;
    fx.rings.length = 0;
    fx.shake = 0;
    fx.flash = 0;
    fx.stageBanner = null;
  }

  function pushEvent(ev, lang = 'en') {
    if (!ev) return;
    switch (ev.type) {
      case 'brick': {
        const col = ev.color || '#00f0ff';
        spawnParticles(ev.x, ev.y, col, ev.kind === 'vault' ? 20 : 12, 230, 3.6);
        fx.shake = Math.min(10, fx.shake + (ev.combo >= 8 ? 2.4 : 1.1));
        if (ev.combo >= 5 && ev.combo % 5 === 0) {
          const mult = comboMultiplier(ev.combo).toFixed(1);
          spawnPopup(ev.x, ev.y - 8, `${ev.combo}× COMBO (${mult}×)`, '#fcee09', 1.18);
        } else if (ev.combo >= 3) {
          spawnPopup(ev.x, ev.y - 4, `${ev.combo}×`, col, 0.92);
        }
        break;
      }
      case 'crack':
        spawnParticles(ev.x, ev.y, '#ffaa00', 7, 160, 2.6);
        fx.shake = Math.min(8, fx.shake + 1.2);
        break;
      case 'chrome':
        spawnParticles(ev.x, ev.y, '#e2ebff', 6, 175, 2.2);
        break;
      case 'explode':
        spawnParticles(ev.x, ev.y, '#ff3b30', 26, 340, 4.5);
        spawnParticles(ev.x, ev.y, '#fcee09', 16, 260, 3.5);
        spawnRing(ev.x, ev.y, 145, '#ff5500', 0.42, 6);
        spawnRing(ev.x, ev.y, 110, '#fcee09', 0.3, 3);
        fx.shake = Math.min(18, fx.shake + 8.5);
        fx.flash = Math.max(fx.flash, 0.22);
        fx.flashColor = '#ff5500';
        break;
      case 'vault':
        spawnParticles(ev.x, ev.y, '#fcee09', 18, 250, 3.8);
        spawnPopup(ev.x, ev.y - 12, t(lang, 'popVault'), '#fcee09', 1.15);
        break;
      case 'paddle':
        spawnParticles(ev.x, ev.y, '#00f0ff', 7, 140, 2.4);
        break;
      case 'laser':
        spawnParticles(ev.x, ev.y - 6, '#ff003c', 4, 100, 2.0);
        break;
      case 'powerup': {
        const map = {
          multi: 'popMulti', wide: 'popWide', laser: 'popLaser',
          pierce: 'popPierce', shield: 'popShield', eddy: 'popEddy',
        };
        const st = PU_STYLE[ev.kind] || PU_STYLE.multi;
        spawnPopup(W / 2, H - 72, t(lang, map[ev.kind] || 'popMulti'), st.bg, 1.22);
        spawnRing(W / 2, H - 40, 120, st.bg, 0.36, 3);
        break;
      }
      case 'slowmo':
        spawnRing(W / 2, H / 2, 420, '#00f0ff', 0.55, 5);
        spawnPopup(W / 2, H / 2 - 40, t(lang, 'popSlowmo'), '#00f0ff', 1.3);
        fx.flash = 0.25;
        fx.flashColor = '#00f0ff';
        break;
      case 'shieldSave':
        spawnParticles(ev.x, ev.y, '#00ff9f', 22, 260, 3.5);
        spawnRing(ev.x, ev.y, 110, '#00ff9f', 0.4, 4);
        spawnPopup(ev.x, ev.y - 26, t(lang, 'popShieldSave'), '#00ff9f', 1.15);
        fx.shake = Math.min(12, fx.shake + 4);
        break;
      case 'shieldHit':
        spawnParticles(ev.x, ev.y, '#00f0ff', 8, 190, 2.6);
        break;
      case 'shieldBreak':
        spawnParticles(ev.x, ev.y, '#00f0ff', 18, 280, 3.5);
        spawnRing(ev.x, ev.y, BOSS.shieldR + 30, '#00f0ff', 0.32, 3);
        fx.shake = Math.min(12, fx.shake + 4.5);
        break;
      case 'bossHit':
        spawnParticles(ev.x, ev.y, '#ff003c', 12, 240, 3.5);
        fx.shake = Math.min(12, fx.shake + 3.5);
        break;
      case 'bossDown':
        spawnParticles(ev.x, ev.y, '#ff003c', 45, 380, 5);
        spawnParticles(ev.x, ev.y, '#fcee09', 36, 340, 4.5);
        spawnParticles(ev.x, ev.y, '#00f0ff', 28, 300, 3.8);
        spawnRing(ev.x, ev.y, 260, '#fcee09', 0.65, 7);
        spawnRing(ev.x, ev.y, 190, '#ff003c', 0.5, 5);
        spawnPopup(ev.x, ev.y, t(lang, 'popBossDown'), '#fcee09', 1.45);
        fx.shake = 18;
        fx.flash = 0.35;
        fx.flashColor = '#fcee09';
        break;
      case 'stun':
        spawnParticles(ev.x, ev.y, '#ff003c', 18, 220, 3.2);
        spawnPopup(ev.x, ev.y - 26, t(lang, 'popStun'), '#ff003c', 1.18);
        fx.shake = Math.min(14, fx.shake + 6);
        fx.flash = 0.25;
        fx.flashColor = '#ff003c';
        break;
      case 'lose':
        fx.shake = 14;
        fx.flash = 0.32;
        fx.flashColor = '#ff003c';
        break;
      case 'stage':
        fx.stageBanner = {
          level: ev.level,
          name: ev.name,
          boss: !!ev.boss,
          life: 2.0,
          maxLife: 2.0,
        };
        break;
      case 'clear':
        spawnRing(W / 2, H / 2, 360, '#00ff9f', 0.6, 5);
        fx.flash = 0.2;
        fx.flashColor = '#00ff9f';
        break;
      default:
        break;
    }
  }

  function update(dt) {
    animT += dt;
    if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 32);
    if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - dt * 1.4);
    if (fx.stageBanner) {
      fx.stageBanner.life -= dt;
      if (fx.stageBanner.life <= 0) fx.stageBanner = null;
    }

    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.life -= dt;
      if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
      p.vx *= 0.985;
      p.rot += p.vrot * dt;
    }

    for (let i = fx.rings.length - 1; i >= 0; i--) {
      const r = fx.rings[i];
      r.life -= dt;
      if (r.life <= 0) { fx.rings.splice(i, 1); continue; }
      const prog = 1 - r.life / r.maxLife;
      r.r = 8 + (r.maxR - 8) * (1 - Math.pow(1 - prog, 2.2));
    }

    for (let i = fx.popups.length - 1; i >= 0; i--) {
      const pop = fx.popups[i];
      pop.life -= dt;
      if (pop.life <= 0) { fx.popups.splice(i, 1); continue; }
      pop.y += pop.vy * dt;
      pop.vy *= 0.95;
    }
  }

  function drawBackground(s) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#060811');
    grad.addColorStop(0.55, '#090c17');
    grad.addColorStop(1, '#0d0918');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle animated cyber-grid
    const slow = s.timers.slowmo > 0;
    const gridAlpha = slow ? 0.14 : 0.08;
    ctx.strokeStyle = slow ? `rgba(0, 240, 255, ${gridAlpha})` : `rgba(56, 189, 248, ${gridAlpha})`;
    ctx.lineWidth = 1;
    const step = 40;
    const scrollY = (animT * (slow ? 10 : 24)) % step;

    ctx.beginPath();
    for (let x = step; x < W; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = scrollY; y < H; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    // Soft ambient top/bottom horizon glow
    const topGlow = ctx.createRadialGradient(W / 2, 40, 20, W / 2, 40, 420);
    topGlow.addColorStop(0, slow ? 'rgba(0, 240, 255, 0.14)' : 'rgba(252, 238, 9, 0.06)');
    topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, W, 300);

    // Subtle field corner brackets
    ctx.strokeStyle = slow ? 'rgba(0, 240, 255, 0.55)' : 'rgba(252, 238, 9, 0.3)';
    ctx.lineWidth = 2;
    const b = 18;
    ctx.beginPath();
    ctx.moveTo(8, 8 + b); ctx.lineTo(8, 8); ctx.lineTo(8 + b, 8);
    ctx.moveTo(W - 8 - b, 8); ctx.lineTo(W - 8, 8); ctx.lineTo(W - 8, 8 + b);
    ctx.moveTo(8, H - 8 - b); ctx.lineTo(8, H - 8); ctx.lineTo(8 + b, H - 8);
    ctx.moveTo(W - 8 - b, H - 8); ctx.lineTo(W - 8, H - 8); ctx.lineTo(W - 8, H - 8 - b);
    ctx.stroke();

    // Subtle stage watermark at top-left
    const st = stageFor(s.level);
    ctx.fillStyle = 'rgba(180, 186, 208, 0.35)';
    ctx.font = '600 11px "Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`SECTOR ${String(s.level).padStart(2, '0')} // ${st.name}`, 18, 14);
  }

  function drawBrick(br) {
    const { x, y, w, h, type, hp, maxHp } = br;
    const pulse = 0.5 + 0.5 * Math.sin(animT * 6 + br.col * 0.7 + br.row);

    ctx.save();
    chamferPath(ctx, x, y, w, h, 5);

    if (type === 'node') {
      ctx.fillStyle = br.color;
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, br.color);
      g.addColorStop(1, '#121829');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.82;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = br.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Inner cyber line
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + 7, y + 3, w - 16, 2);
    } else if (type === 'armor') {
      const baseCol = maxHp >= 3 ? '#ff3366' : '#ffaa00';
      const fillTop = hp === 3 ? '#5a1632' : hp === 2 ? '#4d2b12' : '#2f1c1c';
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, fillTop);
      g.addColorStop(1, '#121521');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = baseCol;
      ctx.lineWidth = 2;
      ctx.stroke();

      // HP pips
      const pipW = 10;
      const startX = x + w / 2 - (maxHp * (pipW + 3) - 3) / 2;
      for (let i = 0; i < maxHp; i++) {
        ctx.fillStyle = i < hp ? baseCol : 'rgba(255,255,255,0.12)';
        ctx.fillRect(startX + i * (pipW + 3), y + h - 6, pipW, 3);
      }

      // Crack lines when damaged
      if (hp < maxHp) {
        ctx.strokeStyle = hp === 1 ? '#ffffff' : '#ffdd88';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.24, y + 2);
        ctx.lineTo(x + w * 0.42, y + h * 0.52);
        ctx.lineTo(x + w * 0.34, y + h - 3);
        if (maxHp - hp >= 2 || hp === 1) {
          ctx.moveTo(x + w * 0.42, y + h * 0.52);
          ctx.lineTo(x + w * 0.72, y + h * 0.28);
          ctx.lineTo(x + w * 0.84, y + h - 4);
        }
        ctx.stroke();
      }
    } else if (type === 'explosive') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#5c0c1c');
      g.addColorStop(0.5, '#a8122d');
      g.addColorStop(1, '#4a0814');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = pulse > 0.5 ? '#ff5500' : '#ff003c';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pulsing capacitor energy core
      const cx = x + w / 2, cy = y + h / 2;
      const rad = 5 + pulse * 3.5;
      const cg = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad + 6);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.45, '#fcee09');
      cg.addColorStop(1, 'rgba(255, 0, 60, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, rad + 6, 0, Math.PI * 2);
      ctx.fill();

      // Side hazard notches
      ctx.fillStyle = '#fcee09';
      ctx.fillRect(x + 6, y + 6, 4, h - 12);
      ctx.fillRect(x + w - 10, y + 6, 4, h - 12);
    } else if (type === 'chrome') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#6a758c');
      g.addColorStop(0.35, '#cfd9ed');
      g.addColorStop(0.6, '#7a879e');
      g.addColorStop(1, '#414a5e');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#e5eeff';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Rivets + armor cracks if hit by laser
      ctx.fillStyle = '#1e2433';
      ctx.fillRect(x + 6, y + 5, 3, 3);
      ctx.fillRect(x + w - 9, y + 5, 3, 3);
      ctx.fillRect(x + 6, y + h - 8, 3, 3);
      ctx.fillRect(x + w - 9, y + h - 8, 3, 3);
      if (hp < maxHp) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.3, y + 2);
        ctx.lineTo(x + w * 0.55, y + h * 0.6);
        ctx.lineTo(x + w * 0.72, y + h - 2);
        ctx.stroke();
      }
    } else if (type === 'sentinel') {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, '#2a0e3d');
      g.addColorStop(0.5, '#d946ef');
      g.addColorStop(1, '#2a0e3d');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Directional chevron
      const dir = (br.vx || 1) >= 0 ? 1 : -1;
      const cx = x + w / 2, cy = y + h / 2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 5 * dir, cy - 5);
      ctx.lineTo(cx + 4 * dir, cy);
      ctx.lineTo(cx - 5 * dir, cy + 5);
      ctx.stroke();
      // Thruster glow on trailing side
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(dir > 0 ? x - 3 : x + w, y + 6, 3, h - 12);
    } else if (type === 'vault') {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#fcee09');
      g.addColorStop(1, '#c99300');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = pulse > 0.5 ? '#ffffff' : '#fcee09';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#07080d';
      ctx.font = '700 12px "Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('€$', x + w / 2, y + h / 2 + 0.5);
    }

    if (br.hitFlash > 0) {
      chamferPath(ctx, x, y, w, h, 5);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.85, br.hitFlash * 5.5)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoss(s) {
    const bo = s.boss;
    if (!bo || !bo.alive) return;
    ctx.save();

    // Rotating shield segments
    const segStep = (Math.PI * 2) / BOSS.segments;
    for (let i = 0; i < BOSS.segments; i++) {
      const seg = bo.segments[i];
      const a0 = bo.shieldAngle + i * segStep + 0.08;
      const a1 = bo.shieldAngle + (i + 1) * segStep - 0.08;
      ctx.beginPath();
      ctx.arc(bo.x, bo.y, BOSS.shieldR, a0, a1);
      if (seg.hp > 0) {
        ctx.strokeStyle = seg.hp >= 2 ? '#00f0ff' : '#fcee09';
        ctx.lineWidth = seg.hp >= 2 ? 7 : 5;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Regenerating ghost arc
        const prog = 1 - Math.max(0, seg.regen) / BOSS.segRegen;
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.14 + prog * 0.22})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Inner core octagonal housing
    ctx.save();
    ctx.translate(bo.x, bo.y);
    ctx.rotate(-bo.shieldAngle * 0.6);
    ctx.beginPath();
    const sides = 8;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const px = Math.cos(a) * BOSS.coreR;
      const py = Math.sin(a) * BOSS.coreR;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const cg = ctx.createRadialGradient(0, 0, 4, 0, 0, BOSS.coreR);
    cg.addColorStop(0, bo.hitFlash > 0 ? '#ffffff' : '#ff003c');
    cg.addColorStop(0.55, '#590822');
    cg.addColorStop(1, '#150819');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = bo.hitFlash > 0 ? '#ffffff' : '#ff003c';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ff003c';
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pulsing reactor iris
    const iris = 11 + Math.sin(animT * 7) * 3;
    ctx.beginPath();
    ctx.arc(0, 0, iris, 0, Math.PI * 2);
    ctx.fillStyle = '#fcee09';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, iris * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#07080d';
    ctx.fill();
    ctx.restore();

    // Boss HP Bar
    const barW = 148, barH = 8;
    const bx = bo.x - barW / 2;
    const by = bo.y - BOSS.shieldR - 22;
    ctx.fillStyle = 'rgba(7, 8, 13, 0.85)';
    ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
    const pct = Math.max(0, bo.hp / bo.maxHp);
    const bg = ctx.createLinearGradient(bx, by, bx + barW, by);
    bg.addColorStop(0, '#ff003c');
    bg.addColorStop(1, '#fcee09');
    ctx.fillStyle = bg;
    ctx.fillRect(bx, by, barW * pct, barH);
    ctx.strokeStyle = 'rgba(255, 0, 60, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 2, by - 2, barW + 4, barH + 4);

    ctx.fillStyle = '#f0f2fa';
    ctx.font = '700 10px "Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`ICE CORE // ${bo.hp}/${bo.maxHp}`, bo.x, by - 4);
    ctx.restore();
  }

  function drawPulses(s) {
    if (!s.pulses.length) return;
    ctx.save();
    for (const pu of s.pulses) {
      const g = ctx.createRadialGradient(pu.x, pu.y, 2, pu.x, pu.y, pu.r + 7);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#ff003c');
      g.addColorStop(1, 'rgba(255, 0, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r + 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fcee09';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r * (0.75 + 0.25 * Math.sin(animT * 18)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLasers(s) {
    if (!s.lasers.length) return;
    ctx.save();
    ctx.shadowColor = '#ff003c';
    ctx.shadowBlur = 12;
    for (const l of s.lasers) {
      const g = ctx.createLinearGradient(l.x, l.y - 16, l.x, l.y + 8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#ff003c');
      g.addColorStop(1, 'rgba(255, 0, 60, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y - 14);
      ctx.lineTo(l.x, l.y + 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCapsules(s) {
    if (!s.capsules.length) return;
    ctx.save();
    for (const c of s.capsules) {
      const st = PU_STYLE[c.kind] || PU_STYLE.multi;
      const x = c.x - c.w / 2;
      const y = c.y - c.h / 2;
      ctx.shadowColor = st.glow;
      ctx.shadowBlur = 14;
      chamferPath(ctx, x, y, c.w, c.h, 5);
      ctx.fillStyle = st.bg;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const letter = POWERUP_LETTER[c.kind] || '?';
      ctx.fillStyle = st.fg;
      ctx.font = '700 11px "Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`[${letter}]`, c.x, c.y + 0.5);
    }
    ctx.restore();
  }

  function drawMagShield(s) {
    if (!s.shield) return;
    const y = H - 10;
    ctx.save();
    ctx.shadowColor = '#00ff9f';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = '#00ff9f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 14; x <= W - 14; x += 16) {
      const wave = Math.sin(x * 0.045 - animT * 12) * 2.2;
      if (x === 14) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(W - 14, y);
    ctx.stroke();

    // Side emitters
    ctx.fillStyle = '#00ff9f';
    ctx.fillRect(4, y - 5, 10, 10);
    ctx.fillRect(W - 14, y - 5, 10, 10);
    ctx.restore();
  }

  function drawPaddle(s) {
    const p = s.paddle;
    const w = paddleWidth(s);
    const x = p.x - w / 2;
    const y = p.y;
    const h = p.h;
    const stunned = s.timers.stun > 0;
    const wide = s.timers.wide > 0;
    const laser = s.timers.laser > 0;

    ctx.save();

    // Twin laser barrels when armed
    if (laser) {
      const lx = x + 6;
      const rx = x + w - 10;
      ctx.fillStyle = '#252a3d';
      ctx.strokeStyle = '#ff003c';
      ctx.lineWidth = 1.5;
      ctx.fillRect(lx, y - 11, 4, 12);
      ctx.strokeRect(lx, y - 11, 4, 12);
      ctx.fillRect(rx, y - 11, 4, 12);
      ctx.strokeRect(rx, y - 11, 4, 12);
      // Glowing emitter tips
      ctx.shadowColor = '#ff003c';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff5c7a';
      ctx.fillRect(lx, y - 13, 4, 3);
      ctx.fillRect(rx, y - 13, 4, 3);
      ctx.shadowBlur = 0;
    }

    const accent = stunned ? '#ff003c' : laser ? '#ff003c' : wide ? '#00ff9f' : '#fcee09';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    chamferPath(ctx, x, y, w, h, 5);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#2a3147');
    g.addColorStop(0.5, '#171c2b');
    g.addColorStop(1, '#0c0f18');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing core strip
    ctx.fillStyle = stunned ? '#ff003c' : '#00f0ff';
    ctx.fillRect(x + 16, y + 4, Math.max(8, w - 32), 3);
    ctx.fillStyle = accent;
    ctx.fillRect(x + 4, y + 3, 6, h - 6);
    ctx.fillRect(x + w - 10, y + 3, 6, h - 6);

    // EMP static sparks if stunned
    if (stunned) {
      ctx.strokeStyle = '#ff003c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const sx = x + (i / 5) * w;
        const sy = y + (i % 2 === 0 ? -3 : h + 3) + Math.sin(animT * 45 + i * 3) * 3;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // Mini active timer strip right under paddle
    const timers = [];
    if (s.timers.wide > 0) timers.push({ pct: s.timers.wide / DURATION.wide, color: '#00ff9f' });
    if (s.timers.laser > 0) timers.push({ pct: s.timers.laser / DURATION.laser, color: '#ff003c' });
    if (s.timers.pierce > 0) timers.push({ pct: s.timers.pierce / DURATION.pierce, color: '#ff6a00' });
    if (s.timers.stun > 0) timers.push({ pct: s.timers.stun / DURATION.stun, color: '#ff003c' });
    if (timers.length) {
      const segW = (w - 8) / timers.length;
      timers.forEach((tm, i) => {
        const bx = x + 4 + i * segW;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(bx, y + h + 4, segW - 2, 3);
        ctx.fillStyle = tm.color;
        ctx.fillRect(bx, y + h + 4, (segW - 2) * Math.min(1, tm.pct), 3);
      });
    }

    ctx.restore();
  }

  function drawBalls(s) {
    const slow = s.timers.slowmo > 0;
    const pierce = s.timers.pierce > 0;

    ctx.save();
    for (const b of s.balls) {
      // Aim vector when attached
      if (b.attached) {
        const ang = (b.offset / (paddleWidth(s) / 2) || -0.15) * (Math.PI / 3);
        ctx.save();
        ctx.strokeStyle = 'rgba(252, 238, 9, 0.55)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + Math.sin(ang) * 76, b.y - Math.cos(ang) * 76);
        ctx.stroke();
        ctx.restore();
      }

      // Luminous trail
      const trail = b.trail || [];
      const count = trail.length / 2;
      for (let i = 0; i < count; i++) {
        const tx = trail[i * 2];
        const ty = trail[i * 2 + 1];
        const frac = (i + 1) / (count + 1);
        const rad = b.r * (0.3 + frac * 0.72);
        ctx.beginPath();
        ctx.arc(tx, ty, rad, 0, Math.PI * 2);
        if (pierce) {
          ctx.fillStyle = i % 2 === 0
            ? `rgba(255, 88, 0, ${frac * 0.55})`
            : `rgba(255, 0, 60, ${frac * 0.48})`;
        } else if (slow) {
          ctx.fillStyle = `rgba(0, 240, 255, ${frac * 0.62})`;
        } else {
          ctx.fillStyle = `rgba(0, 240, 255, ${frac * 0.38})`;
        }
        ctx.fill();
      }

      // Ball core + aura
      const glowColor = pierce ? '#ff4500' : slow ? '#00f0ff' : '#00f0ff';
      const innerColor = pierce ? '#fff0d1' : slow ? '#d8ffff' : '#ffffff';
      const midColor = pierce ? '#ff003c' : slow ? '#00f0ff' : '#7cf6ff';

      const rg = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 2.2);
      rg.addColorStop(0, innerColor);
      rg.addColorStop(0.45, midColor);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = pierce ? 18 : 12;
      ctx.fillStyle = innerColor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (pierce) {
        ctx.strokeStyle = '#fcee09';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 2.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFx() {
    ctx.save();
    // Shockwave rings
    for (const r of fx.rings) {
      const a = Math.max(0, r.life / r.maxLife);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = a * 0.85;
      ctx.lineWidth = r.width * a;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Shatter particles
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shard) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Floating popups
    for (const pop of fx.popups) {
      const a = Math.min(1, (pop.life / pop.maxLife) * 1.6);
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(13 * pop.scale)}px "Plex Mono", "Plex Sans Hebrew", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(7, 8, 13, 0.8)';
      ctx.fillText(pop.text, pop.x + 1.5, pop.y + 1.5);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawOverlays(s, lang, opts) {
    // Sandevistan edge vignette
    if (s.timers.slowmo > 0) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, W * 0.65);
      vg.addColorStop(0, 'rgba(0, 240, 255, 0)');
      vg.addColorStop(1, 'rgba(0, 240, 255, 0.22)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    if (fx.flash > 0) {
      ctx.save();
      ctx.globalAlpha = fx.flash;
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Launch hint when ball is attached during active gameplay
    if (opts && opts.running && !opts.paused && s.phase === 'play' && s.balls.some((b) => b.attached)) {
      const pulse = 0.55 + 0.45 * Math.sin(animT * 5);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = '600 13px "Plex Mono", "Plex Sans Hebrew", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fcee09';
      ctx.fillText(t(lang, 'launchHint'), W / 2, H - 72);
      ctx.restore();
    }

    // Stage clear on-canvas banner
    if (s.phase === 'clear') {
      ctx.save();
      ctx.fillStyle = 'rgba(7, 8, 13, 0.68)';
      ctx.fillRect(0, H / 2 - 58, W, 116);
      ctx.strokeStyle = '#00ff9f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H / 2 - 58); ctx.lineTo(W, H / 2 - 58);
      ctx.moveTo(0, H / 2 + 58); ctx.lineTo(W, H / 2 + 58);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#00ff9f';
      ctx.font = '700 32px "Plex Mono", "Plex Sans Hebrew", sans-serif';
      ctx.fillText(t(lang, 'stageClear'), W / 2, H / 2 - 14);
      ctx.fillStyle = '#fcee09';
      ctx.font = '600 15px "Plex Mono", "Plex Sans Hebrew", sans-serif';
      const bonus = 1000 + s.level * 250 + s.lives * 200;
      ctx.fillText(t(lang, 'stageBonus', { bonus }), W / 2, H / 2 + 22);
      ctx.restore();
    } else if (fx.stageBanner && opts && opts.running && !opts.paused) {
      const sb = fx.stageBanner;
      const a = Math.min(1, sb.life * 1.4, (sb.maxLife - sb.life + 0.15) * 4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(7, 8, 13, 0.72)';
      ctx.fillRect(W / 2 - 220, H / 2 - 42, 440, 84);
      ctx.strokeStyle = sb.boss ? '#ff003c' : '#fcee09';
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 220, H / 2 - 42, 440, 84);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = sb.boss ? '#ff003c' : '#00f0ff';
      ctx.font = '700 12px "Plex Mono", "Plex Sans Hebrew", sans-serif';
      ctx.fillText(sb.boss ? t(lang, 'bossWarning') : `${t(lang, 'stage')} ${sb.level}`, W / 2, H / 2 - 14);
      ctx.fillStyle = '#f0f2fa';
      ctx.font = '700 22px "Plex Mono", "Plex Sans Hebrew", sans-serif';
      ctx.fillText(stageTitle(lang, sb.name), W / 2, H / 2 + 16);
      ctx.restore();
    }
  }

  function draw(s, lang = 'en', opts = {}) {
    ctx.save();
    ctx.scale(dpr, dpr);

    if (fx.shake > 0.1) {
      const sx = (Math.random() - 0.5) * fx.shake * 1.4;
      const sy = (Math.random() - 0.5) * fx.shake * 1.4;
      ctx.translate(sx, sy);
    }

    drawBackground(s);
    drawMagShield(s);
    for (const br of s.bricks) {
      if (br.alive) drawBrick(br);
    }
    drawBoss(s);
    drawPulses(s);
    drawLasers(s);
    drawCapsules(s);
    drawPaddle(s);
    drawBalls(s);
    drawFx();
    drawOverlays(s, lang, opts);

    ctx.restore();
  }

  resize();
  return { resize, pushEvent, update, draw, clearFx };
}
