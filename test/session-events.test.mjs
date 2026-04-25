// session-events.test.mjs — unit tests for the pure session-analysis helpers
// extracted from templates/app.js into templates/session-events.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapSessionCtx,
  listReplayableSessions,
  buildSessionEvents,
  aggregateVisibility,
} from '../templates/session-events.mjs';

// --- mapSessionCtx ---------------------------------------------------------

describe('mapSessionCtx', () => {
  it('returns distinct kinds for each context type', () => {
    assert.equal(mapSessionCtx('skill', 'any').kind, 'skill');
    assert.equal(mapSessionCtx('mcp', 'any').kind, 'mcp');
    assert.equal(mapSessionCtx('agent', 'any').kind, 'agent');
    assert.equal(mapSessionCtx('tool', 'Read').kind, 'tool');
  });

  it('falls back to claude kind for unknown / general contexts', () => {
    assert.equal(mapSessionCtx('general', '').kind, 'claude');
    assert.equal(mapSessionCtx(undefined, '').kind, 'claude');
    assert.equal(mapSessionCtx('conversation', '').kind, 'claude');
  });

  it('maps well-known tool names to their palette color', () => {
    // Read/Grep/Glob share the neutral grey palette
    assert.equal(mapSessionCtx('tool', 'Read').color, '#8A8880');
    assert.equal(mapSessionCtx('tool', 'Glob').color, '#8A8880');
    // Write/Edit use the warm palette
    assert.equal(mapSessionCtx('tool', 'Edit').color, '#D97757');
    assert.equal(mapSessionCtx('tool', 'MultiEdit').color, '#D97757');
    // Unknown tool name → default neutral
    assert.equal(mapSessionCtx('tool', 'NotARealTool').color, '#8A8880');
  });
});

// --- listReplayableSessions ------------------------------------------------

describe('listReplayableSessions', () => {
  const sampleUsage = () => ({
    tokenEntries: [
      { sessionId: 'a', timestamp: 1000, inputTokens: 100, model: 'claude-sonnet-4-6' },
      { sessionId: 'a', timestamp: 2000, inputTokens: 300, model: 'claude-sonnet-4-6' },
      { sessionId: 'a', timestamp: 3000, inputTokens: 500, model: 'claude-sonnet-4-6' },
      { sessionId: 'b', timestamp: 5000, inputTokens: 50,  model: 'claude-opus-4-6' },
      { sessionId: 'b', timestamp: 6000, inputTokens: 80,  model: 'claude-opus-4-6' },
      { sessionId: 'c', timestamp: 4000, inputTokens: 10,  model: 'haiku' }, // only 1 turn
      { sessionId: null, timestamp: 999, inputTokens: 1 }, // missing sid → skipped
    ],
    promptStats: [
      { sessionId: 'a', timestamp: 1000, text: 'first prompt for a' },
      { sessionId: 'a', timestamp: 2000, text: 'later prompt for a' },
      { sessionId: 'b', timestamp: 5000, text: 'prompt for b' },
    ],
  });

  it('groups entries by sessionId and tracks per-session aggregates', () => {
    const sessions = listReplayableSessions(sampleUsage());
    const byId = Object.fromEntries(sessions.map(s => [s.id, s]));
    assert.equal(byId.a.count, 3);
    assert.equal(byId.a.peakTokens, 500);
    assert.equal(byId.a.minTs, 1000);
    assert.equal(byId.a.maxTs, 3000);
    assert.equal(byId.a.model, 'claude-sonnet-4-6');
  });

  it('filters out sessions with fewer than 2 turns', () => {
    const sessions = listReplayableSessions(sampleUsage());
    assert.ok(!sessions.find(s => s.id === 'c'), 'single-turn session excluded');
  });

  it('skips entries with no sessionId', () => {
    const sessions = listReplayableSessions(sampleUsage());
    assert.equal(sessions.length, 2); // a and b only
  });

  it('picks the earliest prompt text as firstPrompt', () => {
    const sessions = listReplayableSessions(sampleUsage());
    const a = sessions.find(s => s.id === 'a');
    assert.equal(a.firstPrompt.text, 'first prompt for a');
    assert.equal(a.firstPrompt.ts, 1000);
  });

  it('sorts sessions newest-first by maxTs', () => {
    const sessions = listReplayableSessions(sampleUsage());
    assert.equal(sessions[0].id, 'b'); // maxTs 6000
    assert.equal(sessions[1].id, 'a'); // maxTs 3000
  });

  it('handles missing or malformed usage gracefully', () => {
    assert.deepEqual(listReplayableSessions(null), []);
    assert.deepEqual(listReplayableSessions({}), []);
    assert.deepEqual(listReplayableSessions({ tokenEntries: [] }), []);
  });

  it('uses preview field when text is absent (SQLite data shape)', () => {
    // SQLite prompt_entries stores `preview`, not `text`. listReplayableSessions
    // must fall back to p.preview so session names show correctly.
    const usage = {
      tokenEntries: [
        { sessionId: 'sql', timestamp: 1000, inputTokens: 100, model: 'sonnet' },
        { sessionId: 'sql', timestamp: 2000, inputTokens: 200, model: 'sonnet' },
      ],
      promptStats: [
        { sessionId: 'sql', timestamp: 1000, preview: 'prompt from sqlite', charLen: 18 },
      ],
    };
    const sessions = listReplayableSessions(usage);
    const s = sessions.find(s => s.id === 'sql');
    assert.ok(s, 'session found');
    assert.equal(s.firstPrompt.text, 'prompt from sqlite', 'preview used as text fallback');
  });

  it('prefers text over preview when both are present', () => {
    const usage = {
      tokenEntries: [
        { sessionId: 'both', timestamp: 1000, inputTokens: 100 },
        { sessionId: 'both', timestamp: 2000, inputTokens: 200 },
      ],
      promptStats: [
        { sessionId: 'both', timestamp: 1000, text: 'explicit text', preview: 'fallback preview' },
      ],
    };
    const sessions = listReplayableSessions(usage);
    const s = sessions.find(s => s.id === 'both');
    assert.equal(s.firstPrompt.text, 'explicit text', 'text field takes priority over preview');
  });

  it('sets firstPrompt.text to null when both text and preview are absent', () => {
    const usage = {
      tokenEntries: [
        { sessionId: 'notext', timestamp: 1000, inputTokens: 100 },
        { sessionId: 'notext', timestamp: 2000, inputTokens: 200 },
      ],
      promptStats: [
        { sessionId: 'notext', timestamp: 1000, charLen: 5 },
      ],
    };
    const sessions = listReplayableSessions(usage);
    const s = sessions.find(s => s.id === 'notext');
    assert.equal(s.firstPrompt.text, null, 'firstPrompt.text is null when no preview/text');
  });

  it('accepts ISO string timestamps', () => {
    const iso = {
      tokenEntries: [
        { sessionId: 'x', timestamp: '2026-04-09T12:00:00Z', inputTokens: 100 },
        { sessionId: 'x', timestamp: '2026-04-09T13:00:00Z', inputTokens: 200 },
      ],
      promptStats: [],
    };
    const s = listReplayableSessions(iso)[0];
    assert.equal(s.count, 2);
    assert.ok(s.minTs < s.maxTs);
  });
});

// --- buildSessionEvents ----------------------------------------------------

describe('buildSessionEvents', () => {
  const LABELS = {
    ev1: 'system', ev2: 'memory', ev3: 'env', ev4: 'mcp',
    ev5: 'skills', ev6: 'global', ev7: 'project', principles: 'principles',
  };

  const simpleUsage = () => ({
    tokenEntries: [
      { sessionId: 's1', timestamp: 1000, inputTokens: 500,  rawInput: 300,
        context: 'general', contextName: 'conversation', model: 'sonnet' },
      { sessionId: 's1', timestamp: 2000, inputTokens: 1200, rawInput: 300,
        context: 'tool', contextName: 'Read', model: 'sonnet' },
      { sessionId: 's1', timestamp: 3000, inputTokens: 1800, rawInput: 300,
        context: 'skill', contextName: 'omh', model: 'sonnet' },
    ],
    promptStats: [
      { sessionId: 's1', timestamp: 1000, text: 'first' },
    ],
  });

  it('returns [] for missing session', () => {
    const out = buildSessionEvents('nonexistent', simpleUsage(), {}, LABELS);
    assert.deepEqual(out, []);
  });

  it('produces one timeline entry per token entry (plus synthetics)', () => {
    const out = buildSessionEvents('s1', simpleUsage(), {}, LABELS);
    // All entries share the same session; synthetic residual may or may not
    // be present depending on rawInput. The real entries count must match.
    const real = out.filter(e => !e.isSynthetic);
    assert.equal(real.length, 3);
  });

  it('computes delta as cumulative minus previous cumulative', () => {
    const out = buildSessionEvents('s1', simpleUsage(), {}, LABELS);
    const real = out.filter(e => !e.isSynthetic);
    // First entry delta is its own cumulative (prevInput starts at 0). Note
    // that delta gets adjusted if there are synthetic startup events, so
    // we only assert relative ordering of cumulative here.
    assert.equal(real[0].cumulative, 500);
    assert.equal(real[1].cumulative, 1200);
    assert.equal(real[2].cumulative, 1800);
    assert.equal(real[1].delta, 700);
    assert.equal(real[2].delta, 600);
  });

  it('normalizes timestamps to 0..1 along the session span', () => {
    const out = buildSessionEvents('s1', simpleUsage(), {}, LABELS);
    const real = out.filter(e => !e.isSynthetic);
    assert.equal(real[0].t, 0);
    assert.equal(real[real.length - 1].t, 1);
  });

  it('tags an entry as kind=user when a prompt is within 2s of the token entry', () => {
    const out = buildSessionEvents('s1', simpleUsage(), {}, LABELS);
    const first = out.filter(e => !e.isSynthetic)[0];
    assert.equal(first.kind, 'user'); // matches promptStats[0] timestamp=1000
    assert.equal(first.vis, 'full', 'user prompts show full terminal output');
  });

  it('detects /compact drops as kind=compact', () => {
    const usage = {
      tokenEntries: [
        { sessionId: 'c1', timestamp: 1000, inputTokens: 100000, rawInput: 0,
          context: 'general', model: 'sonnet' },
        { sessionId: 'c1', timestamp: 2000, inputTokens: 5000, rawInput: 0,
          context: 'general', model: 'sonnet' },
      ],
      promptStats: [],
    };
    const out = buildSessionEvents('c1', usage, {}, LABELS);
    const second = out.filter(e => !e.isSynthetic)[1];
    assert.equal(second.kind, 'compact');
    assert.equal(second.color, '#D97757');
    assert.equal(second.tokens, 0, 'compact display tokens clamped to 0');
  });

  it('prepends synthetic startup events from contextStats', () => {
    const contextStats = {
      globalClaudeTokens: 1000,
      autoMemoryTokens: 500,
      skillsDescTokens: 800,
      principlesTokens: 300,
    };
    const out = buildSessionEvents('s1', simpleUsage(), contextStats, LABELS);
    const synthetic = out.filter(e => e.isSynthetic);
    assert.ok(synthetic.length >= 4, 'one synthetic per non-zero startup key');
    // Synthetic events should have negative `t` so they render before t=0
    assert.ok(synthetic.every(e => e.t < 0), 'synthetic events have negative t');
    // All synthetic events are hidden by default
    assert.ok(synthetic.every(e => e.vis === 'hidden'));
    // They should use the labels map we passed in
    const skillEvent = synthetic.find(e => e.contextName === 'skills');
    assert.ok(skillEvent, 'labels map is honored');
  });

  it('reduces first real event tokens to avoid double-counting startup', () => {
    const usageRaw = {
      tokenEntries: [
        { sessionId: 's', timestamp: 1000, inputTokens: 5000, rawInput: 200,
          context: 'general' },
        { sessionId: 's', timestamp: 2000, inputTokens: 6000, rawInput: 200,
          context: 'general' },
      ],
      promptStats: [],
    };
    const cs = { globalClaudeTokens: 2000, autoMemoryTokens: 1000 };
    const out = buildSessionEvents('s', usageRaw, cs, LABELS);
    const real = out.filter(e => !e.isSynthetic);
    // Synthetic total is at least 3000. First real event originally had
    // tokens = 5000 (delta from 0). After subtraction, adjusted tokens must
    // be less than the raw delta.
    assert.ok(real[0].tokens < 5000, 'first event reduced for overlap with synthetics');
  });
});

// --- aggregateVisibility ---------------------------------------------------

const VIS_LABELS = {
  globalClaude: 'Global CLAUDE.md', projectClaude: 'Project CLAUDE.md',
  autoMemory: 'Auto Memory', skillsDesc: 'Skill Descriptions',
  mcpTools: 'MCP Tools', principles: 'Principles',
};

describe('aggregateVisibility', () => {
  it('returns empty array for empty usage', () => {
    const result = aggregateVisibility({}, {}, VIS_LABELS);
    assert.deepEqual(result, []);
  });

  it('returns empty array for null usage', () => {
    const result = aggregateVisibility(null, null, VIS_LABELS);
    assert.deepEqual(result, []);
  });

  it('classifies entries near prompts as full', () => {
    const usage = {
      tokenEntries: [
        { timestamp: 1000, outputTokens: 100, context: 'general', contextName: 'conversation', sessionId: 's1' },
      ],
      promptStats: [{ timestamp: 1001, sessionId: 's1' }],
    };
    const result = aggregateVisibility(usage, {}, VIS_LABELS);
    const conv = result.find(v => v.name === 'conversation');
    assert.ok(conv);
    assert.equal(conv.full, 1);
    assert.equal(conv.brief, 0);
  });

  it('classifies entries without prompts as brief', () => {
    const usage = {
      tokenEntries: [
        { timestamp: 1000, outputTokens: 200, context: 'tool', contextName: 'Read', sessionId: 's1' },
      ],
      promptStats: [],
    };
    const result = aggregateVisibility(usage, {}, VIS_LABELS);
    const r = result.find(v => v.name === 'Read');
    assert.ok(r);
    assert.equal(r.brief, 1);
    assert.equal(r.full, 0);
  });

  it('adds startup context stats as hidden entries', () => {
    const cs = { globalClaudeTokens: 500, autoMemoryTokens: 300 };
    const result = aggregateVisibility({ tokenEntries: [], promptStats: [] }, cs, VIS_LABELS);
    assert.equal(result.length, 2);
    const gc = result.find(v => v.name === 'Global CLAUDE.md');
    assert.ok(gc);
    assert.equal(gc.hidden, 1);
    assert.equal(gc.totalTokens, 500);
  });

  it('sorts by totalTokens descending', () => {
    const usage = {
      tokenEntries: [
        { timestamp: 1000, outputTokens: 50, context: 'tool', contextName: 'Read' },
        { timestamp: 2000, outputTokens: 200, context: 'tool', contextName: 'Write' },
      ],
      promptStats: [],
    };
    const result = aggregateVisibility(usage, {}, VIS_LABELS);
    assert.equal(result[0].name, 'Write');
    assert.equal(result[1].name, 'Read');
  });

  it('sums totalTokens from outputTokens and startup', () => {
    const usage = {
      tokenEntries: [
        { timestamp: 1000, outputTokens: 100, context: 'tool', contextName: 'Bash' },
        { timestamp: 2000, outputTokens: 150, context: 'tool', contextName: 'Bash' },
      ],
      promptStats: [],
    };
    const cs = { skillsDescTokens: 400 };
    const result = aggregateVisibility(usage, cs, VIS_LABELS);
    const bash = result.find(v => v.name === 'Bash');
    assert.equal(bash.totalTokens, 250);
    assert.equal(bash.brief, 2);
    const skills = result.find(v => v.name === 'Skill Descriptions');
    assert.equal(skills.totalTokens, 400);
    assert.equal(skills.hidden, 1);
  });

  it('skips zero-token startup entries', () => {
    const cs = { globalClaudeTokens: 0, mcpToolsTokens: 0, autoMemoryTokens: 100 };
    const result = aggregateVisibility({ tokenEntries: [], promptStats: [] }, cs, VIS_LABELS);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Auto Memory');
  });

  it('multiplies hidden tokens by sessionCount', () => {
    const cs = { globalClaudeTokens: 500 };
    const result = aggregateVisibility({ tokenEntries: [], promptStats: [] }, cs, VIS_LABELS, 10);
    const gc = result.find(v => v.name === 'Global CLAUDE.md');
    assert.equal(gc.totalTokens, 5000);
    assert.equal(gc.hidden, 10);
  });

  it('defaults sessionCount to 1 when omitted', () => {
    const cs = { autoMemoryTokens: 200 };
    const result = aggregateVisibility({ tokenEntries: [], promptStats: [] }, cs, VIS_LABELS);
    const mem = result.find(v => v.name === 'Auto Memory');
    assert.equal(mem.totalTokens, 200);
    assert.equal(mem.hidden, 1);
  });
});
