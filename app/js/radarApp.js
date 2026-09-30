import './pwa.js';
import { loadState } from './utils.js';
import { renderBottomNav, renderStatusBar } from './icons.js';
import { t as tr } from './i18n.js';
import './i18nStrings.js';
import { BANDS, bandLabel, gridPoints, fetchGrid, slotAt } from './precip.js';
import { LAYERS, layerBy, stormPoints } from './layers.js';
import { cssRamp, lut } from './scales.js';
import { buildStencil, sampleField, paintField, clearField } from './field.js';
import { fetchSatellite, paintSatellite } from './satellite.js';
import { STEP } from './grid.js';

const statusWrap = document.getElementById('status-bar-wrap');
if (statusWrap) statusWrap.innerHTML = renderStatusBar(true);

const navWrap = document.getElementById('nav-wrap');
if (navWrap) navWrap.innerHTML = renderBottomNav('radar', 0);

// Static labels baked into radar.html — set from JS so they follow the
// selected language instead of always showing English/hardcoded Hindi.
document.querySelector('.radar-title .en').textContent = tr('radar.title');
document.querySelector('.radar-title .hi')?.remove();
document.querySelector('.radar-back').textContent = tr('radar.back_home');
// "Range 250 km" describes a Doppler sweep around one station. This map is
// the whole country from a forecast model — there is no sweep and no
// 250 km. The badge says what the picture actually is.
document.querySelector('.range-badge').textContent = tr('radar.coverage');
const sliderTicks = document.querySelectorAll('.slider-ticks span');
if (sliderTicks[0]) sliderTicks[0].textContent = tr('radar.minus30');
if (sliderTicks[1]) sliderTicks[1].textContent = tr('radar.now');
if (sliderTicks[2]) sliderTicks[2].textContent = tr('radar.plus2h');
document.querySelector('.nowcast-eyebrow').textContent = tr('radar.nowcast_title');

const CITIES = [
  { n: 'New Delhi', lon: 77.21, lat: 28.61, hq: true },
  { n: 'Mumbai', lon: 72.88, lat: 19.08 },
  { n: 'Kolkata', lon: 88.36, lat: 22.57 },
  { n: 'Chennai', lon: 80.27, lat: 13.08 },
  { n: 'Guwahati', lon: 91.75, lat: 26.14 },
];

const saved = loadState();
const cityName = saved.city?.name || 'New Delhi';
document.getElementById('city-label').textContent = cityName === 'New Delhi' ? 'New Delhi (Palam)' : cityName;

// Keep the map's highlighted station in sync with the header. If the
// selected city isn't one of the five fixed markers, plot it rather
// than leaving Delhi highlighted while the header names another city.
const hqCity = CITIES.find((c) => c.n === cityName);
if (hqCity) {
  CITIES.forEach((c) => (c.hq = c === hqCity));
} else if (saved.city?.lat != null && saved.city?.lon != null) {
  CITIES.forEach((c) => (c.hq = false));
  CITIES.push({ n: cityName, lon: saved.city.lon, lat: saved.city.lat, hq: true });
}

const svg = d3.select('#map');
const over = d3.select('#overlay');
const canvas = document.getElementById('field');
const cctx = canvas.getContext('2d');

let projection, path, W = 0, H = 0, t = 0, playing = false, raf = null;
let layerKey = 'radar';
let india = null, stencil = null, gridPts = [];
let grid = null, gridFailed = false;
let sat = null, satFailed = false;

function stampFor(mins) {
  const base = new Date();
  base.setMinutes(base.getMinutes() + mins);
  const h = base.getHours(), m = String(base.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM', hh = ((h + 11) % 12) + 1;
  return (mins <= 0 ? tr('radar.observed') + ' ' : tr('radar.forecast') + ' ') + hh + ':' + m + ' ' + ap;
}

function waitForSize(el) {
  return new Promise((resolve) => {
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return resolve(r);
      requestAnimationFrame(check);
    };
    check();
  });
}

// ---------- the layer menu ----------

// The swatch beside each name is that layer's own ramp, sampled rather
// than picked by hand — so a change to a scale shows up in the menu
// without anyone remembering to update it.
//
// The samples are the three values the scale names as representative, not
// three even fractions of it. Evenly sampling the rain scale showed what
// lives at the top of it — a rate India records about once a decade — so
// the radar's swatch came out blood red above a map that was entirely cyan.
function swatch(layer) {
  // The satellite layer has no ramp; a blue marble stands in for one.
  if (layer.satellite) return 'background-image:radial-gradient(circle at 34% 30%,#6FA9D8,#2E5F8F 52%,#123049)';
  const table = lut(layer.scale);
  const at = (v) => {
    const i = Math.max(0, Math.min(255, Math.round(((v - layer.scale.min) / (layer.scale.max - layer.scale.min)) * 255)));
    return `rgba(${table[i * 4]},${table[i * 4 + 1]},${table[i * 4 + 2]},${(table[i * 4 + 3] / 255).toFixed(2)})`;
  };
  const [a, b, c] = layer.scale.swatch;
  return `background-image:linear-gradient(135deg,${at(a)},${at(b)},${at(c)});background-color:#16283C`;
}

const menu = document.getElementById('layerMenu');
const menuBtn = document.getElementById('layerBtn');
const menuLabel = document.getElementById('layerBtnLabel');

menu.innerHTML = LAYERS.map((l) => `<button type="button" role="menuitem" class="layer-item${l.key === layerKey ? ' on' : ''}" data-layer="${l.key}">`
  + `<span>${tr(l.label)}</span><i style="${swatch(l)}"></i></button>`).join('');

function setMenuOpen(open) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuLabel.textContent = open ? tr('radar.layers') : tr(layerBy(layerKey).label);
}
menuBtn.addEventListener('click', () => setMenuOpen(menu.hidden));
menu.addEventListener('click', (e) => {
  const item = e.target.closest('.layer-item');
  if (!item) return;
  selectLayer(item.dataset.layer);
  setMenuOpen(false);
});
// Tapping the map is the obvious way to dismiss it.
document.querySelector('.map-panel').addEventListener('click', (e) => {
  if (!menu.hidden && !e.target.closest('.layer-menu, .layer-btn')) setMenuOpen(false);
});

function selectLayer(key) {
  layerKey = key;
  menu.querySelectorAll('.layer-item').forEach((el) => el.classList.toggle('on', el.dataset.layer === key));
  menuLabel.textContent = tr(layerBy(key).label);
  // The satellite image is fetched for the rectangle on screen, so it is
  // only asked for when that layer is actually chosen.
  if (layerBy(key).satellite && !sat && !satFailed) loadSatellite();
  draw();
}
menuLabel.textContent = tr(layerBy(layerKey).label);

// ---------- data ----------

Promise.all([
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json'),
  waitForSize(document.getElementById('map')),
]).then(([topo, rect]) => {
  const countries = topojson.feature(topo, topo.objects.countries);
  india = countries.features.find((f) => f.id === '356');

  buildMap(countries, rect);

  // The grid is clipped to the country here, where the outline already
  // exists — asking for the whole bounding box would spend most of the
  // request on the Arabian Sea and the Bay of Bengal.
  gridPts = gridPoints((lonLat) => d3.geoContains(india, lonLat));
  fetchGrid(gridPts)
    .then((g) => { grid = g; buildStencilNow(); draw(); })
    .catch(() => { gridFailed = true; draw(); });

  // The projection is fitted to a fixed pixel size, and the SVG has no
  // viewBox, so nothing rescales on its own — a rotation, or iOS Safari
  // collapsing its address bar mid-scroll, would leave India clipped off
  // one edge with dead space on another. Refit whenever the panel resizes.
  let resizeDebounce = null;
  new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    if (r.width < 1 || r.height < 1) return;
    if (Math.abs(r.width - W) < 2 && Math.abs(r.height - H) < 2) return;
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      buildMap(countries, r);
      buildStencilNow();
      // The satellite image was cut to the old rectangle.
      sat = null;
      if (layerBy(layerKey).satellite) loadSatellite();
      draw();
    }, 120);
  }).observe(document.getElementById('map'));
});

function loadSatellite() {
  if (!projection) return;
  const tl = projection.invert([0, 0]);
  const br = projection.invert([W, H]);
  if (!tl || !br) return;
  fetchSatellite([[tl[0], br[1]], [br[0], tl[1]]], Math.round(W), Math.round(H))
    .then((s) => { sat = s; draw(); })
    .catch(() => { satFailed = true; draw(); });
}

function buildStencilNow() {
  if (!projection || !grid?.length) return;
  stencil = buildStencil(grid, (xy) => projection.invert(xy), W, H, STEP);
}

// ---------- the map ----------

function buildMap(countries, rect) {
  W = rect.width; H = rect.height;
  svg.selectAll('*').remove();
  over.selectAll('*').remove();
  projection = d3.geoMercator().fitExtent([[16, 22], [W - 16, H - 22]], india);
  path = d3.geoPath(projection);

  // Backing store at device resolution so the coastline the field is
  // clipped to stays crisp on a phone.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const graticule = d3.geoGraticule().step([5, 5]);
  svg.append('path').datum(graticule()).attr('d', path)
    .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,.06)').attr('stroke-width', 1);

  svg.append('g').selectAll('path').data(countries.features.filter((f) => f.id !== '356')).join('path')
    .attr('d', path).attr('fill', 'rgba(255,255,255,.035)').attr('stroke', 'rgba(255,255,255,.10)').attr('stroke-width', .8);

  svg.append('path').datum(india).attr('d', path)
    .attr('fill', 'rgba(255,255,255,.055)').attr('stroke', 'rgba(255,255,255,.55)').attr('stroke-width', 1.4);

  over.append('g').attr('id', 'arrows');
  over.append('g').attr('id', 'storms');

  const cg = over.append('g');
  CITIES.forEach((c) => {
    const p = projection([c.lon, c.lat]);
    if (c.hq) {
      cg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 5)
        .attr('fill', 'none').attr('stroke', '#C2452D').attr('stroke-width', 1.8)
        .attr('class', 'pulse-ring');
    }
    cg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', c.hq ? 4 : 2.4)
      .attr('fill', c.hq ? '#F5F4EF' : 'rgba(245,244,239,.72)')
      .attr('stroke', c.hq ? '#C2452D' : 'none').attr('stroke-width', c.hq ? 2 : 0);
    // A halo behind the label, because these now sit over a colour field
    // rather than a dark map and white-on-pale was unreadable.
    const label = (fill, stroke) => cg.append('text').attr('x', p[0] + 7).attr('y', p[1] + 3.5)
      .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', stroke ? 2.6 : 0)
      .attr('stroke-linejoin', 'round').attr('paint-order', 'stroke')
      .attr('font-size', c.hq ? 10.5 : 9).attr('font-weight', c.hq ? 700 : 600)
      .attr('font-family', "'Noto Sans',sans-serif").text(c.n);
    label(c.hq ? '#fff' : 'rgba(255,255,255,.82)', 'rgba(8,14,22,.72)');
  });

  draw();
}

// The India outline, painted into the 2D context so the canvas can clip to
// it. d3 draws to a canvas path as readily as to an SVG string.
function clipIndia(ctx) {
  ctx.beginPath();
  d3.geoPath(projection, ctx)(india);
}

// ---------- drawing ----------

function draw() {
  if (!projection) return;
  const layer = layerBy(layerKey);
  const ready = grid && grid.length && stencil;
  // A frozen layer is a total over a window, so the slider must not move
  // it — otherwise dragging changes only where the window starts, which
  // reads as the map responding when it is not.
  const when = Date.now() + (layer.frozen ? 0 : t * 60000);
  const slot = ready ? slotAt(grid, when) : 0;

  // ----- the field, or the satellite image in its place -----
  if (layer.satellite) {
    if (sat) paintSatellite(cctx, sat, clipIndia, W, H);
    else clearField(cctx, W, H);
  } else if (ready) {
    const values = sampleField(stencil, layer.read(grid, slot));
    paintField(cctx, stencil, values, layer.scale, clipIndia, W, H);
  } else {
    clearField(cctx, W, H);
  }

  drawArrows(layer, ready, slot);
  drawStorms(layer, ready, slot);
  drawLegend(layer);

  // ----- what this is, and what it is not -----
  const src = document.getElementById('radar-sub-prefix');
  if (src) {
    src.textContent = layer.satellite
      ? (sat ? tr('src.satellite', { date: sat.date }) : tr(layer.source, { date: '…' }))
      : tr(layer.source);
  }
  const note = document.getElementById('layerNote');
  if (note) {
    const text = layer.note ? tr(layer.note) : '';
    note.textContent = text;
    note.hidden = !text;
  }
  document.getElementById('stamp').textContent = layer.frozen || layer.satellite
    ? tr('radar.now') : stampFor(t);

  // ----- the sentence under the map -----
  const cell = document.getElementById('cellText');
  if (gridFailed && !layer.satellite) cell.textContent = tr('radar.grid_failed');
  else if (layer.satellite && satFailed) cell.textContent = tr('radar.sat_failed');
  else if (layer.satellite) cell.textContent = sat ? layer.summary(grid, slot, sat) : tr('radar.loading');
  else if (!ready) cell.textContent = tr('radar.loading');
  else cell.textContent = layer.summary(grid, slot);
}

function drawArrows(layer, ready, slot) {
  const g = over.select('#arrows');
  // Thinned to every other grid point: at 66 arrows the map was a pincushion
  // and the colour underneath could not be read.
  const data = layer.arrows && ready
    ? grid.filter((p, i) => i % 2 === 0 && Number.isFinite(p.windSpeed?.[slot]))
    : [];
  const sel = g.selectAll('g.arrow').data(data);
  sel.exit().remove();
  const en = sel.enter().append('g').attr('class', 'arrow');
  en.append('path').attr('fill', 'none').attr('stroke', 'rgba(245,250,252,.85)')
    .attr('stroke-width', 1.6).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  en.merge(sel).select('path').attr('d', (p) => {
    const xy = projection([p.lon, p.lat]);
    // Meteorological direction is where the wind comes FROM; the arrow has
    // to point where it is going.
    const a = ((p.windDir?.[slot] ?? 0) + 180) * Math.PI / 180;
    const ux = Math.sin(a), uy = -Math.cos(a);
    // Longer shaft for stronger wind, so speed reads twice: colour and length.
    const L = 9 + Math.min(1, (p.windSpeed[slot] || 0) / 60) * 12;
    const tipX = xy[0] + ux * L, tipY = xy[1] + uy * L;
    const b = 4.5, ang = Math.atan2(uy, ux);
    const p1 = [tipX - b * Math.cos(ang - 0.5), tipY - b * Math.sin(ang - 0.5)];
    const p2 = [tipX - b * Math.cos(ang + 0.5), tipY - b * Math.sin(ang + 0.5)];
    return `M${xy[0] - ux * L},${xy[1] - uy * L}L${tipX},${tipY}`
      + `M${p1[0]},${p1[1]}L${tipX},${tipY}L${p2[0]},${p2[1]}`;
  });
}

function drawStorms(layer, ready, slot) {
  const g = over.select('#storms');
  const data = layer.storms && ready ? stormPoints(grid, slot) : [];
  const sel = g.selectAll('g.storm').data(data, (s) => s.i);
  sel.exit().remove();
  const en = sel.enter().append('g').attr('class', 'storm storm-mark');
  // A bolt, drawn rather than typed: an emoji would render differently on
  // every platform and carry no colour control.
  en.append('path').attr('d', 'M1.6,-7 L-3.2,0.6 L-0.2,0.6 L-1.6,7 L3.4,-0.8 L0.4,-0.8 Z')
    .attr('fill', '#FFD86B').attr('stroke', 'rgba(20,12,0,.55)').attr('stroke-width', .9)
    .attr('stroke-linejoin', 'round');
  en.merge(sel).attr('transform', (s) => {
    const xy = projection([s.p.lon, s.p.lat]);
    return `translate(${xy[0]},${xy[1]})`;
  });
}

function drawLegend(layer) {
  const box = document.getElementById('legend');
  const ramp = document.getElementById('legRamp');
  const ticks = document.getElementById('legTicks');
  if (!layer.legend) { box.hidden = true; return; }
  box.hidden = false;
  document.getElementById('legTitle').textContent = tr(layer.legend.title);
  if (layer.legend.kind === 'bands') {
    // Swatch, name, and the rate that puts you in that band — so the map's
    // colours can be read without guessing where you are along a gradient.
    ramp.style.display = 'none';
    ticks.className = 'legend-bands';
    ticks.innerHTML = BANDS.map((b) => '<div class="legend-band">'
      + `<i style="background:${b.color}"></i>${bandLabel(b.key)}`
      + `<em>${b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`}</em></div>`).join('');
  } else {
    ramp.style.display = '';
    ticks.className = 'legend-ticks';
    ramp.style.background = cssRamp(layer.scale);
    ticks.innerHTML = layer.legend.ticks.map((v) => `<span>${v}</span>`).join('');
  }
}

// ---------- controls ----------

const slider = document.getElementById('time');
slider.addEventListener('input', (e) => { t = +e.target.value; draw(); });

const playBtn = document.getElementById('play');
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '❙❙' : '▶';
  if (playing) loop(); else cancelAnimationFrame(raf);
});
let last = 0;
function loop(ts) {
  if (!playing) return;
  if (!last || ts - last > 90) {
    last = ts || 0;
    t = t >= 120 ? -30 : t + 5;
    slider.value = t; draw();
  }
  raf = requestAnimationFrame(loop);
}

selectLayer(layerKey);
