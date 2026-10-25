import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dayKeysEnding, buildDailySeries, buildHourMatrix, buildItemRows, filterItemRows } from '../templates/overview-data.mjs';

// Local wall-clock times: days and hours are local
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('overview-data', () => {
  it('dayKeysEnding lists local days oldest first, across a month end', () => {
    assert.deepEqual(dayKeysEnding(new Date(2026, 10, 2), 3), ['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('buildDailySeries sums calls (with legacy counts), tokens, cost and sessions per day', () => {
    const days = dayKeysEnding(new Date(2026, 9, 24), 2);
    const s = buildDailySeries({
      skills: [{ name: 'a', timestamp: at(2026, 10, 23) }, { name: 'a', timestamp: at(2026, 10, 24, 0) }],
      agents: [{ name: 'g', count: 3, timestamp: at(2026, 10, 24) }, { name: 'g', timestamp: at(2026, 10, 1) }],
      mcpCalls: [],
      tokenEntries: [
        { timestamp: at(2026, 10, 24), sessionId: 's1', rawInput: 1, outputTokens: 2, cacheRead: 3, cacheCreation: 4 },
        { timestamp: at(2026, 10, 24, 1), sessionId: 's1', outputTokens: 10 },
        { timestamp: at(2026, 10, 24, 2), sessionId: 's2' },
      ],
    }, days, () => 0.5);
    assert.deepEqual(s.skills, [1, 1]);
    assert.deepEqual(s.agents, [0, 3]); // 10-01 is outside the days
    assert.deepEqual(s.tokens, [0, 20]);
    assert.deepEqual(s.sessions, [0, 2]);
    assert.deepEqual(s.cost, [0, 1.5]);
  });

  it('buildHourMatrix puts Monday in row 0 and Sunday in row 6', () => {
    const m = buildHourMatrix([
      { timestamp: at(2026, 10, 19, 9), sessionId: 'a' }, // Monday
      { timestamp: at(2026, 10, 25, 23), sessionId: 'b' }, // Sunday
      { timestamp: at(2026, 10, 25, 23), sessionId: 'b' },
    ]);
    assert.equal(m.cells[0][9], 1);
    assert.equal(m.cells[6][23], 2);
    assert.equal(m.max, 2);
    assert.equal(m.sessions, 2);
    assert.equal(m.sessionCounts[6][23], 1); // two responses, one session
  });

  it('buildHourMatrix sums tokens per cell', () => {
    const m = buildHourMatrix([
      { timestamp: at(2026, 10, 19, 9), rawInput: 1, outputTokens: 2, cacheRead: 3, cacheCreation: 4 },
      { timestamp: at(2026, 10, 19, 9), outputTokens: 10 },
    ]);
    assert.equal(m.tokens[0][9], 20);
  });
});

describe('overview-data: harness item rows', () => {
  const rows = buildItemRows({
    items: [
      { kind: 'skills', name: 'brainstorming' },
      { kind: 'skills', name: 'idle' },
      { kind: 'mcpServers', name: 'chrome' },
      { kind: 'principles', name: 'P1' },
    ],
    usage: {
      skills: [
        { name: 'superpowers:brainstorming', timestamp: 100, count: 3 }, // legacy aggregate
        { name: 'brainstorming', timestamp: 300 },
        { name: 'brainstorming', timestamp: 5 }, // before the period: counts for last use only
      ],
      mcpServers: [{ name: 'chrome', timestamp: 200 }],
    },
    inPeriod: (r) => r.timestamp >= 50,
    turnTokens: { chrome: 1000 },
    startup: [{ kind: 'mcpServers', name: 'chrome', tokens: 50 }, { kind: 'principles', name: 'P1', tokens: 400 }],
    sessions: 3,
  });

  it('counts plugin-prefixed calls in the period and keeps the latest call', () => {
    const b = rows.find((r) => r.name === 'brainstorming');
    assert.equal(b.calls, 4);
    assert.equal(b.last, 300);
  });

  it('adds startup context once per session to turn tokens', () => {
    assert.equal(rows.find((r) => r.name === 'chrome').ctx, 1000 + 50 * 3);
    assert.equal(rows.find((r) => r.name === 'P1').ctx, 1200);
  });

  it('marks items without call data as not countable, and sorts by calls', () => {
    assert.deepEqual(rows.map((r) => [r.name, r.calls, r.unused]),
      [['brainstorming', 4, false], ['chrome', 1, false], ['idle', 0, true], ['P1', null, false]]);
  });

  it('filters by kind, unused and context size', () => {
    assert.deepEqual(filterItemRows(rows, { unusedOnly: true }).map((r) => r.name), ['idle']);
    assert.deepEqual(filterItemRows(rows, { minCtx: 1000 }).map((r) => r.name), ['chrome', 'P1']);
    assert.deepEqual(filterItemRows(rows, { kind: 'skills' }).map((r) => r.name), ['brainstorming', 'idle']);
  });
});
