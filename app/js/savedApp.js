import { geocodeCity, fetchDestinationSummary, getCurrentLocation } from './weatherApi.js';
import { getSavedCities, addSavedCity, removeSavedCity } from './travel.js';
import { loadState, saveState } from './utils.js';
import { renderBottomNav, renderStatusBar, ICONS } from './icons.js';
import { t } from './i18n.js';
import './i18nStrings.js';

const POPULAR_SUGGESTIONS = [
  { name: 'Mumbai, Maharashtra', lat: 19.0760, lon: 72.8777 },
  { name: 'Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946 },
  { name: 'Goa, Goa', lat: 15.4909, lon: 73.8278 },
  { name: 'Shimla, Himachal Pradesh', lat: 31.1048, lon: 77.1734 },
  { name: 'Leh, Ladakh', lat: 34.1526, lon: 77.5771 },
];

const DEFAULT_CITY = { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.5822, lon: 77.2 };
const root = document.getElementById('app-root');

const state = {
  cities: [],
  currentCity: (loadState().city || DEFAULT_CITY).name,
  searchOpen: false,
  searchQuery: '',
  searchResults: [],
};

function render() {
  root.innerHTML = `
    ${renderStatusBar(false)}
    <div class="texture-glow"></div>
    <div class="texture-grain"></div>
    <div class="content">
      <div class="header-block">
        <div class="wordmark-row">
          <div class="wordmark"><span class="en">${t('saved.title')}</span></div>
        </div>
        <div class="location-sub" style="margin-bottom:0">${t('saved.subtitle')}</div>
      </div>
      <div class="section-body">
        <div class="saved-list" id="saved-list">
          ${state.cities.length === 0 ? `<div class="location-sub" style="text-align:center;padding:24px 0">${t('saved.empty')}</div>` : ''}
          ${state.cities.map((c, i) => `
            <div class="saved-card" data-idx="${i}" title="${t('saved.tap_hint')}">
              <div class="saved-card-main">
                <div class="saved-card-name">${c.name}${c.name.includes(state.currentCity) ? `<span class="current-city-tag">${t('saved.active_tag')}</span>` : ''}</div>
                <div class="saved-card-note">${c.status || t('saved.loading')}</div>
              </div>
              <div class="saved-card-temp">${c.tempNow != null ? c.tempNow + '°' : '—'}</div>
              <button class="saved-remove" data-remove="${i}" title="Remove city" aria-label="Remove city">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="add-city-card" id="btn-add-city" style="margin-top:12px">${t('saved.add_city')}</div>
      </div>
      <div class="footer-note">${t('home.footer_dept')}<br>${t('home.footer_ministry')}</div>
      ${renderBottomNav('saved', 0, false)}
    </div>
    <div class="home-indicator"></div>
    ${state.searchOpen ? renderSearch() : ''}
  `;
  wire();
}

function renderSearch() {
  return `
    <div class="search-overlay" id="search-overlay">
      <div class="search-panel">
        <div class="search-input-row">
          <input id="search-input" class="search-input" placeholder="${t('home.search_placeholder')}" value="${state.searchQuery}" autocomplete="off">
          <button class="search-close" id="search-close">${t('home.cancel')}</button>
        </div>

        <button class="geo-btn" id="btn-geo" ${window.isSecureContext ? '' : 'disabled title="Needs a secure (https) connection — works once this app is deployed"'}>
          ${ICONS.location('', 'currentColor')} ${window.isSecureContext ? t('home.add_current_location') : t('home.needs_https')}
        </button>

        <div class="search-quick-title">${t('saved.suggested')}</div>
        <div class="search-chips">
          ${POPULAR_SUGGESTIONS.map((c, i) => `
            <div class="search-chip" data-sugg="${i}">${c.name.split(',')[0]}</div>
          `).join('')}
        </div>

        <div class="search-results">
          ${state.searchQuery.length >= 2 && state.searchResults.length === 0 ? `<div class="search-empty">${t('saved.no_matches')}</div>` : ''}
          ${state.searchResults.map((r, i) => `
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

function wire() {
  document.getElementById('btn-add-city')?.addEventListener('click', () => {
    state.searchOpen = true; state.searchQuery = ''; state.searchResults = [];
    render();
    document.getElementById('search-input')?.focus();
  });
  document.getElementById('search-close')?.addEventListener('click', () => { state.searchOpen = false; render(); });
  document.getElementById('search-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'search-overlay') { state.searchOpen = false; render(); }
  });
  document.getElementById('search-input')?.addEventListener('input', onSearchInput);
  document.getElementById('btn-geo')?.addEventListener('click', useCurrentLocationAsSaved);
  document.querySelectorAll('.search-chip[data-sugg]').forEach((el) => {
    el.addEventListener('click', async () => {
      const s = POPULAR_SUGGESTIONS[+el.dataset.sugg];
      addSavedCity(s);
      state.searchOpen = false;
      render();
      await loadCities();
    });
  });
  document.querySelectorAll('.search-result').forEach((el) => {
    el.addEventListener('click', async () => {
      const r = state.searchResults[+el.dataset.idx];
      addSavedCity({ name: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}`, lat: r.lat, lon: r.lon });
      state.searchOpen = false;
      render();
      await loadCities();
    });
  });
  document.querySelectorAll('.saved-remove').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = +el.dataset.remove;
      removeSavedCity(state.cities[idx].name);
      state.cities.splice(idx, 1);
      render();
    });
  });
  document.querySelectorAll('.saved-card').forEach((el) => {
    el.addEventListener('click', () => {
      const c = state.cities[+el.dataset.idx];
      if (!c || c.lat == null) return;
      saveState({ city: { name: c.name.split(',')[0], admin1: c.name.split(',')[1]?.trim() || '', country: 'India', lat: c.lat, lon: c.lon } });
      window.location.href = './index.html';
    });
  });
}

async function useCurrentLocationAsSaved() {
  const geoBtn = document.getElementById('btn-geo');
  if (!window.isSecureContext) return;
  if (geoBtn) geoBtn.textContent = t('home.locating');
  try {
    const place = await getCurrentLocation();
    addSavedCity({ name: `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}`, lat: place.lat, lon: place.lon });
    state.searchOpen = false;
    render();
    await loadCities();
  } catch (err) {
    if (geoBtn) geoBtn.textContent = err.message || t('home.needs_https');
    setTimeout(() => { if (geoBtn) geoBtn.textContent = t('home.add_current_location'); }, 3000);
  }
}

let searchDebounce = null;
function onSearchInput(e) {
  state.searchQuery = e.target.value;
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    try { state.searchResults = await geocodeCity(state.searchQuery); } catch { state.searchResults = []; }
    const caret = e.target.selectionStart;
    render();
    const nextInput = document.getElementById('search-input');
    if (nextInput) {
      nextInput.focus();
      if (caret != null) nextInput.setSelectionRange(caret, caret);
    }
  }, 250);
}

async function loadCities() {
  const saved = getSavedCities();
  state.cities = saved.map((c) => ({ ...c, tempNow: null, status: t('saved.loading') }));
  render();
  await Promise.all(
    saved.map(async (c, i) => {
      try {
        const s = await fetchDestinationSummary(c.lat, c.lon);
        state.cities[i] = { ...c, tempNow: s.tempNow, status: t(s.conditionKey) };
      } catch {
        state.cities[i] = { ...c, tempNow: null, status: t('saved.unavailable') };
      }
      render();
    })
  );
}

loadCities();
