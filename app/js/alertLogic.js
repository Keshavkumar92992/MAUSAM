// Derives a list of active alerts from the same metrics bundle the Home
// screen uses, so the Alerts screen never disagrees with the Home banner.
import { fmtTime } from './utils.js';
import { t } from './i18n.js';

const SEVERITY_RANK = { bad: 0, warn: 1, info: 2 };

export function generateAlerts(m) {
  if (!m) return [];
  const alerts = [];
  const now = fmtTime(new Date());
  const stormSoon = (m.daily.weather_code || []).slice(0, 1).some((c) => [95, 96, 99].includes(c));

  if (m.gustsMaxToday > 60 || (stormSoon && m.gustsMaxToday > 45)) {
    alerts.push({
      tone: 'bad', badge: t('alert.severe_thunder.badge'),
      title: t('alert.severe_thunder.title'),
      body: t('alert.severe_thunder.body', { kmh: m.gustsMaxToday }),
      time: now,
    });
  } else if (m.gustsMaxToday > 40 || stormSoon) {
    alerts.push({
      tone: 'warn', badge: t('alert.thunder.badge'),
      title: t('alert.thunder.title'),
      body: t('alert.thunder.body', { kmh: m.gustsMaxToday }),
      time: now,
    });
  }

  if (m.precip_prob_max24 > 75) {
    alerts.push({
      tone: 'warn', badge: t('alert.heavy_rain.badge'),
      title: t('alert.heavy_rain.title'),
      body: t('alert.heavy_rain.body', { pct: Math.round(m.precip_prob_max24) }),
      time: now,
    });
  }

  if (m.aqi_pm25 > 300) {
    alerts.push({
      tone: 'bad', badge: t('alert.aqi_severe.badge'),
      title: t('alert.aqi_severe.title'),
      body: t('alert.aqi_severe.body', { aqi: m.aqi_pm25 }),
      time: now,
    });
  } else if (m.aqi_pm25 > 200) {
    alerts.push({
      tone: 'warn', badge: t('alert.aqi_poor.badge'),
      title: t('alert.aqi_poor.title'),
      body: t('alert.aqi_poor.body', { aqi: m.aqi_pm25 }),
      time: now,
    });
  }

  if (m.feelsLikeMax > 42) {
    alerts.push({
      tone: 'bad', badge: t('alert.heat_danger.badge'),
      title: t('alert.heat_danger.title'),
      body: t('alert.heat_danger.body', { temp: m.feelsLikeMax }),
      time: now,
    });
  } else if (m.feelsLikeMax > 38) {
    alerts.push({
      tone: 'warn', badge: t('alert.heat_advisory.badge'),
      title: t('alert.heat_advisory.title'),
      body: t('alert.heat_advisory.body', { temp: m.feelsLikeMax }),
      time: now,
    });
  }

  if (m.uv_index_max >= 9) {
    alerts.push({
      tone: 'warn', badge: t('alert.uv.badge'),
      title: t('alert.uv.title'),
      body: t('alert.uv.body', { uv: m.uv_index_max }),
      time: now,
    });
  }

  if (m.visibility_km < 1) {
    alerts.push({
      tone: 'bad', badge: t('alert.fog.badge'),
      title: t('alert.fog.title'),
      body: t('alert.fog.body', { km: m.visibility_km }),
      time: now,
    });
  }

  if (m.min_temp_c <= 4) {
    alerts.push({
      tone: 'warn', badge: t('alert.cold.badge'),
      title: t('alert.cold.title'),
      body: t('alert.cold.body', { temp: m.min_temp_c }),
      time: now,
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.tone] - SEVERITY_RANK[b.tone]);
}
