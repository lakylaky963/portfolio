import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './js/engine.js';

const { GROUND } = E;

/** Fresh game with an empty spawn queue so tests control every enemy. */
function quiet(opts = {}) {
  const s = E.createGame({ seed: 42, ...opts });
  s.queue = [];
  E.drainEvents(s);
  return s;
}
function run(s, secs, dt = 1 / 60) {
  for (let t = 0; t < secs && s.phase === 'wave'; t += dt) E.step(s, dt);
}
/** Park a harmless, nearly frozen enemy far away so the wave does not auto-clear. */
function hold(s) {
  return E.spawnEnemy(s, 'missile', { x: 20, y: -900, target: { x: 20 }, speed: 0.001 });
}
const types = (ev) => ev.map((e) => e.type);

test('createGame sets up 4 districts, 3 loaded batteries and a wave-1 queue', () => {
  const s = E.createGame({ seed: 1 });
  assert.equal(s.districts.length, 4);
  assert.deepEqual(s.districts.map((d) => d.id), ['watson', 'westbrook', 'heywood', 'center']);
  assert.ok(s.districts.every((d) => d.alive));
  assert.equal(s.batteries.length, 3);
  assert.ok(s.batteries.every((b) => b.ammo === 10 && b.maxAmmo === 10));
  assert.equal(s.wave, 1);
  assert.equal(s.phase, 'wave');
  assert.ok(s.queue.length >= 5);
});

test('fire auto-selects the closest ready battery and spends ammo', () => {
  const s = quiet();
  const it = E.fire(s, 1450, 300);
  assert.equal(it.battery, 2);
  assert.equal(s.batteries[2].ammo, 9);
  const it2 = E.fire(s, 150, 300);
  assert.equal(it2.battery, 0);
  assert.equal(s.stats.shots, 2);
});

test('fire honours a preferred battery (keys 1/2/3)', () => {
  const s = quiet();
  const it = E.fire(s, 1500, 200, 0);
  assert.equal(it.battery, 0);
  assert.equal(s.batteries[0].ammo, 9);
});

test('fire cooldown spills over to the next closest battery', () => {
  const s = quiet();
  const a = E.fire(s, 800, 300);
  const b = E.fire(s, 800, 300);
  assert.equal(a.battery, 1);
  assert.notEqual(b.battery, 1);
});

test('empty batteries refuse to fire, then reload over time', () => {
  const s = quiet();
  hold(s);
  for (const b of s.batteries) b.ammo = 0;
  assert.equal(E.fire(s, 800, 300), null);
  assert.ok(types(E.drainEvents(s)).includes('dry'));
  run(s, E.reloadTime(s) + 0.05);
  assert.ok(s.batteries.every((b) => b.ammo === 1));
  assert.ok(E.fire(s, 800, 300));
});

test('destroyed battery cannot fire and is restored next wave', () => {
  const s = quiet();
  s.batteries[1].alive = false;
  const it = E.fire(s, 800, 300);
  assert.notEqual(it.battery, 1);
  s.phase = 'shop';
  E.startNextWave(s);
  assert.ok(s.batteries[1].alive);
});

test('interceptor flies to the crosshair and detonates a plasma blast', () => {
  const s = quiet();
  hold(s);
  E.fire(s, 800, 400);
  assert.equal(s.blasts.length, 0);
  run(s, 1);
  assert.equal(s.interceptors.length, 0);
  const ev = E.drainEvents(s);
  const bl = ev.find((e) => e.type === 'blast');
  assert.ok(bl);
  assert.equal(bl.x, 800);
  assert.equal(bl.y, 400);
});

test('velocity upgrade makes interceptors arrive sooner', () => {
  const a = quiet();
  const b = quiet();
  b.upgrades.velocity = 3;
  hold(a);
  hold(b);
  E.fire(a, 800, 200);
  E.fire(b, 800, 200);
  run(a, 0.5);
  run(b, 0.5);
  assert.ok(a.interceptors.length === 1, 'slow interceptor still flying');
  assert.equal(b.interceptors.length, 0, 'fast interceptor already detonated');
});

test('blast destroys a missile in range and pays score + eddies', () => {
  const s = quiet();
  E.spawnEnemy(s, 'missile', { x: 500, y: 300, target: { x: 500 } });
  E.detonate(s, 510, 305);
  run(s, 0.2);
  assert.equal(s.enemies.length, 0);
  assert.ok(s.score > 0);
  assert.ok(s.eddies >= E.ENEMY_DEFS.missile.bounty);
  assert.equal(s.stats.kills, 1);
});

test('enemies outside the blast survive', () => {
  const s = quiet();
  E.spawnEnemy(s, 'missile', { x: 100, y: 100, target: { x: 330 } });
  E.detonate(s, 1200, 500);
  run(s, 0.7);
  assert.equal(s.enemies.length, 1);
});

test('chain reactions propagate through clustered threats with combo labels', () => {
  const s = quiet();
  for (let i = 0; i < 6; i++) E.spawnEnemy(s, 'missile', { x: 300 + i * 55, y: 300, target: { x: 590 }, speed: 0.01 });
  E.detonate(s, 300, 300);
  run(s, 3);
  assert.equal(s.enemies.length, 0);
  assert.ok(s.stats.maxChain >= 5);
  const all = [];
  // replay to capture labels
  const t = quiet();
  for (let i = 0; i < 6; i++) E.spawnEnemy(t, 'missile', { x: 300 + i * 55, y: 300, target: { x: 590 }, speed: 0.01 });
  E.detonate(t, 300, 300);
  for (let k = 0; k < 180 && t.phase === 'wave'; k++) {
    E.step(t, 1 / 60);
    all.push(...E.drainEvents(t));
  }
  const labels = all.filter((e) => e.type === 'chain').map((e) => e.label);
  assert.deepEqual(labels, ['2x', '3x', '5x']);
});

test('chainLabel tiers', () => {
  assert.equal(E.chainLabel(1), null);
  assert.equal(E.chainLabel(2), '2x');
  assert.equal(E.chainLabel(4), '3x');
  assert.equal(E.chainLabel(6), '5x');
  assert.equal(E.chainLabel(12), 'MEGA BREACH!');
});

test('combo multiplier climbs with kills and decays after the window', () => {
  const s = quiet();
  E.spawnEnemy(s, 'missile', { x: 500, y: 300, target: { x: 590 }, speed: 0.01 });
  E.spawnEnemy(s, 'missile', { x: 1100, y: 300, target: { x: 1010 }, speed: 0.01 });
  E.spawnEnemy(s, 'missile', { x: 200, y: 50, target: { x: 330 }, speed: 0.01 });
  E.detonate(s, 500, 300);
  E.detonate(s, 1100, 300);
  run(s, 0.2);
  assert.equal(s.mult, 1.5);
  run(s, E.COMBO_WINDOW + 0.2);
  assert.equal(s.mult, 1);
});

test('MIRV splits into three sub-munitions at its split altitude', () => {
  const s = quiet();
  const m = E.spawnEnemy(s, 'mirv', { x: 800, y: 0, target: { x: 590 }, splitY: 100, speed: 300 });
  run(s, 0.5);
  assert.ok(!s.enemies.includes(m));
  const subs = s.enemies.filter((e) => e.type === 'sub');
  assert.equal(subs.length, 3);
  assert.ok(subs.every((e) => e.y >= 99));
});

test('heavy pod needs two blasts, but a direct railgun hit kills instantly', () => {
  const s = quiet();
  const m = E.spawnEnemy(s, 'meteor', { x: 400, y: 300, target: { x: 330 }, speed: 0.01 });
  E.detonate(s, 400 + 60, 300, { direct: false });
  run(s, 0.4);
  assert.ok(s.enemies.includes(m));
  assert.equal(m.hp, 1);
  const s2 = quiet();
  const m2 = E.spawnEnemy(s2, 'meteor', { x: 400, y: 300, target: { x: 330 }, speed: 0.01 });
  E.detonate(s2, 405, 302);
  run(s2, 0.1);
  assert.ok(m2.dead);
});

test('dreadnought shields absorb hits before the core; defeat pays a huge bounty', () => {
  const s = quiet({ wave: 5 });
  s.queue = [];
  const boss = E.spawnEnemy(s, 'dreadnought', { x: 800, y: 150, salvoT: 999 });
  const shield0 = boss.shield;
  E.detonate(s, 800, 150);
  run(s, 0.1);
  assert.equal(boss.shield, shield0 - 1);
  assert.equal(boss.core, boss.coreMax);
  boss.shield = 0;
  boss.core = 1;
  const before = s.eddies;
  E.detonate(s, boss.x, boss.y);
  const ev = [];
  for (let k = 0; k < 6; k++) {
    E.step(s, 1 / 60);
    ev.push(...E.drainEvents(s));
  }
  assert.ok(boss.dead);
  assert.ok(types(ev).includes('bossDefeated'));
  assert.ok(s.eddies - before >= E.ENEMY_DEFS.dreadnought.bounty);
  assert.equal(s.stats.bossKills, 1);
});

test('dreadnought fires missile salvos', () => {
  const s = quiet({ wave: 10 });
  s.queue = [];
  E.spawnEnemy(s, 'dreadnought', { x: 800, y: 150, salvoT: 0.05 });
  run(s, 0.1);
  assert.equal(s.enemies.filter((e) => e.type === 'missile').length, 3 + 2);
});

test('drone carrier drops bombs while crossing, then escapes', () => {
  const s = quiet({ wave: 2 });
  s.queue = [];
  E.spawnEnemy(s, 'emp_bomber', { fromLeft: true, x: 300, y: 150, dropT: 0.05 });
  run(s, 0.2);
  assert.ok(s.enemies.some((e) => e.type === 'bomb'));
  const b = s.enemies.find((e) => e.type === 'emp_bomber');
  b.x = E.W + 79;
  run(s, 0.1);
  assert.ok(!s.enemies.includes(b));
});

test('impact on an unshielded district destroys it; shields deflect instead', () => {
  const s = quiet();
  E.spawnEnemy(s, 'missile', { x: 330, y: GROUND - 30, target: { x: 330 }, speed: 400 });
  run(s, 0.2);
  assert.equal(s.districts[0].alive, false);
  assert.equal(s.stats.districtsLost, 1);
  const s2 = quiet();
  s2.districts[1].shield = 1;
  E.spawnEnemy(s2, 'missile', { x: 590, y: GROUND - 30, target: { x: 590 }, speed: 400 });
  run(s2, 0.2);
  const ev = E.drainEvents(s2);
  assert.ok(s2.districts[1].alive);
  assert.equal(s2.districts[1].shield, 0);
  assert.ok(types(ev).includes('shieldHit'));
});

test('game over when all four districts fall', () => {
  const s = quiet();
  for (const d of s.districts) E.spawnEnemy(s, 'missile', { x: d.x, y: GROUND - 30, target: { x: d.x }, speed: 400 });
  run(s, 0.3);
  assert.equal(s.phase, 'over');
  assert.equal(E.aliveDistricts(s), 0);
  assert.ok(types(E.drainEvents(s)).includes('gameOver'));
  assert.equal(E.fire(s, 800, 300), null);
});

test('clearing a wave awards district/ammo bonus and opens the shop', () => {
  const s = quiet();
  const before = s.eddies;
  run(s, 0.1);
  assert.equal(s.phase, 'shop');
  assert.ok(s.lastBonus.eddies > 0);
  assert.equal(s.lastBonus.districts, 4);
  assert.equal(s.eddies - before, s.lastBonus.eddies);
  s.batteries[0].ammo = 2;
  assert.ok(E.startNextWave(s));
  assert.equal(s.wave, 2);
  assert.equal(s.phase, 'wave');
  assert.equal(s.batteries[0].ammo, s.batteries[0].maxAmmo);
});

test('waveSpec scales: bosses on 5/10/15, threat classes unlock, counts grow', () => {
  const r = () => 0.05; // always rolls the rarest class available
  assert.ok(!E.waveSpec(1, r).some((x) => x.type !== 'missile'));
  assert.ok(E.waveSpec(2, r).some((x) => x.type === 'emp_bomber'));
  assert.ok(E.waveSpec(3, r).some((x) => x.type === 'mirv'));
  assert.ok(E.waveSpec(4, r).some((x) => x.type === 'stealth'));
  assert.ok(E.waveSpec(6, r).some((x) => x.type === 'meteor'));
  for (const n of [5, 10, 15]) assert.equal(E.waveSpec(n).filter((x) => x.type === 'dreadnought').length, 1);
  assert.equal(E.waveSpec(7).filter((x) => x.type === 'dreadnought').length, 0);
  assert.ok(E.waveSpec(12).length > E.waveSpec(2).length);
  const spec = E.waveSpec(8);
  for (let i = 1; i < spec.length; i++) assert.ok(spec[i].at >= spec[i - 1].at);
});

test('shop rejects purchases without enough eddies or outside the shop', () => {
  const s = quiet();
  assert.equal(E.buy(s, 'blast').reason, 'phase');
  s.phase = 'shop';
  s.eddies = 10;
  const r = E.buy(s, 'blast');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'funds');
  assert.equal(s.upgrades.blast, 0);
  assert.equal(s.eddies, 10);
});

test('blast radius upgrade deducts cost and enlarges shockwaves; costs escalate', () => {
  const s = quiet();
  s.phase = 'shop';
  s.eddies = 1000;
  const r0 = E.blastRadius(s);
  const c0 = E.upgradeCost(s, 'blast');
  assert.equal(c0, 110);
  assert.ok(E.buy(s, 'blast').ok);
  assert.equal(s.eddies, 1000 - c0);
  assert.ok(E.blastRadius(s) > r0);
  assert.equal(E.upgradeCost(s, 'blast'), 185);
  assert.equal(E.upgradeCost(s, 'autoloader'), 110);
  assert.equal(E.upgradeCost(s, 'velocity'), 90);
  assert.equal(E.upgradeCost(s, 'ciws'), 220);
  assert.equal(E.upgradeCost(s, 'shield'), 200);
  assert.equal(E.upgradeCost(s, 'rebuild'), 300);
});

test('autoloader increases clip size and reload speed; max level enforced', () => {
  const s = quiet();
  s.phase = 'shop';
  s.eddies = 1e6;
  const rt = E.reloadTime(s);
  assert.ok(E.buy(s, 'autoloader').ok);
  assert.equal(s.batteries[0].maxAmmo, 13);
  assert.ok(E.reloadTime(s) < rt);
  for (let i = 0; i < 4; i++) E.buy(s, 'autoloader');
  assert.equal(E.buy(s, 'autoloader').reason, 'max');
});

test('holo-shield upgrade shields living districts and regenerates', () => {
  const s = quiet();
  s.districts[3].alive = false;
  s.phase = 'shop';
  s.eddies = 1000;
  assert.ok(E.buy(s, 'shield').ok);
  assert.deepEqual(s.districts.map((d) => d.shield), [1, 1, 1, 0]);
  s.phase = 'wave';
  E.spawnEnemy(s, 'missile', { x: 100, y: 0, target: { x: 100 }, speed: 0.001 });
  s.districts[0].shield = 0;
  run(s, E.SHIELD_REGEN + 0.2);
  assert.equal(s.districts[0].shield, 1);
});

test('rebuild megatower restores a destroyed district', () => {
  const s = quiet();
  s.districts[2].alive = false;
  s.phase = 'shop';
  s.eddies = 1000;
  assert.equal(E.buy(s, 'rebuild', 0).reason, 'none');
  const r = E.buy(s, 'rebuild');
  assert.ok(r.ok);
  assert.ok(s.districts[2].alive);
  assert.equal(s.eddies, 1000 - E.UPGRADES.rebuild.base);
  assert.equal(E.buy(s, 'rebuild').reason, 'none');
});

test('auto-CIWS laser zaps missiles close to the skyline', () => {
  const s = quiet();
  s.upgrades.ciws = 1;
  s.ciwsT = 0;
  E.spawnEnemy(s, 'missile', { x: 500, y: GROUND - 200, target: { x: 590 }, speed: 0.01 });
  E.spawnEnemy(s, 'missile', { x: 500, y: 100, target: { x: 590 }, speed: 0.01 });
  E.step(s, 1 / 60);
  const ev = E.drainEvents(s);
  assert.ok(types(ev).includes('zap'));
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].y, 100 + s.enemies[0].vy / 60);
});

test('EMP sky-pulse fries light missiles, slows heavies, then goes on cooldown', () => {
  const s = quiet();
  E.spawnEnemy(s, 'missile', { x: 300, y: 200, target: { x: 330 } });
  E.spawnEnemy(s, 'stealth', { x: 700, y: 200, target: { x: 590 } });
  E.spawnEnemy(s, 'mirv', { x: 900, y: 100, target: { x: 1010 } });
  const met = E.spawnEnemy(s, 'meteor', { x: 1200, y: 100, target: { x: 1270 } });
  assert.ok(E.useEMP(s));
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0], met);
  assert.ok(met.slow > 0);
  assert.equal(s.stats.empKills, 3);
  assert.equal(E.useEMP(s), false);
  run(s, 0.5);
  assert.ok(s.abilities.emp.cd < E.EMP_CD);
});

test('Sandevistan slows threats to 25% and doubles battery reload', () => {
  const a = quiet();
  const b = quiet();
  const ea = E.spawnEnemy(a, 'missile', { x: 800, y: 0, target: { x: 800 }, speed: 100 });
  const eb = E.spawnEnemy(b, 'missile', { x: 800, y: 0, target: { x: 800 }, speed: 100 });
  a.batteries[0].ammo = 0;
  b.batteries[0].ammo = 0;
  assert.ok(E.useSandevistan(b));
  assert.equal(E.useSandevistan(b), false);
  run(a, 1);
  run(b, 1);
  assert.ok(Math.abs(eb.y - ea.y * E.SANDY_SCALE) < 1);
  assert.ok(b.batteries[0].ammo + b.batteries[0].reload / E.reloadTime(b) > a.batteries[0].ammo + a.batteries[0].reload / E.reloadTime(a));
  run(b, E.SANDY_DUR);
  assert.equal(b.abilities.sandy.active, 0);
});

test('surviving wave 15 is a victory; endless mode continues past it', () => {
  const s = quiet({ wave: 15 });
  s.queue = [];
  run(s, 0.1);
  assert.equal(s.phase, 'victory');
  assert.ok(E.runBadges(s).includes('night-city-saved'));
  assert.ok(E.continueEndless(s));
  assert.equal(s.phase, 'shop');
  E.startNextWave(s);
  assert.equal(s.wave, 16);
  s.queue = [];
  run(s, 0.1);
  assert.equal(s.phase, 'shop');
});

test('simulation is deterministic for a given seed', () => {
  const play = () => {
    const s = E.createGame({ seed: 777 });
    for (let i = 0; i < 60 * 25; i++) {
      if (i % 40 === 0 && s.enemies[0]) E.fire(s, s.enemies[0].x, s.enemies[0].y + 40);
      E.step(s, 1 / 60);
    }
    return [s.score, s.eddies, s.stats.kills, s.enemies.length, E.aliveDistricts(s)].join(',');
  };
  assert.equal(play(), play());
});

test('a full auto-played wave-1 resolves to shop or game over without errors', () => {
  const s = E.createGame({ seed: 9 });
  for (let i = 0; i < 60 * 120 && s.phase === 'wave'; i++) {
    if (i % 20 === 0) {
      const e = s.enemies.filter((x) => x.y > 150).sort((a, b) => b.y - a.y)[0];
      if (e) E.fire(s, e.x + e.vx * 0.6, e.y + e.vy * 0.6);
    }
    E.step(s, 1 / 60);
  }
  assert.ok(['shop', 'over'].includes(s.phase));
  assert.ok(s.stats.kills > 0);
});
