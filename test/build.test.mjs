import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'output');

describe('Build', () => {
  // Snapshot data.json immediately after the build so concurrent test runs
  // (e.g. cache.test.mjs with OMH_BUILD_MODE=plugin) cannot overwrite it.
  let buildSnapshot;
  before(() => {
    // Run full build
    execSync('node scripts/generate-dashboard.mjs --data-only', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    buildSnapshot = JSON.parse(fs.readFileSync(path.join(OUTPUT, 'data.json'), 'utf-8'));
  });

  it('should generate output/index.html', () => {
    assert.ok(fs.existsSync(path.join(OUTPUT, 'index.html')));
  });

  it('should generate output/data.json', () => {
    assert.ok(fs.existsSync(path.join(OUTPUT, 'data.json')));
  });

  it('should generate output/task-categories.json', () => {
    assert.ok(fs.existsSync(path.join(OUTPUT, 'task-categories.json')));
  });

  describe('data.json', () => {
    let data;

    before(() => {
      // Use the snapshot captured right after the build, not a fresh read
      // (guards against concurrent cache.test.mjs overwriting data.json)
      data = buildSnapshot;
    });

    it('should have scopes array', () => {
      assert.ok(Array.isArray(data.scopes));
      assert.ok(data.scopes.length > 0, 'at least 1 scope');
    });

    it('should have global scope with required fields', () => {
      const global = data.scopeData?.global;
      assert.ok(global, 'global scope exists');
      for (const key of ['skills', 'agents', 'plugins', 'hooks', 'memory', 'mcpServers', 'rules', 'principles', 'commands', 'teams', 'plans', 'todos']) {
        assert.ok(Array.isArray(global[key]), `global.${key} is array`);
      }
    });

    it('should have usage data in global scope', () => {
      const usage = data.scopeData?.global?.usage;
      assert.ok(usage, 'usage exists');
      for (const key of ['tokenEntries', 'promptStats', 'latencyEntries', 'skills', 'agents', 'commands', 'mcpCalls']) {
        assert.ok(Array.isArray(usage[key]), `usage.${key} is array`);
      }
    });

    it('should have taskCategories with mapping and meta', () => {
      assert.ok(data.taskCategories, 'taskCategories exists');
      assert.ok(data.taskCategories.mapping, 'mapping exists');
      assert.ok(data.taskCategories.meta, 'meta exists');
    });

    it('should have generatedAt timestamp', () => {
      assert.ok(data.generatedAt);
      assert.ok(!isNaN(new Date(data.generatedAt).getTime()), 'valid ISO date');
    });

    it('should have configDir', () => {
      assert.ok(typeof data.configDir === 'string');
    });

    it('should have _devBuild flag when built from git repo', () => {
      // Test runs from the git repo, so _devBuild should be true
      assert.equal(data._devBuild, true);
    });

    it('should NOT have _firstRun flag in normal --data-only build', () => {
      // _firstRun is only set during the first full run (no cache)
      // After that, subsequent builds must not carry the flag
      assert.equal(data._firstRun, undefined, '_firstRun must be absent in cached builds');
    });

    it('should NOT have _partial flag in normal --data-only build', () => {
      assert.equal(data._partial, undefined, '_partial must be absent in full builds');
    });
  });

  describe('index.html', () => {
    let html;

    before(() => {
      html = fs.readFileSync(path.join(OUTPUT, 'index.html'), 'utf-8');
    });

    it('should be a valid HTML document', () => {
      assert.ok(html.startsWith('<!DOCTYPE html>'));
      assert.ok(html.includes('</html>'));
    });

    it('should have all placeholders replaced', () => {
      // __BB_JS__ and __BB_DARK_CSS__ may appear as minified variable names in inlined JS,
      // so we check for the template pattern with surrounding delimiters instead
      assert.ok(!html.includes('>__BB_CSS__<'), 'BB_CSS placeholder');
      assert.ok(!html.includes('>__STYLES__<'), 'STYLES placeholder');
      assert.ok(!html.includes('>__APP_JS__<'), 'APP_JS placeholder');
      assert.ok(html.includes('src="data-core.js"'), 'DATA should be loaded via external data-core.js');
      assert.ok(!html.includes('__VERSION__'), 'VERSION placeholder');
    });

    it('should have separate data.js file', () => {
      assert.ok(fs.existsSync(path.join(OUTPUT, 'data.js')), 'data.js should exist');
      const dataJs = fs.readFileSync(path.join(OUTPUT, 'data.js'), 'utf-8');
      assert.ok(dataJs.startsWith('let DATA ='), 'data.js should define DATA variable');
    });

    it('should have progressive loading split files', () => {
      assert.ok(fs.existsSync(path.join(OUTPUT, 'data-core.js')), 'data-core.js should exist');
      assert.ok(fs.existsSync(path.join(OUTPUT, 'data-usage.js')), 'data-usage.js should exist');
      const core = fs.readFileSync(path.join(OUTPUT, 'data-core.js'), 'utf-8');
      assert.ok(core.startsWith('let DATA ='), 'data-core.js should define DATA');
      assert.ok(core.includes('_usageReady'), 'data-core.js should have _usageReady flag');
      const usage = fs.readFileSync(path.join(OUTPUT, 'data-usage.js'), 'utf-8');
      assert.ok(usage.startsWith('let DATA_USAGE ='), 'data-usage.js should define DATA_USAGE');
      assert.ok(usage.includes('_onUsageReady'), 'data-usage.js should call _onUsageReady');
    });

    it('should contain inlined billboard.js', () => {
      assert.ok(html.includes('bb.generate') || html.includes('billboard'));
    });

    it('should contain app.js code', () => {
      assert.ok(html.includes('renderContent'));
      assert.ok(html.includes('renderOverview'));
    });

    it('should contain CSS styles', () => {
      assert.ok(html.includes('--accent'));
      assert.ok(html.includes('.sidebar'));
    });

    it('should contain version from package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
      assert.ok(html.includes(pkg.version));
    });
  });

  describe('needsHtmlRebuild — template mtime check', () => {
    const TEMPLATES = path.join(ROOT, 'templates');
    const indexPath = path.join(OUTPUT, 'index.html');

    it('index.html should be newer than all template files after build', () => {
      const outMtime = fs.statSync(indexPath).mtimeMs;
      for (const f of ['app.js', 'styles.css', 'dashboard.html']) {
        const tmplMtime = fs.statSync(path.join(TEMPLATES, f)).mtimeMs;
        assert.ok(outMtime >= tmplMtime,
          `index.html (${outMtime}) should be >= ${f} mtime (${tmplMtime})`);
      }
    });

    it('generate-dashboard.mjs should check template mtimes in needsHtmlRebuild', () => {
      const script = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-dashboard.mjs'), 'utf-8');
      assert.ok(script.includes('needsHtmlRebuild'), 'needsHtmlRebuild function defined');
      assert.ok(script.includes('mtimeMs'), 'mtime comparison present');
      assert.ok(script.includes("'app.js'"), 'app.js in template file list');
      assert.ok(script.includes("'styles.css'"), 'styles.css in template file list');
      assert.ok(script.includes("'dashboard.html'"), 'dashboard.html in template file list');
      assert.ok(script.includes("'session-events.mjs'"), 'session-events.mjs in template file list');
    });
  });

  describe('dev vs plugin build mode', () => {
    const scriptPath = path.join(ROOT, 'scripts', 'generate-dashboard.mjs');
    let script;
    before(() => { script = fs.readFileSync(scriptPath, 'utf-8'); });

    it('detects dev build from .git + package.json name', () => {
      assert.ok(script.includes('IS_DEV_BUILD'), 'dev mode flag defined');
      assert.ok(script.includes("'.git'"), 'checks .git directory');
      assert.ok(script.includes("'oh-my-hi'"), 'checks package.json name');
    });

    it('forces HTML rebuild when IS_DEV_BUILD is true', () => {
      // needsHtmlRebuild must short-circuit to true in dev mode so template
      // edits always reflect in the output without mtime bookkeeping.
      assert.ok(
        /if\s*\(\s*IS_DEV_BUILD\s*\)\s*return\s+true/.test(script),
        'dev mode bypasses mtime shortcut'
      );
    });

    it('prints a [dev] marker in console output when running from source', () => {
      assert.ok(script.includes("[dev]"), 'dev marker string present');
    });
  });
});
