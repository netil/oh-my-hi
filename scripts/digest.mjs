// Weekly digest — build-time aggregation of the last 7 days vs the previous 7.
// Computed at build time (generate-dashboard.mjs) from the monthly SQLite DBs
// and embedded in data.json as `weeklyDigest: { [scopeId]: digest }` so the
// browser can render it without an extra usage fetch.

const DAY_MS = 86400000;

// Mirror of _PRICING_FALLBACK in templates/app.js (browser template — not
// importable from Node). Used only when the build-time pricing fetch failed.
export const PRICING_FALLBACK = {
  'opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
  'opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
  'opus-4-5': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
  'opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheCreation: 1.25 },
  'haiku-4': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
  'sonnet-3-5': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'haiku-3-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
  'opus-3': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'sonnet-3': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'haiku-3': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheCreation: 0.3 },
  // OpenAI / Codex (USD per 1M tokens). Cached input = 10% of input; no cache-creation.
  'gpt-5.5': { input: 5, output: 30, cacheRead: 0.5, cacheCreation: 0 },
  'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0.25, cacheCreation: 0 },
  'gpt-5.1': { input: 0.63, output: 5, cacheRead: 0.063, cacheCreation: 0 },
  'gpt-5.3-codex': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreation: 0 },
  'gpt-5.2-codex': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreation: 0 },
  'gpt-5.1-codex': { input: 1.25, output: 10, cacheRead: 0.125, cacheCreation: 0 },
  'gpt-5.1-codex-mini': { input: 0.25, output: 2, cacheRead: 0.025, cacheCreation: 0 },
};

/** Resolve a raw model id to a pricing-table key (same logic as app.js). */
export function resolvePricingKey(model, pricing) {
  if (!model || model === 'unknown') return null;
  const s = model.replace(/^claude-/, '').replace(/-\d{8,}$/, '');
  if (pricing[s]) return s;
  const m = s.match(/^(opus|sonnet|haiku)-(\d+)(?:-(\d+))?$/);
  if (m) {
    if (m[3]) {
      const withMinor = `${m[1]}-${m[2]}-${m[3]}`;
      if (pricing[withMinor]) return withMinor;
    }
    const base = `${m[1]}-${m[2]}`;
    if (pricing[base]) return base;
  }
  return null;
}

/** Estimated USD cost of a single token entry (same formula as app.js). */
export function calcEntryCost(entry, pricing) {
  const key = resolvePricingKey(entry.model, pricing);
  if (!key) return 0;
  const p = pricing[key];
  return ((entry.rawInput || 0) * p.input
    + (entry.outputTokens || 0) * p.output
    + (entry.cacheRead || 0) * p.cacheRead
    + (entry.cacheCreation || 0) * p.cacheCreation) / 1e6;
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
