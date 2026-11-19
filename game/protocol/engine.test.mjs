import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './js/engine.js';

const mk = (seed = 1, tier = 1, bufferSize = 5) => E.generatePuzzle({ seed, tier, bufferSize });
// hand-made 5x5 puzzle for deterministic checks
function manual(daemons, bufferSize = 5) {
  const t = E.TOKENS;
  const grid = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => t[(r + c) % 6]));
  const puzzle = { seed: 0, tier: 1, size: 5, grid, bufferSize, daemons, solutionPath: [{ r: 0, c: 0 }] };
  return E.createBreach(puzzle, { inv: { freeze: 1, flip: 1, hint: 1 } });
}

test('grid size scales with tier', () => {
  assert.equal(E.gridSizeForTier(1), 5);
  assert.equal(E.gridSizeForTier(2), 5);
  assert.equal(E.gridSizeForTier(3), 6);
  assert.equal(E.gridSizeForTier(5), 6);
  assert.equal(E.gridSizeForTier(6), 7);
  assert.equal(E.gridSizeForTier(12), 7);
});

test('generator is deterministic per seed', () => {
  assert.deepEqual(mk(42, 3), mk(42, 3));
  assert.notDeepEqual(mk(42, 3).grid, mk(43, 3).grid);
});

test('grid only uses valid hex tokens and correct dimensions', () => {
  const p = mk(5, 4);
  assert.equal(p.grid.length, 6);
  for (const row of p.grid) { assert.equal(row.length, 6); for (const t of row) assert.ok(E.TOKENS.includes(t)); }
});

test('daemon count: 3 at low tiers, 4 at tier 4+', () => {
  assert.equal(mk(1, 1).daemons.length, 3);
  assert.equal(mk(1, 3).daemons.length, 3);
  assert.equal(mk(1, 4).daemons.length, 4);
  assert.equal(mk(1, 7).daemons.length, 4);
});

test('first pick must be in row 0', () => {
  const s = E.createBreach(mk(1));
  assert.equal(E.pick(s, 2, 2).ok, false);
  assert.equal(E.pick(s, 0, 3).ok, true);
});

test('alternating row/column selection is enforced', () => {
  const s = E.createBreach(mk(2));
  E.pick(s, 0, 3);
  assert.equal(s.axis, 'col');
  assert.equal(s.index, 3);
  assert.equal(E.pick(s, 1, 2).reason, 'axis'); // wrong column
  assert.equal(E.pick(s, 2, 3).ok, true);
  assert.equal(s.axis, 'row');
  assert.equal(s.index, 2);
  assert.equal(E.pick(s, 3, 1).reason, 'axis'); // wrong row
  assert.equal(E.pick(s, 2, 0).ok, true);
});

test('duplicate cells are rejected', () => {
  const s = E.createBreach(mk(3));
  E.pick(s, 0, 1);
  E.pick(s, 3, 1);
  const r = E.pick(s, 0, 1); // wrong axis anyway
  assert.equal(r.ok, false);
  E.pick(s, 3, 0);
  // now col 0: (0,0) free, but pick (3,0) again must fail as used
  assert.equal(E.pick(s, 3, 0).reason, 'used');
});

test('preview line for hover shows next orthogonal line', () => {
  const s = E.createBreach(mk(4));
  assert.deepEqual(E.previewLine(s, 0, 2), { axis: 'col', index: 2 });
  E.pick(s, 0, 2);
  assert.deepEqual(E.previewLine(s, 4, 2), { axis: 'row', index: 4 });
  assert.equal(E.previewLine(s, 4, 1), null);
});

test('generator solutionPath is a legal alternating path of buffer length', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const p = mk(seed, 1 + (seed % 7), 5 + (seed % 4));
    const s = E.createBreach(p);
    assert.equal(p.solutionPath.length, p.bufferSize);
    for (const { r, c } of p.solutionPath) assert.equal(E.pick(s, r, c).ok || s.status === 'done', true);
  }
});

test('solutionPath uploads ALL daemons across 50 random seeds', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const tier = 1 + (seed % 8);
    const p = mk(seed * 7919, tier, 5 + (seed % 4));
    const s = E.createBreach(p, { tier });
    for (const { r, c } of p.solutionPath) {
      if (s.status === 'done') break; // all daemons uploaded before the path ended
      const res = E.pick(s, r, c);
      assert.ok(res.ok, `seed ${seed} pick failed ${res.reason}`);
    }
    assert.equal(s.status, 'done', `seed ${seed}`);
    assert.equal(s.result.outcome, 'full', `seed ${seed}`);
    assert.equal(s.result.uploaded.length, p.daemons.length);
  }
});

test('daemon sequences are distinct and length 2-4', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const p = mk(seed, 4);
    const keys = new Set(p.daemons.map((d) => d.seq.join(' ')));
    assert.equal(keys.size, p.daemons.length);
    for (const d of p.daemons) assert.ok(d.seq.length >= 2 && d.seq.length <= 4);
  }
});

test('daemon matches contiguous substring anywhere in buffer', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['55', 'BD'] }, { id: 'b', type: 'ICEPICK', seq: ['E9', '7A', 'FF'] }]);
  s.buffer = ['1C', '55', 'BD', '1C'];
  assert.equal(E.daemonStatus(s, s.daemons[0]).status, 'uploaded');
  s.buffer = ['55', '1C', 'BD'];
  assert.notEqual(E.daemonStatus(s, s.daemons[0]).status, 'uploaded'); // not contiguous
});

test('partial prefix progress is reported', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['55', 'BD', 'E9'] }]);
  s.buffer = ['1C', '55', 'BD'];
  const st = E.daemonStatus(s, s.daemons[0]);
  assert.equal(st.status, 'pending');
  assert.equal(st.matched, 2);
});

test('impossible daemons are locked when buffer slots are insufficient', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['55', 'BD', 'E9'] }]);
  s.buffer = ['1C', '1C', '1C', '1C'];
  assert.equal(E.daemonStatus(s, s.daemons[0]).status, 'locked'); // 1 slot left, need 3
  s.buffer = ['1C', '1C', '1C'];
  assert.equal(E.daemonStatus(s, s.daemons[0]).status, 'locked'); // 2 slots left, need 3
  s.buffer = ['1C', '1C', '55'];
  assert.equal(E.daemonStatus(s, s.daemons[0]).status, 'pending'); // prefix 55 kept, 2 slots, need 2
});

test('full sweep finishes immediately with bonuses', () => {
  const p = mk(11, 1);
  const s = E.createBreach(p, { streak: 2 });
  for (const { r, c } of p.solutionPath) E.pick(s, r, c);
  const res = s.result;
  assert.equal(res.outcome, 'full');
  assert.ok(res.breakdown.fullSweepScore > 0);
  assert.ok(res.breakdown.fullSweepEddies > 0);
  assert.equal(res.breakdown.streakMult, 1.2);
  assert.ok(res.eddies > 0 && res.score > 0 && res.xp > 0);
});

test('partial execute early with >=1 daemon uploaded', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['1C', '55'] }, { id: 'b', type: 'DATAMINE_V2', seq: ['FF', 'FF'] }]);
  // grid[0][c] = TOKENS[c]; pick (0,0)=1C then col 0: (1,0)=55
  assert.equal(E.executeEarly(s).reason, 'no-daemon');
  E.pick(s, 0, 0); E.pick(s, 1, 0);
  assert.equal(E.executeEarly(s).ok, true);
  assert.equal(s.result.outcome, 'partial');
  assert.deepEqual(s.result.uploaded, ['a']);
});

test('0 daemons uploaded when buffer fills -> breach failed', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['FF', 'FF'] }], 2);
  E.pick(s, 0, 0); E.pick(s, 1, 0);
  assert.equal(s.status, 'done');
  assert.equal(s.result.outcome, 'fail');
});

test('timer does not tick until first pick; expiry fails with 0 daemons', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['FF', 'FF'] }]);
  const t0 = s.timeLeft;
  E.tick(s, 10);
  assert.equal(s.timeLeft, t0);
  assert.equal(s.planElapsed, 10);
  E.pick(s, 0, 0);
  E.tick(s, 5);
  assert.equal(s.timeLeft, t0 - 5);
  E.tick(s, 1000);
  assert.equal(s.status, 'done');
  assert.equal(s.result.outcome, 'fail');
});

test('time expiry with an uploaded daemon yields partial', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['1C', '55'] }, { id: 'b', type: 'DATAMINE_V2', seq: ['FF', 'FF'] }]);
  E.pick(s, 0, 0); E.pick(s, 1, 0);
  E.tick(s, 999);
  assert.equal(s.result.outcome, 'partial');
});

test('quickhack TIME FREEZE pauses timer for 8s', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['FF', 'FF'] }]);
  assert.equal(E.useFreeze(s).reason, 'not-running');
  E.pick(s, 0, 0);
  const t = s.timeLeft;
  assert.equal(E.useFreeze(s).ok, true);
  E.tick(s, 8);
  assert.equal(s.timeLeft, t);
  E.tick(s, 2);
  assert.equal(s.timeLeft, t - 2);
  assert.equal(E.useFreeze(s).reason, 'none');
});

test('quickhack AXIS FLIP switches row<->col once', () => {
  const s = manual([{ id: 'a', type: 'DATAMINE_V1', seq: ['FF', 'FF'] }]);
  assert.equal(E.useFlip(s).reason, 'no-pick');
  E.pick(s, 0, 2); // now column 2
  assert.equal(E.useFlip(s).ok, true);
  assert.equal(s.axis, 'row');
  assert.equal(s.index, 0);
  assert.equal(E.pick(s, 0, 4).ok, true);
  assert.equal(E.useFlip(s).reason, 'none');
});

test('quickhack HINT returns the next solution-path cell', () => {
  const p = mk(9, 2);
  const s = E.createBreach(p, { inv: { freeze: 0, flip: 0, hint: 2 } });
  let h = E.useHint(s);
  assert.deepEqual(h.cell, p.solutionPath[0]);
  E.pick(s, h.cell.r, h.cell.c);
  assert.equal(s.hint, null);
  h = E.useHint(s);
  assert.deepEqual(h.cell, p.solutionPath[1]);
  assert.equal(E.useHint(s).reason, 'none');
});

test('hint after axis flip still yields a valid cell', () => {
  const p = mk(13, 1);
  const s = E.createBreach(p, { inv: { freeze: 0, flip: 1, hint: 1 } });
  E.pick(s, p.solutionPath[0].r, p.solutionPath[0].c);
  E.useFlip(s);
  const h = E.useHint(s);
  assert.ok(h.ok);
  assert.ok(E.isValidPick(s, h.cell.r, h.cell.c));
});

test('run: breach progression, streak, tier, carry time', () => {
  const run = E.createRun({ seed: 5 });
  assert.equal(run.tier, 1);
  const s = E.startBreach(run);
  for (const { r, c } of s.puzzle.solutionPath) E.pick(s, r, c);
  const res = E.applyBreach(run, s);
  assert.equal(res.outcome, 'full');
  assert.equal(run.tier, 2);
  assert.equal(run.streak, 1);
  assert.equal(run.eddies, res.eddies);
  assert.ok(run.badges.includes('full-sweep'));
});

test('run: failed breach ends run', () => {
  const run = E.createRun({ seed: 6 });
  const s = E.startBreach(run);
  E.pick(s, 0, 0);
  E.tick(s, 999);
  if (s.result.outcome === 'fail') {
    E.applyBreach(run, s);
    assert.equal(run.status, 'over');
  } else {
    assert.equal(s.result.outcome, 'partial');
  }
});

test('run: cash out marks win', () => {
  const run = E.createRun({ seed: 7 });
  run.score = 500;
  const r = E.cashOut(run);
  assert.equal(run.status, 'over');
  assert.equal(run.won, true);
  assert.equal(r.score, 500);
});

test('shop: buffer upgrades up to 8 and cost escalates', () => {
  const run = E.createRun();
  run.eddies = 100000;
  assert.equal(E.buy(run, 'buffer').price, 150);
  assert.equal(E.buy(run, 'buffer').price, 300);
  E.buy(run, 'buffer');
  assert.equal(run.bufferSize, 8);
  assert.equal(E.buy(run, 'buffer').reason, 'max');
});

test('shop: time, quickhacks, and insufficient funds', () => {
  const run = E.createRun();
  run.eddies = 100 + 90 + 70 + 80;
  assert.ok(E.buy(run, 'freeze').ok);
  assert.ok(E.buy(run, 'flip').ok);
  assert.ok(E.buy(run, 'hint').ok);
  assert.ok(E.buy(run, 'time').ok);
  assert.equal(run.eddies, 0);
  assert.equal(run.timeBonus, 5);
  assert.deepEqual(run.inv, { freeze: 2, flip: 2, hint: 2 });
  assert.equal(E.buy(run, 'hint').reason, 'funds');
  assert.equal(E.buy(run, 'nope').reason, 'unknown');
});

test('bigger buffer yields longer solution path and startBreach uses upgrades', () => {
  const run = E.createRun({ seed: 3 });
  run.eddies = 1000;
  E.buy(run, 'buffer'); E.buy(run, 'time');
  const s = E.startBreach(run);
  assert.equal(s.bufferSize, 6);
  assert.equal(s.puzzle.solutionPath.length, 6);
  assert.equal(s.timeLimit, E.baseTime(1) + 5);
});

test('MASS_VULN doubles score multiplier; BLACKWALL appears at tier 6+', () => {
  const s = manual([{ id: 'a', type: 'MASS_VULN', seq: ['1C', '55'] }]);
  E.pick(s, 0, 0); E.pick(s, 1, 0);
  assert.equal(s.result.breakdown.scoreMult, 2);
  assert.equal(s.result.breakdown.baseScore, 400);
  for (let seed = 1; seed <= 10; seed++) assert.ok(mk(seed, 6).daemons.some((d) => d.type === 'BLACKWALL_SIPHON'));
});

test('tier names map correctly', () => {
  assert.equal(E.tierName(1), 'Scav Subnet');
  assert.equal(E.tierName(6), 'Arasaka Mikoshi');
  assert.equal(E.tierName(9), 'Blackwall Deep Net 9');
});
