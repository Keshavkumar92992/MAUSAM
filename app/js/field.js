// The smooth colour field the radar paints over India.
//
// The map has 66 measured points on a 2° lattice. Drawing them as 66 discs
// was honest about that, and looked like polka dots. This interpolates
// between them into a continuous sheet — the way a weather map is normally
// read — without pretending to a resolution the data does not have: the
// field is deliberately soft, because a crisp edge between two model points
// 220 km apart would be a claim nobody can support.
//
// Two decisions keep it fast enough to drag a slider through:
//
//  * The weights are computed once, not per frame. Where each output cell
//    sits relative to the grid depends only on the projection, so the whole
//    stencil is rebuilt on resize and reused for every value change.
//
//  * The field renders into a small offscreen canvas and is scaled up.
//    The browser's own bilinear filtering does the final smoothing for
//    free, and the coastline stays crisp because the clip is applied at
//    full resolution on the way out.

import { lut, lutIndex } from './scales.js';

// Output cell size in CSS pixels. Six is small enough that the upscale has
// something to work with and large enough that a phone rebuilds the stencil
// in a few milliseconds.
const CELL = 6;

// Gaussian falloff width, in degrees. Tied to the grid spacing rather than
// fixed: at roughly 0.8 of a step, a point's influence has faded by the
// time you reach its neighbour, which is what stops the field breaking into
// bullseyes around each measurement.
const SIGMA_STEPS = 0.8;

// How many neighbours any one cell listens to. Past about eight the extra
// weights are too small to see and only cost memory.
const K = 8;

// Builds the weight table. `points` is the grid, `invert` turns an [x, y]
// in canvas pixels back into [lon, lat].
export function buildStencil(points, invert, W, H, step) {
  const cols = Math.max(1, Math.ceil(W / CELL));
  const rows = Math.max(1, Math.ceil(H / CELL));
  const idx = new Int16Array(cols * rows * K).fill(-1);
  const wgt = new Float32Array(cols * rows * K);
  const sigma = step * SIGMA_STEPS;
  const twoSigmaSq = 2 * sigma * sigma;
  // Beyond three sigma the weight is under a thousandth; ignoring those
  // keeps the inner loop short without changing the picture.
  const cutoff = (3 * sigma) ** 2;

  const near = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ll = invert([c * CELL + CELL / 2, r * CELL + CELL / 2]);
      const cellBase = (r * cols + c) * K;
      if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) continue;
      near.length = 0;
      for (let p = 0; p < points.length; p++) {
        const dx = points[p].lon - ll[0];
        const dy = points[p].lat - ll[1];
        const d2 = dx * dx + dy * dy;
        if (d2 > cutoff) continue;
        near.push([d2, p]);
      }
      if (!near.length) continue;
      near.sort((a, b) => a[0] - b[0]);
      const n = Math.min(K, near.length);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += Math.exp(-near[i][0] / twoSigmaSq);
      if (sum <= 0) continue;
      for (let i = 0; i < n; i++) {
        idx[cellBase + i] = near[i][1];
        wgt[cellBase + i] = Math.exp(-near[i][0] / twoSigmaSq) / sum;
      }
    }
  }
  return { cols, rows, idx, wgt, cell: CELL };
}

// Interpolates one value per output cell. `read(pointIndex)` returns the
// number being drawn, so the same stencil serves every layer.
export function sampleField(stencil, read) {
  const { cols, rows, idx, wgt } = stencil;
  const out = new Float32Array(cols * rows).fill(NaN);
  for (let cell = 0; cell < cols * rows; cell++) {
    const base = cell * K;
    if (idx[base] < 0) continue;
    let v = 0, w = 0;
    for (let i = 0; i < K; i++) {
      const p = idx[base + i];
      if (p < 0) break;
      const val = read(p);
      if (!Number.isFinite(val)) continue;
      v += val * wgt[base + i];
      w += wgt[base + i];
    }
    // A cell whose neighbours all had missing readings stays NaN and is
    // left unpainted, rather than quietly reading as zero.
    out[cell] = w > 0 ? v / w : NaN;
  }
  return out;
}

// One reusable offscreen canvas; the field is small and rebuilding it per
// frame would churn memory for nothing.
let off = null;

// Paints `values` into `ctx` through `scale`, clipped by `clip(ctx)`.
export function paintField(ctx, stencil, values, scale, clip, W, H) {
  const { cols, rows } = stencil;
  if (!off) off = document.createElement('canvas');
  if (off.width !== cols || off.height !== rows) { off.width = cols; off.height = rows; }
  const octx = off.getContext('2d');
  const img = octx.createImageData(cols, rows);
  const table = lut(scale);

  for (let i = 0; i < cols * rows; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const li = lutIndex(scale, v);
    if (li < 0) continue;
    img.data[i * 4] = table[li * 4];
    img.data[i * 4 + 1] = table[li * 4 + 1];
    img.data[i * 4 + 2] = table[li * 4 + 2];
    img.data[i * 4 + 3] = table[li * 4 + 3];
  }
  octx.putImageData(img, 0, 0);

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  clip(ctx);
  ctx.clip();
  // The upscale is the smoothing. Without this the field arrives as visible
  // six-pixel squares.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, cols, rows, 0, 0, cols * stencil.cell, rows * stencil.cell);
  ctx.restore();
}

export function clearField(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
}
