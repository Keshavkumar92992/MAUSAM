export function fmtTime(date) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = ((h + 11) % 12) + 1;
  return `${h}:${m} ${ap}`;
}

export function fmtHourLabel(iso) {
  return fmtTime(new Date(iso));
}

export function dayShort(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' });
}

// Deterministic pseudo-random in [0,1) seeded by a string (so mocked fields
// stay stable per city/day instead of jumping on every reload).
export function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function todaySeed(city) {
  const d = new Date();
  return `${city}-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const LS_KEY = 'mausam.state.v1';

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}

// A saved city with a non-numeric or out-of-range coordinate is a dead end,
// not a cosmetic problem: every forecast URL built from it comes back 400,
// the error card offers a Try again that can never succeed, and the only way
// out is clearing site data. Cheap to check, and it has to be checked on the
// way in rather than trusted because this comes from storage the app wrote
// in some earlier version of itself.
export function validCity(c) {
  if (!c || typeof c !== 'object') return null;
  // Check the type before converting. Number(null), Number('') and
  // Number(false) are all 0, and 0,0 is a real coordinate in the Gulf of
  // Guinea — so a coordinate that was never written at all would have
  // sailed through as a legitimate place to fetch the weather for.
  const num = (v) => (typeof v === 'number' ? v
    : typeof v === 'string' && v.trim() !== '' ? Number(v)
    : NaN);
  const lat = num(c.lat), lon = num(c.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (typeof c.name !== 'string' || !c.name.trim()) return null;
  return { ...c, lat, lon };
}

export function saveState(partial) {
  try {
    const cur = loadState();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...partial }));
  } catch {
    /* storage unavailable */
  }
}
