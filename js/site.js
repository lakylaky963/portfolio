// Avraham Arazi portfolio. No framework, no per-frame work: a few event handlers and three fetches.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- theme ----------
  const themeBtn = $('.theme');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode */ }
  });

  // ---------- terminal: reveal lines once ----------
  const term = $('.term-body.typing');
  if (term) {
    const lines = $$('[data-line]', term);
    if (still) lines.forEach((l) => l.classList.add('shown'));
    else lines.forEach((l, i) => setTimeout(() => l.classList.add('shown'), 250 + i * 220));
  }

  // ---------- chapters: mark the one on screen ----------
  const chapters = $$('.chapter');
  if (chapters.length && 'IntersectionObserver' in window) {
    const links = $$('.chapterbar a');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        chapters.forEach((c) => c.classList.toggle('on', c === e.target));
        links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    chapters.forEach((c) => io.observe(c));
  }

  // ---------- live data from the homelab dashboard ----------
  const base = ($('meta[name="api-base"]')?.content || '/').replace(/\/?$/, '/');
  const api = (path) => fetch(base + path, { headers: { accept: 'application/json' } }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const HIDDEN = new Set([102]); // a friend's container: never shown here
  // Labels: English by default, Hebrew when <html lang="he">. Numbers stay Latin and left-to-right.
  const he = root.lang === 'he';
  const T = he
    ? { names: ['CodeZi', 'Flight Monitor', 'קורא חדשות', 'האתר הזה'], noData: 'אין עדיין מספיק נתונים.', none: 'אין נתונים', up: 'פעיל', upAria: (n, p) => `${n}: ${p}% זמינות ב-7 הימים האחרונים`, foot: (v) => ` · ${v}% זמינות ב-7 הימים האחרונים`,
        running: 'קונטיינרים פעילים', uptime: 'זמן פעילות השרת', cpu: 'מעבד', mem: 'זיכרון', cores: 'ליבות', chartAria: (l) => `${l} ב-24 השעות האחרונות`, labels: { CPU: 'מעבד', Memory: 'זיכרון', In: 'נכנס', Out: 'יוצא' } }
    : { names: ['CodeZi', 'Flight Monitor', 'News reader', 'This site'], noData: 'Not enough data yet.', none: 'no data', up: 'up', upAria: (n, p) => `${n}: ${p}% up over 7 days`, foot: (v) => ` · ${v}% up over 7 days`,
        running: 'containers up', uptime: 'server uptime', cpu: 'cpu', mem: 'memory', cores: 'cores', chartAria: (l) => `${l} over the last 24 hours`, labels: { CPU: 'CPU', Memory: 'Memory', In: 'In', Out: 'Out' } };
  const locale = he ? 'he-IL-u-nu-latn' : undefined;
  const SITES = [['codezi', T.names[0]], ['flights', T.names[1]], ['route:news', T.names[2]], ['route:portfolio', T.names[3]]];
  const CT = { codezi: 100, flights: 103 };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v) => `${Math.round(v * 100)}%`;
  const rate = (v) => (v > 1e6 ? `${(v / 1e6).toFixed(1)} MB/s` : v > 1e3 ? `${(v / 1e3).toFixed(0)} kB/s` : `${Math.round(v)} B/s`);
  const span = (s) => { const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); return d ? `${d} d ${h} h` : `${h} h ${Math.floor((s % 3600) / 60)} min`; };
  const clock = (t) => new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const empty = (el, text) => { if (el) el.innerHTML = `<p class="empty">${esc(text)}</p>`; };
  // A tile with no real data is not shown at all (DESIGN.md: never a made-up number).
  const gone = (el) => { const card = el && el.closest('.card'); if (!card) return; card.hidden = true; const wall = card.closest('.wall'); if (!wall) return; const left = $$('.card:not([hidden])', wall).length; wall.classList.toggle('partial', left === 1); wall.hidden = left === 0; };
  const back = (el) => { const card = el && el.closest('.card'); if (!card || !card.hidden) return; card.hidden = false; const wall = card.closest('.wall'); wall.hidden = false; wall.classList.toggle('partial', $$('.card:not([hidden])', wall).length === 1); };
  const mark = (ct, state) => $$(`[data-ct="${ct}"]`).forEach((el) => { if (!el.dataset.state || state === 'down' || el.dataset.from !== 'stats') el.dataset.state = state; });

  function stats() {
    return api('api/stats').then((s) => {
      const guests = (s.guests || []).filter((g) => !HIDDEN.has(g.id));
      for (const g of guests) for (const el of $$(`[data-ct="${g.id}"]`)) { el.dataset.state = g.status === 'running' ? 'up' : 'down'; el.dataset.from = 'stats'; }
      back($('[data-readout]'));
      $$('[data-host-dot]').forEach((d) => { d.dataset.state = 'up'; });
      const running = guests.filter((g) => g.status === 'running').length;
      const h = s.host || {};
      const rows = [
        [T.running, he ? `${running}/${guests.length}` : `${running} of ${guests.length}`],
        [T.uptime, h.uptime ? span(h.uptime) : null],
        [T.cpu, typeof h.cpu === 'number' ? (he ? `${pct(h.cpu)} · ${h.cpus} ${T.cores}` : `${pct(h.cpu)} of ${h.cpus} ${T.cores}`) : null],
        [T.mem, h.maxmem ? pct(h.mem / h.maxmem) : null],
      ].filter((r) => r[1]);
      const box = $('[data-readout]');
      if (box) box.innerHTML = `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
      const at = $('[data-at]'); if (at && s.at) at.textContent = clock(s.at);
    }).catch(() => gone($('[data-readout]')));
  }

  function uptime() {
    const box = $('[data-uptime]');
    return api('api/uptime?hours=168').then((u) => {
      const sites = u.sites || {};
      const shown = SITES.filter(([id]) => sites[id] && sites[id].buckets && sites[id].buckets.length);
      if (!shown.length) throw new Error('no data');
      const N = 48;
      const html = shown.map(([id, name]) => {
        const d = sites[id]; const per = Math.max(1, Math.ceil(d.buckets.length / N)); const bars = [];
        for (let i = 0; i < d.buckets.length; i += per) {
          const slice = d.buckets.slice(i, i + per).filter((b) => b[1] !== null);
          bars.push({ t: d.buckets[i][0], ok: slice.length ? slice.reduce((a, b) => a + Number(b[1]), 0) / slice.length : null });
        }
        const cells = bars.slice(-N).map((b) => `<i class="${b.ok === null ? '' : b.ok >= 0.99 ? 'ok' : b.ok >= 0.5 ? 'part' : 'bad'}" title="${esc(new Date(b.t).toLocaleString(locale))}: ${b.ok === null ? T.none : `${Math.round(b.ok * 100)}% ${T.up}`}"></i>`).join('');
        const last = [...d.buckets].reverse().find((b) => b[1] !== null);
        const state = last ? (last[1] >= 0.5 ? 'up' : 'down') : '';
        $$(`[data-site="${id}"]`).forEach((el) => { el.dataset.state = state; });
        if (CT[id] && state) mark(CT[id], state);
        return `<div class="uptime-row"><span class="name"><span class="dot" data-state="${state}"></span>${esc(name)}</span><span class="bars" role="img" aria-label="${esc(T.upAria(name, d.pct ?? '?'))}">${cells}</span><span class="pct data">${d.pct === null ? '–' : `${d.pct}%`}</span></div>`;
      }).join('');
      box.innerHTML = html; back(box);
      // The answer itself came through the proxy and the dashboard, so those two are up.
      mark(101, 'up'); mark(105, 'up'); $$('[data-host-dot]').forEach((d) => { d.dataset.state = 'up'; });
      const vals = shown.map(([id]) => sites[id].pct).filter((v) => typeof v === 'number');
      const foot = $('[data-foot-uptime]');
      if (foot && vals.length) foot.textContent = T.foot((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
    }).catch(() => gone(box));
  }

  // Own SVG line chart, same drawing rules as the dashboard's Charts.tsx.
  function draw(card, points, series, max) {
    const plot = $('[data-plot]', card);
    if (points.length < 2) return empty(plot, T.noData);
    const W = 600; const H = 150; const P = 4;
    const top = max ?? Math.max(1e-9, ...points.flatMap((p) => series.map((s) => Number(p[s.key] ?? 0)))) * 1.15;
    const t0 = points[0].t; const t1 = points[points.length - 1].t;
    const x = (t) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
    const y = (v) => H - P - (Math.min(v, top) / top) * (H - 2 * P);
    const line = (k) => points.filter((p) => p[k] !== null && p[k] !== undefined).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(Number(p[k])).toFixed(1)}`).join('');
    const gid = (s) => `g-${card.dataset.chart}-${s.key}`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(T.chartAria(series.map((s) => s.label).join(he ? ' ו' : ' and ')))}"><defs>`
      + series.map((s) => `<linearGradient id="${gid(s)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="st-${s.tone}" stop-opacity=".35"/><stop offset="1" class="st-${s.tone}" stop-opacity="0"/></linearGradient>`).join('') + '</defs>'
      + [0.25, 0.5, 0.75].map((g) => `<line class="grid-line" x1="0" x2="${W}" y1="${H * g}" y2="${H * g}"/>`).join('')
      + series.map((s) => { const d = line(s.key); return d ? `<path class="area" fill="url(#${gid(s)})" d="${d}L${x(t1).toFixed(1)},${H - P}L${x(t0).toFixed(1)},${H - P}Z"/><path class="line s-${s.tone}" d="${d}"/>` : ''; }).join('')
      + `<line class="cursor-line" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/></svg>`;
    const legend = (p) => series.map((s) => `<span><i class="k-${s.tone}"></i>${esc(s.label)}${p && p[s.key] != null ? ` ${esc(s.format(Number(p[s.key])))}` : ''}</span>`).join('');
    const latest = points[points.length - 1];
    plot.innerHTML = `${svg}<div class="chart-foot label"><span>${clock(t0)}</span><span class="legend">${legend(latest)}</span><span>${clock(t1)}</span></div>`;
    const el = $('svg', plot); const cur = $('.cursor-line', plot); const leg = $('.legend', plot); const note = $('[data-note]', card);
    if (note && !note.dataset.idle) note.dataset.idle = note.textContent;
    let rect = null;
    el.addEventListener('pointerenter', () => { rect = el.getBoundingClientRect(); });
    el.addEventListener('pointermove', (e) => {
      rect = rect || el.getBoundingClientRect();
      const tx = t0 + ((e.clientX - rect.left) / rect.width) * (t1 - t0);
      let best = 0; for (let i = 1; i < points.length; i += 1) if (Math.abs(points[i].t - tx) < Math.abs(points[best].t - tx)) best = i;
      const p = points[best];
      cur.setAttribute('x1', x(p.t)); cur.setAttribute('x2', x(p.t)); cur.setAttribute('visibility', 'visible');
      leg.innerHTML = legend(p); if (note) note.textContent = clock(p.t);
    });
    el.addEventListener('pointerleave', () => { rect = null; cur.setAttribute('visibility', 'hidden'); leg.innerHTML = legend(latest); if (note) note.textContent = note.dataset.idle; });
  }

  function history() {
    const cards = $$('[data-chart]');
    if (!cards.length) return Promise.resolve();
    return api('api/history?range=day').then((h) => {
      const pts = h.points || [];
      const peak = (k) => Math.max(0, ...pts.map((p) => Number(p[k] ?? 0)));
      const by = Object.fromEntries(cards.map((c) => [c.dataset.chart, c]));
      cards.forEach((c) => back($('[data-plot]', c)));
      if (by.cpu) draw(by.cpu, pts, [{ key: 'cpu', label: T.labels.CPU, tone: 'a', format: pct }], Math.max(0.2, peak('cpu') * 1.2));
      if (by.mem) draw(by.mem, pts, [{ key: 'mem', label: T.labels.Memory, tone: 'b', format: pct }], 1);
      if (by.net) draw(by.net, pts, [{ key: 'netin', label: T.labels.In, tone: 'b', format: rate }, { key: 'netout', label: T.labels.Out, tone: 'a', format: rate }]);
    }).catch(() => cards.forEach((c) => gone(c)));
  }

  if ($('[data-readout]') || $('[data-ct]')) {
    stats(); uptime(); history();
    setInterval(stats, 60000); setInterval(uptime, 120000); setInterval(history, 300000);
  }
})();
