# Mausam — working app

A functioning build of the [design handoff](../README.md): persona-driven home screen +
Doppler radar screen. Plain HTML/CSS/JS (ES modules), no build step — this machine has no
Node.js installed, so this runs directly in any browser via a static file server.

## Run it

```bash
cd app
python3 -m http.server 5173
```

Then open http://localhost:5173/index.html. (Opening `index.html` directly via `file://`
won't work — ES modules require an http origin.)

## What's real vs. mocked

- **Live**: current conditions, 7-day outlook, AQI (PM2.5 → Indian CPCB AQI), UV, humidity,
  wind, gusts, visibility, soil moisture, sunrise/sunset — all from [Open-Meteo](https://open-meteo.com)
  (no API key needed). City search uses Open-Meteo's geocoding API.
- **Mocked, labelled "sample data"**: pollen index, wave height, sea temperature, tide times,
  safety flag, rip current, traffic delay — per the README's "no free feed" list. These are
  deterministic per city/day (seeded), not random on every reload.
- **Travel persona**: saved destinations (default: London, Bengaluru, Leh) are fetched live;
  add your current city as a destination with the button on that screen.

## Structure

- `index.html` / `radar.html` — the two screens
- `css/styles.css` — design tokens + component styles (matches the handoff's spec)
- `js/weatherApi.js` — Open-Meteo fetch layer
- `js/metrics.js` — normalizes raw API responses into the fields `persona-config.json` expects
- `js/personas.js` — builds tiles/panel/guidance copy per persona
- `js/severity.js` — shared `classify()` so tile colors never diverge (per README)
- `js/mock.js`, `js/travel.js` — the mocked fields and saved-destination handling
- `js/radarApp.js` — ported from `Mausam Radar.html`'s d3 script, wired to real city selection
- `data/persona-config.json`, `assets/*.png` — copied from the handoff bundle

## Known gaps vs. the handoff

- No Alerts/Saved screens (nav items are inert, as they're out of scope in the handoff).
- Radar's storm cells are the same illustrative fixed cells as the design reference (no live
  Doppler feed exists to swap in — IMD doesn't expose one publicly).
- AQI is derived from Open-Meteo's PM2.5 only (no CPCB station feed).
