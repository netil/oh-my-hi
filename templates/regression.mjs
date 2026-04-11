// @ts-check
// regression.mjs — pure week-over-week regression detector for the
// #overview page. Compares the trailing 7-day window against the prior
// 7-day window and flags metrics that degraded by a threshold.
//
// Build integration: the generator strips `export ` keywords and prepends
// the file to app.js. Source of truth lives here — don't edit the inlined
// copy.

/**
 * @typedef {{ timestamp: number|string, latencyMs: number, sessionId: string }} LatencyEntry
 */

/**
 * @typedef {{ timestamp: number|string, rawInput?: number, outputTokens?: number,
 *   cacheRead?: number, cacheCreation?: number, sessionId?: string }} TokenEntry
 */

/**
 * @typedef {{
 *   current: number,
 *   previous: number,
 *   deltaPct: number,   // (current - previous) / previous * 100 (positive = regression)
 *   regressed: boolean,
 *   sampleCurrent: number,
 *   samplePrevious: number,
 * }} RegressionMetric
 */

/**
 * @typedef {{
 *   latency: RegressionMetric | null,
 *   tokensPerTurn: RegressionMetric | null,
 *   sessionsPerDay: RegressionMetric | null,
 *   anyRegressed: boolean,
 *   thresholdPct: number,
 *   currentWindow: { startMs: number, endMs: number },
 *   previousWindow: { startMs: number, endMs: number },
 * }} RegressionReport
 */

/**
 * Parse a timestamp field that may be a number (ms), ISO string, or other
 * parseable string. Returns NaN for invalid inputs.
 * @param {number | string} ts
 */
export function toMs(ts) {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  return NaN;
}

/**
 * Given a "today" ms epoch, compute the two 7-day windows used for the
 * week-over-week comparison. Both windows are [start, end) half-open so
 * there's no double-counting at the boundary.
 *
 * current  = [today - 7d, today)
 * previous = [today - 14d, today - 7d)
 *
 * @param {number} todayMs
 */
export function weekWindows(todayMs) {
  const DAY = 86400000;
  const curEnd = todayMs;
  const curStart = curEnd - 7 * DAY;
  const prevEnd = curStart;
  const prevStart = prevEnd - 7 * DAY;
  return {
    current: { startMs: curStart, endMs: curEnd },
    previous: { startMs: prevStart, endMs: prevEnd },
  };
}

/**
 * Compute the average of values that fall inside [startMs, endMs). Returns
 * { avg, count } so the caller can decide whether the sample is large
 * enough to trust.
 * @param {{ timestamp: number | string, [k: string]: any }[]} entries
 * @param {(e: any) => number} valueFn
 * @param {number} startMs
 * @param {number} endMs
 */
export function avgInWindow(entries, valueFn, startMs, endMs) {
  let sum = 0;
  let count = 0;
  for (const e of entries) {
    const ms = toMs(e.timestamp);
    if (!(ms >= startMs && ms < endMs)) continue;
    const v = valueFn(e);
    if (typeof v !== 'number' || !isFinite(v)) continue;
    sum += v;
    count += 1;
  }
  return { avg: count > 0 ? sum / count : 0, count };
}

/**
 * Build a single RegressionMetric given paired window results.
 * higherIsWorse=true means positive delta (current > previous) is a
 * regression (e.g. latency, tokens/turn). Set to false when positive
 * delta is an improvement.
 *
 * Returns null when either window has fewer than `minSamples` samples —
 * the comparison is statistically meaningless with too little data.
 *
 * @param {{ avg: number, count: number }} cur
 * @param {{ avg: number, count: number }} prev
 * @param {number} thresholdPct
 * @param {number} minSamples
 * @param {boolean} higherIsWorse
 * @returns {RegressionMetric | null}
 */
export function metricFromWindows(cur, prev, thresholdPct, minSamples, higherIsWorse) {
  if (cur.count < minSamples || prev.count < minSamples) return null;
  if (prev.avg === 0) return null; // avoid divide-by-zero; can't compare
  const deltaRaw = ((cur.avg - prev.avg) / prev.avg) * 100;
  const deltaPct = higherIsWorse ? deltaRaw : -deltaRaw;
  return {
    current: cur.avg,
    previous: prev.avg,
    deltaPct,
    regressed: deltaPct >= thresholdPct,
    sampleCurrent: cur.count,
    samplePrevious: prev.count,
  };
}

/**
 * Compute cache hit rate within a window.
 * Cache hit rate = cacheRead / (rawInput + cacheRead + cacheCreation)
 * @param {TokenEntry[]} tokenEntries
 * @param {number} startMs
 * @param {number} endMs
 * @returns {{ rate: number, sampleTokens: number } | null}
 */
export function cacheHitRateInWindow(tokenEntries, startMs, endMs) {
  let raw = 0, read = 0, create = 0;
  for (const e of tokenEntries) {
    const ms = toMs(e.timestamp);
    if (!(ms >= startMs && ms < endMs)) continue;
    raw += e.rawInput || 0;
    read += e.cacheRead || 0;
    create += e.cacheCreation || 0;
  }
  const total = raw + read + create;
  if (total === 0) return null;
  return { rate: read / total, sampleTokens: total };
}

/**
 * Compute the share of each model family within a window.
 * Returns a plain object: { opus: 0..1, sonnet: 0..1, haiku: 0..1 }
 * @param {TokenEntry[]} tokenEntries
 * @param {number} startMs
 * @param {number} endMs
 * @returns {{ opus: number, sonnet: number, haiku: number, total: number }}
 */
export function modelMixInWindow(tokenEntries, startMs, endMs) {
  const counts = { opus: 0, sonnet: 0, haiku: 0 };
  let total = 0;
  for (const e of tokenEntries) {
    const ms = toMs(e.timestamp);
    if (!(ms >= startMs && ms < endMs)) continue;
    const m = String(e.model || '').toLowerCase();
    if (m.includes('opus')) counts.opus += 1;
    else if (m.includes('sonnet')) counts.sonnet += 1;
    else if (m.includes('haiku')) counts.haiku += 1;
    else continue;
    total += 1;
  }
  return {
    opus: total > 0 ? counts.opus / total : 0,
    sonnet: total > 0 ? counts.sonnet / total : 0,
    haiku: total > 0 ? counts.haiku / total : 0,
    total,
  };
}

/**
 * Detect probable causes of a regression by comparing secondary metrics
 * across the two windows. Returns an array of cause IDs the caller can
 * localize for display.
 *
 * Causes:
 *   - 'cache-drop'   : cache hit rate fell by ≥10 percentage points
 *   - 'opus-shift'   : opus share grew by ≥10 percentage points
 *   - 'context-growth': tokens per turn grew by ≥15% (set by caller, not here)
 *
 * @param {TokenEntry[]} tokenEntries
 * @param {{ startMs: number, endMs: number }} cur
 * @param {{ startMs: number, endMs: number }} prev
 * @returns {{
 *   cacheDrop: { prev: number, cur: number, deltaPct: number } | null,
 *   opusShift: { prev: number, cur: number, deltaPct: number } | null,
 * }}
 */
export function detectCauses(tokenEntries, cur, prev) {
  const curCache = cacheHitRateInWindow(tokenEntries, cur.startMs, cur.endMs);
  const prevCache = cacheHitRateInWindow(tokenEntries, prev.startMs, prev.endMs);
  let cacheDrop = null;
  if (curCache && prevCache) {
    const deltaPct = (curCache.rate - prevCache.rate) * 100; // percentage points
    if (deltaPct <= -10) {
      cacheDrop = { prev: prevCache.rate, cur: curCache.rate, deltaPct };
    }
  }

  const curMix = modelMixInWindow(tokenEntries, cur.startMs, cur.endMs);
  const prevMix = modelMixInWindow(tokenEntries, prev.startMs, prev.endMs);
  let opusShift = null;
  if (curMix.total > 0 && prevMix.total > 0) {
    const deltaPct = (curMix.opus - prevMix.opus) * 100;
    if (deltaPct >= 10) {
      opusShift = { prev: prevMix.opus, cur: curMix.opus, deltaPct };
    }
  }
  return { cacheDrop, opusShift };
}

/**
 * Compute a week-over-week regression report.
 *
 * Metrics:
 *   - latency          — avg response latency (ms per turn), lower is better
 *   - tokensPerTurn    — avg tokens per API turn (rawInput + out + cache*),
 *                        lower is better (indicates bloat)
 *   - sessionsPerDay   — activity volume (sessions/day), for context.
 *                        Lower current is a "slowdown" but we don't treat
 *                        that as a regression — it's reported as-is.
 *
 * @param {{
 *   latencyEntries?: LatencyEntry[],
 *   tokenEntries?: TokenEntry[],
 * }} usage
 * @param {number} todayMs
 * @param {number} [thresholdPct=15]
 * @param {number} [minSamples=5]
 */
export function computeRegression(usage, todayMs, thresholdPct = 15, minSamples = 5) {
  const { current, previous } = weekWindows(todayMs);
  const latencyEntries = (usage && usage.latencyEntries) || [];
  const tokenEntries = (usage && usage.tokenEntries) || [];

  // Latency: avg ms per turn
  const latCur = avgInWindow(latencyEntries, (e) => e.latencyMs, current.startMs, current.endMs);
  const latPrev = avgInWindow(latencyEntries, (e) => e.latencyMs, previous.startMs, previous.endMs);
  const latency = metricFromWindows(latCur, latPrev, thresholdPct, minSamples, /*higherIsWorse=*/ true);

  // Tokens per turn: avg total tokens per token entry
  const tokenOf = (e) => (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
  const tokCur = avgInWindow(tokenEntries, tokenOf, current.startMs, current.endMs);
  const tokPrev = avgInWindow(tokenEntries, tokenOf, previous.startMs, previous.endMs);
  const tokensPerTurn = metricFromWindows(tokCur, tokPrev, thresholdPct, minSamples, /*higherIsWorse=*/ true);

  // Sessions per day: activity volume (informational, never flagged regressed).
  const sessionsInWindow = (startMs, endMs) => {
    const set = new Set();
    for (const e of tokenEntries) {
      const ms = toMs(e.timestamp);
      if (ms >= startMs && ms < endMs && e.sessionId) set.add(e.sessionId);
    }
    return set.size;
  };
  const curSessions = sessionsInWindow(current.startMs, current.endMs);
  const prevSessions = sessionsInWindow(previous.startMs, previous.endMs);
  let sessionsPerDay = null;
  if (prevSessions > 0 || curSessions > 0) {
    const prevAvg = prevSessions / 7;
    const curAvg = curSessions / 7;
    sessionsPerDay = {
      current: curAvg,
      previous: prevAvg,
      deltaPct: prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0,
      regressed: false, // activity change isn't a regression
      sampleCurrent: curSessions,
      samplePrevious: prevSessions,
    };
  }

  const anyRegressed = !!((latency && latency.regressed) || (tokensPerTurn && tokensPerTurn.regressed));

  // Probable-cause detection runs only when there's an actual regression —
  // otherwise the extra passes over tokenEntries are wasted work.
  const causes = anyRegressed
    ? detectCauses(tokenEntries, current, previous)
    : { cacheDrop: null, opusShift: null };

  return {
    latency,
    tokensPerTurn,
    sessionsPerDay,
    anyRegressed,
    thresholdPct,
    currentWindow: current,
    previousWindow: previous,
    causes,
  };
}
