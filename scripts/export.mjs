// @ts-check
// export.mjs — usage data export helpers (CSV / JSON).
//
// Backs the `GET /api/usage?format=csv|json` endpoint in serve.mjs.
// The browser (templates/app.js) carries its own copy of the same row/CSV
// logic so the dashboard can export client-side on file:// without a server.
// Keep the column set and escaping rules in sync between the two.

import { PRICING_FALLBACK, pricingKeyFor, entryCost } from '../templates/pricing.mjs';

// Pricing lives in templates/pricing.mjs (shared with the browser build).
export { PRICING_FALLBACK };

/** Resolve a raw model id (e.g. 'claude-sonnet-4-20250514') to a pricing key. */
export function resolvePricingKey(model, pricing = PRICING_FALLBACK) {
  return pricingKeyFor(model, pricing);
}

/** Estimated USD cost of one token entry. 0 when the model has no pricing. */
export function calcEntryCost(entry, pricing = PRICING_FALLBACK) {
  return entryCost(entry, pricing);
}

// Column order for exported rows (CSV header + JSON key order).
export const EXPORT_COLUMNS = [
  'timestamp', 'scope', 'sessionId', 'model', 'context', 'contextName',
  'inputTokens', 'outputTokens', 'cacheRead', 'cacheWrite', 'cost',
];

/**
 * Map token entries (queryUsage shape) to flat export rows.
 * `inputTokens` is the raw (non-cached) input, matching the dashboard's
 * "Input" figure and the cost formula. `cacheWrite` = cacheCreation.
 */
export function buildExportRows(tokenEntries, scope, pricing = PRICING_FALLBACK) {
  return (tokenEntries || []).map((e) => {
    const ts = Number(e.timestamp);
    return {
      timestamp: Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : '',
      scope,
      sessionId: e.sessionId || '',
      model: e.model || '',
      context: e.context || '',
      contextName: e.contextName || '',
      inputTokens: e.rawInput || 0,
      outputTokens: e.outputTokens || 0,
      cacheRead: e.cacheRead || 0,
      cacheWrite: e.cacheCreation || 0,
      cost: Math.round(calcEntryCost(e, pricing) * 1e6) / 1e6,
    };
  });
}

/** RFC 4180 field escaping: quote when the value contains `"`, `,`, CR or LF. */
export function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Serialize rows to CSV with a header line. CRLF line endings (RFC 4180). */
export function toCsv(rows, columns = EXPORT_COLUMNS) {
  const lines = [columns.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Parse a from/to query param: epoch ms ('1700000000000') or 'YYYY-MM-DD'.
 * Date strings are interpreted as UTC days; `endOfDay` makes the bound
 * inclusive of the whole day (23:59:59.999).
 * @returns {number|null} epoch ms, or null when missing/unparseable
 */
export function parseDateParam(raw, endOfDay = false) {
  if (raw == null || raw === '') return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isFinite(ms)) return null;
    return endOfDay ? ms + 86400000 - 1 : ms;
  }
  if (!/^-?\d+$/.test(String(raw).trim())) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Download filename: oh-my-hi-usage-YYYYMMDD.{csv|json} (local date). */
export function exportFilename(format, date = new Date()) {
  const stamp = String(date.getFullYear())
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
  return `oh-my-hi-usage-${stamp}.${format}`;
}
