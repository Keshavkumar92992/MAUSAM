// Chat surface for the assistant.
//
// It owns its own DOM under <body> rather than living inside home.js's
// render() output: that function replaces root.innerHTML wholesale on every
// persona tap and every background refresh, which would wipe the
// conversation and drop keyboard focus mid-sentence.
import { t, getLocale, registerEntries } from './i18n.js';
import { weatherCodeToCondition } from './weatherApi.js';
import {
  parseIntent, analyse, bestWindow, findAlternatives,
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

  card.appendChild(row(t('ask.sec.weather'), el('span', 'ask-v', tmr
    ? t('ask.weather.tomorrow', { place: city.name, rain: peaks.rain, gust: peaks.gust, max: peaks.feels })
    : t('ask.weather.now', {
      cond: t(metrics.conditionKey),
      temp: metrics.tempNow,
      feels: metrics.feelsLikeNow,
      rain: peaks.rain,
      gust: peaks.gust,
      max: peaks.feels,
    }))));

  card.appendChild(row(t('ask.sec.risk'), levelChip(level)));

  const recNode = el('span', 'ask-v');
  if (intent === 'alternatives') {
    // Someone asking "where else" may be blocked by something the forecast
    // cannot see — a landslide, a closed road. Take them at their word and
    // list options, while still being honest that this place reads fine.
    recNode.textContent = level === 'avoid'
      ? t('ask.rec.alts')
      : t('ask.rec.alts_anyway', { place: city.name });
  } else if (level === 'avoid') {
    recNode.textContent = t('ask.rec.alts');
  } else if (intent === 'best_time' && win) {
    // The headline already named the window — repeating it here wastes the
    // row, so spend it on what to do about the hours outside that window.
    recNode.textContent = t(level === 'good' ? 'ask.rec.time_clear' : 'ask.rec.time_caveat', { act });
  } else {
    recNode.textContent = win
      ? t(level === 'good' ? 'ask.rec.window' : 'ask.rec.window_short', { win: windowLabel(win) })
      : t('ask.rec.no_window');
  }
  card.appendChild(row(t('ask.sec.rec'), recNode));
  // Alternatives are fetched after the card is built, so reserve their slot
  // here — otherwise they append after WHY and read as a stray afterthought.
  const slot = el('div', 'ask-alts-slot');
  card.appendChild(slot);

  const why = hazards.length
    ? t('ask.why.hazards', { list: hazards.slice(0, 3).map(hazardText).join(', ') })
    : t('ask.why.clear', { act });
  card.appendChild(row(t('ask.sec.why'), el('span', 'ask-v', why)));

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
    needsAlts: intent === 'alternatives' || level === 'avoid',
    activity,
    win,
    level,
    place: city.name,
  };
}

function renderAlternatives(slot, alts, { win, level, place }) {
  if (!alts.length) {
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
    if (said) { inputEl.value = ''; ask(said); }
  };

  try {
    recog.start();
  } catch {
    statusEl.textContent = t('ask.mic_error');
  }
}

async function ask(question) {
  const ctx = getContext();
  if (!ctx?.metrics) return;

  logEl.appendChild(el('div', 'ask-msg user', question));
  const pending = el('div', 'ask-msg bot ask-pending', t('ask.thinking'));
  logEl.appendChild(pending);
  scrollLog();

  const list = await loadDestinations();
  const built = buildAnswer(ctx, question, list);
  if (built.needsAlts) {
    const alts = await findAlternatives({ lat: ctx.city.lat, lon: ctx.city.lon }, built.activity, list);
    renderAlternatives(built.slot, alts, built);
  }
  const { card } = built;
  pending.replaceWith(card);
  scrollLog();
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

  const chips = el('div', 'ask-chips');
  for (const key of ['ask.chip.safe', 'ask.chip.when', 'ask.chip.where']) {
    const c = el('button', 'ask-chip', t(key));
    c.addEventListener('click', () => ask(t(key)));
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

  p.append(head, logEl, chips, form, statusEl, el('div', 'ask-disclaimer', t('ask.disclaimer')));
  panel.appendChild(p);
  panel.addEventListener('click', (e) => { if (e.target === panel) closeAsk(); });
  document.body.appendChild(panel);
}

export function openAsk() {
  if (!panel) buildPanel();
  panel.hidden = false;
  if (!greeted) greet();
  scrollLog();
  inputEl.focus();
}

export function closeAsk() {
  stopVoice(); // never leave the mic live behind a dismissed panel
  if (panel) panel.hidden = true;
}

export function mountAsk(provider) {
  getContext = provider;
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
