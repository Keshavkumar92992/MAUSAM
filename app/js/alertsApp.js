import { fetchWeatherBundle } from './weatherApi.js';
import { buildMetrics } from './metrics.js';
import { generateAlerts } from './alertLogic.js';
import { loadState, fmtTime } from './utils.js';

const DEFAULT_CITY = { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.5822, lon: 77.2 };
const root = document.getElementById('app-root');
const saved = loadState();
const city = saved.city || DEFAULT_CITY;

function shell(inner) {
  root.innerHTML = `
    <div class="texture-glow"></div>
    <div class="texture-grain"></div>
    <div class="content">
      <div class="header-block" style="padding-top:44px">
        <div class="wordmark-row">
          <div class="wordmark"><span class="en">Alerts</span><span class="hi">चेतावनी</span></div>
        </div>
        <div class="location-row">
          <span class="location-dot"></span>
          <span class="location-city">${city.name}${city.admin1 ? ', ' + city.admin1 : ''}</span>
        </div>
        <div class="location-sub">IMD advisories · updated ${fmtTime(new Date())} IST</div>
      </div>
      <div class="section-body">${inner}</div>
      <div class="footer-note">India Meteorological Department<br>Ministry of Earth Sciences, Government of India</div>
      <div class="bottom-nav">
        <a class="nav-item home" href="./index.html"><div class="glyph"></div><span class="label">Home</span></a>
        <a class="nav-item radar" href="./radar.html"><div class="glyph"></div><span class="label">Radar</span></a>
        <div class="nav-item alerts active"><div class="glyph"></div><span class="label">Alerts</span></div>
        <a class="nav-item saved" href="./saved.html"><div class="glyph"></div><span class="label">Saved</span></a>
      </div>
    </div>
  `;
}

function renderLoading() {
  shell(`<div style="padding:30px 4px;text-align:center;font-size:13px;color:var(--ink-secondary)">Checking conditions…</div>`);
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    shell(`
      <div class="no-alerts-card">
        <div class="no-alerts-badge">✓</div>
        <div class="no-alerts-title">No active alerts</div>
        <div class="no-alerts-sub">Conditions in ${city.name} are within normal range.</div>
      </div>
    `);
    return;
  }
  shell(`
    <div class="alerts-list">
      ${alerts.map((a) => `
        <div class="alert-card tone-${a.tone}">
          <div class="alert-card-top">
            <div class="alert-card-badge">${a.badge}</div>
            <div class="alert-card-time">${a.time}</div>
          </div>
          <div class="alert-card-title">${a.title}</div>
          <div class="alert-card-body">${a.body}</div>
        </div>
      `).join('')}
    </div>
  `);
}

function renderError() {
  shell(`<div class="error-card">IMD feed unavailable — could not check current alerts.</div>`);
}

async function init() {
  renderLoading();
  try {
    const bundle = await fetchWeatherBundle(city.lat, city.lon);
    const metrics = buildMetrics(bundle, city.name);
    renderAlerts(generateAlerts(metrics));
  } catch (err) {
    console.error(err);
    renderError();
  }
}

init();
