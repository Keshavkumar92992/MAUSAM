import { fetchWeatherBundle } from './weatherApi.js';
import { buildMetrics } from './metrics.js';
import { generateAlerts } from './alertLogic.js';
import { loadState, fmtTime } from './utils.js';
import { renderBottomNav, renderStatusBar } from './icons.js';

const DEFAULT_CITY = { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.5822, lon: 77.2 };
const root = document.getElementById('app-root');
const saved = loadState();
const city = saved.city || DEFAULT_CITY;

function shell(inner, alertCount = 0) {
  root.innerHTML = `
    ${renderStatusBar(false)}
    <div class="texture-glow"></div>
    <div class="texture-grain"></div>
    <div class="content">
      <div class="header-block">
        <div class="wordmark-row">
          <div class="wordmark"><span class="en">Alerts</span><span class="hi">चेतावनी</span></div>
        </div>
        <a class="location-row" href="./index.html" style="text-decoration:none;color:inherit" title="Back to Home">
          <span class="location-dot"></span>
          <span class="location-city">${city.name}${city.admin1 ? ', ' + city.admin1 : ''}</span>
          <span class="location-caret">▾</span>
        </a>
        <div class="location-sub">IMD Doppler & Agromet Advisories · updated ${fmtTime(new Date())} IST</div>
      </div>
      <div class="section-body">${inner}</div>
      <div class="footer-note">India Meteorological Department<br>Ministry of Earth Sciences, Government of India</div>
      ${renderBottomNav('alerts', alertCount, false)}
    </div>
    <div class="home-indicator"></div>
  `;
}

function renderLoading() {
  shell(`<div style="padding:40px 4px;text-align:center;font-size:13px;color:var(--ink-secondary)">Checking meteorological advisories…</div>`);
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    shell(`
      <div class="no-alerts-card">
        <div class="no-alerts-badge">✓</div>
        <div class="no-alerts-title">No active meteorological alerts</div>
        <div class="no-alerts-sub">Atmospheric and air quality parameters in ${city.name} are within normal thresholds.</div>
      </div>
    `, 0);
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
  `, alerts.length);
}

function renderError() {
  shell(`<div class="error-card">IMD feed unavailable — could not check current alerts.<br>Please check your connection and retry.</div>`, 0);
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
