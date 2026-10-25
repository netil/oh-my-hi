// @ts-check
// overview-data.mjs: series and matrices behind the overview's control panel
// (pure logic, no DOM). Days are local calendar days (see date-key.mjs).

import { dateKey, tsDateKey } from './date-key.mjs';

/** Calls a usage row stands for: 1 per v4 call row, `count` for legacy daily aggregates. */
function rowCount(r) {
  return typeof r.count === 'number' ? r.count : 1;
}

/** @param {number|string} ts */
function toMs(ts) {
  return typeof ts === 'number' ? ts : new Date(ts).getTime();
}

/**
 * Local day keys for the `numDays` days ending on `end`, oldest first.
 * @param {Date} end
 * @param {number} numDays
 * @returns {string[]}
 */
export function dayKeysEnding(end, numDays) {
  const keys = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    keys.push(dateKey(d));
  }
  return keys;
}

/**
 * Per-day totals over the given days: skill / agent / MCP calls, tokens
 * (input + output + cache), distinct sessions and estimated cost.
 * Rows outside `days` are ignored.
 * @param {{ skills?: any[], agents?: any[], mcpCalls?: any[], tokenEntries?: any[] }} usage
 * @param {string[]} days local day keys (see dayKeysEnding)
 * @param {(entry: any) => number} [costFn]
 */
export function buildDailySeries(usage, days, costFn) {
  const index = new Map(days.map((d, i) => [d, i]));
  const zeros = () => days.map(() => 0);
  const out = { days, skills: zeros(), agents: zeros(), mcp: zeros(), tokens: zeros(), cost: zeros(), sessions: zeros() };
  /** @param {any[]|undefined} list @param {number[]} target */
  const addCalls = (list, target) => {
    for (const r of list || []) {
      const i = index.get(tsDateKey(r.timestamp));
      if (i !== undefined) target[i] += rowCount(r);
    }
  };
  addCalls(usage.skills, out.skills);
  addCalls(usage.agents, out.agents);
  addCalls(usage.mcpCalls, out.mcp);
  const sessionSets = days.map(() => new Set());
  for (const e of usage.tokenEntries || []) {
    const i = index.get(tsDateKey(e.timestamp));
    if (i === undefined) continue;
    out.tokens[i] += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
    if (costFn) out.cost[i] += costFn(e) || 0;
    if (e.sessionId) sessionSets[i].add(e.sessionId);
  }
  out.sessions = sessionSets.map((s) => s.size);
  return out;
}

/**
 * Weekday x hour activity, Monday first (row 0) to Sunday (row 6), hours 0-23
 * in local time. Per cell: responses (`cells`), tokens and distinct sessions;
 * plus the busiest cell's response count and the distinct sessions overall.
 * @param {Array<{ timestamp: number|string, sessionId?: string|null, rawInput?: number,
 *   outputTokens?: number, cacheRead?: number, cacheCreation?: number }>} tokenEntries
 * @returns {{ cells: number[][], tokens: number[][], sessionCounts: number[][], max: number, sessions: number }}
 */
export function buildHourMatrix(tokenEntries) {
  const grid = (fill) => Array.from({ length: 7 }, () => Array.from({ length: 24 }, fill));
  const cells = grid(() => 0), tokens = grid(() => 0);
  const cellSessions = grid(() => new Set());
  const sessions = new Set();
  let max = 0;
  for (const e of tokenEntries || []) {
    const ms = toMs(e.timestamp);
    if (isNaN(ms)) continue;
    const d = new Date(ms);
    const row = (d.getDay() + 6) % 7, h = d.getHours();
    const v = ++cells[row][h];
    if (v > max) max = v;
    tokens[row][h] += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
    if (e.sessionId) { sessions.add(e.sessionId); cellSessions[row][h].add(e.sessionId); }
  }
  const sessionCounts = cellSessions.map((r) => r.map((s) => s.size));
  return { cells, tokens, sessionCounts, max, sessions: sessions.size };
}

/**
 * Whether a usage row's name refers to a catalog item. A plugin skill is
 * logged as "plugin:skill" and matches the skill "skill".
 * @param {string} logName
 * @param {string} itemName
 */
export function matchUsageName(logName, itemName) {
  if (logName === itemName) return true;
  if (logName.includes(':') && logName.split(':').pop() === itemName) return true;
  return false;
}

/**
 * @typedef {{ kind: string, name: string, calls: number|null, last: number|null,
 *   ctx: number, unused: boolean }} ItemRow
 */

/**
 * One row per harness item for the overview workbench: calls in the period,
 * latest call ever, and estimated context tokens (tokens of turns attributed
 * to the item, plus its startup share times the period's sessions).
 * Items without call data (principles) get `calls: null`.
 * @param {{
 *   items: Array<{ kind: string, name: string }>,
 *   usage: Record<string, Array<{ name: string, timestamp: number|string, count?: number }>|undefined>,
 *   inPeriod: (row: any) => boolean,
 *   turnTokens: Record<string, number>,
 *   startup: Array<{ kind: string, name: string, tokens: number }>,
 *   sessions: number,
 * }} input `usage` is keyed by item kind (skills, agents, mcpServers)
 * @returns {ItemRow[]} most called first, then largest context
 */
export function buildItemRows({ items, usage, inPeriod, turnTokens, startup, sessions }) {
  const startupOf = {};
  for (const s of startup || []) startupOf[s.kind + '\0' + s.name] = s.tokens;
  const rows = items.map((it) => {
    const list = usage[it.kind];
    let calls = null, last = null;
    if (list) {
      calls = 0;
      for (const r of list) {
        if (!matchUsageName(r.name, it.name)) continue;
        if (inPeriod(r)) calls += rowCount(r);
        const ms = toMs(r.timestamp);
        if (!isNaN(ms) && (last === null || ms > last)) last = ms;
      }
    }
    const ctx = (turnTokens[it.name] || 0) + (startupOf[it.kind + '\0' + it.name] || 0) * Math.max(sessions, 1);
    return { kind: it.kind, name: it.name, calls, last, ctx, unused: calls === 0 };
  });
  return rows.sort((a, b) => (b.calls ?? -1) - (a.calls ?? -1) || b.ctx - a.ctx || a.name.localeCompare(b.name));
}

/**
 * @param {ItemRow[]} rows
 * @param {{ kind?: string, unusedOnly?: boolean, minCtx?: number }} filter
 */
export function filterItemRows(rows, { kind = 'all', unusedOnly = false, minCtx = 0 } = {}) {
  return rows.filter((r) => (kind === 'all' || r.kind === kind)
    && (!unusedOnly || r.unused)
    && r.ctx >= minCtx);
}
