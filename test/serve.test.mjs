import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Point serve.mjs at a hermetic temp output dir. Must be set before serve.mjs
// is imported — OUTPUT_DIR is resolved once at module load.
const TMP_OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-serve-'));
process.env.OMH_OUTPUT_DIR = TMP_OUT;

function get(server, pathname) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
  });
}

describe('serve.mjs — requestHandler', () => {
  let server;

  before(async () => {
    const { requestHandler } = await import(`file://${path.join(ROOT, 'scripts/serve.mjs')}`);
    server = http.createServer(requestHandler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(TMP_OUT, { recursive: true, force: true });
  });

  describe('GET /open — tab-reuse launcher', () => {
    let res;
    before(async () => { res = await get(server, '/open'); });

    it('should return 200', () => {
      assert.strictEqual(res.status, 200);
    });

    it('should return HTML content-type', () => {
      assert.ok(res.headers['content-type'].startsWith('text/html'));
    });

    it('should not be cached', () => {
      assert.strictEqual(res.headers['cache-control'], 'no-store');
    });

    it('should set window.name to oh-my-hi for tab reuse', () => {
      assert.ok(res.body.includes("window.name = 'oh-my-hi'"), 'launcher must set window.name so it becomes the named dashboard tab');
    });

    it('should navigate this tab to the dashboard', () => {
      assert.ok(res.body.includes('window.location.replace(base)'), 'launcher must navigate itself to the dashboard');
    });
  });

  describe('GET /api/meta — existing endpoint still works', () => {
    it('should return JSON (503 if data not ready, not 404)', async () => {
      const res = await get(server, '/api/meta');
      assert.ok([200, 503].includes(res.status), `expected 200 or 503, got ${res.status}`);
      assert.ok(res.headers['content-type'].startsWith('application/json'));
    });
  });

  describe('GET /nonexistent — 404 for unknown paths', () => {
    it('should return 404', async () => {
      const res = await get(server, '/nonexistent-path-xyz');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('GET /api/usage — cached monthly DB handle invalidation (B6)', () => {
    it('picks up a monthly DB recreated at the same path after unlink', async () => {
      let db;
      try {
        db = await import('../scripts/db.mjs');
        // Probe better-sqlite3 availability — skip gracefully if missing
        db.openDb(db.getMonthlyDbPath(TMP_OUT, 2026, 5)).close();
      } catch {
        return; // SQLite unavailable in this environment
      }

      const ts = Date.UTC(2026, 4, 15); // 2026-05
      const from = Date.UTC(2026, 4, 1);
      const to = Date.UTC(2026, 5, 1) - 1;
      const usageFor = (sessionId) => ({
        tokenEntries: [{
          sessionId, timestamp: ts, model: 'm',
          inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheCreation: 0, rawInput: 0,
        }],
      });

      // 1. Seed the monthly DB and let the server open (and cache) a handle to it.
      db.appendUsageMonthly(TMP_OUT, 'global', usageFor('old-session'));
      const res1 = await get(server, `/api/usage?scope=global&from=${from}&to=${to}`);
      assert.strictEqual(res1.status, 200);
      const p1 = JSON.parse(res1.body);
      assert.ok(p1.tokenEntries.some((e) => e.sessionId === 'old-session'), 'initial DB served');

      // 2. Simulate recoverIfCorrupt: unlink the DB (+wal/shm) and recreate at the same path.
      const dbPath = db.getMonthlyDbPath(TMP_OUT, 2026, 5);
      for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      db.appendUsageMonthly(TMP_OUT, 'global', usageFor('new-session'));

      // 3. The server must serve from the recreated file, not the unlinked inode.
      const res2 = await get(server, `/api/usage?scope=global&from=${from}&to=${to}`);
      assert.strictEqual(res2.status, 200);
      const p2 = JSON.parse(res2.body);
      assert.ok(p2.tokenEntries.some((e) => e.sessionId === 'new-session'),
        'recreated DB must be picked up without server restart');
      assert.ok(!p2.tokenEntries.some((e) => e.sessionId === 'old-session'),
        'stale handle to the unlinked inode must not be served');
    });
  });
});
