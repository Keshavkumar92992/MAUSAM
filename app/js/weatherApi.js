// Live weather via Open-Meteo — free, no API key required.
// https://open-meteo.com/en/docs

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

// Open-Meteo's geocoder is a literal place-name index — searching an
// Indian STATE name (e.g. "Bihar") mostly matches tiny same-named
// villages elsewhere (Bangladesh, Pakistan, obscure hamlets), not the
// state itself, since it has no notion of administrative regions.
// Resolve state/UT names to their capital city directly instead.
const INDIAN_STATES = {
  'andhra pradesh': { name: 'Amaravati', admin1: 'Andhra Pradesh', lat: 16.5062, lon: 80.6480 },
  'arunachal pradesh': { name: 'Itanagar', admin1: 'Arunachal Pradesh', lat: 27.0844, lon: 93.6053 },
  assam: { name: 'Guwahati', admin1: 'Assam', lat: 26.1445, lon: 91.7362 },
  bihar: { name: 'Patna', admin1: 'Bihar', lat: 25.5941, lon: 85.1376 },
  chhattisgarh: { name: 'Raipur', admin1: 'Chhattisgarh', lat: 21.2514, lon: 81.6296 },
  goa: { name: 'Panaji', admin1: 'Goa', lat: 15.4909, lon: 73.8278 },
  gujarat: { name: 'Gandhinagar', admin1: 'Gujarat', lat: 23.2156, lon: 72.6369 },
  haryana: { name: 'Chandigarh', admin1: 'Haryana', lat: 30.7333, lon: 76.7794 },
  'himachal pradesh': { name: 'Shimla', admin1: 'Himachal Pradesh', lat: 31.1048, lon: 77.1734 },
  jharkhand: { name: 'Ranchi', admin1: 'Jharkhand', lat: 23.3441, lon: 85.3096 },
  karnataka: { name: 'Bengaluru', admin1: 'Karnataka', lat: 12.9716, lon: 77.5946 },
  kerala: { name: 'Thiruvananthapuram', admin1: 'Kerala', lat: 8.5241, lon: 76.9366 },
  'madhya pradesh': { name: 'Bhopal', admin1: 'Madhya Pradesh', lat: 23.2599, lon: 77.4126 },
  maharashtra: { name: 'Mumbai', admin1: 'Maharashtra', lat: 19.0760, lon: 72.8777 },
  manipur: { name: 'Imphal', admin1: 'Manipur', lat: 24.8170, lon: 93.9368 },
  meghalaya: { name: 'Shillong', admin1: 'Meghalaya', lat: 25.5788, lon: 91.8933 },
  mizoram: { name: 'Aizawl', admin1: 'Mizoram', lat: 23.7271, lon: 92.7176 },
  nagaland: { name: 'Kohima', admin1: 'Nagaland', lat: 25.6751, lon: 94.1086 },
  odisha: { name: 'Bhubaneswar', admin1: 'Odisha', lat: 20.2961, lon: 85.8245 },
  punjab: { name: 'Chandigarh', admin1: 'Punjab', lat: 30.7333, lon: 76.7794 },
  rajasthan: { name: 'Jaipur', admin1: 'Rajasthan', lat: 26.9124, lon: 75.7873 },
  sikkim: { name: 'Gangtok', admin1: 'Sikkim', lat: 27.3389, lon: 88.6065 },
  'tamil nadu': { name: 'Chennai', admin1: 'Tamil Nadu', lat: 13.0827, lon: 80.2707 },
  telangana: { name: 'Hyderabad', admin1: 'Telangana', lat: 17.3850, lon: 78.4867 },
  tripura: { name: 'Agartala', admin1: 'Tripura', lat: 23.8315, lon: 91.2868 },
  'uttar pradesh': { name: 'Lucknow', admin1: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  uttarakhand: { name: 'Dehradun', admin1: 'Uttarakhand', lat: 30.3165, lon: 78.0322 },
  'west bengal': { name: 'Kolkata', admin1: 'West Bengal', lat: 22.5726, lon: 88.3639 },
  'andaman and nicobar islands': { name: 'Port Blair', admin1: 'Andaman and Nicobar Islands', lat: 11.6234, lon: 92.7265 },
  chandigarh: { name: 'Chandigarh', admin1: 'Chandigarh', lat: 30.7333, lon: 76.7794 },
  'dadra and nagar haveli and daman and diu': { name: 'Daman', admin1: 'Dadra and Nagar Haveli and Daman and Diu', lat: 20.3974, lon: 72.8328 },
  delhi: { name: 'New Delhi', admin1: 'Delhi', lat: 28.6139, lon: 77.2090 },
  'jammu and kashmir': { name: 'Srinagar', admin1: 'Jammu and Kashmir', lat: 34.0837, lon: 74.7973 },
  ladakh: { name: 'Leh', admin1: 'Ladakh', lat: 34.1526, lon: 77.5771 },
  lakshadweep: { name: 'Kavaratti', admin1: 'Lakshadweep', lat: 10.5669, lon: 72.6420 },
  puducherry: { name: 'Puducherry', admin1: 'Puducherry', lat: 11.9416, lon: 79.8083 },
};

function matchIndianStates(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  return Object.entries(INDIAN_STATES)
    .filter(([key]) => key === q || key.includes(q) || q.includes(key))
    .map(([, place]) => ({ name: place.name, admin1: place.admin1, country: 'India', lat: place.lat, lon: place.lon }));
}

// Every request here needs a deadline. Open-Meteo's geocoder went dark for
// minutes at a time during testing, and a bare fetch() has no timeout — the
// search box just sat there forever with no result and no error, which reads
// as "the app is broken" rather than "the lookup service is down".
function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export async function geocodeCity(query) {
  if (!query || query.trim().length < 2) return [];
  const stateMatches = matchIndianStates(query);
  const url = `${GEOCODE_BASE}?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`;
  let res;
  try {
    res = await fetchWithTimeout(url, 7000);
  } catch {
    // Offline, blocked or timed out. The state table is bundled, so a
    // search for a state name still resolves; anything else has to fail
    // loudly enough for the UI to say so.
    if (stateMatches.length) return stateMatches;
    throw new Error('geocode unavailable');
  }
  if (!res.ok) {
    if (stateMatches.length) return stateMatches;
    throw new Error('geocode unavailable');
  }
  const data = await res.json();
  const placeMatches = (data.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    lat: r.latitude,
    lon: r.longitude,
  }));
  // State/UT match (e.g. its capital) leads, since it's almost always
  // what someone searching a region name actually wants.
  const seen = new Set();
  return [...stateMatches, ...placeMatches].filter((p) => {
    const key = `${p.name}|${p.lat}|${p.lon}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  // Air quality is optional — a failure there must not cost the user their
  // whole forecast, so it resolves to null rather than rejecting the pair.
  const [forecastRes, airRes] = await Promise.all([
    fetchWithTimeout(forecastUrl, 12000),
    fetchWithTimeout(airUrl, 8000).catch(() => null),
  ]);
  if (!forecastRes.ok) throw new Error('weather fetch failed');
  const forecast = await forecastRes.json();
  const air = airRes && airRes.ok ? await airRes.json() : null;

  return { forecast, air };
}

export async function fetchDestinationSummary(lat, lon) {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code` +
    `&daily=precipitation_probability_max,uv_index_max&timezone=auto&forecast_days=1`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) throw new Error('destination fetch failed');
  const data = await res.json();
  const condition = weatherCodeToCondition(data.current?.weather_code ?? 0);
  return {
    tempNow: Math.round(data.current?.temperature_2m ?? 0),
    condition: condition.label,
    conditionKey: condition.key,
    precipProbMax: Math.round(data.daily?.precipitation_probability_max?.[0] ?? 0),
    uvMax: Math.round(data.daily?.uv_index_max?.[0] ?? 0),
  };
}

// Open-Meteo accepts comma-separated coordinate lists and answers with an
// array, so the assistant can price up a dozen candidate destinations in
// one request instead of a dozen. A single coordinate still comes back as
// a bare object, hence the normalising wrap.
export async function fetchMultiDaily(points) {
  if (!points.length) return [];
  const url =
    `${FORECAST_BASE}?latitude=${points.map((p) => p.lat).join(',')}` +
    `&longitude=${points.map((p) => p.lon).join(',')}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,` +
    `precipitation_probability_max,precipitation_sum,wind_gusts_10m_max,uv_index_max` +
    `&timezone=auto&forecast_days=2&wind_speed_unit=kmh`;
  const res = await fetchWithTimeout(url, 10000);
  if (!res.ok) throw new Error('multi forecast failed');
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// Reverse geocode via BigDataCloud's free client-side endpoint (no API
// key, CORS-friendly) — Open-Meteo's geocoder is forward-search only.
export async function reverseGeocode(lat, lon) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const res = await fetchWithTimeout(url, 7000);
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

// WMO weather codes -> i18n key + coarse icon family. `key` is what should
// be rendered; `label` is the English fallback kept for logic that compares
// conditions rather than displays them.
export function weatherCodeToCondition(code) {
  if (code === 0) return { key: 'cond.clear', label: 'Clear', icon: 'sun' };
  if ([1, 2].includes(code)) return { key: 'cond.partly_cloudy', label: 'Partly cloudy', icon: 'sun' };
  if (code === 3) return { key: 'cond.overcast', label: 'Overcast', icon: 'cloud' };
  if ([45, 48].includes(code)) return { key: 'cond.haze', label: 'Haze', icon: 'cloud' };
  if ([51, 53, 55, 56, 57].includes(code)) return { key: 'cond.drizzle', label: 'Drizzle', icon: 'rain' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { key: 'cond.rain', label: 'Rain', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { key: 'cond.snow', label: 'Snow', icon: 'rain' };
  if ([95, 96, 99].includes(code)) return { key: 'cond.thunderstorm', label: 'Thunderstorm', icon: 'rain' };
  return { key: 'cond.cloudy', label: 'Cloudy', icon: 'cloud' };
}
