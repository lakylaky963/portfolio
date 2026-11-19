// Live backdrop: a rainy neon megacity at night, drawn procedurally (no image assets).
// Layers (back to front): smog sky + searchlights, far towers, flyers, mid towers + signs + holo boards,
// elevated highway traffic, near flyers, near towers + signs, rain, fog/vignette.
// Static geometry is baked into offscreen canvases; only lights, signs, traffic and rain animate.
export function startBackground(canvas) {
  const ctx = canvas.getContext('2d');
  const mq = (q) => globalThis.matchMedia && matchMedia(q).matches;
  const reduce = mq('(prefers-reduced-motion: reduce)');
  let small = mq('(max-width: 720px)');
  let w = 0, h = 0, dpr = 1, raf = 0, running = true, last = 0, lastDraw = 0;
  let accent = '#fcee09', accent2 = '#00f0ff';
  const RED = '#ff003c', PINK = '#ff2bd6', AMBER = '#ffb340';
  const M = 48; // horizontal parallax margin
  const DROP = 70; // extra layer height for scroll parallax

  let sky, overlay, layers = [], signs = [], boards = [], blinkers = [], flyers = [], cars = [], beams = [], rain = [];
  let road = null;
  let px = 0, py = 0, tx = 0, scrollT = 0;

  const css = () => getComputedStyle(document.documentElement);
  function readColors() {
    const s = css();
    accent = s.getPropertyValue('--accent').trim() || accent;
    accent2 = s.getPropertyValue('--accent-2').trim() || accent2;
  }
  const palette = () => [accent, accent2, RED, PINK, accent2, AMBER];

  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const mk = (cw, ch) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(cw * dpr)); c.height = Math.max(1, Math.round(ch * dpr)); const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, x]; };

  // ---------- Sky ----------
  function buildSky() {
    const [c, x] = mk(w, h);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#030409'); g.addColorStop(0.45, '#0a0918'); g.addColorStop(0.75, '#1c0c24'); g.addColorStop(1, '#2a0d1c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // Smog glow from the city below, tinted by the theme.
    const glow = x.createRadialGradient(w * 0.5, h * 1.05, 0, w * 0.5, h * 1.05, Math.max(w, h) * 0.9);
    glow.addColorStop(0, hexA(RED, 0.42)); glow.addColorStop(0.35, hexA(accent, 0.16)); glow.addColorStop(1, 'transparent');
    x.fillStyle = glow; x.fillRect(0, 0, w, h);
    // Warm haze band behind the skyline so towers read as silhouettes.
    const band = x.createLinearGradient(0, h * 0.25, 0, h * 0.85);
    band.addColorStop(0, 'transparent'); band.addColorStop(0.55, hexA('#ff5a2a', 0.16)); band.addColorStop(0.8, hexA(PINK, 0.12)); band.addColorStop(1, 'transparent');
    x.fillStyle = band; x.fillRect(0, 0, w, h);
    // Low clouds catching neon light.
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const cx = rnd() * w, cy = h * (0.08 + rnd() * 0.42), r = 80 + rnd() * 260;
      const cg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      cg.addColorStop(0, hexA(i % 3 ? '#3a1640' : '#103040', 0.18 * rnd() + 0.05)); cg.addColorStop(1, 'transparent');
      x.fillStyle = cg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    x.globalCompositeOperation = 'source-over';
    sky = c;
  }

  // ---------- Towers ----------
  const LAYER_DEF = [
    { par: 0.25, fill: '#140f26', haze: '#3a1a46', hazeA: 0.75, wMin: 26, wMax: 80, hMin: 0.35, hMax: 0.85, gap: 2, win: 1.4, winA: 0.32, density: 0.42 },
    { par: 0.55, fill: '#0a0915', haze: '#2a0f2c', hazeA: 0.45, wMin: 44, wMax: 130, hMin: 0.28, hMax: 0.7, gap: 10, win: 2, winA: 0.5, density: 0.36 },
    { par: 1.0, fill: '#040409', haze: '#1a0812', hazeA: 0.25, wMin: 80, wMax: 200, hMin: 0.35, hMax: 0.95, gap: 90, win: 3, winA: 0.62, density: 0.3 },
  ];

  function buildLayer(i) {
    const d = LAYER_DEF[i];
    const lw = w + M * 2, lh = h + DROP;
    const [c, x] = mk(lw, lh);
    const base = lh;
    let bx = -20;
    const pal = palette();
    while (bx < lw + 20) {
      const bw = d.wMin + rnd() * (d.wMax - d.wMin);
      const bh = h * (d.hMin + rnd() * rnd() * (d.hMax - d.hMin)) + DROP;
      const top = base - bh;
      // Body with a slightly lighter edge to read as a 3D slab.
      x.fillStyle = d.fill; x.fillRect(bx, top, bw, bh);
      x.fillStyle = 'rgba(255,255,255,0.025)'; x.fillRect(bx, top, Math.max(2, bw * 0.08), bh);
      // Stepped crowns / antennas on far and mid layers.
      if (rnd() < 0.45) { const cw = bw * (0.3 + rnd() * 0.4), ch = 8 + rnd() * 30; x.fillStyle = d.fill; x.fillRect(bx + (bw - cw) / 2, top - ch, cw, ch); }
      if (i < 2 && rnd() < 0.35) {
        const ah = 20 + rnd() * 60, ax = bx + bw * (0.3 + rnd() * 0.4);
        x.fillRect(ax, top - ah, 2, ah);
        blinkers.push({ layer: i, x: ax + 1, y: top - ah, ph: rnd() * 6, sp: 0.7 + rnd() * 0.8 });
      }
      // Windows.
      const ww = d.win, wh = d.win * (i === 2 ? 0.7 : 1);
      const cols = Math.floor((bw - 6) / (ww * 3)), rows = Math.floor((bh - DROP * 0.2) / (wh * 3.2));
      const tint = rnd() < 0.5 ? '#ffc58a' : rnd() < 0.6 ? '#8fdcff' : '#ff9ad5';
      if (rnd() < 0.3) { // lit floor bands, megabuilding style
        const step = 6 + Math.floor(rnd() * 6);
        for (let r = 0; r < rows; r += step) { x.fillStyle = hexA(tint, d.winA * (0.25 + rnd() * 0.35)); x.fillRect(bx + 3, top + 8 + r * wh * 3.2, bw - 6, Math.max(1, wh)); }
      } else
      for (let r = 0; r < rows; r++) {
        if (rnd() < 0.15) continue; // dark floor
        for (let k = 0; k < cols; k++) {
          if (rnd() > d.density) continue;
          x.fillStyle = hexA(rnd() < 0.85 ? tint : pick(pal), d.winA * (0.4 + rnd() * 0.6));
          x.fillRect(bx + 4 + k * ww * 3, top + 8 + r * wh * 3.2, ww, wh);
        }
      }
      // Neon edge strips (baked glow).
      if (i >= 1 && rnd() < 0.3) {
        const col = pick(pal), sx = rnd() < 0.5 ? bx + 1 : bx + bw - 3, sh = bh * (0.2 + rnd() * 0.5), sy = top + rnd() * bh * 0.3;
        x.save(); x.shadowColor = col; x.shadowBlur = 14; x.fillStyle = col; x.fillRect(sx, sy, 2, sh); x.restore();
      }
      // Signs and billboards anchored to this building.
      if (i >= 1 && bw > 50) {
        if (rnd() < (i === 2 ? 0.65 : 0.4)) addSign(i, bx, top, bw, bh);
        if (rnd() < (i === 2 ? 0.22 : 0.18)) addBoard(i, bx, top, bw, bh);
      }
      bx += bw + d.gap * (0.4 + rnd());
    }
    if (i === 0) for (const fx of [0.28, 0.7]) megaTower(x, lw * fx + (rnd() - 0.5) * 80, base);
    // Atmospheric haze: thicker toward the street, stronger on far layers.
    x.globalCompositeOperation = 'source-atop';
    const hg = x.createLinearGradient(0, 0, 0, lh);
    hg.addColorStop(0, hexA(d.haze, d.hazeA * 0.25)); hg.addColorStop(0.7, hexA(d.haze, d.hazeA * 0.6)); hg.addColorStop(1, hexA(d.haze, d.hazeA));
    x.fillStyle = hg; x.fillRect(0, 0, lw, lh);
    x.globalCompositeOperation = 'source-over';
    layers[i] = { c, par: d.par };
  }

  function megaTower(x, cx, base) {
    const tw = 110 + rnd() * 60, th = h * (0.88 + rnd() * 0.08) + DROP, top = base - th;
    x.fillStyle = '#100c20';
    x.beginPath(); x.moveTo(cx - tw / 2, base); x.lineTo(cx - tw / 2, top + 90); x.lineTo(cx - tw * 0.2, top + 30); x.lineTo(cx - 6, top);
    x.lineTo(cx + 6, top); x.lineTo(cx + tw * 0.2, top + 30); x.lineTo(cx + tw / 2, top + 90); x.lineTo(cx + tw / 2, base); x.closePath(); x.fill();
    for (let y = top + 110; y < base; y += 14) { x.fillStyle = hexA(rnd() < 0.5 ? '#ffc58a' : '#8fdcff', 0.08 + rnd() * 0.12); x.fillRect(cx - tw / 2 + 6, y, tw - 12, 1.5); }
    x.save(); x.shadowColor = accent2; x.shadowBlur = 16; x.fillStyle = hexA(accent2, 0.8);
    x.fillRect(cx - 1, top + 30, 2, th * 0.5); x.restore();
    x.fillStyle = '#100c20'; x.fillRect(cx - 1, top - 70, 2, 70);
    blinkers.push({ layer: 0, x: cx, y: top - 70, ph: rnd() * 6, sp: 0.9 });
    blinkers.push({ layer: 0, x: cx - tw * 0.2, y: top + 30, ph: rnd() * 6, sp: 0.6 });
    blinkers.push({ layer: 0, x: cx + tw * 0.2, y: top + 30, ph: rnd() * 6, sp: 0.6 });
    // Giant holo banner hung on the tower face.
    addBoard(0, cx - tw / 2, top + 120, tw, th, true);
  }

  const SIGN_WORDS = ['ナイトラボ', 'アーケード', 'ネオン', '2077', 'BAR', 'HOTEL', 'NOODLE', 'CT-101', 'OPEN 24/7', 'JACK IN', '€$', 'HOMELAB', 'ラーメン', 'クラブ', 'NIGHT LAB'];
  function addSign(layer, bx, top, bw, bh) {
    const col = pick(palette());
    const word = pick(SIGN_WORDS);
    const vertical = rnd() < 0.55;
    const fs = layer === 2 ? 13 + rnd() * 6 : 9 + rnd() * 3;
    const chars = [...word];
    const sw = vertical ? fs + 12 : chars.length * fs * 0.72 + 18;
    const sh = vertical ? chars.length * (fs + 3) + 14 : fs + 14;
    const pad = 16;
    const [c, x] = mk(sw + pad * 2, sh + pad * 2);
    x.translate(pad, pad);
    x.fillStyle = 'rgba(4,4,10,0.85)'; x.fillRect(0, 0, sw, sh);
    x.fillStyle = hexA(col, 0.14); x.fillRect(0, 0, sw, sh);
    x.shadowColor = col; x.shadowBlur = layer === 2 ? 18 : 12;
    x.strokeStyle = col; x.lineWidth = 1.5; x.strokeRect(1, 1, sw - 2, sh - 2);
    x.fillStyle = col; x.font = `700 ${fs}px "Plex Mono", ui-monospace, "Yu Gothic", "Meiryo", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (vertical) chars.forEach((ch, k) => x.fillText(ch, sw / 2, 8 + (fs + 3) * (k + 0.5)));
    else x.fillText(word, sw / 2, sh / 2 + 1);
    x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.35)'; // hot core
    if (vertical) chars.forEach((ch, k) => x.fillText(ch, sw / 2, 8 + (fs + 3) * (k + 0.5)));
    else x.fillText(word, sw / 2, sh / 2 + 1);
    const sx = rnd() < 0.5 ? bx - sw * 0.3 : bx + bw - sw * 0.7;
    const sy = top + 20 + rnd() * Math.max(10, Math.min(bh * 0.5, h * 0.4));
    signs.push({ layer, c, x: sx - pad, y: sy - pad, w: sw + pad * 2, h: sh + pad * 2, col, ph: rnd() * 100, broken: rnd() < 0.18 });
  }

  const BOARD_TEXT = [['NIGHT LAB', 'ARCADE 2077'], ['JACK IN', 'PICK YOUR RUN'], ['STREET CRED', '€$ ONLINE'], ['CT-101', 'NETLINK OK'], ['NEON', 'ネオン']];
  function addBoard(layer, bx, top, bw, bh, tall) {
    const bwid = tall ? bw * 0.7 : Math.min(bw * 0.85, layer === 2 ? 190 : 120), bhei = tall ? bwid * 1.6 : bwid * 0.55;
    const [a, b] = [pick(palette()), pick([accent2, PINK, accent])];
    const txt = pick(BOARD_TEXT);
    const [c, x] = mk(bwid, bhei);
    const g = x.createLinearGradient(0, 0, bwid, bhei);
    g.addColorStop(0, hexA(a, 0.55)); g.addColorStop(1, hexA(b, 0.35));
    x.fillStyle = g; x.fillRect(0, 0, bwid, bhei);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < bhei; y += 3) x.fillRect(0, y, bwid, 1);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(Math.min(bhei * 0.26, bwid / Math.max(6, txt[0].length) * 1.25))}px "Plex Mono", ui-monospace, sans-serif`; x.fillText(txt[0], bwid / 2, bhei * 0.4);
    x.font = `600 ${Math.round(Math.min(bhei * 0.14, bwid / Math.max(8, txt[1].length) * 1.2))}px "Plex Mono", ui-monospace, "Yu Gothic", sans-serif`; x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillText(txt[1], bwid / 2, bhei * 0.7);
    x.strokeStyle = hexA(a, 0.9); x.lineWidth = 1; x.strokeRect(0.5, 0.5, bwid - 1, bhei - 1);
    boards.push({ layer, c, x: bx + (bw - bwid) / 2, y: tall ? top : top + 30 + rnd() * Math.max(10, bh * 0.25), w: bwid, h: bhei, col: a, ph: rnd() * 10, dim: tall ? 0.45 : 1 });
  }

  // ---------- Moving things ----------
  function newFlyer(any) {
    const near = rnd() < 0.35, dir = rnd() < 0.5 ? 1 : -1;
    return { near, dir, x: any ? rnd() * w : (dir > 0 ? -60 : w + 60), y: h * (near ? 0.25 + rnd() * 0.35 : 0.12 + rnd() * 0.35),
      v: (near ? 70 : 28) * (0.6 + rnd() * 0.8), s: near ? 2.2 : 1.1, bob: rnd() * 6 };
  }
  function buildMovers() {
    const nf = small ? 4 : 8;
    flyers = Array.from({ length: nf }, () => newFlyer(true));
    road = { y: h * 0.74, lanes: [{ dir: 1, col: '#fff2d8', y: -4 }, { dir: -1, col: '#ff2a3a', y: 3 }] };
    const nc = small ? 22 : 46;
    cars = Array.from({ length: nc }, (_, i) => ({ lane: i % 2, x: rnd() * (w + 200) - 100, v: 90 + rnd() * 90 }));
    beams = [{ x: w * 0.22, a: -1.9, sp: 0.18, ph: 0 }, { x: w * 0.78, a: -1.2, sp: 0.14, ph: 2 }];
    const nr = Math.round((w * h) / (small ? 9000 : 5200));
    rain = Array.from({ length: nr }, () => ({ x: rnd() * w, y: rnd() * h, v: 600 + rnd() * 500, len: 10 + rnd() * 18, near: rnd() < 0.3 }));
  }

  // ---------- Fog + vignette overlay ----------
  function buildOverlay() {
    const [c, x] = mk(w, h);
    const fg = x.createLinearGradient(0, h * 0.55, 0, h);
    fg.addColorStop(0, 'transparent'); fg.addColorStop(0.6, hexA('#2a0c1e', 0.35)); fg.addColorStop(1, hexA('#05040a', 0.85));
    x.fillStyle = fg; x.fillRect(0, 0, w, h);
    // Wet-street neon reflections.
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const rx = rnd() * w, col = pick(palette()), rw = 6 + rnd() * 24;
      const rg = x.createLinearGradient(0, h * 0.82, 0, h);
      rg.addColorStop(0, hexA(col, 0.22)); rg.addColorStop(1, 'transparent');
      x.fillStyle = rg; x.fillRect(rx, h * 0.82, rw, h * 0.18);
    }
    x.globalCompositeOperation = 'source-over';
    const v = x.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    x.fillStyle = v; x.fillRect(0, 0, w, h);
    overlay = c;
  }

  function build() {
    seed = 20771;
    signs = []; boards = []; blinkers = []; layers = [];
    buildSky();
    for (let i = 0; i < LAYER_DEF.length; i++) buildLayer(i);
    buildMovers();
    buildOverlay();
  }

  function resize() {
    small = mq('(max-width: 720px)');
    dpr = Math.min(small ? 1.5 : 2, globalThis.devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  // ---------- Frame ----------
  const layerPos = (i) => [-M + px * M * layers[i].par, -scrollT * layers[i].par];
  function flick(s, t) {
    if (s.broken) { const n = Math.sin(t * 23 + s.ph) * Math.sin(t * 7.3 + s.ph * 2); return n > 0.55 ? 0.15 : 0.95; }
    const n = Math.sin(t * 0.9 + s.ph) + Math.sin(t * 13 + s.ph);
    return n > 1.92 ? 0.3 : 1;
  }

  function drawLayerExtras(i, t) {
    const [ox, oy] = layerPos(i);
    for (const b of blinkers) if (b.layer === i) {
      const a = Math.max(0, Math.sin(t * b.sp * 3 + b.ph)) ** 6;
      if (a > 0.02) { ctx.fillStyle = hexA(RED, a); ctx.fillRect(b.x + ox - 1.5, b.y + oy - 1.5, 3, 3); }
    }
    for (const s of signs) if (s.layer === i) {
      ctx.globalAlpha = reduce ? 1 : flick(s, t);
      ctx.drawImage(s.c, s.x + ox, s.y + oy, s.w, s.h);
    }
    ctx.globalAlpha = 1;
    for (const b of boards) if (b.layer === i) {
      const x = b.x + ox, y = b.y + oy;
      ctx.globalAlpha = (0.8 + 0.2 * Math.sin(t * 2 + b.ph)) * (b.dim || 1);
      // Rare glitch: draw shifted slices.
      const glitch = !reduce && Math.sin(t * 1.7 + b.ph * 3) > 0.985;
      if (glitch) { const sl = b.h / 3; for (let k = 0; k < 3; k++) ctx.drawImage(b.c, 0, k * sl * dpr, b.c.width, sl * dpr, x + (k - 1) * 6, y + k * sl, b.w, sl); }
      else ctx.drawImage(b.c, x, y, b.w, b.h);
      // Scan band.
      const sy = y + ((t * 30 + b.ph * 20) % (b.h + 20)) - 10;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, Math.max(y, sy), b.w, Math.min(6, y + b.h - sy));
      ctx.globalAlpha = 1;
    }
  }

  function drawFlyers(near, dt, t) {
    for (const f of flyers) {
      if (f.near !== near) continue;
      if (!reduce) { f.x += f.v * f.dir * dt; if (f.x < -80 || f.x > w + 80) Object.assign(f, newFlyer(false), { near }); }
      const y = f.y + Math.sin(t * 0.8 + f.bob) * 4 - scrollT * (near ? 0.8 : 0.4), s = f.s;
      const tg = ctx.createLinearGradient(f.x, 0, f.x - f.dir * 70 * s, 0);
      tg.addColorStop(0, hexA(near ? accent2 : '#ffffff', near ? 0.35 : 0.18)); tg.addColorStop(1, 'transparent');
      ctx.fillStyle = tg; ctx.fillRect(Math.min(f.x, f.x - f.dir * 70 * s), y - 1, 70 * s, 2);
      ctx.fillStyle = '#05050b'; ctx.fillRect(f.x - 9 * s, y - 2.5 * s, 18 * s, 5 * s);
      ctx.fillStyle = '#fffbe6'; ctx.fillRect(f.x + f.dir * 8 * s - s, y - s, 2.2 * s, 2 * s);
      ctx.fillStyle = Math.sin(t * 6 + f.bob) > 0 ? RED : '#550010'; ctx.fillRect(f.x - f.dir * 9 * s - s, y - s, 2 * s, 2 * s);
    }
  }

  function drawRoad(dt) {
    const [ox, oy] = layerPos(1);
    const ry = road.y + oy * 1.2;
    const ug = ctx.createLinearGradient(0, ry + 8, 0, ry + 60);
    ug.addColorStop(0, hexA(accent, 0.12)); ug.addColorStop(1, 'transparent');
    ctx.fillStyle = ug; ctx.fillRect(0, ry + 8, w, 52);
    ctx.fillStyle = '#06050c'; ctx.fillRect(0, ry - 8, w, 16);
    ctx.fillStyle = hexA(accent, 0.75); ctx.fillRect(0, ry - 10, w, 2);
    ctx.fillStyle = hexA(accent2, 0.35); ctx.fillRect(0, ry + 8, w, 1);
    for (let p = ((ox * 1.3) % 120 + 120) % 120 - 120; p < w; p += 120) { ctx.fillStyle = '#06050c'; ctx.fillRect(p, ry + 8, 6, h); }
    for (const L of [0, 1]) {
      const lane = road.lanes[L];
      ctx.fillStyle = lane.col;
      for (const c of cars) {
        if (c.lane !== L) continue;
        if (!reduce) { c.x += c.v * lane.dir * dt; if (c.x > w + 100) c.x = -100; if (c.x < -100) c.x = w + 100; }
        ctx.fillRect(c.x, ry + lane.y - 1.5, 4, 3);
        ctx.fillRect(c.x + 7, ry + lane.y - 1.5, 4, 3);
      }
    }
  }

  function drawBeams(t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of beams) {
      const a = b.a + Math.sin(t * b.sp + b.ph) * 0.35, len = h * 1.3, spread = 0.06;
      const x0 = b.x + px * M * 0.3, y0 = h;
      const g = ctx.createLinearGradient(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
      g.addColorStop(0, hexA('#bfe9ff', 0.16)); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a - spread) * len, y0 + Math.sin(a - spread) * len);
      ctx.lineTo(x0 + Math.cos(a + spread) * len, y0 + Math.sin(a + spread) * len);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawRain(dt) {
    const slant = 0.18;
    for (const near of [false, true]) {
      ctx.strokeStyle = near ? 'rgba(190,220,255,0.28)' : 'rgba(170,190,255,0.12)';
      ctx.lineWidth = near ? 1.1 : 0.7;
      ctx.beginPath();
      for (const r of rain) {
        if (r.near !== near) continue;
        if (!reduce) { r.y += r.v * dt * (near ? 1.2 : 0.8); r.x += r.v * dt * slant; if (r.y > h + 20) { r.y = -20; r.x = Math.random() * (w + 100) - 100; } }
        const l = r.len * (near ? 1.4 : 1);
        ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - l * slant, r.y - l);
      }
      ctx.stroke();
    }
  }

  function frame(now) {
    raf = 0;
    const minGap = small ? 1000 / 30 : 0;
    if (!reduce && now - lastDraw < minGap) { schedule(); return; }
    lastDraw = now;
    const t = now / 1000;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;
    px += (tx - px) * Math.min(1, dt * 3);
    const targetScroll = Math.min(DROP, (globalThis.scrollY || 0) * 0.06);
    scrollT += (targetScroll - scrollT) * Math.min(1, reduce ? 1 : dt * 4);

    ctx.drawImage(sky, 0, 0, w, h);
    drawBeams(t);
    for (let i = 0; i < layers.length; i++) {
      const [ox, oy] = layerPos(i);
      ctx.drawImage(layers[i].c, ox, oy, w + M * 2, h + DROP);
      drawLayerExtras(i, t);
      if (i === 0) drawFlyers(false, dt, t);
      if (i === 1) { drawRoad(dt); drawFlyers(true, dt, t); }
    }
    if (!reduce) drawRain(dt);
    ctx.drawImage(overlay, 0, 0, w, h);
    schedule();
  }
  function schedule() { if (running && !reduce && !document.hidden && !raf) raf = requestAnimationFrame(frame); }

  readColors(); resize();
  addEventListener('resize', () => { resize(); if (reduce) frame(performance.now()); });
  addEventListener('pointermove', (e) => { tx = (e.clientX / (w || 1)) * 2 - 1; }, { passive: true });
  addEventListener('scroll', () => { if (reduce) frame(performance.now()); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    if (document.hidden) { running = false; cancelAnimationFrame(raf); raf = 0; }
    else { running = true; last = 0; schedule(); }
  });
  if (reduce) frame(performance.now()); else schedule();
  return { refresh() { readColors(); build(); if (reduce) frame(performance.now()); } };
}

export function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(f.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
