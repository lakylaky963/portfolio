// Unit tests for shared/hub-sdk.js — run: node --test game/hub.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from './shared/hub-sdk.js';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
let store;
beforeEach(() => { store = new MemStorage(); sdk.setStorageBackend(store); });
const raw = () => JSON.parse(store.getItem(sdk.STORAGE_KEY));

test('module imports in Node without window/localStorage', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(sdk.STORAGE_KEY, 'cp77hub.v1');
  assert.equal(sdk.API_BASE, '/game/api');
});

test('GAMES_META has 7 unique, complete game entries', () => {
  assert.equal(sdk.GAMES_META.length, 7);
  assert.deepEqual(
    sdk.GAMES_META.map((g) => g.id),
    ['defender', 'icebreaker', 'blackwall', 'neonvector', 'protocol', 'overclock', 'lightcycle'],
  );
  for (let i = 0; i < sdk.GAMES_META.length; i++) {
    const g = sdk.GAMES_META[i];
    for (const k of ['path', 'accent', 'titleEn', 'titleHe', 'tagEn', 'tagHe', 'descEn', 'descHe', 'genre', 'key']) {
      assert.ok(typeof g[k] === 'string' && g[k].length > 0, `${g.id}.${k}`);
    }
    assert.equal(g.path, `${g.id}/`);
    assert.equal(g.key, String(i + 1));
    assert.match(g.accent, /^#[0-9a-f]{6}$/i);
    assert.match(g.titleHe, /[֐-׿]/, `${g.id} Hebrew title`);
    assert.ok(['defense', 'action', 'hacking'].includes(g.genre));
  }
  assert.equal(sdk.getGame('protocol').accent, '#00ff9f');
  assert.equal(sdk.getGame('overclock').accent, '#ffaa00');
  assert.equal(sdk.getGame('lightcycle').accent, '#00e5ff');
  assert.equal(sdk.getGame('nope'), null);
});

test('ACHIEVEMENTS: 20 unique ids, bilingual, 2 per game, all_access goal = 7', () => {
  assert.equal(sdk.ACHIEVEMENTS.length, 20);
  assert.equal(new Set(sdk.ACHIEVEMENTS.map((a) => a.id)).size, 20);
  for (const a of sdk.ACHIEVEMENTS) {
    assert.ok(a.titleEn && a.titleHe && a.descEn && a.descHe && a.icon);
    assert.ok(a.goal > 0 && typeof a.metric === 'function');
  }
  for (const id of sdk.GAME_IDS) assert.equal(sdk.ACHIEVEMENTS.filter((a) => a.game === id).length, 2);
  const allAccess = sdk.ACHIEVEMENTS.find((a) => a.id === 'all_access');
  assert.equal(allAccess.goal, 7);
});

test('fresh profile is created with zeroed stats and defaults for all 7 games', () => {
  const p = sdk.getProfile();
  assert.equal(p.xp, 0);
  assert.equal(p.eddies, 0);
  assert.deepEqual(p.scores, {
    defender: 0, icebreaker: 0, blackwall: 0, neonvector: 0, protocol: 0, overclock: 0, lightcycle: 0,
  });
  assert.deepEqual(p.history, []);
  assert.equal(p.settings.theme, 'yellow');
  assert.equal(p.lastPlayed, null);
  assert.ok(raw(), 'profile persisted after first load');
});

test('corrupt or hostile storage falls back to a clean profile', () => {
  store.setItem(sdk.STORAGE_KEY, '{not json');
  assert.equal(sdk.getProfile().xp, 0);
  store.setItem(sdk.STORAGE_KEY, JSON.stringify({ xp: -50, eddies: 'abc', scores: { defender: 'x', hacker: 9 }, settings: { theme: 'pink', lang: 'fr' }, achievements: { bogus: 1 }, history: 'nope' }));
  const p = sdk.getProfile();
  assert.equal(p.xp, 0);
  assert.equal(p.eddies, 0);
  assert.equal(p.scores.defender, 0);
  assert.equal(p.scores.hacker, undefined);
  assert.equal(p.settings.theme, 'yellow');
  assert.equal(p.settings.lang, null);
  assert.deepEqual(p.achievements, {});
  assert.deepEqual(p.history, []);
});

test('no storage backend at all: getProfile/recordRun still work in memory', () => {
  sdk.setStorageBackend({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  const r = sdk.recordRun('defender', { score: 10 });
  assert.equal(r.profile.plays.defender, 1);
  assert.equal(sdk.saveProfile(r.profile), false);
});

test('xpForLevel / levelFromXp math', () => {
  assert.equal(sdk.xpForLevel(1), 0);
  assert.equal(sdk.xpForLevel(2), 100);
  assert.equal(sdk.xpForLevel(5), 1000);
  assert.equal(sdk.xpForLevel(10), 4500);
  assert.deepEqual(sdk.levelFromXp(0), { level: 1, current: 0, next: 100, pct: 0 });
  assert.deepEqual(sdk.levelFromXp(50), { level: 1, current: 50, next: 100, pct: 50 });
  assert.deepEqual(sdk.levelFromXp(100), { level: 2, current: 0, next: 200, pct: 0 });
  assert.deepEqual(sdk.levelFromXp(400), { level: 3, current: 100, next: 300, pct: 33.3 });
  assert.equal(sdk.levelFromXp(4500).level, 10);
  assert.equal(sdk.levelFromXp(4499).level, 9);
  assert.equal(sdk.levelFromXp(-20).level, 1);
  assert.equal(sdk.levelFromXp('garbage').level, 1);
});

test('recordRun updates plays, eddies, xp, history and lastPlayed', () => {
  const r = sdk.recordRun('icebreaker', { score: 1200, eddies: 300, xp: 150, wave: 7 });
  assert.equal(r.isNewBest, true);
  assert.equal(r.leveledUp, true);
  assert.equal(r.newLevel, 2);
  const p = sdk.getProfile();
  assert.equal(p.plays.icebreaker, 1);
  assert.equal(p.scores.icebreaker, 1200);
  assert.equal(p.eddies, 300);
  assert.equal(p.xp, 150);
  assert.equal(p.lastPlayed, 'icebreaker');
  assert.equal(p.history.length, 1);
  assert.deepEqual({ ...p.history[0], at: 0 }, { gameId: 'icebreaker', score: 1200, eddies: 300, xp: 150, won: false, wave: 7, at: 0, best: true });
});

test('recordRun uses default XP formula when xp not provided', () => {
  const r = sdk.recordRun('protocol', { score: 500, won: true });
  assert.equal(r.xpGained, 10 + 10 + 50);
  assert.equal(sdk.getProfile().xp, 70);
  assert.equal(sdk.defaultRunXp({ score: 1e9 }), 210);
});

test('high score only replaced by a strictly better score', () => {
  assert.equal(sdk.recordRun('blackwall', { score: 800 }).isNewBest, true);
  assert.equal(sdk.recordRun('blackwall', { score: 500 }).isNewBest, false);
  assert.equal(sdk.recordRun('blackwall', { score: 800 }).isNewBest, false);
  assert.equal(sdk.recordRun('blackwall', { score: 0 }).isNewBest, false);
  const p = sdk.getProfile();
  assert.equal(p.scores.blackwall, 800);
  assert.equal(p.plays.blackwall, 4);
});

test('recordRun rejects unknown games', () => {
  assert.throws(() => sdk.recordRun('pong', { score: 1 }), /unknown game/);
});

test('history is newest-first and capped', () => {
  for (let i = 0; i < sdk.HISTORY_LIMIT + 5; i++) sdk.recordRun('neonvector', { score: i, xp: 1 });
  const p = sdk.getProfile();
  assert.equal(p.history.length, sdk.HISTORY_LIMIT);
  assert.equal(p.history[0].score, sdk.HISTORY_LIMIT + 4);
});

test('achievements: first jack-in, wins, score thresholds, overclock/lightcycle, badges', () => {
  const r1 = sdk.recordRun('defender', { score: 6000, won: true, xp: 10 });
  assert.ok(r1.unlockedAchievements.includes('first_jack'));
  assert.ok(r1.unlockedAchievements.includes('defender_win'));
  assert.ok(r1.unlockedAchievements.includes('defender_score'));
  const r2 = sdk.recordRun('defender', { score: 6000, won: true, xp: 10 });
  assert.deepEqual(r2.unlockedAchievements, [], 'no duplicate unlocks');
  const r3 = sdk.recordRun('protocol', { score: 5, xp: 1, badges: ['protocol_win', 'not_real'] });
  assert.deepEqual(r3.unlockedAchievements, ['protocol_win']);
  const r4 = sdk.recordRun('overclock', { score: 16000, won: true, xp: 10 });
  assert.ok(r4.unlockedAchievements.includes('overclock_win'));
  assert.ok(r4.unlockedAchievements.includes('overclock_score'));
  const r5 = sdk.recordRun('lightcycle', { score: 9000, won: true, xp: 10 });
  assert.ok(r5.unlockedAchievements.includes('lightcycle_win'));
  assert.ok(r5.unlockedAchievements.includes('lightcycle_score'));
});

test('achievements: multi-runner, all-access (7 games), hoarder, levels', () => {
  let r;
  for (const id of sdk.GAME_IDS) r = sdk.recordRun(id, { score: 1, eddies: 1000, xp: 1000 });
  const p = sdk.getProfile();
  for (const id of ['multi_runner', 'all_access', 'hoarder', 'street_kid', 'legend']) assert.ok(p.achievements[id], id);
  assert.equal(p.eddies, 7000);
  assert.ok(r.unlockedAchievements.includes('all_access'));
  assert.equal(sdk.achievementProgress(p, 'all_access').pct, 100);
});

test('achievementProgress reports partial progress', () => {
  sdk.recordRun('defender', { score: 2500, xp: 1 });
  const p = sdk.getProfile();
  assert.deepEqual(sdk.achievementProgress(p, 'defender_score'), { cur: 2500, goal: 5000, pct: 50, unlocked: false });
  assert.deepEqual(sdk.achievementProgress(p, 'multi_runner'), { cur: 1, goal: 3, pct: 33, unlocked: false });
});

test('unlockAchievement is idempotent and validates ids', () => {
  assert.equal(sdk.unlockAchievement('icebreaker_win'), true);
  assert.equal(sdk.unlockAchievement('icebreaker_win'), false);
  assert.equal(sdk.unlockAchievement('fake'), false);
  assert.ok(sdk.getProfile().achievements.icebreaker_win > 0);
});

test('migrates legacy Homelab Defender scores once', () => {
  store.setItem('hd.scores', JSON.stringify({ lan: { score: 4200, wave: 12 }, dmz: { score: 7300.7, wave: 20 }, bad: null }));
  const p = sdk.getProfile();
  assert.equal(p.scores.defender, 7300);
  assert.equal(p.plays.defender, 1);
  assert.equal(p.migrated, true);
  assert.ok(p.achievements.defender_score, 'legacy score unlocks threshold trophy');
  store.setItem('hd.scores', JSON.stringify({ lan: { score: 99999 } }));
  assert.equal(sdk.getProfile().scores.defender, 7300, 'migration runs only once');
});

test('migration never lowers an existing better score; reset does not re-migrate', () => {
  sdk.setStorageBackend(store);
  store.setItem(sdk.STORAGE_KEY, JSON.stringify({ scores: { defender: 9000 } }));
  store.setItem('hd.scores', JSON.stringify({ lan: { score: 100 } }));
  assert.equal(sdk.getProfile().scores.defender, 9000);
  const fresh = sdk.resetProfile();
  assert.equal(fresh.scores.defender, 0);
  assert.equal(sdk.getProfile().scores.defender, 0);
});

test('theme persistence and validation', () => {
  assert.equal(sdk.getTheme(), 'yellow');
  assert.equal(sdk.setTheme('crimson'), 'crimson');
  assert.equal(sdk.getTheme(), 'crimson');
  assert.equal(raw().settings.theme, 'crimson');
  assert.equal(sdk.setTheme('hotpink'), 'yellow');
  assert.equal(sdk.nextTheme('yellow'), 'cyan');
  assert.equal(sdk.nextTheme('crimson'), 'yellow');
  assert.equal(sdk.prevTheme('yellow'), 'crimson');
  assert.equal(sdk.prevTheme('cyan'), 'yellow');
  assert.equal(sdk.prevTheme('crimson'), 'cyan');
});

test('lang and mute persistence', () => {
  assert.equal(sdk.getLang(), 'en');
  sdk.setLang('he');
  assert.equal(sdk.getLang(), 'he');
  sdk.setLang('klingon');
  assert.equal(sdk.getLang(), 'en');
  assert.equal(sdk.getMuted(), false);
  sdk.setMuted(1);
  assert.equal(sdk.getMuted(), true);
  assert.equal(raw().settings.muted, true);
});

test('settings survive recordRun and are independent of stats', () => {
  sdk.setTheme('cyan'); sdk.setMuted(true); sdk.setLang('he');
  sdk.recordRun('defender', { score: 10 });
  assert.equal(sdk.getTheme(), 'cyan');
  assert.equal(sdk.getMuted(), true);
  assert.equal(sdk.getLang(), 'he');
});

test('initGameChrome applies attributes to a mock document', () => {
  const attrs = {};
  globalThis.document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
  try {
    sdk.setLang('he'); sdk.setTheme('cyan'); sdk.setMuted(true);
    const r = sdk.initGameChrome({ gameId: 'protocol' });
    assert.deepEqual(r, { lang: 'he', muted: true, theme: 'cyan' });
    assert.deepEqual(attrs, { 'data-theme': 'cyan', lang: 'he', dir: 'rtl', 'data-game': 'protocol' });
  } finally { delete globalThis.document; }
});

test('initGameChrome is a no-op without a DOM', () => {
  assert.deepEqual(sdk.initGameChrome(), { lang: 'en', muted: false, theme: 'yellow' });
});

// ---------- Mid-Run Save / Load / Clear + Auto-Pause ----------
test('mid-run save, load, hasMidRun, clearMidRun and recordRun auto-clear', () => {
  assert.equal(sdk.hasMidRun('overclock'), false);
  assert.equal(sdk.loadMidRun('overclock'), null);
  assert.equal(sdk.saveMidRun('bogus', { a: 1 }), null);

  const saved = sdk.saveMidRun('overclock', { label: 'Sector 3', state: { score: 4200, level: 3 } });
  assert.equal(saved.gameId, 'overclock');
  assert.equal(saved.label, 'Sector 3');
  assert.deepEqual(saved.state, { score: 4200, level: 3 });
  assert.equal(sdk.hasMidRun('overclock'), true);
  assert.deepEqual(sdk.loadMidRun('overclock').state, { score: 4200, level: 3 });

  // Raw snapshot without wrapper also works
  sdk.saveMidRun('lightcycle', { round: 4, score: 1900 });
  assert.deepEqual(sdk.loadMidRun('lightcycle').state, { round: 4, score: 1900 });

  // Finishing a run clears that game's mid-run checkpoint
  sdk.recordRun('overclock', { score: 5000, won: true });
  assert.equal(sdk.hasMidRun('overclock'), false);
  assert.equal(sdk.hasMidRun('lightcycle'), true);

  sdk.clearMidRun('lightcycle');
  assert.equal(sdk.hasMidRun('lightcycle'), false);
});

test('installAutoPause is safe in Node and pauses + saves on visibilitychange/blur', () => {
  // No-op without DOM
  const noop = sdk.installAutoPause({ gameId: 'overclock' });
  assert.equal(typeof noop, 'function');
  noop();

  // Mock DOM + Window
  const docListeners = {};
  const winListeners = {};
  const appended = [];
  const makeEl = (tag) => ({
    tag, style: {}, children: [],
    setAttribute() {},
    addEventListener() {},
    appendChild(ch) { this.children.push(ch); ch.parentNode = this; },
    removeChild(ch) { const i = this.children.indexOf(ch); if (i >= 0) this.children.splice(i, 1); },
  });
  const body = makeEl('body');
  globalThis.document = {
    hidden: false,
    body,
    documentElement: body,
    createElement: (tag) => { const e = makeEl(tag); appended.push(e); return e; },
    addEventListener: (ev, fn) => { docListeners[ev] = fn; },
    removeEventListener: (ev) => { delete docListeners[ev]; },
  };
  globalThis.window = {
    addEventListener: (ev, fn) => { winListeners[ev] = fn; },
    removeEventListener: (ev) => { delete winListeners[ev]; },
  };

  let running = true;
  let paused = false;
  let autoReason = null;
  const cleanup = sdk.installAutoPause({
    gameId: 'lightcycle',
    isRunning: () => running,
    isPaused: () => paused,
    setPaused: (v) => { paused = v; },
    getSnapshot: () => ({ label: 'Round 2', state: { round: 2, score: 750 } }),
    getLang: () => 'en',
    onAutoPaused: (r) => { autoReason = r; },
  });

  try {
    globalThis.document.hidden = true;
    docListeners.visibilitychange();
    assert.equal(paused, true);
    assert.equal(autoReason, 'tabout');
    assert.equal(sdk.hasMidRun('lightcycle'), true);
    assert.deepEqual(sdk.loadMidRun('lightcycle').state, { round: 2, score: 750 });

    // Returning to tab renders the protected pill
    globalThis.document.hidden = false;
    docListeners.visibilitychange();
    assert.equal(body.children.length, 1);
    assert.equal(body.children[0].className, 'cp77-autopause-pill cyber-clip-sm');
  } finally {
    cleanup();
    delete globalThis.document;
    delete globalThis.window;
  }
});

// ---------- Offline Auth + Multi-User + Leaderboard Fallback ----------
test('offline auth: validation, register, guest merge, wrong PIN, signOut & user switching', async () => {
  // Invalid inputs rejected immediately
  const badHandle = await sdk.signInOrRegister({ handle: 'a', pin: '1234' });
  assert.equal(badHandle.ok, false);
  const badPin = await sdk.signInOrRegister({ handle: 'V_Runner', pin: '12' });
  assert.equal(badPin.ok, false);

  // Guest plays one run before registering
  sdk.recordRun('overclock', { score: 4500, eddies: 200, xp: 120, wave: 3 });

  // Register offline (fetch relative URL fails in Node -> offline fallback)
  const r1 = await sdk.signInOrRegister({ handle: 'V_Runner', pin: '2077', avatar: 'solo' });
  assert.equal(r1.ok, true);
  assert.equal(r1.created, true);
  assert.equal(r1.online, false);
  assert.equal(r1.user.handle, 'V_Runner');
  assert.equal(r1.user.avatar, 'solo');
  assert.equal(r1.profile.scores.overclock, 4500, 'guest score merged into new account');
  assert.equal(sdk.getAuth().handle, 'V_Runner');

  // Sign out back to guest -> clean stats
  sdk.signOut();
  assert.equal(sdk.getAuth(), null);
  assert.equal(sdk.getProfile().scores.overclock, 0);

  // Wrong PIN rejected
  const wrong = await sdk.signInOrRegister({ handle: 'V_Runner', pin: '0000' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.status, 401);

  // Correct PIN restores account
  const r2 = await sdk.signInOrRegister({ handle: 'v_runner', pin: '2077' });
  assert.equal(r2.ok, true);
  assert.equal(r2.created, false);
  assert.equal(r2.user.handle, 'V_Runner');
  assert.equal(r2.profile.scores.overclock, 4500);

  // Register a second user -> isolated from V_Runner's scores
  const r3 = await sdk.signInOrRegister({ handle: 'AltCunningham', pin: '9999', avatar: 'netrunner' });
  assert.equal(r3.ok, true);
  assert.equal(r3.created, true);
  assert.equal(r3.profile.scores.overclock, 0, 'switching accounts does not leak previous account scores');
  sdk.recordRun('overclock', { score: 9000, eddies: 500, xp: 300, wave: 6 });
  sdk.recordRun('lightcycle', { score: 3500, eddies: 150, xp: 100, wave: 4 });

  // Offline leaderboard ranks both local users accurately
  const lbAll = await sdk.fetchLeaderboard('all', 20);
  assert.equal(lbAll.online, false);
  assert.equal(lbAll.game, 'all');
  assert.equal(lbAll.entries.length, 2);
  assert.equal(lbAll.entries[0].handle, 'AltCunningham');
  assert.equal(lbAll.entries[0].score, 12500);
  assert.equal(lbAll.entries[0].rank, 1);
  assert.equal(lbAll.entries[1].handle, 'V_Runner');
  assert.equal(lbAll.entries[1].score, 4500);
  assert.equal(lbAll.entries[1].rank, 2);

  const lbOverclock = await sdk.fetchLeaderboard('overclock', 20);
  assert.equal(lbOverclock.entries.length, 2);
  assert.equal(lbOverclock.entries[0].handle, 'AltCunningham');
  assert.equal(lbOverclock.entries[0].wave, 6);
  assert.equal(lbOverclock.entries[1].handle, 'V_Runner');
  assert.equal(lbOverclock.entries[1].score, 4500);
});

test('online fetchLeaderboard normalizes gamehub_api.py response shapes', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => (url.includes('game=all')
      ? {
        game: 'all',
        entries: [{ rank: 1, handle: 'Johnny', avatar: 'solo', combined_score: 42000, xp: 2500, level: 3, eddies: 9000, games_played: 12 }],
      }
      : {
        game: 'lightcycle',
        entries: [{ rank: 1, handle: 'Johnny', avatar: 'solo', score: 8800, wave: 9, plays: 4, updated_at: 1700000000 }],
      }),
  });
  try {
    const all = await sdk.fetchLeaderboard('all', 10);
    assert.equal(all.online, true);
    assert.equal(all.entries[0].score, 42000);
    assert.equal(all.entries[0].plays, 12);
    assert.equal(all.entries[0].eddies, 9000);

    const lc = await sdk.fetchLeaderboard('lightcycle', 10);
    assert.equal(lc.online, true);
    assert.equal(lc.entries[0].score, 8800);
    assert.equal(lc.entries[0].wave, 9);
    assert.equal(lc.entries[0].plays, 4);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---------- Phase-2 Homelab SSO Integration Tests ----------
function withMockFetch(handler, fn) {
  const origFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    return handler(url, opts, calls);
  };
  return Promise.resolve().then(() => fn(calls)).finally(() => {
    globalThis.fetch = origFetch;
  });
}

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

test('pullSession auto-detects SSO cookie via GET /game/api/me even without saved local token', async () => {
  assert.equal(sdk.getAuth(), null);
  await withMockFetch(async (url, opts) => {
    if (url === '/game/api/me') {
      return jsonRes(200, {
        ok: true,
        user: {
          handle: 'avraham',
          display_name: 'Avraham',
          role: 'owner',
          canAccessDashboard: true,
          expiresAt: null,
          avatar: 'netrunner',
          xp: 750,
          eddies: 2400,
          profile: { scores: { defender: 9100 }, plays: { defender: 3 } },
          midruns: { protocol: { savedAt: 1700000000000, label: 'Matrix 4', state: { turn: 2 } } },
        },
      });
    }
    if (url === '/game/api/profile' && opts.method === 'PUT') {
      return jsonRes(200, { ok: true });
    }
    return jsonRes(404, { error: 'unexpected' });
  }, async (calls) => {
    const res = await sdk.pullSession();
    assert.equal(res.ok, true);
    assert.equal(res.online, true);
    assert.equal(calls[0].url, '/game/api/me');
    assert.equal(calls[0].opts.method, 'GET');
    assert.equal(calls[0].opts.credentials, 'same-origin');

    const auth = sdk.getAuth();
    assert.equal(auth.handle, 'avraham');
    assert.equal(auth.displayName, 'Avraham');
    assert.equal(auth.role, 'owner');
    assert.equal(auth.canAccessDashboard, true);
    assert.equal(auth.expiresAt, null);
    assert.ok(auth.token && !auth.token.startsWith('local:'));

    const storedAuth = JSON.parse(store.getItem(sdk.AUTH_KEY));
    assert.equal(storedAuth.role, 'owner');
    assert.equal(storedAuth.canAccessDashboard, true);
    assert.equal(storedAuth.displayName, 'Avraham');

    const p = sdk.getProfile();
    assert.equal(p.xp, 750);
    assert.equal(p.eddies, 2400);
    assert.equal(p.scores.defender, 9100);
    assert.equal(sdk.hasMidRun('protocol'), true);
    assert.deepEqual(sdk.loadMidRun('protocol').state, { turn: 2 });

    // Cloud sync uses same-origin cookie without sending fake Authorization header.
    const syncRes = await sdk.syncProfile();
    assert.equal(syncRes.ok, true);
    assert.equal(syncRes.online, true);
    const putCall = calls.find((c) => c.url === '/game/api/profile');
    assert.equal(putCall.opts.credentials, 'same-origin');
    assert.equal(putCall.opts.headers.Authorization, undefined);
  });
});

test('signInHomelab and signInOrRegister(mode: password) authenticate via /game/api/auth and merge profile/midruns', async () => {
  const bad = await sdk.signInHomelab({ username: '', password: 'secret' });
  assert.equal(bad.ok, false);

  await withMockFetch(async (url, opts) => {
    assert.equal(url, '/game/api/auth');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.credentials, 'same-origin');
    const body = JSON.parse(opts.body);
    if (body.password === 'wrong') {
      return jsonRes(401, { error: 'Invalid credentials' });
    }
    if (body.username === 'recruiter') {
      return jsonRes(200, {
        ok: true,
        created: false,
        token: 'hl_rec_tok',
        user: {
          handle: 'recruiter',
          display_name: 'Recruiter',
          role: 'recruiter_guest',
          canAccessDashboard: true,
          expiresAt: '2026-11-25T12:00:00Z',
          avatar: 'corpo',
          xp: 200,
          eddies: 500,
          profile: { scores: { icebreaker: 4400 } },
          midruns: { overclock: { savedAt: 1700000001000, label: 'Sector 2', state: { brick: 12 } } },
        },
      });
    }
    return jsonRes(200, {
      ok: true,
      created: false,
      token: 'hl_adm_tok',
      user: {
        handle: 'admin_node',
        display_name: 'Admin Node',
        role: 'admin',
        canAccessDashboard: true,
        expiresAt: null,
        avatar: 'techie',
        xp: 1200,
        eddies: 3000,
        profile: { scores: { blackwall: 7700 } },
        midruns: {},
      },
    });
  }, async () => {
    const failed = await sdk.signInHomelab({ username: 'recruiter', password: 'wrong' });
    assert.equal(failed.ok, false);
    assert.equal(failed.status, 401);
    assert.equal(sdk.getAuth(), null);

    const rec = await sdk.signInHomelab({ username: 'recruiter', password: 'good' });
    assert.equal(rec.ok, true);
    assert.equal(rec.online, true);
    assert.equal(rec.created, false);
    assert.equal(rec.user.role, 'recruiter_guest');
    assert.equal(rec.user.canAccessDashboard, true);
    assert.equal(rec.user.expiresAt, '2026-11-25T12:00:00Z');
    assert.equal(rec.user.displayName, 'Recruiter');
    assert.equal(rec.profile.scores.icebreaker, 4400);
    assert.deepEqual(sdk.loadMidRun('overclock').state, { brick: 12 });

    // signInOrRegister with mode: 'password' switches cleanly to admin without leaking recruiter's scores.
    const adm = await sdk.signInOrRegister({ mode: 'password', username: 'admin_node', password: 'good' });
    assert.equal(adm.ok, true);
    assert.equal(adm.user.role, 'admin');
    assert.equal(adm.user.displayName, 'Admin Node');
    assert.equal(adm.profile.scores.blackwall, 7700);
    assert.equal(adm.profile.scores.icebreaker, 0);
    assert.equal(sdk.hasMidRun('overclock'), false);
  });

  // Homelab SSO account cannot be bypassed offline via PIN login.
  const bypass = await sdk.signInOrRegister({ handle: 'admin_node', pin: '1234' });
  assert.equal(bypass.ok, false);
  assert.equal(bypass.status, 401);
});

test('pullSession clears stale online session on 401 cross-site logout, but preserves offline local accounts', async () => {
  sdk.setTheme('cyan');
  await withMockFetch(async (url) => {
    if (url === '/game/api/me') {
      return jsonRes(200, {
        ok: true,
        user: {
          handle: 'avraham',
          display_name: 'Avraham',
          role: 'owner',
          canAccessDashboard: true,
          expiresAt: null,
          xp: 500,
          eddies: 900,
          profile: { scores: { defender: 3200 } },
          midruns: { defender: { savedAt: 1700000002000, label: 'Wave 5', state: { wave: 5 } } },
        },
      });
    }
    return jsonRes(404, {});
  }, async () => {
    const r = await sdk.pullSession();
    assert.equal(r.ok, true);
    assert.equal(sdk.hasMidRun('defender'), true);
  });

  // Simulate user logging out on main Dashboard '/' -> /game/api/me now returns 401.
  await withMockFetch(async (url, opts) => {
    assert.equal(url, '/game/api/me');
    assert.equal(opts.credentials, 'same-origin');
    return jsonRes(401, { error: 'not authenticated' });
  }, async () => {
    const r = await sdk.pullSession();
    assert.equal(r.ok, false);
    assert.equal(r.signedOut, true);
    assert.equal(r.status, 401);
    assert.equal(sdk.getAuth(), null);
    assert.equal(sdk.hasMidRun('defender'), false);
    assert.equal(sdk.getProfile().scores.defender, 0);
    assert.equal(sdk.getTheme(), 'cyan', 'UI settings survive cross-site 401 sign-out');
  });

  // Offline local account is NOT wiped if /game/api/me returns 401.
  const offlineUser = await sdk.signInOrRegister({ handle: 'LocalRunner', pin: '4321' });
  assert.equal(offlineUser.online, false);
  await withMockFetch(async () => jsonRes(401, { error: 'no cookie' }), async () => {
    const r = await sdk.pullSession();
    assert.equal(r.ok, false);
    assert.equal(sdk.getAuth().handle, 'LocalRunner');
  });
});

test('signOut clears local session and calls POST /api/auth/logout with credentials same-origin', async () => {
  await withMockFetch(async () => jsonRes(200, {
    ok: true,
    token: 'tok_sso',
    user: { handle: 'avraham', display_name: 'Avraham', role: 'owner', canAccessDashboard: true, expiresAt: null },
  }), async () => {
    await sdk.signInHomelab({ username: 'avraham', password: 'pw' });
  });
  sdk.saveMidRun('lightcycle', { label: 'Round 3', state: { round: 3 } });
  assert.ok(sdk.getAuth());

  await withMockFetch(async (url, opts) => {
    assert.equal(url, '/api/auth/logout');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.credentials, 'same-origin');
    return jsonRes(200, { ok: true });
  }, async (calls) => {
    const guest = sdk.signOut();
    assert.equal(sdk.getAuth(), null);
    assert.equal(sdk.hasMidRun('lightcycle'), false);
    assert.equal(guest.xp, 0);
    assert.equal(calls.length, 1);
  });
});

test('online signInOrRegister (PIN) uses same-origin credentials and stores extended SSO auth fields', async () => {
  await withMockFetch(async (url, opts) => {
    if (url === '/game/api/auth') {
      assert.equal(opts.credentials, 'same-origin');
      assert.deepEqual(JSON.parse(opts.body), { handle: 'Cypher', pin: '2077', avatar: 'techie' });
      return jsonRes(201, {
        ok: true,
        created: true,
        token: 'pin_tok_1',
        user: {
          handle: 'Cypher',
          display_name: 'Cypher',
          role: 'player',
          canAccessDashboard: false,
          expiresAt: null,
          avatar: 'techie',
          xp: 10,
          eddies: 50,
          profile: {},
          midruns: {},
        },
      });
    }
    if (url === '/game/api/profile') {
      assert.equal(opts.credentials, 'same-origin');
      return jsonRes(200, { ok: true });
    }
    return jsonRes(404, {});
  }, async () => {
    const r = await sdk.signInOrRegister({ handle: 'Cypher', pin: '2077', avatar: 'techie' });
    assert.equal(r.ok, true);
    assert.equal(r.created, true);
    assert.equal(r.user.role, 'player');
    assert.equal(r.user.canAccessDashboard, false);
    assert.equal(r.user.expiresAt, null);
    assert.equal(r.user.displayName, 'Cypher');
    assert.equal(r.user.token, 'pin_tok_1');
  });
});

test('hub/i18n.js has complete EN and HE translations for all SSO and UI keys', async () => {
  const { STRINGS, t } = await import('./hub/i18n.js');
  const checkKeys = (enObj, heObj, prefix = '') => {
    for (const k of Object.keys(enObj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      assert.ok(k in heObj, `missing HE key: ${path}`);
      if (enObj[k] && typeof enObj[k] === 'object') {
        assert.ok(heObj[k] && typeof heObj[k] === 'object', `expected object for HE ${path}`);
        checkKeys(enObj[k], heObj[k], path);
      } else {
        assert.equal(typeof heObj[k], typeof enObj[k], `type mismatch for ${path}`);
      }
    }
  };
  checkKeys(STRINGS.en, STRINGS.he);
  checkKeys(STRINGS.he, STRINGS.en);
  assert.equal(t('en').ssoBadge, 'SINGLE SIGN-ON // ONE ACCOUNT ACROSS ALL HOMELAB SITES');
  assert.ok(t('he').authOpenDashboard);
});

test('signOutAndFlush awaits in-flight /api/auth/logout before resolving', async () => {
  await withMockFetch(async () => jsonRes(200, {
    ok: true,
    token: 'tok_flush',
    user: { handle: 'avraham', display_name: 'Avraham', role: 'owner', canAccessDashboard: true },
  }), async () => {
    await sdk.signInHomelab({ username: 'avraham', password: 'pw' });
  });

  let finished = false;
  await withMockFetch(async (url, opts) => {
    assert.equal(url, '/api/auth/logout');
    assert.equal(opts.method, 'POST');
    await new Promise((r) => setTimeout(r, 25));
    finished = true;
    return jsonRes(200, { ok: true });
  }, async () => {
    const guest = await sdk.signOutAndFlush(1000);
    assert.equal(finished, true);
    assert.equal(sdk.getAuth(), null);
    assert.equal(guest.xp, 0);
  });
});


