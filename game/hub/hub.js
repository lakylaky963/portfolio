// Night Lab // Arcade 2077 — hub controller.
import {
  GAMES_META, ACHIEVEMENTS, STORAGE_KEY, AUTH_KEY, MIDRUN_PREFIX,
  getProfile, levelFromXp, achievementProgress,
  getLang, setLang, getMuted, setMuted, getTheme, setTheme, nextTheme, prevTheme,
  resetProfile, markLaunched, getGame,
  getAuth, signInOrRegister, signInHomelab, signOutAndFlush, fetchLeaderboard, hasMidRun, pullSession,
} from '../shared/hub-sdk.js';
import { t as tr } from './i18n.js?v=20261120';
import * as audio from './audio.js';
import { startBackground } from './bg.js?v=20261120';
import { startPreviews } from './previews.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const AVATAR_GLYPH = { netrunner: '◈', solo: '⚔', techie: '⚙', corpo: '❖' };
const avatarGlyph = (av) => AVATAR_GLYPH[av] || '◈';
const ROLE_META = {
  owner: { glyph: '👑', cls: 'role-owner' },
  admin: { glyph: '🛡', cls: 'role-admin' },
  recruiter_guest: { glyph: '⚡', cls: 'role-recruiter' },
  player: { glyph: null, cls: 'role-player' },
};
const ALL_ROLE_CLS = ['role-owner', 'role-admin', 'role-recruiter', 'role-player'];

let lang = getLang();
let theme = getTheme();
let profile = getProfile();
let filter = 'all';
let sel = -1;
let bg = null;
let previews = null;
let activeTab = 'T';
let lbGame = 'all';
let selectedAvatar = 'netrunner';
let authMode = 'pin';
let expiryTimer = 0;
let lbReqId = 0;

setLang(lang); // persist URL / navigator choice
audio.setMuted(getMuted());

const S = () => tr(lang);
const field = (g, k) => g[k + (lang === 'he' ? 'He' : 'En')];
const deepGet = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

// ---------- Rendering ----------
function applyChrome() {
  root.lang = lang; root.dir = lang === 'he' ? 'rtl' : 'ltr';
  root.setAttribute('data-theme', theme);
  document.title = S().pageTitle;
  $$('[data-t]').forEach((el) => { const v = deepGet(S(), el.dataset.t); if (typeof v === 'string') el.textContent = v; });
  $$('[data-t-label]').forEach((el) => { const v = deepGet(S(), el.dataset.tLabel); if (typeof v === 'string') el.setAttribute('aria-label', v); });
  $('#portfolioLink').href = lang === 'he' ? '/portfolio/he/' : '/portfolio/';

  const muted = audio.isMuted();
  $('#muteBtn').textContent = muted ? S().soundOff : S().soundOn;
  $('#muteBtn').setAttribute('aria-pressed', String(!muted));
  $('#muteBtn').setAttribute('aria-label', S().soundLabel);
  $('#ambientBtn').textContent = audio.isAmbient() ? S().ambientOn : S().ambientOff;
  $('#ambientBtn').setAttribute('aria-pressed', String(audio.isAmbient()));
  $('#ambientBtn').setAttribute('aria-label', S().ambientLabel);
  $('#langBtn').textContent = S().langBtn;
  $('#langBtn').setAttribute('aria-label', S().langLabel);
  $('#langBtn').lang = lang === 'he' ? 'en' : 'he';
  $('#trophyBtn').setAttribute('aria-label', S().trophiesLabel);
  $('#lbBtn').setAttribute('aria-label', S().lbBtnLabel);

  $$('[data-theme-btn]').forEach((b) => {
    const on = b.dataset.themeBtn === theme;
    b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    b.title = S().themes[b.dataset.themeBtn]; b.querySelector('.sr-only').textContent = S().themes[b.dataset.themeBtn];
  });
  $('#resetBtn').textContent = S().reset;
  $('#authHandle').placeholder = S().handlePlaceholder;
  $('#authPin').placeholder = S().pinPlaceholder;
  $('#authSsoUser').placeholder = S().ssoUserPlaceholder;
  $('#authSsoPass').placeholder = S().ssoPassPlaceholder;

  renderAuthButton();
  if (bg) bg.refresh();
}

function renderAuthButton() {
  const auth = getAuth();
  const btn = $('#authBtn');
  const roleEl = $('#authBtnRole');
  btn.setAttribute('aria-label', S().authLabel);
  btn.classList.remove(...ALL_ROLE_CLS);
  if (auth) {
    const role = auth.role || 'player';
    const rm = ROLE_META[role] || ROLE_META.player;
    btn.classList.add('signed-in', rm.cls);
    $('#authBtnAvatar').textContent = rm.glyph || avatarGlyph(auth.avatar);
    if (role !== 'player') {
      const name = (auth.displayName || auth.handle).toUpperCase();
      const shortRole = (S().roleShort && S().roleShort[role]) || role.toUpperCase();
      $('#authBtnLabel').textContent = name;
      roleEl.textContent = `· ${shortRole}`;
      roleEl.hidden = false;
    } else {
      $('#authBtnLabel').textContent = auth.displayName || auth.handle;
      roleEl.textContent = '';
      roleEl.hidden = true;
    }
  } else {
    btn.classList.remove('signed-in');
    $('#authBtnAvatar').textContent = '◈';
    $('#authBtnLabel').textContent = S().guestSignIn;
    roleEl.textContent = '';
    roleEl.hidden = true;
  }
}

function renderStats() {
  const L = levelFromXp(profile.xp);
  const plays = GAMES_META.reduce((s, g) => s + profile.plays[g.id], 0);
  const score = GAMES_META.reduce((s, g) => s + profile.scores[g.id], 0);
  const ach = Object.keys(profile.achievements).length;
  $('#credLvl').textContent = L.level;
  $('#credFill').style.width = `${L.pct}%`;
  $('#credBar').setAttribute('aria-valuenow', String(Math.round(L.pct)));
  $('#cred').title = `${fmt(L.current)} / ${fmt(L.next)} XP`;
  $('#eddies').textContent = fmt(profile.eddies);
  $('#trophyCount').textContent = ach;
  countUp($('#stEddies'), profile.eddies, '€$ ');
  countUp($('#stLevel'), L.level, `${S().lvl} `);
  countUp($('#stPlayed'), plays);
  $('#stTrophies').textContent = `${ach}/${ACHIEVEMENTS.length}`;
  countUp($('#stScore'), score);
  const cont = $('#continueBtn');
  const last = getGame(profile.lastPlayed);
  if (last) {
    cont.textContent = `${S().cont} // ${field(last, 'title')}`;
    cont.href = gameHref(last); cont.removeAttribute('aria-disabled'); cont.dataset.game = last.id; cont.tabIndex = 0;
  } else {
    cont.textContent = S().contNone; cont.href = '#'; cont.setAttribute('aria-disabled', 'true'); delete cont.dataset.game; cont.tabIndex = -1;
  }
}

function countUp(el, to, prefix = '') {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = el.dataset.v !== undefined ? Number(el.dataset.v) : (el.id === 'stLevel' ? 1 : 0);
  el.dataset.v = String(to);
  if (reduce || from === to) { el.textContent = prefix + fmt(to); return; }
  const t0 = performance.now(), dur = 700;
  const step = (now) => {
    const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - (1 - k) ** 3;
    el.textContent = prefix + fmt(from + (to - from) * e);
    if (k < 1 && el.dataset.v === String(to)) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const gameHref = (g) => `${g.path}?lang=${lang}`;

function renderGrid() {
  const grid = $('#grid');
  const cards = GAMES_META.map((g, i) => {
    const best = profile.scores[g.id], plays = profile.plays[g.id];
    const flag = profile.lastPlayed === g.id ? S().lastTag : plays === 0 ? S().newTag : '';
    const saved = hasMidRun(g.id);
    return `<article class="card cyber-clip" data-id="${g.id}" data-genre="${g.genre}" style="--ga:${g.accent}" aria-labelledby="t-${g.id}">
      <div class="card-preview"><canvas data-scene="${g.id}" aria-hidden="true"></canvas>
        <span class="card-num">0${i + 1}</span>${flag ? `<span class="card-flag">${esc(flag)}</span>` : ''}${saved ? `<span class="card-resume cyber-clip-sm">▶ ${esc(S().resumeTag)}</span>` : ''}</div>
      <div class="card-body">
        <span class="card-tag">${esc(field(g, 'tag'))}</span>
        <h2 class="card-title" id="t-${g.id}">${esc(field(g, 'title'))}</h2>
        <p class="card-desc">${esc(field(g, 'desc'))}</p>
        <div class="card-meta"><span>${esc(S().best)}<b>${fmt(best)}</b></span><span>${esc(S().plays)}<b>${fmt(plays)}</b></span></div>
        <a class="cyber-btn card-cta" href="${gameHref(g)}" data-game="${g.id}">${esc(S().jack)}</a>
      </div>
      <div class="card-frame cyber-clip" aria-hidden="true"></div>
    </article>`;
  });
  grid.innerHTML = cards.join('');
  applyFilter();
  if (previews && previews.stop) previews.stop();
  previews = startPreviews($$('canvas[data-scene]', grid));
}

function applyFilter() {
  $$('#filters [data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
  $$('.card').forEach((c) => { c.hidden = filter !== 'all' && c.dataset.genre !== filter; });
  const vis = visibleCards();
  if (sel >= 0 && !vis[sel]) setSel(-1);
}
const visibleCards = () => $$('.card').filter((c) => !c.hidden);

function setSel(i) {
  const vis = visibleCards();
  $$('.card.is-sel').forEach((c) => c.classList.remove('is-sel'));
  sel = vis.length ? i : -1;
  if (sel >= 0 && vis[sel]) {
    vis[sel].classList.add('is-sel');
    vis[sel].querySelector('.card-cta').focus({ preventScroll: true });
    vis[sel].scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    audio.sfx.hover();
  }
}

// ---------- Drawer (Trophies / Run Log / Global Leaderboard) ----------
function renderDrawer() {
  const unlocked = Object.keys(profile.achievements).length;
  $('#achSummary').textContent = S().unlockedOf(unlocked, ACHIEVEMENTS.length);
  $('#achList').innerHTML = ACHIEVEMENTS.map((a) => {
    const p = achievementProgress(profile, a);
    const title = lang === 'he' ? a.titleHe : a.titleEn, desc = lang === 'he' ? a.descHe : a.descEn;
    return `<li class="ach${p.unlocked ? ' on' : ''}">
      <span class="ach-icon" aria-hidden="true">${a.icon}</span>
      <span class="ach-title">${esc(title)}<small>${p.unlocked ? S().unlocked : `${fmt(p.cur)}/${fmt(p.goal)}`}</small></span>
      <span class="ach-desc">${esc(desc)}</span>
      <span class="ach-bar" aria-hidden="true"><i style="width:${p.unlocked ? 100 : p.pct}%"></i></span>
    </li>`;
  }).join('');

  const runs = profile.history;
  $('#runList').innerHTML = runs.length ? runs.map((r) => {
    const g = getGame(r.gameId);
    const mins = Math.max(0, Math.floor((Date.now() - r.at) / 60000));
    return `<li class="run"><span class="run-stripe" style="background:${g.accent}"></span>
      <span class="run-name">${esc(field(g, 'title'))}</span><span class="run-score">${fmt(r.score)}</span>
      <span class="run-sub">${esc(S().ago(mins))}${r.wave ? ` · ${esc(S().wave)} ${r.wave}` : ''} · <span dir="ltr">+${fmt(r.eddies)} €$</span> · <span dir="ltr">+${fmt(r.xp)} XP</span></span>
      <span class="run-tags"><span class="${r.won ? 'w' : 'l'}">${r.won ? S().won : S().lost}</span>${r.best ? `<span class="b">${esc(S().newBest)}</span>` : ''}</span></li>`;
  }).join('') : `<li class="empty">${esc(S().noRuns)}</li>`;

  renderLeaderboardFilters();
  if (activeTab === 'L') loadLeaderboard();
}

function renderLeaderboardFilters() {
  const wrap = $('#lbFilters');
  const pills = [
    `<button type="button" class="lb-pill cyber-clip-sm" data-lb-game="all" aria-pressed="${lbGame === 'all'}">${esc(S().lbGlobal)}</button>`,
    ...GAMES_META.map((g) => `<button type="button" class="lb-pill cyber-clip-sm" data-lb-game="${g.id}" style="--pc:${g.accent}" aria-pressed="${lbGame === g.id}">${esc(S().lbShort[g.id] || g.id.toUpperCase())}</button>`),
  ];
  wrap.innerHTML = pills.join('');
}

async function loadLeaderboard() {
  const reqId = ++lbReqId;
  const list = $('#lbList');
  const hint = $('#lbGuestHint');
  const auth = getAuth();
  if (!auth) {
    hint.textContent = S().lbGuestHint;
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }
  list.innerHTML = `<li class="empty">${esc(S().lbLoading)}</li>`;

  const res = await fetchLeaderboard(lbGame, 20);
  if (reqId !== lbReqId) return; // superseded by newer filter click

  const badge = $('#lbSyncBadge');
  badge.classList.toggle('online', !!res.online);
  $('#lbSyncText').textContent = res.online ? S().lbOnline : S().lbLocal;

  if (!res.entries || !res.entries.length) {
    list.innerHTML = `<li class="empty">${esc(S().lbEmpty)}</li>`;
    return;
  }

  const meLower = auth ? auth.handle.toLowerCase() : '';
  list.innerHTML = res.entries.map((e) => {
    const rankCls = e.rank <= 3 ? ` rank-${e.rank}` : '';
    const isMe = meLower && e.handle.toLowerCase() === meLower;
    const lvl = levelFromXp(e.xp || 0).level;
    const subParts = [];
    if (lbGame === 'all') {
      subParts.push(`${S().lvl} ${lvl}`);
      if (e.plays) subParts.push(`${fmt(e.plays)} ${S().lbRuns}`);
      if (e.eddies) subParts.push(`${fmt(e.eddies)} €$`);
    } else {
      if (e.wave) subParts.push(`${S().wave} ${e.wave}`);
      if (e.plays) subParts.push(`${fmt(e.plays)} ${S().lbRuns}`);
    }
    return `<li class="lb-row${rankCls}${isMe ? ' is-me' : ''}">
      <span class="lb-rank">#${e.rank}</span>
      <span class="lb-av" aria-hidden="true">${avatarGlyph(e.avatar)}</span>
      <span class="lb-who">
        <span class="lb-handle">${esc(e.handle)}${isMe ? `<span class="lb-you">${esc(S().lbYou)}</span>` : ''}</span>
        <span class="lb-sub">${esc(subParts.join(' · ') || 'NETRUNNER')}</span>
      </span>
      <span class="lb-score">${fmt(e.score)}</span>
    </li>`;
  }).join('');
}

let lastFocus = null;
function openDrawer(tab = 'T') {
  if (!$('#authModal').hidden) closeAuthModal(false);
  const wasClosed = $('#drawer').hidden;
  if (wasClosed) lastFocus = document.activeElement;
  activeTab = tab;
  renderDrawer();
  selectTab(tab, false);
  if (wasClosed) {
    $('#drawer').hidden = false; $('#scrim').hidden = false;
    document.body.style.overflow = 'hidden';
    audio.sfx.swoosh();
    $('#drawerClose').focus();
  }
}

function closeDrawer(restoreFocus = true) {
  if ($('#drawer').hidden) return;
  $('#drawer').hidden = true; $('#scrim').hidden = true;
  document.body.style.overflow = '';
  disarmReset();
  audio.sfx.click();
  if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus();
}

function selectTab(which, playSound = true) {
  activeTab = which;
  for (const code of ['T', 'H', 'L']) {
    const on = code === which;
    $(`#tab${code}`).setAttribute('aria-selected', String(on));
    $(`#panel${code}`).hidden = !on;
  }
  if (which === 'L') loadLeaderboard();
  if (playSound) audio.sfx.click();
}

let armTimer = 0;
function disarmReset() { clearTimeout(armTimer); const b = $('#resetBtn'); b.classList.remove('armed'); b.textContent = S().reset; }
function onReset() {
  const b = $('#resetBtn');
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.textContent = S().resetConfirm; audio.sfx.error();
    armTimer = setTimeout(disarmReset, 4000);
    return;
  }
  disarmReset();
  profile = resetProfile();
  // Preserve the user's current UI choices across the wipe.
  setLang(lang); setTheme(theme); setMuted(audio.isMuted());
  profile = getProfile();
  renderAll(); renderDrawer();
  toast(S().resetDone);
}

// ---------- Netrunner Access Modal ----------
let authLastFocus = null;
function clearExpiryTimer() {
  if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = 0; }
}

function formatCountdown(expiresAt) {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return { expired: true, text: '' };
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (d > 0 || h > 0) parts.push(`${String(h).padStart(d > 0 ? 2 : 1, '0')}h`);
  parts.push(`${String(m).padStart(2, '0')}m`);
  if (d === 0) parts.push(`${String(s).padStart(2, '0')}s`);
  return { expired: false, text: parts.join(' ') };
}

function updateExpiryDisplay(auth) {
  const el = $('#authCardExpiry');
  if (!auth || !auth.expiresAt) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('expired');
    return;
  }
  const cd = formatCountdown(auth.expiresAt);
  if (!cd) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.classList.toggle('expired', cd.expired);
  el.textContent = cd.expired ? S().sessionExpired : S().expiresIn(`\u2066${cd.text}\u2069`);
}

function setSelectedAvatar(av) {
  selectedAvatar = AVATAR_GLYPH[av] ? av : 'netrunner';
  $$('#avatarGrid [data-avatar]').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.avatar === selectedAvatar));
  });
}

function selectAuthMode(mode, playSound = false, focusInput = false) {
  authMode = mode === 'sso' ? 'sso' : 'pin';
  const isPin = authMode === 'pin';
  $('#tabAuthPin').setAttribute('aria-selected', String(isPin));
  $('#tabAuthSso').setAttribute('aria-selected', String(!isPin));
  $('#authForm').hidden = !isPin;
  $('#authSsoForm').hidden = isPin;
  const errEl = $('#authError');
  errEl.hidden = true;
  errEl.textContent = '';
  if (playSound) audio.sfx.click();
  if (focusInput) (isPin ? $('#authHandle') : $('#authSsoUser')).focus();
}

function renderAuthModal(forceForm = false, { resetFields = true } = {}) {
  clearExpiryTimer();
  const auth = getAuth();
  const activeView = $('#authActiveView');
  const signInView = $('#authSignInView');
  const errEl = $('#authError');
  errEl.hidden = true;
  errEl.textContent = '';

  if (auth && !forceForm) {
    const L = levelFromXp(profile.xp);
    const isOnline = auth.token && !auth.token.startsWith('local:');
    const role = auth.role || 'player';
    const rm = ROLE_META[role] || ROLE_META.player;

    const card = $('#authCard');
    card.classList.remove(...ALL_ROLE_CLS);
    card.classList.add(rm.cls);

    $('#authCardAvatar').textContent = rm.glyph || avatarGlyph(auth.avatar);
    const name = auth.displayName || auth.handle;
    $('#authCardHandle').textContent = name;

    const rolePill = $('#authCardRole');
    rolePill.classList.remove(...ALL_ROLE_CLS);
    rolePill.classList.add(rm.cls);
    rolePill.textContent = (S().roles && S().roles[role]) || role.toUpperCase();

    const handleTag = name.toLowerCase() !== auth.handle.toLowerCase() ? `@${auth.handle} · ` : '';
    $('#authCardMeta').textContent = `${handleTag}${S().lvl} ${L.level} · ${fmt(profile.eddies)} €$ · ${fmt(profile.xp)} XP`;

    const pill = $('#authCardSync');
    pill.textContent = isOnline ? S().authCloudOnline : S().authLocalOnly;
    pill.classList.toggle('local', !isOnline);

    $('#authDashboardBtn').hidden = !auth.canAccessDashboard;

    updateExpiryDisplay(auth);
    if (auth.expiresAt) {
      expiryTimer = setInterval(() => updateExpiryDisplay(getAuth()), 1000);
    }

    activeView.hidden = false;
    signInView.hidden = true;
  } else {
    activeView.hidden = true;
    signInView.hidden = false;
    selectAuthMode(authMode, false, false);
    setSelectedAvatar(auth ? auth.avatar : selectedAvatar);
    if (resetFields) {
      $('#authPin').value = '';
      $('#authSsoPass').value = '';
      if (!auth) {
        $('#authHandle').value = '';
        $('#authSsoUser').value = '';
      }
    }
  }
}

function openAuthModal() {
  if (!$('#drawer').hidden) closeDrawer(false);
  if (!$('#authModal').hidden) return;
  authLastFocus = document.activeElement;
  renderAuthModal(false);
  $('#authModal').hidden = false;
  $('#authScrim').hidden = false;
  document.body.style.overflow = 'hidden';
  audio.sfx.swoosh();
  if (!$('#authSignInView').hidden) {
    (authMode === 'sso' ? $('#authSsoUser') : $('#authHandle')).focus();
  } else {
    $('#authClose').focus();
  }
}

function closeAuthModal(restoreFocus = true) {
  if ($('#authModal').hidden) return;
  clearExpiryTimer();
  $('#authModal').hidden = true;
  $('#authScrim').hidden = true;
  document.body.style.overflow = '';
  audio.sfx.click();
  if (restoreFocus && authLastFocus && authLastFocus.focus) authLastFocus.focus();
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const errEl = $('#authError');
  const submitBtn = $('#authSubmitBtn');
  errEl.hidden = true;
  const handle = $('#authHandle').value.trim();
  const pin = $('#authPin').value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = S().authWorking;
  try {
    const res = await signInOrRegister({ handle, pin, avatar: selectedAvatar });
    if (!res.ok) {
      errEl.textContent = res.error || 'Authentication failed';
      errEl.hidden = false;
      audio.sfx.error();
      return;
    }
    profile = getProfile();
    closeAuthModal();
    renderAll();
    if (!$('#drawer').hidden) renderDrawer();
    audio.sfx.jackIn();
    const who = res.user.displayName || res.user.handle;
    toast(res.created ? S().authCreatedToast(who) : S().authWelcomeToast(who));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = S().authSubmit;
  }
}

async function onAuthSsoSubmit(e) {
  e.preventDefault();
  const errEl = $('#authError');
  const submitBtn = $('#authSsoSubmitBtn');
  errEl.hidden = true;
  const username = $('#authSsoUser').value.trim();
  const password = $('#authSsoPass').value;

  if (!username || !password) {
    errEl.textContent = S().authSsoRequired;
    errEl.hidden = false;
    audio.sfx.error();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = S().authWorking;
  try {
    const res = await signInHomelab({ username, password });
    if (!res.ok) {
      errEl.textContent = res.error || 'Authentication failed';
      errEl.hidden = false;
      audio.sfx.error();
      return;
    }
    profile = getProfile();
    closeAuthModal();
    renderAll();
    if (!$('#drawer').hidden) renderDrawer();
    audio.sfx.jackIn();
    toast(S().authWelcomeToast(res.user.displayName || res.user.handle));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = S().authSsoSubmit;
  }
}

async function onSignOut() {
  const btn = $('#authSignOutBtn');
  if (btn) btn.disabled = true;
  clearExpiryTimer();
  try {
    await signOutAndFlush();
    profile = getProfile();
    closeAuthModal();
    renderAll();
    if (!$('#drawer').hidden) renderDrawer();
    toast(S().authSignedOutToast);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- Actions ----------
let launching = false;
function launch(gameId) {
  const g = getGame(gameId);
  if (!g || launching) return;
  launching = true;
  markLaunched(g.id);
  audio.sfx.jackIn();
  const ov = $('#jackOverlay');
  $('#jackText').textContent = `${S().launching} // ${field(g, 'title').toUpperCase()}`;
  ov.style.setProperty('--accent', g.accent);
  ov.classList.add('on');
  const card = $(`.card[data-id="${g.id}"]`); if (card) card.classList.add('is-locked-in');
  const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 520;
  setTimeout(() => { location.href = gameHref(g); }, delay);
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

function toggleMute() {
  const m = !audio.isMuted();
  audio.setMuted(m); setMuted(m);
  if (!m) audio.sfx.toggle(true);
  applyChrome();
}
function toggleAmbient() {
  if (audio.isMuted() && !audio.isAmbient()) toggleMute();
  audio.setAmbient(!audio.isAmbient());
  audio.sfx.toggle(audio.isAmbient());
  applyChrome();
}
function changeTheme(th) { theme = setTheme(th); audio.sfx.toggle(true); applyChrome(); }
function changeLang() {
  lang = setLang(lang === 'he' ? 'en' : 'he');
  const u = new URL(location.href); u.searchParams.set('lang', lang); history.replaceState(null, '', u);
  audio.sfx.click();
  renderAll();
  if (!$('#drawer').hidden) renderDrawer();
  if (!$('#authModal').hidden) renderAuthModal($('#authActiveView').hidden, { resetFields: false });
}

function renderAll() { applyChrome(); renderStats(); renderGrid(); }

// ---------- Events ----------
function bind() {
  document.addEventListener('pointerdown', () => audio.sfx.unlock(), { once: true });
  document.addEventListener('keydown', () => audio.sfx.unlock(), { once: true });

  $('#muteBtn').addEventListener('click', toggleMute);
  $('#ambientBtn').addEventListener('click', toggleAmbient);
  $('#langBtn').addEventListener('click', changeLang);
  $('#trophyBtn').addEventListener('click', () => openDrawer('T'));
  $('#lbBtn').addEventListener('click', () => openDrawer('L'));
  $('#authBtn').addEventListener('click', openAuthModal);

  $('#drawerClose').addEventListener('click', () => closeDrawer(true));
  $('#scrim').addEventListener('click', () => closeDrawer(true));
  $('#tabT').addEventListener('click', () => selectTab('T'));
  $('#tabH').addEventListener('click', () => selectTab('H'));
  $('#tabL').addEventListener('click', () => selectTab('L'));
  $('#resetBtn').addEventListener('click', onReset);

  $('#lbFilters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb-game]'); if (!b) return;
    lbGame = b.dataset.lbGame;
    audio.sfx.click();
    renderLeaderboardFilters();
    loadLeaderboard();
  });
  $('#lbRefreshBtn').addEventListener('click', () => { audio.sfx.click(); loadLeaderboard(); });

  $('#authClose').addEventListener('click', () => closeAuthModal(true));
  $('#authScrim').addEventListener('click', () => closeAuthModal(true));
  $('#authModeTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-auth-mode]'); if (!b) return;
    selectAuthMode(b.dataset.authMode, true, true);
  });
  $('#authModeTabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = authMode === 'pin' ? 'sso' : 'pin';
    selectAuthMode(next, true, false);
    $(`[data-auth-mode="${next}"]`).focus();
  });
  $('#authForm').addEventListener('submit', onAuthSubmit);
  $('#authSsoForm').addEventListener('submit', onAuthSsoSubmit);
  $('#authSwitchBtn').addEventListener('click', () => {
    audio.sfx.click();
    renderAuthModal(true);
    (authMode === 'sso' ? $('#authSsoUser') : $('#authHandle')).focus();
  });
  $('#authSignOutBtn').addEventListener('click', onSignOut);
  $('#avatarGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-avatar]'); if (!b) return;
    audio.sfx.click();
    setSelectedAvatar(b.dataset.avatar);
  });

  $$('[data-theme-btn]').forEach((b) => b.addEventListener('click', () => changeTheme(b.dataset.themeBtn)));
  $('#themes').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const fn = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? prevTheme : nextTheme;
    changeTheme(fn(theme)); $(`[data-theme-btn="${theme}"]`).focus();
  });
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    filter = b.dataset.filter; audio.sfx.click(); applyFilter();
  });
  $('#randomBtn').addEventListener('click', () => {
    const pool = visibleCards().map((c) => c.dataset.id);
    const ids = pool.length ? pool : GAMES_META.map((g) => g.id);
    launch(ids[Math.floor(Math.random() * ids.length)]);
  });
  $('#continueBtn').addEventListener('click', (e) => {
    e.preventDefault();
    const id = e.currentTarget.dataset.game;
    if (id) launch(id); else audio.sfx.error();
  });
  const grid = $('#grid');
  grid.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-game]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); launch(a.dataset.game);
  });
  let hoverId = null;
  grid.addEventListener('pointerover', (e) => {
    const c = e.target.closest('.card'); const id = c && c.dataset.id;
    if (id && id !== hoverId) { hoverId = id; audio.sfx.hover(); }
  });
  grid.addEventListener('pointerleave', () => { hoverId = null; });
  $$('.hud-btn, .filters button, .cyber-btn').forEach((b) => b.addEventListener('pointerenter', () => audio.sfx.hover()));

  document.addEventListener('keydown', (e) => {
    const modalOpen = !$('#authModal').hidden;
    if (modalOpen) {
      if (e.key === 'Escape') { e.preventDefault(); closeAuthModal(true); }
      else if (e.key === 'Tab') trapFocus(e, '#authModal');
      return;
    }
    const drawerOpen = !$('#drawer').hidden;
    if (drawerOpen) {
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(true); }
      else if (e.key === 'Tab') trapFocus(e, '#drawer');
      else if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) closeDrawer(true);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const vis = visibleCards();
    const rtl = lang === 'he';
    const k = e.key;
    if (/^[1-7]$/.test(k)) {
      const target = GAMES_META[Number(k) - 1];
      if (target) { e.preventDefault(); launch(target.id); }
      return;
    }
    switch (k.toLowerCase()) {
      case 't': changeTheme(nextTheme(theme)); toast(S().themes[theme]); return;
      case 'm': toggleMute(); return;
      case 'a': openDrawer('T'); return;
      case 'l': openDrawer('L'); return;
      default: break;
    }
    if (!vis.length) return;
    const cols = Math.max(1, Math.round(grid.clientWidth / vis[0].getBoundingClientRect().width));
    let n = null;
    if (k === 'ArrowRight') n = sel < 0 ? 0 : sel + (rtl ? -1 : 1);
    else if (k === 'ArrowLeft') n = sel < 0 ? 0 : sel + (rtl ? 1 : -1);
    else if (k === 'ArrowDown' && sel >= 0) n = sel + cols;
    else if (k === 'ArrowUp' && sel >= 0) n = sel - cols;
    else if (k === 'ArrowDown') n = 0;
    if (n !== null) { e.preventDefault(); setSel(Math.max(0, Math.min(vis.length - 1, n))); return; }
    if (k === 'Enter' && sel >= 0 && document.activeElement && document.activeElement.closest('.card')) {
      e.preventDefault(); launch(vis[sel].dataset.id);
    }
  });

  // Live-sync when a game or another tab records a run, pauses mid-run, or changes account.
  addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === AUTH_KEY || (e.key && e.key.startsWith(MIDRUN_PREFIX))) {
      profile = getProfile();
      theme = getTheme();
      renderStats();
      applyChrome();
      if (e.key && e.key.startsWith(MIDRUN_PREFIX)) renderGrid();
    }
  });
  // Back/forward cache: refresh profile, resume badges, and clear launch overlay.
  addEventListener('pageshow', (e) => {
    launching = false; $('#jackOverlay').classList.remove('on');
    $$('.is-locked-in').forEach((c) => c.classList.remove('is-locked-in'));
    profile = getProfile();
    renderStats();
    renderAuthButton();
    if (e.persisted) {
      renderGrid();
      syncSsoSession();
    }
  });
}

function syncSsoSession() {
  pullSession().then((r) => {
    if (r && (r.ok || r.signedOut)) {
      profile = getProfile();
      renderAll();
      if (!$('#drawer').hidden) renderDrawer();
      if (!$('#authModal').hidden) renderAuthModal(false, { resetFields: false });
    }
  }).catch(() => {});
}

function trapFocus(e, containerSelector) {
  const selQ = `${containerSelector} button, ${containerSelector} [href], ${containerSelector} input, ${containerSelector} [tabindex]:not([tabindex="-1"])`;
  const f = $$(selQ).filter((el) => !el.disabled && !el.closest('[hidden]'));
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function tickClock() {
  const d = new Date();
  $('#clock').textContent = `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
}

// ---------- Boot ----------
bg = startBackground($('#bg'));
renderAll();
bind();
tickClock(); setInterval(tickClock, 1000);

// Best-effort SSO / cloud session pull (auto-detects homelab_session cookie and 401 sign-outs).
syncSsoSession();
