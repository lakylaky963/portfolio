// LIGHTCYCLE // Netrunner Trace — Browser runtime, HUD, input, auto-pause & mid-run save.

import {
  initGameChrome,
  recordRun,
  setLang as setHubLang,
  setMuted as setHubMuted,
  saveMidRun,
  loadMidRun,
  clearMidRun,
  installAutoPause,
} from '../../shared/hub-sdk.js';

import {
  MAX_ROUNDS,
  TUNING,
  createGame,
  queueTurn,
  setBoost,
  activateCloak,
  step,
  drainEvents,
  nextRound,
  retryRound,
  computeRewards,
  serializeState,
  deserializeState,
} from './engine.js';

import { LightcycleRenderer } from './renderer.js';
import { LightcycleAudio } from './audio.js';
import { t } from './i18n.js';

const GAME_ID = 'lightcycle';
const $ = (id) => document.getElementById(id);

const cv = $('cv');
const renderer = new LightcycleRenderer(cv);
const audio = new LightcycleAudio();

let lang = 'en';
let selectedArena = 'watson';
let game = null;
let preview = createGame({ arena: selectedArena, seed: 2077 });
let running = false;
let paused = false;
let recorded = false;
let lastTs = 0;
let accMs = 0;
let bannerTimer = 0;
let pendingOverlayTimer = 0;
let lastCrashCause = 'wall';
let savedRecord = null;

// ---------- Hub SDK init (safely wrapped) ----------
try {
  const chrome = initGameChrome({
    gameId: GAME_ID,
    onLangChange: (newLang) => {
      lang = newLang === 'he' ? 'he' : 'en';
      applyLang();
    },
    onMuteChange: (muted) => {
      audio.setMuted(muted);
      syncMuteBtn();
    },
  });
  if (chrome) {
    if (chrome.lang === 'he' || chrome.lang === 'en') lang = chrome.lang;
    audio.setMuted(!!chrome.muted);
  }
} catch (e) {
  console.warn('hub-sdk initGameChrome failed:', e);
}

// ---------- Helpers ----------
function arenaName(id) {
  return t(lang, `arena_${id}`);
}

function makeSnapshot() {
  if (!game || game.phase === 'gameover') return null;
  if (game.phase === 'victory' && !game.endless) return null;
  return {
    label: t(lang, 'saveInfo', game.round, game.score, arenaName(game.arenaId)),
    state: serializeState(game),
  };
}

function persistCheckpoint() {
  const snap = makeSnapshot();
  if (!snap) return;
  try {
    saveMidRun(GAME_ID, snap);
  } catch (e) {
    console.warn('saveMidRun failed:', e);
  }
}

function removeCheckpoint() {
  try {
    clearMidRun(GAME_ID);
  } catch (e) {
    console.warn('clearMidRun failed:', e);
  }
  savedRecord = null;
}

function refreshSavedCard() {
  savedRecord = null;
  try {
    const rec = loadMidRun(GAME_ID);
    if (rec && rec.state && Array.isArray(rec.state.cycles) && rec.state.cycles.length > 0) {
      savedRecord = rec;
    }
  } catch (e) {
    console.warn('loadMidRun failed:', e);
  }

  const box = $('resumeBox');
  if (savedRecord) {
    const st = savedRecord.state;
    $('resumeMeta').textContent = t(lang, 'saveInfo', st.round || 1, st.score || 0, arenaName(st.arenaId || 'watson'));
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

function showBanner(text, ms = 1600) {
  const b = $('banner');
  b.textContent = text;
  b.hidden = false;
  bannerTimer = ms;
}

function hideBanner() {
  $('banner').hidden = true;
  bannerTimer = 0;
}

function syncMuteBtn() {
  $('bMute').textContent = t(lang, audio.muted ? 'unmute' : 'mute');
  $('bMute').classList.toggle('on', audio.muted);
}

function syncPauseBtn() {
  $('bPause').textContent = t(lang, paused ? 'resume' : 'pause');
  $('bPause').classList.toggle('on', paused);
}

function applyLang() {
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  $('overlay').dir = dir;

  document.querySelectorAll('[data-i]').forEach((el) => {
    const key = el.dataset.i;
    if (key) el.textContent = t(lang, key);
  });

  $('bLang').textContent = t(lang, 'langBtn');
  syncMuteBtn();
  syncPauseBtn();
  renderer.setLabels({
    derez: t(lang, 'popDerez'),
    combo: t(lang, 'popCombo'),
    emp: t(lang, 'popEmp'),
    cloak: t(lang, 'popCloak'),
  });

  // Refresh dynamic overlay texts if visible
  if (!$('menuBody').hidden) {
    $('ovTitle').textContent = t(lang, 'title');
    $('ovSub').textContent = t(lang, 'subtitle');
    refreshSavedCard();
  } else if (!$('pauseBody').hidden) {
    $('ovTitle').textContent = t(lang, 'pausedTitle');
    $('ovSub').textContent = arenaName(game ? game.arenaId : selectedArena);
  }
  updateHud();
}

// ---------- Overlay Views ----------
function showOverlayView(which, titleText, subText) {
  $('menuBody').hidden = which !== 'menu';
  $('pauseBody').hidden = which !== 'pause';
  $('roundBody').hidden = which !== 'round';
  $('endBody').hidden = which !== 'end';
  $('ovTitle').textContent = titleText;
  $('ovSub').textContent = subText;
  $('overlay').hidden = false;
}

function hideOverlay() {
  $('overlay').hidden = true;
}

function showMenu() {
  clearTimeout(pendingOverlayTimer);
  running = false;
  paused = false;
  syncPauseBtn();
  hideBanner();
  refreshSavedCard();
  preview = createGame({ arena: selectedArena, seed: 2077 });
  showOverlayView('menu', t(lang, 'title'), t(lang, 'subtitle'));
}

function showPauseOverlay() {
  showOverlayView('pause', t(lang, 'pausedTitle'), arenaName(game ? game.arenaId : selectedArena));
}

function showRoundOverlay(kind) {
  running = false;
  const isClear = kind === 'roundClear';
  const title = t(lang, isClear ? 'roundClearTitle' : 'lifeLostTitle');
  const sub = t(lang, isClear ? 'roundClearSub' : 'lifeLostSub');
  const detail = $('roundDetail');
  if (isClear) {
    const bonus = TUNING.roundBonus * game.round;
    detail.innerHTML = `${t(lang, 'round')} <b>${game.round}</b> · +<b>${bonus.toLocaleString()}</b> · ${t(lang, 'score')}: <b>${game.score.toLocaleString()}</b>`;
    $('bContinueRound').textContent = t(lang, 'nextRoundBtn');
  } else {
    const causeTxt = t(lang, `cause_${lastCrashCause}`);
    detail.innerHTML = `<b>${causeTxt}</b> · ${t(lang, 'lives')}: <b>${'◆'.repeat(Math.max(0, game.lives))}</b>`;
    $('bContinueRound').textContent = t(lang, 'retryRoundBtn');
  }
  showOverlayView('round', title, sub);
}

function finishRun(isVictory) {
  running = false;
  paused = false;
  syncPauseBtn();
  const rewards = computeRewards(game);
  let res = null;
  if (!recorded) {
    recorded = true;
    try {
      res = recordRun(GAME_ID, {
        score: game.score,
        eddies: rewards.eddies,
        xp: rewards.xp,
        won: !!game.won,
        wave: game.round,
      });
    } catch (e) {
      console.warn('recordRun failed:', e);
    }
  }
  removeCheckpoint();

  $('rScore').textContent = game.score.toLocaleString();
  $('rRounds').textContent = String(game.roundsCleared);
  $('rKills').textContent = String(game.kills);
  $('rCombo').textContent = `${Math.max(1, game.bestCombo)}×`;
  $('rEddies').textContent = `+${rewards.eddies.toLocaleString()} €$`;
  $('rXp').textContent = `+${rewards.xp.toLocaleString()} ${t(lang, 'xp')}`;
  $('newBestBadge').hidden = !(res && res.isNewBest);
  $('bEndless').hidden = !isVictory;

  showOverlayView(
    'end',
    t(lang, isVictory ? 'victoryTitle' : 'gameOverTitle'),
    t(lang, isVictory ? 'victorySub' : 'gameOverSub')
  );
}

// ---------- Game Actions ----------
function startNewRun() {
  audio.unlock();
  clearTimeout(pendingOverlayTimer);
  removeCheckpoint();
  renderer.clearEffects();
  game = createGame({
    arena: selectedArena,
    seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0,
  });
  recorded = false;
  paused = false;
  running = true;
  accMs = 0;
  lastTs = performance.now();
  syncPauseBtn();
  hideOverlay();
  updateHud();
  showBanner(`${t(lang, 'popRound')} ${game.round} // ${arenaName(game.arenaId)}`, 1500);
}

function resumeSavedRun() {
  if (!savedRecord || !savedRecord.state) return;
  audio.unlock();
  clearTimeout(pendingOverlayTimer);
  const restored = deserializeState(savedRecord.state);
  if (!restored) {
    removeCheckpoint();
    refreshSavedCard();
    return;
  }
  renderer.clearEffects();
  game = restored;
  selectedArena = game.arenaId;
  syncArenaSelection();
  recorded = false;
  paused = false;
  accMs = 0;
  lastTs = performance.now();
  syncPauseBtn();
  hideOverlay();
  updateHud();

  if (game.phase === 'playing') {
    running = true;
    showBanner(`${t(lang, 'popRound')} ${game.round} // ${arenaName(game.arenaId)}`, 1400);
  } else if (game.phase === 'roundClear') {
    showRoundOverlay('roundClear');
  } else if (game.phase === 'dead') {
    showRoundOverlay('dead');
  } else {
    startNewRun();
  }
}

function continueAfterRound() {
  if (!game) return;
  audio.unlock();
  if (game.phase === 'roundClear') {
    nextRound(game);
  } else if (game.phase === 'dead') {
    retryRound(game);
  } else {
    return;
  }
  renderer.clearEffects();
  hideOverlay();
  running = true;
  paused = false;
  accMs = 0;
  lastTs = performance.now();
  syncPauseBtn();
  updateHud();
  persistCheckpoint();
  showBanner(`${t(lang, 'popRound')} ${game.round}${game.endless ? ' ∞' : ''}`, 1300);
}

function enterEndless() {
  if (!game || game.phase !== 'victory') return;
  audio.unlock();
  nextRound(game);
  recorded = false; // Allow recording endless run score on final gameover
  renderer.clearEffects();
  hideOverlay();
  running = true;
  paused = false;
  accMs = 0;
  lastTs = performance.now();
  syncPauseBtn();
  updateHud();
  persistCheckpoint();
  showBanner(`${t(lang, 'continueEndless')} // ${t(lang, 'popRound')} ${game.round}`, 1700);
}

function setPausedState(next) {
  if (!running || !game || game.phase !== 'playing') return;
  if (paused === !!next) return;
  paused = !!next;
  if (game.player) setBoost(game, false);
  syncPauseBtn();
  if (paused) {
    persistCheckpoint();
    showPauseOverlay();
  } else {
    hideOverlay();
    lastTs = performance.now();
  }
}

function togglePause() {
  if (!running) return;
  setPausedState(!paused);
}

// ---------- Auto-Pause & Periodic Auto-Save via Hub SDK ----------
try {
  installAutoPause({
    gameId: GAME_ID,
    isRunning: () => running && !!game && game.phase === 'playing',
    isPaused: () => paused,
    setPaused: (v) => setPausedState(v),
    getSnapshot: () => makeSnapshot(),
    getLang: () => lang,
    onAutoPaused: () => {
      if (game && game.player) setBoost(game, false);
    },
  });
} catch (e) {
  console.warn('installAutoPause failed:', e);
}

// ---------- HUD Sync ----------
function updateHud() {
  const s = game || preview;
  if (!s) return;
  const p = s.player;
  const aliveHunters = s.hunters.filter((h) => h.alive).length;
  const rewards = computeRewards(s);

  $('sRound').textContent = s.endless ? `${s.round}∞` : `${s.round}/${MAX_ROUNDS}`;
  $('sHunters').textContent = String(aliveHunters);
  $('sLives').textContent = '◆'.repeat(Math.max(0, s.lives)) || '—';

  const cloakPct = Math.round(p ? p.cloak : 0);
  $('sCloak').textContent = `${cloakPct}%`;
  $('cloakBar').style.width = `${cloakPct}%`;
  const cloakMeter = $('cloakBar').parentElement;
  cloakMeter.classList.toggle('ready', !!p && p.cloak >= TUNING.cloakCost);
  cloakMeter.classList.toggle('active', !!p && p.cloakTicks > 0);
  $('mCloak').classList.toggle('on', !!p && p.cloakTicks > 0);

  const boostPct = Math.round(p ? p.boost : 0);
  $('sBoost').textContent = `${boostPct}%`;
  $('boostBar').style.width = `${boostPct}%`;
  const boostActive = !!p && p.boosting && p.boost >= TUNING.boostMin;
  $('boostBar').parentElement.classList.toggle('active', boostActive);
  $('mBoost').classList.toggle('on', boostActive);

  $('sScore').textContent = s.score.toLocaleString();
  $('sEddies').textContent = `${rewards.eddies.toLocaleString()} €$`;
}

// ---------- Simulation & Render Loop ----------
function processEvents(events) {
  if (!events.length) return;
  renderer.addEvents(events);
  for (const e of events) {
    audio.handle(e);
    if (e.type === 'crash') lastCrashCause = e.cause || 'wall';
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = now;
  const dtMs = Math.min(80, Math.max(0, now - lastTs));
  const dt = dtMs / 1000;
  lastTs = now;

  if (bannerTimer > 0) {
    bannerTimer -= dtMs;
    if (bannerTimer <= 0) hideBanner();
  }

  if (running && !paused && game && game.phase === 'playing') {
    accMs += dtMs;
    const stepMs = game.tickMs || 110;
    let steps = 0;
    while (accMs >= stepMs && steps < 4 && game.phase === 'playing') {
      accMs -= stepMs;
      steps++;
      step(game);
      if (game.player && game.player.boosting && game.player.boost >= TUNING.boostMin && game.player.alive) {
        audio.nitro();
      }
      const evts = drainEvents(game);
      processEvents(evts);

      if (game.phase !== 'playing') {
        running = false;
        accMs = 0;
        const phase = game.phase;
        if (phase === 'roundClear' || phase === 'dead') {
          persistCheckpoint();
          pendingOverlayTimer = setTimeout(() => showRoundOverlay(phase), phase === 'roundClear' ? 700 : 820);
        } else if (phase === 'victory') {
          pendingOverlayTimer = setTimeout(() => finishRun(true), 950);
        } else if (phase === 'gameover') {
          pendingOverlayTimer = setTimeout(() => finishRun(false), 900);
        }
        break;
      }
    }
    updateHud();
  }

  const activeState = game || preview;
  const alpha = (running && !paused && game && game.phase === 'playing')
    ? Math.min(1, accMs / (game.tickMs || 110))
    : 1;
  renderer.draw(activeState, paused ? 0 : dt, alpha);
}

// ---------- Input Handling ----------
function handleSteer(dir) {
  if (!running || paused || !game || game.phase !== 'playing') return;
  audio.unlock();
  if (queueTurn(game, dir)) {
    audio.turn();
  }
}

function handleCloak() {
  if (!running || paused || !game || game.phase !== 'playing') return;
  audio.unlock();
  if (activateCloak(game)) {
    processEvents(drainEvents(game));
    updateHud();
  }
}

function handleBoost(on) {
  if (!game || !game.player) return;
  if (on && running && !paused) audio.unlock();
  setBoost(game, on && running && !paused);
}

const KEY_TO_DIR = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
};

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();

  if (k === 'p' || k === 'escape') {
    if (running) {
      e.preventDefault();
      togglePause();
    }
    return;
  }

  if (k === 'enter' && !$('overlay').hidden) {
    e.preventDefault();
    if (!$('menuBody').hidden) startNewRun();
    else if (!$('pauseBody').hidden) setPausedState(false);
    else if (!$('roundBody').hidden) continueAfterRound();
    else if (!$('endBody').hidden) startNewRun();
    return;
  }

  if (k === ' ') {
    e.preventDefault();
    if (!$('roundBody').hidden && !$('overlay').hidden) {
      continueAfterRound();
      return;
    }
    if (!e.repeat) handleCloak();
    return;
  }

  if (k === 'shift') {
    e.preventDefault();
    if (!e.repeat) handleBoost(true);
    return;
  }

  const dir = KEY_TO_DIR[k];
  if (dir) {
    e.preventDefault();
    if (!e.repeat) handleSteer(dir);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'shift') handleBoost(false);
});

// Touch Swipe Gestures directly on canvas
let swipeStart = null;
const SWIPE_MIN = 24;

cv.addEventListener('pointerdown', (e) => {
  audio.unlock();
  swipeStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
  try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});

cv.addEventListener('pointermove', (e) => {
  if (!swipeStart || swipeStart.id !== e.pointerId) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  if (Math.hypot(dx, dy) < SWIPE_MIN) return;
  const dir = Math.abs(dx) >= Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
  handleSteer(dir);
  // Reset origin so quick continuous swipes work without lifting
  swipeStart.x = e.clientX;
  swipeStart.y = e.clientY;
});

const endSwipe = (e) => {
  if (swipeStart && swipeStart.id === e.pointerId) swipeStart = null;
};
cv.addEventListener('pointerup', endSwipe);
cv.addEventListener('pointercancel', endSwipe);

// Compact Mobile D-Pad & Ability Buttons
document.querySelectorAll('.pad-btn').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleSteer(btn.dataset.dir);
  });
});

$('mCloak').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleCloak();
});

const mBoost = $('mBoost');
mBoost.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleBoost(true);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
  mBoost.addEventListener(evt, () => handleBoost(false));
});

// ---------- Arena Selector & UI Buttons ----------
function syncArenaSelection() {
  document.querySelectorAll('.arena-card').forEach((card) => {
    const active = card.dataset.arena === selectedArena;
    card.classList.toggle('selected', active);
    card.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

document.querySelectorAll('.arena-card').forEach((card) => {
  card.addEventListener('click', () => {
    audio.unlock();
    audio.turn();
    selectedArena = card.dataset.arena;
    syncArenaSelection();
    if (!game) {
      preview = createGame({ arena: selectedArena, seed: 2077 });
      updateHud();
    }
  });
});

$('bStart').addEventListener('click', startNewRun);
$('bResume').addEventListener('click', resumeSavedRun);
$('bPause').addEventListener('click', togglePause);
$('bResumePause').addEventListener('click', () => setPausedState(false));
$('bMenuPause').addEventListener('click', () => {
  persistCheckpoint();
  game = null;
  showMenu();
});
$('bContinueRound').addEventListener('click', continueAfterRound);
$('bRetry').addEventListener('click', startNewRun);
$('bEndless').addEventListener('click', enterEndless);
$('bBackMenu').addEventListener('click', () => {
  game = null;
  showMenu();
});

$('bMute').addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  try { setHubMuted(audio.muted); } catch (e) { console.warn('setHubMuted failed:', e); }
  syncMuteBtn();
});

$('bLang').addEventListener('click', () => {
  lang = lang === 'en' ? 'he' : 'en';
  try { setHubLang(lang); } catch (e) { console.warn('setHubLang failed:', e); }
  applyLang();
});

window.addEventListener('resize', () => renderer.resize());

// ---------- Boot ----------
syncArenaSelection();
applyLang();
renderer.resize();
showMenu();
updateHud();
requestAnimationFrame(frame);
