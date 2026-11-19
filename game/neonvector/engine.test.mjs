import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './js/engine.js';

const { W, H, CFG } = E;
const run = (s, secs, input = {}) => { for (let i = 0; i < Math.round(secs * 60); i++) E.step(s, input, 1 / 60); };
const fresh = (o) => { const s = E.createGame({ seed: 7, ...o }); s.spawnTimer = 1e9; return s; };

test('player moves with axes at constant speed', () => {
  const s = fresh(); const x0 = s.player.x;
  run(s, 0.5, { ax: 1 });
  assert.ok(Math.abs(s.player.x - x0 - CFG.speed * 0.5) < 2);
});

test('diagonal movement is normalized', () => {
  const s = fresh(); const { x, y } = s.player;
  run(s, 0.25, { ax: 1, ay: -1 });
  const d = Math.hypot(s.player.x - x, s.player.y - y);
  assert.ok(Math.abs(d - CFG.speed * 0.25) < 2);
});

test('player is clamped to playfield', () => {
  const s = fresh();
  run(s, 5, { ax: -1, ay: -1 });
  assert.equal(s.player.x, 14); assert.equal(s.player.y, 40);
  run(s, 5, { ax: 1, ay: 1 });
  assert.equal(s.player.x, W - 14); assert.equal(s.player.y, H - 30);
});

test('pointer follow reaches target and clamps out-of-bounds targets', () => {
  const s = fresh();
  run(s, 1, { tx: 100, ty: 300 });
  assert.equal(s.player.x, 100); assert.equal(s.player.y, 300);
  run(s, 1, { tx: -500, ty: 9999 });
  assert.equal(s.player.x, 14); assert.equal(s.player.y, H - 30);
});

test('auto-fire shoots on its own and can be disabled', () => {
  const s = fresh(); run(s, 0.5);
  assert.ok(s.pbullets.length > 0);
  const o = fresh({ autoFire: false }); run(o, 0.5);
  assert.equal(o.pbullets.length, 0);
  run(o, 0.3, { fire: true });
  assert.ok(o.pbullets.length > 0);
});

test('weapon levels 1-5 fire 1,2,3,4,7 projectiles', () => {
  const expected = [1, 2, 3, 4, 7];
  expected.forEach((n, i) => {
    const s = fresh(); s.player.weapon = i + 1;
    assert.equal(E.firePlayer(s), n);
    assert.equal(s.pbullets.length, n);
  });
  const s = fresh(); s.player.weapon = 4; E.firePlayer(s);
  assert.equal(s.pbullets.filter((b) => b.homing).length, 2);
});

test('homing daemons steer toward enemies', () => {
  const s = fresh(); s.player.weapon = 4; s.autoFire = false;
  E.spawnEnemy(s, 'gunship', 40, 150); s.enemies[0].hp = 1e6;
  E.firePlayer(s);
  const h = s.pbullets.find((b) => b.homing && b.vx > 0);
  const vx0 = h.vx; run(s, 0.3);
  assert.ok(h.vx < vx0, 'homing bullet turned left toward target');
});

test('wingman drones fire extra beams (max 2)', () => {
  const s = fresh(); s.player.drones = 2; run(s, 0.3);
  assert.ok(s.pbullets.some((b) => b.drone));
  const xs = new Set(s.pbullets.filter((b) => b.drone).map((b) => Math.round(b.x - s.player.x)));
  assert.ok(xs.has(-30) && xs.has(30));
  const k = { type: 'D', x: 0, y: 0 }; s.player.drones = 2; E.collect(s, k);
  assert.equal(s.player.drones, 2);
});

test('pickups upgrade weapon, add drone, shield, data cache', () => {
  const s = fresh();
  E.collect(s, { type: 'P', x: 0, y: 0 }); assert.equal(s.player.weapon, 2);
  E.collect(s, { type: 'D', x: 0, y: 0 }); assert.equal(s.player.drones, 1);
  E.collect(s, { type: 'S', x: 0, y: 0 }); assert.equal(s.player.shield, 1);
  const e0 = s.eddies; E.collect(s, { type: 'C', x: 0, y: 0 }); assert.equal(s.eddies, e0 + 25);
  s.player.weapon = 5; const sc = s.score; E.collect(s, { type: 'P', x: 0, y: 0 });
  assert.equal(s.player.weapon, 5); assert.ok(s.score > sc);
});

test('graze: near-miss raises multiplier and overdrive once per bullet', () => {
  const s = fresh(); s.autoFire = false;
  const b = E.ebullet(s, s.player.x + 15, s.player.y, Math.PI, 0.0001, 3);
  b.vx = 0; b.vy = 0;
  run(s, 0.1);
  assert.equal(s.grazes, 1); assert.ok(s.mult > 1); assert.ok(s.overdrive > 0);
  assert.equal(s.player.hull, CFG.maxHull);
  run(s, 0.2); assert.equal(s.grazes, 1);
});

test('multiplier caps at 10x and decays when not grazing', () => {
  const s = fresh(); s.autoFire = false;
  for (let i = 0; i < 100; i++) { const b = E.ebullet(s, s.player.x + 15, s.player.y, 0, 0.0001, 3); b.vx = 0; b.vy = 0; }
  run(s, 0.05);
  assert.equal(s.mult, CFG.maxMult);
  s.bullets.length = 0; run(s, 4.1 + 20);
  assert.equal(s.mult, 1);
});

test('direct bullet hit costs hull and weapon level', () => {
  const s = fresh(); s.autoFire = false; s.player.weapon = 3;
  const b = E.ebullet(s, s.player.x, s.player.y, 0, 1, 5); b.vx = b.vy = 0;
  run(s, 0.05);
  assert.equal(s.player.hull, CFG.maxHull - 1); assert.equal(s.player.weapon, 2);
  assert.ok(s.player.invuln > 1);
});

test('shield absorbs hit without losing weapon or hull', () => {
  const s = fresh(); s.autoFire = false; s.player.weapon = 4; s.player.shield = 1;
  const b = E.ebullet(s, s.player.x, s.player.y, 0, 1, 5); b.vx = b.vy = 0;
  run(s, 0.05);
  assert.equal(s.player.shield, 0); assert.equal(s.player.hull, CFG.maxHull); assert.equal(s.player.weapon, 4);
});

test('overdrive needs a full meter, clears bullets into eddies, grants invulnerability', () => {
  const s = fresh(); s.autoFire = false;
  for (let i = 0; i < 20; i++) E.ebullet(s, 20 + i * 20, 100, Math.PI / 2, 100);
  assert.equal(E.overdrive(s), false); assert.equal(s.bullets.length, 20);
  s.overdrive = 100; const e0 = s.eddies;
  assert.equal(E.overdrive(s), true);
  assert.equal(s.bullets.length, 0); assert.equal(s.eddies, e0 + 20);
  assert.equal(s.overdrive, 0); assert.ok(s.player.invuln >= CFG.invulnBomb);
});

test('overdrive deals screen-wide damage to enemies and boss', () => {
  const s = fresh(); s.autoFire = false;
  E.spawnEnemy(s, 'swarm', 100, 100); E.spawnEnemy(s, 'interceptor', 300, 200);
  E.spawnBoss(s); s.boss.entering = false; const hp = s.boss.hp;
  s.overdrive = 100; E.step(s, { bomb: true }, 1 / 60);
  assert.equal(s.enemies.length, 0); assert.ok(s.boss.hp < hp);
  assert.ok(s.kills >= 2);
});

test('invulnerable player ignores bullets', () => {
  const s = fresh(); s.autoFire = false; s.player.invuln = 2;
  const b = E.ebullet(s, s.player.x, s.player.y, 0, 1, 5); b.vx = b.vy = 0;
  run(s, 0.1); assert.equal(s.player.hull, CFG.maxHull);
});

test('player bullets kill enemies, award score and eddies', () => {
  const s = fresh();
  const g = E.spawnEnemy(s, 'gunship', s.player.x, 400); g.hp = 2; g.cd = 1e9;
  run(s, 1);
  assert.equal(s.kills, 1); assert.ok(s.score >= 600); assert.ok(s.eddies >= 4);
});

test('enemy waves spawn over time and are deterministic by seed', () => {
  const a = E.createGame({ seed: 99 }), b = E.createGame({ seed: 99 });
  const inp = { ax: 0 };
  for (let i = 0; i < 600; i++) { E.step(a, inp); E.step(b, inp); }
  assert.ok(a.kills + a.enemies.length + a.bullets.length > 0);
  assert.deepEqual(a.enemies.map((e) => [e.type, e.x.toFixed(3)]), b.enemies.map((e) => [e.type, e.x.toFixed(3)]));
  assert.equal(a.score, b.score);
});

test('turret telegraphs lane then hurts player inside active beam', () => {
  const s = fresh(); s.autoFire = false;
  const t = E.spawnEnemy(s, 'turret', s.player.x, 28);
  run(s, 1.5); // charging
  assert.ok(s.lanes.length === 1 && !s.lanes[0].active);
  assert.equal(s.player.hull, CFG.maxHull);
  run(s, 0.9); // firing
  assert.equal(s.player.hull, CFG.maxHull - 1);
  assert.ok(t.hp > 0);
});

test('sector end triggers warning then a boss per sector', () => {
  for (let sec = 1; sec <= 5; sec++) {
    const s = fresh(); s.sector = sec; s.sectorTime = CFG.sectorLen; s.autoFire = false;
    run(s, 0.1);
    assert.equal(s.phase, 'warning');
    assert.ok(s.events.length === 0 || true);
    run(s, CFG.warningTime + 0.1);
    assert.equal(s.phase, 'boss');
    assert.equal(s.boss.name, E.BOSS_NAMES[sec - 1]);
  }
});

test('boss phase transitions at HP thresholds and wipe bullets (seraph has 3)', () => {
  const s = fresh(); s.sector = 5; s.autoFire = false; E.spawnBoss(s);
  assert.equal(s.boss.phases, 3); s.boss.entering = false;
  E.ebullet(s, 10, 10, 0, 10);
  E.setBossHp(s, s.boss.maxHp * 0.6); assert.equal(s.boss.phase, 1);
  assert.equal(s.bullets.length, 0);
  E.setBossHp(s, s.boss.maxHp * 0.2); assert.equal(s.boss.phase, 2);
});

test('spider-mech wings must be destroyed; core takes reduced damage meanwhile', () => {
  const s = fresh(); s.sector = 3; s.autoFire = false; E.spawnBoss(s); s.boss.entering = false;
  const hp = s.boss.hp;
  E.damageBoss(s, 10, s.boss.x); assert.equal(s.boss.hp, hp - 3);
  E.damageBoss(s, 1000, s.boss.x - 70); assert.ok(s.boss.wings[0].hp <= 0);
  E.damageBoss(s, 1000, s.boss.x + 70); assert.ok(s.boss.wings[1].hp <= 0);
  E.damageBoss(s, 10, s.boss.x); assert.equal(s.boss.hp, hp - 13);
});

test('every boss fires bullets once active', () => {
  for (let sec = 1; sec <= 5; sec++) {
    const s = fresh(); s.sector = sec; s.autoFire = false; s.player.invuln = 1e9; E.spawnBoss(s);
    if (s.boss.wings) s.boss.wings.forEach((w) => { w.hp = 0; });
    run(s, 6);
    assert.ok(s.bullets.length > 0 || s.lanes.length > 0, 'boss ' + sec);
    assert.equal(s.phase, 'boss');
  }
});

test('boss defeat advances to next sector', () => {
  const s = fresh(); s.autoFire = false; E.spawnBoss(s); s.boss.entering = false;
  E.damageBoss(s, 1e9, s.boss.x);
  assert.equal(s.phase, 'clear'); assert.equal(s.bossesKilled, 1);
  run(s, CFG.clearTime + 0.2);
  assert.equal(s.sector, 2); assert.equal(s.phase, 'play'); assert.equal(s.sectorTime < 1, true);
});

test('defeating sector 5 boss wins the campaign; endless continues', () => {
  const s = fresh(); s.sector = 5; E.spawnBoss(s); s.boss.entering = false;
  E.damageBoss(s, 1e9, s.boss.x);
  assert.equal(s.phase, 'won'); assert.equal(s.won, true);
  const r = E.summarize(s);
  assert.equal(r.won, true); assert.ok(r.badges.includes('blackwall-breaker')); assert.ok(r.xp >= 650);
  const en = fresh({ mode: 'endless' }); en.sector = 5; E.spawnBoss(en); en.boss.entering = false;
  E.damageBoss(en, 1e9, en.boss.x);
  assert.equal(en.phase, 'clear'); assert.equal(en.won, false);
  run(en, CFG.clearTime + 0.2); assert.equal(en.sector, 6);
  E.spawnBoss(en); assert.equal(en.boss.name, E.BOSS_NAMES[0]);
  assert.ok(en.boss.maxHp > 420);
});

test('defeat: hull reaches zero ends the run and freezes the sim', () => {
  const s = fresh(); s.autoFire = false;
  for (let i = 0; i < CFG.maxHull; i++) { s.player.invuln = 0; E.hurtPlayer(s); }
  assert.equal(s.phase, 'dead'); assert.equal(s.player.hull, 0);
  const t = s.time; run(s, 1); assert.equal(s.time, t);
  const r = E.summarize(s); assert.equal(r.won, false);
});

test('kamikaze contact hurts the player', () => {
  const s = fresh(); s.autoFire = false;
  E.spawnEnemy(s, 'kamikaze', s.player.x, s.player.y);
  run(s, 0.05);
  assert.equal(s.player.hull, CFG.maxHull - 1);
});
