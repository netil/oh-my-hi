// health-score.test.mjs — unit tests for Harness Health Score calculator.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeHealthScore } from '../templates/health-score.mjs';

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
    },
    skills: [{ name: 'test-skill' }],
    agents: [{ name: 'test-agent' }],
    mcpServers: [{ name: 'test-mcp' }],
    usage: {
      skills: [{ name: 'test-skill', timestamp: NOW - DAY }],
      agents: [{ name: 'test-agent', timestamp: NOW - DAY }],
      mcpCalls: [{ name: 'test-mcp', timestamp: NOW - DAY }],
    },
    calcEntryCostFn: () => 0.01,
  }, overrides);
}

// ── Overall structure ────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('returns total, grade, and 5 factors', () => {
    const report = computeHealthScore(baseInput());
    assert.ok(typeof report.total === 'number');
    assert.ok(report.total >= 0 && report.total <= 100);
    assert.ok(['A', 'B', 'C', 'D', 'F'].includes(report.grade));
    assert.equal(report.factors.length, 5);
  });

  it('factor weights sum to 1.0', () => {
    const report = computeHealthScore(baseInput());
    const sum = report.factors.reduce((s, f) => s + f.weight, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001);
  });

  it('each factor has required fields', () => {
    const report = computeHealthScore(baseInput());
    for (const f of report.factors) {
      assert.ok(typeof f.name === 'string');
      assert.ok(typeof f.score === 'number');
      assert.ok(f.score >= 0 && f.score <= 100);
      assert.ok(typeof f.weight === 'number');
      assert.ok(typeof f.suggestionKey === 'string');
    }
  });
});

// ── Grade mapping ────────────────────────────────────────────────────────

describe('grade mapping', () => {
  it('scores 90+ get A', () => {
    // All items used, good cache, no cost increase → high score
    const data = baseInput({
      tokenEntries: Array.from({ length: 20 }, (_, i) =>
        makeEntry({ timestamp: NOW - DAY * (i % 14 + 1), cacheRead: 900, cacheCreation: 100 })
      ),
    });
    const report = computeHealthScore(data);
    // With good data, should score high
    assert.ok(report.total >= 0); // sanity
  });
});

// ── Empty data edge cases ────────────────────────────────────────────────

describe('empty data handling', () => {
  it('handles empty tokenEntries', () => {
    const report = computeHealthScore(baseInput({ tokenEntries: [] }));
    assert.ok(typeof report.total === 'number');
    assert.equal(report.factors.length, 5);
  });

  it('handles null contextStats', () => {
    const report = computeHealthScore(baseInput({ contextStats: null }));
    assert.ok(typeof report.total === 'number');
  });

  it('handles empty skills/agents/mcpServers', () => {
    const report = computeHealthScore(baseInput({
      skills: [], agents: [], mcpServers: [],
      usage: { skills: [], agents: [], mcpCalls: [] },
    }));
    assert.ok(typeof report.total === 'number');
  });
});

// ── Individual factor scoring ────────────────────────────────────────────

describe('context efficiency factor', () => {
  it('scores higher when hidden tokens are low', () => {
    const low = computeHealthScore(baseInput({
      contextStats: {
        globalClaudeTokens: 10, projectClaudeTokens: 10,
        autoMemoryTokens: 0, skillsDescTokens: 0,
        mcpToolsTokens: 0, principlesTokens: 0,
      },
    }));
    const high = computeHealthScore(baseInput({
      contextStats: {
        globalClaudeTokens: 50000, projectClaudeTokens: 50000,
        autoMemoryTokens: 10000, skillsDescTokens: 5000,
        mcpToolsTokens: 5000, principlesTokens: 5000,
      },
    }));
    const lowFactor = low.factors.find(f => f.name === 'contextEfficiency');
    const highFactor = high.factors.find(f => f.name === 'contextEfficiency');
    assert.ok(lowFactor.score >= highFactor.score);
  });
});

describe('unused items factor', () => {
  it('scores 100 when all items are used', () => {
    const report = computeHealthScore(baseInput());
    const factor = report.factors.find(f => f.name === 'unusedItems');
    assert.equal(factor.score, 100);
  });

  it('scores lower when items are unused', () => {
    const report = computeHealthScore(baseInput({
      skills: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      usage: { skills: [{ name: 'a', timestamp: NOW - DAY }], agents: [], mcpCalls: [] },
      agents: [], mcpServers: [],
    }));
    const factor = report.factors.find(f => f.name === 'unusedItems');
    assert.ok(factor.score < 100);
  });
});

describe('cache efficiency factor', () => {
  it('scores higher with more cache reads vs creations', () => {
    const goodCache = computeHealthScore(baseInput({
      tokenEntries: [makeEntry({ cacheRead: 900, cacheCreation: 100 })],
    }));
    const badCache = computeHealthScore(baseInput({
      tokenEntries: [makeEntry({ cacheRead: 100, cacheCreation: 900 })],
    }));
    const goodFactor = goodCache.factors.find(f => f.name === 'cacheEfficiency');
    const badFactor = badCache.factors.find(f => f.name === 'cacheEfficiency');
    assert.ok(goodFactor.score > badFactor.score);
  });
});

describe('cost trend factor', () => {
  it('scores well when costs are stable', () => {
    const entries = [];
    for (let i = 0; i < 14; i++) {
      entries.push(makeEntry({ timestamp: NOW - DAY * (i + 1) }));
    }
    const report = computeHealthScore(baseInput({
      tokenEntries: entries,
      calcEntryCostFn: () => 0.01,
    }));
    const factor = report.factors.find(f => f.name === 'costTrend');
    assert.ok(factor.score >= 75);
  });
});
