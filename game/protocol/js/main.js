import * as E from './engine.js';
import { sfx } from './audio.js';
import { t, setLang, getLang, TIER_NAMES_HE } from './i18n.js';
import * as HubSDK from '../../shared/hub-sdk.js';

const hub = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { return undefined; } };
const MIDRUN_KEY = 'cp77hub.midrun.protocol';
function saveMid(snap) {
  if (typeof HubSDK.saveMidRun === 'function') return hub(HubSDK.saveMidRun, 'protocol', snap);
  try { localStorage.setItem(MIDRUN_KEY, JSON.stringify({ ...snap, savedAt: Date.now() })); } catch (e) { /* ignore */ }
}
function loadMid() {
  if (typeof HubSDK.loadMidRun === 'function') return hub(HubSDK.loadMidRun, 'protocol') || null;
  try { const raw = localStorage.getItem(MIDRUN_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function clearMid() {
  if (typeof HubSDK.clearMidRun === 'function') return hub(HubSDK.clearMidRun, 'protocol');
  try { localStorage.removeItem(MIDRUN_KEY); } catch (e) { /* ignore */ }
}

const $ = (id) => document.getElementById(id);

let run = null;
let breach = null;
let phase = 'start'; // start | play | summary | shop | end
let paused = false;
let cursor = { r: 0, c: 0 };
let hover = null;
let muted = false;
let prevStatuses = [];
let lastBufLen = 0;
let totalEarned = 0;
let recorded = false;
let lastWarnSec = -1;
let cells = [];
let summary = null;

let chrome = { lang: 'en', muted: false };
chrome = hub(HubSDK.initGameChrome, {
  gameId: 'protocol',
  onLangChange: (l) => applyLang(l, false),
  onMuteChange: (m) => { muted = !!m; sfx.setMuted(muted); $('muteBtn').textContent = muted ? t('muted') : t('mute'); },
}) || chrome;
muted = !!chrome.muted;

/* ---------- i18n ---------- */
function applyLang(l, syncHub = true) {
  const next = l === 'he' ? 'he' : 'en';
  setLang(next);
  document.documentElement.lang = next;
  document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr';
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('langBtn').textContent = next === 'he' ? 'EN' : 'עב';
  $('muteBtn').textContent = muted ? t('muted') : t('mute');
  updatePauseBtn();
  if (syncHub) hub(HubSDK.setLang, next);
  if (run) { paint(); if (phase !== 'play' || paused) renderOverlay(); }
}
function tierLabel(tier) {
  if (getLang() === 'he') return TIER_NAMES_HE[Math.min(tier, 7) - 1] + (tier > 7 ? ' ' + tier : '');
  return E.tierName(tier);
}

/* ---------- Mid-run save & restore ---------- */
function isRunActive() {
  return (phase === 'play' || phase === 'summary' || phase === 'shop') && !!run && run.status === 'playing';
}
function serializeProtocolState() {
  if (!run) return null;
  const runCopy = JSON.parse(JSON.stringify(run));
  let breachCopy = null;
  if (breach) {
    breachCopy = {
      puzzle: JSON.parse(JSON.stringify(breach.puzzle)),
      tier: breach.tier,
      streak: breach.streak,
      bufferSize: breach.bufferSize,
      buffer: breach.buffer.slice(),
      path: breach.path.map((p) => ({ r: p.r, c: p.c })),
      used: Array.from(breach.used),
      axis: breach.axis,
      index: breach.index,
      started: !!breach.started,
      planElapsed: breach.planElapsed,
      timeLimit: breach.timeLimit,
      timeLeft: breach.timeLeft,
      freezeLeft: breach.freezeLeft,
      hint: breach.hint ? { r: breach.hint.r, c: breach.hint.c } : null,
      status: breach.status,
      result: breach.result ? JSON.parse(JSON.stringify(breach.result)) : null,
    };
  }
  return {
    phase,
    totalEarned,
    cursor: { r: cursor.r, c: cursor.c },
    summary: summary ? JSON.parse(JSON.stringify(summary)) : null,
    run: runCopy,
    breach: breachCopy,
  };
}
function protocolSnapshot() {
  const tier = breach ? breach.tier : (run ? run.tier : 1);
  return {
    label: `Tier ${tier} · ${run ? run.score : 0}`,
    state: serializeProtocolState(),
  };
}
function saveProtocolMidRun() {
  if (!isRunActive()) return;
  saveMid(protocolSnapshot());
}
function restoreProtocolState(snap) {
  const st = snap && snap.state;
  if (!st || !st.run || st.run.status !== 'playing') return false;
  run = {
    ...E.createRun({ seed: st.run.seed || 1 }),
    ...st.run,
    inv: { freeze: 0, flip: 0, hint: 0, ...(st.run.inv || {}) },
    badges: Array.isArray(st.run.badges) ? st.run.badges.slice() : [],
  };
  totalEarned = Number(st.totalEarned) || 0;
  recorded = false;
  summary = st.summary || null;
  cursor = st.cursor && Number.isInteger(st.cursor.r) && Number.isInteger(st.cursor.c) ? { r: st.cursor.r, c: st.cursor.c } : { r: 0, c: 0 };
  hover = null;
  paused = false;

  if (st.breach && st.breach.puzzle && Array.isArray(st.breach.puzzle.grid)) {
    const sb = st.breach;
    const puz = sb.puzzle;
    breach = {
      puzzle: puz,
      grid: puz.grid,
      size: puz.size,
      tier: Number(sb.tier) || run.tier,
      streak: Number(sb.streak) || 0,
      bufferSize: Number(sb.bufferSize) || puz.bufferSize,
      daemons: puz.daemons,
      buffer: Array.isArray(sb.buffer) ? sb.buffer.slice() : [],
      path: Array.isArray(sb.path) ? sb.path.map((p) => ({ r: p.r, c: p.c })) : [],
      used: new Set(Array.isArray(sb.used) ? sb.used : []),
      axis: sb.axis === 'col' ? 'col' : 'row',
      index: Number(sb.index) || 0,
      started: !!sb.started,
      planElapsed: Number(sb.planElapsed) || 0,
      timeLimit: Number(sb.timeLimit) || E.baseTime(run.tier),
      timeLeft: Number.isFinite(Number(sb.timeLeft)) ? Number(sb.timeLeft) : E.baseTime(run.tier),
      freezeLeft: Number(sb.freezeLeft) || 0,
      inv: run.inv,
      hint: sb.hint ? { r: sb.hint.r, c: sb.hint.c } : null,
      status: sb.status === 'done' ? 'done' : 'active',
      result: sb.result || null,
    };
  } else {
    breach = E.startBreach(run);
  }

  phase = ['play', 'summary', 'shop'].includes(st.phase) ? st.phase : 'play';
  if (phase === 'summary' && !summary) phase = 'shop';
  prevStatuses = E.allDaemonStatus(breach).map((s) => s.status);
  lastBufLen = breach.buffer.length;
  lastWarnSec = -1;
  buildGrid();
  last = performance.now();
  updatePauseBtn();
  if (phase === 'play') hideOverlay();
  else renderOverlay();
  paint();
  return true;
}

function updatePauseBtn() {
  const btn = $('pauseBtn');
  if (!btn) return;
  btn.hidden = phase !== 'play';
  btn.textContent = paused ? '▶' : '❚❚';
  btn.title = paused ? t('resume') : t('pause');
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('on', paused);
}

function setPaused(v) {
  if (!isRunActive()) return;
  if (phase !== 'play') {
    if (v) saveProtocolMidRun();
    return;
  }
  paused = !!v;
  updatePauseBtn();
  if (paused) {
    saveProtocolMidRun();
    renderOverlay();
  } else {
    last = performance.now();
    hideOverlay();
    paint();
  }
}
function togglePause() {
  if (phase !== 'play') return;
  setPaused(!paused);
}

/* ---------- Run flow ---------- */
function newRun() {
  clearMid();
  run = E.createRun({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
  totalEarned = 0;
  recorded = false;
  paused = false;
  summary = null;
  beginBreach();
}
function beginBreach() {
  breach = E.startBreach(run);
  phase = 'play';
  paused = false;
  cursor = { r: 0, c: 0 };
  hover = null;
  prevStatuses = E.allDaemonStatus(breach).map((s) => s.status);
  lastBufLen = 0;
  lastWarnSec = -1;
  buildGrid();
  updatePauseBtn();
  hideOverlay();
  last = performance.now();
  paint();
}

function buildGrid() {
  const g = $('grid');
  g.innerHTML = '';
  g.style.gridTemplateColumns = `repeat(${breach.size}, 1fr)`;
  cells = [];
  for (let r = 0; r < breach.size; r++) {
    for (let c = 0; c < breach.size; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.textContent = breach.grid[r][c];
      b.dataset.r = r; b.dataset.c = c;
      b.setAttribute('role', 'gridcell');
      b.tabIndex = -1;
      b.addEventListener('click', () => doPick(r, c));
      b.addEventListener('mouseenter', () => { hover = { r, c }; paint(); });
      b.addEventListener('mouseleave', () => { hover = null; paint(); });
      g.appendChild(b);
      cells.push(b);
    }
  }
}

function doPick(r, c) {
  if (phase !== 'play' || paused) return;
  sfx.unlock();
  const axisBefore = breach.axis;
  const res = E.pick(breach, r, c);
  if (!res.ok) { sfx.deny(); return; }
  cursor = { r, c };
  sfx.pick(breach.buffer.length);
  if (axisBefore) setTimeout(sfx.whoosh, 30);
  checkDaemonSounds();
  paint();
  if (breach.status === 'done') finishBreach();
}

function checkDaemonSounds() {
  const now = E.allDaemonStatus(breach).map((s) => s.status);
  if (now.some((s, i) => s === 'uploaded' && prevStatuses[i] !== 'uploaded')) setTimeout(sfx.daemon, 80);
  prevStatuses = now;
}

function finishBreach() {
  if (phase !== 'play') return;
  paused = false;
  const res = breach.result;
  const tierBefore = run.tier;
  E.applyBreach(run, breach);
  totalEarned += res.eddies;
  paint();
  if (res.outcome === 'fail') {
    sfx.fail();
    phase = 'end';
    summary = { tierBefore, res, lost: true };
    finishRun(false);
  } else {
    if (res.outcome === 'full') setTimeout(sfx.sweep, 120);
    phase = 'summary';
    summary = { tierBefore, res, lost: false };
    saveProtocolMidRun();
  }
  updatePauseBtn();
  renderOverlay();
}

function finishRun(won) {
  clearMid();
  if (recorded) return;
  recorded = true;
  const badges = run.badges.slice();
  hub(HubSDK.recordRun, 'protocol', {
    score: run.score, eddies: totalEarned, xp: run.xp, won, wave: Math.max(1, run.cleared || run.tier), badges,
  });
}

function cashOut() {
  E.cashOut(run);
  phase = 'end';
  paused = false;
  summary = { cashed: true };
  finishRun(true);
  updatePauseBtn();
  renderOverlay();
}

/* ---------- Painting ---------- */
function fmtTime(s) { return s.toFixed(1); }

function paint() {
  if (!breach) return;
  $('sTier').textContent = breach.tier;
  $('sTierName').textContent = tierLabel(breach.tier);
  $('sStreak').textContent = run.streak;
  $('sEddies').textContent = run.eddies;
  $('sScore').textContent = run.score;
  const ts = $('timerStat');
  $('sTimer').textContent = fmtTime(breach.timeLeft) + t('sec');
  ts.classList.toggle('warn', breach.started && breach.timeLeft < 5 && breach.status === 'active');
  ts.classList.toggle('frozen', breach.freezeLeft > 0 || paused);

  // matrix
  const act = breach.status === 'active' && !paused;
  let prev = null;
  const target = hover || null;
  if (target && act) prev = E.previewLine(breach, target.r, target.c);
  const hintKey = breach.hint ? breach.hint.r + ',' + breach.hint.c : null;
  cells.forEach((b) => {
    const r = +b.dataset.r, c = +b.dataset.c;
    const used = breach.used.has(r + ',' + c);
    const valid = act && E.isValidPick(breach, r, c);
    const inLine = act && (breach.axis === 'row' ? r === breach.index : c === breach.index);
    const inPrev = prev && (prev.axis === 'row' ? r === prev.index : c === prev.index);
    b.className = 'cell' +
      (used ? ' used' : '') + (valid ? ' valid' : '') + (inLine ? ' line' : '') +
      (inPrev && !used ? ' preview' : '') + (hintKey === r + ',' + c ? ' hint' : '') +
      (phase === 'play' && cursor.r === r && cursor.c === c ? ' cursor' : '') +
      (act && !inLine && !used ? ' dim' : '');
    b.disabled = false;
    b.setAttribute('aria-disabled', valid ? 'false' : 'true');
  });

  // buffer
  const buf = $('buffer');
  buf.innerHTML = '';
  for (let i = 0; i < breach.bufferSize; i++) {
    const d = document.createElement('div');
    const v = breach.buffer[i];
    d.className = 'slot' + (v ? '' : ' empty') + (v && i === breach.buffer.length - 1 && breach.buffer.length > lastBufLen ? ' pop' : '');
    d.textContent = v || '--';
    buf.appendChild(d);
  }
  lastBufLen = breach.buffer.length;

  // daemons
  const dm = $('daemons');
  dm.innerHTML = '';
  const sts = E.allDaemonStatus(breach);
  breach.daemons.forEach((d, i) => {
    const st = sts[i];
    const row = document.createElement('div');
    row.className = 'daemon ' + st.status;
    const name = document.createElement('div');
    name.className = 'dname';
    name.innerHTML = '<span></span><i></i>';
    name.firstChild.textContent = d.type;
    name.lastChild.textContent = t('r_' + d.type);
    const seq = document.createElement('div');
    seq.className = 'dseq';
    d.seq.forEach((tok, k) => {
      const s = document.createElement('span');
      s.textContent = tok;
      if (st.status !== 'uploaded' && st.status !== 'locked' && k < st.matched) s.className = 'm';
      seq.appendChild(s);
    });
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = t(st.status);
    row.append(name, seq, pill);
    dm.appendChild(row);
  });

  // quickhacks
  const inv = breach.inv;
  $('cFreeze').textContent = inv.freeze; $('cFlip').textContent = inv.flip; $('cHint').textContent = inv.hint;
  $('qFreeze').disabled = !act || !breach.started || inv.freeze <= 0 || breach.freezeLeft > 0;
  $('qFlip').disabled = !act || breach.path.length === 0 || inv.flip <= 0;
  $('qHint').disabled = !act || inv.hint <= 0;
  $('execBtn').disabled = !act || !sts.some((s) => s.status === 'uploaded');
  $('status').textContent = paused ? t('paused') : (act ? (breach.started ? t('running') + ' — ' + (breach.axis === 'row' ? 'ROW ' : 'COL ') + (breach.index + 1) : t('waiting')) : '');
}

/* ---------- Overlays ---------- */
function showOverlay(html, cls) {
  const m = $('modal');
  m.className = 'modal ' + (cls || '');
  m.innerHTML = html;
  $('overlay').hidden = false;
  const f = m.querySelector('button');
  if (f) f.focus();
}
function hideOverlay() { $('overlay').hidden = true; }
const row = (a, b, cls = '') => `<div class="${cls}"><span>${a}</span><b>${b}</b></div>`;

function renderOverlay() {
  if (phase === 'play' && paused) {
    showOverlay(`<h1>${t('paused')}</h1><p>${t('pausedSub')}</p>
      <div class="rows">
        ${row(t('tier'), `${breach.tier} — ${tierLabel(breach.tier)}`)}
        ${row(t('timer'), fmtTime(breach.timeLeft) + t('sec'))}
        ${row(t('score'), run.score)}
      </div>
      <div class="btnrow"><button class="resume-btn" id="resumeNowBtn">${t('resume')}</button><a class="ghost" id="pauseHubBtn" style="text-align:center;text-decoration:none" href="../">${t('hub')}</a></div>`);
    $('resumeNowBtn').onclick = () => setPaused(false);
    $('pauseHubBtn').onclick = () => saveProtocolMidRun();
    return;
  }
  if (phase === 'start') {
    const saved = loadMid();
    const hasSaved = !!(saved && saved.state && saved.state.run && saved.state.run.status === 'playing');
    const savedMeta = hasSaved
      ? ` (${t('tierWord')} ${saved.state.breach ? saved.state.breach.tier : saved.state.run.tier} · ${saved.state.run.score || 0})`
      : '';
    showOverlay(`<h1>${t('title')}</h1><p>${t('startSub')}</p><p>${t('howto')}</p>
      ${hasSaved ? `<div class="btnrow"><button class="resume-btn" id="resumeSavedBtn">${t('resumeSaved')}${savedMeta}</button></div>` : ''}
      <div class="btnrow"><button class="primary" id="goBtn">${t('start')}</button></div>`);
    if (hasSaved) {
      $('resumeSavedBtn').onclick = () => {
        sfx.unlock();
        if (!restoreProtocolState(saved)) { clearMid(); renderOverlay(); }
      };
    }
    $('goBtn').onclick = () => { sfx.unlock(); newRun(); };
  } else if (phase === 'summary') {
    const r = summary.res, b = r.breakdown;
    const full = r.outcome === 'full';
    showOverlay(`<h1>${t('complete')}</h1><p>${full ? t('sweepTitle') : t('partialTitle')} — ${tierLabel(summary.tierBefore)}</p>
      <div class="rows">
        ${row(t('baseReward'), '+' + b.baseEddies + ' $ / ' + b.baseScore)}
        ${b.scoreMult > 1 ? row(t('scoreMult'), '×' + b.scoreMult) : ''}
        ${full ? row(t('fullSweepBonus'), '+' + b.fullSweepEddies + ' $ / ' + b.fullSweepScore) : ''}
        ${row(t('speedBonus'), '+' + b.speedScore)}
        ${row(t('streakMult'), '×' + b.streakMult.toFixed(1))}
        ${r.bonusTime ? row(t('bonusTime'), '+' + r.bonusTime + t('sec')) : ''}
        ${row(t('earnedEddies'), r.eddies + ' $', 'tot')}
        ${row(t('score'), '+' + r.score, 'tot')}
        ${row(t('earnedXp'), '+' + r.xp, 'tot')}
      </div>
      <div class="btnrow"><button class="primary" id="shopBtn">${t('next')}</button></div>`, 'ok');
    $('shopBtn').onclick = () => { phase = 'shop'; saveProtocolMidRun(); renderOverlay(); };
  } else if (phase === 'shop') {
    renderShop();
  } else if (phase === 'end') {
    const lost = summary && summary.lost;
    showOverlay(`<h1>${lost ? t('traceTitle') : t('cashedOut')}</h1><p>${lost ? t('traceSub') : t('runEnd')}</p>
      <div class="rows">
        ${row(t('reached'), t('tierWord') + ' ' + (lost ? run.tier : run.tier - 1) + ' — ' + tierLabel(lost ? run.tier : run.tier - 1))}
        ${row(t('earnedEddies'), totalEarned + ' $', 'tot')}
        ${row(t('score'), run.score, 'tot')}
        ${row(t('earnedXp'), '+' + run.xp, 'tot')}
      </div>
      <div class="btnrow"><button class="primary" id="againBtn">${t('again')}</button><a class="ghost" style="text-align:center;text-decoration:none" href="../">${t('hub')}</a></div>`, lost ? 'bad' : 'ok');
    $('againBtn').onclick = () => newRun();
  }
}

function renderShop() {
  const items = [
    ['buffer', t('buffSlot'), `${run.bufferSize}/${E.MAX_BUFFER}`],
    ['time', t('timeAdd'), `+${run.timeBonus}${t('sec')}`],
    ['freeze', t('freeze'), `${t('owned')} ${run.inv.freeze}`],
    ['flip', t('flip'), `${t('owned')} ${run.inv.flip}`],
    ['hint', t('hint'), `${t('owned')} ${run.inv.hint}`],
  ];
  const html = items.map(([id, name, note]) => {
    const maxed = id === 'buffer' && run.bufferSize >= E.MAX_BUFFER;
    const price = E.SHOP[id].price(run);
    const dis = maxed || run.eddies < price;
    return `<div class="shop-item"><span>${name}<small>${note}</small></span>
      <button data-buy="${id}" ${dis ? 'disabled' : ''}>${maxed ? t('maxed') : t('buy') + ' ' + price + ' $'}</button></div>`;
  }).join('');
  showOverlay(`<h1>${t('shop')}</h1><p>${t('shopSub')} — ${t('eddies')}: <b>${run.eddies} $</b> · ${t('tier')} ${run.tier}: ${tierLabel(run.tier)}</p>${html}
    <div class="btnrow"><button class="primary" id="nextBtn">${t('nextServer')}</button><button class="ghost" id="cashBtn">${t('cashOut')}</button></div>`);
  $('modal').querySelectorAll('[data-buy]').forEach((b) => {
    b.onclick = () => {
      const r = E.buy(run, b.dataset.buy);
      if (r.ok) { sfx.buy(); saveProtocolMidRun(); } else sfx.deny();
      paintHudOnly();
      renderShop();
    };
  });
  $('nextBtn').onclick = () => beginBreach();
  $('cashBtn').onclick = () => cashOut();
}
function paintHudOnly() { $('sEddies').textContent = run.eddies; }

/* ---------- Input ---------- */
function quick(fn) {
  if (phase !== 'play' || paused) return;
  sfx.unlock();
  const r = fn(breach);
  if (r.ok) { sfx.freeze(); } else sfx.deny();
  paint();
}
$('qFreeze').onclick = () => quick(E.useFreeze);
$('qFlip').onclick = () => quick((b) => { const r = E.useFlip(b); if (r.ok) sfx.whoosh(); return r; });
$('qHint').onclick = () => quick(E.useHint);
$('execBtn').onclick = () => {
  if (phase !== 'play' || paused) return;
  const r = E.executeEarly(breach);
  if (!r.ok) { sfx.deny(); $('status').textContent = t('noDaemon'); return; }
  finishBreach();
};
$('pauseBtn').onclick = togglePause;
$('hubLink').onclick = () => saveProtocolMidRun();
$('langBtn').onclick = () => applyLang(getLang() === 'he' ? 'en' : 'he', true);
$('muteBtn').onclick = () => setMute(!muted);
function setMute(m) {
  muted = m;
  sfx.setMuted(m);
  $('muteBtn').textContent = m ? t('muted') : t('mute');
  hub(HubSDK.setMuted, m);
}

document.addEventListener('keydown', (e) => {
  if (phase !== 'play' || !breach) return;
  const k = e.key.toLowerCase();
  if (k === 'p' || k === 'escape') { togglePause(); return; }
  if (paused) return;
  if (e.target && e.target.tagName === 'BUTTON' && e.target.classList.contains('cell') === false && e.key === 'Enter') return;
  const n = breach.size;
  if (k === 'q') { quick(E.useFreeze); return; }
  if (k === 'w') { quick(E.useFlip); return; }
  if (k === 'e') { quick(E.useHint); return; }
  const d = { arrowleft: [0, -1], arrowright: [0, 1], arrowup: [-1, 0], arrowdown: [1, 0] }[k];
  if (d) {
    e.preventDefault();
    cursor = { r: (cursor.r + d[0] + n) % n, c: (cursor.c + d[1] + n) % n };
    paint();
  } else if (k === 'enter' || k === ' ') {
    if (e.target && e.target.classList && e.target.classList.contains('cell')) e.preventDefault();
    if (e.target && e.target.tagName === 'BUTTON' && !e.target.classList.contains('cell')) return;
    doPick(cursor.r, cursor.c);
  }
});

// Auto-pause & mid-run save on tab-out / page hide via Hub SDK (with safe local fallback).
const autoPauseOpts = {
  gameId: 'protocol',
  isRunning: () => isRunActive(),
  isPaused: () => paused,
  setPaused: (v) => setPaused(v),
  getSnapshot: () => protocolSnapshot(),
  getLang,
};
if (typeof HubSDK.installAutoPause === 'function') {
  hub(HubSDK.installAutoPause, autoPauseOpts);
} else {
  const onLeave = () => { if (isRunActive()) { saveProtocolMidRun(); if (phase === 'play' && !paused) setPaused(true); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) onLeave(); });
  window.addEventListener('pagehide', onLeave);
}

/* ---------- Timer loop ---------- */
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  if (phase !== 'play' || paused || !breach) return;
  const before = breach.timeLeft;
  E.tick(breach, dt);
  if (breach.started && breach.freezeLeft <= 0 && breach.timeLeft < 5 && breach.timeLeft > 0) {
    const sec = Math.ceil(breach.timeLeft);
    if (sec !== lastWarnSec) { lastWarnSec = sec; sfx.tick(); }
  }
  if (breach.timeLeft !== before || breach.freezeLeft > 0 || !breach.started) paint();
  if (breach.status === 'done') finishBreach();
}, 100);

/* ---------- Boot ---------- */
sfx.setMuted(muted);
const l0 = chrome.lang === 'he' ? 'he' : 'en';
// preview puzzle behind the start modal
run = E.createRun({ seed: 12345 });
breach = E.startBreach(run);
buildGrid();
applyLang(l0, false);
renderOverlay();
paint();
