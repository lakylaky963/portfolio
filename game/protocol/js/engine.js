// BREACH PROTOCOL — pure deterministic engine. No DOM / window dependencies.
export const TOKENS = ['1C', '55', 'BD', 'E9', '7A', 'FF'];
export const TIER_NAMES = [
  'Scav Subnet', 'Maelstrom Node', 'Militech Relay',
  'Kang Tao Vault', 'Biotechnica Core', 'Arasaka Mikoshi', 'Blackwall Deep Net',
];
export const MAX_BUFFER = 8;
export const BASE_BUFFER = 5;
export const FREEZE_SECONDS = 8;
export const FAST_PLAN_SECONDS = 4;
export const MAX_TIME_BONUS = 15;
export const MAX_TIME_LIMIT = 60;

export const DAEMON_TYPES = {
  DATAMINE_V1: { eddies: 60, time: 0, mult: 1 },
  DATAMINE_V2: { eddies: 140, time: 0, mult: 1 },
  ICEPICK: { eddies: 40, time: 6, mult: 1 },
  MASS_VULN: { eddies: 50, time: 0, mult: 2 },
  BLACKWALL_SIPHON: { eddies: 400, time: 0, mult: 1 },
};

export const SHOP = {
  buffer: { price: (run) => 150 * (run.bufferSize - BASE_BUFFER + 1), max: MAX_BUFFER },
  time: { price: () => 80, max: MAX_TIME_BONUS },
  freeze: { price: () => 100 },
  flip: { price: () => 90 },
  hint: { price: () => 70 },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gridSizeForTier(tier) { return tier <= 2 ? 5 : tier <= 5 ? 6 : 7; }
export function tierName(tier) { return TIER_NAMES[Math.min(tier, TIER_NAMES.length) - 1] + (tier > 7 ? ' ' + tier : ''); }
export function baseTime(tier) { return Math.max(25, 45 - tier * 2); }
export function daemonCountForTier(tier) { return tier >= 4 ? 4 : 3; }

function daemonTypesForTier(tier, count, rng) {
  let pool;
  if (tier <= 2) pool = ['DATAMINE_V1', 'DATAMINE_V2', 'ICEPICK'];
  else if (tier <= 5) pool = ['DATAMINE_V1', 'DATAMINE_V2', 'ICEPICK', 'MASS_VULN'];
  else pool = ['DATAMINE_V1', 'DATAMINE_V2', 'ICEPICK', 'MASS_VULN', 'BLACKWALL_SIPHON'];
  const forced = tier >= 6 ? ['BLACKWALL_SIPHON'] : [];
  const rest = pool.filter((t) => !forced.includes(t));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return forced.concat(rest).slice(0, count);
}

function randomPath(size, length, rng) {
  const used = new Set();
  const path = [];
  let axis = 'row';
  let idx = 0;
  for (let i = 0; i < length; i++) {
    const options = [];
    for (let k = 0; k < size; k++) {
      const r = axis === 'row' ? idx : k;
      const c = axis === 'row' ? k : idx;
      if (!used.has(r + ',' + c)) options.push([r, c]);
    }
    if (!options.length) return null;
    const [r, c] = options[Math.floor(rng() * options.length)];
    used.add(r + ',' + c);
    path.push({ r, c });
    if (axis === 'row') { axis = 'col'; idx = c; } else { axis = 'row'; idx = r; }
  }
  return path;
}

export function generatePuzzle({ seed = 1, tier = 1, bufferSize = BASE_BUFFER } = {}) {
  const size = gridSizeForTier(tier);
  const L = Math.min(bufferSize, MAX_BUFFER);
  const count = daemonCountForTier(tier);
  for (let attempt = 0; attempt < 500; attempt++) {
    const rng = mulberry32((seed * 2654435761 + attempt * 97 + tier) >>> 0);
    const path = randomPath(size, L, rng);
    if (!path) continue;
    const grid = [];
    for (let r = 0; r < size; r++) {
      grid.push([]);
      for (let c = 0; c < size; c++) grid[r].push(TOKENS[Math.floor(rng() * TOKENS.length)]);
    }
    const tokensOnPath = path.map((p) => grid[p.r][p.c]);
    const seqs = [];
    const keys = new Set();
    let tries = 0;
    const maxLen = Math.min(4, L);
    while (seqs.length < count && tries++ < 200) {
      const len = 2 + Math.floor(rng() * (maxLen - 1));
      const start = Math.floor(rng() * (L - len + 1));
      const seq = tokensOnPath.slice(start, start + len);
      const key = seq.join(' ');
      if (keys.has(key)) continue;
      // avoid one daemon being a contiguous sub-run of another (trivial duplicates)
      if (seqs.some((s) => s.join(' ').includes(key) || key.includes(s.join(' ')))) continue;
      keys.add(key);
      seqs.push(seq);
    }
    if (seqs.length < count) continue;
    seqs.sort((a, b) => a.length - b.length);
    const types = daemonTypesForTier(tier, count, rng);
    // longest sequences take the juiciest reward types
    const order = types.slice().sort((a, b) => DAEMON_TYPES[a].eddies - DAEMON_TYPES[b].eddies);
    const daemons = seqs.map((seq, i) => ({ id: 'd' + i, type: order[i], seq }));
    return { seed, tier, size, grid, bufferSize: L, daemons, solutionPath: path };
  }
  throw new Error('puzzle generation failed');
}

/* ---------- Breach state ---------- */
export function createBreach(puzzle, opts = {}) {
  return {
    puzzle,
    grid: puzzle.grid,
    size: puzzle.size,
    tier: opts.tier || puzzle.tier || 1,
    streak: opts.streak || 0,
    bufferSize: puzzle.bufferSize,
    daemons: puzzle.daemons,
    buffer: [],
    path: [],
    used: new Set(),
    axis: 'row',
    index: 0,
    started: false,
    planElapsed: 0,
    timeLimit: opts.timeLimit || baseTime(puzzle.tier || 1),
    timeLeft: opts.timeLimit || baseTime(puzzle.tier || 1),
    freezeLeft: 0,
    inv: opts.inv || { freeze: 0, flip: 0, hint: 0 },
    hint: null,
    status: 'active',
    result: null,
  };
}

export function isValidPick(state, r, c) {
  if (state.status !== 'active') return false;
  if (r < 0 || c < 0 || r >= state.size || c >= state.size) return false;
  if (state.buffer.length >= state.bufferSize) return false;
  if (state.used.has(r + ',' + c)) return false;
  return state.axis === 'row' ? r === state.index : c === state.index;
}

export function validCells(state) {
  const out = [];
  for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++) if (isValidPick(state, r, c)) out.push({ r, c });
  return out;
}

// Which line would be highlighted after picking (r,c)
export function previewLine(state, r, c) {
  if (!isValidPick(state, r, c)) return null;
  return state.axis === 'row' ? { axis: 'col', index: c } : { axis: 'row', index: r };
}

export function daemonStatus(state, daemon) {
  const buf = state.buffer;
  const seq = daemon.seq;
  const n = seq.length;
  for (let i = 0; i + n <= buf.length; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) if (buf[i + j] !== seq[j]) { ok = false; break; }
    if (ok) return { id: daemon.id, status: 'uploaded', matched: n };
  }
  const remaining = state.bufferSize - buf.length;
  let best = 0;
  for (let k = Math.min(n - 1, buf.length); k >= 1; k--) {
    let ok = true;
    for (let j = 0; j < k; j++) if (buf[buf.length - k + j] !== seq[j]) { ok = false; break; }
    if (ok) { best = k; break; }
  }
  const locked = n - best > remaining;
  return { id: daemon.id, status: locked ? 'locked' : 'pending', matched: best };
}

export function allDaemonStatus(state) { return state.daemons.map((d) => daemonStatus(state, d)); }

export function pick(state, r, c) {
  if (state.status !== 'active') return { ok: false, reason: 'finished' };
  if (r < 0 || c < 0 || r >= state.size || c >= state.size) return { ok: false, reason: 'bounds' };
  if (state.used.has(r + ',' + c)) return { ok: false, reason: 'used' };
  if (!isValidPick(state, r, c)) return { ok: false, reason: 'axis' };
  state.started = true;
  state.used.add(r + ',' + c);
  state.buffer.push(state.grid[r][c]);
  state.path.push({ r, c });
  state.hint = null;
  if (state.axis === 'row') { state.axis = 'col'; state.index = c; } else { state.axis = 'row'; state.index = r; }
  const sts = allDaemonStatus(state);
  if (sts.every((s) => s.status === 'uploaded')) finalize(state, 'full');
  else if (state.buffer.length >= state.bufferSize || validCells(state).length === 0) finalize(state, 'end');
  return { ok: true, token: state.grid[r][c], finished: state.status !== 'active' };
}

export function tick(state, dt) {
  if (state.status !== 'active') return;
  if (!state.started) { state.planElapsed += dt; return; }
  if (state.freezeLeft > 0) {
    state.freezeLeft = Math.max(0, state.freezeLeft - dt);
    return;
  }
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.timeLeft <= 0) finalize(state, 'end');
}

export function executeEarly(state) {
  if (state.status !== 'active') return { ok: false, reason: 'finished' };
  const up = allDaemonStatus(state).filter((s) => s.status === 'uploaded').length;
  if (up < 1) return { ok: false, reason: 'no-daemon' };
  finalize(state, 'end');
  return { ok: true };
}

export function finalize(state, why) {
  if (state.status !== 'active') return state.result;
  const sts = allDaemonStatus(state);
  const upIds = sts.filter((s) => s.status === 'uploaded').map((s) => s.id);
  const full = upIds.length === state.daemons.length;
  state.status = 'done';
  if (upIds.length === 0) {
    state.result = { outcome: 'fail', uploaded: [], eddies: 0, score: 0, xp: 0, bonusTime: 0, breakdown: {}, why };
    return state.result;
  }
  const ups = state.daemons.filter((d) => upIds.includes(d.id));
  const tierMul = 1 + 0.1 * (state.tier - 1);
  let eddies = 0, score = 0, mult = 1, bonusTime = 0;
  for (const d of ups) {
    const t = DAEMON_TYPES[d.type];
    eddies += t.eddies;
    score += 100 * d.seq.length;
    mult = Math.max(mult, t.mult);
    bonusTime += t.time;
  }
  eddies = Math.round(eddies * tierMul);
  score = score * mult;
  const fullSweepScore = full ? Math.round(score * 0.5) : 0;
  const fullSweepEddies = full ? Math.round(eddies * 0.5) : 0;
  const speedScore = Math.floor(state.timeLeft) * 10 + (state.planElapsed <= FAST_PLAN_SECONDS ? 150 : 0);
  const streakMult = Math.min(2, 1 + 0.1 * state.streak);
  const subScore = score + fullSweepScore + speedScore;
  const subEddies = eddies + fullSweepEddies;
  const finalScore = Math.round(subScore * streakMult);
  const finalEddies = Math.round(subEddies * streakMult);
  const xp = Math.floor(finalScore / 35) + state.tier * 8;
  state.result = {
    outcome: full ? 'full' : 'partial',
    uploaded: upIds,
    eddies: finalEddies, score: finalScore, xp, bonusTime,
    breakdown: { baseScore: score, baseEddies: eddies, fullSweepScore, fullSweepEddies, speedScore, streakMult, scoreMult: mult },
    why,
  };
  return state.result;
}

/* ---------- Quickhacks ---------- */
export function useFreeze(state) {
  if (state.status !== 'active' || !state.started) return { ok: false, reason: 'not-running' };
  if (state.inv.freeze <= 0) return { ok: false, reason: 'none' };
  state.inv.freeze--;
  state.freezeLeft = FREEZE_SECONDS;
  return { ok: true };
}

export function useFlip(state) {
  if (state.status !== 'active') return { ok: false, reason: 'finished' };
  if (state.path.length === 0) return { ok: false, reason: 'no-pick' };
  if (state.inv.flip <= 0) return { ok: false, reason: 'none' };
  const last = state.path[state.path.length - 1];
  const nAxis = state.axis === 'row' ? 'col' : 'row';
  const nIndex = nAxis === 'row' ? last.r : last.c;
  // the flipped line must contain at least one free cell
  let free = false;
  for (let k = 0; k < state.size; k++) {
    const r = nAxis === 'row' ? nIndex : k;
    const c = nAxis === 'row' ? k : nIndex;
    if (!state.used.has(r + ',' + c)) { free = true; break; }
  }
  if (!free) return { ok: false, reason: 'no-free-cell' };
  state.inv.flip--;
  state.axis = nAxis;
  state.index = nIndex;
  return { ok: true };
}

// Bounded DFS: find a continuation that uploads every target daemon.
export function solveFrom(state, cap = 200000, targets = state.daemons) {
  const buf = state.buffer.slice();
  const used = new Set(state.used);
  let axis = state.axis, index = state.index;
  let nodes = 0;
  const done = () => targets.every((d) => containsSeq(buf, d.seq));
  const feasible = () => {
    const tmp = { buffer: buf, bufferSize: state.bufferSize };
    return targets.every((d) => daemonStatus(tmp, d).status !== 'locked');
  };
  function rec(path) {
    if (done()) return path;
    if (buf.length >= state.bufferSize || nodes++ > cap) return null;
    for (let k = 0; k < state.size; k++) {
      const r = axis === 'row' ? index : k;
      const c = axis === 'row' ? k : index;
      if (used.has(r + ',' + c)) continue;
      const sa = axis, si = index;
      used.add(r + ',' + c); buf.push(state.grid[r][c]);
      if (axis === 'row') { axis = 'col'; index = c; } else { axis = 'row'; index = r; }
      if (feasible()) {
        path.push({ r, c });
        const res = rec(path);
        if (res) return res;
        path.pop();
      }
      used.delete(r + ',' + c); buf.pop(); axis = sa; index = si;
    }
    return null;
  }
  return rec([]);
}

function containsSeq(buf, seq) {
  for (let i = 0; i + seq.length <= buf.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) if (buf[i + j] !== seq[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

function daemonPriorityValue(d) {
  const t = DAEMON_TYPES[d.type] || { eddies: 0, time: 0, mult: 1 };
  return t.eddies + (t.mult > 1 ? 120 : 0) + t.time * 10 + d.seq.length * 15;
}

export function nextHintCell(state) {
  const sp = state.puzzle.solutionPath;
  const n = state.path.length;
  if (n < sp.length && state.path.every((p, i) => p.r === sp[i].r && p.c === sp[i].c) && isValidPick(state, sp[n].r, sp[n].c)) return sp[n];
  const sol = solveFrom(state);
  if (sol && sol.length) return sol[0];
  // Fallback: try solving for the highest-value single remaining solvable daemon
  const pending = state.daemons
    .filter((d) => daemonStatus(state, d).status === 'pending')
    .sort((a, b) => daemonPriorityValue(b) - daemonPriorityValue(a));
  for (const d of pending) {
    const singleSol = solveFrom(state, 50000, [d]);
    if (singleSol && singleSol.length) return singleSol[0];
  }
  const v = validCells(state);
  return v.length ? v[0] : null;
}

export function useHint(state) {
  if (state.status !== 'active') return { ok: false, reason: 'finished' };
  if (state.inv.hint <= 0) return { ok: false, reason: 'none' };
  const cell = nextHintCell(state);
  if (!cell) return { ok: false, reason: 'no-cell' };
  state.inv.hint--;
  state.hint = cell;
  return { ok: true, cell };
}

/* ---------- Roguelike run ---------- */
export function createRun({ seed = 1 } = {}) {
  return {
    seed, tier: 1, eddies: 0, score: 0, xp: 0, streak: 0, bufferSize: BASE_BUFFER,
    timeBonus: 0, carryTime: 0, inv: { freeze: 1, flip: 1, hint: 1 },
    badges: [], cleared: 0, status: 'playing', won: false,
  };
}

export function startBreach(run) {
  const puzzle = generatePuzzle({ seed: run.seed + run.tier * 7919 + run.cleared * 31, tier: run.tier, bufferSize: run.bufferSize });
  const timeLimit = Math.min(MAX_TIME_LIMIT, baseTime(run.tier) + run.timeBonus + run.carryTime);
  run.carryTime = 0;
  return createBreach(puzzle, { tier: run.tier, streak: run.streak, timeLimit, inv: run.inv });
}

// Applies a finished breach to the run. Returns the result.
export function applyBreach(run, state) {
  const res = state.result || finalize(state, 'end');
  if (res.outcome === 'fail') {
    run.status = 'over';
    run.won = run.cleared >= 5;
    return res;
  }
  run.eddies += res.eddies;
  run.score += res.score;
  run.xp += res.xp;
  run.carryTime += res.bonusTime;
  run.cleared++;
  if (run.cleared >= 5) run.won = true;
  if (res.outcome === 'full') {
    run.streak++;
    if (!run.badges.includes('full-sweep')) run.badges.push('full-sweep');
  } else run.streak = 0;
  if (run.streak >= 3 && !run.badges.includes('streak-3')) run.badges.push('streak-3');
  if (run.tier >= 6 && !run.badges.includes('arasaka')) run.badges.push('arasaka');
  run.tier++;
  return res;
}

export function buy(run, item) {
  const def = SHOP[item];
  if (!def) return { ok: false, reason: 'unknown' };
  if (item === 'buffer' && run.bufferSize >= def.max) return { ok: false, reason: 'max' };
  if (item === 'time' && run.timeBonus >= def.max) return { ok: false, reason: 'max' };
  const price = def.price(run);
  if (run.eddies < price) return { ok: false, reason: 'funds' };
  run.eddies -= price;
  if (item === 'buffer') run.bufferSize++;
  else if (item === 'time') run.timeBonus += 5;
  else run.inv[item]++;
  return { ok: true, price };
}

export function cashOut(run) {
  run.status = 'over';
  run.won = true;
  return { score: run.score, eddies: run.eddies, xp: run.xp };
}
