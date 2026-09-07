// Shared severity classification so tile / panel colours never diverge.
// thresholds: array of [min, max, tone, label] (numeric) or [matchValue, matchValue, tone, label] (string enum)
export function classify(value, thresholds) {
  if (value == null || Number.isNaN(value)) return { tone: 'info', label: '—' };
  if (typeof value === 'string') {
    const hit = thresholds.find(([lo]) => String(lo) === value);
    return hit ? { tone: hit[2], label: hit[3] } : { tone: 'info', label: value };
  }
  for (const [lo, hi, tone, label] of thresholds) {
    if (typeof lo === 'number' && value >= lo && value <= hi) return { tone, label };
  }
  const last = thresholds[thresholds.length - 1];
  return { tone: last ? last[2] : 'info', label: last ? last[3] : String(value) };
}

export const TONE_COLOR = { ok: '#2E7D5B', warn: '#C9772A', bad: '#C2452D', info: '#2C6EA8' };

export function pctFor(value, thresholds, max) {
  if (value == null || Number.isNaN(value)) return '0%';
  const numeric = typeof value === 'number' ? value : 0;
  const cap = max ?? (thresholds[thresholds.length - 1]?.[1] ?? 100);
  const pct = Math.max(4, Math.min(100, Math.round((numeric / cap) * 100)));
  return pct + '%';
}
