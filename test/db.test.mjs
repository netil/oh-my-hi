// db.test.mjs — unit tests for SQLite helpers in scripts/db.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

import {
  openDb,
  getSchemaVersion,
  getMachineId,
  appendUsage,
  upsertUsage,
  queryUsage,
  queryUsageMultiDb,
  appendUsageMonthly,
  getMonthlyDbPath,
  listMonthlyDbs,
  splitLegacyDb,
  countDbRows,
  recoverIfCorrupt,
  escapeFtsMatch,
  searchPrompts,
  searchPromptsInDb,
  SEARCH_MARK_START,
  SEARCH_MARK_END,
  importUsageDir,
} from '../scripts/db.mjs';

const require = createRequire(import.meta.url);

function freshDb() {
  return openDb(':memory:');
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omh-test-'));
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Schema ──────────────────────────────────────────────────────────────────

describe('Schema', () => {
  it('openDb creates a v2 schema (fresh install)', () => {
    const db = freshDb();
    assert.equal(getSchemaVersion(db), 2);
    db.close();
  });

  it('all usage-bearing tables have a machine column', () => {
    const db = freshDb();
    for (const table of ['token_entries', 'prompt_entries', 'skill_usage', 'agent_usage', 'mcp_calls', 'latency_entries']) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
      assert.ok(cols.includes('machine'), `${table} has machine column`);
    }
    db.close();
  });

  it('prompt_entries table exists with expected columns', () => {
    const db = freshDb();
    const cols = db.prepare("PRAGMA table_info(prompt_entries)").all().map(r => r.name);
    assert.ok(cols.includes('scope'), 'scope column');
    assert.ok(cols.includes('session_id'), 'session_id column');
    assert.ok(cols.includes('timestamp'), 'timestamp column');
    assert.ok(cols.includes('char_len'), 'char_len column');
    assert.ok(cols.includes('preview'), 'preview column');
    db.close();
  });

  it('prompt_entries has UNIQUE constraint on (scope, session_id, timestamp)', () => {
    const db = freshDb();
    const indices = db.prepare("PRAGMA index_list(prompt_entries)").all();
    const hasUnique = indices.some(i => i.unique === 1);
    assert.ok(hasUnique, 'unique index exists');
    db.close();
  });
});

// ── appendUsage — promptStats ────────────────────────────────────────────────

describe('appendUsage — promptStats → prompt_entries', () => {
  it('inserts promptStats with sessionId and preview', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [
        { sessionId: 'abc-123', timestamp: 1000, charLen: 50, preview: 'first prompt text' },
        { sessionId: 'abc-123', timestamp: 2000, charLen: 30, preview: 'second prompt text' },
      ],
    });
    const rows = db.prepare('SELECT * FROM prompt_entries ORDER BY timestamp').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].session_id, 'abc-123');
    assert.equal(rows[0].preview, 'first prompt text');
    assert.equal(rows[1].preview, 'second prompt text');
    db.close();
  });

  it('deduplicates identical (scope, session_id, timestamp) entries', () => {
    const db = freshDb();
    const entry = { sessionId: 'dup', timestamp: 1000, charLen: 10, preview: 'original' };
    appendUsage(db, 'global', { promptStats: [entry] });
    appendUsage(db, 'global', { promptStats: [entry] });
    const count = db.prepare('SELECT COUNT(*) as c FROM prompt_entries').get().c;
    assert.equal(count, 1, 'INSERT OR IGNORE prevents duplicate rows');
    db.close();
  });

  it('skips entries with no valid timestamp', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [
        { sessionId: 'x', timestamp: 0, preview: 'zero ts' },
        { sessionId: 'x', timestamp: null, preview: 'null ts' },
      ],
    });
    const count = db.prepare('SELECT COUNT(*) as c FROM prompt_entries').get().c;
    assert.equal(count, 0, 'invalid timestamps are skipped');
    db.close();
  });

  it('stores null preview when preview is absent', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [{ sessionId: 'y', timestamp: 500, charLen: 0 }],
    });
    const row = db.prepare('SELECT preview FROM prompt_entries').get();
    assert.equal(row.preview, null);
    db.close();
  });

  it('uses empty string as session_id when sessionId is missing', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [{ timestamp: 999, charLen: 5, preview: 'no sid' }],
    });
    const row = db.prepare('SELECT session_id FROM prompt_entries').get();
    assert.equal(row.session_id, '', 'missing sessionId → empty string sentinel');
    db.close();
  });
});

// ── upsertUsage — promptStats ────────────────────────────────────────────────

describe('upsertUsage — promptStats → prompt_entries', () => {
  it('replaces all previous prompt_entries for the scope on each call', () => {
    const db = freshDb();
    upsertUsage(db, 'global', {
      promptStats: [
        { sessionId: 's1', timestamp: 1000, preview: 'first' },
        { sessionId: 's1', timestamp: 2000, preview: 'second' },
      ],
    });
    upsertUsage(db, 'global', {
      promptStats: [
        { sessionId: 's2', timestamp: 3000, preview: 'new only' },
      ],
    });
    const rows = db.prepare('SELECT * FROM prompt_entries').all();
    assert.equal(rows.length, 1, 'previous rows replaced');
    assert.equal(rows[0].session_id, 's2');
    db.close();
  });

  it('does not delete entries for other scopes', () => {
    const db = freshDb();
    upsertUsage(db, 'project-a', {
      promptStats: [{ sessionId: 'sa', timestamp: 1000, preview: 'project a prompt' }],
    });
    upsertUsage(db, 'project-b', {
      promptStats: [{ sessionId: 'sb', timestamp: 2000, preview: 'project b prompt' }],
    });
    const count = db.prepare('SELECT COUNT(*) as c FROM prompt_entries').get().c;
    assert.equal(count, 2, 'each scope keeps its own rows');
    db.close();
  });
});

// ── queryUsage — promptStats shape ───────────────────────────────────────────

describe('queryUsage — promptStats shape', () => {
  it('returns promptStats as { sessionId, timestamp, charLen, preview } objects', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [
        { sessionId: 'q1', timestamp: 5000, charLen: 99, preview: 'hello world' },
      ],
    });
    const result = queryUsage(db, 'global', 0, 9999999);
    assert.equal(result.promptStats.length, 1);
    const p = result.promptStats[0];
    assert.equal(p.sessionId, 'q1');
    assert.equal(p.timestamp, 5000);
    assert.equal(p.charLen, 99);
    assert.equal(p.preview, 'hello world');
    db.close();
  });

  it('filters promptStats by [from, to] timestamp range', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [
        { sessionId: 's', timestamp: 1000, preview: 'before range' },
        { sessionId: 's', timestamp: 5000, preview: 'in range' },
        { sessionId: 's', timestamp: 9000, preview: 'after range' },
      ],
    });
    const result = queryUsage(db, 'global', 3000, 7000);
    assert.equal(result.promptStats.length, 1);
    assert.equal(result.promptStats[0].preview, 'in range');
    db.close();
  });

  it('returns promptStats sorted by timestamp ascending', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [
        { sessionId: 's', timestamp: 3000, preview: 'third' },
        { sessionId: 's', timestamp: 1000, preview: 'first' },
        { sessionId: 's', timestamp: 2000, preview: 'second' },
      ],
    });
    const result = queryUsage(db, 'global', 0, 9999999);
    assert.equal(result.promptStats[0].preview, 'first');
    assert.equal(result.promptStats[1].preview, 'second');
    assert.equal(result.promptStats[2].preview, 'third');
    db.close();
  });

  it('maps empty-string session_id back to null in query result', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [{ timestamp: 1000, charLen: 5, preview: 'no sid' }],
    });
    const result = queryUsage(db, 'global', 0, 9999999);
    // session_id '' sentinel → null so callers can use `if (p.sessionId)` safely
    assert.equal(result.promptStats[0].sessionId, null);
    db.close();
  });
});

// ── queryUsageMultiDb — promptStats dedup ────────────────────────────────────

describe('queryUsageMultiDb — promptStats across multiple DBs', () => {
  it('merges promptStats from multiple DBs without duplicates', () => {
    const db1 = freshDb();
    const db2 = freshDb();
    appendUsage(db1, 'global', {
      promptStats: [{ sessionId: 'x', timestamp: 1000, preview: 'from db1' }],
    });
    appendUsage(db2, 'global', {
      promptStats: [{ sessionId: 'y', timestamp: 2000, preview: 'from db2' }],
    });
    const result = queryUsageMultiDb([db1, db2], 'global', 0, 9999999);
    assert.equal(result.promptStats.length, 2);
    db1.close(); db2.close();
  });

  it('deduplicates same (sessionId, timestamp) across DBs', () => {
    const db1 = freshDb();
    const db2 = freshDb();
    const entry = { sessionId: 'dup', timestamp: 1000, preview: 'dup' };
    appendUsage(db1, 'global', { promptStats: [entry] });
    appendUsage(db2, 'global', { promptStats: [entry] });
    const result = queryUsageMultiDb([db1, db2], 'global', 0, 9999999);
    assert.equal(result.promptStats.length, 1, 'same entry across two DBs deduped by Map key');
    db1.close(); db2.close();
  });

  it('returns promptStats sorted by timestamp ascending', () => {
    const db1 = freshDb();
    const db2 = freshDb();
    appendUsage(db1, 'global', {
      promptStats: [{ sessionId: 'a', timestamp: 9000, preview: 'later' }],
    });
    appendUsage(db2, 'global', {
      promptStats: [{ sessionId: 'b', timestamp: 1000, preview: 'earlier' }],
    });
    const result = queryUsageMultiDb([db1, db2], 'global', 0, 9999999);
    assert.equal(result.promptStats[0].preview, 'earlier');
    assert.equal(result.promptStats[1].preview, 'later');
    db1.close(); db2.close();
  });
});

// ── appendUsage — latencyEntries ─────────────────────────────────────────────

describe('appendUsage — latencyEntries → latency_entries', () => {
  it('inserts latencyEntries with sessionId, timestamp, latencyMs', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      latencyEntries: [
        { sessionId: 's1', timestamp: 1000, latencyMs: 300, model: 'claude-3' },
        { sessionId: 's1', timestamp: 2000, latencyMs: 450, model: 'claude-3' },
      ],
    });
    const rows = db.prepare('SELECT * FROM latency_entries ORDER BY timestamp').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].session_id, 's1');
    assert.equal(rows[0].latency_ms, 300);
    assert.equal(rows[1].latency_ms, 450);
    db.close();
  });

  it('deduplicates identical (scope, timestamp, session_id) entries', () => {
    const db = freshDb();
    const entry = { sessionId: 'dup', timestamp: 1000, latencyMs: 200 };
    appendUsage(db, 'global', { latencyEntries: [entry] });
    appendUsage(db, 'global', { latencyEntries: [entry] });
    const count = db.prepare('SELECT COUNT(*) as c FROM latency_entries').get().c;
    assert.equal(count, 1, 'INSERT OR IGNORE prevents duplicate rows');
    db.close();
  });

  it('skips entries with no valid timestamp', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      latencyEntries: [
        { sessionId: 'x', timestamp: 0, latencyMs: 100 },
        { sessionId: 'x', timestamp: null, latencyMs: 100 },
      ],
    });
    const count = db.prepare('SELECT COUNT(*) as c FROM latency_entries').get().c;
    assert.equal(count, 0, 'invalid timestamps are skipped');
    db.close();
  });

  it('stores null session_id when sessionId is absent', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      latencyEntries: [{ timestamp: 500, latencyMs: 150 }],
    });
    const row = db.prepare('SELECT session_id FROM latency_entries').get();
    assert.equal(row.session_id, null);
    db.close();
  });
});

// ── upsertUsage — latencyEntries ─────────────────────────────────────────────

describe('upsertUsage — latencyEntries', () => {
  it('replaces all previous latency_entries for the scope on each call', () => {
    const db = freshDb();
    upsertUsage(db, 'global', {
      latencyEntries: [
        { sessionId: 's1', timestamp: 1000, latencyMs: 200 },
        { sessionId: 's1', timestamp: 2000, latencyMs: 300 },
      ],
    });
    upsertUsage(db, 'global', {
      latencyEntries: [
        { sessionId: 's2', timestamp: 3000, latencyMs: 500 },
      ],
    });
    const rows = db.prepare('SELECT * FROM latency_entries').all();
    assert.equal(rows.length, 1, 'previous rows replaced');
    assert.equal(rows[0].session_id, 's2');
    assert.equal(rows[0].latency_ms, 500);
    db.close();
  });

  it('does not delete latency_entries for other scopes', () => {
    const db = freshDb();
    upsertUsage(db, 'project-a', {
      latencyEntries: [{ sessionId: 'sa', timestamp: 1000, latencyMs: 100 }],
    });
    upsertUsage(db, 'project-b', {
      latencyEntries: [{ sessionId: 'sb', timestamp: 2000, latencyMs: 200 }],
    });
    const count = db.prepare('SELECT COUNT(*) as c FROM latency_entries').get().c;
    assert.equal(count, 2, 'each scope keeps its own rows');
    db.close();
  });
});

// ── queryUsage — latencyEntries shape ────────────────────────────────────────

describe('queryUsage — latencyEntries shape', () => {
  it('returns latencyEntries as { sessionId, timestamp, latencyMs } objects', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      latencyEntries: [{ sessionId: 'q1', timestamp: 5000, latencyMs: 250, model: 'sonnet' }],
    });
    const result = queryUsage(db, 'global', 0, 9999999);
    assert.equal(result.latencyEntries.length, 1);
    const l = result.latencyEntries[0];
    assert.equal(l.sessionId, 'q1');
    assert.equal(l.timestamp, 5000);
    assert.equal(l.latencyMs, 250);
    db.close();
  });

  it('filters latencyEntries by [from, to] timestamp range', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      latencyEntries: [
        { sessionId: 's', timestamp: 1000, latencyMs: 100 },
        { sessionId: 's', timestamp: 5000, latencyMs: 200 },
        { sessionId: 's', timestamp: 9000, latencyMs: 300 },
      ],
    });
    const result = queryUsage(db, 'global', 3000, 7000);
    assert.equal(result.latencyEntries.length, 1);
    assert.equal(result.latencyEntries[0].latencyMs, 200);
    db.close();
  });

  it('returns latencyEntries sorted by timestamp ascending', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      latencyEntries: [
        { sessionId: 's', timestamp: 3000, latencyMs: 300 },
        { sessionId: 's', timestamp: 1000, latencyMs: 100 },
        { sessionId: 's', timestamp: 2000, latencyMs: 200 },
      ],
    });
    const result = queryUsage(db, 'global', 0, 9999999);
    assert.equal(result.latencyEntries[0].latencyMs, 100);
    assert.equal(result.latencyEntries[1].latencyMs, 200);
    assert.equal(result.latencyEntries[2].latencyMs, 300);
    db.close();
  });
});

// ── queryUsageMultiDb — latencyEntries dedup ─────────────────────────────────

describe('queryUsageMultiDb — latencyEntries across multiple DBs', () => {
  it('merges latencyEntries from multiple DBs', () => {
    const db1 = freshDb();
    const db2 = freshDb();
    appendUsage(db1, 'global', {
      latencyEntries: [{ sessionId: 'x', timestamp: 1000, latencyMs: 100 }],
    });
    appendUsage(db2, 'global', {
      latencyEntries: [{ sessionId: 'y', timestamp: 2000, latencyMs: 200 }],
    });
    const result = queryUsageMultiDb([db1, db2], 'global', 0, 9999999);
    assert.equal(result.latencyEntries.length, 2);
    db1.close(); db2.close();
  });

  it('deduplicates same (sessionId, timestamp) across DBs', () => {
    const db1 = freshDb();
    const db2 = freshDb();
    const entry = { sessionId: 'dup', timestamp: 1000, latencyMs: 150 };
    appendUsage(db1, 'global', { latencyEntries: [entry] });
    appendUsage(db2, 'global', { latencyEntries: [entry] });
    const result = queryUsageMultiDb([db1, db2], 'global', 0, 9999999);
    assert.equal(result.latencyEntries.length, 1, 'same entry across two DBs deduped by Map key');
    db1.close(); db2.close();
  });

  it('returns latencyEntries sorted by timestamp ascending', () => {
    const db1 = freshDb();
    const db2 = freshDb();
    appendUsage(db1, 'global', {
      latencyEntries: [{ sessionId: 'a', timestamp: 9000, latencyMs: 900 }],
    });
    appendUsage(db2, 'global', {
      latencyEntries: [{ sessionId: 'b', timestamp: 1000, latencyMs: 100 }],
    });
    const result = queryUsageMultiDb([db1, db2], 'global', 0, 9999999);
    assert.equal(result.latencyEntries[0].latencyMs, 100);
    assert.equal(result.latencyEntries[1].latencyMs, 900);
    db1.close(); db2.close();
  });
});

// ── appendUsageMonthly — routing ─────────────────────────────────────────────

describe('appendUsageMonthly — monthly DB routing', () => {
  it('routes tokenEntries to correct monthly DB by timestamp', () => {
    const out = tempDir();
    try {
      const jan = Date.UTC(2025, 0, 15);  // 2025-01
      const feb = Date.UTC(2025, 1, 10);  // 2025-02
      appendUsageMonthly(out, 'global', {
        tokenEntries: [
          { sessionId: 's', timestamp: jan, model: 'a', inputTokens: 10, outputTokens: 5, cacheRead: 0, cacheCreation: 0, rawInput: 0 },
          { sessionId: 's', timestamp: feb, model: 'b', inputTokens: 20, outputTokens: 8, cacheRead: 0, cacheCreation: 0, rawInput: 0 },
        ],
      });
      const dbJan = openDb(getMonthlyDbPath(out, 2025, 1));
      const dbFeb = openDb(getMonthlyDbPath(out, 2025, 2));
      assert.equal(dbJan.prepare('SELECT COUNT(*) as c FROM token_entries').get().c, 1, 'jan has 1 entry');
      assert.equal(dbFeb.prepare('SELECT COUNT(*) as c FROM token_entries').get().c, 1, 'feb has 1 entry');
      dbJan.close(); dbFeb.close();
    } finally {
      cleanDir(out);
    }
  });

  it('routes skills to correct month by timestamp when date field is absent', () => {
    const out = tempDir();
    try {
      const mar = Date.UTC(2025, 2, 5);   // 2025-03
      const apr = Date.UTC(2025, 3, 20);  // 2025-04
      appendUsageMonthly(out, 'global', {
        skills: [
          { name: 'skill-a', count: 2, timestamp: mar },
          { name: 'skill-b', count: 1, timestamp: apr },
        ],
      });
      const dbMar = openDb(getMonthlyDbPath(out, 2025, 3));
      const dbApr = openDb(getMonthlyDbPath(out, 2025, 4));
      assert.equal(dbMar.prepare('SELECT COUNT(*) as c FROM skill_usage').get().c, 1, 'mar has 1 skill');
      assert.equal(dbApr.prepare('SELECT COUNT(*) as c FROM skill_usage').get().c, 1, 'apr has 1 skill');
      dbMar.close(); dbApr.close();
    } finally {
      cleanDir(out);
    }
  });

  it('routes latencyEntries to correct monthly DB by timestamp', () => {
    const out = tempDir();
    try {
      const jun = Date.UTC(2025, 5, 10);  // 2025-06
      const jul = Date.UTC(2025, 6, 22);  // 2025-07
      appendUsageMonthly(out, 'global', {
        latencyEntries: [
          { sessionId: 's1', timestamp: jun, latencyMs: 100 },
          { sessionId: 's2', timestamp: jul, latencyMs: 200 },
        ],
      });
      const dbJun = openDb(getMonthlyDbPath(out, 2025, 6));
      const dbJul = openDb(getMonthlyDbPath(out, 2025, 7));
      assert.equal(dbJun.prepare('SELECT COUNT(*) as c FROM latency_entries').get().c, 1, 'jun has 1 entry');
      assert.equal(dbJul.prepare('SELECT COUNT(*) as c FROM latency_entries').get().c, 1, 'jul has 1 entry');
      dbJun.close(); dbJul.close();
    } finally {
      cleanDir(out);
    }
  });

  it('skips latencyEntries with invalid timestamp (no DB created)', () => {
    const out = tempDir();
    try {
      appendUsageMonthly(out, 'global', {
        latencyEntries: [
          { sessionId: 'x', timestamp: 0, latencyMs: 100 },
          { sessionId: 'x', timestamp: null, latencyMs: 100 },
        ],
      });
      // no valid entries → no monthly DB files created
      assert.equal(fs.existsSync(path.join(out, 'db')), false, 'no db dir created');
    } finally {
      cleanDir(out);
    }
  });
});

// ── appendUsageMonthly — per-month retry idempotency ─────────────────────────

describe('appendUsageMonthly — completedMonths retry skip', () => {
  it('records committed month keys in the completedMonths set', () => {
    const out = tempDir();
    try {
      const completed = new Set();
      appendUsageMonthly(out, 'global', {
        skills: [
          { name: 'skill-a', count: 2, timestamp: Date.UTC(2025, 2, 5) },  // 2025-03
          { name: 'skill-b', count: 1, timestamp: Date.UTC(2025, 3, 20) }, // 2025-04
        ],
      }, completed);
      assert.deepEqual([...completed].sort(), ['2025-3', '2025-4']);
    } finally {
      cleanDir(out);
    }
  });

  it('skips months already in completedMonths so counts do not inflate on retry', () => {
    const out = tempDir();
    try {
      const usage = {
        skills: [
          { name: 'skill-a', count: 2, timestamp: Date.UTC(2025, 2, 5) },  // 2025-03
          { name: 'skill-b', count: 1, timestamp: Date.UTC(2025, 3, 20) }, // 2025-04
        ],
        mcpCalls: [
          { tool: 'tool-x', count: 3, timestamp: Date.UTC(2025, 2, 6) },   // 2025-03
        ],
      };
      const completed = new Set();
      appendUsageMonthly(out, 'global', usage, completed);
      // Simulate a retry of the SAME payload (e.g. month B threw SQLITE_BUSY
      // after month A committed): already-committed months must be skipped.
      appendUsageMonthly(out, 'global', usage, completed);
      appendUsageMonthly(out, 'global', usage, completed);

      const dbMar = openDb(getMonthlyDbPath(out, 2025, 3));
      const dbApr = openDb(getMonthlyDbPath(out, 2025, 4));
      assert.equal(dbMar.prepare("SELECT count FROM skill_usage WHERE name = 'skill-a'").get().count, 2, 'skill-a count not inflated');
      assert.equal(dbMar.prepare("SELECT count FROM mcp_calls WHERE tool = 'tool-x'").get().count, 3, 'mcp count not inflated');
      assert.equal(dbApr.prepare("SELECT count FROM skill_usage WHERE name = 'skill-b'").get().count, 1, 'skill-b count not inflated');
      dbMar.close(); dbApr.close();
    } finally {
      cleanDir(out);
    }
  });

  it('pre-seeded completedMonths prevents writing that month at all', () => {
    const out = tempDir();
    try {
      const completed = new Set(['2025-3']);
      appendUsageMonthly(out, 'global', {
        skills: [
          { name: 'skill-a', count: 2, timestamp: Date.UTC(2025, 2, 5) },  // 2025-03 — pre-committed
          { name: 'skill-b', count: 1, timestamp: Date.UTC(2025, 3, 20) }, // 2025-04
        ],
      }, completed);
      assert.equal(fs.existsSync(getMonthlyDbPath(out, 2025, 3)), false, '2025-03 DB not created');
      const dbApr = openDb(getMonthlyDbPath(out, 2025, 4));
      assert.equal(dbApr.prepare('SELECT COUNT(*) as c FROM skill_usage').get().c, 1, '2025-04 written');
      dbApr.close();
    } finally {
      cleanDir(out);
    }
  });

  it('without completedMonths (legacy callers) behavior is unchanged', () => {
    const out = tempDir();
    try {
      const usage = { skills: [{ name: 'skill-a', count: 2, timestamp: Date.UTC(2025, 2, 5) }] };
      appendUsageMonthly(out, 'global', usage);
      appendUsageMonthly(out, 'global', usage); // counts accumulate as before
      const db = openDb(getMonthlyDbPath(out, 2025, 3));
      assert.equal(db.prepare("SELECT count FROM skill_usage WHERE name = 'skill-a'").get().count, 4);
      db.close();
    } finally {
      cleanDir(out);
    }
  });
});

// ── splitLegacyDb — legacy migration ─────────────────────────────────────────

describe('splitLegacyDb — legacy migration', () => {
  it('migrates tokenEntries to monthly DBs', () => {
    const out = tempDir();
    const legacy = freshDb();
    try {
      const ts = Date.UTC(2024, 0, 5);  // 2024-01
      legacy.prepare(`
        INSERT INTO token_entries (scope, session_id, timestamp, model, input_tokens, output_tokens, cache_read, cache_creation, raw_input)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('global', 'sess1', ts, 'claude-3', 100, 50, 0, 0, 0);

      splitLegacyDb(legacy, out);

      const dbJan = openDb(getMonthlyDbPath(out, 2024, 1));
      const rows = dbJan.prepare('SELECT * FROM token_entries').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].session_id, 'sess1');
      assert.equal(rows[0].input_tokens, 100);
      dbJan.close();
    } finally {
      legacy.close();
      cleanDir(out);
    }
  });

  it('skips prompt_stats (daily aggregates not individually timestamped)', () => {
    const out = tempDir();
    const legacy = freshDb();
    try {
      const ts = Date.UTC(2024, 2, 10);  // 2024-03 (for token_entries to ensure DB is created)
      legacy.prepare(`
        INSERT INTO token_entries (scope, session_id, timestamp, model, input_tokens, output_tokens, cache_read, cache_creation, raw_input)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('global', 'sess1', ts, 'claude-3', 1, 1, 0, 0, 0);
      legacy.prepare(`
        INSERT INTO prompt_stats (scope, date, message_count, session_count, tool_call_count)
        VALUES (?, ?, ?, ?, ?)
      `).run('global', '2024-03-10', 5, 2, 10);

      splitLegacyDb(legacy, out);

      const dbMar = openDb(getMonthlyDbPath(out, 2024, 3));
      const count = dbMar.prepare('SELECT COUNT(*) as c FROM prompt_entries').get().c;
      assert.equal(count, 0, 'legacy prompt_stats not migrated to prompt_entries');
      dbMar.close();
    } finally {
      legacy.close();
      cleanDir(out);
    }
  });

  it('migrates skills and mcpCalls by date field', () => {
    const out = tempDir();
    const legacy = freshDb();
    try {
      legacy.prepare(`
        INSERT INTO skill_usage (scope, name, count, date) VALUES (?, ?, ?, ?)
      `).run('global', 'my-skill', 3, '2024-05-15');
      legacy.prepare(`
        INSERT INTO mcp_calls (scope, tool, count, date) VALUES (?, ?, ?, ?)
      `).run('global', 'bash', 7, '2024-05-20');

      splitLegacyDb(legacy, out);

      const dbMay = openDb(getMonthlyDbPath(out, 2024, 5));
      const skill = dbMay.prepare('SELECT * FROM skill_usage').get();
      const mcp = dbMay.prepare('SELECT * FROM mcp_calls').get();
      assert.equal(skill.name, 'my-skill');
      assert.equal(skill.count, 3);
      assert.equal(mcp.tool, 'bash');
      assert.equal(mcp.count, 7);
      dbMay.close();
    } finally {
      legacy.close();
      cleanDir(out);
    }
  });
});

// ── DB Integrity Checks ──────────────────────────────────────────────────────

describe('countDbRows', () => {
  it('returns 0 when no monthly DBs exist', () => {
    const out = tempDir();
    try {
      assert.equal(countDbRows(out), 0);
    } finally { cleanDir(out); }
  });

  it('returns 0 for empty monthly DB', () => {
    const out = tempDir();
    try {
      appendUsageMonthly(out, 'global', {
        tokenEntries: [], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [],
      });
      assert.equal(countDbRows(out), 0);
    } finally { cleanDir(out); }
  });

  it('counts rows across monthly DBs', () => {
    const out = tempDir();
    try {
      const entry = (ts) => ({ sessionId: 's1', timestamp: ts, model: 'claude-sonnet-4-6',
        inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 });
      // Two entries in different months
      appendUsageMonthly(out, 'global', { tokenEntries: [entry(new Date('2026-04-01').getTime())], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [] });
      appendUsageMonthly(out, 'global', { tokenEntries: [entry(new Date('2026-05-01').getTime())], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [] });
      assert.equal(countDbRows(out), 2);
    } finally { cleanDir(out); }
  });
});

describe('recoverIfCorrupt', () => {
  function fakeMtimeIndex(mtimeIndexPath, count) {
    fs.mkdirSync(path.dirname(mtimeIndexPath), { recursive: true });
    const index = { _base: '/fake', _schemaVersion: 2 };
    for (let i = 0; i < count; i++) index[`file${i}.jsonl`] = Date.now();
    fs.writeFileSync(mtimeIndexPath, JSON.stringify(index), 'utf8');
  }

  it('returns recovered=false when mtime-index does not exist', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, false);
    } finally { cleanDir(out); }
  });

  it('returns recovered=false when cached count is below threshold', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      fakeMtimeIndex(mtimePath, 10); // below default threshold of 50
      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, false);
      assert.ok(fs.existsSync(mtimePath), 'should not delete mtime-index below threshold');
    } finally { cleanDir(out); }
  });

  it('returns recovered=false when DB has rows (healthy state)', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      fakeMtimeIndex(mtimePath, 60);
      const entry = { sessionId: 's1', timestamp: Date.now(), model: 'claude-sonnet-4-6',
        inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 };
      appendUsageMonthly(out, 'global', { tokenEntries: [entry], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [] });
      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, false);
      assert.ok(fs.existsSync(mtimePath), 'should not delete mtime-index when DB is healthy');
    } finally { cleanDir(out); }
  });

  it('detects and recovers corruption: mtime-index populated but DB empty', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      // Simulate: 60 transcripts "processed" in mtime-index but DB has 0 rows
      fakeMtimeIndex(mtimePath, 60);
      // Create an empty monthly DB (schema only, no data)
      appendUsageMonthly(out, 'global', { tokenEntries: [], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [] });
      assert.equal(countDbRows(out), 0, 'DB should be empty before recovery');

      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, true, 'should detect corruption');
      assert.equal(r.cachedCount, 60);
      assert.equal(r.dbRows, 0);
      assert.ok(!fs.existsSync(mtimePath), 'mtime-index should be deleted after recovery');
    } finally { cleanDir(out); }
  });

  it('deletes empty monthly DB files on recovery', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      fakeMtimeIndex(mtimePath, 60);
      // Create an empty monthly DB (schema-only, 0 rows) by opening it directly
      const dbPath = getMonthlyDbPath(out, 2026, 5);
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const emptyDb = openDb(dbPath);
      emptyDb.close();
      assert.ok(fs.existsSync(dbPath), 'DB file should exist before recovery');

      recoverIfCorrupt(out, mtimePath);
      assert.ok(!fs.existsSync(dbPath), 'DB file should be deleted after recovery');
      assert.ok(!fs.existsSync(mtimePath), 'mtime-index should be deleted after recovery');
    } finally { cleanDir(out); }
  });
});

// ── appendUsageMonthly — error propagation ────────────────────────────────────

describe('appendUsageMonthly — error propagation', () => {
  it('throws when openDb fails (error is not swallowed)', () => {
    const out = tempDir();
    try {
      const dbPath = getMonthlyDbPath(out, 2026, 1);
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      // Write a non-SQLite file at the DB path so openDb throws
      fs.writeFileSync(dbPath, 'not a sqlite file');
      const entry = {
        sessionId: 's1', timestamp: Date.UTC(2026, 0, 15), model: 'm',
        inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheCreation: 0, rawInput: 0,
      };
      assert.throws(
        () => appendUsageMonthly(out, 'global', { tokenEntries: [entry] }),
        (e) => e instanceof Error,
        'appendUsageMonthly must throw on DB open failure'
      );
    } finally { cleanDir(out); }
  });
});

// ── listMonthlyDbs — orphaned WAL/SHM cleanup ────────────────────────────────

describe('listMonthlyDbs — orphaned WAL/SHM cleanup', () => {
  it('removes orphaned WAL file that has no corresponding .sqlite', () => {
    const out = tempDir();
    try {
      const dbDir = path.join(out, 'db', '2026');
      fs.mkdirSync(dbDir, { recursive: true });
      // Create orphaned WAL/SHM (no main .sqlite)
      const orphanWal = path.join(dbDir, '2026-02.sqlite-wal');
      const orphanShm = path.join(dbDir, '2026-02.sqlite-shm');
      fs.writeFileSync(orphanWal, '');
      fs.writeFileSync(orphanShm, '');
      // Create a valid monthly DB
      const validDb = openDb(path.join(dbDir, '2026-03.sqlite'));
      validDb.close();

      const dbs = listMonthlyDbs(out);
      assert.equal(dbs.length, 1, 'only the valid DB is listed');
      assert.equal(dbs[0].month, 3, 'listed DB is 2026-03');
      assert.ok(!fs.existsSync(orphanWal), 'orphaned WAL should be deleted');
      assert.ok(!fs.existsSync(orphanShm), 'orphaned SHM should be deleted');
    } finally { cleanDir(out); }
  });

  it('does not remove WAL/SHM that belongs to an existing .sqlite', () => {
    const out = tempDir();
    try {
      const dbDir = path.join(out, 'db', '2026');
      fs.mkdirSync(dbDir, { recursive: true });
      const mainPath = path.join(dbDir, '2026-04.sqlite');
      const walPath = path.join(dbDir, '2026-04.sqlite-wal');
      const shmPath = path.join(dbDir, '2026-04.sqlite-shm');
      // Create a real DB (WAL mode creates -wal/-shm automatically on write)
      const db = openDb(mainPath);
      db.close();
      // Manually create companion files to simulate WAL mode
      fs.writeFileSync(walPath, '');
      fs.writeFileSync(shmPath, '');

      listMonthlyDbs(out);
      assert.ok(fs.existsSync(walPath), 'WAL belonging to existing .sqlite must be preserved');
      assert.ok(fs.existsSync(shmPath), 'SHM belonging to existing .sqlite must be preserved');
    } finally { cleanDir(out); }
  });
});

// ── prompt_fts — FTS5 full-text search ──────────────────────────────────────

describe('prompt_fts — indexing', () => {
  it('creates the prompt_fts virtual table on fresh DBs', () => {
    const db = freshDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_fts'").get();
    assert.ok(row, 'prompt_fts table exists');
    db.close();
  });

  it('appendUsage indexes promptStats text into prompt_fts', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [
        { sessionId: 's1', timestamp: 1000, charLen: 30, preview: 'fix the dashboard', text: 'fix the dashboard rendering bug in billboard charts' },
      ],
    });
    const rows = db.prepare('SELECT * FROM prompt_fts').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].session_id, 's1');
    assert.equal(rows[0].scope, 'global');
    assert.equal(rows[0].timestamp, 1000);
    db.close();
  });

  it('appendUsage is idempotent for prompt_fts (re-append does not duplicate)', () => {
    const db = freshDb();
    const usage = {
      promptStats: [
        { sessionId: 'dup', timestamp: 1000, charLen: 10, preview: 'hello', text: 'hello full text' },
      ],
    };
    appendUsage(db, 'global', usage);
    appendUsage(db, 'global', usage);
    const count = db.prepare('SELECT COUNT(*) AS c FROM prompt_fts').get().c;
    assert.equal(count, 1, 'delete-then-insert keeps one row per (scope, session, ts)');
    db.close();
  });

  it('appendUsage skips promptStats without text (no empty FTS rows)', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [{ sessionId: 'p', timestamp: 1000, charLen: 5, preview: 'old-cache entry' }],
    });
    const count = db.prepare('SELECT COUNT(*) AS c FROM prompt_fts').get().c;
    assert.equal(count, 0, 'entries without text are not indexed');
    db.close();
  });

  it('upsertUsage replaces prompt_fts rows for the scope only', () => {
    const db = freshDb();
    upsertUsage(db, 'project-a', {
      promptStats: [{ sessionId: 'sa', timestamp: 1000, text: 'alpha prompt text' }],
    });
    upsertUsage(db, 'project-b', {
      promptStats: [{ sessionId: 'sb', timestamp: 2000, text: 'beta prompt text' }],
    });
    upsertUsage(db, 'project-a', {
      promptStats: [{ sessionId: 'sa2', timestamp: 3000, text: 'gamma prompt text' }],
    });
    const rows = db.prepare('SELECT session_id FROM prompt_fts ORDER BY timestamp').all().map(r => r.session_id);
    assert.deepEqual(rows, ['sb', 'sa2'], 'project-a rows replaced, project-b untouched');
    db.close();
  });
});

describe('escapeFtsMatch — query sanitization', () => {
  it('returns null for empty or whitespace-only input', () => {
    assert.equal(escapeFtsMatch(''), null);
    assert.equal(escapeFtsMatch('   '), null);
    assert.equal(escapeFtsMatch(null), null);
    assert.equal(escapeFtsMatch(undefined), null);
  });

  it('quotes each term as a prefix phrase', () => {
    assert.equal(escapeFtsMatch('hello'), '"hello"*');
    assert.equal(escapeFtsMatch('hello world'), '"hello"* "world"*');
  });

  it('doubles embedded double quotes', () => {
    assert.equal(escapeFtsMatch('say"hi"'), '"say""hi"""*');
  });

  it('hostile inputs with FTS5 operators never crash a MATCH query', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      promptStats: [{ sessionId: 's', timestamp: 1000, text: 'totally normal prompt' }],
    });
    const hostile = [
      '"unbalanced',
      'AND OR NOT',
      'NEAR(foo bar)',
      '(paren* AND "quote',
      'col:value',
      '* ^ - + {}',
      'foo"bar"baz" "',
    ];
    for (const q of hostile) {
      const match = escapeFtsMatch(q);
      if (match === null) continue;
      assert.doesNotThrow(() => searchPromptsInDb(db, match, 10), `hostile input did not throw: ${q}`);
    }
    db.close();
  });
});

describe('searchPrompts — cross-month query', () => {
  it('finds sessions across multiple monthly DBs and groups per session', () => {
    const out = tempDir();
    try {
      const jan = Date.UTC(2026, 0, 15);
      const feb = Date.UTC(2026, 1, 15);
      appendUsageMonthly(out, 'global', {
        promptStats: [
          { sessionId: 'sess-jan', timestamp: jan, text: 'refactor the billboard chart tooltip' },
          { sessionId: 'sess-jan', timestamp: jan + 1000, text: 'tooltip still broken on billboard chart' },
        ],
      });
      appendUsageMonthly(out, 'proj', {
        promptStats: [
          { sessionId: 'sess-feb', timestamp: feb, text: 'add billboard legend toggle' },
        ],
      });
      assert.equal(listMonthlyDbs(out).length, 2, 'two monthly DBs created');

      const results = searchPrompts(out, 'billboard');
      assert.equal(results.length, 2, 'one result per session across months');
      const ids = results.map(r => r.sessionId).sort();
      assert.deepEqual(ids, ['sess-feb', 'sess-jan']);
      const janHit = results.find(r => r.sessionId === 'sess-jan');
      assert.equal(janHit.matches, 2, 'multiple matches in a session are counted');
      assert.equal(janHit.scope, 'global');
      assert.ok(janHit.snippet.includes(SEARCH_MARK_START) && janHit.snippet.includes(SEARCH_MARK_END),
        'snippet contains highlight sentinels');
    } finally { cleanDir(out); }
  });

  it('matches by prefix and returns empty for non-matching or empty queries', () => {
    const out = tempDir();
    try {
      appendUsageMonthly(out, 'global', {
        promptStats: [{ sessionId: 's', timestamp: Date.UTC(2026, 2, 1), text: 'implement fulltext session search' }],
      });
      assert.equal(searchPrompts(out, 'fullte').length, 1, 'prefix match works');
      assert.equal(searchPrompts(out, 'zzz-no-match').length, 0);
      assert.equal(searchPrompts(out, '   ').length, 0);
      assert.equal(searchPrompts(out, '"AND (').length, 0, 'operator-laden query returns [] without throwing');
    } finally { cleanDir(out); }
  });

  it('respects the limit option', () => {
    const out = tempDir();
    try {
      const base = Date.UTC(2026, 3, 1);
      const promptStats = [];
      for (let i = 0; i < 10; i++) {
        promptStats.push({ sessionId: `s${i}`, timestamp: base + i * 1000, text: `searchable entry number ${i}` });
      }
      appendUsageMonthly(out, 'global', { promptStats });
      assert.equal(searchPrompts(out, 'searchable', { limit: 3 }).length, 3);
    } finally { cleanDir(out); }
  });
});

// ── v1 → v2 migration (machine column) ───────────────────────────────────────

/**
 * Create a raw v1-schema DB (the exact pre-machine-column schema) at dbPath,
 * bypassing openDb so no migration runs. Returns the open Database handle.
 */
function createV1Db(dbPath) {
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE token_entries (
      scope TEXT NOT NULL, session_id TEXT, timestamp INTEGER NOT NULL, model TEXT,
      input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      cache_read INTEGER DEFAULT 0, cache_creation INTEGER DEFAULT 0,
      raw_input INTEGER DEFAULT 0, context TEXT, context_name TEXT
    );
    CREATE INDEX idx_te_scope_ts ON token_entries(scope, timestamp);
    CREATE UNIQUE INDEX idx_te_unique
      ON token_entries(scope, timestamp, model, input_tokens, output_tokens);
    CREATE TABLE prompt_entries (
      scope TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '', timestamp INTEGER NOT NULL,
      char_len INTEGER DEFAULT 0, preview TEXT,
      UNIQUE(scope, session_id, timestamp)
    );
    CREATE INDEX idx_pe_scope_ts ON prompt_entries(scope, timestamp);
    CREATE TABLE prompt_stats (
      scope TEXT NOT NULL, date TEXT NOT NULL, message_count INTEGER DEFAULT 0,
      session_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0,
      PRIMARY KEY (scope, date)
    );
    CREATE TABLE skill_usage (
      scope TEXT NOT NULL, name TEXT NOT NULL, count INTEGER DEFAULT 0, date TEXT,
      UNIQUE(scope, name, date)
    );
    CREATE TABLE agent_usage (
      scope TEXT NOT NULL, name TEXT NOT NULL, count INTEGER DEFAULT 0, date TEXT,
      UNIQUE(scope, name, date)
    );
    CREATE TABLE mcp_calls (
      scope TEXT NOT NULL, tool TEXT NOT NULL, count INTEGER DEFAULT 0, date TEXT,
      UNIQUE(scope, tool, date)
    );
    CREATE TABLE latency_entries (
      scope TEXT NOT NULL, session_id TEXT, timestamp INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL, model TEXT,
      UNIQUE(scope, timestamp, session_id)
    );
    CREATE INDEX idx_le_scope_ts ON latency_entries(scope, timestamp);
  `);
  db.pragma('user_version = 1');
  return db;
}

describe('v1 → v2 migration — machine column', () => {
  it('migrates a v1 DB: adds machine column, stamps existing rows, preserves data', () => {
    const out = tempDir();
    const dbPath = path.join(out, 'v1.sqlite');
    try {
      const v1 = createV1Db(dbPath);
      v1.prepare(`INSERT INTO token_entries (scope, session_id, timestamp, model, input_tokens, output_tokens)
                  VALUES ('global', 's1', 1000, 'claude-3', 100, 50)`).run();
      v1.prepare(`INSERT INTO prompt_entries (scope, session_id, timestamp, char_len, preview)
                  VALUES ('global', 's1', 1000, 10, 'hi')`).run();
      v1.prepare(`INSERT INTO skill_usage (scope, name, count, date) VALUES ('global', 'sk', 3, '2026-01-01')`).run();
      v1.prepare(`INSERT INTO agent_usage (scope, name, count, date) VALUES ('global', 'ag', 2, '2026-01-01')`).run();
      v1.prepare(`INSERT INTO mcp_calls (scope, tool, count, date) VALUES ('global', 'mc', 1, '2026-01-01')`).run();
      v1.prepare(`INSERT INTO latency_entries (scope, session_id, timestamp, latency_ms) VALUES ('global', 's1', 1000, 200)`).run();
      v1.close();

      const db = openDb(dbPath); // triggers migration
      assert.equal(getSchemaVersion(db), 2, 'user_version bumped to 2');
      const me = getMachineId();
      for (const table of ['token_entries', 'prompt_entries', 'skill_usage', 'agent_usage', 'mcp_calls', 'latency_entries']) {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        assert.equal(rows.length, 1, `${table} row count preserved`);
        assert.equal(rows[0].machine, me, `${table} rows stamped with current machine`);
      }
      // Original values preserved
      const te = db.prepare('SELECT * FROM token_entries').get();
      assert.equal(te.input_tokens, 100);
      assert.equal(db.prepare('SELECT count FROM skill_usage').get().count, 3);
      db.close();
    } finally { cleanDir(out); }
  });

  it('migrated unique keys include machine — same entry from two machines does not collide', () => {
    const out = tempDir();
    const dbPath = path.join(out, 'v1.sqlite');
    try {
      createV1Db(dbPath).close();
      const db = openDb(dbPath);
      const entry = { sessionId: 's', timestamp: 5000, model: 'm', inputTokens: 1, outputTokens: 1 };
      appendUsage(db, 'global', { tokenEntries: [entry] }, 'machine-a');
      appendUsage(db, 'global', { tokenEntries: [entry] }, 'machine-b');
      appendUsage(db, 'global', { tokenEntries: [entry] }, 'machine-b'); // dup within machine → ignored
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM token_entries').get().c, 2);

      const lat = { sessionId: 's', timestamp: 5000, latencyMs: 10 };
      appendUsage(db, 'global', { latencyEntries: [lat] }, 'machine-a');
      appendUsage(db, 'global', { latencyEntries: [lat] }, 'machine-b');
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM latency_entries').get().c, 2);

      const sk = { name: 'sk', count: 1, date: '2026-01-01' };
      appendUsage(db, 'global', { skills: [sk] }, 'machine-a');
      appendUsage(db, 'global', { skills: [sk] }, 'machine-b');
      const rows = db.prepare('SELECT machine, count FROM skill_usage ORDER BY machine').all();
      assert.equal(rows.length, 2, 'per-machine skill rows');
      db.close();
    } finally { cleanDir(out); }
  });

  it('migration is idempotent across reopen (already-v2 DB is untouched)', () => {
    const out = tempDir();
    const dbPath = path.join(out, 'v1.sqlite');
    try {
      createV1Db(dbPath).close();
      openDb(dbPath).close();
      const db = openDb(dbPath); // second open must not re-migrate / throw
      assert.equal(getSchemaVersion(db), 2);
      db.close();
    } finally { cleanDir(out); }
  });

  it('queryUsage exposes machine on tokenEntries/promptStats/latencyEntries', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      tokenEntries: [{ sessionId: 's', timestamp: 1000, model: 'm', inputTokens: 1, outputTokens: 1 }],
      promptStats: [{ sessionId: 's', timestamp: 1000, charLen: 5, preview: 'p' }],
      latencyEntries: [{ sessionId: 's', timestamp: 1000, latencyMs: 10 }],
    }, 'machine-x');
    const r = queryUsage(db, 'global', 0, 9999);
    assert.equal(r.tokenEntries[0].machine, 'machine-x');
    assert.equal(r.promptStats[0].machine, 'machine-x');
    assert.equal(r.latencyEntries[0].machine, 'machine-x');
    db.close();
  });

  it('upsertUsage only replaces rows of the given machine (imported rows survive)', () => {
    const db = freshDb();
    appendUsage(db, 'global', {
      tokenEntries: [{ sessionId: 'b', timestamp: 1000, model: 'm', inputTokens: 1, outputTokens: 1 }],
    }, 'machine-b');
    upsertUsage(db, 'global', {
      tokenEntries: [{ sessionId: 'a', timestamp: 2000, model: 'm', inputTokens: 2, outputTokens: 2 }],
    }, 'machine-a');
    const rows = db.prepare('SELECT machine FROM token_entries ORDER BY machine').all();
    assert.deepEqual(rows.map(r => r.machine), ['machine-a', 'machine-b'], 'machine-b rows preserved');
    db.close();
  });
});

// ── importUsageDir — cross-machine merge ─────────────────────────────────────

describe('importUsageDir — cross-machine merge', () => {
  const ts = Date.UTC(2026, 0, 15); // 2026-01

  function buildSourceOutput(machine) {
    const srcOut = tempDir();
    appendUsageMonthly(srcOut, 'global', {
      tokenEntries: [
        { sessionId: 's1', timestamp: ts, model: 'claude-3', inputTokens: 10, outputTokens: 5, machine },
        { sessionId: 's1', timestamp: ts + 1, model: 'claude-3', inputTokens: 20, outputTokens: 8, machine },
      ],
      promptStats: [{ sessionId: 's1', timestamp: ts, charLen: 9, preview: 'hello', machine }],
      skills: [{ name: 'sk', count: 4, date: '2026-01-15', machine }],
      agents: [{ name: 'ag', count: 2, date: '2026-01-15', machine }],
      mcpCalls: [{ tool: 'mc', count: 7, date: '2026-01-15', machine }],
      latencyEntries: [{ sessionId: 's1', timestamp: ts, latencyMs: 120, machine }],
    });
    return srcOut;
  }

  it('merges another machine\'s rows into local monthly DBs', () => {
    const srcOut = buildSourceOutput('machine-b');
    const destOut = tempDir();
    try {
      // local data already present (current machine)
      appendUsageMonthly(destOut, 'global', {
        tokenEntries: [{ sessionId: 'local', timestamp: ts + 100, model: 'claude-3', inputTokens: 1, outputTokens: 1 }],
      });

      const r = importUsageDir(path.join(srcOut, 'db'), destOut);
      assert.equal(r.files, 1);
      assert.equal(r.inserted.tokenEntries, 2);

      const db = openDb(getMonthlyDbPath(destOut, 2026, 1));
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM token_entries').get().c, 3, 'local + imported coexist');
      assert.equal(db.prepare("SELECT COUNT(*) AS c FROM token_entries WHERE machine = 'machine-b'").get().c, 2);
      assert.equal(db.prepare('SELECT count FROM skill_usage WHERE machine = ?').get('machine-b').count, 4);
      db.close();
    } finally { cleanDir(srcOut); cleanDir(destOut); }
  });

  it('is idempotent — re-running does not duplicate rows or inflate counts', () => {
    const srcOut = buildSourceOutput('machine-b');
    const destOut = tempDir();
    try {
      importUsageDir(path.join(srcOut, 'db'), destOut);
      const snapshot = (db) => ({
        tokens: db.prepare('SELECT COUNT(*) AS c FROM token_entries').get().c,
        prompts: db.prepare('SELECT COUNT(*) AS c FROM prompt_entries').get().c,
        latency: db.prepare('SELECT COUNT(*) AS c FROM latency_entries').get().c,
        skillCount: db.prepare('SELECT count FROM skill_usage').get().count,
        agentCount: db.prepare('SELECT count FROM agent_usage').get().count,
        mcpCount: db.prepare('SELECT count FROM mcp_calls').get().count,
      });
      let db = openDb(getMonthlyDbPath(destOut, 2026, 1));
      const before = snapshot(db);
      db.close();

      const r2 = importUsageDir(path.join(srcOut, 'db'), destOut); // re-run
      assert.equal(r2.inserted.tokenEntries, 0, 'no new token rows on re-import');

      db = openDb(getMonthlyDbPath(destOut, 2026, 1));
      assert.deepEqual(snapshot(db), before, 're-import changes nothing');
      assert.equal(before.skillCount, 4, 'skill count not inflated');
      db.close();
    } finally { cleanDir(srcOut); cleanDir(destOut); }
  });

  it('picks up grown counts from the source without inflating (max merge)', () => {
    const srcOut = buildSourceOutput('machine-b');
    const destOut = tempDir();
    try {
      importUsageDir(path.join(srcOut, 'db'), destOut);
      // source machine keeps working: count grows 4 → 9
      appendUsageMonthly(srcOut, 'global', {
        skills: [{ name: 'sk', count: 5, date: '2026-01-15', machine: 'machine-b' }],
      });
      importUsageDir(path.join(srcOut, 'db'), destOut);
      const db = openDb(getMonthlyDbPath(destOut, 2026, 1));
      assert.equal(db.prepare('SELECT count FROM skill_usage WHERE machine = ?').get('machine-b').count, 9);
      db.close();
    } finally { cleanDir(srcOut); cleanDir(destOut); }
  });

  it('imports v1 source files (no machine column) using fallbackMachine, without migrating the source', () => {
    const srcOut = tempDir();
    const destOut = tempDir();
    try {
      const srcDbPath = path.join(srcOut, 'db', '2026', '2026-01.sqlite');
      const v1 = createV1Db(srcDbPath);
      v1.prepare(`INSERT INTO token_entries (scope, session_id, timestamp, model, input_tokens, output_tokens)
                  VALUES ('global', 's1', ?, 'claude-3', 11, 7)`).run(ts);
      v1.close();

      importUsageDir(path.join(srcOut, 'db'), destOut, { fallbackMachine: 'old-laptop' });

      const db = openDb(getMonthlyDbPath(destOut, 2026, 1));
      const row = db.prepare('SELECT * FROM token_entries').get();
      assert.equal(row.machine, 'old-laptop');
      assert.equal(row.input_tokens, 11);
      db.close();

      // source must remain v1 (read-only open, never migrated)
      const Database = require('better-sqlite3');
      const src = new Database(srcDbPath, { readonly: true });
      assert.equal(src.pragma('user_version', { simple: true }), 1, 'source DB untouched');
      src.close();
    } finally { cleanDir(srcOut); cleanDir(destOut); }
  });

  it('returns files: 0 for a directory without monthly DB files', () => {
    const srcOut = tempDir();
    const destOut = tempDir();
    try {
      const r = importUsageDir(srcOut, destOut);
      assert.equal(r.files, 0);
    } finally { cleanDir(srcOut); cleanDir(destOut); }
  });
});
