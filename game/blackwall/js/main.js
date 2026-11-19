// BLACKWALL DEFENSE // Orbital Cyber-Command — Main Controller.
import {
  W,
  H,
  MAX_WAVES,
  EMP_CD,
  SANDY_CD,
  SANDY_DUR,
  COMBO_WINDOW,
  UPGRADES,
  createGame,
  step,
  fire,
  useEMP,
  useSandevistan,
  buy,
  startNextWave,
  continueEndless,
  drainEvents,
  upgradeCost,
  reloadTime,
  aliveDistricts,
  runBadges,
} from './engine.js';
import { createRenderer } from './renderer.js';
import { unlock as unlockAudio, setMuted as setAudioMuted, isMuted as isAudioMuted, sfx } from './audio.js';
import { t, getStrings, dirOf } from './i18n.js';
import {
  initGameChrome,
  recordRun,
  defaultRunXp,
  getProfile,
  markLaunched,
  setLang as setHubLang,
  setMuted as setHubMuted,
  saveMidRun,
  loadMidRun,
  clearMidRun,
  installAutoPause,
} from '../../shared/hub-sdk.js';

const GAME_ID = 'blackwall';

const UPGRADE_LIST = [
  { key: 'blast', icon: '✹' },
  { key: 'autoloader', icon: '⚡' },
  { key: 'velocity', icon: '➤' },
  { key: 'ciws', icon: '⌖' },
  { key: 'shield', icon: '⛨' },
  { key: 'rebuild', icon: '▲' },
];

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);

const cv = $('cv');
const canvasFrame = $('canvasFrame');

// HUD
const hubLink = $('hubLink');
const hudDistricts = $('hudDistricts');
const hudDistrictPips = $('hudDistrictPips');
const statDistricts = $('statDistricts');
const hudWave = $('hudWave');
const hudCombo = $('hudCombo');
const hudComboBar = $('hudComboBar');
const statCombo = $('statCombo');
const hudEddies = $('hudEddies');
const hudScore = $('hudScore');
const btnMute = $('btnMute');
const muteIco = $('muteIco');
const muteTxt = $('muteTxt');
const btnPause = $('btnPause');
const pauseTxt = $('pauseTxt');
const btnLang = $('btnLang');

// Bottom command bar
const batCards = [0, 1, 2].map((i) => ({
  el: $(`bat${i}`),
  count: $(`batCount${i}`),
  pips: $(`batPips${i}`),
  reload: $(`batReload${i}`),
  lastMax: -1,
}));
const btnEmp = $('btnEmp');
const empFill = $('empFill');
const empState = $('empState');
const btnSandy = $('btnSandy');
const sandyFill = $('sandyFill');
const sandyState = $('sandyState');

// Overlays
const startOverlay = $('startOverlay');
const startBestWrap = $('startBestWrap');
const startBestVal = $('startBestVal');
const introKeys = $('introKeys');
const btnResumeSaved = $('btnResumeSaved');
const savedRunMeta = $('savedRunMeta');
const btnStart = $('btnStart');

const shopOverlay = $('shopOverlay');
const shopWaveCleared = $('shopWaveCleared');
const shopEddies = $('shopEddies');
const bonusDistrictsVal = $('bonusDistrictsVal');
const bonusAmmoVal = $('bonusAmmoVal');
const bonusEddiesVal = $('bonusEddiesVal');
const bonusScoreVal = $('bonusScoreVal');
const shopGrid = $('shopGrid');
const shopDistrictsStrip = $('shopDistrictsStrip');
const btnNextWave = $('btnNextWave');

const pauseOverlay = $('pauseOverlay');
const pauseWave = $('pauseWave');
const pauseDistricts = $('pauseDistricts');
const pauseScore = $('pauseScore');
const btnResume = $('btnResume');
const btnSaveExit = $('btnSaveExit');
const btnPauseRestart = $('btnPauseRestart');

const endOverlay = $('endOverlay');
const endModal = $('endModal');
const endKicker = $('endKicker');
const endHeading = $('endHeading');
const endBody = $('endBody');
const endLevelBanner = $('endLevelBanner');
const endScore = $('endScore');
const endNewBest = $('endNewBest');
const endWave = $('endWave');
const endEddies = $('endEddies');
const endXp = $('endXp');
const endKills = $('endKills');
const endChain = $('endChain');
const endBadges = $('endBadges');
const btnEndless = $('btnEndless');
const btnPlayAgain = $('btnPlayAgain');

// ---------- App State ----------
const renderer = createRenderer(cv);
let lang = 'en';
let muted = false;
let state = createGame({ seed: 2077 }); // ambient background state on start screen
let started = false;
let paused = false;
let runRecorded = false;
let recordedTotals = { score: 0, eddies: 0, xp: 0, won: false };
let lastRunResult = null;
let preferredBattery = null;
let pointer = { x: W / 2, y: 360 };
let pointerActive = false;
let batFlash = [0, 0, 0];
let savedRecord = null;
let lastFrameTime = performance.now();

// ---------- Safe SDK Helpers ----------
function sdkCall(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function serializeState(s) {
  const clone = {
    ...s,
    districts: s.districts.map((d) => ({ ...d })),
    batteries: s.batteries.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    interceptors: s.interceptors.map((it) => ({ ...it })),
    blasts: s.blasts.map((b) => ({ ...b, hits: Array.from(b.hits || []) })),
    queue: s.queue.map((q) => ({ ...q })),
    chains: JSON.parse(JSON.stringify(s.chains || {})),
    upgrades: { ...s.upgrades },
    abilities: {
      emp: { ...s.abilities.emp },
      sandy: { ...s.abilities.sandy },
    },
    stats: { ...s.stats },
    lastBonus: s.lastBonus ? { ...s.lastBonus } : null,
    recordedTotals: { ...recordedTotals },
    events: [],
  };
  return {
    label: `W${s.wave} · ${s.score.toLocaleString()}`,
    state: clone,
  };
}

function deserializeState(rec) {
  const raw = rec && typeof rec === 'object' && rec.state ? rec.state : rec;
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.districts) || raw.districts.length !== 4) return null;
  if (!Array.isArray(raw.batteries) || raw.batteries.length !== 3) return null;
  if (!raw.upgrades || !raw.abilities || !raw.stats) return null;
  if (raw.phase !== 'wave' && raw.phase !== 'shop') return null;
  const rt = raw.recordedTotals && typeof raw.recordedTotals === 'object' ? raw.recordedTotals : {};
  const restored = {
    ...raw,
    blasts: Array.isArray(raw.blasts)
      ? raw.blasts.map((b) => ({ ...b, hits: new Set(Array.isArray(b.hits) ? b.hits : []) }))
      : [],
    enemies: Array.isArray(raw.enemies) ? raw.enemies : [],
    interceptors: Array.isArray(raw.interceptors) ? raw.interceptors : [],
    queue: Array.isArray(raw.queue) ? raw.queue : [],
    chains: raw.chains && typeof raw.chains === 'object' ? raw.chains : {},
    recordedTotals: {
      score: Math.max(0, Math.floor(Number(rt.score) || 0)),
      eddies: Math.max(0, Math.floor(Number(rt.eddies) || 0)),
      xp: Math.max(0, Math.floor(Number(rt.xp) || 0)),
      won: !!rt.won,
    },
    events: [],
  };
  return restored;
}

function checkpointNow() {
  if (!started || !state) return;
  if (state.phase !== 'wave' && state.phase !== 'shop') return;
  sdkCall(() => saveMidRun(GAME_ID, serializeState(state)));
}

function refreshSavedBanner() {
  const loaded = sdkCall(() => loadMidRun(GAME_ID), null);
  const valid = deserializeState(loaded);
  savedRecord = valid ? loaded : null;
  if (valid) {
    btnResumeSaved.hidden = false;
    savedRunMeta.textContent = t(lang, 'savedMeta', {
      w: valid.wave,
      s: Math.floor(valid.score || 0).toLocaleString(),
      d: aliveDistricts(valid),
    });
  } else {
    btnResumeSaved.hidden = true;
  }
}

function refreshBestScore() {
  const profile = sdkCall(() => getProfile(), null);
  const best = profile && profile.scores ? profile.scores[GAME_ID] || 0 : 0;
  if (best > 0) {
    startBestWrap.hidden = false;
    startBestVal.textContent = best.toLocaleString();
  } else {
    startBestWrap.hidden = true;
  }
}

// ---------- i18n ----------
function applyLang(nextLang, persist = false) {
  lang = nextLang === 'he' ? 'he' : 'en';
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', dirOf(lang));
  canvasFrame.setAttribute('dir', 'ltr');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(lang, key);
    if (typeof val === 'string') el.textContent = val;
  });

  // Controls guide on start menu
  const keys = getStrings(lang).introKeys || [];
  introKeys.innerHTML = keys
    .map(
      ([k, d]) =>
        `<div class="key-row"><span class="key-badge">${escapeHtml(k)}</span><span class="key-desc">${escapeHtml(d)}</span></div>`,
    )
    .join('');

  syncMuteUI();
  syncPauseUI();
  refreshSavedBanner();
  if (!shopOverlay.hidden) renderShop();
  if (!endOverlay.hidden) renderEndModal(state.phase === 'victory', lastRunResult);

  if (persist) sdkCall(() => setHubLang(lang));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Audio / Mute ----------
function applyMute(m, persist = false) {
  muted = !!m;
  setAudioMuted(muted);
  syncMuteUI();
  if (persist) sdkCall(() => setHubMuted(muted));
}

function syncMuteUI() {
  btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
  muteIco.textContent = muted ? '🔇' : '🔊';
  muteTxt.textContent = t(lang, muted ? 'unmute' : 'mute');
}

function syncPauseUI() {
  btnPause.setAttribute('aria-pressed', paused ? 'true' : 'false');
  pauseTxt.textContent = t(lang, paused ? 'resume' : 'pause');
}

// ---------- Game Lifecycle ----------
function startNewRun() {
  unlockAudio();
  sdkCall(() => clearMidRun(GAME_ID));
  sdkCall(() => markLaunched(GAME_ID));
  state = createGame({ seed: (Date.now() ^ (Math.random() * 1e9)) | 0 });
  renderer.reset();
  started = true;
  paused = false;
  runRecorded = false;
  recordedTotals = { score: 0, eddies: 0, xp: 0, won: false };
  lastRunResult = null;
  preferredBattery = null;
  batFlash = [0, 0, 0];

  startOverlay.hidden = true;
  shopOverlay.hidden = true;
  pauseOverlay.hidden = true;
  endOverlay.hidden = true;

  processEvents();
  syncHUD();
  syncCommandBar();
  checkpointNow();
}

function resumeSavedRun() {
  unlockAudio();
  const loaded = sdkCall(() => loadMidRun(GAME_ID), null);
  const restored = deserializeState(loaded);
  if (!restored) {
    startNewRun();
    return;
  }
  sdkCall(() => markLaunched(GAME_ID));
  state = restored;
  renderer.reset();
  started = true;
  paused = false;
  runRecorded = false;
  recordedTotals = restored.recordedTotals
    ? { ...restored.recordedTotals }
    : { score: 0, eddies: 0, xp: 0, won: false };
  lastRunResult = null;
  preferredBattery = null;

  startOverlay.hidden = true;
  pauseOverlay.hidden = true;
  endOverlay.hidden = true;

  syncHUD();
  syncCommandBar();
  if (state.phase === 'shop') {
    openShop();
  } else {
    shopOverlay.hidden = true;
  }
}

function setPaused(next) {
  if (!started || !state || state.phase !== 'wave') return;
  paused = !!next;
  syncPauseUI();
  if (paused) {
    checkpointNow();
    pauseWave.textContent = state.endless ? `${state.wave} ∞` : `${state.wave}/${MAX_WAVES}`;
    pauseDistricts.textContent = `${aliveDistricts(state)}/4`;
    pauseScore.textContent = Math.floor(state.score).toLocaleString();
    pauseOverlay.hidden = false;
  } else {
    pauseOverlay.hidden = true;
    lastFrameTime = performance.now();
  }
}

// ---------- Shop (Ripperdoc Black Market) ----------
function openShop() {
  paused = false;
  pauseOverlay.hidden = true;
  endOverlay.hidden = true;
  shopOverlay.hidden = false;
  renderShop();
  checkpointNow();
}

function renderShop() {
  const b = state.lastBonus || {
    wave: state.wave,
    districts: aliveDistricts(state),
    ammo: 0,
    eddies: 0,
    score: 0,
  };
  shopWaveCleared.textContent = t(lang, 'waveCleared', { n: b.wave });
  shopEddies.textContent = `€$ ${Math.floor(state.eddies).toLocaleString()}`;
  bonusDistrictsVal.textContent = `${b.districts} × 30 €$`;
  bonusAmmoVal.textContent = `${b.ammo} × 2 €$`;
  bonusEddiesVal.textContent = `+€$ ${b.eddies.toLocaleString()}`;
  bonusScoreVal.textContent = `+${b.score.toLocaleString()}`;

  const destroyed = state.districts.filter((d) => !d.alive);
  const names = getStrings(lang).districtNames || {};

  // District status strip
  shopDistrictsStrip.innerHTML = state.districts
    .map((d) => {
      const nm = names[d.id] || d.id.toUpperCase();
      return `<span class="dist-chip ${d.alive ? '' : 'down'}">${escapeHtml(nm)}${d.alive && d.shield > 0 ? ' ⛨' + d.shield : ''}</span>`;
    })
    .join('');

  // Upgrade cards
  shopGrid.innerHTML = UPGRADE_LIST.map(({ key, icon }) => {
    const def = UPGRADES[key];
    const cost = upgradeCost(state, key);
    const isRebuild = key === 'rebuild';
    const curLvl = isRebuild ? state.rebuilds : state.upgrades[key];
    const isMax = !isRebuild && curLvl >= def.max;
    const noTarget = isRebuild && destroyed.length === 0;
    const canAfford = state.eddies >= cost;
    const disabled = isMax || noTarget || !canAfford;

    let lvlText = isMax ? t(lang, 'maxed') : t(lang, 'lvl', { l: curLvl, m: def.max });
    if (isRebuild) {
      lvlText = destroyed.length > 0 ? `${destroyed.length} ${t(lang, 'downTag')}` : t(lang, 'maxed');
    }

    let pipsHtml = '';
    if (!isRebuild) {
      const pips = [];
      for (let i = 0; i < def.max; i++) pips.push(`<i class="${i < curLvl ? 'on' : ''}"></i>`);
      pipsHtml = `<div class="up-pips">${pips.join('')}</div>`;
    }

    let desc = t(lang, `up_${key}_d`);
    if (isRebuild && destroyed.length > 0) {
      const nextDown = names[destroyed[0].id] || destroyed[0].id.toUpperCase();
      desc = t(lang, 'rebuildPick', { name: nextDown });
    }

    let btnClass = 'cyber-btn up-buy-btn';
    let btnInner = '';
    if (isMax) {
      btnClass += ' is-max';
      btnInner = `<span>${escapeHtml(t(lang, 'maxed'))}</span>`;
    } else if (noTarget) {
      btnClass += ' cant-afford';
      btnInner = `<span>${escapeHtml(t(lang, 'noneDestroyed'))}</span>`;
    } else {
      if (!canAfford) btnClass += ' cant-afford';
      btnInner = `<span>${escapeHtml(t(lang, 'buy'))}</span><span>€$ ${cost.toLocaleString()}</span>`;
    }

    return `
      <article class="up-card cyber-clip-sm ${isMax ? 'maxed' : ''} ${disabled && !isMax ? 'disabled' : ''}" data-key="${key}">
        <div>
          <div class="up-top">
            <div class="up-title-wrap">
              <span class="up-ico" aria-hidden="true">${icon}</span>
              <h3 class="up-name">${escapeHtml(t(lang, `up_${key}`))}</h3>
            </div>
            <span class="up-lvl">${escapeHtml(lvlText)}</span>
          </div>
          ${pipsHtml}
        </div>
        <p class="up-desc">${escapeHtml(desc)}</p>
        <button type="button" class="${btnClass}" data-buy="${key}" ${disabled ? 'disabled' : ''}>
          ${btnInner}
        </button>
      </article>
    `;
  }).join('');

  btnNextWave.textContent = `${t(lang, 'nextWaveBtn')} (${t(lang, 'wave')} ${state.wave + 1})`;
}

// ---------- End of Run ----------
function finishRun(isVictory) {
  paused = false;
  pauseOverlay.hidden = true;
  shopOverlay.hidden = true;

  if (!runRecorded) {
    runRecorded = true;
    const badges = runBadges(state);
    const totalScore = Math.floor(state.score);
    const totalEddies = Math.floor(state.stats.eddiesEarned);
    const totalXp = defaultRunXp({
      score: totalScore,
      won: isVictory || recordedTotals.won || state.endless,
    });
    const deltaEddies = Math.max(0, totalEddies - (recordedTotals.eddies || 0));
    const deltaXp = Math.max(1, totalXp - (recordedTotals.xp || 0));
    const wonFlag = !!isVictory && !recordedTotals.won;

    lastRunResult = sdkCall(
      () =>
        recordRun(GAME_ID, {
          score: totalScore,
          eddies: deltaEddies,
          xp: deltaXp,
          won: wonFlag,
          wave: state.wave,
          badges,
        }),
      null,
    );
    recordedTotals = {
      score: Math.max(recordedTotals.score || 0, totalScore),
      eddies: Math.max(recordedTotals.eddies || 0, totalEddies),
      xp: (recordedTotals.xp || 0) + (lastRunResult && typeof lastRunResult.xpGained === 'number' ? lastRunResult.xpGained : deltaXp),
      won: recordedTotals.won || !!isVictory,
    };
    sdkCall(() => clearMidRun(GAME_ID));
  }

  renderEndModal(isVictory, lastRunResult);
  endOverlay.hidden = false;
  refreshBestScore();
  refreshSavedBanner();
}

function renderEndModal(isVictory, res) {
  endModal.classList.toggle('victory', isVictory);
  endModal.classList.toggle('defeat', !isVictory);

  endKicker.textContent = isVictory
    ? state.endless
      ? t(lang, 'endlessTag')
      : t(lang, 'kickerWin')
    : t(lang, 'kickerLoss');
  endHeading.textContent = t(lang, isVictory ? 'winTitle' : 'overTitle');
  endBody.textContent = isVictory ? t(lang, 'winBody') : t(lang, 'overBody', { n: state.wave });

  endScore.textContent = Math.floor(state.score).toLocaleString();
  endNewBest.hidden = !(res && res.isNewBest);
  endWave.textContent = state.endless ? `${state.wave} (${t(lang, 'endlessTag')})` : `${state.wave}/${MAX_WAVES}`;
  endEddies.textContent = `€$ ${Math.floor(state.stats.eddiesEarned).toLocaleString()}`;
  const xpGained = recordedTotals.xp || (res && typeof res.xpGained === 'number' ? res.xpGained : Math.floor(10 + state.score / 50));
  endXp.textContent = `+${xpGained} XP`;
  endKills.textContent = String(state.stats.kills || 0);
  endChain.textContent = `${state.stats.maxChain || 0}×`;

  if (res && res.leveledUp) {
    endLevelBanner.hidden = false;
    endLevelBanner.textContent = `★ ${t(lang, 'levelUp', { l: res.newLevel })}`;
  } else {
    endLevelBanner.hidden = true;
  }

  const badges = runBadges(state);
  const badgeNames = getStrings(lang).badgeNames || {};
  if (badges.length) {
    endBadges.innerHTML = badges
      .map((b) => `<span class="badge-chip">◆ ${escapeHtml(badgeNames[b] || b)}</span>`)
      .join('');
  } else {
    endBadges.innerHTML = `<span class="badge-chip empty">${escapeHtml(t(lang, 'noBadges'))}</span>`;
  }

  // Endless mode button only shown on initial wave-15 victory
  btnEndless.hidden = !(isVictory && state.phase === 'victory' && !state.endless);
}

// ---------- Event Dispatcher (Engine -> Audio + Renderer + Modals) ----------
function processEvents() {
  const events = drainEvents(state);
  for (const ev of events) {
    renderer.handleEvent(ev, state, lang);
    switch (ev.type) {
      case 'launch':
        sfx.launch();
        if (ev.battery != null && ev.battery >= 0 && ev.battery < 3) batFlash[ev.battery] = 0.16;
        break;
      case 'blast':
        sfx.explosion(ev.kind === 'chain' ? 0.85 : 1);
        break;
      case 'chain':
        sfx.chain(ev.count);
        break;
      case 'emp':
        sfx.emp();
        break;
      case 'sandy':
        sfx.sandy();
        break;
      case 'sandyEnd':
        sfx.sandyEnd();
        break;
      case 'bomberEnter':
        sfx.klaxon();
        break;
      case 'bossEnter':
        sfx.bossAlarm();
        break;
      case 'shieldHit':
        sfx.deflect();
        break;
      case 'armorHit':
        sfx.armor();
        break;
      case 'bossHit':
        if (ev.part === 'shield') sfx.deflect();
        else sfx.armor();
        break;
      case 'bossShieldDown':
        sfx.explosion(1.3);
        break;
      case 'bossDefeated':
        sfx.explosion(1.6);
        break;
      case 'zap':
        sfx.zap();
        break;
      case 'districtLost':
        sfx.districtLost();
        break;
      case 'batteryLost':
        sfx.explosion(1.3);
        break;
      case 'impact':
        if (ev.kind === 'ground') sfx.explosion(0.75);
        break;
      case 'dry':
        sfx.deny();
        break;
      case 'purchase':
        sfx.buy();
        break;
      case 'waveClear':
        sfx.waveClear();
        if (state.phase === 'shop') openShop();
        break;
      case 'victory':
        sfx.victory();
        finishRun(true);
        break;
      case 'gameOver':
        sfx.gameOver();
        finishRun(false);
        break;
      default:
        break;
    }
  }
}

// ---------- HUD & Bottom Command Bar Sync ----------
function syncHUD() {
  const alive = aliveDistricts(state);
  hudDistricts.textContent = `${alive}/4`;
  statDistricts.classList.toggle('critical', alive <= 1 && started);

  const pipNodes = hudDistrictPips.children;
  for (let i = 0; i < 4; i++) {
    const d = state.districts[i];
    const el = pipNodes[i];
    if (!el || !d) continue;
    el.className = 'dpip ' + (!d.alive ? 'down' : d.shield > 0 ? 'shielded' : 'on');
  }

  hudWave.textContent = state.endless ? `${state.wave} ∞` : `${state.wave}/${MAX_WAVES}`;
  hudCombo.textContent = `×${state.mult.toFixed(1)}`;
  statCombo.classList.toggle('hot', state.mult >= 2);
  hudComboBar.style.width = `${Math.max(0, Math.min(100, (state.comboT / COMBO_WINDOW) * 100))}%`;

  hudEddies.textContent = `€$ ${Math.floor(state.eddies).toLocaleString()}`;
  hudScore.textContent = Math.floor(state.score).toLocaleString();

  // Frame glow indicators
  canvasFrame.classList.toggle('sandy-active', state.abilities.sandy.active > 0);
  const hasBoss = state.enemies.some((e) => e.type === 'dreadnought' && !e.dead);
  canvasFrame.classList.toggle('boss-active', hasBoss);
}

function syncCommandBar() {
  const rt = reloadTime(state);
  for (let i = 0; i < 3; i++) {
    const b = state.batteries[i];
    const ui = batCards[i];
    if (!b || !ui) continue;

    if (ui.lastMax !== b.maxAmmo) {
      ui.lastMax = b.maxAmmo;
      ui.pips.innerHTML = Array.from({ length: b.maxAmmo }, () => '<i></i>').join('');
    }
    const pips = ui.pips.children;
    for (let k = 0; k < pips.length; k++) {
      pips[k].className = b.alive && k < b.ammo ? 'on' : '';
    }

    ui.count.textContent = b.alive ? `${b.ammo}/${b.maxAmmo}` : t(lang, 'batOffline');
    const reloadPct = b.alive && b.ammo < b.maxAmmo ? Math.min(100, (b.reload / rt) * 100) : b.alive ? 100 : 0;
    ui.reload.style.width = `${reloadPct}%`;

    ui.el.classList.toggle('offline', !b.alive);
    ui.el.classList.toggle('empty', b.alive && b.ammo === 0);
    ui.el.classList.toggle('low', b.alive && b.ammo > 0 && b.ammo <= Math.ceil(b.maxAmmo * 0.3));
    ui.el.classList.toggle('preferred', preferredBattery === i);
    ui.el.classList.toggle('firing', batFlash[i] > 0);
  }

  // EMP button
  const empCd = state.abilities.emp.cd;
  const empReady = started && state.phase === 'wave' && empCd <= 0;
  const empFrac = empCd <= 0 ? 1 : Math.max(0, 1 - empCd / EMP_CD);
  empFill.style.transform = `scaleX(${empFrac})`;
  btnEmp.classList.toggle('ready', empReady);
  btnEmp.classList.toggle('cooling', !empReady);
  btnEmp.disabled = !empReady;
  empState.textContent = empCd <= 0 ? t(lang, 'ready') : `${Math.ceil(empCd)}s`;

  // Sandevistan button
  const sCd = state.abilities.sandy.cd;
  const sAct = state.abilities.sandy.active;
  const sReady = started && state.phase === 'wave' && sCd <= 0;
  let sFrac = 1;
  if (sAct > 0) sFrac = Math.max(0, sAct / SANDY_DUR);
  else if (sCd > 0) sFrac = Math.max(0, 1 - sCd / SANDY_CD);
  sandyFill.style.transform = `scaleX(${sFrac})`;
  btnSandy.classList.toggle('ready', sReady);
  btnSandy.classList.toggle('cooling', !sReady && sAct <= 0);
  btnSandy.classList.toggle('active-glow', sAct > 0);
  btnSandy.disabled = !sReady;
  sandyState.textContent =
    sAct > 0 ? `${t(lang, 'sandyActive')} ${sAct.toFixed(1)}s` : sCd <= 0 ? t(lang, 'ready') : `${Math.ceil(sCd)}s`;
}

// ---------- Input Handlers ----------
function canvasPoint(ev) {
  const rect = cv.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * W,
    y: ((ev.clientY - rect.top) / rect.height) * H,
  };
}

cv.addEventListener('pointermove', (ev) => {
  pointer = canvasPoint(ev);
  pointerActive = true;
});

cv.addEventListener('pointerleave', () => {
  pointerActive = false;
});

cv.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 && ev.pointerType === 'mouse') return;
  ev.preventDefault();
  unlockAudio();
  pointer = canvasPoint(ev);
  pointerActive = true;
  if (!started || paused || state.phase !== 'wave') return;
  fire(state, pointer.x, pointer.y, preferredBattery);
  processEvents();
  syncCommandBar();
});

// Battery card click -> toggle preferred battery
batCards.forEach((ui, idx) => {
  ui.el.addEventListener('click', () => {
    unlockAudio();
    preferredBattery = preferredBattery === idx ? null : idx;
    syncCommandBar();
  });
});

// Ability clicks
btnEmp.addEventListener('click', () => {
  unlockAudio();
  if (!started || paused || state.phase !== 'wave') return;
  if (useEMP(state)) {
    processEvents();
    syncHUD();
    syncCommandBar();
  }
});

btnSandy.addEventListener('click', () => {
  unlockAudio();
  if (!started || paused || state.phase !== 'wave') return;
  if (useSandevistan(state)) {
    processEvents();
    syncHUD();
    syncCommandBar();
  }
});

// Top HUD buttons
if (hubLink) {
  hubLink.addEventListener('click', () => {
    checkpointNow();
  });
}

btnMute.addEventListener('click', () => {
  unlockAudio();
  applyMute(!muted, true);
});

btnPause.addEventListener('click', () => {
  if (!started || state.phase !== 'wave') return;
  setPaused(!paused);
});

btnLang.addEventListener('click', () => {
  applyLang(lang === 'en' ? 'he' : 'en', true);
});

// Start Menu buttons
btnStart.addEventListener('click', startNewRun);
btnResumeSaved.addEventListener('click', resumeSavedRun);

// Shop buttons (event delegation for upgrade cards)
shopGrid.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-buy]');
  if (!btn || btn.disabled) return;
  unlockAudio();
  const key = btn.getAttribute('data-buy');
  const res = buy(state, key);
  processEvents();
  if (!res.ok) sfx.deny();
  else checkpointNow();
  renderShop();
  syncHUD();
  syncCommandBar();
});

btnNextWave.addEventListener('click', () => {
  unlockAudio();
  if (startNextWave(state)) {
    shopOverlay.hidden = true;
    processEvents();
    syncHUD();
    syncCommandBar();
    checkpointNow();
  }
});

// Pause overlay buttons
btnResume.addEventListener('click', () => setPaused(false));
btnSaveExit.addEventListener('click', () => {
  checkpointNow();
  window.location.href = '../';
});
btnPauseRestart.addEventListener('click', startNewRun);

// End overlay buttons
btnPlayAgain.addEventListener('click', startNewRun);
btnEndless.addEventListener('click', () => {
  unlockAudio();
  if (continueEndless(state)) {
    runRecorded = false;
    endOverlay.hidden = true;
    openShop();
    syncHUD();
    syncCommandBar();
  }
});

// Keyboard shortcuts
window.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  const code = ev.code;
  if (code === 'KeyM') {
    unlockAudio();
    applyMute(!muted, true);
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    if (started && state.phase === 'wave') {
      ev.preventDefault();
      setPaused(!paused);
    }
    return;
  }

  if (!started || paused || state.phase !== 'wave') return;

  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
    unlockAudio();
    const idx = Number(code.slice(5)) - 1;
    if (pointerActive) {
      fire(state, pointer.x, pointer.y, idx);
      processEvents();
    } else {
      preferredBattery = preferredBattery === idx ? null : idx;
    }
    syncCommandBar();
  } else if (code === 'Digit0' || code === 'Backquote') {
    preferredBattery = null;
    syncCommandBar();
  } else if (code === 'KeyQ') {
    unlockAudio();
    if (useEMP(state)) {
      processEvents();
      syncHUD();
      syncCommandBar();
    }
  } else if (code === 'KeyW') {
    unlockAudio();
    if (useSandevistan(state)) {
      processEvents();
      syncHUD();
      syncCommandBar();
    }
  }
});

// ---------- Main Loop ----------
function frame(now) {
  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const dt = Math.max(0, Math.min(0.05, rawDt));

  for (let i = 0; i < 3; i++) {
    if (batFlash[i] > 0) batFlash[i] = Math.max(0, batFlash[i] - dt);
  }

  if (started && !paused && state.phase === 'wave') {
    step(state, dt);
    processEvents();
    syncHUD();
    syncCommandBar();
  }

  // Keep rain/skyline ambiance alive even on menus/shop, frozen when explicitly paused
  if (!paused) {
    renderer.update(dt, state);
  }
  renderer.render(state, {
    pointer,
    pointerActive,
    preferredBattery,
    lang,
    paused,
    started,
  });

  requestAnimationFrame(frame);
}

// ---------- Boot ----------
function boot() {
  const chrome = sdkCall(
    () =>
      initGameChrome({
        gameId: GAME_ID,
        onLangChange: (next) => applyLang(next, false),
        onMuteChange: (next) => applyMute(next, false),
      }),
    { lang: 'en', muted: false },
  );

  applyMute(chrome && chrome.muted, false);
  applyLang((chrome && chrome.lang) || 'en', false);
  refreshBestScore();
  refreshSavedBanner();
  syncHUD();
  syncCommandBar();

  // Auto-pause on tab-out + mid-run auto-save
  sdkCall(() =>
    installAutoPause({
      gameId: GAME_ID,
      isRunning: () => started && state && (state.phase === 'wave' || state.phase === 'shop'),
      isPaused: () => paused || (state && state.phase === 'shop'),
      setPaused: (v) => {
        if (started && state && state.phase === 'wave') setPaused(v);
      },
      getSnapshot: () =>
        started && state && (state.phase === 'wave' || state.phase === 'shop') ? serializeState(state) : null,
      getLang: () => lang,
    }),
  );

  requestAnimationFrame(frame);
}

boot();
