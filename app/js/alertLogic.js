// Derives a list of active alerts from the same metrics bundle the Home
// screen uses, so the Alerts screen never disagrees with the Home banner.
import { fmtTime } from './utils.js';

const SEVERITY_RANK = { bad: 0, warn: 1, info: 2 };

export function generateAlerts(m) {
  if (!m) return [];
  const alerts = [];
  const now = fmtTime(new Date());
  const stormSoon = (m.daily.weather_code || []).slice(0, 1).some((c) => [95, 96, 99].includes(c));

  if (m.gustsMaxToday > 60 || (stormSoon && m.gustsMaxToday > 45)) {
    alerts.push({
      tone: 'bad', badge: 'ORANGE ALERT · IMD NOWCAST',
      title: 'Severe thunderstorm warning',
      body: `Damaging gusts up to ${m.gustsMaxToday} km/h likely with thunderstorm activity. Avoid open areas and secure loose objects outdoors.`,
      time: now,
    });
  } else if (m.gustsMaxToday > 40 || stormSoon) {
    alerts.push({
      tone: 'warn', badge: 'YELLOW ALERT · IMD NOWCAST',
      title: 'Thunderstorm with gusty winds',
      body: `Gusty winds up to ${m.gustsMaxToday} km/h likely today. Secure loose objects outdoors and avoid standing under trees.`,
      time: now,
    });
  }

  if (m.precip_prob_max24 > 75) {
    alerts.push({
      tone: 'warn', badge: 'HEAVY RAINFALL · IMD NOWCAST',
      title: 'Heavy rain, waterlogging likely',
      body: `Rain probability at ${Math.round(m.precip_prob_max24)}% today. Low-lying stretches and underpasses may see waterlogging.`,
      time: now,
    });
  }

  if (m.aqi_pm25 > 300) {
    alerts.push({
      tone: 'bad', badge: 'AIR QUALITY · SEVERE',
      title: 'Severe air quality',
      body: `AQI at ${m.aqi_pm25} (severe). Avoid all outdoor exertion; sensitive groups should stay indoors with air purification.`,
      time: now,
    });
  } else if (m.aqi_pm25 > 200) {
    alerts.push({
      tone: 'warn', badge: 'AIR QUALITY · POOR',
      title: 'Poor air quality',
      body: `AQI at ${m.aqi_pm25} (poor). Sensitive groups should limit prolonged outdoor exposure.`,
      time: now,
    });
  }

  if (m.feelsLikeMax > 42) {
    alerts.push({
      tone: 'bad', badge: 'HEAT WARNING',
      title: 'Dangerous heat',
      body: `Feels-like temperature reaching ${m.feelsLikeMax}°C. Avoid outdoor activity between 12–4 PM and stay hydrated.`,
      time: now,
    });
  } else if (m.feelsLikeMax > 38) {
    alerts.push({
      tone: 'warn', badge: 'HEAT ADVISORY',
      title: 'High heat index',
      body: `Feels-like temperature reaching ${m.feelsLikeMax}°C today. Limit strenuous outdoor activity during peak afternoon hours.`,
      time: now,
    });
  }

  if (m.uv_index_max >= 9) {
    alerts.push({
      tone: 'warn', badge: 'UV ADVISORY',
      title: 'Very high UV',
      body: `UV index peaking at ${m.uv_index_max} of 11. Use sunscreen, sunglasses, and seek shade between 11 AM–3 PM.`,
      time: now,
    });
  }

  if (m.visibility_km < 1) {
    alerts.push({
      tone: 'bad', badge: 'FOG ADVISORY',
      title: 'Dense fog',
      body: `Visibility down to ${m.visibility_km} km. Expect flight and rail delays; drive with fog lights and extra following distance.`,
      time: now,
    });
  }

  if (m.min_temp_c <= 4) {
    alerts.push({
      tone: 'warn', badge: 'COLD ADVISORY',
      title: 'Cold wave / frost risk',
      body: `Minimum temperature dropping to ${m.min_temp_c}°C. Frost risk for exposed crops and vulnerable outdoor workers overnight.`,
      time: now,
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.tone] - SEVERITY_RANK[b.tone]);
}
