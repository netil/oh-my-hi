// canvas-bars.test.mjs — unit tests for pure canvas bar layout helpers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  layoutStackedBar,
  layoutSessionBar,
  findSegmentAt,
  computeBarScale,
  computeBarWidth,
} from '../templates/canvas-bars.mjs';

// ── layoutStackedBar ──────────────────────────────────────────────────────

describe('layoutStackedBar', () => {
  it('returns empty for empty input', () => {
    assert.deepEqual(layoutStackedBar([], 100), []);
    assert.deepEqual(layoutStackedBar(null, 100), []);
  });

  it('returns empty when total is zero', () => {
    assert.deepEqual(layoutStackedBar([{ value: 0, color: '#f00' }], 100), []);
  });

  it('returns empty for non-positive width', () => {
    assert.deepEqual(layoutStackedBar([{ value: 1, color: '#f00' }], 0), []);
  });

  it('splits a two-segment bar proportionally', () => {
    const rects = layoutStackedBar([
      { value: 30, color: '#f00' },
      { value: 70, color: '#0f0' },
    ], 100);
    assert.equal(rects.length, 2);
    assert.equal(rects[0].x, 0);
    assert.equal(rects[0].w, 30);
    assert.equal(rects[1].x, 30);
    // last absorbs remainder → 100 - 30 = 70
    assert.equal(rects[1].w, 70);
  });

  it('last segment absorbs rounding remainder so full width is used', () => {
    const rects = layoutStackedBar([
      { value: 1, color: '#a' },
      { value: 1, color: '#b' },
      { value: 1, color: '#c' },
    ], 100);
    assert.equal(rects[2].x + rects[2].w, 100);
  });

  it('preserves meta on each segment', () => {
    const rects = layoutStackedBar([
      { value: 1, color: '#a', meta: { label: 'hello' } },
      { value: 1, color: '#b', meta: { label: 'world' } },
    ], 50);
    assert.equal(rects[0].meta.label, 'hello');
    assert.equal(rects[1].meta.label, 'world');
  });

  it('colors flow through unchanged', () => {
    const rects = layoutStackedBar([
      { value: 10, color: '#abc' },
      { value: 20, color: '#def' },
    ], 300);
    assert.equal(rects[0].color, '#abc');
    assert.equal(rects[1].color, '#def');
  });
});

// ── layoutSessionBar ──────────────────────────────────────────────────────

describe('layoutSessionBar', () => {
  const block = (visIdx, tokens, color = '#fff') => ({ visIdx, _tokens: tokens, color });

  it('returns empty for empty blocks', () => {
    assert.deepEqual(layoutSessionBar([], 1000, 200000, 600), []);
  });

  it('returns empty when budget is zero', () => {
    assert.deepEqual(layoutSessionBar([block(0, 100)], 100, 0, 600), []);
  });

  it('fills the bar edge-to-edge for a 100% session', () => {
    // totalTokens == budget → totalPct = 100
    const segs = layoutSessionBar([
      block(0, 50), block(1, 50),
    ], /*total*/ 100, /*budget*/ 100, /*W*/ 600);
    assert.equal(segs.length, 2);
    assert.equal(segs[0].x, 0);
    // Last segment stretches to totalPct=100
    const last = segs[segs.length - 1];
    assert.equal(Math.round(last.x + last.w), 600);
  });

  it('scales deltas so session bar matches totalTokens', () => {
    // sum of deltas = 40 but totalTokens = 100 → sessionScale 2.5
    const segs = layoutSessionBar([
      block(0, 10), block(1, 10), block(2, 10), block(3, 10),
    ], 100, 100, 400);
    // Without scaling: each block would be 10/100*100 = 10%, total 40%.
    // With scaling (2.5x): each block = 25%, total 100% → 400px.
    const last = segs[segs.length - 1];
    assert.equal(Math.round(last.x + last.w), 400);
  });

  it('drops sub-pixel segments below MIN_PX', () => {
    // 1 token out of 1,000,000 budget on a 600px bar:
    // w_pct = 1/1000000*100 = 1e-4 %  →  1e-4/100*600 = 6e-4 px → below 0.5
    const segs = layoutSessionBar([
      block(0, 1),
      block(1, 100000),
    ], /*total*/ 100001, /*budget*/ 1000000, /*W*/ 600);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].visIdx, 1);
  });

  it('preserves visIdx and color on each segment', () => {
    const segs = layoutSessionBar([
      block(5, 100, '#abc'),
      block(7, 100, '#def'),
    ], 200, 200, 100);
    assert.equal(segs[0].visIdx, 5);
    assert.equal(segs[0].color, '#abc');
    assert.equal(segs[1].visIdx, 7);
    assert.equal(segs[1].color, '#def');
  });

  it('handles partial session (totalTokens < budget)', () => {
    const segs = layoutSessionBar([
      block(0, 20), block(1, 20),
    ], 40, 200, 200);
    // Expected totalPct = 40/200*100 = 20% → last edge at 40px.
    const last = segs[segs.length - 1];
    assert.equal(Math.round(last.x + last.w), 40);
    // Neither segment should extend past x=40
    segs.forEach((s) => assert.ok(s.x + s.w <= 40.5));
  });
});

// ── findSegmentAt ─────────────────────────────────────────────────────────

describe('findSegmentAt', () => {
  const segs = [
    { x: 0, w: 10 },
    { x: 10, w: 20 },
    { x: 30, w: 15 },
    { x: 45, w: 5 },
  ];

  it('returns null for empty segments', () => {
    assert.equal(findSegmentAt([], 5), null);
    assert.equal(findSegmentAt(null, 5), null);
  });

  it('finds segment at the left edge', () => assert.equal(findSegmentAt(segs, 0), 0));
  it('finds segment mid-width', () => assert.equal(findSegmentAt(segs, 5), 0));
  it('finds second segment', () => assert.equal(findSegmentAt(segs, 15), 1));
  it('finds third segment', () => assert.equal(findSegmentAt(segs, 30), 2));
  it('finds last segment', () => assert.equal(findSegmentAt(segs, 48), 3));

  it('returns null past the right edge', () => assert.equal(findSegmentAt(segs, 200), null));
  it('returns null before the left edge', () => assert.equal(findSegmentAt(segs, -1), null));

  it('right edge of one segment belongs to the next', () => {
    // x=10 → should be segment index 1, not 0 (strict < on s.x + s.w)
    assert.equal(findSegmentAt(segs, 10), 1);
  });
});

// ── computeBarScale ──────────────────────────────────────────────────────

describe('computeBarScale', () => {
  it('returns linear when fewer than 2 positive values', () => {
    assert.equal(computeBarScale([]).useLog, false);
    assert.equal(computeBarScale([0, 0]).useLog, false);
    assert.equal(computeBarScale([100]).useLog, false);
  });

  it('returns linear when values are within 100×', () => {
    // ratio = 5000/100 = 50 — not enough
    assert.equal(computeBarScale([100, 500, 5000]).useLog, false);
    // ratio = 99 — still linear
    assert.equal(computeBarScale([1, 99]).useLog, false);
  });

  it('switches to log when max/min exceeds 100×', () => {
    // ratio = 1000/1 = 1000 → log
    const s = computeBarScale([1, 10, 1000]);
    assert.equal(s.useLog, true);
    assert.equal(s.logMinExp, 0);
    assert.equal(s.logMaxExp, 3);
  });

  it('ignores zero and negative values when picking range', () => {
    // Positive set = [100, 100000] → max/min = 1000 → triggers log
    const s = computeBarScale([0, -50, 100, 100000]);
    assert.equal(s.useLog, true);
    assert.equal(s.logMinExp, 2); // log10(100)
    assert.equal(s.logMaxExp, 5); // log10(100000)
  });

  it('real-world tokens case: K/M/B span triggers log', () => {
    // Input 72K, Output 5M, Cache 1B
    const s = computeBarScale([72000, 5_000_000, 1_000_000_000]);
    assert.equal(s.useLog, true);
  });

  it('real-world harness case: similar-magnitude counts stay linear', () => {
    // skills 35, agents 54, commands 11
    const s = computeBarScale([35, 54, 11]);
    assert.equal(s.useLog, false);
  });
});

// ── computeBarWidth ──────────────────────────────────────────────────────

describe('computeBarWidth', () => {
  const linear = { useLog: false, logMinExp: 0, logMaxExp: 0 };

  it('returns zero for non-positive total in linear mode', () => {
    assert.equal(computeBarWidth(10, 0, linear), 0);
  });

  it('linear mode returns value/total * 100', () => {
    assert.equal(computeBarWidth(25, 100, linear), 25);
    assert.equal(computeBarWidth(75, 100, linear), 75);
  });

  it('log mode returns 0 for non-positive value', () => {
    const s = { useLog: true, logMinExp: 0, logMaxExp: 3 };
    assert.equal(computeBarWidth(0, 1000, s), 0);
    assert.equal(computeBarWidth(-5, 1000, s), 0);
  });

  it('log mode maps min-row to 8% and max-row to 100%', () => {
    const s = { useLog: true, logMinExp: 0, logMaxExp: 3 }; // [1..1000]
    assert.equal(computeBarWidth(1, 1001, s), 8);    // min → 8%
    assert.equal(computeBarWidth(1000, 1001, s), 100); // max → 100%
  });

  it('log mode places mid-decade values between 8% and 100%', () => {
    const s = { useLog: true, logMinExp: 0, logMaxExp: 3 };
    const mid = computeBarWidth(10, 1011, s);
    assert.ok(mid > 8 && mid < 100);
    // log10(10)=1 → (1-0)/(3-0)=0.333 → 8 + 0.333*92 ≈ 38.67
    assert.ok(Math.abs(mid - 38.67) < 0.5);
  });

  it('log mode handles degenerate range (all same value)', () => {
    const s = { useLog: true, logMinExp: 2, logMaxExp: 2 };
    assert.equal(computeBarWidth(100, 100, s), 100);
  });

  it('real-world token bars — small value still visible', () => {
    const s = computeBarScale([72000, 5_000_000, 1_000_000_000]);
    const wInput = computeBarWidth(72000, 1_005_072_000, s);
    const wOutput = computeBarWidth(5_000_000, 1_005_072_000, s);
    const wCache = computeBarWidth(1_000_000_000, 1_005_072_000, s);
    assert.equal(wInput, 8);  // smallest
    assert.ok(wOutput > 30 && wOutput < 70); // middle
    assert.equal(wCache, 100); // largest
  });
});
