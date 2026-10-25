// Weekly digest — build-time aggregation of the last 7 days vs the previous 7.
// Computed at build time (generate-dashboard.mjs) from the monthly SQLite DBs
// and embedded in data.json as `weeklyDigest: { [scopeId]: digest }` so the
// browser can render it without an extra usage fetch.

const DAY_MS = 86400000;

import { PRICING_FALLBACK, pricingKeyFor, entryCost } from '../templates/pricing.mjs';

// Pricing lives in templates/pricing.mjs (shared with the browser build).
export { PRICING_FALLBACK };

/** Resolve a raw model id to a pricing-table key. */
export function resolvePricingKey(model, pricing) {
  return pricingKeyFor(model, pricing);
}

/** Estimated USD cost of a single token entry. */
export function calcEntryCost(entry, pricing) {
  return entryCost(entry, pricing);
}

/**
 * Compute the weekly digest from token entries.
 *
 * Windows: current = [now-7d, now], previous = [now-14d, now-7d).
 * Returns:
 *   {
 *     current:  { cost, tokens, sessions },
 *     previous: { cost, tokens, sessions },
 *     delta:    { cost, tokens, sessions },  // % vs previous, null when previous is 0
 *     from, to                               // epoch ms of the 14-day window
 *   }
 */
export function computeWeeklyDigest(tokenEntries, { pricing = null, now = Date.now() } = {}) {
  // Merge fetched (Claude) pricing over the fallback so OpenAI/Codex entries persist.
  const p = pricing ? { ...PRICING_FALLBACK, ...pricing } : PRICING_FALLBACK;
  const curStart = now - 7 * DAY_MS;
  const prevStart = now - 14 * DAY_MS;
  const cur = { cost: 0, tokens: 0, sessions: 0 };
  const prev = { cost: 0, tokens: 0, sessions: 0 };
  const curSessions = new Set();
  const prevSessions = new Set();

  for (const e of tokenEntries || []) {
    const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
    if (!Number.isFinite(ts) || ts < prevStart || ts > now) continue;
    const inCurrent = ts >= curStart;
    const bucket = inCurrent ? cur : prev;
    bucket.cost += calcEntryCost(e, p);
    bucket.tokens += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
    if (e.sessionId) (inCurrent ? curSessions : prevSessions).add(e.sessionId);
  }
  cur.sessions = curSessions.size;
  prev.sessions = prevSessions.size;

  const pct = (c, pv) => (pv > 0 ? Math.round(((c - pv) / pv) * 100) : null);
  return {
    current: cur,
    previous: prev,
    delta: {
      cost: pct(cur.cost, prev.cost),
      tokens: pct(cur.tokens, prev.tokens),
      sessions: pct(cur.sessions, prev.sessions),
    },
    from: prevStart,
    to: now,
  };
}

/**
 * Query the monthly SQLite DBs for the last 14 days and compute a digest per
 * scope. Best-effort: returns {} when the DB module is unavailable or fails.
 */
export function computeWeeklyDigestsFromDb(dbModule, outputDir, scopeIds, pricing = null, now = Date.now()) {
  if (!dbModule || !Array.isArray(scopeIds) || scopeIds.length === 0) return {};
  const from = now - 14 * DAY_MS;
  const fromDate = new Date(from);
  const minYm = fromDate.getUTCFullYear() * 100 + (fromDate.getUTCMonth() + 1);
  const dbs = [];
  try {
    for (const { path: p, year, month } of dbModule.listMonthlyDbs(outputDir)) {
      if (year * 100 + month < minYm) continue; // 14-day window touches at most 2 months
      try { dbs.push(dbModule.openDb(p)); } catch { /* skip unreadable month */ }
    }
    if (dbs.length === 0) return {};
    const result = {};
    for (const id of scopeIds) {
      try {
        const usage = dbModule.queryUsageMultiDb(dbs, id, from, now);
        result[id] = computeWeeklyDigest(usage.tokenEntries, { pricing, now });
      } catch { /* skip scope */ }
    }
    return result;
  } catch {
    return {};
  } finally {
    for (const db of dbs) { try { db.close(); } catch { /* ignore */ } }
  }
}
