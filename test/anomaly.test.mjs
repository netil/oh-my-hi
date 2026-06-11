import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyUsageSeries,
  detectDailyAnomalies,
  ANOMALY_WINDOW,
  ANOMALY_MULTIPLIER,
  ANOMALY_MIN_BASELINE_DAYS,
  ANOMALY_TOKEN_FLOOR,
  ANOMALY_COST_FLOOR,
} from '../templates/anomaly.mjs';

// Helpers
const ts = (dateStr) => new Date(dateStr).getTime();
// Flat cost: $1 per 1M tokens of anything, to keep math simple
const calcCost = (e) =>
  ((e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0)) / 1e6;

/** Build a dailyMap/sortedDates pair from a {date: tokens} object (cost = tokens/1e6) */
function series(tokensByDate) {
  const dailyMap = {};
  Object.entries(tokensByDate).forEach(([dk, tok]) => {
    dailyMap[dk] = { tokens: tok, cost: tok / 1e6 };
  });
  return { dailyMap, sortedDates: Object.keys(dailyMap).sort() };
}

// ── buildDailyUsageSeries ───────────────────────────────────────────────────

test('buildDailyUsageSeries - groups entries by date and sums all token kinds', () => {
  const entries = [
    { timestamp: ts('2026-03-01T10:00:00Z'), rawInput: 100, outputTokens: 50, cacheRead: 1000, cacheCreation: 10 },
    { timestamp: ts('2026-03-01T18:00:00Z'), rawInput: 40, outputTokens: 0, cacheRead: 0, cacheCreation: 0 },
    { timestamp: ts('2026-03-02T09:00:00Z'), rawInput: 1, outputTokens: 2 },
  ];
  const { dailyMap, sortedDates } = buildDailyUsageSeries(entries, calcCost);
  assert.deepEqual(sortedDates, ['2026-03-01', '2026-03-02']);
  assert.equal(dailyMap['2026-03-01'].tokens, 1200);
  assert.equal(dailyMap['2026-03-02'].tokens, 3);
  assert.ok(Math.abs(dailyMap['2026-03-01'].cost - 1200 / 1e6) < 1e-12);
});

test('buildDailyUsageSeries - handles string timestamps', () => {
  const entries = [{ timestamp: '2026-03-05T12:00:00Z', rawInput: 7 }];
  const { sortedDates, dailyMap } = buildDailyUsageSeries(entries, calcCost);
  assert.deepEqual(sortedDates, ['2026-03-05']);
  assert.equal(dailyMap['2026-03-05'].tokens, 7);
});

test('buildDailyUsageSeries - skips invalid timestamps', () => {
  const entries = [
    { timestamp: 'not-a-date', rawInput: 5 },
    { timestamp: '2026-03-01T00:00:00Z', rawInput: 5 },
  ];
  const { sortedDates } = buildDailyUsageSeries(entries, calcCost);
  assert.deepEqual(sortedDates, ['2026-03-01']);
});

test('buildDailyUsageSeries - cost is zero without a cost function', () => {
  const entries = [{ timestamp: '2026-03-01T00:00:00Z', rawInput: 5 }];
  const { dailyMap } = buildDailyUsageSeries(entries);
  assert.equal(dailyMap['2026-03-01'].cost, 0);
});

// ── detectDailyAnomalies ────────────────────────────────────────────────────

test('detectDailyAnomalies - flags a day above 2× the trailing mean', () => {
  // 7 normal days at 10M, then a 30M day (3× baseline)
  const data = {};
  for (let i = 1; i <= 7; i++) data[`2026-03-0${i}`] = 10e6;
  data['2026-03-08'] = 30e6;
  const { dailyMap, sortedDates } = series(data);
  const anomalies = detectDailyAnomalies(dailyMap, sortedDates);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].date, '2026-03-08');
  assert.equal(anomalies[0].kind, 'both'); // cost spikes too ($30 vs $10 avg)
  assert.ok(Math.abs(anomalies[0].tokenRatio - 3) < 1e-9, `ratio=${anomalies[0].tokenRatio}`);
});

test('detectDailyAnomalies - baseline excludes the day being evaluated', () => {
  // If the spike day were included in its own baseline (mean of 8 days =
  // 12.5M), 30M would still flag — but the ratio must be vs 10M (3×), not 2.4×.
  const data = {};
  for (let i = 1; i <= 7; i++) data[`2026-03-0${i}`] = 10e6;
  data['2026-03-08'] = 30e6;
  const { dailyMap, sortedDates } = series(data);
  const [a] = detectDailyAnomalies(dailyMap, sortedDates);
  assert.equal(a.tokenBaseline, 10e6);
});

test('detectDailyAnomalies - does not flag exactly 2× (strict inequality)', () => {
  const data = {};
  for (let i = 1; i <= 7; i++) data[`2026-03-0${i}`] = 10e6;
  data['2026-03-08'] = 20e6; // exactly 2×
  const { dailyMap, sortedDates } = series(data);
  assert.equal(detectDailyAnomalies(dailyMap, sortedDates).length, 0);
});

test('detectDailyAnomalies - token floor suppresses trivial days', () => {
  // 5× spike but well under the 1M token floor (and under $1 cost floor)
  const data = {
    '2026-03-01': 1000, '2026-03-02': 1000, '2026-03-03': 1000,
    '2026-03-04': 5000,
  };
  const { dailyMap, sortedDates } = series(data);
  assert.equal(detectDailyAnomalies(dailyMap, sortedDates).length, 0);
  // Same shape but scaled above the floor → flags
  const big = {};
  Object.entries(data).forEach(([k, v]) => { big[k] = v * 1e3; });
  const s2 = series(big);
  assert.equal(detectDailyAnomalies(s2.dailyMap, s2.sortedDates).length, 1);
});

test('detectDailyAnomalies - requires minimum baseline days', () => {
  // Only 2 prior days (< ANOMALY_MIN_BASELINE_DAYS) → never flagged
  const data = { '2026-03-01': 10e6, '2026-03-02': 10e6, '2026-03-03': 100e6 };
  const { dailyMap, sortedDates } = series(data);
  assert.equal(detectDailyAnomalies(dailyMap, sortedDates).length, 0);
});

test('detectDailyAnomalies - window slides over active days only (max 7)', () => {
  // 10 calm days then a spike: baseline must use the last 7 days, not all 10.
  const data = {};
  for (let i = 1; i <= 3; i++) data[`2026-03-0${i}`] = 1e9; // old huge days
  for (let i = 4; i <= 10; i++) data[`2026-03-${String(i).padStart(2, '0')}`] = 10e6;
  data['2026-03-11'] = 30e6;
  const { dailyMap, sortedDates } = series(data);
  const anomalies = detectDailyAnomalies(dailyMap, sortedDates);
  const spike = anomalies.find((a) => a.date === '2026-03-11');
  assert.ok(spike, 'spike day flagged despite old huge days outside the window');
  assert.equal(spike.tokenBaseline, 10e6);
});

test('detectDailyAnomalies - kind reflects which metric spiked', () => {
  // Tokens flat, cost spikes (e.g. switch from cache-heavy to expensive output)
  const dailyMap = {
    '2026-03-01': { tokens: 10e6, cost: 2 },
    '2026-03-02': { tokens: 10e6, cost: 2 },
    '2026-03-03': { tokens: 10e6, cost: 2 },
    '2026-03-04': { tokens: 10e6, cost: 10 },
  };
  const sortedDates = Object.keys(dailyMap).sort();
  const anomalies = detectDailyAnomalies(dailyMap, sortedDates);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].kind, 'cost');
  assert.equal(anomalies[0].costRatio, 5);
});

test('detectDailyAnomalies - returns most recent first', () => {
  const data = {};
  for (let i = 1; i <= 7; i++) data[`2026-03-0${i}`] = 10e6;
  data['2026-03-08'] = 50e6;
  data['2026-03-09'] = 10e6;
  data['2026-03-15'] = 200e6;
  const { dailyMap, sortedDates } = series(data);
  const anomalies = detectDailyAnomalies(dailyMap, sortedDates);
  assert.ok(anomalies.length >= 2);
  assert.equal(anomalies[0].date, '2026-03-15');
  assert.equal(anomalies[1].date, '2026-03-08');
});

test('detectDailyAnomalies - zero baseline never flags (no division blowup)', () => {
  const data = { '2026-03-01': 0, '2026-03-02': 0, '2026-03-03': 0, '2026-03-04': 50e6 };
  const { dailyMap, sortedDates } = series(data);
  assert.equal(detectDailyAnomalies(dailyMap, sortedDates).length, 0);
});

test('detectDailyAnomalies - custom options override defaults', () => {
  const data = { '2026-03-01': 100, '2026-03-02': 100, '2026-03-03': 301 };
  const { dailyMap, sortedDates } = series(data);
  const anomalies = detectDailyAnomalies(dailyMap, sortedDates, {
    multiplier: 3, minBaselineDays: 2, tokenFloor: 0, costFloor: Infinity,
  });
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].kind, 'tokens');
});

test('exported defaults match the documented detection rule', () => {
  assert.equal(ANOMALY_WINDOW, 7);
  assert.equal(ANOMALY_MULTIPLIER, 2);
  assert.equal(ANOMALY_MIN_BASELINE_DAYS, 3);
  assert.equal(ANOMALY_TOKEN_FLOOR, 1e6);
  assert.equal(ANOMALY_COST_FLOOR, 1);
});
