// Fields with no free/keyless live source (per README "mocked_for_demo" list).
// Deterministic per city+day so numbers don't jump on every reload — clearly
// derived from real conditions where possible, otherwise seeded plausible values.
import { seededRandom, todaySeed } from './utils.js';

export function mockedForCity(city, weather) {
  const rand = seededRandom(todaySeed(city));
  const pm25 = weather?.pm25 ?? 60;
  const humidity = weather?.humidity ?? 55;

  const pollenBase = Math.min(9, Math.round((pm25 / 40) + rand() * 3));
  const waveHeight = +(0.4 + rand() * 1.8).toFixed(1);
  const seaTemp = Math.round(24 + rand() * 6);
  const safetyFlag = waveHeight > 1.8 ? 'red' : waveHeight > 0.9 ? 'yellow' : 'green';
  const ripCurrent = waveHeight > 1.8 ? 'high' : waveHeight > 1.1 ? 'moderate' : 'low';
  const highTideHour = 13 + Math.round(rand() * 3);
  const lowTideHour = (highTideHour + 6) % 24;
  const trafficDelay = Math.round(6 + rand() * 22);

  return {
    pollen_index: pollenBase,
    // A key, not a sentence: this module has no business holding display
    // text, and the English strings it used to return showed up untranslated
    // in the pollen tile in every other language.
    pollen_note_key: pollenBase >= 5 ? 'val.pollen_grass_parth' : pollenBase >= 3 ? 'val.pollen_grass' : 'val.pollen_low',
    wave_height_m: waveHeight,
    sea_temp_c: seaTemp,
    safety_flag: safetyFlag,
    rip_current: ripCurrent,
    high_tide: highTideHour,
    low_tide: lowTideHour,
    traffic_delay_min: trafficDelay,
    humidity,
  };
}
