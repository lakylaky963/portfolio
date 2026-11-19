// ICEBREAKER // Netrunner Survivor — Main UI, Input, Audio, Auto-Pause & Hub SDK Controller.
import {
  initGameChrome,
  markLaunched,
  recordRun,
  getProfile,
  setLang as setHubLang,
  setMuted as setHubMuted,
  saveMidRun,
  loadMidRun,
  clearMidRun,
  installAutoPause,
} from '../../shared/hub-sdk.js';

import {
  createGame,
  step,
  drainEvents,
  chooseUpgrade,
  continueEndless,
  recomputeStats,
  activeBoss,
  runSummary,
  WEAPONS,
  WEAPON_IDS,
  PASSIVES,
  PASSIVE_IDS,
  CHRONO_DURATION,
  CHRONO_COOLDOWN,
  MAX_ITEM_LEVEL,
} from './engine.js';

import { Renderer } from './renderer.js';
import { Synth } from './audio.js';
import { t, setLang, getLang } from './i18n.js';

const GAME_ID = 'icebreaker';
const FIXED_DT = 1 / 60;
const RING_CIRC = 2 * Math.PI * 18; // 113.097

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// State serialization for mid-run checkpoints (100% JSON-safe, lossless)
// ---------------------------------------------------------------------------
export function serializeState(s) {
  if (!s) return null;
  const aliveEnemies = s.enemies.filter((e) => !e.dead).map((e) => ({ ...e }));
  const bullets = s.bullets.map((b) => {
    const copy = { ...b };
    copy.targetId = b.target && !b.target.dead ? b.target.id : null;
    delete copy.target;
    return copy;
  });
  return {
    v: 1,
    seed: s.seed,
    rngState: s.rngState,
    opts: { ...s.opts },
    phase: s.phase,
    time: s.time,
    frame: s.frame,
    endless: !!s.endless,
    won: !!s.won,
    nextId: s.nextId,
    wave: s.wave,
    player: {
      ...s.player,
      weapons: JSON.parse(JSON.stringify(s.player.weapons)),
      passives: { ...s.player.passives },
    },
    chrono: { ...s.chrono },
    enemies: aliveEnemies,
    bullets,
    eshots: s.eshots.map((b) => ({ ...b })),
    pickups: s.pickups.map((p) => ({ ...p })),
    orbAngle: s.orbAngle,
    spawnT: s.spawnT,
    nextEliteAt: s.nextEliteAt,
    nextBossAt: s.nextBossAt,
    bossesSpawned: s.bossesSpawned,
    bossesKilled: s.bossesKilled,
    kills: s.kills,
    score: s.score,
    eddies: s.eddies,
    totalXp: s.totalXp,
    scoreAcc: s.scoreAcc,
    pendingLevels: s.pendingLevels,
    draft: s.draft ? s.draft.map((d) => ({ ...d })) : null,
    stats: { ...s.stats },
    recordedTotals: s.recordedTotals
      ? {
          eddies: Number(s.recordedTotals.eddies) || 0,
          xp: Number(s.recordedTotals.xp) || 0,
          wonRecorded: !!s.recordedTotals.wonRecorded,
        }
      : { eddies: 0, xp: 0, wonRecorded: false },
  };
}

export function deserializeState(raw) {
  if (!raw || typeof raw !== 'object' || !raw.player || !Array.isArray(raw.enemies)) return null;
  const s = createGame({ seed: raw.seed ?? 1337, noSpawn: !!(raw.opts && raw.opts.noSpawn) });
  s.rngState = (raw.rngState ?? s.seed) >>> 0;
  s.phase = raw.phase === 'levelup' ? 'levelup' : 'playing';
  s.time = Number(raw.time) || 0;
  s.frame = Number(raw.frame) || 0;
  s.endless = !!raw.endless;
  s.won = !!raw.won;
  s.nextId = Number(raw.nextId) || 1;
  s.wave = Number(raw.wave) || 1;

  s.player = {
    ...s.player,
    ...raw.player,
    weapons: raw.player.weapons ? JSON.parse(JSON.stringify(raw.player.weapons)) : { smart_pistol: { level: 1, cd: 0.3, side: 0 } },
    passives: raw.player.passives ? { ...raw.player.passives } : {},
  };
  s.chrono = { active: false, t: 0, cd: 0, ...(raw.chrono || {}) };

  s.enemies = raw.enemies.map((e) => ({ ...e, isBoss: e.type === 'boss' || !!e.isBoss, dead: false }));
  const enemyById = new Map(s.enemies.map((e) => [e.id, e]));
  s.bullets = Array.isArray(raw.bullets)
    ? raw.bullets.map((b) => {
        const copy = { ...b };
        copy.target = b.targetId != null ? (enemyById.get(b.targetId) || null) : null;
        delete copy.targetId;
        return copy;
      })
    : [];
  s.eshots = Array.isArray(raw.eshots) ? raw.eshots.map((b) => ({ ...b })) : [];
  s.pickups = Array.isArray(raw.pickups) ? raw.pickups.map((p) => ({ ...p })) : [];

  s.orbAngle = Number(raw.orbAngle) || 0;
  s.spawnT = Number(raw.spawnT) || 0.5;
  s.nextEliteAt = Number(raw.nextEliteAt) || 50;
  s.nextBossAt = Number(raw.nextBossAt) || 90;
  s.bossesSpawned = Number(raw.bossesSpawned) || 0;
  s.bossesKilled = Number(raw.bossesKilled) || 0;
  s.kills = Number(raw.kills) || 0;
  s.score = Number(raw.score) || 0;
  s.eddies = Number(raw.eddies) || 0;
  s.totalXp = Number(raw.totalXp) || 0;
  s.scoreAcc = Number(raw.scoreAcc) || 0;
  s.pendingLevels = Number(raw.pendingLevels) || 0;
  s.draft = Array.isArray(raw.draft) ? raw.draft.map((d) => ({ ...d })) : null;
  s.stats = { damageTaken: 0, damageDealt: 0, ...(raw.stats || {}) };
  s.recordedTotals = raw.recordedTotals && typeof raw.recordedTotals === 'object'
    ? {
        eddies: Number(raw.recordedTotals.eddies) || 0,
        xp: Number(raw.recordedTotals.xp) || 0,
        wonRecorded: !!raw.recordedTotals.wonRecorded,
      }
    : { eddies: 0, xp: 0, wonRecorded: false };
  s.events = [];
  s.grid = new Map();
  recomputeStats(s);
  return s;
}

// ---------------------------------------------------------------------------
// Controller state (browser runtime)
// ---------------------------------------------------------------------------
function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function makeSnapshot(s) {
  if (!s || (s.phase !== 'playing' && s.phase !== 'levelup')) return null;
  const label = `LV ${s.player.level} · ${formatTime(s.time)} · ${s.score.toLocaleString('en-US')}`;
  return { label, state: serializeState(s) };
}

function boot() {
  const cv = $('cv');
  if (!cv) return;

  const renderer = new Renderer(cv);
  const synth = new Synth();

  let game = null;
  let paused = false;
  let autoPaused = false;
  let endlessStart = false;
  let dilateQueued = false;
  let recordedTotals = { eddies: 0, xp: 0, wonRecorded: false };
  let runRecorded = false;
  let lastLoadoutSig = '';
  let lastDraftSig = '';
  let bannerTimeout = 0;
  let lastFrame = performance.now();
  let accum = 0;

  const keys = new Set();
  const joy = { active: false, id: null, pointerId: null, ox: 0, oy: 0, cx: 0, cy: 0, maxR: 58, mx: 0, my: 0 };

  // ---------- Hub SDK Chrome ----------
  let initChrome = { lang: 'en', muted: false };
  try {
    initChrome = initGameChrome({
      gameId: GAME_ID,
      onLangChange: (l) => applyLanguage(l, false),
      onMuteChange: (m) => applyMute(m, false),
    }) || initChrome;
    markLaunched('icebreaker');
  } catch (e) { /* Hub SDK optional */ }

  // ---------- Helpers ----------
  function showBanner(text, variant = '', ms = 2600) {
    const el = $('banner');
    el.textContent = text;
    el.className = `banner cyber-clip-sm${variant ? ' ' + variant : ''}`;
    el.hidden = false;
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => { el.hidden = true; }, ms);
  }

  function refreshStartMenu() {
    let best = 0;
    try {
      const prof = getProfile();
      best = (prof && prof.scores && prof.scores[GAME_ID]) || 0;
    } catch (e) { /* ignore */ }
    $('menuBestScore').textContent = best.toLocaleString('en-US');

    let saved = null;
    try { saved = loadMidRun(GAME_ID); } catch (e) { saved = null; }
    const btn = $('btnResumeSaved');
    if (saved && saved.state && saved.state.player) {
      btn.hidden = false;
      $('resumeSavedMeta').textContent = saved.label || `LV ${saved.state.player.level} · ${formatTime(saved.state.time || 0)}`;
    } else {
      btn.hidden = true;
    }
  }

  function applyLanguage(l, syncHub = true) {
    const lang = setLang(l);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = `${t('title')} // ${t('subtitle')}`;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    $('btnLang').textContent = t('langToggle');
    $('btnMuteLbl').textContent = synth.muted ? t('unmute') : t('mute');
    $('btnPauseLbl').textContent = paused ? t('resume') : t('pause');
    $('endlessState').textContent = endlessStart ? t('on') : t('off');
    if (syncHub) {
      try { setHubLang(lang); } catch (e) { /* ignore */ }
    }
    if (game) {
      lastLoadoutSig = '';
      lastDraftSig = '';
      updateHud();
      if (game.phase === 'levelup') renderDraftModal();
      if (game.phase === 'victory' || game.phase === 'dead') renderEndModal(null);
    }
  }

  function applyMute(muted, syncHub = true) {
    synth.setMuted(!!muted);
    $('btnMute').classList.toggle('active', synth.muted);
    $('btnMuteLbl').textContent = synth.muted ? t('unmute') : t('mute');
    if (syncHub) {
      try { setHubMuted(synth.muted); } catch (e) { /* ignore */ }
    }
  }

  // ---------- Run Lifecycle ----------
  function hideAllModals() {
    $('startModal').hidden = true;
    $('draftModal').hidden = true;
    $('pauseModal').hidden = true;
    $('endModal').hidden = true;
  }

  function startNewRun() {
    synth.unlock();
    synth.click();
    try { clearMidRun(GAME_ID); } catch (e) { /* ignore */ }

    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    game = createGame({ seed });
    if (endlessStart) game.endless = true;

    paused = false;
    autoPaused = false;
    dilateQueued = false;
    runRecorded = false;
    recordedTotals = { eddies: 0, xp: 0, wonRecorded: false };
    game.recordedTotals = { ...recordedTotals };
    lastLoadoutSig = '';
    lastDraftSig = '';
    keys.clear();
    joy.active = false;
    joy.id = null;
    joy.pointerId = null;
    joy.mx = 0;
    joy.my = 0;

    renderer.reset(game);
    hideAllModals();
    $('btnPause').disabled = false;
    $('btnPause').classList.remove('active');
    $('btnPauseLbl').textContent = t('pause');
    if (game.endless) showBanner(t('endlessOn'), 'cyan', 2800);
    updateHud();
    lastFrame = performance.now();
    accum = 0;
  }

  function resumeSavedRun() {
    synth.unlock();
    synth.click();
    let saved = null;
    try { saved = loadMidRun(GAME_ID); } catch (e) { saved = null; }
    const restored = saved ? deserializeState(saved.state) : null;
    if (!restored) {
      startNewRun();
      return;
    }

    game = restored;
    paused = false;
    autoPaused = false;
    dilateQueued = false;
    runRecorded = false;
    recordedTotals = game.recordedTotals
      ? {
          eddies: Number(game.recordedTotals.eddies) || 0,
          xp: Number(game.recordedTotals.xp) || 0,
          wonRecorded: !!game.recordedTotals.wonRecorded,
        }
      : { eddies: 0, xp: 0, wonRecorded: false };
    game.recordedTotals = { ...recordedTotals };
    lastLoadoutSig = '';
    lastDraftSig = '';
    keys.clear();
    joy.active = false;
    joy.id = null;
    joy.pointerId = null;
    joy.mx = 0;
    joy.my = 0;

    renderer.reset(game);
    hideAllModals();
    $('btnPause').disabled = false;
    $('btnPause').classList.remove('active');
    $('btnPauseLbl').textContent = t('pause');

    if (game.phase === 'levelup' && game.draft) {
      renderDraftModal();
    }
    updateHud();
    lastFrame = performance.now();
    accum = 0;
  }

  function setPausedState(nextPaused, isAuto = false) {
    if (!game) return;
    if (game.phase === 'victory' || game.phase === 'dead') return;
    if (nextPaused && game.phase === 'levelup') {
      // Simulation is already frozen during Ripperdoc Draft; checkpoint without obscuring cards.
      try { const snap = makeSnapshot(game); if (snap) saveMidRun(GAME_ID, snap); } catch (e) { /* ignore */ }
      return;
    }

    paused = !!nextPaused;
    autoPaused = paused && !!isAuto;
    keys.clear();
    joy.active = false;
    joy.mx = 0;
    joy.my = 0;

    $('btnPause').classList.toggle('active', paused);
    $('btnPauseLbl').textContent = paused ? t('resume') : t('pause');

    if (paused) {
      $('autoPauseTag').hidden = !autoPaused;
      $('pauseLvl').textContent = String(game.player.level);
      $('pauseTime').textContent = formatTime(game.time);
      $('pauseKills').textContent = game.kills.toLocaleString('en-US');
      $('pauseScore').textContent = game.score.toLocaleString('en-US');
      $('pauseModal').hidden = false;
    } else {
      $('pauseModal').hidden = true;
      lastFrame = performance.now();
      accum = 0;
    }
  }

  function saveAndExitToHub() {
    synth.click();
    if (game && (game.phase === 'playing' || game.phase === 'levelup')) {
      try {
        const snap = makeSnapshot(game);
        if (snap) saveMidRun(GAME_ID, snap);
      } catch (e) { /* ignore */ }
    }
    window.location.href = '../';
  }

  // ---------- Ripperdoc Draft Modal ----------
  function upgradeDisplay(opt) {
    if (opt.kind === 'weapon') {
      const def = WEAPONS[opt.id];
      return {
        icon: def ? def.icon : '⌖',
        color: def ? def.color : '#00f0ff',
        name: t(`w_${opt.id}`),
        desc: t(`d_${opt.id}`),
        tag: opt.isNew ? t('newTag') : (opt.level >= MAX_ITEM_LEVEL ? `${t('lvTag', { n: opt.level })} · ${t('maxTag')}` : t('lvTag', { n: opt.level })),
        isNew: !!opt.isNew,
      };
    }
    if (opt.kind === 'passive') {
      const def = PASSIVES[opt.id];
      return {
        icon: def ? def.icon : '◈',
        color: def ? def.color : '#2bff88',
        name: t(`p_${opt.id}`),
        desc: t(`pd_${opt.id}`),
        tag: opt.isNew ? t('newTag') : (opt.level >= MAX_ITEM_LEVEL ? `${t('lvTag', { n: opt.level })} · ${t('maxTag')}` : t('lvTag', { n: opt.level })),
        isNew: !!opt.isNew,
      };
    }
    if (opt.kind === 'heal') {
      return { icon: '✚', color: '#00ff9f', name: t('x_heal'), desc: t('xd_heal'), tag: '+40 HP', isNew: false };
    }
    return { icon: '€$', color: '#fcee09', name: t('x_cash'), desc: t('xd_cash'), tag: '+25 €$', isNew: false };
  }

  function renderDraftModal() {
    if (!game || game.phase !== 'levelup' || !game.draft) return;
    const sig = `${getLang()}|${game.player.level}|${game.pendingLevels}|${game.draft.map((d) => `${d.kind}:${d.id}:${d.level}`).join(',')}`;
    if (sig === lastDraftSig && !$('draftModal').hidden) return;
    lastDraftSig = sig;

    $('draftLvlBadge').textContent = `${t('lvl')} ${game.player.level}`;
    const pend = $('draftPendingBadge');
    if (game.pendingLevels > 1) {
      pend.textContent = t('pendingDrafts', { n: game.pendingLevels - 1 });
      pend.hidden = false;
    } else {
      pend.hidden = true;
    }

    const wrap = $('draftCards');
    wrap.textContent = '';

    game.draft.forEach((opt, idx) => {
      const info = upgradeDisplay(opt);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'draft-card cyber-clip-sm';
      card.dataset.rarity = opt.rarity || 'common';
      card.style.setProperty('--item-c', info.color);

      const top = document.createElement('div');
      top.className = 'card-top';
      const rSpan = document.createElement('span');
      rSpan.className = 'card-rarity';
      rSpan.textContent = t(`rarity_${opt.rarity || 'common'}`);
      const hk = document.createElement('span');
      hk.className = 'card-hk';
      hk.textContent = String(idx + 1);
      top.append(rSpan, hk);

      const mid = document.createElement('div');
      mid.className = 'card-ico-row';
      const ico = document.createElement('div');
      ico.className = 'card-ico cyber-clip-sm';
      ico.textContent = info.icon;
      const tw = document.createElement('div');
      tw.className = 'card-title-wrap';
      const nm = document.createElement('h3');
      nm.className = 'card-name';
      nm.textContent = info.name;
      const pill = document.createElement('span');
      pill.className = `card-lvl-pill${info.isNew ? ' new' : ''}`;
      pill.textContent = info.tag;
      tw.append(nm, pill);
      mid.append(ico, tw);

      const desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = info.desc;

      card.append(top, mid, desc);
      card.addEventListener('click', () => pickDraftOption(idx));
      wrap.appendChild(card);
    });

    $('pauseModal').hidden = true;
    $('draftModal').hidden = false;
  }

  function pickDraftOption(idx) {
    if (!game || game.phase !== 'levelup') return;
    synth.unlock();
    if (!chooseUpgrade(game, idx)) return;
    processEvents(drainEvents(game));
    lastLoadoutSig = '';
    lastDraftSig = '';
    updateHud();

    if (game.phase === 'levelup' && game.draft) {
      renderDraftModal();
    } else {
      $('draftModal').hidden = true;
      lastFrame = performance.now();
      accum = 0;
    }
  }

  // ---------- End of Run (Victory / Defeat) ----------
  let lastRunResult = null;

  function handleRunEnd() {
    if (!game || runRecorded) return;
    runRecorded = true;
    keys.clear();
    joy.active = false;
    joy.id = null;
    joy.pointerId = null;
    joy.mx = 0;
    joy.my = 0;
    $('btnPause').disabled = true;
    $('draftModal').hidden = true;
    $('pauseModal').hidden = true;

    const sum = runSummary(game);
    const deltaEddies = Math.max(0, sum.eddies - (recordedTotals.eddies || 0));
    const deltaXp = Math.max(0, sum.xp - (recordedTotals.xp || 0));
    const shouldRecordWin = !!(sum.won && !recordedTotals.wonRecorded);
    recordedTotals.eddies = sum.eddies;
    recordedTotals.xp = sum.xp;
    if (sum.won) recordedTotals.wonRecorded = true;
    game.recordedTotals = { ...recordedTotals };

    let sdkRes = null;
    try {
      sdkRes = recordRun(GAME_ID, {
        score: sum.score,
        eddies: deltaEddies,
        xp: deltaXp,
        won: shouldRecordWin,
        wave: sum.wave,
        badges: sum.badges,
      });
    } catch (e) { /* Hub SDK optional */ }
    try { clearMidRun(GAME_ID); } catch (e) { /* ignore */ }

    lastRunResult = { sum, sdkRes };
    renderEndModal(lastRunResult);
  }

  function renderEndModal(cached) {
    const data = cached || lastRunResult;
    if (!data || !game) return;
    const { sum, sdkRes } = data;
    const isVictory = game.phase === 'victory';

    const panel = $('endPanel');
    panel.classList.toggle('victory', isVictory);
    panel.classList.toggle('defeat', !isVictory);

    $('endTitle').textContent = isVictory ? t('victory') : t('defeat');
    $('endSub').textContent = isVictory ? t('victorySub') : t('defeatSub');
    $('endNewBest').hidden = !(sdkRes && sdkRes.isNewBest);

    $('endScore').textContent = sum.score.toLocaleString('en-US');
    $('endTime').textContent = formatTime(sum.time);
    $('endKills').textContent = sum.kills.toLocaleString('en-US');
    $('endBosses').textContent = String(sum.bossesKilled);
    $('endLevel').textContent = String(sum.level);
    $('endWave').textContent = `${sum.wave}${sum.endless ? '∞' : ''}`;
    $('endEddies').textContent = `+${sum.eddies.toLocaleString('en-US')} €\$`;
    $('endXp').textContent = `+${sum.xp.toLocaleString('en-US')} XP`;

    const badgesWrap = $('endBadgesWrap');
    const badgesEl = $('endBadges');
    badgesEl.textContent = '';
    if (sum.badges && sum.badges.length) {
      for (const b of sum.badges) {
        const chip = document.createElement('span');
        chip.className = 'badge-chip cyber-clip-sm';
        chip.textContent = `★ ${t(`b_${b}`)}`;
        badgesEl.appendChild(chip);
      }
      badgesWrap.hidden = false;
    } else {
      badgesWrap.hidden = true;
    }

    $('btnContinueEndless').hidden = !(isVictory && !game.endless);
    $('endModal').hidden = false;
  }

  function onContinueEndless() {
    if (!game || game.phase !== 'victory') return;
    synth.unlock();
    synth.click();
    if (!continueEndless(game)) return;
    recordedTotals.wonRecorded = true;
    game.recordedTotals = { ...recordedTotals };
    runRecorded = false;
    $('endModal').hidden = true;
    $('btnPause').disabled = false;
    processEvents(drainEvents(game));
    updateHud();
    if (game.phase === 'levelup') renderDraftModal();
    lastFrame = performance.now();
    accum = 0;
  }

  // ---------- Event Processing (Audio + VFX + Banners) ----------
  function processEvents(events) {
    if (!events || !events.length) return;
    renderer.ingestEvents(events);
    for (const ev of events) {
      switch (ev.type) {
        case 'shoot':
          if (ev.weapon === 'swarm') synth.swarm();
          else synth.pew();
          break;
        case 'rail': synth.rail(); break;
        case 'whip': synth.slice(); break;
        case 'nova': synth.nova(); break;
        case 'boom': synth.boom(); break;
        case 'blade': synth.blade(); break;
        case 'hit': synth.hit(); break;
        case 'kill': synth.kill(); break;
        case 'xp': synth.xp(); break;
        case 'eddy': synth.eddy(); break;
        case 'heal': synth.eddy(); break;
        case 'chest': synth.levelup(); break;
        case 'levelup': synth.levelup(); break;
        case 'upgrade': synth.pick(); break;
        case 'chrono_on': synth.chronoOn(); break;
        case 'chrono_off': synth.chronoOff(); break;
        case 'burst': synth.burst(); break;
        case 'hurt': synth.hurt(); break;
        case 'boss':
          synth.alarm();
          showBanner(t('bossIncoming'), 'danger', 3400);
          break;
        case 'elite':
          synth.alarm();
          showBanner(t('eliteIncoming'), 'cyan', 2600);
          break;
        case 'endless':
          showBanner(t('endlessOn'), 'cyan', 3000);
          break;
        case 'victory':
          synth.victory();
          break;
        case 'defeat':
          synth.defeat();
          break;
      }
    }
  }

  // ---------- HUD & Loadout Rendering ----------
  function updateLoadoutStrip() {
    if (!game) return;
    const p = game.player;
    const sig = `${getLang()}|${WEAPON_IDS.map((id) => p.weapons[id]?.level || 0).join(',')}|${PASSIVE_IDS.map((id) => p.passives[id] || 0).join(',')}`;
    if (sig === lastLoadoutSig) return;
    lastLoadoutSig = sig;

    const wRow = $('weaponsRow');
    const pRow = $('passivesRow');
    wRow.textContent = '';
    pRow.textContent = '';

    for (const id of WEAPON_IDS) {
      const w = p.weapons[id];
      if (!w) continue;
      const def = WEAPONS[id];
      const slot = document.createElement('div');
      slot.className = `slot cyber-clip-sm${w.level >= MAX_ITEM_LEVEL ? ' maxed' : ''}`;
      slot.style.setProperty('--slot-c', def.color);
      slot.title = `${t(`w_${id}`)} (${t('lvTag', { n: w.level })})`;

      const ico = document.createElement('span');
      ico.className = 'slot-ico';
      ico.textContent = def.icon;

      const meta = document.createElement('div');
      meta.className = 'slot-meta';
      const lv = document.createElement('span');
      lv.className = 'slot-lv';
      lv.textContent = w.level >= MAX_ITEM_LEVEL ? t('maxTag') : `L${w.level}`;

      const pips = document.createElement('div');
      pips.className = 'slot-pips';
      for (let i = 1; i <= MAX_ITEM_LEVEL; i++) {
        const pip = document.createElement('span');
        pip.className = `pip${i <= w.level ? ' on' : ''}`;
        pips.appendChild(pip);
      }
      meta.append(lv, pips);
      slot.append(ico, meta);
      wRow.appendChild(slot);
    }

    for (const id of PASSIVE_IDS) {
      const lvNum = p.passives[id] || 0;
      if (!lvNum) continue;
      const def = PASSIVES[id];
      const slot = document.createElement('div');
      slot.className = `slot passive cyber-clip-sm${lvNum >= MAX_ITEM_LEVEL ? ' maxed' : ''}`;
      slot.style.setProperty('--slot-c', def.color);
      slot.title = `${t(`p_${id}`)} (${t('lvTag', { n: lvNum })})`;

      const ico = document.createElement('span');
      ico.className = 'slot-ico';
      ico.textContent = def.icon;
      const lv = document.createElement('span');
      lv.className = 'slot-lv';
      lv.textContent = `L${lvNum}`;

      slot.append(ico, lv);
      pRow.appendChild(slot);
    }
  }

  function updateHud() {
    if (!game) return;
    const p = game.player;

    // Wave pill
    const waveEl = $('hudWave');
    waveEl.textContent = game.endless ? `W${game.wave} ∞` : `W${game.wave}`;
    waveEl.classList.toggle('endless', game.endless);

    // HP bar
    const hpPct = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
    $('hudHpText').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    $('hudHpFill').style.width = `${hpPct.toFixed(1)}%`;
    const hpMeter = $('hudHpFill').closest('.hp-meter');
    hpMeter.classList.toggle('warn', hpPct <= 55 && hpPct > 25);
    hpMeter.classList.toggle('crit', hpPct <= 25);

    // Level & XP bar
    const xpPct = Math.max(0, Math.min(100, (p.xp / Math.max(1, p.xpNext)) * 100));
    $('hudLvl').textContent = String(p.level);
    $('hudXpText').textContent = `${Math.floor(p.xp)}/${p.xpNext}`;
    $('hudXpFill').style.width = `${xpPct.toFixed(1)}%`;

    // Counters
    $('hudKills').textContent = game.kills.toLocaleString('en-US');
    $('hudTime').textContent = formatTime(game.time);
    $('hudScore').textContent = game.score.toLocaleString('en-US');
    $('hudEddies').textContent = game.eddies.toLocaleString('en-US');

    // Boss bar
    const boss = activeBoss(game);
    const bossBar = $('bossBar');
    if (boss) {
      const bPct = Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.maxHp)) * 100));
      const enraged = boss.hp < boss.maxHp * 0.5;
      bossBar.hidden = false;
      bossBar.classList.toggle('enraged', enraged);
      $('bossName').textContent = t('bossName', { n: (boss.index ?? 0) + 1 });
      $('bossEnraged').hidden = !enraged;
      $('bossHpText').textContent = `${Math.ceil(boss.hp).toLocaleString('en-US')} / ${boss.maxHp.toLocaleString('en-US')}`;
      $('bossHpFill').style.width = `${bPct.toFixed(1)}%`;
    } else {
      bossBar.hidden = true;
    }

    // Sandevistan button + circular SVG ring + charge bar
    const c = game.chrono;
    const cBtn = $('chronoBtn');
    const cRing = $('chronoRing');
    const cFill = $('chronoBarFill');
    const cStat = $('chronoStatus');
    let frac = 1;
    if (c.active) {
      frac = Math.max(0, Math.min(1, c.t / CHRONO_DURATION));
      cBtn.className = 'chrono-btn cyber-clip active';
      cStat.textContent = `${t('active')} · ${c.t.toFixed(1)}s`;
    } else if (c.cd > 0) {
      const maxCd = Math.max(0.1, CHRONO_COOLDOWN * p.cdMul);
      frac = Math.max(0, Math.min(1, 1 - c.cd / maxCd));
      cBtn.className = 'chrono-btn cyber-clip cooling';
      cStat.textContent = `${c.cd.toFixed(1)}s`;
    } else {
      frac = 1;
      cBtn.className = 'chrono-btn cyber-clip ready';
      cStat.textContent = t('ready');
    }
    cRing.style.strokeDashoffset = (RING_CIRC * (1 - frac)).toFixed(2);
    cFill.style.width = `${(frac * 100).toFixed(1)}%`;

    updateLoadoutStrip();
  }

  // ---------- Input Sampling ----------
  function sampleInput() {
    let mx = 0;
    let my = 0;
    if (keys.has('arrowleft') || keys.has('a')) mx -= 1;
    if (keys.has('arrowright') || keys.has('d')) mx += 1;
    if (keys.has('arrowup') || keys.has('w')) my -= 1;
    if (keys.has('arrowdown') || keys.has('s')) my += 1;

    if (mx === 0 && my === 0 && joy.active) {
      mx = joy.mx;
      my = joy.my;
    }

    const inp = { mx, my, dilate: dilateQueued };
    dilateQueued = false;
    return inp;
  }

  // ---------- Main Animation Loop ----------
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;

    if (game && !paused && game.phase === 'playing') {
      accum += dt;
      while (accum >= FIXED_DT) {
        step(game, FIXED_DT, sampleInput());
        accum -= FIXED_DT;
        processEvents(drainEvents(game));

        if (game.phase === 'levelup') {
          joy.active = false;
          joy.id = null;
          joy.pointerId = null;
          joy.mx = 0;
          joy.my = 0;
          renderDraftModal();
          accum = 0;
          break;
        }
        if (game.phase === 'victory' || game.phase === 'dead') {
          handleRunEnd();
          accum = 0;
          break;
        }
      }
      updateHud();
    }

    const vfxDt = (!game || (!paused && game.phase === 'playing')) ? dt : 0;
    renderer.draw(game, vfxDt, joy);
  }

  // ---------- Pointer / Touch Virtual Joystick ----------
  function updateJoy(clientX, clientY) {
    const rect = cv.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - joy.ox;
    const dy = y - joy.oy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, joy.maxR);
    const ang = Math.atan2(dy, dx);
    joy.cx = joy.ox + Math.cos(ang) * clamped;
    joy.cy = joy.oy + Math.sin(ang) * clamped;
    if (dist > 6) {
      const mag = Math.min(1, dist / (joy.maxR * 0.72));
      joy.mx = Math.cos(ang) * mag;
      joy.my = Math.sin(ang) * mag;
    } else {
      joy.mx = 0;
      joy.my = 0;
    }
  }

  cv.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    if (!game || paused || game.phase !== 'playing') return;
    synth.unlock();
    const rect = cv.getBoundingClientRect();
    joy.active = true;
    joy.id = e.pointerId;
    joy.pointerId = e.pointerId;
    joy.ox = e.clientX - rect.left;
    joy.oy = e.clientY - rect.top;
    joy.cx = joy.ox;
    joy.cy = joy.oy;
    joy.mx = 0;
    joy.my = 0;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  cv.addEventListener('pointermove', (e) => {
    if (!joy.active || e.pointerId !== joy.pointerId) return;
    updateJoy(e.clientX, e.clientY);
  });

  function releaseJoy(e) {
    if (!joy.active || (e && e.pointerId !== joy.pointerId)) return;
    joy.active = false;
    joy.id = null;
    joy.pointerId = null;
    joy.mx = 0;
    joy.my = 0;
  }
  cv.addEventListener('pointerup', releaseJoy);
  cv.addEventListener('pointercancel', releaseJoy);
  cv.addEventListener('lostpointercapture', releaseJoy);

  // ---------- Keyboard Controls ----------
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();

    if (k === 'm') {
      synth.unlock();
      applyMute(!synth.muted, true);
      return;
    }

    if (game && game.phase === 'levelup') {
      if (k === '1' || k === '2' || k === '3') {
        e.preventDefault();
        pickDraftOption(Number(k) - 1);
      }
      return;
    }

    if (k === 'p' || k === 'escape') {
      if (game && game.phase === 'playing') {
        e.preventDefault();
        synth.click();
        setPausedState(!paused, false);
      }
      return;
    }

    if (e.code === 'Space' || k === ' ') {
      if (game && !paused && game.phase === 'playing') {
        e.preventDefault();
        synth.unlock();
        dilateQueued = true;
      }
      return;
    }

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      if (game && !paused && game.phase === 'playing') e.preventDefault();
      keys.add(k);
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
  });

  // ---------- Button Wiring ----------
  $('btnStart').addEventListener('click', startNewRun);
  $('btnResumeSaved').addEventListener('click', resumeSavedRun);

  $('btnEndlessToggle').addEventListener('click', () => {
    synth.unlock();
    synth.click();
    endlessStart = !endlessStart;
    $('btnEndlessToggle').setAttribute('aria-pressed', String(endlessStart));
    $('endlessState').textContent = endlessStart ? t('on') : t('off');
  });

  $('chronoBtn').addEventListener('click', () => {
    if (!game || paused || game.phase !== 'playing') return;
    synth.unlock();
    dilateQueued = true;
  });

  $('btnMute').addEventListener('click', () => {
    synth.unlock();
    applyMute(!synth.muted, true);
  });

  $('btnPause').addEventListener('click', () => {
    if (!game || game.phase !== 'playing') return;
    synth.unlock();
    synth.click();
    setPausedState(!paused, false);
  });

  $('btnLang').addEventListener('click', () => {
    synth.unlock();
    synth.click();
    applyLanguage(getLang() === 'en' ? 'he' : 'en', true);
  });

  $('btnResume').addEventListener('click', () => {
    synth.unlock();
    synth.click();
    setPausedState(false, false);
  });

  $('btnSaveExit').addEventListener('click', saveAndExitToHub);
  $('btnPauseRestart').addEventListener('click', startNewRun);
  $('btnPlayAgain').addEventListener('click', startNewRun);
  $('btnContinueEndless').addEventListener('click', onContinueEndless);

  window.addEventListener('resize', () => renderer.resize());

  // ---------- Auto-Pause & Mid-Run Checkpoint Protection ----------
  try {
    installAutoPause({
      gameId: GAME_ID,
      isRunning: () => !!game && (game.phase === 'playing' || game.phase === 'levelup'),
      isPaused: () => paused,
      setPaused: (v) => setPausedState(v, true),
      getSnapshot: () => makeSnapshot(game),
      getLang: () => getLang(),
      onAutoPaused: () => {
        if (game && game.phase === 'playing') {
          autoPaused = true;
          $('autoPauseTag').hidden = false;
        }
      },
    });
  } catch (e) { /* Hub SDK optional */ }

  // ---------- Initial Setup ----------
  applyMute(!!initChrome.muted, false);
  applyLanguage(initChrome.lang || 'en', false);
  refreshStartMenu();
  renderer.resize();
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') {
  boot();
}
