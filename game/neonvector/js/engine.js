// NEON VECTOR 2077 - pure deterministic game logic (no DOM / window deps).
export const W = 480;
export const H = 720;
export const CFG = {
  hitR: 4, grazeR: 22, maxHull: 3, speed: 340, followSpeed: 1800, fireInterval: 0.12,
  sectorLen: 38, warningTime: 3, clearTime: 3, maxMult: 10, maxBullets: 700,
  invulnHit: 1.4, invulnBomb: 2.2, bombDamage: 45, bossBombDamage: 60,
};
export const BOSS_NAMES = ['MILITECH CENTIPEDE', 'KANG TAO PRISM', 'ARASAKA SPIDER-MECH', 'NETWATCH ARCHON', 'BLACKWALL SERAPH'];
const BOSS_KINDS = ['centipede', 'prism', 'spider', 'archon', 'seraph'];
const BOSS_PHASES = { centipede: 2, prism: 2, spider: 2, archon: 2, seraph: 3 };
export const ENEMY_DEF = {
  swarm: { hp: 2, r: 10, pts: 100, drop: 0 },
  interceptor: { hp: 8, r: 13, pts: 300, drop: 0.3 },
  turret: { hp: 14, r: 14, pts: 400, drop: 0.4 },
  kamikaze: { hp: 3, r: 9, pts: 150, drop: 0.05 },
  gunship: { hp: 30, r: 18, pts: 600, drop: 0.6 },
};

export function rand(s) { // mulberry32
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createGame(opts = {}) {
  return {
    seed: (opts.seed ?? 1337) | 0, mode: opts.mode || 'campaign', autoFire: opts.autoFire !== false,
    time: 0, sectorTime: 0, sector: 1, phase: 'play', phaseTimer: 0, won: false, endless: opts.mode === 'endless',
    player: { x: W / 2, y: H - 110, hull: CFG.maxHull, maxHull: CFG.maxHull, shield: 0, invuln: 0, weapon: 1, drones: 0, fireCd: 0, droneCd: 0, hitR: CFG.hitR, grazeR: CFG.grazeR },
    bullets: [], pbullets: [], enemies: [], pickups: [], lanes: [], boss: null,
    score: 0, eddies: 0, xp: 0, mult: 1, multTimer: 0, overdrive: 25, grazes: 0, kills: 0, bossesKilled: 0, hullHits: 0, bombsUsed: 0,
    spawnTimer: 1.5, nextId: 1, groupId: 1, groups: {}, events: [], shake: 0,
  };
}
const ev = (s, type, x, y, extra) => s.events.push({ type, x, y, ...extra });

export function ebullet(s, x, y, ang, speed, r = 5) {
  if (s.bullets.length >= CFG.maxBullets) return null;
  const sp = speed * (1 + 0.05 * Math.min(8, Math.max(0, s.sector - 1)));
  const b = { x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r, g: false };
  s.bullets.push(b);
  return b;
}
const aimAt = (s, x, y) => Math.atan2(s.player.y - y, s.player.x - x);

export function spawnEnemy(s, type, x, y, extra = {}) {
  const d = ENEMY_DEF[type];
  const e = { id: s.nextId++, type, x, y, bx: x, hp: d.hp, maxHp: d.hp, r: d.r, t: 0, cd: 1 + rand(s), state: 'idle', st: 0, group: 0, ...extra };
  s.enemies.push(e);
  return e;
}

export function spawnBoss(s) {
  const idx = (s.sector - 1) % 5;
  const kind = BOSS_KINDS[idx];
  const loop = Math.floor((s.sector - 1) / 5);
  const hp = Math.round((420 + 180 * idx) * (1 + 0.5 * loop));
  s.boss = {
    idx, kind, name: BOSS_NAMES[idx], x: W / 2, y: -80, hp, maxHp: hp, phase: 0, phases: BOSS_PHASES[kind],
    r: kind === 'seraph' ? 34 : 28, t: 0, entering: true, cd: 1.5, ang: 0, st: 0,
    wings: kind === 'spider' ? [{ dx: -70, hp: 90, maxHp: 90 }, { dx: 70, hp: 90, maxHp: 90 }] : null,
    laser: null, tx: W / 2, dash: 0,
  };
  s.phase = 'boss';
  return s.boss;
}

export function firePlayer(s) {
  const p = s.player, w = p.weapon, out = [];
  const add = (dx, ang, dmg, homing) => out.push({ x: p.x + dx, y: p.y - 14, vx: Math.sin(ang) * 760, vy: -Math.cos(ang) * 760, dmg, homing: !!homing, r: homing ? 5 : 4 });
  if (w <= 1) add(0, 0, 2);
  else if (w === 2) { add(-8, 0, 2); add(8, 0, 2); }
  else if (w === 3) { add(0, 0, 2); add(-10, -0.18, 1.8); add(10, 0.18, 1.8); }
  else if (w === 4) { add(-8, 0, 2); add(8, 0, 2); add(-14, -0.3, 1.5, true); add(14, 0.3, 1.5, true); }
  else { add(0, 0, 2.2); add(-10, -0.18, 1.8); add(10, 0.18, 1.8); add(-16, -0.05, 2); add(16, 0.05, 2); add(-18, -0.5, 1.5, true); add(18, 0.5, 1.5, true); }
  for (const b of out) s.pbullets.push(b);
  ev(s, 'shoot', p.x, p.y);
  return out.length;
}

export function dropPickup(s, x, y, force) {
  const r = rand(s) * 100;
  const type = r < 40 ? 'P' : r < 60 ? 'D' : r < 75 ? 'S' : 'C';
  s.pickups.push({ x, y, type: force || type, vy: 70 });
}

export function damageEnemy(s, e, dmg) {
  e.hp -= dmg; e.flash = 0.06;
  if (e.hp <= 0 && !e.dead) killEnemy(s, e);
}

function killEnemy(s, e) {
  e.dead = true; s.kills++;
  const d = ENEMY_DEF[e.type];
  s.score += Math.round(d.pts * s.mult);
  s.eddies += e.type === 'swarm' ? 1 : 4;
  s.multTimer = 4; s.overdrive = Math.min(100, s.overdrive + 2.2);
  ev(s, 'explode', e.x, e.y, { size: e.r });
  let dropped = false;
  if (e.group && s.groups[e.group] !== undefined) {
    s.groups[e.group]--;
    if (s.groups[e.group] === 0) { dropPickup(s, e.x, e.y); dropped = true; }
  }
  if (!dropped && rand(s) < d.drop) dropPickup(s, e.x, e.y);
}

function checkBossPhase(s) {
  const b = s.boss;
  if (!b) return;
  const np = Math.min(b.phases - 1, Math.floor((1 - Math.max(0, b.hp) / b.maxHp) * b.phases));
  if (np > b.phase && b.hp > 0) {
    b.phase = np; b.cd = 1.2; b.st = 0; b.laser = null; s.bullets.length = 0;
    ev(s, 'bossPhase', b.x, b.y, { phase: np + 1 });
    s.shake = 0.6;
  }
}
export function setBossHp(s, hp) { s.boss.hp = hp; checkBossPhase(s); }

export function damageBoss(s, dmg, x) {
  const b = s.boss;
  if (!b || b.entering || b.dead) return;
  if (b.wings) {
    for (const w of b.wings) {
      if (w.hp > 0 && Math.abs(x - (b.x + w.dx)) < 24) {
        w.hp -= dmg;
        if (w.hp <= 0) { ev(s, 'explode', b.x + w.dx, b.y, { size: 24 }); s.score += Math.round(800 * s.mult); dropPickup(s, b.x + w.dx, b.y); }
        return;
      }
    }
    if (b.wings.some((w) => w.hp > 0)) dmg *= 0.3;
  }
  b.hp -= dmg; b.flash = 0.05;
  checkBossPhase(s);
  if (b.hp <= 0) killBoss(s);
}

function killBoss(s) {
  const b = s.boss;
  b.dead = true; s.bossesKilled++;
  s.score += Math.round(5000 * s.sector * s.mult);
  s.eddies += 100 + 25 * s.sector + s.bullets.length;
  ev(s, 'bossDead', b.x, b.y, { size: 70 });
  s.shake = 1.2;
  for (let i = 0; i < 3; i++) dropPickup(s, b.x + (i - 1) * 30, b.y, i === 0 ? 'C' : undefined);
  s.bullets.length = 0; s.lanes = []; s.boss = null;
  if (s.sector % 5 === 0 && !s.endless) { s.phase = 'won'; s.won = true; ev(s, 'win', W / 2, H / 2); }
  else { s.phase = 'clear'; s.phaseTimer = CFG.clearTime; }
}

function clearNear(s, c, r) { s.bullets = s.bullets.filter((b) => Math.hypot(b.x - c.x, b.y - c.y) > r); }

export function hurtPlayer(s) {
  const p = s.player;
  if (p.invuln > 0 || s.phase === 'dead') return false;
  if (p.shield > 0) {
    p.shield--; p.invuln = 1.2;
    ev(s, 'shieldBreak', p.x, p.y); s.shake = 0.3; clearNear(s, p, 90);
    return true;
  }
  p.hull--; s.hullHits++; p.invuln = CFG.invulnHit;
  p.weapon = Math.max(1, p.weapon - 1); s.mult = 1; s.multTimer = 0;
  ev(s, 'hit', p.x, p.y); s.shake = 0.6; clearNear(s, p, 100);
  if (p.hull <= 0) { s.phase = 'dead'; ev(s, 'dead', p.x, p.y); }
  return true;
}

export function overdrive(s) {
  if (s.overdrive < 100 || s.phase === 'dead' || s.phase === 'won') return false;
  s.overdrive = 0; s.bombsUsed++;
  s.player.invuln = Math.max(s.player.invuln, CFG.invulnBomb);
  for (let i = 0; i < s.bullets.length; i++) { s.eddies += 1; s.score += Math.round(10 * s.mult); }
  ev(s, 'overdrive', s.player.x, s.player.y, { cleared: s.bullets.length });
  s.bullets.length = 0; s.shake = 1;
  for (const e of s.enemies) if (!e.dead) damageEnemy(s, e, CFG.bombDamage);
  if (s.boss && !s.boss.entering) damageBoss(s, CFG.bossBombDamage, s.boss.x);
  return true;
}

function spawnWave(s) {
  const sec = s.sector;
  const pool = ['swarm', 'swarm', 'kamikaze'];
  if (sec >= 2) pool.push('interceptor', 'swarm', 'gunship');
  if (sec >= 3) pool.push('turret');
  if (sec >= 4) pool.push('gunship');
  const type = pool[Math.floor(rand(s) * pool.length)];
  const x = 70 + rand(s) * (W - 140);
  if (type === 'swarm') {
    const g = s.groupId++;
    s.groups[g] = 6;
    for (let i = 0; i < 6; i++) spawnEnemy(s, 'swarm', x, -20 - i * 34, { group: g, amp: 60 });
  } else if (type === 'kamikaze') {
    for (let i = 0; i < 2 + (sec > 2 ? 1 : 0); i++) spawnEnemy(s, 'kamikaze', 60 + rand(s) * (W - 120), -20 - i * 40);
  } else if (type === 'turret') spawnEnemy(s, 'turret', 60 + rand(s) * (W - 120), 28);
  else spawnEnemy(s, type, x, -30);
}

function pushLane(s, x, w, active, charge) { s.lanes.push({ x, w, active, charge }); }

function updateEnemy(s, e, dt) {
  e.t += dt;
  if (e.flash) e.flash = Math.max(0, e.flash - dt);
  const p = s.player;
  if (e.type === 'swarm') {
    e.y += 95 * dt;
    e.x = clamp(e.bx + Math.sin(e.t * 3) * (e.amp || 60), 10, W - 10);
  } else if (e.type === 'interceptor') {
    if (e.t >= 6) e.y -= 160 * dt; else if (e.y < 120) e.y += 130 * dt;
    e.x += Math.sin(e.t * 1.3) * 40 * dt; e.cd -= dt;
    if (e.cd <= 0 && e.y > 40 && e.t < 6) {
      e.cd = 1.8;
      const a = aimAt(s, e.x, e.y);
      for (let i = -1; i <= 1; i++) ebullet(s, e.x, e.y + 10, a + i * 0.12, 230);
      ev(s, 'enemyShoot', e.x, e.y);
    }
  } else if (e.type === 'turret') {
    e.st += dt;
    if (e.state === 'idle' && e.st > 1) { e.state = 'charge'; e.st = 0; e.lx = p.x; }
    else if (e.state === 'charge' && e.st > 1.2) { e.state = 'fire'; e.st = 0; ev(s, 'laser', e.lx, 0); }
    else if (e.state === 'fire' && e.st > 0.7) { e.state = 'idle'; e.st = 0; }
    if (e.t > 8) e.y -= 120 * dt;
    if (e.state === 'charge') pushLane(s, e.lx, 28, false, e.st / 1.2);
    else if (e.state === 'fire') pushLane(s, e.lx, 28, true, 1);
  } else if (e.type === 'kamikaze') {
    if (e.state === 'idle') {
      e.y += 120 * dt; e.x += clamp(p.x - e.x, -90 * dt, 90 * dt);
      if (e.y > 160 || e.t > 2) {
        e.state = 'dash';
        const a = aimAt(s, e.x, e.y);
        e.vx = Math.cos(a) * 380; e.vy = Math.sin(a) * 380;
      }
    } else { e.x += e.vx * dt; e.y += e.vy * dt; }
  } else if (e.type === 'gunship') {
    if (e.t >= 9) e.y -= 90 * dt; else if (e.y < 150) e.y += 60 * dt;
    e.x += Math.sin(e.t * 0.8) * 35 * dt; e.cd -= dt;
    if (e.cd <= 0 && e.t < 9) {
      e.cd = 2;
      for (let i = -4; i <= 4; i++) ebullet(s, e.x, e.y + 12, Math.PI / 2 + i * 0.16, 190);
      ev(s, 'enemyShoot', e.x, e.y);
    }
  }
}

function runLaser(s, b, dt, w, chargeT, fireT) {
  const L = b.laser;
  L.st += dt;
  if (L.state === 'charge' && L.st > chargeT) { L.state = 'fire'; L.st = 0; ev(s, 'laser', L.x, 0); }
  else if (L.state === 'fire' && L.st > fireT) { b.laser = null; return; }
  pushLane(s, L.x, w, L.state === 'fire', L.state === 'charge' ? L.st / chargeT : 1);
}

function updateBoss(s, dt) {
  const b = s.boss, p = s.player;
  b.t += dt;
  if (b.flash) b.flash = Math.max(0, b.flash - dt);
  if (b.entering) { b.y += 70 * dt; if (b.y >= 110) { b.y = 110; b.entering = false; } return; }
  b.cd -= dt;
  const ph = b.phase;
  switch (b.kind) {
    case 'centipede':
      b.x = W / 2 + Math.sin(b.t * (ph ? 0.9 : 0.6)) * 170;
      if (b.cd <= 0) {
        b.cd = ph ? 0.9 : 1.1; b.st++;
        const n = ph ? 11 : 7, c = Math.PI / 2 + Math.sin(b.st * 0.9) * 0.5;
        for (let i = 0; i < n; i++) ebullet(s, b.x, b.y + 20, c + (i - (n - 1) / 2) * 0.17, ph ? 250 : 210);
        if (ph) ebullet(s, b.x, b.y, aimAt(s, b.x, b.y), 320, 6);
        ev(s, 'enemyShoot', b.x, b.y);
      }
      break;
    case 'prism':
      b.x = W / 2 + Math.sin(b.t * 0.4) * 90;
      if (b.cd <= 0) {
        b.cd = ph ? 0.07 : 0.1; b.ang += ph ? -0.33 : 0.37;
        ebullet(s, b.x, b.y, b.ang, 190); ebullet(s, b.x, b.y, b.ang + Math.PI, 190);
        if (ph) { ebullet(s, b.x, b.y, b.ang + Math.PI / 2, 170); ebullet(s, b.x, b.y, b.ang - Math.PI / 2, 170); }
      }
      break;
    case 'spider': {
      b.x = W / 2 + Math.sin(b.t * 0.5) * 120;
      const alive = b.wings.filter((w) => w.hp > 0);
      if (alive.length) {
        if (b.cd <= 0) {
          b.cd = 1.0;
          for (const w of alive) {
            const a = aimAt(s, b.x + w.dx, b.y);
            for (let i = -1; i <= 1; i++) ebullet(s, b.x + w.dx, b.y + 10, a + i * 0.15, 240);
          }
          ev(s, 'enemyShoot', b.x, b.y);
        }
      } else {
        if (!b.laser && b.cd <= 0) b.laser = { x: p.x, state: 'charge', st: 0 };
        if (b.laser) runLaser(s, b, dt, 34, 1.1, 0.8);
        if (!b.laser && b.cd <= 0) b.cd = 1.2;
        b.ring = (b.ring || 0) - dt;
        if (b.ring <= 0) { b.ring = 0.9; for (let i = 0; i < 12; i++) ebullet(s, b.x, b.y, (i / 12) * Math.PI * 2 + b.t, 160); }
      }
      break;
    }
    case 'archon':
      if (b.dash > 0) {
        b.dash -= dt;
        b.y = b.dash <= 0 ? 110 : 110 + Math.sin((1 - b.dash / 0.5) * Math.PI) * 150;
      } else if (b.cd <= 0) {
        b.st++; b.cd = ph ? 1.4 : 2; b.x = 60 + rand(s) * (W - 120); b.dash = 0.5;
        ev(s, 'laser', b.x, b.y);
        const n = ph ? 20 : 14;
        for (let i = 0; i < n; i++) ebullet(s, b.x, b.y, (i / n) * Math.PI * 2 + b.st * 0.2, 200);
        const a = aimAt(s, b.x, b.y);
        for (let i = -2; i <= 2; i++) ebullet(s, b.x, b.y, a + i * 0.1, ph ? 300 : 260);
      }
      break;
    case 'seraph':
      b.x = W / 2 + Math.sin(b.t * 0.5) * (ph === 2 ? 140 : 100);
      if (ph === 0) {
        if (b.cd <= 0) {
          b.cd = 1.3; b.st++;
          for (let i = 0; i < 18; i++) ebullet(s, b.x, b.y, (i / 18) * Math.PI * 2 + b.st * 0.17, 190);
          for (let i = -3; i <= 3; i++) ebullet(s, b.x, b.y, Math.PI / 2 + i * 0.14, 240);
        }
      } else {
        b.spin = (b.spin || 0) - dt;
        if (b.spin <= 0) { b.spin = 0.09; b.ang += 0.4; ebullet(s, b.x, b.y, b.ang, 190); ebullet(s, b.x, b.y, b.ang + Math.PI, 190); }
        if (b.cd <= 0) {
          b.cd = ph === 2 ? 1.1 : 1.6;
          if (ph === 2) { const a = aimAt(s, b.x, b.y); for (let i = -2; i <= 2; i++) ebullet(s, b.x, b.y, a + i * 0.09, 330); }
          else b.laser = { x: p.x, state: 'charge', st: 0 };
        }
      }
      if (b.laser) runLaser(s, b, dt, 34, 1.1, 0.7);
      break;
  }
}

export function collect(s, k) {
  const p = s.player;
  ev(s, 'pickup', k.x, k.y, { kind: k.type });
  if (k.type === 'P') { if (p.weapon < 5) p.weapon++; else s.score += Math.round(500 * s.mult); }
  else if (k.type === 'D') { if (p.drones < 2) p.drones++; else s.score += Math.round(500 * s.mult); }
  else if (k.type === 'S') { if (p.shield < 1) p.shield = 1; else s.score += Math.round(500 * s.mult); }
  else { s.eddies += 25; s.score += Math.round(1000 * s.mult); }
}

export function step(s, input = {}, dt = 1 / 60) {
  s.events = [];
  if (s.phase === 'dead' || s.phase === 'won') return s;
  s.time += dt;
  const p = s.player;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 2);
  // movement
  if (input.tx != null && input.ty != null) {
    const dx = input.tx - p.x, dy = input.ty - p.y, d = Math.hypot(dx, dy), m = CFG.followSpeed * dt;
    if (d <= m) { p.x = input.tx; p.y = input.ty; } else { p.x += (dx / d) * m; p.y += (dy / d) * m; }
  } else {
    let ax = input.ax || 0, ay = input.ay || 0;
    const l = Math.hypot(ax, ay);
    if (l > 1) { ax /= l; ay /= l; }
    p.x += ax * CFG.speed * dt; p.y += ay * CFG.speed * dt;
  }
  p.x = clamp(p.x, 14, W - 14); p.y = clamp(p.y, 40, H - 30);
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (input.bomb) overdrive(s);
  // firing
  const firing = s.autoFire || input.fire;
  p.fireCd -= dt; p.droneCd -= dt;
  if (firing && p.fireCd <= 0) { p.fireCd = CFG.fireInterval; firePlayer(s); }
  if (firing && p.drones > 0 && p.droneCd <= 0) {
    p.droneCd = 0.24;
    for (let i = 0; i < p.drones; i++) s.pbullets.push({ x: p.x + (i ? 30 : -30), y: p.y - 4, vx: 0, vy: -800, dmg: 1.2, homing: false, r: 3, drone: true });
  }
  // phase flow
  s.lanes = [];
  if (s.phase === 'play') {
    s.sectorTime += dt;
    if (s.sectorTime < CFG.sectorLen) {
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0) {
        spawnWave(s);
        s.spawnTimer = Math.max(1.1, 2.4 - 0.2 * ((s.sector - 1) % 5)) / (1 + 0.1 * Math.floor((s.sector - 1) / 5));
      }
    } else if (!s.enemies.length) {
      s.phase = 'warning'; s.phaseTimer = CFG.warningTime; s.bullets.length = 0;
      ev(s, 'warning', W / 2, H / 2);
    }
  } else if (s.phase === 'warning') {
    s.phaseTimer -= dt;
    if (s.phaseTimer <= 0) { spawnBoss(s); ev(s, 'bossStart', W / 2, 0); }
  } else if (s.phase === 'clear') {
    s.phaseTimer -= dt;
    if (s.phaseTimer <= 0) {
      s.sector++; s.sectorTime = 0; s.phase = 'play'; s.spawnTimer = 1.5; s.groups = {};
      ev(s, 'sector', W / 2, H / 2, { sector: s.sector });
    }
  }
  for (const e of s.enemies) updateEnemy(s, e, dt);
  if (s.boss) updateBoss(s, dt);
  // player bullets
  for (const b of s.pbullets) {
    if (b.homing) {
      let best = null, bd = 1e9;
      for (const e of s.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best && s.boss && !s.boss.entering) best = s.boss;
      if (best) {
        const cur = Math.atan2(b.vy, b.vx);
        let da = Math.atan2(best.y - b.y, best.x - b.x) - cur;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const na = cur + clamp(da, -6 * dt, 6 * dt);
        b.vx = Math.cos(na) * 760; b.vy = Math.sin(na) * 760;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    for (const e of s.enemies) {
      if (!e.dead && !b.dead && e.y > -10 && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) { b.dead = true; damageEnemy(s, e, b.dmg); }
    }
    const bo = s.boss;
    if (!b.dead && bo && !bo.entering && !bo.dead) {
      const hitBody = Math.hypot(bo.x - b.x, bo.y - b.y) < bo.r + b.r;
      const hitWing = bo.wings && bo.wings.some((w) => w.hp > 0 && Math.abs(b.x - (bo.x + w.dx)) < 24 && Math.abs(b.y - bo.y) < 20);
      if (hitBody || hitWing) { b.dead = true; damageBoss(s, b.dmg, hitWing ? b.x : bo.x); }
    }
  }
  s.pbullets = s.pbullets.filter((b) => !b.dead && b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20);
  s.enemies = s.enemies.filter((e) => !e.dead && e.y < H + 40 && e.y > -80 && e.x > -60 && e.x < W + 60);
  if (s.phase === 'won') return s;
  // enemy bullets: movement, graze, hit
  let hurt = false;
  for (const b of s.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < b.r + p.hitR) {
      if (p.invuln <= 0) { b.dead = true; hurt = true; }
    } else if (!b.g && d < b.r + p.grazeR) {
      b.g = true; s.grazes++;
      s.mult = Math.min(CFG.maxMult, s.mult + 0.15); s.multTimer = 4;
      s.overdrive = Math.min(100, s.overdrive + 3.2);
      s.score += Math.round(5 * s.mult);
      ev(s, 'graze', b.x, b.y);
    }
  }
  s.bullets = s.bullets.filter((b) => !b.dead && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);
  if (hurt) hurtPlayer(s);
  for (const l of s.lanes) if (l.active && Math.abs(p.x - l.x) < l.w / 2 + p.hitR) { hurtPlayer(s); break; }
  for (const e of s.enemies) {
    if (e.type === 'kamikaze' && !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.hitR && p.invuln <= 0) {
      e.dead = true; ev(s, 'explode', e.x, e.y, { size: 14 }); hurtPlayer(s);
    }
  }
  if (s.boss && !s.boss.entering && Math.hypot(s.boss.x - p.x, s.boss.y - p.y) < s.boss.r * 0.7 + p.hitR) hurtPlayer(s);
  s.enemies = s.enemies.filter((e) => !e.dead);
  // pickups
  for (const k of s.pickups) {
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d < 90 && d > 0) { k.x += ((p.x - k.x) / d) * 260 * dt; k.y += ((p.y - k.y) / d) * 260 * dt; } else k.y += k.vy * dt;
    if (d < 20) { k.dead = true; collect(s, k); }
  }
  s.pickups = s.pickups.filter((k) => !k.dead && k.y < H + 20);
  if (s.multTimer > 0) s.multTimer -= dt; else if (s.mult > 1) s.mult = Math.max(1, s.mult - 0.5 * dt);
  return s;
}

export function summarize(s) {
  const badges = [];
  if (s.bossesKilled >= 1) badges.push('boss-slayer');
  if (s.grazes >= 100) badges.push('graze-lord');
  if (s.won) badges.push('blackwall-breaker');
  if (s.won && s.hullHits === 0) badges.push('untouchable');
  if (s.player.weapon === 5) badges.push('full-barrage');
  return { score: s.score, eddies: s.eddies, xp: Math.floor(s.score / 200) + s.bossesKilled * 150 + (s.won ? 500 : 0), won: s.won, wave: s.sector, badges };
}
