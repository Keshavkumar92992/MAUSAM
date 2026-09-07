import { fetchDestinationSummary } from './weatherApi.js';
import { loadState, saveState } from './utils.js';

const DEFAULT_SAVED = [
  { name: 'London, UK', lat: 51.5072, lon: -0.1276 },
  { name: 'Bengaluru, KA', lat: 12.9716, lon: 77.5946 },
  { name: 'Leh, Ladakh', lat: 34.1526, lon: 77.5771 },
];

export function getSavedCities() {
  const s = loadState();
  return Array.isArray(s.savedCities) ? s.savedCities : DEFAULT_SAVED;
}

export function addSavedCity(city) {
  const cur = getSavedCities();
  if (cur.some((c) => c.name === city.name)) return cur;
  const next = [city, ...cur].slice(0, 5);
  saveState({ savedCities: next });
  return next;
}

export function removeSavedCity(name) {
  const next = getSavedCities().filter((c) => c.name !== name);
  saveState({ savedCities: next });
  return next;
}

export async function buildTravelData(originTempNow) {
  const saved = getSavedCities();
  const results = await Promise.all(
    saved.map(async (c) => {
      try {
        const s = await fetchDestinationSummary(c.lat, c.lon);
        const tone = s.precipProbMax > 60 ? 'bad' : s.precipProbMax > 30 ? 'warn' : 'ok';
        return {
          name: c.name,
          tempNow: s.tempNow,
          condition: s.condition,
          precipProbMax: s.precipProbMax,
          uvMax: s.uvMax,
          note: s.precipProbMax > 50 ? `Carry a raincoat — ${s.precipProbMax}% rain chance` : `${s.condition}, pleasant conditions`,
          tone,
        };
      } catch {
        return { name: c.name, tempNow: null, condition: '—', note: 'Unavailable', tone: 'info' };
      }
    })
  );
  const destination = results[0]?.tempNow != null ? { ...results[0] } : null;
  return { saved: results, destination };
}
