// Homelab Defender: UI controller. Wires the engine, renderer, audio and DOM together.
import * as E from './engine.js';
import { MAPS } from './maps.js';
import { createRenderer, TOWER_COLOR } from './renderer.js';
import * as Audio from './audio.js';
import { t, applyLang, getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};

const canvas = $('cv');
const renderer = createRenderer(canvas);

let game = null, mapIdx = 0, mode = 'campaign', runMode = 'campaign';
let screen = 'menu', paused = false, speed = 1;
let selected = null, build = null, hover = null;
let scores = store.get('hd.scores', {});
let badges = store.get('hd.badges', []);
let runBadges = [];
let committed = true;
let last = performance.now(), clock = 0, hudT = 0;

// ------------------------------------------------------------------ language
function initialLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'he' || q === 'en') return q;
  return store.get('hd.lang', (navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en');
}
function setLang(l) {
  store.set('hd.lang', l);
  applyLang(l);
  $('b-lang').textContent = t('lang');
  $('back').href = l === 'he' ? '/portfolio/he/' : '/portfolio/';
  buildPalette(); buildMaps(); buildBadgeList($('badge-list'), []); refreshStatic(); lastSel = ''; lastHud = {};
}

// ------------------------------------------------------------------ small DOM helpers
let lastHud = {};
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
function toast(msg, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = msg;
  $('toasts').appendChild(d);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => d.remove(), 2500);
}
function banner(msg, boss) {
  const b = $('banner'); b.textContent = msg; b.className = 'banner' + (boss ? ' boss' : '');
  void b.offsetWidth; b.classList.add('show');
}
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// ------------------------------------------------------------------ palette
function buildPalette() {
  const p = $('palette'); p.textContent = '';
  E.TOWER_KEYS.forEach((k, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tw'; b.dataset.type = k;
    b.innerHTML = '<canvas></canvas><span><span class="nm"></span><span class="ds"></span></span><span><span class="cs"></span><span class="hk"></span></span>';
    b.querySelector('.nm').textContent = t('tower.' + k);
    b.querySelector('.ds').textContent = t('tdesc.' + k);
    b.querySelector('.cs').textContent = E.TOWERS[k].cost;
    b.querySelector('.hk').textContent = String(i + 1);
    b.title = t('tower.' + k) + ' — ' + t('tdesc.' + k);
    b.addEventListener('click', () => { Audio.unlock(); chooseBuild(build === k ? null : k); });
    p.appendChild(b);
    requestAnimationFrame(() => renderer.paintIcon(b.querySelector('canvas'), k));
  });
}
function chooseBuild(k) {
  build = k; if (k) selected = null;
  refreshPalette();
}
function refreshPalette() {
  document.querySelectorAll('.tw').forEach((b) => {
    b.classList.toggle('on', b.dataset.type === build);
    b.classList.toggle('poor', !!game && game.cash < E.TOWERS[b.dataset.type].cost);
  });
}

// ------------------------------------------------------------------ maps & badges (menu)
function scoreKey(i, m) { return MAPS[i].id + ':' + m; }
function buildMaps() {
  const box = $('maps'); box.textContent = '';
  MAPS.forEach((m, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mapc';
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200;
    const best = scores[scoreKey(i, mode)];
    const d = document.createElement('div');
    d.innerHTML = '<div class="nm"><span></span><span class="pill"></span></div><div class="ds"></div><div class="bs"></div>';
    d.querySelector('.nm span').textContent = t('map.' + m.id);
    const pill = d.querySelector('.pill'); pill.textContent = t('diff.' + m.difficulty); pill.classList.add(m.difficulty);
    d.querySelector('.ds').textContent = t('map.desc.' + m.id);
    d.querySelector('.bs').textContent = best ? `${t('best')}: ${fmt(best.score)} · ${t('wave')} ${best.wave}` : '';
    b.append(cv, d);
    b.addEventListener('click', () => { Audio.unlock(); startGame(i, mode); });
    box.appendChild(b);
    drawMapPreview(cv, m);
  });
}
function drawMapPreview(cv, m) {
  const g = cv.getContext('2d'), s = 20;
  g.fillStyle = '#10121b'; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#171a26';
  for (let c = 0; c < 16; c++) for (let r = 0; r < 10; r++) g.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
  g.strokeStyle = '#ffb84d'; g.lineWidth = 7; g.lineJoin = 'round'; g.shadowColor = '#ffb84d'; g.shadowBlur = 8;
  g.beginPath(); m.path.forEach(([c, r], i) => { const x = (c + 0.5) * s, y = (r + 0.5) * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
}
function buildBadgeList(ul, fresh) {
  ul.textContent = '';
  E.ACHIEVEMENTS.forEach((id) => {
    const li = document.createElement('li');
    const have = badges.includes(id);
    li.className = (have ? '' : 'locked ') + (fresh.includes(id) ? 'new' : '');
    li.innerHTML = '<b></b><span></span>';
    li.querySelector('b').textContent = t('badge.' + id);
    li.querySelector('span').textContent = t('bdesc.' + id);
    ul.appendChild(li);
  });
  $('badge-count').textContent = `${badges.length}/${E.ACHIEVEMENTS.length}`;
}
function refreshStatic() {
  $('b-mute').title = Audio.isMuted() ? t('unmute') : t('mute');
  $('b-mute').setAttribute('aria-label', $('b-mute').title);
  $('b-mute').setAttribute('aria-pressed', String(Audio.isMuted()));
  $('b-mute').textContent = Audio.isMuted() ? '✕' : '♪';
  $('ab-emp').querySelector('.ab-name').textContent = t('emp');
  $('ab-overclock').querySelector('.ab-name').textContent = t('overclock');
  $('ab-emp').title = t('emp.desc'); $('ab-overclock').title = t('overclock.desc');
  $('b-pause').title = paused ? t('resume') : t('pause');
  $('b-pause').setAttribute('aria-label', $('b-pause').title);
  $('b-pause').textContent = paused ? '▶' : '❚❚';
}

// ------------------------------------------------------------------ run lifecycle
function openMenu() {
  commitRun();
  screen = 'menu'; game = E.createGame({ map: MAPS[mapIdx], mode: 'campaign' });
  $('menu').hidden = false; $('end').hidden = true;
  buildMaps(); buildBadgeList($('badge-list'), []);
  selected = null; build = null; paused = false; refreshStatic();
}
function startGame(i, m) {
  mapIdx = i; mode = m; runMode = m;
  game = E.createGame({ map: MAPS[i], mode: m });
  runBadges = []; selected = null; build = null; paused = false; speed = 1;
  $('b-speed').textContent = '1×'; $('paused').hidden = true;
  screen = 'play'; $('menu').hidden = true; $('end').hidden = true;
  lastHud = {}; lastSel = '';
  refreshStatic(); refreshPalette();
  renderer.resize();
  committed = false;
  $('banner').textContent = ''; $('banner').className = 'banner';
}
function commitRun() {
  if (!game || screen === 'menu' || committed) return;
  committed = true;
  const k = scoreKey(mapIdx, runMode), prev = scores[k];
  const isBest = !prev || game.score > prev.score;
  if (game.score > 0 && isBest) { scores[k] = { score: Math.floor(game.score), wave: game.wave }; store.set('hd.scores', scores); }
  game._newBest = game.score > 0 && isBest;
}
function mergeBadges() {
  const fresh = game.achievements.filter((id) => !badges.includes(id));
  if (fresh.length) { badges = badges.concat(fresh); store.set('hd.badges', badges); }
  return fresh;
}
function showEnd() {
  const won = game.status === 'won';
  committed = false; commitRun();
  const fresh = mergeBadges();
  const box = $('end'); box.hidden = false; box.className = 'overlay rtl-ui ' + (won ? 'win' : 'lose');
  $('end-title').textContent = won ? t('victory') : t('defeat');
  $('end-text').textContent = won ? t('victoryText') : t('defeatText') + ' ' + t('wavesReached') + ': ' + game.wave;
  $('end-score').textContent = fmt(game.score);
  $('end-best').textContent = game._newBest ? '★ ' + t('newBest') : '';
  $('e-endless').hidden = !(won && runMode === 'campaign');
  buildBadgeList($('end-badges'), fresh);
  $('end-badges').querySelectorAll('li.locked').forEach((li) => li.remove());
  document.activeElement && document.activeElement.blur();
  ($('e-endless').hidden ? $('e-again') : $('e-endless')).focus();
}

// ------------------------------------------------------------------ actions
function deny(reason) {
  Audio.play('deny');
  toast(t('deny.' + reason), 'bad');
}
function cellOk(c, r) { return build ? E.canPlace(game, build, c, r) : { ok: false }; }
function tryPlace(c, r) {
  const res = E.placeTower(game, build, c, r);
  if (!res.ok) { deny(res.reason); return; }
  if (game.cash < E.TOWERS[build].cost) chooseBuild(null);
}
function sel() { return game && selected ? game.towers.find((x) => x.id === selected) : null; }
function doUpgrade() { const x = sel(); if (!x) return; const r = E.upgradeTower(game, x.id); if (!r.ok && r.reason === 'cash') deny('cash'); lastSel = ''; }
function doSell() { const x = sel(); if (!x) return; E.sellTower(game, x.id); selected = null; lastSel = ''; }
function doTarget() { const x = sel(); if (x) { E.cycleTargeting(game, x.id); lastSel = ''; } }
function doSend() {
  const r = E.sendWave(game);
  if (r.ok && r.bonus > 0) toast(t('earlyBonus', { b: r.bonus }), 'gold');
}
function togglePause() {
  if (screen !== 'play' || game.status !== 'running') return;
  paused = !paused; $('paused').hidden = !paused; refreshStatic();
}
function cycleSpeed() { speed = speed % 3 + 1; $('b-speed').textContent = speed + '×'; }
function toggleMute() { Audio.setMuted(!Audio.isMuted()); store.set('hd.mute', Audio.isMuted()); refreshStatic(); Audio.unlock(); }

// ------------------------------------------------------------------ input
function pointerCell(ev) { return renderer.cellAt(ev.clientX, ev.clientY); }
canvas.addEventListener('pointermove', (ev) => {
  if (screen !== 'play') return;
  const c = pointerCell(ev);
  hover = c ? { ...c, ok: cellOk(c.c, c.r).ok } : null;
});
canvas.addEventListener('pointerleave', () => { hover = null; });
canvas.addEventListener('pointerdown', (ev) => {
  Audio.unlock();
  if (screen !== 'play') return;
  const c = pointerCell(ev);
  hover = c ? { ...c, ok: cellOk(c.c, c.r).ok } : null; // touch has no hover: show the ghost on press
});
canvas.addEventListener('click', (ev) => {
  if (screen !== 'play' || paused || game.status !== 'running') return;
  const c = pointerCell(ev); if (!c) return;
  const tw = E.towerAt(game, c.c, c.r);
  if (tw) { selected = tw.id; build = null; refreshPalette(); lastSel = ''; return; }
  if (build) { tryPlace(c.c, c.r); hover = { ...c, ok: cellOk(c.c, c.r).ok }; return; }
  selected = null; lastSel = '';
});
canvas.addEventListener('contextmenu', (ev) => { ev.preventDefault(); build = null; selected = null; refreshPalette(); lastSel = ''; });

$('b-pause').addEventListener('click', togglePause);
$('b-speed').addEventListener('click', cycleSpeed);
$('b-mute').addEventListener('click', toggleMute);
$('b-menu').addEventListener('click', () => { if (screen === 'play') openMenu(); });
$('b-lang').addEventListener('click', () => setLang(getLang() === 'he' ? 'en' : 'he'));
$('b-send').addEventListener('click', () => { Audio.unlock(); if (screen === 'play' && !paused) doSend(); });
$('ab-emp').addEventListener('click', () => { Audio.unlock(); if (screen === 'play' && !paused) E.useAbility(game, 'emp'); });
$('ab-overclock').addEventListener('click', () => { Audio.unlock(); if (screen === 'play' && !paused) E.useAbility(game, 'overclock'); });
$('m-campaign').addEventListener('click', () => setMode('campaign'));
$('m-endless').addEventListener('click', () => setMode('endless'));
function setMode(m) { mode = m; $('m-campaign').classList.toggle('on', m === 'campaign'); $('m-endless').classList.toggle('on', m === 'endless'); buildMaps(); }
$('e-again').addEventListener('click', () => startGame(mapIdx, runMode));
$('e-menu').addEventListener('click', openMenu);
$('e-endless').addEventListener('click', () => {
  E.continueEndless(game); runMode = 'endless'; committed = false; $('end').hidden = true;
  game._newBest = false; toast(t('endless'), 'gold');
});

document.addEventListener('keydown', (ev) => {
  Audio.unlock();
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (screen !== 'play' || !game || game.status !== 'running') return;
  const k = ev.key.toLowerCase();
  if (/^[1-5]$/.test(k)) { if (!paused) chooseBuild(build === E.TOWER_KEYS[k - 1] ? null : E.TOWER_KEYS[k - 1]); return; }
  switch (k) {
    case 'p': togglePause(); break;
    case 'f': cycleSpeed(); break;
    case 'm': toggleMute(); break;
    case 'escape': build = null; selected = null; refreshPalette(); lastSel = ''; break;
    case ' ': ev.preventDefault(); if (!paused) doSend(); break;
    case 'u': if (!paused) doUpgrade(); break;
    case 's': if (!paused) doSell(); break;
    case 't': if (!paused) doTarget(); break;
    case 'q': if (!paused) E.useAbility(game, 'emp'); break;
    case 'w': if (!paused) E.useAbility(game, 'overclock'); break;
    default:
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play' && game.status === 'running' && !paused) togglePause(); });
window.addEventListener('resize', () => renderer.resize());
if (window.ResizeObserver) new ResizeObserver(() => renderer.resize()).observe(canvas);

// ------------------------------------------------------------------ events -> audio / toasts
function handleEvents() {
  if (!game.events.length) return;
  const ev = game.events.splice(0);
  renderer.handleEvents(ev, game);
  for (const e of ev) {
    switch (e.type) {
      case 'shot': Audio.play('pew'); break;
      case 'beam': Audio.play('laser'); break;
      case 'splash': Audio.play('splash'); break;
      case 'arc': Audio.play('zap'); break;
      case 'pulse': Audio.play('slow'); break;
      case 'place': Audio.play('place'); break;
      case 'upgrade': Audio.play('upgrade'); break;
      case 'sell': Audio.play('sell'); break;
      case 'kill': Audio.play(e.boss ? 'boom' : 'kill'); Audio.play('cash'); break;
      case 'wave': Audio.play(e.boss ? 'bosshorn' : 'horn'); banner(e.boss ? t('bossIncoming') : t('waveN', { n: e.wave }), e.boss); break;
      case 'clear': Audio.play('clear'); toast(t('waveCleared', { n: e.wave, b: e.bonus }), 'gold'); break;
      case 'bonus': break;
      case 'emp': Audio.play('emp'); break;
      case 'overclock': Audio.play('overclock'); break;
      case 'leak': Audio.play('leak'); break;
      case 'achievement': Audio.play('badge'); runBadges.push(e.id); toast('★ ' + t('unlocked') + ': ' + t('badge.' + e.id), 'gold'); break;
      case 'defeat': Audio.play('defeat'); break;
      case 'victory': Audio.play('victory'); break;
      default:
    }
  }
}

// ------------------------------------------------------------------ HUD
let lastSel = '';
function updateHud() {
  const g = game;
  setText('st-lives', String(Math.ceil(g.lives)));
  $('st-lives').className = 'v ' + (g.lives / g.maxLives > 0.5 ? 'ok' : g.lives / g.maxLives > 0.25 ? 'warn' : 'bad');
  setText('st-cash', fmt(g.cash));
  setText('st-wave', g.endless ? String(g.wave) : `${g.wave}/${E.CAMPAIGN_WAVES}`);
  setText('st-score', fmt(g.score));

  // send-wave button
  const send = $('b-send'), last = E.allWavesSent(g);
  send.disabled = last || g.status !== 'running';
  setText('send-label', last ? t('allSent') : (g.wave === 0 ? t('sendWave') : t('sendBonus')));
  if (last) setText('send-sub', '');
  else {
    const left = Math.max(0, Math.ceil(g.waveTimer)), bonus = Math.floor(g.waveTimer * (g.wave > 0 ? 1.5 : 0.5));
    setText('send-sub', `${t('nextIn')} ${left}s` + (bonus > 0 ? `  ·  +${bonus}` : ''));
  }

  // abilities
  for (const name of ['emp', 'overclock']) {
    const a = g.abilities[name], el = $('ab-' + name);
    const p = a.cd > 0 ? a.cd / a.max : 0;
    el.style.setProperty('--p', p.toFixed(3));
    el.classList.toggle('ready', a.cd <= 0);
    el.classList.toggle('active', name === 'overclock' && a.active > 0);
    el.querySelector('.ab-cd').textContent = name === 'overclock' && a.active > 0 ? `${a.active.toFixed(1)}s` : a.cd > 0 ? `${Math.ceil(a.cd)}s` : '●';
    el.disabled = a.cd > 0 || g.status !== 'running';
  }
  refreshPalette();
  updateSelected();
}
function updateSelected() {
  const box = $('sel'), x = sel();
  if (!x) { if (!box.hidden) { box.hidden = true; box.textContent = ''; } lastSel = ''; return; }
  const cost = E.upgradeCost(x), can = cost !== null && game.cash >= cost;
  const sig = [x.id, x.level, x.targeting, can, cost, getLang()].join('|');
  if (sig === lastSel) return;
  lastSel = sig; box.hidden = false;
  const st = E.towerStats(x.type, x.level), nx = x.level < 3 ? E.towerStats(x.type, x.level + 1) : null;
  const rows = [];
  const add = (label, key, f = (v) => v) => { if (st[key] !== undefined) rows.push(`<span>${label}<b>${f(st[key])}${nx && nx[key] !== st[key] ? ' → ' + f(nx[key]) : ''}</b></span>`); };
  add(st.dps !== undefined ? 'DPS' : 'DMG', st.dps !== undefined ? 'dps' : 'dmg');
  add('RNG', 'range', (v) => v.toFixed(1));
  add('RATE', 'rate', (v) => v.toFixed(1) + '/s');
  add('AOE', 'radius', (v) => v.toFixed(1));
  add('CHAIN', 'chain');
  add('SLOW', 'slow', (v) => Math.round((1 - v) * 100) + '%');
  box.innerHTML = `<h2>${t('selected')}</h2><div class="row"><span class="nm" style="color:${TOWER_COLOR[x.type]}"></span><span class="tier"></span></div><div class="st">${rows.join('')}</div>
    <div class="btns"><button class="up" type="button"></button><button class="sell" type="button"></button><button class="tgt" type="button"></button></div>`;
  box.querySelector('.nm').textContent = t('tower.' + x.type);
  box.querySelector('.tier').textContent = `${t('level')} ${x.level + 1}/4`;
  const up = box.querySelector('.up');
  up.textContent = cost === null ? t('maxed') : `${t('upgrade')} · ${cost}  [U]`; up.disabled = !can;
  box.querySelector('.sell').textContent = `${t('sell')} · +${E.sellValue(x)}  [S]`;
  box.querySelector('.tgt').textContent = `${t('target')}: ${t('tgt.' + x.targeting)}  [T]`;
  up.addEventListener('click', doUpgrade); box.querySelector('.sell').addEventListener('click', doSell); box.querySelector('.tgt').addEventListener('click', doTarget);
}

// ------------------------------------------------------------------ main loop
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  clock += dt;
  if (game) {
    const live = screen === 'play' && !paused && game.status === 'running';
    if (live) for (let i = 0; i < speed; i++) { if (game.status === 'running') E.update(game, dt); }
    if (screen === 'play') {
      handleEvents();
      if (game.status !== 'running' && $('end').hidden && !game._shown) { game._shown = true; setTimeout(showEnd, 900); }
      hudT += dt; if (hudT > 0.08) { hudT = 0; updateHud(); }
    }
    if (screen === 'play' && game._shown && game.status === 'running') game._shown = false; // continued into endless
    const view = { hover: screen === 'play' ? hover : null, build: screen === 'play' ? build : null, selected, time: clock };
    if (view.hover && build) view.hover.ok = cellOk(view.hover.c, view.hover.r).ok;
    renderer.render(game, view, paused || screen === 'menu' ? dt * 0.4 : dt * (live ? speed : 1));
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
Audio.setMuted(store.get('hd.mute', false));
applyLang(initialLang());
$('b-lang').textContent = t('lang');
$('back').href = getLang() === 'he' ? '/portfolio/he/' : '/portfolio/';
buildPalette(); refreshStatic();
committed = true;
openMenu();
renderer.resize();
requestAnimationFrame(frame);
