// Night Lab // Arcade 2077 — shared hub SDK.
// One localStorage profile + optional Netrunner cloud sync shared by the hub and every game cabinet.
// Safe to import in Node (no window / document / localStorage / fetch access at module load).

export const STORAGE_KEY = 'cp77hub.v1';
export const LEGACY_DEFENDER_KEY = 'hd.scores';
export const AUTH_KEY = 'cp77hub.auth.v1';
export const LOCAL_USERS_KEY = 'cp77hub.localUsers.v1';
export const MIDRUN_PREFIX = 'cp77hub.midrun.';
export const API_BASE = '/game/api';

export const THEMES = ['yellow', 'cyan', 'crimson'];
export const LANGS = ['en', 'he'];
export const AVATARS = Object.freeze(['netrunner', 'solo', 'techie', 'corpo']);
export const ROLES = Object.freeze(['owner', 'admin', 'recruiter_guest', 'player']);
export const HISTORY_LIMIT = 30;

const SSO_TOKEN = 'sso:cookie';
const HANDLE_RE = /^[A-Za-z0-9_\- .]+$/;
const PIN_RE = /^\d{4,8}$/;
const AVATAR_RE = /^[A-Za-z0-9_-]{1,32}$/;

export const GAMES_META = Object.freeze([
  {
    id: 'defender', path: 'defender/', accent: '#fcee09', genre: 'defense', key: '1',
    titleEn: 'Homelab Defender', titleHe: 'מגן ההומלאב',
    tagEn: 'TOWER DEFENSE', tagHe: 'הגנת מגדלים',
    descEn: '20-wave cyber-rack tower defense. 5 turrets, EMP & Overclock, 3 networks.',
    descHe: 'הגנת מגדלים על ארון שרתים ב-20 גלים. 5 צריחים, EMP ואוברקלוק, 3 רשתות.',
  },
  {
    id: 'icebreaker', path: 'icebreaker/', accent: '#00f0ff', genre: 'action', key: '2',
    titleEn: 'ICEBREAKER // Survivor', titleHe: 'שובר קרח // שורד',
    tagEn: 'ARENA ROGUELITE', tagHe: 'רוגלייט זירה',
    descEn: 'Bullet-heaven cyber-arena. Draft cyberware, trigger Sandevistan slow-mo, crush Blackwall bosses.',
    descHe: 'זירת סייבר עמוסת קליעים. בחרו שתלי סייבר, הפעילו האטת זמן וריסקו בוסים מעבר לחומה.',
  },
  {
    id: 'blackwall', path: 'blackwall/', accent: '#ff003c', genre: 'defense', key: '3',
    titleEn: 'Blackwall Defense', titleHe: 'הגנת החומה השחורה',
    tagEn: 'ORBITAL COMMAND', tagHe: 'פיקוד מסלולי',
    descEn: 'Intercept rogue AI missile salvos above Night City. Upgrade railguns, flak & city shields.',
    descHe: 'יירטו מטחי טילים של בינה מלאכותית סוררת מעל העיר. שדרגו תותחי רייל, נ״מ ומגיני עיר.',
  },
  {
    id: 'neonvector', path: 'neonvector/', accent: '#d946ef', genre: 'action', key: '4',
    titleEn: 'Neon Vector 2077', titleHe: 'ניאון וקטור 2077',
    tagEn: 'CYBERSPACE SHMUP', tagHe: 'יריות בסייברספייס',
    descEn: 'High-speed synthwave bullet-hell. Graze plasma for Overdrive and dismantle megacorp bosses.',
    descHe: 'מטח קליעים סינת׳ווייב מהיר. חלפו קרוב לפלזמה לטעינת אוברדרייב ופרקו בוסים של מגה-תאגידים.',
  },
  {
    id: 'protocol', path: 'protocol/', accent: '#00ff9f', genre: 'hacking', key: '5',
    titleEn: 'Breach Protocol', titleHe: 'פרוטוקול פריצה',
    tagEn: 'HEX MATRIX HACK', tagHe: 'פריצת מטריצת הקס',
    descEn: 'Iconic row/column hex-matrix hacking roguelike. Chain Daemons before the ICE timer hits zero.',
    descHe: 'רוגלייק פריצה במטריצת הקס של שורות ועמודות. שרשרו רצפי דמונים לפני שטיימר ה-ICE מתאפס.',
  },
  {
    id: 'overclock', path: 'overclock/', accent: '#ffaa00', genre: 'action', key: '6',
    titleEn: 'OVERCLOCK // ICE Shatter', titleHe: 'אוברקלוק // ניפוץ קרח',
    tagEn: 'CYBER BREAKER', tagHe: 'שובר חומות',
    descEn: 'Neon brick-breaker siege. Detonate Capacitors, fire Twin Lasers, shatter Core Bosses.',
    descHe: 'שובר לבני סייבר. פוצצו קבלים, ירו לייזרים כפולים ונפצו בוסים.',
  },
  {
    id: 'lightcycle', path: 'lightcycle/', accent: '#00e5ff', genre: 'action', key: '7',
    titleEn: 'LIGHTCYCLE // Trace', titleHe: 'אופנוע אור // עקבות',
    tagEn: 'NEON ARENA', tagHe: 'זירת ניאון',
    descEn: 'Tron light-cycle duels vs Corp Hunters. Trigger Phase Cloak to cut through enemy trails.',
    descHe: 'דו-קרב אופנועי אור נגד ציידי תאגיד. הפעילו חמקנות פאזה לחציית שובלים.',
  },
].map(Object.freeze));

export const GAME_IDS = GAMES_META.map((g) => g.id);
const isGame = (id) => GAME_IDS.includes(id);

// ---------- XP / Street Cred ----------
// Total XP needed to *reach* level L: 50·L·(L−1)  → L2=100, L3=300, L5=1000, L10=4500.
export function xpForLevel(level) {
  const l = Math.max(1, Math.floor(level));
  return 50 * l * (l - 1);
}

export function levelFromXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (xpForLevel(level + 1) <= x) level++;
  const base = xpForLevel(level);
  const nextAt = xpForLevel(level + 1);
  const current = x - base;
  const next = nextAt - base;
  return { level, current, next, pct: Math.min(100, Math.round((current / next) * 1000) / 10) };
}

// XP granted when a game does not provide its own figure.
export function defaultRunXp({ score = 0, won = false } = {}) {
  return 10 + Math.min(200, Math.floor(Math.max(0, score) / 50)) + (won ? 50 : 0);
}

// ---------- Achievements ----------
const totalPlays = (p) => GAME_IDS.reduce((s, id) => s + (p.plays[id] || 0), 0);
const distinctGames = (p) => GAME_IDS.filter((id) => (p.plays[id] || 0) > 0).length;
const lvl = (p) => levelFromXp(p.xp).level;
const best = (id) => (p) => p.scores[id] || 0;
const wins = (id) => (p) => p.wins[id] || 0;

const A = (id, icon, goal, metric, titleEn, titleHe, descEn, descHe, game = null) =>
  Object.freeze({ id, icon, goal, metric, titleEn, titleHe, descEn, descHe, game });

export const ACHIEVEMENTS = Object.freeze([
  A('first_jack', '⏻', 1, totalPlays, 'First Jack-In', 'חיבור ראשון', 'Finish your first run in any cabinet.', 'סיימו ריצה ראשונה בכל משחק.'),
  A('street_kid', '◆', 5, lvl, 'Street Kid', 'ילד רחוב', 'Reach Street Cred level 5.', 'הגיעו לרמת מוניטין 5.'),
  A('legend', '★', 10, lvl, 'Night Lab Legend', 'אגדת המעבדה', 'Reach Street Cred level 10.', 'הגיעו לרמת מוניטין 10.'),
  A('multi_runner', '⇄', 3, distinctGames, 'Multi-Runner', 'רץ רב-ערוצי', 'Play 3 different games.', 'שחקו ב-3 משחקים שונים.'),
  A('all_access', '▣', 7, distinctGames, 'All-Access', 'גישה מלאה', 'Play all 7 games.', 'שחקו בכל 7 המשחקים.'),
  A('hoarder', '€', 5000, (p) => p.eddiesEarned, 'Eddies Hoarder', 'אוגר יורודולרים', 'Earn 5,000 €$ across all runs.', 'צברו 5,000 €$ בכל הריצות.'),
  A('defender_win', '⛨', 1, wins('defender'), 'Rack Secured', 'הארון מאובטח', 'Win a full Homelab Defender run.', 'נצחו ריצה מלאה במגן ההומלאב.', 'defender'),
  A('defender_score', '⌁', 5000, best('defender'), 'Uptime Five Nines', 'זמינות חמש תשיעיות', 'Score 5,000+ in Homelab Defender.', 'השיגו 5,000+ נקודות במגן ההומלאב.', 'defender'),
  A('icebreaker_win', '❄', 1, wins('icebreaker'), 'ICE Shattered', 'הקרח נופץ', 'Survive a full ICEBREAKER run.', 'שרדו ריצה מלאה בשובר קרח.', 'icebreaker'),
  A('icebreaker_score', '⚡', 10000, best('icebreaker'), 'Chrome Overload', 'עומס כרום', 'Score 10,000+ in ICEBREAKER.', 'השיגו 10,000+ נקודות בשובר קרח.', 'icebreaker'),
  A('blackwall_win', '⛊', 1, wins('blackwall'), 'Skyline Saved', 'קו הרקיע ניצל', 'Win a Blackwall Defense campaign.', 'נצחו מערכה בהגנת החומה השחורה.', 'blackwall'),
  A('blackwall_score', '✹', 10000, best('blackwall'), 'Flak Curtain', 'מסך נ״מ', 'Score 10,000+ in Blackwall Defense.', 'השיגו 10,000+ נקודות בהגנת החומה השחורה.', 'blackwall'),
  A('neonvector_win', '▲', 1, wins('neonvector'), 'Megacorp Dismantled', 'התאגיד פורק', 'Clear Neon Vector 2077.', 'סיימו את ניאון וקטור 2077.', 'neonvector'),
  A('neonvector_score', '◈', 25000, best('neonvector'), 'Overdrive Ace', 'אלוף האוברדרייב', 'Score 25,000+ in Neon Vector 2077.', 'השיגו 25,000+ נקודות בניאון וקטור 2077.', 'neonvector'),
  A('protocol_win', '⌗', 1, wins('protocol'), 'Clean Breach', 'פריצה נקייה', 'Win a Breach Protocol run.', 'נצחו ריצה בפרוטוקול פריצה.', 'protocol'),
  A('protocol_score', '⬡', 3000, best('protocol'), 'Daemon Chainer', 'משרשר דמונים', 'Score 3,000+ in Breach Protocol.', 'השיגו 3,000+ נקודות בפרוטוקול פריצה.', 'protocol'),
  A('overclock_win', '✦', 1, wins('overclock'), 'Core Shattered', 'הליבה נופצה', 'Clear an OVERCLOCK // ICE Shatter run.', 'נצחו ריצה באוברקלוק // ניפוץ קרח.', 'overclock'),
  A('overclock_score', '❖', 15000, best('overclock'), 'Capacitor Chain', 'שרשרת קבלים', 'Score 15,000+ in OVERCLOCK.', 'השיגו 15,000+ נקודות באוברקלוק.', 'overclock'),
  A('lightcycle_win', '⟐', 1, wins('lightcycle'), 'Grid Sovereign', 'שליט הרשת', 'Win a LIGHTCYCLE // Trace tournament.', 'נצחו טורניר באופנוע אור // עקבות.', 'lightcycle'),
  A('lightcycle_score', '⟁', 8000, best('lightcycle'), 'Phase Phantom', 'רוח פאזה', 'Score 8,000+ in LIGHTCYCLE.', 'השיגו 8,000+ נקודות באופנוע אור.', 'lightcycle'),
]);

const ACH_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

export function achievementProgress(profile, ach) {
  const p = normalizeProfile(profile);
  const a = typeof ach === 'string' ? ACHIEVEMENTS.find((x) => x.id === ach) : ach;
  if (!a) return { cur: 0, goal: 1, pct: 0, unlocked: false };
  const unlocked = !!p.achievements[a.id];
  const raw = Math.max(0, Number(a.metric(p)) || 0);
  const cur = unlocked ? Math.max(raw, a.goal) : Math.min(raw, a.goal);
  return { cur: Math.min(cur, a.goal), goal: a.goal, pct: Math.round((Math.min(cur, a.goal) / a.goal) * 100), unlocked };
}

// ---------- Storage (guarded, injectable for tests) ----------
let storageOverride = null;
export function setStorageBackend(s) { storageOverride = s || null; }

function storage() {
  if (storageOverride) return storageOverride;
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === 'function') return ls;
  } catch (e) { /* access denied (sandboxed iframe / privacy mode) */ }
  return null;
}
function readJSON(key) {
  const s = storage(); if (!s) return null;
  try { const v = s.getItem(key); return v == null || v === '' ? null : JSON.parse(v); } catch (e) { return null; }
}
function writeJSON(key, val) {
  const s = storage(); if (!s) return false;
  try { s.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}
function removeKey(key) {
  const s = storage(); if (!s) return false;
  try {
    if (typeof s.removeItem === 'function') s.removeItem(key);
    else s.setItem(key, '');
    return true;
  } catch (e) { return false; }
}

const isBrowser = () => typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined';

// ---------- Profile ----------
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : d);
const perGame = (src) => {
  const o = {};
  for (const id of GAME_IDS) o[id] = Math.floor(num(src && src[id]));
  return o;
};

export function createProfile(now = Date.now()) {
  return {
    v: 1, createdAt: now, xp: 0, eddies: 0, eddiesEarned: 0,
    scores: perGame(null), plays: perGame(null), wins: perGame(null),
    history: [], achievements: {}, lastPlayed: null,
    settings: { lang: null, muted: false, theme: 'yellow' },
    migrated: false,
  };
}

export function normalizeProfile(raw) {
  const base = createProfile();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const ach = {};
  if (raw.achievements && typeof raw.achievements === 'object') {
    for (const [k, v] of Object.entries(raw.achievements)) if (ACH_IDS.has(k)) ach[k] = num(v, Date.now()) || Date.now();
  }
  return {
    v: 1,
    createdAt: num(raw.createdAt, base.createdAt) || base.createdAt,
    xp: Math.floor(num(raw.xp)),
    eddies: Math.floor(num(raw.eddies)),
    eddiesEarned: Math.floor(Math.max(num(raw.eddiesEarned), num(raw.eddies))),
    scores: perGame(raw.scores), plays: perGame(raw.plays), wins: perGame(raw.wins),
    history: Array.isArray(raw.history)
      ? raw.history.filter((h) => h && isGame(h.gameId)).slice(0, HISTORY_LIMIT).map((h) => ({
        gameId: h.gameId, score: Math.floor(num(h.score)), eddies: Math.floor(num(h.eddies)), xp: Math.floor(num(h.xp)),
        won: !!h.won, wave: Math.floor(num(h.wave)), at: num(h.at, Date.now()), best: !!h.best,
      }))
      : [],
    achievements: ach,
    lastPlayed: isGame(raw.lastPlayed) ? raw.lastPlayed : null,
    settings: {
      lang: LANGS.includes(s.lang) ? s.lang : null,
      muted: !!s.muted,
      theme: THEMES.includes(s.theme) ? s.theme : 'yellow',
    },
    migrated: !!raw.migrated,
  };
}

function mergeProfiles(localRaw, cloudRaw, cloudXp = 0, cloudEddies = 0) {
  const a = normalizeProfile(localRaw);
  const b = normalizeProfile(cloudRaw);
  const out = createProfile(Math.min(a.createdAt, b.createdAt));
  out.xp = Math.max(a.xp, b.xp, Math.floor(num(cloudXp)));
  out.eddies = Math.max(a.eddies, b.eddies, Math.floor(num(cloudEddies)));
  out.eddiesEarned = Math.max(a.eddiesEarned, b.eddiesEarned, out.eddies);
  for (const id of GAME_IDS) {
    out.scores[id] = Math.max(a.scores[id], b.scores[id]);
    out.plays[id] = Math.max(a.plays[id], b.plays[id]);
    out.wins[id] = Math.max(a.wins[id], b.wins[id]);
  }
  const seen = new Set();
  const mergedHistory = [...a.history, ...b.history]
    .sort((x, y) => y.at - x.at)
    .filter((h) => {
      const k = `${h.gameId}:${h.score}:${h.at}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, HISTORY_LIMIT);
  out.history = mergedHistory;
  const ach = { ...b.achievements };
  for (const [k, v] of Object.entries(a.achievements)) {
    ach[k] = ach[k] ? Math.min(ach[k], v) : v;
  }
  out.achievements = ach;
  out.lastPlayed = a.lastPlayed || b.lastPlayed || (mergedHistory[0] ? mergedHistory[0].gameId : null);
  out.settings = {
    lang: a.settings.lang || b.settings.lang || null,
    muted: a.settings.muted,
    theme: a.settings.theme || b.settings.theme || 'yellow',
  };
  out.migrated = true;
  evaluateAchievements(out);
  return out;
}

function migrateLegacy(p) {
  if (p.migrated) return false;
  p.migrated = true;
  const legacy = readJSON(LEGACY_DEFENDER_KEY);
  if (legacy && typeof legacy === 'object') {
    let top = 0;
    for (const v of Object.values(legacy)) {
      const sc = v && typeof v === 'object' ? num(v.score) : num(v);
      if (sc > top) top = sc;
    }
    top = Math.floor(top);
    if (top > p.scores.defender) p.scores.defender = top;
    if (top > 0 && p.plays.defender === 0) p.plays.defender = 1;
  }
  return true;
}

export function getProfile() {
  const p = normalizeProfile(readJSON(STORAGE_KEY));
  if (migrateLegacy(p)) {
    evaluateAchievements(p);
    saveProfile(p);
  }
  return p;
}

export function saveProfile(p) {
  const norm = normalizeProfile(p);
  const ok = writeJSON(STORAGE_KEY, norm);
  syncLocalUserCache(norm);
  return ok;
}

export function resetProfile() {
  const p = createProfile();
  p.migrated = true; // a deliberate reset should not resurrect legacy scores
  saveProfile(p);
  return p;
}

// Unlock every achievement whose metric is satisfied; returns newly unlocked ids.
function evaluateAchievements(p, extra = []) {
  const fresh = [];
  const now = Date.now();
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    if (extra.includes(a.id) || a.metric(p) >= a.goal) { p.achievements[a.id] = now; fresh.push(a.id); }
  }
  return fresh;
}

export function recordRun(gameId, { score = 0, eddies = 0, xp = 0, won = false, wave = 0, badges = [] } = {}) {
  if (!isGame(gameId)) throw new Error(`recordRun: unknown game "${gameId}"`);
  const p = getProfile();
  const sc = Math.floor(num(score));
  const ed = Math.floor(num(eddies));
  const wv = Math.floor(num(wave));
  const gained = Math.floor(num(xp)) || defaultRunXp({ score: sc, won });
  const before = levelFromXp(p.xp).level;

  const isNewBest = sc > 0 && sc > p.scores[gameId];
  if (isNewBest) p.scores[gameId] = sc;
  p.plays[gameId] += 1;
  if (won) p.wins[gameId] += 1;
  p.eddies += ed;
  p.eddiesEarned += ed;
  p.xp += gained;
  p.lastPlayed = gameId;
  p.history.unshift({ gameId, score: sc, eddies: ed, xp: gained, won: !!won, wave: wv, at: Date.now(), best: isNewBest });
  p.history.length = Math.min(p.history.length, HISTORY_LIMIT);

  const newLevel = levelFromXp(p.xp).level;
  const unlockedAchievements = evaluateAchievements(p, Array.isArray(badges) ? badges.filter((b) => ACH_IDS.has(b)) : []);
  saveProfile(p);

  // Completed run clears any mid-run checkpoint for this cabinet.
  clearMidRun(gameId);

  // Fire-and-forget cloud sync when running inside a browser with an online account.
  if (isBrowser() && typeof globalThis.fetch === 'function') {
    const auth = getAuth();
    if (auth && auth.token && !isLocalToken(auth.token)) {
      postScoreOnline(auth.token, { game_id: gameId, score: sc, wave: wv, won: !!won, eddies: ed, xp: gained })
        .then(() => syncProfile())
        .catch(() => {});
    }
  }

  return { isNewBest, leveledUp: newLevel > before, newLevel, xpGained: gained, unlockedAchievements, profile: p };
}

export function unlockAchievement(id) {
  if (!ACH_IDS.has(id)) return false;
  const p = getProfile();
  if (p.achievements[id]) return false;
  p.achievements[id] = Date.now();
  saveProfile(p);
  return true;
}

export function markLaunched(gameId) {
  if (!isGame(gameId)) return;
  const p = getProfile();
  p.lastPlayed = gameId;
  saveProfile(p);
}

// ---------- Local Users Fallback Store & Helpers ----------
const isLocalToken = (tok) => !tok || String(tok).startsWith('local:');

function readLocalUsers() {
  const raw = readJSON(LOCAL_USERS_KEY);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
function writeLocalUsers(map) {
  return writeJSON(LOCAL_USERS_KEY, map);
}

// Fast zero-dep salted hash for offline PIN verification (never stores plaintext PIN).
function hashPinLocal(pin, salt) {
  const str = `${salt}:${pin}:cp77hub.v1`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i) ^ (round & 0xff);
      h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (ch + round), 0x85ebca6b) >>> 0;
    }
    h1 = ((h1 << 13) | (h1 >>> 19)) >>> 0;
    h2 = ((h2 << 7) | (h2 >>> 25)) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function makeLocalSalt() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readAllLocalMidRuns() {
  const out = {};
  for (const id of GAME_IDS) {
    const r = loadMidRun(id);
    if (r) out[id] = r;
  }
  return out;
}

function syncLocalUserCache(profile) {
  const auth = getAuth();
  if (!auth || !auth.handle) return;
  const users = readLocalUsers();
  const key = auth.handle.toLowerCase();
  const existing = users[key] || {
    handle: auth.handle,
    displayName: auth.displayName || auth.handle,
    avatar: auth.avatar || 'netrunner',
    pinSalt: '',
    pinHash: '',
    createdAt: Date.now(),
  };
  users[key] = {
    ...existing,
    handle: auth.handle,
    displayName: auth.displayName || auth.handle,
    avatar: auth.avatar || existing.avatar || 'netrunner',
    role: auth.role || existing.role || 'player',
    canAccessDashboard: !!auth.canAccessDashboard,
    expiresAt: auth.expiresAt ?? null,
    profile: normalizeProfile(profile),
    midruns: readAllLocalMidRuns(),
    updatedAt: Date.now(),
  };
  writeLocalUsers(users);
}

function validateAuthInput({ handle, pin, avatar = 'netrunner' } = {}) {
  const h = typeof handle === 'string' ? handle.trim() : '';
  if (h.length < 2 || h.length > 20 || !HANDLE_RE.test(h)) {
    return { error: 'Handle must be 2-20 chars (letters, digits, space, _ - .)' };
  }
  const p = typeof pin === 'number' && Number.isFinite(pin) ? String(pin) : (typeof pin === 'string' ? pin.trim() : '');
  if (!PIN_RE.test(p)) {
    return { error: 'PIN must be 4-8 digits' };
  }
  const av = (typeof avatar === 'string' && AVATAR_RE.test(avatar)) ? avatar : 'netrunner';
  return { handle: h, pin: p, avatar: av };
}

// ---------- HTTP API Helper ----------
async function apiRequest(path, { method = 'GET', token = null, body = null, keepalive = false, timeoutMs = 4500 } = {}) {
  if (typeof globalThis.fetch !== 'function') return { offline: true };
  const headers = {};
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (token && !isLocalToken(token) && token !== SSO_TOKEN) headers.Authorization = `Bearer ${token}`;

  let ctrl = null;
  let timer = null;
  if (typeof globalThis.AbortController === 'function' && !keepalive && timeoutMs > 0) {
    ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
  }
  try {
    const res = await globalThis.fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== null ? JSON.stringify(body) : undefined,
      keepalive: !!keepalive,
      signal: ctrl ? ctrl.signal : undefined,
    });
    const ct = (res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : '') || '';
    const isJson = ct.toLowerCase().includes('application/json');
    if (!isJson && (res.status === 404 || res.status === 405 || res.status === 501 || res.status >= 500)) {
      return { offline: true };
    }
    let data = null;
    try { data = await res.json(); } catch (e) { return { offline: true }; }
    if (res.status >= 500) return { offline: true };
    return { offline: false, ok: res.ok, status: res.status, data };
  } catch (e) {
    return { offline: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function postScoreOnline(token, payload) {
  return apiRequest('/score', { method: 'POST', token, body: payload });
}

// ---------- Auth & Cloud Sync ----------
function normalizeRole(role) {
  const r = typeof role === 'string' ? role.trim().toLowerCase() : '';
  return ROLES.includes(r) ? r : 'player';
}

function normalizeExpiresAt(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) {
    const ms = val < 1e12 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  if (typeof val === 'string') {
    const s = val.trim();
    return s || null;
  }
  return null;
}

function normalizeAuthRecord(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.handle !== 'string' || !raw.handle.trim()) return null;
  const handle = raw.handle.trim();
  const displayName = (typeof raw.displayName === 'string' && raw.displayName.trim())
    || (typeof raw.display_name === 'string' && raw.display_name.trim())
    || handle;
  const canAccessDashboard = typeof raw.canAccessDashboard === 'boolean'
    ? raw.canAccessDashboard
    : (typeof raw.can_access_dashboard === 'boolean' ? raw.can_access_dashboard : false);
  return {
    handle,
    displayName,
    avatar: (typeof raw.avatar === 'string' && AVATAR_RE.test(raw.avatar)) ? raw.avatar : 'netrunner',
    token: typeof raw.token === 'string' ? raw.token : '',
    role: normalizeRole(raw.role),
    canAccessDashboard,
    expiresAt: normalizeExpiresAt(raw.expiresAt !== undefined ? raw.expiresAt : raw.expires_at),
  };
}

export function getAuth() {
  return normalizeAuthRecord(readJSON(AUTH_KEY));
}

function saveAuth(auth) {
  const norm = normalizeAuthRecord(auth);
  if (!norm) return false;
  return writeJSON(AUTH_KEY, norm);
}

function clearLocalSessionState() {
  const prevAuth = getAuth();
  const prevProfile = getProfile();
  if (prevAuth) {
    syncLocalUserCache(prevProfile);
  }
  removeKey(AUTH_KEY);
  for (const id of GAME_IDS) removeKey(MIDRUN_PREFIX + id);
  const guest = createProfile();
  guest.migrated = true;
  guest.settings = { ...prevProfile.settings };
  writeJSON(STORAGE_KEY, guest);
  return guest;
}

function prepareProfileForTargetHandle(targetHandle, prevAuth, prevProfile) {
  const switchingUser = prevAuth && prevAuth.handle.toLowerCase() !== targetHandle.toLowerCase();
  if (switchingUser) {
    // Snapshot previous account cleanly before switching so progress never leaks across handles.
    syncLocalUserCache(prevProfile);
    for (const id of GAME_IDS) removeKey(MIDRUN_PREFIX + id);
  }
  return switchingUser
    ? { ...createProfile(), settings: prevProfile.settings, migrated: true }
    : prevProfile;
}

function applyOnlineSession(u, rawToken, prevAuth, { created = false } = {}) {
  const prevProfile = getProfile();
  const handle = (u && typeof u.handle === 'string' && u.handle.trim())
    || (u && typeof u.username === 'string' && u.username.trim())
    || '';
  const sameUser = prevAuth && prevAuth.handle.toLowerCase() === handle.toLowerCase();
  const token = (typeof rawToken === 'string' && rawToken)
    || (u && typeof u.token === 'string' && u.token)
    || (prevAuth && !isLocalToken(prevAuth.token) ? prevAuth.token : SSO_TOKEN);
  const auth = normalizeAuthRecord({
    handle,
    displayName: (u && (u.display_name || u.displayName)) || handle,
    avatar: (u && u.avatar) || (sameUser ? prevAuth.avatar : 'netrunner'),
    token,
    role: u && u.role,
    canAccessDashboard: u && u.canAccessDashboard,
    expiresAt: u && u.expiresAt,
  });

  const baseLocal = prepareProfileForTargetHandle(auth.handle, prevAuth, prevProfile);
  const merged = mergeProfiles(baseLocal, (u && u.profile) || {}, (u && u.xp) || 0, (u && u.eddies) || 0);
  saveAuth(auth);
  applyCloudMidRuns((u && u.midruns) || {});
  saveProfile(merged);

  if (merged.xp > num(u && u.xp) || merged.eddies > num(u && u.eddies) || created) {
    syncProfile().catch(() => {});
  }
  return { auth, profile: merged };
}

function applyCloudMidRuns(midruns) {
  if (!midruns || typeof midruns !== 'object') return;
  for (const [gid, entry] of Object.entries(midruns)) {
    if (!isGame(gid) || !entry || typeof entry !== 'object') continue;
    const payload = entry.data && typeof entry.data === 'object' ? entry.data : entry;
    const cloudAt = num(payload.savedAt) || (num(entry.saved_at) * 1000) || Date.now();
    const local = loadMidRun(gid);
    if (!local || cloudAt > num(local.savedAt)) {
      const rec = {
        gameId: gid,
        savedAt: cloudAt,
        label: typeof payload.label === 'string' ? payload.label : '',
        state: 'state' in payload ? payload.state : payload,
      };
      writeJSON(MIDRUN_PREFIX + gid, rec);
    }
  }
}

export async function signInHomelab({ username, password } = {}) {
  const uName = typeof username === 'string' ? username.trim() : '';
  const pass = typeof password === 'string' ? password : '';
  if (!uName || !pass) {
    return { ok: false, error: 'Username and password are required' };
  }

  const prevAuth = getAuth();
  const res = await apiRequest('/auth', {
    method: 'POST',
    body: { username: uName, password: pass },
  });

  if (res.offline) {
    return { ok: false, offline: true, error: 'Homelab SSO unavailable offline — check server connection' };
  }
  if (!res.ok || (res.data && res.data.ok === false)) {
    const msg = (res.data && res.data.error) || `Auth failed (${res.status})`;
    return { ok: false, status: res.status, error: msg };
  }

  const u = (res.data && res.data.user) || {};
  const { auth, profile: merged } = applyOnlineSession(
    { ...u, handle: u.handle || u.username || uName },
    (res.data && res.data.token) || '',
    prevAuth,
    { created: !!(res.data && res.data.created) },
  );

  return {
    ok: true,
    created: !!(res.data && res.data.created),
    online: true,
    user: auth,
    profile: merged,
  };
}

export async function signInOrRegister(opts = {}) {
  if (opts && (opts.mode === 'password' || (opts.username !== undefined && opts.handle === undefined))) {
    return signInHomelab({ username: opts.username, password: opts.password });
  }
  const { handle, pin, avatar = 'netrunner' } = opts || {};
  const v = validateAuthInput({ handle, pin, avatar });
  if (v.error) return { ok: false, error: v.error };

  const prevAuth = getAuth();
  const prevProfile = getProfile();

  // 1. Try live backend API first.
  const res = await apiRequest('/auth', {
    method: 'POST',
    body: { handle: v.handle, pin: v.pin, avatar: v.avatar },
  });

  if (!res.offline) {
    if (!res.ok || (res.data && res.data.ok === false)) {
      const msg = (res.data && res.data.error) || `Auth failed (${res.status})`;
      return { ok: false, status: res.status, error: msg };
    }
    const u = (res.data && res.data.user) || {};
    const { auth, profile: merged } = applyOnlineSession(
      { ...u, handle: u.handle || v.handle, avatar: u.avatar || v.avatar },
      (res.data && res.data.token) || '',
      prevAuth,
      { created: !!(res.data && res.data.created) },
    );

    // Ensure local fallback also remembers this account + PIN hash for offline resilience.
    const users = readLocalUsers();
    const key = auth.handle.toLowerCase();
    const salt = (users[key] && users[key].pinSalt) || makeLocalSalt();
    users[key] = {
      handle: auth.handle,
      displayName: auth.displayName,
      avatar: auth.avatar,
      role: auth.role,
      canAccessDashboard: auth.canAccessDashboard,
      expiresAt: auth.expiresAt,
      pinSalt: salt,
      pinHash: hashPinLocal(v.pin, salt),
      profile: merged,
      midruns: readAllLocalMidRuns(),
      createdAt: (users[key] && users[key].createdAt) || Date.now(),
      updatedAt: Date.now(),
    };
    writeLocalUsers(users);

    return {
      ok: true,
      created: !!(res.data && res.data.created),
      online: true,
      user: auth,
      profile: merged,
    };
  }

  // 2. Offline fallback using local multi-user store (cp77hub.localUsers.v1).
  const users = readLocalUsers();
  const key = v.handle.toLowerCase();
  const existing = users[key];
  if (existing && (!existing.pinHash || hashPinLocal(v.pin, existing.pinSalt || '') !== existing.pinHash)) {
    return {
      ok: false,
      status: 401,
      error: existing.pinHash ? 'Wrong PIN for this Netrunner handle' : 'Account requires online Homelab sign-in',
    };
  }

  const baseLocal = prepareProfileForTargetHandle(v.handle, prevAuth, prevProfile);
  let created = false;
  let merged;
  let auth;

  if (!existing) {
    created = true;
    const salt = makeLocalSalt();
    merged = mergeProfiles(baseLocal, {}, 0, 0);
    auth = normalizeAuthRecord({
      handle: v.handle,
      displayName: v.handle,
      avatar: v.avatar,
      token: `local:${key}`,
      role: 'player',
      canAccessDashboard: false,
      expiresAt: null,
    });
    users[key] = {
      handle: v.handle,
      displayName: v.handle,
      avatar: v.avatar,
      role: 'player',
      canAccessDashboard: false,
      expiresAt: null,
      pinSalt: salt,
      pinHash: hashPinLocal(v.pin, salt),
      profile: merged,
      midruns: readAllLocalMidRuns(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } else {
    merged = mergeProfiles(baseLocal, existing.profile || {}, 0, 0);
    auth = normalizeAuthRecord({
      handle: existing.handle || v.handle,
      displayName: existing.displayName || existing.handle || v.handle,
      avatar: existing.avatar || v.avatar,
      token: `local:${key}`,
      role: existing.role || 'player',
      canAccessDashboard: !!existing.canAccessDashboard,
      expiresAt: existing.expiresAt ?? null,
    });
    if (existing.midruns) applyCloudMidRuns(existing.midruns);
    users[key] = {
      ...existing,
      profile: merged,
      midruns: readAllLocalMidRuns(),
      updatedAt: Date.now(),
    };
  }

  writeLocalUsers(users);
  saveAuth(auth);
  saveProfile(merged);

  return {
    ok: true,
    created,
    online: false,
    user: auth,
    profile: merged,
  };
}

let pendingSignOut = null;

export function signOut() {
  const guest = clearLocalSessionState();
  if (typeof globalThis.fetch === 'function') {
    try {
      const req = globalThis.fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
      });
      if (req && typeof req.then === 'function') {
        pendingSignOut = Promise.resolve(req).catch(() => {});
      }
    } catch (e) { /* best-effort */ }
  }
  return guest;
}

export async function signOutAndFlush(timeoutMs = 1500) {
  const guest = signOut();
  if (pendingSignOut) {
    let timer = 0;
    try {
      await Promise.race([
        pendingSignOut,
        new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return guest;
}

export async function syncProfile() {
  const auth = getAuth();
  const p = getProfile();
  if (!auth) return { ok: false, online: false };
  syncLocalUserCache(p);
  if (isLocalToken(auth.token)) return { ok: true, online: false, profile: p };
  const res = await apiRequest('/profile', {
    method: 'PUT',
    token: auth.token,
    body: { xp: p.xp, eddies: p.eddies, avatar: auth.avatar, profile: p },
  });
  if (res.offline || !res.ok) return { ok: false, online: false };
  return { ok: true, online: true, user: res.data };
}

export async function pullSession() {
  const prevAuth = getAuth();
  const reqToken = prevAuth && !isLocalToken(prevAuth.token) && prevAuth.token !== SSO_TOKEN ? prevAuth.token : null;
  const res = await apiRequest('/me', { method: 'GET', token: reqToken });
  if (res.offline) return { ok: false, online: false };

  if (res.status === 401) {
    if (prevAuth && !isLocalToken(prevAuth.token)) {
      clearLocalSessionState();
      return { ok: false, online: true, signedOut: true, status: 401 };
    }
    return { ok: false, online: false, status: 401 };
  }

  if (!res.ok || !res.data || res.data.ok === false) {
    return { ok: false, online: false };
  }

  const u = (res.data.user && typeof res.data.user === 'object') ? res.data.user : res.data;
  if (!u || typeof u.handle !== 'string' || !u.handle.trim()) {
    return { ok: false, online: false };
  }

  const { auth, profile: merged } = applyOnlineSession(u, res.data.token || '', prevAuth);
  return { ok: true, online: true, user: auth, profile: merged };
}

export async function fetchLeaderboard(gameId = 'all', limit = 20) {
  const g = gameId === 'all' || isGame(gameId) ? gameId : 'all';
  const lim = Math.max(1, Math.min(100, Math.floor(num(limit, 20)) || 20));

  const res = await apiRequest(`/leaderboard?game=${encodeURIComponent(g)}&limit=${lim}`);
  if (!res.offline && res.ok && res.data && Array.isArray(res.data.entries)) {
    const entries = res.data.entries.map((e, idx) => ({
      rank: Number(e.rank) || idx + 1,
      handle: e.handle || 'UNKNOWN',
      avatar: e.avatar || 'netrunner',
      score: g === 'all' ? Math.floor(num(e.combined_score ?? e.score)) : Math.floor(num(e.score)),
      xp: Math.floor(num(e.xp)),
      eddies: Math.floor(num(e.eddies)),
      wave: Math.floor(num(e.wave)),
      plays: g === 'all' ? Math.floor(num(e.games_played ?? e.plays)) : Math.floor(num(e.plays)),
    }));
    return { online: true, game: g, entries };
  }

  // Offline fallback: assemble leaderboard from localUsers + active profile.
  const users = readLocalUsers();
  const auth = getAuth();
  const curProfile = getProfile();
  const candidates = new Map();

  for (const [k, u] of Object.entries(users)) {
    if (!u || !u.handle) continue;
    candidates.set(k, {
      handle: u.handle,
      avatar: u.avatar || 'netrunner',
      profile: normalizeProfile(u.profile),
    });
  }

  if (auth && auth.handle) {
    candidates.set(auth.handle.toLowerCase(), {
      handle: auth.handle,
      avatar: auth.avatar || 'netrunner',
      profile: curProfile,
    });
  } else {
    const guestPlays = totalPlays(curProfile);
    const guestScore = GAME_IDS.reduce((s, id) => s + (curProfile.scores[id] || 0), 0);
    if (guestPlays > 0 || guestScore > 0 || curProfile.xp > 0) {
      candidates.set('__guest__', {
        handle: 'GUEST',
        avatar: 'netrunner',
        profile: curProfile,
      });
    }
  }

  const rows = [];
  for (const c of candidates.values()) {
    const p = c.profile;
    if (g === 'all') {
      const score = GAME_IDS.reduce((s, id) => s + (p.scores[id] || 0), 0);
      const plays = totalPlays(p);
      if (score <= 0 && plays <= 0 && p.xp <= 0) continue;
      rows.push({
        handle: c.handle,
        avatar: c.avatar,
        score,
        xp: p.xp,
        eddies: p.eddies,
        wave: 0,
        plays,
      });
    } else {
      const score = p.scores[g] || 0;
      const plays = p.plays[g] || 0;
      if (score <= 0 && plays <= 0) continue;
      let bestWave = 0;
      for (const h of p.history) {
        if (h.gameId === g && h.wave > bestWave) bestWave = h.wave;
      }
      rows.push({
        handle: c.handle,
        avatar: c.avatar,
        score,
        xp: p.xp,
        eddies: p.eddies,
        wave: bestWave,
        plays,
      });
    }
  }

  rows.sort((a, b) => (b.score - a.score) || (b.xp - a.xp) || a.handle.localeCompare(b.handle));
  const entries = rows.slice(0, lim).map((r, i) => ({ rank: i + 1, ...r }));
  return { online: false, game: g, entries };
}

// ---------- Mid-Run Auto-Save & Tab-Out Auto-Pause SDK ----------
export function saveMidRun(gameId, snapshot) {
  if (!isGame(gameId) || snapshot == null) return null;
  const rec = {
    gameId,
    savedAt: Date.now(),
    label: (snapshot && typeof snapshot === 'object' && typeof snapshot.label === 'string') ? snapshot.label : '',
    state: (snapshot && typeof snapshot === 'object' && 'state' in snapshot) ? snapshot.state : snapshot,
  };
  writeJSON(MIDRUN_PREFIX + gameId, rec);

  const auth = getAuth();
  if (auth && auth.handle) {
    const users = readLocalUsers();
    const key = auth.handle.toLowerCase();
    if (users[key]) {
      users[key].midruns = { ...(users[key].midruns || {}), [gameId]: rec };
      writeLocalUsers(users);
    }
    if (isBrowser() && typeof globalThis.fetch === 'function' && !isLocalToken(auth.token)) {
      apiRequest(`/midrun/${gameId}`, {
        method: 'PUT',
        token: auth.token,
        body: rec,
        keepalive: true,
      }).catch(() => {});
    }
  }
  return rec;
}

export function loadMidRun(gameId) {
  if (!isGame(gameId)) return null;
  const raw = readJSON(MIDRUN_PREFIX + gameId);
  if (!raw || typeof raw !== 'object' || raw.gameId !== gameId || raw.state === undefined) return null;
  return raw;
}

export function clearMidRun(gameId) {
  if (!isGame(gameId)) return false;
  removeKey(MIDRUN_PREFIX + gameId);
  const auth = getAuth();
  if (auth && auth.handle) {
    const users = readLocalUsers();
    const key = auth.handle.toLowerCase();
    if (users[key] && users[key].midruns) {
      delete users[key].midruns[gameId];
      writeLocalUsers(users);
    }
    if (isBrowser() && typeof globalThis.fetch === 'function' && !isLocalToken(auth.token)) {
      apiRequest(`/midrun/${gameId}`, {
        method: 'DELETE',
        token: auth.token,
        keepalive: true,
      }).catch(() => {});
    }
  }
  return true;
}

export function hasMidRun(gameId) {
  return loadMidRun(gameId) !== null;
}

export function installAutoPause({
  gameId,
  isRunning,
  isPaused,
  setPaused,
  getSnapshot,
  getLang: getLangFn = null,
  onAutoPaused = null,
} = {}) {
  const doc = globalThis.document;
  const win = globalThis.window;
  if (!doc || !win || typeof win.addEventListener !== 'function') return () => {};

  let wasAutoPaused = false;
  let bannerEl = null;
  let hideTimer = 0;

  const removeBanner = () => {
    clearTimeout(hideTimer);
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  };

  const showProtectedPill = () => {
    removeBanner();
    const curLang = typeof getLangFn === 'function' ? getLangFn() : getLang();
    const isHe = curLang === 'he';
    const text = isHe
      ? 'המשחק הושהה אוטומטית // ההתקדמות נשמרה'
      : 'SESSION PROTECTED // AUTO-PAUSED — PROGRESS SAVED';

    const el = doc.createElement('div');
    el.className = 'cp77-autopause-pill cyber-clip-sm';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('dir', isHe ? 'rtl' : 'ltr');
    // Inline fallback styles ensure visibility in every cabinet even without hub.css.
    Object.assign(el.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 16px',
      background: 'rgba(10, 14, 24, 0.94)',
      color: 'var(--accent-2, #00f0ff)',
      border: '1px solid var(--accent-2, #00f0ff)',
      boxShadow: '0 0 22px rgba(0, 240, 255, 0.35), 0 8px 28px rgba(0, 0, 0, 0.6)',
      fontFamily: "var(--mono, 'Plex Mono', ui-monospace, monospace)",
      fontSize: '12px',
      fontWeight: '600',
      letterSpacing: isHe ? '0.02em' : '0.1em',
      maxWidth: 'calc(100vw - 24px)',
      cursor: 'pointer',
    });

    const dot = doc.createElement('span');
    Object.assign(dot.style, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#00ff9f',
      boxShadow: '0 0 8px #00ff9f',
      flexShrink: '0',
    });

    const msg = doc.createElement('span');
    msg.textContent = text;

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', isHe ? 'סגירה' : 'Dismiss');
    Object.assign(closeBtn.style, {
      background: 'transparent',
      border: '0',
      color: 'var(--accent, #fcee09)',
      fontWeight: '700',
      cursor: 'pointer',
      padding: '0 2px',
      fontSize: '13px',
      lineHeight: '1',
    });

    el.appendChild(dot);
    el.appendChild(msg);
    el.appendChild(closeBtn);
    el.addEventListener('click', removeBanner);
    (doc.body || doc.documentElement).appendChild(el);
    bannerEl = el;
    hideTimer = setTimeout(removeBanner, 6500);
  };

  const checkpoint = () => {
    if (typeof isRunning !== 'function' || !isRunning()) return;
    if (typeof getSnapshot !== 'function') return;
    try {
      const snap = getSnapshot();
      if (snap) saveMidRun(gameId, snap);
    } catch (e) { /* never break gameplay */ }
  };

  const triggerPause = (reason) => {
    if (typeof isRunning !== 'function' || !isRunning()) return;
    checkpoint();
    const alreadyPaused = typeof isPaused === 'function' ? !!isPaused() : false;
    if (!alreadyPaused) {
      if (typeof setPaused === 'function') setPaused(true);
      wasAutoPaused = true;
      if (typeof onAutoPaused === 'function') onAutoPaused(reason);
    }
  };

  const onVisChange = () => {
    if (doc.hidden) triggerPause('tabout');
    else if (wasAutoPaused) {
      wasAutoPaused = false;
      showProtectedPill();
    }
  };
  const onBlur = () => triggerPause('tabout');
  const onFocus = () => {
    if (wasAutoPaused) {
      wasAutoPaused = false;
      showProtectedPill();
    }
  };
  const onPageHide = () => triggerPause('pagehide');

  doc.addEventListener('visibilitychange', onVisChange);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);
  win.addEventListener('pagehide', onPageHide);

  const timer = setInterval(() => {
    if (typeof isRunning === 'function' && isRunning() && !(typeof isPaused === 'function' && isPaused())) {
      checkpoint();
    }
  }, 8000);

  return function cleanup() {
    clearInterval(timer);
    removeBanner();
    doc.removeEventListener('visibilitychange', onVisChange);
    win.removeEventListener('blur', onBlur);
    win.removeEventListener('focus', onFocus);
    win.removeEventListener('pagehide', onPageHide);
  };
}

// ---------- Settings ----------
function updateSettings(patch) {
  const p = getProfile();
  Object.assign(p.settings, patch);
  saveProfile(p);
  return p.settings;
}

function urlLang() {
  try {
    const q = globalThis.location && globalThis.location.search;
    if (!q) return null;
    const l = new URLSearchParams(q).get('lang');
    return LANGS.includes(l) ? l : null;
  } catch (e) { return null; }
}

export function getLang() {
  const fromUrl = urlLang();
  if (fromUrl) return fromUrl;
  const stored = getProfile().settings.lang;
  if (stored) return stored;
  try {
    const nav = globalThis.navigator && String(globalThis.navigator.language || '').toLowerCase();
    if (nav && nav.startsWith('he')) return 'he';
  } catch (e) { /* ignore */ }
  return 'en';
}
export function setLang(lang) { return updateSettings({ lang: LANGS.includes(lang) ? lang : 'en' }).lang; }
export function getMuted() { return getProfile().settings.muted; }
export function setMuted(m) { return updateSettings({ muted: !!m }).muted; }
export function getTheme() { return getProfile().settings.theme; }
export function setTheme(t) { return updateSettings({ theme: THEMES.includes(t) ? t : 'yellow' }).theme; }
export function nextTheme(t) { return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]; }
export function prevTheme(t) { const i = THEMES.indexOf(t); return THEMES[(i <= 0 ? THEMES.length : i) - 1]; }

export function getGame(id) { return GAMES_META.find((g) => g.id === id) || null; }

// Applies theme + lang/dir to <html>, keeps tabs in sync via the storage event.
export function initGameChrome({ gameId = null, onLangChange = null, onMuteChange = null } = {}) {
  const lang = getLang();
  const muted = getMuted();
  const theme = getTheme();
  const doc = globalThis.document;
  const apply = (l, th) => {
    if (!doc || !doc.documentElement) return;
    const el = doc.documentElement;
    el.setAttribute('data-theme', th);
    el.setAttribute('lang', l);
    el.setAttribute('dir', l === 'he' ? 'rtl' : 'ltr');
    if (gameId) el.setAttribute('data-game', gameId);
  };
  apply(lang, theme);
  if (globalThis.addEventListener && doc) {
    let last = { lang, muted, theme };
    globalThis.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      const s = getProfile().settings;
      const l = s.lang || last.lang;
      if (s.theme !== last.theme || l !== last.lang) apply(l, s.theme);
      if (l !== last.lang && typeof onLangChange === 'function') onLangChange(l);
      if (s.muted !== last.muted && typeof onMuteChange === 'function') onMuteChange(s.muted);
      last = { lang: l, muted: s.muted, theme: s.theme };
    });
  }
  return { lang, muted, theme };
}
