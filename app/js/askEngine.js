// Decision engine behind the assistant.
//
// This is deliberately rules-based, not an LLM. A static site has nowhere
// to hide an API key, so shipping one would mean publishing it. Everything
// here runs on the same live Open-Meteo data the rest of the app already
// fetched, against per-activity thresholds — which also means every answer
// is explainable and reproducible rather than a black box. If a server-side
// proxy ever exists, replace parseIntent() and phrase() and keep the rest.
import { fetchMultiDaily } from './weatherApi.js';
import { t, registerEntries } from './i18n.js';

// The point at which each hazard starts to matter for each activity.
// rain = % probability, gust = km/h, hot/cold = °C, vis = km, aqi = CPCB index.
const ACTIVITY = {
  trek:     { rain: 55, gust: 40, hot: 34, cold: 2,  uv: 8,  vis: 3,   aqi: 150, daylight: true },
  fitness:  { rain: 45, gust: 35, hot: 32, cold: 4,  uv: 7,  vis: 1.5, aqi: 100, daylight: true },
  beach:    { rain: 55, gust: 45, hot: 36, cold: 12, uv: 9,  vis: 2,   aqi: 200, daylight: true },
  travel:   { rain: 65, gust: 50, hot: 38, cold: 0,  uv: 10, vis: 1,   aqi: 200, daylight: false },
  family:   { rain: 45, gust: 40, hot: 34, cold: 8,  uv: 8,  vis: 2,   aqi: 150, daylight: true },
  agri:     { rain: 70, gust: 45, hot: 38, cold: 4,  uv: 11, vis: 0.5, aqi: 300, daylight: true },
  commute:  { rain: 60, gust: 50, hot: 40, cold: 2,  uv: 12, vis: 1,   aqi: 200, daylight: false },
  health:   { rain: 50, gust: 40, hot: 33, cold: 8,  uv: 7,  vis: 2,   aqi: 100, daylight: true },
  wildlife: { rain: 55, gust: 45, hot: 36, cold: 6,  uv: 9,  vis: 2,   aqi: 200, daylight: true },
  heritage: { rain: 55, gust: 50, hot: 37, cold: 4,  uv: 9,  vis: 1,   aqi: 200, daylight: true },
};

const PERSONA_ACTIVITY = {
  health: 'health', fitness: 'fitness', beach: 'beach', travel: 'travel',
  family: 'family', agri: 'agri', commute: 'commute',
};

// Terrain where sustained rain makes slopes the real hazard rather than
// the rain itself. Used only to raise a caution, never to declare a slope safe.
const SLOPE_KINDS = ['hill', 'valley', 'highland'];

registerEntries({
  'ask.title': { en: 'Mausam Assistant', hi: 'मौसम सहायक', bn: 'মৌসম সহায়ক', ta: 'மௌசம் உதவியாளர்' },
  'ask.subtitle': { en: 'Ask what to do, not just what the weather is', hi: 'पूछिए क्या करना चाहिए, सिर्फ़ मौसम नहीं', bn: 'কী করবেন জিজ্ঞেস করুন, শুধু আবহাওয়া নয়', ta: 'வானிலை மட்டுமல்ல, என்ன செய்வது எனக் கேளுங்கள்' },
  'ask.placeholder': { en: 'Ask about your plan…', hi: 'अपनी योजना के बारे में पूछें…', bn: 'আপনার পরিকল্পনা নিয়ে জিজ্ঞেস করুন…', ta: 'உங்கள் திட்டம் பற்றிக் கேளுங்கள்…' },
  'ask.send': { en: 'Ask', hi: 'पूछें', bn: 'জিজ্ঞেস', ta: 'கேள்' },
  'ask.thinking': { en: 'Checking the forecast…', hi: 'पूर्वानुमान देख रहे हैं…', bn: 'পূর্বাভাস দেখছি…', ta: 'முன்னறிவிப்பைப் பார்க்கிறேன்…' },
  'ask.disclaimer': { en: 'Derived from Open-Meteo forecast data against activity thresholds — not an IMD advisory.', hi: 'ओपन-मीटियो पूर्वानुमान और गतिविधि सीमाओं से निकाला गया — यह IMD की सलाह नहीं है।', bn: 'ওপেন-মিটিও পূর্বাভাস ও কার্যকলাপের সীমা থেকে নেওয়া — এটি IMD-র পরামর্শ নয়।', ta: 'ஓபன்-மீட்டியோ முன்னறிவிப்பையும் செயல்பாட்டு வரம்புகளையும் கொண்டு பெறப்பட்டது — இது IMD அறிவுறுத்தல் அல்ல.' },

  'ask.sec.answer': { en: 'ANSWER', hi: 'उत्तर', bn: 'উত্তর', ta: 'பதில்' },
  'ask.sec.weather': { en: 'WEATHER', hi: 'मौसम', bn: 'আবহাওয়া', ta: 'வானிலை' },
  'ask.sec.risk': { en: 'RISK', hi: 'जोखिम', bn: 'ঝুঁকি', ta: 'ஆபத்து' },
  'ask.sec.rec': { en: 'RECOMMENDATION', hi: 'सुझाव', bn: 'সুপারিশ', ta: 'பரிந்துரை' },
  'ask.sec.why': { en: 'WHY', hi: 'क्यों', bn: 'কেন', ta: 'ஏன்' },
  'ask.sec.alert': { en: 'ALERT', hi: 'चेतावनी', bn: 'সতর্কতা', ta: 'எச்சரிக்கை' },

  'ask.level.good': { en: 'Suitable', hi: 'उपयुक्त', bn: 'উপযুক্ত', ta: 'ஏற்றது' },
  'ask.level.caution': { en: 'Caution', hi: 'सावधानी', bn: 'সতর্কতা', ta: 'எச்சரிக்கை' },
  'ask.level.avoid': { en: 'Avoid', hi: 'टालें', bn: 'এড়িয়ে চলুন', ta: 'தவிர்க்கவும்' },

  'ask.hz.storm': { en: 'thunderstorms in the forecast', hi: 'पूर्वानुमान में गरज-चमक के साथ तूफ़ान', bn: 'পূর্বাভাসে বজ্রঝড়', ta: 'முன்னறிவிப்பில் இடியுடன் கூடிய புயல்' },
  'ask.hz.rain': { en: '{{v}}% chance of rain', hi: 'बारिश की {{v}}% संभावना', bn: 'বৃষ্টির {{v}}% সম্ভাবনা', ta: 'மழைக்கு {{v}}% வாய்ப்பு' },
  'ask.hz.wind': { en: 'gusts reaching {{v}} km/h', hi: '{{v}} किमी/घंटा तक के झोंके', bn: 'ঘণ্টায় {{v}} কিমি পর্যন্ত দমকা হাওয়া', ta: 'மணிக்கு {{v}} கி.மீ. வரை பலத்த காற்று' },
  'ask.hz.heat': { en: 'feels like {{v}}°C', hi: '{{v}}°C जैसा महसूस', bn: '{{v}}°C-এর মতো অনুভূত', ta: '{{v}}°C போல் உணரப்படும்' },
  'ask.hz.cold': { en: 'dropping to {{v}}°C', hi: '{{v}}°C तक गिरता तापमान', bn: '{{v}}°C পর্যন্ত নামছে', ta: '{{v}}°C வரை குறையும்' },
  'ask.hz.uv': { en: 'UV index {{v}}', hi: 'यूवी सूचकांक {{v}}', bn: 'ইউভি সূচক {{v}}', ta: 'புற ஊதா குறியீடு {{v}}' },
  'ask.hz.vis': { en: 'visibility down to {{v}} km', hi: 'दृश्यता {{v}} किमी तक', bn: 'দৃশ্যমানতা {{v}} কিমি পর্যন্ত', ta: 'தெரிவுநிலை {{v}} கி.மீ. வரை' },
  'ask.hz.aqi': { en: 'air quality index {{v}}', hi: 'वायु गुणवत्ता सूचकांक {{v}}', bn: 'বায়ুর মান সূচক {{v}}', ta: 'காற்றுத் தர குறியீடு {{v}}' },
  'ask.hz.landslide': { en: 'sustained rain on slopes, which raises landslide risk', hi: 'ढलानों पर लगातार बारिश, जिससे भूस्खलन का ख़तरा बढ़ता है', bn: 'ঢালে টানা বৃষ্টি, যা ভূমিধসের ঝুঁকি বাড়ায়', ta: 'சரிவுகளில் தொடர் மழை, இது நிலச்சரிவு அபாயத்தை அதிகரிக்கிறது' },

  'ask.act.trek': { en: 'trekking', hi: 'ट्रेकिंग', bn: 'ট্রেকিং', ta: 'மலையேற்றம்' },
  'ask.act.fitness': { en: 'a run or workout', hi: 'दौड़ या कसरत', bn: 'দৌড় বা ব্যায়াম', ta: 'ஓட்டம் அல்லது உடற்பயிற்சி' },
  'ask.act.beach': { en: 'a beach visit', hi: 'समुद्र तट की सैर', bn: 'সৈকত ভ্রমণ', ta: 'கடற்கரைப் பயணம்' },
  'ask.act.travel': { en: 'travelling', hi: 'यात्रा', bn: 'ভ্রমণ', ta: 'பயணம்' },
  'ask.act.family': { en: 'a family outing', hi: 'परिवार के साथ बाहर जाना', bn: 'পরিবারের সঙ্গে বেড়ানো', ta: 'குடும்பத்துடன் வெளியே செல்வது' },
  'ask.act.agri': { en: 'field work', hi: 'खेत का काम', bn: 'মাঠের কাজ', ta: 'வயல் வேலை' },
  'ask.act.commute': { en: 'your commute', hi: 'आपकी आवाजाही', bn: 'আপনার যাতায়াত', ta: 'உங்கள் பயணம்' },
  'ask.act.health': { en: 'time outdoors', hi: 'बाहर बिताया समय', bn: 'বাইরে সময় কাটানো', ta: 'வெளியில் நேரம் செலவிடுவது' },
  'ask.act.wildlife': { en: 'a wildlife trip', hi: 'वन्यजीव यात्रा', bn: 'বন্যপ্রাণী ভ্রমণ', ta: 'வனவிலங்குப் பயணம்' },
  'ask.act.heritage': { en: 'sightseeing', hi: 'दर्शनीय स्थल देखना', bn: 'দর্শনীয় স্থান দেখা', ta: 'சுற்றுலாத் தலங்களைப் பார்ப்பது' },

  'ask.ans.good': { en: 'Yes — {{place}} looks suitable for {{act}} right now.', hi: 'हाँ — {{place}} अभी {{act}} के लिए ठीक लग रहा है।', bn: 'হ্যাঁ — {{place}} এখন {{act}}-এর জন্য উপযুক্ত মনে হচ্ছে।', ta: 'ஆம் — {{place}} இப்போது {{act}}-க்கு ஏற்றதாகத் தெரிகிறது.' },
  'ask.ans.caution': { en: 'Possible, but not ideal — {{place}} has conditions worth planning around for {{act}}.', hi: 'हो सकता है, पर आदर्श नहीं — {{place}} में {{act}} के लिए कुछ बातें ध्यान रखनी होंगी।', bn: 'সম্ভব, তবে আদর্শ নয় — {{place}}-এ {{act}}-এর জন্য কিছু বিষয় মাথায় রাখতে হবে।', ta: 'சாத்தியம், ஆனால் ஏற்றதல்ல — {{place}}-இல் {{act}}-க்கு சில நிலைமைகளைக் கருத்தில் கொள்ள வேண்டும்.' },
  'ask.ans.avoid': { en: 'I would hold off — {{place}} is not suitable for {{act}} in the next few hours.', hi: 'मैं रुकने की सलाह दूँगा — अगले कुछ घंटों में {{place}} {{act}} के लिए उपयुक्त नहीं है।', bn: 'আমি অপেক্ষা করতে বলব — আগামী কয়েক ঘণ্টায় {{place}} {{act}}-এর জন্য উপযুক্ত নয়।', ta: 'நான் தள்ளிப்போடச் சொல்வேன் — அடுத்த சில மணி நேரங்களில் {{place}} {{act}}-க்கு ஏற்றதல்ல.' },

  'ask.ans.good_tmr': { en: 'Yes — {{place}} looks suitable for {{act}} tomorrow.', hi: 'हाँ — कल {{place}} {{act}} के लिए ठीक लग रहा है।', bn: 'হ্যাঁ — আগামীকাল {{place}} {{act}}-এর জন্য উপযুক্ত মনে হচ্ছে।', ta: 'ஆம் — நாளை {{place}} {{act}}-க்கு ஏற்றதாகத் தெரிகிறது.' },
  'ask.ans.caution_tmr': { en: 'Possible tomorrow, but {{place}} has conditions worth planning around for {{act}}.', hi: 'कल हो सकता है, पर {{place}} में {{act}} के लिए कुछ बातें ध्यान रखनी होंगी।', bn: 'আগামীকাল সম্ভব, তবে {{place}}-এ {{act}}-এর জন্য কিছু বিষয় মাথায় রাখতে হবে।', ta: 'நாளை சாத்தியம், ஆனால் {{place}}-இல் {{act}}-க்கு சில நிலைமைகளைக் கருத்தில் கொள்ள வேண்டும்.' },
  'ask.ans.avoid_tmr': { en: 'Tomorrow does not look good — {{place}} is not suitable for {{act}}.', hi: 'कल ठीक नहीं लग रहा — {{place}} {{act}} के लिए उपयुक्त नहीं है।', bn: 'আগামীকাল ভালো মনে হচ্ছে না — {{place}} {{act}}-এর জন্য উপযুক্ত নয়।', ta: 'நாளை சரியாகத் தெரியவில்லை — {{place}} {{act}}-க்கு ஏற்றதல்ல.' },
  'ask.ans.forecast_tmr': { en: 'Tomorrow in {{place}}: {{cond}}, high around {{max}}°C.', hi: 'कल {{place}} में: {{cond}}, अधिकतम लगभग {{max}}°C।', bn: 'আগামীকাল {{place}}-এ: {{cond}}, সর্বোচ্চ প্রায় {{max}}°C।', ta: 'நாளை {{place}}-இல்: {{cond}}, அதிகபட்சம் சுமார் {{max}}°C.' },
  'ask.weather.tomorrow': { en: 'Tomorrow in {{place}}: rain peaks at {{rain}}%, gusts to {{gust}} km/h, feels-like high {{max}}°C.', hi: 'कल {{place}} में: बारिश की अधिकतम संभावना {{rain}}%, झोंके {{gust}} किमी/घंटा तक, अधिकतम महसूस {{max}}°C।', bn: 'আগামীকাল {{place}}-এ: বৃষ্টির সর্বোচ্চ সম্ভাবনা {{rain}}%, দমকা হাওয়া {{gust}} কিমি/ঘণ্টা, সর্বোচ্চ অনুভূত {{max}}°C।', ta: 'நாளை {{place}}-இல்: மழை வாய்ப்பு உச்சம் {{rain}}%, காற்று {{gust}} கி.மீ/மணி வரை, அதிகபட்ச உணர்வு {{max}}°C.' },
  'ask.guess_hint': { en: 'I matched this to your current persona. Name the activity — trek, run, beach, field work, commute — for a sharper answer.', hi: 'मैंने इसे आपकी मौजूदा पर्सोना से जोड़ा है। बेहतर जवाब के लिए गतिविधि का नाम लें — ट्रेक, दौड़, समुद्र तट, खेत का काम, आवाजाही।', bn: 'আমি এটি আপনার বর্তমান পার্সোনার সঙ্গে মিলিয়েছি। আরও নির্দিষ্ট উত্তরের জন্য কাজের নাম বলুন — ট্রেক, দৌড়, সৈকত, মাঠের কাজ, যাতায়াত।', ta: 'இதை உங்கள் தற்போதைய பர்சோனாவுடன் பொருத்தினேன். துல்லியமான பதிலுக்கு செயலைக் குறிப்பிடுங்கள் — மலையேற்றம், ஓட்டம், கடற்கரை, வயல் வேலை, பயணம்.' },

  'ask.ans.gear_yes': { en: 'Yes — carry an umbrella. Rain reaches {{rain}}% in {{place}} over the next 12 hours.', hi: 'हाँ — छाता ले जाइए। अगले 12 घंटों में {{place}} में बारिश की संभावना {{rain}}% तक है।', bn: 'হ্যাঁ — ছাতা নিন। আগামী ১২ ঘণ্টায় {{place}}-এ বৃষ্টির সম্ভাবনা {{rain}}% পর্যন্ত।', ta: 'ஆம் — குடை எடுத்துச் செல்லுங்கள். அடுத்த 12 மணி நேரத்தில் {{place}}-இல் மழை வாய்ப்பு {{rain}}% வரை.' },
  'ask.ans.gear_maybe': { en: 'Probably not needed, but rain touches {{rain}}% in {{place}} — a light one would not hurt.', hi: 'शायद ज़रूरत न पड़े, पर {{place}} में बारिश की संभावना {{rain}}% तक जाती है — हल्का छाता रख लें तो बेहतर।', bn: 'সম্ভবত দরকার হবে না, তবে {{place}}-এ বৃষ্টির সম্ভাবনা {{rain}}% ছোঁয় — হালকা একটা রাখলে ক্ষতি নেই।', ta: 'தேவைப்படாமல் இருக்கலாம், ஆனால் {{place}}-இல் மழை வாய்ப்பு {{rain}}% வரை செல்கிறது — இலகுவான ஒன்றை வைத்திருப்பது நல்லது.' },
  'ask.ans.gear_no': { en: 'No umbrella needed — rain stays at {{rain}}% in {{place}} for the next 12 hours.', hi: 'छाते की ज़रूरत नहीं — अगले 12 घंटों में {{place}} में बारिश की संभावना सिर्फ़ {{rain}}% है।', bn: 'ছাতার দরকার নেই — আগামী ১২ ঘণ্টায় {{place}}-এ বৃষ্টির সম্ভাবনা মাত্র {{rain}}%।', ta: 'குடை தேவையில்லை — அடுத்த 12 மணி நேரத்தில் {{place}}-இல் மழை வாய்ப்பு {{rain}}% மட்டுமே.' },
  'ask.gear.sun': { en: 'Sunscreen is the thing to carry — UV peaks at {{uv}}.', hi: 'सनस्क्रीन ज़रूर रखें — यूवी {{uv}} तक पहुँचता है।', bn: 'সানস্ক্রিন সঙ্গে রাখুন — ইউভি {{uv}} পর্যন্ত ওঠে।', ta: 'சன்ஸ்கிரீன் எடுத்துச் செல்லுங்கள் — புற ஊதா {{uv}} வரை உயர்கிறது.' },
  'ask.city.switched': { en: 'Showing {{place}}, from your question.', hi: 'आपके सवाल के अनुसार {{place}} दिखाया जा रहा है।', bn: 'আপনার প্রশ্ন অনুযায়ী {{place}} দেখানো হচ্ছে।', ta: 'உங்கள் கேள்விப்படி {{place}} காட்டப்படுகிறது.' },
  'ask.city.notfound': { en: 'Could not find "{{name}}" — answering for {{place}} instead.', hi: '"{{name}}" नहीं मिला — इसके बजाय {{place}} का जवाब दे रहे हैं।', bn: '"{{name}}" পাওয়া গেল না — বদলে {{place}}-এর উত্তর দিচ্ছি।', ta: '"{{name}}" கிடைக்கவில்லை — அதற்குப் பதிலாக {{place}}-க்குப் பதில் அளிக்கிறேன்.' },

  'ask.ans.time': { en: 'The best stretch for {{act}} in {{place}} is {{win}}.', hi: '{{place}} में {{act}} के लिए सबसे अच्छा समय {{win}} है।', bn: '{{place}}-এ {{act}}-এর জন্য সেরা সময় {{win}}।', ta: '{{place}}-இல் {{act}}-க்கு சிறந்த நேரம் {{win}}.' },
  'ask.ans.time_none': { en: 'No clear window opens for {{act}} in {{place}} over the next two days.', hi: 'अगले दो दिनों में {{place}} में {{act}} के लिए कोई साफ़ मौक़ा नहीं है।', bn: 'আগামী দু\'দিনে {{place}}-এ {{act}}-এর জন্য পরিষ্কার কোনও সুযোগ নেই।', ta: 'அடுத்த இரண்டு நாட்களில் {{place}}-இல் {{act}}-க்கு தெளிவான வாய்ப்பு இல்லை.' },
  'ask.ans.forecast': { en: '{{place}} right now: {{cond}}, {{temp}}°C, feels {{feels}}°C.', hi: '{{place}} अभी: {{cond}}, {{temp}}°C, महसूस {{feels}}°C।', bn: '{{place}} এখন: {{cond}}, {{temp}}°C, অনুভূত {{feels}}°C।', ta: '{{place}} இப்போது: {{cond}}, {{temp}}°C, உணர்வு {{feels}}°C.' },

  'ask.weather.now': { en: '{{cond}}, {{temp}}°C (feels {{feels}}°C). Next 12 h: rain peaks at {{rain}}%, gusts to {{gust}} km/h, feels-like high {{max}}°C.', hi: '{{cond}}, {{temp}}°C (महसूस {{feels}}°C)। अगले 12 घंटे: बारिश की अधिकतम संभावना {{rain}}%, झोंके {{gust}} किमी/घंटा तक, अधिकतम महसूस {{max}}°C।', bn: '{{cond}}, {{temp}}°C (অনুভূত {{feels}}°C)। পরের ১২ ঘণ্টা: বৃষ্টির সর্বোচ্চ সম্ভাবনা {{rain}}%, দমকা হাওয়া {{gust}} কিমি/ঘণ্টা, সর্বোচ্চ অনুভূত {{max}}°C।', ta: '{{cond}}, {{temp}}°C (உணர்வு {{feels}}°C). அடுத்த 12 மணி: மழை வாய்ப்பு உச்சம் {{rain}}%, காற்று {{gust}} கி.மீ/மணி வரை, அதிகபட்ச உணர்வு {{max}}°C.' },

  'ask.rec.window': { en: 'Best stretch in the next two days: {{win}}.', hi: 'अगले दो दिनों में सबसे अच्छा समय: {{win}}।', bn: 'আগামী দু\'দিনে সেরা সময়: {{win}}।', ta: 'அடுத்த இரண்டு நாட்களில் சிறந்த நேரம்: {{win}}.' },
  'ask.rec.window_short': { en: 'If you go, aim for {{win}} and keep it short.', hi: 'अगर जाना ही है तो {{win}} का समय चुनें और कम समय रुकें।', bn: 'যদি যেতেই হয়, {{win}} সময়টা বেছে নিন এবং অল্প সময় থাকুন।', ta: 'செல்வதாக இருந்தால் {{win}} நேரத்தைத் தேர்வு செய்து, குறைந்த நேரம் இருங்கள்.' },
  'ask.rec.no_window': { en: 'No clear window opens up in the next two days at this location.', hi: 'इस जगह अगले दो दिनों में कोई साफ़ मौक़ा नहीं दिख रहा।', bn: 'এই জায়গায় আগামী দু\'দিনে পরিষ্কার কোনও সুযোগ দেখা যাচ্ছে না।', ta: 'இந்த இடத்தில் அடுத்த இரண்டு நாட்களில் தெளிவான வாய்ப்பு எதுவும் தெரியவில்லை.' },
  'ask.rec.alts': { en: 'Nearby places that look better:', hi: 'आस-पास की बेहतर जगहें:', bn: 'কাছাকাছি যেসব জায়গা ভালো মনে হচ্ছে:', ta: 'அருகில் சிறப்பாகத் தெரியும் இடங்கள்:' },
  'ask.rec.alts_anyway': { en: 'The forecast at {{place}} itself looks fine — but if you cannot go there, these are the nearest options:', hi: '{{place}} का पूर्वानुमान तो ठीक है — पर अगर वहाँ नहीं जा सकते तो सबसे नज़दीकी विकल्प ये हैं:', bn: '{{place}}-এর পূর্বাভাস নিজেই ঠিক আছে — তবে সেখানে যেতে না পারলে সবচেয়ে কাছের বিকল্পগুলি এই:', ta: '{{place}}-இன் முன்னறிவிப்பு நன்றாகவே உள்ளது — ஆனால் அங்கு செல்ல முடியாவிட்டால், அருகிலுள்ள தேர்வுகள் இவை:' },
  'ask.rec.alts_none_fine': { en: 'No nearby alternative has a better forecast than {{place}} itself right now.', hi: 'अभी {{place}} से बेहतर पूर्वानुमान आस-पास किसी जगह का नहीं है।', bn: 'এই মুহূর্তে {{place}}-এর চেয়ে ভালো পূর্বাভাস কাছাকাছি কোথাও নেই।', ta: 'இப்போது {{place}}-ஐ விட சிறந்த முன்னறிவிப்பு அருகில் எங்கும் இல்லை.' },
  'ask.rec.no_alts': { en: 'Nothing within reach looks clearly better over the next two days — postponing is the safer call.', hi: 'अगले दो दिनों में आस-पास कुछ भी साफ़ तौर पर बेहतर नहीं दिख रहा — टाल देना ही सुरक्षित है।', bn: 'আগামী দু\'দিনে নাগালের মধ্যে স্পষ্টভাবে ভালো কিছু দেখা যাচ্ছে না — পিছিয়ে দেওয়াই নিরাপদ।', ta: 'அடுத்த இரண்டு நாட்களில் அருகில் தெளிவாகச் சிறந்தது எதுவும் தெரியவில்லை — தள்ளிப்போடுவதே பாதுகாப்பானது.' },

  'ask.rec.time_clear': { en: 'Nothing to plan around — conditions stay inside the limits for {{act}}.', hi: 'कुछ ख़ास ध्यान रखने की ज़रूरत नहीं — {{act}} की सीमाओं के भीतर मौसम बना रहेगा।', bn: 'বিশেষ কিছু ভাবার নেই — {{act}}-এর সীমার মধ্যেই আবহাওয়া থাকবে।', ta: 'தனியாக எதையும் திட்டமிட வேண்டாம் — {{act}}-க்கான வரம்புகளுக்குள்ளேயே வானிலை இருக்கும்.' },
  'ask.rec.time_caveat': { en: 'Outside that window the limits for {{act}} are crossed, so keep it short.', hi: 'उस समय के बाहर {{act}} की सीमाएँ पार हो जाती हैं, इसलिए कम समय रुकें।', bn: 'ওই সময়ের বাইরে {{act}}-এর সীমা পেরিয়ে যায়, তাই অল্প সময় থাকুন।', ta: 'அந்த நேரத்திற்கு வெளியே {{act}}-க்கான வரம்புகள் தாண்டப்படுகின்றன, எனவே குறைந்த நேரமே இருங்கள்.' },

  'ask.why.hazards': { en: 'Driven by {{list}}.', hi: '{{list}} के कारण।', bn: '{{list}} — এর কারণে।', ta: '{{list}} காரணமாக.' },
  'ask.why.clear': { en: 'No threshold for {{act}} is crossed in this window.', hi: 'इस अवधि में {{act}} की कोई सीमा पार नहीं हो रही।', bn: 'এই সময়ে {{act}}-এর কোনও সীমা পার হচ্ছে না।', ta: 'இந்த நேரத்தில் {{act}}-க்கான எந்த வரம்பும் தாண்டப்படவில்லை.' },

  'ask.alt.line': { en: '{{km}} km away · {{temp}}°C · rain {{rain}}%', hi: '{{km}} किमी दूर · {{temp}}°C · बारिश {{rain}}%', bn: '{{km}} কিমি দূরে · {{temp}}°C · বৃষ্টি {{rain}}%', ta: '{{km}} கி.மீ. தொலைவில் · {{temp}}°C · மழை {{rain}}%' },

  'ask.win.range': { en: '{{day}} {{from}}–{{to}}', hi: '{{day}} {{from}}–{{to}}', bn: '{{day}} {{from}}–{{to}}', ta: '{{day}} {{from}}–{{to}}' },
  'ask.win.today': { en: 'today', hi: 'आज', bn: 'আজ', ta: 'இன்று' },
  'ask.win.tomorrow': { en: 'tomorrow', hi: 'कल', bn: 'আগামীকাল', ta: 'நாளை' },

  'ask.fallback': { en: 'I can help with plans that depend on the weather — trekking, travel, running, farm work, commuting or a day out. Try naming the activity, for example "is it safe to trek today" or "where else can I go instead".', hi: 'मैं मौसम पर निर्भर योजनाओं में मदद कर सकता हूँ — ट्रेकिंग, यात्रा, दौड़, खेती, आवाजाही या दिन भर की सैर। गतिविधि का नाम लेकर पूछें, जैसे "आज ट्रेकिंग सुरक्षित है क्या" या "इसकी जगह और कहाँ जा सकते हैं"।', bn: 'আবহাওয়ার উপর নির্ভরশীল পরিকল্পনায় আমি সাহায্য করতে পারি — ট্রেকিং, ভ্রমণ, দৌড়, চাষের কাজ, যাতায়াত বা দিনের বেড়ানো। কাজের নাম বলে জিজ্ঞেস করুন, যেমন "আজ ট্রেকিং কি নিরাপদ" বা "এর বদলে আর কোথায় যেতে পারি"।', ta: 'வானிலையைச் சார்ந்த திட்டங்களில் நான் உதவ முடியும் — மலையேற்றம், பயணம், ஓட்டம், வயல் வேலை, தினசரி பயணம் அல்லது ஒரு நாள் வெளியே. செயலின் பெயரைச் சொல்லிக் கேளுங்கள், எடுத்துக்காட்டாக "இன்று மலையேற்றம் பாதுகாப்பானதா" அல்லது "இதற்குப் பதிலாக வேறு எங்கே போகலாம்".' },

  'ask.greet': { en: 'Hello. I look at the live forecast for {{place}} and tell you whether your plan works — and what to do if it does not.', hi: 'नमस्ते। मैं {{place}} का ताज़ा पूर्वानुमान देखकर बताता हूँ कि आपकी योजना चलेगी या नहीं — और न चले तो क्या करें।', bn: 'নমস্কার। আমি {{place}}-এর সরাসরি পূর্বাভাস দেখে বলি আপনার পরিকল্পনা চলবে কি না — আর না চললে কী করবেন।', ta: 'வணக்கம். {{place}}-இன் நேரடி முன்னறிவிப்பைப் பார்த்து உங்கள் திட்டம் நடக்குமா என்பதைச் சொல்கிறேன் — நடக்கவில்லை என்றால் என்ன செய்வது என்பதையும்.' },

  'ask.chip.safe': { en: 'Is it safe today?', hi: 'आज सुरक्षित है?', bn: 'আজ কি নিরাপদ?', ta: 'இன்று பாதுகாப்பானதா?' },
  'ask.chip.when': { en: 'Best time to go?', hi: 'जाने का सही समय?', bn: 'যাওয়ার সেরা সময়?', ta: 'செல்ல சிறந்த நேரம்?' },
  'ask.chip.where': { en: 'Where else can I go?', hi: 'और कहाँ जा सकते हैं?', bn: 'আর কোথায় যেতে পারি?', ta: 'வேறு எங்கே போகலாம்?' },

  'ask.proactive.storm': { en: 'Thunderstorms expected at {{place}} — finish outdoor plans early.', hi: '{{place}} में तूफ़ान की आशंका — बाहर के काम जल्दी निपटा लें।', bn: '{{place}}-এ বজ্রঝড়ের আশঙ্কা — বাইরের কাজ তাড়াতাড়ি সেরে নিন।', ta: '{{place}}-இல் இடியுடன் புயல் எதிர்பார்க்கப்படுகிறது — வெளியில் செய்யும் வேலைகளை முன்கூட்டியே முடியுங்கள்.' },
  'ask.proactive.rain': { en: 'Rain likely at {{place}} ({{v}}%) — plan around it.', hi: '{{place}} में बारिश की संभावना ({{v}}%) — उसी हिसाब से योजना बनाएँ।', bn: '{{place}}-এ বৃষ্টির সম্ভাবনা ({{v}}%) — সেভাবেই পরিকল্পনা করুন।', ta: '{{place}}-இல் மழை வாய்ப்பு ({{v}}%) — அதற்கேற்ப திட்டமிடுங்கள்.' },
  'ask.proactive.heat': { en: 'Feels-like peaks at {{v}}°C today — avoid the afternoon outdoors.', hi: 'आज महसूस होने वाला तापमान {{v}}°C तक — दोपहर में बाहर जाने से बचें।', bn: 'আজ অনুভূত তাপমাত্রা {{v}}°C পর্যন্ত — দুপুরে বাইরে যাওয়া এড়ান।', ta: 'இன்று உணரப்படும் வெப்பம் {{v}}°C வரை — மதியம் வெளியில் செல்வதைத் தவிர்க்கவும்.' },
  'ask.proactive.window': { en: 'Best window for {{act}}: {{win}}.', hi: '{{act}} के लिए सबसे अच्छा समय: {{win}}।', bn: '{{act}}-এর জন্য সেরা সময়: {{win}}।', ta: '{{act}}-க்கு சிறந்த நேரம்: {{win}}.' },
});

// ---------- intent parsing ----------

// Latin-script Hindi is included on purpose: most people type Hinglish even
// with the app set to Hindi.
const INTENT_WORDS = {
  alternatives: ['where else', 'alternative', 'instead', 'somewhere else', 'other place', 'another place', 'different place', 'nearby place', 'where can i go', 'suggest a place', 'kahan jau', 'kaha jau', 'kahan jaye', 'kahan jaun', 'kaha jaun', 'kahan ja', 'dusri jagah', 'doosri jagah', 'aur kahan', 'koi aur jagah', 'kahi aur', 'kahin aur', 'और कहाँ', 'दूसरी जगह', 'कहीं और', 'विकल्प', 'बिकल्प', 'বিকল্প', 'আর কোথায়', 'অন্য জায়গা', 'অন্য কোথাও', 'வேறு எங்கு', 'வேறு இடம்', 'மாற்று'],
  best_time: ['best time', 'when should', 'what time', 'when can', 'good time', 'right time', 'best hour', 'when to go', 'kab jau', 'kab jana', 'kab jaun', 'kaunsa time', 'kaun sa time', 'kitne baje', 'kab nikl', 'kab nikal', 'sahi time', 'sahi samay', 'time kya', 'सही समय', 'कब जाऊँ', 'कब जाना', 'कितने बजे', 'कौन सा समय', 'সেরা সময়', 'কখন যাব', 'কটার সময়', 'சிறந்த நேரம்', 'எப்போது', 'எத்தனை மணி'],
  safe: ['safe', 'safety', 'risky', 'risk', 'danger', 'should i', 'can i go', 'can i', 'is it ok', 'ok to', 'suraksh', 'safe hai', 'safe he', 'jana chahiye', 'jaun ya', 'jau ya', 'jana thik', 'thik rahega', 'theek rahega', 'sahi rahega', 'chalega kya', 'सुरक्षित', 'ख़तरा', 'खतरा', 'जाना चाहिए', 'ठीक रहेगा', 'নিরাপদ', 'বিপদ', 'যাওয়া উচিত', 'ঠিক হবে', 'பாதுகாப்ப', 'ஆபத்து', 'போகலாமா', 'சரியாக இருக்குமா'],
  gear: ['umbrella', 'raincoat', 'rain coat', 'jacket', 'sunscreen', 'what should i wear', 'what to wear', 'carry', 'take with me', 'chhata', 'chata', 'chhatri', 'barsati', 'kya pehnu', 'kya le jau', 'kya lekar', 'saath le', 'छाता', 'छतरी', 'रेनकोट', 'क्या पहनूँ', 'क्या ले जाऊँ', 'ছাতা', 'রেনকোট', 'কী নেব', 'குடை', 'மழைக்கோட்', 'என்ன எடுத்துச்'],
  forecast: ['weather', 'forecast', 'rain', 'raining', 'temperature', 'temp', 'hot', 'cold', 'humid', 'wind', 'how is', 'what is the', 'mausam', 'mosam', 'barish', 'baarish', 'barsat', 'garmi', 'thand', 'thandi', 'hawa', 'dhoop', 'kaisa hai', 'kaisa rahega', 'kaisa mausam', 'मौसम', 'बारिश', 'तापमान', 'गर्मी', 'ठंड', 'धूप', 'कैसा', 'আবহাওয়া', 'বৃষ্টি', 'তাপমাত্রা', 'গরম', 'ঠান্ডা', 'কেমন', 'வானிலை', 'மழை', 'வெப்பநிலை', 'குளிர்', 'எப்படி'],
};

const GREETING_WORDS = ['hello', 'hi ', 'hey', 'namaste', 'namaskar', 'hii', 'salaam', 'नमस्ते', 'नमस्कार', 'হ্যালো', 'নমস্কার', 'வணக்கம்', 'ஹலோ'];

// "tomorrow" has to reach the engine, otherwise "kal barish hogi kya" gets
// answered with this afternoon's numbers.
const TOMORROW_WORDS = ['tomorrow', 'tmrw', 'next day', 'kal ', 'kal?', 'kal', 'आने वाला कल', 'कल', 'আগামীকাল', 'কাল', 'நாளை'];

const ACTIVITY_WORDS = {
  trek: ['trek', 'trekk', 'hike', 'hiking', 'climb', 'camping', 'camp', 'pahad', 'pahaad', 'parvat', 'chadhai', 'ट्रेक', 'पहाड़', 'चढ़ाई', 'कैंपिंग', 'ট্রেক', 'পাহাড়', 'மலையேற்ற', 'மலை'],
  beach: ['beach', 'sea', 'coast', 'swim', 'samundar', 'samudra', 'samandar', 'tat', 'समुद्र', 'तट', 'সৈকত', 'সমুদ্র', 'கடற்கரை', 'கடல்'],
  fitness: ['run', 'running', 'jog', 'jogging', 'workout', 'exercise', 'cycling', 'cycle', 'gym', 'walk', 'morning walk', 'daud', 'daudna', 'dodna', 'kasrat', 'vyayam', 'दौड़', 'व्यायाम', 'कसरत', 'सैर', 'দৌড়', 'ব্যায়াম', 'হাঁটা', 'ஓட்ட', 'உடற்பயிற்சி', 'நடை'],
  agri: ['farm', 'farming', 'crop', 'spray', 'spraying', 'irrigat', 'sowing', 'harvest', 'soil', 'kheti', 'fasal', 'khet', 'buvai', 'sinchai', 'खेत', 'खेती', 'फसल', 'सिंचाई', 'बुवाई', 'চাষ', 'ফসল', 'জমি', 'விவசாய', 'பயிர்', 'வயல்'],
  commute: ['commute', 'office', 'drive', 'driving', 'traffic', 'road', 'bike', 'scooter', 'car', 'daftar', 'safar', 'safr', 'gaadi', 'gadi', 'दफ़्तर', 'सड़क', 'यातायात', 'गाड़ी', 'অফিস', 'রাস্তা', 'গাড়ি', 'அலுவலக', 'சாலை', 'வண்டி'],
  family: ['family', 'kids', 'children', 'picnic', 'outing', 'park', 'bachche', 'bachhe', 'parivar', 'ghar wale', 'परिवार', 'बच्चे', 'पिकनिक', 'পরিবার', 'বাচ্চা', 'পিকনিক', 'குடும்ப', 'குழந்தை'],
  wildlife: ['safari', 'wildlife', 'jungle', 'tiger', 'national park', 'zoo', 'jangal', 'जंगल', 'सफ़ारी', 'সাফারি', 'জঙ্গল', 'காடு', 'சஃபாரி'],
  heritage: ['fort', 'temple', 'monument', 'heritage', 'museum', 'sightsee', 'qila', 'kila', 'mandir', 'darshan', 'किला', 'मंदिर', 'स्मारक', 'দুর্গ', 'মন্দির', 'கோட்டை', 'கோவில்'],
  travel: ['travel', 'trip', 'tour', 'holiday', 'vacation', 'visit', 'journey', 'ghumna', 'ghoomna', 'ghumne', 'ghoomne', 'yatra', 'safar kar', 'chutti', 'baahar', 'bahar jana', 'यात्रा', 'घूमना', 'घूमने', 'छुट्टी', 'बाहर', 'ভ্রমণ', 'বেড়ানো', 'ছুটি', 'பயண', 'சுற்றுலா', 'விடுமுறை'],
};

function matchAny(text, words) {
  return words.some((w) => text.includes(w));
}

export function parseIntent(raw, fallbackPersona) {
  const text = (raw || '').toLowerCase().trim();
  if (!text) return { intent: 'unknown', activity: null, when: 'now' };

  const when = matchAny(text, TOMORROW_WORDS) ? 'tomorrow' : 'now';

  // A bare greeting deserves a greeting, not a trekking verdict.
  if (text.length <= 20 && matchAny(text, GREETING_WORDS)) {
    return { intent: 'greeting', activity: null, when };
  }

  let intent = null;
  // Order matters: "where else can I go" also contains "go", so the more
  // specific alternatives/best-time checks run before the generic ones.
  for (const key of ['alternatives', 'gear', 'best_time', 'safe', 'forecast']) {
    if (matchAny(text, INTENT_WORDS[key])) { intent = key; break; }
  }
  let activity = null;
  for (const key of Object.keys(ACTIVITY_WORDS)) {
    if (matchAny(text, ACTIVITY_WORDS[key])) { activity = key; break; }
  }

  // Previously anything that matched neither list fell through to a canned
  // "I can help with…" message, which is what made the assistant feel like
  // it was ignoring people. A weather question with no recognised keyword is
  // still a weather question: answer it for the persona they are already on,
  // and let the reply carry a hint about being more specific.
  if (!intent && !activity) {
    return {
      intent: 'safe',
      activity: PERSONA_ACTIVITY[fallbackPersona] || 'travel',
      when,
      guessed: true,
    };
  }

  return {
    intent: intent || 'safe',
    activity: activity || PERSONA_ACTIVITY[fallbackPersona] || 'travel',
    when,
  };
}

// Words that follow "in"/"at" without being a place, so "rain in the
// morning" is not mistaken for a city called "the morning".
const NOT_A_PLACE = new Set(['the', 'my', 'this', 'that', 'morning', 'afternoon', 'evening',
  'night', 'today', 'tomorrow', 'general', 'summer', 'winter', 'monsoon', 'time', 'hour',
  'hours', 'minutes', 'india', 'here', 'town', 'city', 'area', 'future', 'a', 'an']);

// Extracts a place from phrasings like "weather in Mumbai", "Mumbai ka
// mausam", "Pune mein barish". Returns the raw phrase; the caller geocodes
// it, so any city the search box can find works here too, with no second
// list to keep in sync.
export function extractPlace(raw) {
  const text = (raw || '').trim();
  if (!text) return null;

  // English: after in / at / for / around
  let m = text.match(/\b(?:in|at|for|around|near)\s+([A-Za-z][A-Za-z\s.'-]{1,30}?)\s*(?:\?|$|,|\btoday\b|\btomorrow\b|\bnow\b|\bthis\b)/i);
  // Hinglish/Hindi: "<place> ka mausam", "<place> mein barish", "<place> में"
  if (!m) m = text.match(/([A-Za-z][A-Za-z\s.'-]{1,30}?)\s+(?:ka|ki|ke|mein|me|men|में|का|की|के)\b/i);
  if (!m) return null;

  const phrase = m[1].trim().replace(/\s+/g, ' ');
  if (phrase.length < 3) return null;
  const words = phrase.toLowerCase().split(' ');
  if (words.every((w) => NOT_A_PLACE.has(w))) return null;
  // Trim leading filler ("the weather in the Mumbai area" -> "Mumbai")
  while (words.length > 1 && NOT_A_PLACE.has(words[0])) words.shift();
  while (words.length > 1 && NOT_A_PLACE.has(words[words.length - 1])) words.pop();
  const cleaned = words.join(' ');
  return NOT_A_PLACE.has(cleaned) ? null : cleaned;
}

// ---------- hazard scoring ----------

function hoursFrom(metrics, count = 48, start = null) {
  const h = metrics.hourly || {};
  const times = h.time || [];
  const out = [];
  const from = start == null ? metrics.hIdx : start;
  for (let i = from; i < Math.min(from + count, times.length); i++) {
    out.push({
      iso: times[i],
      temp: h.temperature_2m?.[i] ?? 0,
      feels: h.apparent_temperature?.[i] ?? h.temperature_2m?.[i] ?? 0,
      rainProb: h.precipitation_probability?.[i] ?? 0,
      gust: h.wind_gusts_10m?.[i] ?? 0,
      uv: h.uv_index?.[i] ?? 0,
      vis: (h.visibility?.[i] ?? 10000) / 1000,
      code: h.weather_code?.[i] ?? 0,
    });
  }
  return out;
}

function hourHazards(h, prof) {
  const out = [];
  if ([95, 96, 99].includes(h.code)) out.push({ key: 'storm', sev: 2 });
  if (h.rainProb >= prof.rain) out.push({ key: 'rain', sev: h.rainProb >= prof.rain + 25 ? 2 : 1, v: Math.round(h.rainProb) });
  if (h.gust >= prof.gust) out.push({ key: 'wind', sev: h.gust >= prof.gust + 20 ? 2 : 1, v: Math.round(h.gust) });
  if (h.feels >= prof.hot) out.push({ key: 'heat', sev: h.feels >= prof.hot + 4 ? 2 : 1, v: Math.round(h.feels) });
  if (h.temp <= prof.cold) out.push({ key: 'cold', sev: h.temp <= prof.cold - 4 ? 2 : 1, v: Math.round(h.temp) });
  if (h.uv >= prof.uv) out.push({ key: 'uv', sev: h.uv >= prof.uv + 3 ? 2 : 1, v: Math.round(h.uv) });
  if (h.vis <= prof.vis) out.push({ key: 'vis', sev: h.vis <= prof.vis / 2 ? 2 : 1, v: +h.vis.toFixed(1) });
  return out;
}

function levelOf(hazards) {
  if (hazards.some((z) => z.sev === 2)) return 'avoid';
  return hazards.length ? 'caution' : 'good';
}

function isDaylight(iso) {
  const hr = new Date(iso).getHours();
  return hr >= 6 && hr <= 18;
}

// Merges the per-hour hazards over a span into one worst-case list, keeping
// the most severe reading of each kind so "rain" is reported once, at its peak.
function mergeHazards(lists) {
  const best = new Map();
  for (const z of lists.flat()) {
    const cur = best.get(z.key);
    if (!cur || z.sev > cur.sev || (z.sev === cur.sev && (z.v ?? 0) > (cur.v ?? 0))) best.set(z.key, z);
  }
  return [...best.values()].sort((a, b) => b.sev - a.sev);
}

// "kal" / "tomorrow" has to look at a different slice of the forecast than
// "abhi" — answering about the next 12 hours when someone asked about
// tomorrow is the kind of wrong answer that makes the whole thing feel dumb.
function windowFor(metrics, when) {
  const times = metrics.hourly?.time || [];
  if (when !== 'tomorrow' || !times.length) return { start: metrics.hIdx, count: 12 };
  const todayDate = new Date(times[metrics.hIdx]).getDate();
  for (let i = metrics.hIdx; i < times.length; i++) {
    if (new Date(times[i]).getDate() !== todayDate) return { start: i, count: 24 };
  }
  return { start: metrics.hIdx, count: 12 };
}

export function analyse(metrics, activity, opts = {}) {
  const prof = ACTIVITY[activity] || ACTIVITY.travel;
  const { start, count } = windowFor(metrics, opts.when);
  const hours = hoursFrom(metrics, count, start);
  const hazards = mergeHazards(hours.map((h) => hourHazards(h, prof)));

  // Only a current AQI reading is fetched, so it says nothing about
  // tomorrow — better to leave it out than to present today's air as a
  // forecast.
  if (opts.when !== 'tomorrow' && metrics.aqi_pm25 >= prof.aqi) {
    hazards.push({ key: 'aqi', sev: metrics.aqi_pm25 >= prof.aqi + 100 ? 2 : 1, v: metrics.aqi_pm25 });
  }
  // Slope terrain plus sustained rain is the landslide signal. It is a
  // caution derived from rainfall totals, never a geological assessment.
  if (opts.slope && metrics.rain_48h_mm >= 60) {
    hazards.push({ key: 'landslide', sev: metrics.rain_48h_mm >= 120 ? 2 : 1 });
  }
  hazards.sort((a, b) => b.sev - a.sev);
  // Peaks over the same 12 hours the verdict is based on, so the numbers
  // quoted back to the user match the ones that produced the risk level.
  const peak = (fn) => (hours.length ? Math.round(Math.max(...hours.map(fn))) : 0);
  return {
    level: levelOf(hazards),
    hazards,
    profile: prof,
    peaks: { rain: peak((h) => h.rainProb), gust: peak((h) => h.gust), feels: peak((h) => h.feels) },
  };
}

// Longest run of hours that clear every threshold. Falls back to merely
// "caution" hours if nothing is fully clear, so the answer can still offer
// the least-bad slot instead of a flat no.
export function bestWindow(metrics, activity) {
  const prof = ACTIVITY[activity] || ACTIVITY.travel;
  const hours = hoursFrom(metrics, 48);
  const usable = (h, strict) => {
    if (prof.daylight && !isDaylight(h.iso)) return false;
    const lvl = levelOf(hourHazards(h, prof));
    return strict ? lvl === 'good' : lvl !== 'avoid';
  };
  for (const strict of [true, false]) {
    let best = null; let start = null;
    hours.forEach((h, i) => {
      if (usable(h, strict)) {
        if (start === null) start = i;
        const len = i - start + 1;
        if (!best || len > best.len) best = { from: start, to: i, len };
      } else {
        start = null;
      }
    });
    if (best && best.len >= 2) {
      return { fromIso: hours[best.from].iso, toIso: hours[best.to].iso, hours: best.len, strict };
    }
  }
  return null;
}

// ---------- alternatives ----------

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

function scoreDaily(day, prof, slope) {
  const hazards = [];
  if ([95, 96, 99].includes(day.code)) hazards.push({ key: 'storm', sev: 2 });
  if (day.rain >= prof.rain) hazards.push({ key: 'rain', sev: day.rain >= prof.rain + 25 ? 2 : 1, v: Math.round(day.rain) });
  if (day.gust >= prof.gust) hazards.push({ key: 'wind', sev: day.gust >= prof.gust + 20 ? 2 : 1, v: Math.round(day.gust) });
  if (day.feelsMax >= prof.hot) hazards.push({ key: 'heat', sev: day.feelsMax >= prof.hot + 4 ? 2 : 1, v: Math.round(day.feelsMax) });
  if (day.tempMin <= prof.cold) hazards.push({ key: 'cold', sev: 1, v: Math.round(day.tempMin) });
  if (day.uv >= prof.uv) hazards.push({ key: 'uv', sev: day.uv >= prof.uv + 3 ? 2 : 1, v: Math.round(day.uv) });
  if (slope && day.rainSum >= 60) hazards.push({ key: 'landslide', sev: day.rainSum >= 120 ? 2 : 1 });
  return { level: levelOf(hazards), hazards };
}

export async function findAlternatives(origin, activity, destinations, maxKm = 400) {
  const prof = ACTIVITY[activity] || ACTIVITY.travel;
  const candidates = destinations
    .filter((d) => d.tags.includes(activity))
    .map((d) => ({ ...d, km: haversineKm(origin, d) }))
    .filter((d) => d.km > 15 && d.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, 12);

  if (!candidates.length) return [];

  let rows;
  try {
    rows = await fetchMultiDaily(candidates);
  } catch {
    return []; // never rank a place "safe" on data we could not fetch
  }

  return candidates
    .map((d, i) => {
      const daily = rows[i]?.daily;
      if (!daily) return null;
      const day = {
        code: daily.weather_code?.[0] ?? 0,
        rain: daily.precipitation_probability_max?.[0] ?? 0,
        rainSum: (daily.precipitation_sum?.[0] ?? 0) + (daily.precipitation_sum?.[1] ?? 0),
        gust: daily.wind_gusts_10m_max?.[0] ?? 0,
        feelsMax: daily.apparent_temperature_max?.[0] ?? daily.temperature_2m_max?.[0] ?? 0,
        tempMax: daily.temperature_2m_max?.[0] ?? 0,
        tempMin: daily.temperature_2m_min?.[0] ?? 0,
        uv: daily.uv_index_max?.[0] ?? 0,
      };
      const slope = SLOPE_KINDS.includes(d.kind);
      const { level, hazards } = scoreDaily(day, prof, slope);
      return { dest: d, km: d.km, level, hazards, temp: Math.round(day.tempMax), rain: Math.round(day.rain) };
    })
    .filter(Boolean)
    .filter((r) => r.level !== 'avoid')
    // Safety first, then distance — a clear day three hours away beats a
    // borderline one next door.
    .sort((a, b) => (a.level === b.level ? a.km - b.km : a.level === 'good' ? -1 : 1))
    .slice(0, 3);
}

// ---------- phrasing ----------

function fmtHour(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[ap]m/i, (m) => m.toUpperCase());
}

export function windowLabel(win) {
  if (!win) return '';
  const from = new Date(win.fromIso);
  const isToday = from.toDateString() === new Date().toDateString();
  const day = isToday ? t('ask.win.today') : t('ask.win.tomorrow');
  return t('ask.win.range', { day, from: fmtHour(win.fromIso), to: fmtHour(win.toIso) });
}

export function hazardText(z) {
  return t(`ask.hz.${z.key}`, { v: z.v });
}

export function activityLabel(activity) {
  return t(`ask.act.${activity}`);
}

export function isSlopeKind(kind) {
  return SLOPE_KINDS.includes(kind);
}

// Surfaces the single most useful unprompted line for the Home screen.
export function proactiveInsight(metrics, persona) {
  const activity = PERSONA_ACTIVITY[persona] || 'travel';
  const place = metrics.city;
  const stormSoon = (metrics.daily?.weather_code || []).slice(0, 1).some((c) => [95, 96, 99].includes(c));
  if (stormSoon) return { text: t('ask.proactive.storm', { place }), urgent: true };
  if (metrics.feelsLikeMax >= 40) return { text: t('ask.proactive.heat', { v: metrics.feelsLikeMax }), urgent: true };
  if (metrics.precip_prob_max24 >= 60) return { text: t('ask.proactive.rain', { place, v: metrics.precip_prob_max24 }), urgent: false };
  const win = bestWindow(metrics, activity);
  if (win) return { text: t('ask.proactive.window', { act: activityLabel(activity), win: windowLabel(win) }), urgent: false };
  return null;
}
