// @ts-check
// cache-ttl.mjs — Cache TTL impact analysis (pure logic, no DOM)

/**
 * @typedef {{ read: number, creation: number }} DayCacheData
 * @typedef {{ dailyCacheMap: Record<string, DayCacheData>, sortedDates: string[] }} CacheMapResult
 * @typedef {{ bestEff: number, worstEff: number, bestEffPct: number, worstEffPct: number }} RollingEffResult
 * @typedef {{ excessCreation: number, wasteCost: number, avgPriceDelta: number }} WasteCostResult
 */

/**
 * Build per-day cache read/creation totals from token entries.
 * @param {Array<{ timestamp: number|string, cacheRead?: number, cacheCreation?: number }>} tokenEntries
 * @returns {CacheMapResult}
 */
export function buildDailyCacheMap(tokenEntries) {
  /** @type {Record<string, DayCacheData>} */
  const dailyCacheMap = {};
  tokenEntries.forEach((e) => {
    const dk = new Date(typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp))
      .toISOString().substring(0, 10);
    if (!dailyCacheMap[dk]) dailyCacheMap[dk] = { read: 0, creation: 0 };
    dailyCacheMap[dk].read += e.cacheRead || 0;
    dailyCacheMap[dk].creation += e.cacheCreation || 0;
  });
  const sortedDates = Object.keys(dailyCacheMap).sort();
  return { dailyCacheMap, sortedDates };
}

/**
 * Compute best/worst 7-day rolling cache efficiency.
 * @param {Record<string, DayCacheData>} dailyCacheMap
 * @param {string[]} sortedDates
 * @returns {RollingEffResult}
 */
export function computeRollingEfficiency(dailyCacheMap, sortedDates) {
  let bestEff = 0, worstEff = 1;
  for (let i = 0; i < sortedDates.length; i++) {
    let wRead = 0, wCreate = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      wRead += dailyCacheMap[sortedDates[j]].read;
      wCreate += dailyCacheMap[sortedDates[j]].creation;
    }
    const wEff = (wRead + wCreate) > 0 ? wRead / (wRead + wCreate) : 0;
    if (wEff > bestEff) bestEff = wEff;
    if (wEff > 0 && wEff < worstEff) worstEff = wEff;
  }
  return {
    bestEff,
    worstEff,
    bestEffPct: Math.round(bestEff * 100),
    worstEffPct: Math.round(worstEff * 100),
  };
}

/**
 * Estimate waste cost from excess cache creation vs best-period baseline.
 * @param {{ totalCacheRead: number, totalCacheCreation: number, bestEff: number }} params
 * @param {Array<{ model?: string, cacheRead?: number, cacheCreation?: number }>} tokenEntries
 * @param {Record<string, { cacheRead: number, cacheCreation: number }>} modelPricing
 * @param {(model: string|undefined) => string|null} resolvePricingKey
 * @returns {WasteCostResult}
 */
export function computeWasteCost({ totalCacheRead, totalCacheCreation, bestEff }, tokenEntries, modelPricing, resolvePricingKey) {
  // Weighted average (cacheCreation - cacheRead) price delta per model
  let weightedDelta = 0, totalWeight = 0;
  tokenEntries.forEach((e) => {
    const key = resolvePricingKey(e.model);
    if (!key) return;
    const p = modelPricing[key];
    const w = (e.cacheCreation || 0) + (e.cacheRead || 0);
    weightedDelta += (p.cacheCreation - p.cacheRead) * w;
    totalWeight += w;
  });
  const avgPriceDelta = totalWeight > 0 ? weightedDelta / totalWeight : 3.45;

  // Excess creation = actual creation - what creation would be at best efficiency
  const excessCreation = Math.max(
    0,
    totalCacheCreation - (totalCacheRead + totalCacheCreation) * (1 - bestEff)
  );
  const wasteCost = excessCreation * avgPriceDelta / 1e6;

  return { excessCreation, wasteCost, avgPriceDelta };
}

/**
 * Compute per-day rolling efficiency series for charting.
 * @param {Record<string, DayCacheData>} dailyCacheMap
 * @param {string[]} sortedDates
 * @returns {number[]} rolling efficiency % (0-100) per date
 */
export function computeRollingEfficiencySeries(dailyCacheMap, sortedDates) {
  return sortedDates.map((dk, i) => {
    let wRead = 0, wCreate = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      wRead += dailyCacheMap[sortedDates[j]].read;
      wCreate += dailyCacheMap[sortedDates[j]].creation;
    }
    return (wRead + wCreate) > 0 ? Math.round((wRead / (wRead + wCreate)) * 100) : 0;
  });
}
