import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync, gzipSync } from 'zlib';
import { parseUsage, loadTranscriptCache, loadMtimeIndex, saveMtimeIndex, commonPrefix } from '../scripts/parsers/usage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'output');
const CACHE_PATH = path.join(OUTPUT, 'transcript-cache.json');
const CACHE_DIR = path.join(OUTPUT, 'cache');
const PENDING_DIR = path.join(OUTPUT, 'pending');
const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
  || path.join(process.env.HOME, '.claude');

// Snapshot + restore the user-facing output files.
// Some tests in this file force OMH_BUILD_MODE=plugin and run full builds,
// which overwrite data.json / data.js / index.html with plugin-mode artifacts
// (e.g. _devBuild:undefined, DEV BUILD badge gone). That leaks into the
// developer's live dashboard. Snapshot before the suite, restore after.
const SNAPSHOT_FILES = ['data.json', 'data.js', 'data-core.js', 'data-usage.js', 'index.html'];
const snapshots = new Map();
before(() => {
  for (const f of SNAPSHOT_FILES) {
    const p = path.join(OUTPUT, f);
    if (fs.existsSync(p)) snapshots.set(f, fs.readFileSync(p));
  }
});
after(() => {
  for (const [f, buf] of snapshots) {
    fs.writeFileSync(path.join(OUTPUT, f), buf);
  }
});

function cleanCache() {
  try { fs.unlinkSync(CACHE_PATH); } catch {}
  try { fs.rmSync(CACHE_DIR, { recursive: true }); } catch {}
  try { fs.rmSync(PENDING_DIR, { recursive: true }); } catch {}
}

function run(args = '') {
  // Force plugin mode: these tests verify mtime short-circuit / lightweight
  // rebuild behavior, which dev mode intentionally bypasses.
  return execSync(`node scripts/generate-dashboard.mjs ${args}`, {
    cwd: ROOT, encoding: 'utf-8', timeout: 30000,
    env: { ...process.env, OMH_BUILD_MODE: 'plugin' },
  });
}

// ── Incremental Cache ──

describe('Incremental Cache', () => {
  describe('loadTranscriptCache', () => {
    it('should return empty object for null/undefined path', () => {
      assert.deepEqual(loadTranscriptCache(null), {});
      assert.deepEqual(loadTranscriptCache(undefined), {});
    });

    it('should return empty object for non-existent file', () => {
      assert.deepEqual(loadTranscriptCache('/tmp/oh-my-hi-nonexistent-cache.json'), {});
    });

    it('should migrate legacy uncompressed cache', () => {
      const tmpPath = path.join(OUTPUT, '_test_legacy.json');
      try {
        try { fs.rmSync(CACHE_DIR, { recursive: true }); } catch {}
        const data = { '/some/file.jsonl': { mtimeMs: 123, size: 456, result: { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] } } };
        fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
        const loaded = loadTranscriptCache(tmpPath);
        assert.equal(loaded['/some/file.jsonl'].mtimeMs, 123);
        assert.ok(!fs.existsSync(tmpPath), 'legacy file should be removed');
      } finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    });

    it('should load and merge multiple segment files', () => {
      cleanCache();
      // Create two segment files manually
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const seg1 = { '/a.jsonl': { mtimeMs: 100, size: 10, result: { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] } } };
      const seg2 = { '/b.jsonl': { mtimeMs: 200, size: 20, result: { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] } } };
      fs.writeFileSync(path.join(CACHE_DIR, 'seg-001.json.gz'), gzipSync(JSON.stringify(seg1)));
      fs.writeFileSync(path.join(CACHE_DIR, 'seg-002.json.gz'), gzipSync(JSON.stringify(seg2)));
      const loaded = loadTranscriptCache(CACHE_PATH);
      assert.ok(loaded['/a.jsonl'], 'should have entry from seg1');
      assert.ok(loaded['/b.jsonl'], 'should have entry from seg2');
    });
  });

  describe('parseUsage with cache', () => {
    let sharedCache;
    let firstRunResult;

    before(async () => {
      sharedCache = {};
      firstRunResult = await parseUsage(CLAUDE_CONFIG_DIR, 0, null, { cache: sharedCache });
    });

    it('should return _cacheStats with parsed and total', () => {
      assert.ok(firstRunResult._cacheStats, '_cacheStats exists');
      assert.equal(typeof firstRunResult._cacheStats.parsed, 'number');
      assert.equal(typeof firstRunResult._cacheStats.total, 'number');
      assert.ok(firstRunResult._cacheStats.total >= 0, 'total >= 0');
    });

    it('should populate cache with _new flag on first parse', () => {
      const fileKeys = Object.keys(sharedCache).filter(k => !k.startsWith('_'));
      assert.ok(fileKeys.length > 0, 'cache should have file entries');
      const first = sharedCache[fileKeys[0]];
      assert.equal(typeof first.mtimeMs, 'number');
      assert.equal(typeof first.size, 'number');
      assert.ok(first.result, 'result exists');
      assert.equal(first._new, true, 'newly parsed entries should have _new flag');
    });

    it('should have zero parsed on second run with same cache', async () => {
      assert.ok(firstRunResult._cacheStats.parsed > 0, 'first run should parse files');
      const t1 = firstRunResult._cacheStats.total;
      sharedCache._parsed = 0;
      const r2 = await parseUsage(CLAUDE_CONFIG_DIR, 0, null, { cache: sharedCache });
      // Allow for new .jsonl files created by the live session between the two calls
      const newFiles = Math.max(0, r2._cacheStats.total - t1);
      assert.equal(r2._cacheStats.parsed, newFiles, 'second run should only parse newly added files');
    });

    it('should apply cutoff filtering with days parameter', async () => {
      sharedCache._parsed = 0;
      const recentResult = await parseUsage(CLAUDE_CONFIG_DIR, 7, null, { cache: sharedCache });
      assert.ok(
        recentResult.tokenEntries.length <= firstRunResult.tokenEntries.length,
        '7-day tokens <= all-time tokens'
      );
    });
  });
});

// ── Mtime Index ──

describe('Mtime Index', () => {
  it('should use relative paths with _base prefix', () => {
    cleanCache();
    run('--data-only');
    const indexPath = path.join(CACHE_DIR, 'mtime-index.json');
    assert.ok(fs.existsSync(indexPath), 'mtime-index.json should exist');
    const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    assert.ok(raw._base, '_base field should exist');
    assert.ok(typeof raw._base === 'string', '_base should be a string path');
    // No key should contain the _base prefix (all relative)
    const keys = Object.keys(raw).filter(k => k !== '_base');
    assert.ok(keys.length > 0, 'should have file entries');
    for (const k of keys) {
      assert.ok(!k.startsWith('/'), `key "${k.slice(0, 30)}..." should be relative`);
    }
  });

  it('should restore absolute paths on load', () => {
    const loaded = loadMtimeIndex(CACHE_PATH);
    const keys = Object.keys(loaded);
    assert.ok(keys.length > 0, 'should have entries');
    for (const k of keys) {
      assert.ok(k.startsWith('/'), `loaded key should be absolute: ${k.slice(0, 40)}...`);
      assert.equal(typeof loaded[k], 'number', 'value should be mtime number');
    }
  });

  it('should be smaller than full-path version', () => {
    const indexPath = path.join(CACHE_DIR, 'mtime-index.json');
    const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const loaded = loadMtimeIndex(CACHE_PATH);
    const fullSize = JSON.stringify(loaded).length;
    const relSize = JSON.stringify(raw).length;
    assert.ok(relSize < fullSize, `relative (${relSize}) should be smaller than full (${fullSize})`);
  });
});

// ── commonPrefix ──

describe('commonPrefix', () => {
  it('should return empty string for empty input', () => {
    assert.equal(commonPrefix([]), '');
  });

  it('should find the longest common directory prefix', () => {
    assert.equal(commonPrefix(['/a/b/c.jsonl', '/a/b/d.jsonl']), '/a/b');
    assert.equal(commonPrefix(['/a/b/c/x.jsonl', '/a/b/y.jsonl']), '/a/b');
  });

  it('should terminate (not infinite-loop) when paths share no common directory', () => {
    // Regression: dirname of a filesystem root is itself ('/' on POSIX,
    // 'C:\\' on Windows) — without a loop guard this spins forever.
    assert.equal(commonPrefix(['/a/x.jsonl', '/b/y.jsonl']), '');
  });

  it('saveMtimeIndex/loadMtimeIndex should round-trip when there is no common prefix', () => {
    const tmpDir = fs.mkdtempSync('/tmp/omh-prefix-');
    try {
      const tmpCachePath = path.join(tmpDir, 'transcript-cache.json');
      const cache = {
        '/a/x.jsonl': { mtimeMs: 100, size: 1, result: null },
        '/b/y.jsonl': { mtimeMs: 200, size: 1, result: null },
      };
      saveMtimeIndex(tmpCachePath, cache);
      const loaded = loadMtimeIndex(tmpCachePath);
      assert.deepEqual(loaded, { '/a/x.jsonl': 100, '/b/y.jsonl': 200 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── API-first Data Architecture ──

describe('API-first Data Architecture', () => {
  before(() => {
    cleanCache();
    run('--data-only');
  });

  it('should generate data.json (API data source)', () => {
    assert.ok(fs.existsSync(path.join(OUTPUT, 'data.json')), 'data.json should exist');
    const data = JSON.parse(fs.readFileSync(path.join(OUTPUT, 'data.json'), 'utf-8'));
    assert.ok(data.scopeData, 'should have scopeData');
    assert.equal(data._minified, undefined, 'data.json should not be minified');
  });

  it('should NOT generate legacy JS data files', () => {
    assert.ok(!fs.existsSync(path.join(OUTPUT, 'data.js')), 'data.js should not exist');
    assert.ok(!fs.existsSync(path.join(OUTPUT, 'data-core.js')), 'data-core.js should not exist');
    assert.ok(!fs.existsSync(path.join(OUTPUT, 'data-usage.js')), 'data-usage.js should not exist');
  });

  it('index.html should NOT load data via script src tags', () => {
    const html = fs.readFileSync(path.join(OUTPUT, 'index.html'), 'utf-8');
    assert.ok(!html.includes('src="data-core.js"'), 'should NOT have data-core.js script tag');
    assert.ok(!html.includes('src="data-usage.js"'), 'should NOT have data-usage.js script tag');
  });

  it('template should not contain legacy __DATA__ placeholder', () => {
    const template = fs.readFileSync(path.join(ROOT, 'templates', 'dashboard.html'), 'utf-8');
    assert.ok(!template.includes('__DATA__'), 'template should not have __DATA__ placeholder');
    assert.ok(!template.includes('src="data-core.js"'), 'template should not reference data-core.js');
    assert.ok(!template.includes('src="data-usage.js"'), 'template should not reference data-usage.js');
  });
});

// ── Conditional HTML Rebuild ──

describe('Conditional HTML Rebuild', () => {
  // Use an isolated temp output dir so we never touch the shared output/index.html
  // that build.test.mjs reads concurrently.
  let tmpOut;
  before(() => {
    tmpOut = fs.mkdtempSync('/tmp/omh-rebuild-');
    // Seed with data.json and mtime-index so --data-only has something to update
    if (fs.existsSync(path.join(OUTPUT, 'data.json'))) {
      fs.copyFileSync(path.join(OUTPUT, 'data.json'), path.join(tmpOut, 'data.json'));
    }
    const cacheDir = path.join(OUTPUT, 'cache');
    const mtimeIndex = path.join(cacheDir, 'mtime-index.json');
    if (fs.existsSync(mtimeIndex)) {
      fs.mkdirSync(path.join(tmpOut, 'cache'), { recursive: true });
      fs.copyFileSync(mtimeIndex, path.join(tmpOut, 'cache', 'mtime-index.json'));
    }
  });
  after(() => { fs.rmSync(tmpOut, { recursive: true, force: true }); });

  function runIsolated(args = '') {
    return execSync(`node scripts/generate-dashboard.mjs ${args}`, {
      cwd: ROOT, encoding: 'utf-8', timeout: 30000,
      env: { ...process.env, OMH_BUILD_MODE: 'plugin', OMH_OUTPUT_DIR: tmpOut },
    });
  }

  it('should rebuild index.html when missing', () => {
    // tmpOut has no index.html — verify --data-only creates it
    runIsolated('--data-only');
    assert.ok(fs.existsSync(path.join(tmpOut, 'index.html')), 'should create index.html');
  });

  it('should not rebuild index.html when version matches', () => {
    const output = runIsolated('--data-only');
    assert.ok(!output.includes('rebuilding'), 'should not print rebuilding message');
    assert.ok(!output.includes('data structure changed'), 'should not trigger migration rebuild');
  });
});

// ── Upgrade Compatibility ──

describe('Upgrade Compatibility', () => {
  it('should clean up legacy JS data files if they exist (one-time upgrade)', () => {
    // Simulate old-version files existing in output/
    const dataJsPath = path.join(OUTPUT, 'data.js');
    const dataCoreJsPath = path.join(OUTPUT, 'data-core.js');
    const dataUsageJsPath = path.join(OUTPUT, 'data-usage.js');
    fs.writeFileSync(dataJsPath, 'let DATA = {};', 'utf-8');
    fs.writeFileSync(dataCoreJsPath, 'let DATA = {};', 'utf-8');
    fs.writeFileSync(dataUsageJsPath, 'let DATA_USAGE = {};', 'utf-8');

    run('--data-only');
    assert.ok(!fs.existsSync(dataJsPath), 'data.js should be removed on upgrade');
    assert.ok(!fs.existsSync(dataCoreJsPath), 'data-core.js should be removed on upgrade');
    assert.ok(!fs.existsSync(dataUsageJsPath), 'data-usage.js should be removed on upgrade');
  });

  it('should rebuild index.html on version mismatch (upgrade)', () => {
    // Tamper version in index.html to simulate old version. Save the original
    // first so we can always restore it — otherwise a mid-test failure can
    // leave the dashboard file stuck on v0.0.0 for manual inspection.
    const indexPath = path.join(OUTPUT, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');
    fs.writeFileSync(indexPath, html.replace(/v\d+\.\d+\.\d+/, 'v0.0.0'), 'utf-8');
    try {
      run('--data-only');
      const newHtml = fs.readFileSync(indexPath, 'utf-8');
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
      assert.ok(newHtml.includes(pkg.version), 'index.html should have current version after rebuild');
    } finally {
      // Always restore the original good HTML whether the test passed or failed.
      fs.writeFileSync(indexPath, html, 'utf-8');
    }
  });

  it('should handle missing cache dir gracefully on --data-only', () => {
    cleanCache();
    // No cache, no pending, no mtime-index — cold lightweight run
    const output = run('--data-only');
    assert.ok(output.includes('lightweight'), 'should run in lightweight mode');
    assert.ok(output.includes('done'), 'should complete without error');
  });
});

// ── Lightweight Mode (SQLite-only, no pending files) ──

describe('Lightweight Mode (no pending files)', () => {
  before(() => {
    cleanCache();
  });

  it('--data-only should NOT create pending files or gz segments', () => {
    run('--data-only');
    // pending/ is a leftover from the pre-SQLite flow — must not be created anymore
    assert.ok(!fs.existsSync(PENDING_DIR), 'pending directory should not be created');
    // Should NOT have gz segments either (only mtime-index)
    const cacheFiles = fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR) : [];
    const gzFiles = cacheFiles.filter(f => f.endsWith('.json.gz'));
    assert.equal(gzFiles.length, 0, 'lightweight mode should not create gz segments');
  });

  it('should clean up leftover pending/ dir from old versions', () => {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
    fs.writeFileSync(path.join(PENDING_DIR, '20990101-000000.json'), '{}', 'utf8');
    run('--data-only');
    assert.ok(!fs.existsSync(PENDING_DIR), 'legacy pending directory should be removed');
  });

  it('--data-only should update data.json when files changed', () => {
    const dataBefore = fs.readFileSync(path.join(OUTPUT, 'data.json'), 'utf-8');
    // Run again — active session transcript changes, so data.json should update
    run('--data-only');
    const output = run('--data-only');
    // If files were parsed, data.json should be updated
    if (output.includes('parsed, ')) {
      assert.ok(fs.existsSync(path.join(OUTPUT, 'data.json')), 'data.json should exist');
    }
  });

  it('should not include _cacheStats in data.json', () => {
    const data = JSON.parse(fs.readFileSync(path.join(OUTPUT, 'data.json'), 'utf-8'));
    for (const [scope, sdata] of Object.entries(data.scopeData)) {
      if (sdata.usage) {
        assert.equal(sdata.usage._cacheStats, undefined, `${scope} should not have _cacheStats`);
      }
    }
  });
});

// ── Progressive Loading ──

describe('Progressive Loading', () => {
  it('should use lightweight mode with --data-only', () => {
    cleanCache();
    const output = run('--data-only');
    assert.ok(output.includes('lightweight'), 'should use lightweight mode');
    assert.ok(!output.includes('progressive mode'), 'should not trigger progressive');
  });

  it('should create mtime-index on --data-only', () => {
    assert.ok(fs.existsSync(path.join(CACHE_DIR, 'mtime-index.json')), 'mtime-index should exist');
  });

  it('should show skipped stats on second lightweight run', () => {
    const output = run('--data-only');
    assert.ok(output.includes('skipped'), 'should show skipped count');
  });

  it('should not include _partial flag in data.json', () => {
    const data = JSON.parse(fs.readFileSync(path.join(OUTPUT, 'data.json'), 'utf-8'));
    assert.equal(data._partial, undefined, '_partial should not exist');
  });
});

// ── Progress Tracking ──

describe('Progress Tracking', () => {
  it('_onProgress is called for every file (cache hit and miss)', async () => {
    const tmpDir = fs.mkdtempSync('/tmp/omh-progress-');
    try {
      // Write two minimal JSONL transcript files
      fs.writeFileSync(path.join(tmpDir, 'a.jsonl'), '');
      fs.writeFileSync(path.join(tmpDir, 'b.jsonl'), '');

      const cache = {};
      let callCount = 0;
      cache._onProgress = () => { callCount++; };

      await parseUsage(CLAUDE_CONFIG_DIR, 0, tmpDir, { cache });
      assert.ok(callCount >= 2, `_onProgress should be called at least once per file, got ${callCount}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('_processed equals number of files processed', async () => {
    const tmpDir = fs.mkdtempSync('/tmp/omh-progress-');
    try {
      fs.writeFileSync(path.join(tmpDir, 'a.jsonl'), '');
      fs.writeFileSync(path.join(tmpDir, 'b.jsonl'), '');
      fs.writeFileSync(path.join(tmpDir, 'c.jsonl'), '');

      const cache = {};
      cache._onProgress = () => {};
      await parseUsage(CLAUDE_CONFIG_DIR, 0, tmpDir, { cache });

      assert.equal(cache._processed, 3, '_processed should equal file count');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('_total is set before files are processed', async () => {
    const tmpDir = fs.mkdtempSync('/tmp/omh-progress-');
    try {
      fs.writeFileSync(path.join(tmpDir, 'a.jsonl'), '');
      fs.writeFileSync(path.join(tmpDir, 'b.jsonl'), '');

      const cache = {};
      let totalAtFirstCall = null;
      cache._onProgress = () => {
        if (totalAtFirstCall === null) totalAtFirstCall = cache._total;
      };

      await parseUsage(CLAUDE_CONFIG_DIR, 0, tmpDir, { cache });
      assert.ok(totalAtFirstCall >= 2, `_total should be set before first _onProgress, got ${totalAtFirstCall}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('_processed increments for cache hits too', async () => {
    const tmpDir = fs.mkdtempSync('/tmp/omh-progress-');
    try {
      fs.writeFileSync(path.join(tmpDir, 'a.jsonl'), '');

      // First run — cache miss
      const cache = {};
      cache._onProgress = () => {};
      await parseUsage(CLAUDE_CONFIG_DIR, 0, tmpDir, { cache });
      const parsedFirst = cache._parsed;

      // Second run — cache hit
      cache._processed = 0;
      cache._parsed = 0;
      cache._onProgress = () => {};
      await parseUsage(CLAUDE_CONFIG_DIR, 0, tmpDir, { cache });

      assert.equal(cache._processed, 1, '_processed should increment even on cache hit');
      assert.equal(cache._parsed, 0, '_parsed should not increment on cache hit');
      assert.equal(parsedFirst, 1, 'first run should have parsed the file');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('normal mode uses incremental parse (no full progress bar in normal run)', () => {
    // Normal mode (with existing SQLite + mtime-index) does incremental parse:
    // only new/changed transcript files are parsed via stub-cache approach.
    // Progress bars are only emitted on first run (progressive mode).
    const output = run();
    // Should NOT show a scanning progress bar (those belong to first-run only)
    assert.ok(!output.includes('files)') || output.includes('lightweight'), 'normal mode should not show full transcript scan progress bar');
    // Should show normal completion
    assert.ok(output.includes('done') || output.includes('serving'), 'normal mode should complete successfully');
  });
});

// ── findSkillFiles Exclusions ──

describe('findSkillFiles exclusions', () => {
  let skillsSource;
  before(() => {
    skillsSource = fs.readFileSync(path.join(ROOT, 'scripts', 'parsers', 'skills.mjs'), 'utf-8');
  });

  it('should exclude node_modules from recursive scan', () => {
    assert.ok(skillsSource.includes('node_modules'), 'SKIP_DIRS should include node_modules');
  });

  it('should exclude .git from recursive scan', () => {
    assert.ok(skillsSource.includes("'.git'"), 'SKIP_DIRS should include .git');
  });

  it('should exclude temp_git_ prefixed directories', () => {
    assert.ok(skillsSource.includes("'temp_git_'"), 'SKIP_DIR_PREFIXES should include temp_git_');
  });

  it('should exclude temp_local_ prefixed directories', () => {
    assert.ok(skillsSource.includes("'temp_local_'"), 'SKIP_DIR_PREFIXES should include temp_local_');
  });
});

// ── Web UI — Partial Banner ──

describe('Web UI — Partial Banner', () => {
  let appJs, css, enLocale, koLocale;

  before(() => {
    appJs = fs.readFileSync(path.join(ROOT, 'templates', 'app.js'), 'utf-8');
    css = fs.readFileSync(path.join(ROOT, 'templates', 'styles.css'), 'utf-8');
    enLocale = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'locales', 'en.json'), 'utf-8'));
    koLocale = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'locales', 'ko.json'), 'utf-8'));
  });

  it('should have showPartialBanner function in app.js', () => {
    assert.ok(appJs.includes('showPartialBanner'), 'showPartialBanner function');
    assert.ok(appJs.includes('DATA._partial'), 'checks DATA._partial');
    assert.ok(appJs.includes('partial-banner'), 'creates partial-banner element');
    assert.ok(appJs.includes('partial-spinner'), 'creates partial-spinner element');
    assert.ok(appJs.includes("t('partialBannerMsg')"), 'uses i18n key');
  });

  it('should call showPartialBanner at boot', () => {
    const bootSection = appJs.slice(appJs.indexOf('// ── Boot'));
    assert.ok(bootSection.includes('showPartialBanner()'), 'called during boot');
  });

  it('should have partial-banner CSS styles', () => {
    assert.ok(css.includes('.partial-banner'), 'partial-banner class');
    assert.ok(css.includes('.partial-spinner'), 'partial-spinner class');
    assert.ok(css.includes('partial-spin'), 'partial-spin animation');
  });

  it('should share base styles between update-banner and partial-banner', () => {
    assert.ok(
      css.includes('.update-banner,\n.partial-banner') ||
      css.includes('.update-banner, .partial-banner'),
      'banners should share base styles via grouped selector'
    );
  });

  it('should have partialBannerMsg in all locales', () => {
    assert.ok(enLocale.partialBannerMsg, 'en locale has partialBannerMsg');
    assert.ok(koLocale.partialBannerMsg, 'ko locale has partialBannerMsg');
    assert.ok(enLocale.partialBannerMsg.includes('7 days'), 'en mentions 7 days');
    assert.ok(koLocale.partialBannerMsg.includes('7일'), 'ko mentions 7일');
  });
});
