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

export function saveState(partial) {
  try {
    const cur = loadState();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...partial }));
  } catch {
    /* storage unavailable */
  }
}
