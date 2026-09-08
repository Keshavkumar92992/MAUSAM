// Minimal i18n: flat dot-key dictionary, {{var}} interpolation, localStorage
// persistence. English is the fallback for any missing key in another
// language, so a partial translation never shows a blank string.
import { loadState, saveState } from './utils.js';

export const LOCALES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
];

let currentLocale = loadState().locale || 'en';
if (!LOCALES.some((l) => l.code === currentLocale)) currentLocale = 'en';

export function getLocale() {
  return currentLocale;
}

export function setLocale(code) {
  if (!LOCALES.some((l) => l.code === code)) return;
  currentLocale = code;
  saveState({ locale: code });
  document.documentElement.lang = code;
}

// STRINGS is populated by registerStrings() calls from each module that
// owns a chunk of UI text — keeps the dictionary next to what uses it
// instead of one giant unmaintainable file.
const STRINGS = { en: {}, hi: {}, bn: {}, ta: {} };

export function registerStrings(dict) {
  for (const locale of Object.keys(dict)) {
    Object.assign(STRINGS[locale], dict[locale]);
  }
}

// Authoring-friendly shape: { 'key.name': { en, hi, bn, ta } }, so all four
// translations of one string sit next to each other instead of scattered
// across four parallel locale blocks.
export function registerEntries(entries) {
  for (const key of Object.keys(entries)) {
    const row = entries[key];
    for (const locale of Object.keys(row)) {
      STRINGS[locale][key] = row[locale];
    }
  }
}

export function t(key, vars) {
  const table = STRINGS[currentLocale] || {};
  let str = table[key];
  if (str == null) str = STRINGS.en[key];
  if (str == null) return key; // visible-but-harmless fallback for a missing key
  if (vars) {
    for (const k of Object.keys(vars)) {
      str = str.replaceAll(`{{${k}}}`, vars[k]);
    }
  }
  return str;
}
