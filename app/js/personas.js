import { classify, TONE_COLOR } from './severity.js';

const AIRPORT_CODES = {
  'new delhi': 'DEL', mumbai: 'BOM', bengaluru: 'BLR', bangalore: 'BLR', chennai: 'MAA',
  kolkata: 'CCU', hyderabad: 'HYD', pune: 'PNQ', goa: 'GOI', guwahati: 'GAU',
  ahmedabad: 'AMD', jaipur: 'JAI', lucknow: 'LKO', chandigarh: 'IXC', kochi: 'COK',
};
function airportCode(city) {
  return AIRPORT_CODES[city.toLowerCase()] || city.slice(0, 3).toUpperCase();
}

function tile(label, value, unit, tone, statusLabel, pctValue, pctMax) {
  const pct = Math.max(4, Math.min(100, Math.round(((pctValue ?? 0) / (pctMax || 100)) * 100)));
  return { label, value, unit, tone, color: TONE_COLOR[tone], statusLabel, pct: pct + '%' };
}

function findThresholds(personaDef, field) {
  const t = personaDef.tiles.find((x) => x.field === field);
  return t?.thresholds;
}

function findHourAt(metrics, targetHour) {
  const times = metrics.hourly.time || [];
  const now = new Date();
  let best = -1;
  for (let i = metrics.hIdx; i < times.length; i++) {
    const d = new Date(times[i]);
    if (d.getHours() === targetHour && d >= now) { best = i; break; }
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
  if (bestStart === -1) return { text: 'None ideal today', tone: 'warn', note: 'Heat & rain risk all day' };
  const start = new Date(hourly.time[bestStart]);
  const end = new Date(start.getTime() + 90 * 60000);
  const fmt = (d) => {
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM'; h = ((h + 11) % 12) + 1;
    return `${h}:${m}`;
  };
  return { text: `${fmt(start)}`, sub: `–${fmt(end)} ${end.getHours() >= 12 ? 'PM' : 'AM'}`, note: `Cool, ${Math.round(bestFeels)}° feels-like` };
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
      return {
        summary: 'Air & exposure',
        tiles: [
          tile('AQI (PM2.5)', M.aqi_pm25, 'AQI', aqi.tone, aqi.label, M.aqi_pm25, 300),
          tile('Pollen', pollen.label, '', pollen.tone, M.mocked.pollen_note, M.mocked.pollen_index, 9),
          tile('UV index', M.uv_index, 'of 11', uv.tone, uv.label, M.uv_index, 11),
          tile('Humidity', M.humidityNow, '%', hum.tone, hum.label, M.humidityNow, 100),
        ],
        panel: {
          title: 'Sensitive-group advisory', meta: 'Next 12 h',
          rows: [
            { label: 'Outdoor exposure', value: aqi.tone === 'bad' ? 'Limit' : aqi.tone === 'warn' ? 'Caution' : 'OK', note: 'Asthma, COPD, elderly, children', tone: aqi.tone },
            { label: 'Mask recommended', value: maskNeeded ? 'N95' : 'Optional', note: maskNeeded ? 'Between peak traffic hours' : 'Air quality acceptable', tone: maskNeeded ? 'warn' : 'ok' },
            { label: 'Indoor air', value: aqi.tone === 'bad' ? 'Purify' : 'Ventilate', note: 'Keep windows shut till late morning if hazy', tone: 'info' },
          ],
        },
        tip: `${M.conditionLabel} today${uv.tone !== 'ok' ? ' with a UV peak' : ''} — shift outdoor time to before 8 AM${M.mocked.pollen_index >= 5 ? ', and carry your inhaler if pollen-sensitive.' : '.'}`,
      };
    }
    case 'fitness': {
      const run = bestRunWindow(M);
      const wind = classify(M.wind_speed, findThresholds(personaDef, 'wind_speed'));
      const heat = classify(M.feelsLikeMax, findThresholds(personaDef, 'feels_like_max'));
      const hydration = M.feelsLikeMax > 40 ? { label: 'Very high', tone: 'bad', note: '+1000 ml per hour' }
        : M.feelsLikeMax >= 33 ? { label: 'High', tone: 'warn', note: '+750 ml per hour' }
        : { label: 'Normal', tone: 'ok', note: 'Standard intake' };
      return {
        summary: 'Training window',
        tiles: [
          tile('Best run window', run.text, run.sub || '', 'ok', run.note, 70, 100),
          tile('Wind', M.wind_speed, 'km/h', wind.tone, wind.label, M.wind_speed, 30),
          tile('Heat index', M.feelsLikeMax, '°C', heat.tone, heat.label, M.feelsLikeMax, 45),
          tile('Hydration need', hydration.label, '', hydration.tone, hydration.note, M.feelsLikeMax, 45),
        ],
        panel: {
          title: 'Sun & session plan', meta: 'Today',
          rows: [
            { label: 'Sunrise', value: fmtClock(M.sunrise), note: 'Best light for a morning run', tone: 'info' },
            { label: 'Sunset', value: fmtClock(M.sunset), note: 'Evening session cut-off', tone: 'info' },
            { label: 'Evening window', value: M.precip_prob_max24 > 50 ? 'Storm risk after dusk' : 'Clear through evening', note: `Rain chance ${Math.round(M.precip_prob_max24)}% today`, tone: M.precip_prob_max24 > 50 ? 'warn' : 'ok' },
          ],
        },
        tip: `Heat builds fast after mid-morning. Keep tempo work in the early window and ${M.precip_prob_max24 > 50 ? 'cap the evening run short — storm risk builds after dusk.' : 'the evening stays clear for a longer run.'}`,
      };
    }
    case 'beach': {
      const wave = classify(M.mocked.wave_height_m, findThresholds(personaDef, 'wave_height_m'));
      const sea = classify(M.mocked.sea_temp_c, findThresholds(personaDef, 'sea_temp_c'));
      const flag = classify(M.mocked.safety_flag, findThresholds(personaDef, 'safety_flag'));
      const rip = classify(M.mocked.rip_current, findThresholds(personaDef, 'rip_current'));
      return {
        summary: M.city,
        tiles: [
          tile('Wave height', M.mocked.wave_height_m, 'm', wave.tone, wave.label, M.mocked.wave_height_m, 2),
          tile('Sea temp', M.mocked.sea_temp_c, '°C', sea.tone, sea.label, M.mocked.sea_temp_c, 32),
          tile('Safety flag', cap(M.mocked.safety_flag), '', flag.tone, flag.label, 60, 100),
          tile('Rip current', cap(M.mocked.rip_current), '', rip.tone, rip.label, rip.tone === 'bad' ? 90 : rip.tone === 'warn' ? 55 : 20, 100),
        ],
        panel: {
          title: 'Tide timings', meta: 'INCOIS · sample data',
          rows: [
            { label: 'High tide', value: fmtHour(M.mocked.high_tide), note: 'Best surf window before this', tone: 'info' },
            { label: 'Low tide', value: fmtHour(M.mocked.low_tide), note: 'Wide beach, rock pools', tone: 'info' },
            { label: 'Sea state', value: wave.tone === 'ok' ? 'Calm' : wave.tone === 'warn' ? 'Choppy' : 'Rough', note: `Wind ${M.wind_speed} km/h`, tone: wave.tone },
          ],
        },
        tip: `Surf the two hours before the ${fmtHour(M.mocked.high_tide)} high tide. ${cap(M.mocked.safety_flag)} flag today — ${M.mocked.safety_flag === 'green' ? 'safe to swim.' : M.mocked.safety_flag === 'yellow' ? 'stay within the patrolled stretch.' : 'no swimming advised.'}`,
      };
    }
    case 'travel': {
      const dest = travel?.destination;
      const originVis = M.visibility_km, originGusts = M.gustsMaxToday;
      const flight = originVis < 1 || originGusts > 45 ? { tone: 'bad', label: 'High' } : originVis < 3 ? { tone: 'warn', label: 'Moderate' } : { tone: 'ok', label: 'Low' };
      const destPrecip = dest ? classify(dest.precipProbMax, findThresholds(personaDef, 'dest_precip_prob')) : { tone: 'info', label: 'No saved trip' };
      const tempDelta = dest ? Math.round(M.tempNow - dest.tempNow) : 0;
      const items = [];
      if (dest && dest.precipProbMax > 50) items.push('raincoat');
      if (dest && Math.abs(tempDelta) > 10) items.push('layers');
      if (dest && dest.uvMax >= 8) items.push('sunscreen');
      return {
        summary: `${travel?.saved?.length || 0} saved destination${(travel?.saved?.length || 0) === 1 ? '' : 's'}`,
        tiles: [
          tile(`Flight risk · ${airportCode(M.city)}`, flight.label, '', flight.tone, `Visibility ${originVis} km`, originVis, 10),
          tile('Rain at arrival', dest ? dest.precipProbMax : '—', dest ? '%' : '', destPrecip.tone, dest ? `${destPrecip.label} in ${dest.name}` : 'Add a destination below', dest?.precipProbMax || 0, 100),
          tile('Temp swing', dest ? Math.abs(tempDelta) : '—', dest ? '°C' : '', 'info', dest ? `${M.city} ${M.tempNow}° → ${dest.name} ${dest.tempNow}°` : '—', Math.abs(tempDelta), 20),
          tile('Packing', items.length, 'items', 'info', items.length ? cap(items.join(', ')) : 'Nothing critical', items.length, 3),
        ],
        panel: {
          title: 'Saved destinations', meta: 'Live',
          rows: (travel?.saved || []).slice(0, 3).map((s) => ({
            label: s.name, value: s.tempNow != null ? `${s.tempNow}° ${s.condition}` : '…',
            note: s.note || 'Loading…', tone: s.tone || 'info',
          })),
        },
        tip: dest
          ? `Your saved trip to ${dest.name} shows ${dest.condition.toLowerCase()} at ${dest.tempNow}°. ${items.length ? `Pack ${items[0]}.` : 'No special packing needed.'}`
          : 'Save a destination city to see arrival conditions and packing tips.',
      };
    }
    case 'family': {
      const morningIdx = findHourAt(M, 7);
      const morningVis = (M.hourly.visibility?.[morningIdx] ?? 8000) / 1000;
      const morningPrecip = M.hourly.precipitation_probability?.[morningIdx] ?? M.precip_prob_now;
      const morningFeels = M.hourly.apparent_temperature?.[morningIdx] ?? M.feelsLikeNow;
      const commuteScore = morningVis < 2 || morningPrecip > 60 ? { tone: 'bad', label: 'Poor' } : morningVis < 4 || morningPrecip > 30 ? { tone: 'warn', label: 'Fair' } : { tone: 'ok', label: 'Good' };
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
        summary: 'School day',
        tiles: [
          tile('School commute', commuteScore.label, '', commuteScore.tone, `${M.conditionLabel}, ${Math.round(morningFeels)}° at 7:30 AM`, commuteScore.tone === 'ok' ? 25 : commuteScore.tone === 'warn' ? 55 : 85, 100),
          tile('Rain by 3 PM', Math.round(precip1500), '%', rain3pm.tone, rain3pm.label, precip1500, 100),
          tile('Playtime index', playtime, 'of 10', playTone, playTone === 'ok' ? 'Good for outdoor play' : playTone === 'warn' ? 'Limit outdoor play' : 'Indoor play advised', playtime, 10),
          tile('AQI for kids', M.aqi_pm25, 'AQI', aqiKids.tone, aqiKids.label, M.aqi_pm25, 300),
        ],
        panel: {
          title: 'Day plan for the family', meta: 'Warnings included',
          rows: [
            { label: 'Morning drop-off', value: '7:30 AM', note: commuteScore.tone === 'ok' ? 'Clear conditions' : 'Leave a few minutes early', tone: commuteScore.tone },
            { label: 'Afternoon pick-up', value: '3:10 PM', note: precip1500 > 50 ? 'Showers likely — carry umbrellas' : 'Dry conditions expected', tone: precip1500 > 50 ? 'bad' : 'ok' },
            { label: 'Evening outdoors', value: 'After 6 PM', note: `Temperature settles to ${M.tempMin}°`, tone: playTone === 'bad' ? 'warn' : 'ok' },
          ],
        },
        tip: precip1500 > 60
          ? `Send raincoats today: a ${Math.round(precip1500)}% chance of showers overlaps school pick-up.`
          : `Good conditions for the school run today. ${playTone !== 'ok' ? 'Keep outdoor play shorter this afternoon.' : 'Outdoor play is fine after school.'}`,
      };
    }
    case 'agri': {
      const soil = classify(M.soil_moisture_pct, findThresholds(personaDef, 'soil_moisture_pct'));
      const rain48 = classify(M.rain_48h_mm, findThresholds(personaDef, 'rain_48h_mm'));
      const frost = classify(M.min_temp_c, findThresholds(personaDef, 'min_temp_c'));
      const gusts = classify(M.gustsMaxToday, findThresholds(personaDef, 'gusts_kmh'));
      return {
        summary: M.city,
        tiles: [
          tile('Soil moisture', M.soil_moisture_pct, '% vol', soil.tone, soil.label, M.soil_moisture_pct, 100),
          tile('Rainfall 48 h', M.rain_48h_mm, 'mm', rain48.tone, rain48.label, M.rain_48h_mm, 60),
          tile('Frost risk', frost.label, '', frost.tone, `Min temp ${M.min_temp_c}°C`, Math.max(0, 20 - M.min_temp_c) * 5, 100),
          tile('Wind gusts', M.gustsMaxToday, 'km/h', gusts.tone, gusts.label, M.gustsMaxToday, 60),
        ],
        panel: {
          title: 'Kisan advisory', meta: 'Agromet · IMD',
          rows: [
            { label: 'Irrigation', value: M.rain_48h_mm >= 15 ? 'Hold 2 days' : 'As scheduled', note: `${M.rain_48h_mm} mm rain expected next 48 h`, tone: M.rain_48h_mm >= 15 ? 'ok' : 'info' },
            { label: 'Sowing window', value: soil.tone === 'ok' ? 'Favourable' : 'Wait', note: 'Soil moisture and temperature', tone: soil.tone },
            { label: 'Spray schedule', value: M.gustsMaxToday > 30 ? 'Postpone' : 'Proceed', note: 'Gusts above 30 km/h cause drift', tone: M.gustsMaxToday > 30 ? 'bad' : 'ok' },
          ],
        },
        tip: M.rain_48h_mm >= 15
          ? `Hold irrigation — ${M.rain_48h_mm} mm of rain covers this cycle. ${M.gustsMaxToday > 30 ? 'Reschedule spraying when gusts subside.' : ''}`
          : `Soil moisture is ${soil.label.toLowerCase()}. ${M.gustsMaxToday > 30 ? 'Delay spraying — gusts exceed 30 km/h.' : 'Conditions are workable today.'}`,
      };
    }
    case 'commute': {
      const vis = classify(M.visibility_km, findThresholds(personaDef, 'visibility_km'));
      const spray = M.precip_prob_max24 > 60 ? { tone: 'bad', label: 'Likely' } : M.precip_prob_max24 > 30 ? { tone: 'warn', label: 'Possible' } : { tone: 'ok', label: 'Unlikely' };
      const delay = M.mocked.traffic_delay_min + (spray.tone === 'bad' ? 12 : spray.tone === 'warn' ? 5 : 0);
      const hazard = M.gustsMaxToday > 40 ? { tone: 'bad', label: 'Storm' } : M.visibility_km < 1 ? { tone: 'bad', label: 'Fog' } : { tone: 'ok', label: 'Clear' };
      return {
        summary: M.city,
        tiles: [
          tile('Visibility', M.visibility_km, 'km', vis.tone, vis.label, M.visibility_km, 10),
          tile('Road spray', spray.label, '', spray.tone, M.precip_prob_max24 > 60 ? 'Waterlogging risk' : 'Roads mostly dry', M.precip_prob_max24, 100),
          tile('Delay added', `+${delay}`, 'min', delay > 20 ? 'warn' : 'ok', `vs usual commute`, delay, 40),
          tile('Fog / storm', hazard.label, '', hazard.tone, hazard.tone === 'bad' ? 'Plan an alternative route' : 'No hazard expected', hazard.tone === 'bad' ? 85 : 15, 100),
        ],
        panel: {
          title: 'Route conditions', meta: 'Weather + traffic overlay',
          rows: [
            { label: 'Main route', value: spray.tone === 'ok' ? 'Normal' : 'Slow', note: vis.tone !== 'ok' ? 'Reduced visibility' : 'Clear roads', tone: vis.tone },
            { label: 'Low-lying underpass', value: spray.tone === 'bad' ? 'Avoid' : 'Passable', note: 'Historic waterlogging point', tone: spray.tone },
            { label: 'Transit alternative', value: 'Normal', note: 'Best option during squalls', tone: 'ok' },
          ],
        },
        tip: hazard.tone === 'bad'
          ? `${hazard.label} risk today — add ${delay} minutes and consider a transit alternative.`
          : `Smooth commute expected. ${spray.tone !== 'ok' ? 'Watch for slick roads during showers.' : ''}`,
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
