// session-bookmarks.test.mjs — unit tests for session bookmark & tag helpers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadBookmarks, saveBookmarks, toggleStar,
  setTags, filterSessions, allTags,
} from '../templates/session-bookmarks.mjs';

// ── loadBookmarks ────────────────────────────────────────────────────────

describe('loadBookmarks', () => {
  it('returns empty object for null', () => {
    assert.deepEqual(loadBookmarks(null), {});
  });

  it('returns empty object for invalid JSON', () => {
    assert.deepEqual(loadBookmarks('not-json'), {});
  });

  it('returns empty object for non-object JSON', () => {
    assert.deepEqual(loadBookmarks('[1,2,3]'), {});
  });

  it('parses valid bookmark data', () => {
    const data = { s1: { starred: true, tags: ['bug'] } };
    assert.deepEqual(loadBookmarks(JSON.stringify(data)), data);
  });
});

// ── saveBookmarks ────────────────────────────────────────────────────────

describe('saveBookmarks', () => {
  it('prunes entries with no star and no tags', () => {
    const map = {
      s1: { starred: true, tags: [] },
      s2: { starred: false, tags: [] },
      s3: { starred: false, tags: ['debug'] },
    };
    const result = JSON.parse(saveBookmarks(map));
    assert.ok(result.s1);
    assert.ok(!result.s2);
    assert.ok(result.s3);
  });

  it('returns valid JSON', () => {
    const result = saveBookmarks({ s1: { starred: true, tags: ['a'] } });
    assert.doesNotThrow(() => JSON.parse(result));
  });
});

// ── toggleStar ───────────────────────────────────────────────────────────

describe('toggleStar', () => {
  it('stars an unstarred session', () => {
    const result = toggleStar({}, 's1');
    assert.equal(result.s1.starred, true);
  });

  it('unstars a starred session', () => {
    const result = toggleStar({ s1: { starred: true, tags: [] } }, 's1');
    assert.equal(result.s1.starred, false);
  });

  it('preserves existing tags', () => {
    const result = toggleStar({ s1: { starred: false, tags: ['bug'] } }, 's1');
    assert.deepEqual(result.s1.tags, ['bug']);
  });

  it('does not mutate the original map', () => {
    const original = { s1: { starred: false, tags: [] } };
    toggleStar(original, 's1');
    assert.equal(original.s1.starred, false);
  });
});

// ── setTags ──────────────────────────────────────────────────────────────

describe('setTags', () => {
  it('sets tags on a new session', () => {
    const result = setTags({}, 's1', ['bug', 'debug']);
    assert.deepEqual(result.s1.tags, ['bug', 'debug']);
    assert.equal(result.s1.starred, false);
  });

  it('replaces existing tags', () => {
    const result = setTags({ s1: { starred: true, tags: ['old'] } }, 's1', ['new']);
    assert.deepEqual(result.s1.tags, ['new']);
    assert.equal(result.s1.starred, true);
  });
});

// ── filterSessions ───────────────────────────────────────────────────────

describe('filterSessions', () => {
  const sessions = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  const map = {
    s1: { starred: true, tags: ['bug'] },
    s2: { starred: false, tags: ['feature'] },
    s3: { starred: true, tags: ['bug', 'feature'] },
  };

  it('returns all sessions when no filters applied', () => {
    assert.equal(filterSessions(sessions, map, {}).length, 3);
  });

  it('filters to starred only', () => {
    const result = filterSessions(sessions, map, { starredOnly: true });
    assert.equal(result.length, 2);
    assert.ok(result.every(s => map[s.id].starred));
  });

  it('filters by tag', () => {
    const result = filterSessions(sessions, map, { tagFilter: 'feature' });
    assert.equal(result.length, 2);
  });

  it('combines starred + tag filter', () => {
    const result = filterSessions(sessions, map, { starredOnly: true, tagFilter: 'feature' });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 's3');
  });

  it('returns empty for unmatched filter', () => {
    const result = filterSessions(sessions, map, { tagFilter: 'nonexistent' });
    assert.equal(result.length, 0);
  });
});

// ── allTags ──────────────────────────────────────────────────────────────

describe('allTags', () => {
  it('collects unique tags sorted alphabetically', () => {
    const map = {
      s1: { starred: true, tags: ['bug', 'debug'] },
      s2: { starred: false, tags: ['debug', 'feature'] },
    };
    assert.deepEqual(allTags(map), ['bug', 'debug', 'feature']);
  });

  it('returns empty array for no bookmarks', () => {
    assert.deepEqual(allTags({}), []);
  });
});
