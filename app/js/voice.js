// Text-to-speech for assistant answers.
//
// Kept separate from askUi.js because it is a different concern with its
// own browser support story: SpeechSynthesis exists in far more browsers
// than SpeechRecognition, and unlike the mic it needs no permission and no
// secure context — so voice output works over the LAN address where voice
// input does not.
import { getLocale, registerEntries } from './i18n.js';

const SYNTH = window.speechSynthesis;

// BCP-47 tags for the four app languages. Bengali and Tamil voices are not
// installed on every device; pickVoice() falls back rather than going silent.
const TTS_LANG = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN' };

registerEntries({
  'voice.speak': { en: 'Read aloud', hi: 'पढ़कर सुनाएँ', bn: 'পড়ে শোনান', ta: 'படித்துக் காட்டு' },
  'voice.stop': { en: 'Stop', hi: 'रोकें', bn: 'থামান', ta: 'நிறுத்து' },
  'voice.unsupported': { en: 'This browser cannot read answers aloud.', hi: 'यह ब्राउज़र जवाब बोलकर नहीं सुना सकता।', bn: 'এই ব্রাউজার উত্তর পড়ে শোনাতে পারে না।', ta: 'இந்த உலாவியால் பதில்களை வாசிக்க முடியாது.' },
  'voice.no_voice': { en: 'No voice for this language on this device — reading in another.', hi: 'इस डिवाइस पर इस भाषा की आवाज़ नहीं है — दूसरी में सुनाया जा रहा है।', bn: 'এই ডিভাইসে এই ভাষার কণ্ঠ নেই — অন্য ভাষায় শোনানো হচ্ছে।', ta: 'இந்தச் சாதனத்தில் இந்த மொழிக்கான குரல் இல்லை — வேறொன்றில் வாசிக்கப்படுகிறது.' },
});

export function voiceSupported() {
  return !!SYNTH;
}

// Voices load asynchronously in Chrome; the list is empty on the first call.
function voices() {
  try { return SYNTH.getVoices() || []; } catch { return []; }
}

// Exact language match first, then any voice sharing the base language
// (hi-IN vs hi), then nothing — the engine's default is better than silence.
function pickVoice(tag) {
  const list = voices();
  if (!list.length) return null;
  const base = tag.split('-')[0];
  return list.find((v) => v.lang === tag)
    || list.find((v) => v.lang.replace('_', '-') === tag)
    || list.find((v) => v.lang.split(/[-_]/)[0] === base)
    || null;
}

export function isSpeaking() {
  return !!SYNTH && (SYNTH.speaking || SYNTH.pending);
}

export function stopSpeaking() {
  try { SYNTH?.cancel(); } catch { /* nothing playing */ }
}

// Reads `text` in the current app language. Returns a status the caller can
// surface, so a missing voice says so instead of appearing to do nothing.
export function speak(text, { onEnd } = {}) {
  if (!SYNTH) return 'unsupported';
  stopSpeaking(); // one answer at a time; queuing would talk over itself

  const tag = TTS_LANG[getLocale()] || 'en-IN';
  const v = pickVoice(tag);
  const u = new SpeechSynthesisUtterance(text);
  if (v) u.voice = v;
  u.lang = v ? v.lang : tag;
  u.rate = 0.98; // a touch slower than default; numbers land better
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  SYNTH.speak(u);
  return v ? 'ok' : 'no_voice';
}

// Chrome fills getVoices() only after this event, so warm it at startup and
// the first tap already has a list to choose from.
export function warmVoices() {
  if (!SYNTH) return;
  voices();
  SYNTH.addEventListener?.('voiceschanged', voices, { once: true });
}

export function speakerIcon(on = false) {
  const body = on
    ? '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'
    : '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
    + 'stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
}
