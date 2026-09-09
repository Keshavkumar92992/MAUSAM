// Real precipitation for the radar map.
//
// The map used to draw seven hardcoded blobs drifting across India on a
// timer. It looked like a radar and was entirely invented — which is a
// strange thing for a screen carrying the IMD's name to do, and putting
// named intensity categories on top of made-up numbers would only have made
// it more convincing without making it any more true.
//
// This fetches actual forecast precipitation for a grid of points across
// the country in a single request, and bands it by rate. If the request
// fails the caller falls back to the old simulation and says so in the
// header, because a blank map is worse than an honestly-labelled fake one.
import { t, registerEntries } from './i18n.js';

registerEntries({
  'precip.light': { en: 'Light', hi: 'हल्की', bn: 'হালকা', ta: 'லேசான' },
  'precip.moderate': { en: 'Moderate', hi: 'मध्यम', bn: 'মাঝারি', ta: 'மிதமான' },
  'precip.heavy': { en: 'Heavy', hi: 'भारी', bn: 'ভারী', ta: 'கனமான' },
  'precip.extreme': { en: 'Extreme', hi: 'अत्यधिक', bn: 'অত্যধিক', ta: 'மிகக் கடுமையான' },
  'precip.legend': { en: 'RAIN RATE mm/h', hi: 'बारिश की दर मिमी/घंटा', bn: 'বৃষ্টির হার মিমি/ঘণ্টা', ta: 'மழை வீதம் மி.மீ/மணி' },
  'precip.none': { en: 'No rain anywhere on the map at this hour.', hi: 'इस समय नक़्शे पर कहीं बारिश नहीं।', bn: 'এই সময়ে মানচিত্রে কোথাও বৃষ্টি নেই।', ta: 'இந்நேரத்தில் வரைபடத்தில் எங்கும் மழை இல்லை.' },
  'precip.summary': { en: 'Rain at {{n}} of {{total}} points on the map this hour, reaching {{band}}.', hi: 'इस घंटे नक़्शे के {{total}} में से {{n}} बिंदुओं पर बारिश, सबसे तेज़ जगह {{band}}।', bn: 'এই ঘণ্টায় মানচিত্রের {{total}}টির মধ্যে {{n}}টি বিন্দুতে বৃষ্টি, সর্বোচ্চ {{band}}।', ta: 'இந்த மணி நேரத்தில் வரைபடத்தின் {{total}}-இல் {{n}} இடங்களில் மழை, அதிகபட்சம் {{band}}.' },
  'precip.live': { en: 'Forecast precipitation', hi: 'पूर्वानुमानित वर्षा', bn: 'পূর্বাভাসিত বৃষ্টিপাত', ta: 'முன்னறிவிக்கப்பட்ட மழை' },
});

// Rain *rate*, not a daily total. The standard meteorological rate scale —
// the one aviation and hydrology use — rather than IMD's 24-hour bands,
// because this map shows what is falling in a given hour. Reading a 24-hour
// classification onto an hourly figure is how the old legend came to claim
// "65+ mm/h", a rate India has essentially never recorded.
export const BANDS = [
  { key: 'light', min: 0.1, max: 2.5, color: '#4FB8C9' },
  { key: 'moderate', min: 2.5, max: 7.6, color: '#3E8FD8' },
  { key: 'heavy', min: 7.6, max: 50, color: '#C2452D' },
  { key: 'extreme', min: 50, max: Infinity, color: '#8E2418' },
];

// Below this there is nothing worth drawing — a hundredth of a millimetre
// in an hour is not rain, it is model noise.
export const TRACE = 0.1;

export function bandFor(mm) {
  if (!(mm >= TRACE)) return null;
  return BANDS.find((b) => mm < b.max) || BANDS[BANDS.length - 1];
}

export const bandLabel = (key) => t(`precip.${key}`);

// ---------- the grid ----------

// 2° is about 220 km. Coarse for a radar and honest for what this is: a
// national picture from a forecast model, not a Doppler sweep.
//
// The spacing is a quota decision as much as a visual one. Open-Meteo bills
// a multi-coordinate request per *coordinate*, so a 1.5° grid was 150 calls
// against a shared IP limit on every single view of this page — which is
// how testing it exhausted the quota inside an afternoon. At 2° it is
// nearer 80, and the cache below means most views cost nothing at all.
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

// The model publishes hourly. Refetching on every visit to the radar spends
// the quota on numbers that have not changed, so a run is kept for a while
// and reused — keyed on the grid itself, so changing the spacing or the
// bounding box invalidates it rather than serving a stale shape.
const CACHE_KEY = 'mausam.precip.v1';
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
  const sig = `${STEP}|${points.length}|${points[0].lat},${points[0].lon}`;
  const cached = readCache(sig);
  if (cached) return cached;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${points.map((p) => p.lat).join(',')}`
    + `&longitude=${points.map((p) => p.lon).join(',')}`
    + '&hourly=precipitation&past_hours=1&forecast_hours=4&timezone=UTC';

  const res = await fetch(url, { signal });
  if (!res.ok) {
    const err = new Error('precipitation grid failed');
    err.status = res.status;
    throw err;
  }
  const raw = await res.json();
  // A single coordinate comes back as an object, many as an array. The grid
  // is always many, but normalise rather than depend on it.
  const list = Array.isArray(raw) ? raw : [raw];
  const grid = list.map((r, i) => ({
    lat: points[i]?.lat ?? r.latitude,
    lon: points[i]?.lon ?? r.longitude,
    times: (r.hourly?.time || []).map((s) => Date.parse(`${s}Z`)),
    mm: r.hourly?.precipitation || [],
  }));
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

// What the map is showing right now, in one sentence for the nowcast card.
export function summarise(grid, slot) {
  if (!grid?.length) return null;
  const wet = grid.map((g) => g.mm[slot] ?? 0).filter((v) => v >= TRACE);
  if (!wet.length) return { text: t('precip.none'), worst: null };
  const worst = bandFor(Math.max(...wet));
  // Counting the wet points and naming the worst band in one sentence read
  // as though every one of them was at that band. Say both plainly: how
  // much of the map has rain, and how hard it gets at its worst.
  return {
    worst,
    text: t('precip.summary', {
      n: wet.length,
      total: grid.length,
      band: bandLabel(worst.key).toLowerCase(),
    }),
  };
}
