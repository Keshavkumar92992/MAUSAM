// Chat surface for the assistant.
//
// It owns its own DOM under <body> rather than living inside home.js's
// render() output: that function replaces root.innerHTML wholesale on every
// persona tap and every background refresh, which would wipe the
// conversation and drop keyboard focus mid-sentence.
import { t, getLocale, registerEntries } from './i18n.js';
import { weatherCodeToCondition, geocodeCity, fetchWeatherBundle } from './weatherApi.js';
import { buildMetrics } from './metrics.js';
import { speak, stopSpeaking, isSpeaking, voiceSupported, warmVoices, speakerIcon } from './voice.js';
import {
  parseIntent, analyse, bestWindow, findAlternatives, extractPlace,
  windowLabel, hazardText, activityLabel, isSlopeKind, proactiveInsight,
} from './askEngine.js';

let panel = null;
let fab = null;
let logEl = null;
let inputEl = null;
let statusEl = null;
let getContext = null;
let destinations = null;
let greeted = false;
let builtLocale = null;

// Voice input. Chrome/Edge/Safari expose this (Safari only under the webkit
// prefix); Firefox does not.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
// Browsers hide SpeechRecognition entirely on an insecure origin, so over a
// plain http://<lan-ip> the constructor is missing even on phones that fully
// support it — which made the button vanish on exactly the device people
// test with. Offer it there and explain on tap; only a browser that lacks
// the API on a secure origin is genuinely unsupported.
const VOICE_OFFERED = !!SR || !window.isSecureContext;
const SR_LANG = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN' };
let recog = null;
let listening = false;

registerEntries({
  'voice.conv.open': { en: 'Ask by speaking', hi: 'बोलकर पूछिए', bn: 'বলে জিজ্ঞাসা করুন', ta: 'பேசிக் கேளுங்கள்' },
  'voice.conv.listening': { en: 'Listening…', hi: 'सुन रहा हूँ…', bn: 'শুনছি…', ta: 'கேட்கிறேன்…' },
  'voice.conv.thinking': { en: 'Checking the forecast…', hi: 'पूर्वानुमान देख रहा हूँ…', bn: 'পূর্বাভাস দেখছি…', ta: 'முன்னறிவிப்பைப் பார்க்கிறேன்…' },
  'voice.conv.say_again': { en: 'Did not catch that — say it again.', hi: 'सुनाई नहीं दिया — फिर से बोलिए।', bn: 'শুনতে পাইনি — আবার বলুন।', ta: 'கேட்கவில்லை — மீண்டும் சொல்லுங்கள்.' },
  'voice.conv.gave_up': { en: 'Nothing heard. Tap to start again.', hi: 'कुछ सुनाई नहीं दिया। फिर शुरू करने के लिए दबाइए।', bn: 'কিছু শোনা গেল না। আবার শুরু করতে চাপুন।', ta: 'எதுவும் கேட்கவில்லை. மீண்டும் தொடங்கத் தட்டுங்கள்.' },
  'voice.conv.hint': { en: 'Just ask — like "will it rain tomorrow, is it fine to work the field"', hi: 'बस पूछिए — जैसे "कल बारिश होगी क्या, खेत का काम ठीक रहेगा"', bn: 'শুধু জিজ্ঞাসা করুন — যেমন "কাল বৃষ্টি হবে কি, জমির কাজ ঠিক হবে"', ta: 'கேட்டால் போதும் — "நாளை மழை பெய்யுமா, வயல் வேலை சரியாக இருக்குமா" போல' },
  'voice.conv.end': { en: 'Done', hi: 'बंद करें', bn: 'বন্ধ করুন', ta: 'முடிந்தது' },

  'ask.mic': { en: 'Speak', hi: 'बोलें', bn: 'বলুন', ta: 'பேசுங்கள்' },
  'ask.mic_listening': { en: 'Listening…', hi: 'सुन रहे हैं…', bn: 'শুনছি…', ta: 'கேட்கிறேன்…' },
  'ask.mic_denied': { en: 'Microphone blocked — allow it in your browser settings.', hi: 'माइक्रोफ़ोन बंद है — ब्राउज़र सेटिंग्स में अनुमति दें।', bn: 'মাইক্রোফোন বন্ধ — ব্রাউজার সেটিংসে অনুমতি দিন।', ta: 'ஒலிவாங்கி தடுக்கப்பட்டுள்ளது — உலாவி அமைப்புகளில் அனுமதி அளியுங்கள்.' },
  'ask.mic_nospeech': { en: 'Did not catch that — try again.', hi: 'सुनाई नहीं दिया — फिर कोशिश करें।', bn: 'শুনতে পাইনি — আবার চেষ্টা করুন।', ta: 'கேட்கவில்லை — மீண்டும் முயற்சிக்கவும்.' },
  'ask.mic_https': { en: 'Voice input needs a secure (https) connection — it works on the deployed site.', hi: 'आवाज़ के लिए सुरक्षित (https) कनेक्शन चाहिए — डिप्लॉय की गई साइट पर यह काम करेगा।', bn: 'ভয়েসের জন্য নিরাপদ (https) সংযোগ দরকার — ডিপ্লয় করা সাইটে এটি কাজ করবে।', ta: 'குரல் உள்ளீட்டுக்குப் பாதுகாப்பான (https) இணைப்பு தேவை — வெளியிடப்பட்ட தளத்தில் இது வேலை செய்யும்.' },
  'ask.mic_error': { en: 'Voice input failed — type instead.', hi: 'आवाज़ काम नहीं आई — टाइप करके पूछें।', bn: 'ভয়েস কাজ করল না — টাইপ করে জিজ্ঞেস করুন।', ta: 'குரல் உள்ளீடு தோல்வி — தட்டச்சு செய்யுங்கள்.' },
  'ask.mic_unsupported': { en: 'This browser does not support voice input — try Chrome or Safari.', hi: 'यह ब्राउज़र आवाज़ से पूछना नहीं समझता — Chrome या Safari आज़माएँ।', bn: 'এই ব্রাউজার ভয়েস ইনপুট সমর্থন করে না — Chrome বা Safari ব্যবহার করুন।', ta: 'இந்த உலாவி குரல் உள்ளீட்டை ஆதரிக்கவில்லை — Chrome அல்லது Safari முயற்சிக்கவும்.' },
});

async function loadDestinations() {
  if (destinations) return destinations;
  try {
    const res = await fetch('./data/destinations.json');
    destinations = (await res.json()).destinations || [];
  } catch {
    destinations = [];
  }
  return destinations;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function row(label, valueNode) {
  const r = el('div', 'ask-row');
  r.appendChild(el('span', 'ask-k', label));
  r.appendChild(valueNode);
  return r;
}

// The user's location is a city, not a trail, so terrain has to be
// inferred: if a curated destination sits within ~40 km and that place is
// hill/valley/highland, treat the surroundings as slope terrain. Anything
// further away says nothing useful about where the user actually is.
function slopeNearby(origin, list) {
  const near = list.find((d) => {
    const dx = (d.lat - origin.lat) * 111;
    const dy = (d.lon - origin.lon) * 96;
    return Math.hypot(dx, dy) <= 40 && isSlopeKind(d.kind);
  });
  return !!near;
}

function levelChip(level) {
  return el('span', `ask-lvl ask-lvl-${level}`, t(`ask.level.${level}`));
}

function buildAnswer({ metrics, city, persona }, question, list) {
  const { intent, activity, when, guessed } = parseIntent(question, persona);
  if (intent === 'unknown' || intent === 'greeting') {
    const card = el('div', 'ask-msg bot');
    card.appendChild(el('div', 'ask-ans', intent === 'greeting'
      ? t('ask.greet', { place: city.name })
      : t('ask.fallback')));
    if (intent === 'greeting' && metrics) {
      const insight = proactiveInsight(metrics, persona);
      if (insight) card.appendChild(el('div', `ask-proactive${insight.urgent ? ' urgent' : ''}`, insight.text));
    }
    return { card, needsAlts: false };
  }

  const slope = slopeNearby(city, list);
  const { level, hazards, peaks } = analyse(metrics, activity, { slope, when });
  const win = bestWindow(metrics, activity);
  const act = activityLabel(activity);
  const tmr = when === 'tomorrow';

  // The headline has to answer the question that was actually asked.
  // Every intent used to fall through to the same verdict line, so asking
  // "best time to go" and "is it safe" produced identical cards.
  let headline;
  if (intent === 'best_time') {
    headline = win
      ? t('ask.ans.time', { act, place: city.name, win: windowLabel(win) })
      : t('ask.ans.time_none', { act, place: city.name });
  } else if (intent === 'gear') {
    // Umbrella questions want a yes/no about rain, not an activity verdict.
    const uvHigh = (metrics.uv_index_max || 0) >= 8 && peaks.rain < 25;
    headline = uvHigh
      ? t('ask.gear.sun', { uv: metrics.uv_index_max })
      : t(peaks.rain >= 50 ? 'ask.ans.gear_yes' : peaks.rain >= 25 ? 'ask.ans.gear_maybe' : 'ask.ans.gear_no',
        { place: city.name, rain: peaks.rain });
  } else if (intent === 'forecast') {
    headline = tmr
      ? t('ask.ans.forecast_tmr', {
        place: city.name,
        cond: t(weatherCodeToCondition(metrics.daily?.weather_code?.[1] ?? 0).key),
        max: Math.round(metrics.daily?.temperature_2m_max?.[1] ?? metrics.tempMax),
      })
      : t('ask.ans.forecast', {
        place: city.name, cond: t(metrics.conditionKey),
        temp: metrics.tempNow, feels: metrics.feelsLikeNow,
      });
  } else {
    headline = t(`ask.ans.${level}${tmr ? '_tmr' : ''}`, { place: city.name, act });
  }

  const card = el('div', 'ask-msg bot');
  card.appendChild(el('div', 'ask-ans', headline));

  // Which rows belong under the headline depends on what was asked. Every
  // answer used to carry the same four — WEATHER, RISK, RECOMMENDATION,
  // WHY — so asking "what's the temperature" came back with a suitability
  // verdict and a window for an activity nobody had mentioned, and every
  // reply read like the last one. Only a question about *doing* something
  // earns a risk verdict.
  const aboutDoing = intent === 'safe' || intent === 'alternatives' || intent === 'best_time';
  const showRisk = aboutDoing;
  const showRec = aboutDoing;
  const showWhy = aboutDoing || (intent === 'gear' && hazards.length > 0);

  // For a plain forecast question the headline already gives the current
  // conditions, so this row carries the outlook rather than repeating them.
  card.appendChild(row(t('ask.sec.weather'), el('span', 'ask-v', tmr
    ? t('ask.weather.tomorrow', { place: city.name, rain: peaks.rain, gust: peaks.gust, max: peaks.feels })
    : intent === 'forecast'
      ? t('ask.weather.outlook', { rain: peaks.rain, gust: peaks.gust, max: peaks.feels })
      : t('ask.weather.now', {
        cond: t(metrics.conditionKey),
        temp: metrics.tempNow,
        feels: metrics.feelsLikeNow,
        rain: peaks.rain,
        gust: peaks.gust,
        max: peaks.feels,
      }))));

  if (showRisk) card.appendChild(row(t('ask.sec.risk'), levelChip(level)));

  const recNode = el('span', 'ask-v');
  // Whether this row actually promised a list of places, which is the only
  // case an empty lookup has any business erasing.
  let recPromisedAlts = false;
  if (intent === 'alternatives') {
    // Someone asking "where else" may be blocked by something the forecast
    // cannot see — a landslide, a closed road. Take them at their word and
    // list options, while still being honest that this place reads fine.
    recNode.textContent = level === 'avoid'
      ? t('ask.rec.alts')
      : t('ask.rec.alts_anyway', { place: city.name });
    recPromisedAlts = true;
  } else if (intent === 'best_time' && win) {
    // Checked before the avoid branch, not after. When the level was avoid
    // this row said "nearby places that look better:", the lookup came back
    // empty, and the fallback then repeated the very window the headline had
    // just given. The headline already named the window — spend the row on
    // what to do about the hours outside it.
    recNode.textContent = t(level === 'good' ? 'ask.rec.time_clear' : 'ask.rec.time_caveat', { act });
  } else if (level === 'avoid') {
    recNode.textContent = t('ask.rec.alts');
    recPromisedAlts = true;
  } else {
    recNode.textContent = win
      ? t(level === 'good' ? 'ask.rec.window' : 'ask.rec.window_short', { win: windowLabel(win) })
      : t('ask.rec.no_window');
  }
  if (showRec) card.appendChild(row(t('ask.sec.rec'), recNode));
  // Alternatives are fetched after the card is built, so reserve their slot
  // here — otherwise they append after WHY and read as a stray afterthought.
  const slot = el('div', 'ask-alts-slot');
  card.appendChild(slot);

  if (showWhy) {
    const why = hazards.length
      ? t('ask.why.hazards', { list: hazards.slice(0, 3).map(hazardText).join(', ') })
      : t('ask.why.clear', { act });
    card.appendChild(row(t('ask.sec.why'), el('span', 'ask-v', why)));
  }

  if (guessed) card.appendChild(el('div', 'ask-hint', t('ask.guess_hint')));

  const severe = hazards.find((z) => z.sev === 2);
  if (severe) {
    const a = el('div', 'ask-alert');
    a.appendChild(el('span', 'ask-k', t('ask.sec.alert')));
    a.appendChild(el('span', 'ask-v', hazardText(severe)));
    card.appendChild(a);
  }

  return {
    card,
    slot,
    recNode: showRec && recPromisedAlts ? recNode : null,
    needsAlts: (intent === 'alternatives' || level === 'avoid') && showRec,
    activity,
    win,
    level,
    place: city.name,
  };
}

function renderAlternatives(slot, alts, { win, level, place, recNode }) {
  if (!alts.length) {
    // The RECOMMENDATION row has already said "nearby places that look
    // better:" by this point. With nothing to list, that sentence is a
    // promise the card cannot keep, so take it back rather than following
    // it with a time range.
    if (recNode) recNode.textContent = '';
    // Some activities have no "somewhere else" — you do not drive 200 km
    // for a jog, and a field cannot be relocated. A better time is the
    // only useful alternative there, so offer that instead of a dead end.
    const text = level !== 'avoid'
      ? t('ask.rec.alts_none_fine', { place })
      : win ? t('ask.rec.window_short', { win: windowLabel(win) }) : t('ask.rec.no_alts');
    slot.appendChild(el('div', 'ask-v ask-noalt', text));
    return;
  }
  const wrap = el('div', 'ask-alts');
  for (const a of alts) {
    const item = el('div', 'ask-alt');
    const top = el('div', 'ask-alt-top');
    top.appendChild(el('span', 'ask-alt-name', `${a.dest.name}, ${a.dest.state}`));
    top.appendChild(levelChip(a.level));
    item.appendChild(top);
    item.appendChild(el('div', 'ask-alt-meta', t('ask.alt.line', { km: a.km, temp: a.temp, rain: a.rain })));
    if (a.hazards.length) {
      item.appendChild(el('div', 'ask-alt-why', a.hazards.slice(0, 2).map(hazardText).join(', ')));
    }
    wrap.appendChild(item);
  }
  slot.appendChild(wrap);
}

// "weather in Mumbai" used to be answered for whichever city the home
// screen was on. Resolve the name through the same geocoder the search box
// uses, then run the normal pipeline against that city's forecast — no
// second weather path, no second city list.
async function resolveAskedCity(question, current) {
  const phrase = extractPlace(question);
  if (!phrase) return { city: current };
  if (phrase.toLowerCase() === (current.name || '').toLowerCase()) return { city: current };
  try {
    const hits = await geocodeCity(phrase);
    // The geocoder answers *something* for almost any string, so require the
    // result to actually look like what was asked for. Without this, a stray
    // word that slipped past the stopword list quietly relocates the answer.
    const looksRight = (h) => {
      const n = (h.name || '').toLowerCase();
      return n === phrase || n.startsWith(phrase) || phrase.startsWith(n);
    };
    const matches = hits.filter(looksRight);
    if (!matches.length) return { city: current, missed: phrase };
    const hit = matches.find((h) => h.country === 'India') || matches[0];
    const bundle = await fetchWeatherBundle(hit.lat, hit.lon);
    return {
      city: { name: hit.name, admin1: hit.admin1, country: hit.country, lat: hit.lat, lon: hit.lon },
      metrics: buildMetrics(bundle, hit.name),
      switched: true,
    };
  } catch {
    return { city: current, missed: phrase };
  }
}

function scrollLog() {
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
}

function micIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<rect x="9" y="3" width="6" height="11" rx="3"/>' +
    '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>';
}

function stopVoice() {
  if (recog) { try { recog.stop(); } catch { /* already stopped */ } }
}

function startVoice(btn) {
  if (listening) { stopVoice(); return; }
  // Same secure-context rule as geolocation: the browser refuses outright on
  // a plain http://<lan-ip>, without ever prompting for the microphone.
  if (!window.isSecureContext) { statusEl.textContent = t('ask.mic_https'); return; }
  if (!SR) { statusEl.textContent = t('ask.mic_unsupported'); return; }

  recog = new SR();
  recog.lang = SR_LANG[getLocale()] || 'en-IN';
  recog.interimResults = true;
  recog.continuous = false;
  recog.maxAlternatives = 1;

  let finalText = '';
  recog.onstart = () => {
    listening = true;
    btn.classList.add('listening');
    statusEl.textContent = t('ask.mic_listening');
  };
  recog.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    inputEl.value = (finalText + interim).trim();
  };
  recog.onerror = (e) => {
    statusEl.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? t('ask.mic_denied')
      : e.error === 'no-speech' ? t('ask.mic_nospeech') : t('ask.mic_error');
  };
  recog.onend = () => {
    listening = false;
    btn.classList.remove('listening');
    if (statusEl.textContent === t('ask.mic_listening')) statusEl.textContent = '';
    // Only send what was actually recognised — an interim fragment left in
    // the box after a cancelled capture should not fire off a question.
    const said = finalText.trim();
    if (said) { inputEl.value = ''; ask(said, { spoken: true }); }
  };

  try {
    recog.start();
  } catch {
    statusEl.textContent = t('ask.mic_error');
  }
}


// ---------- hands-free conversation ----------
//
// The panel is text-first: an input box with a small mic beside it. That is
// the wrong shape for the person who most needs the assistant — a farmer who
// would rather ask "kal khet ka kaam theek rahega, barish to nahi hogi" out
// loud than type it. This is that: one button, then talk, listen, talk
// again, until you stop it.
//
// Two rules the loop has to keep, or it eats itself:
//   * never listen while the synth is speaking — it hears its own voice and
//     answers its own question;
//   * give up after a few silent or failed turns rather than holding the
//     microphone open forever.
const CONV_MAX_QUIET = 2;    // consecutive silent turns before standing down
const CONV_MAX_ERRORS = 3;

let conv = null;   // { overlay, orb, caption, transcript, recog, state, quiet, errors, stopped }

function convSet(state, text) {
  if (!conv) return;
  conv.state = state;
  conv.overlay.dataset.state = state;
  if (text != null) conv.caption.textContent = text;
}

function convStop() {
  if (!conv) return;
  const c = conv;
  conv = null;                       // clear first: the handlers below check it
  c.stopped = true;
  try { c.recog?.abort(); } catch { /* already gone */ }
  stopSpeaking();
  c.overlay.remove();
}

function convListen() {
  if (!conv || conv.stopped) return;
  const c = conv;
  const recog = new SR();
  c.recog = recog;
  recog.lang = SR_LANG[getLocale()] || 'en-IN';
  recog.interimResults = true;
  recog.continuous = false;
  recog.maxAlternatives = 1;

  let heard = '';
  recog.onstart = () => convSet('listening', t('voice.conv.listening'));
  recog.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) heard += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (conv) conv.transcript.textContent = (heard + interim).trim();
  };
  recog.onerror = (e) => {
    if (!conv) return;
    if (e.error === 'no-speech') return;              // handled in onend
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      convSet('idle', t('ask.mic_denied'));
      setTimeout(convStop, 2500);
      return;
    }
    conv.errors += 1;
    if (conv.errors >= CONV_MAX_ERRORS) { convSet('idle', t('ask.mic_error')); setTimeout(convStop, 2000); }
  };
  recog.onend = async () => {
    if (!conv || conv.stopped) return;
    const said = heard.trim();
    if (!said) {
      conv.quiet += 1;
      if (conv.quiet >= CONV_MAX_QUIET) {
        // Stand down rather than close: the caption invites a tap to start
        // again, and a panel that vanished first would be lying about that.
        conv.quiet = 0;
        convSet('idle', t('voice.conv.gave_up'));
        return;
      }
      convSet('listening', t('voice.conv.say_again'));
      setTimeout(convListen, 400);
      return;
    }
    conv.quiet = 0;
    convSet('thinking', t('voice.conv.thinking'));
    const card = await ask(said);
    if (!conv || conv.stopped) return;
    conv.transcript.textContent = '';
    if (!card) { convSet('idle', t('ask.thinking')); setTimeout(convStop, 2400); return; }

    const reply = shortSpeech(card);
    convSet('speaking', reply);
    const status = speak(reply, {
      onEnd: () => {
        if (!conv || conv.stopped) return;
        // Only now is it safe to open the microphone again.
        setTimeout(convListen, 250);
      },
    });
    // No synth on this device: show the reply and carry on listening anyway.
    if (status !== 'ok') setTimeout(convListen, 1200);
  };

  try {
    recog.start();
  } catch {
    // Chrome throws if start() lands while the previous session is still
    // winding down. One retry is enough; more would spin.
    setTimeout(() => { try { recog.start(); } catch { convStop(); } }, 400);
  }
}

function openConversation() {
  if (conv) return;
  if (!window.isSecureContext) { statusEl.textContent = t('ask.mic_https'); return; }
  if (!SR) { statusEl.textContent = t('ask.mic_unsupported'); return; }
  stopVoice();

  const overlay = el('div', 'conv-overlay');
  overlay.dataset.state = 'listening';
  const orb = el('div', 'conv-orb');
  orb.appendChild(el('span', 'conv-orb-ring'));
  orb.appendChild(el('span', 'conv-orb-core'));
  const transcript = el('div', 'conv-transcript');
  const caption = el('div', 'conv-caption', t('voice.conv.listening'));
  const hint = el('div', 'conv-hint', t('voice.conv.hint'));
  const end = el('button', 'conv-end', t('voice.conv.end'));
  end.type = 'button';
  end.addEventListener('click', convStop);
  overlay.append(orb, transcript, caption, hint, end);

  // Tapping the orb while it talks cuts it off and listens — the way you
  // interrupt a person, and the only way to correct a misheard question
  // without waiting out the whole answer.
  orb.addEventListener('click', () => {
    if (!conv) return;
    if (conv.state === 'speaking') { stopSpeaking(); setTimeout(convListen, 120); return; }
    // Idle is where it lands after hearing nothing twice, and the caption
    // there says to tap — so tapping has to actually start it again.
    if (conv.state === 'idle') { conv.errors = 0; convListen(); }
  });

  document.body.appendChild(overlay);
  conv = { overlay, orb, caption, transcript, recog: null, state: 'listening', quiet: 0, errors: 0, stopped: false };
  convListen();
}

// spoken: the question arrived by voice, so the answer is read back without
// being asked — a voice exchange that only replies in text is half a feature.
async function ask(question, { spoken = false } = {}) {
  const base = getContext();
  if (!base?.metrics) return null;

  logEl.appendChild(el('div', 'ask-msg user', question));
  const pending = el('div', 'ask-msg bot ask-pending', t('ask.thinking'));
  logEl.appendChild(pending);
  scrollLog();

  const list = await loadDestinations();
  const asked = await resolveAskedCity(question, base.city);
  const ctx = asked.metrics
    ? { ...base, city: asked.city, metrics: asked.metrics }
    : base;

  const built = buildAnswer(ctx, question, list);
  if (built.needsAlts) {
    const alts = await findAlternatives({ lat: ctx.city.lat, lon: ctx.city.lon }, built.activity, list);
    renderAlternatives(built.slot, alts, built);
  }
  const { card } = built;

  // Say which city this is about when it is not the one on screen, so a
  // number for another city can never be mistaken for the local one.
  if (asked.switched) {
    card.insertBefore(el('div', 'ask-city-note', t('ask.city.switched', { place: asked.city.name })), card.firstChild);
  } else if (asked.missed) {
    card.insertBefore(
      el('div', 'ask-city-note', t('ask.city.notfound', { name: asked.missed, place: base.city.name })),
      card.firstChild);
  }

  addSpeaker(card);
  pending.replaceWith(card);
  scrollLog();
  if (spoken && voiceSupported()) speakCard(card);
  return card;
}

// What a hands-free reply says out loud. Deliberately not the whole card:
// read end to end it runs past twenty seconds, and someone who asked because
// they cannot type is not going to sit through four sections. The verdict,
// the one number that drives it, and any severe alert — then stop.
function shortSpeech(card) {
  const parts = [];
  const grab = (sel) => {
    const n = card.querySelector(sel);
    const s2 = (n?.textContent || '').trim().replace(/[.\u0964]+$/, '');
    if (s2) parts.push(s2);
  };
  grab('.ask-city-note');
  grab('.ask-ans');
  const alert = card.querySelector('.ask-alert .ask-v');
  if (alert) parts.push(alert.textContent.trim().replace(/[.\u0964]+$/, ''));
  else grab('.ask-row .ask-v');
  return parts.join('. ') + '.';
}

// Reads the card back. The section labels ("WEATHER", "RISK") are visual
// scaffolding — spoken aloud they sound like an error message, so only the
// sentences are read.
function cardSpeech(card) {
  const parts = [];
  card.querySelectorAll('.ask-city-note, .ask-ans, .ask-v, .ask-lvl, .ask-alt-name, .ask-alt-meta')
    .forEach((n) => {
      const s = (n.textContent || '').trim().replace(/[.\u0964]+$/, '');
      if (s) parts.push(s);
    });
  // Sentences already end in a full stop (or a Devanagari danda), so strip it
  // before joining — otherwise the synth reads a stumbling double pause.
  return parts.join('. ') + '.';
}

function setSpeakerState(btn, on) {
  btn.classList.toggle('on', on);
  btn.innerHTML = speakerIcon(on);
  btn.setAttribute('aria-label', t(on ? 'voice.stop' : 'voice.speak'));
}

function speakCard(card) {
  const btn = card.querySelector('.ask-speak');
  const status = speak(cardSpeech(card), { onEnd: () => btn && setSpeakerState(btn, false) });
  if (status === 'unsupported') {
    statusEl.textContent = t('voice.unsupported');
    return;
  }
  if (btn) setSpeakerState(btn, true);
  if (status === 'no_voice') statusEl.textContent = t('voice.no_voice');
}

// Every answer gets its own speaker, so an older reply can be replayed
// without asking again.
function addSpeaker(card) {
  if (!voiceSupported()) return;
  const btn = el('button', 'ask-speak');
  btn.type = 'button';
  btn.innerHTML = speakerIcon(false);
  btn.setAttribute('aria-label', t('voice.speak'));
  btn.addEventListener('click', () => {
    if (btn.classList.contains('on') && isSpeaking()) {
      stopSpeaking();
      setSpeakerState(btn, false);
      return;
    }
    // Any other card mid-sentence goes quiet first.
    logEl.querySelectorAll('.ask-speak').forEach((b) => setSpeakerState(b, false));
    speakCard(card);
  });
  card.appendChild(btn);
}

function greet() {
  const ctx = getContext();
  const card = el('div', 'ask-msg bot');
  card.appendChild(el('div', 'ask-ans', t('ask.greet', { place: ctx?.city?.name || '' })));
  if (ctx?.metrics) {
    const insight = proactiveInsight(ctx.metrics, ctx.persona);
    if (insight) card.appendChild(el('div', `ask-proactive${insight.urgent ? ' urgent' : ''}`, insight.text));
  }
  logEl.appendChild(card);
  greeted = true;
}

function buildPanel() {
  panel = el('div', 'ask-overlay');
  panel.hidden = true;

  const p = el('div', 'ask-panel');

  const head = el('div', 'ask-head');
  const titles = el('div');
  titles.appendChild(el('div', 'ask-title', t('ask.title')));
  titles.appendChild(el('div', 'ask-sub', t('ask.subtitle')));
  const close = el('button', 'ask-close', '×');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeAsk);
  head.append(titles, close);

  logEl = el('div', 'ask-log');

  let talk = null;
  if (VOICE_OFFERED) {
    talk = el('button', 'ask-talk');
    talk.type = 'button';
    talk.innerHTML = `${micIcon()}<span>${t('voice.conv.open')}</span>`;
    talk.addEventListener('click', openConversation);
  }

  const chips = el('div', 'ask-chips');
  for (const key of ['ask.chip.safe', 'ask.chip.when', 'ask.chip.where']) {
    const c = el('button', 'ask-chip', t(key));
    c.onclick = () => ask(t(key)); // onclick, not addEventListener: relabelPanel() reassigns it
    chips.appendChild(c);
  }

  const form = el('form', 'ask-form');
  inputEl = el('input', 'ask-input');
  inputEl.placeholder = t('ask.placeholder');
  inputEl.autocomplete = 'off';
  const send = el('button', 'ask-send', t('ask.send'));
  send.type = 'submit';

  if (VOICE_OFFERED) {
    const mic = el('button', 'ask-mic');
    mic.type = 'button';
    mic.innerHTML = micIcon();
    mic.setAttribute('aria-label', t('ask.mic'));
    mic.addEventListener('click', () => startVoice(mic));
    form.append(inputEl, mic, send);
  } else {
    form.append(inputEl, send);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    stopVoice();
    const v = inputEl.value.trim();
    if (!v) return;
    inputEl.value = '';
    ask(v);
  });

  statusEl = el('div', 'ask-mic-status');

  p.append(head, logEl, ...(talk ? [talk] : []), chips, form, statusEl, el('div', 'ask-disclaimer', t('ask.disclaimer')));
  builtLocale = getLocale();
  panel.appendChild(p);
  panel.addEventListener('click', (e) => { if (e.target === panel) closeAsk(); });
  document.body.appendChild(panel);
}

// The panel's own labels are written once at build time, but the language
// picker can change afterwards — leaving a Hindi header above English
// answers. Rewrite them on open rather than rebuilding, so the conversation
// so far survives the switch.
function relabelPanel() {
  if (!panel || builtLocale === getLocale()) return;
  panel.querySelector('.ask-title').textContent = t('ask.title');
  panel.querySelector('.ask-sub').textContent = t('ask.subtitle');
  panel.querySelector('.ask-disclaimer').textContent = t('ask.disclaimer');
  panel.querySelector('.ask-send').textContent = t('ask.send');
  inputEl.placeholder = t('ask.placeholder');
  const chipKeys = ['ask.chip.safe', 'ask.chip.when', 'ask.chip.where'];
  panel.querySelectorAll('.ask-chip').forEach((c, i) => {
    c.textContent = t(chipKeys[i]);
    c.onclick = () => ask(t(chipKeys[i]));
  });
  panel.querySelector('.ask-mic')?.setAttribute('aria-label', t('ask.mic'));
  panel.querySelectorAll('.ask-speak').forEach((b) => {
    b.setAttribute('aria-label', t(b.classList.contains('on') ? 'voice.stop' : 'voice.speak'));
  });
  builtLocale = getLocale();
}

export function openAsk() {
  if (!panel) buildPanel();
  relabelPanel();
  panel.hidden = false;
  if (!greeted) greet();
  scrollLog();
  inputEl.focus();
}

export function closeAsk() {
  // A conversation left running behind a closed panel would keep the
  // microphone open and answer into an empty room.
  convStop();
  convStop();
  stopVoice(); // never leave the mic live behind a dismissed panel
  stopSpeaking(); // and never keep talking to a closed panel
  if (panel) panel.hidden = true;
}

export function mountAsk(provider) {
  getContext = provider;
  warmVoices();
  if (fab) return;
  fab = el('button', 'ask-fab');
  fab.setAttribute('aria-label', t('ask.title'));
  fab.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">' +
    '<path d="M20.2 11.6c0 4.2-3.7 7.6-8.2 7.6-.95 0-1.85-.15-2.7-.42L4.2 20.4l1.75-4.15A7.2 7.2 0 0 1 4.6 11.6C4.6 7.4 8.3 4 12.8 4s7.4 3.4 7.4 7.6z"/>' +
    '<path d="M12.4 7.9l.95 2.35 2.35.95-2.35.95-.95 2.35-.95-2.35-2.35-.95 2.35-.95z" fill="currentColor" stroke="none"/>' +
    '</svg><span class="ask-fab-dot" hidden></span>';
  fab.addEventListener('click', openAsk);
  document.body.appendChild(fab);
}

// A dot on the button when there is something worth opening it for.
export function updateAskBadge() {
  if (!fab || !getContext) return;
  const ctx = getContext();
  const dot = fab.querySelector('.ask-fab-dot');
  const insight = ctx?.metrics ? proactiveInsight(ctx.metrics, ctx.persona) : null;
  dot.hidden = !(insight && insight.urgent);
}
