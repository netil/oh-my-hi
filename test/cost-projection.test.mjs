// cost-projection.test.mjs — unit tests for month-end cost projection.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  projectMonthEnd,
  parseDateKey,
  daysInMonth,
  shiftDateKey,
} from '../templates/cost-projection.mjs';

describe('parseDateKey', () => {
  it('parses valid ISO date keys', () => {
    assert.deepEqual(parseDateKey('2026-04-11'), { y: 2026, m: 4, d: 11 });
  });
  it('rejects malformed input', () => {
    assert.equal(parseDateKey('2026/04/11'), null);
    assert.equal(parseDateKey('bad'), null);
    assert.equal(parseDateKey(''), null);
  });
});

describe('daysInMonth', () => {
  it('returns 31 for January', () => assert.equal(daysInMonth(2026, 1), 31));
  it('returns 30 for April', () => assert.equal(daysInMonth(2026, 4), 30));
  it('returns 28 for February 2026 (non-leap)', () => assert.equal(daysInMonth(2026, 2), 28));
  it('returns 29 for February 2024 (leap)', () => assert.equal(daysInMonth(2024, 2), 29));
});

describe('shiftDateKey', () => {
  it('shifts forward', () => assert.equal(shiftDateKey('2026-04-11', 3), '2026-04-14'));
  it('shifts backward', () => assert.equal(shiftDateKey('2026-04-11', -5), '2026-04-06'));
  it('crosses month boundary', () => assert.equal(shiftDateKey('2026-04-01', -1), '2026-03-31'));
});

describe('projectMonthEnd', () => {
  it('returns null for invalid today', () => {
    assert.equal(projectMonthEnd({}, 'bad', 100), null);
  });

  it('suppresses projection when fewer than 3 sample days', () => {
    const map = {
      '2026-04-10': 5,
      '2026-04-11': 3,
    };
    const r = projectMonthEnd(map, '2026-04-11', 100);
    assert.ok(r);
    assert.equal(r.confidence, 'none');
    assert.equal(r.sampleDays, 2);
  });

  it('marks confidence low for 3-4 sample days', () => {
    const map = {
      '2026-04-05': 1,
      '2026-04-07': 2,
      '2026-04-09': 1,
    };
    const r = projectMonthEnd(map, '2026-04-11', 100);
    assert.ok(r);
    assert.equal(r.confidence, 'low');
    assert.equal(r.sampleDays, 3);
  });

  it('marks confidence high for 5+ sample days and projects month end', () => {
    // 7-day window ending 2026-04-11 (inclusive) → 2026-04-05..2026-04-11
    const map = {
      '2026-04-05': 2,
      '2026-04-06': 2,
      '2026-04-07': 2,
      '2026-04-08': 2,
      '2026-04-09': 2,
      '2026-04-10': 2,
      '2026-04-11': 2,
    };
    const r = projectMonthEnd(map, '2026-04-11', 100);
    assert.ok(r);
    assert.equal(r.confidence, 'high');
    assert.equal(r.sampleDays, 7);
    assert.equal(r.dailyAvg, 2); // 14 / 7
    assert.equal(r.daysInMonth, 30);
    assert.equal(r.daysRemaining, 19); // 30 - 11
    assert.equal(r.monthToDate, 14);
    assert.equal(r.projected, 14 + 2 * 19); // 52
  });

  it('returns null diff when no budget set', () => {
    const map = { '2026-04-09': 1, '2026-04-10': 1, '2026-04-11': 1 };
    const r = projectMonthEnd(map, '2026-04-11', null);
    assert.ok(r);
    assert.equal(r.diff, null);
    assert.equal(r.overBudget, false);
  });

  it('flags over-budget when projection exceeds monthly budget', () => {
    const map = {
      '2026-04-05': 10, '2026-04-06': 10, '2026-04-07': 10,
      '2026-04-08': 10, '2026-04-09': 10, '2026-04-10': 10, '2026-04-11': 10,
    };
    const r = projectMonthEnd(map, '2026-04-11', 100);
    assert.ok(r);
    assert.equal(r.overBudget, true);
    // projected = 70 (MTD) + 10 * 19 = 260, diff = 160
    assert.equal(r.projected, 260);
    assert.equal(r.diff, 160);
  });

  it('flags under-budget when projection is below monthly budget', () => {
    const map = {
      '2026-04-05': 1, '2026-04-06': 1, '2026-04-07': 1,
      '2026-04-08': 1, '2026-04-09': 1,
    };
    const r = projectMonthEnd(map, '2026-04-11', 100);
    assert.ok(r);
    assert.equal(r.overBudget, false);
    // window 2026-04-05..2026-04-11, sum=5, dailyAvg=5/7≈0.714
    // MTD = 5, projected = 5 + 0.714*19 ≈ 18.57
    assert.ok(r.projected < 100);
    assert.ok((r.diff ?? 0) < 0);
  });

  it('handles month boundary — day 1 has full month remaining', () => {
    const map = {
      '2026-03-26': 3, '2026-03-27': 3, '2026-03-28': 3,
      '2026-03-29': 3, '2026-03-30': 3, '2026-03-31': 3,
      '2026-04-01': 3,
    };
    const r = projectMonthEnd(map, '2026-04-01', 100);
    assert.ok(r);
    assert.equal(r.sampleDays, 7);
    assert.equal(r.dailyAvg, 3);
    assert.equal(r.monthToDate, 3); // only 2026-04-01 counts
    assert.equal(r.daysRemaining, 29); // April has 30, day 1 → 29 left
    assert.equal(r.projected, 3 + 3 * 29); // 90
  });

  it('ignores days outside the window for sampleDays', () => {
    const map = {
      '2026-03-20': 100, // outside 7-day window
      '2026-04-10': 1,
      '2026-04-11': 1,
    };
    const r = projectMonthEnd(map, '2026-04-11', 50);
    assert.ok(r);
    assert.equal(r.sampleDays, 2);
    assert.equal(r.confidence, 'none');
  });
});
