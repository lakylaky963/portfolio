// OVERCLOCK // ICE Shatter — UI controller, input loop, Hub SDK & mid-run persistence.
import {
  W, H, PADDLE_Y, CAMPAIGN_STAGES, SLOWMO_DURATION,
  createGame, step, setPaddleTarget, launch, fireLasers,
  activateSandevistan, continueEndless, drainEvents,
  comboMultiplier, runRewards,
} from './engine.js';
import { createAudio } from './audio.js';
import { createRenderer } from './renderer.js';
import { t } from './i18n.js';

const GAME_ID = 'overclock';
const FALLBACK_SAVE_KEY = 'cp77hub.midrun.overclock';

// Safe dynamic import of the shared Hub SDK (wrapped in try/catch so cabinet never breaks standalone).
let hub = null;
try {
  hub = await import('../../shared/hub-sdk.js');
} catch (e) {
  hub = null;
}

function safeCall(fn, ...args) {
  try { return typeof fn === 'function' ? fn(...args) : null; } catch (e) { return null; }
}

function saveMidRunSafe(snapshot) {
  if (hub && typeof hub.saveMidRun === 'function') {
    const res = safeCall(hub.saveMidRun, GAME_ID, snapshot);
    if (res) return res;
  }
  try {
    localStorage.setItem(FALLBACK_SAVE_KEY, JSON.stringify({ gameId: GAME_ID, savedAt: Date.now(), ...snapshot }));
  } catch (e) { /* ignore */ }
  return null;
}

function loadMidRunSafe() {
  if (hub && typeof hub.loadMidRun === 'function') {
    const res = safeCall(hub.loadMidRun, GAME_ID);
    if (res) return res;
  }
  try {
    const raw = localStorage.getItem(FALLBACK_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.state ? parsed : null;
  } catch (e) { return null; }
}

function clearMidRunSafe() {
  if (hub && typeof hub.clearMidRun === 'function') safeCall(hub.clearMidRun, GAME_ID);
  try { localStorage.removeItem(FALLBACK_SAVE_KEY); } catch (e) { /* ignore */ }
}

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const canvas = $('cv');
const overlay = $('overlay');
const ovTitle = $('ovTitle');
const ovSub = $('ovSub');
const autoPauseNote = $('autoPauseNote');
const startInfo = $('startInfo');
const resultBox = $('resultBox');
const activePills = $('activePills');

const sStage = $('sStage');
const sLives = $('sLives');
const sCombo = $('sCombo');
const sEddies = $('sEddies');
const sScore = $('sScore');

const bSande = $('bSande');
const sandeFill = $('sandeFill');
const bPause = $('bPause');
const bMute = $('bMute');
const bLang = $('bLang');

const bResumeSaved = $('bResumeSaved');
const savedMeta = $('savedMeta');
const bPrimary = $('bPrimary');
const bEndless = $('bEndless');
const bRestart = $('bRestart');
const bSaveExit = $('bSaveExit');

// ---------- State ----------
let lang = 'en';
let muted = false;
let mode = 'start'; // 'start' | 'playing' | 'paused' | 'victory' | 'over'
let autoPausedFlag = false;
let runRecorded = false;
let recordedTotals = { score: 0, eddies: 0, xp: 0, won: false };
let lastHubResult = null;
let state = createGame({ seed: Date.now() >>> 0 });

const keys = { left: false, right: false };

const audio = createAudio(false);
const renderer = createRenderer(canvas);

// ---------- Init Hub Chrome ----------
const chrome = hub && typeof hub.initGameChrome === 'function'
  ? safeCall(hub.initGameChrome, {
    gameId: GAME_ID,
    onLangChange: (nextLang) => { lang = nextLang; applyI18n(); },
    onMuteChange: (nextMuted) => { muted = !!nextMuted; audio.setMuted(muted); applyI18n(); },
  })
  : null;

if (chrome) {
  lang = chrome.lang || 'en';
  muted = !!chrome.muted;
  audio.setMuted(muted);
} else {
  const docLang = document.documentElement.getAttribute('lang');
  lang = docLang === 'he' ? 'he' : 'en';
}

// ---------- Serialization for Mid-Run Save / Restore ----------
function isValidSavedState(st) {
  return !!(
    st && typeof st === 'object'
    && (st.phase === 'play' || st.phase === 'clear')
    && Number.isFinite(st.level)
    && st.paddle && Number.isFinite(st.paddle.x)
    && Array.isArray(st.bricks)
    && Array.isArray(st.balls)
    && st.timers && typeof st.timers === 'object'
    && st.stats && typeof st.stats === 'object'
  );
}

function makeSnapshot() {
  const clone = JSON.parse(JSON.stringify(state));
  clone.events = [];
  return {
    label: `S${state.level} • ${state.score.toLocaleString()}`,
    state: clone,
    recordedTotals: { ...recordedTotals },
  };
}

function saveProgressNow() {
  if (mode !== 'playing' && mode !== 'paused') return;
  if (state.phase !== 'play' && state.phase !== 'clear') return;
  saveMidRunSafe(makeSnapshot());
}

// ---------- Localization ----------
function applyI18n() {
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
  document.querySelectorAll('[data-i]').forEach((el) => {
    const key = el.getAttribute('data-i');
    if (key) el.textContent = t(lang, key);
  });
  bLang.textContent = t(lang, 'langBtn');
  bMute.textContent = t(lang, muted ? 'unmute' : 'mute');
  bMute.classList.toggle('active', muted);
  bPause.textContent = t(lang, mode === 'paused' ? 'resume' : 'pause');
  bPause.classList.toggle('active', mode === 'paused');
  refreshOverlay();
  updateHud();
}

// ---------- Overlay management ----------
function formatNum(n) {
  return Math.floor(Number(n) || 0).toLocaleString();
}

function renderResultBox(rewards, hubRes) {
  const badges = [];
  if (hubRes && hubRes.isNewBest) {
    badges.push(`<span class="r-badge">${t(lang, 'newBest')}</span>`);
  }
  if (hubRes && hubRes.leveledUp) {
    badges.push(`<span class="r-badge xp">${t(lang, 'leveledUp', { lvl: hubRes.newLevel })}</span>`);
  }
  const earnedXp = hubRes && Number.isFinite(hubRes.xpGained)
    ? Math.max(rewards.xp, hubRes.xpGained)
    : rewards.xp;

  resultBox.innerHTML = `
    ${badges.length ? `<div class="result-badges">${badges.join('')}</div>` : ''}
    <div class="result-grid">
      <div class="r-cell"><span>${t(lang, 'statScore')}</span><b>${formatNum(rewards.score)}</b></div>
      <div class="r-cell cyan"><span>${t(lang, 'statStage')}</span><b>${state.stats.maxStage}</b></div>
      <div class="r-cell"><span>${t(lang, 'statCombo')}</span><b>${state.bestCombo}×</b></div>
      <div class="r-cell"><span>${t(lang, 'statBricks')}</span><b>${formatNum(state.stats.bricks)}</b></div>
      <div class="r-cell eddies"><span>${t(lang, 'rewardEddies')}</span><b>+€$ ${formatNum(rewards.eddies)}</b></div>
      <div class="r-cell xp"><span>${t(lang, 'rewardXp')}</span><b>+${formatNum(earnedXp)} XP</b></div>
    </div>
  `;
}

function refreshOverlay() {
  if (mode === 'playing') {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  autoPauseNote.hidden = true;
  startInfo.hidden = true;
  resultBox.hidden = true;
  bResumeSaved.hidden = true;
  bEndless.hidden = true;
  bRestart.hidden = true;
  bSaveExit.hidden = true;

  if (mode === 'start') {
    ovTitle.textContent = t(lang, 'title');
    ovSub.textContent = t(lang, 'subtitle');
    startInfo.hidden = false;
    bPrimary.textContent = t(lang, 'start');

    const saved = loadMidRunSafe();
    if (saved && isValidSavedState(saved.state)) {
      bResumeSaved.hidden = false;
      savedMeta.textContent = t(lang, 'savedMeta', {
        stage: saved.state.level,
        score: formatNum(saved.state.score),
      });
    }
  } else if (mode === 'paused') {
    ovTitle.textContent = t(lang, 'pausedTitle');
    ovSub.textContent = t(lang, 'pausedSub');
    autoPauseNote.hidden = !autoPausedFlag;
    startInfo.hidden = false;
    bPrimary.textContent = t(lang, 'resume');
    bRestart.hidden = false;
    bSaveExit.hidden = false;
    bSaveExit.setAttribute('data-i', 'saveExit');
    bSaveExit.textContent = t(lang, 'saveExit');
  } else if (mode === 'victory') {
    ovTitle.textContent = t(lang, 'victoryTitle');
    ovSub.textContent = t(lang, 'victorySub');
    resultBox.hidden = false;
    renderResultBox(runRewards(state), lastHubResult);
    bPrimary.textContent = t(lang, 'restart');
    bEndless.hidden = false;
    bSaveExit.hidden = false;
    bSaveExit.setAttribute('data-i', 'hub');
    bSaveExit.textContent = t(lang, 'hub');
  } else if (mode === 'over') {
    ovTitle.textContent = t(lang, 'gameOverTitle');
    ovSub.textContent = t(lang, 'gameOverSub');
    resultBox.hidden = false;
    renderResultBox(runRewards(state), lastHubResult);
    bPrimary.textContent = t(lang, 'restart');
    bSaveExit.hidden = false;
    bSaveExit.setAttribute('data-i', 'hub');
    bSaveExit.textContent = t(lang, 'hub');
  }
}

// ---------- Game lifecycle ----------
function startNewRun() {
  audio.unlock();
  clearMidRunSafe();
  state = createGame({ seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 });
  drainEvents(state);
  renderer.clearFx();
  runRecorded = false;
  recordedTotals = { score: 0, eddies: 0, xp: 0, won: false };
  lastHubResult = null;
  autoPausedFlag = false;
  mode = 'playing';
  bPause.textContent = t(lang, 'pause');
  bPause.classList.remove('active');
  refreshOverlay();
  updateHud();
  audio.stage();
}

function resumeSavedRun() {
  audio.unlock();
  const saved = loadMidRunSafe();
  if (!saved || !isValidSavedState(saved.state)) {
    startNewRun();
    return;
  }
  state = saved.state;
  if (!Array.isArray(state.events)) state.events = [];
  if (!Array.isArray(state.powerups)) state.powerups = [];
  if (!Array.isArray(state.capsules)) state.capsules = [];
  if (!Array.isArray(state.lasers)) state.lasers = [];
  if (!Array.isArray(state.pulses)) state.pulses = [];
  for (const b of state.balls) {
    b.trail = Array.isArray(b.trail) ? b.trail : [];
    if (!Number.isFinite(b.offset)) b.offset = 0;
  }
  if (saved.recordedTotals && typeof saved.recordedTotals === 'object') {
    recordedTotals = {
      score: Number(saved.recordedTotals.score) || 0,
      eddies: Number(saved.recordedTotals.eddies) || 0,
      xp: Number(saved.recordedTotals.xp) || 0,
      won: !!saved.recordedTotals.won,
    };
  } else {
    recordedTotals = { score: 0, eddies: 0, xp: 0, won: false };
  }
  renderer.clearFx();
  runRecorded = false;
  lastHubResult = null;
  autoPausedFlag = false;
  mode = 'playing';
  bPause.textContent = t(lang, 'pause');
  bPause.classList.remove('active');
  refreshOverlay();
  updateHud();
}

function setPaused(paused, fromAuto = false) {
  if (mode !== 'playing' && mode !== 'paused') return;
  if (paused) {
    mode = 'paused';
    autoPausedFlag = !!fromAuto;
    keys.left = false;
    keys.right = false;
    saveProgressNow();
  } else {
    audio.unlock();
    mode = 'playing';
    autoPausedFlag = false;
  }
  bPause.textContent = t(lang, mode === 'paused' ? 'resume' : 'pause');
  bPause.classList.toggle('active', mode === 'paused');
  refreshOverlay();
}

function finalizeRun() {
  if (runRecorded) return;
  runRecorded = true;
  clearMidRunSafe();
  const rewards = runRewards(state);
  const deltaEddies = Math.max(0, rewards.eddies - recordedTotals.eddies);
  const deltaXp = Math.max(0, rewards.xp - recordedTotals.xp);
  const wonNow = !state.endless && !recordedTotals.won && !!rewards.won;
  const payload = {
    score: rewards.score,
    eddies: deltaEddies,
    xp: deltaXp,
    won: wonNow,
    wave: rewards.wave,
  };
  recordedTotals = {
    score: Math.max(recordedTotals.score, rewards.score),
    eddies: Math.max(recordedTotals.eddies, rewards.eddies),
    xp: Math.max(recordedTotals.xp, rewards.xp),
    won: recordedTotals.won || !!rewards.won,
  };
  if (hub && typeof hub.recordRun === 'function') {
    lastHubResult = safeCall(hub.recordRun, GAME_ID, payload);
  }
}

function enterEndless() {
  audio.unlock();
  if (!continueEndless(state)) return;
  runRecorded = false;
  lastHubResult = null;
  mode = 'playing';
  refreshOverlay();
  updateHud();
}

// ---------- HUD Updates ----------
let lastPillsKey = '';

function updateHud() {
  const stageStr = state.endless || state.level > CAMPAIGN_STAGES
    ? `${state.level} ∞`
    : `${state.level}/${CAMPAIGN_STAGES}`;
  sStage.textContent = stageStr;
  sLives.textContent = state.lives > 0 ? '♦'.repeat(Math.min(6, state.lives)) : '—';
  const mult = comboMultiplier(state.combo).toFixed(1);
  sCombo.textContent = state.combo > 0 ? `${state.combo}× (${mult}×)` : '1.0×';
  sEddies.textContent = `€$ ${formatNum(state.eddies)}`;
  sScore.textContent = formatNum(state.score);

  const slowActive = state.timers.slowmo > 0;
  const sandePct = slowActive
    ? Math.max(0, state.timers.slowmo / SLOWMO_DURATION)
    : Math.max(0, Math.min(1, state.slowCharge));
  sandeFill.style.width = `${Math.round(sandePct * 100)}%`;

  const ready = !slowActive && state.slowCharge >= 1;
  bSande.classList.toggle('ready', ready);
  bSande.classList.toggle('running', slowActive);
  bSande.disabled = mode !== 'playing' || (!ready && !slowActive);

  // Active status pills inside canvas corner
  const secUnit = lang === 'he' ? 'ש׳' : 's';
  const pills = [];
  if (state.timers.slowmo > 0) pills.push(['slowmo', `${t(lang, 'sandeActive')} ${state.timers.slowmo.toFixed(1)}${secUnit}`]);
  if (state.timers.wide > 0) pills.push(['wide', `${t(lang, 'puWide')} ${Math.ceil(state.timers.wide)}${secUnit}`]);
  if (state.timers.laser > 0) pills.push(['laser', `${t(lang, 'puLaser')} ${Math.ceil(state.timers.laser)}${secUnit}`]);
  if (state.timers.pierce > 0) pills.push(['pierce', `${t(lang, 'puPierce')} ${Math.ceil(state.timers.pierce)}${secUnit}`]);
  if (state.shield) pills.push(['shield', t(lang, 'puShield')]);
  if (state.timers.stun > 0) pills.push(['stun', `${t(lang, 'statusStun')} ${state.timers.stun.toFixed(1)}${secUnit}`]);

  const key = pills.map((p) => p[0] + p[1]).join('|');
  if (key !== lastPillsKey) {
    lastPillsKey = key;
    activePills.innerHTML = pills
      .map(([cls, txt]) => `<span class="pill ${cls}">${txt}</span>`)
      .join('');
  }
}

// ---------- Controls ----------
function clientXToField(clientX) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return W / 2;
  return ((clientX - rect.left) / rect.width) * W;
}

function clientYToField(clientY) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.height) return H / 2;
  return ((clientY - rect.top) / rect.height) * H;
}

let touchServing = false;

canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'playing') return;
  setPaddleTarget(state, clientXToField(e.clientX));
});

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode !== 'playing') return;
  const fx = clientXToField(e.clientX);
  const fy = clientYToField(e.clientY);
  setPaddleTarget(state, fx);
  if (e.pointerType === 'touch') {
    const hasAttached = state.balls.some((b) => b.attached);
    if (hasAttached) {
      if (fy < PADDLE_Y - 90) {
        touchServing = false;
        launch(state);
      } else {
        touchServing = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
    } else {
      fireLasers(state);
    }
    return;
  }
  if (!launch(state)) fireLasers(state);
});

canvas.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch' && touchServing) {
    touchServing = false;
    if (mode === 'playing') launch(state);
  }
});

canvas.addEventListener('pointercancel', () => {
  touchServing = false;
});

window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (code === 'ArrowLeft' || code === 'KeyA') { keys.left = true; return; }
  if (code === 'ArrowRight' || code === 'KeyD') { keys.right = true; return; }

  if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
    if (mode === 'playing') {
      if (code === 'Space') {
        e.preventDefault();
        audio.unlock();
        if (!launch(state)) fireLasers(state);
      }
      return;
    }
    const active = document.activeElement;
    const isOtherButton = active
      && active !== bPrimary
      && active !== document.body
      && active !== document.documentElement
      && active !== canvas
      && (active.tagName === 'BUTTON' || active.tagName === 'A');
    if (isOtherButton) return;
    e.preventDefault();
    audio.unlock();
    if (mode === 'paused') {
      setPaused(false);
    } else if (mode === 'start' || mode === 'victory' || mode === 'over') {
      startNewRun();
    }
    return;
  }

  if (code === 'KeyQ' || code === 'ShiftLeft' || code === 'ShiftRight') {
    if (mode === 'playing') {
      audio.unlock();
      activateSandevistan(state);
    }
    return;
  }

  if (code === 'KeyP' || code === 'Escape') {
    if (mode === 'playing') setPaused(true, false);
    else if (mode === 'paused') setPaused(false);
    return;
  }

  if (code === 'KeyM') {
    toggleMute();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

function toggleMute() {
  muted = !muted;
  audio.setMuted(muted);
  if (hub && typeof hub.setMuted === 'function') safeCall(hub.setMuted, muted);
  applyI18n();
}

function toggleLang() {
  lang = lang === 'he' ? 'en' : 'he';
  if (hub && typeof hub.setLang === 'function') safeCall(hub.setLang, lang);
  applyI18n();
}

bSande.addEventListener('click', () => {
  audio.unlock();
  if (mode === 'playing') activateSandevistan(state);
});

bPause.addEventListener('click', () => {
  if (mode === 'playing') setPaused(true, false);
  else if (mode === 'paused') setPaused(false);
});

bMute.addEventListener('click', toggleMute);
bLang.addEventListener('click', toggleLang);

bPrimary.addEventListener('click', () => {
  if (mode === 'paused') setPaused(false);
  else startNewRun();
});

bResumeSaved.addEventListener('click', resumeSavedRun);
bEndless.addEventListener('click', enterEndless);
bRestart.addEventListener('click', startNewRun);

bSaveExit.addEventListener('click', (e) => {
  e.preventDefault();
  saveProgressNow();
  window.location.href = '../';
});

const hubLink = $('hubLink');
if (hubLink) {
  hubLink.addEventListener('click', () => { saveProgressNow(); });
}

window.addEventListener('resize', () => renderer.resize());

// ---------- Auto-Pause on Tab-Out + Periodic Checkpoints ----------
if (hub && typeof hub.installAutoPause === 'function') {
  safeCall(hub.installAutoPause, {
    gameId: GAME_ID,
    isRunning: () => mode === 'playing' || mode === 'paused',
    isPaused: () => mode === 'paused',
    setPaused: (v) => setPaused(v, true),
    getSnapshot: () => makeSnapshot(),
    getLang: () => lang,
    onAutoPaused: () => {
      autoPausedFlag = true;
      refreshOverlay();
    },
  });
} else {
  // Standalone fallback if Hub SDK is unavailable
  const fallbackAutoPause = () => {
    if (mode === 'playing') setPaused(true, true);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) fallbackAutoPause(); });
  window.addEventListener('blur', fallbackAutoPause);
  window.addEventListener('pagehide', () => saveProgressNow());
}

// ---------- Main RAF Loop ----------
let prevTs = performance.now();
let hudAccum = 0;

function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - prevTs) / 1000));
  prevTs = ts;

  if (mode === 'playing') {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    step(state, dt, { dir });

    const evs = drainEvents(state);
    for (const ev of evs) {
      audio.playEvent(ev);
      renderer.pushEvent(ev, lang);
      if (ev.type === 'stage') saveProgressNow();
    }

    if (state.phase === 'victory') {
      mode = 'victory';
      finalizeRun();
      refreshOverlay();
    } else if (state.phase === 'over') {
      mode = 'over';
      finalizeRun();
      refreshOverlay();
    }
  }

  renderer.update(dt, state);
  renderer.draw(state, lang, { running: mode === 'playing', paused: mode === 'paused' });

  hudAccum += dt;
  if (hudAccum >= 0.05) {
    hudAccum = 0;
    updateHud();
  }

  requestAnimationFrame(frame);
}

applyI18n();
requestAnimationFrame(frame);
