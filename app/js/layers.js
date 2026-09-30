// The radar's layers: what each one reads, how it is coloured, and what it
// is honest about.
//
// Every layer here is measured model output or real satellite imagery.
// The map used to offer four layers of which three were invented — drifting
// blobs on a timer, labelled "Simulated radar" in the header and otherwise
// indistinguishable from the real one. Those are gone. Adding a layer now
// means finding a source for it first.
//
// Two of Windy's categories are deliberately absent. "Lightning detected"
// comes from a commercial strike-detection network, and hurricane tracks
// from a cyclone advisory feed; neither is available to this app, and
// neither is worth faking on a screen carrying the IMD's name.

import { t, registerEntries } from './i18n.js';
import { RAIN, ACCUM, CAPE, CLOUD, WIND, TEMP, TRACE } from './scales.js';
import { accumulate, FORECAST_HOURS } from './grid.js';
import { BANDS, bandFor, bandLabel, summarise as rainSummary } from './precip.js';

registerEntries({
  'layer.radar': { en: 'Weather radar', hi: 'मौसम रडार', bn: 'আবহাওয়া রাডার', ta: 'வானிலை ரேடார்' },
  'layer.satellite': { en: 'Satellite', hi: 'सैटेलाइट', bn: 'স্যাটেলাইট', ta: 'செயற்கைக்கோள்' },
  'layer.wind': { en: 'Wind', hi: 'हवा', bn: 'বাতাস', ta: 'காற்று' },
  'layer.rainthunder': { en: 'Rain, thunder', hi: 'बारिश, गरज', bn: 'বৃষ্টি, বজ্র', ta: 'மழை, இடி' },
  'layer.temp': { en: 'Temperature', hi: 'तापमान', bn: 'তাপমাত্রা', ta: 'வெப்பநிலை' },
  'layer.clouds': { en: 'Clouds', hi: 'बादल', bn: 'মেঘ', ta: 'மேகங்கள்' },
  'layer.accum': { en: 'Rain accumulation', hi: 'कुल बारिश', bn: 'মোট বৃষ্টি', ta: 'மொத்த மழை' },
  'layer.thunder': { en: 'Thunderstorms', hi: 'तूफ़ान', bn: 'বজ্রঝড়', ta: 'இடியுடன் மழை' },

  'legend.wind': { en: 'WIND km/h', hi: 'हवा किमी/घंटा', bn: 'বাতাস কিমি/ঘণ্টা', ta: 'காற்று கி.மீ/மணி' },
  'legend.temp': { en: 'TEMPERATURE °C', hi: 'तापमान °से', bn: 'তাপমাত্রা °সে', ta: 'வெப்பநிலை °செ' },
  'legend.cloud': { en: 'CLOUD COVER %', hi: 'बादल %', bn: 'মেঘ %', ta: 'மேகமூட்டம் %' },
  'legend.accum': { en: 'RAIN NEXT 24H mm', hi: 'अगले 24 घंटे बारिश मिमी', bn: 'পরের ২৪ ঘণ্টা বৃষ্টি মিমি', ta: 'அடுத்த 24 மணி மழை மி.மீ' },
  'legend.cape': { en: 'STORM ENERGY J/kg', hi: 'तूफ़ानी ऊर्जा J/kg', bn: 'ঝড়ের শক্তি J/kg', ta: 'புயல் ஆற்றல் J/kg' },

  'src.model': { en: 'Open-Meteo forecast model', hi: 'Open-Meteo पूर्वानुमान मॉडल', bn: 'Open-Meteo পূর্বাভাস মডেল', ta: 'Open-Meteo முன்னறிவிப்பு மாதிரி' },
  'src.satellite': { en: 'NASA VIIRS · {{date}}', hi: 'NASA VIIRS · {{date}}', bn: 'NASA VIIRS · {{date}}', ta: 'NASA VIIRS · {{date}}' },

  // The one line that keeps this layer from being read as lightning
  // detection, which is a different instrument and a different claim.
  'note.cape': { en: 'Storm potential from model energy — not detected lightning.', hi: 'मॉडल ऊर्जा से तूफ़ान की संभावना — पकड़ी गई बिजली नहीं।', bn: 'মডেল শক্তি থেকে ঝড়ের সম্ভাবনা — শনাক্ত করা বজ্রপাত নয়।', ta: 'மாதிரி ஆற்றலில் இருந்து புயல் வாய்ப்பு — கண்டறியப்பட்ட மின்னல் அல்ல.' },
  'note.satellite': { en: 'VIIRS passes once a day, so this is the latest clear pass — not a live loop.', hi: 'VIIRS दिन में एक बार गुज़रता है, तो यह नवीनतम साफ़ तस्वीर है — लाइव नहीं।', bn: 'VIIRS দিনে একবার যায়, তাই এটি সর্বশেষ পরিষ্কার ছবি — লাইভ নয়।', ta: 'VIIRS நாளொன்றுக்கு ஒருமுறை கடக்கிறது, எனவே இது சமீபத்திய தெளிவான படம் — நேரலை அல்ல.' },
  'note.accum': { en: 'Total over the next 24 hours, so it does not move with the slider.', hi: 'अगले 24 घंटे का कुल, इसलिए यह स्लाइडर से नहीं बदलता।', bn: 'পরের ২৪ ঘণ্টার মোট, তাই এটি স্লাইডারে বদলায় না।', ta: 'அடுத்த 24 மணி நேர மொத்தம், எனவே இது ஸ்லைடரில் மாறாது.' },

  'sum.wind': { en: 'Strongest wind on the map: {{v}} km/h.', hi: 'नक़्शे पर सबसे तेज़ हवा: {{v}} किमी/घंटा।', bn: 'মানচিত্রে সবচেয়ে জোরালো বাতাস: {{v}} কিমি/ঘণ্টা।', ta: 'வரைபடத்தில் அதிவேக காற்று: {{v}} கி.மீ/மணி.' },
  'sum.temp': { en: 'Across the map: {{min}}° to {{max}}°.', hi: 'नक़्शे भर में: {{min}}° से {{max}}°।', bn: 'মানচিত্র জুড়ে: {{min}}° থেকে {{max}}°।', ta: 'வரைபடம் முழுவதும்: {{min}}° முதல் {{max}}° வரை.' },
  'sum.cloud': { en: '{{n}} of {{total}} points are more than half clouded.', hi: '{{total}} में से {{n}} बिंदुओं पर आधे से ज़्यादा बादल।', bn: '{{total}}টির মধ্যে {{n}}টি বিন্দুতে অর্ধেকের বেশি মেঘ।', ta: '{{total}}-இல் {{n}} இடங்களில் பாதிக்கு மேல் மேகம்.' },
  'sum.accum': { en: 'Most rain expected in the next 24 hours: {{v}} mm.', hi: 'अगले 24 घंटे में सबसे ज़्यादा बारिश: {{v}} मिमी।', bn: 'পরের ২৪ ঘণ্টায় সর্বোচ্চ বৃষ্টি: {{v}} মিমি।', ta: 'அடுத்த 24 மணி நேரத்தில் அதிகபட்ச மழை: {{v}} மி.மீ.' },
  'sum.accum_dry': { en: 'No meaningful rain expected anywhere in the next 24 hours.', hi: 'अगले 24 घंटे में कहीं ख़ास बारिश की उम्मीद नहीं।', bn: 'পরের ২৪ ঘণ্টায় কোথাও উল্লেখযোগ্য বৃষ্টি নেই।', ta: 'அடுத்த 24 மணி நேரத்தில் எங்கும் குறிப்பிடத்தக்க மழை இல்லை.' },
  'sum.cape': { en: 'Highest storm energy on the map: {{v}} J/kg — {{level}}.', hi: 'नक़्शे पर सबसे ज़्यादा तूफ़ानी ऊर्जा: {{v}} J/kg — {{level}}।', bn: 'মানচিত্রে সর্বোচ্চ ঝড়ের শক্তি: {{v}} J/kg — {{level}}।', ta: 'வரைபடத்தில் அதிகபட்ச புயல் ஆற்றல்: {{v}} J/kg — {{level}}.' },
  'sum.satellite': { en: 'True-colour image of India from {{date}}.', hi: '{{date}} की भारत की असली रंगों वाली तस्वीर।', bn: '{{date}} তারিখের ভারতের সত্যিকারের রঙের ছবি।', ta: '{{date}} அன்றைய இந்தியாவின் உண்மை-நிற படம்.' },
  'sum.thunder_with_rain': { en: '{{rain}} {{storms}} of {{total}} points carry enough energy for storms.', hi: '{{rain}} {{total}} में से {{storms}} बिंदुओं पर तूफ़ान लायक ऊर्जा।', bn: '{{rain}} {{total}}টির মধ্যে {{storms}}টিতে ঝড়ের মতো শক্তি।', ta: '{{rain}} {{total}}-இல் {{storms}} இடங்களில் புயலுக்கான ஆற்றல்.' },

  'cape.none': { en: 'not enough for storms', hi: 'तूफ़ान के लिए कम', bn: 'ঝড়ের জন্য যথেষ্ট নয়', ta: 'புயலுக்கு போதாது' },
  'cape.marginal': { en: 'enough for isolated storms', hi: 'इक्का-दुक्का तूफ़ान लायक', bn: 'বিক্ষিপ্ত ঝড়ের মতো', ta: 'தனித்த புயல்களுக்கு போதும்' },
  'cape.moderate': { en: 'enough for thunderstorms', hi: 'गरज-चमक लायक', bn: 'বজ্রঝড়ের মতো', ta: 'இடியுடன் மழைக்கு போதும்' },
  'cape.strong': { en: 'enough for severe storms', hi: 'तेज़ तूफ़ान लायक', bn: 'তীব্র ঝড়ের মতো', ta: 'கடும் புயல்களுக்கு போதும்' },
});

// The energy at which a storm becomes plausible, then likely, then severe.
// These are the forecasting rules of thumb for CAPE, not invented cutoffs.
const CAPE_BANDS = [
  [300, 'none'], [1000, 'marginal'], [2500, 'moderate'], [Infinity, 'strong'],
];
export const capeLevel = (v) => t(`cape.${CAPE_BANDS.find(([max]) => v < max)[1]}`);

const STORM_MIN = 1000;

const max = (grid, read) => grid.reduce((m, p, i) => {
  const v = read(i);
  return Number.isFinite(v) && v > m ? v : m;
}, -Infinity);

// Each layer reads by grid index rather than by point, so the field
// renderer can hand it whichever neighbour it is weighting without the
// layer knowing anything about interpolation.
function reader(grid, slot, series) {
  return (i) => grid[i]?.[series]?.[slot];
}

export const LAYERS = [
  {
    key: 'radar',
    label: 'layer.radar',
    scale: RAIN,
    legend: { title: 'precip.legend', kind: 'bands' },
    source: 'src.model',
    read: (grid, slot) => reader(grid, slot, 'mm'),
    summary: (grid, slot) => rainSummary(grid, slot)?.text || '',
  },
  {
    key: 'satellite',
    label: 'layer.satellite',
    satellite: true,
    legend: null,
    source: 'src.satellite',
    note: 'note.satellite',
    summary: (grid, slot, extra) => (extra?.date
      ? t('sum.satellite', { date: extra.date }) : ''),
  },
  {
    key: 'wind',
    label: 'layer.wind',
    scale: WIND,
    arrows: true,
    legend: { title: 'legend.wind', kind: 'ramp', ticks: [10, 40, '90+'] },
    source: 'src.model',
    read: (grid, slot) => reader(grid, slot, 'windSpeed'),
    summary: (grid, slot) => t('sum.wind', {
      v: Math.round(max(grid, reader(grid, slot, 'windSpeed'))),
    }),
  },
  {
    key: 'rainthunder',
    label: 'layer.rainthunder',
    scale: RAIN,
    storms: true,
    legend: { title: 'precip.legend', kind: 'bands' },
    source: 'src.model',
    note: 'note.cape',
    read: (grid, slot) => reader(grid, slot, 'mm'),
    summary: (grid, slot) => {
      const storms = grid.filter((p) => (p.cape?.[slot] ?? 0) >= STORM_MIN).length;
      return t('sum.thunder_with_rain', {
        rain: rainSummary(grid, slot)?.text || '',
        storms, total: grid.length,
      });
    },
  },
  {
    key: 'temp',
    label: 'layer.temp',
    scale: TEMP,
    legend: { title: 'legend.temp', kind: 'ramp', ticks: [0, 24, 48] },
    source: 'src.model',
    read: (grid, slot) => reader(grid, slot, 'temp'),
    summary: (grid, slot) => {
      const vals = grid.map((p) => p.temp?.[slot]).filter(Number.isFinite);
      if (!vals.length) return '';
      return t('sum.temp', { min: Math.round(Math.min(...vals)), max: Math.round(Math.max(...vals)) });
    },
  },
  {
    key: 'clouds',
    label: 'layer.clouds',
    scale: CLOUD,
    legend: { title: 'legend.cloud', kind: 'ramp', ticks: [0, 50, 100] },
    source: 'src.model',
    read: (grid, slot) => reader(grid, slot, 'cloud'),
    summary: (grid, slot) => t('sum.cloud', {
      n: grid.filter((p) => (p.cloud?.[slot] ?? 0) > 50).length,
      total: grid.length,
    }),
  },
  {
    key: 'accum',
    label: 'layer.accum',
    scale: ACCUM,
    // A total, not an instant — so the slider does not move it, the same
    // way Windy's accumulation layers are a window rather than a moment.
    frozen: true,
    legend: { title: 'legend.accum', kind: 'ramp', ticks: [1, 50, '200+'] },
    source: 'src.model',
    note: 'note.accum',
    read: (grid, slot) => (i) => accumulate(grid[i], slot, FORECAST_HOURS),
    summary: (grid, slot) => {
      const top = max(grid, (i) => accumulate(grid[i], slot, FORECAST_HOURS));
      return top < 1 ? t('sum.accum_dry') : t('sum.accum', { v: Math.round(top) });
    },
  },
  {
    key: 'thunder',
    label: 'layer.thunder',
    scale: CAPE,
    storms: true,
    legend: { title: 'legend.cape', kind: 'ramp', ticks: [300, '1.5k', '4k+'] },
    source: 'src.model',
    note: 'note.cape',
    read: (grid, slot) => reader(grid, slot, 'cape'),
    summary: (grid, slot) => {
      const top = max(grid, reader(grid, slot, 'cape'));
      return t('sum.cape', { v: Math.round(top), level: capeLevel(top) });
    },
  },
];

export const layerBy = (key) => LAYERS.find((l) => l.key === key) || LAYERS[0];

// Where storm markers go: points with enough energy to matter, so the
// marker means something rather than decorating every cell.
export function stormPoints(grid, slot) {
  return grid
    .map((p, i) => ({ p, i, cape: p.cape?.[slot] ?? 0 }))
    .filter((s) => s.cape >= STORM_MIN);
}

// The swatch beside each name in the layer menu — sampled from that
// layer's own ramp so the menu and the map can never disagree.
export { TRACE, BANDS, bandFor, bandLabel };
