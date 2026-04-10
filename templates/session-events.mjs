// @ts-check
// session-events.mjs — pure session analysis helpers used by the Context
// Explorer. Extracted from templates/app.js so they can be unit-tested without
// a browser. All functions here are pure: output depends solely on arguments,
// no closure state, no DOM, no globals.
//
// Build integration: the generator strips `export ` keywords and prepends the
// file to app.js. Source of truth lives here — don't edit the inlined copy.

/**
 * @typedef {{ timestamp: number|string, model: string|null, inputTokens: number,
 *   outputTokens: number, cacheRead: number, cacheCreation: number,
 *   rawInput: number, context: string, contextName: string,
 *   sessionId: string, latencyMs?: number }} TokenEntry
 */

/**
 * @typedef {{ timestamp: number|string, text: string, preview: string,
 *   charLen: number, sessionId: string }} PromptStat
 */

/**
 * @typedef {{ tokenEntries: TokenEntry[], promptStats: PromptStat[] }} UsageData
 */

/**
 * @typedef {{ globalClaudeTokens?: number, projectClaudeTokens?: number,
 *   autoMemoryTokens?: number, skillsDescTokens?: number,
 *   mcpToolsTokens?: number, principlesTokens?: number }} ContextStats
 */

/**
 * @typedef {{ ev1: string, ev2: string, ev3: string, ev4: string, ev5: string,
 *   ev6: string, ev7: string, principles: string,
 *   globalClaude?: string, projectClaude?: string, autoMemory?: string,
 *   skillsDesc?: string, mcpTools?: string }} ContextLabels
 */

/**
 * @typedef {{ id: string, count: number, minTs: number, maxTs: number,
 *   firstPrompt: { ts: number, text: string|null, len: number }|null,
 *   model: string|null, peakTokens: number }} ReplayableSession
 */

/**
 * @typedef {{ isSession: boolean, isSynthetic?: boolean, id: number,
 *   t: number, kind: string, tokens: number, color: string,
 *   vis: 'full'|'brief'|'hidden', link: string|null,
 *   cumulative: number, delta: number, model: string|null,
 *   timestamp: number|null, contextName: string,
 *   rawInput: number, cacheRead: number, cacheCreation: number,
 *   outputTokens: number }} SessionEvent
 */

/**
 * @typedef {{ name: string, hidden: number, brief: number, full: number,
 *   totalTokens: number }} VisibilityEntry
 */

// Map a context type + name to a render kind and color used by the timeline.
// The returned `kind` drives KIND_META badges; `color` feeds chart segments.
/**
 * @param {string} ctx
 * @param {string} ctxName
 * @returns {{ kind: string, color: string }}
 */
export function mapSessionCtx(ctx, ctxName) {
  const TOOL_COLORS = {
    Read:   '#8A8880', Grep:   '#8A8880', Glob:   '#8A8880',
    Write:  '#D97757', Edit:   '#D97757', MultiEdit: '#D97757',
    Bash:   '#A09E96', WebFetch: '#A09E96', WebSearch: '#A09E96',
    TodoWrite: '#A09E96', NotebookEdit: '#D97757'
  };
  switch (ctx) {
    case 'skill': return { kind: 'skill', color: '#D4A843' };
    case 'mcp':   return { kind: 'mcp',   color: '#9B7BC4' };
    case 'agent': return { kind: 'agent', color: '#9B7BC4' };
    case 'tool':  return { kind: 'tool',  color: TOOL_COLORS[ctxName] || '#8A8880' };
    default:      return { kind: 'claude', color: '#D97757' };
  }
}

// Parse a token entry's timestamp to a numeric ms value. Accepts either
// numeric epoch or ISO string.
/** @param {{ timestamp: number|string }} e @returns {number} */
function tsOf(e) {
  return typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
}

// Aggregate tokenEntries + promptStats into a list of replayable sessions.
// A "session" is a group of API turns sharing the same sessionId; sessions
// with fewer than 2 turns are filtered out since there's nothing to replay.
// Returned entries are sorted newest-first by maxTs.
/**
 * @param {UsageData|null|undefined} usage
 * @returns {ReplayableSession[]}
 */
export function listReplayableSessions(usage) {
  const entries = (usage && usage.tokenEntries) || [];
  const prompts = (usage && usage.promptStats) || [];
  const map = {};
  entries.forEach((e) => {
    const sid = e.sessionId;
    if (!sid) return;
    if (!map[sid]) {
      map[sid] = {
        id: sid, count: 0, minTs: Infinity, maxTs: 0,
        firstPrompt: null, model: null, peakTokens: 0
      };
    }
    const s = map[sid];
    s.count += 1;
    const ts = tsOf(e);
    if (ts < s.minTs) s.minTs = ts;
    if (ts > s.maxTs) { s.maxTs = ts; s.model = e.model || s.model; }
    if ((e.inputTokens || 0) > s.peakTokens) s.peakTokens = e.inputTokens || 0;
  });
  prompts.forEach((p) => {
    if (!p.sessionId || !map[p.sessionId]) return;
    const ts = tsOf(p);
    const cur = map[p.sessionId].firstPrompt;
    if (!cur || ts < cur.ts) {
      map[p.sessionId].firstPrompt = {
        ts: ts,
        text: p.text || p.preview || null,
        len: p.charLen || 0
      };
    }
  });
  return Object.values(map)
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.maxTs - a.maxTs);
}

// Build a timeline of events from a real session's tokenEntries. Returns an
// array of SessionEvent objects plus synthetic startup entries prepended at
// negative `t`.
//
// Pure function with explicit deps:
//   usage         — { tokenEntries, promptStats }
//   contextStats  — per-scope startup token breakdown (CLAUDE.md, memory, ...)
//   labels        — { ev1, ev2, ev3, ev4, ev5, ev6, ev7, principles } string map
/**
 * @param {string} sessionId
 * @param {UsageData|null|undefined} usage
 * @param {ContextStats|null|undefined} contextStats
 * @param {ContextLabels} labels
 * @returns {SessionEvent[]}
 */
export function buildSessionEvents(sessionId, usage, contextStats, labels) {
  const allEntries = (usage && usage.tokenEntries) || [];
  const entries = allEntries
    .filter((e) => e.sessionId === sessionId)
    .map((e) => Object.assign({}, e, { _ts: tsOf(e) }))
    .sort((a, b) => a._ts - b._ts);
  if (entries.length === 0) return [];

  const promptStats = ((usage && usage.promptStats) || [])
    .filter((p) => p.sessionId === sessionId)
    .map((p) => tsOf(p));

  const minTs = entries[0]._ts;
  const maxTs = entries[entries.length - 1]._ts;
  const span = Math.max(1, maxTs - minTs);

  const out = [];
  let prevInput = 0;
  entries.forEach((e, i) => {
    const cumulative = e.inputTokens || 0;
    let delta = cumulative - prevInput;
    // Large negative delta while the model stays the same → /compact detected.
    const isCompact = i > 0 && delta < -Math.max(1000, prevInput * 0.2);
    const nearUserPrompt = promptStats.some((pts) => Math.abs(pts - e._ts) <= 2000);
    let kind, color;
    if (isCompact) {
      kind = 'compact'; color = '#D97757';
    } else if (nearUserPrompt) {
      kind = 'user'; color = '#558A42';
    } else {
      const m = mapSessionCtx(e.context, e.contextName);
      kind = m.kind; color = m.color;
    }
    const displayTokens = Math.max(0, delta);
    out.push({
      isSession: true,
      id: -(i + 1),
      t: (e._ts - minTs) / span,
      kind: kind,
      tokens: displayTokens,
      color: color,
      vis: kind === 'user' ? 'full' : 'brief',
      link: null,
      cumulative: cumulative,
      delta: delta,
      model: e.model,
      timestamp: e._ts,
      contextName: e.contextName || (e.context === 'general' ? 'conversation' : e.context),
      rawInput: e.rawInput || 0,
      cacheRead: e.cacheRead || 0,
      cacheCreation: e.cacheCreation || 0,
      outputTokens: e.outputTokens || 0
    });
    prevInput = cumulative;
  });

  // Prepend synthetic startup context events estimated from contextStats.
  const cs = contextStats || {};
  const startupDefs = [
    { key: 'globalClaudeTokens',  color: '#6A9BCC', label: labels.ev6 },
    { key: 'projectClaudeTokens', color: '#6A9BCC', label: labels.ev7 },
    { key: 'autoMemoryTokens',    color: '#E8A45C', label: labels.ev2 },
    { key: 'skillsDescTokens',    color: '#D4A843', label: labels.ev5 },
    { key: 'mcpToolsTokens',      color: '#9B7BC4', label: labels.ev4 },
    { key: 'principlesTokens',    color: '#4f46e5', label: labels.principles },
  ];
  const synthetic = [];
  let syntheticTotal = 0;
  startupDefs.forEach((def, i) => {
    const toks = cs[def.key] || 0;
    if (toks <= 0) return;
    syntheticTotal += toks;
    synthetic.push({
      isSession: true,
      isSynthetic: true,
      id: -(9000 + i),
      t: -(startupDefs.length - synthetic.length) * 0.001,
      kind: 'auto',
      tokens: toks,
      color: def.color,
      vis: 'hidden',
      link: null,
      cumulative: 0,
      delta: toks,
      model: null,
      timestamp: null,
      contextName: def.label,
      rawInput: 0,
      cacheRead: 0,
      cacheCreation: 0,
      outputTokens: 0
    });
  });

  // Residual: first-entry input - rawInput - measured startup = system prompt
  // + env info that Claude Code injects but doesn't expose in the transcript.
  if (entries.length > 0) {
    const firstRawInput = entries[0].rawInput || 0;
    const firstInputTokens = entries[0].inputTokens || 0;
    const residual = Math.max(0, firstInputTokens - firstRawInput - syntheticTotal);
    if (residual > 200) {
      syntheticTotal += residual;
      synthetic.unshift({
        isSession: true,
        isSynthetic: true,
        id: -8999,
        t: -(synthetic.length + 2) * 0.001,
        kind: 'auto',
        tokens: residual,
        color: '#6B6964',
        vis: 'hidden',
        link: null,
        cumulative: 0,
        delta: residual,
        model: null,
        timestamp: null,
        contextName: labels.ev1 + ' · ' + labels.ev3,
        rawInput: 0,
        cacheRead: 0,
        cacheCreation: 0,
        outputTokens: 0
      });
    }
  }

  // Avoid double-counting: first real event's delta was also measuring the
  // startup contexts, so subtract the synthetic total from it.
  if (synthetic.length > 0 && out.length > 0) {
    const adjusted = Math.max(0, out[0].tokens - syntheticTotal);
    out[0] = Object.assign({}, out[0], {
      tokens: adjusted,
      delta: out[0].delta - (out[0].tokens - adjusted)
    });
  }

  return synthetic.concat(out);
}

// Aggregate terminal visibility by context name across all sessions.
// Returns an array sorted by totalTokens descending. Uses the same vis
// assignment logic as buildSessionEvents (user prompt → full, startup
// synthetic → hidden, rest → brief).
//
// `contextStats` provides the per-scope startup token breakdown; its keys become
// dedicated "hidden" entries. Since startup tokens are a fixed per-session cost,
// `sessionCount` multiplies them to reflect actual consumption in the period.
/**
 * @param {UsageData|null|undefined} usage
 * @param {ContextStats|null|undefined} contextStats
 * @param {ContextLabels} labels
 * @param {number} sessionCount
 * @returns {VisibilityEntry[]}
 */
export function aggregateVisibility(usage, contextStats, labels, sessionCount) {
  const entries = (usage && usage.tokenEntries) || [];
  const prompts = (usage && usage.promptStats) || [];

  // Bucket prompt timestamps by 2-second windows for fast lookup.
  const promptBuckets = new Set();
  prompts.forEach((p) => {
    const ts = typeof p.timestamp === 'number' ? p.timestamp : new Date(p.timestamp).getTime();
    promptBuckets.add(Math.round(ts / 2000));
  });

  const map = {};
  const ensure = (name) => {
    if (!map[name]) map[name] = { name: name, hidden: 0, brief: 0, full: 0, totalTokens: 0 };
    return map[name];
  };

  // Per-turn aggregation from tokenEntries (brief / full).
  entries.forEach((e) => {
    const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
    const nearPrompt = promptBuckets.has(Math.round(ts / 2000));
    const vis = nearPrompt ? 'full' : 'brief';
    const name = e.contextName || (e.context === 'general' ? 'conversation' : e.context);
    const agg = ensure(name);
    agg[vis] += 1;
    agg.totalTokens += (e.outputTokens || 0);
  });

  // Startup context (hidden) from contextStats.
  // Multiply by sessionCount since startup tokens are consumed every session.
  const sc = Math.max(sessionCount || 1, 1);
  const cs = contextStats || {};
  const startupDefs = [
    { key: 'globalClaudeTokens',  label: labels.globalClaude },
    { key: 'projectClaudeTokens', label: labels.projectClaude },
    { key: 'autoMemoryTokens',    label: labels.autoMemory },
    { key: 'skillsDescTokens',    label: labels.skillsDesc },
    { key: 'mcpToolsTokens',      label: labels.mcpTools },
    { key: 'principlesTokens',    label: labels.principles },
  ];
  startupDefs.forEach((def) => {
    const toks = cs[def.key] || 0;
    if (toks <= 0) return;
    const agg = ensure(def.label);
    agg.hidden += sc;
    agg.totalTokens += toks * sc;
  });

  return Object.values(map).sort((a, b) => b.totalTokens - a.totalTokens);
}
