// The satellite layer: a real picture of India, from NASA.
//
// This is the one layer that is not a forecast. NASA's GIBS service serves
// the VIIRS true-colour mosaic as open imagery with no key and permissive
// CORS, so the map can ask for exactly the rectangle it is showing and draw
// the answer straight onto the canvas.
//
// The honest limit, and it is stated on screen rather than buried here:
// VIIRS flies a polar orbit and images any given place about once a day.
// This is yesterday's or this morning's pass, not the live geostationary
// loop a commercial weather site shows. The date is printed under the map
// so nobody reads a day-old sky as the current one.

// Web Mercator, so the image arrives already in the projection the map
// draws in and lines up without reprojection.
const R = 6378137;
const merX = (lon) => R * (lon * Math.PI / 180);
const merY = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));

const LAYER = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor';
const ENDPOINT = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';

const ymd = (d) => d.toISOString().slice(0, 10);

function url(bbox, w, h, date) {
  const q = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1',
    LAYERS: LAYER, SRS: 'EPSG:3857',
    BBOX: bbox.join(','), WIDTH: String(w), HEIGHT: String(h),
    FORMAT: 'image/jpeg', TIME: date,
  });
  return `${ENDPOINT}?${q}`;
}

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('satellite tile failed'));
    img.src = src;
  });
}

// GIBS answers a date it has not finished building with a valid but almost
// black image rather than an error, so freshness has to be measured rather
// than trusted. Sampling a thinned grid of pixels is enough to tell a
// daylight mosaic from an empty one.
function brightness(img) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 64, 64);
  let sum = 0;
  const { data } = ctx.getImageData(0, 0, 64, 64);
  for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  return sum / (data.length / 4);
}

const MIN_BRIGHT = 18;

let cache = null;

// `corners` is [[lonW, latS], [lonE, latN]] — the map's own visible extent,
// so the image covers the map and nothing more.
export async function fetchSatellite(corners, w, h) {
  const bbox = [
    merX(corners[0][0]), merY(corners[0][1]),
    merX(corners[1][0]), merY(corners[1][1]),
  ].map((v) => v.toFixed(1));
  const sig = `${bbox.join(',')}|${w}x${h}`;
  if (cache && cache.sig === sig) return cache;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  // Today first — there is usually a pass over India by mid-morning UTC —
  // and yesterday when there is not yet one.
  for (const d of [now, yesterday]) {
    try {
      const date = ymd(d);
      const img = await load(url(bbox, w, h, date));
      if (brightness(img) < MIN_BRIGHT && d === now) continue;
      cache = { sig, img, date };
      return cache;
    } catch { /* try the older date */ }
  }
  throw new Error('no satellite imagery available');
}

// Drawn under everything else the layer shows, filling the canvas exactly
// because the bbox was built from the canvas.
export function paintSatellite(ctx, sat, clip, W, H) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  clip(ctx);
  ctx.clip();
  ctx.drawImage(sat.img, 0, 0, W, H);
  ctx.restore();
}
