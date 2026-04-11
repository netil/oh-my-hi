// @ts-check
// cost-projection.mjs — pure month-end cost projection used by #tokens-cost.
// Extracted so it can be unit-tested without a browser.
//
// Build integration: the generator strips `export ` keywords and prepends the
// file to app.js. Source of truth lives here — don't edit the inlined copy.

/**
 * @typedef {{
 *   projected: number,
 *   monthToDate: number,
 *   dailyAvg: number,
 *   daysRemaining: number,
 *   daysInMonth: number,
 *   sampleDays: number,
 *   confidence: 'high' | 'low' | 'none',
 *   diff: number | null,
 *   overBudget: boolean,
 * }} CostProjection
 */

/**
 * Parse a 'YYYY-MM-DD' date key into local-timezone year/month/day integers.
 * Accepts only that exact shape; returns null otherwise.
 * @param {string} iso
 * @returns {{ y: number, m: number, d: number } | null}
 */
export function parseDateKey(iso) {
  if (typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

/**
 * Days in month (1-indexed month).
 * @param {number} y
 * @param {number} m
 */
export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

/**
 * Shift an ISO date key by n days (negative allowed).
 * @param {string} iso
 * @param {number} delta
 */
export function shiftDateKey(iso, delta) {
  const p = parseDateKey(iso);
  if (!p) return iso;
  const d = new Date(p.y, p.m - 1, p.d);
  d.setDate(d.getDate() + delta);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yy + '-' + mm + '-' + dd;
}

/**
 * Compute month-end cost projection from a dailyCost map.
 *
 * Strategy:
 *   - 7-day trailing window (ending today inclusive) → dailyAvg = sum / 7.
 *     Idle days count as 0 so the projection is conservative and reflects
 *     real calendar pacing, not just active days.
 *   - monthToDate = sum of dailyCostMap entries that fall within the current
 *     month, up to and including today.
 *   - projected = monthToDate + dailyAvg * daysRemaining.
 *   - confidence: sampleDays (non-zero entries in window) ≥ 5 → 'high';
 *                 3..4 → 'low'; < 3 → 'none' (projection suppressed).
 *
 * @param {Record<string, number>} dailyCostMap  { 'YYYY-MM-DD': cost }
 * @param {string} todayISO  'YYYY-MM-DD' (treated as "today" for projection)
 * @param {number | null | undefined} monthlyBudget  null/undefined → no diff
 * @returns {CostProjection | null}
 */
export function projectMonthEnd(dailyCostMap, todayISO, monthlyBudget) {
  const today = parseDateKey(todayISO);
  if (!today) return null;

  // 7-day trailing window
  const windowDays = 7;
  let windowSum = 0;
  let sampleDays = 0;
  for (let i = 0; i < windowDays; i++) {
    const key = shiftDateKey(todayISO, -i);
    const v = dailyCostMap[key];
    if (typeof v === 'number' && v > 0) {
      windowSum += v;
      sampleDays += 1;
    }
  }
  const dailyAvg = windowSum / windowDays;

  // Month-to-date
  const monthPrefix = todayISO.substring(0, 7) + '-';
  let monthToDate = 0;
  for (const key of Object.keys(dailyCostMap)) {
    if (key.startsWith(monthPrefix) && key <= todayISO) {
      monthToDate += dailyCostMap[key] || 0;
    }
  }

  const dim = daysInMonth(today.y, today.m);
  const daysRemaining = dim - today.d;
  const projected = monthToDate + dailyAvg * daysRemaining;

  /** @type {'high' | 'low' | 'none'} */
  let confidence = 'none';
  if (sampleDays >= 5) confidence = 'high';
  else if (sampleDays >= 3) confidence = 'low';

  const hasBudget = typeof monthlyBudget === 'number' && monthlyBudget > 0;
  const diff = hasBudget ? projected - monthlyBudget : null;

  return {
    projected,
    monthToDate,
    dailyAvg,
    daysRemaining,
    daysInMonth: dim,
    sampleDays,
    confidence,
    diff,
    overBudget: hasBudget ? projected > monthlyBudget : false,
  };
}
