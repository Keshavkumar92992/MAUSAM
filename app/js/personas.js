import { classify, TONE_COLOR } from './severity.js';
import { apiInstant } from './utils.js';
import { t } from './i18n.js';

const AIRPORT_CODES = {
  'new delhi': 'DEL', mumbai: 'BOM', bengaluru: 'BLR', bangalore: 'BLR', chennai: 'MAA',
  kolkata: 'CCU', hyderabad: 'HYD', pune: 'PNQ', goa: 'GOI', guwahati: 'GAU',
  ahmedabad: 'AMD', jaipur: 'JAI', lucknow: 'LKO', chandigarh: 'IXC', kochi: 'COK',
};
function airportCode(city) {
  return AIRPORT_CODES[city.toLowerCase()] || city.slice(0, 3).toUpperCase();
}

// Threshold labels come from persona-config.json in English; look them up
// in the shared status.* dictionary so tile/panel colors and translated
// text never diverge from severity.js's classification.
function st(label) {
  return t('status.' + label);
}

// Built here rather than in travel.js so it is translated at render time.
// travel.js used to bake the sentence when it fetched, which meant switching
// language left every saved-city note frozen in the previous one.
function noteFor(s) {
  if (s.tempNow == null) return t('travel.unavailable');
  return s.precipProbMax > 50
    ? t('travel.note_rain', { v: s.precipProbMax })
    : t('travel.note_fine', { condition: t(s.conditionKey) });
}

// `field` is the config key this tile is built from. It travels with the
// tile so the ⓘ can find both the explainer text and the very thresholds
// severity.js just used to colour it — nothing has to guess from the label.
function tile(label, value, unit, tone, statusLabel, pctValue, pctMax, field) {
  const pct = Math.max(4, Math.min(100, Math.round(((pctValue ?? 0) / (pctMax || 100)) * 100)));
  return { label, value, unit, tone, color: TONE_COLOR[tone], statusLabel, pct: pct + '%', field };
}

function findThresholds(personaDef, field) {
  const t = personaDef.tiles.find((x) => x.field === field);
  return t?.thresholds;
}

function findHourAt(metrics, targetHour) {
  const times = metrics.hourly.time || [];
  const now = Date.now();
  let best = -1;
  for (let i = metrics.hIdx; i < times.length; i++) {
    // The hour is read off the label (which is already the city's clock);
    // "is it still ahead of us" is the part that needs the real instant.
    if (+times[i].slice(11, 13) === targetHour
      && apiInstant(times[i], metrics.tzOffsetSec) >= now) { best = i; break; }
  }
  return best === -1 ? metrics.hIdx : best;
}

function bestRunWindow(metrics) {
  const { hourly, hIdx } = metrics;
  const temps = hourly.apparent_temperature || [];
  const precip = hourly.precipitation_probability || [];
  let bestStart = -1, bestFeels = Infinity;
  for (let i = hIdx; i < Math.min(hIdx + 18, temps.length); i++) {
    if (temps[i] <= 30 && precip[i] < 40 && temps[i] < bestFeels) {
      bestFeels = temps[i];
      bestStart = i;
    }
  }
  if (bestStart === -1) return { text: t('val.none_ideal'), tone: 'warn', note: t('val.heat_rain_all_day') };
  const start = new Date(hourly.time[bestStart]);
  const end = new Date(start.getTime() + 90 * 60000);
  const fmt = (d) => {
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    h = ((h + 11) % 12) + 1;
    return `${h}:${m}`;
  };
  return { text: `${fmt(start)}`, sub: `–${fmt(end)} ${end.getHours() >= 12 ? 'PM' : 'AM'}`, note: t('val.cool_feels', { temp: Math.round(bestFeels) }) };
}

export function buildPersonaView(id, personaDef, metrics, travel) {
  const M = metrics;
  switch (id) {
    case 'health': {
      const aqi = classify(M.aqi_pm25, findThresholds(personaDef, 'aqi_pm25'));
      const pollen = classify(M.mocked.pollen_index, findThresholds(personaDef, 'pollen_index'));
      const uv = classify(M.uv_index, findThresholds(personaDef, 'uv_index'));
      const hum = classify(M.humidityNow, findThresholds(personaDef, 'humidity'));
      const maskNeeded = aqi.tone === 'bad' || aqi.tone === 'warn';
      const uvPeak = uv.tone !== 'ok';
      const pollenHigh = M.mocked.pollen_index >= 5;
      const tipKey = uvPeak && pollenHigh ? 'tip.health.uv_pollen' : uvPeak ? 'tip.health.uv_only' : pollenHigh ? 'tip.health.pollen_only' : 'tip.health.plain';
      return {
        summary: t('summary.health'),
        tiles: [
          tile(t('tile.aqi'), M.aqi_pm25, 'AQI', aqi.tone, st(aqi.label), M.aqi_pm25, 300, 'aqi_pm25'),
          tile(t('tile.pollen'), st(pollen.label), '', pollen.tone, t(M.mocked.pollen_note_key), M.mocked.pollen_index, 9, 'pollen_index'),
          tile(t('tile.uv'), M.uv_index, t('unit.of_11'), uv.tone, st(uv.label), M.uv_index, 11, 'uv_index'),
          tile(t('tile.humidity'), M.humidityNow, '%', hum.tone, st(hum.label), M.humidityNow, 100, 'humidity'),
        ],
        panel: {
          title: t('panel.health_title'), meta: t('panel.health_meta'),
          rows: [
            { label: t('row.outdoor_exposure'), value: aqi.tone === 'bad' ? t('val.limit') : aqi.tone === 'warn' ? t('val.caution') : t('val.ok'), note: t('row.outdoor_exposure_note'), tone: aqi.tone },
            { label: t('row.mask_recommended'), value: maskNeeded ? t('val.n95') : t('val.optional'), note: maskNeeded ? t('row.mask_note_needed') : t('row.mask_note_optional'), tone: maskNeeded ? 'warn' : 'ok' },
            { label: t('row.indoor_air'), value: aqi.tone === 'bad' ? t('val.purify') : t('val.ventilate'), note: t('row.indoor_air_note'), tone: 'info' },
          ],
        },
        tip: t(tipKey, { condition: t(M.conditionKey) }),
      };
    }
    case 'fitness': {
      const run = bestRunWindow(M);
      const wind = classify(M.wind_speed, findThresholds(personaDef, 'wind_speed'));
      const heat = classify(M.feelsLikeMax, findThresholds(personaDef, 'feels_like_max'));
      const hydration = M.feelsLikeMax > 40 ? { label: t('val.very_high'), tone: 'bad', note: t('val.ml_per_hour', { n: 1000 }) }
        : M.feelsLikeMax >= 33 ? { label: t('val.high'), tone: 'warn', note: t('val.ml_per_hour', { n: 750 }) }
        : { label: t('val.normal_intake'), tone: 'ok', note: t('val.standard_intake') };
      const stormRisk = M.precip_prob_max24 > 50;
      return {
        summary: t('summary.fitness'),
        tiles: [
          tile(t('tile.best_run_window'), run.text, run.sub || '', 'ok', run.note, 70, 100, 'best_run_window'),
          tile(t('tile.wind'), M.wind_speed, 'km/h', wind.tone, st(wind.label), M.wind_speed, 30, 'wind_speed'),
          tile(t('tile.heat_index'), M.feelsLikeMax, '°C', heat.tone, st(heat.label), M.feelsLikeMax, 45, 'feels_like_max'),
          tile(t('tile.hydration'), hydration.label, '', hydration.tone, hydration.note, M.feelsLikeMax, 45, 'hydration_need'),
        ],
        panel: {
          title: t('panel.fitness_title'), meta: t('panel.fitness_meta'),
          rows: [
            { label: t('row.sunrise'), value: fmtClock(M.sunrise), note: t('row.sunrise_note'), tone: 'info' },
            { label: t('row.sunset'), value: fmtClock(M.sunset), note: t('row.sunset_note'), tone: 'info' },
            { label: t('row.evening_window'), value: stormRisk ? t('val.storm_after_dusk') : t('val.clear_through_evening'), note: t('row.rain_chance_note', { pct: Math.round(M.precip_prob_max24) }), tone: stormRisk ? 'warn' : 'ok' },
          ],
        },
        tip: t(stormRisk ? 'tip.fitness.storm' : 'tip.fitness.clear'),
      };
    }
    case 'beach': {
      const wave = classify(M.mocked.wave_height_m, findThresholds(personaDef, 'wave_height_m'));
      const sea = classify(M.mocked.sea_temp_c, findThresholds(personaDef, 'sea_temp_c'));
      const flag = classify(M.mocked.safety_flag, findThresholds(personaDef, 'safety_flag'));
      const rip = classify(M.mocked.rip_current, findThresholds(personaDef, 'rip_current'));
      const seaStateTone = wave.tone === 'ok' ? 'calm' : wave.tone === 'warn' ? 'choppy' : 'rough';
      const flagKey = M.mocked.safety_flag === 'green' ? 'green' : M.mocked.safety_flag === 'yellow' ? 'yellow' : 'red';
      return {
        summary: M.city,
        tiles: [
          tile(t('tile.wave_height'), M.mocked.wave_height_m, 'm', wave.tone, st(wave.label), M.mocked.wave_height_m, 2, 'wave_height_m'),
          tile(t('tile.sea_temp'), M.mocked.sea_temp_c, '°C', sea.tone, st(sea.label), M.mocked.sea_temp_c, 32, 'sea_temp_c'),
          tile(t('tile.safety_flag'), t('val.flag_' + M.mocked.safety_flag), '', flag.tone, st(flag.label), 60, 100, 'safety_flag'),
          tile(t('tile.rip_current'), t('val.rip_' + M.mocked.rip_current), '', rip.tone, st(rip.label), rip.tone === 'bad' ? 90 : rip.tone === 'warn' ? 55 : 20, 100, 'rip_current'),
        ],
        panel: {
          title: t('panel.beach_title'), meta: t('panel.beach_meta'),
          rows: [
            { label: t('row.high_tide'), value: fmtHour(M.mocked.high_tide), note: t('row.high_tide_note'), tone: 'info' },
            { label: t('row.low_tide'), value: fmtHour(M.mocked.low_tide), note: t('row.low_tide_note'), tone: 'info' },
            { label: t('row.sea_state'), value: t('val.' + seaStateTone), note: t('row.wind_note', { kmh: M.wind_speed }), tone: wave.tone },
          ],
        },
        tip: t('tip.beach.' + flagKey, { tide: fmtHour(M.mocked.high_tide) }),
      };
    }
    case 'travel': {
      const dest = travel?.destination;
      const originVis = M.visibility_km, originGusts = M.gustsMaxToday;
      const flight = originVis < 1 || originGusts > 45 ? { tone: 'bad', label: t('status.High') } : originVis < 3 ? { tone: 'warn', label: t('status.Moderate') } : { tone: 'ok', label: t('status.Low') };
      const destPrecip = dest ? classify(dest.precipProbMax, findThresholds(personaDef, 'dest_precip_prob')) : { tone: 'info', label: null };
      const tempDelta = dest ? Math.round(M.tempNow - dest.tempNow) : 0;
      const items = [];
      if (dest && dest.precipProbMax > 50) items.push(t('item.raincoat'));
      if (dest && Math.abs(tempDelta) > 10) items.push(t('item.layers'));
      if (dest && dest.uvMax >= 8) items.push(t('item.sunscreen'));
      const savedCount = travel?.saved?.length || 0;
      return {
        summary: t('summary.travel_n', { n: savedCount, s: savedCount === 1 ? '' : 's' }),
        tiles: [
          tile(t('tile.flight_risk', { code: airportCode(M.city) }), flight.label, '', flight.tone, t('val.visibility_km', { km: originVis }), originVis, 10, 'flight_risk'),
          tile(t('tile.rain_arrival'), dest ? dest.precipProbMax : '—', dest ? '%' : '', destPrecip.tone, dest ? t('val.condition_in', { condition: st(destPrecip.label), city: dest.name }) : t('val.add_destination'), dest?.precipProbMax || 0, 100, 'dest_precip_prob'),
          tile(t('tile.temp_swing'), dest ? Math.abs(tempDelta) : '—', dest ? '°C' : '', 'info', dest ? t('val.temp_swing_note', { city: M.city, temp1: M.tempNow, dest: dest.name, temp2: dest.tempNow }) : '—', Math.abs(tempDelta), 20, 'temp_delta'),
          tile(t('tile.packing'), items.length, t('unit.items'), 'info', items.length ? cap(items.join(', ')) : t('val.nothing_critical'), items.length, 3, 'packing_items'),
        ],
        panel: {
          title: t('panel.travel_title'), meta: t('panel.travel_meta'),
          rows: (travel?.saved || []).slice(0, 3).map((s) => ({
            label: s.name, value: s.tempNow != null ? `${s.tempNow}° ${t(s.conditionKey)}` : '…',
            note: noteFor(s), tone: s.tone || 'info',
          })),
        },
        tip: dest
          ? t(items.length ? 'tip.travel.with_dest_pack' : 'tip.travel.with_dest_nopack', { dest: dest.name, condition: t(dest.conditionKey).toLowerCase(), temp: dest.tempNow, item: items[0] })
          : t('tip.travel.no_dest'),
      };
    }
    case 'family': {
      const morningIdx = findHourAt(M, 7);
      const morningVis = (M.hourly.visibility?.[morningIdx] ?? 8000) / 1000;
      const morningPrecip = M.hourly.precipitation_probability?.[morningIdx] ?? M.precip_prob_now;
      const morningFeels = M.hourly.apparent_temperature?.[morningIdx] ?? M.feelsLikeNow;
      const commuteScore = morningVis < 2 || morningPrecip > 60 ? { tone: 'bad', label: t('status.Poor') } : morningVis < 4 || morningPrecip > 30 ? { tone: 'warn', label: t('val.fair') } : { tone: 'ok', label: t('status.Good') };
      const idx1500 = findHourAt(M, 15);
      const precip1500 = M.hourly.precipitation_probability?.[idx1500] ?? M.precip_prob_max24;
      const rain3pm = classify(precip1500, findThresholds(personaDef, 'precip_prob_1500'));
      const aqiKids = classify(M.aqi_pm25, findThresholds(personaDef, 'aqi_pm25'));
      let playtime = 10;
      if (M.aqi_pm25 > 150) playtime -= 4; else if (M.aqi_pm25 > 100) playtime -= 2;
      if (M.uv_index >= 8) playtime -= 2; else if (M.uv_index >= 6) playtime -= 1;
      if (M.feelsLikeMax > 38) playtime -= 2;
      if (precip1500 > 50) playtime -= 2;
      playtime = Math.max(0, Math.min(10, playtime));
      const playTone = playtime >= 7 ? 'ok' : playtime >= 4 ? 'warn' : 'bad';
      return {
        summary: t('summary.family'),
        tiles: [
          tile(t('tile.school_commute'), commuteScore.label, '', commuteScore.tone, t('val.commute_note', { condition: t(M.conditionKey), temp: Math.round(morningFeels) }), commuteScore.tone === 'ok' ? 25 : commuteScore.tone === 'warn' ? 55 : 85, 100, 'commute_score'),
          tile(t('tile.rain_3pm'), Math.round(precip1500), '%', rain3pm.tone, st(rain3pm.label), precip1500, 100, 'precip_prob_1500'),
          tile(t('tile.playtime'), playtime, t('unit.of_10'), playTone, t(playTone === 'ok' ? 'val.good_outdoor' : playTone === 'warn' ? 'val.limit_outdoor' : 'val.indoor_advised'), playtime, 10, 'playtime_index'),
          tile(t('tile.aqi_kids'), M.aqi_pm25, 'AQI', aqiKids.tone, st(aqiKids.label), M.aqi_pm25, 300, 'aqi_pm25'),
        ],
        panel: {
          title: t('panel.family_title'), meta: t('panel.family_meta'),
          rows: [
            { label: t('row.morning_dropoff'), value: '7:30 AM', note: commuteScore.tone === 'ok' ? t('row.dropoff_clear') : t('row.dropoff_early'), tone: commuteScore.tone },
            { label: t('row.afternoon_pickup'), value: '3:10 PM', note: precip1500 > 50 ? t('row.pickup_rain') : t('row.pickup_dry'), tone: precip1500 > 50 ? 'bad' : 'ok' },
            { label: t('row.evening_outdoors'), value: t('val.after_6pm'), note: t('row.evening_temp_note', { temp: M.tempMin }), tone: playTone === 'bad' ? 'warn' : 'ok' },
          ],
        },
        tip: precip1500 > 60
          ? t('tip.family.rain', { pct: Math.round(precip1500) })
          : t(playTone !== 'ok' ? 'tip.family.clear_play' : 'tip.family.clear_ok'),
      };
    }
    case 'agri': {
      const soil = classify(M.soil_moisture_pct, findThresholds(personaDef, 'soil_moisture_pct'));
      const rain48 = classify(M.rain_48h_mm, findThresholds(personaDef, 'rain_48h_mm'));
      const frost = classify(M.min_temp_c, findThresholds(personaDef, 'min_temp_c'));
      const gusts = classify(M.gustsMaxToday, findThresholds(personaDef, 'gusts_kmh'));
      const holdIrrigation = M.rain_48h_mm >= 15;
      const postponeSpray = M.gustsMaxToday > 30;
      return {
        summary: M.city,
        tiles: [
          tile(t('tile.soil_moisture'), M.soil_moisture_pct, t('unit.pct_vol'), soil.tone, st(soil.label), M.soil_moisture_pct, 100, 'soil_moisture_pct'),
          tile(t('tile.rainfall_48h'), M.rain_48h_mm, 'mm', rain48.tone, st(rain48.label), M.rain_48h_mm, 60, 'rain_48h_mm'),
          tile(t('tile.frost_risk'), st(frost.label), '', frost.tone, t('val.min_temp_note', { temp: M.min_temp_c }), Math.max(0, 20 - M.min_temp_c) * 5, 100, 'min_temp_c'),
          tile(t('tile.wind_gusts'), M.gustsMaxToday, 'km/h', gusts.tone, st(gusts.label), M.gustsMaxToday, 60, 'gusts_kmh'),
        ],
        panel: {
          title: t('panel.agri_title'), meta: t('panel.agri_meta'),
          rows: [
            { label: t('row.irrigation'), value: holdIrrigation ? t('val.hold_2_days') : t('val.as_scheduled'), note: t('row.irrigation_note', { mm: M.rain_48h_mm }), tone: holdIrrigation ? 'ok' : 'info' },
            { label: t('row.sowing_window'), value: soil.tone === 'ok' ? t('val.favourable') : t('val.wait'), note: t('row.sowing_note'), tone: soil.tone },
            { label: t('row.spray_schedule'), value: postponeSpray ? t('val.postpone') : t('val.proceed'), note: t('row.spray_note'), tone: postponeSpray ? 'bad' : 'ok' },
          ],
        },
        tip: holdIrrigation
          ? t(postponeSpray ? 'tip.agri.hold_postpone' : 'tip.agri.hold_only', { mm: M.rain_48h_mm })
          : t(postponeSpray ? 'tip.agri.soil_postpone' : 'tip.agri.soil_only', { soil: st(soil.label).toLowerCase() }),
      };
    }
    case 'commute': {
      const vis = classify(M.visibility_km, findThresholds(personaDef, 'visibility_km'));
      const spray = M.precip_prob_max24 > 60 ? { tone: 'bad', label: t('val.likely') } : M.precip_prob_max24 > 30 ? { tone: 'warn', label: t('status.Possible') } : { tone: 'ok', label: t('status.Unlikely') };
      const delay = M.mocked.traffic_delay_min + (spray.tone === 'bad' ? 12 : spray.tone === 'warn' ? 5 : 0);
      const hazard = M.gustsMaxToday > 40 ? { tone: 'bad', label: t('val.storm') } : M.visibility_km < 1 ? { tone: 'bad', label: t('val.fog') } : { tone: 'ok', label: t('status.Clear') };
      return {
        summary: M.city,
        tiles: [
          tile(t('tile.visibility'), M.visibility_km, 'km', vis.tone, st(vis.label), M.visibility_km, 10, 'visibility_km'),
          tile(t('tile.road_spray'), spray.label, '', spray.tone, M.precip_prob_max24 > 60 ? t('val.waterlogging_risk') : t('val.roads_dry'), M.precip_prob_max24, 100, 'road_spray'),
          tile(t('tile.delay_added'), `+${delay}`, 'min', delay > 20 ? 'warn' : 'ok', t('val.vs_usual_commute'), delay, 40, 'delay_min'),
          tile(t('tile.fog_storm'), hazard.label, '', hazard.tone, hazard.tone === 'bad' ? t('val.plan_alt_route') : t('val.no_hazard'), hazard.tone === 'bad' ? 85 : 15, 100, 'hazard'),
        ],
        panel: {
          title: t('panel.commute_title'), meta: t('panel.commute_meta'),
          rows: [
            { label: t('row.main_route'), value: spray.tone === 'ok' ? t('val.normal') : t('val.slow'), note: vis.tone !== 'ok' ? t('row.reduced_visibility') : t('row.clear_roads'), tone: vis.tone },
            { label: t('row.underpass'), value: spray.tone === 'bad' ? t('val.avoid') : t('val.passable'), note: t('row.underpass_note'), tone: spray.tone },
            { label: t('row.transit_alt'), value: t('val.normal'), note: t('row.transit_note'), tone: 'ok' },
          ],
        },
        tip: hazard.tone === 'bad'
          ? t('tip.commute.hazard', { hazard: hazard.label, delay })
          : t(spray.tone !== 'ok' ? 'tip.commute.smooth_watch' : 'tip.commute.smooth_ok'),
      };
    }
    default:
      return { summary: '', tiles: [], panel: { title: '', meta: '', rows: [] }, tip: '' };
  }
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmtClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = ((h + 11) % 12) + 1;
  return `${h}:${m} ${ap}`;
}
function fmtHour(hour24) {
  const ap = hour24 >= 12 ? 'PM' : 'AM';
  const h = ((hour24 + 11) % 12) + 1;
  return `${h}:00 ${ap}`;
}
