// @ts-check
// context-optimizer.mjs — pure rule-based optimization suggestion engine
// for the #overview page. Analyzes harness configuration and usage data
// to produce actionable recommendations with estimated savings.
//
// Build integration: the generator strips `export ` keywords and prepends
// the file to app.js. Source of truth lives here — don't edit the inlined
// copy.

/**
 * @typedef {{ id: string, ruleId: string, severity: 'high'|'medium'|'low',
 *   titleKey: string, descKey: string, descArgs: string[],
 *   savingsTokens: number, savingsCost: number,
 *   targetName: string }} Suggestion
 */

/**
 * @typedef {{ tokenEntries: Array<{ timestamp: number|string, model?: string|null,
 *   inputTokens?: number, outputTokens?: number, cacheRead?: number,
 *   cacheCreation?: number, rawInput?: number, context?: string,
 *   contextName?: string, sessionId?: string }>,
 *   contextStats: { globalClaudeTokens?: number, projectClaudeTokens?: number,
 *     autoMemoryTokens?: number, skillsDescTokens?: number,
 *     mcpToolsTokens?: number, principlesTokens?: number,
 *     mcpServersCount?: number, skillsCount?: number } | null,
 *   skills: Array<{ name: string }>,
 *   agents: Array<{ name: string }>,
 *   mcpServers: Array<{ name: string }>,
 *   memory: Array<{ name: string }>,
 *   usage: { skills?: Array<{ name: string, timestamp: number|string }>,
 *     agents?: Array<{ name: string, timestamp: number|string }>,
 *     mcpCalls?: Array<{ name: string, timestamp: number|string }> },
 *   dismissed: string[],
 *   calcEntryCostFn?: (entry: any) => number
 * }} OptimizerInput
 */

/**
 * Parse timestamp to ms.
 * @param {number|string} ts
 */
function optTsMs(ts) {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  return NaN;
}

/** Cost per million tokens (rough average for estimation). */
const AVG_COST_PER_M = 3.0;

/**
 * Estimate monthly sessions from token entries.
 * @param {Array<{sessionId?: string, timestamp?: number|string}>} entries
 */
function estimateMonthlySessionCount(entries) {
  if (!entries.length) return 30; // default fallback
  const sessionIds = new Set();
  let minTs = Infinity, maxTs = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].sessionId) sessionIds.add(entries[i].sessionId);
    const ms = optTsMs(entries[i].timestamp);
    if (!isNaN(ms)) {
      if (ms < minTs) minTs = ms;
      if (ms > maxTs) maxTs = ms;
    }
  }
  const days = Math.max(1, (maxTs - minTs) / 86400000);
  return Math.round(sessionIds.size / days * 30);
}

/**
 * Build set of names used in the last N days.
 * @param {Array<{name: string, timestamp: number|string}>} list
 * @param {number} days
 */
function usedInLastDays(list, days) {
  const cutoff = Date.now() - days * 86400000;
  const names = new Set();
  for (let i = 0; i < list.length; i++) {
    const ms = optTsMs(list[i].timestamp);
    if (!isNaN(ms) && ms >= cutoff) names.add(list[i].name);
  }
  return names;
}

// ── Individual rules ──
// Each returns a Suggestion or null.

/** R1: MCP server unused for 30 days but contributing hidden context. */
function ruleUnusedMcp(data) {
  const cs = data.contextStats;
  if (!cs || !data.mcpServers.length) return null;
  const used = usedInLastDays(data.usage.mcpCalls || [], 30);
  const unused = data.mcpServers.filter(function(m) { return !used.has(m.name); });
  if (!unused.length) return null;
  const perServer = cs.mcpServersCount ? (cs.mcpToolsTokens || 0) / cs.mcpServersCount : 50;
  const monthly = estimateMonthlySessionCount(data.tokenEntries);
  const savings = perServer * unused.length * monthly;
  return {
    id: 'unused-mcp:' + unused.map(function(m) { return m.name; }).join(','),
    ruleId: 'unused-mcp', severity: 'medium',
    titleKey: 'optUnusedMcp', descKey: 'optUnusedMcpDesc',
    descArgs: [String(unused.length), unused.map(function(m) { return m.name; }).join(', ')],
    savingsTokens: savings, savingsCost: savings * AVG_COST_PER_M / 1e6,
    targetName: unused[0].name,
  };
}

/** R2: Skill unused for 30 days. */
function ruleUnusedSkill(data) {
  if (!data.skills.length) return null;
  const used = usedInLastDays(data.usage.skills || [], 30);
  // Also match "plugin:skill" → "skill"
  const usedExpanded = new Set(used);
  used.forEach(function(n) {
    if (n.includes(':')) usedExpanded.add(n.split(':').pop());
  });
  const unused = data.skills.filter(function(s) { return !usedExpanded.has(s.name); });
  if (unused.length < 2) return null; // one unused is normal
  const cs = data.contextStats;
  const perSkill = cs && cs.skillsCount ? (cs.skillsDescTokens || 0) / cs.skillsCount : 10;
  const monthly = estimateMonthlySessionCount(data.tokenEntries);
  const savings = perSkill * unused.length * monthly;
  return {
    id: 'unused-skill:' + unused.length,
    ruleId: 'unused-skill', severity: 'low',
    titleKey: 'optUnusedSkill', descKey: 'optUnusedSkillDesc',
    descArgs: [String(unused.length), unused.slice(0, 3).map(function(s) { return s.name; }).join(', ')],
    savingsTokens: savings, savingsCost: savings * AVG_COST_PER_M / 1e6,
    targetName: '',
  };
}

/** R3: Memory file with no references in usage. */
function ruleUnusedMemory(data) {
  if (!data.memory || !data.memory.length) return null;
  // Memory files don't have direct usage tracking, so check if the name
  // appears in any contextName across tokenEntries
  const referenced = new Set();
  const entries = data.tokenEntries || [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].contextName) referenced.add(entries[i].contextName);
  }
  const unused = data.memory.filter(function(m) { return !referenced.has(m.name); });
  if (unused.length < 2) return null;
  const estTokens = unused.length * 200; // rough estimate per memory file
  const monthly = estimateMonthlySessionCount(data.tokenEntries);
  return {
    id: 'unused-memory:' + unused.length,
    ruleId: 'unused-memory', severity: 'low',
    titleKey: 'optUnusedMemory', descKey: 'optUnusedMemoryDesc',
    descArgs: [String(unused.length), unused.slice(0, 3).map(function(m) {
      var base = (m.filePath || m.name || '').replace(/\\/g, '/');
      var fn = base.split('/').pop() || m.name;
      return fn.replace(/\.md$/, '');
    }).join(', ')],
    savingsTokens: estTokens * monthly, savingsCost: estTokens * monthly * AVG_COST_PER_M / 1e6,
    targetName: '',
  };
}

/** R4: CLAUDE.md tokens exceed threshold. */
function ruleLargeClaudeMd(data) {
  const cs = data.contextStats;
  if (!cs) return null;
  const total = (cs.globalClaudeTokens || 0) + (cs.projectClaudeTokens || 0);
  if (total <= 3000) return null;
  const excess = total - 3000;
  const monthly = estimateMonthlySessionCount(data.tokenEntries);
  return {
    id: 'large-claude-md',
    ruleId: 'large-claude-md', severity: 'medium',
    titleKey: 'optLargeClaudeMd', descKey: 'optLargeClaudeMdDesc',
    descArgs: [String(total), String(excess)],
    savingsTokens: excess * monthly, savingsCost: excess * monthly * AVG_COST_PER_M / 1e6,
    targetName: 'CLAUDE.md',
  };
}

/** R5: Low cache hit rate (<50%). */
function ruleLowCacheHit(data) {
  const entries = data.tokenEntries || [];
  let totalRead = 0, totalCreation = 0;
  for (let i = 0; i < entries.length; i++) {
    totalRead += (entries[i].cacheRead || 0);
    totalCreation += (entries[i].cacheCreation || 0);
  }
  const denom = totalRead + totalCreation;
  if (denom < 10000) return null; // too little data
  const hitRate = totalRead / denom;
  if (hitRate >= 0.5) return null;
  return {
    id: 'low-cache-hit',
    ruleId: 'low-cache-hit', severity: 'medium',
    titleKey: 'optLowCacheHit', descKey: 'optLowCacheHitDesc',
    descArgs: [String(Math.round(hitRate * 100))],
    savingsTokens: 0, savingsCost: 0,
    targetName: '',
  };
}

/** R6: Skill with avg cost/call > 2x median. */
function ruleHighCostSkill(data) {
  const entries = data.tokenEntries || [];
  const costFn = data.calcEntryCostFn || (function() { return 0; });
  // Aggregate cost per skill
  const skillCost = {};
  const skillCount = {};
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].context !== 'skill') continue;
    const name = entries[i].contextName || '';
    skillCost[name] = (skillCost[name] || 0) + costFn(entries[i]);
    skillCount[name] = (skillCount[name] || 0) + 1;
  }
  const avgs = [];
  var names = Object.keys(skillCost);
  for (let i = 0; i < names.length; i++) {
    if (skillCount[names[i]] >= 3) { // need enough samples
      avgs.push({ name: names[i], avg: skillCost[names[i]] / skillCount[names[i]] });
    }
  }
  if (avgs.length < 3) return null;
  avgs.sort(function(a, b) { return a.avg - b.avg; });
  const median = avgs[Math.floor(avgs.length / 2)].avg;
  if (median === 0) return null;
  const expensive = avgs.filter(function(a) { return a.avg > median * 2; });
  if (!expensive.length) return null;
  const top = expensive[expensive.length - 1]; // most expensive
  return {
    id: 'high-cost-skill:' + top.name,
    ruleId: 'high-cost-skill', severity: 'medium',
    titleKey: 'optHighCostSkill', descKey: 'optHighCostSkillDesc',
    descArgs: [top.name, String(Math.round(top.avg / median)) + 'x'],
    savingsTokens: 0, savingsCost: 0,
    targetName: top.name,
  };
}

/** R7: Opus model used for >60% of calls. */
function ruleOpusOveruse(data) {
  const entries = data.tokenEntries || [];
  if (entries.length < 10) return null;
  let opusCount = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].model && entries[i].model.indexOf('opus') !== -1) opusCount++;
  }
  const ratio = opusCount / entries.length;
  if (ratio <= 0.6) return null;
  return {
    id: 'opus-overuse',
    ruleId: 'opus-overuse', severity: 'low',
    titleKey: 'optOpusOveruse', descKey: 'optOpusOveruseDesc',
    descArgs: [String(Math.round(ratio * 100))],
    savingsTokens: 0, savingsCost: 0,
    targetName: '',
  };
}

/** R8: Hidden context > 40% of total input. */
function ruleContextBloat(data) {
  const cs = data.contextStats;
  if (!cs) return null;
  const hidden = (cs.globalClaudeTokens || 0) + (cs.projectClaudeTokens || 0)
    + (cs.autoMemoryTokens || 0) + (cs.skillsDescTokens || 0)
    + (cs.mcpToolsTokens || 0) + (cs.principlesTokens || 0);
  if (hidden === 0) return null;
  const entries = data.tokenEntries || [];
  let totalInput = 0;
  for (let i = 0; i < entries.length; i++) {
    totalInput += (entries[i].inputTokens || entries[i].rawInput || 0);
  }
  if (totalInput === 0) return null;
  const sessionIds = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].sessionId) sessionIds.add(entries[i].sessionId);
  }
  const totalHidden = hidden * Math.max(sessionIds.size, 1);
  const ratio = totalHidden / (totalInput + totalHidden);
  if (ratio <= 0.4) return null;
  return {
    id: 'context-bloat',
    ruleId: 'context-bloat', severity: 'high',
    titleKey: 'optContextBloat', descKey: 'optContextBloatDesc',
    descArgs: [String(Math.round(ratio * 100))],
    savingsTokens: 0, savingsCost: 0,
    targetName: '',
  };
}

const ALL_RULES = [
  ruleUnusedMcp, ruleUnusedSkill, ruleUnusedMemory,
  ruleLargeClaudeMd, ruleLowCacheHit, ruleHighCostSkill,
  ruleOpusOveruse, ruleContextBloat,
];

/**
 * Compute optimization suggestions.
 * @param {OptimizerInput} data
 * @returns {Suggestion[]}
 */
export function computeSuggestions(data) {
  const dismissed = new Set(data.dismissed || []);
  /** @type {Suggestion[]} */
  const results = [];
  for (let i = 0; i < ALL_RULES.length; i++) {
    var s = ALL_RULES[i](data);
    if (s && !dismissed.has(s.id)) results.push(s);
  }
  // Sort by severity: high > medium > low
  const order = { high: 0, medium: 1, low: 2 };
  results.sort(function(a, b) {
    var oa = order[a.severity] != null ? order[a.severity] : 2;
    var ob = order[b.severity] != null ? order[b.severity] : 2;
    return oa - ob;
  });
  return results;
}
