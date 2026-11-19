import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './js/engine.js';
import { MAPS, validateMap, pathCells, COLS, ROWS } from './js/maps.js';

const mk = (i = 0, mode = 'campaign') => E.createGame({ map: MAPS[i], mode });
const step = (s, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) E.update(s, dt); };
// first buildable cell next to the path
const nearPath = (s) => {
  for (let c = 0; c < s.cols; c++) for (let r = 0; r < s.rows; r++) {
    if (s.blocked.has(c + ',' + r)) continue;
    if (s.blocked.has((c + 1) + ',' + r) || s.blocked.has((c - 1) + ',' + r)) return [c, r];
  }
};
// Map 0 runs along row 1 (x = dist - 0.5). A tower at cell (4,2) sits ~1.4 cells from dist 5.
const TC = [4, 2];
const enemyAt = (s, dist, type = 'bot', wave = 1, still = true) => {
  s.spawnQ.push({ at: 0, type, wave });
  E.update(s, 0.001);
  const e = s.enemies[s.enemies.length - 1];
  e.dist = dist; const p = E.positionAt(s, dist); e.x = p.x; e.y = p.y;
  if (still) e.speed = 0;
  return e;
};
const noTimer = (s) => { s.waveTimer = 1e9; };

test('all 3 maps are valid, distinct, and have long enough paths', () => {
  assert.equal(MAPS.length, 3);
  for (const m of MAPS) assert.deepEqual(validateMap(m), [], m.id);
  assert.equal(new Set(MAPS.map((m) => m.id)).size, 3);
  for (const m of MAPS) assert.ok(pathCells(m).size >= 20);
});

test('validateMap rejects diagonal, out-of-bounds and self-overlapping paths', () => {
  assert.ok(validateMap({ path: [[0, 0], [3, 3]] }).length > 0);
  assert.ok(validateMap({ path: [[-1, 2], [4, 2], [4, 30]] }).length > 0);
  assert.ok(validateMap({ path: [[-1, 2], [6, 2], [6, 4], [3, 4], [3, 2], [3, 0]] }).some((e) => e.includes('revisits')));
});

test('placement: accepts a free cell and deducts cash', () => {
  const s = mk(); const [c, r] = nearPath(s);
  const before = s.cash;
  const res = E.placeTower(s, 'firewall', c, r);
  assert.ok(res.ok);
  assert.equal(s.cash, before - E.TOWERS.firewall.cost);
  assert.equal(s.towers.length, 1);
});

test('placement: rejects path, occupied, out-of-bounds, unknown and unaffordable cells', () => {
  const s = mk(); const [c, r] = nearPath(s);
  const [pc, pr] = [...s.blocked][0].split(',').map(Number);
  assert.equal(E.placeTower(s, 'firewall', pc, pr).reason, 'path');
  E.placeTower(s, 'firewall', c, r);
  assert.equal(E.placeTower(s, 'firewall', c, r).reason, 'occupied');
  assert.equal(E.placeTower(s, 'firewall', -1, 0).reason, 'bounds');
  assert.equal(E.placeTower(s, 'firewall', COLS, 0).reason, 'bounds');
  assert.equal(E.placeTower(s, 'nope', c + 3, r).reason, 'unknown');
  s.cash = 10;
  assert.equal(E.placeTower(s, 'tesla', c, r + 2).reason, 'cash');
});

test('upgrade: 3 tiers, costs cash, boosts stats, then refuses at max', () => {
  const s = mk(); s.cash = 5000; const [c, r] = nearPath(s);
  const t = E.placeTower(s, 'firewall', c, r).tower;
  let prevDmg = E.towerStats('firewall', 0).dmg;
  for (let i = 1; i <= 3; i++) {
    const cost = E.upgradeCost(t), cash = s.cash;
    assert.ok(E.upgradeTower(s, t.id).ok);
    assert.equal(s.cash, cash - cost);
    const d = E.towerStats('firewall', t.level).dmg;
    assert.ok(d > prevDmg); prevDmg = d;
  }
  assert.equal(t.level, 3);
  assert.equal(E.upgradeCost(t), null);
  assert.equal(E.upgradeTower(s, t.id).reason, 'max');
  assert.ok(s.achievements.includes('max-level'));
});

test('upgrade is refused when unaffordable', () => {
  const s = mk(); const [c, r] = nearPath(s);
  const t = E.placeTower(s, 'tesla', c, r).tower;
  s.cash = 0;
  assert.equal(E.upgradeTower(s, t.id).reason, 'cash');
  assert.equal(t.level, 0);
});

test('sell refunds 70% of everything spent and frees the cell', () => {
  const s = mk(); s.cash = 5000; const [c, r] = nearPath(s);
  const t = E.placeTower(s, 'mortar', c, r).tower;
  E.upgradeTower(s, t.id);
  const spent = t.spent, cash = s.cash;
  const res = E.sellTower(s, t.id);
  assert.equal(res.value, Math.floor(spent * 0.7));
  assert.equal(s.cash, cash + res.value);
  assert.equal(s.towers.length, 0);
  assert.ok(E.placeTower(s, 'firewall', c, r).ok);
});

test('combat: firewall kills a basic bot and pays the bounty', () => {
  const s = mk(); noTimer(s); s.wave = 1; s.cash = 999;
  E.placeTower(s, 'firewall', ...TC);
  const e = enemyAt(s, 5); e.hp = 5;
  const cash = s.cash;
  step(s, 1);
  assert.ok(s.cash > cash);
  assert.equal(s.stats.kills, 1);
  assert.ok(s.achievements.includes('first-blood'));
});

test('armour reduces firewall damage but beam pierces it', () => {
  const run = (type) => {
    const s = mk(); noTimer(s); s.wave = 1; s.cash = 9999;
    E.placeTower(s, type, ...TC);
    const e = enemyAt(s, 5, 'trojan');
    e.shield = 0; e.hp = e.maxHp = 100000; e.armor = 4;
    step(s, 2);
    return 100000 - e.hp;
  };
  const fw = run('firewall'), beam = run('beam');
  // firewall tier 0: 8 dmg - 4 armour = 4 per hit, ~1.6 hits/s
  assert.ok(fw > 0 && fw <= 4 * 1.6 * 2 + 4, `firewall dealt ${fw}`);
  assert.ok(beam > 26 * 1.9 * 0.95, `beam dealt ${beam}`);
  assert.ok(beam > fw * 3);
});

test('shield soaks damage before hp', () => {
  const s = mk(); noTimer(s); s.wave = 1;
  E.placeTower(s, 'firewall', ...TC);
  const e = enemyAt(s, 5, 'phantom');
  const hp = e.hp;
  step(s, 0.6);
  assert.equal(e.hp, hp);
  assert.ok(e.shield < e.maxShield);
});

test('cryo slows enemies; slow expires', () => {
  const s = mk(); noTimer(s); s.wave = 1;
  const t = E.placeTower(s, 'cryo', ...TC).tower;
  const e = enemyAt(s, 5, 'bot', 1, false); e.hp = e.maxHp = 9999;
  step(s, 0.1);
  assert.ok(e.slowF < 1);
  t.cd = 1e9; // stop pulsing
  step(s, 3);
  assert.equal(e.slowF, 1);
});

test('mortar splash hits clustered enemies, not distant ones', () => {
  const s = mk(); noTimer(s); s.wave = 1; s.cash = 999;
  const mt = E.placeTower(s, 'mortar', ...TC).tower; mt.cd = 1e9;
  const a = enemyAt(s, 5), b = enemyAt(s, 4.6), far = enemyAt(s, 3);
  for (const e of [a, b, far]) e.hp = e.maxHp = 1000;
  mt.cd = 0;
  step(s, 0.1);
  assert.ok(a.hp < 1000 && b.hp < 1000, 'both clustered enemies are hit');
  assert.equal(far.hp, 1000);
});

test('tesla chains to several enemies with falling damage', () => {
  const s = mk(); noTimer(s); s.wave = 1; s.cash = 999;
  const tt = E.placeTower(s, 'tesla', ...TC).tower; tt.cd = 1e9;
  const es = [enemyAt(s, 6), enemyAt(s, 5.5), enemyAt(s, 5)];
  es.forEach((e) => { e.hp = e.maxHp = 1000; });
  tt.cd = 0;
  step(s, 0.1);
  const dmg = es.map((e) => 1000 - e.hp);
  assert.ok(dmg.every((d) => d > 0), 'all three zapped');
  assert.ok(dmg[0] > dmg[1] && dmg[1] > dmg[2], 'damage falls off ' + dmg);
});

test('targeting priority picks first / last / strong / weak / close', () => {
  const s = mk(); noTimer(s); s.wave = 1;
  const t = E.placeTower(s, 'firewall', ...TC).tower;
  const lead = enemyAt(s, 6.6), tail = enemyAt(s, 4.9);
  const expect = { first: lead, last: tail, strong: tail, weak: lead, close: tail };
  for (const [mode, who] of Object.entries(expect)) {
    E.setTargeting(s, t.id, mode);
    lead.hp = lead.maxHp = 1000; tail.hp = tail.maxHp = 2000; t.cd = 0;
    E.update(s, 0.001);
    const hit = lead.hp < 1000 ? lead : tail;
    assert.equal(hit === who, true, mode);
  }
  assert.equal(E.setTargeting(s, t.id, 'bogus'), false);
  assert.equal(E.cycleTargeting(s, t.id), 'first');
});

test('Crypto Worm splits into two fast mini-worms that do not split again', () => {
  const s = mk(); noTimer(s); s.wave = 3;
  E.placeTower(s, 'firewall', ...TC);
  const w = enemyAt(s, 5, 'worm', 3);
  w.hp = 1;
  step(s, 0.1);
  const minis = s.enemies.filter((e) => e.mini);
  assert.equal(minis.length, 2);
  assert.ok(minis.every((m) => m.speed > E.ENEMIES.worm.speed && m.maxHp < w.maxHp));
  minis.forEach((m) => { m.hp = 0.1; m.speed = 0; });
  step(s, 1);
  assert.equal(s.enemies.filter((e) => e.type === 'worm' && !e.mini).length, 0);
  assert.ok(s.stats.wormKills >= 1);
});

test('waves: 20 handcrafted waves, bosses on 5/10/15/20, endless generates beyond', () => {
  assert.equal(E.WAVES.length, 20);
  for (let w = 1; w <= 20; w++) assert.equal(E.isBossWave(w), w % 5 === 0, 'wave ' + w);
  const bossHp = [5, 10, 15, 20].map((w) => {
    const s = mk(); s.wave = w; s.spawnQ.push({ at: 0, type: 'ransomware', wave: w });
    E.update(s, 0.05);
    return s.enemies[0].maxHp;
  });
  assert.ok(bossHp[0] < bossHp[1] && bossHp[1] < bossHp[2] && bossHp[2] < bossHp[3]);
  assert.ok(E.waveDef(37).length > 0 && E.isBossWave(35));
  assert.ok(E.ENEMIES.ransomware.boss && Object.keys(E.ENEMIES).length === 6);
});

test('send-wave: early bonus pays cash, wave spawns enemies over time', () => {
  const s = mk(); const cash = s.cash;
  const res = E.sendWave(s);
  assert.ok(res.ok && s.wave === 1);
  assert.ok(res.bonus >= 0 && s.cash === cash + res.bonus);
  step(s, 3);
  assert.ok(s.enemies.length > 0);
  s.waveTimer = 10;
  const r2 = E.sendWave(s);
  assert.equal(r2.bonus, 15);
});

test('countdown auto-starts the next wave', () => {
  const s = mk();
  step(s, 21);
  assert.equal(s.wave, 1);
});

test('abilities: EMP stuns and has a cooldown; Overclock boosts fire rate', () => {
  const s = mk(); noTimer(s); s.wave = 1;
  E.placeTower(s, 'firewall', ...TC);
  const e = enemyAt(s, 5, 'bot', 1, false); e.hp = e.maxHp = 9999;
  assert.ok(E.useAbility(s, 'emp').ok);
  const d0 = e.dist;
  assert.equal(E.useAbility(s, 'emp').ok, false, 'on cooldown');
  step(s, 1);
  assert.equal(e.dist, d0, 'stunned enemy does not advance');
  step(s, 45);
  assert.equal(s.abilities.emp.cd, 0);
  assert.ok(E.useAbility(s, 'emp').ok);

  const shots = (oc) => {
    const g = mk(); noTimer(g); g.wave = 1;
    E.placeTower(g, 'firewall', ...TC);
    const en = enemyAt(g, 5); en.hp = en.maxHp = 1e6;
    if (oc) E.useAbility(g, 'overclock');
    step(g, 4);
    return 1e6 - en.hp;
  };
  assert.ok(shots(true) > shots(false) * 1.3);
  const s2 = mk();
  assert.ok(E.useAbility(s2, 'overclock').ok);
  assert.equal(E.useAbility(s2, 'overclock').ok, false);
  E.useAbility(s2, 'emp');
  assert.ok(s2.achievements.includes('both-abilities'));
});

test('leaks cost lives and defeat triggers game over', () => {
  const s = mk(); noTimer(s); s.wave = 1;
  s.spawnQ.push({ at: 0, type: 'ransomware', wave: 5 });
  E.update(s, 0.05);
  s.enemies[0].dist = s.pathLen - 0.01;
  E.update(s, 0.1);
  assert.equal(s.lives, s.maxLives - E.ENEMIES.ransomware.lives);
  s.lives = 1; s.spawnQ.push({ at: 0, type: 'bot', wave: 1 });
  E.update(s, 0.05); s.enemies[0].dist = s.pathLen - 0.01; E.update(s, 0.1);
  assert.equal(s.status, 'lost');
  assert.ok(s.events.some((e) => e.type === 'defeat'));
  const cash = s.cash;
  assert.equal(E.placeTower(s, 'firewall', 0, 0).ok, false, 'no actions after game over');
  E.update(s, 1); assert.equal(s.cash, cash);
});

test('victory after wave 20 is cleared; continueEndless resumes play', () => {
  const s = mk(); noTimer(s);
  s.wave = 20; s.clearedWave = 19;
  assert.ok(E.allWavesSent(s));
  E.update(s, 0.05);
  assert.equal(s.status, 'won');
  assert.ok(s.achievements.includes('victory') && s.achievements.includes('flawless'));
  assert.ok(s.score >= s.maxLives * 50);
  assert.ok(E.continueEndless(s));
  assert.equal(s.status, 'running');
  assert.equal(E.allWavesSent(s), false);
});

test('endless mode never wins and keeps sending waves', () => {
  const s = mk(0, 'endless'); noTimer(s);
  s.wave = 20; s.clearedWave = 19;
  E.update(s, 0.05);
  assert.equal(s.status, 'running');
  assert.equal(E.sendWave(s).ok, true);
  assert.equal(s.wave, 21);
});

test('engine is deterministic: same actions give identical results', () => {
  const play = () => {
    const s = mk(1); const [c, r] = nearPath(s);
    E.placeTower(s, 'firewall', c, r); E.placeTower(s, 'tesla', c, r + 2);
    E.sendWave(s); step(s, 60);
    return JSON.stringify([s.score, s.cash, s.lives, s.stats.kills]);
  };
  assert.equal(play(), play());
});

test('headless autoplay on the easy map clears the 20-wave campaign', () => {
  const s = mk(0);
  const cells = [];
  for (let c = 0; c < s.cols; c++) for (let r = 0; r < s.rows; r++) {
    if (s.blocked.has(c + ',' + r)) continue;
    let n = 0;
    for (let d = 0; d < s.pathLen; d += 0.5) { const p = E.positionAt(s, d); if ((p.x - c - 0.5) ** 2 + (p.y - r - 0.5) ** 2 <= 9) n++; }
    cells.push({ c, r, n });
  }
  cells.sort((a, b) => b.n - a.n);
  const order = ['firewall', 'mortar', 'cryo', 'tesla', 'beam', 'firewall', 'mortar', 'tesla'];
  let k = 0, guard = 0;
  while (s.status === 'running' && guard++ < 80000) {
    for (let g = 0; g < 4; g++) {
      if (s.towers.length < 6 + Math.floor(s.wave / 2) && s.towers.length < 22) {
        const cell = cells.find((x) => E.canPlace(s, order[k % order.length], x.c, x.r).ok);
        if (cell && E.placeTower(s, order[k % order.length], cell.c, cell.r).ok) { k++; continue; }
      }
      const up = s.towers.filter((x) => x.level < 3).sort((a, b) => E.upgradeCost(a) - E.upgradeCost(b))[0];
      if (up && E.upgradeTower(s, up.id).ok) continue;
      break;
    }
    if (s.wave === 0 || (!s.enemies.length && !s.spawnQ.length && s.waveTimer > 3)) E.sendWave(s);
    if (s.abilities.emp.cd === 0 && s.enemies.some((e) => e.boss)) E.useAbility(s, 'emp');
    E.update(s, 0.05); s.events.length = 0;
  }
  assert.equal(s.status, 'won');
  assert.ok(s.score > 5000);
});

test('grid constants and engine ignore non-positive dt', () => {
  assert.equal(COLS, 16); assert.equal(ROWS, 10);
  const s = mk(); const t0 = s.time;
  E.update(s, 0); E.update(s, -1); E.update(s, NaN);
  assert.equal(s.time, t0);
});
