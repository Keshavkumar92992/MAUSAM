// How dark the app should be right now.
//
// Pulled out of home.js so the arithmetic can be exercised on its own: it
// is the one piece of this app whose behaviour you cannot see by looking at
// it — it depends on the hour, and being wrong at 5 AM is not something you
// would notice until 5 AM. duskLevel() takes the moment as an argument for
// exactly that reason.

// There is no light/dark switch and no setting. The page carries a --dusk
// level from 0 (full daylight) to 1 (full night), and the stylesheet builds
// the palette from it: the two sides swap once, at sunset, and the night
// side then keeps settling from a twilight slate down to midnight. The note
// at the top of styles.css says why the swap has to be a step.
//
// The ramp is hung off the location's own sunrise and sunset — the forecast
// already carries both — because a clock rule cannot know that a December
// evening in Delhi is dark by 5:30 while June is still bright at 7. It is
// deliberately long and lopsided: the light drains for a couple of hours
// after the sun is down, and starts coming back well before it is up.
export const DUSK_BEFORE_SET = 45;    // minutes before sunset the dimming starts
const DUSK_AFTER_SET = 150;    // minutes after sunset it is fully night
const DAWN_BEFORE_RISE = 120;  // minutes before sunrise the light returns
const DAWN_AFTER_RISE = 60;    // minutes after sunrise it is fully light
const MIN = 60000;

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function duskLevel(m, now = Date.now()) {
  let rise = m?.sunrise ? Date.parse(m.sunrise) : NaN;
  let set = m?.sunset ? Date.parse(m.sunset) : NaN;
  if (!Number.isFinite(rise) || !Number.isFinite(set)) {
    // Before the first fetch, and for feeds that omit them: the Indian mean
    // is close enough that the first paint is never visibly wrong, and the
    // real times take over a moment later.
    rise = new Date(now).setHours(6, 15, 0, 0);
    set = new Date(now).setHours(18, 30, 0, 0);
  }
  const duskFrom = set - DUSK_BEFORE_SET * MIN;
  if (now >= duskFrom) return clamp01((now - duskFrom) / ((DUSK_BEFORE_SET + DUSK_AFTER_SET) * MIN));
  // Everything before that is either still night from yesterday evening or
  // climbing back out of it. Both are the same ramp read backwards.
  const dawnFrom = rise - DAWN_BEFORE_RISE * MIN;
  if (now <= rise + DAWN_AFTER_RISE * MIN) {
    return 1 - clamp01((now - dawnFrom) / ((DAWN_BEFORE_RISE + DAWN_AFTER_RISE) * MIN));
  }
  return 0;
}

// Sunset's place on the dial. The evening ramp starts DUSK_BEFORE_SET
// minutes early, so this fraction of it is exactly the moment the sun goes
// down — which is where the palette changes sides.
export const SUNSET_POINT = DUSK_BEFORE_SET / (DUSK_BEFORE_SET + DUSK_AFTER_SET);
