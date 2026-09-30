// The national grid: one request, every variable the radar draws.
//
// This used to live in precip.js and fetch precipitation alone. The radar
// now has eight layers, and the thing that makes that affordable is a
// detail of how Open-Meteo bills: a multi-coordinate request costs per
// *coordinate*, not per variable. Asking the same 66 points for rain,
// cloud, wind, temperature and CAPE costs exactly what asking for rain
// alone cost — so every layer below is real measured model output rather
// than the drifting blobs the map used to invent.
//
// precip.js still owns what the rain *means* (the bands). This owns where
// the numbers come from and how they are cached.

// 2° is about 220 km. Coarse for a radar and honest for what this is: a
// national picture from a forecast model, not a Doppler sweep.
//
// The spacing is a quota decision as much as a visual one. Open-Meteo bills
// per coordinate against a shared IP limit, so a 1.5° grid was 150 calls on
// every view of this page — which is how testing it exhausted the quota
// inside an afternoon. At 2° it is nearer 70.
export const STEP = 2;
const BBOX = { latMin: 7, latMax: 36, lonMin: 68, lonMax: 97.5 };

// `inside` is passed in rather than imported so this module never has to
// know about d3 or the topojson the map already loaded.
export function gridPoints(inside) {
  const pts = [];
  for (let lat = BBOX.latMin; lat <= BBOX.latMax; lat += STEP) {
    for (let lon = BBOX.lonMin; lon <= BBOX.lonMax; lon += STEP) {
      if (inside([lon, lat])) pts.push({ lat: +lat.toFixed(2), lon: +lon.toFixed(2) });
    }
  }
  return pts;
}

// What each layer reads. Adding a variable here costs nothing extra at the
// API — only the coordinate count is billed — so the list is set by what
// the map can honestly draw, not by what it can afford.
const VARS = [
  'precipitation',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'temperature_2m',
  'cape',
];

// The property each variable lands on. `mm` keeps its old name because the
// rain band code and its tests are written against it.
const SERIES = {
  precipitation: 'mm',
  cloud_cover: 'cloud',
  wind_speed_10m: 'windSpeed',
  wind_direction_10m: 'windDir',
  temperature_2m: 'temp',
  cape: 'cape',
};

// A day ahead, so rain *accumulation* has something to accumulate. The
// animated layers only ever read the first few hours of it; the extra hours
// are free, being the same coordinates.
const PAST_HOURS = 1;
export const FORECAST_HOURS = 24;

// The model publishes hourly. Refetching on every visit spends the quota on
// numbers that have not changed, so a run is kept for a while and reused —
// keyed on the grid and the variable list, so changing either invalidates it
// rather than serving a stale shape.
const CACHE_KEY = 'mausam.grid.v2';
const CACHE_MS = 20 * 60 * 1000;

function readCache(sig) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!c || c.sig !== sig) return null;
    if (Date.now() - c.at > CACHE_MS) return null;
    // A cached run also goes stale once the clock passes its last hour.
    if (!c.grid?.[0]?.times?.length) return null;
    if (Date.now() > c.grid[0].times[c.grid[0].times.length - 1] + 3600000) return null;
    return c.grid;
  } catch { return null; }
}

function writeCache(sig, grid) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ sig, at: Date.now(), grid })); } catch { /* full or private */ }
}

// One request for every point. timezone=UTC on purpose: the labels come back
// with no offset either way, and asking for UTC means appending a Z is
// enough to get a real instant — no city offset to apply, and no chance of
// reading the grid an hour out the way the forecast screens once did.
export async function fetchGrid(points, { signal } = {}) {
  if (!points.length) return null;
  const sig = `${STEP}|${points.length}|${points[0].lat},${points[0].lon}|${VARS.join(',')}|${FORECAST_HOURS}`;
  const cached = readCache(sig);
  if (cached) return cached;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${points.map((p) => p.lat).join(',')}`
    + `&longitude=${points.map((p) => p.lon).join(',')}`
    + `&hourly=${VARS.join(',')}`
    + `&past_hours=${PAST_HOURS}&forecast_hours=${FORECAST_HOURS}&timezone=UTC`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    const err = new Error('grid failed');
    err.status = res.status;
    throw err;
  }
  const raw = await res.json();
  // A single coordinate comes back as an object, many as an array. The grid
  // is always many, but normalise rather than depend on it.
  const list = Array.isArray(raw) ? raw : [raw];
  const grid = list.map((r, i) => {
    const h = r.hourly || {};
    const pt = {
      lat: points[i]?.lat ?? r.latitude,
      lon: points[i]?.lon ?? r.longitude,
      times: (h.time || []).map((s) => Date.parse(`${s}Z`)),
    };
    for (const v of VARS) pt[SERIES[v]] = h[v] || [];
    return pt;
  });
  writeCache(sig, grid);
  return grid;
}

// Which hourly slot covers `when`. The map's slider runs from half an hour
// back to two hours ahead, and the data is hourly, so several slider
// positions legitimately land on the same slot.
export function slotAt(grid, when) {
  const times = grid?.[0]?.times || [];
  if (!times.length) return 0;
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= when) idx = i; else break;
  }
  return idx;
}

// Total rain from `slot` forward, in mm. The accumulation layer is a sum
// rather than a snapshot, so it does not move with the slider — the same
// way Windy's accumulation layers are a total over a window rather than an
// instant.
export function accumulate(pt, slot, hours = FORECAST_HOURS) {
  let total = 0;
  for (let i = slot; i < Math.min(pt.mm.length, slot + hours); i++) total += pt.mm[i] || 0;
  return total;
}
