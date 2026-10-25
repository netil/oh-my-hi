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

function get(server, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.get(`http://127.0.0.1:${port}${pathname}`, { headers }, (res) => {
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

  describe('GET /api/usage?format=csv — usage export (CSV)', () => {
    let res;
    // Nonexistent scope → deterministic empty result set on any machine.
    before(async () => { res = await get(server, '/api/usage?format=csv&scope=__omh_test_none__'); });

    it('should return 200 with text/csv', () => {
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['content-type'].startsWith('text/csv'));
    });

    it('should send a Content-Disposition attachment filename', () => {
      assert.match(
        res.headers['content-disposition'] || '',
        /^attachment; filename="oh-my-hi-usage-\d{8}\.csv"$/
      );
    });

    it('should start with the header row', () => {
      const header = res.body.split('\r\n')[0];
      assert.strictEqual(
        header,
        'timestamp,scope,sessionId,model,context,contextName,inputTokens,outputTokens,cacheRead,cacheWrite,cost'
      );
    });

    it('should accept YYYY-MM-DD from/to filters', async () => {
      const r = await get(server, '/api/usage?format=csv&scope=__omh_test_none__&from=2026-01-01&to=2026-01-31');
      assert.strictEqual(r.status, 200);
      assert.ok(r.headers['content-type'].startsWith('text/csv'));
    });

    it('should reject malformed from/to with 400', async () => {
      const r = await get(server, '/api/usage?format=csv&from=yesterday');
      assert.strictEqual(r.status, 400);
      assert.strictEqual(JSON.parse(r.body).error, 'bad_from');
    });
  });

  describe('GET /api/usage?format=json — usage export (JSON)', () => {
    it('should return a JSON array with a .json attachment filename', async () => {
      const res = await get(server, '/api/usage?format=json&scope=__omh_test_none__');
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['content-type'].startsWith('application/json'));
      assert.match(
        res.headers['content-disposition'] || '',
        /^attachment; filename="oh-my-hi-usage-\d{8}\.json"$/
      );
      assert.ok(Array.isArray(JSON.parse(res.body)));
    });

    it('should reject unknown formats with 400', async () => {
      const res = await get(server, '/api/usage?format=xml');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(JSON.parse(res.body).error, 'bad_format');
    });
  });

  describe('GET /api/usage — non-export path unchanged', () => {
    it('should still return the usage payload object (no Content-Disposition)', async () => {
      const res = await get(server, '/api/usage?scope=__omh_test_none__');
      // 503 only on a clean checkout where neither SQLite nor data.json exist yet
      assert.ok([200, 503].includes(res.status), `expected 200 or 503, got ${res.status}`);
      assert.ok(res.headers['content-type'].startsWith('application/json'));
      assert.strictEqual(res.headers['content-disposition'], undefined);
      if (res.status === 200) {
        const body = JSON.parse(res.body);
        assert.ok(!Array.isArray(body), 'payload is an object, not an export array');
        assert.ok(Array.isArray(body.tokenEntries));
      }
    });
  });

  describe('GET /nonexistent — 404 for unknown paths', () => {
    it('should return 404', async () => {
      const res = await get(server, '/nonexistent-path-xyz');
      assert.strictEqual(res.status, 404);
    });

    it('should return 404 for a malformed %-escape', async () => {
      const res = await get(server, '/static/%E0%A4%A');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('Host / Origin guard (DNS rebinding)', () => {
    it('accepts the loopback Host for the listening port', async () => {
      const { port } = server.address();
      const res = await get(server, '/open', { host: `localhost:${port}` });
      assert.strictEqual(res.status, 200);
    });

    it('rejects a foreign Host with 403', async () => {
      const { port } = server.address();
      const res = await get(server, '/api/meta', { host: `evil.example:${port}` });
      assert.strictEqual(res.status, 403);
    });

    it('rejects a loopback Host on a different port with 403', async () => {
      const res = await get(server, '/open', { host: '127.0.0.1:1' });
      assert.strictEqual(res.status, 403);
    });

    it('rejects a cross-site Origin with 403', async () => {
      const res = await get(server, '/api/meta', { origin: 'http://evil.example' });
      assert.strictEqual(res.status, 403);
    });

    it('accepts a same-origin Origin', async () => {
      const { port } = server.address();
      const res = await get(server, '/open', { origin: `http://127.0.0.1:${port}` });
      assert.strictEqual(res.status, 200);
    });
  });

  describe('static file allow-list', () => {
    before(() => {
      fs.mkdirSync(path.join(TMP_OUT, 'static'), { recursive: true });
      fs.mkdirSync(path.join(TMP_OUT, 'cache'), { recursive: true });
      fs.mkdirSync(path.join(TMP_OUT, 'db', '2026'), { recursive: true });
      fs.mkdirSync(path.join(TMP_OUT, 'rescue'), { recursive: true });
      fs.writeFileSync(path.join(TMP_OUT, 'index.html'), '<!doctype html>');
      fs.writeFileSync(path.join(TMP_OUT, 'version.json'), '{"version":"0"}');
      fs.writeFileSync(path.join(TMP_OUT, 'static', 'app-test.js'), '// app');
      fs.writeFileSync(path.join(TMP_OUT, 'cache', 'mtime-index.json'), '{}');
      fs.writeFileSync(path.join(TMP_OUT, 'db', '2026', 'x.sqlite'), 'db');
      fs.writeFileSync(path.join(TMP_OUT, 'rescue', 'r.json'), '{}');
      fs.writeFileSync(path.join(TMP_OUT, 'task-categories.json'), '{}');
    });

    for (const p of ['/', '/index.html', '/version.json', '/static/app-test.js']) {
      it(`serves ${p}`, async () => {
        const res = await get(server, p);
        assert.strictEqual(res.status, 200);
      });
    }

    for (const p of ['/data.json', '/cache/mtime-index.json', '/db/2026/x.sqlite', '/rescue/r.json',
      '/task-categories.json', '/static/../data.json', '/static/%2e%2e/data.json']) {
      it(`does not serve ${p}`, async () => {
        const res = await get(server, p);
        assert.ok([403, 404].includes(res.status), `expected 403/404, got ${res.status}`);
      });
    }
  });

  describe('GET /api/usage — from/to validation', () => {
    it('rejects a non-numeric from with 400', async () => {
      const res = await get(server, '/api/usage?scope=global&from=abc');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(JSON.parse(res.body).error, 'bad_from');
    });

    it('rejects a non-numeric to with 400', async () => {
      const res = await get(server, '/api/usage?scope=global&from=0&to=12x');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(JSON.parse(res.body).error, 'bad_to');
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
