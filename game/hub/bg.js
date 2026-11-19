// Full-screen animated backdrop: perspective neon grid, horizon glow, skyline silhouette, data rain.
export function startBackground(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, dpr = 1, raf = 0, running = true;
  let skyline = [], drops = [];
  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');
  const css = () => getComputedStyle(document.documentElement);
  let accent = '#fcee09', accent2 = '#00f0ff';

  function readColors() { const s = css(); accent = s.getPropertyValue('--accent').trim() || accent; accent2 = s.getPropertyValue('--accent-2').trim() || accent2; }

  function buildStaticCache() {
    if (!w || !h) return;
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hor = h * 0.62;
    offCtx.clearRect(0, 0, w, h);
    // Sky
    const sky = offCtx.createLinearGradient(0, 0, 0, hor);
    sky.addColorStop(0, '#05060a'); sky.addColorStop(0.7, '#0a0b16'); sky.addColorStop(1, '#1a0d1f');
    offCtx.fillStyle = sky; offCtx.fillRect(0, 0, w, hor);
    // Floor
    const floor = offCtx.createLinearGradient(0, hor, 0, h);
    floor.addColorStop(0, '#0d0816'); floor.addColorStop(1, '#05060a');
    offCtx.fillStyle = floor; offCtx.fillRect(0, hor, w, h - hor);
    // Horizon glow
    const glow = offCtx.createRadialGradient(w / 2, hor, 0, w / 2, hor, Math.max(w, h) * 0.6);
    glow.addColorStop(0, hexA(accent, 0.28)); glow.addColorStop(0.35, hexA('#ff003c', 0.08)); glow.addColorStop(1, 'transparent');
    offCtx.fillStyle = glow; offCtx.fillRect(0, 0, w, h);
    // Skyline buildings + static windows
    offCtx.fillStyle = '#06070c';
    for (const b of skyline) {
      offCtx.fillRect(b.x, hor - b.h, b.w, b.h);
      if (b.spire) offCtx.fillRect(b.x + b.w / 2 - 1, hor - b.h - 24, 2, 24);
    }
    for (const b of skyline) {
      for (const [lx, ly, hot] of b.lights) {
        offCtx.fillStyle = hot ? hexA(accent2, 0.3) : 'rgba(255,200,120,.10)';
        offCtx.fillRect(b.x + lx, hor - b.h + ly, 2, 2);
      }
    }
    // Static radial perspective lines on floor
    offCtx.save();
    offCtx.beginPath(); offCtx.rect(0, hor, w, h - hor); offCtx.clip();
    offCtx.lineWidth = 1;
    const vx = w / 2;
    offCtx.strokeStyle = hexA(accent, 0.22);
    offCtx.beginPath();
    for (let i = -24; i <= 24; i++) { const x = vx + i * (w / 14); offCtx.moveTo(vx + i * 6, hor); offCtx.lineTo(x * 1 + (x - vx) * 2, h); }
    offCtx.stroke();
    offCtx.restore();
    // Horizon line
    offCtx.fillStyle = hexA(accent, 0.8); offCtx.fillRect(0, hor - 1, w, 1.5);
  }

  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Deterministic skyline per width.
    skyline = []; let x = 0, seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (x < w) {
      const bw = 18 + rnd() * 60, bh = 30 + rnd() * rnd() * h * 0.28;
      const lights = [];
      for (let i = 0; i < bh / 9; i++) if (rnd() < 0.35) lights.push([rnd() * (bw - 6) + 3, i * 9 + 6, rnd() < 0.15]);
      skyline.push({ x, w: bw, h: bh, lights, spire: rnd() < 0.12 }); x += bw + rnd() * 6;
    }
    const n = Math.round((w * h) / 26000);
    drops = Array.from({ length: n }, () => newDrop(true));
    buildStaticCache();
  }
  function newDrop(any) {
    return { x: Math.random() * w, y: any ? Math.random() * h : -40, v: 60 + Math.random() * 160, len: 8 + Math.random() * 28, a: 0.08 + Math.random() * 0.25, c: Math.random() < 0.7 ? 1 : 2 };
  }

  function frame(now) {
    raf = 0;
    const t = now / 1000;
    const hor = h * 0.62;
    ctx.drawImage(offscreen, 0, 0, w, h);
    // Animated perspective floor lines
    ctx.save();
    ctx.beginPath(); ctx.rect(0, hor, w, h - hor); ctx.clip();
    ctx.lineWidth = 1;
    const speed = reduce ? 0 : 0.35;
    const off = (t * speed) % 1;
    for (let i = 0; i < 18; i++) {
      const z = (i + 1 - off) / 18; const y = hor + (h - hor) * z * z;
      ctx.strokeStyle = hexA(accent, 0.05 + 0.3 * z);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
    // Data rain
    if (!reduce) {
      const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
      for (const d of drops) {
        d.y += d.v * dt;
        if (d.y - d.len > h) Object.assign(d, newDrop(false));
        const g = ctx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
        g.addColorStop(0, 'transparent'); g.addColorStop(1, hexA(d.c === 1 ? accent2 : accent, d.a));
        ctx.fillStyle = g; ctx.fillRect(d.x, d.y - d.len, 1, d.len);
      }
    }
    frame.last = now;
    // Vignette
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(0,0,0,.65)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    if (running && !reduce && !document.hidden) raf = requestAnimationFrame(frame);
  }

  readColors(); resize();
  addEventListener('resize', () => { resize(); if (reduce) frame(performance.now()); });
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!running) {
      running = true;
      frame.last = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    }
  });
  if (reduce) frame(performance.now());
  else if (!document.hidden) raf = requestAnimationFrame(frame);
  return { refresh() { readColors(); buildStaticCache(); if (reduce) frame(performance.now()); } };
}

export function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(f.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
