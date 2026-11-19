// BLACKWALL DEFENSE — pure deterministic game logic.
// No DOM / window access: everything here runs in Node for unit tests.

export const W = 1600;
export const H = 1000;
export const GROUND = 900;
export const MAX_WAVES = 15;
export const EMP_CD = 28;
export const SANDY_CD = 36;
export const SANDY_DUR = 6;
export const SANDY_SCALE = 0.25;
export const FIRE_COOL = 0.12;
export const BLAST_GROW = 0.3;
export const BLAST_ACTIVE = 0.6;
export const BLAST_DUR = 0.9;
export const SHIELD_REGEN = 9;
export const COMBO_WINDOW = 2.5;
export const MAX_MULT = 8;

export const DISTRICT_DEFS = [
  { id: 'watson', x: 330 },
  { id: 'westbrook', x: 590 },
  { id: 'heywood', x: 1010 },
  { id: 'center', x: 1270 },
];
export const DISTRICT_HALF = 85;
export const BATTERY_DEFS = [
  { id: 'L', x: 110 },
  { id: 'C', x: 800 },
  { id: 'R', x: 1490 },
];
export const BATTERY_HALF = 55;
export const BATTERY_Y = GROUND - 50;

export const CIWS_TURRETS = [
  { x: 460, y: GROUND - 150 },
  { x: 1140, y: GROUND - 150 },
  { x: 800, y: GROUND - 110 },
];

export const ENEMY_DEFS = {
  missile: { speed: 70, r: 7, hp: 1, score: 100, bounty: 8 },
  sub: { speed: 85, r: 6, hp: 1, score: 80, bounty: 6 },
  bomb: { speed: 95, r: 6, hp: 1, score: 60, bounty: 5 },
  mirv: { speed: 60, r: 10, hp: 1, score: 250, bounty: 20 },
  stealth: { speed: 115, r: 7, hp: 1, score: 200, bounty: 18 },
  emp_bomber: { speed: 95, r: 28, hp: 2, score: 500, bounty: 60 },
  meteor: { speed: 45, r: 16, hp: 2, score: 300, bounty: 28 },
  dreadnought: { speed: 55, r: 95, hp: 1, score: 5000, bounty: 400 },
};
export const LIGHT_TYPES = new Set(['missile', 'sub', 'bomb', 'mirv', 'stealth']);

export const UPGRADES = {
  blast: { base: 110, step: 75, max: 5 },
  autoloader: { base: 110, step: 75, max: 5 },
  velocity: { base: 90, step: 70, max: 5 },
  ciws: { base: 220, step: 160, max: 3 },
  shield: { base: 200, step: 140, max: 3 },
  rebuild: { base: 300, step: 125, max: Infinity },
};

export const CHAIN_TIERS = [
  { n: 8, label: 'MEGA BREACH!' },
  { n: 5, label: '5x' },
  { n: 3, label: '3x' },
  { n: 2, label: '2x' },
];
const CHAIN_MILESTONES = new Set([2, 3, 5, 8]);

export function chainLabel(n) {
  for (const t of CHAIN_TIERS) if (n >= t.n) return t.label;
  return null;
}

// ---------- RNG (mulberry32, state lives in s.seed so games are reproducible) ----------
export function rand(s) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- derived stats ----------
export const blastRadius = (s) => 62 * (1 + 0.18 * s.upgrades.blast);
export const interceptorSpeed = (s) => 820 * (1 + 0.22 * s.upgrades.velocity);
export const maxAmmo = (s) => 10 + 3 * s.upgrades.autoloader;
export const reloadTime = (s) => 1.6 * Math.pow(0.82, s.upgrades.autoloader);
export const shieldMax = (s) => s.upgrades.shield;
export const ciwsInterval = (s) => Math.max(1.2, 2.6 - 0.6 * (s.upgrades.ciws - 1));
export const speedScale = (s) => Math.min(2.2, 1 + 0.065 * (s.wave - 1));
export const isBossWave = (n) => n > 0 && n % 5 === 0;

export function upgradeCost(s, key) {
  const u = UPGRADES[key];
  if (!u) return Infinity;
  const lvl = key === 'rebuild' ? s.rebuilds : s.upgrades[key];
  return u.base + u.step * lvl;
}

export const aliveDistricts = (s) => s.districts.filter((d) => d.alive).length;

function emit(s, type, data = {}) {
  s.events.push({ type, t: s.t, ...data });
}

export function drainEvents(s) {
  const ev = s.events;
  s.events = [];
  return ev;
}

// ---------- wave composition ----------
export function waveSpec(n, rnd = Math.random) {
  const list = [];
  const count = 5 + Math.round(n * 2.2);
  const span = 14 + n * 1.1;
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let type = 'missile';
    if (n >= 6 && r < 0.12) type = 'meteor';
    else if (n >= 4 && r < 0.27) type = 'stealth';
    else if (n >= 3 && r < 0.42) type = 'mirv';
    list.push({ at: 1 + (i / count) * span + rnd() * 0.8, type });
  }
  if (n >= 2) {
    const nb = 1 + Math.floor(n / 6);
    for (let j = 0; j < nb; j++) list.push({ at: 4 + (j + 0.5) * (span / nb) * 0.8, type: 'emp_bomber' });
  }
  if (isBossWave(n)) list.push({ at: 2, type: 'dreadnought' });
  return list.sort((a, b) => a.at - b.at);
}

// ---------- setup ----------
export function createGame(opts = {}) {
  const s = {
    seed: (opts.seed ?? 1337) | 0,
    t: 0,
    wave: opts.wave ?? 1,
    phase: 'wave',
    endless: false,
    waveTime: 0,
    score: 0,
    eddies: opts.eddies ?? 0,
    mult: 1,
    comboT: 0,
    districts: DISTRICT_DEFS.map((d, i) => ({ idx: i, id: d.id, x: d.x, alive: true, shield: 0, regen: 0 })),
    batteries: BATTERY_DEFS.map((b, i) => ({ idx: i, id: b.id, x: b.x, alive: true, ammo: 0, maxAmmo: 0, reload: 0, cool: 0 })),
    enemies: [],
    interceptors: [],
    blasts: [],
    queue: [],
    chains: {},
    nextGroup: 1,
    upgrades: { blast: 0, autoloader: 0, velocity: 0, ciws: 0, shield: 0 },
    rebuilds: 0,
    abilities: { emp: { cd: 0 }, sandy: { cd: 0, active: 0 } },
    ciwsT: 1,
    nextId: 1,
    events: [],
    lastBonus: null,
    stats: { kills: 0, shots: 0, maxChain: 0, bossKills: 0, districtsLost: 0, eddiesEarned: 0, empKills: 0, wavesCleared: 0 },
  };
  setupWave(s);
  return s;
}

function setupWave(s) {
  s.queue = waveSpec(s.wave, () => rand(s));
  s.waveTime = 0;
  s.enemies = [];
  s.interceptors = [];
  s.blasts = [];
  s.chains = {};
  s.mult = 1;
  s.comboT = 0;
  s.ciwsT = 1;
  s.abilities.sandy.active = 0;
  const m = maxAmmo(s);
  for (const b of s.batteries) {
    b.alive = true;
    b.maxAmmo = m;
    b.ammo = m;
    b.reload = 0;
    b.cool = 0;
  }
  for (const d of s.districts) {
    d.shield = d.alive ? shieldMax(s) : 0;
    d.regen = 0;
  }
  s.phase = 'wave';
  emit(s, 'waveStart', { wave: s.wave, boss: isBossWave(s.wave) });
}

export function startNextWave(s) {
  if (s.phase !== 'shop') return false;
  s.wave += 1;
  setupWave(s);
  return true;
}

export function continueEndless(s) {
  if (s.phase !== 'victory') return false;
  s.endless = true;
  s.phase = 'shop';
  return true;
}

function gain(s, score, eddies) {
  s.score += score;
  s.eddies += eddies;
  s.stats.eddiesEarned += eddies;
}

// ---------- enemies ----------
function pickTarget(s) {
  const ds = s.districts.filter((d) => d.alive);
  const bs = s.batteries.filter((b) => b.alive);
  const roll = rand(s);
  let pool;
  if (ds.length && (roll < 0.72 || !bs.length)) pool = ds;
  else if (bs.length) pool = bs;
  else pool = s.districts;
  const t = pool[Math.floor(rand(s) * pool.length) % pool.length];
  return { x: t.x + (rand(s) - 0.5) * 50 };
}

export function spawnEnemy(s, type, o = {}) {
  const def = ENEMY_DEFS[type];
  if (!def) throw new Error('unknown enemy ' + type);
  const sc = speedScale(s);
  const e = { id: s.nextId++, type, hp: def.hp, r: def.r, age: 0, slow: 0, dead: false };
  if (type === 'emp_bomber') {
    const left = o.fromLeft ?? rand(s) < 0.5;
    e.x = o.x ?? (left ? -60 : W + 60);
    e.y = o.y ?? 110 + rand(s) * 90;
    e.vx = (left ? 1 : -1) * def.speed * Math.min(1.6, sc);
    e.vy = 0;
    e.dropT = o.dropT ?? 1.2;
    e.hp = 2 + Math.floor(s.wave / 6);
    e.maxHp = e.hp;
  } else if (type === 'dreadnought') {
    e.x = o.x ?? W / 2;
    e.y = o.y ?? -120;
    e.vx = def.speed * (1 + s.wave * 0.02) * (rand(s) < 0.5 ? 1 : -1);
    e.vy = 0;
    e.shieldMax = 6 + Math.floor(s.wave / 5) * 4;
    e.shield = e.shieldMax;
    e.coreMax = 8 + s.wave;
    e.core = e.coreMax;
    e.salvoT = o.salvoT ?? 4;
  } else {
    const tgt = o.target ?? pickTarget(s);
    e.x = o.x ?? 40 + rand(s) * (W - 80);
    e.y = o.y ?? -20;
    e.sx = e.x;
    e.sy = e.y;
    e.tx = tgt.x;
    e.ty = GROUND - 18;
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = o.speed ?? def.speed * sc;
    e.vx = (dx / d) * sp;
    e.vy = (dy / d) * sp;
    if (type === 'mirv') e.splitY = o.splitY ?? 300 + rand(s) * 160;
    if (type === 'stealth') {
      e.bx = e.x;
      e.amp = 30 + rand(s) * 30;
      e.cloaked = false;
    }
  }
  s.enemies.push(e);
  if (type === 'emp_bomber') emit(s, 'bomberEnter', { x: e.x, y: e.y });
  if (type === 'dreadnought') emit(s, 'bossEnter', { x: e.x });
  return e;
}

function impact(s, e) {
  e.dead = true;
  const dmg = e.type === 'meteor' ? 2 : 1;
  const d = s.districts.find((d) => d.alive && Math.abs(d.x - e.x) < DISTRICT_HALF);
  if (d) {
    if (d.shield > 0) {
      d.shield = Math.max(0, d.shield - dmg);
      d.regen = 0;
      emit(s, 'shieldHit', { x: e.x, y: e.y, idx: d.idx, shield: d.shield });
      return;
    }
    d.alive = false;
    d.shield = 0;
    s.stats.districtsLost++;
    emit(s, 'impact', { x: e.x, y: e.y, kind: 'district', etype: e.type });
    emit(s, 'districtLost', { idx: d.idx, id: d.id, x: d.x });
    if (aliveDistricts(s) === 0) {
      s.phase = 'over';
      emit(s, 'gameOver', { wave: s.wave, score: s.score });
    }
    return;
  }
  const b = s.batteries.find((b) => b.alive && Math.abs(b.x - e.x) < BATTERY_HALF);
  if (b) {
    b.alive = false;
    b.ammo = 0;
    emit(s, 'impact', { x: e.x, y: e.y, kind: 'battery', etype: e.type });
    emit(s, 'batteryLost', { idx: b.idx, x: b.x });
    return;
  }
  emit(s, 'impact', { x: e.x, y: e.y, kind: 'ground', etype: e.type });
}

function makeBlast(s, x, y, maxR, group, kind, direct = false) {
  const b = { id: s.nextId++, x, y, r: 0, maxR, t: 0, group, kind, direct, hits: new Set() };
  s.blasts.push(b);
  return b;
}

/** Detonate a player plasma blast at (x,y). Exported for tests / scripted effects. */
export function detonate(s, x, y, opts = {}) {
  const group = s.nextGroup++;
  s.chains[group] = { count: 0 };
  const b = makeBlast(s, x, y, opts.r ?? blastRadius(s), group, 'player', opts.direct ?? true);
  emit(s, 'blast', { x, y, r: b.maxR, kind: 'player' });
  return b;
}

function killEnemy(s, e, blast, cause) {
  if (e.dead) return;
  e.dead = true;
  const def = ENEMY_DEFS[e.type];
  s.mult = Math.min(MAX_MULT, s.mult + 0.25);
  s.comboT = COMBO_WINDOW;
  const pts = Math.round(def.score * s.mult * (cause === 'emp' ? 0.5 : 1));
  const edd = def.bounty;
  gain(s, pts, edd);
  s.stats.kills++;
  let chain = 1;
  if (blast && blast.group != null) {
    const g = (s.chains[blast.group] ||= { count: 0 });
    g.count++;
    chain = g.count;
    if (chain > s.stats.maxChain) s.stats.maxChain = chain;
    if (CHAIN_MILESTONES.has(chain)) {
      const bs = chain * chain * 25;
      const be = chain * 4;
      gain(s, bs, be);
      emit(s, 'chain', { x: e.x, y: e.y, count: chain, label: chainLabel(chain), score: bs, eddies: be });
    }
  }
  emit(s, 'kill', { x: e.x, y: e.y, etype: e.type, score: pts, eddies: edd, chain, cause });
  if (blast) {
    const r = e.type === 'dreadnought' ? 280 : blastRadius(s) * (e.type === 'meteor' || e.type === 'emp_bomber' ? 1 : 0.8);
    makeBlast(s, e.x, e.y, r, blast.group, 'chain');
    emit(s, 'blast', { x: e.x, y: e.y, r, kind: 'chain' });
  }
  if (e.type === 'dreadnought') {
    s.stats.bossKills++;
    emit(s, 'bossDefeated', { x: e.x, y: e.y });
  }
}

function damageEnemy(s, e, blast, dist) {
  if (e.type === 'dreadnought') {
    if (e.shield > 0) {
      e.shield--;
      emit(s, 'bossHit', { x: blast.x, y: blast.y, part: 'shield' });
      if (e.shield === 0) emit(s, 'bossShieldDown', { x: e.x, y: e.y });
    } else {
      e.core--;
      emit(s, 'bossHit', { x: blast.x, y: blast.y, part: 'core' });
      if (e.core <= 0) killEnemy(s, e, blast, 'blast');
    }
    return;
  }
  if (e.type === 'meteor' && blast.direct && dist <= 24) e.hp = 0;
  else e.hp--;
  if (e.hp <= 0) killEnemy(s, e, blast, 'blast');
  else emit(s, 'armorHit', { x: e.x, y: e.y, etype: e.type });
}

// ---------- player actions ----------
export function fire(s, tx, ty, prefer = null) {
  if (s.phase !== 'wave') return null;
  tx = Math.max(10, Math.min(W - 10, tx));
  ty = Math.max(10, Math.min(GROUND - 70, ty));
  const ready = s.batteries.filter((b) => b.alive && b.ammo > 0 && b.cool <= 0);
  if (!ready.length) {
    emit(s, 'dry', { x: tx, y: ty });
    return null;
  }
  let b = prefer != null ? ready.find((r) => r.idx === prefer) : null;
  if (!b) b = ready.slice().sort((a, c) => Math.abs(a.x - tx) - Math.abs(c.x - tx))[0];
  b.ammo--;
  b.cool = FIRE_COOL;
  const it = { id: s.nextId++, x: b.x, y: BATTERY_Y, sx: b.x, sy: BATTERY_Y, tx, ty, speed: interceptorSpeed(s), battery: b.idx };
  s.interceptors.push(it);
  s.stats.shots++;
  emit(s, 'launch', { x: b.x, y: BATTERY_Y, tx, ty, battery: b.idx });
  return it;
}

export function useEMP(s) {
  if (s.phase !== 'wave' || s.abilities.emp.cd > 0) return false;
  s.abilities.emp.cd = EMP_CD;
  let kills = 0;
  for (const e of s.enemies.slice()) {
    if (e.dead) continue;
    if (LIGHT_TYPES.has(e.type)) {
      killEnemy(s, e, null, 'emp');
      kills++;
    } else {
      e.slow = 4;
      if (e.type === 'dreadnought') e.shield = Math.max(0, e.shield - 2);
    }
  }
  s.stats.empKills += kills;
  s.enemies = s.enemies.filter((e) => !e.dead);
  emit(s, 'emp', { kills });
  return true;
}

export function useSandevistan(s) {
  if (s.phase !== 'wave' || s.abilities.sandy.cd > 0) return false;
  s.abilities.sandy.cd = SANDY_CD;
  s.abilities.sandy.active = SANDY_DUR;
  emit(s, 'sandy', {});
  return true;
}

export function buy(s, key, arg = null) {
  if (s.phase !== 'shop') return { ok: false, reason: 'phase' };
  const u = UPGRADES[key];
  if (!u) return { ok: false, reason: 'unknown' };
  if (key !== 'rebuild' && s.upgrades[key] >= u.max) return { ok: false, reason: 'max' };
  let target = null;
  if (key === 'rebuild') {
    target = arg != null ? s.districts[arg] : s.districts.find((d) => !d.alive);
    if (!target || target.alive) return { ok: false, reason: 'none' };
  }
  const cost = upgradeCost(s, key);
  if (s.eddies < cost) return { ok: false, reason: 'funds', cost };
  s.eddies -= cost;
  if (key === 'rebuild') {
    target.alive = true;
    target.shield = shieldMax(s);
    target.regen = 0;
    s.rebuilds++;
  } else {
    s.upgrades[key]++;
    if (key === 'autoloader') {
      for (const b of s.batteries) {
        b.maxAmmo = maxAmmo(s);
        b.ammo = b.maxAmmo;
      }
    }
    if (key === 'shield') for (const d of s.districts) if (d.alive) d.shield = shieldMax(s);
  }
  emit(s, 'purchase', { key, cost });
  return { ok: true, cost };
}

// ---------- simulation ----------
export function step(s, dt) {
  if (s.phase !== 'wave') return s;
  dt = Math.max(0, Math.min(dt, 0.05));
  s.t += dt;
  s.waveTime += dt;

  const ab = s.abilities;
  if (ab.emp.cd > 0) ab.emp.cd = Math.max(0, ab.emp.cd - dt);
  if (ab.sandy.cd > 0) ab.sandy.cd = Math.max(0, ab.sandy.cd - dt);
  if (ab.sandy.active > 0) {
    ab.sandy.active = Math.max(0, ab.sandy.active - dt);
    if (ab.sandy.active === 0) emit(s, 'sandyEnd');
  }
  const sandy = ab.sandy.active > 0;
  const ets = sandy ? SANDY_SCALE : 1;
  const reloadMul = sandy ? 2 : 1;

  // spawns
  while (s.queue.length && s.queue[0].at <= s.waveTime) spawnEnemy(s, s.queue.shift().type);

  // batteries
  const rt = reloadTime(s);
  for (const b of s.batteries) {
    if (!b.alive) continue;
    b.cool = Math.max(0, b.cool - dt);
    if (b.ammo < b.maxAmmo) {
      b.reload += dt * reloadMul;
      while (b.reload >= rt && b.ammo < b.maxAmmo) {
        b.reload -= rt;
        b.ammo++;
      }
    } else b.reload = 0;
  }

  // interceptors
  const flying = [];
  for (const it of s.interceptors) {
    const dx = it.tx - it.x;
    const dy = it.ty - it.y;
    const d = Math.hypot(dx, dy);
    const mv = it.speed * dt;
    if (d <= mv) detonate(s, it.tx, it.ty);
    else {
      it.x += (dx / d) * mv;
      it.y += (dy / d) * mv;
      flying.push(it);
    }
  }
  s.interceptors = flying;

  // blasts: grow, collide
  const nb = s.blasts.length;
  for (let i = 0; i < nb; i++) {
    const b = s.blasts[i];
    b.t += dt;
    if (b.t < BLAST_GROW) b.r = b.maxR * (1 - Math.pow(1 - b.t / BLAST_GROW, 2));
    else if (b.t < BLAST_ACTIVE) b.r = b.maxR;
    else b.r = b.maxR * Math.max(0, 1 - (b.t - BLAST_ACTIVE) / (BLAST_DUR - BLAST_ACTIVE));
    if (b.t >= BLAST_ACTIVE || b.r <= 0) continue;
    for (const e of s.enemies) {
      if (e.dead || b.hits.has(e.id)) continue;
      const reach = b.r + (e.type === 'dreadnought' ? e.r * 0.6 : e.r);
      const dist = Math.hypot(e.x - b.x, e.y - b.y);
      if (dist <= reach) {
        b.hits.add(e.id);
        damageEnemy(s, e, b, dist);
      }
    }
  }
  s.blasts = s.blasts.filter((b) => b.t < BLAST_DUR);

  // enemies
  const ne = s.enemies.length;
  for (let i = 0; i < ne && s.phase === 'wave'; i++) {
    const e = s.enemies[i];
    if (e.dead) continue;
    const f = ets * (e.slow > 0 ? 0.5 : 1);
    if (e.slow > 0) e.slow = Math.max(0, e.slow - dt);
    const edt = dt * f;
    e.age += edt;
    if (e.type === 'emp_bomber') {
      e.x += e.vx * edt;
      e.dropT -= edt;
      if (e.dropT <= 0 && e.x > 140 && e.x < W - 140) {
        e.dropT = Math.max(1.1, 2.6 - s.wave * 0.07);
        spawnEnemy(s, 'bomb', { x: e.x, y: e.y + 18 });
        emit(s, 'bomberDrop', { x: e.x, y: e.y });
      }
      if ((e.vx > 0 && e.x > W + 80) || (e.vx < 0 && e.x < -80)) {
        e.dead = true;
        emit(s, 'bomberEscaped', {});
      }
    } else if (e.type === 'dreadnought') {
      if (e.y < 150) e.y = Math.min(150, e.y + 45 * edt);
      else {
        e.x += e.vx * edt;
        if (e.x > W - 280) {
          e.x = W - 280;
          e.vx = -Math.abs(e.vx);
        } else if (e.x < 280) {
          e.x = 280;
          e.vx = Math.abs(e.vx);
        }
        e.salvoT -= edt;
        if (e.salvoT <= 0) {
          e.salvoT = Math.max(2.2, 4.2 - s.wave * 0.1);
          const k = 3 + Math.floor(s.wave / 5);
          for (let j = 0; j < k; j++) spawnEnemy(s, 'missile', { x: e.x + (j - (k - 1) / 2) * 40, y: e.y + 45 });
          emit(s, 'bossSalvo', { x: e.x, y: e.y, count: k });
        }
      }
    } else {
      if (e.type === 'stealth') {
        e.bx += e.vx * edt;
        e.x = e.bx + Math.sin(e.age * 2.4) * e.amp * Math.min(1, e.age / 2);
        e.cloaked = e.age % 2.2 > 1.3;
      } else e.x += e.vx * edt;
      e.y += e.vy * edt;
      if (e.type === 'mirv' && e.y >= e.splitY) {
        e.dead = true;
        for (let k = 0; k < 3; k++) spawnEnemy(s, 'sub', { x: e.x, y: e.y });
        emit(s, 'mirvSplit', { x: e.x, y: e.y });
        continue;
      }
      if (e.y >= e.ty) impact(s, e);
    }
  }

  // auto-CIWS point defense
  if (s.upgrades.ciws > 0 && s.phase === 'wave') {
    s.ciwsT -= dt * reloadMul;
    if (s.ciwsT <= 0) {
      let tgt = null;
      for (const e of s.enemies) {
        if (e.dead || e.type === 'dreadnought' || e.type === 'emp_bomber' || e.cloaked) continue;
        if (e.y > GROUND - 340 && (!tgt || e.y > tgt.y)) tgt = e;
      }
      if (tgt) {
        const turrets = CIWS_TURRETS.slice(0, s.upgrades.ciws);
        const tur = turrets.slice().sort((a, b) => Math.hypot(a.x - tgt.x, a.y - tgt.y) - Math.hypot(b.x - tgt.x, b.y - tgt.y))[0];
        emit(s, 'zap', { x1: tur.x, y1: tur.y, x2: tgt.x, y2: tgt.y });
        tgt.hp--;
        if (tgt.hp <= 0) killEnemy(s, tgt, null, 'ciws');
        s.ciwsT = ciwsInterval(s);
      } else s.ciwsT = 0.1;
    }
  }

  s.enemies = s.enemies.filter((e) => !e.dead);
  if (s.phase !== 'wave') return s;

  // district holo-shields regenerate
  const sm = shieldMax(s);
  if (sm > 0) {
    for (const d of s.districts) {
      if (!d.alive || d.shield >= sm) continue;
      d.regen += dt;
      if (d.regen >= SHIELD_REGEN) {
        d.regen = 0;
        d.shield++;
        emit(s, 'shieldUp', { idx: d.idx });
      }
    }
  }

  // combo decay
  if (s.comboT > 0) {
    s.comboT -= dt;
    if (s.comboT <= 0) {
      s.comboT = 0;
      s.mult = 1;
    }
  }

  // forget finished chain groups
  const live = new Set(s.blasts.map((b) => b.group));
  for (const g of Object.keys(s.chains)) if (!live.has(Number(g))) delete s.chains[g];

  // wave clear
  if (!s.queue.length && !s.enemies.length) {
    const alive = aliveDistricts(s);
    const ammo = s.batteries.reduce((a, b) => a + (b.alive ? b.ammo : 0), 0);
    const be = alive * 30 + ammo * 2 + s.wave * 10;
    const bs = alive * 250 + ammo * 15;
    gain(s, bs, be);
    s.lastBonus = { wave: s.wave, districts: alive, ammo, eddies: be, score: bs };
    s.stats.wavesCleared++;
    s.interceptors = [];
    s.blasts = [];
    s.chains = {};
    s.mult = 1;
    s.comboT = 0;
    s.abilities.sandy.active = 0;
    emit(s, 'waveClear', { ...s.lastBonus });
    if (!s.endless && s.wave >= MAX_WAVES) {
      s.phase = 'victory';
      emit(s, 'victory', { score: s.score });
    } else s.phase = 'shop';
  }
  return s;
}

/** Simple badge list for the hub. */
export function runBadges(s) {
  const b = [];
  if (s.stats.maxChain >= 8) b.push('mega-breach');
  if (s.stats.bossKills > 0) b.push('dreadnought-slayer');
  if (s.stats.bossKills >= 3) b.push('blackwall-sentinel');
  if (s.phase === 'victory' || s.endless) b.push('night-city-saved');
  if (s.stats.wavesCleared >= 5 && s.stats.districtsLost === 0) b.push('untouched-skyline');
  return b;
}
