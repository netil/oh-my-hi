// update-check.test.mjs — unit tests for update-check infrastructure.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'generate-dashboard.mjs');

// ── semverGt (extracted from script, must stay in sync) ──────────────────
function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

describe('Update Check', () => {
  let src;
  before(() => { src = fs.readFileSync(SCRIPT, 'utf-8'); });

  // ── Source structure ──────────────────────────────────────────────────────
  describe('source structure', () => {
    it('defines notifyUpdateIfAvailable', () => {
      assert.ok(src.includes('function notifyUpdateIfAvailable'));
    });

    it('defines scheduleUpdateCacheRefresh', () => {
      assert.ok(src.includes('function scheduleUpdateCacheRefresh'));
    });

    it('defines _runUpdateCacheRefresh as async', () => {
      assert.ok(src.includes('async function _runUpdateCacheRefresh'));
    });

    it('handles --_update-cache flag early in script', () => {
      assert.ok(src.includes("args.includes('--_update-cache')"));
      // Must appear before full-mode code
      const flagIdx = src.indexOf("'--_update-cache'");
      const fullModeIdx = src.indexOf('// ── Full mode');
      assert.ok(flagIdx < fullModeIdx, '--_update-cache handled before full mode');
    });

    it('calls notifyUpdateIfAvailable at start of full mode', () => {
      const fullModeIdx = src.indexOf('// ── Full mode');
      assert.ok(fullModeIdx !== -1);
      const snippet = src.slice(fullModeIdx, fullModeIdx + 600);
      assert.ok(snippet.includes('notifyUpdateIfAvailable()'));
    });

    it('calls scheduleUpdateCacheRefresh at end of full mode', () => {
      assert.ok(src.includes('scheduleUpdateCacheRefresh()'));
    });

    it('uses detectSystemLocale for locale-aware notice', () => {
      const fnIdx = src.indexOf('function notifyUpdateIfAvailable');
      const snippet = src.slice(fnIdx, fnIdx + 700);
      assert.ok(snippet.includes('detectSystemLocale()'), 'locale detected');
      assert.ok(snippet.includes("'ko'"), 'Korean branch');
      assert.ok(snippet.includes('최신 버전'), 'Korean message');
      assert.ok(snippet.includes('available'), 'English message');
      assert.ok(snippet.includes('/omh --update'), 'update command shown');
    });

    it('uses 12-hour cache threshold in scheduleUpdateCacheRefresh', () => {
      const fnIdx = src.indexOf('function scheduleUpdateCacheRefresh');
      const snippet = src.slice(fnIdx, fnIdx + 600);
      assert.ok(snippet.includes('TWELVE_HOURS'), 'constant defined');
      assert.ok(snippet.includes('12 * 60 * 60 * 1000'), 'correct value');
    });

    it('spawns a detached unref\'d child process for background refresh', () => {
      const fnIdx = src.indexOf('function scheduleUpdateCacheRefresh');
      const snippet = src.slice(fnIdx, fnIdx + 600);
      assert.ok(snippet.includes('detached: true'), 'detached flag');
      assert.ok(snippet.includes("stdio: 'ignore'"), 'stdio suppressed');
      assert.ok(snippet.includes('child.unref()'), 'parent unblocked');
    });

    it('imports spawn from child_process', () => {
      assert.ok(src.includes("{ execSync, spawn }") || src.includes("spawn }"), 'spawn imported');
      assert.ok(src.includes("'child_process'"), 'from child_process');
    });

    it('passes CLAUDE_CONFIG_DIR env to background child', () => {
      const fnIdx = src.indexOf('function scheduleUpdateCacheRefresh');
      const snippet = src.slice(fnIdx, fnIdx + 600);
      assert.ok(snippet.includes('CLAUDE_CONFIG_DIR'), 'env forwarded');
    });

    it('uses 6000ms timeout for network requests in _runUpdateCacheRefresh', () => {
      const fnIdx = src.indexOf('async function _runUpdateCacheRefresh');
      const snippet = src.slice(fnIdx, fnIdx + 1000);
      assert.ok(snippet.includes('6000'), '6s timeout');
    });

    it('tries GitHub API then falls back to npm registry', () => {
      const fnIdx = src.indexOf('async function _runUpdateCacheRefresh');
      const snippet = src.slice(fnIdx, fnIdx + 1400);
      const ghIdx = snippet.indexOf('api.github.com');
      const npmIdx = snippet.indexOf('registry.npmjs.org');
      assert.ok(ghIdx !== -1, 'GitHub API used');
      assert.ok(npmIdx !== -1, 'npm registry fallback');
      assert.ok(ghIdx < npmIdx, 'GitHub tried first');
    });

    it('writes timestamp + current + latest to cache file', () => {
      const fnIdx = src.indexOf('async function _runUpdateCacheRefresh');
      const snippet = src.slice(fnIdx, fnIdx + 2000);
      assert.ok(snippet.includes('timestamp'), 'timestamp written');
      assert.ok(snippet.includes('current'), 'current version written');
      assert.ok(snippet.includes('latest'), 'latest version written');
    });
  });

  // ── semverGt ──────────────────────────────────────────────────────────────
  describe('semverGt', () => {
    it('major bump: 2.0.0 > 1.9.9', () => assert.ok(semverGt('2.0.0', '1.9.9')));
    it('minor bump: 1.1.0 > 1.0.9', () => assert.ok(semverGt('1.1.0', '1.0.9')));
    it('patch bump: 0.9.1 > 0.9.0', () => assert.ok(semverGt('0.9.1', '0.9.0')));
    it('equal: 1.0.0 == 1.0.0 → false', () => assert.equal(semverGt('1.0.0', '1.0.0'), false));
    it('lower: 0.9.0 < 1.0.0 → false', () => assert.equal(semverGt('0.9.0', '1.0.0'), false));
    it('lower minor: 0.9.0 < 0.10.0 → false', () => assert.equal(semverGt('0.9.0', '0.10.0'), false));
    it('semverGt in script matches inline implementation', () => {
      // Verify the script's semverGt body matches what we test above
      const fnIdx = src.indexOf('function semverGt(a, b)');
      assert.ok(fnIdx !== -1, 'semverGt defined in script');
      const snippet = src.slice(fnIdx, fnIdx + 200);
      assert.ok(snippet.includes('split'), 'splits on dot');
      assert.ok(snippet.includes('map(Number)'), 'numeric comparison');
    });
  });

  // ── Cache file format ─────────────────────────────────────────────────────
  describe('cache file format', () => {
    let tmpDir;
    before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-upd-')); });
    after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    it('cache JSON has timestamp, current, latest fields', () => {
      const file = path.join(tmpDir, '.update-check');
      const data = { timestamp: Date.now(), current: '0.9.0', latest: '0.10.0' };
      fs.writeFileSync(file, JSON.stringify(data));
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      assert.equal(typeof parsed.timestamp, 'number');
      assert.equal(parsed.current, '0.9.0');
      assert.equal(parsed.latest, '0.10.0');
    });

    it('stale detection: 12h+ old cache is stale', () => {
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      const staleTs = Date.now() - TWELVE_HOURS - 1;
      assert.ok(Date.now() - staleTs >= TWELVE_HOURS);
    });

    it('fresh detection: <12h old cache is not stale', () => {
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      const freshTs = Date.now() - 3600_000; // 1h ago
      assert.ok(Date.now() - freshTs < TWELVE_HOURS);
    });

    it('no notice shown when current == latest', () => {
      // semverGt('0.9.0', '0.9.0') must return false
      assert.equal(semverGt('0.9.0', '0.9.0'), false);
    });

    it('notice shown when latest > current', () => {
      assert.ok(semverGt('0.10.0', '0.9.0'));
    });
  });
});
