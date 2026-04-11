// @ts-check
// canvas-bars.mjs — pure layout helpers for the canvas-rendered bars used
// in the Context Budget section (#overview) and the Context Window Explorer
// session bar (#context/session). Extracted so the geometry math can be
// unit-tested without a DOM or Canvas2D context.
//
// Build integration: the generator strips `export ` keywords and prepends
// the file to app.js. Source of truth lives here — don't edit the inlined
// copy.

/**
 * @typedef {{ value: number, color: string, meta?: any }} StackedSegment
 */

/**
 * @typedef {{ x: number, w: number, color: string, meta?: any }} StackedRect
 */

/**
 * Lay out a simple stacked horizontal bar. The last segment absorbs any
 * rounding remainder so the full width is used, matching drawStackedBar's
 * behaviour.
 * @param {StackedSegment[]} segments
 * @param {number} W  total width in pixels (or device pixels)
 * @returns {StackedRect[]}
 */
export function layoutStackedBar(segments, W) {
  if (!Array.isArray(segments) || segments.length === 0 || W <= 0) return [];
  const total = segments.reduce((s, seg) => s + (seg.value > 0 ? seg.value : 0), 0);
  if (total <= 0) return [];
  /** @type {StackedRect[]} */
  const out = [];
  let x = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const w = i === segments.length - 1 ? W - x : Math.round((seg.value > 0 ? seg.value : 0) / total * W);
    out.push({ x, w, color: seg.color, meta: seg.meta });
    x += w;
  }
  return out;
}

/**
 * @typedef {{ visIdx: number, _tokens: number, color: string }} SessionBlock
 */

/**
 * @typedef {{ visIdx: number, x: number, w: number, color: string,
 *   widthPct: number, leftPct: number }} SessionSegment
 */

/**
 * Lay out the Context Window Explorer session bar. Segments are scaled so
 * the sum of per-block deltas matches the session's cumulative token count
 * (sessionScale), then converted to pixel positions within W. Sub-pixel
 * segments below MIN_PX (0.5px) are dropped to avoid invisible hit targets.
 *
 * The last rendered segment is stretched to the exact totalPct so rounding
 * never leaves a gap at the right edge.
 *
 * @param {SessionBlock[]} blocks
 * @param {number} totalTokens  cumulative tokens reached by the session
 * @param {number} budget       active budget (e.g. 200000 or 1000000)
 * @param {number} W            canvas width in pixels
 * @returns {SessionSegment[]}
 */
export function layoutSessionBar(blocks, totalTokens, budget, W) {
  if (!Array.isArray(blocks) || blocks.length === 0 || W <= 0 || budget <= 0) return [];
  const sumDeltas = blocks.reduce((s, b) => s + (b._tokens > 0 ? b._tokens : 0), 0);
  const sessionScale = sumDeltas > 0 ? totalTokens / sumDeltas : 1;
  const totalPct = (totalTokens / budget) * 100;
  const MIN_PX = 0.5;

  let cumPct = 0;
  const planned = [];
  for (const b of blocks) {
    const w = ((b._tokens > 0 ? b._tokens : 0) / budget * 100) * sessionScale;
    const left = cumPct;
    cumPct += w;
    if ((w / 100) * W >= MIN_PX / W * W) planned.push({ b, w, left });
  }
  // Re-filter strictly: keep segments whose pixel width is >= MIN_PX.
  const filtered = planned.filter(({ w }) => (w / 100) * W >= MIN_PX);
  /** @type {SessionSegment[]} */
  const out = [];
  for (let ri = 0; ri < filtered.length; ri++) {
    const { b, w, left } = filtered[ri];
    const isLast = ri === filtered.length - 1;
    const widthPct = isLast ? Math.max(0, totalPct - left) : w;
    const x = (left / 100) * W;
    const segW = Math.max(MIN_PX, (widthPct / 100) * W);
    out.push({
      visIdx: b.visIdx,
      x,
      w: segW,
      color: b.color,
      widthPct,
      leftPct: left,
    });
  }
  return out;
}

/**
 * @typedef {{ useLog: boolean, logMinExp: number, logMaxExp: number }} BarScale
 */

/**
 * Decide whether a set of row values should be rendered on a linear or
 * logarithmic horizontal-bar scale. Auto-switches to log when the largest
 * positive value is more than 100× the smallest positive value — this is
 * the threshold where linear bars start hiding small items.
 *
 * Used by the #overview harness usage card and the #tokens breakdown
 * card in renderBarCard (templates/app.js).
 *
 * @param {number[]} values
 * @returns {BarScale}
 */
export function computeBarScale(values) {
  const positive = (values || []).filter((v) => typeof v === 'number' && v > 0);
  if (positive.length < 2) {
    return { useLog: false, logMinExp: 0, logMaxExp: 0 };
  }
  const maxV = Math.max.apply(null, positive);
  const minV = Math.min.apply(null, positive);
  const useLog = maxV / minV > 100;
  return {
    useLog,
    logMinExp: Math.log10(minV),
    logMaxExp: Math.log10(maxV),
  };
}

/**
 * Compute the visual bar width (%) for a single row value.
 *
 * - Linear mode: `value / total * 100`.
 * - Log mode: maps [min, max] → [8%, 100%] on a log₁₀ scale so the
 *   smallest visible row still has an 8% fill (≈10px on a 130px track),
 *   preserving the ability to compare orders of magnitude.
 *
 * Both the %/value columns in the UI keep showing the real linear share —
 * only the bar fill width changes.
 *
 * @param {number} value
 * @param {number} total
 * @param {BarScale} scale
 * @returns {number}  width in percent (0..100)
 */
export function computeBarWidth(value, total, scale) {
  if (scale && scale.useLog) {
    if (!(value > 0)) return 0;
    const range = scale.logMaxExp - scale.logMinExp;
    if (range <= 0) return 100;
    const normalized = (Math.log10(value) - scale.logMinExp) / range;
    return 8 + normalized * 92;
  }
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * Binary-search a segment list for the one containing clientX (relative to
 * the bar's left edge). Returns null if no segment matches. Mirrors
 * barSegmentAt in the context explorer and is used when adding hover hit
 * tests elsewhere.
 * @param {{ x: number, w: number }[]} segments
 * @param {number} x
 * @returns {number | null}
 */
export function findSegmentAt(segments, x) {
  if (!segments || segments.length === 0) return null;
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    if (x < s.x) hi = mid - 1;
    else if (x >= s.x + s.w) lo = mid + 1;
    else return mid;
  }
  return null;
}
