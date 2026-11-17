# DESIGN.md — Avraham Arazi portfolio

Version 2, 2026-11-17. Rewritten after studying railway.com section by section (measured in
the browser at 1440px), plus `claude/portfolio-design-brief.md`, the homelab brain, the live
CodeZi `/resume` page and the dashboard v3 code (`home-lab-TH/landingPage`). Where this file
and the brief disagree, this file wins. Pages use token names, never raw values.

**Idea in one line:** my infrastructure, at night. A painted dusk sky whose constellation is
my real homelab, a terminal that introduces me, and one cable you follow down the page.

---

## 0. What Railway actually does, and our version

Railway works because every big element is the same joke about its name. We copy the
structure and replace the joke with ours. Nothing of theirs is reused: no train, no art, no
copy, no split-flap board.

| Railway (observed) | Why it works | Our version |
|---|---|---|
| Hero is a painted dusk sky (clouds, stars, a train on the horizon) inside a rounded frame inset from the page edge. A day painting and a dusk painting both exist. | The art is a place, not decoration, and it sets the mood before any text. | **The sky.** An original layered-SVG sky in a framed panel. The stars are the homelab: real containers drawn as a constellation, joined by thin lines. Dusk version for dark, morning version for light. |
| A product window overlaps the bottom edge of the painting. | Shows the real thing immediately. | **The terminal** overlaps the bottom of the sky and types who I am. |
| Headlines in a serif (IBM Plex Serif, weight 400–500, tight tracking); body in Inter; code in JetBrains Mono. | The serif is what stops it looking like every other developer site. | Serif headlines, sans body, mono for data. Same idea, our own scale. |
| A vertical rail runs down the left edge with a station at each chapter; a small train moves down it as you scroll. A pill bar under the hero lists the chapters. | Turns a long page into one journey with a visible position. | **The cable.** One line down the left gutter with a node at each chapter and a packet that travels with the scroll. Chapters: Homelab, Work, Resume, Contact. |
| Each chapter: small tinted pill label, left-aligned serif heading, grey paragraph, then a large real product screen (service canvas with a dot grid, a wall of metric charts). Then three plain text columns divided by hairlines. | The product is the illustration. No stock art, no icon cards. | Each chapter shows something real: the topology and live graphs, real project screenshots, the resume itself. |
| Dots appear only inside the product canvas. The page itself is plain. | Dots mean "this is a workspace". | Dots only inside the topology panel and the sky frame. Page background is plain. |
| Background is purple-black `#13111c`, not neutral black. Borders are white at 10–15%. The button is a muted purple, not a bright one. | Tinted dark feels like evening; pure black feels empty. | Indigo-black base, one amber accent, hairline borders. |
| Live usage numbers on a station departure board. | The motif carried into data. | Live numbers printed as terminal output. |
| Footer: a huge dimmed wordmark with the train drawn in dots. | Ends on the motif. | Footer: the name, large and dim, under the same constellation. |

---

## 1. Color

One accent. Blue exists only as a second chart series. Status colors appear only on status.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `bg` | `#10121b` | `#f6f4ef` | Page background. Indigo-black at night, warm paper by day. Never pure black or white. |
| `surface` | `#171a26` | `#ffffff` | Panels, cards, nav bar. |
| `raised` | `#1f2331` | `#efece5` | Inner tiles, terminal body, pills, hover fill. |
| `line` | `#2a2e3e` | `#dcd8ce` | Hairlines, default borders, chart grid, dots. |
| `line-strong` | `#3b4055` | `#b9b3a4` | Hover and input borders, node outlines, the cable. |
| `text` | `#eef0f6` | `#15161c` | Headings and body. 16:1 on `bg`. |
| `text-2` | `#b7bbcb` | `#44475a` | Paragraphs under headings, card descriptions. 8:1 or better. |
| `muted` | `#8c92a8` | `#666a7a` | Labels, timestamps, axis text. 4.5:1 or better on all three backgrounds. |
| `accent` | `#ffb84d` | `#ffb84d` | Primary button, terminal cursor, the packet, the horizon. Same amber as the dashboard. |
| `accent-ink` | `#1a1000` | `#1a1000` | Text on an `accent` fill. 10.9:1. |
| `accent-text` | `#ffb84d` | `#8f4a00` | Links, active nav, focus ring. Darker on paper so it stays readable (6:1). |
| `accent-mark` | `#ffb84d` | `#b06a00` | Amber chart lines and live edges; keeps 3:1 on paper. |
| `data-2` | `#7aa2ff` | `#3256cc` | Second chart series only. Never on buttons or links. |
| `ok` | `#34d399` | `#0b7a53` | Up, healthy. |
| `warn` | `#fbbf24` | `#a15c00` | Partial uptime. |
| `error` | `#f87171` | `#c22f2f` | Down, failed. |
| `off` | `#5a5f73` | `#a9a496` | Offline node, no data. |

Sky palette (used only inside the sky frame)

| Token | Dusk | Morning | Role |
|---|---|---|---|
| `sky-top` | `#151a33` | `#dfe7f1` | Top of the sky. |
| `sky-mid` | `#3a3257` | `#f1e9e0` | Middle band. |
| `sky-low` | `#8a5a52` | `#f9dcc0` | Just above the horizon. |
| `sky-horizon` | `#ffb84d` at 35% | `#ffb84d` at 30% | The horizon light. **This is the only glow on the site.** |
| `cloud` | `#2b2947` | `#ffffff` | Flat cloud shapes, two layers at 60% and 85%. |

Rules

- One glow, at the horizon. No glowing dots, buttons or text anywhere else.
- Accent covers at most about 5% of any screen outside the sky.
- `warn` is close to `accent`, so status never relies on color alone: partial uptime bars are
  also 60% height.
- No gradients on text. No purple buttons. No glass blur.
- Dark is default; the toggle sets `data-theme` on `<html>` and remembers it; first visit
  follows `prefers-color-scheme`. Switching theme swaps dusk for morning.

## 2. Typography

Self-hosted woff2, no CDN. One superfamily plus one Hebrew serif.

- **IBM Plex Serif** 400, 500: headlines only.
- **IBM Plex Sans** 400, 500, 600: everything you read.
- **IBM Plex Mono** 400, 500: terminal, labels, every number from the server.
- **IBM Plex Sans Hebrew** 400, 500, 600 and **Frank Ruhl Libre** 500 (Hebrew headlines).

Preload only Plex Sans 400 and Plex Serif 500; `font-display: swap`. (The dashboard's lag
trace blamed font loading.)

| Token | Size / line height | Face and weight | Use |
|---|---|---|---|
| `display` | clamp(40px, 5.2vw, 64px) / 1.08 | Serif 500, tracking -0.03em | Hero headline only. |
| `h1` | 44 / 1.12 | Serif 500, -0.02em | Page titles. |
| `h2` | 36 / 1.3 | Serif 400, -0.02em | Chapter headings. Often two short lines. |
| `h3` | 18 / 1.4 | Sans 600 | Card titles, fact titles. |
| `lead` | 18 / 1.6 | Sans 400–500 in `text-2` | The paragraph under a chapter heading. Max 52ch. |
| `body` | 16 / 1.7 | Sans 400 | Running text. Max 68ch. |
| `small` | 14 / 1.45 | Sans 400–500 | Descriptions, footer, pills. |
| `label` | 12 / 1.4 | Mono 500, uppercase, +0.08em | Chart titles, tags, table heads. |
| `data` | 14 / 1.4 | Mono 500, tabular numbers | Uptime %, stats, timestamps, terminal. |

Hebrew: no negative tracking, no uppercase.

## 3. Spacing and layout

- Scale (4-based): `4 8 12 16 24 32 48 64 96 128`.
- **Page frame:** content max 1200px. On screens 1024px and wider the content starts 88px in
  from the frame edge, leaving a gutter for the cable. Phones: 16px padding, no cable.
- **Sky frame:** full width minus 12px each side, `r-xl`, 1px `line`, min-height 88vh.
- **Chapter rhythm:** 128 between chapters, 64 on phones. Inside a chapter: pill, 16, heading,
  16, lead, 48, the real screen, 48, fact columns.
- Text aligns to the start edge. Only the hero headline and the footer are centered.
- **Bento wall:** used once, for the live graphs: 3 columns × 2 rows of chart cards, 16 gap,
  with the uptime card spanning 2 columns. Elsewhere, groups of facts are plain columns
  divided by 1px `line` hairlines, not cards.
- Breakpoints: 1024 (cable appears), 720 (bento becomes 2 columns), 480 (single column).

## 4. Shape and depth

- Radius: `r-xl` 20 (sky frame, big screens), `r-lg` 14 (panels, terminal), `r-md` 8 (buttons,
  pills, cards inside panels, inputs), `r-sm` 4 (tags, code), full (dots only).
- Borders are 1px hairlines. Dark mode has no shadows; depth comes from `bg` → `surface` →
  `raised`.
- Light mode has one shadow on panels: `0 1px 2px rgba(21,22,28,.06), 0 8px 24px rgba(21,22,28,.05)`.
- Hover raises a border to `line-strong`; nothing moves or scales.

## 5. Motion

SVG and CSS only. No canvas, no per-frame JavaScript, no pointer-follow effects (these caused
the dashboard's lag). Four motions exist and no others:

1. **Clouds** drift sideways, two layers, 90s and 140s loops.
2. **Stars** that are live containers pulse gently every 4s; offline ones are still and dim.
3. **Terminal** types once on load (about 1.5s) and stops.
4. **Packet** moves down the cable with the scroll position, using a CSS scroll timeline.
   Browsers without it show a still packet at the current chapter.

UI transitions: 150ms ease-out on color and border. `prefers-reduced-motion`: clouds, stars
and packet are still, terminal text is already complete.

## 6. Components

**The sky (hero art).** Layered SVG inside the sky frame: three color bands, a horizon line
with the glow, two cloud layers of flat hand-drawn shapes, and a 24px dot grid at 40% that
fades toward the horizon. Small random stars in `muted`. On top, the constellation: one star
per public container (CodeZi, flight monitor, dashboard, news, websites, database, proxy),
joined by 1px `line-strong` lines along the real routes through the proxy. Live stars are
`text` with a Mono name in `label`; the proxy star is `accent`. Jacob's container is not
drawn. Morning version: same drawing in ink lines on the pale sky, so it does not depend on
the glow. Original artwork, drawn for this site; no bitmap, no AI image.

**Hero text.** Centered in the upper half of the sky: `display` headline (one sentence, two
lines), `lead` under it, then a primary and a secondary button, 48px tall.

**Terminal.** Overlaps the bottom edge of the sky by a third of its height. `raised`, `r-lg`,
1px `line-strong`, title bar with `avraham@homelab:~` in `muted`, no fake window dots. Body in
`data` at 15px. Prompt in `accent-text`, output in `text`, comments in `muted`. Three commands:
who I am, what I am looking for, and a project list whose lines are real links. The text is
real HTML from the start (Google and screen readers get it); typing is only a reveal. Block
cursor in `accent`, blinks for 10s then stays.

**Chapter bar.** Under the hero, a centered pill row: Homelab · Work · Resume · Contact, each
with a 16px icon, divided by short hairlines. `surface`, 1px `line`, `r-md`, sticky under the
nav once passed; the current chapter is `text`, the rest `muted`.

**The cable.** In the left gutter: a 2px `line-strong` vertical line the full height of the
chapters. At each chapter start, a 12px ring node (`bg` fill, `line-strong` stroke) that turns
`accent` when its chapter is on screen. The packet is a 6×18 rounded bar in `accent`.

**Chapter pill.** Above each chapter heading: `small` weight 500, padding 6 12, `r-md`,
`raised` fill, `text`. The Homelab chapter's pill is tinted `ok` at 10% with `ok` text and a
status dot, because it is live.

**Nav.** 64px bar on `bg` at 85% opacity, bottom hairline, sticky. Start: `AA` monogram and
name. Middle: Work, Homelab, Resume. End: language switch (`EN / עב`), theme toggle, and a
secondary "Download CV" button. Phones: links collapse into a sheet; toggles stay.

**Buttons.** `r-md`, weight 500. Sizes: 40 (padding 0 16, 14px) and 48 for the hero (padding
0 24, 16px).
- Primary: `accent` fill, `accent-ink` text, 1px border white 15% (light: `accent-mark`). One
  per screen. Hover 6% brighter.
- Secondary: black at 35% over the sky, `surface` elsewhere; 1px `line-strong`; `text`.
- Quiet: text plus arrow ("Learn more →"), weight 500, underline on hover.
- Focus: 2px `accent-text` outline, 2px offset. Disabled: 50% opacity.

**Links.** `accent-text`, 1px underline with 3px offset in running text.

**Topology panel** (Homelab chapter, the big real screen). A `surface` panel, `r-xl`, with a
24px dot grid inside. Nodes as on the dashboard's Topology page: rounded rectangles 136×48,
radius 12, `raised` fill, `line-strong` stroke, a status dot, a Mono name and one `muted` line
("up 12 days"). Edges 1.6px `line-strong`; edges with traffic are `accent-mark`, dashed `6 8`,
flowing at 1.6s. Offline node: 55% opacity. No IPs. Jacob's container is not drawn.

**Line chart** (from dashboard `src/ui/Charts.tsx`). Own SVG, no library. Card: `surface`,
1px `line`, `r-md`, padding 16, title in `h3` at 14px. ViewBox 600×150, 130px tall. Line
1.6px, non-scaling; area fades from 35% to 0; three dashed grid lines in `line`; axis text in
`label` `muted`. Hover shows a vertical cursor and writes the value into the legend. CPU and
network out `accent-mark`; memory and network in `data-2`; disk wait `error`. Two series at
most. Empty state: "Not enough data yet."

**Uptime bars** (from the dashboard). 48 bars, 2px gap, 16px tall, radius 2, then the
percentage in `data`. 99% or more `ok`; 50–99% `warn` at 60% height; below 50% `error`; no
data `raised`. One row per public site. Jacob's site is filtered out of the list.

**Status readout.** Live numbers as terminal output in a `raised` panel: one row per number,
name in `muted` on the start side, value in `text` on the end side, both `data` at 20px with
dotted leaders between. Rows: containers running, uptime 30 days, CPU now, memory now. Every
number comes from the API or the row is not shown.

**Fact columns.** Three columns under a chapter's screen, divided by vertical hairlines: 20px
icon, `h3`, two lines of `small` in `text-2`. No card, no background.

**Project entry** (Work chapter). Alternating two-column rows, not a card grid: a real
screenshot in a framed panel (`r-lg`, 1px `line`) on one side; on the other a chapter pill
with the project type, `h2` name, `lead` sentence, tags, and Live / Code quiet links. Live
projects show a status dot from the uptime data.

**Tag.** `label` style, padding 4 8, `r-sm`, `raised` fill, `text-2`. No color coding.

**Resume page.** One 68ch column on `bg`. Name in `h1`, title in `lead`, contact row in `data`
(email, phone, city). Sections Summary, Experience, Education, Skills, each with a `label`
eyebrow and a hairline. Experience entry: role in `h3`, organisation and dates in `muted` Mono
on the same line, bullets in `body`. Sticky "Download PDF" button top-end. Headshot slot: 96px
square, `r-lg`, beside the name; shows the `AA` monogram until the photo is added. Print
stylesheet: light tokens, no nav, fits A4.

**Footer.** The constellation again, small and dim, then the name in Serif at clamp(64px,
14vw, 200px) in `line-strong`, then one row in `small` `muted`: email, phone, GitHub, and
"served from my homelab" with the real 30-day uptime.

**Inputs.** None in v1 (contact is a mail link). If added: height 40, `bg` fill, `line-strong`
border, `r-md`, focus ring as above.

## 7. Imagery and icons

- Icons: Lucide, 16 or 20px, 1.5px stroke, `currentColor`. No emoji.
- Screenshots are real captures of the live sites. No device mockups, stock photos or AI
  images.
- The only illustration is the sky. No trains, circuit traces, game art or mascots.

## 8. Hebrew and RTL

- English at `/`, Hebrew at `/he/` for home and resume. `lang` and `dir="rtl"` on `<html>`.
- Logical CSS properties only; no `left` or `right` in the stylesheet. The cable moves to the
  right gutter automatically.
- Stay left-to-right in Hebrew: terminal, code, charts, uptime bars, numbers, email, URLs.

## 9. Data

Decided: the portfolio reads the dashboard's existing public routes directly. No new backend.

- `GET /api/uptime?hours=1..168` → per site `{pct, ms, buckets:[t, okRatio, ms]}`.
- `GET /api/history?range=hour|day|week|month` → `cpu, mem, netin, netout, iowait`.
- `GET /api/stats` → container list and state for the constellation and topology.
- Poll no faster than the dashboard (uptime 120s, history 5 min). On failure show the last
  value with a `muted` timestamp, never a spinner, never a made-up number.

## 10. Do not

Trains or any Railway artwork, split-flap boards, purple buttons, gradient headings, glass
blur, a second glow, card grids of three equal boxes, dots on the page background, emoji
icons, skill percentage bars, typewriter effects outside the hero, a downloaded HTML template.

---

## Tokens

```css
:root {
  --bg:#10121b; --surface:#171a26; --raised:#1f2331; --line:#2a2e3e; --line-strong:#3b4055;
  --text:#eef0f6; --text-2:#b7bbcb; --muted:#8c92a8;
  --accent:#ffb84d; --accent-ink:#1a1000; --accent-text:#ffb84d; --accent-mark:#ffb84d;
  --data-2:#7aa2ff; --ok:#34d399; --warn:#fbbf24; --error:#f87171; --off:#5a5f73;
  --sky-top:#151a33; --sky-mid:#3a3257; --sky-low:#8a5a52; --sky-horizon:rgba(255,184,77,.35); --cloud:#2b2947;
  --shadow:none;
  --r-xl:20px; --r-lg:14px; --r-md:8px; --r-sm:4px;
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:24px; --s-6:32px; --s-7:48px; --s-8:64px; --s-9:96px; --s-10:128px;
  --content:1200px; --gutter:88px; --measure:68ch;
  --serif:'IBM Plex Serif','Frank Ruhl Libre',Georgia,serif;
  --sans:'IBM Plex Sans','IBM Plex Sans Hebrew',system-ui,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;
  color-scheme:dark;
}
[data-theme="light"] {
  --bg:#f6f4ef; --surface:#ffffff; --raised:#efece5; --line:#dcd8ce; --line-strong:#b9b3a4;
  --text:#15161c; --text-2:#44475a; --muted:#666a7a;
  --accent-text:#8f4a00; --accent-mark:#b06a00;
  --data-2:#3256cc; --ok:#0b7a53; --warn:#a15c00; --error:#c22f2f; --off:#a9a496;
  --sky-top:#dfe7f1; --sky-mid:#f1e9e0; --sky-low:#f9dcc0; --sky-horizon:rgba(255,184,77,.30); --cloud:#ffffff;
  --shadow:0 1px 2px rgba(21,22,28,.06), 0 8px 24px rgba(21,22,28,.05);
  color-scheme:light;
}
```

## Decisions

Settled 2026-11-17 (owner): graphs read the dashboard's existing routes · phone number stays
on the resume · Jacob's container is left out of every graph and list · headshot yes, added
later (slot reserved) · fonts are IBM Plex with serif headlines.

Still open: where the portfolio repo lives and its path until avrahamarazi.com is bought ·
the hero sentence · which 3–4 GitHub repos to show.
