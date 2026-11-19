// Homelab Defender: pure simulation engine. No DOM, no Canvas, no timers, no randomness.
// All distances are in grid cells. The renderer/audio layers read `state` and drain `state.events`.
import { COLS, ROWS, pathCells } from './maps.js';

export const CAMPAIGN_WAVES = 20;
export const SELL_RATIO = 0.7;
export const TARGETING = ['first', 'last', 'strong', 'weak', 'close'];
export const TOWER_KEYS = ['firewall', 'beam', 'mortar', 'tesla', 'cryo'];

// Index 0..3 = base + 3 upgrade tiers.
export const TOWERS = {
  firewall: { cost: 50,  range: [2.6, 2.9, 3.2, 3.6], dmg: [8, 14, 24, 42],     rate: [1.6, 1.9, 2.4, 3.0] },
  beam:     { cost: 120, range: [2.8, 3.2, 3.6, 4.0], dps: [28, 54, 96, 165] }, // armour-piercing
  mortar:   { cost: 150, range: [3.2, 3.5, 3.8, 4.2], dmg: [34, 60, 100, 170],  rate: [0.6, 0.7, 0.8, 0.9], radius: [1.0, 1.1, 1.25, 1.4] },
  tesla:    { cost: 175, range: [2.4, 2.6, 2.9, 3.2], dmg: [16, 26, 42, 68],    rate: [1.0, 1.2, 1.4, 1.7], chain: [3, 4, 5, 7], chainRange: 1.8 },
  cryo:     { cost: 100, range: [2.2, 2.5, 2.8, 3.2], dmg: [2, 5, 9, 16],       rate: [0.8, 0.9, 1.0, 1.1], slow: [0.65, 0.5, 0.4, 0.3], slowTime: [1.2, 1.4, 1.6, 1.8] },
};
const UPGRADE_MULT = [0.7, 1.1, 1.8];

export const ENEMIES = {
  bot:        { hp: 30,   speed: 1.0,  armor: 0, shield: 0,   bounty: 4,   lives: 1, score: 10 },
  sprinter:   { hp: 18,   speed: 1.9,  armor: 0, shield: 0,   bounty: 4,   lives: 1, score: 12 },
  trojan:     { hp: 100,  speed: 0.8,  armor: 4, shield: 0,   bounty: 9,   lives: 2, score: 25 },
  phantom:    { hp: 40,   speed: 1.0,  armor: 0, shield: 70,  bounty: 8,   lives: 1, score: 25 },
  worm:       { hp: 75,   speed: 1.0,  armor: 0, shield: 0,   bounty: 6,   lives: 1, score: 20, splits: 2 },
  ransomware: { hp: 900,  speed: 0.55, armor: 6, shield: 300, bounty: 160, lives: 5, score: 500, boss: true },
};
const MINI = { hpFrac: 0.35, speedMul: 1.4, bountyFrac: 0.3 };
const BOSS_MUL = [1, 2.2, 4.0, 7.0];

export const ACHIEVEMENTS = [
  'first-blood', 'boss-slayer', 'worm-hunter', 'chain-reaction', 'max-level', 'tycoon',
  'quick-draw', 'both-abilities', 'flawless-wave', 'victory', 'flawless', 'endless-30',
];

const T = (type, n, gap, delay = 0) => ({ type, n, gap, delay });
export const WAVES = [
  [T('bot', 8, 1.0)],
  [T('bot', 12, 0.8)],
  [T('bot', 8, 0.9), T('sprinter', 6, 0.6, 9)],
  [T('sprinter', 14, 0.55), T('bot', 8, 0.8, 10)],
  [T('ransomware', 1, 1, 2), T('bot', 10, 0.9, 4)],                                   // 5 boss
  [T('trojan', 6, 1.4), T('bot', 10, 0.7, 6)],
  [T('worm', 7, 1.3)],
  [T('phantom', 8, 1.1), T('sprinter', 10, 0.5, 6)],
  [T('trojan', 8, 1.2), T('worm', 6, 1.2, 8)],
  [T('ransomware', 1, 1, 2), T('trojan', 6, 1.2, 5), T('phantom', 6, 1.0, 12)],       // 10 boss
  [T('sprinter', 20, 0.4), T('phantom', 8, 0.9, 6)],
  [T('worm', 12, 0.9), T('trojan', 6, 1.2, 8)],
  [T('phantom', 14, 0.8), T('bot', 20, 0.4, 6)],
  [T('trojan', 14, 0.9), T('sprinter', 16, 0.4, 8)],
  [T('ransomware', 1, 1, 2), T('worm', 10, 1, 4), T('phantom', 10, 0.8, 10)],         // 15 boss
  [T('worm', 16, 0.7), T('trojan', 10, 0.9, 6)],
  [T('sprinter', 30, 0.3), T('phantom', 14, 0.7, 8)],
  [T('trojan', 18, 0.7), T('worm', 14, 0.7, 6)],
  [T('phantom', 20, 0.6), T('trojan', 14, 0.7, 6), T('sprinter', 20, 0.3, 12)],
  [T('ransomware', 2, 6, 2), T('worm', 16, 0.6, 4), T('trojan', 12, 0.8, 10), T('phantom', 14, 0.6, 18)], // 20 boss
];

/** Groups for wave `w` (1-based). Waves past 20 are generated deterministically (endless). */
export function waveDef(w) {
  if (w >= 1 && w <= WAVES.length) return WAVES[w - 1];
  const k = w - CAMPAIGN_WAVES;
  const n = 14 + k * 2;
  const g = [
    T('trojan', Math.ceil(n * 0.6), 0.6),
    T('worm', Math.ceil(n * 0.6), 0.5, 4),
    T('phantom', Math.ceil(n * 0.7), 0.5, 8),
    T('sprinter', n * 2, 0.25, 12),
  ];
  if (w % 5 === 0) g.push(T('ransomware', 1 + Math.floor(k / 10), 5, 2));
  return g;
}

export const isBossWave = (w) => waveDef(w).some((g) => ENEMIES[g.type].boss);
const hpScale = (w) => (1 + 0.2 * (w - 1) + 0.03 * (w - 1) * (w - 1)) * (w > 20 ? Math.pow(1.12, w - 20) : 1);
const bossMul = (w) => { const i = Math.floor(w / 5) - 1; return i < BOSS_MUL.length ? BOSS_MUL[i] : BOSS_MUL[3] * Math.pow(1.5, i - 3); };

// ---------------------------------------------------------------- state

export function createGame({ map, mode = 'campaign' }) {
  const pts = map.path.map(([c, r]) => [c + 0.5, r + 0.5]);
  const segLens = [];
  let pathLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
    segLens.push(l); pathLen += l;
  }
  return {
    map, mode, endless: mode === 'endless',
    cols: COLS, rows: ROWS, pts, segLens, pathLen, blocked: pathCells(map),
    towers: [], enemies: [], spawnQ: [], events: [],
    time: 0, wave: 0, waveTimer: 20, clearedWave: 0,
    lives: map.lives, maxLives: map.lives, cash: map.cash, score: 0,
    status: 'running', nextId: 1, hpMul: map.hpMul,
    abilities: {
      emp: { cd: 0, max: 45 },
      overclock: { cd: 0, max: 60, active: 0, dur: 8 },
    },
    stats: { kills: 0, leaks: 0, waveLeaks: 0, wormKills: 0, bossKills: 0, bestChain: 0, peakCash: map.cash, used: { emp: false, overclock: false } },
    achievements: [],
  };
}

const emit = (s, e) => { s.events.push(e); };
function award(s, id) {
  if (s.achievements.includes(id)) return;
  s.achievements.push(id);
  emit(s, { type: 'achievement', id });
}

export function positionAt(s, dist) {
  let d = Math.max(0, dist);
  for (let i = 0; i < s.segLens.length; i++) {
    if (d <= s.segLens[i] || i === s.segLens.length - 1) {
      const t = s.segLens[i] ? Math.min(1, d / s.segLens[i]) : 0;
      const [x0, y0] = s.pts[i], [x1, y1] = s.pts[i + 1];
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
    }
    d -= s.segLens[i];
  }
  return { x: s.pts[0][0], y: s.pts[0][1] };
}

// ---------------------------------------------------------------- towers

export function towerStats(type, level) {
  const d = TOWERS[type], o = { type, level, range: d.range[level] };
  for (const k of ['dmg', 'rate', 'dps', 'radius', 'chain', 'slow', 'slowTime']) if (d[k]) o[k] = d[k][level];
  if (d.chainRange) o.chainRange = d.chainRange;
  return o;
}

export function towerAt(s, c, r) { return s.towers.find((t) => t.c === c && t.r === r) || null; }

export function canPlace(s, type, c, r) {
  if (!TOWERS[type]) return { ok: false, reason: 'unknown' };
  if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= s.cols || r >= s.rows) return { ok: false, reason: 'bounds' };
  if (s.blocked.has(c + ',' + r)) return { ok: false, reason: 'path' };
  if (towerAt(s, c, r)) return { ok: false, reason: 'occupied' };
  if (s.cash < TOWERS[type].cost) return { ok: false, reason: 'cash' };
  return { ok: true };
}

export function placeTower(s, type, c, r) {
  if (s.status !== 'running') return { ok: false, reason: 'over' };
  const chk = canPlace(s, type, c, r);
  if (!chk.ok) return chk;
  const t = { id: s.nextId++, type, c, r, x: c + 0.5, y: r + 0.5, level: 0, cd: 0, angle: -Math.PI / 2, targeting: 'first', spent: TOWERS[type].cost, target: null };
  s.cash -= TOWERS[type].cost;
  s.towers.push(t);
  emit(s, { type: 'place', id: t.id, x: t.x, y: t.y });
  return { ok: true, tower: t };
}

export function upgradeCost(t) {
  if (t.level >= 3) return null;
  return Math.round((TOWERS[t.type].cost * UPGRADE_MULT[t.level]) / 5) * 5;
}

export function upgradeTower(s, id) {
  const t = s.towers.find((x) => x.id === id);
  if (!t || s.status !== 'running') return { ok: false, reason: 'missing' };
  const cost = upgradeCost(t);
  if (cost === null) return { ok: false, reason: 'max' };
  if (s.cash < cost) return { ok: false, reason: 'cash' };
  s.cash -= cost; t.spent += cost; t.level++;
  emit(s, { type: 'upgrade', id: t.id, x: t.x, y: t.y, level: t.level });
  if (t.level === 3) award(s, 'max-level');
  return { ok: true };
}

export const sellValue = (t) => Math.floor(t.spent * SELL_RATIO);

export function sellTower(s, id) {
  const i = s.towers.findIndex((x) => x.id === id);
  if (i < 0 || s.status !== 'running') return { ok: false, reason: 'missing' };
  const t = s.towers[i], v = sellValue(t);
  s.towers.splice(i, 1);
  s.cash += v;
  emit(s, { type: 'sell', x: t.x, y: t.y, value: v });
  return { ok: true, value: v };
}

export function setTargeting(s, id, mode) {
  const t = s.towers.find((x) => x.id === id);
  if (!t || !TARGETING.includes(mode)) return false;
  t.targeting = mode; return true;
}
export function cycleTargeting(s, id) {
  const t = s.towers.find((x) => x.id === id);
  if (!t) return null;
  t.targeting = TARGETING[(TARGETING.indexOf(t.targeting) + 1) % TARGETING.length];
  return t.targeting;
}

// ---------------------------------------------------------------- waves & abilities

export function timeToNextWave(s) { return s.waveTimer; }
export function allWavesSent(s) { return !s.endless && s.wave >= CAMPAIGN_WAVES; }

/** Send the next wave now. Sending while the countdown is still running pays an early-send bonus. */
export function sendWave(s) {
  if (s.status !== 'running' || allWavesSent(s)) return { ok: false };
  const early = Number.isFinite(s.waveTimer) ? s.waveTimer : 0;
  const bonus = s.wave > 0 ? Math.floor(early * 1.5) : Math.floor(early * 0.5);
  startWave(s);
  if (bonus > 0) {
    s.cash += bonus; s.score += bonus;
    emit(s, { type: 'bonus', value: bonus });
    if (bonus >= 20) award(s, 'quick-draw');
  }
  return { ok: true, bonus };
}

function startWave(s) {
  s.wave++;
  s.stats.waveLeaks = 0;
  const w = s.wave;
  for (const g of waveDef(w)) {
    for (let i = 0; i < g.n; i++) s.spawnQ.push({ at: s.time + g.delay + i * g.gap, type: g.type, wave: w });
  }
  s.spawnQ.sort((a, b) => a.at - b.at);
  s.waveTimer = allWavesSent(s) ? Infinity : (isBossWave(w + 1) ? 26 : 20);
  emit(s, { type: 'wave', wave: w, boss: isBossWave(w) });
}

export function useAbility(s, name) {
  const a = s.abilities[name];
  if (!a || s.status !== 'running' || a.cd > 0) return { ok: false };
  a.cd = a.max;
  s.stats.used[name] = true;
  if (s.stats.used.emp && s.stats.used.overclock) award(s, 'both-abilities');
  if (name === 'emp') {
    const dmg = 25 + Math.max(0, (s.wave || 1) - 1) * 4;
    for (const e of s.enemies.slice()) {
      if (e.dead) continue;
      e.stun = ENEMIES[e.type].boss ? 1.5 : 3;
      hurt(s, e, dmg, { pierce: true });
    }
    emit(s, { type: 'emp' });
  } else {
    a.active = a.dur;
    emit(s, { type: 'overclock' });
  }
  return { ok: true };
}

export function continueEndless(s) {
  if (s.status !== 'won') return false;
  s.endless = true; s.status = 'running'; s.waveTimer = 15;
  return true;
}

// ---------------------------------------------------------------- enemies

function spawnEnemy(s, type, wave, opts = {}) {
  const def = ENEMIES[type];
  let scale = def.boss ? bossMul(wave) : hpScale(wave);
  scale *= s.hpMul;
  let hp = def.hp * scale, shield = def.shield * scale, speed = def.speed, bounty = def.bounty * (1 + 0.015 * wave);
  if (opts.mini) { hp *= MINI.hpFrac; speed *= MINI.speedMul; bounty *= MINI.bountyFrac; shield = 0; }
  const e = {
    id: s.nextId++, type, wave, mini: !!opts.mini, boss: !!def.boss,
    hp: Math.round(hp), maxHp: Math.round(hp), shield: Math.round(shield), maxShield: Math.round(shield),
    armor: def.armor, speed, slowT: 0, slowF: 1, stun: 0, dist: opts.dist || 0,
    bounty: Math.max(1, Math.round(bounty)), lives: def.lives, dead: false, x: 0, y: 0, hitT: 0,
  };
  const p = positionAt(s, e.dist); e.x = p.x; e.y = p.y;
  s.enemies.push(e);
  return e;
}

/** Apply damage. Shield soaks first; armour reduces hp damage (never below 20%) unless `pierce`. */
function hurt(s, e, dmg, opts = {}) {
  if (e.dead || dmg <= 0) return 0;
  let d = dmg, dealt = 0;
  if (e.shield > 0) { const a = Math.min(e.shield, d); e.shield -= a; d -= a; dealt += a; }
  if (d > 0) {
    if (!opts.pierce && e.armor > 0) d = Math.max(d * 0.2, d - e.armor);
    e.hp -= d; dealt += d;
  }
  e.hitT = 0.08;
  if (!opts.quiet) emit(s, { type: 'hit', x: e.x, y: e.y, dmg: Math.round(dealt) });
  if (e.hp <= 0) kill(s, e);
  return dealt;
}

function kill(s, e) {
  if (e.dead) return;
  e.dead = true;
  const def = ENEMIES[e.type];
  s.cash += e.bounty; s.score += Math.round(def.score * (e.mini ? 0.3 : 1));
  s.stats.kills++;
  if (s.cash > s.stats.peakCash) s.stats.peakCash = s.cash;
  if (s.cash >= 1500) award(s, 'tycoon');
  emit(s, { type: 'kill', x: e.x, y: e.y, bounty: e.bounty, boss: e.boss, enemy: e.type });
  award(s, 'first-blood');
  if (e.type === 'worm') {
    s.stats.wormKills++;
    if (s.stats.wormKills >= 30) award(s, 'worm-hunter');
  }
  if (e.boss) { s.stats.bossKills++; award(s, 'boss-slayer'); }
  if (def.splits && !e.mini) {
    for (let i = 0; i < def.splits; i++) {
      spawnEnemy(s, 'worm', e.wave, { mini: true, dist: Math.max(0, e.dist + (i ? -0.2 : 0.2)) });
    }
    emit(s, { type: 'split', x: e.x, y: e.y });
  }
}

// ---------------------------------------------------------------- targeting & firing

function pickTarget(s, t, st) {
  let best = null, bv = 0;
  const r2 = st.range * st.range;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    let v;
    switch (t.targeting) {
      case 'last': v = -e.dist; break;
      case 'strong': v = e.hp + e.shield; break;
      case 'weak': v = -(e.hp + e.shield); break;
      case 'close': v = -d2; break;
      default: v = e.dist; // first
    }
    if (best === null || v > bv) { best = e; bv = v; }
  }
  return best;
}

function inRange(s, t, range) {
  const r2 = range * range;
  return s.enemies.filter((e) => !e.dead && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r2);
}

function fireTower(s, t, dt, oc) {
  const st = towerStats(t.type, t.level);
  const rateMul = oc ? 1.5 : 1;
  if (t.type === 'beam') {
    const tg = pickTarget(s, t, st);
    t.target = tg ? tg.id : null;
    if (!tg) return;
    t.angle = Math.atan2(tg.y - t.y, tg.x - t.x);
    hurt(s, tg, st.dps * dt * rateMul, { pierce: true, quiet: true });
    s.events.push({ type: 'beam', id: t.id, x: t.x, y: t.y, tx: tg.x, ty: tg.y, level: t.level });
    return;
  }
  t.cd -= dt * rateMul;
  if (t.cd > 0) return;
  const tg = t.type === 'cryo' ? null : pickTarget(s, t, st);
  if (t.type !== 'cryo' && !tg) { t.cd = 0; return; }
  if (t.type === 'firewall') {
    t.angle = Math.atan2(tg.y - t.y, tg.x - t.x);
    emit(s, { type: 'shot', id: t.id, x: t.x, y: t.y, tx: tg.x, ty: tg.y, tower: 'firewall' });
    hurt(s, tg, st.dmg);
  } else if (t.type === 'mortar') {
    t.angle = Math.atan2(tg.y - t.y, tg.x - t.x);
    const cx = tg.x, cy = tg.y, r2 = st.radius * st.radius;
    const victims = s.enemies.filter((e) => !e.dead && (e.x - cx) ** 2 + (e.y - cy) ** 2 <= r2);
    emit(s, { type: 'splash', id: t.id, x: t.x, y: t.y, tx: cx, ty: cy, r: st.radius });
    for (const v of victims) hurt(s, v, st.dmg);
  } else if (t.type === 'tesla') {
    t.angle = Math.atan2(tg.y - t.y, tg.x - t.x);
    const hit = new Set([tg.id]), pts = [[t.x, t.y], [tg.x, tg.y]];
    const chain = [tg];
    let last = tg;
    while (chain.length < st.chain) {
      let nx = null, nd = st.chainRange * st.chainRange;
      for (const e of s.enemies) {
        if (e.dead || hit.has(e.id)) continue;
        const d2 = (e.x - last.x) ** 2 + (e.y - last.y) ** 2;
        if (d2 <= nd) { nx = e; nd = d2; }
      }
      if (!nx) break;
      hit.add(nx.id); chain.push(nx); pts.push([nx.x, nx.y]); last = nx;
    }
    emit(s, { type: 'arc', id: t.id, pts });
    chain.forEach((e, i) => hurt(s, e, st.dmg * Math.pow(0.85, i)));
    if (chain.length > s.stats.bestChain) s.stats.bestChain = chain.length;
    if (chain.length >= 5) award(s, 'chain-reaction');
  } else if (t.type === 'cryo') {
    const list = inRange(s, t, st.range);
    if (!list.length) { t.cd = 0; return; }
    emit(s, { type: 'pulse', id: t.id, x: t.x, y: t.y, r: st.range });
    for (const e of list) {
      e.slowT = st.slowTime; e.slowF = Math.min(e.slowF || 1, st.slow);
      hurt(s, e, st.dmg, { quiet: true });
    }
  }
  t.cd += 1 / st.rate;
  if (t.cd < 0) t.cd = 0;
}

// ---------------------------------------------------------------- main step

export function update(s, dt) {
  if (s.status !== 'running' || !(dt > 0)) return;
  s.time += dt;

  const ab = s.abilities;
  if (ab.emp.cd > 0) ab.emp.cd = Math.max(0, ab.emp.cd - dt);
  if (ab.overclock.cd > 0) ab.overclock.cd = Math.max(0, ab.overclock.cd - dt);
  if (ab.overclock.active > 0) ab.overclock.active = Math.max(0, ab.overclock.active - dt);
  const oc = ab.overclock.active > 0;

  // wave countdown
  if (!allWavesSent(s)) {
    s.waveTimer -= dt;
    if (s.waveTimer <= 0) startWave(s);
  }

  // spawns
  while (s.spawnQ.length && s.spawnQ[0].at <= s.time) {
    const q = s.spawnQ.shift();
    spawnEnemy(s, q.type, q.wave);
  }

  // movement
  for (const e of s.enemies) {
    if (e.dead) continue;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.stun > 0) e.stun -= dt;
    else {
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
      e.dist += e.speed * e.slowF * dt;
    }
    if (e.dist >= s.pathLen) {
      e.dead = true;
      s.lives = Math.max(0, s.lives - e.lives);
      s.stats.leaks++; s.stats.waveLeaks++;
      emit(s, { type: 'leak', x: e.x, y: e.y, lives: e.lives, boss: e.boss });
      continue;
    }
    const p = positionAt(s, e.dist); e.x = p.x; e.y = p.y;
  }

  // towers (iterate over a snapshot: worms may append enemies during firing)
  for (const t of s.towers) fireTower(s, t, dt, oc);

  s.enemies = s.enemies.filter((e) => !e.dead);

  if (s.lives <= 0) {
    s.status = 'lost';
    emit(s, { type: 'defeat' });
    return;
  }

  // wave clear
  if (s.wave > 0 && s.wave > s.clearedWave && !s.enemies.length && !s.spawnQ.length) {
    s.clearedWave = s.wave;
    const bonus = 25 + 3 * s.wave;
    s.cash += bonus; s.score += bonus;
    emit(s, { type: 'clear', wave: s.wave, bonus });
    if (s.wave >= 10 && s.stats.waveLeaks === 0) award(s, 'flawless-wave');
    if (s.wave >= 30 && s.endless) award(s, 'endless-30');
    if (s.cash > s.stats.peakCash) s.stats.peakCash = s.cash;
    if (s.cash >= 1500) award(s, 'tycoon');
    if (!s.endless && s.wave >= CAMPAIGN_WAVES) {
      s.score += s.lives * 50;
      s.status = 'won';
      award(s, 'victory');
      if (s.lives === s.maxLives) award(s, 'flawless');
      emit(s, { type: 'victory' });
    }
  }
}
