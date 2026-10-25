// @ts-check
// date-key.mjs: local calendar-day keys (YYYY-MM-DD) for grouping usage by day.
//
// Days are the user's local days, matching how the DB stores dates
// (scripts/db.mjs localDate). Never key by toISOString(): that is the UTC day,
// which shifts early-morning usage onto the previous day east of UTC.

/**
 * @param {Date} d
 * @returns {string}
 */
export function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Day key of a timestamp: epoch ms, ISO string, or an already-bare date string.
 * @param {number|string|null|undefined} ts
 * @returns {string} '' when the timestamp is missing or invalid
 */
export function tsDateKey(ts) {
  if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  if (typeof ts !== 'number' && typeof ts !== 'string') return '';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : dateKey(d);
}
