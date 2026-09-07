# Handoff: Mausam — personalized weather app (home + radar)

## Overview
Mausam is a mobile-first weather app for the India Meteorological Department (Ministry of Earth Sciences). Its home screen is **persona-driven**: the same location data is re-cut for the user's selected interest (health, fitness, beach & surf, travel, parents & family, agriculture, commuters). A second screen shows a Doppler-style rainfall radar with a −30 min → +2 h time slider.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes of the intended look and behaviour, not production code to copy. Recreate them in the target codebase using its own patterns. If there is no codebase yet, the recommended stack for the hackathon build is at the end of this README.

`Mausam Home.dc.html` is written in a streaming component format (template + logic class). Read it for structure, copy, and exact style values; do not port the format itself.

## Fidelity
**High fidelity.** Colours, type, spacing, and copy are final. Recreate pixel-close.

---

## Screens

### 1. Home (`Mausam Home.dc.html`)
Mobile portrait, 402 × 874 design frame (iPhone-class). Single vertical scroll, sticky bottom nav.

Order of blocks, top to bottom:
1. **Persona photo hero** — full-width photo confined to the top **470px**, cropped so the human subject is visible, overlaid with two gradients (see "Scrim system"). A 4px accent bar sits at the very top, gradient coloured per persona.
2. **Header** — padding `60px 20px 26px`.
   - Wordmark row: `Mausam` (22px/700, letter-spacing −0.015em) then `मौसम` (Noto Serif Devanagari 500, 15px, `rgba(23,26,28,.66)`), baseline-aligned, gap 9px. Right side: two 32px circular buttons (search, menu), `rgba(255,255,255,.66)` fill, 1px `rgba(23,26,28,.09)` border.
   - Location row: 6px red dot (`#C2452D`), city 16px/600, caret. Sub-line 11px `rgba(23,26,28,.62)`: "Safdarjung station · updated 9:40 AM IST".
   - Current conditions: temperature 80px/300, letter-spacing −0.045em, with 26px/300 "°C"; below it 14px/600 "Haze · Feels like 39°" and 12px `rgba(23,26,28,.66)` "H 36°  L 27° · Humidity 68%". Right: 96px condition icon (sun = radial-gradient circle `#FFE9B0 → #F2A93B → #E0872A` with 34px glow, plus two white cloud shapes).
3. **Alert banner** (conditional) — `#FDF1DC` fill, 1px `rgba(201,119,42,.28)`, radius 16, 13/14px padding. 22px rounded-square `#C9772A` badge with "!". Eyebrow 12px/700 `#8A4F13` letter-spacing .04em; body 12.5px/1.45 `#5D3A11`.
4. **Persona chips** — horizontal scroll row, gap 8, padding `2px 20px 12px`. Chip: radius 999, padding `9px 14px`, 12.5px/600, 6px colour dot, 1px border, `transition: background .18s, color .18s`. Inactive: fill `rgba(255,255,255,.9)`, text `rgba(23,26,28,.72)`, border `rgba(23,26,28,.10)`, dot = persona colour. Active: fill `#171A1C`, text `#fff`, white dot.
5. **Section heading** — left "For you · <persona>" 13px/700; right meta 11px `rgba(23,26,28,.66)`.
6. **Metric tiles** — 2-column grid, gap 10. Card: `#fff`, 1px `rgba(23,26,28,.07)`, radius 18, padding `13px 14px 12px`, shadow `0 1px 2px rgba(23,26,28,.04)`. Contents: eyebrow 9.5px/700 letter-spacing .13em `rgba(23,26,28,.66)`; value 23px/600 (−0.03em) + unit 11px/600; severity row = 7px dot + 11.5px/600 text in the severity colour; 4px progress bar, track `rgba(23,26,28,.07)`, fill = severity colour, width = tile percentage.
7. **Advisory panel** — white card, radius 20, padding `15px 16px 6px`. Title 13px/700, meta 11px. Rows separated by 1px `rgba(23,26,28,.07)` top borders, 11px vertical padding: label 13px/600, note 11.5px `rgba(23,26,28,.62)`, right value 13.5px/700 in the row's severity colour.
8. **Guidance card** — `#EAF0EC` fill, 1px `rgba(46,125,91,.22)`, radius 18. 22px `#2E7D5B` square, eyebrow "GUIDANCE FOR YOU" 9.5px/700 `#2E7D5B`, body 12.5px/1.5 `#22392F`.
9. **7-day outlook** — white card, radius 20. Header "7-day outlook" 13px/700 + "Rain probability" 11px. Then a 7-column grid (gap 2), each column: day 10.5px/700 `rgba(23,26,28,.66)`; 18px condition dot; 6 × 44px vertical bar (track `rgba(23,26,28,.07)`, fill `#2C6EA8` bottom-anchored, height = rain %); rain % 10px/700 `#2C6EA8`; high 12px/700; low 11px `rgba(23,26,28,.62)`.
10. **Footer** — 10.5px/1.6 centred: "India Meteorological Department / Ministry of Earth Sciences, Government of India".
11. **Bottom nav** — sticky, `rgba(245,244,239,.86)` + `backdrop-filter: blur(14px)`, 1px top border, 4-column grid, padding `10px 8px 30px`. Items: Home (active, `#171A1C` icon + label), Radar (links to radar screen), Alerts, Saved (inactive `rgba(23,26,28,.66)`).

**Scrim system (per persona).** Two stacked gradients over the photo, `pointer-events: none`, both 470px tall:
```
linear-gradient(180deg, rgba(245,244,239,.22) 0%, rgba(245,244,239,.14) 50%,
                rgba(245,244,239,.55) 84%, rgba(245,244,239,.97) 100%),
linear-gradient(96deg,  <tint>.88 0%, <tint>.62 36%, <tint>.06 74%, <tint>0 100%)
```
The vertical pass fades the photo into the page; the 96° pass protects the left text column. Per-persona tint: health `250,244,236`, fitness `244,247,236`, beach `248,243,242`, travel `238,243,250`, family `250,245,236`, agri `242,247,238`, commute `238,246,247`. Below the hero the page has a static texture: three soft radial glows (blue/amber/green, ≤.13 alpha) plus `repeating-linear-gradient(135deg, rgba(23,26,28,.035) 0 1px, transparent 1px 7px)` at 50% opacity.

**Photo cropping.** Each hero photo is placed in a 470px `overflow:hidden` band with an inner absolutely-positioned wrapper that is intentionally larger and offset, so the subject lands in the right-hand half (e.g. health `left:0; right:-190px; top:-300px; height:790px`). In a real app use `object-fit: cover` + `object-position` per asset instead, and keep the subject clear of the left text column.

### 2. Radar (`Mausam Radar.html`)
Dark screen (`#0C1622`), same 402 × 874 frame.
- Header: "Radar / रडार" + back link; sub-line "Doppler composite · New Delhi (Palam) · <timestamp>".
- Layer chips: Rainfall / Cloud cover / Lightning / Wind. Active chip `#F5F4EF` on dark.
- Map panel: radius 22, `radial-gradient(120% 90% at 50% 10%, #16283C, #0A121C 70%)`, 1px `rgba(255,255,255,.10)`. Real India geometry via d3-geo + TopoJSON (world-atlas 110m, `d3.geoMercator().fitExtent`). Neighbours at 3.5% white fill; India outline `rgba(255,255,255,.55)`; 5° graticule at 6% white. Radar echoes = radial-gradient circles clipped to the India path, ramp `#4FB8C9 → #3E8FD8 → #7A5AA8 → #C2452D → #8E2418`. City markers with labels; New Delhi highlighted (white dot, `#C2452D` ring).
- Legend (bottom-left, glass panel) changes per layer: RAINFALL mm/h 2.5/15/65+, GUSTS km/h 20/45/70+, CLOUD COVER % 20/60/100, STRIKES / 10 MIN 1/12/40+.
- Wind layer: fixed 34px direction vectors with arrowheads over dimmed cells. Cloud layer: white-grey `#echoCloud` gradient mass.
- Time control: play/pause button (38px circle) + range slider from −30 to +120 in 5-minute steps; ticks "−30 min / NOW / +2 h nowcast". Playing advances 5 min per ~90ms and loops.
- Nowcast card: `rgba(201,119,42,.16)` fill, `#E2A350` badge, eyebrow `#F0C889`, body `#F5EFE3`; copy changes per layer.
- Bottom nav mirrors home, Radar active.

---

## Interactions & behaviour
- Tapping a persona chip swaps tiles, advisory panel, guidance copy, hero photo, scrim tint, and accent bar. No page transition; chips animate colour over 180ms.
- Persona selection and last city persist (localStorage).
- Radar: chips switch layers instantly; slider scrubs time; play loops −30 → +120.
- Loading: skeleton tiles (3–4 placeholder cards) while data resolves. Error: keep the header, replace tiles with a single card ("City not found" / "IMD feed unavailable — showing last update at HH:MM").
- Responsive: content column max-width 420px, centred on desktop; nothing below 402px needs to reflow.

## State
`city`, `coords`, `activePersona`, `weather` (current), `hourly`, `daily`, `airQuality`, `savedCities[]`, `loading`, `error`. Radar adds `layer`, `t` (minutes offset), `playing`.

## Design tokens
- Ink: `#171A1C`; secondary text `rgba(23,26,28,.66)`; tertiary `rgba(23,26,28,.62)` (never lighter — 4.5:1 minimum at these sizes).
- Page: `#F5F4EF`; card `#fff`; card border `rgba(23,26,28,.07)`; body backdrop `#E7E5DF`.
- Severity: ok `#2E7D5B`, warn `#C9772A`, bad `#C2452D`, info `#2C6EA8`.
- Persona accents: health `#C2452D`, fitness `#2E7D5B`, beach `#2C6EA8`, travel `#7A5AA8`, family `#C9772A`, agri `#4C7A2E`, commute `#1F6E7A`.
- Dark screen: bg `#0C1622`, panel `#16283C`, text `#fff` / `rgba(255,255,255,.72)`.
- Radius: 999 chips, 20 large cards, 18 tiles/banners, 16 alert, 14 legend, 12 small.
- Shadow: `0 1px 2px rgba(23,26,28,.04)` cards; `0 40px 80px rgba(0,0,0,.18)` device frame only.
- Spacing scale: 4 / 6 / 8 / 10 / 12 / 14 / 20 / 26 px. Page gutter 20px.
- Type: **Noto Sans** 300/400/600/700 for UI; **Noto Serif Devanagari** 500/600 for Devanagari wordmark. Sizes: 80 / 26 / 23 / 22 / 16 / 14 / 13.5 / 13 / 12.5 / 12 / 11.5 / 11 / 10.5 / 9.5.
- Motion: 180ms colour transitions; radar frame step ~90ms.

## Assets
- Seven persona hero photos supplied by the user (in `assets/`, named per persona). They are placeholders for licensed imagery — replace with IMD-owned or licensed stock before shipping, keeping the same crop rule (subject on the right).
- Weather condition icons are CSS shapes in the prototype (gradient circle + cloud blobs). Replace with the real IMD icon set; the design expects a 96px hero icon and 18px forecast dots.
- Radar geometry: `world-atlas@2.0.2/countries-110m.json` (Natural Earth, public domain).

## Data & persona rules
`persona-config.json` in this folder is the source of truth: per persona, the four tiles (field, unit, severity thresholds or derivation rule), the advisory panel rows, and the guidance-copy rule. Implement severity as a shared function `severity(field, value) -> 'ok'|'warn'|'bad'|'info'` so colours never diverge between tiles.

### Recommended feeds
- **OpenWeatherMap** (free): current weather, 5-day/3-hourly forecast, air pollution. Note: the free tier has **no 7-day daily** endpoint — group the 3-hourly data by day, or use Open-Meteo for a true 7-day strip.
- **Open-Meteo** (free, no key): UV index, visibility, wind gusts, precipitation probability, soil moisture 0–7cm, sunrise/sunset. This covers most agriculture/commuter fields.
- **Mock for the demo, label as sample data:** pollen, wave height, sea temperature, tide times, safety flag, traffic delay. Production sources: CPCB (AQI), INCOIS (sea state and tides), IMD Agromet (advisories).
- Do not ship the API key in the client bundle for anything beyond the demo — put a tiny serverless proxy in front of it.

## Suggested build (if starting fresh)
Vite + React, plain CSS with CSS custom properties for the tokens above, `useState`/`useEffect`, localStorage for city + persona, deploy on Vercel. Files: `api/weather.js` (`getCurrentWeather`, `getForecast`, `getAirQuality`, `getOpenMeteo`), `utils/personaConfig.js` (import `persona-config.json`), `utils/severity.js`, and components `Header`, `PersonaSwitcher`, `PersonaCard`, `MetricTile`, `AdvisoryPanel`, `GuidanceCard`, `ForecastStrip`, `BottomNav`, `RadarScreen`.

Keep all **seven** personas as scrollable chips — no "More" dropdown, and no Event Planners persona (removed from the design).

## Files in this bundle
- `Mausam Home.dc.html` — home screen design reference (all 7 personas, tweakable props)
- `Mausam Radar.html` — radar screen design reference (runs standalone in a browser)
- `persona-config.json` — persona → tiles / thresholds / panel rows / guidance rules
- `assets/` — the seven persona hero photos
