import './pwa.js';
import { fetchWeatherBundle } from './weatherApi.js';
import { buildMetrics } from './metrics.js';
import { generateAlerts } from './alertLogic.js';
import { loadState, fmtTime } from './utils.js';
import { renderBottomNav, renderStatusBar } from './icons.js';
import { t } from './i18n.js';
import { isDarkTheme } from './theme.js';
import './i18nStrings.js';

const DEFAULT_CITY = { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.5822, lon: 77.2 };
const root = document.getElementById('app-root');
const saved = loadState();
const city = saved.city || DEFAULT_CITY;

function shell(inner, alertCount = 0) {
  root.innerHTML = `
    ${renderStatusBar(isDarkTheme())}
    <div class="texture-glow"></div>
    <div class="texture-grain"></div>
    <div class="content">
      <div class="header-block">
        <div class="wordmark-row">
          <div class="wordmark"><span class="en">${t('alerts.title')}</span></div>
        </div>
        <a class="location-row" href="./index.html" style="text-decoration:none;color:inherit" title="Back to Home">
          <span class="location-dot"></span>
          <span class="location-city">${city.name}${city.admin1 ? ', ' + city.admin1 : ''}</span>
          <span class="location-caret">▾</span>
        </a>
        <div class="location-sub">${t('alerts.not_official')} · ${fmtTime(new Date())} IST</div>
      </div>
      <div class="section-body">${inner}</div>
      <div class="footer-note">${t('home.footer_dept')}<br>${t('home.footer_ministry')}</div>
      ${renderBottomNav('alerts', alertCount)}
    </div>
    <div class="home-indicator"></div>
  `;
}

function renderLoading() {
  shell(`<div style="padding:40px 4px;text-align:center;font-size:13px;color:var(--ink-secondary)">${t('alerts.checking')}</div>`);
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    shell(`
      <div class="no-alerts-card">
        <div class="no-alerts-badge">✓</div>
        <div class="no-alerts-title">${t('alerts.none_title')}</div>
        <div class="no-alerts-sub">${t('alerts.none_sub', { city: city.name })}</div>
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
  shell(`<div class="error-card">${t('alerts.feed_error')}</div>`, 0);
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
