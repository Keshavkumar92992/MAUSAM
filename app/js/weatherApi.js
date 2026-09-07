// Live weather via Open-Meteo — free, no API key required.
// https://open-meteo.com/en/docs

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

export async function geocodeCity(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `${GEOCODE_BASE}?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('geocode failed');
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function fetchWeatherBundle(lat, lon) {
  const forecastUrl =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,uv_index,visibility,wind_speed_10m,wind_gusts_10m,soil_moisture_0_to_1cm,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,precipitation_sum,uv_index_max,wind_gusts_10m_max,sunrise,sunset` +
    `&timezone=auto&forecast_days=8&wind_speed_unit=kmh`;

  const airUrl =
    `${AIR_QUALITY_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=pm2_5&hourly=pm2_5&timezone=auto&forecast_days=1`;

  const [forecastRes, airRes] = await Promise.all([fetch(forecastUrl), fetch(airUrl)]);
  if (!forecastRes.ok) throw new Error('weather fetch failed');
  const forecast = await forecastRes.json();
  const air = airRes.ok ? await airRes.json() : null;

  return { forecast, air };
}

export async function fetchDestinationSummary(lat, lon) {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code` +
    `&daily=precipitation_probability_max,uv_index_max&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('destination fetch failed');
  const data = await res.json();
  const condition = weatherCodeToCondition(data.current?.weather_code ?? 0);
  return {
    tempNow: Math.round(data.current?.temperature_2m ?? 0),
    condition: condition.label,
    precipProbMax: Math.round(data.daily?.precipitation_probability_max?.[0] ?? 0),
    uvMax: Math.round(data.daily?.uv_index_max?.[0] ?? 0),
  };
}

// Reverse geocode via BigDataCloud's free client-side endpoint (no API
// key, CORS-friendly) — Open-Meteo's geocoder is forward-search only.
export async function reverseGeocode(lat, lon) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('reverse geocode failed');
  const data = await res.json();
  return {
    name: data.city || data.locality || data.principalSubdivision || 'Current location',
    admin1: data.principalSubdivision || '',
    country: data.countryName || '',
  };
}

// Wraps the browser Geolocation API in a promise and attaches a
// human-readable name via reverseGeocode, with a plain fallback label
// if that lookup fails (coordinates alone are still enough to fetch weather).
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device/browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        try {
          const place = await reverseGeocode(lat, lon);
          resolve({ ...place, lat, lon });
        } catch {
          resolve({ name: 'Current location', admin1: '', country: '', lat, lon });
        }
      },
      (err) => {
        const messages = {
          1: 'Location permission denied — enable it in your browser/phone settings.',
          2: 'Could not determine your location right now.',
          3: 'Location request timed out.',
        };
        reject(new Error(messages[err.code] || 'Could not get your location.'));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

export function weatherCodeToCondition(code) {
  // WMO weather codes -> short label + coarse icon family
  if (code === 0) return { label: 'Clear', icon: 'sun' };
  if ([1, 2].includes(code)) return { label: 'Partly cloudy', icon: 'sun' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if ([45, 48].includes(code)) return { label: 'Haze', icon: 'cloud' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', icon: 'rain' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snow', icon: 'rain' };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', icon: 'rain' };
  return { label: 'Cloudy', icon: 'cloud' };
}
