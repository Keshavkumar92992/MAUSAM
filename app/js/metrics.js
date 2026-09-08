import { weatherCodeToCondition } from './weatherApi.js';
import { mockedForCity } from './mock.js';

// CPCB PM2.5 (24h, µg/m³) -> Indian National AQI sub-index, piecewise linear.
function pm25ToAQI(pm) {
  if (pm == null) return null;
  const bp = [
    [0, 30, 0, 50],
    [31, 60, 51, 100],
    [61, 90, 101, 200],
    [91, 120, 201, 300],
    [121, 250, 301, 400],
    [251, 380, 401, 450],
    [381, 500, 451, 500],
  ];
  for (const [cLo, cHi, aLo, aHi] of bp) {
    if (pm >= cLo && pm <= cHi) {
      return Math.round(aLo + ((pm - cLo) / (cHi - cLo)) * (aHi - aLo));
    }
  }
  return pm > 500 ? 500 : 0;
}

function nowIndex(times) {
  const now = Date.now();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]).getTime() <= now) idx = i;
    else break;
  }
  return idx;
}

export function buildMetrics({ forecast, air }, city) {
  const cur = forecast.current || {};
  const hourly = forecast.hourly || {};
  const daily = forecast.daily || {};
  const airHourly = air?.hourly || {};

  const hIdx = nowIndex(hourly.time || []);
  const window24 = (arr) => (arr || []).slice(hIdx, hIdx + 24);

  const condition = weatherCodeToCondition(cur.weather_code ?? daily.weather_code?.[0] ?? 0);
  const pm25Now = air?.current?.pm2_5 ?? airHourly.pm2_5?.[hIdx] ?? null;
  const aqiNow = pm25ToAQI(pm25Now);

  const uvNow = hourly.uv_index?.[hIdx] ?? daily.uv_index_max?.[0] ?? 0;
  const visibilityKm = (hourly.visibility?.[hIdx] ?? 10000) / 1000;
  const gustsNow = cur.wind_gusts_10m ?? hourly.wind_gusts_10m?.[hIdx] ?? 0;
  const soilMoisture = (hourly.soil_moisture_0_to_1cm?.[hIdx] ?? 0.3) * 100;

  const rain48h = window24(hourly.precipitation_probability).length
    ? (daily.precipitation_sum || []).slice(0, 2).reduce((a, b) => a + (b || 0), 0)
    : 0;
  const minTempNext = Math.min(...(daily.temperature_2m_min || [cur.temperature_2m ?? 20]).slice(0, 2));
  const gustsMaxToday = daily.wind_gusts_10m_max?.[0] ?? gustsNow;

  const mocked = mockedForCity(city, { pm25: aqiNow, humidity: cur.relative_humidity_2m });

  return {
    city,
    tempNow: Math.round(cur.temperature_2m ?? 0),
    feelsLikeNow: Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 0),
    conditionLabel: condition.label,
    conditionKey: condition.key,
    conditionIcon: condition.icon,
    tempMax: Math.round(daily.temperature_2m_max?.[0] ?? cur.temperature_2m ?? 0),
    tempMin: Math.round(daily.temperature_2m_min?.[0] ?? cur.temperature_2m ?? 0),
    feelsLikeMax: Math.round(daily.apparent_temperature_max?.[0] ?? cur.apparent_temperature ?? 0),
    humidityNow: Math.round(cur.relative_humidity_2m ?? 0),
    aqi_pm25: aqiNow ?? 80,
    uv_index: Math.round(uvNow),
    uv_index_max: Math.round(daily.uv_index_max?.[0] ?? uvNow),
    wind_speed: Math.round(cur.wind_speed_10m ?? 0),
    gusts_kmh: Math.round(gustsNow),
    gustsMaxToday: Math.round(gustsMaxToday),
    visibility_km: +visibilityKm.toFixed(1),
    precip_prob_now: hourly.precipitation_probability?.[hIdx] ?? 0,
    precip_prob_max24: Math.max(...window24(hourly.precipitation_probability), 0),
    // Actual measured precipitation for the last hour (mm) — this is what
    // answers "is it raining right now", as opposed to forecast probability.
    precip_now_mm: +(cur.precipitation ?? 0).toFixed(1),
    soil_moisture_pct: Math.round(soilMoisture),
    rain_48h_mm: Math.round(rain48h),
    min_temp_c: Math.round(minTempNext),
    sunrise: daily.sunrise?.[0],
    sunset: daily.sunset?.[0],
    hIdx,
    hourly,
    daily,
    mocked,
  };
}
