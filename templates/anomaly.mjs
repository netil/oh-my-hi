// @ts-check
// anomaly.mjs — Daily usage anomaly detection (pure logic, no DOM)
//
// Flags days whose token usage or estimated cost spikes abnormally versus
// recent history, so runaway sessions (looping agents etc.) can be caught
// after the fact. Follows the project's 7-day rolling-window convention
// (see cache-ttl.mjs), but the baseline EXCLUDES the day being evaluated.

/**
 * @typedef {{ tokens: number, cost: number }} DayUsage
 * @typedef {{ dailyMap: Record<string, DayUsage>, sortedDates: string[] }} DailySeriesResult
 * @typedef {{
 *   date: string, tokens: number, cost: number,
 *   tokenBaseline: number, costBaseline: number,
 *   tokenRatio: number, costRatio: number,
 *   kind: 'tokens'|'cost'|'both'
 * }} DailyAnomaly
 */

// Detection defaults — trailing 7 active days, spike = > 2× baseline mean,
// with absolute floors so trivial days never get flagged.
export const ANOMALY_WINDOW = 7;
export const ANOMALY_MULTIPLIER = 2;
export const ANOMALY_MIN_BASELINE_DAYS = 3;
export const ANOMALY_TOKEN_FLOOR = 1e6; // 1M tokens/day
export const ANOMALY_COST_FLOOR = 1;    // $1/day

/**
 * Build per-day token/cost totals from token entries.
 * Token total = rawInput + output + cacheRead + cacheCreation (same formula
 * as the daily insights in app.js).
 * @param {Array<{ timestamp: number|string, rawInput?: number, outputTokens?: number, cacheRead?: number, cacheCreation?: number }>} tokenEntries
 * @param {(entry: object) => number} [calcEntryCostFn] per-entry cost estimator; omit to skip cost
 * @returns {DailySeriesResult}
 */
export function buildDailyUsageSeries(tokenEntries, calcEntryCostFn) {
  /** @type {Record<string, DayUsage>} */
  const dailyMap = {};
  tokenEntries.forEach((e) => {
    const d = new Date(typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp));
    if (isNaN(d.getTime())) return;
    const dk = d.toISOString().substring(0, 10);
    if (!dailyMap[dk]) dailyMap[dk] = { tokens: 0, cost: 0 };
    dailyMap[dk].tokens += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
    if (calcEntryCostFn) dailyMap[dk].cost += calcEntryCostFn(e) || 0;
  });
  const sortedDates = Object.keys(dailyMap).sort();
  return { dailyMap, sortedDates };
}

/**
 * Detect anomalous days against a trailing rolling baseline.
 *
 * For each day, the baseline is the mean of up to `window` PREVIOUS active
 * days (the evaluated day is excluded). A day is anomalous when:
 *   value > multiplier × baseline mean  AND  value >= absolute floor
 * for either tokens or estimated cost. Days with fewer than
 * `minBaselineDays` prior active days are never flagged.
 *
 * @param {Record<string, DayUsage>} dailyMap
 * @param {string[]} sortedDates ascending date keys
 * @param {{ window?: number, multiplier?: number, minBaselineDays?: number, tokenFloor?: number, costFloor?: number }} [opts]
 * @returns {DailyAnomaly[]} most recent first
 */
export function detectDailyAnomalies(dailyMap, sortedDates, opts) {
  const o = opts || {};
  const window = o.window != null ? o.window : ANOMALY_WINDOW;
  const multiplier = o.multiplier != null ? o.multiplier : ANOMALY_MULTIPLIER;
  const minBaselineDays = o.minBaselineDays != null ? o.minBaselineDays : ANOMALY_MIN_BASELINE_DAYS;
  const tokenFloor = o.tokenFloor != null ? o.tokenFloor : ANOMALY_TOKEN_FLOOR;
  const costFloor = o.costFloor != null ? o.costFloor : ANOMALY_COST_FLOOR;

  /** @type {DailyAnomaly[]} */
  const anomalies = [];
  for (let i = 0; i < sortedDates.length; i++) {
    const start = Math.max(0, i - window);
    const n = i - start;
    if (n < minBaselineDays) continue;
    let tokSum = 0, costSum = 0;
    for (let j = start; j < i; j++) {
      tokSum += dailyMap[sortedDates[j]].tokens;
      costSum += dailyMap[sortedDates[j]].cost;
    }
    const tokenBaseline = tokSum / n;
    const costBaseline = costSum / n;
    const day = dailyMap[sortedDates[i]];
    const tokenSpike = tokenBaseline > 0 && day.tokens > multiplier * tokenBaseline && day.tokens >= tokenFloor;
    const costSpike = costBaseline > 0 && day.cost > multiplier * costBaseline && day.cost >= costFloor;
    if (!tokenSpike && !costSpike) continue;
    anomalies.push({
      date: sortedDates[i],
      tokens: day.tokens,
      cost: day.cost,
      tokenBaseline: tokenBaseline,
      costBaseline: costBaseline,
      tokenRatio: tokenBaseline > 0 ? day.tokens / tokenBaseline : 0,
      costRatio: costBaseline > 0 ? day.cost / costBaseline : 0,
      kind: tokenSpike && costSpike ? 'both' : (tokenSpike ? 'tokens' : 'cost'),
    });
  }
  anomalies.reverse(); // most recent first
  return anomalies;
}
