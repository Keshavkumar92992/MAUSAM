// Modern, crisp SVG vector icons for Mausam weather app
import { t } from './i18n.js';

export const ICONS = {
  home: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5H10v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
    </svg>`,

  radar: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7a5 5 0 0 1 5 5"/>
      <line x1="12" y1="12" x2="16.5" y2="7.5"/>
      <circle cx="12" cy="12" r="1.5" fill="${fill}"/>
    </svg>`,

  alerts: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,

  saved: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>`,

  search: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>`,

  menu: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>`,

  location: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3" fill="${fill}"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
    </svg>`,

  check: (cls = '', fill = 'currentColor') => `
    <svg class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`,
};

export function renderBottomNav(activeTab, alertCount = 0) {
  const tabs = [
    { id: 'home', label: t('nav.home'), href: './index.html', icon: ICONS.home },
    { id: 'radar', label: t('nav.radar'), href: './radar.html', icon: ICONS.radar },
    { id: 'alerts', label: t('nav.alerts'), href: './alerts.html', icon: ICONS.alerts, badge: alertCount },
    { id: 'saved', label: t('nav.saved'), href: './saved.html', icon: ICONS.saved },
  ];

  return `
    <nav class="bottom-nav">
      ${tabs.map((t) => {
        const isActive = t.id === activeTab;
        const content = `
          <div class="nav-icon-wrap">
            ${t.icon('nav-svg', 'currentColor')}
            ${t.badge > 0 ? `<span class="nav-badge-dot"></span>` : ''}
          </div>
          <span class="label">${t.label}</span>
        `;
        return isActive
          ? `<div class="nav-item ${t.id} active">${content}</div>`
          : `<a class="nav-item ${t.id}" href="${t.href}">${content}</a>`;
      }).join('')}
    </nav>
  `;
}

// Delegated once per page: home.js re-renders the nav on every persona tap
// and background refresh, so a listener bound to the elements themselves
// would be thrown away and rebound constantly.
document.addEventListener('pointerdown', (e) => {
  const item = e.target.closest?.('a.nav-item');
  if (item) item.classList.add('nav-pressed');
}, { passive: true });



export function renderStatusBar(isDark = false) {
  const now = new Date();
  const hours = now.getHours();
  const mins = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours % 12 || 12}:${mins}`;

  return `
    <div class="phone-status-bar ${isDark ? 'dark' : ''}">
      <span class="status-time">${timeStr}</span>
      <div class="dynamic-island"></div>
      <div class="status-badges">
        <span class="status-imd-pill">IMD · LIVE</span>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" opacity="0.85">
          <path d="M1 9.5h2v1H1v-1zm3.5-3h2v4h-2v-4zm3.5-3h2v7h-2v-7zm3.5-3.5h2v10.5h-2V0z"/>
        </svg>
      </div>
    </div>
  `;
}
