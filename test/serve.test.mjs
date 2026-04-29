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

  describe('GET /nonexistent — 404 for unknown paths', () => {
    it('should return 404', async () => {
      const res = await get(server, '/nonexistent-path-xyz');
      assert.strictEqual(res.status, 404);
    });
  });
});
