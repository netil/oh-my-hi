// issue2-spa.test.mjs — pure-logic tests for four SPA bugs fixed in app.js
// Tests run in Node without a browser by inlining or extracting the relevant logic.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline helpers (mirrors fixed logic in templates/app.js) ──────────────────

function filterByPeriod(list, field, days) {
  if (days === 0) return list;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return list.filter((r) => {
    const ts = r[field];
    return typeof ts === 'number' ? ts >= cutoff : new Date(ts).getTime() >= cutoff;
  });
}

// Fixed countUsageList (Bug #6)
function countUsageList(list, days) {
  if (!list) return 0;
  return filterByPeriod(list, 'timestamp', days).reduce(
    (s, r) => s + (typeof r.count === 'number' ? r.count : 1),
    0
  );
}

// Fixed calcChangeForList (Bug #6)
function calcChangeForList(list, days) {
  if (days === 0) return null;
  const now = new Date();
  const curStart = new Date(now);
  curStart.setDate(curStart.getDate() - days);
  const prevStart = new Date(curStart);
  prevStart.setDate(prevStart.getDate() - days);
  const cur = list
    .filter((i) => new Date(i.timestamp) >= curStart)
    .reduce((s, r) => s + (typeof r.count === 'number' ? r.count : 1), 0);
  const prev = list
    .filter((i) => {
      const d = new Date(i.timestamp);
      return d >= prevStart && d < curStart;
    })
    .reduce((s, r) => s + (typeof r.count === 'number' ? r.count : 1), 0);
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Bug #6 — countUsageList sums count field', () => {
  it('sums count field instead of counting rows', () => {
    const now = Date.now();
    const list = [
      { name: 'skill-a', count: 3, date: '2026-01-01', timestamp: now },
      { name: 'skill-a', count: 5, date: '2026-01-02', timestamp: now },
    ];
    // Should return 3+5=8, not 2 (the old .length behavior)
    assert.equal(countUsageList(list, 30), 8);
  });

  it('falls back to 1 per entry when count field is absent', () => {
    const now = Date.now();
    const list = [
      { name: 'x', timestamp: now },
      { name: 'y', timestamp: now },
    ];
    // No count field → each entry contributes 1 → total 2
    assert.equal(countUsageList(list, 30), 2);
  });

  it('returns 0 for null list', () => {
    assert.equal(countUsageList(null, 30), 0);
  });
});

describe('Bug #6 — calcChangeForList uses summed counts', () => {
  it('calculates percentage change using count sums, not entry counts', () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const days = 7;

    // Previous period: 2 entries each with count=5 → prev sum = 10
    const prevTs = now - days * dayMs - dayMs; // 8 days ago
    // Current period: 1 entry with count=30 → cur sum = 30
    const curTs = now - dayMs; // 1 day ago

    const list = [
      { name: 'a', count: 5, timestamp: new Date(prevTs).toISOString() },
      { name: 'b', count: 5, timestamp: new Date(prevTs).toISOString() },
      { name: 'c', count: 30, timestamp: new Date(curTs).toISOString() },
    ];

    const change = calcChangeForList(list, days);

    // cur=30, prev=10 → ((30-10)/10)*100 = 200%
    assert.equal(change, 200);

    // Old .length behavior would have given: cur=1, prev=2 → ((1-2)/2)*100 = -50%
    assert.notEqual(change, -50);
  });

  it('returns 100 when previous period is empty and current has entries', () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const list = [{ name: 'a', count: 3, timestamp: new Date(now - dayMs).toISOString() }];
    assert.equal(calcChangeForList(list, 7), 100);
  });

  it('returns 0 when both periods are empty', () => {
    assert.equal(calcChangeForList([], 7), 0);
  });
});

describe('Bug #4 — usage guard condition', () => {
  it('is truthy when sd.usage is an empty object {}', () => {
    const sd = { usage: {} };
    // This is the bug: old guard `!sd.usage` would be false for {}
    // New guard must detect that tokenEntries is missing
    const shouldFetch = sd && (!sd.usage || !sd.usage.tokenEntries);
    assert.equal(shouldFetch, true, 'Should re-fetch when usage={} (no tokenEntries)');
  });

  it('is falsy when sd.usage already has tokenEntries', () => {
    const sd = { usage: { tokenEntries: [{ ts: 1 }] } };
    const shouldFetch = sd && (!sd.usage || !sd.usage.tokenEntries);
    assert.equal(shouldFetch, false, 'Should NOT re-fetch when tokenEntries exist');
  });

  it('old guard would incorrectly skip re-fetch for empty usage object', () => {
    const sd = { usage: {} };
    // Old (broken) condition
    const oldGuard = sd && !sd.usage;
    assert.equal(oldGuard, false, 'Old guard returns false for {} — confirms the bug');
  });
});

describe('Bug #9 — currentScope localStorage persistence', () => {
  it('returns null from getItem before any value is set', () => {
    // Simulate the Node environment — no real localStorage available
    // We test the initialization logic directly
    const mockStorage = {};
    const getItem = (key) => mockStorage[key] ?? null;
    const setItem = (key, val) => { mockStorage[key] = val; };

    // Initial read before any set → null → falls back to 'global'
    const initialScope = getItem('harness-scope') || 'global';
    assert.equal(initialScope, 'global');
  });

  it('persists scope and reads it back on next init', () => {
    const mockStorage = {};
    const getItem = (key) => mockStorage[key] ?? null;
    const setItem = (key, val) => { mockStorage[key] = val; };

    // Simulate onScopeChange writing to storage
    const newScope = 'workspace-abc';
    try { setItem('harness-scope', newScope); } catch (_) {}

    // Simulate next page load reading it back
    const restoredScope = getItem('harness-scope') || 'global';
    assert.equal(restoredScope, 'workspace-abc');
  });

  it('falls back to global when storage value is null', () => {
    const mockStorage = {};
    const getItem = (key) => mockStorage[key] ?? null;

    const scope = getItem('harness-scope') || 'global';
    assert.equal(scope, 'global');
  });
});
