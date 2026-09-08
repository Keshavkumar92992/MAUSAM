import { loadState } from './utils.js';
import { renderBottomNav, renderStatusBar } from './icons.js';
import { t as tr } from './i18n.js';
import './i18nStrings.js';

const statusWrap = document.getElementById('status-bar-wrap');
if (statusWrap) statusWrap.innerHTML = renderStatusBar(true);

const navWrap = document.getElementById('nav-wrap');
if (navWrap) navWrap.innerHTML = renderBottomNav('radar', 0, true);

// Static labels baked into radar.html — set from JS so they follow the
// selected language instead of always showing English/hardcoded Hindi.
document.querySelector('.radar-title .en').textContent = tr('radar.title');
document.querySelector('.radar-title .hi')?.remove();
document.querySelector('.radar-back').textContent = tr('radar.back_home');
document.querySelectorAll('.layer-chip').forEach((el) => {
  const key = { rain: 'radar.layer_rain', cloud: 'radar.layer_cloud', lightning: 'radar.layer_lightning', wind: 'radar.layer_wind' }[el.dataset.layer];
  if (key) el.textContent = tr(key);
});
document.querySelector('.range-badge').textContent = tr('radar.range');
const sliderTicks = document.querySelectorAll('.slider-ticks span');
if (sliderTicks[0]) sliderTicks[0].textContent = tr('radar.minus30');
if (sliderTicks[1]) sliderTicks[1].textContent = tr('radar.now');
if (sliderTicks[2]) sliderTicks[2].textContent = tr('radar.plus2h');
document.querySelector('.nowcast-eyebrow').textContent = tr('radar.nowcast_title');
document.getElementById('radar-sub-prefix').textContent = tr('radar.simulated');

const CELLS = [
  { lon: 76.4, lat: 27.6, r: 62, i: 3, vx: 0.0055, vy: 0.0032, grow: 0.004 },
  { lon: 73.4, lat: 19.4, r: 48, i: 2, vx: 0.0040, vy: 0.0018, grow: 0.001 },
  { lon: 88.0, lat: 22.2, r: 55, i: 3, vx: -0.0022, vy: 0.0026, grow: 0.002 },
  { lon: 80.4, lat: 13.4, r: 38, i: 1, vx: -0.0030, vy: 0.0012, grow: 0.001 },
  { lon: 92.6, lat: 26.2, r: 58, i: 4, vx: -0.0018, vy: -0.0010, grow: 0 },
  { lon: 76.1, lat: 10.4, r: 44, i: 2, vx: 0.0026, vy: 0.0016, grow: 0.001 },
  { lon: 70.9, lat: 22.6, r: 34, i: 1, vx: 0.0048, vy: 0.0022, grow: 0.002 },
];
const CITIES = [
  { n: 'New Delhi', lon: 77.21, lat: 28.61, hq: true },
  { n: 'Mumbai', lon: 72.88, lat: 19.08 },
  { n: 'Kolkata', lon: 88.36, lat: 22.57 },
  { n: 'Chennai', lon: 80.27, lat: 13.08 },
  { n: 'Guwahati', lon: 91.75, lat: 26.14 },
];
const RAMP = ['#4FB8C9', '#3E8FD8', '#7A5AA8', '#C2452D', '#8E2418'];

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
let projection, path, W = 0, H = 0, t = 0, layer = 'rain', playing = false, raf = null;

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

Promise.all([
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json'),
  waitForSize(document.getElementById('map')),
]).then(([topo, rect]) => {
  const countries = topojson.feature(topo, topo.objects.countries);
  const india = countries.features.find((f) => f.id === '356');

  buildMap(countries, india, rect);

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
    resizeDebounce = setTimeout(() => buildMap(countries, india, r), 120);
  }).observe(document.getElementById('map'));
});

function buildMap(countries, india, rect) {
  W = rect.width; H = rect.height;
  svg.selectAll('*').remove();
  projection = d3.geoMercator().fitExtent([[16, 22], [W - 16, H - 22]], india);
  path = d3.geoPath(projection);

  const defs = svg.append('defs');
  RAMP.forEach((c, k) => {
    const g = defs.append('radialGradient').attr('id', 'echo' + k);
    g.append('stop').attr('offset', '0%').attr('stop-color', c).attr('stop-opacity', .92);
    g.append('stop').attr('offset', '55%').attr('stop-color', c).attr('stop-opacity', .42);
    g.append('stop').attr('offset', '100%').attr('stop-color', c).attr('stop-opacity', 0);
  });

  const graticule = d3.geoGraticule().step([5, 5]);
  svg.append('path').datum(graticule()).attr('d', path)
    .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,.06)').attr('stroke-width', 1);

  svg.append('g').selectAll('path').data(countries.features.filter((f) => f.id !== '356')).join('path')
    .attr('d', path).attr('fill', 'rgba(255,255,255,.035)').attr('stroke', 'rgba(255,255,255,.10)').attr('stroke-width', .8);

  svg.append('path').datum(india).attr('d', path)
    .attr('fill', 'rgba(255,255,255,.055)').attr('stroke', 'rgba(255,255,255,.55)').attr('stroke-width', 1.4);

  const clip = defs.append('clipPath').attr('id', 'indiaClip');
  clip.append('path').datum(india).attr('d', path);

  const gc = defs.append('radialGradient').attr('id', 'echoCloud');
  gc.append('stop').attr('offset', '0%').attr('stop-color', '#E8EDF2').attr('stop-opacity', .78);
  gc.append('stop').attr('offset', '60%').attr('stop-color', '#C9D4DE').attr('stop-opacity', .40);
  gc.append('stop').attr('offset', '100%').attr('stop-color', '#C9D4DE').attr('stop-opacity', 0);

  svg.append('g').attr('id', 'echoes').attr('clip-path', 'url(#indiaClip)');
  svg.append('g').attr('id', 'arrows').attr('clip-path', 'url(#indiaClip)');

  const cg = svg.append('g');
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
    cg.append('text').attr('x', p[0] + 7).attr('y', p[1] + 3.5)
      .attr('fill', c.hq ? '#fff' : 'rgba(255,255,255,.66)')
      .attr('font-size', c.hq ? 10.5 : 9).attr('font-weight', c.hq ? 700 : 600)
      .attr('font-family', "'Noto Sans',sans-serif").text(c.n);
  });

  draw();
}

function draw() {
  // The slider and layer chips are live before the map geometry finishes
  // loading; without this, an early interaction throws on a null projection.
  if (!projection) return;
  const scale = projection.scale();
  const kmToPx = scale / 6371;
  const g = svg.select('#echoes');
  const cells = CELLS.filter((c) => c.lat > 8).map((c) => ({
    x: projection([c.lon + c.vx * t, c.lat + c.vy * t])[0],
    y: projection([c.lon + c.vx * t, c.lat + c.vy * t])[1],
    r: (c.r + c.grow * t * 100) * kmToPx * 6.5,
    i: Math.max(0, Math.min(4, Math.round(c.i + (c.grow > 0.002 ? t / 60 : 0)))),
    dx: (projection([c.lon + c.vx * (t + 55), c.lat + c.vy * (t + 55)])[0] - projection([c.lon + c.vx * t, c.lat + c.vy * t])[0]),
    dy: (projection([c.lon + c.vx * (t + 55), c.lat + c.vy * (t + 55)])[1] - projection([c.lon + c.vx * t, c.lat + c.vy * t])[1]),
  }));
  const isRain = layer === 'rain' || layer === 'lightning';
  const grad = (d) => (layer === 'cloud' ? 'url(#echoCloud)' : 'url(#echo' + (isRain ? d.i : 2) + ')');
  const sel = g.selectAll('g.cell').data(cells);
  const enter = sel.enter().append('g').attr('class', 'cell');
  enter.append('circle').attr('class', 'outer');
  enter.append('circle').attr('class', 'core');
  const all = enter.merge(sel);
  all.select('.outer')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r)
    .attr('fill', grad)
    .attr('opacity', layer === 'cloud' ? .92 : layer === 'wind' ? .62 : 1);
  all.select('.core')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r * .42)
    .attr('fill', (d) => (layer === 'cloud' ? 'url(#echoCloud)' : 'url(#echo' + (isRain ? Math.min(4, d.i + 1) : 2) + ')'))
    .attr('opacity', layer === 'rain' ? .85 : layer === 'lightning' ? .95 : layer === 'cloud' ? .5 : .3);

  const ag = svg.select('#arrows');
  const asel = ag.selectAll('g.arrow').data(layer === 'wind' ? cells : []);
  asel.exit().remove();
  const aen = asel.enter().append('g').attr('class', 'arrow');
  aen.append('line').attr('class', 'shaft').attr('stroke', '#BFE7F0').attr('stroke-width', 2.6).attr('stroke-linecap', 'round');
  aen.append('path').attr('class', 'head').attr('fill', 'none').attr('stroke', '#BFE7F0').attr('stroke-width', 2.6).attr('stroke-linecap', 'round');
  const aall = aen.merge(asel);
  const L0 = 34;
  const unit = (d) => { const m = Math.hypot(d.dx, d.dy) || 1; return [d.dx / m, d.dy / m]; };
  aall.select('.shaft')
    .attr('x1', (d) => { const u = unit(d); return d.x - u[0] * L0 / 2; })
    .attr('y1', (d) => { const u = unit(d); return d.y - u[1] * L0 / 2; })
    .attr('x2', (d) => { const u = unit(d); return d.x + u[0] * L0 / 2; })
    .attr('y2', (d) => { const u = unit(d); return d.y + u[1] * L0 / 2; });
  aall.select('.head').attr('d', (d) => {
    const u = unit(d), tipX = d.x + u[0] * L0 / 2, tipY = d.y + u[1] * L0 / 2, a = Math.atan2(u[1], u[0]), b = 9;
    const p1 = [tipX - b * Math.cos(a - 0.42), tipY - b * Math.sin(a - 0.42)];
    const p2 = [tipX - b * Math.cos(a + 0.42), tipY - b * Math.sin(a + 0.42)];
    return 'M' + p1[0] + ',' + p1[1] + 'L' + tipX + ',' + tipY + 'L' + p2[0] + ',' + p2[1];
  });

  const LEG = {
    rain: [tr('radar.legend_rain'), 'linear-gradient(90deg,#4FB8C9,#3E8FD8,#7A5AA8,#C2452D)', ['2.5', '15', '65+']],
    cloud: [tr('radar.legend_cloud'), 'linear-gradient(90deg,rgba(255,255,255,.18),rgba(255,255,255,.55),rgba(255,255,255,.92))', ['20', '60', '100']],
    lightning: [tr('radar.legend_lightning'), 'linear-gradient(90deg,#F2C86A,#E2A350,#C2452D)', ['1', '12', '40+']],
    wind: [tr('radar.legend_wind'), 'linear-gradient(90deg,#4FB8C9,#7A5AA8,#C2452D)', ['20', '45', '70+']],
  }[layer];
  document.getElementById('legTitle').textContent = LEG[0];
  document.getElementById('legRamp').style.background = LEG[1];
  document.getElementById('legTicks').innerHTML = LEG[2].map((v) => '<span>' + v + '</span>').join('');
  document.getElementById('stamp').textContent = stampFor(t);
  const lead = t <= 0 ? tr('radar.lead_now') : tr('radar.lead_in_min', { n: t });
  document.getElementById('cellText').textContent = layer === 'wind'
    ? tr('radar.cell_wind', { lead })
    : layer === 'lightning'
    ? tr('radar.cell_lightning')
    : layer === 'cloud'
    ? tr('radar.cell_cloud')
    : tr('radar.cell_rain', { lead });
}

const slider = document.getElementById('time');
slider.addEventListener('input', (e) => { t = +e.target.value; draw(); });
document.querySelectorAll('.layer-chip').forEach((ch) => ch.addEventListener('click', () => {
  document.querySelectorAll('.layer-chip').forEach((c) => c.classList.remove('on'));
  ch.classList.add('on'); layer = ch.dataset.layer; draw();
}));
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
