// Weather-driven skies.
//
// The app already dims from daylight to night on its own dial (see the note
// at the top of styles.css). This layers the *weather* on top of that: a
// wash of colour over the hero photo, and a light animated layer in front
// of it, both chosen from one table below.
//
// To add a condition, add a row to SKIES and point a weather code at it in
// BY_CONDITION. Nothing else needs to know it exists.
//
// Two rules the table has to respect, learned the hard way:
//
//  * Both layers stop before the text does. They sit above the scrim —
//    below it they were all but invisible in daylight, since the scrim
//    carries the persona tint at .88 alpha across exactly the corner the
//    weather wanted — so the wash is written to fade out by two thirds
//    down, and the falling layer is masked out even earlier. The scrim's
//    job of keeping body text legible over a photograph is left intact.
//
//  * Daytime alphas stay modest, and the animation carries the signal
//    instead. Daylight means dark ink over a photograph, and a heavy storm
//    wash under that is exactly where contrast goes — so the daytime rows
//    top out around .46 and it is the rain you notice, not the colour.
//    After dark the ink is white on a dark page and the wash can push much
//    harder, which is where these numbers diverge.

// Straight sRGB lerp, shared with home.js.
export function mixHex(from, to, k) {
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(from, i) + (ch(to, i) - ch(from, i)) * k));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// tint/top/bot describe the wash over the photo: the colour, its alpha at
// the top of the screen and its alpha down where the content starts.
// sky is the four-stop gradient behind the photo, which shows while the
// photograph is still loading. fx names the animated layers.
const SKIES = {
  clear: {
    day: { tint: '#F5B453', top: 0.34, bot: 0.06, fx: ['rays'],
      sky: ['#9EC9EC', '#CFE2EF', '#EEEDE5', '#F5F4EF'] },
    night: { tint: '#2A2350', top: 0.52, bot: 0.12, fx: ['stars'],
      sky: ['#1B1B3A', '#181A31', '#131926', '#101825'] },
  },
  partly: {
    day: { tint: '#8FC0E8', top: 0.3, bot: 0.06, fx: ['clouds', 'rays'],
      sky: ['#A9CFEE', '#D2E3F0', '#EEEDE5', '#F5F4EF'] },
    night: { tint: '#232C4C', top: 0.48, bot: 0.11, fx: ['clouds', 'stars'],
      sky: ['#1A2140', '#171E33', '#131926', '#101825'] },
  },
  cloudy: {
    day: { tint: '#8D97A4', top: 0.4, bot: 0.09, fx: ['clouds'],
      sky: ['#B6BFC9', '#D3D8DC', '#ECEBE5', '#F5F4EF'] },
    night: { tint: '#1E2738', top: 0.54, bot: 0.12, fx: ['clouds'],
      sky: ['#1A2130', '#161C29', '#121824', '#101825'] },
  },
  rain: {
    day: { tint: '#5C7C9C', top: 0.44, bot: 0.1, fx: ['clouds', 'rain'],
      sky: ['#8FA6BC', '#BCC9D4', '#E7E9E6', '#F5F4EF'] },
    night: { tint: '#16233A', top: 0.6, bot: 0.14, fx: ['clouds', 'rain'],
      sky: ['#14203A', '#131C2E', '#111825', '#101825'] },
  },
  thunder: {
    day: { tint: '#4A5468', top: 0.46, bot: 0.11, fx: ['clouds', 'rain', 'flash'],
      sky: ['#78838F', '#A9B0B8', '#E2E3E2', '#F5F4EF'] },
    night: { tint: '#141426', top: 0.64, bot: 0.15, fx: ['clouds', 'rain', 'flash'],
      sky: ['#141328', '#121424', '#101622', '#101825'] },
  },
  snow: {
    day: { tint: '#C9DCEC', top: 0.4, bot: 0.09, fx: ['clouds', 'snow'],
      sky: ['#C6D9EA', '#DEE8F0', '#EFEEE8', '#F5F4EF'] },
    night: { tint: '#1D2C44', top: 0.54, bot: 0.12, fx: ['clouds', 'snow'],
      sky: ['#1B2740', '#182030', '#121926', '#101825'] },
  },
  fog: {
    day: { tint: '#B4B2AA', top: 0.48, bot: 0.16, fx: ['fog'],
      sky: ['#CFCEC8', '#DFDED8', '#EFEEE8', '#F5F4EF'] },
    night: { tint: '#232B38', top: 0.56, bot: 0.15, fx: ['fog'],
      sky: ['#1D2431', '#191F2B', '#131924', '#101825'] },
  },
};

// weatherApi.js already turns Open-Meteo's codes into these keys, so the
// code table lives in exactly one place and this maps onto it.
const BY_CONDITION = {
  'cond.clear': 'clear',
  'cond.partly_cloudy': 'partly',
  'cond.overcast': 'cloudy',
  'cond.cloudy': 'cloudy',
  'cond.haze': 'fog',
  'cond.drizzle': 'rain',
  'cond.rain': 'rain',
  'cond.snow': 'snow',
  'cond.thunderstorm': 'thunder',
};

function skyIdFor(conditionKey) {
  return BY_CONDITION[conditionKey] || 'partly';
}

// ---------- the animated layer ----------

// Fixed offsets rather than Math.random: the same weather always draws the
// same sky, so a re-render can never reshuffle it into a visible twitch.
// Negative delays start every particle mid-flight, so the layer looks like
// weather already in progress the instant it appears.
const DROPS = [3, 9, 15, 21, 27, 32, 38, 44, 50, 56, 62, 68, 73, 79, 85, 91,
  12, 35, 59, 82, 24, 71];
const FLAKES = [5, 12, 19, 26, 33, 41, 48, 55, 62, 69, 76, 83, 90, 96,
  17, 44, 66, 88];
const STARS = [
  [8, 12], [21, 7], [34, 18], [47, 9], [58, 21], [69, 6], [82, 15], [92, 24],
  [14, 30], [29, 26], [41, 34], [63, 31], [76, 28], [88, 37], [52, 13], [5, 25],
];
const CLOUDS = [
  { top: 5, w: 240, dur: 92, delay: -12, o: 0.75 },
  { top: 16, w: 310, dur: 128, delay: -60, o: 0.55 },
  { top: 27, w: 190, dur: 74, delay: -34, o: 0.42 },
];
const FOG_BANDS = [
  { top: 14, dur: 46, delay: -8, o: 0.5 },
  { top: 26, dur: 62, delay: -30, o: 0.38 },
  { top: 38, dur: 54, delay: -19, o: 0.26 },
];

function fxHtml(kinds) {
  let out = '';
  if (kinds.includes('rays')) out += '<span class="wx-ray"></span>';
  if (kinds.includes('stars')) {
    out += STARS.map(([l, t], i) =>
      `<span class="wx-star" style="left:${l}%;top:${t}%;animation-delay:${(-i * 0.7).toFixed(1)}s"></span>`).join('');
  }
  if (kinds.includes('clouds')) {
    out += CLOUDS.map((c) =>
      `<span class="wx-cloud" style="top:${c.top}%;width:${c.w}px;opacity:${c.o};`
      + `animation-duration:${c.dur}s;animation-delay:${c.delay}s"></span>`).join('');
  }
  if (kinds.includes('fog')) {
    out += FOG_BANDS.map((f) =>
      `<span class="wx-fog" style="top:${f.top}%;opacity:${f.o};`
      + `animation-duration:${f.dur}s;animation-delay:${f.delay}s"></span>`).join('');
  }
  if (kinds.includes('rain')) {
    out += DROPS.map((l, i) =>
      `<span class="wx-drop" style="left:${l}%;animation-duration:${(0.62 + (i % 5) * 0.11).toFixed(2)}s;`
      + `animation-delay:${(-i * 0.13).toFixed(2)}s"></span>`).join('');
  }
  if (kinds.includes('snow')) {
    out += FLAKES.map((l, i) =>
      `<span class="wx-flake" style="left:${l}%;animation-duration:${(7.5 + (i % 4) * 1.6).toFixed(1)}s;`
      + `animation-delay:${(-i * 0.9).toFixed(1)}s"></span>`).join('');
  }
  if (kinds.includes('flash')) out += '<span class="wx-flash"></span>';
  return out;
}

// ---------- mounting ----------

// Both layers live outside #app-root and are built once. render() replaces
// the whole shell on every persona tap, and rebuilding sixteen raindrops
// each time would restart all of their animations — a visible stutter, for
// nothing. They are position:fixed with the same geometry as the hero photo
// band, so they line up with it inside the phone frame on desktop too.
let wash = null;
let fxEl = null;
let currentFx = '';

export function mountSkyLayers() {
  if (wash) return;
  wash = document.createElement('div');
  wash.className = 'weather-wash';
  fxEl = document.createElement('div');
  fxEl.className = 'weather-fx';
  fxEl.setAttribute('aria-hidden', 'true');
  document.body.append(wash, fxEl);
}

// Publishes the sky as custom properties on <html>. They are registered in
// the stylesheet, so the browser transitions between two weathers by itself
// — and because they live on the root rather than on the elements, a
// re-render mid-transition picks up the value in flight instead of jumping.
export function applySky(conditionKey, night, deep = 0) {
  const v = SKIES[skyIdFor(conditionKey)][night ? 'night' : 'day'];
  const el = document.documentElement;
  el.style.setProperty('--wx-tint', v.tint);
  el.style.setProperty('--wx-top', String(v.top));
  el.style.setProperty('--wx-bot', String(v.bot));
  // At night the sky behind the photo keeps settling with --deep, the same
  // way the page surfaces do, so the two never drift apart.
  v.sky.forEach((c, i) => {
    el.style.setProperty(`--sky-${i + 1}`, night ? mixHex(lift(c), c, deep) : c);
  });

  const kinds = v.fx.join(' ');
  if (fxEl && kinds !== currentFx) {
    currentFx = kinds;
    fxEl.innerHTML = fxHtml(v.fx);
  }
}

// Twilight version of a night sky colour: the same hue, not yet as deep.
const lift = (c) => mixHex(c, '#3A4A6B', 0.42);

// ---------- helpers for the rest of the app ----------

// Whether the moon is worth showing on the home screen: after dark, and not
// under a sky that has hidden it anyway.
export function moonVisible(conditionKey, night) {
  if (!night) return false;
  return !['rain', 'thunder', 'snow', 'fog', 'cloudy'].includes(skyIdFor(conditionKey));
}
