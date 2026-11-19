// ICEBREAKER // Netrunner Survivor — pure deterministic game logic.
// ZERO DOM / window dependencies: runs identically in the browser and in Node tests.

export const ARENA = 1600;               // half-size of the square arena (world units)
export const MAX_ENEMIES = 320;
export const MAX_PICKUPS = 360;
export const CHRONO_DURATION = 4.5;      // seconds of time dilation
export const CHRONO_SLOW = 0.22;         // enemy / enemy-projectile time scale while active
export const CHRONO_BOOST = 1.5;         // player move / fire time scale while active
export const CHRONO_COOLDOWN = 20;       // base cooldown after the effect ends
export const BOSS_INTERVAL = 90;
export const BOSSES_TO_WIN = 3;
export const MAX_ITEM_LEVEL = 5;
export const MAX_WEAPONS = 6;
export const PLAYER_BASE_SPEED = 210;
export const PLAYER_BASE_PICKUP = 90;
export const PLAYER_BASE_HP = 100;

// ---------------------------------------------------------------------------
// Data tables
// ---------------------------------------------------------------------------
export const WEAPONS = {
  smart_pistol: {
    icon: '⌖', color: '#fcee0a',
    levels: [
      { cd: 0.55, dmg: 11, count: 1, speed: 640, range: 650 },
      { cd: 0.48, dmg: 13, count: 1, speed: 660, range: 680 },
      { cd: 0.44, dmg: 15, count: 2, speed: 680, range: 700 },
      { cd: 0.38, dmg: 18, count: 2, speed: 700, range: 720 },
      { cd: 0.30, dmg: 22, count: 3, speed: 740, range: 760 },
    ],
  },
  monowire: {
    icon: '〰', color: '#ff2a6d',
    levels: [
      { cd: 1.30, dmg: 20, range: 125, arc: 2.0, both: false },
      { cd: 1.18, dmg: 26, range: 135, arc: 2.2, both: false },
      { cd: 1.05, dmg: 32, range: 148, arc: 2.4, both: false },
      { cd: 0.95, dmg: 40, range: 160, arc: 2.6, both: false },
      { cd: 0.82, dmg: 50, range: 175, arc: 2.8, both: true },
    ],
  },
  railgun: {
    icon: '═', color: '#00f0ff',
    levels: [
      { cd: 2.40, dmg: 42, width: 14, len: 900 },
      { cd: 2.15, dmg: 55, width: 16, len: 950 },
      { cd: 1.95, dmg: 70, width: 20, len: 1000 },
      { cd: 1.75, dmg: 88, width: 24, len: 1100 },
      { cd: 1.45, dmg: 115, width: 30, len: 1250 },
    ],
  },
  swarm: {
    icon: '✶', color: '#b967ff',
    levels: [
      { cd: 1.90, dmg: 20, count: 1, radius: 55, speed: 330 },
      { cd: 1.55, dmg: 22, count: 2, radius: 60, speed: 340 },
      { cd: 1.45, dmg: 25, count: 2, radius: 70, speed: 350 },
      { cd: 1.30, dmg: 28, count: 3, radius: 78, speed: 360 },
      { cd: 1.10, dmg: 34, count: 4, radius: 90, speed: 380 },
    ],
  },
  orbital: {
    icon: '⚙', color: '#ff3b3b',
    levels: [
      { count: 2, dmg: 9, radius: 78, rot: 3.0, size: 13, hitCd: 0.38 },
      { count: 3, dmg: 11, radius: 84, rot: 3.3, size: 14, hitCd: 0.36 },
      { count: 3, dmg: 14, radius: 92, rot: 3.6, size: 15, hitCd: 0.33 },
      { count: 4, dmg: 17, radius: 100, rot: 3.9, size: 16, hitCd: 0.30 },
      { count: 5, dmg: 22, radius: 112, rot: 4.3, size: 18, hitCd: 0.26 },
    ],
  },
  nova: {
    icon: '◎', color: '#2bff88',
    levels: [
      { cd: 4.6, dmg: 18, radius: 165, slow: 0.5, slowT: 1.4 },
      { cd: 4.2, dmg: 24, radius: 185, slow: 0.45, slowT: 1.6 },
      { cd: 3.8, dmg: 31, radius: 205, slow: 0.4, slowT: 1.8 },
      { cd: 3.4, dmg: 40, radius: 225, slow: 0.35, slowT: 2.0 },
      { cd: 2.9, dmg: 52, radius: 255, slow: 0.3, slowT: 2.4 },
    ],
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

export const PASSIVES = {
  armor:  { icon: '⛨', color: '#2bff88' },  // +20 max HP & heal 30
  reflex: { icon: '»', color: '#00f0ff' },  // +10% move speed
  ram:    { icon: '▤', color: '#fcee0a' },  // +12% fire rate
  magnet: { icon: '⊛', color: '#b967ff' },  // +35% pickup range
  cooler: { icon: '❄', color: '#7df9ff' },  // -12% chronoshift cooldown
};
export const PASSIVE_IDS = Object.keys(PASSIVES);

export const ENEMIES = {
  scout:      { hp: 14,   speed: 138, r: 11, dmg: 6,  xp: 1,   score: 10,   eddy: 0.05 },
  hound:      { hp: 24,   speed: 100, r: 13, dmg: 9,  xp: 2,   score: 20,   eddy: 0.08 },
  shooter:    { hp: 30,   speed: 72,  r: 13, dmg: 7,  xp: 3,   score: 30,   eddy: 0.12, range: 300, fireCd: 2.4 },
  juggernaut: { hp: 150,  speed: 46,  r: 22, dmg: 16, xp: 8,   score: 80,   eddy: 0.3, armor: 0.35 },
  elite:      { hp: 420,  speed: 84,  r: 18, dmg: 18, xp: 20,  score: 300,  eddy: 1 },
  boss:       { hp: 3400, speed: 52,  r: 46, dmg: 26, xp: 120, score: 5000, eddy: 1, armor: 0.1 },
};

export const BADGES = ['titan_slayer', 'icebreaker', 'chrome_maxed', 'arsenal', 'massacre', 'endless', 'untouchable'];

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — state lives in the game object, fully serializable.
// ---------------------------------------------------------------------------
export function rand(s) {
  s.rngState = (s.rngState + 0x6D2B79F5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rrange = (s, a, b) => a + (b - a) * rand(s);

export function xpForLevel(level) {
  return Math.floor(6 + (level - 1) * 4.5 + Math.pow(level, 1.55));
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------
export function createGame(opts = {}) {
  const seed = (opts.seed ?? 1337) >>> 0;
  const s = {
    seed, rngState: seed, opts: { noSpawn: !!opts.noSpawn },
    phase: 'playing', time: 0, frame: 0, endless: false, won: false,
    nextId: 1, wave: 1,
    player: {
      x: 0, y: 0, r: 14, vx: 0, vy: 0, facing: 0,
      hp: PLAYER_BASE_HP, maxHp: PLAYER_BASE_HP, invuln: 0,
      level: 1, xp: 0, xpNext: xpForLevel(1),
      speedMul: 1, fireRate: 1, pickupRange: PLAYER_BASE_PICKUP, cdMul: 1,
      weapons: {}, passives: {},
    },
    chrono: { active: false, t: 0, cd: 0 },
    enemies: [], bullets: [], eshots: [], pickups: [],
    orbAngle: 0,
    spawnT: 1.2, nextEliteAt: 50, nextBossAt: BOSS_INTERVAL,
    bossesSpawned: 0, bossesKilled: 0,
    kills: 0, score: 0, eddies: 0, totalXp: 0, scoreAcc: 0,
    pendingLevels: 0, draft: null,
    stats: { damageTaken: 0, damageDealt: 0 },
    events: [],
    grid: new Map(),
  };
  const start = opts.weapons ?? ['smart_pistol'];
  for (const id of start) s.player.weapons[id] = { level: 1, cd: 0.3, side: 0 };
  return s;
}

function emit(s, ev) { s.events.push(ev); if (s.events.length > 600) s.events.splice(0, 200); }
export function drainEvents(s) { const ev = s.events; s.events = []; return ev; }

// ---------------------------------------------------------------------------
// Spatial hash for enemies
// ---------------------------------------------------------------------------
const CELL = 80;
const key = (cx, cy) => (cx + 2048) * 4096 + (cy + 2048);
function buildGrid(s) {
  const g = s.grid; g.clear();
  for (const e of s.enemies) {
    if (e.dead) continue;
    const k = key(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let b = g.get(k); if (!b) { b = []; g.set(k, b); } b.push(e);
  }
}
function queryEnemies(s, x, y, r, out = []) {
  out.length = 0;
  const x0 = Math.floor((x - r - 50) / CELL), x1 = Math.floor((x + r + 50) / CELL);
  const y0 = Math.floor((y - r - 50) / CELL), y1 = Math.floor((y + r + 50) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const b = s.grid.get(key(cx, cy)); if (!b) continue;
    for (const e of b) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy <= rr * rr) out.push(e);
    }
  }
  return out;
}
const tmpQ = [];

export function nearestEnemies(s, x, y, n = 1, maxRange = Infinity) {
  const best = [];
  const max2 = maxRange * maxRange;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
    if (d2 > max2) continue;
    if (best.length < n) { best.push([d2, e]); best.sort((a, b) => a[0] - b[0]); }
    else if (d2 < best[n - 1][0]) { best[n - 1] = [d2, e]; best.sort((a, b) => a[0] - b[0]); }
  }
  return best.map(b => b[1]);
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------
export function spawnEnemy(s, type, x, y) {
  const d = ENEMIES[type];
  let hpMul;
  if (type === 'boss') hpMul = (1 + 0.65 * s.bossesSpawned) * (s.endless ? 1.5 : 1);
  else hpMul = (1 + s.time / 110) * (s.endless ? 1.6 : 1);
  const hp = Math.round(d.hp * hpMul);
  const e = {
    id: s.nextId++, type, isBoss: type === 'boss', x, y, r: d.r, hp, maxHp: hp, speed: d.speed,
    vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, slowT: 0, slowF: 1, bladeT: 0,
    mode: 'chase', t: 0, cd: d.fireCd ?? rrange(s, 1.5, 3), cd2: 6, spin: 0, dead: false,
  };
  if (type === 'boss') { e.index = s.bossesSpawned; e.cd = 2.5; e.cd2 = 7; }
  s.enemies.push(e);
  return e;
}

function edgePoint(s) {
  const p = s.player;
  const a = rand(s) * Math.PI * 2, dist = rrange(s, 620, 760);
  let x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
  const lim = ARENA - 30;
  if (x < -lim || x > lim) x = p.x - Math.cos(a) * dist;
  if (y < -lim || y > lim) y = p.y - Math.sin(a) * dist;
  return { x: clamp(x, -lim, lim), y: clamp(y, -lim, lim) };
}

function pickType(s) {
  const t = s.time;
  const w = [
    ['scout', Math.max(0.35, 1 - t / 400)],
    ['hound', t > 22 ? 0.45 : 0],
    ['shooter', t > 45 ? 0.38 + t / 900 : 0],
    ['juggernaut', t > 95 ? 0.18 + t / 1500 : 0],
  ];
  const total = w.reduce((a, b) => a + b[1], 0);
  let r = rand(s) * total;
  for (const [id, wt] of w) { if ((r -= wt) <= 0) return id; }
  return 'scout';
}

export function spawnBoss(s) {
  const pt = edgePoint(s);
  const b = spawnEnemy(s, 'boss', pt.x, pt.y);
  s.bossesSpawned++;
  emit(s, { type: 'boss', index: b.index, x: b.x, y: b.y });
  return b;
}

function director(s, dt) {
  const bossAlive = s.enemies.some(e => (e.isBoss || e.type === 'boss') && !e.dead);
  if (s.time >= s.nextBossAt) {
    if (bossAlive && !s.endless) {
      s.nextBossAt = s.time + dt;
    } else {
      spawnBoss(s);
      s.nextBossAt += BOSS_INTERVAL;
    }
  }
  if (s.opts.noSpawn) return;
  if (s.time >= s.nextEliteAt) {
    const pt = edgePoint(s); spawnEnemy(s, 'elite', pt.x, pt.y);
    emit(s, { type: 'elite', x: pt.x, y: pt.y });
    s.nextEliteAt += s.endless ? 35 : 55;
  }
  s.spawnT -= dt;
  while (s.spawnT <= 0) {
    const t = s.time;
    const bossNow = s.enemies.some(e => (e.isBoss || e.type === 'boss') && !e.dead);
    s.spawnT += Math.max(0.13, 0.85 - t * 0.0026) * (bossNow ? 1.6 : 1) * (s.endless ? 0.7 : 1);
    if (s.enemies.length >= MAX_ENEMIES) continue;
    const type = pickType(s);
    const pt = edgePoint(s);
    const n = type === 'hound' ? 3 + (t > 150 ? 2 : 0) : (type === 'juggernaut' ? 1 : 1 + Math.floor(t / 80));
    for (let i = 0; i < n && s.enemies.length < MAX_ENEMIES; i++) {
      spawnEnemy(s, type, clamp(pt.x + rrange(s, -40, 40), -ARENA + 30, ARENA - 30), clamp(pt.y + rrange(s, -40, 40), -ARENA + 30, ARENA - 30));
    }
  }
}

// ---------------------------------------------------------------------------
// Chronoshift (time dilation)
// ---------------------------------------------------------------------------
export function activateChrono(s) {
  const c = s.chrono;
  if (s.phase !== 'playing' || c.active || c.cd > 0) return false;
  c.active = true; c.t = CHRONO_DURATION;
  emit(s, { type: 'chrono_on' });
  return true;
}
function updateChrono(s, dt) {
  const c = s.chrono;
  if (c.active) {
    c.t -= dt;
    if (c.t <= 0) { c.active = false; c.t = 0; c.cd = CHRONO_COOLDOWN * s.player.cdMul; emit(s, { type: 'chrono_off' }); }
  } else if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
}
export const timeScales = s => s.chrono.active ? { player: CHRONO_BOOST, enemy: CHRONO_SLOW } : { player: 1, enemy: 1 };

// ---------------------------------------------------------------------------
// Main step
// ---------------------------------------------------------------------------
export function step(s, dt, input = {}) {
  if (s.phase !== 'playing') return s;
  dt = Math.min(Math.max(dt, 0), 0.05);
  if (input.dilate) activateChrono(s);
  updateChrono(s, dt);
  const sc = timeScales(s);
  s.time += dt; s.frame++;
  s.wave = Math.floor(s.time / 30) + 1;
  s.scoreAcc += dt * 5; if (s.scoreAcc >= 1) { const w = Math.floor(s.scoreAcc); s.score += w; s.scoreAcc -= w; }

  movePlayer(s, dt * sc.player, input);
  buildGrid(s);
  director(s, dt);
  updateWeapons(s, dt * sc.player);
  updateBullets(s, dt * sc.player);
  updateEnemies(s, dt * sc.enemy, dt);
  updateEnemyShots(s, dt * sc.enemy);
  updatePickups(s, dt);
  contactDamage(s);

  if (s.frame % 30 === 0 || s.enemies.length > MAX_ENEMIES) s.enemies = s.enemies.filter(e => !e.dead);
  if (s.phase === 'playing' && s.pendingLevels > 0) openDraft(s);
  return s;
}

function movePlayer(s, dt, input) {
  const p = s.player;
  let mx = +input.mx || 0, my = +input.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const sp = PLAYER_BASE_SPEED * p.speedMul;
  p.vx = mx * sp; p.vy = my * sp;
  p.x = clamp(p.x + p.vx * dt, -ARENA + p.r, ARENA - p.r);
  p.y = clamp(p.y + p.vy * dt, -ARENA + p.r, ARENA - p.r);
  if (len > 0.05) p.facing = Math.atan2(my, mx);
  if (p.invuln > 0) p.invuln -= dt;
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
function updateWeapons(s, dt) {
  const p = s.player;
  for (const id of WEAPON_IDS) {
    const w = p.weapons[id]; if (!w) continue;
    const st = WEAPONS[id].levels[w.level - 1];
    if (id === 'orbital') { updateOrbitals(s, st, dt); continue; }
    w.cd -= dt * p.fireRate;
    if (w.cd <= 0) w.cd = fireWeapon(s, id, w, st) ? st.cd : 0.08;
  }
}

export function fireWeapon(s, id, w, st) {
  const p = s.player;
  switch (id) {
    case 'smart_pistol': {
      const targets = nearestEnemies(s, p.x, p.y, st.count, st.range);
      if (!targets.length) return false;
      for (let i = 0; i < st.count; i++) {
        const tg = targets[i % targets.length];
        const a = Math.atan2(tg.y - p.y, tg.x - p.x) + (i - (st.count - 1) / 2) * 0.35;
        s.bullets.push({ kind: 'bolt', x: p.x, y: p.y, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, r: 5, dmg: st.dmg, life: 1.4, target: tg, speed: st.speed });
      }
      emit(s, { type: 'shoot', weapon: id, x: p.x, y: p.y });
      return true;
    }
    case 'railgun': {
      const [tg] = nearestEnemies(s, p.x, p.y, 1, st.len * 0.85);
      if (!tg) return false;
      const a = Math.atan2(tg.y - p.y, tg.x - p.x);
      const x2 = p.x + Math.cos(a) * st.len, y2 = p.y + Math.sin(a) * st.len;
      let hits = 0;
      for (const e of s.enemies) {
        if (e.dead) continue;
        if (segDist(e.x, e.y, p.x, p.y, x2, y2) <= e.r + st.width / 2) { damageEnemy(s, e, st.dmg, p.x, p.y, 60); hits++; }
      }
      emit(s, { type: 'rail', x1: p.x, y1: p.y, x2, y2, width: st.width, hits });
      return true;
    }
    case 'monowire': {
      const [tg] = nearestEnemies(s, p.x, p.y, 1, st.range * 1.5);
      const base = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.facing;
      if (!tg) return false;
      const dirs = st.both ? [base, base + Math.PI] : [base];
      for (const a of dirs) {
        for (const e of queryEnemies(s, p.x, p.y, st.range, tmpQ)) {
          const da = angDiff(Math.atan2(e.y - p.y, e.x - p.x), a);
          if (da <= st.arc / 2) damageEnemy(s, e, st.dmg, p.x, p.y, 120);
        }
        emit(s, { type: 'whip', x: p.x, y: p.y, angle: a, arc: st.arc, range: st.range, side: w.side });
      }
      w.side ^= 1;
      return true;
    }
    case 'swarm': {
      const [tg] = nearestEnemies(s, p.x, p.y, 1, 700);
      if (!tg) return false;
      const a0 = Math.atan2(tg.y - p.y, tg.x - p.x);
      for (let i = 0; i < st.count; i++) {
        const a = a0 + (i - (st.count - 1) / 2) * 0.7 + rrange(s, -0.2, 0.2);
        s.bullets.push({ kind: 'orb', x: p.x, y: p.y, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, r: 7, dmg: st.dmg, life: 3, target: tg, speed: st.speed, radius: st.radius });
      }
      emit(s, { type: 'shoot', weapon: id, x: p.x, y: p.y });
      return true;
    }
    case 'nova': {
      const hit = queryEnemies(s, p.x, p.y, st.radius, tmpQ).slice();
      if (!hit.length) return false;
      for (const e of hit) {
        e.slowT = st.slowT; e.slowF = st.slow;
        damageEnemy(s, e, st.dmg, p.x, p.y, 160);
      }
      emit(s, { type: 'nova', x: p.x, y: p.y, radius: st.radius });
      return true;
    }
  }
  return false;
}

function updateOrbitals(s, st, dt) {
  const p = s.player;
  s.orbAngle = (s.orbAngle + st.rot * dt) % (Math.PI * 2);
  for (let i = 0; i < st.count; i++) {
    const a = s.orbAngle + (i * Math.PI * 2) / st.count;
    const bx = p.x + Math.cos(a) * st.radius, by = p.y + Math.sin(a) * st.radius;
    for (const e of queryEnemies(s, bx, by, st.size, tmpQ)) {
      if (e.bladeT > 0) continue;
      e.bladeT = st.hitCd;
      damageEnemy(s, e, st.dmg, p.x, p.y, 90);
      emit(s, { type: 'blade', x: bx, y: by });
    }
  }
}
export function orbitalPositions(s) {
  const w = s.player.weapons.orbital; if (!w) return [];
  const st = WEAPONS.orbital.levels[w.level - 1], out = [];
  for (let i = 0; i < st.count; i++) {
    const a = s.orbAngle + (i * Math.PI * 2) / st.count;
    out.push({ x: s.player.x + Math.cos(a) * st.radius, y: s.player.y + Math.sin(a) * st.radius, size: st.size, a });
  }
  return out;
}

function updateBullets(s, dt) {
  const keep = [];
  for (const b of s.bullets) {
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.target && b.target.dead) {
      b.target = b.kind === 'orb' ? nearestEnemies(s, b.x, b.y, 1, 500)[0] || null : null;
    }
    if (b.target) {
      const turn = (b.kind === 'bolt' ? 9 : 5) * dt;
      const cur = Math.atan2(b.vy, b.vx);
      const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
      let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      const na = cur + clamp(d, -turn, turn);
      b.vx = Math.cos(na) * b.speed; b.vy = Math.sin(na) * b.speed;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    const hits = queryEnemies(s, b.x, b.y, b.r, tmpQ);
    if (hits.length) {
      if (b.kind === 'orb') {
        for (const e of queryEnemies(s, b.x, b.y, b.radius, tmpQ).slice()) damageEnemy(s, e, b.dmg, b.x, b.y, 80);
        emit(s, { type: 'boom', x: b.x, y: b.y, radius: b.radius });
      } else {
        damageEnemy(s, hits[0], b.dmg, b.x, b.y, 40);
      }
      continue;
    }
    if (Math.abs(b.x) > ARENA + 200 || Math.abs(b.y) > ARENA + 200) continue;
    keep.push(b);
  }
  s.bullets = keep;
}

export function damageEnemy(s, e, base, sx, sy, kb = 0) {
  if (e.dead) return 0;
  const crit = rand(s) < 0.1;
  const armor = ENEMIES[e.type].armor || 0;
  const dmg = Math.max(1, Math.round(base * (crit ? 2 : 1) * (1 - armor)));
  e.hp -= dmg; e.flash = 0.12;
  if (kb && e.type !== 'boss') {
    const dx = e.x - sx, dy = e.y - sy, d = Math.hypot(dx, dy) || 1;
    const k = kb * (e.type === 'juggernaut' ? 0.3 : e.type === 'elite' ? 0.5 : 1);
    e.kx += (dx / d) * k; e.ky += (dy / d) * k;
  }
  s.stats.damageDealt += dmg;
  emit(s, { type: 'hit', x: e.x, y: e.y - e.r, amount: dmg, crit, enemy: e.type });
  if (e.hp <= 0) killEnemy(s, e);
  return dmg;
}

function dropPickup(s, kind, x, y, value) {
  if (s.pickups.length >= MAX_PICKUPS && kind === 'xp') {
    // merge into an existing shard rather than growing unbounded
    const tgt = s.pickups[Math.floor(rand(s) * s.pickups.length)];
    if (tgt.kind === 'xp') { tgt.value += value; return; }
  }
  s.pickups.push({ kind, x, y, value, mag: false, sp: 0, id: s.nextId++ });
}

function killEnemy(s, e) {
  e.dead = true; e.hp = 0;
  const d = ENEMIES[e.type];
  s.kills++; s.score += d.score;
  emit(s, { type: 'kill', x: e.x, y: e.y, enemy: e.type, r: e.r });
  if (e.type === 'boss') {
    for (let i = 0; i < 10; i++) dropPickup(s, 'xp', e.x + rrange(s, -70, 70), e.y + rrange(s, -70, 70), Math.round(d.xp / 10));
    for (let i = 0; i < 8; i++) dropPickup(s, 'eddy', e.x + rrange(s, -60, 60), e.y + rrange(s, -60, 60), 10);
    dropPickup(s, 'chest', e.x, e.y, 1);
    s.bossesKilled++;
    emit(s, { type: 'boss_down', x: e.x, y: e.y, index: e.index });
    if (!s.endless && s.bossesKilled >= BOSSES_TO_WIN) {
      s.won = true; s.phase = 'victory';
      emit(s, { type: 'victory' });
    }
    return;
  }
  dropPickup(s, 'xp', e.x, e.y, d.xp);
  if (e.type === 'elite') {
    dropPickup(s, 'chest', e.x, e.y, 1);
    for (let i = 0; i < 4; i++) dropPickup(s, 'eddy', e.x + rrange(s, -30, 30), e.y + rrange(s, -30, 30), 5);
  } else if (rand(s) < d.eddy) {
    dropPickup(s, 'eddy', e.x + rrange(s, -8, 8), e.y + rrange(s, -8, 8), 1 + Math.floor(rand(s) * 3));
  }
  if (e.type === 'juggernaut' && rand(s) < 0.12) dropPickup(s, 'heal', e.x, e.y, 20);
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
function updateEnemies(s, edt, rdt) {
  const p = s.player;
  for (const e of s.enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= rdt;
    if (e.bladeT > 0) e.bladeT = Math.max(0, (e.bladeT || 0) - rdt);
    if (e.slowT > 0) { e.slowT -= edt; if (e.slowT <= 0) e.slowF = 1; }
    const m = edt * (e.slowT > 0 ? e.slowF : 1);
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    let vx = ux * e.speed, vy = uy * e.speed;
    e.t += m;
    switch (e.type) {
      case 'hound':
        if (e.mode === 'chase') {
          e.cd -= m;
          if (dist < 250 && e.cd <= 0) { e.mode = 'windup'; e.t = 0; e.dirX = ux; e.dirY = uy; }
        } else if (e.mode === 'windup') {
          vx = -ux * 20; vy = -uy * 20;
          if (e.t >= 0.45) { e.mode = 'charge'; e.t = 0; e.dirX = ux; e.dirY = uy; }
        } else {
          vx = e.dirX * 430; vy = e.dirY * 430;
          if (e.t >= 0.55) { e.mode = 'chase'; e.cd = 2.6; }
        }
        break;
      case 'shooter': {
        const R = ENEMIES.shooter.range;
        const strafe = (e.id % 2 ? 1 : -1) * 0.6;
        if (dist > R) { vx = ux * e.speed; vy = uy * e.speed; }
        else if (dist < R * 0.65) { vx = -ux * e.speed; vy = -uy * e.speed; }
        else { vx = -uy * e.speed * strafe; vy = ux * e.speed * strafe; }
        e.cd -= m;
        if (e.cd <= 0 && dist < R * 1.4) {
          e.cd = ENEMIES.shooter.fireCd;
          s.eshots.push({ x: e.x, y: e.y, vx: ux * 230, vy: uy * 230, r: 6, dmg: 8, life: 5 });
          emit(s, { type: 'eshot', x: e.x, y: e.y });
        }
        break;
      }
      case 'elite':
        if (e.mode === 'dash') {
          vx = e.dirX * 540; vy = e.dirY * 540;
          if (e.t >= 0.35) { e.mode = 'chase'; e.cd = 2.8; }
        } else {
          e.cd -= m;
          if (e.cd <= 0 && dist < 520) { e.mode = 'dash'; e.t = 0; e.dirX = ux; e.dirY = uy; emit(s, { type: 'dash', x: e.x, y: e.y }); }
        }
        break;
      case 'boss': {
        const enraged = e.hp < e.maxHp * 0.5;
        e.spin += m * 0.8;
        e.cd -= m; e.cd2 -= m;
        if (e.cd <= 0) {
          e.cd = enraged ? 2.0 : 3.1;
          const n = 16 + e.index * 4 + (enraged ? 6 : 0);
          for (let i = 0; i < n; i++) {
            const a = e.spin + (i / n) * Math.PI * 2;
            s.eshots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, r: 7, dmg: 10, life: 7, boss: true });
          }
          emit(s, { type: 'burst', x: e.x, y: e.y });
        }
        if (e.cd2 <= 0) {
          e.cd2 = 9;
          const n = 5 + e.index * 2;
          for (let i = 0; i < n && s.enemies.length < MAX_ENEMIES; i++) {
            const a = (i / n) * Math.PI * 2;
            spawnEnemy(s, i % 2 ? 'hound' : 'scout', clamp(e.x + Math.cos(a) * 90, -ARENA + 30, ARENA - 30), clamp(e.y + Math.sin(a) * 90, -ARENA + 30, ARENA - 30));
          }
          emit(s, { type: 'summon', x: e.x, y: e.y });
        }
        break;
      }
    }
    e.vx = vx; e.vy = vy;
    e.x += (vx + e.kx) * m; e.y += (vy + e.ky) * m;
    const decay = Math.max(0, 1 - 9 * m);
    e.kx *= decay; e.ky *= decay;
    // soft separation
    if (e.type !== 'boss') {
      for (const o of queryEnemies(s, e.x, e.y, e.r, tmpQ)) {
        if (o === e) continue;
        const ox = e.x - o.x, oy = e.y - o.y, d = Math.hypot(ox, oy) || 0.01, ov = e.r + o.r - d;
        if (ov > 0) { const push = Math.min(ov, 4) * 0.5; e.x += (ox / d) * push; e.y += (oy / d) * push; }
      }
    }
    e.x = clamp(e.x, -ARENA + e.r, ARENA - e.r); e.y = clamp(e.y, -ARENA + e.r, ARENA - e.r);
  }
}

function updateEnemyShots(s, dt) {
  const p = s.player, keep = [];
  for (const b of s.eshots) {
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.life <= 0 || Math.abs(b.x) > ARENA || Math.abs(b.y) > ARENA) continue;
    const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r * 0.8;
    if (dx * dx + dy * dy <= rr * rr) { hurtPlayer(s, b.dmg); if (s.phase !== 'playing') return; continue; }
    keep.push(b);
  }
  s.eshots = keep;
}

function contactDamage(s) {
  if (s.phase !== 'playing') return;
  const p = s.player;
  if (p.invuln > 0) return;
  for (const e of queryEnemies(s, p.x, p.y, p.r, tmpQ)) {
    hurtPlayer(s, ENEMIES[e.type].dmg);
    break;
  }
}

export function hurtPlayer(s, dmg) {
  const p = s.player;
  if (p.invuln > 0 || s.phase !== 'playing') return false;
  p.hp -= dmg; p.invuln = 0.5;
  s.stats.damageTaken += dmg;
  emit(s, { type: 'hurt', amount: dmg, x: p.x, y: p.y });
  if (p.hp <= 0) {
    p.hp = 0; s.phase = 'dead';
    emit(s, { type: 'defeat', x: p.x, y: p.y });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pickups & XP
// ---------------------------------------------------------------------------
function updatePickups(s, dt) {
  const p = s.player, keep = [];
  for (const k of s.pickups) {
    const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 0.001;
    if (!k.mag && d < p.pickupRange) k.mag = true;
    if (k.mag) {
      k.sp += 1100 * dt;
      const mv = Math.min(d, (180 + k.sp) * dt);
      k.x += (dx / d) * mv; k.y += (dy / d) * mv;
    }
    const d2 = Math.hypot(p.x - k.x, p.y - k.y);
    if (d2 <= p.r + 10) { collect(s, k); continue; }
    keep.push(k);
  }
  s.pickups = keep;
}

function collect(s, k) {
  const p = s.player;
  switch (k.kind) {
    case 'xp': gainXp(s, k.value); emit(s, { type: 'xp', value: k.value, x: k.x, y: k.y }); break;
    case 'eddy': s.eddies += k.value; emit(s, { type: 'eddy', value: k.value, x: k.x, y: k.y }); break;
    case 'heal': p.hp = Math.min(p.maxHp, p.hp + k.value); emit(s, { type: 'heal', value: k.value, x: k.x, y: k.y }); break;
    case 'chest':
      s.eddies += 25; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2); s.pendingLevels++;
      emit(s, { type: 'chest', x: k.x, y: k.y });
      break;
  }
}

export function gainXp(s, v) {
  const p = s.player;
  p.xp += v; s.totalXp += v;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.level++; p.xpNext = xpForLevel(p.level); s.pendingLevels++;
    emit(s, { type: 'levelup', level: p.level });
  }
}

// ---------------------------------------------------------------------------
// Upgrade draft
// ---------------------------------------------------------------------------
export function generateDraft(s, n = 3) {
  const p = s.player, pool = [];
  const owned = Object.keys(p.weapons).length;
  for (const id of WEAPON_IDS) {
    const w = p.weapons[id];
    if (w) { if (w.level < MAX_ITEM_LEVEL) pool.push({ kind: 'weapon', id, level: w.level + 1, isNew: false, rarity: w.level + 1 === MAX_ITEM_LEVEL ? 'legendary' : 'rare', weight: 1.25 }); }
    else if (owned < MAX_WEAPONS) pool.push({ kind: 'weapon', id, level: 1, isNew: true, rarity: 'epic', weight: owned < 3 ? 1.3 : 0.9 });
  }
  for (const id of PASSIVE_IDS) {
    const lv = p.passives[id] || 0;
    if (lv < MAX_ITEM_LEVEL) pool.push({ kind: 'passive', id, level: lv + 1, isNew: lv === 0, rarity: lv + 1 === MAX_ITEM_LEVEL ? 'epic' : 'uncommon', weight: 0.85 });
  }
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, o) => a + o.weight, 0);
    let r = rand(s) * total, idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { if ((r -= pool[i].weight) <= 0) { idx = i; break; } }
    const [o] = pool.splice(idx, 1);
    delete o.weight; out.push(o);
  }
  const fill = [{ kind: 'heal', id: 'heal', level: 0, rarity: 'common' }, { kind: 'cash', id: 'cash', level: 0, rarity: 'common' }];
  while (out.length < n && fill.length) out.push(fill.shift());
  return out;
}

function openDraft(s) { s.phase = 'levelup'; s.draft = generateDraft(s); emit(s, { type: 'draft' }); }

export function applyUpgrade(s, o) {
  const p = s.player;
  if (o.kind === 'weapon') {
    if (!p.weapons[o.id]) p.weapons[o.id] = { level: 1, cd: 0.15, side: 0 };
    else p.weapons[o.id].level = Math.min(MAX_ITEM_LEVEL, p.weapons[o.id].level + 1);
  } else if (o.kind === 'passive') {
    const lv = Math.min(MAX_ITEM_LEVEL, (p.passives[o.id] || 0) + 1);
    p.passives[o.id] = lv;
    if (o.id === 'armor') { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 30); }
    recomputeStats(s);
  } else if (o.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + 40);
  else if (o.kind === 'cash') s.eddies += 25;
}

export function recomputeStats(s) {
  const p = s.player, pv = p.passives;
  p.speedMul = 1 + 0.1 * (pv.reflex || 0);
  p.fireRate = 1 + 0.12 * (pv.ram || 0);
  p.pickupRange = PLAYER_BASE_PICKUP * (1 + 0.35 * (pv.magnet || 0));
  p.cdMul = 1 - 0.12 * (pv.cooler || 0);
}

export function chooseUpgrade(s, i) {
  if (s.phase !== 'levelup' || !s.draft || !s.draft[i]) return false;
  const o = s.draft[i];
  applyUpgrade(s, o);
  s.pendingLevels = Math.max(0, s.pendingLevels - 1);
  emit(s, { type: 'upgrade', kind: o.kind, id: o.id, level: o.level });
  if (s.pendingLevels > 0) s.draft = generateDraft(s);
  else { s.draft = null; s.phase = 'playing'; }
  return true;
}

// ---------------------------------------------------------------------------
// Run end / endless
// ---------------------------------------------------------------------------
export function continueEndless(s) {
  if (s.phase !== 'victory') return false;
  s.endless = true; s.phase = 'playing';
  emit(s, { type: 'endless' });
  if (s.pendingLevels > 0) openDraft(s);
  return true;
}

export const activeBoss = s => s.enemies.find(e => e.type === 'boss' && !e.dead) || null;

export function runSummary(s) {
  const p = s.player;
  const lvls = Object.values(p.weapons).map(w => w.level);
  const badges = [];
  if (s.bossesKilled >= 1) badges.push('titan_slayer');
  if (s.won) badges.push('icebreaker');
  if (lvls.some(l => l >= MAX_ITEM_LEVEL)) badges.push('chrome_maxed');
  if (lvls.length >= 4) badges.push('arsenal');
  if (s.kills >= 500) badges.push('massacre');
  if (s.endless && s.time >= 360) badges.push('endless');
  if (s.won && s.stats.damageTaken < 100) badges.push('untouchable');
  const xp = Math.round(p.level * 25 + s.bossesKilled * 100 + s.kills * 0.5 + (s.won ? 250 : 0));
  return {
    score: s.score, eddies: s.eddies, xp, won: s.won, wave: s.wave, badges,
    kills: s.kills, time: s.time, level: p.level, bossesKilled: s.bossesKilled, endless: s.endless,
  };
}

// Compact deterministic fingerprint (used by determinism tests / debugging)
export function fingerprint(s) {
  const r = v => Math.round(v * 1000) / 1000;
  return JSON.stringify({
    t: r(s.time), ph: s.phase, rng: s.rngState, k: s.kills, sc: s.score, ed: s.eddies,
    p: [r(s.player.x), r(s.player.y), r(s.player.hp), s.player.level, r(s.player.xp)],
    e: s.enemies.filter(e => !e.dead).map(e => [e.id, e.type, r(e.x), r(e.y), r(e.hp)]),
    b: s.bullets.length, es: s.eshots.length, pk: s.pickups.length,
  });
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function angDiff(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }
export function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
