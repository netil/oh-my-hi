import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('Plugin — Marketplace & Installation', () => {
  describe('marketplace.json', () => {
    let marketplace;
    before(() => {
      marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf-8'));
    });

    it('should have $schema field', () => {
      assert.ok(marketplace.$schema);
      assert.ok(marketplace.$schema.includes('marketplace.schema.json'));
    });

    it('should have required top-level fields', () => {
      assert.ok(marketplace.name);
      assert.ok(marketplace.description);
      assert.ok(marketplace.owner);
      assert.ok(marketplace.owner.name);
      assert.ok(marketplace.owner.email);
    });

    it('should have plugins array with at least one entry', () => {
      assert.ok(Array.isArray(marketplace.plugins));
      assert.ok(marketplace.plugins.length > 0);
    });

    it('should have plugin entry with required fields', () => {
      const plugin = marketplace.plugins[0];
      assert.ok(plugin.name);
      assert.ok(plugin.description);
      assert.ok(plugin.source);
      assert.ok(plugin.category);
    });

    it('should have version matching package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
      const plugin = marketplace.plugins[0];
      assert.equal(plugin.version, pkg.version, 'marketplace version should match package.json');
    });
  });

  describe('plugin.json', () => {
    let plugin;
    before(() => {
      plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'));
    });

    it('should have required fields', () => {
      assert.ok(plugin.name);
      assert.ok(plugin.description);
      assert.ok(plugin.author);
      assert.ok(plugin.author.name);
    });

    it('should have name matching marketplace plugin name', () => {
      const marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf-8'));
      assert.equal(plugin.name, marketplace.plugins[0].name);
    });
  });

  describe('SKILL.md', () => {
    let skill;
    before(() => {
      skill = fs.readFileSync(path.join(ROOT, 'skills', 'omh', 'SKILL.md'), 'utf-8');
    });

    it('should have frontmatter with name', () => {
      assert.ok(skill.includes('name: omh'));
    });

    it('should have argument-hint', () => {
      assert.ok(skill.includes('argument-hint:'));
    });

    it('should document all parameters', () => {
      const params = ['--data-only', '--enable-auto', '--disable-auto', '--status', '--help'];
      for (const p of params) {
        assert.ok(skill.includes(p), `missing parameter: ${p}`);
      }
    });

    it('should have script execution command', () => {
      assert.ok(skill.includes('generate-dashboard.mjs'));
    });
  });
});

describe('Plugin — Parameter Behavior', () => {
  // Plugin mode override: these tests assert end-user CLI flag behavior,
  // which should match what `/omh` produces, not the dev-build path.
  const run = (args) => execSync(`node scripts/generate-dashboard.mjs ${args}`, {
    cwd: ROOT, encoding: 'utf-8', timeout: 30000,
    env: { ...process.env, OMH_BUILD_MODE: 'plugin' },
  });

  it('--help should print usage and exit', () => {
    const output = run('--help');
    assert.ok(output.includes('Usage:'));
    assert.ok(output.includes('--data-only'));
    assert.ok(output.includes('--enable-auto'));
    assert.ok(output.includes('--update'));
  });

  it('--data-only should run in lightweight mode', () => {
    const output = run('--data-only');
    assert.ok(output.includes('oh-my-hi: collecting data (lightweight)'));
    assert.ok(output.includes('oh-my-hi: done (lightweight)'));
  });

  it('--status should print auto-refresh status', () => {
    const output = run('--status');
    assert.ok(output.includes('Auto-refresh status'));
  });

  it('--enable-auto should register Stop hook', () => {
    // Enable
    const enableOut = run('--enable-auto');
    assert.ok(enableOut.includes('enabled') || enableOut.includes('already'));

    // Verify settings.json
    const settingsPath = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME, '.claude'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const stopHooks = settings.hooks?.Stop || [];
      const hasHook = stopHooks.some(entry =>
        entry.hooks?.some(h =>
          h.command?.includes('oh-my-hi') &&
          (h.command?.includes('--_auto-refresh') || h.command?.includes('--data-only'))
        )
      );
      assert.ok(hasHook, 'Stop hook should be registered');
    }
  });

  it('--disable-auto should remove Stop hook', () => {
    const disableOut = run('--disable-auto');
    assert.ok(disableOut.includes('disabled') || disableOut.includes('not configured'));
  });
});

describe('Plugin — Update Check', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const OUTPUT = path.join(ROOT, 'output');

  it('--update should show current version and check registry', () => {
    const output = execSync('node scripts/generate-dashboard.mjs --update', {
      cwd: ROOT, encoding: 'utf-8', timeout: 15000,
    });
    assert.ok(output.includes('current version'), 'should print current version');
    assert.ok(output.includes('checking for updates'), 'should check registry');
    // Should either be "already up to date" or "available"
    assert.ok(
      output.includes('already up to date') || output.includes('available'),
      'should report result'
    );
  });

  it('--update should not run main dashboard build', () => {
    const output = execSync('node scripts/generate-dashboard.mjs --update', {
      cwd: ROOT, encoding: 'utf-8', timeout: 15000,
    });
    assert.ok(!output.includes('collecting data'), 'should not run data collection');
    assert.ok(!output.includes('scopes:'), 'should not detect scopes');
  });

  it('auto update check should cache results', () => {
    const checkFile = path.join(OUTPUT, 'cache', '.update-check');
    // Clean previous check
    try { fs.unlinkSync(checkFile); } catch {}

    // Run full mode to trigger auto check
    execSync('node scripts/generate-dashboard.mjs --data-only', {
      cwd: ROOT, encoding: 'utf-8', timeout: 30000,
    });
    // Lightweight mode doesn't do update check, so use a direct call
    execSync('node scripts/generate-dashboard.mjs --update', {
      cwd: ROOT, encoding: 'utf-8', timeout: 15000,
    });

    // Check file should exist with timestamp
    assert.ok(fs.existsSync(checkFile), '.update-check should exist');
    const data = JSON.parse(fs.readFileSync(checkFile, 'utf-8'));
    assert.ok(data.timestamp, 'should have timestamp');
    assert.ok(data.current, 'should have current version');
    assert.ok(data.latest, 'should have latest version');
  });
});

describe('Plugin — File Structure', () => {
  it('should have required directories', () => {
    const dirs = ['scripts', 'scripts/parsers', 'templates', 'templates/locales', 'skills/omh', '.claude-plugin'];
    for (const dir of dirs) {
      assert.ok(fs.existsSync(path.join(ROOT, dir)), `missing directory: ${dir}`);
    }
  });

  it('should have all parser modules', () => {
    const parsers = ['skills', 'agents', 'plugins', 'hooks', 'memory', 'mcp-servers', 'rules', 'commands', 'teams', 'plans', 'todos', 'config-files', 'usage', 'scopes', 'frontmatter'];
    for (const p of parsers) {
      assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'parsers', `${p}.mjs`)), `missing parser: ${p}.mjs`);
    }
  });

  it('should have work-types.json with valid schema', () => {
    const wt = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'work-types.json'), 'utf-8'));
    assert.ok(wt.categories, 'categories section');
    assert.ok(wt.toolMapping, 'toolMapping section');
    assert.ok(wt.keywords, 'keywords section');
    assert.ok(Object.keys(wt.categories).length >= 20, 'at least 20 categories');
  });
});
