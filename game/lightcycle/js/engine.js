// LIGHTCYCLE // Netrunner Trace — pure deterministic game logic.
// No DOM / window access: runs identically in the browser and in Node tests.

export const W = 60;
export const H = 36;
export const MAX_ROUNDS = 10;
export const OBST = -1;

export const DIRS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
});
export const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });
const TURN_L = { up: 'left', left: 'down', down: 'right', right: 'up' };
const TURN_R = { up: 'right', right: 'down', down: 'left', left: 'up' };

export const TUNING = Object.freeze({
  queueMax: 3,
  cloakCost: 50,
  cloakMs: 1800,
  boostCost: 3.5,
  boostMin: 4,
  boostRegen: 0.35,
  cloakRegen: 0.22,
  shardCloak: 35,
  shardBoost: 40,
  shardScore: 50,
  multStep: 0.25,
  multMax: 4,
  derezPoints: 300,
  comboWindow: 60,
  comboMax: 5,
  empFraction: 0.4,
  empStun: 15,
  shardEvery: 40,
  shardFirst: 20,
  shardMaxActive: 2,
  empChance: 0.2,
  roundBonus: 200,
  floodLimit: 90,
});

export const HUNTER_KINDS = Object.freeze(['arasaka', 'militech', 'blackwall']);
export const KIND_COLORS = Object.freeze({
  player: '#00f0ff', arasaka: '#ff2bd6', militech: '#ffaa00', blackwall: '#ff003c',
});

export const ARENAS = Object.freeze([
  Object.freeze({ id: 'watson', wrap: false, color: '#00f0ff', obstacles: [] }),
  Object.freeze({
    id: 'kabuki', wrap: false, color: '#ff2bd6',
    // [x, y, w, h] neon cyber-blocks forming choke points
    obstacles: [
      [14, 8, 4, 4], [14, 24, 4, 4], [42, 8, 4, 4], [42, 24, 4, 4],
      [28, 15, 4, 6], [8, 3, 3, 3], [8, 30, 3, 3], [48, 3, 3, 3], [48, 30, 3, 3],
      [21, 16, 2, 4], [37, 16, 2, 4],
    ],
  }),
  Object.freeze({ id: 'blackwall', wrap: true, color: '#ff003c', obstacles: [] }),
]);
export const getArena = (id) => ARENAS.find((a) => a.id === id) || ARENAS[0];

export const PLAYER_SPAWN = Object.freeze({ x: 5, y: 18, dir: 'right' });
export const HUNTER_SPAWNS = Object.freeze([
  { x: 54, y: 18, dir: 'left' }, { x: 54, y: 6, dir: 'left' }, { x: 54, y: 29, dir: 'left' },
  { x: 30, y: 3, dir: 'down' }, { x: 30, y: 32, dir: 'up' },
]);

export function huntersForRound(r) {
  if (r > MAX_ROUNDS) return 5;
  return [1, 1, 2, 2, 3, 3, 4, 4, 5, 5][Math.max(1, r) - 1];
}
export function tickMsForRound(r) { return Math.max(42, 110 - (Math.max(1, r) - 1) * 6); }
export function cloakTicksFor(tickMs) { return Math.ceil(TUNING.cloakMs / tickMs); }

// ---- RNG (mulberry32, state kept in game state for determinism) ----
function rand(s) {
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const idx = (x, y) => y * W + x;

export function nextCell(s, x, y, dir) {
  const d = DIRS[dir];
  let nx = x + d.x, ny = y + d.y;
  if (s.wrap) {
    nx = (nx + W) % W; ny = (ny + H) % H;
    return { x: nx, y: ny, out: false };
  }
  return { x: nx, y: ny, out: nx < 0 || ny < 0 || nx >= W || ny >= H };
}

function makeCycle(id, kind, x, y, dir) {
  return {
    id, kind, color: KIND_COLORS[kind], x, y, px: x, py: y, dir, queue: [], alive: true,
    trail: [], ghost: [], boost: 100, cloak: 100, cloakTicks: 0, boosting: false, stun: 0,
  };
}

export function createGame(opts = {}) {
  const arena = getArena(opts.arena);
  const s = {
    W, H, arenaId: arena.id, wrap: arena.wrap,
    occ: new Int16Array(W * H), stamp: new Int32Array(W * H),
    _vis: new Int32Array(W * H), _gen: 0,
    seed: (opts.seed ?? 1) | 0,
    autoShards: opts.shards !== false,
    hunterOverride: Number.isInteger(opts.hunterCount) ? opts.hunterCount : null,
    cycles: [], player: null, hunters: [],
    tick: 0, round: Math.max(1, opts.round || 1), lives: opts.lives ?? 3,
    score: 0, mult: 1, combo: 0, lastKillTick: -1e9, kills: 0, bestCombo: 0,
    shards: [], shardTimer: 0, shardsCollected: 0, empCount: 0,
    phase: 'playing', events: [], won: false, endless: false, roundsCleared: 0, tickMs: 110,
  };
  setupRound(s);
  return s;
}

export function setupRound(s) {
  s.occ.fill(0); s.stamp.fill(0);
  const arena = getArena(s.arenaId);
  for (const [ox, oy, ow, oh] of arena.obstacles) {
    for (let y = oy; y < oy + oh; y++) for (let x = ox; x < ox + ow; x++) s.occ[idx(x, y)] = OBST;
  }
  s.tickMs = tickMsForRound(s.round);
  s.tick = 0;
  s.combo = 0; s.lastKillTick = -1e9;
  s.shards = []; s.shardTimer = TUNING.shardEvery - TUNING.shardFirst;
  s.endless = s.round > MAX_ROUNDS;
  const prev = s.player;
  const p = makeCycle(1, 'player', PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.dir);
  if (prev) { p.cloak = Math.max(prev.cloak, 60); p.boost = 100; }
  const n = s.hunterOverride ?? huntersForRound(s.round);
  const hunters = [];
  for (let i = 0; i < n; i++) {
    const sp = HUNTER_SPAWNS[i % HUNTER_SPAWNS.length];
    hunters.push(makeCycle(i + 2, HUNTER_KINDS[i % HUNTER_KINDS.length], sp.x, sp.y, sp.dir));
  }
  s.player = p; s.hunters = hunters; s.cycles = [p, ...hunters];
  for (const c of s.cycles) occupy(s, c, idx(c.x, c.y));
  s.phase = 'playing';
  return s;
}

function occupy(s, c, i) {
  if (s.occ[i] === 0) { s.occ[i] = c.id; s.stamp[i] = s.tick; }
  c.trail.push(i);
}

/** Test/setup helper: teleport a cycle, wiping its trail. */
export function resetCycle(s, c, x, y, dir) {
  for (const i of c.trail) if (s.occ[i] === c.id) s.occ[i] = 0;
  c.trail = []; c.ghost = []; c.queue = [];
  c.x = c.px = x; c.y = c.py = y; c.dir = dir; c.alive = true;
  occupy(s, c, idx(x, y));
  return c;
}
/** Test/setup helper: paint a solid cell for owner id (or OBST). */
export function paint(s, x, y, id) {
  const i = idx(x, y);
  s.occ[i] = id; s.stamp[i] = s.tick;
  const c = s.cycles.find((k) => k.id === id);
  if (c) c.trail.push(i);
}

// ---- Input ----
export function queueTurn(s, dir) {
  const p = s.player;
  if (!DIRS[dir] || !p || !p.alive) return false;
  const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
  if (dir === last || dir === OPPOSITE[last]) return false;
  if (p.queue.length >= TUNING.queueMax) return false;
  p.queue.push(dir);
  return true;
}
export function setBoost(s, on) { if (s.player) s.player.boosting = !!on; }
export function activateCloak(s) {
  const p = s.player;
  if (s.phase !== 'playing' || !p || !p.alive || p.cloakTicks > 0 || p.cloak < TUNING.cloakCost) return false;
  p.cloak -= TUNING.cloakCost;
  p.cloakTicks = cloakTicksFor(s.tickMs);
  p.ghost = [];
  s.events.push({ type: 'cloak', x: p.x, y: p.y });
  return true;
}

// ---- Space analysis (AI) ----
export function isBlocked(s, x, y, out = false) {
  return out || s.occ[idx(x, y)] !== 0;
}
export function floodCount(s, x, y, limit = TUNING.floodLimit) {
  if (s.occ[idx(x, y)] !== 0) return 0;
  const gen = ++s._gen;
  const vis = s._vis;
  const q = [idx(x, y)];
  vis[q[0]] = gen;
  let head = 0;
  while (head < q.length && q.length < limit) {
    const i = q[head++];
    const cx = i % W, cy = (i / W) | 0;
    for (const d of ['up', 'down', 'left', 'right']) {
      const n = nextCell(s, cx, cy, d);
      if (n.out) continue;
      const j = idx(n.x, n.y);
      if (vis[j] === gen || s.occ[j] !== 0) continue;
      vis[j] = gen;
      q.push(j);
      if (q.length >= limit) break;
    }
  }
  return Math.min(q.length, limit);
}
function runLength(s, x, y, dir, max) {
  let n = 0, cx = x, cy = y;
  while (n < max) {
    const c = nextCell(s, cx, cy, dir);
    if (c.out || s.occ[idx(c.x, c.y)] !== 0) break;
    n++; cx = c.x; cy = c.y;
  }
  return n;
}
function axisDist(a, b, size, wrap) {
  const d = Math.abs(a - b);
  return wrap ? Math.min(d, size - d) : d;
}
export function hunterTarget(s, h) {
  const p = s.player;
  const d = DIRS[p.dir];
  let tx = p.x, ty = p.y;
  if (h.kind === 'arasaka') { tx += d.x * 7; ty += d.y * 7; }            // interceptor: cut ahead
  else if (h.kind === 'militech') {                                       // flanker: box from the side
    const side = (h.id % 2) ? TURN_L[p.dir] : TURN_R[p.dir];
    const sd = DIRS[side];
    tx += d.x * 4 + sd.x * 5; ty += d.y * 4 + sd.y * 5;
  } else { tx += d.x * 2; ty += d.y * 2; }                                 // stalker: tail-chase
  if (s.wrap) { tx = (tx + W * 4) % W; ty = (ty + H * 4) % H; }
  else { tx = Math.max(0, Math.min(W - 1, tx)); ty = Math.max(0, Math.min(H - 1, ty)); }
  return { x: tx, y: ty };
}
export function chooseHunterDir(s, h) {
  const t = hunterTarget(s, h);
  const opts = [h.dir, TURN_L[h.dir], TURN_R[h.dir]];
  const aggro = 1.5 + Math.min(s.round, 12) * 0.08;
  let best = h.dir, bestScore = -Infinity;
  for (const dir of opts) {
    const n = nextCell(s, h.x, h.y, dir);
    let score;
    if (n.out || s.occ[idx(n.x, n.y)] !== 0) score = -1e9;
    else {
      const space = floodCount(s, n.x, n.y);
      const straight = runLength(s, n.x, n.y, dir, 8);
      const dist = axisDist(n.x, t.x, W, s.wrap) + axisDist(n.y, t.y, H, s.wrap);
      score = space * 3 - dist * aggro + straight * 1.2 + (dir === h.dir ? 0.6 : 0) + rand(s) * 0.5;
      if (space < 12) score -= 400; // dead-end pocket
    }
    if (score > bestScore) { bestScore = score; best = dir; }
  }
  return best;
}

// ---- Simulation ----
function moveCycle(s, c, fresh, killed) {
  const n = nextCell(s, c.x, c.y, c.dir);
  if (n.out) { killed.push({ c, cause: 'wall' }); return; }
  const i = idx(n.x, n.y);
  const v = s.occ[i];
  c.x = n.x; c.y = n.y;
  if (v === OBST) { killed.push({ c, cause: 'wall' }); return; }
  if (v > 0) {
    const ghostPass = c.cloakTicks > 0 && v !== c.id;
    if (!ghostPass) {
      killed.push({ c, cause: v === c.id ? 'self' : 'trail', by: v });
      const other = fresh.get(i);
      if (other && other !== c && !killed.some((k) => k.c === other)) killed.push({ c: other, cause: 'headon', by: c.id });
      return;
    }
  }
  if (c.cloakTicks > 0) c.ghost.push(i);
  else { occupy(s, c, i); fresh.set(i, c); }
}

function derez(s, c) {
  for (const i of c.trail) if (s.occ[i] === c.id) s.occ[i] = 0;
  c.alive = false;
}

export function triggerEmp(s) {
  for (const c of s.cycles) {
    const n = Math.min(Math.floor(c.trail.length * TUNING.empFraction), Math.max(0, c.trail.length - 1));
    const removed = c.trail.splice(0, n);
    for (const i of removed) if (s.occ[i] === c.id) s.occ[i] = 0;
  }
  for (const h of s.hunters) if (h.alive) h.stun = TUNING.empStun;
  s.empCount++;
  s.events.push({ type: 'emp', x: s.player.x, y: s.player.y });
}

function spawnShard(s) {
  for (let tries = 0; tries < 60; tries++) {
    const x = 1 + Math.floor(rand(s) * (W - 2)), y = 1 + Math.floor(rand(s) * (H - 2));
    if (s.occ[idx(x, y)] !== 0) continue;
    if (Math.abs(x - s.player.x) + Math.abs(y - s.player.y) < 4) continue;
    if (s.shards.some((k) => k.x === x && k.y === y)) continue;
    const kind = rand(s) < TUNING.empChance ? 'emp' : 'data';
    s.shards.push({ x, y, kind, born: s.tick });
    return true;
  }
  return false;
}

function collectShards(s) {
  const p = s.player;
  const k = s.shards.findIndex((sh) => sh.x === p.x && sh.y === p.y);
  if (k < 0) return;
  const sh = s.shards.splice(k, 1)[0];
  p.cloak = Math.min(100, p.cloak + TUNING.shardCloak);
  p.boost = Math.min(100, p.boost + TUNING.shardBoost);
  s.mult = Math.min(TUNING.multMax, s.mult + TUNING.multStep);
  const pts = Math.round(TUNING.shardScore * s.mult);
  s.score += pts;
  s.shardsCollected++;
  s.events.push({ type: 'shard', x: sh.x, y: sh.y, kind: sh.kind, points: pts });
  if (sh.kind === 'emp') triggerEmp(s);
}

function stepPlayerMove(s, fresh, killed) {
  const p = s.player;
  p.queue.length && (p.dir = p.queue.shift());
  moveCycle(s, p, fresh, killed);
  if (p.alive && !killed.some((k) => k.c === p)) collectShards(s);
}

export function step(s) {
  if (s.phase !== 'playing') return s.events;
  s.tick++;
  const p = s.player;
  const fresh = new Map();
  const killed = [];
  for (const c of s.cycles) { c.px = c.x; c.py = c.y; }

  // Player: 1 move, +1 when nitro is burning.
  stepPlayerMove(s, fresh, killed);
  const canBoost = p.boosting && p.boost >= TUNING.boostMin;
  if (canBoost && !killed.some((k) => k.c === p)) {
    p.boost = Math.max(0, p.boost - TUNING.boostCost);
    stepPlayerMove(s, fresh, killed);
  } else if (!p.boosting) p.boost = Math.min(100, p.boost + TUNING.boostRegen);

  // Hunters.
  for (const h of s.hunters) {
    if (!h.alive || killed.some((k) => k.c === h)) continue;
    if (h.stun > 0) { h.stun--; continue; }
    h.dir = chooseHunterDir(s, h);
    moveCycle(s, h, fresh, killed);
  }

  // Resolve deaths.
  let playerDied = false;
  for (const { c, cause } of killed) {
    if (!c.alive) continue;
    if (c === p) { playerDied = true; c.alive = false; s.events.push({ type: 'crash', x: c.x, y: c.y, cause }); continue; }
    s.combo = (s.tick - s.lastKillTick <= TUNING.comboWindow) ? Math.min(TUNING.comboMax, s.combo + 1) : 1;
    s.lastKillTick = s.tick;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    const pts = TUNING.derezPoints * s.combo;
    s.score += pts; s.kills++;
    s.events.push({ type: 'derez', x: c.x, y: c.y, kind: c.kind, color: c.color, cause, points: pts, combo: s.combo });
    derez(s, c);
  }

  // Timers & energy.
  if (p.cloakTicks > 0) {
    p.cloakTicks--;
    if (p.cloakTicks === 0) {
      s.events.push({ type: 'uncloak', x: p.x, y: p.y });
      if (p.alive && s.occ[idx(p.x, p.y)] === 0) occupy(s, p, idx(p.x, p.y));
    }
  }
  p.cloak = Math.min(100, p.cloak + TUNING.cloakRegen);
  if (!playerDied) s.score += Math.max(1, Math.floor(s.mult));

  if (s.autoShards && !playerDied) {
    s.shardTimer++;
    if (s.shardTimer >= TUNING.shardEvery && s.shards.length < TUNING.shardMaxActive) {
      if (spawnShard(s)) s.shardTimer = 0;
    }
  }

  // Phase transitions.
  if (playerDied) {
    s.lives--;
    s.mult = Math.max(1, s.mult - 0.5);
    if (s.lives > 0) { s.phase = 'dead'; s.events.push({ type: 'lifeLost', lives: s.lives }); }
    else { s.phase = 'gameover'; s.events.push({ type: 'gameOver' }); }
  } else if (s.hunters.length > 0 && s.hunters.every((h) => !h.alive)) {
    const bonus = TUNING.roundBonus * s.round;
    s.score += bonus;
    s.roundsCleared++;
    if (s.round === MAX_ROUNDS && !s.endless) {
      s.won = true; s.phase = 'victory';
      s.events.push({ type: 'victory', bonus });
    } else {
      s.phase = 'roundClear';
      s.events.push({ type: 'roundClear', bonus, round: s.round });
    }
  }
  return s.events;
}

export function drainEvents(s) { const e = s.events; s.events = []; return e; }

export function nextRound(s) {
  if (s.phase !== 'roundClear' && s.phase !== 'victory') return false;
  s.round++;
  setupRound(s);
  return true;
}
export function retryRound(s) {
  if (s.phase !== 'dead') return false;
  setupRound(s);
  return true;
}

export function computeRewards(s) {
  const eddies = Math.floor(s.score / 50) + s.roundsCleared * 25 + (s.won ? 500 : 0);
  const xp = Math.floor(s.score / 20) + s.roundsCleared * 15 + (s.won ? 250 : 0);
  return { eddies, xp };
}

export function serializeState(s) {
  return {
    v: 1,
    arenaId: s.arenaId,
    seed: s.seed,
    autoShards: s.autoShards,
    hunterOverride: s.hunterOverride,
    tick: s.tick,
    round: s.round,
    lives: s.lives,
    score: s.score,
    mult: s.mult,
    combo: s.combo,
    lastKillTick: s.lastKillTick,
    kills: s.kills,
    bestCombo: s.bestCombo,
    shards: s.shards.map((sh) => ({ x: sh.x, y: sh.y, kind: sh.kind, born: sh.born })),
    shardTimer: s.shardTimer,
    shardsCollected: s.shardsCollected,
    empCount: s.empCount,
    phase: s.phase,
    won: s.won,
    endless: s.endless,
    roundsCleared: s.roundsCleared,
    tickMs: s.tickMs,
    cycles: s.cycles.map((c) => ({
      id: c.id, kind: c.kind, x: c.x, y: c.y, px: c.px, py: c.py, dir: c.dir,
      queue: [...c.queue], alive: c.alive, trail: [...c.trail], ghost: [...c.ghost],
      boost: c.boost, cloak: c.cloak, cloakTicks: c.cloakTicks, boosting: false, stun: c.stun,
    })),
  };
}

export function deserializeState(snap) {
  if (!snap || typeof snap !== 'object' || !Array.isArray(snap.cycles) || snap.cycles.length === 0) return null;
  const arena = getArena(snap.arenaId);
  const s = createGame({
    arena: arena.id,
    seed: snap.seed ?? 1,
    shards: snap.autoShards !== false,
    hunterCount: Number.isInteger(snap.hunterOverride) ? snap.hunterOverride : undefined,
    round: Math.max(1, snap.round || 1),
    lives: snap.lives ?? 3,
  });
  s.occ.fill(0);
  s.stamp.fill(0);
  for (const [ox, oy, ow, oh] of arena.obstacles) {
    for (let y = oy; y < oy + oh; y++) for (let x = ox; x < ox + ow; x++) s.occ[idx(x, y)] = OBST;
  }
  s.tick = snap.tick | 0;
  s.score = Number(snap.score) || 0;
  s.mult = Number(snap.mult) || 1;
  s.combo = snap.combo | 0;
  s.lastKillTick = Number.isFinite(snap.lastKillTick) ? snap.lastKillTick : -1e9;
  s.kills = snap.kills | 0;
  s.bestCombo = snap.bestCombo | 0;
  s.shards = Array.isArray(snap.shards) ? snap.shards.map((sh) => ({ x: sh.x | 0, y: sh.y | 0, kind: sh.kind === 'emp' ? 'emp' : 'data', born: sh.born | 0 })) : [];
  s.shardTimer = snap.shardTimer | 0;
  s.shardsCollected = snap.shardsCollected | 0;
  s.empCount = snap.empCount | 0;
  s.phase = ['playing', 'dead', 'roundClear', 'victory', 'gameover'].includes(snap.phase) ? snap.phase : 'playing';
  s.won = !!snap.won;
  s.endless = !!snap.endless;
  s.roundsCleared = snap.roundsCleared | 0;
  s.tickMs = Number(snap.tickMs) || tickMsForRound(s.round);
  s.events = [];

  s.cycles = snap.cycles.map((c) => {
    const k = KIND_COLORS[c.kind] ? c.kind : 'arasaka';
    return {
      id: c.id | 0,
      kind: k,
      color: KIND_COLORS[k],
      x: c.x | 0, y: c.y | 0, px: c.px | 0, py: c.py | 0,
      dir: DIRS[c.dir] ? c.dir : 'right',
      queue: Array.isArray(c.queue) ? c.queue.filter((d) => !!DIRS[d]).slice(0, TUNING.queueMax) : [],
      alive: !!c.alive,
      trail: Array.isArray(c.trail) ? c.trail.filter((i) => i >= 0 && i < W * H) : [],
      ghost: Array.isArray(c.ghost) ? c.ghost.filter((i) => i >= 0 && i < W * H) : [],
      boost: Number.isFinite(c.boost) ? c.boost : 100,
      cloak: Number.isFinite(c.cloak) ? c.cloak : 100,
      cloakTicks: Math.max(0, c.cloakTicks | 0),
      boosting: false,
      stun: Math.max(0, c.stun | 0),
    };
  });
  s.player = s.cycles.find((c) => c.kind === 'player') || s.cycles[0];
  s.hunters = s.cycles.filter((c) => c !== s.player);
  for (const c of s.cycles) {
    if (!c.alive && c !== s.player) continue;
    for (const i of c.trail) {
      if (s.occ[i] === 0) s.occ[i] = c.id;
    }
  }
  return s;
}
