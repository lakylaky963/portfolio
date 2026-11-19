import test from 'node:test';
import assert from 'node:assert/strict';
import {
  W, H, MAX_ROUNDS, OBST, DIRS, OPPOSITE, TUNING,
  HUNTER_KINDS, KIND_COLORS, ARENAS, getArena,
  PLAYER_SPAWN, HUNTER_SPAWNS,
  huntersForRound, tickMsForRound, cloakTicksFor,
  idx, nextCell, createGame, setupRound, resetCycle, paint,
  queueTurn, setBoost, activateCloak,
  isBlocked, floodCount, hunterTarget, chooseHunterDir,
  triggerEmp, step, drainEvents, nextRound, retryRound, computeRewards,
  serializeState, deserializeState,
} from './js/engine.js';

// 1. Initialization & arenas
test('createGame initializes grid, spawns, and arena properties', () => {
  const s = createGame({ arena: 'watson', seed: 42 });
  assert.equal(s.W, W);
  assert.equal(s.H, H);
  assert.equal(s.arenaId, 'watson');
  assert.equal(s.wrap, false);
  assert.equal(s.phase, 'playing');
  assert.equal(s.round, 1);
  assert.equal(s.lives, 3);
  assert.equal(s.player.x, PLAYER_SPAWN.x);
  assert.equal(s.player.y, PLAYER_SPAWN.y);
  assert.equal(s.player.dir, PLAYER_SPAWN.dir);
  assert.equal(s.hunters.length, huntersForRound(1));
  assert.equal(s.occ[idx(s.player.x, s.player.y)], s.player.id);
  assert.equal(s.occ[idx(s.hunters[0].x, s.hunters[0].y)], s.hunters[0].id);
});

test('Kabuki obstacles populate grid without overlapping any spawn', () => {
  const arena = getArena('kabuki');
  assert.equal(arena.id, 'kabuki');
  assert.ok(arena.obstacles.length >= 10);
  const s = createGame({ arena: 'kabuki', hunterCount: 5, seed: 7 });
  for (const [ox, oy, ow, oh] of arena.obstacles) {
    for (let y = oy; y < oy + oh; y++) {
      for (let x = ox; x < ox + ow; x++) {
        assert.equal(s.occ[idx(x, y)], OBST, `cell (${x},${y}) should be OBST`);
      }
    }
  }
  assert.equal(s.occ[idx(PLAYER_SPAWN.x, PLAYER_SPAWN.y)], s.player.id);
  for (const h of s.hunters) {
    assert.equal(s.occ[idx(h.x, h.y)], h.id);
  }
});

// 2. Turn buffering & 180-degree reversal prevention
test('queueTurn buffers up to queueMax turns and applies one per tick', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, 20, 18, 'right');

  assert.equal(queueTurn(s, 'up'), true);
  assert.equal(queueTurn(s, 'left'), true);
  assert.equal(queueTurn(s, 'down'), true);
  // Queue is now full (queueMax = 3)
  assert.equal(queueTurn(s, 'right'), false);
  assert.deepEqual(s.player.queue, ['up', 'left', 'down']);

  step(s);
  assert.equal(s.player.dir, 'up');
  assert.equal(s.player.x, 20);
  assert.equal(s.player.y, 17);

  step(s);
  assert.equal(s.player.dir, 'left');
  assert.equal(s.player.x, 19);
  assert.equal(s.player.y, 17);

  step(s);
  assert.equal(s.player.dir, 'down');
  assert.equal(s.player.x, 19);
  assert.equal(s.player.y, 18);
  assert.equal(s.player.queue.length, 0);
});

test('queueTurn prevents 180-degree reversals and duplicate directions', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, 20, 18, 'right');

  // Cannot reverse right -> left or duplicate right -> right
  assert.equal(queueTurn(s, 'left'), false);
  assert.equal(queueTurn(s, 'right'), false);
  assert.equal(queueTurn(s, 'invalid'), false);

  // Queue 'up', then cannot reverse 'up' -> 'down' or duplicate 'up'
  assert.equal(queueTurn(s, 'up'), true);
  assert.equal(queueTurn(s, 'down'), false);
  assert.equal(queueTurn(s, 'up'), false);

  // Can queue 'left' after 'up' (a valid 90-degree turn sequence)
  assert.equal(queueTurn(s, 'left'), true);
  assert.deepEqual(s.player.queue, ['up', 'left']);
});

// 3. Trail collisions (self and enemy)
test('player crashes into own trail with cause "self"', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, 20, 18, 'right');
  // Paint player's own trail ahead
  paint(s, 21, 18, s.player.id);
  step(s);
  const ev = drainEvents(s);
  assert.equal(s.player.alive, false);
  assert.equal(s.phase, 'dead');
  assert.equal(s.lives, 2);
  assert.ok(ev.some((e) => e.type === 'crash' && e.cause === 'self'));
  assert.ok(ev.some((e) => e.type === 'lifeLost' && e.lives === 2));
});

test('player crashes into enemy trail with cause "trail" when uncloaked', () => {
  const s = createGame({ arena: 'watson', hunterCount: 1, shards: false, seed: 1 });
  resetCycle(s, s.player, 15, 18, 'right');
  resetCycle(s, s.hunters[0], 45, 18, 'left');
  paint(s, 16, 18, s.hunters[0].id);

  step(s);
  const ev = drainEvents(s);
  assert.equal(s.player.alive, false);
  assert.ok(ev.some((e) => e.type === 'crash' && e.cause === 'trail'));
});

// 4. Phase Cloak pass-through, cost, duration, ghost trail, uncloak
test('Phase Cloak allows passing through enemy trails without leaving solid trail', () => {
  const s = createGame({ arena: 'watson', hunterCount: 1, shards: false, seed: 1 });
  resetCycle(s, s.player, 15, 18, 'right');
  resetCycle(s, s.hunters[0], 45, 10, 'left');
  paint(s, 16, 18, s.hunters[0].id);
  paint(s, 17, 18, s.hunters[0].id);

  const cloakBefore = s.player.cloak;
  assert.equal(activateCloak(s), true);
  assert.equal(s.player.cloak, cloakBefore - TUNING.cloakCost);
  assert.equal(s.player.cloakTicks, cloakTicksFor(s.tickMs));
  // Cannot double-activate while already cloaked
  assert.equal(activateCloak(s), false);

  step(s);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.x, 16);
  assert.equal(s.player.y, 18);
  // Enemy trail cell remains intact, player recorded ghost cell
  assert.equal(s.occ[idx(16, 18)], s.hunters[0].id);
  assert.ok(s.player.ghost.includes(idx(16, 18)));

  step(s);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.x, 17);
  assert.equal(s.occ[idx(17, 18)], s.hunters[0].id);

  // Move onto empty cell while still cloaked -> not occupied by solid trail
  step(s);
  assert.equal(s.player.x, 18);
  assert.equal(s.occ[idx(18, 18)], 0);
});

test('Phase Cloak expires with uncloak event and cannot activate below cloakCost', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, 10, 18, 'right');
  s.player.cloak = TUNING.cloakCost - 1;
  assert.equal(activateCloak(s), false);

  s.player.cloak = TUNING.cloakCost;
  assert.equal(activateCloak(s), true);
  const dur = s.player.cloakTicks;
  drainEvents(s);

  for (let i = 0; i < dur; i++) step(s);
  const ev = drainEvents(s);
  assert.equal(s.player.cloakTicks, 0);
  assert.ok(ev.some((e) => e.type === 'uncloak'));
  assert.equal(s.occ[idx(s.player.x, s.player.y)], s.player.id);
});

test('Phase Cloak does not let player pass through own trail or walls', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, 20, 18, 'right');
  paint(s, 21, 18, s.player.id);
  assert.equal(activateCloak(s), true);

  step(s);
  assert.equal(s.player.alive, false);
  const ev = drainEvents(s);
  assert.ok(ev.some((e) => e.type === 'crash' && e.cause === 'self'));
});

test('Cloaked player moving into an empty cell is not killed by hunter entering same cell', () => {
  const s = createGame({ arena: 'watson', hunterCount: 1, shards: false, seed: 1 });
  resetCycle(s, s.player, 10, 18, 'right');
  resetCycle(s, s.hunters[0], 12, 18, 'left');
  s.hunters[0].stun = 0;
  // Block hunter's up/down so it must go left into (11,18)
  paint(s, 12, 17, OBST);
  paint(s, 12, 19, OBST);
  assert.equal(activateCloak(s), true);

  step(s);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.x, 11);
  assert.equal(s.hunters[0].alive, true);
  assert.equal(s.hunters[0].x, 11);
});

// 5. Wall collision vs Blackwall Warp edge-wrapping
test('Watson arena kills player on wall collision', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, W - 1, 18, 'right');
  step(s);
  const ev = drainEvents(s);
  assert.equal(s.player.alive, false);
  assert.ok(ev.some((e) => e.type === 'crash' && e.cause === 'wall'));
});

test('Blackwall Warp arena wraps across all 4 boundaries cleanly', () => {
  const s = createGame({ arena: 'blackwall', hunterCount: 0, shards: false, seed: 1 });
  assert.equal(s.wrap, true);

  // Right -> 0
  resetCycle(s, s.player, W - 1, 10, 'right');
  step(s);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.x, 0);
  assert.equal(s.player.y, 10);

  // Left -> W - 1
  resetCycle(s, s.player, 0, 12, 'left');
  step(s);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.x, W - 1);
  assert.equal(s.player.y, 12);

  // Top -> H - 1
  resetCycle(s, s.player, 20, 0, 'up');
  step(s);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.x, 20);
  assert.equal(s.player.y, H - 1);

  // Bottom -> 0
  resetCycle(s, s.player, 25, H - 1, 'down');
  step(s);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.x, 25);
  assert.equal(s.player.y, 0);
});

// 6. Kabuki Pillars obstacle collision
test('Kabuki Pillars arena kills cycle colliding with an obstacle block', () => {
  const s = createGame({ arena: 'kabuki', hunterCount: 0, shards: false, seed: 1 });
  // Obstacle [14, 8, 4, 4] starts at x=14, y=8
  resetCycle(s, s.player, 13, 9, 'right');
  step(s);
  const ev = drainEvents(s);
  assert.equal(s.player.alive, false);
  assert.ok(ev.some((e) => e.type === 'crash' && e.cause === 'wall'));
});

// 7. Nitro Boost speed & energy drain / regen
test('Nitro Boost doubles speed, drains boost energy, and stops when below boostMin', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, 5, 18, 'right');

  setBoost(s, true);
  step(s);
  assert.equal(s.player.x, 7); // moved 2 cells in 1 tick
  assert.equal(s.player.boost, 100 - TUNING.boostCost);
  assert.equal(s.occ[idx(6, 18)], s.player.id);
  assert.equal(s.occ[idx(7, 18)], s.player.id);

  // Drain below boostMin -> only moves 1 cell
  s.player.boost = TUNING.boostMin - 0.5;
  const xBefore = s.player.x;
  step(s);
  assert.equal(s.player.x, xBefore + 1);
  assert.equal(s.player.boost, TUNING.boostMin - 0.5);

  // Release boost -> regenerates
  setBoost(s, false);
  step(s);
  assert.ok(s.player.boost > TUNING.boostMin - 0.5);
  assert.equal(s.player.boost, TUNING.boostMin - 0.5 + TUNING.boostRegen);
});

// 8. AI hunter steering, floodCount, targeting, derez & combo scoring
test('AI hunter steering avoids immediate walls and dead-end pockets', () => {
  const s = createGame({ arena: 'watson', hunterCount: 1, shards: false, seed: 3 });
  const h = s.hunters[0];
  resetCycle(s, s.player, 10, 18, 'right');
  // Put hunter heading right directly into a wall at x=W-1, with up blocked by a 2-cell dead-end pocket
  resetCycle(s, h, W - 1, 18, 'right');
  // Close off upward route into tiny pocket
  paint(s, W - 1, 16, OBST);
  paint(s, W - 2, 17, OBST);

  const chosen = chooseHunterDir(s, h);
  assert.equal(chosen, 'down', 'hunter should steer into open downward space instead of wall or tiny pocket');
  assert.ok(floodCount(s, W - 1, 19) > floodCount(s, W - 1, 17));
});

test('hunterTarget computes distinct behaviors for arasaka, militech, and blackwall', () => {
  const s = createGame({ arena: 'watson', hunterCount: 3, shards: false, seed: 1 });
  resetCycle(s, s.player, 20, 18, 'right');
  const [arasaka, militech, blackwall] = s.hunters;
  assert.equal(arasaka.kind, 'arasaka');
  assert.equal(militech.kind, 'militech');
  assert.equal(blackwall.kind, 'blackwall');

  const tA = hunterTarget(s, arasaka);
  const tM = hunterTarget(s, militech);
  const tB = hunterTarget(s, blackwall);

  assert.deepEqual(tA, { x: 27, y: 18 }); // 7 ahead
  assert.equal(tM.x, 24);                 // 4 ahead + 5 to the side
  assert.notEqual(tM.y, 18);
  assert.deepEqual(tB, { x: 22, y: 18 }); // 2 ahead (stalker)
});

test('Hunter derez clears its trail, awards takedown points, and increments combo', () => {
  const s = createGame({ arena: 'watson', hunterCount: 2, shards: false, seed: 1 });
  resetCycle(s, s.player, 5, 5, 'right');
  const [h1, h2] = s.hunters;

  // Box h1 completely in so it must crash into player's trail
  resetCycle(s, h1, 30, 18, 'left');
  paint(s, 31, 18, h1.id); // extra trail segment for h1
  paint(s, 29, 18, s.player.id);
  paint(s, 30, 17, s.player.id);
  paint(s, 30, 19, s.player.id);

  // Box h2 completely in as well so both derez on same tick -> combo 1 then combo 2
  resetCycle(s, h2, 40, 18, 'left');
  paint(s, 39, 18, s.player.id);
  paint(s, 40, 17, s.player.id);
  paint(s, 40, 19, s.player.id);

  const scoreBefore = s.score;
  step(s);
  const ev = drainEvents(s);

  assert.equal(h1.alive, false);
  assert.equal(h2.alive, false);
  assert.equal(s.occ[idx(31, 18)], 0, 'derezzed hunter trail must be cleared');
  assert.equal(s.kills, 2);
  assert.equal(s.combo, 2);
  assert.equal(s.bestCombo, 2);

  const derezEvents = ev.filter((e) => e.type === 'derez');
  assert.equal(derezEvents.length, 2);
  assert.equal(derezEvents[0].points, TUNING.derezPoints * 1);
  assert.equal(derezEvents[1].points, TUNING.derezPoints * 2);
  // Both hunters dead -> roundClear bonus also added
  assert.equal(s.phase, 'roundClear');
  assert.ok(s.score >= scoreBefore + TUNING.derezPoints * 3 + TUNING.roundBonus);
});

// 9. Data Shards: spawn, pickup, recharge, multiplier, and EMP pulse
test('Data Shards auto-spawn on schedule up to shardMaxActive', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: true, seed: 99 });
  resetCycle(s, s.player, 5, 18, 'right');
  // Keep player safely looping by turning
  for (let t = 0; t < TUNING.shardFirst; t++) {
    if (s.player.x >= 50) queueTurn(s, 'down');
    step(s);
  }
  assert.equal(s.shards.length, 1, 'first shard should spawn at tick shardFirst');

  // Step more ticks (keep looping safely)
  for (let t = 0; t < TUNING.shardEvery * 3; t++) {
    if (s.player.dir === 'right' && s.player.x >= 52) queueTurn(s, 'down');
    else if (s.player.dir === 'down' && s.player.y >= 30) queueTurn(s, 'left');
    else if (s.player.dir === 'left' && s.player.x <= 8) queueTurn(s, 'up');
    else if (s.player.dir === 'up' && s.player.y <= 6) queueTurn(s, 'right');
    step(s);
    if (!s.player.alive) break;
  }
  assert.ok(s.shards.length <= TUNING.shardMaxActive, 'active shards never exceed shardMaxActive');
});

test('Picking up a Data Shard recharges cloak & boost, raises multiplier, and awards score', () => {
  const s = createGame({ arena: 'watson', hunterCount: 0, shards: false, seed: 1 });
  resetCycle(s, s.player, 10, 18, 'right');
  s.player.cloak = 20;
  s.player.boost = 30;
  s.shards.push({ x: 11, y: 18, kind: 'data', born: 0 });

  step(s);
  const ev = drainEvents(s);
  assert.equal(s.shards.length, 0);
  assert.equal(s.shardsCollected, 1);
  assert.equal(s.mult, 1 + TUNING.multStep);
  assert.ok(s.player.cloak >= 20 + TUNING.shardCloak);
  assert.ok(s.player.boost >= 30 + TUNING.shardBoost);
  const shEvt = ev.find((e) => e.type === 'shard');
  assert.ok(shEvt);
  assert.equal(shEvt.kind, 'data');
  assert.equal(shEvt.points, Math.round(TUNING.shardScore * s.mult));
});

test('EMP Shard pickup clears 40% of trails and stuns live hunters', () => {
  const s = createGame({ arena: 'watson', hunterCount: 1, shards: false, seed: 1 });
  resetCycle(s, s.player, 10, 18, 'right');
  const h = s.hunters[0];
  resetCycle(s, h, 40, 18, 'left');

  // Build 10 cells of trail for hunter
  for (let k = 1; k <= 9; k++) paint(s, 40 + k, 18, h.id);
  const beforeLen = h.trail.length; // 10
  assert.equal(beforeLen, 10);

  // Place EMP shard right ahead of player
  s.shards.push({ x: 11, y: 18, kind: 'emp', born: 0 });
  step(s);
  const ev = drainEvents(s);

  assert.equal(s.empCount, 1);
  assert.ok(ev.some((e) => e.type === 'emp'));
  // Expected removed: floor(10 * 0.4) = 4 cells removed from oldest part of trail
  assert.equal(h.trail.length, beforeLen - Math.floor(beforeLen * TUNING.empFraction));
  // Hunter was stunned for empStun ticks; since hunter phase runs after player in same tick,
  // hunter skips movement this tick and decrements stun by 1 -> empStun - 1
  assert.equal(h.stun, TUNING.empStun - 1);
  assert.equal(h.x, 40, 'stunned hunter did not move');
  assert.equal(h.y, 18);
});

// 10. Round progression, Retry, Victory, Endless, Defeat & Rewards
test('Round progression scales hunters, speed, and resets arena via nextRound/retryRound', () => {
  const s = createGame({ arena: 'watson', shards: false, seed: 5 });
  assert.equal(nextRound(s), false, 'cannot advance during playing phase');
  assert.equal(retryRound(s), false, 'cannot retry during playing phase');

  // Force life lost -> retryRound
  resetCycle(s, s.player, 0, 18, 'left');
  step(s);
  assert.equal(s.phase, 'dead');
  assert.equal(s.lives, 2);
  assert.equal(retryRound(s), true);
  assert.equal(s.phase, 'playing');
  assert.equal(s.round, 1);
  assert.equal(s.player.x, PLAYER_SPAWN.x);

  // Kill sole hunter -> roundClear -> nextRound
  const h = s.hunters[0];
  resetCycle(s, h, W - 1, 18, 'right');
  paint(s, W - 1, 17, OBST);
  paint(s, W - 1, 19, OBST);
  step(s);
  assert.equal(s.phase, 'roundClear');
  assert.equal(s.roundsCleared, 1);

  assert.equal(nextRound(s), true);
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'playing');
  assert.ok(s.tickMs < tickMsForRound(1));
  assert.equal(huntersForRound(9), 5);
  assert.equal(huntersForRound(11), 5);
});

test('Clearing MAX_ROUNDS triggers victory, and nextRound enters endless mode', () => {
  const s = createGame({ arena: 'watson', round: MAX_ROUNDS, hunterCount: 1, shards: false, seed: 11 });
  const h = s.hunters[0];
  resetCycle(s, h, W - 1, 18, 'right');
  paint(s, W - 1, 17, OBST);
  paint(s, W - 1, 19, OBST);

  step(s);
  const ev = drainEvents(s);
  assert.equal(s.phase, 'victory');
  assert.equal(s.won, true);
  assert.ok(ev.some((e) => e.type === 'victory'));

  const rewards = computeRewards(s);
  assert.ok(rewards.eddies >= 500, 'victory grants 500 eddies bonus');
  assert.ok(rewards.xp >= 250, 'victory grants 250 xp bonus');

  // Can continue into endless mode
  assert.equal(nextRound(s), true);
  assert.equal(s.round, MAX_ROUNDS + 1);
  assert.equal(s.endless, true);
  assert.equal(s.phase, 'playing');
});

test('Losing last life transitions to gameover and blocks further steps', () => {
  const s = createGame({ arena: 'watson', lives: 1, hunterCount: 0, shards: false, seed: 2 });
  resetCycle(s, s.player, 0, 10, 'left');
  step(s);
  const ev = drainEvents(s);
  assert.equal(s.lives, 0);
  assert.equal(s.phase, 'gameover');
  assert.ok(ev.some((e) => e.type === 'gameOver'));

  const tickAtOver = s.tick;
  step(s);
  assert.equal(s.tick, tickAtOver, 'step is a no-op once gameover');
});

// 11. Deterministic replays
test('Deterministic replay: identical seed + inputs produce identical state & events', () => {
  function runSim() {
    const s = createGame({ arena: 'kabuki', seed: 1337, round: 3 });
    const log = [];
    for (let t = 0; t < 45; t++) {
      if (t === 5) queueTurn(s, 'up');
      if (t === 10) setBoost(s, true);
      if (t === 14) setBoost(s, false);
      if (t === 15) queueTurn(s, 'right');
      if (t === 20) activateCloak(s);
      if (t === 25) queueTurn(s, 'down');
      if (s.phase !== 'playing') break;
      step(s);
      log.push(...drainEvents(s));
    }
    return {
      tick: s.tick,
      score: s.score,
      phase: s.phase,
      player: { x: s.player.x, y: s.player.y, dir: s.player.dir, boost: s.player.boost, cloak: s.player.cloak },
      hunters: s.hunters.map((h) => ({ x: h.x, y: h.y, dir: h.dir, alive: h.alive })),
      shards: s.shards,
      log,
    };
  }

  const run1 = runSim();
  const run2 = runSim();
  assert.deepEqual(run1, run2);
});

// 12. Mid-run state serialization & deserialization
test('serializeState / deserializeState preserves exact mid-run continuation', () => {
  const s1 = createGame({ arena: 'kabuki', seed: 2077, round: 2 });
  for (let t = 0; t < 14; t++) {
    if (t === 4) queueTurn(s1, 'up');
    if (t === 6) queueTurn(s1, 'right'); // y=15, clears [14,8,4,4] (y:8..11) and [21,16,2,4] (y:16..19)
    if (t === 8) activateCloak(s1);
    step(s1);
    drainEvents(s1);
  }
  assert.equal(s1.phase, 'playing', 'player should still be alive at snapshot time');

  const snap = JSON.parse(JSON.stringify(serializeState(s1)));
  const s2 = deserializeState(snap);
  assert.ok(s2);
  assert.equal(s2.arenaId, s1.arenaId);
  assert.equal(s2.score, s1.score);
  assert.equal(s2.tick, s1.tick);
  assert.deepEqual(Array.from(s2.occ), Array.from(s1.occ));

  // Stepping both forward yields identical results
  for (let t = 0; t < 15; t++) {
    if (s1.phase !== 'playing') break;
    step(s1);
    step(s2);
  }
  assert.equal(s2.score, s1.score);
  assert.equal(s2.player.x, s1.player.x);
  assert.equal(s2.player.y, s1.player.y);
  assert.equal(s2.phase, s1.phase);
  assert.deepEqual(
    s2.hunters.map((h) => [h.x, h.y, h.alive]),
    s1.hunters.map((h) => [h.x, h.y, h.alive])
  );
});
