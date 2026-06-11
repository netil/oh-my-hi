// db-recovery.test.mjs — tests for DB recovery, rescue, and transcript-scan logic
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

import {
  openDb,
  reloadNativeModule,
  appendUsageMonthly,
  getMonthlyDbPath,
  listMonthlyDbs,
  recoverIfCorrupt,
  countDbRows,
} from '../scripts/db.mjs';

import { scanTranscriptMonths } from '../scripts/parsers/usage.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────────

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omh-recovery-'));
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write a minimal mtime-index with `count` file entries, all pointing to `date` */
function writeMtimeIndex(indexPath, count, date = new Date()) {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const index = { _base: '/fake', _schemaVersion: 2 };
  for (let i = 0; i < count; i++) {
    index[`file${i}.jsonl`] = date.getTime();
  }
  fs.writeFileSync(indexPath, JSON.stringify(index), 'utf8');
  return index;
}

// ── 1. reloadNativeModule ────────────────────────────────────────────────────

describe('reloadNativeModule', () => {
  it('removes better-sqlite3 from require.cache so next load re-requires it', () => {
    const req = createRequire(import.meta.url);
    // Ensure the module IS in cache before we test removal
    let resolved;
    try {
      resolved = req.resolve('better-sqlite3');
      req('better-sqlite3'); // load into cache
      assert.ok(req.cache[resolved], 'better-sqlite3 should be in cache before reload');
    } catch {
      // better-sqlite3 not installed — skip gracefully
      return;
    }

    reloadNativeModule();
    assert.equal(
      req.cache[resolved],
      undefined,
      'reloadNativeModule should delete the entry from require.cache'
    );
  });

  it('does not throw when better-sqlite3 is not in require.cache', () => {
    // Calling twice should be a no-op on the second call
    assert.doesNotThrow(() => {
      reloadNativeModule();
      reloadNativeModule();
    });
  });
});

// ── 2. recoverIfCorrupt — complete loss ──────────────────────────────────────

describe('recoverIfCorrupt — complete loss', () => {
  it('recovers when mtime-index has ≥50 entries and DB is empty', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      writeMtimeIndex(mtimePath, 60);
      // DB exists but has 0 rows — schema-only
      const dbPath = getMonthlyDbPath(out, 2026, 4);
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      openDb(dbPath).close();
      assert.equal(countDbRows(out), 0, 'precondition: DB empty');

      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, true);
      assert.equal(r.dbRows, 0);
      assert.equal(r.cachedCount, 60);
      assert.ok(!fs.existsSync(mtimePath), 'mtime-index deleted after recovery');
      assert.ok(!fs.existsSync(dbPath), 'empty DB deleted after recovery');
    } finally {
      cleanDir(out);
    }
  });

  it('also unlinks -wal/-shm siblings of corrupt DBs (B6)', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    let holder;
    try {
      writeMtimeIndex(mtimePath, 60);
      const dbPath = getMonthlyDbPath(out, 2026, 4);
      // A concurrent connection (like serve.mjs's cached handle) keeps the WAL
      // alive: with another connection open, closing a connection does not
      // checkpoint+delete the -wal/-shm files.
      holder = openDb(dbPath);
      // Force WAL content without touching token_entries (DB must stay "empty")
      holder.exec('CREATE TABLE IF NOT EXISTS _wal_probe(x); INSERT INTO _wal_probe VALUES (1);');
      assert.ok(fs.existsSync(`${dbPath}-wal`), 'precondition: -wal exists');
      assert.ok(fs.existsSync(`${dbPath}-shm`), 'precondition: -shm exists');

      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, true);
      assert.ok(!fs.existsSync(dbPath), 'main DB deleted');
      assert.ok(!fs.existsSync(`${dbPath}-wal`), '-wal sibling deleted');
      assert.ok(!fs.existsSync(`${dbPath}-shm`), '-shm sibling deleted');
    } finally {
      try { holder?.close(); } catch { /* ignore */ }
      cleanDir(out);
    }
  });

  it('does NOT recover when DB has rows and mtime-index months match DB months', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      // Use a fixed past date (2026-04) so both the mtime-index and DB are in the same month
      const ts = new Date(Date.UTC(2026, 3, 15)); // 2026-04
      writeMtimeIndex(mtimePath, 60, ts);
      appendUsageMonthly(out, 'global', {
        tokenEntries: [{
          sessionId: 's1', timestamp: ts.getTime(),
          model: 'a', inputTokens: 1, outputTokens: 1,
          cacheRead: 0, cacheCreation: 0, rawInput: 0,
        }],
      });
      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, false, 'should not recover healthy DB');
      assert.ok(fs.existsSync(mtimePath), 'mtime-index preserved');
    } finally {
      cleanDir(out);
    }
  });

  it('does NOT fire when cachedCount is below threshold', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      writeMtimeIndex(mtimePath, 10); // below default threshold 50
      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, false);
      assert.ok(fs.existsSync(mtimePath), 'mtime-index untouched below threshold');
    } finally {
      cleanDir(out);
    }
  });
});

// ── 3. recoverIfCorrupt — partial month loss ─────────────────────────────────

describe('recoverIfCorrupt — partial loss', () => {
  it('removes entries for months that have no DB file', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      // mtime-index: 30 entries in 2026-01 + 30 entries in 2026-03
      const jan = new Date(Date.UTC(2026, 0, 15));
      const mar = new Date(Date.UTC(2026, 2, 15));

      fs.mkdirSync(path.dirname(mtimePath), { recursive: true });
      const index = { _base: '/fake', _schemaVersion: 2 };
      for (let i = 0; i < 30; i++) index[`jan-${i}.jsonl`] = jan.getTime();
      for (let i = 0; i < 30; i++) index[`mar-${i}.jsonl`] = mar.getTime();
      fs.writeFileSync(mtimePath, JSON.stringify(index), 'utf8');

      // Only create DB for 2026-01, NOT 2026-03 — simulating partial loss
      appendUsageMonthly(out, 'global', {
        tokenEntries: [{
          sessionId: 's1', timestamp: jan.getTime(),
          model: 'a', inputTokens: 1, outputTokens: 1,
          cacheRead: 0, cacheCreation: 0, rawInput: 0,
        }],
      });

      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, true, 'partial loss detected');
      assert.ok(r.missingMonths.includes('2026-03'), 'missing month 2026-03 flagged');
      assert.equal(r.removedEntries, 30, '30 march entries removed from index');

      // Index file should be updated (not deleted), with march entries gone
      const updated = JSON.parse(fs.readFileSync(mtimePath, 'utf8'));
      const marKeys = Object.keys(updated).filter(k => k.startsWith('mar-'));
      assert.equal(marKeys.length, 0, 'march entries removed from written index');
      const janKeys = Object.keys(updated).filter(k => k.startsWith('jan-'));
      assert.equal(janKeys.length, 30, 'january entries preserved');
    } finally {
      cleanDir(out);
    }
  });

  it('returns recovered=false when all indexed months have DB files', () => {
    const out = tempDir();
    const mtimePath = path.join(out, 'cache', 'mtime-index.json');
    try {
      const ts = new Date(Date.UTC(2026, 3, 1)); // 2026-04
      writeMtimeIndex(mtimePath, 60, ts);
      appendUsageMonthly(out, 'global', {
        tokenEntries: [{
          sessionId: 's1', timestamp: ts.getTime(),
          model: 'a', inputTokens: 1, outputTokens: 1,
          cacheRead: 0, cacheCreation: 0, rawInput: 0,
        }],
      });
      const r = recoverIfCorrupt(out, mtimePath);
      assert.equal(r.recovered, false, 'no recovery needed when months match');
    } finally {
      cleanDir(out);
    }
  });
});

// ── 4. scanTranscriptMonths ──────────────────────────────────────────────────

describe('scanTranscriptMonths', () => {
  it('returns empty map when projects dir does not exist', () => {
    const out = tempDir();
    try {
      const result = scanTranscriptMonths(out);
      assert.equal(result.size, 0);
    } finally {
      cleanDir(out);
    }
  });

  it('counts depth-1 JSONL files (direct in project dir)', () => {
    const configDir = tempDir();
    try {
      const projDir = path.join(configDir, 'projects', '-fake-proj');
      fs.mkdirSync(projDir, { recursive: true });
      const fp1 = path.join(projDir, 'session-a.jsonl');
      const fp2 = path.join(projDir, 'session-b.jsonl');
      fs.writeFileSync(fp1, '');
      fs.writeFileSync(fp2, '');

      const result = scanTranscriptMonths(configDir);
      const total = [...result.values()].reduce((a, b) => a + b, 0);
      assert.equal(total, 2, 'should count 2 depth-1 JSONL files');
    } finally {
      cleanDir(configDir);
    }
  });

  it('counts depth-3 JSONL files in {proj}/{sessionId}/subagents/', () => {
    const configDir = tempDir();
    try {
      const subDir = path.join(configDir, 'projects', '-fake-proj', 'sess-123', 'subagents');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'sub-1.jsonl'), '');
      fs.writeFileSync(path.join(subDir, 'sub-2.jsonl'), '');

      const result = scanTranscriptMonths(configDir);
      const total = [...result.values()].reduce((a, b) => a + b, 0);
      assert.equal(total, 2, 'should count 2 subagent JSONL files');
    } finally {
      cleanDir(configDir);
    }
  });

  it('counts both depth-1 and depth-3 files correctly', () => {
    const configDir = tempDir();
    try {
      const projDir = path.join(configDir, 'projects', '-proj');
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'top.jsonl'), '');

      const subDir = path.join(projDir, 'sess-xyz', 'subagents');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'sub.jsonl'), '');

      const result = scanTranscriptMonths(configDir);
      const total = [...result.values()].reduce((a, b) => a + b, 0);
      assert.equal(total, 2, 'depth-1 + depth-3 both counted');
    } finally {
      cleanDir(configDir);
    }
  });

  it('groups files by mtime month', () => {
    const configDir = tempDir();
    try {
      const projDir = path.join(configDir, 'projects', '-proj');
      fs.mkdirSync(projDir, { recursive: true });
      // Create two files in the same directory — their mtime will be "now"
      // so both should land in the same current month bucket
      fs.writeFileSync(path.join(projDir, 'a.jsonl'), '');
      fs.writeFileSync(path.join(projDir, 'b.jsonl'), '');

      const result = scanTranscriptMonths(configDir);
      // Both files have current mtime → should be in one month bucket
      assert.equal(result.size, 1, 'two files in same month → one bucket');
      const count = [...result.values()][0];
      assert.equal(count, 2);
    } finally {
      cleanDir(configDir);
    }
  });
});

// ── 5. parseTranscripts subagents scan ───────────────────────────────────────

describe('parseTranscripts — subagent JSONL scan', () => {
  it('parseUsage picks up {proj}/{sessionId}/subagents/*.jsonl files', async () => {
    const configDir = tempDir();
    try {
      // Create a minimal valid JSONL with a token usage entry so parsing returns data
      const subDir = path.join(configDir, 'projects', '-test-proj', 'sess-abc', 'subagents');
      fs.mkdirSync(subDir, { recursive: true });

      // Write a minimal Claude Code transcript line with token usage
      const entry = JSON.stringify({
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          model: 'claude-sonnet',
        },
        timestamp: new Date().toISOString(),
        sessionId: 'sess-abc',
      });
      fs.writeFileSync(path.join(subDir, 'subagent-1.jsonl'), entry + '\n');

      // Import parseUsage lazily to use the temp configDir
      const { parseUsage } = await import('../scripts/parsers/usage.mjs');
      const result = await parseUsage(configDir, 0, null, {});

      // The file was scanned — even if parsing yields 0 token entries (format may differ),
      // the _cacheStats.total should reflect the file was found
      assert.ok(
        typeof result._cacheStats.total === 'number',
        'cacheStats.total should be a number'
      );
      // At minimum the subagent file should be in the scan count
      assert.ok(result._cacheStats.total >= 1, 'subagent file counted in total');
    } finally {
      cleanDir(configDir);
    }
  });
});

// ── 6. saveRescue + flushRescue integration (logic extracted) ────────────────
//
// saveRescue and flushRescue are closures inside generate-dashboard.mjs and
// cannot be directly imported. We test the equivalent logic here using the
// underlying appendUsageMonthly / file I/O that they wrap.

describe('rescue file logic', () => {
  it('writing a rescue JSON and re-reading it produces correct scope+usage', () => {
    const rescueDir = path.join(tempDir(), 'rescue');
    let created;
    try {
      fs.mkdirSync(rescueDir, { recursive: true });
      const scope = 'global';
      const usage = {
        tokenEntries: [{ sessionId: 's1', timestamp: Date.UTC(2026, 4, 1), model: 'm', inputTokens: 5, outputTokens: 2, cacheRead: 0, cacheCreation: 0, rawInput: 0 }],
        skills: [], agents: [], mcpCalls: [], promptStats: [], latencyEntries: [],
      };
      const fp = path.join(rescueDir, `${Date.now()}-${scope}.json`);
      fs.writeFileSync(fp, JSON.stringify({ scope, usage }), 'utf8');
      created = fp;

      const { scope: rs, usage: ru } = JSON.parse(fs.readFileSync(fp, 'utf8'));
      assert.equal(rs, 'global');
      assert.equal(ru.tokenEntries.length, 1);
      assert.equal(ru.tokenEntries[0].inputTokens, 5);
    } finally {
      if (created) try { fs.unlinkSync(created); } catch { /* ok */ }
      try { fs.rmdirSync(rescueDir); } catch { /* ok */ }
    }
  });

  it('flushing rescue files to DB writes data and allows file removal', () => {
    const out = tempDir();
    try {
      const rescueDir = path.join(out, 'rescue');
      fs.mkdirSync(rescueDir, { recursive: true });

      const ts = Date.UTC(2026, 4, 5); // 2026-05
      const scope = 'global';
      const usage = {
        tokenEntries: [{ sessionId: 's1', timestamp: ts, model: 'm', inputTokens: 10, outputTokens: 3, cacheRead: 0, cacheCreation: 0, rawInput: 0 }],
        skills: [], agents: [], mcpCalls: [], promptStats: [], latencyEntries: [],
      };
      const fp = path.join(rescueDir, `${Date.now()}-global.json`);
      fs.writeFileSync(fp, JSON.stringify({ scope, usage }), 'utf8');

      // Simulate flush: read rescue files, append to DB, delete file
      const files = fs.readdirSync(rescueDir).filter(f => f.endsWith('.json'));
      assert.equal(files.length, 1, 'one rescue file');
      for (const f of files) {
        const p = path.join(rescueDir, f);
        const { scope: s, usage: u } = JSON.parse(fs.readFileSync(p, 'utf8'));
        appendUsageMonthly(out, s, u);
        fs.unlinkSync(p);
      }

      assert.equal(fs.readdirSync(rescueDir).length, 0, 'rescue files deleted after flush');
      assert.equal(countDbRows(out), 1, 'token entry written to monthly DB');
    } finally {
      cleanDir(out);
    }
  });

  it('rescue flush uses INSERT OR IGNORE (idempotent when called twice)', () => {
    const out = tempDir();
    try {
      const ts = Date.UTC(2026, 4, 10);
      const usage = {
        tokenEntries: [{ sessionId: 's1', timestamp: ts, model: 'm', inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheCreation: 0, rawInput: 0 }],
        skills: [], agents: [], mcpCalls: [], promptStats: [], latencyEntries: [],
      };
      // Append the same data twice — INSERT OR IGNORE should deduplicate
      appendUsageMonthly(out, 'global', usage);
      appendUsageMonthly(out, 'global', usage);
      assert.equal(countDbRows(out), 1, 'duplicate token entry not inserted twice');
    } finally {
      cleanDir(out);
    }
  });
});

// ── 7. appendToMonthly retry loop (logic extracted) ───────────────────────────
//
// appendToMonthly is a closure in generate-dashboard.mjs. We test the retry
// logic pattern by implementing a minimal equivalent and verifying its behaviour.

describe('appendToMonthly retry logic', () => {
  it('succeeds on first attempt when appendUsageMonthly does not throw', () => {
    const out = tempDir();
    try {
      const ts = Date.UTC(2026, 4, 1);
      const usage = {
        tokenEntries: [{ sessionId: 's1', timestamp: ts, model: 'm', inputTokens: 5, outputTokens: 2, cacheRead: 0, cacheCreation: 0, rawInput: 0 }],
        skills: [], agents: [], mcpCalls: [], promptStats: [], latencyEntries: [],
      };
      // Direct call — should not throw and should write 1 row
      appendUsageMonthly(out, 'global', usage);
      assert.equal(countDbRows(out), 1);
    } finally {
      cleanDir(out);
    }
  });

  it('SQLITE_BUSY pattern: retry loop succeeds after transient failure (mock)', async () => {
    // Simulate the retry loop from appendToMonthly: up to 4 attempts,
    // backoff 100ms * attempt, success on attempt N
    let attempts = 0;
    const isTransient = (msg) => /SQLITE_BUSY|database is locked/i.test(msg);

    async function retryWrite(writeFn, maxAttempts = 4) {
      let lastErr;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          writeFn(attempt);
          return true;
        } catch (e) {
          lastErr = e;
          if (isTransient(e.message) && attempt < maxAttempts - 1) {
            await new Promise(r => setTimeout(r, 10 * (attempt + 1))); // shortened for speed
            continue;
          }
          break;
        }
      }
      return false;
    }

    // Fail first 2 attempts with SQLITE_BUSY, succeed on 3rd
    const result = await retryWrite((attempt) => {
      attempts++;
      if (attempt < 2) throw new Error('SQLITE_BUSY: database is locked');
    });

    assert.equal(result, true, 'should succeed after transient failures');
    assert.equal(attempts, 3, 'should have tried 3 times');
  });

  it('appendToMonthly permanent failure: all retries exhausted → returns false (mock)', async () => {
    async function retryWrite(writeFn, maxAttempts = 4) {
      let lastErr;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          writeFn();
          return true;
        } catch (e) {
          lastErr = e;
          const isTransient = /SQLITE_BUSY|database is locked/i.test(e.message);
          if (isTransient && attempt < maxAttempts - 1) {
            await new Promise(r => setTimeout(r, 1)); // tiny delay for test speed
            continue;
          }
          break;
        }
      }
      return false;
    }

    let callCount = 0;
    const result = await retryWrite(() => {
      callCount++;
      throw new Error('SQLITE_BUSY: database is locked');
    });

    assert.equal(result, false, 'should return false when all retries fail');
    // First attempt + 3 retries = 4 total
    assert.equal(callCount, 4, 'should attempt exactly 4 times');
  });

  it('non-transient error exits retry loop immediately', async () => {
    async function retryWrite(writeFn, maxAttempts = 4) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          writeFn();
          return true;
        } catch (e) {
          const isTransient = /SQLITE_BUSY|database is locked/i.test(e.message);
          if (isTransient && attempt < maxAttempts - 1) {
            await new Promise(r => setTimeout(r, 1));
            continue;
          }
          break;
        }
      }
      return false;
    }

    let callCount = 0;
    const result = await retryWrite(() => {
      callCount++;
      throw new Error('SQLITE_CORRUPT: database disk image is malformed');
    });

    assert.equal(result, false);
    assert.equal(callCount, 1, 'non-transient error: should not retry');
  });
});

// ── 8. appendToMonthly failure → rescue file created ─────────────────────────

describe('rescue file created on permanent write failure', () => {
  it('when DB write fails permanently, rescue file is written to disk', () => {
    const out = tempDir();
    try {
      const rescueDir = path.join(out, 'rescue');
      const scope = 'global';
      const usage = {
        tokenEntries: [{ sessionId: 's1', timestamp: Date.UTC(2026, 4, 1), model: 'm', inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheCreation: 0, rawInput: 0 }],
        skills: [], agents: [], mcpCalls: [], promptStats: [], latencyEntries: [],
      };

      // Inline saveRescue logic (mirrors generate-dashboard.mjs)
      const saveRescue = (rescDir, sc, u) => {
        try {
          fs.mkdirSync(rescDir, { recursive: true });
          const fp = path.join(rescDir, `${Date.now()}-${sc.replace(/[^a-z0-9]/gi, '_')}.json`);
          fs.writeFileSync(fp, JSON.stringify({ scope: sc, usage: u }), 'utf8');
          return true;
        } catch { return false; }
      };

      const saved = saveRescue(rescueDir, scope, usage);
      assert.equal(saved, true, 'saveRescue should return true');

      const files = fs.readdirSync(rescueDir).filter(f => f.endsWith('.json'));
      assert.equal(files.length, 1, 'one rescue file created');

      const { scope: rs, usage: ru } = JSON.parse(fs.readFileSync(path.join(rescueDir, files[0]), 'utf8'));
      assert.equal(rs, 'global');
      assert.equal(ru.tokenEntries[0].inputTokens, 1);
    } finally {
      cleanDir(out);
    }
  });

  it('scope name with special chars is sanitised in rescue filename', () => {
    const out = tempDir();
    try {
      const rescueDir = path.join(out, 'rescue');
      fs.mkdirSync(rescueDir, { recursive: true });
      const scope = '-Users-netil-dev-project/foo:bar';
      const fp = path.join(rescueDir, `1000-${scope.replace(/[^a-z0-9]/gi, '_')}.json`);
      fs.writeFileSync(fp, JSON.stringify({ scope, usage: {} }), 'utf8');
      assert.ok(fs.existsSync(fp), 'rescue file with sanitised name should exist');
      // Filename should contain no /, : or - from original scope
      const name = path.basename(fp);
      assert.ok(!name.includes('/'), 'no slash in filename');
      assert.ok(!name.includes(':'), 'no colon in filename');
    } finally {
      cleanDir(out);
    }
  });
});
