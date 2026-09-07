import { geocodeCity, fetchDestinationSummary } from './weatherApi.js';
import { getSavedCities, addSavedCity, removeSavedCity } from './travel.js';
import { loadState, saveState } from './utils.js';

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
    <div class="texture-glow"></div>
    <div class="texture-grain"></div>
    <div class="content">
      <div class="header-block" style="padding-top:44px">
        <div class="wordmark-row">
          <div class="wordmark"><span class="en">Saved</span><span class="hi">सहेजे गए</span></div>
        </div>
        <div class="location-sub" style="margin-bottom:0">Cities you're tracking</div>
      </div>
      <div class="section-body">
        <div class="saved-list" id="saved-list">
          ${state.cities.length === 0 ? `<div class="location-sub" style="text-align:center;padding:20px 0">No saved cities yet.</div>` : ''}
          ${state.cities.map((c, i) => `
            <div class="saved-card" data-idx="${i}">
              <div class="saved-card-main">
                <div class="saved-card-name">${c.name}${c.name === state.currentCity ? '<span class="current-city-tag">CURRENT</span>' : ''}</div>
                <div class="saved-card-note">${c.status || 'Loading…'}</div>
              </div>
              <div class="saved-card-temp">${c.tempNow != null ? c.tempNow + '°' : '—'}</div>
              <div class="saved-remove" data-remove="${i}">✕</div>
            </div>
          `).join('')}
        </div>
        <div class="add-city-card" id="btn-add-city" style="margin-top:12px">+ Add a city</div>
      </div>
      <div class="footer-note">India Meteorological Department<br>Ministry of Earth Sciences, Government of India</div>
      <div class="bottom-nav">
        <a class="nav-item home" href="./index.html"><div class="glyph"></div><span class="label">Home</span></a>
        <a class="nav-item radar" href="./radar.html"><div class="glyph"></div><span class="label">Radar</span></a>
        <a class="nav-item alerts" href="./alerts.html"><div class="glyph"></div><span class="label">Alerts</span></a>
        <div class="nav-item saved active"><div class="glyph"></div><span class="label">Saved</span></div>
      </div>
    </div>
    ${state.searchOpen ? renderSearch() : ''}
  `;
  wire();
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
      saveState({ city: { name: c.name.split(',')[0], admin1: c.name.split(',')[1]?.trim() || '', country: '', lat: c.lat, lon: c.lon } });
      window.location.href = './index.html';
    });
  });
}

let searchDebounce = null;
function onSearchInput(e) {
  state.searchQuery = e.target.value;
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    try { state.searchResults = await geocodeCity(state.searchQuery); } catch { state.searchResults = []; }
    render();
    document.getElementById('search-input')?.focus();
  }, 300);
}

async function loadCities() {
  const saved = getSavedCities();
  state.cities = saved.map((c) => ({ ...c, tempNow: null, status: 'Loading…' }));
  render();
  await Promise.all(
    saved.map(async (c, i) => {
      try {
        const s = await fetchDestinationSummary(c.lat, c.lon);
        state.cities[i] = { ...c, tempNow: s.tempNow, status: s.condition };
      } catch {
        state.cities[i] = { ...c, tempNow: null, status: 'Unavailable' };
      }
      render();
    })
  );
}

loadCities();
