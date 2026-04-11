// regression.test.mjs — unit tests for week-over-week regression detection.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  toMs,
  weekWindows,
  avgInWindow,
  metricFromWindows,
  computeRegression,
  cacheHitRateInWindow,
  modelMixInWindow,
  detectCauses,
} from '../templates/regression.mjs';

const DAY = 86400000;
const TODAY = new Date('2026-04-11T12:00:00Z').getTime();

// ── toMs ──────────────────────────────────────────────────────────────────

describe('toMs', () => {
  it('passes numbers through', () => assert.equal(toMs(1_700_000_000_000), 1_700_000_000_000));
  it('parses ISO strings', () => {
    const v = toMs('2026-04-11T12:00:00Z');
    assert.equal(v, new Date('2026-04-11T12:00:00Z').getTime());
  });
  it('returns NaN for garbage', () => assert.ok(Number.isNaN(toMs('not-a-date'))));
});

// ── weekWindows ───────────────────────────────────────────────────────────

describe('weekWindows', () => {
  it('splits into two non-overlapping 7-day windows', () => {
    const { current, previous } = weekWindows(TODAY);
    assert.equal(current.endMs, TODAY);
    assert.equal(current.startMs, TODAY - 7 * DAY);
    assert.equal(previous.endMs, current.startMs);
    assert.equal(previous.startMs, current.startMs - 7 * DAY);
  });
});

// ── avgInWindow ───────────────────────────────────────────────────────────

describe('avgInWindow', () => {
  it('returns zero average for empty matches', () => {
    const r = avgInWindow([], (e) => e.v, 0, 100);
    assert.deepEqual(r, { avg: 0, count: 0 });
  });

  it('averages only entries that fall in [start, end)', () => {
    const entries = [
      { timestamp: 50, v: 10 },
      { timestamp: 100, v: 20 }, // boundary — excluded (half-open)
      { timestamp: 70, v: 30 },
      { timestamp: 5, v: 100 },  // outside
    ];
    const r = avgInWindow(entries, (e) => e.v, 10, 100);
    assert.equal(r.count, 2);
    assert.equal(r.avg, 20); // (10 + 30) / 2
  });

  it('skips non-finite values', () => {
    const entries = [
      { timestamp: 50, v: 10 },
      { timestamp: 51, v: NaN },
      { timestamp: 52, v: Infinity },
    ];
    const r = avgInWindow(entries, (e) => e.v, 0, 100);
    assert.equal(r.count, 1);
    assert.equal(r.avg, 10);
  });
});

// ── metricFromWindows ─────────────────────────────────────────────────────

describe('metricFromWindows', () => {
  it('returns null when sample sizes are too small', () => {
    const r = metricFromWindows({ avg: 100, count: 3 }, { avg: 100, count: 10 }, 15, 5, true);
    assert.equal(r, null);
  });

  it('returns null when previous avg is zero (divide by zero)', () => {
    const r = metricFromWindows({ avg: 10, count: 10 }, { avg: 0, count: 10 }, 15, 5, true);
    assert.equal(r, null);
  });

  it('flags regression when higherIsWorse and current > previous by threshold', () => {
    const r = metricFromWindows({ avg: 120, count: 10 }, { avg: 100, count: 10 }, 15, 5, true);
    assert.ok(r);
    assert.equal(r.deltaPct, 20);
    assert.equal(r.regressed, true);
  });

  it('does NOT flag when improvement (current < previous) with higherIsWorse', () => {
    const r = metricFromWindows({ avg: 80, count: 10 }, { avg: 100, count: 10 }, 15, 5, true);
    assert.ok(r);
    assert.equal(r.deltaPct, -20);
    assert.equal(r.regressed, false);
  });

  it('threshold is inclusive at the boundary', () => {
    const r = metricFromWindows({ avg: 115, count: 10 }, { avg: 100, count: 10 }, 15, 5, true);
    assert.ok(r);
    assert.equal(r.deltaPct, 15);
    assert.equal(r.regressed, true);
  });

  it('ignores below-threshold noise', () => {
    const r = metricFromWindows({ avg: 110, count: 10 }, { avg: 100, count: 10 }, 15, 5, true);
    assert.ok(r);
    assert.equal(r.regressed, false);
  });
});

// ── computeRegression ─────────────────────────────────────────────────────

describe('computeRegression', () => {
  // Helpers to fabricate entries placed in either window.
  const inCur = (offsetDays = 1) => TODAY - offsetDays * DAY + 1; // inside [today-7d, today)
  const inPrev = (offsetDays = 8) => TODAY - offsetDays * DAY + 1; // inside [today-14d, today-7d)

  it('returns null metrics when no data', () => {
    const r = computeRegression({}, TODAY);
    assert.equal(r.anyRegressed, false);
    assert.equal(r.latency, null);
    assert.equal(r.tokensPerTurn, null);
    assert.equal(r.sessionsPerDay, null);
  });

  it('flags latency regression when avg latency grows ≥15%', () => {
    // Previous window: 10 entries at 1000ms
    // Current window: 10 entries at 1200ms → +20% regression
    const latencyEntries = [
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: inPrev(8 + i * 0.1), latencyMs: 1000, sessionId: 's-p' })),
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: inCur(1 + i * 0.1), latencyMs: 1200, sessionId: 's-c' })),
    ];
    const r = computeRegression({ latencyEntries, tokenEntries: [] }, TODAY);
    assert.ok(r.latency);
    assert.equal(r.latency.regressed, true);
    assert.equal(Math.round(r.latency.deltaPct), 20);
    assert.equal(r.anyRegressed, true);
  });

  it('does NOT flag latency improvement (current faster than previous)', () => {
    const latencyEntries = [
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: inPrev(8 + i * 0.1), latencyMs: 1200, sessionId: 's-p' })),
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: inCur(1 + i * 0.1), latencyMs: 800, sessionId: 's-c' })),
    ];
    const r = computeRegression({ latencyEntries, tokenEntries: [] }, TODAY);
    assert.ok(r.latency);
    assert.equal(r.latency.regressed, false);
    assert.ok(r.latency.deltaPct < 0); // improvement is negative delta
    assert.equal(r.anyRegressed, false);
  });

  it('flags tokens/turn regression independently of latency', () => {
    const tokenEntries = [
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: inPrev(8 + i * 0.1), rawInput: 1000, outputTokens: 500, sessionId: 's-p' })),
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: inCur(1 + i * 0.1), rawInput: 2000, outputTokens: 1000, sessionId: 's-c' })),
    ];
    const r = computeRegression({ latencyEntries: [], tokenEntries }, TODAY);
    assert.ok(r.tokensPerTurn);
    assert.equal(r.tokensPerTurn.regressed, true);
    assert.equal(Math.round(r.tokensPerTurn.deltaPct), 100);
    assert.equal(r.anyRegressed, true);
  });

  it('reports sessionsPerDay without flagging as regression', () => {
    const mkEntries = (sessionCount, offsetDays) =>
      Array.from({ length: sessionCount * 5 }, (_, i) => ({
        timestamp: TODAY - offsetDays * DAY + (i % 5) * 60000,
        rawInput: 100, outputTokens: 50,
        sessionId: 's-' + offsetDays + '-' + Math.floor(i / 5),
      }));
    const tokenEntries = [
      ...mkEntries(5, 10), // 5 sessions in previous window (offset 10 days)
      ...mkEntries(3, 3),  // 3 sessions in current window  (offset 3 days)
    ];
    const r = computeRegression({ latencyEntries: [], tokenEntries }, TODAY);
    assert.ok(r.sessionsPerDay);
    assert.equal(r.sessionsPerDay.regressed, false);
    assert.equal(r.sessionsPerDay.sampleCurrent, 3);
    assert.equal(r.sessionsPerDay.samplePrevious, 5);
  });

  it('attaches empty causes when no regression is detected', () => {
    const r = computeRegression({}, TODAY);
    assert.ok(r.causes);
    assert.equal(r.causes.cacheDrop, null);
    assert.equal(r.causes.opusShift, null);
  });

  it('respects custom threshold and minSamples', () => {
    const latencyEntries = [
      ...Array.from({ length: 3 }, (_, i) => ({ timestamp: inPrev(8 + i * 0.1), latencyMs: 1000, sessionId: 's-p' })),
      ...Array.from({ length: 3 }, (_, i) => ({ timestamp: inCur(1 + i * 0.1), latencyMs: 1200, sessionId: 's-c' })),
    ];
    // Default minSamples=5 → null
    const r1 = computeRegression({ latencyEntries, tokenEntries: [] }, TODAY);
    assert.equal(r1.latency, null);
    // minSamples=3 → 20% detected at threshold=25 (not enough, not flagged)
    const r2 = computeRegression({ latencyEntries, tokenEntries: [] }, TODAY, 25, 3);
    assert.ok(r2.latency);
    assert.equal(r2.latency.regressed, false);
    // minSamples=3 → 20% detected at threshold=15 (flagged)
    const r3 = computeRegression({ latencyEntries, tokenEntries: [] }, TODAY, 15, 3);
    assert.ok(r3.latency);
    assert.equal(r3.latency.regressed, true);
  });
});

// ── cacheHitRateInWindow ──────────────────────────────────────────────────

describe('cacheHitRateInWindow', () => {
  it('returns null when no tokens fall in the window', () => {
    assert.equal(cacheHitRateInWindow([], 0, 100), null);
  });

  it('computes cache hit rate as cacheRead / (rawInput + cacheRead + cacheCreation)', () => {
    const entries = [
      { timestamp: 50, rawInput: 100, cacheRead: 400, cacheCreation: 0 },
      { timestamp: 60, rawInput: 200, cacheRead: 800, cacheCreation: 0 },
    ];
    const r = cacheHitRateInWindow(entries, 0, 100);
    assert.ok(r);
    // total = 300 raw + 1200 cacheRead = 1500; rate = 1200/1500 = 0.8
    assert.equal(r.rate, 0.8);
    assert.equal(r.sampleTokens, 1500);
  });

  it('excludes entries outside [start, end)', () => {
    const entries = [
      { timestamp: 5, rawInput: 1_000_000, cacheRead: 0, cacheCreation: 0 }, // outside
      { timestamp: 50, rawInput: 100, cacheRead: 300, cacheCreation: 0 },
    ];
    const r = cacheHitRateInWindow(entries, 10, 100);
    assert.ok(r);
    assert.equal(r.rate, 0.75);
  });
});

// ── modelMixInWindow ──────────────────────────────────────────────────────

describe('modelMixInWindow', () => {
  it('returns zero shares when no entries match', () => {
    const r = modelMixInWindow([], 0, 100);
    assert.equal(r.opus, 0);
    assert.equal(r.sonnet, 0);
    assert.equal(r.haiku, 0);
    assert.equal(r.total, 0);
  });

  it('normalizes to share across model families', () => {
    const entries = [
      { timestamp: 10, model: 'claude-opus-4' },
      { timestamp: 20, model: 'claude-sonnet-4' },
      { timestamp: 30, model: 'claude-sonnet-4' },
      { timestamp: 40, model: 'claude-haiku-4' },
    ];
    const r = modelMixInWindow(entries, 0, 100);
    assert.equal(r.total, 4);
    assert.equal(r.opus, 0.25);
    assert.equal(r.sonnet, 0.5);
    assert.equal(r.haiku, 0.25);
  });

  it('skips unknown/null models', () => {
    const entries = [
      { timestamp: 10, model: 'opus' },
      { timestamp: 20, model: null },
      { timestamp: 30, model: 'some-other' },
    ];
    const r = modelMixInWindow(entries, 0, 100);
    assert.equal(r.total, 1);
    assert.equal(r.opus, 1);
  });
});

// ── detectCauses ──────────────────────────────────────────────────────────

describe('detectCauses', () => {
  const DAY2 = 86400000;
  const today = new Date('2026-04-11T00:00:00Z').getTime();
  const cur = { startMs: today - 7 * DAY2, endMs: today };
  const prev = { startMs: today - 14 * DAY2, endMs: today - 7 * DAY2 };
  const inCur2 = (offsetDays) => today - offsetDays * DAY2 + 1;
  const inPrev2 = (offsetDays) => today - (7 + offsetDays) * DAY2 + 1;

  it('returns no causes for neutral data', () => {
    const r = detectCauses([], cur, prev);
    assert.equal(r.cacheDrop, null);
    assert.equal(r.opusShift, null);
  });

  it('detects cache hit rate drop ≥10pp', () => {
    const entries = [
      // Previous week: high cache hit (rate ≈ 0.9)
      { timestamp: inPrev2(1), rawInput: 100, cacheRead: 900, cacheCreation: 0, model: 'sonnet' },
      // Current week: lower cache hit (rate ≈ 0.6)
      { timestamp: inCur2(1), rawInput: 400, cacheRead: 600, cacheCreation: 0, model: 'sonnet' },
    ];
    const r = detectCauses(entries, cur, prev);
    assert.ok(r.cacheDrop);
    assert.equal(Math.round(r.cacheDrop.deltaPct), -30);
  });

  it('does NOT flag small cache drops under 10pp', () => {
    const entries = [
      { timestamp: inPrev2(1), rawInput: 100, cacheRead: 900, cacheCreation: 0 },
      { timestamp: inCur2(1), rawInput: 150, cacheRead: 850, cacheCreation: 0 },
    ];
    const r = detectCauses(entries, cur, prev);
    assert.equal(r.cacheDrop, null);
  });

  it('detects opus share shift ≥10pp', () => {
    const entries = [
      // Previous week: mostly sonnet
      { timestamp: inPrev2(1), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inPrev2(2), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inPrev2(3), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inPrev2(4), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inPrev2(5), rawInput: 100, model: 'opus-4' },
      // Current week: lots of opus
      { timestamp: inCur2(1), rawInput: 100, model: 'opus-4' },
      { timestamp: inCur2(2), rawInput: 100, model: 'opus-4' },
      { timestamp: inCur2(3), rawInput: 100, model: 'opus-4' },
      { timestamp: inCur2(4), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inCur2(5), rawInput: 100, model: 'sonnet-4' },
    ];
    const r = detectCauses(entries, cur, prev);
    assert.ok(r.opusShift);
    // prev: 1/5 = 0.2, cur: 3/5 = 0.6, delta = +40pp
    assert.equal(Math.round(r.opusShift.deltaPct), 40);
  });

  it('does NOT flag opus shift under 10pp', () => {
    const entries = [
      { timestamp: inPrev2(1), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inPrev2(2), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inPrev2(3), rawInput: 100, model: 'opus-4' },
      { timestamp: inCur2(1), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inCur2(2), rawInput: 100, model: 'sonnet-4' },
      { timestamp: inCur2(3), rawInput: 100, model: 'opus-4' },
    ];
    const r = detectCauses(entries, cur, prev);
    assert.equal(r.opusShift, null);
  });
});
