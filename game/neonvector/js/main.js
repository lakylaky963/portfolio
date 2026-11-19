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
let lang = 'en', game = null, running = false, paused = false, last = 0, acc = 0, recorded = false, endlessUnlocked = false, bannerTimer = 0;
const idle = createGame(); const keys = new Set(); let pointer = null, bombQueued = false, autoFire = true;

function updateMuteBtn() {
  $('bMute').textContent = t(lang, audio.muted ? 'unmute' : 'mute');
  $('bMute').classList.toggle('on', audio.muted);
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
  recorded = false; running = true; paused = false;
  keys.clear(); pointer = null; bombQueued = false;
  $('overlay').hidden = true; $('pauseOverlay').hidden = true; $('result').hidden = true; $('banner').hidden = true;
  $('bPause').textContent = t(lang, 'pause'); $('bPause').classList.remove('on');
  last = performance.now(); acc = 0;
  hud();
  return true;
}

function start(mode) {
  audio.unlock();
  clearMid();
  game = createGame({ seed: (Date.now() & 0x7fffffff), mode, autoFire }); recorded = false; running = true; paused = false;
  keys.clear(); pointer = null; bombQueued = false;
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
  $('sScore').textContent = s.score.toLocaleString();
}

function handleEvents(evts) {
  for (const e of evts) {
    audio.handle(e);
    if (e.type === 'warning') banner(t(lang, 'warning'), CFG_WARN);
    else if (e.type === 'bossStart') $('banner').hidden = true;
    else if (e.type === 'sector') banner(t(lang, 'sector') + ' ' + e.sector, 1800);
    else if (e.type === 'bossDead') banner(t(lang, 'sectorClear'), 2200);
    else if (e.type === 'bossPhase') banner('PHASE ' + e.phase, 1200);
  }
  if (game.overdrive >= 100 && !game._rdy) { game._rdy = true; audio.ready(); } else if (game.overdrive < 100) game._rdy = false;
}
const CFG_WARN = 3000;

function end() {
  running = false;
  paused = false;
  clearMid();
  $('pauseOverlay').hidden = true;
  $('bPause').textContent = t(lang, 'pause'); $('bPause').classList.remove('on');
  const r = summarize(game);
  if (!recorded) { recorded = true; hub(HubSDK.recordRun, 'neonvector', r); }
  if (r.won) { endlessUnlocked = true; try { localStorage.setItem('nv_endless', '1'); } catch { /* ignore */ } }
  const res = $('result');
  res.innerHTML = '<div><b>' + t(lang, game.won ? 'win' : 'dead') + '</b></div><div>' + t(lang, 'score') + ': <b>' + r.score.toLocaleString() + '</b></div><div>' + t(lang, 'wave') + ': <b>' + r.wave + '</b></div><div>' + t(lang, 'eddies') + ': <b>€$' + r.eddies.toLocaleString() + '</b> · ' + t(lang, 'xp') + ': <b>' + r.xp.toLocaleString() + '</b></div>' + (r.won ? '<div>' + t(lang, 'unlocked') + '</div>' : '');
  res.hidden = false; $('bStart').textContent = t(lang, 'retry'); $('bEndless').hidden = !endlessUnlocked;
  refreshResumeSaved();
  $('overlay').hidden = false;
}

function input() {
  let ax = 0, ay = 0;
  if (keys.has('arrowleft') || keys.has('a')) ax -= 1; if (keys.has('arrowright') || keys.has('d')) ax += 1;
  if (keys.has('arrowup') || keys.has('w')) ay -= 1; if (keys.has('arrowdown') || keys.has('s')) ay += 1;
  const inp = { ax, ay, bomb: bombQueued };
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
      if (game.phase === 'dead' || game.phase === 'won') { running = false; clearMid(); setTimeout(end, game.phase === 'won' ? 1500 : 900); break; }
    }
    hud();
  }
  if (bannerTimer > 0 && !paused) { bannerTimer -= dt * 1000; if (bannerTimer <= 0) $('banner').hidden = true; }
  if (game) renderer.draw(game, paused ? 0 : dt); else renderer.draw(idle, dt);
}

function setPaused(v) {
  if (!running || !game || game.phase === 'dead' || game.phase === 'won') return;
  paused = !!v;
  $('bPause').textContent = t(lang, paused ? 'resume' : 'pause');
  $('bPause').classList.toggle('on', paused);
  if (paused) {
    keys.clear(); pointer = null;
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
cv.addEventListener('pointerdown', (e) => { audio.unlock(); if (paused) return; if (e.button === 2) { bombQueued = true; return; } pointer = pointerPos(e); try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
cv.addEventListener('pointermove', (e) => { if (paused) return; if (e.pointerType === 'mouse' || e.buttons) pointer = pointerPos(e); });
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!paused) bombQueued = true; });
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'p' || k === 'escape') { togglePause(); return; }
  if (paused) return;
  if (k === ' ' || k === 'shift') { bombQueued = true; e.preventDefault(); return; }
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
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
  const onLeave = () => { keys.clear(); if (autoPauseOpts.isRunning()) { saveNeonVectorMidRun(); if (!paused) setPaused(true); } };
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
$('bPauseHub').onclick = () => saveNeonVectorMidRun();
$('hubLink').onclick = () => saveNeonVectorMidRun();
$('bBomb').onclick = () => { if (!paused) bombQueued = true; };
$('bPause').onclick = togglePause;
$('bAuto').classList.add('on');
$('bAuto').onclick = () => { autoFire = !autoFire; $('bAuto').classList.toggle('on', autoFire); };
$('bMute').onclick = () => { audio.unlock(); audio.setMuted(!audio.muted); hub(HubSDK.setMuted, audio.muted); updateMuteBtn(); };
$('bLang').onclick = () => { lang = lang === 'en' ? 'he' : 'en'; applyLang(true); };

applyLang(false); renderer.resize(); requestAnimationFrame(frame);
