import { geocodeCity, fetchWeatherBundle } from './weatherApi.js';
import { buildMetrics } from './metrics.js';
import { buildPersonaView } from './personas.js';
import { buildTravelData, addSavedCity } from './travel.js';
import { loadState, saveState, fmtTime } from './utils.js';

const PHOTO_CROP = {
  health: { right: '-190px', top: '-300px', height: '790px' },
  travel: { right: '-140px', top: '-150px', height: '700px' },
  family: { right: '-90px', top: '-90px', height: '560px' },
  agri: { right: '-160px', top: '-280px', height: '760px' },
  commute: { right: '-120px', top: '-190px', height: '700px' },
  beach: { right: '0px', top: '-330px', height: '800px' },
  fitness: { right: '0px', top: '-30px', height: '710px' },
};

const SCRIM_TINT = {
  health: '250,244,236', fitness: '244,247,236', beach: '248,243,242',
  travel: '238,243,250', family: '250,245,236', agri: '242,247,238', commute: '238,246,247',
};

const DEFAULT_CITY = { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.5822, lon: 77.2 };

const root = document.getElementById('app-root');
let personaConfig = null;

const state = {
  status: 'loading',
  city: null,
  activePersona: 'health',
  metrics: null,
  travel: null,
  searchOpen: false,
  searchResults: [],
  searchQuery: '',
};

async function init() {
  const cfgRes = await fetch('./data/persona-config.json');
  personaConfig = await cfgRes.json();

  const saved = loadState();
  state.city = saved.city || DEFAULT_CITY;
  state.activePersona = saved.activePersona || 'health';

  render();
  await loadWeather();
}

async function loadWeather() {
  state.status = 'loading';
  render();
  try {
    const bundle = await fetchWeatherBundle(state.city.lat, state.city.lon);
    state.metrics = buildMetrics(bundle, state.city.name);
    state.status = 'ready';
    render();
    state.travel = await buildTravelData(state.metrics.tempNow);
    render();
  } catch (err) {
    console.error(err);
    state.status = 'error';
    render();
  }
}

function selectPersona(id) {
  state.activePersona = id;
  saveState({ activePersona: id });
  render();
}

function openSearch() {
  state.searchOpen = true;
  state.searchResults = [];
  state.searchQuery = '';
  render();
  const input = document.getElementById('search-input');
  if (input) input.focus();
}

function closeSearch() {
  state.searchOpen = false;
  render();
}

let searchDebounce = null;
async function onSearchInput(value) {
  state.searchQuery = value;
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    try {
      state.searchResults = await geocodeCity(value);
    } catch {
      state.searchResults = [];
    }
    render();
  }, 300);
}

async function selectCity(c) {
  state.city = { name: c.name, admin1: c.admin1, country: c.country, lat: c.lat, lon: c.lon };
  state.searchOpen = false;
  saveState({ city: state.city });
  render();
  await loadWeather();
}

function saveDestination() {
  if (!state.city) return;
  addSavedCity({ name: `${state.city.name}${state.city.admin1 ? ', ' + state.city.admin1 : ''}`, lat: state.city.lat, lon: state.city.lon });
  buildTravelData(state.metrics?.tempNow).then((t) => { state.travel = t; render(); });
}

function alertInfo(m) {
  if (!m) return null;
  const stormSoon = (m.daily.weather_code || []).slice(0, 1).some((c) => [95, 96, 99].includes(c));
  if (m.gustsMaxToday > 45 || stormSoon) {
    return {
      eyebrow: 'YELLOW ALERT · IMD NOWCAST',
      body: `Thunderstorm with gusty winds (up to ${m.gustsMaxToday} km/h) possible today. Secure loose objects outdoors.`,
    };
  }
  if (m.aqi_pm25 > 200) {
    return { eyebrow: 'AIR QUALITY ALERT', body: `AQI in the poor–severe range (${m.aqi_pm25}). Sensitive groups should limit outdoor exposure.` };
  }
  return null;
}

function skyGradientClass() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'linear-gradient(180deg,#B9D9F2 0%,#D7E7F2 42%,#EFEDE6 78%,#F5F4EF 100%)';
  if (h >= 11 && h < 17) return 'linear-gradient(180deg,#9EC9EC 0%,#CFE2EF 40%,#EEEDE5 78%,#F5F4EF 100%)';
  return 'linear-gradient(180deg,#F2C9A4 0%,#EFD9C6 38%,#F0EBE2 78%,#F5F4EF 100%)';
}

function render() {
  if (!personaConfig) { root.innerHTML = ''; return; }
  const persona = state.activePersona;
  const personaDef = personaConfig.personas.find((p) => p.id === persona) || personaConfig.personas[0];
  const crop = PHOTO_CROP[persona];
  const tint = SCRIM_TINT[persona];

  root.innerHTML = `
    <div class="sky-gradient" style="background:${skyGradientClass()}"></div>
    <div class="texture-glow"></div>
    <div class="texture-grain"></div>

    <div class="hero-photo-band">
      <div style="position:absolute;left:0;right:${crop.right};top:${crop.top};height:${crop.height};width:100%">
        <img src="./assets/${persona}.png" style="width:100%;height:100%;object-fit:cover" alt="">
      </div>
    </div>
    <div class="hero-scrim" style="background:
      linear-gradient(180deg,rgba(245,244,239,.22) 0%,rgba(245,244,239,.14) 50%,rgba(245,244,239,.55) 84%,rgba(245,244,239,.97) 100%),
      linear-gradient(96deg,rgba(${tint},.88) 0%,rgba(${tint},.62) 36%,rgba(${tint},.06) 74%,rgba(${tint},0) 100%)"></div>
    <div class="hero-accent-bar" style="background:linear-gradient(90deg,${personaDef.accent_bar[0]},${personaDef.accent_bar[1]} 55%,${personaDef.accent_bar[2]})"></div>

    <div class="content">
      ${renderHeader()}
      ${renderPersonaChips(personaDef)}
      ${state.status === 'ready' ? renderBody(personaDef) : state.status === 'error' ? renderError() : renderSkeleton()}
      ${renderFooter()}
      ${renderNav()}
    </div>
    ${state.searchOpen ? renderSearch() : ''}
  `;

  wireEvents(personaDef);
}

function renderHeader() {
  const m = state.metrics;
  const alert = m ? alertInfo(m) : null;
  const iconClass = m ? (m.conditionIcon === 'rain' ? 'rain' : m.conditionIcon === 'cloud' ? 'cloud' : '') : '';
  return `
    <div class="header-block">
      <div class="wordmark-row">
        <div class="wordmark"><span class="en">Mausam</span><span class="hi">मौसम</span></div>
        <div class="header-icons">
          <button class="icon-btn" id="btn-search">⌕</button>
          <button class="icon-btn" id="btn-menu">☰</button>
        </div>
      </div>
      <div class="location-row" id="location-row">
        <span class="location-dot"></span>
        <span class="location-city">${state.city.name}${state.city.admin1 ? ', ' + state.city.admin1 : ''}</span>
        <span class="location-caret">▾</span>
      </div>
      <div class="location-sub">${m ? `Live position · updated ${fmtTime(new Date())} IST` : 'Locating…'}</div>

      <div class="current-row">
        <div class="temp-block">
          <div class="deg-row">
            <span class="deg">${m ? m.tempNow : '--'}</span><span class="unit">°C</span>
          </div>
          <div class="condition">${m ? `${m.conditionLabel} · Feels like ${m.feelsLikeNow}°` : 'Loading…'}</div>
          <div class="minmax">${m ? `H ${m.tempMax}°&nbsp; L ${m.tempMin}° &nbsp;·&nbsp; Humidity ${m.humidityNow}%` : ''}</div>
        </div>
        <div class="condition-icon ${iconClass}">
          <div class="sun"></div>
          <div class="cloud-a"></div>
          <div class="cloud-b"></div>
        </div>
      </div>

      ${alert ? `
        <div class="alert-banner">
          <div class="alert-badge">!</div>
          <div>
            <div class="alert-eyebrow">${alert.eyebrow}</div>
            <div class="alert-body">${alert.body}</div>
          </div>
        </div>` : ''}
    </div>
  `;
}

function renderPersonaChips(activeDef) {
  return `
    <div class="persona-scroll" id="persona-scroll">
      ${personaConfig.personas.map((p) => `
        <div class="persona-chip ${p.id === state.activePersona ? 'active' : ''}" data-persona="${p.id}">
          <span class="dot" style="background:${p.id === state.activePersona ? '#fff' : p.dot}"></span>
          ${p.label}
        </div>
      `).join('')}
    </div>
  `;
}

function renderSkeleton() {
  return `
    <div class="section-body">
      <div class="section-heading"><div class="title">Loading your update…</div></div>
      <div class="tile-grid">
        ${[0, 1, 2, 3].map(() => `
          <div class="tile skeleton">
            <div class="eyebrow">LABEL</div>
            <div class="value-row"><span class="value">00</span></div>
            <div class="status-row"><span class="status-text">Status</span></div>
            <div class="progress-track"><div class="progress-fill" style="width:30%;background:rgba(23,26,28,.12)"></div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderError() {
  return `
    <div class="section-body">
      <div class="error-card">IMD feed unavailable — showing last known state.<br>Pull down to retry.</div>
    </div>
  `;
}

function renderBody(personaDef) {
  const view = buildPersonaView(state.activePersona, personaDef, state.metrics, state.travel);
  return `
    <div class="section-body">
      <div class="section-heading">
        <div class="title">For you · ${personaDef.label}</div>
        <div class="meta">${view.summary}</div>
      </div>

      <div class="tile-grid">
        ${view.tiles.map((t) => `
          <div class="tile">
            <div class="eyebrow">${t.label.toUpperCase()}</div>
            <div class="value-row"><span class="value">${t.value}</span>${t.unit ? `<span class="unit">${t.unit}</span>` : ''}</div>
            <div class="status-row"><span class="status-dot" style="background:${t.color}"></span><span class="status-text" style="color:${t.color}">${t.statusLabel}</span></div>
            <div class="progress-track"><div class="progress-fill" style="width:${t.pct};background:${t.color}"></div></div>
          </div>
        `).join('')}
      </div>

      <div class="panel">
        <div class="panel-header"><div class="title">${view.panel.title}</div><div class="meta">${view.panel.meta}</div></div>
        <div>
          ${view.panel.rows.map((r) => `
            <div class="panel-row">
              <div style="min-width:0">
                <div class="label">${r.label}</div>
                <div class="note">${r.note}</div>
              </div>
              <div class="rvalue" style="color:${{ ok: '#2E7D5B', warn: '#C9772A', bad: '#C2452D', info: '#2C6EA8' }[r.tone] || '#171A1C'}">${r.value}</div>
            </div>
          `).join('')}
        </div>
      </div>

      ${state.activePersona === 'travel' ? `
        <button id="btn-save-dest" style="margin-top:10px;width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.9);border:1px solid rgba(23,26,28,.1);font-size:12px;font-weight:600;color:var(--ink)">+ Save "${state.city.name}" as a destination</button>
      ` : ''}

      <div class="guidance-card">
        <div class="guidance-badge"></div>
        <div>
          <div class="guidance-eyebrow">GUIDANCE FOR YOU</div>
          <div class="guidance-body">${view.tip}</div>
        </div>
      </div>

      ${renderOutlook()}

    </div>
  `;
}

function renderOutlook() {
  const m = state.metrics;
  if (!m) return '';
  const days = (m.daily.time || []).slice(1, 8);
  const icons = { sun: '#F2A93B', cloud: '#8FA8BC', rain: '#5F7C93' };
  return `
    <div class="outlook">
      <div class="outlook-header"><div class="title">7-day outlook</div><div class="meta">Rain probability</div></div>
      <div class="outlook-grid">
        ${days.map((iso, i) => {
          const idx = i + 1;
          const code = m.daily.weather_code?.[idx] ?? 0;
          const cond = code === 0 || code <= 2 ? 'sun' : [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code) ? 'rain' : 'cloud';
          const rain = Math.round(m.daily.precipitation_probability_max?.[idx] ?? 0);
          const hi = Math.round(m.daily.temperature_2m_max?.[idx] ?? 0);
          const lo = Math.round(m.daily.temperature_2m_min?.[idx] ?? 0);
          const day = new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' });
          return `
            <div class="outlook-col">
              <div class="day">${day}</div>
              <div class="dot" style="background:${icons[cond]}"></div>
              <div class="bar-track"><div class="bar-fill" style="height:${rain}%"></div></div>
              <div class="rain-label">${rain}%</div>
              <div class="hi">${hi}°</div>
              <div class="lo">${lo}°</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderFooter() {
  return `<div class="footer-note">India Meteorological Department<br>Ministry of Earth Sciences, Government of India</div>`;
}

function renderNav() {
  return `
    <div class="bottom-nav">
      <div class="nav-item home active"><div class="glyph"></div><span class="label">Home</span></div>
      <a class="nav-item radar" href="./radar.html"><div class="glyph"></div><span class="label">Radar</span></a>
      <div class="nav-item"><div class="glyph"></div><span class="label">Alerts</span></div>
      <div class="nav-item"><div class="glyph"></div><span class="label">Saved</span></div>
    </div>
  `;
}

function renderSearch() {
  return `
    <div class="search-overlay" id="search-overlay">
      <div class="search-panel">
        <div class="search-input-row">
          <input id="search-input" class="search-input" placeholder="Search city…" value="${state.searchQuery}">
          <button class="search-close" id="search-close">Cancel</button>
        </div>
        <div class="search-results">
          ${state.searchQuery.length < 2 ? '<div class="search-empty">Type at least 2 characters</div>' :
            state.searchResults.length === 0 ? '<div class="search-empty">No matches</div>' :
            state.searchResults.map((r, i) => `
              <div class="search-result" data-idx="${i}">
                <div class="name">${r.name}</div>
                <div class="region">${[r.admin1, r.country].filter(Boolean).join(', ')}</div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>
  `;
}

function wireEvents() {
  document.getElementById('btn-search')?.addEventListener('click', openSearch);
  document.getElementById('location-row')?.addEventListener('click', openSearch);
  document.getElementById('search-close')?.addEventListener('click', closeSearch);
  document.getElementById('search-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'search-overlay') closeSearch();
  });
  document.getElementById('search-input')?.addEventListener('input', (e) => onSearchInput(e.target.value));
  document.querySelectorAll('.search-result').forEach((el) => {
    el.addEventListener('click', () => selectCity(state.searchResults[+el.dataset.idx]));
  });
  document.querySelectorAll('.persona-chip').forEach((el) => {
    el.addEventListener('click', () => selectPersona(el.dataset.persona));
  });
  document.getElementById('btn-save-dest')?.addEventListener('click', saveDestination);
}

init();
