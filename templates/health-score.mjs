// @ts-check
// health-score.mjs — pure Harness Health Score calculator for the
// #overview page. Evaluates 5 weighted factors to produce a 0–100 score.
//
// Build integration: the generator strips `export ` keywords and prepends
// the file to app.js. Source of truth lives here — don't edit the inlined
// copy.

/**
 * @typedef {{ name: string, score: number, weight: number,
 *   raw: any, suggestionKey: string }} HealthFactor
 */

/**
 * @typedef {{ total: number, grade: string,
 *   factors: HealthFactor[] }} HealthReport
 */

/**
 * @typedef {{ tokenEntries: Array<{ timestamp: number|string, model?: string|null,
 *   inputTokens?: number, outputTokens?: number, cacheRead?: number,
 *   cacheCreation?: number, rawInput?: number, context?: string,
 *   contextName?: string, sessionId?: string }>,
 *   contextStats: { globalClaudeTokens?: number, projectClaudeTokens?: number,
 *     autoMemoryTokens?: number, skillsDescTokens?: number,
 *     mcpToolsTokens?: number, principlesTokens?: number } | null,
 *   skills: Array<{ name: string }>,
 *   agents: Array<{ name: string }>,
 *   mcpServers: Array<{ name: string }>,
 *   usage: { skills?: Array<{ name: string, timestamp: number|string }>,
 *     agents?: Array<{ name: string, timestamp: number|string }>,
 *     mcpCalls?: Array<{ name: string, timestamp: number|string }> },
 *   calcEntryCostFn?: (entry: any) => number
 * }} HealthInput
 */

const WEIGHTS = {
  contextEfficiency: 0.30,
  costTrend: 0.25,
  unusedItems: 0.20,
  cacheEfficiency: 0.15,
  coverage: 0.10,
};

/**
 * Clamp a value to [0, 100].
 * @param {number} v
 */
function clamp100(v) {
  return Math.max(0, Math.min(100, v));
}

/**
 * Parse a timestamp to ms epoch.
 * @param {number|string} ts
 */
function tsMs(ts) {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  return NaN;
}

/**
 * Score context efficiency: how much of total input is hidden (startup) context.
 * Lower hidden ratio → higher score.
 * @param {HealthInput} data
 * @returns {HealthFactor}
 */
function scoreContextEfficiency(data) {
  const cs = data.contextStats;
  if (!cs) {
    return { name: 'contextEfficiency', score: 50, weight: WEIGHTS.contextEfficiency,
      raw: { hiddenTokens: 0, totalInput: 0, ratio: 0 }, suggestionKey: 'healthSugContext' };
  }
  const hiddenPerSession = (cs.globalClaudeTokens || 0) + (cs.projectClaudeTokens || 0)
    + (cs.autoMemoryTokens || 0) + (cs.skillsDescTokens || 0)
    + (cs.mcpToolsTokens || 0) + (cs.principlesTokens || 0);
  const entries = data.tokenEntries || [];
  let totalInput = 0;
  for (let i = 0; i < entries.length; i++) {
    totalInput += (entries[i].inputTokens || entries[i].rawInput || 0);
  }
  if (totalInput === 0) {
    return { name: 'contextEfficiency', score: 50, weight: WEIGHTS.contextEfficiency,
      raw: { hiddenPerSession, totalInput: 0, ratio: 0 }, suggestionKey: 'healthSugContext' };
  }
  // Estimate total hidden across all sessions
  const sessionIds = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].sessionId) sessionIds.add(entries[i].sessionId);
  }
  const totalHidden = hiddenPerSession * Math.max(sessionIds.size, 1);
  const ratio = totalHidden / (totalInput + totalHidden);
  // 0% hidden → 100, 60%+ hidden → 0
  const score = clamp100(100 - (ratio * 100 / 0.6 * 100 / 100));
  return { name: 'contextEfficiency', score: Math.round(score), weight: WEIGHTS.contextEfficiency,
    raw: { hiddenPerSession, totalInput, ratio: Math.round(ratio * 1000) / 1000 }, suggestionKey: 'healthSugContext' };
}

/**
 * Score cost trend: compare recent 7-day daily avg vs previous 7-day avg.
 * Decrease/stable → high score, increase → low score.
 * @param {HealthInput} data
 * @returns {HealthFactor}
 */
function scoreCostTrend(data) {
  const entries = data.tokenEntries || [];
  const costFn = data.calcEntryCostFn || (() => 0);
  const now = Date.now();
  const d7 = 7 * 86400000;

  let currentCost = 0, prevCost = 0;
  let currentCount = 0, prevCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const ms = tsMs(entries[i].timestamp);
    if (isNaN(ms)) continue;
    const age = now - ms;
    if (age <= d7) {
      currentCost += costFn(entries[i]);
      currentCount++;
    } else if (age <= d7 * 2) {
      prevCost += costFn(entries[i]);
      prevCount++;
    }
  }
  if (prevCount === 0) {
    return { name: 'costTrend', score: 75, weight: WEIGHTS.costTrend,
      raw: { currentCost, prevCost, changePct: 0 }, suggestionKey: 'healthSugCostTrend' };
  }
  const currentAvg = currentCost / 7;
  const prevAvg = prevCost / 7;
  const changePct = prevAvg === 0 ? 0 : ((currentAvg - prevAvg) / prevAvg * 100);

  let score;
  if (changePct <= 5) {
    score = 100; // stable or decreasing
  } else if (changePct >= 100) {
    score = 0; // doubled or worse
  } else {
    score = 100 - ((changePct - 5) / 95 * 100);
  }
  return { name: 'costTrend', score: Math.round(clamp100(score)), weight: WEIGHTS.costTrend,
    raw: { currentCost: Math.round(currentCost * 1000) / 1000, prevCost: Math.round(prevCost * 1000) / 1000,
      changePct: Math.round(changePct) }, suggestionKey: 'healthSugCostTrend' };
}

/**
 * Score unused items: % of skills + agents + MCP with 0 usage in 30 days.
 * Fewer unused → higher score.
 * @param {HealthInput} data
 * @returns {HealthFactor}
 */
function scoreUnusedItems(data) {
  const d30 = 30 * 86400000;
  const cutoff = Date.now() - d30;

  // Build set of names used in last 30 days
  const usedNames = new Set();
  const lists = [data.usage.skills, data.usage.agents, data.usage.mcpCalls];
  for (let li = 0; li < lists.length; li++) {
    const list = lists[li] || [];
    for (let i = 0; i < list.length; i++) {
      const ms = tsMs(list[i].timestamp);
      if (!isNaN(ms) && ms >= cutoff) usedNames.add(list[i].name);
    }
  }

  const allItems = [].concat(
    (data.skills || []).map(function(s) { return s.name; }),
    (data.agents || []).map(function(a) { return a.name; }),
    (data.mcpServers || []).map(function(m) { return m.name; })
  );
  const total = allItems.length;
  if (total === 0) {
    return { name: 'unusedItems', score: 100, weight: WEIGHTS.unusedItems,
      raw: { total: 0, unused: 0 }, suggestionKey: 'healthSugUnused' };
  }
  let unused = 0;
  for (let i = 0; i < allItems.length; i++) {
    if (!usedNames.has(allItems[i])) unused++;
  }
  const score = 100 * (1 - unused / total);
  return { name: 'unusedItems', score: Math.round(clamp100(score)), weight: WEIGHTS.unusedItems,
    raw: { total, unused }, suggestionKey: 'healthSugUnused' };
}

/**
 * Score cache efficiency: cacheRead / (cacheRead + cacheCreation).
 * Higher ratio → cache is being reused well.
 * @param {HealthInput} data
 * @returns {HealthFactor}
 */
function scoreCacheEfficiency(data) {
  const entries = data.tokenEntries || [];
  let totalRead = 0, totalCreation = 0;
  for (let i = 0; i < entries.length; i++) {
    totalRead += (entries[i].cacheRead || 0);
    totalCreation += (entries[i].cacheCreation || 0);
  }
  const denom = totalRead + totalCreation;
  if (denom === 0) {
    return { name: 'cacheEfficiency', score: 50, weight: WEIGHTS.cacheEfficiency,
      raw: { totalRead: 0, totalCreation: 0, ratio: 0 }, suggestionKey: 'healthSugCache' };
  }
  const ratio = totalRead / denom;
  const score = ratio * 100;
  return { name: 'cacheEfficiency', score: Math.round(clamp100(score)), weight: WEIGHTS.cacheEfficiency,
    raw: { totalRead, totalCreation, ratio: Math.round(ratio * 1000) / 1000 }, suggestionKey: 'healthSugCache' };
}

/**
 * Score coverage: skills that have at least one usage entry / total skills.
 * Proxy for "are your skills actually useful?"
 * @param {HealthInput} data
 * @returns {HealthFactor}
 */
function scoreCoverage(data) {
  const skills = data.skills || [];
  if (skills.length === 0) {
    return { name: 'coverage', score: 100, weight: WEIGHTS.coverage,
      raw: { total: 0, covered: 0 }, suggestionKey: 'healthSugCoverage' };
  }
  const usedSkills = new Set();
  const list = data.usage.skills || [];
  for (let i = 0; i < list.length; i++) {
    usedSkills.add(list[i].name);
    // Also match "plugin:skill" → "skill"
    if (list[i].name.includes(':')) usedSkills.add(list[i].name.split(':').pop());
  }
  let covered = 0;
  for (let i = 0; i < skills.length; i++) {
    if (usedSkills.has(skills[i].name)) covered++;
  }
  const score = 100 * (covered / skills.length);
  return { name: 'coverage', score: Math.round(clamp100(score)), weight: WEIGHTS.coverage,
    raw: { total: skills.length, covered }, suggestionKey: 'healthSugCoverage' };
}

/**
 * Map numeric score to letter grade.
 * @param {number} score
 * @returns {string}
 */
function toGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Compute the Harness Health Score.
 * @param {HealthInput} data
 * @returns {HealthReport}
 */
export function computeHealthScore(data) {
  const factors = [
    scoreContextEfficiency(data),
    scoreCostTrend(data),
    scoreUnusedItems(data),
    scoreCacheEfficiency(data),
    scoreCoverage(data),
  ];
  let total = 0;
  for (let i = 0; i < factors.length; i++) {
    total += factors[i].score * factors[i].weight;
  }
  total = Math.round(clamp100(total));
  return { total, grade: toGrade(total), factors };
}
