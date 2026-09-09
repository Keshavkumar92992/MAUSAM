// Moon phase for the astronomy card.
//
// Two levels of precision, for two different jobs.
//
// The phase you are looking at right now only needs to be right to within
// an hour or so — nobody can tell a 94%-lit moon from a 95% one — so it
// comes from the mean synodic month, 29.530588853 days.
//
// The *dates* of the next full and new moon are a different matter: they
// are printed on the card, and the mean cycle drifts up to about 14 hours
// either side of the truth, which is enough to name the wrong day. Those
// use the truncated Meeus series in newOrFull() instead, which lands within
// a couple of minutes. The current phase is then measured from the accurate
// preceding new moon rather than the mean one, so the illustration and the
// dates can never disagree with each other.
//
// Everything here is pure UTC arithmetic — no network, no ephemeris file.
import { t, getLocale, registerEntries } from './i18n.js';

export const SYNODIC = 29.530588853;

const DAY_MS = 86400000;
const RAD = Math.PI / 180;
// Julian Day for 1970-01-01T00:00Z, to move between JD and JS timestamps.
const JD_UNIX = 2440587.5;

registerEntries({
  'moon.eyebrow': { en: 'MOON PHASE', hi: 'चंद्र कला', bn: 'চাঁদের দশা', ta: 'நிலவின் நிலை' },
  'moon.illum': { en: '{{n}}% lit', hi: '{{n}}% प्रकाशित', bn: '{{n}}% আলোকিত', ta: '{{n}}% ஒளிர்வு' },
  'moon.age': { en: 'Day {{n}} of the lunar month', hi: 'चंद्र मास का {{n}}वाँ दिन', bn: 'চান্দ্র মাসের {{n}} দিন', ta: 'சந்திர மாதத்தின் {{n}}ஆம் நாள்' },
  'moon.next_full': { en: 'Next full moon', hi: 'अगली पूर्णिमा', bn: 'পরবর্তী পূর্ণিমা', ta: 'அடுத்த பௌர்ணமி' },
  'moon.next_new': { en: 'Next new moon', hi: 'अगली अमावस्या', bn: 'পরবর্তী অমাবস্যা', ta: 'அடுத்த அமாவாசை' },
  'moon.tonight': { en: 'tonight', hi: 'आज रात', bn: 'আজ রাতে', ta: 'இன்றிரவு' },
  'moon.tomorrow': { en: 'tomorrow', hi: 'कल', bn: 'আগামীকাল', ta: 'நாளை' },
  'moon.in_days': { en: 'in {{n}} days', hi: '{{n}} दिन में', bn: '{{n}} দিনে', ta: '{{n}} நாட்களில்' },

  'moon.phase.new': { en: 'New Moon', hi: 'अमावस्या', bn: 'অমাবস্যা', ta: 'அமாவாசை' },
  'moon.phase.waxing_crescent': { en: 'Waxing Crescent', hi: 'बढ़ता चंद्रकोर', bn: 'বাড়ন্ত কাস্তে চাঁদ', ta: 'வளர் பிறை' },
  'moon.phase.first_quarter': { en: 'First Quarter', hi: 'प्रथम चतुर्थांश', bn: 'প্রথম চতুর্থাংশ', ta: 'முதல் கால் நிலவு' },
  'moon.phase.waxing_gibbous': { en: 'Waxing Gibbous', hi: 'बढ़ता उभरा चाँद', bn: 'বাড়ন্ত স্ফীত চাঁদ', ta: 'வளர் முக்கால் நிலவு' },
  'moon.phase.full': { en: 'Full Moon', hi: 'पूर्णिमा', bn: 'পূর্ণিমা', ta: 'பௌர்ணமி' },
  'moon.phase.waning_gibbous': { en: 'Waning Gibbous', hi: 'घटता उभरा चाँद', bn: 'ক্ষয়িষ্ণু স্ফীত চাঁদ', ta: 'தேய் முக்கால் நிலவு' },
  'moon.phase.last_quarter': { en: 'Last Quarter', hi: 'अंतिम चतुर्थांश', bn: 'শেষ চতুর্থাংশ', ta: 'கடைசி கால் நிலவு' },
  'moon.phase.waning_crescent': { en: 'Waning Crescent', hi: 'घटता चंद्रकोर', bn: 'ক্ষয়িষ্ণু কাস্তে চাঁদ', ta: 'தேய் பிறை' },
});

// ---------- the accurate part ----------

// Meeus, Astronomical Algorithms, ch. 49, truncated to the terms worth more
// than a few seconds. k counts lunations from the new moon of 2000 Jan 6;
// a whole k is a new moon, k + 0.5 is the full moon that follows it.
// Returns a JS timestamp (UTC).
function newOrFull(k) {
  const full = Math.abs(k % 1) > 0.25;
  const T = k / 1236.85;
  const T2 = T * T;

  // Mean phase, then the periodic corrections to it.
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2;

  const E = 1 - 0.002516 * T;                                   // eccentricity of Earth's orbit
  const M = (2.5534 + 29.10535670 * k - 0.0000014 * T2) * RAD;   // sun's mean anomaly
  const M1 = (201.5643 + 385.81693528 * k + 0.0107582 * T2) * RAD; // moon's mean anomaly
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T2) * RAD;  // argument of latitude

  const sin = Math.sin;
  if (full) {
    jde += -0.40614 * sin(M1) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * M1)
      + 0.01043 * sin(2 * F) + 0.00734 * E * sin(M1 - M) - 0.00515 * E * sin(M1 + M)
      + 0.00209 * E * E * sin(2 * M) - 0.00111 * sin(M1 - 2 * F) - 0.00057 * sin(M1 + 2 * F);
  } else {
    jde += -0.40720 * sin(M1) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * M1)
      + 0.01039 * sin(2 * F) + 0.00739 * E * sin(M1 - M) - 0.00514 * E * sin(M1 + M)
      + 0.00208 * E * E * sin(2 * M) - 0.00111 * sin(M1 - 2 * F) - 0.00057 * sin(M1 + 2 * F);
  }
  return (jde - JD_UNIX) * DAY_MS;
}

// Roughly which lunation a moment falls in, used only to seed the search.
function lunationAt(ms) {
  return (ms / DAY_MS + JD_UNIX - 2451550.09766) / 29.530588861;
}

// The next time the moon is exactly new (offset 0) or full (offset 0.5).
// Steps k until the answer is genuinely in the future: the corrections can
// move a phase by up to half a day, which near a boundary is the difference
// between "tonight" and "a month from tonight".
function nextPhaseAt(offset, from = Date.now()) {
  let k = Math.floor(lunationAt(from) - offset) + offset;
  for (let i = 0; i < 4; i++) {
    const at = newOrFull(k);
    if (at > from) return at;
    k += 1;
  }
  return newOrFull(k);
}

// The most recent new moon at or before `from` — the anchor the current
// phase is measured from.
function lastNewMoonAt(from = Date.now()) {
  let k = Math.ceil(lunationAt(from));
  for (let i = 0; i < 4; i++) {
    const at = newOrFull(k);
    if (at <= from) return at;
    k -= 1;
  }
  return newOrFull(k);
}

// ---------- what the card asks for ----------

// New, the quarters and full are instants, not stretches — so they get a
// day either side of the exact moment and the four in-between names cover
// everything else. Slicing the cycle into eight equal buckets instead, the
// obvious way, calls a 68%-lit moon "First Quarter", which is plainly wrong
// to anyone who looks up.
const INSTANT = 1 / SYNODIC; // a day, as a fraction of the cycle

function phaseName(frac) {
  if (frac < INSTANT || frac > 1 - INSTANT) return 'new';
  if (Math.abs(frac - 0.25) < INSTANT) return 'first_quarter';
  if (Math.abs(frac - 0.5) < INSTANT) return 'full';
  if (Math.abs(frac - 0.75) < INSTANT) return 'last_quarter';
  if (frac < 0.25) return 'waxing_crescent';
  if (frac < 0.5) return 'waxing_gibbous';
  if (frac < 0.75) return 'waning_gibbous';
  return 'waning_crescent';
}

export function moonNow(when = Date.now()) {
  const age = (when - lastNewMoonAt(when)) / DAY_MS;   // days since new moon
  const frac = Math.min(0.9999, Math.max(0, age / SYNODIC)); // 0 new … 0.5 full … 1 new
  // Illuminated fraction of the disc. Exact enough at this scale: the real
  // figure differs by well under a percentage point.
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  return {
    age,
    frac,
    illum,
    waxing: frac < 0.5,
    phase: phaseName(frac),
    nextFull: nextPhaseAt(0.5, when),
    nextNew: nextPhaseAt(0, when),
  };
}

export const phaseLabel = (phase) => t(`moon.phase.${phase}`);

// ---------- the drawing ----------

// The lit part of the disc is one closed shape: the outer limb, then the
// terminator back the other way. The terminator is an ellipse seen edge-on,
// so its horizontal radius is r·|cos(2πf)| and it changes which way it
// bulges as the moon passes the quarters — which is the whole trick, and
// why a crescent and a gibbous fall out of the same two arcs.
export function moonSvg(m, size = 72, cls = 'moon-disc') {
  const r = size / 2 - 1;
  const cx = size / 2;
  const cy = size / 2;
  const bulge = Math.cos(2 * Math.PI * m.frac);
  const rx = Math.abs(bulge) * r;
  // Waxing moons are lit on the right in the northern hemisphere, waning on
  // the left. The sweep flags mirror the whole construction.
  const limb = m.waxing ? 1 : 0;
  const term = (bulge > 0) === m.waxing ? 0 : 1;
  const lit = `M ${cx} ${cy - r}`
    + ` A ${r} ${r} 0 0 ${limb} ${cx} ${cy + r}`
    + ` A ${rx.toFixed(2)} ${r} 0 0 ${term} ${cx} ${cy - r} Z`;

  return `
    <svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
         role="img" aria-label="${phaseLabel(m.phase)}">
      <defs>
        <radialGradient id="mg${size}" cx="38%" cy="34%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="55%" stop-color="#F0F4FA"/>
          <stop offset="100%" stop-color="#C6D2E2"/>
        </radialGradient>
        <clipPath id="mc${size}"><path d="${lit}"/></clipPath>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--moon-shadow, rgba(122,140,170,.22))"/>
      <path d="${lit}" fill="url(#mg${size})"/>
      <g clip-path="url(#mc${size})" opacity=".45">
        ${craters(cx, cy, r)}
      </g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="var(--moon-rim, rgba(255,255,255,.16))" stroke-width="1"/>
    </svg>
  `;
}

// Three dents, scaled off the radius so one set of numbers works at every
// size the card is drawn at. They are clipped to the lit shape rather than
// to the whole disc: craters picked out on the unlit half is not something
// the moon does, and at a glance it read as a full moon behind a smudge.
function craters(cx, cy, r) {
  return [[-0.28, -0.24, 0.19], [0.22, 0.16, 0.15], [-0.05, 0.42, 0.10]]
    .map(([dx, dy, rr]) => `<circle cx="${(cx + dx * r).toFixed(1)}" cy="${(cy + dy * r).toFixed(1)}"`
      + ` r="${(rr * r).toFixed(1)}" fill="rgba(126,146,176,.30)"/>`)
    .join('');
}

// ---------- formatting ----------

const LOCALE_TAG = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN' };

function num(n) {
  return new Intl.NumberFormat(LOCALE_TAG[getLocale()] || 'en-IN').format(n);
}

// Calendar days apart in the reader's own timezone, so "tonight" means the
// date on their phone rather than a 24-hour count from now.
function daysUntil(ms) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(ms); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / DAY_MS);
}

export function moonDateLabel(ms) {
  const d = new Date(ms);
  const date = new Intl.DateTimeFormat(LOCALE_TAG[getLocale()] || 'en-IN',
    { day: 'numeric', month: 'short' }).format(d);
  const n = daysUntil(ms);
  const rel = n <= 0 ? t('moon.tonight') : n === 1 ? t('moon.tomorrow') : t('moon.in_days', { n: num(n) });
  return `${date} · ${rel}`;
}

// ---------- the card ----------

// Rendered in two places at two sizes: a strip on the home screen after
// dark, and the full card in the astronomy sheet. Same data, same drawing.
export function renderMoonStrip(m = moonNow()) {
  return `
    <button class="moon-strip" id="moon-strip">
      ${moonSvg(m, 44, 'moon-disc')}
      <span class="moon-strip-text">
        <span class="moon-strip-eyebrow">${t('moon.eyebrow')}</span>
        <span class="moon-strip-name">${phaseLabel(m.phase)}</span>
      </span>
      <span class="moon-strip-illum">${t('moon.illum', { n: num(Math.round(m.illum * 100)) })}</span>
    </button>
  `;
}

export function renderMoonCard(m = moonNow()) {
  return `
    <div class="moon-card">
      <div class="moon-card-art">${moonSvg(m, 96, 'moon-disc')}</div>
      <div class="moon-card-body">
        <div class="moon-card-eyebrow">${t('moon.eyebrow')}</div>
        <div class="moon-card-name">${phaseLabel(m.phase)}</div>
        <div class="moon-card-meta">
          ${t('moon.illum', { n: num(Math.round(m.illum * 100)) })}
          · ${t('moon.age', { n: num(Math.floor(m.age) + 1) })}
        </div>
        <div class="moon-next">
          <div class="moon-next-row">
            <span class="moon-next-label">${t('moon.next_full')}</span>
            <span class="moon-next-when">${moonDateLabel(m.nextFull)}</span>
          </div>
          <div class="moon-next-row">
            <span class="moon-next-label">${t('moon.next_new')}</span>
            <span class="moon-next-when">${moonDateLabel(m.nextNew)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}
