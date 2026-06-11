import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

  after(() => new Promise((resolve) => server.close(resolve)));

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
  });
});
