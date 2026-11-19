import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './js/engine.js';
import { t, stageTitle } from './js/i18n.js';

const EMPTY = ['............'];
const run = (s, secs, dt = 1 / 120, input = {}) => { for (let t = 0; t < secs; t += dt) E.step(s, dt, input); };
const freeBall = (s, x, y, vx, vy) => { const b = E.makeBall(s, x, y, vx, vy); s.balls = [b]; return b; };
const types = (s) => s.events.map((e) => e.type);

test('10 handcrafted stages, bosses every 3rd stage, endless loop wraps layouts', () => {
  assert.equal(E.STAGES.length, 10);
  assert.ok(E.isBossLevel(3) && E.isBossLevel(6) && E.isBossLevel(9) && E.isBossLevel(12));
  assert.ok(!E.isBossLevel(1) && !E.isBossLevel(10));
  assert.equal(E.stageFor(11), E.STAGES[0]);
  for (const st of E.STAGES) assert.ok(st.rows.every((r) => r.length === E.COLS), st.name);
  const s = E.createGame({ level: 3 });
  assert.ok(s.boss && s.boss.alive);
  assert.equal(E.createGame({ level: 2 }).boss, null);
});

test('all 6 brick types are parsed with correct HP', () => {
  const s = E.createGame({ layout: ['123X#SV'.padEnd(12, '.')] });
  const byType = s.bricks.map((b) => [b.type, b.hp]);
  assert.deepEqual(byType, [['node', 1], ['armor', 2], ['armor', 3], ['explosive', 1], ['chrome', 3], ['sentinel', 1], ['vault', 1]]);
});

test('ball starts attached and launches upward', () => {
  const s = E.createGame({ layout: EMPTY });
  assert.equal(s.balls.length, 1);
  assert.ok(s.balls[0].attached);
  run(s, 0.1);
  assert.ok(s.balls[0].attached, 'stays glued to paddle until launch');
  assert.ok(E.launch(s));
  assert.ok(!s.balls[0].attached && s.balls[0].vy < 0);
});

test('ball physics: reflects off side and top walls, conserves speed', () => {
  const s = E.createGame({ layout: EMPTY });
  const b = freeBall(s, 20, 300, -300, -200);
  b.speed = Math.hypot(300, 200);
  run(s, 0.1);
  assert.ok(b.vx > 0, 'bounced off left wall');
  const b2 = freeBall(s, 480, 20, 100, -350);
  b2.speed = Math.hypot(100, 350);
  run(s, 0.1);
  assert.ok(b2.vy > 0, 'bounced off ceiling');
  assert.ok(Math.abs(Math.hypot(b2.vx, b2.vy) - b2.speed) < 1e-6);
});

test('paddle deflection: center goes straight up, edges angle up to 60°', () => {
  const c = E.paddleBounceVelocity(0, 400);
  assert.ok(Math.abs(c.vx) < 1e-9 && c.vy === -400);
  const r = E.paddleBounceVelocity(1, 400);
  assert.ok(Math.abs(Math.atan2(r.vx, -r.vy) - Math.PI / 3) < 1e-9);
  const l = E.paddleBounceVelocity(-0.5, 400);
  assert.ok(l.vx < 0 && l.vy < 0);
  assert.deepEqual(E.paddleBounceVelocity(5, 400), E.paddleBounceVelocity(1, 400), 'clamped');
});

test('ball hitting the right side of paddle deflects right and resets combo', () => {
  const s = E.createGame({ layout: EMPTY });
  s.combo = 7;
  const p = s.paddle;
  const b = freeBall(s, p.x + 40, p.y - 30, 0, 400);
  run(s, 0.1);
  assert.ok(b.vy < 0 && b.vx > 0);
  assert.equal(s.combo, 0);
  assert.ok(types(s).includes('paddle'));
});

test('keyboard and mouse move paddle, clamped to the field', () => {
  const s = E.createGame({ layout: EMPTY });
  E.setPaddleTarget(s, 9999);
  run(s, 0.5);
  assert.ok(Math.abs(s.paddle.x - (E.W - E.paddleWidth(s) / 2)) < 0.5);
  run(s, 2, 1 / 60, { dir: -1 });
  assert.ok(Math.abs(s.paddle.x - E.paddleWidth(s) / 2) < 0.5);
});

test('standard node destroyed by ball, scores, gives eddies and combo', () => {
  const s = E.createGame({ layout: ['1...........', '1...........'] });
  const br = s.bricks[1];
  const b = freeBall(s, br.x + br.w / 2, br.y + br.h + 20, 0, -400);
  run(s, 0.1);
  assert.ok(!br.alive);
  assert.ok(b.vy > 0, 'ball bounced back down');
  assert.equal(s.combo, 1);
  assert.ok(s.score >= 50 && s.eddies >= 1);
});

test('armored firewall needs multiple hits and cracks', () => {
  const s = E.createGame({ layout: ['3...........', '1...........'] });
  const br = s.bricks[0];
  assert.equal(E.hitBrick(s, br, 1, 'ball'), false);
  assert.equal(br.hp, 2);
  assert.ok(types(s).includes('crack'));
  E.hitBrick(s, br); assert.equal(E.hitBrick(s, br), true);
  assert.ok(!br.alive);
});

test('chrome is immune to ball but yields to lasers and explosions', () => {
  const s = E.createGame({ layout: ['#X#.........', '1...........'] });
  const [c1, x, c2] = s.bricks;
  for (let i = 0; i < 10; i++) E.hitBrick(s, c1, 1, 'ball');
  assert.ok(c1.alive);
  E.hitBrick(s, c1, 1, 'laser'); E.hitBrick(s, c1, 1, 'laser');
  assert.ok(c1.alive); E.hitBrick(s, c1, 1, 'laser');
  assert.ok(!c1.alive, 'three laser hits break chrome');
  E.hitBrick(s, x, 1, 'ball');
  assert.ok(!c2.alive, 'capacitor blast shattered chrome');
});

test('capacitor explodes 3x3 neighbours and chains through other capacitors', () => {
  const s = E.createGame({ layout: [
    '1111........',
    '1XX11.......',
    '1111........',
    '....1.......',
  ] });
  const at = (r, c) => s.bricks.find((b) => b.row === r && b.col === c);
  E.hitBrick(s, at(1, 1));
  for (const [r, c] of [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]]) assert.ok(!at(r, c).alive, `${r},${c}`);
  assert.ok(!at(1, 2).alive, 'chain-detonated neighbour capacitor');
  assert.ok(!at(1, 3).alive && !at(0, 3).alive && !at(2, 3).alive, 'chain blast radius');
  assert.ok(at(1, 4).alive && at(3, 4).alive, 'out of range survives');
  assert.equal(s.events.filter((e) => e.type === 'explode').length, 2);
});

test('sentinel block slides horizontally and bounces in its lane', () => {
  const s = E.createGame({ layout: ['.....S......', '1...........'] });
  const sen = s.bricks[0];
  const x0 = sen.x;
  run(s, 0.5);
  assert.notEqual(sen.x, x0);
  run(s, 10);
  assert.ok(sen.x >= sen.minX && sen.x <= sen.maxX);
});

test('data vault always drops a power-up capsule and an eddy burst', () => {
  for (let seed = 1; seed < 20; seed++) {
    const s = E.createGame({ seed, layout: ['V...........', '1...........'] });
    E.hitBrick(s, s.bricks[0]);
    assert.equal(s.capsules.length, 1);
    assert.ok(E.POWERUPS.includes(s.capsules[0].kind));
    assert.ok(s.eddies >= 25);
  }
});

test('capsule caught by paddle applies its power-up', () => {
  const s = E.createGame({ layout: ['1...........'] });
  s.capsules.push({ x: s.paddle.x, y: s.paddle.y - 30, vy: 140, kind: 'wide', w: 40, h: 16 });
  run(s, 0.5);
  assert.equal(s.capsules.length, 0);
  assert.ok(s.timers.wide > 0);
});

test('multi-ball splits every active ball into 3 (capped)', () => {
  const s = E.createGame({ layout: ['1...........'] });
  freeBall(s, 400, 300, 0, -400);
  E.applyPowerUp(s, 'multi');
  assert.equal(s.balls.length, 3);
  E.applyPowerUp(s, 'multi');
  assert.equal(s.balls.length, 9);
  E.applyPowerUp(s, 'multi');
  assert.equal(s.balls.length, E.MAX_BALLS);
  for (const b of s.balls) assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - b.speed) < 1e-6);
});

test('wide deck expands paddle then expires', () => {
  const s = E.createGame({ layout: ['1...........'] });
  E.applyPowerUp(s, 'wide');
  assert.equal(E.paddleWidth(s), E.PADDLE_BASE_W * 1.5);
  run(s, E.DURATION.wide + 0.1);
  assert.equal(E.paddleWidth(s), E.PADDLE_BASE_W);
});

test('twin lasers fire bolts that destroy bricks, auto-fire, and expire after 12s', () => {
  const s = E.createGame({ layout: ['1...........', '............', '............', '............', '1...........'] });
  assert.equal(E.fireLasers(s), false, 'unarmed');
  E.applyPowerUp(s, 'laser');
  const br = s.bricks[0];
  E.setPaddleTarget(s, br.x + br.w / 2 + E.PADDLE_BASE_W / 2 - 8);
  run(s, 0.4);
  assert.ok(E.fireLasers(s) || s.lasers.length > 0);
  run(s, 1.5);
  assert.ok(!br.alive && !s.bricks[1].alive);
  run(s, E.DURATION.laser);
  assert.equal(s.timers.laser, 0);
  assert.equal(E.fireLasers(s), false);
});

test('plasma pierce burns straight through bricks without bouncing', () => {
  const s = E.createGame({ layout: ['1..........1', '1...........', '1...........', '1...........'] });
  E.applyPowerUp(s, 'pierce');
  const colBricks = s.bricks.filter((x) => x.col === 0);
  const col = colBricks[0];
  const b = freeBall(s, col.x + col.w / 2, 200, 0, -400);
  run(s, 0.35);
  assert.ok(colBricks.every((x) => !x.alive));
  assert.ok(b.vy < 0, 'burned straight through without bouncing off bricks');
  run(s, 0.25);
  assert.ok(b.vy > 0, 'only bounced off ceiling');
  assert.equal(s.combo, 4);
});

test('pierce still bounces off chrome', () => {
  const s = E.createGame({ layout: ['#..........1'] });
  E.applyPowerUp(s, 'pierce');
  const c = s.bricks[0];
  const b = freeBall(s, c.x + c.w / 2, c.y + c.h + 15, 0, -400);
  run(s, 0.05);
  assert.ok(c.alive && b.vy > 0);
});

test('mag-shield saves one miss; next miss costs a life', () => {
  const s = E.createGame({ layout: ['1...........'] });
  E.applyPowerUp(s, 'shield');
  E.setPaddleTarget(s, 900); run(s, 0.3);
  const b = freeBall(s, 100, 560, 0, 400);
  run(s, 0.3);
  assert.equal(s.shield, false);
  assert.ok(b.vy < 0 && s.balls.length === 1);
  assert.equal(s.lives, E.START_LIVES);
  assert.ok(types(s).includes('shieldSave'));
  freeBall(s, 100, 560, 0, 400);
  run(s, 0.5);
  assert.equal(s.lives, E.START_LIVES - 1);
  assert.ok(s.balls[0].attached, 'new ball served');
});

test('eddy surge grants 150 eddies, score and combo', () => {
  const s = E.createGame({ layout: ['1...........'] });
  E.applyPowerUp(s, 'eddy');
  assert.equal(s.eddies, 150);
  assert.equal(s.combo, 5);
  assert.equal(s.score, Math.round(500 * E.comboMultiplier(5)));
});

test('losing one of several balls does not cost a life', () => {
  const s = E.createGame({ layout: ['1...........'] });
  E.setPaddleTarget(s, 900); run(s, 0.3);
  s.balls = [E.makeBall(s, 100, 620, 0, 400), E.makeBall(s, 480, 300, 0, -400)];
  run(s, 0.2);
  assert.equal(s.balls.length, 1);
  assert.equal(s.lives, E.START_LIVES);
});

test('sandevistan slows balls to 45% for 5s, then recharges', () => {
  const s = E.createGame({ layout: ['1...........'] });
  const b = freeBall(s, 480, 400, 0, -300);
  b.speed = 300;
  assert.ok(E.activateSandevistan(s));
  assert.equal(E.activateSandevistan(s), false, 'cannot stack');
  assert.equal(E.timeScale(s), E.SLOWMO_FACTOR);
  const y0 = b.y;
  E.step(s, 0.02);
  assert.ok(Math.abs((y0 - b.y) - 300 * 0.02 * 0.45) < 1e-6);
  run(s, E.SLOWMO_DURATION + 0.05);
  assert.equal(E.timeScale(s), 1);
  assert.equal(E.activateSandevistan(s), false, 'needs recharge');
  s.balls[0].attached = true;
  run(s, E.SLOWMO_RECHARGE + 0.1, 1 / 30);
  assert.ok(E.activateSandevistan(s));
});

test('stage clear ignores chrome, awards bonus and advances', () => {
  const s = E.createGame({ layout: ['1#..........'] });
  E.hitBrick(s, s.bricks[0]);
  E.step(s, 0.01);
  assert.equal(s.phase, 'clear');
  assert.ok(types(s).includes('clear'));
  run(s, 2.5);
  assert.equal(s.phase, 'play');
  assert.equal(s.level, 2);
});

test('boss shield deflects ball; core takes damage; defeat clears stage', () => {
  const s = E.createGame({ layout: EMPTY, boss: true });
  const bo = s.boss;
  assert.ok(bo.segments.some((g) => g.hp > 0) && bo.segments.some((g) => g.hp === 0), 'shield has gaps');
  // directly hit a live segment from below
  bo.t = 0; bo.shieldAngle = 0;
  const live = bo.segments.findIndex((g) => g.hp > 0);
  const ang = (live + 0.5) * (Math.PI * 2 / E.BOSS.segments);
  const sx = bo.x + Math.cos(ang) * (E.BOSS.shieldR + 30), sy = bo.y + Math.sin(ang) * (E.BOSS.shieldR + 30);
  const b = freeBall(s, sx, sy, -Math.cos(ang) * 400, -Math.sin(ang) * 400);
  E.step(s, 0.03);
  E.step(s, 0.03);
  assert.ok(bo.segments[live].hp < E.BOSS.segHp, 'segment damaged');
  assert.ok(b.vx * Math.cos(ang) + b.vy * Math.sin(ang) > 0, 'reflected outward');
  assert.equal(bo.hp, bo.maxHp, 'core untouched behind shield');
  // core damage via lasers / direct
  const hp0 = bo.hp;
  s.lasers.push({ x: bo.x, y: bo.y + 10, vy: -760 });
  E.step(s, 0.001);
  assert.equal(bo.hp, hp0 - 1);
  for (let i = 0; i < 200 && bo.alive; i++) { s.lasers.push({ x: bo.x, y: bo.y, vy: -1 }); E.step(s, 0.001); }
  assert.ok(!bo.alive);
  assert.ok(types(s).includes('bossDown'));
  assert.equal(s.stats.bossKills, 1);
  E.step(s, 0.01);
  assert.equal(s.phase, 'clear');
});

test('boss stun pulse shrinks paddle temporarily', () => {
  const s = E.createGame({ layout: EMPTY, boss: true });
  s.pulses.push({ x: s.paddle.x, y: s.paddle.y - 20, vx: 0, vy: 170, r: 10 });
  run(s, 0.3);
  assert.ok(s.timers.stun > 0);
  assert.ok(E.paddleWidth(s) < E.PADDLE_BASE_W);
  run(s, E.DURATION.stun + 0.1);
  assert.equal(E.paddleWidth(s), E.PADDLE_BASE_W);
});

test('boss fires pulses over time', () => {
  const s = E.createGame({ level: 3 });
  let fired = false;
  for (let i = 0; i < 600 && !fired; i++) { E.step(s, 1 / 60); fired = s.events.some((e) => e.type === 'bossFire'); }
  assert.ok(fired);
});

test('game over after losing all lives; step is inert afterwards', () => {
  const s = E.createGame({ layout: ['1...........'] });
  for (let i = 0; i < E.START_LIVES; i++) E.loseLife(s);
  assert.equal(s.phase, 'over');
  assert.equal(s.lives, 0);
  assert.ok(types(s).includes('gameover'));
  const sc = s.score;
  E.step(s, 0.1);
  assert.equal(s.score, sc);
  assert.equal(E.launch(s), false);
});

test('clearing stage 10 is victory; endless continues with layout loop', () => {
  const s = E.createGame({ level: 10 });
  for (const b of s.bricks) b.alive = false;
  E.step(s, 0.01);
  run(s, 2.5);
  assert.equal(s.phase, 'victory');
  assert.ok(s.won);
  assert.ok(E.continueEndless(s));
  assert.equal(s.level, 11);
  assert.equal(s.phase, 'play');
  assert.ok(E.runRewards(s).eddies >= 250);
});

test('combo multiplier scales and caps; deterministic replays with same seed', () => {
  assert.equal(E.comboMultiplier(0), 1);
  assert.equal(E.comboMultiplier(10), 2);
  assert.equal(E.comboMultiplier(999), 4);
  const sim = () => {
    const s = E.createGame({ seed: 42, level: 2 });
    E.launch(s);
    run(s, 8, 1 / 60, { dir: 0 });
    return [s.score, s.eddies, s.bricks.filter((b) => b.alive).length, s.lives];
  };
  assert.deepEqual(sim(), sim());
});

test('run rewards report score, eddies, xp and stage', () => {
  const s = E.createGame({ level: 4 });
  s.score = 6000; s.eddies = 120;
  const r = E.runRewards(s);
  assert.equal(r.score, 6000);
  assert.equal(r.eddies, 120);
  assert.equal(r.wave, 4);
  assert.ok(r.xp > 0 && r.won === false);
});

test('boss shield does not trap ball inside when exiting outward through a live segment', () => {
  const s = E.createGame({ layout: EMPTY, boss: true });
  const bo = s.boss;
  bo.t = 0;
  bo.shieldAngle = 0;
  bo.spin = 0;
  const live = bo.segments.findIndex((g) => g.hp > 0);
  const ang = (live + 0.5) * (Math.PI * 2 / E.BOSS.segments);
  // Start inside the shield ring (between coreR and shieldR - r) moving outward
  const startR = E.BOSS.coreR + E.BALL_R + 4;
  const b = freeBall(
    s,
    bo.x + Math.cos(ang) * startR,
    bo.y + Math.sin(ang) * startR,
    Math.cos(ang) * 400,
    Math.sin(ang) * 400,
  );
  E.step(s, 0.04);
  E.step(s, 0.04);
  E.step(s, 0.04);
  const distFromBoss = Math.hypot(b.x - bo.x, b.y - bo.y);
  assert.ok(distFromBoss > E.BOSS.shieldR + E.BALL_R, 'ball exited outward past the shield ring');
  assert.ok(b.vx * Math.cos(ang) + b.vy * Math.sin(ang) > 0, 'ball continues moving outward');
  assert.ok(bo.segments[live].hp < E.BOSS.segHp, 'live segment took damage on exit');
});

test('moving paddle before serve varies launch angle while stationary serve stays deterministic', () => {
  const s0 = E.createGame({ layout: EMPTY });
  E.launch(s0);
  const vx0 = s0.balls[0].vx;

  const sRight = E.createGame({ layout: EMPTY });
  E.setPaddleTarget(sRight, E.W / 2 + 180);
  E.step(sRight, 1 / 60);
  E.launch(sRight);
  const vxRight = sRight.balls[0].vx;

  const sLeft = E.createGame({ layout: EMPTY });
  E.setPaddleTarget(sLeft, E.W / 2 - 180);
  E.step(sLeft, 1 / 60);
  E.launch(sLeft);
  const vxLeft = sLeft.balls[0].vx;

  assert.notEqual(vxRight, vx0, 'moving right changes launch horizontal velocity');
  assert.ok(vxRight > 0 && vxLeft < 0, 'moving right aims right, moving left aims left');
});

test('i18n stageTitle and Hebrew strings are localized properly', () => {
  assert.equal(stageTitle('en', 1, 'BOOT SECTOR'), 'SECTOR 01 // BOOT SECTOR');
  assert.equal(stageTitle('he', 1, 'BOOT SECTOR'), 'סקטור 01 // סקטור אתחול');
  assert.equal(stageTitle('he', 'BOOT SECTOR'), 'סקטור אתחול');
  assert.equal(t('he', 'puShield'), 'מגן מגנטי');
  assert.equal(t('he', 'gameOverTitle'), 'הליבה קרסה');
  assert.equal(t('he', 'iceCore'), 'ליבת קרח');
});
