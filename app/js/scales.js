// Colour scales for the radar's layers, and the lookup tables that make
// them cheap enough to evaluate per pixel.
//
// Two rules decide every ramp below, and they are not stylistic:
//
//  * Magnitude gets ONE hue, light to dark. Rain accumulation, storm
//    energy, cloud and wind are all "how much of this is there", so each is
//    a single hue deepening — never a rainbow, which reads as categories
//    and hides where the real jumps are.
//
//  * Temperature is the one quantity here with a middle rather than a
//    floor, so it gets the diverging treatment: two hues away from a
//    neutral, and a genuinely neutral midpoint rather than a third colour.
//
// Rain *rate* is the deliberate exception. It keeps the four named bands
// the app already uses, because on a radar people read a category ("heavy")
// rather than a position along a gradient, and the legend names them.

// Below this there is nothing worth drawing — a hundredth of a millimetre
// in an hour is not rain, it is model noise.
export const TRACE = 0.1;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// A stop is [value, colour, alpha]. Alpha defaults to opaque; the first
// stop of most ramps is transparent so "none of it" fades out rather than
// painting the whole country.
const S = (v, c, a = 1) => [v, ...hex(c), Math.round(a * 255)];

// Rain rate, mm/h. Graded within each named band rather than flat across
// it: almost all Indian rain sits in the bottom two millimetres, so one
// colour per band painted the entire west coast a single sheet of cyan and
// threw away every difference inside it. Each band now runs from a pale
// shade to its full colour, which keeps the map continuous while the hue
// still says which band you are in — so the legend below it stays readable
// as four names rather than a gradient to squint at.
export const RAIN = {
  kind: 'smooth',
  min: 0, max: 60, swatch: [0.6, 3, 12],
  stops: [
    S(TRACE, '#7FD0DC', 0), S(0.4, '#7FD0DC', .52), S(1.2, '#63C2D1', .66), S(2.4, '#4FB8C9', .78),
    S(2.5, '#6BA8E0', .80), S(4.2, '#4F9BDB', .84), S(7.5, '#3E8FD8', .88),
    S(7.6, '#D9694F', .88), S(16, '#CC553B', .90), S(49, '#C2452D', .93),
    S(50, '#A32E1D', .94), S(80, '#8E2418', .96),
  ],
};

// Rain accumulated over the day ahead, mm. One hue, light to dark.
export const ACCUM = {
  kind: 'smooth',
  min: 0, max: 200, swatch: [5, 40, 120],
  stops: [S(0, '#D7E9F5', 0), S(1, '#D7E9F5', .55), S(10, '#9CC9E8', .68),
    S(25, '#5E9FD4', .78), S(50, '#3366A8', .86), S(100, '#1E3F73', .92),
    S(200, '#14284D', .95)],
};

// Convective available potential energy, J/kg — the fuel a thunderstorm
// runs on. One hue, light to dark.
export const CAPE = {
  kind: 'smooth',
  min: 0, max: 4000, swatch: [500, 1500, 3000],
  stops: [S(0, '#F6E3C3', 0), S(300, '#F6E3C3', .45), S(800, '#EFC182', .62),
    S(1500, '#E39A45', .75), S(2500, '#C9701F', .85), S(4000, '#8F4410', .92)],
};

// Cloud cover, %. No hue at all: white thickening over a dark map is what
// cloud looks like, and any colour here would compete with the rain.
export const CLOUD = {
  kind: 'smooth',
  min: 0, max: 100, swatch: [25, 60, 95],
  stops: [S(0, '#FFFFFF', 0), S(20, '#FFFFFF', .10), S(50, '#FFFFFF', .30),
    S(80, '#F2F6FA', .56), S(100, '#FFFFFF', .82)],
};

// Wind speed at 10 m, km/h. One cool hue deepening; the arrows on top
// carry direction, which colour cannot.
export const WIND = {
  kind: 'smooth',
  min: 0, max: 90, swatch: [12, 35, 65],
  stops: [S(0, '#CDE7EC', 0), S(10, '#CDE7EC', .40), S(25, '#8FC9D6', .58),
    S(40, '#4E9FB4', .72), S(60, '#2A6C84', .84), S(90, '#16404F', .92)],
};

// Temperature, °C. Diverging: cool and warm away from a neutral middle,
// with a real neutral at the midpoint rather than a third hue. The middle
// sits at 25°, which is where comfortable stops being a direction.
export const TEMP = {
  kind: 'smooth',
  min: 0, max: 48, swatch: [8, 25, 42],
  stops: [S(0, '#2C5C9E', .88), S(10, '#6C9BC8', .84), S(20, '#B9C6CE', .78),
    S(25, '#D6D3CC', .74), S(30, '#E2B27E', .80), S(38, '#CE7340', .86),
    S(48, '#9C3B1E', .92)],
};

// ---------- lookup tables ----------

// Evaluating a ramp per pixel, per frame, for every slider tick is the one
// place this map could get slow. Each scale is baked once into a 256-entry
// RGBA table and the renderer just indexes it.
const LUT_N = 256;
const cache = new WeakMap();

export function lut(scale) {
  const hit = cache.get(scale);
  if (hit) return hit;
  const out = new Uint8ClampedArray(LUT_N * 4);
  const { stops, min, max, kind } = scale;
  for (let i = 0; i < LUT_N; i++) {
    const v = min + (max - min) * (i / (LUT_N - 1));
    // Find the pair of stops this value falls between.
    let a = stops[0], b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (v >= stops[s][0] && v <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    if (v <= stops[0][0]) { a = b = stops[0]; }
    if (v >= stops[stops.length - 1][0]) { a = b = stops[stops.length - 1]; }
    // A stepped scale holds its lower stop's colour all the way to the next
    // edge; a smooth one crosses between them.
    const span = b[0] - a[0];
    const k = kind === 'steps' || span <= 0 ? 0 : (v - a[0]) / span;
    for (let c = 0; c < 4; c++) out[i * 4 + c] = a[1 + c] + (b[1 + c] - a[1 + c]) * k;
  }
  cache.set(scale, out);
  return out;
}

// Where a value lands in its table. Values below the scale's floor return
// -1, which the renderer reads as "paint nothing here".
export function lutIndex(scale, v) {
  if (!Number.isFinite(v)) return -1;
  const k = (v - scale.min) / (scale.max - scale.min);
  if (k < 0) return 0;
  return Math.min(LUT_N - 1, Math.round(k * (LUT_N - 1)));
}

// The same ramp as a CSS gradient, for the legend under the map. Sampled
// rather than written twice, so the strip and the map can never disagree.
export function cssRamp(scale, steps = 12) {
  const table = lut(scale);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const idx = Math.round((i / (steps - 1)) * (LUT_N - 1));
    const [r, g, b, a] = [table[idx * 4], table[idx * 4 + 1], table[idx * 4 + 2], table[idx * 4 + 3]];
    out.push(`rgba(${r},${g},${b},${(a / 255).toFixed(2)}) ${Math.round((i / (steps - 1)) * 100)}%`);
  }
  return `linear-gradient(90deg,${out.join(',')})`;
}
