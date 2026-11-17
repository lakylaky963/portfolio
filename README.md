# portfolio

Personal portfolio of Avraham Arazi. Static site: plain HTML, CSS and one small script. No build step, no CDN.

- `DESIGN.md` is the design system. Every page follows it; use the tokens in `css/site.css`, never raw values.
- `index.html` home, `resume/index.html` resume.
- Live numbers come from the homelab dashboard's public routes (`/api/stats`, `/api/uptime`, `/api/history`) on the same host. The base path is the `api-base` meta tag in `index.html`. A tile with no data is hidden, never faked.
- Fonts: IBM Plex (SIL OFL, see `fonts/LICENSE.txt`), Latin subset, self-hosted.

## Run locally

Any static server works, for example `python3 -m http.server` in this folder. Live tiles stay hidden without the dashboard API.

## Deploy

Served by nginx on the homelab at `/portfolio/` (see homelab-ops). Copy the repo's files to the web root; there is nothing to build.

## Not built yet

Hebrew pages (`/he/`), a real PDF of the resume, the headshot, the yeshiva site entry, the `/playground` scene.
