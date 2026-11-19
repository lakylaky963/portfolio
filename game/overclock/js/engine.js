// OVERCLOCK // ICE Shatter — pure deterministic game logic.
// Zero DOM / window dependencies: safe to import and test in Node.

export const W = 960;
export const H = 640;
export const COLS = 12;
export const BRICK_W = 72;
export const BRICK_H = 22;
export const BRICK_GAP = 4;
export const GRID_LEFT = (W - (COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2;
export const GRID_TOP = 70;
export const PADDLE_Y = 600;
export const PADDLE_H = 14;
export const PADDLE_BASE_W = 120;
export const BALL_R = 7;
export const MAX_BALLS = 12;
export const START_LIVES = 3;
export const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° from vertical
export const SLOWMO_FACTOR = 0.45;
export const SLOWMO_DURATION = 5;
export const SLOWMO_RECHARGE = 15;
export const CAMPAIGN_STAGES = 10;

export const DURATION = Object.freeze({ wide: 15, laser: 12, pierce: 8, stun: 3 });
export const POWERUPS = Object.freeze(['multi', 'wide', 'laser', 'pierce', 'shield', 'eddy']);
export const POWERUP_LETTER = Object.freeze({ multi: 'M', wide: 'W', laser: 'L', pierce: 'P', shield: 'G', eddy: '€' });

// Brick legend: . empty | 1 neon node | 2/3 armored firewall | X capacitor | # chrome | S sentinel | V data vault
export const BRICK_INFO = Object.freeze({
  '1': { type: 'node', hp: 1, score: 50, eddies: 1 },
  '2': { type: 'armor', hp: 2, score: 120, eddies: 2 },
  '3': { type: 'armor', hp: 3, score: 180, eddies: 3 },
  X: { type: 'explosive', hp: 1, score: 150, eddies: 2 },
  '#': { type: 'chrome', hp: 3, score: 250, eddies: 3 },
  S: { type: 'sentinel', hp: 1, score: 200, eddies: 3 },
  V: { type: 'vault', hp: 1, score: 300, eddies: 25 },
});

// 10 handcrafted stages. Stages 3, 6, 9 are Boss Core stages (top rows kept free for the core).
export const STAGES = Object.freeze([
  { name: 'BOOT SECTOR', rows: [
    '............',
    '.1111111111.',
    '.1111111111.',
    '.11V1111V11.',
    '.1111111111.',
    '............',
  ] },
  { name: 'FIREWALL GRID', rows: [
    '2.2.2..2.2.2',
    '111111111111',
    '1X11222211X1',
    '111111111111',
    '..2.2..2.2..',
    '....1VV1....',
  ] },
  { name: 'CORE: ARASAKA ICE', boss: true, rows: [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '11.111111.11',
    '1X11V11V11X1',
  ] },
  { name: 'CHROME MAZE', rows: [
    '############',
    '1111111111.#',
    '#.2222222222',
    '1111X1111111',
    '#.1111V11111',
    '....S.......',
    '........S...',
  ] },
  { name: 'CAPACITOR FARM', rows: [
    '1X1X1X1X1X1X',
    'X1X1X1X1X1X1',
    '222222222222',
    '1111VV111111',
    '#..........#',
    '...S....S...',
  ] },
  { name: 'CORE: MILITECH SPIRE', boss: true, rows: [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '2222.22.2222',
    '1X1V1##1V1X1',
    '...S....S...',
  ] },
  { name: 'SENTINEL HIGHWAY', rows: [
    '333.3333.333',
    '..S......S..',
    '1111111111X1',
    '.....S......',
    '1X1111V11111',
    '........S...',
    '2.2.2.2.2.2.',
  ] },
  { name: 'VAULT HEIST', rows: [
    '#3#3#3#3#3#3',
    '#VV######VV#',
    '#1111111111#',
    '#1X111111X1#',
    '#2222222222#',
    '............',
    '#..........#',
  ] },
  { name: 'CORE: BLACKWALL GATE', boss: true, rows: [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '333X3333X333',
    '#1V11##11V1#',
    '..S......S..',
  ] },
  { name: 'OVERCLOCK FINALE', rows: [
    '3X3X3X3X3X3X',
    '#VVVVVVVVVV#',
    '222222222222',
    'X1111111111X',
    '..S..S..S...',
    '#2#2#2#2#2#2',
    '.....S......',
  ] },
]);

export const isBossLevel = (level) => level % 3 === 0;
export const stageFor = (level) => STAGES[(Math.max(1, level) - 1) % STAGES.length];

// ---------- RNG (mulberry32, state kept in game object) ----------
export function rand(s) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const emit = (s, ev) => { s.events.push(ev); };

export function ballSpeedFor(level) {
  return Math.min(620, 360 + (level - 1) * 16);
}

// ---------- Bricks ----------
const ROW_COLORS = ['#00f0ff', '#fcee09', '#ff2bd6', '#00f0ff', '#fcee09', '#ff2bd6', '#00f0ff', '#fcee09', '#ff2bd6', '#00f0ff'];

export function buildBricks(rows, level = 1) {
  const bricks = [];
  let id = 0;
  const loop = Math.floor((level - 1) / STAGES.length); // endless: tougher firewalls
  rows.forEach((line, row) => {
    for (let col = 0; col < Math.min(COLS, line.length); col++) {
      const ch = line[col];
      const info = BRICK_INFO[ch];
      if (!info) continue;
      const x = GRID_LEFT + col * (BRICK_W + BRICK_GAP);
      const y = GRID_TOP + row * (BRICK_H + BRICK_GAP);
      const hp = info.type === 'armor' ? Math.min(3, info.hp + loop) : info.hp;
      const b = {
        id: id++, ch, type: info.type, col, row, x, y, w: BRICK_W, h: BRICK_H,
        hp, maxHp: hp, alive: true, color: ROW_COLORS[row % ROW_COLORS.length], hitFlash: 0,
      };
      if (info.type === 'sentinel') {
        b.vx = (col % 2 ? -1 : 1) * (70 + loop * 20);
        b.minX = Math.max(GRID_LEFT, x - (BRICK_W + BRICK_GAP) * 2);
        b.maxX = Math.min(W - GRID_LEFT - BRICK_W, x + (BRICK_W + BRICK_GAP) * 2);
      }
      bricks.push(b);
    }
  });
  return bricks;
}

// ---------- Boss ----------
export const BOSS = Object.freeze({ coreR: 40, shieldR: 74, segments: 8, segHp: 2, segRegen: 7 });

export function createBoss(level) {
  const tier = Math.floor(level / 3); // 1, 2, 3, ...
  const hp = 24 + tier * 12;
  return {
    x: W / 2, y: 140, baseX: W / 2, t: 0, hp, maxHp: hp, alive: true, tier,
    shieldAngle: 0, spin: 0.9 + tier * 0.25,
    segments: Array.from({ length: BOSS.segments }, (_, i) => ({ hp: i % 4 === 3 ? 0 : BOSS.segHp, regen: i % 4 === 3 ? BOSS.segRegen : 0 })),
    fireTimer: 2.5, fireEvery: Math.max(1.3, 3.2 - tier * 0.45), hitFlash: 0,
  };
}

export function shieldSegmentAt(boss, px, py) {
  const a = Math.atan2(py - boss.y, px - boss.x) - boss.shieldAngle;
  const tau = Math.PI * 2;
  const norm = ((a % tau) + tau) % tau;
  return Math.floor(norm / (tau / BOSS.segments)) % BOSS.segments;
}

// ---------- Game state ----------
export function createGame({ seed = 1, level = 1, layout = null, boss = null } = {}) {
  const s = {
    rng: seed >>> 0, level, score: 0, eddies: 0, lives: START_LIVES,
    phase: 'play', combo: 0, bestCombo: 0, time: 0,
    paddle: { x: W / 2, targetX: W / 2, y: PADDLE_Y, h: PADDLE_H },
    balls: [], bricks: [], capsules: [], lasers: [], pulses: [], boss: null,
    timers: { wide: 0, laser: 0, pierce: 0, stun: 0, slowmo: 0, laserCd: 0, laserAuto: 0, clear: 0 },
    slowCharge: 1, shield: false, events: [],
    stats: { bricks: 0, bossKills: 0, powerups: 0, stagesCleared: 0, maxStage: level, shieldSaves: 0 },
    endless: false, won: false,
  };
  loadStage(s, level, layout, boss);
  return s;
}

export function loadStage(s, level, layout = null, boss = null) {
  s.level = level;
  s.stats.maxStage = Math.max(s.stats.maxStage, level);
  const st = stageFor(level);
  s.bricks = buildBricks(layout || st.rows, level);
  const hasBoss = boss === null ? (layout ? false : isBossLevel(level)) : !!boss;
  s.boss = hasBoss ? createBoss(Math.max(3, level)) : null;
  s.capsules = []; s.lasers = []; s.pulses = [];
  s.phase = 'play';
  s.timers.clear = 0;
  s.combo = 0;
  resetServe(s);
  emit(s, { type: 'stage', level, name: layout ? 'CUSTOM' : st.name, boss: hasBoss });
}

export function paddleWidth(s) {
  let w = PADDLE_BASE_W;
  if (s.timers.wide > 0) w *= 1.5;
  if (s.timers.stun > 0) w *= 0.6;
  return w;
}

export function makeBall(s, x, y, vx, vy, attached = false) {
  const mag = Math.hypot(vx, vy);
  const speed = (!attached && mag > 0) ? mag : ballSpeedFor(s.level);
  return { x, y, vx, vy, speed, r: BALL_R, attached, offset: 0, trail: [] };
}

function resetServe(s) {
  const p = s.paddle;
  s.balls = [makeBall(s, p.x, p.y - BALL_R - 1, 0, 0, true)];
}

// Dynamic deflection: offset in [-1, 1] → angle up to ±60° from vertical.
export function paddleBounceVelocity(offset, speed) {
  const o = clamp(offset, -1, 1);
  const a = o * MAX_BOUNCE_ANGLE;
  return { vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed };
}

// ---------- Player actions ----------
export function setPaddleTarget(s, x) {
  const half = paddleWidth(s) / 2;
  s.paddle.targetX = clamp(x, half, W - half);
}

export function launch(s) {
  if (s.phase !== 'play') return false;
  let any = false;
  for (const b of s.balls) {
    if (!b.attached) continue;
    const v = paddleBounceVelocity(b.offset / (paddleWidth(s) / 2) || -0.15, b.speed);
    b.vx = v.vx; b.vy = v.vy; b.attached = false; any = true;
  }
  if (any) emit(s, { type: 'launch' });
  return any;
}

export function fireLasers(s) {
  if (s.phase !== 'play' || s.timers.laser <= 0 || s.timers.laserCd > 0) return false;
  const p = s.paddle;
  const half = paddleWidth(s) / 2;
  s.lasers.push({ x: p.x - half + 8, y: p.y - 4, vy: -760 }, { x: p.x + half - 8, y: p.y - 4, vy: -760 });
  s.timers.laserCd = 0.22;
  emit(s, { type: 'laser', x: p.x, y: p.y });
  return true;
}

export function activateSandevistan(s) {
  if (s.phase !== 'play' || s.timers.slowmo > 0 || s.slowCharge < 1) return false;
  s.timers.slowmo = SLOWMO_DURATION;
  s.slowCharge = 0;
  emit(s, { type: 'slowmo' });
  return true;
}

export function timeScale(s) {
  return s.timers.slowmo > 0 ? SLOWMO_FACTOR : 1;
}

export function comboMultiplier(combo) {
  return Math.min(4, 1 + Math.floor(combo / 5) * 0.5);
}

// ---------- Power-ups ----------
export function applyPowerUp(s, kind) {
  s.stats.powerups++;
  switch (kind) {
    case 'multi': {
      const live = s.balls.slice();
      for (const b of live) {
        if (s.balls.length >= MAX_BALLS) break;
        if (b.attached) { b.attached = false; const v = paddleBounceVelocity(0, b.speed); b.vx = v.vx; b.vy = v.vy; }
        for (const rot of [-0.35, 0.35]) {
          if (s.balls.length >= MAX_BALLS) break;
          const c = Math.cos(rot), sn = Math.sin(rot);
          const nb = makeBall(s, b.x, b.y, b.vx * c - b.vy * sn, b.vx * sn + b.vy * c);
          nb.speed = b.speed;
          fixAngle(nb);
          s.balls.push(nb);
        }
      }
      break;
    }
    case 'wide': s.timers.wide = DURATION.wide; break;
    case 'laser': s.timers.laser = DURATION.laser; s.timers.laserAuto = 0.5; break;
    case 'pierce': s.timers.pierce = DURATION.pierce; break;
    case 'shield': s.shield = true; break;
    case 'eddy': {
      s.eddies += 150;
      s.combo += 5;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += Math.round(500 * comboMultiplier(s.combo));
      break;
    }
    default: return false;
  }
  emit(s, { type: 'powerup', kind });
  return true;
}

function spawnCapsule(s, x, y, kind) {
  s.capsules.push({ x, y, vy: 140, kind, w: 40, h: 16 });
}

function rollDrop(s, brick) {
  const guaranteed = brick.type === 'vault';
  if (!guaranteed && rand(s) > 0.12) return;
  const kind = POWERUPS[Math.floor(rand(s) * POWERUPS.length) % POWERUPS.length];
  spawnCapsule(s, brick.x + brick.w / 2, brick.y + brick.h / 2, kind);
}

// ---------- Damage ----------
// source: 'ball' | 'laser' | 'explosion'. Chrome only yields to lasers & explosions.
export function hitBrick(s, brick, dmg = 1, source = 'ball') {
  if (!brick.alive) return false;
  if (brick.type === 'chrome' && source === 'ball') { brick.hitFlash = 0.15; emit(s, { type: 'chrome', x: brick.x + brick.w / 2, y: brick.y + brick.h / 2 }); return false; }
  brick.hp -= dmg;
  brick.hitFlash = 0.15;
  if (brick.hp > 0) { emit(s, { type: 'crack', x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, hp: brick.hp }); return false; }
  destroyBrick(s, brick);
  return true;
}

function destroyBrick(s, brick) {
  brick.alive = false;
  brick.hp = 0;
  const info = BRICK_INFO[brick.ch];
  s.combo++;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  s.score += Math.round(info.score * comboMultiplier(s.combo));
  s.eddies += info.eddies;
  s.stats.bricks++;
  const cx = brick.x + brick.w / 2, cy = brick.y + brick.h / 2;
  emit(s, { type: 'brick', x: cx, y: cy, color: brick.type === 'chrome' ? '#c8d2e6' : brick.color, kind: brick.type, combo: s.combo });
  if (brick.type === 'vault') emit(s, { type: 'vault', x: cx, y: cy });
  rollDrop(s, brick);
  if (brick.type === 'explosive') explode(s, brick);
}

// 3×3 neon shockwave around a capacitor; chains through other capacitors.
export function explode(s, origin) {
  const cx = origin.x + origin.w / 2, cy = origin.y + origin.h / 2;
  emit(s, { type: 'explode', x: cx, y: cy });
  const rx = (BRICK_W + BRICK_GAP) * 1.5, ry = (BRICK_H + BRICK_GAP) * 1.5;
  for (const b of s.bricks) {
    if (!b.alive || b === origin) continue;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    if (Math.abs(bx - cx) < rx && Math.abs(by - cy) < ry) hitBrick(s, b, 99, 'explosion');
  }
}

function damageBoss(s, dmg) {
  const boss = s.boss;
  if (!boss || !boss.alive) return;
  boss.hp -= dmg;
  boss.hitFlash = 0.2;
  s.score += 40 * dmg;
  emit(s, { type: 'bossHit', x: boss.x, y: boss.y });
  if (boss.hp <= 0) {
    boss.hp = 0; boss.alive = false;
    s.score += 5000 + boss.tier * 1500;
    s.eddies += 150;
    s.stats.bossKills++;
    s.pulses = [];
    emit(s, { type: 'bossDown', x: boss.x, y: boss.y });
  }
}

function damageSegment(s, idx, dmg) {
  const seg = s.boss.segments[idx];
  if (seg.hp <= 0) return;
  seg.hp -= dmg;
  if (seg.hp <= 0) { seg.hp = 0; seg.regen = BOSS.segRegen; s.score += 100; emit(s, { type: 'shieldBreak', x: s.boss.x, y: s.boss.y }); }
  else emit(s, { type: 'shieldHit', x: s.boss.x, y: s.boss.y });
}

// ---------- Physics helpers ----------
function fixAngle(b) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  b.vx = (b.vx / sp) * b.speed;
  b.vy = (b.vy / sp) * b.speed;
  const minVy = b.speed * 0.28;
  if (Math.abs(b.vy) < minVy) {
    b.vy = (b.vy < 0 ? -1 : 1) * minVy;
    b.vx = Math.sign(b.vx || 1) * Math.sqrt(b.speed * b.speed - minVy * minVy);
  }
}

function circleRect(b, rx, ry, rw, rh) {
  const cx = clamp(b.x, rx, rx + rw), cy = clamp(b.y, ry, ry + rh);
  const dx = b.x - cx, dy = b.y - cy;
  return dx * dx + dy * dy <= b.r * b.r ? { dx, dy } : null;
}

function reflectFromRect(b, br, hit) {
  let { dx, dy } = hit;
  if (dx === 0 && dy === 0) {
    // centre inside rect: push out along the shallowest axis
    const ox = Math.min(b.x - br.x, br.x + br.w - b.x), oy = Math.min(b.y - br.y, br.y + br.h - b.y);
    if (ox < oy) dx = b.x < br.x + br.w / 2 ? -1 : 1; else dy = b.y < br.y + br.h / 2 ? -1 : 1;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    b.vx = Math.sign(dx) * Math.abs(b.vx);
    b.x = dx < 0 ? br.x - b.r - 0.01 : br.x + br.w + b.r + 0.01;
  } else {
    b.vy = Math.sign(dy) * Math.abs(b.vy);
    b.y = dy < 0 ? br.y - b.r - 0.01 : br.y + br.h + b.r + 0.01;
  }
}

function reflectRadial(b, cx, cy) {
  const nx = b.x - cx, ny = b.y - cy;
  const d = Math.hypot(nx, ny) || 1;
  const ux = nx / d, uy = ny / d;
  const dot = b.vx * ux + b.vy * uy;
  b.vx -= 2 * dot * ux; b.vy -= 2 * dot * uy;
  fixAngle(b);
}

// Advances one ball by distance-limited substeps. Returns false if the ball fell out.
function moveBall(s, b, dt) {
  const dist = b.speed * dt;
  const steps = Math.max(1, Math.ceil(dist / 4));
  const h = dt / steps;
  const pierce = s.timers.pierce > 0;
  for (let i = 0; i < steps; i++) {
    const px = b.x, py = b.y;
    b.x += b.vx * h; b.y += b.vy * h;
    // walls
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); emit(s, { type: 'wall' }); }
    else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); emit(s, { type: 'wall' }); }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); emit(s, { type: 'wall' }); }
    // paddle
    const p = s.paddle, pw = paddleWidth(s);
    if (b.vy > 0 && circleRect(b, p.x - pw / 2, p.y, pw, p.h)) {
      const v = paddleBounceVelocity((b.x - p.x) / (pw / 2), b.speed);
      b.vx = v.vx; b.vy = v.vy; b.y = p.y - b.r - 0.01;
      s.combo = 0;
      emit(s, { type: 'paddle', x: b.x, y: b.y });
    }
    // bricks
    for (const br of s.bricks) {
      if (!br.alive) continue;
      const hit = circleRect(b, br.x, br.y, br.w, br.h);
      if (!hit) continue;
      hitBrick(s, br, pierce ? 99 : 1, 'ball');
      if (pierce && br.type !== 'chrome') continue; // plasma burns straight through
      reflectFromRect(b, br, hit);
      break;
    }
    // boss
    if (s.boss && s.boss.alive) {
      const bo = s.boss;
      const d0 = Math.hypot(px - bo.x, py - bo.y), d1 = Math.hypot(b.x - bo.x, b.y - bo.y);
      const outer = BOSS.shieldR + b.r, inner = BOSS.shieldR - b.r;
      if ((d0 > outer && d1 <= outer) || (d0 < inner && d1 >= inner)) {
        const idx = shieldSegmentAt(bo, b.x, b.y);
        if (bo.segments[idx].hp > 0) {
          damageSegment(s, idx, 1);
          b.x = px; b.y = py;
          reflectRadial(b, bo.x, bo.y);
        }
      }
      if (Math.hypot(b.x - bo.x, b.y - bo.y) <= BOSS.coreR + b.r) {
        damageBoss(s, pierce ? 2 : 1);
        const d = Math.hypot(b.x - bo.x, b.y - bo.y) || 1;
        b.x = bo.x + ((b.x - bo.x) / d) * (BOSS.coreR + b.r + 0.5);
        b.y = bo.y + ((b.y - bo.y) / d) * (BOSS.coreR + b.r + 0.5);
        reflectRadial(b, bo.x, bo.y);
      }
    }
    // bottom: mag-shield or loss
    if (b.y > H - 10 - b.r && b.vy > 0 && s.shield) {
      s.shield = false; s.stats.shieldSaves++;
      b.vy = -Math.abs(b.vy); b.y = H - 10 - b.r;
      emit(s, { type: 'shieldSave', x: b.x, y: H - 10 });
    }
    if (b.y - b.r > H) return false;
  }
  return true;
}

// ---------- Main step ----------
// input: { dir: -1|0|1 } for keyboard movement (mouse uses setPaddleTarget).
export function step(s, dt, input = {}) {
  dt = Math.min(dt, 0.05);
  if (s.phase === 'over' || s.phase === 'victory') return s;
  s.time += dt;
  const T = s.timers;
  // timers (real time)
  for (const k of ['wide', 'laser', 'pierce', 'stun', 'slowmo', 'laserCd']) T[k] = Math.max(0, T[k] - dt);
  if (T.slowmo <= 0 && s.slowCharge < 1) s.slowCharge = Math.min(1, s.slowCharge + dt / SLOWMO_RECHARGE);
  if (s.phase === 'clear') {
    T.clear -= dt;
    if (T.clear <= 0) nextStage(s);
    return s;
  }

  const sdt = dt * timeScale(s);

  // paddle
  const p = s.paddle;
  if (input.dir) setPaddleTarget(s, p.targetX + input.dir * 900 * dt);
  const half = paddleWidth(s) / 2;
  p.targetX = clamp(p.targetX, half, W - half);
  p.x += (p.targetX - p.x) * Math.min(1, dt * 28);
  p.x = clamp(p.x, half, W - half);

  // auto lasers
  if (T.laser > 0) {
    T.laserAuto -= dt;
    if (T.laserAuto <= 0) { T.laserAuto = 0.55; T.laserCd = 0; fireLasers(s); }
  }

  // sentinels
  for (const br of s.bricks) {
    if (br.hitFlash > 0) br.hitFlash = Math.max(0, br.hitFlash - dt);
    if (br.alive && br.type === 'sentinel') {
      br.x += br.vx * sdt;
      if (br.x < br.minX) { br.x = br.minX; br.vx = Math.abs(br.vx); }
      if (br.x > br.maxX) { br.x = br.maxX; br.vx = -Math.abs(br.vx); }
    }
  }

  // boss
  const bo = s.boss;
  if (bo && bo.alive) {
    bo.t += sdt;
    bo.hitFlash = Math.max(0, bo.hitFlash - dt);
    bo.x = bo.baseX + Math.sin(bo.t * 0.5) * 220;
    bo.shieldAngle = (bo.shieldAngle + bo.spin * sdt) % (Math.PI * 2);
    for (const seg of bo.segments) {
      if (seg.hp <= 0) { seg.regen -= sdt; if (seg.regen <= 0) { seg.hp = BOSS.segHp; seg.regen = 0; } }
    }
    bo.fireTimer -= sdt;
    if (bo.fireTimer <= 0) {
      bo.fireTimer = bo.fireEvery;
      s.pulses.push({ x: bo.x, y: bo.y + BOSS.coreR, vx: clamp((p.x - bo.x) * 0.25, -90, 90), vy: 170, r: 10 });
      emit(s, { type: 'bossFire', x: bo.x, y: bo.y });
    }
  }

  // stun pulses
  for (const pu of s.pulses) {
    pu.x += pu.vx * sdt; pu.y += pu.vy * sdt;
    const pw = paddleWidth(s);
    if (!pu.dead && pu.y + pu.r >= p.y && pu.y - pu.r <= p.y + p.h && Math.abs(pu.x - p.x) <= pw / 2 + pu.r) {
      pu.dead = true; T.stun = DURATION.stun;
      emit(s, { type: 'stun', x: pu.x, y: p.y });
    }
    if (pu.y - pu.r > H) pu.dead = true;
  }
  s.pulses = s.pulses.filter((pu) => !pu.dead);

  // lasers
  for (const l of s.lasers) {
    l.y += l.vy * dt;
    if (l.y < 0) { l.dead = true; continue; }
    for (const br of s.bricks) {
      if (br.alive && l.x >= br.x && l.x <= br.x + br.w && l.y >= br.y && l.y <= br.y + br.h) { hitBrick(s, br, 1, 'laser'); l.dead = true; break; }
    }
    if (!l.dead && bo && bo.alive) {
      const d = Math.hypot(l.x - bo.x, l.y - bo.y);
      if (d <= BOSS.coreR) { damageBoss(s, 1); l.dead = true; }
      else if (d <= BOSS.shieldR + 3 && d >= BOSS.shieldR - 6) {
        const idx = shieldSegmentAt(bo, l.x, l.y);
        if (bo.segments[idx].hp > 0) { damageSegment(s, idx, 1); l.dead = true; }
      }
    }
  }
  s.lasers = s.lasers.filter((l) => !l.dead);

  // capsules
  const pw = paddleWidth(s);
  for (const c of s.capsules) {
    c.y += c.vy * sdt;
    if (c.y + c.h / 2 >= p.y && c.y - c.h / 2 <= p.y + p.h && Math.abs(c.x - p.x) <= pw / 2 + c.w / 2) { c.dead = true; applyPowerUp(s, c.kind); }
    else if (c.y - c.h > H) c.dead = true;
  }
  s.capsules = s.capsules.filter((c) => !c.dead);

  // balls
  const survivors = [];
  for (const b of s.balls) {
    if (b.attached) {
      b.x = clamp(p.x + b.offset, b.r, W - b.r); b.y = p.y - b.r - 1;
      survivors.push(b); continue;
    }
    b.trail.push(b.x, b.y);
    if (b.trail.length > 24) b.trail.splice(0, 2);
    if (moveBall(s, b, sdt)) survivors.push(b);
  }
  s.balls = survivors;
  if (s.balls.length === 0) loseLife(s);

  checkStageClear(s);
  return s;
}

export function loseLife(s) {
  s.lives--;
  s.combo = 0;
  s.timers.wide = s.timers.laser = s.timers.pierce = s.timers.stun = s.timers.slowmo = 0;
  s.capsules = []; s.lasers = []; s.pulses = [];
  emit(s, { type: 'lose', lives: s.lives });
  if (s.lives <= 0) {
    s.lives = 0; s.phase = 'over'; s.balls = [];
    emit(s, { type: 'gameover' });
    return;
  }
  resetServe(s);
}

export function isStageCleared(s) {
  if (s.bricks.length === 0 && !s.boss) return false;
  const bricksDone = s.bricks.every((b) => !b.alive || b.type === 'chrome');
  const bossDone = !s.boss || !s.boss.alive;
  return bricksDone && bossDone;
}

function checkStageClear(s) {
  if (s.phase !== 'play' || !isStageCleared(s)) return;
  const bonus = 1000 + s.level * 250 + s.lives * 200;
  s.score += bonus;
  s.eddies += 20;
  s.stats.stagesCleared++;
  s.phase = 'clear';
  s.timers.clear = 2.2;
  s.capsules = []; s.lasers = []; s.pulses = [];
  emit(s, { type: 'clear', level: s.level, bonus });
}

export function nextStage(s) {
  if (s.level === CAMPAIGN_STAGES && !s.endless) {
    s.won = true;
    s.phase = 'victory';
    emit(s, { type: 'victory' });
    return;
  }
  loadStage(s, s.level + 1);
}

// Continue past the campaign into the endless loop.
export function continueEndless(s) {
  if (s.phase !== 'victory') return false;
  s.endless = true;
  loadStage(s, s.level + 1);
  return true;
}

export function drainEvents(s) {
  const ev = s.events;
  s.events = [];
  return ev;
}

// Hub payout: Eddies earned in-run plus a victory bonus; XP from score and progress.
export function runRewards(s) {
  const eddies = Math.floor(s.eddies + (s.won ? 250 : 0));
  const xp = Math.floor(s.score / 60) + s.stats.maxStage * 20 + s.stats.bossKills * 50 + (s.won ? 200 : 0);
  return { score: s.score, eddies, xp, won: s.won, wave: s.stats.maxStage };
}
