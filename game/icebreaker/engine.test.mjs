import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, spawnEnemy, drainEvents, gainXp, generateDraft, chooseUpgrade, applyUpgrade,
  activateChrono, timeScales, continueEndless, runSummary, fingerprint, hurtPlayer, damageEnemy,
  xpForLevel, rand, segDist, angDiff, activeBoss,
  ARENA, CHRONO_DURATION, CHRONO_COOLDOWN, CHRONO_SLOW, CHRONO_BOOST, BOSS_INTERVAL, WEAPONS, WEAPON_IDS,
  PASSIVE_IDS, MAX_ITEM_LEVEL, PLAYER_BASE_SPEED, PLAYER_BASE_PICKUP, ENEMIES,
} from './js/engine.js';

const DT = 1 / 60;
const run = (s, secs, input = {}) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) step(s, DT, input); return s; };
const quiet = (opts = {}) => createGame({ seed: 7, noSpawn: true, ...opts });

test('createGame: sane initial state with starting Smart-Link Pistol', () => {
  const s = quiet();
  assert.equal(s.phase, 'playing');
  assert.equal(s.player.hp, 100);
  assert.equal(s.player.level, 1);
  assert.deepEqual(Object.keys(s.player.weapons), ['smart_pistol']);
  assert.equal(s.enemies.length, 0);
  assert.equal(WEAPON_IDS.length, 6);
  for (const id of WEAPON_IDS) assert.equal(WEAPONS[id].levels.length, MAX_ITEM_LEVEL);
});

test('movement: player moves at base speed and diagonal input is normalized', () => {
  const s = quiet();
  run(s, 1, { mx: 1, my: 0 });
  assert.ok(Math.abs(s.player.x - PLAYER_BASE_SPEED) < 1, `x=${s.player.x}`);
  const d = quiet();
  run(d, 1, { mx: 1, my: 1 });
  assert.ok(Math.abs(Math.hypot(d.player.x, d.player.y) - PLAYER_BASE_SPEED) < 1);
});

test('movement: player is clamped inside arena walls', () => {
  const s = quiet();
  run(s, 20, { mx: -1, my: 1 });
  assert.equal(s.player.x, -ARENA + s.player.r);
  assert.equal(s.player.y, ARENA - s.player.r);
});

test('smart pistol fires a homing bolt that hits and damages the nearest enemy', () => {
  const s = quiet();
  const e = spawnEnemy(s, 'juggernaut', 200, 50);
  e.speed = 0;
  run(s, 1);
  assert.ok(e.hp < e.maxHp, 'enemy took damage');
  const ev = drainEvents(s);
  assert.ok(ev.some(x => x.type === 'shoot' && x.weapon === 'smart_pistol'));
  assert.ok(ev.some(x => x.type === 'hit'));
});

test('weapons do not fire with no targets', () => {
  const s = quiet({ weapons: ['smart_pistol', 'railgun', 'swarm', 'monowire', 'nova'] });
  run(s, 3);
  assert.equal(s.bullets.length, 0);
  assert.ok(!drainEvents(s).some(x => ['shoot', 'rail', 'whip', 'nova'].includes(x.type)));
});

test('railgun pierces every enemy in a line', () => {
  const s = quiet({ weapons: ['railgun'] });
  const line = [150, 250, 350, 450].map(x => { const e = spawnEnemy(s, 'juggernaut', x, 0); e.speed = 0; return e; });
  const off = spawnEnemy(s, 'juggernaut', 0, 400); off.speed = 0;
  run(s, 0.5);
  for (const e of line) assert.ok(e.hp < e.maxHp, 'line enemy hit');
  assert.equal(off.hp, off.maxHp, 'off-line enemy untouched');
  assert.ok(drainEvents(s).some(x => x.type === 'rail' && x.hits >= 4));
});

test('monowire, nova and orbital blades damage nearby enemies; nova slows', () => {
  for (const w of ['monowire', 'nova', 'orbital']) {
    const s = quiet({ weapons: [w] });
    const e = spawnEnemy(s, 'juggernaut', w === 'orbital' ? 78 : 60, 0);
    e.speed = 0;
    run(s, 0.6);
    assert.ok(e.hp < e.maxHp, `${w} dealt damage`);
    if (w === 'nova') assert.ok(e.slowT > 0 && e.slowF < 1, 'nova applied slow');
  }
});

test('swarm micro-daemons explode with area damage', () => {
  const s = quiet({ weapons: ['swarm'] });
  const a = spawnEnemy(s, 'juggernaut', 250, 0); a.speed = 0;
  const b = spawnEnemy(s, 'juggernaut', 280, 20); b.speed = 0;
  run(s, 1.5);
  assert.ok(drainEvents(s).some(x => x.type === 'boom'));
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'both enemies hit by explosion');
});

test('collision: enemy contact damages player and grants invulnerability frames', () => {
  const s = quiet({ weapons: [] });
  spawnEnemy(s, 'scout', 5, 0);
  step(s, DT);
  assert.equal(s.player.hp, 100 - ENEMIES.scout.dmg);
  const hp = s.player.hp;
  step(s, DT);
  assert.equal(s.player.hp, hp, 'i-frames prevent immediate re-hit');
});

test('enemy shooter fires plasma bolts that hit the player', () => {
  const s = quiet({ weapons: [] });
  const sh = spawnEnemy(s, 'shooter', 250, 0);
  sh.cd = 0;
  run(s, 2);
  assert.ok(s.stats.damageTaken > 0);
  assert.ok(drainEvents(s).some(x => x.type === 'eshot'));
});

test('kills drop XP shards that are magnetically pulled in and collected', () => {
  const s = quiet({ weapons: [] });
  const e = spawnEnemy(s, 'scout', 60, 0);
  damageEnemy(s, e, 9999, 0, 0);
  assert.equal(s.kills, 1);
  assert.equal(s.pickups.filter(p => p.kind === 'xp').length, 1);
  run(s, 0.6);
  assert.equal(s.pickups.filter(p => p.kind === 'xp').length, 0);
  assert.equal(s.totalXp, ENEMIES.scout.xp);
});

test('pickups outside magnet range stay put; magnet passive extends range', () => {
  const s = quiet({ weapons: [] });
  s.pickups.push({ kind: 'xp', x: 150, y: 0, value: 1, mag: false, sp: 0, id: 999 });
  run(s, 0.5);
  assert.equal(s.pickups.length, 1);
  applyUpgrade(s, { kind: 'passive', id: 'magnet' });
  assert.ok(s.player.pickupRange > PLAYER_BASE_PICKUP);
  applyUpgrade(s, { kind: 'passive', id: 'magnet' });
  run(s, 0.6);
  assert.equal(s.pickups.length, 0);
});

test('XP leveling: thresholds grow and multiple level-ups queue drafts', () => {
  assert.ok(xpForLevel(2) > xpForLevel(1));
  const s = quiet();
  gainXp(s, xpForLevel(1) + xpForLevel(2) + 1);
  assert.equal(s.player.level, 3);
  assert.equal(s.pendingLevels, 2);
  step(s, DT);
  assert.equal(s.phase, 'levelup');
  assert.equal(s.draft.length, 3);
  const t = s.time;
  step(s, DT);
  assert.equal(s.time, t, 'arena frozen during draft');
  assert.ok(chooseUpgrade(s, 0));
  assert.equal(s.phase, 'levelup', 'second pending draft opens');
  assert.ok(chooseUpgrade(s, 1));
  assert.equal(s.phase, 'playing');
  assert.equal(s.draft, null);
});

test('upgrade draft: 3 unique options, valid levels, maxed items excluded', () => {
  const s = quiet();
  for (let k = 0; k < 50; k++) {
    const d = generateDraft(s);
    assert.equal(d.length, 3);
    const keys = d.map(o => o.kind + o.id);
    assert.equal(new Set(keys).size, 3);
    for (const o of d) assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(o.rarity));
  }
  s.player.weapons.smart_pistol.level = MAX_ITEM_LEVEL;
  for (let k = 0; k < 50; k++) assert.ok(!generateDraft(s).some(o => o.id === 'smart_pistol'));
});

test('upgrade draft: fully maxed build falls back to heal / cash', () => {
  const s = quiet({ weapons: WEAPON_IDS });
  for (const id of WEAPON_IDS) s.player.weapons[id].level = MAX_ITEM_LEVEL;
  for (const id of PASSIVE_IDS) s.player.passives[id] = MAX_ITEM_LEVEL;
  const d = generateDraft(s);
  assert.deepEqual(d.slice(0, 2).map(o => o.kind), ['heal', 'cash']);
});

test('applying upgrades: new weapon, weapon level-up, passives modify stats', () => {
  const s = quiet();
  applyUpgrade(s, { kind: 'weapon', id: 'railgun' });
  assert.equal(s.player.weapons.railgun.level, 1);
  applyUpgrade(s, { kind: 'weapon', id: 'railgun' });
  assert.equal(s.player.weapons.railgun.level, 2);
  s.player.hp = 50;
  applyUpgrade(s, { kind: 'passive', id: 'armor' });
  assert.equal(s.player.maxHp, 120);
  assert.equal(s.player.hp, 80);
  applyUpgrade(s, { kind: 'passive', id: 'reflex' });
  applyUpgrade(s, { kind: 'passive', id: 'ram' });
  applyUpgrade(s, { kind: 'passive', id: 'cooler' });
  assert.ok(Math.abs(s.player.speedMul - 1.1) < 1e-9);
  assert.ok(Math.abs(s.player.fireRate - 1.12) < 1e-9);
  assert.ok(s.player.cdMul < 1);
  for (let i = 0; i < 10; i++) applyUpgrade(s, { kind: 'weapon', id: 'railgun' });
  assert.equal(s.player.weapons.railgun.level, MAX_ITEM_LEVEL, 'capped at Lv5');
});

test('chronoshift: slows enemies to 22%, boosts player 150%, lasts 4.5s then cools down', () => {
  const s = quiet({ weapons: [] });
  const e = spawnEnemy(s, 'scout', 1000, 0);
  assert.ok(activateChrono(s));
  assert.deepEqual(timeScales(s), { player: CHRONO_BOOST, enemy: CHRONO_SLOW });
  assert.equal(activateChrono(s), false, 'cannot re-trigger while active');
  const x0 = e.x;
  run(s, 1, { mx: 0, my: 1 });
  assert.ok(Math.abs((x0 - e.x) - ENEMIES.scout.speed * CHRONO_SLOW) < 2, 'enemy moved at 22%');
  assert.ok(Math.abs(s.player.y - PLAYER_BASE_SPEED * CHRONO_BOOST) < 2, 'player moved at 150%');
  e.dead = true; // remove so it can't flatline the player while we wait
  run(s, CHRONO_DURATION - 1 + 0.05);
  assert.equal(s.chrono.active, false);
  assert.ok(Math.abs(s.chrono.cd - CHRONO_COOLDOWN) < 0.1);
  assert.equal(activateChrono(s), false, 'on cooldown');
  run(s, CHRONO_COOLDOWN + 0.1);
  assert.ok(activateChrono(s), 'ready again after cooldown');
});

test('chronoshift via input flag and cooler passive shortens cooldown', () => {
  const s = quiet({ weapons: [] });
  applyUpgrade(s, { kind: 'passive', id: 'cooler' });
  step(s, DT, { dilate: true });
  assert.equal(s.chrono.active, true);
  assert.ok(drainEvents(s).some(e => e.type === 'chrono_on'));
  run(s, CHRONO_DURATION + 0.05);
  assert.ok(s.chrono.cd < CHRONO_COOLDOWN * 0.9);
});

test('boss spawns every 90 seconds and fires radial bursts', () => {
  const s = quiet({ weapons: [] });
  s.time = BOSS_INTERVAL - 0.01;
  step(s, DT);
  const b = activeBoss(s);
  assert.ok(b, 'boss present');
  assert.equal(s.nextBossAt, BOSS_INTERVAL * 2);
  assert.ok(drainEvents(s).some(e => e.type === 'boss'));
  b.cd = 0;
  step(s, DT);
  assert.ok(s.eshots.length >= 16, 'radial burst');
  b.cd2 = 0;
  const n = s.enemies.length;
  step(s, DT);
  assert.ok(s.enemies.length > n, 'summoned minions');
});

test('victory after the 3rd boss falls, then continue endless', () => {
  const s = quiet({ weapons: [] });
  for (let i = 0; i < 3; i++) {
    const b = spawnEnemy(s, 'boss', 500, 500);
    assert.equal(s.phase, 'playing');
    damageEnemy(s, b, 1e9, 0, 0);
  }
  assert.equal(s.bossesKilled, 3);
  assert.equal(s.phase, 'victory');
  assert.equal(s.won, true);
  const t = s.time; step(s, DT); assert.equal(s.time, t, 'frozen on victory');
  assert.ok(continueEndless(s));
  assert.equal(s.phase, 'playing');
  assert.equal(s.endless, true);
  const b4 = spawnEnemy(s, 'boss', 500, 500);
  damageEnemy(s, b4, 1e9, 0, 0);
  assert.notEqual(s.phase, 'victory', 'no second victory in endless');
  assert.ok(runSummary(s).badges.includes('icebreaker'));
});

test('defeat when integrity reaches zero; summary reports run', () => {
  const s = quiet();
  hurtPlayer(s, 999);
  assert.equal(s.phase, 'dead');
  assert.equal(s.player.hp, 0);
  const sum = runSummary(s);
  assert.equal(sum.won, false);
  for (const k of ['score', 'eddies', 'xp', 'won', 'wave', 'badges']) assert.ok(k in sum, k);
  assert.ok(Array.isArray(sum.badges));
});

test('elite drops a guaranteed chest that grants a draft + eddies', () => {
  const s = quiet({ weapons: [] });
  const e = spawnEnemy(s, 'elite', 40, 0);
  damageEnemy(s, e, 1e9, 0, 0);
  assert.ok(s.pickups.some(p => p.kind === 'chest'));
  run(s, 0.5);
  assert.ok(s.eddies >= 25);
  assert.equal(s.phase, 'levelup');
});

test('armor reduces juggernaut damage; crits deal double', () => {
  const s = quiet();
  const j = spawnEnemy(s, 'juggernaut', 500, 0);
  const ev = [];
  for (let i = 0; i < 40; i++) { damageEnemy(s, j, 10, 0, 0); }
  for (const e of drainEvents(s)) if (e.type === 'hit') ev.push(e);
  assert.ok(ev.some(e => !e.crit && e.amount === Math.round(10 * (1 - ENEMIES.juggernaut.armor))));
  assert.ok(ev.filter(e => e.crit).every(e => e.amount === Math.round(20 * (1 - ENEMIES.juggernaut.armor))));
});

test('director spawns escalating hordes and respects the enemy cap', () => {
  const s = createGame({ seed: 3, weapons: [] });
  s.player.hp = 1e9; s.player.maxHp = 1e9;
  run(s, 10);
  const early = s.enemies.filter(e => !e.dead).length;
  assert.ok(early > 3, `spawned ${early}`);
  run(s, 60);
  assert.ok(s.enemies.length <= 320 + 40);
  assert.ok(s.enemies.some(e => e.type === 'hound'), 'hound packs appear');
});

test('determinism: same seed + inputs => identical simulation; different seed diverges', () => {
  const sim = seed => {
    const s = createGame({ seed });
    for (let i = 0; i < 60 * 40; i++) {
      const t = i / 60;
      step(s, DT, { mx: Math.sin(t), my: Math.cos(t * 0.7), dilate: i === 600 });
      if (s.phase === 'levelup') chooseUpgrade(s, i % 3);
    }
    return fingerprint(s);
  };
  assert.equal(sim(42), sim(42));
  assert.notEqual(sim(42), sim(43));
});

test('helpers: rng range, segment distance, angle difference', () => {
  const s = { rngState: 1 };
  for (let i = 0; i < 1000; i++) { const v = rand(s); assert.ok(v >= 0 && v < 1); }
  assert.equal(segDist(5, 5, 0, 0, 10, 0), 5);
  assert.equal(segDist(-3, 4, 0, 0, 10, 0), 5);
  assert.ok(Math.abs(angDiff(0.1, Math.PI * 2 - 0.1) - 0.2) < 1e-9);
});

test('long simulated run stays stable (no NaN, bounded entities)', () => {
  const s = createGame({ seed: 99 });
  for (let i = 0; i < 60 * 200 && s.phase !== 'dead'; i++) {
    step(s, DT, { mx: Math.cos(i / 90), my: Math.sin(i / 70) });
    if (s.phase === 'levelup') chooseUpgrade(s, 0);
    if (s.phase === 'victory') continueEndless(s);
  }
  assert.ok(Number.isFinite(s.player.x) && Number.isFinite(s.player.y));
  for (const e of s.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.hp));
  assert.ok(s.pickups.length <= 400);
  assert.ok(s.kills > 0);
});
