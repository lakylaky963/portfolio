# portfolio

Personal portfolio of Avraham Arazi. Static site: plain HTML, CSS and one small script. No build step, no CDN.

- `DESIGN.md` is the design system. Every page follows it; use the tokens in `css/site.css`, never raw values.
- `index.html` home, `resume/index.html` resume (`resume/Avraham-Arazi-CV.pdf` is generated from it: headless Chrome `--print-to-pdf --no-pdf-header-footer`; regenerate after editing the resume).
- Live numbers come from the homelab dashboard's public routes (`/api/stats`, `/api/uptime`, `/api/history`) on the same host. The base path is the `api-base` meta tag in `index.html`. A tile with no data is hidden, never faked.
- Fonts: IBM Plex (SIL OFL, see `fonts/LICENSE.txt`), Latin subset, self-hosted.

## Run locally

Any static server works, for example `python3 -m http.server` in this folder. Live tiles stay hidden without the dashboard API.

## Deploy

Served by nginx on the homelab at `/portfolio/` (see homelab-ops). Run `.\deploy.ps1` from the laptop: it packages the site (without `.git`, `deploy.ps1`, `README.md`, `DESIGN.md`), copies it to the host with `scp`, pushes it into CT 101 with `pct push` and unpacks it into `/var/www/portfolio`. Needs the SSH key for `root@server`; nothing to build. Undo: `pct rollback 101 pre-portfolio` (while that snapshot exists) or redeploy an earlier commit.

## Not built yet

Hebrew pages (`/he/`), the headshot, the yeshiva site entry, the `/playground` scene.
