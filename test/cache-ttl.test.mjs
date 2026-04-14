import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyCacheMap,
  computeRollingEfficiency,
  computeWasteCost,
  computeRollingEfficiencySeries,
} from '../templates/cache-ttl.mjs';

// Helpers
const ts = (dateStr) => new Date(dateStr).getTime();
const MODEL_PRICING = {
  'sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'haiku-4':  { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
};
const resolvePricingKey = (model) => {
  if (!model) return null;
  const s = model.replace(/^claude-/, '').replace(/-\d{8,}$/, '');
  return MODEL_PRICING[s] ? s : null;
};

// ── buildDailyCacheMap ──────────────────────────────────────────────────────

test('buildDailyCacheMap - groups entries by date', () => {
  const entries = [
    { timestamp: ts('2026-03-01'), cacheRead: 100, cacheCreation: 10 },
    { timestamp: ts('2026-03-01'), cacheRead: 200, cacheCreation: 20 },
    { timestamp: ts('2026-03-02'), cacheRead: 50,  cacheCreation: 5  },
  ];
  const { dailyCacheMap, sortedDates } = buildDailyCacheMap(entries);
  assert.equal(sortedDates.length, 2);
  assert.equal(dailyCacheMap['2026-03-01'].read, 300);
  assert.equal(dailyCacheMap['2026-03-01'].creation, 30);
  assert.equal(dailyCacheMap['2026-03-02'].read, 50);
});

test('buildDailyCacheMap - handles string timestamps', () => {
  const entries = [
    { timestamp: '2026-03-05T12:00:00Z', cacheRead: 100, cacheCreation: 10 },
  ];
  const { sortedDates } = buildDailyCacheMap(entries);
  assert.equal(sortedDates[0], '2026-03-05');
});

test('buildDailyCacheMap - handles missing cacheRead/cacheCreation', () => {
  const entries = [{ timestamp: ts('2026-03-01') }];
  const { dailyCacheMap } = buildDailyCacheMap(entries);
  assert.equal(dailyCacheMap['2026-03-01'].read, 0);
  assert.equal(dailyCacheMap['2026-03-01'].creation, 0);
});

test('buildDailyCacheMap - returns sorted dates', () => {
  const entries = [
    { timestamp: ts('2026-03-03'), cacheRead: 10, cacheCreation: 1 },
    { timestamp: ts('2026-03-01'), cacheRead: 10, cacheCreation: 1 },
    { timestamp: ts('2026-03-02'), cacheRead: 10, cacheCreation: 1 },
  ];
  const { sortedDates } = buildDailyCacheMap(entries);
  assert.deepEqual(sortedDates, ['2026-03-01', '2026-03-02', '2026-03-03']);
});

// ── computeRollingEfficiency ────────────────────────────────────────────────

test('computeRollingEfficiency - perfect efficiency', () => {
  const map = { '2026-03-01': { read: 1000, creation: 0 } };
  const { bestEffPct, worstEffPct } = computeRollingEfficiency(map, ['2026-03-01']);
  assert.equal(bestEffPct, 100);
  assert.equal(worstEffPct, 100);
});

test('computeRollingEfficiency - 7-day window aggregates across days', () => {
  // 7 days: 6 good days (90% eff) + 1 bad day (50% eff)
  const map = {};
  const dates = [];
  for (let i = 1; i <= 6; i++) {
    const d = `2026-03-0${i}`;
    dates.push(d);
    map[d] = { read: 900, creation: 100 }; // 90%
  }
  dates.push('2026-03-07');
  map['2026-03-07'] = { read: 500, creation: 500 }; // 50%

  const { bestEff, worstEff } = computeRollingEfficiency(map, dates);
  // Best window = days 1-6 only (before bad day): 5400/6000 = 90%
  assert.ok(bestEff > 0.89 && bestEff <= 0.90, `bestEff=${bestEff}`);
  // Worst window includes day 7: (5400+500)/(6000+1000) = 5900/7000 ≈ 84.3%
  assert.ok(worstEff < 0.90, `worstEff=${worstEff}`);
});

test('computeRollingEfficiency - bestEffPct rounds correctly', () => {
  const map = { '2026-03-01': { read: 996, creation: 4 } }; // 99.6% → rounds to 100
  const { bestEffPct } = computeRollingEfficiency(map, ['2026-03-01']);
  assert.equal(bestEffPct, 100);
});

test('computeRollingEfficiency - skips zero-activity days for worstEff', () => {
  const map = {
    '2026-03-01': { read: 0, creation: 0 },
    '2026-03-02': { read: 800, creation: 200 },
  };
  const { worstEff } = computeRollingEfficiency(map, ['2026-03-01', '2026-03-02']);
  assert.ok(worstEff > 0, 'worstEff should ignore zero days');
});

// ── computeWasteCost ────────────────────────────────────────────────────────

test('computeWasteCost - zero waste when at best efficiency', () => {
  // bestEff = 90%, actual = 90% → no excess creation
  const totalCacheRead = 900, totalCacheCreation = 100;
  const bestEff = 0.9; // 900/1000 = 90%
  const entries = [{ model: 'claude-sonnet-4', cacheRead: 900, cacheCreation: 100 }];
  const { wasteCost } = computeWasteCost({ totalCacheRead, totalCacheCreation, bestEff }, entries, MODEL_PRICING, resolvePricingKey);
  assert.ok(Math.abs(wasteCost) < 0.0001, `wasteCost should be ~0, got ${wasteCost}`);
});

test('computeWasteCost - positive waste when below best efficiency', () => {
  // bestEff = 90%, actual = 50% → lots of excess creation
  const totalCacheRead = 500, totalCacheCreation = 500;
  const bestEff = 0.9;
  const entries = [{ model: 'claude-sonnet-4', cacheRead: 500, cacheCreation: 500 }];
  const { wasteCost, excessCreation } = computeWasteCost({ totalCacheRead, totalCacheCreation, bestEff }, entries, MODEL_PRICING, resolvePricingKey);
  assert.ok(excessCreation > 0, 'excessCreation should be positive');
  assert.ok(wasteCost > 0, 'wasteCost should be positive');
});

test('computeWasteCost - uses fallback price delta for unknown models', () => {
  const entries = [{ model: 'unknown-model', cacheRead: 100, cacheCreation: 100 }];
  const { avgPriceDelta } = computeWasteCost(
    { totalCacheRead: 100, totalCacheCreation: 100, bestEff: 0.9 },
    entries, MODEL_PRICING, resolvePricingKey
  );
  assert.equal(avgPriceDelta, 3.45);
});

test('computeWasteCost - weighted price delta uses model pricing', () => {
  const entries = [{ model: 'claude-sonnet-4', cacheRead: 1000, cacheCreation: 1000 }];
  const { avgPriceDelta } = computeWasteCost(
    { totalCacheRead: 1000, totalCacheCreation: 1000, bestEff: 0.5 },
    entries, MODEL_PRICING, resolvePricingKey
  );
  // sonnet-4: cacheCreation(3.75) - cacheRead(0.3) = 3.45
  assert.equal(avgPriceDelta, 3.45);
});

// ── computeRollingEfficiencySeries ─────────────────────────────────────────

test('computeRollingEfficiencySeries - single day', () => {
  const map = { '2026-03-01': { read: 800, creation: 200 } };
  const series = computeRollingEfficiencySeries(map, ['2026-03-01']);
  assert.equal(series[0], 80);
});

test('computeRollingEfficiencySeries - rolling window of 7', () => {
  const map = {};
  const dates = [];
  for (let i = 1; i <= 8; i++) {
    const d = `2026-03-0${i}`;
    dates.push(d);
    map[d] = { read: 900, creation: 100 };
  }
  const series = computeRollingEfficiencySeries(map, dates);
  assert.equal(series.length, 8);
  series.forEach((v) => assert.equal(v, 90));
});

test('computeRollingEfficiencySeries - zero activity day returns 0', () => {
  const map = { '2026-03-01': { read: 0, creation: 0 } };
  const series = computeRollingEfficiencySeries(map, ['2026-03-01']);
  assert.equal(series[0], 0);
});
