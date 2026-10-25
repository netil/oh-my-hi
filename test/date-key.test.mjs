import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, tsDateKey } from '../templates/date-key.mjs';

describe('date-key', () => {
  it('keys by the local day, not the UTC day', () => {
    const lateNight = new Date(2026, 9, 24, 0, 30); // local 00:30
    assert.equal(dateKey(lateNight), '2026-10-24');
    assert.equal(tsDateKey(lateNight.getTime()), '2026-10-24');
    assert.equal(tsDateKey(lateNight.toISOString()), '2026-10-24');
  });

  it('passes bare dates through and rejects bad input', () => {
    assert.equal(tsDateKey('2026-10-24'), '2026-10-24');
    assert.equal(tsDateKey('not a date'), '');
    assert.equal(tsDateKey(undefined), '');
  });
});
