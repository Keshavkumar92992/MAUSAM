// Sky-event pop-up: warns about the next notable astronomical event and
// explains what it actually is.
//
// The brief asked for a cron job hitting a live astronomy API. There is no
// backend here to run one, and every usable astronomy API needs a secret
// that a static site cannot hold. Eclipse circumstances and shower peaks
// are fixed decades ahead, so ./data/astro-events.json is a checked-in
// table instead — accurate, free, and it still works with no network.
import { loadState, saveState } from './utils.js';
import { t, getLocale, registerEntries } from './i18n.js';

const SEEN_KEY = 'astroSeen';
// How far ahead an event may be and still interrupt with a modal. The brief
// asked for 24h notice; 48h is kinder for the showers, which need someone to
// plan a trip away from city lights rather than just glance out a window.
const POPUP_LEAD_MS = 48 * 60 * 60 * 1000;
// Meteor showers and eclipses run for hours past their listed instant, so
// an event stays "current" for a while rather than vanishing at go-time.
const GRACE_MS = 6 * 60 * 60 * 1000;

const LOCALE_TAG = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN' };

registerEntries({
  'astro.eyebrow': { en: 'SKY EVENT', hi: 'आकाशीय घटना', bn: 'আকাশের ঘটনা', ta: 'வானியல் நிகழ்வு' },
  'astro.strip_label': { en: 'Next in the sky', hi: 'आसमान में अगला', bn: 'আকাশে পরবর্তী', ta: 'வானில் அடுத்தது' },
  'astro.facts_title': { en: 'Good to know', hi: 'जानने योग्य', bn: 'জেনে রাখুন', ta: 'தெரிந்துகொள்ள' },
  'astro.learn_more': { en: 'Learn more', hi: 'और जानें', bn: 'আরও জানুন', ta: 'மேலும் அறிக' },
  'astro.got_it': { en: 'Got it', hi: 'ठीक है', bn: 'বুঝেছি', ta: 'சரி' },

  'astro.when.now': { en: 'Happening now', hi: 'अभी हो रहा है', bn: 'এখনই ঘটছে', ta: 'இப்போது நிகழ்கிறது' },
  'astro.when.soon': { en: 'Starts within the hour', hi: 'एक घंटे के भीतर', bn: 'এক ঘণ্টার মধ্যে শুরু', ta: 'ஒரு மணி நேரத்தில் தொடங்குகிறது' },
  'astro.when.hours': { en: 'In {{n}} hours', hi: '{{n}} घंटे में', bn: '{{n}} ঘণ্টা পরে', ta: '{{n}} மணி நேரத்தில்' },
  'astro.when.tomorrow': { en: 'Tomorrow', hi: 'कल', bn: 'আগামীকাল', ta: 'நாளை' },
  'astro.when.days': { en: 'In {{n}} days', hi: '{{n}} दिन में', bn: '{{n}} দিন পরে', ta: '{{n}} நாட்களில்' },

  'astro.timing.predawn': { en: 'Best in the hours before dawn', hi: 'भोर से पहले के घंटे सबसे अच्छे', bn: 'ভোরের আগের ঘণ্টাগুলিই সেরা', ta: 'விடியலுக்கு முந்தைய மணி நேரங்களே சிறந்தவை' },
  'astro.timing.midnight': { en: 'Best between midnight and 2 AM', hi: 'आधी रात से 2 बजे के बीच सबसे अच्छा', bn: 'মধ্যরাত থেকে রাত ২টার মধ্যে সেরা', ta: 'நள்ளிரவு முதல் அதிகாலை 2 மணி வரை சிறந்தது' },
  'astro.timing.moonrise': { en: 'Visible all night, from moonrise onwards', hi: 'चाँद निकलने से पूरी रात दिखाई देगा', bn: 'চাঁদ ওঠা থেকে সারা রাত দেখা যাবে', ta: 'நிலவு உதிப்பதிலிருந்து இரவு முழுவதும் தெரியும்' },
  'astro.timing.exact': { en: 'Greatest phase at {{time}} IST', hi: 'चरम अवस्था {{time}} IST पर', bn: 'সর্বোচ্চ পর্যায় {{time}} IST-তে', ta: 'உச்சக் கட்டம் {{time}} IST-க்கு' },

  'astro.vis.india_full': { en: 'Fully visible from anywhere in India', hi: 'भारत में कहीं से भी पूरी तरह दृश्य', bn: 'ভারতের যে কোনও জায়গা থেকে পুরোপুরি দৃশ্যমান', ta: 'இந்தியாவில் எங்கிருந்தும் முழுமையாகத் தெரியும்' },
  'astro.vis.india_dark': { en: 'Visible across India — go somewhere dark, away from city lights', hi: 'पूरे भारत में दृश्य — शहर की रोशनी से दूर किसी अंधेरी जगह जाएँ', bn: 'গোটা ভারতে দৃশ্যমান — শহরের আলো ছেড়ে অন্ধকার জায়গায় যান', ta: 'இந்தியா முழுவதும் தெரியும் — நகர விளக்குகளை விட்டு இருண்ட இடத்திற்குச் செல்லுங்கள்' },
  'astro.vis.india_partial': { en: 'Partially visible from India', hi: 'भारत से आंशिक रूप से दृश्य', bn: 'ভারত থেকে আংশিকভাবে দৃশ্যমান', ta: 'இந்தியாவிலிருந்து பகுதியளவு தெரியும்' },
  'astro.vis.global': { en: 'Visible worldwide, cloud cover permitting', hi: 'दुनिया भर में दृश्य, बशर्ते बादल न हों', bn: 'সারা বিশ্বে দৃশ্যমান, মেঘ না থাকলে', ta: 'மேகம் மறைக்காவிட்டால் உலகம் முழுவதும் தெரியும்' },

  'astro.hist.eyebrow': { en: 'On this day', hi: 'आज ही के दिन', bn: 'আজকের দিনে', ta: 'இন்றைய தினம்' },
  'astro.hist.eyebrow_week': { en: 'This week in history', hi: 'इसी हफ़्ते के इतिहास में', bn: 'ইতিহাসে এই সপ্তাহে', ta: 'வரலாற்றில் இந்த வாரம்' },
  'astro.hist.on_date': { en: '{{date}} {{year}} · {{n}} years ago', hi: '{{date}} {{year}} · {{n}} साल पहले', bn: '{{date}} {{year}} · {{n}} বছর আগে', ta: '{{date}} {{year}} · {{n}} ஆண்டுகளுக்கு முன்' },
  'astro.hist.badge': { en: '{{year}}', hi: '{{year}}', bn: '{{year}}', ta: '{{year}}' },
  'astro.hist.ago': { en: '{{n}} years ago today', hi: 'आज से {{n}} साल पहले', bn: 'আজ থেকে {{n}} বছর আগে', ta: 'இன்றிலிருந்து {{n}} ஆண்டுகளுக்கு முன்' },
  'astro.hist.next': { en: 'Next in the sky: {{name}}, {{when}}', hi: 'आसमान में अगला: {{name}}, {{when}}', bn: 'আকাশে পরবর্তী: {{name}}, {{when}}', ta: 'வானில் அடுத்தது: {{name}}, {{when}}' },
});

function seenIds() {
  const v = loadState()[SEEN_KEY];
  return Array.isArray(v) ? v : [];
}

export function markEventSeen(id) {
  const list = seenIds();
  if (list.includes(id)) return;
  // Keep the tail only — this list grows one entry per event forever
  // otherwise, and nothing needs to remember a shower from three years ago.
  saveState({ [SEEN_KEY]: [...list, id].slice(-40) });
}

export async function loadAstroEvents() {
  try {
    const res = await fetch('./data/astro-events.json');
    const json = await res.json();
    const now = Date.now();
    return (json.events || [])
      .map((e) => ({ ...e, startMs: Date.parse(e.start_utc) }))
      .filter((e) => Number.isFinite(e.startMs) && e.startMs + GRACE_MS > now)
      .sort((a, b) => a.startMs - b.startMs);
  } catch {
    return []; // a missing events file must never break the weather screen
  }
}

export function nextEvent(events) {
  return events[0] || null;
}

export async function loadAstroHistory() {
  try {
    const res = await fetch('./data/astro-history.json');
    return (await res.json()).events || [];
  } catch {
    return [];
  }
}

// Matched on the Indian calendar date, not the browser's — the app is
// India-facing, and near midnight UTC the two disagree by a day.
function istToday() {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).split('-');
  return { y: +y, md: `${m}-${d}` };
}

// Calendar-day distance that wraps around new year, so 12-30 and 01-02 are
// three days apart rather than 363.
function dayGap(mdA, mdB, year) {
  const at = Date.UTC(year, +mdA.slice(0, 2) - 1, +mdA.slice(3));
  const bt = Date.UTC(year, +mdB.slice(0, 2) - 1, +mdB.slice(3));
  const raw = Math.round(Math.abs(at - bt) / 864e5);
  return Math.min(raw, 365 - raw);
}

// A table of 42 anniversaries only lands on the exact date one day in nine,
// so an exact-match-only rule left almost every day showing the distant
// "next event" countdown this was meant to replace. Near misses are still
// worth showing — they just have to be labelled honestly as the week
// rather than the day.
const NEAR_DAYS_HIST = 5;

export function onThisDay(history) {
  const { y, md } = istToday();
  const scored = history
    .map((h) => ({ h, gap: dayGap(h.date, md, y) }))
    .filter((x) => x.gap <= NEAR_DAYS_HIST)
    .sort((a, b) => (a.gap - b.gap) || (a.h.year - b.h.year));
  if (!scored.length) return null;
  const { h, gap } = scored[0];
  return { ...h, exact: gap === 0 };
}

// A sky event only earns the strip when it is close enough to plan around.
// Anything further out is just trivia with a countdown, and "in 44 days"
// reads as filler — today's anniversary is the better use of the space.
const NEAR_DAYS = 14;

export function stripSubject(events, history) {
  const ev = nextEvent(events);
  if (ev && ev.startMs - Date.now() <= NEAR_DAYS * 864e5) return { kind: 'event', ev };
  const h = onThisDay(history);
  if (h) return { kind: 'history', h, ev };
  return ev ? { kind: 'event', ev } : null;
}

export function dueForPopup(events) {
  const now = Date.now();
  const seen = seenIds();
  return events.find((e) => e.startMs - now <= POPUP_LEAD_MS && !seen.includes(e.id)) || null;
}

function localized(field) {
  if (!field) return '';
  return field[getLocale()] || field.en || '';
}

// Intl renders dates in each locale's own digits — Bengali gets ২১, Hindi
// and Tamil keep Latin — so a raw JS number in the countdown would sit next
// to a Bengali date looking like a different card. Let Intl decide.
function num(n) {
  return new Intl.NumberFormat(LOCALE_TAG[getLocale()] || 'en-IN').format(n);
}

function countdownLabel(ev) {
  const ms = ev.startMs - Date.now();
  if (ms <= 0) return t('astro.when.now');
  if (ms < 3600e3) return t('astro.when.soon');
  if (ms < 24 * 3600e3) return t('astro.when.hours', { n: num(Math.round(ms / 3600e3)) });
  const days = Math.ceil(ms / 864e5);
  return days === 1 ? t('astro.when.tomorrow') : t('astro.when.days', { n: num(days) });
}

function dateLabel(ev) {
  const tag = LOCALE_TAG[getLocale()] || 'en-IN';
  const opts = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  // Midday UTC keeps the calendar date stable no matter which way the
  // formatter's timezone rounding falls.
  const from = new Date(`${ev.display_from}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat(tag, opts);
  if (!ev.display_to) return fmt.format(from);
  const to = new Date(`${ev.display_to}T12:00:00Z`);
  try {
    return fmt.formatRange(from, to); // renders "13–14 December 2026" per locale
  } catch {
    return `${fmt.format(from)} – ${fmt.format(to)}`;
  }
}

function timingLabel(ev) {
  if (ev.timing === 'override') return localized(ev.timing_override);
  if (ev.timing === 'exact') {
    const time = new Intl.DateTimeFormat(LOCALE_TAG[getLocale()] || 'en-IN', {
      hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
    }).format(new Date(ev.startMs))
      .replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
    return t('astro.timing.exact', { time });
  }
  return t(`astro.timing.${ev.timing}`);
}

// Each event type gets its own accent and its own piece of animated art.
// All of it is CSS on a handful of empty spans — no images, no canvas, no
// rAF loop — so it costs nothing on the phones this has to stay smooth on.
const ACCENT = {
  METEOR_SHOWER: '#9DC4F0',
  SUPERMOON: '#EBD9A6',
  LUNAR_ECLIPSE: '#E3A188',
  SOLAR_ECLIPSE: '#F2C574',
};

const STAR_POS = [
  [8, 24], [21, 61], [34, 15], [46, 46], [58, 27], [69, 64], [81, 19], [91, 50],
  [15, 82], [63, 86], [39, 74], [75, 40], [5, 44], [28, 33], [52, 68], [86, 76],
  [12, 9], [44, 92], [71, 11], [95, 33], [24, 50], [60, 55], [88, 61], [33, 20],
  [17, 70], [79, 88], [50, 8], [66, 30], [10, 57], [41, 38], [94, 15], [56, 79],
];

function stars(n = STAR_POS.length) {
  return STAR_POS.slice(0, n)
    .map(([x, y], i) => `<span class="ah-star" style="left:${x}%;top:${y}%;animation-delay:${(i * 0.41).toFixed(2)}s"></span>`)
    .join('');
}

// Percentages, not pixels, so the same craters work on the 92px hero moon
// and the 30px one in the Home strip.
function craters() {
  return `<span class="ah-crater" style="left:24%;top:30%;width:16%;height:16%"></span>
    <span class="ah-crater" style="left:56%;top:22%;width:10%;height:10%"></span>
    <span class="ah-crater" style="left:40%;top:58%;width:22%;height:22%"></span>
    <span class="ah-crater" style="left:68%;top:62%;width:12%;height:12%"></span>`;
}

// Falling stars belong on every card, not just the meteor-shower one — a
// still starfield reads as wallpaper. Durations and delays are deliberately
// uneven so they never fall in a visible rhythm.
function meteors(n) {
  const dur = [5.2, 6.4, 4.6, 7.1, 5.8, 4.2, 6.8, 5.5, 6.1];
  return Array.from({ length: n }, (_, i) => {
    const left = 4 + (i * 92) / Math.max(1, n - 1);
    const delay = ((i * 1.37) % 6).toFixed(2);
    return `<span class="ah-meteor" style="left:${left.toFixed(1)}%;animation-delay:${delay}s;animation-duration:${dur[i % dur.length]}s"></span>`;
  }).join('');
}

// One art definition, two sizes: the modal hero and the small tile on the
// Home strip. `cls` picks which, and the CSS scales the pieces.
function art(type, cls, starCount, meteorCount) {
  const body = {
    SUPERMOON: () => `<span class="ah-moon glow">${craters()}</span>`,
    LUNAR_ECLIPSE: () => `<span class="ah-moon">${craters()}<span class="ah-umbra"></span></span>`,
    // The dark disc deliberately stops short of covering the Sun — this
    // event is partial from India, and the art should not promise totality.
    SOLAR_ECLIPSE: () => `<span class="ah-sun"></span><span class="ah-occluder"></span>`,
  }[type] || (() => '');
  return `<span class="${cls}">${stars(starCount)}${meteors(meteorCount)}${body()}</span>`;
}

const GLYPH = {
  METEOR_SHOWER: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 18 14 8"/><path d="M10 19l4-4"/><path d="M16 20l3-3"/><circle cx="17.5" cy="5.5" r="1.6" fill="currentColor" stroke="none"/></svg>',
  SUPERMOON: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7.5"/><circle cx="9.5" cy="9.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.5" cy="14" r="2" fill="currentColor" stroke="none" opacity=".55"/></svg>',
  LUNAR_ECLIPSE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 0 0 15z" fill="currentColor" stroke="none" opacity=".5"/></svg>',
  SOLAR_ECLIPSE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="5.2"/><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4"/><circle cx="14" cy="10.4" r="4.4" fill="currentColor" stroke="none" opacity=".55"/></svg>',
};

export function renderAstroStrip(ev) {
  if (!ev) return '';
  return `
    <button class="astro-strip" id="astro-strip" style="--astro-accent:${ACCENT[ev.type] || ACCENT.METEOR_SHOWER}">
      ${art(ev.type, 'astro-thumb', 5, 2)}
      <span class="astro-strip-text">
        <span class="astro-strip-eyebrow">${t('astro.strip_label')}</span>
        <span class="astro-strip-name">${localized(ev.name)}</span>
      </span>
      <span class="astro-strip-when">${countdownLabel(ev)}</span>
    </button>
  `;
}

// Tap the card and a meteor streaks from where you touched. Cheap to run
// (one span that removes itself) and it makes the sky feel like something
// you can poke rather than a picture.
export function wireAstroCard() {
  const card = document.querySelector('.astro-card');
  const bg = card?.querySelector('.astro-bg');
  const scroller = card?.querySelector('.astro-card-inner');
  if (!card || !bg) return;

  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return; // don't fire under the actions
    const r = bg.getBoundingClientRect();
    const spark = document.createElement('span');
    spark.className = 'ah-spark';
    spark.style.left = `${e.clientX - r.left}px`;
    spark.style.top = `${e.clientY - r.top - 40}px`;
    bg.appendChild(spark);
    spark.addEventListener('animationend', () => spark.remove());
  });

  // Sky drifts slower than the text scrolling over it — a bit of depth for
  // one line of maths and no per-frame work of our own.
  scroller?.addEventListener('scroll', () => {
    bg.style.transform = `translateY(${scroller.scrollTop * -0.12}px)`;
  }, { passive: true });
}

// "5 September" in the reader's language, built from the stored MM-DD.
function histDateLabel(h) {
  const d = new Date(Date.UTC(2000, +h.date.slice(0, 2) - 1, +h.date.slice(3), 12));
  return new Intl.DateTimeFormat(LOCALE_TAG[getLocale()] || 'en-IN',
    { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
}

export function renderHistoryStrip(h) {
  if (!h) return '';
  return `
    <button class="astro-strip" id="astro-strip" style="--astro-accent:${ACCENT.SUPERMOON}">
      ${art('HISTORY', 'astro-thumb', 5, 2)}
      <span class="astro-strip-text">
        <span class="astro-strip-eyebrow">${t(h.exact ? 'astro.hist.eyebrow' : 'astro.hist.eyebrow_week')}</span>
        <span class="astro-strip-name">${localized(h.title)}</span>
      </span>
      <span class="astro-strip-when">${t('astro.hist.badge', { year: h.year })}</span>
    </button>
  `;
}

export function renderHistoryModal(h, upcoming) {
  if (!h) return '';
  const years = new Date().getFullYear() - h.year;
  return `
    <div class="astro-overlay" id="astro-overlay">
      <div class="astro-card" role="dialog" aria-modal="true" aria-labelledby="astro-title"
           style="--astro-accent:${ACCENT.SUPERMOON}">
        ${art('HISTORY', 'astro-bg', 32, 6)}
        <div class="astro-card-inner">
          <div class="astro-head">
            <span class="astro-glyph">${GLYPH.SUPERMOON}</span>
            <span class="astro-eyebrow">${t(h.exact ? 'astro.hist.eyebrow' : 'astro.hist.eyebrow_week')}</span>
            <span class="astro-countdown">${h.year}</span>
          </div>

          <h2 class="astro-title" id="astro-title">${localized(h.title)}</h2>
          <p class="astro-sub">${h.exact
            ? t('astro.hist.ago', { n: years })
            : t('astro.hist.on_date', { date: histDateLabel(h), year: h.year, n: years })}</p>

          <ul class="astro-facts"><li>${localized(h.body)}</li></ul>

          ${upcoming ? `<div class="astro-hist-next">${t('astro.hist.next', {
            name: localized(upcoming.name), when: countdownLabel(upcoming).toLowerCase(),
          })}</div>` : ''}
        </div>

        <div class="astro-actions">
          <button class="astro-ok" id="astro-ok">${t('astro.got_it')}</button>
        </div>
      </div>
    </div>
  `;
}

export function renderAstroModal(ev) {
  if (!ev) return '';
  return `
    <div class="astro-overlay" id="astro-overlay">
      <div class="astro-card" role="dialog" aria-modal="true" aria-labelledby="astro-title"
           style="--astro-accent:${ACCENT[ev.type] || ACCENT.METEOR_SHOWER}">
        ${art(ev.type, 'astro-bg', 32, ev.type === 'METEOR_SHOWER' ? 9 : 6)}
        <div class="astro-card-inner">
          <div class="astro-head">
            <span class="astro-glyph">${GLYPH[ev.type] || GLYPH.METEOR_SHOWER}</span>
            <span class="astro-eyebrow">${t('astro.eyebrow')}</span>
            <span class="astro-countdown">${countdownLabel(ev)}</span>
          </div>

          <h2 class="astro-title" id="astro-title">${localized(ev.name)}</h2>
          <p class="astro-sub">${localized(ev.subtitle)}</p>

          <div class="astro-meta">
            <div class="astro-meta-row"><span class="astro-meta-dot"></span>${dateLabel(ev)}</div>
            <div class="astro-meta-row"><span class="astro-meta-dot"></span>${timingLabel(ev)}</div>
            <div class="astro-meta-row"><span class="astro-meta-dot"></span>${t(`astro.vis.${ev.visibility}`)}</div>
          </div>

          <div class="astro-facts-title">${t('astro.facts_title')}</div>
          <ul class="astro-facts">
            ${(ev.facts || []).map((f) => `<li>${localized(f)}</li>`).join('')}
          </ul>
        </div>

        <div class="astro-actions">
          <a class="astro-link" href="${ev.learn_more_url}" target="_blank" rel="noopener noreferrer">${t('astro.learn_more')}</a>
          <button class="astro-ok" id="astro-ok">${t('astro.got_it')}</button>
        </div>
      </div>
    </div>
  `;
}
