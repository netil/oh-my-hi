// context-optimizer.test.mjs — unit tests for context optimizer rules.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeSuggestions } from '../templates/context-optimizer.mjs';

const DAY = 86400000;
const NOW = Date.now();

function makeEntry(overrides) {
  return Object.assign({
    timestamp: NOW - DAY, model: 'claude-sonnet-4-20250514',
    inputTokens: 1000, outputTokens: 200, cacheRead: 500,
    cacheCreation: 100, rawInput: 400, context: 'skill',
    contextName: 'test-skill', sessionId: 's1',
  }, overrides);
}

function baseInput(overrides) {
  return Object.assign({
    tokenEntries: [makeEntry({})],
    contextStats: {
      globalClaudeTokens: 500, projectClaudeTokens: 300,
      autoMemoryTokens: 100, skillsDescTokens: 200,
      mcpToolsTokens: 100, principlesTokens: 50,
      mcpServersCount: 2, skillsCount: 3,
    },
    skills: [{ name: 'test-skill' }],
    agents: [{ name: 'test-agent' }],
    mcpServers: [{ name: 'test-mcp' }],
    memory: [],
    usage: {
      skills: [{ name: 'test-skill', timestamp: NOW - DAY }],
      agents: [{ name: 'test-agent', timestamp: NOW - DAY }],
      mcpCalls: [{ name: 'test-mcp', timestamp: NOW - DAY }],
    },
    dismissed: [],
    calcEntryCostFn: () => 0.01,
  }, overrides);
}

// ── Basic structure ──────────────────────────────────────────────────────

describe('computeSuggestions', () => {
  it('returns an array', () => {
    const result = computeSuggestions(baseInput());
    assert.ok(Array.isArray(result));
  });

  it('each suggestion has required fields', () => {
    // Force an unused MCP to trigger at least one rule
    const result = computeSuggestions(baseInput({
      mcpServers: [{ name: 'unused-server' }],
      usage: Object.assign({}, baseInput().usage, { mcpCalls: [] }),
    }));
    for (const s of result) {
      assert.ok(typeof s.id === 'string');
      assert.ok(typeof s.ruleId === 'string');
      assert.ok(['high', 'medium', 'low'].includes(s.severity));
      assert.ok(typeof s.titleKey === 'string');
      assert.ok(typeof s.descKey === 'string');
      assert.ok(Array.isArray(s.descArgs));
    }
  });

  it('sorts by severity (high > medium > low)', () => {
    const result = computeSuggestions(baseInput({
      mcpServers: [{ name: 'unused-server' }],
      skills: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      usage: { skills: [], agents: [], mcpCalls: [] },
    }));
    if (result.length >= 2) {
      const order = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < result.length; i++) {
        assert.ok(order[result[i - 1].severity] <= order[result[i].severity],
          `${result[i - 1].ruleId}(${result[i - 1].severity}) should be <= ${result[i].ruleId}(${result[i].severity})`);
      }
    }
  });
});

// ── Dismiss filtering ────────────────────────────────────────────────────

describe('dismiss filtering', () => {
  it('filters out dismissed suggestion IDs', () => {
    const data = baseInput({
      mcpServers: [{ name: 'unused-server' }],
      usage: Object.assign({}, baseInput().usage, { mcpCalls: [] }),
    });
    const all = computeSuggestions(data);
    if (all.length > 0) {
      const dismissedId = all[0].id;
      const filtered = computeSuggestions(Object.assign({}, data, { dismissed: [dismissedId] }));
      assert.ok(filtered.length < all.length);
      assert.ok(!filtered.some(s => s.id === dismissedId));
    }
  });
});

// ── Individual rules ─────────────────────────────────────────────────────

describe('rule: unused-mcp', () => {
  it('fires when MCP server has no calls in 30 days', () => {
    const result = computeSuggestions(baseInput({
      mcpServers: [{ name: 'unused-server' }],
      usage: Object.assign({}, baseInput().usage, { mcpCalls: [] }),
    }));
    assert.ok(result.some(s => s.ruleId === 'unused-mcp'));
  });

  it('does not fire when all MCP servers are used', () => {
    const result = computeSuggestions(baseInput());
    assert.ok(!result.some(s => s.ruleId === 'unused-mcp'));
  });
});

describe('rule: unused-skill', () => {
  it('fires when multiple skills are unused', () => {
    const result = computeSuggestions(baseInput({
      skills: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      usage: Object.assign({}, baseInput().usage, { skills: [] }),
    }));
    assert.ok(result.some(s => s.ruleId === 'unused-skill'));
  });

  it('does not fire for a single unused skill', () => {
    const result = computeSuggestions(baseInput({
      skills: [{ name: 'used' }, { name: 'unused' }],
      usage: Object.assign({}, baseInput().usage, {
        skills: [{ name: 'used', timestamp: NOW - DAY }],
      }),
    }));
    assert.ok(!result.some(s => s.ruleId === 'unused-skill'));
  });
});

describe('rule: large-claude-md', () => {
  it('fires when CLAUDE.md tokens exceed 3000', () => {
    const result = computeSuggestions(baseInput({
      contextStats: Object.assign({}, baseInput().contextStats, {
        globalClaudeTokens: 2000, projectClaudeTokens: 2000,
      }),
    }));
    assert.ok(result.some(s => s.ruleId === 'large-claude-md'));
  });

  it('does not fire when within threshold', () => {
    const result = computeSuggestions(baseInput({
      contextStats: Object.assign({}, baseInput().contextStats, {
        globalClaudeTokens: 1000, projectClaudeTokens: 500,
      }),
    }));
    assert.ok(!result.some(s => s.ruleId === 'large-claude-md'));
  });
});

describe('rule: low-cache-hit', () => {
  it('fires when cache hit rate is below 50%', () => {
    const entries = Array.from({ length: 20 }, () =>
      makeEntry({ cacheRead: 100, cacheCreation: 900 })
    );
    const result = computeSuggestions(baseInput({ tokenEntries: entries }));
    assert.ok(result.some(s => s.ruleId === 'low-cache-hit'));
  });
});

describe('rule: opus-overuse', () => {
  it('fires when opus is >60% of calls', () => {
    const entries = Array.from({ length: 20 }, () =>
      makeEntry({ model: 'claude-opus-4-20250514' })
    );
    const result = computeSuggestions(baseInput({ tokenEntries: entries }));
    assert.ok(result.some(s => s.ruleId === 'opus-overuse'));
  });

  it('does not fire with mixed model usage', () => {
    const entries = [
      ...Array.from({ length: 5 }, () => makeEntry({ model: 'claude-opus-4-20250514' })),
      ...Array.from({ length: 15 }, () => makeEntry({ model: 'claude-sonnet-4-20250514' })),
    ];
    const result = computeSuggestions(baseInput({ tokenEntries: entries }));
    assert.ok(!result.some(s => s.ruleId === 'opus-overuse'));
  });
});

// ── Empty data ───────────────────────────────────────────────────────────

describe('empty data', () => {
  it('returns empty array with no data', () => {
    const result = computeSuggestions(baseInput({
      tokenEntries: [], contextStats: null,
      skills: [], agents: [], mcpServers: [], memory: [],
      usage: { skills: [], agents: [], mcpCalls: [] },
    }));
    assert.ok(Array.isArray(result));
  });
});
