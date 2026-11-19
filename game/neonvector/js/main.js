import * as HubSDK from '../../shared/hub-sdk.js';
import { createGame, step, summarize } from './engine.js';
import { Renderer } from './renderer.js';
import { NeonAudio } from './audio.js';
import { t } from './i18n.js';

const hub = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { return undefined; } };
const MIDRUN_KEY = 'cp77hub.midrun.neonvector';
function saveMid(snap) {
  if (typeof HubSDK.saveMidRun === 'function') return hub(HubSDK.saveMidRun, 'neonvector', snap);
  try { localStorage.setItem(MIDRUN_KEY, JSON.stringify({ ...snap, savedAt: Date.now() })); } catch (e) { /* ignore */ }
}
function loadMid() {
  if (typeof HubSDK.loadMidRun === 'function') return hub(HubSDK.loadMidRun, 'neonvector') || null;
  try { const raw = localStorage.getItem(MIDRUN_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function clearMid() {
  if (typeof HubSDK.clearMidRun === 'function') return hub(HubSDK.clearMidRun, 'neonvector');
  try { localStorage.removeItem(MIDRUN_KEY); } catch (e) { /* ignore */ }
}

const $ = (id) => document.getElementById(id);
const cv = $('cv'), renderer = new Renderer(cv), audio = new NeonAudio();
let lang = 'en', game = null, running = false, paused = false, last = 0, acc = 0, recorded = false, endlessUnlocked = false, bannerTimer = 0, endTimer = 0;
const idle = createGame(); const keys = new Set(); let pointer = null, mouseDown = false, bombQueued = false, autoFire = true;

function updateMuteBtn() {
  $('bMute').textContent = t(lang, audio.muted ? 'unmute' : 'mute');
  $('bMute').classList.toggle('on', audio.muted);
}
function toggleMute() {
  audio.unlock();
  audio.setMuted(!audio.muted);
  hub(HubSDK.setMuted, audio.muted);
  updateMuteBtn();
}

const chrome = hub(HubSDK.initGameChrome, {
  gameId: 'neonvector',
  onLangChange: (l) => { lang = l === 'he' ? 'he' : 'en'; applyLang(false); },
  onMuteChange: (m) => { audio.setMuted(!!m); updateMuteBtn(); },
}) || {};
if (chrome.muted) audio.setMuted(true);
try {
  const savedLang = chrome.lang || localStorage.getItem('nv_lang') || document.documentElement.lang || 'en';
  lang = savedLang === 'he' ? 'he' : 'en';
  endlessUnlocked = localStorage.getItem('nv_endless') === '1';
} catch { /* ignore */ }

function refreshResumeSaved() {
  const btn = $('bResumeSaved');
  if (!btn) return;
  const saved = loadMid();
  const valid = !!(saved && saved.state && saved.state.game && saved.state.game.player);
  btn.hidden = !valid;
  if (valid) {
    const sg = saved.state.game;
    btn.textContent = `${t(lang, 'resumeSaved')} (${t(lang, 'sector')} ${sg.sector} · ${Number(sg.score || 0).toLocaleString()})`;
  }
}

function updatePauseInfo() {
  const el = $('pauseInfo');
  if (!el || !game) return;
  el.textContent = `${t(lang, 'sector')} ${game.sector} · ${t(lang, 'score')}: ${game.score.toLocaleString()} · ${t(lang, 'savedProgress')}`;
}

function applyLang(syncHub = false) {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i]').forEach((el) => { el.textContent = t(lang, el.dataset.i); });
  $('hubLink').textContent = t(lang, 'hub'); $('bLang').textContent = t(lang, 'lang');
  $('bPause').textContent = t(lang, paused ? 'resume' : 'pause');
  updateMuteBtn();
  $('bEndless').hidden = !endlessUnlocked;
  refreshResumeSaved();
  updatePauseInfo();
  if (syncHub) hub(HubSDK.setLang, lang);
  try { localStorage.setItem('nv_lang', lang); } catch { /* ignore */ }
}
function banner(text, ms = 2200) { const b = $('banner'); b.textContent = text; b.hidden = false; bannerTimer = ms; }

function serializeNeonVectorState() {
  if (!game) return null;
  const copy = JSON.parse(JSON.stringify({ ...game, events: [] }));
  return { autoFire, game: copy };
}
function neonVectorSnapshot() {
  return {
    label: `Sector ${game.sector} · ${game.score.toLocaleString()}`,
    state: serializeNeonVectorState(),
  };
}
function saveNeonVectorMidRun() {
  if (!running || !game || game.phase === 'dead' || game.phase === 'won') return;
  saveMid(neonVectorSnapshot());
}
function restoreNeonVectorState(snap) {
  const st = snap && snap.state;
  if (!st || !st.game || !st.game.player) return false;
  if (endTimer) { clearTimeout(endTimer); endTimer = 0; }
  const sg = st.game;
  const base = createGame({ seed: sg.seed, mode: sg.mode || 'campaign', autoFire: st.autoFire !== false });
  game = {
    ...base,
    ...sg,
    player: { ...base.player, ...sg.player },
    bullets: Array.isArray(sg.bullets) ? sg.bullets : [],
    pbullets: Array.isArray(sg.pbullets) ? sg.pbullets : [],
    enemies: Array.isArray(sg.enemies) ? sg.enemies : [],
    pickups: Array.isArray(sg.pickups) ? sg.pickups : [],
    lanes: Array.isArray(sg.lanes) ? sg.lanes : [],
    groups: sg.groups && typeof sg.groups === 'object' ? sg.groups : {},
    boss: sg.boss || null,
    events: [],
  };
  autoFire = st.autoFire !== false;
  $('bAuto').classList.toggle('on', autoFire);
  renderer.fx = []; renderer.trail = [];
  recorded = false; running = true; paused = false;
  keys.clear(); pointer = null; mouseDown = false; bombQueued = false;
  $('overlay').hidden = true; $('pauseOverlay').hidden = true; $('result').hidden = true; $('banner').hidden = true;
  $('bPause').textContent = t(lang, 'pause'); $('bPause').classList.remove('on');
  last = performance.now(); acc = 0;
  hud();
  return true;
}

function start(mode) {
  audio.unlock();
  if (endTimer) { clearTimeout(endTimer); endTimer = 0; }
  clearMid();
  renderer.fx = []; renderer.trail = [];
  game = createGame({ seed: (Date.now() & 0x7fffffff), mode, autoFire }); recorded = false; running = true; paused = false;
  keys.clear(); pointer = null; mouseDown = false; bombQueued = false;
  $('overlay').hidden = true; $('pauseOverlay').hidden = true; $('result').hidden = true; last = performance.now(); acc = 0; $('banner').hidden = true;
  $('bPause').textContent = t(lang, 'pause'); $('bPause').classList.remove('on');
  hud();
}

function hud() {
  const s = game; if (!s) return;
  const p = s.player;
  $('sHull').textContent = '♦'.repeat(Math.max(0, p.hull)) + (p.shield ? ' ◈' : '');
  $('sSector').textContent = s.sector + (s.endless ? '∞' : '');
  $('sMult').textContent = s.mult.toFixed(1) + '×';
  const od = Math.floor(s.overdrive); $('sOd').textContent = od + '%'; $('odBar').style.width = od + '%';
  $('odBar').parentElement.classList.toggle('ready', od >= 100); $('bBomb').classList.toggle('ready', od >= 100);
  if ($('sEddies')) $('sEddies').textContent = '€$' + s.eddies.toLocaleString();
  $('sScore').textContent = s.score.toLocaleString();
}

function handleEvents(evts) {
  for (const e of evts) {
    audio.handle(e);
    if (e.type === 'warning') banner(t(lang, 'warning'), CFG_WARN);
    else if (e.type === 'bossStart') $('banner').hidden = true;
    else if (e.type === 'sector') banner(t(lang, 'sector') + ' ' + e.sector, 1800);
    else if (e.type === 'bossDead') banner(t(lang, 'sectorClear'), 2200);
    else if (e.type === 'bossPhase') banner(t(lang, 'phase') + ' ' + e.phase, 1200);
  }
  if (game.overdrive >= 100 && !game._rdy) { game._rdy = true; audio.ready(); } else if (game.overdrive < 100) game._rdy = false;
}
const CFG_WARN = 3000;

function recordCompletedRun() {
  if (!game) return null;
  const r = summarize(game);
  if (!recorded) {
    recorded = true;
    hub(HubSDK.recordRun, 'neonvector', r);
    if (r.won) {
      endlessUnlocked = true;
      try { localStorage.setItem('nv_endless', '1'); } catch { /* ignore */ }
    }
  }
  return r;
}

function end() {
  endTimer = 0;
  if (!game) return;
  running = false;
  paused = false;
  clearMid();
  $('pauseOverlay').hidden = true;
  $('bPause').textContent = t(lang, 'pause'); $('bPause').classList.remove('on');
  const r = recordCompletedRun();
  const res = $('result');
  res.innerHTML = '<div><b>' + t(lang, game.won ? 'win' : 'dead') + '</b></div><div>' + t(lang, 'score') + ': <b>' + r.score.toLocaleString() + '</b></div><div>' + t(lang, 'wave') + ': <b>' + r.wave + '</b></div><div>' + t(lang, 'eddies') + ': <b>€$' + r.eddies.toLocaleString() + '</b> · ' + t(lang, 'xp') + ': <b>' + r.xp.toLocaleString() + '</b></div>' + (r.won ? '<div>' + t(lang, 'unlocked') + '</div>' : '');
  res.hidden = false; $('bStart').textContent = t(lang, 'retry'); $('bEndless').hidden = !endlessUnlocked;
  if ($('bOverlayHub')) $('bOverlayHub').hidden = false;
  refreshResumeSaved();
  $('overlay').hidden = false;
}

function input() {
  let ax = 0, ay = 0;
  if (keys.has('left')) ax -= 1; if (keys.has('right')) ax += 1;
  if (keys.has('up')) ay -= 1; if (keys.has('down')) ay -= 1;
  const fireHeld = mouseDown || keys.has('fire');
  const inp = { ax, ay, bomb: bombQueued, fire: autoFire || fireHeld };
  if (!ax && !ay && pointer) { inp.tx = pointer.x; inp.ty = pointer.y - (pointer.touch ? 70 : 0); }
  if (ax || ay) pointer = null;
  bombQueued = false; return inp;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (running && !paused) {
    acc += dt;
    while (acc >= 1 / 60) {
      game.autoFire = autoFire; step(game, input(), 1 / 60); acc -= 1 / 60;
      renderer.addEvents(game.events); handleEvents(game.events);
      if (game.phase === 'dead' || game.phase === 'won') {
        running = false;
        clearMid();
        recordCompletedRun();
        endTimer = setTimeout(end, game.phase === 'won' ? 1500 : 900);
        break;
      }
    }
    hud();
  }
  if (bannerTimer > 0 && !paused) { bannerTimer -= dt * 1000; if (bannerTimer <= 0) $('banner').hidden = true; }
  if (game) renderer.draw(game, paused ? 0 : dt, lang); else renderer.draw(idle, dt, lang);
}

function setPaused(v) {
  if (!running || !game || game.phase === 'dead' || game.phase === 'won') return;
  paused = !!v;
  $('bPause').textContent = t(lang, paused ? 'resume' : 'pause');
  $('bPause').classList.toggle('on', paused);
  if (paused) {
    keys.clear(); pointer = null; mouseDown = false;
    saveNeonVectorMidRun();
    updatePauseInfo();
    $('banner').hidden = true;
    $('pauseOverlay').hidden = false;
  } else {
    $('pauseOverlay').hidden = true;
    last = performance.now(); acc = 0;
  }
}
function togglePause() { setPaused(!paused); }

function pointerPos(e) { const p = renderer.toLogical(e.clientX, e.clientY); p.touch = e.pointerType === 'touch'; return p; }
cv.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (paused) return;
  if (e.button === 2) { bombQueued = true; return; }
  mouseDown = true;
  pointer = pointerPos(e);
  try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
cv.addEventListener('pointermove', (e) => { if (paused) return; if (e.pointerType === 'mouse' || e.buttons) pointer = pointerPos(e); });
cv.addEventListener('pointerup', (e) => { if (e.button !== 2) mouseDown = false; if (e.pointerType === 'touch') pointer = null; });
cv.addEventListener('pointercancel', () => { mouseDown = false; pointer = null; });
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!paused) bombQueued = true; });

function normKey(e) {
  const c = e.code || '';
  const k = (e.key || '').toLowerCase();
  if (c === 'KeyW' || c === 'ArrowUp' || k === 'w' || k === 'arrowup') return 'up';
  if (c === 'KeyS' || c === 'ArrowDown' || k === 's' || k === 'arrowdown') return 'down';
  if (c === 'KeyA' || c === 'ArrowLeft' || k === 'a' || k === 'arrowleft') return 'left';
  if (c === 'KeyD' || c === 'ArrowRight' || k === 'd' || k === 'arrowright') return 'right';
  if (c === 'KeyP' || c === 'Escape' || k === 'p' || k === 'escape') return 'pause';
  if (c === 'KeyM' || k === 'm') return 'mute';
  if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight' || k === ' ' || k === 'shift') return 'bomb';
  if (c === 'KeyJ' || c === 'KeyZ' || k === 'j' || k === 'z') return 'fire';
  return '';
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const nk = normKey(e);
  if (nk === 'mute') { toggleMute(); e.preventDefault(); return; }
  if (nk === 'pause') { togglePause(); e.preventDefault(); return; }
  if (paused) return;
  if (nk === 'bomb') { bombQueued = true; e.preventDefault(); return; }
  if (nk === 'up' || nk === 'down' || nk === 'left' || nk === 'right' || nk === 'fire') { keys.add(nk); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const nk = normKey(e);
  if (nk) keys.delete(nk);
});
window.addEventListener('resize', () => renderer.resize());

// Auto-pause & mid-run save on tab-out / blur / page hide via Hub SDK (with safe local fallback).
const autoPauseOpts = {
  gameId: 'neonvector',
  isRunning: () => running && !!game && game.phase !== 'dead' && game.phase !== 'won',
  isPaused: () => paused,
  setPaused: (v) => setPaused(v),
  getSnapshot: () => neonVectorSnapshot(),
  getLang: () => lang,
};
if (typeof HubSDK.installAutoPause === 'function') {
  hub(HubSDK.installAutoPause, autoPauseOpts);
} else {
  const onLeave = () => { keys.clear(); mouseDown = false; if (autoPauseOpts.isRunning()) { saveNeonVectorMidRun(); if (!paused) setPaused(true); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) onLeave(); });
  window.addEventListener('blur', onLeave);
  window.addEventListener('pagehide', onLeave);
}

$('bStart').onclick = () => start('campaign');
$('bEndless').onclick = () => start('endless');
$('bResumeSaved').onclick = () => {
  audio.unlock();
  const saved = loadMid();
  if (!restoreNeonVectorState(saved)) { clearMid(); refreshResumeSaved(); }
};
$('bResume').onclick = () => setPaused(false);
if ($('bRestart')) $('bRestart').onclick = () => start(game && game.endless ? 'endless' : 'campaign');
$('bPauseHub').onclick = () => saveNeonVectorMidRun();
if ($('bOverlayHub')) $('bOverlayHub').onclick = () => saveNeonVectorMidRun();
$('hubLink').onclick = () => saveNeonVectorMidRun();
$('bBomb').onclick = () => { if (!paused) bombQueued = true; };
$('bPause').onclick = togglePause;
$('bAuto').classList.add('on');
$('bAuto').onclick = () => { autoFire = !autoFire; $('bAuto').classList.toggle('on', autoFire); };
$('bMute').onclick = toggleMute;
$('bLang').onclick = () => { lang = lang === 'en' ? 'he' : 'en'; applyLang(true); };

applyLang(false); renderer.resize(); requestAnimationFrame(frame);
