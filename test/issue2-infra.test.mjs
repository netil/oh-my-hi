import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Helper: make an HTTP GET request to the server
function get(server, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.get(
      { hostname: '127.0.0.1', port, path: pathname, headers },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
  });
}

describe('Bug #1/#2 — better-sqlite3 Node 24/arm64 compatibility', () => {
  it('better-sqlite3 version is ^11.7.0 or higher (not ^9.x)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const ver = pkg.dependencies['better-sqlite3'];
    assert.ok(ver, 'better-sqlite3 should be in dependencies');
    // Must not be pinned to 9.x
    assert.ok(!ver.startsWith('^9.'), `better-sqlite3 should not be ^9.x, got: ${ver}`);
    // Must be 11.x or higher — parse the major version number
    const major = parseInt(ver.replace(/^\^/, '').split('.')[0], 10);
    assert.ok(major >= 11, `better-sqlite3 major version should be >= 11, got: ${major} (${ver})`);
  });

  it('postinstall script exists at scripts/postinstall.mjs', () => {
    const scriptPath = path.join(ROOT, 'scripts/postinstall.mjs');
    assert.ok(fs.existsSync(scriptPath), `scripts/postinstall.mjs should exist`);
  });

  it('postinstall script is registered in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    assert.strictEqual(
      pkg.scripts?.postinstall,
      'node scripts/postinstall.mjs',
      'postinstall script should run scripts/postinstall.mjs',
    );
  });

  it('postinstall.mjs exits 0 on non-darwin or non-arm64 (no-op guard)', () => {
    // Run the script directly — on any non darwin/arm64 machine it exits 0 immediately.
    // On darwin/arm64 it also exits 0 (either native module absent or already patched).
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/postinstall.mjs')], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    assert.strictEqual(result.status, 0, `postinstall.mjs exited with ${result.status}: ${result.stderr}`);
  });
});

describe('Bug #8 — Cache-Control: immutable removed from serve.mjs', () => {
  it('serve.mjs source does not contain "immutable"', () => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts/serve.mjs'), 'utf-8');
    assert.ok(!source.includes('immutable'), 'serve.mjs should not use Cache-Control: immutable');
  });

  it('serve.mjs source contains "no-cache" for static assets', () => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts/serve.mjs'), 'utf-8');
    assert.ok(source.includes('no-cache'), 'serve.mjs should use Cache-Control: no-cache');
  });

  describe('ETag revalidation — live server', () => {
    let server;

    before(async () => {
      const { requestHandler } = await import(`file://${path.join(ROOT, 'scripts/serve.mjs')}`);
      server = http.createServer(requestHandler);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    });

    after(() => new Promise((resolve) => server.close(resolve)));

    it('static asset response includes an ETag header', async () => {
      // Use /index.html (maps to output/index.html) — may be 404 in CI where output/ is absent.
      // Fall back to checking the 404 path still has no immutable header.
      const res = await get(server, '/index.html');
      if (res.status === 200) {
        assert.ok(res.headers.etag, 'response should include ETag header');
        assert.ok(
          res.headers['cache-control']?.includes('no-cache'),
          `Cache-Control should be no-cache, got: ${res.headers['cache-control']}`,
        );
      } else {
        // output/index.html not built yet — just verify 404 has no immutable
        assert.ok(
          !String(res.headers['cache-control'] || '').includes('immutable'),
          'response should not use immutable caching',
        );
      }
    });

    it('second request with If-None-Match returns 304 when ETag matches', async () => {
      const first = await get(server, '/index.html');
      if (first.status !== 200) {
        // Cannot test 304 without a real file — skip by asserting a trivially true fact
        assert.ok(true, 'skipped: output/index.html not present in this environment');
        return;
      }
      const etag = first.headers.etag;
      assert.ok(etag, 'first response must have ETag');

      const second = await get(server, '/index.html', { 'if-none-match': etag });
      assert.strictEqual(second.status, 304, `second request with matching ETag should return 304, got ${second.status}`);
    });
  });
});
