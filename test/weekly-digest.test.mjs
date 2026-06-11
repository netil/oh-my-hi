// weekly-digest.test.mjs — unit tests for the build-time weekly digest.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeWeeklyDigest,
  calcEntryCost,
  resolvePricingKey,
  PRICING_FALLBACK,
} from '../scripts/digest.mjs';

const DAY_MS = 86400000;
const NOW = Date.parse('2026-06-11T12:00:00Z');

// Flat pricing so expected costs are easy to compute:
// 1M tokens of any kind = $1.
const FLAT = { 'sonnet-4': { input: 1, output: 1, cacheRead: 1, cacheCreation: 1 } };

const entry = (daysAgo, overrides = {}) => ({
  timestamp: NOW - daysAgo * DAY_MS,
  model: 'claude-sonnet-4-20250514',
  rawInput: 1_000_000,
  outputTokens: 0,
  cacheRead: 0,
  cacheCreation: 0,
  sessionId: 's-' + daysAgo,
  ...overrides,
});

describe('resolvePricingKey', () => {
  it('resolves full model ids with date suffix', () => {
    assert.equal(resolvePricingKey('claude-sonnet-4-20250514', PRICING_FALLBACK), 'sonnet-4');
  });
  it('prefers minor version when present in the table', () => {
    assert.equal(resolvePricingKey('claude-opus-4-5-20251101', PRICING_FALLBACK), 'opus-4-5');
  });
  it('returns null for unknown models', () => {
    assert.equal(resolvePricingKey('unknown', PRICING_FALLBACK), null);
    assert.equal(resolvePricingKey('gpt-4', PRICING_FALLBACK), null);
  });
});

describe('calcEntryCost', () => {
  it('computes cost from all four token kinds', () => {
    const e = entry(0, { rawInput: 1e6, outputTokens: 2e6, cacheRead: 3e6, cacheCreation: 4e6 });
    assert.equal(calcEntryCost(e, FLAT), 10);
  });
  it('returns 0 for unpriceable models', () => {
    assert.equal(calcEntryCost(entry(0, { model: 'mystery' }), FLAT), 0);
  });
});

describe('computeWeeklyDigest', () => {
  it('splits entries into current and previous 7-day windows', () => {
    const entries = [
      entry(1), entry(3), entry(6),      // current week
      entry(8), entry(13),               // previous week
      entry(20),                         // outside the 14-day window — ignored
    ];
    const d = computeWeeklyDigest(entries, { pricing: FLAT, now: NOW });
    assert.equal(d.current.cost, 3);
    assert.equal(d.previous.cost, 2);
    assert.equal(d.current.tokens, 3_000_000);
    assert.equal(d.previous.tokens, 2_000_000);
  });

  it('counts distinct sessions per window', () => {
    const entries = [
      entry(1, { sessionId: 'a' }), entry(2, { sessionId: 'a' }), entry(3, { sessionId: 'b' }),
      entry(8, { sessionId: 'c' }),
      entry(9, { sessionId: null }), // no sessionId — not counted
    ];
    const d = computeWeeklyDigest(entries, { pricing: FLAT, now: NOW });
    assert.equal(d.current.sessions, 2);
    assert.equal(d.previous.sessions, 1);
  });

  it('computes percentage deltas vs previous week', () => {
    const entries = [entry(1), entry(2), entry(3), entry(8), entry(9)];
    const d = computeWeeklyDigest(entries, { pricing: FLAT, now: NOW });
    assert.equal(d.delta.cost, 50);    // 3 vs 2
    assert.equal(d.delta.tokens, 50);
    assert.equal(d.delta.sessions, 50);
  });

  it('returns null deltas when the previous week is empty', () => {
    const d = computeWeeklyDigest([entry(1)], { pricing: FLAT, now: NOW });
    assert.equal(d.delta.cost, null);
    assert.equal(d.delta.tokens, null);
    assert.equal(d.delta.sessions, null);
  });

  it('handles empty/missing input', () => {
    const d = computeWeeklyDigest([], { pricing: FLAT, now: NOW });
    assert.deepEqual(d.current, { cost: 0, tokens: 0, sessions: 0 });
    assert.deepEqual(d.previous, { cost: 0, tokens: 0, sessions: 0 });
    const d2 = computeWeeklyDigest(undefined, { pricing: FLAT, now: NOW });
    assert.equal(d2.current.tokens, 0);
  });

  it('accepts ISO-string timestamps', () => {
    const e = entry(1, { timestamp: new Date(NOW - DAY_MS).toISOString() });
    const d = computeWeeklyDigest([e], { pricing: FLAT, now: NOW });
    assert.equal(d.current.tokens, 1_000_000);
  });

  it('ignores entries with invalid timestamps or in the future', () => {
    const d = computeWeeklyDigest([
      entry(1, { timestamp: 'not-a-date' }),
      entry(-1), // 1 day in the future
    ], { pricing: FLAT, now: NOW });
    assert.equal(d.current.tokens, 0);
  });

  it('falls back to the bundled pricing table when none is given', () => {
    const d = computeWeeklyDigest([entry(1)], { now: NOW });
    // sonnet-4 fallback input price: $3 / 1M
    assert.equal(d.current.cost, 3);
  });

  it('exposes the 14-day window bounds', () => {
    const d = computeWeeklyDigest([], { pricing: FLAT, now: NOW });
    assert.equal(d.to, NOW);
    assert.equal(d.from, NOW - 14 * DAY_MS);
  });
});
