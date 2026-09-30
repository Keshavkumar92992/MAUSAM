// What the rain on the radar *means*.
//
// The map used to draw seven hardcoded blobs drifting across India on a
// timer. It looked like a radar and was entirely invented — which is a
// strange thing for a screen carrying the IMD's name to do, and putting
// named intensity categories on top of made-up numbers would only have made
// it more convincing without making it any more true.
//
// Where the numbers come from now lives in grid.js, which fetches every
// variable the radar draws in one request. This file is only the rain: how
// a rate is banded, what each band is called, and how to say in one
// sentence what the map is showing.
import { t, registerEntries } from './i18n.js';
import { TRACE as _TRACE } from './scales.js';

// Re-exported so the radar, and the tests written against them, can keep
// importing the grid from here as they always have.
export { STEP, gridPoints, fetchGrid, slotAt, accumulate } from './grid.js';

registerEntries({
  'precip.light': { en: 'Light', hi: 'हल्की', bn: 'হালকা', ta: 'லேசான' },
  'precip.moderate': { en: 'Moderate', hi: 'मध्यम', bn: 'মাঝারি', ta: 'மிதமான' },
  'precip.heavy': { en: 'Heavy', hi: 'भारी', bn: 'ভারী', ta: 'கனமான' },
  'precip.extreme': { en: 'Extreme', hi: 'अत्यधिक', bn: 'অত্যধিক', ta: 'மிகக் கடுமையான' },
  'precip.legend': { en: 'RAIN RATE mm/h', hi: 'बारिश की दर मिमी/घंटा', bn: 'বৃষ্টির হার মিমি/ঘণ্টা', ta: 'மழை வீதம் மி.மீ/மணி' },
  'precip.none': { en: 'No rain anywhere on the map at this hour.', hi: 'इस समय नक़्शे पर कहीं बारिश नहीं।', bn: 'এই সময়ে মানচিত্রে কোথাও বৃষ্টি নেই।', ta: 'இந்நேரத்தில் வரைபடத்தில் எங்கும் மழை இல்லை.' },
  'precip.summary': { en: 'Rain at {{n}} of {{total}} points on the map this hour, reaching {{band}}.', hi: 'इस घंटे नक़्शे के {{total}} में से {{n}} बिंदुओं पर बारिश, सबसे तेज़ जगह {{band}}।', bn: 'এই ঘণ্টায় মানচিত্রের {{total}}টির মধ্যে {{n}}টি বিন্দুতে বৃষ্টি, সর্বোচ্চ {{band}}।', ta: 'இந்த மணி நேரத்தில் வரைபடத்தின் {{total}}-இல் {{n}} இடங்களில் மழை, அதிகபட்சம் {{band}}.' },
  'precip.live': { en: 'Forecast precipitation', hi: 'पूर्वानुमानित वर्षा', bn: 'পূর্বাভাসিত বৃষ্টিপাত', ta: 'முன்னறிவிக்கப்பட்ட மழை' },
});

// Rain *rate*, not a daily total. The standard meteorological rate scale —
// the one aviation and hydrology use — rather than IMD's 24-hour bands,
// because this map shows what is falling in a given hour. Reading a 24-hour
// classification onto an hourly figure is how the old legend came to claim
// "65+ mm/h", a rate India has essentially never recorded.
export const BANDS = [
  { key: 'light', min: 0.1, max: 2.5, color: '#4FB8C9' },
  { key: 'moderate', min: 2.5, max: 7.6, color: '#3E8FD8' },
  { key: 'heavy', min: 7.6, max: 50, color: '#C2452D' },
  { key: 'extreme', min: 50, max: Infinity, color: '#8E2418' },
];

// Below this there is nothing worth drawing — a hundredth of a millimetre
// in an hour is not rain, it is model noise.
export const TRACE = _TRACE;

export function bandFor(mm) {
  if (!(mm >= TRACE)) return null;
  return BANDS.find((b) => mm < b.max) || BANDS[BANDS.length - 1];
}

export const bandLabel = (key) => t(`precip.${key}`);

// What the map is showing right now, in one sentence for the nowcast card.
export function summarise(grid, slot) {
  if (!grid?.length) return null;
  const wet = grid.map((g) => g.mm[slot] ?? 0).filter((v) => v >= TRACE);
  if (!wet.length) return { text: t('precip.none'), worst: null };
  const worst = bandFor(Math.max(...wet));
  // Counting the wet points and naming the worst band in one sentence read
  // as though every one of them was at that band. Say both plainly: how
  // much of the map has rain, and how hard it gets at its worst.
  return {
    worst,
    text: t('precip.summary', {
      n: wet.length,
      total: grid.length,
      band: bandLabel(worst.key).toLowerCase(),
    }),
  };
}
