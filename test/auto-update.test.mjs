// auto-update.test.mjs: persistent output directory, migration from older
// versions, and the self-update decision (no real `claude` calls).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { resolveOutputDir, marketplaceInstall, pluginDataDir, legacyOutputDirs, migrateLegacyOutput } from '../scripts/paths.mjs';
import { shouldAutoUpdate, repointAutoHook, installedPluginPath, RETRY_AFTER_MS } from '../scripts/auto-update.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'omh-au-'));

describe('output directory', () => {
  const plugins = '/home/u/.claude/plugins';
  const root = path.join(plugins, 'cache', 'oh-my-hi', 'oh-my-hi', '0.16.0');
  const env = { CLAUDE_CONFIG_DIR: '/home/u/.claude', OMH_BUILD_MODE: 'plugin' };

  it('recognizes a marketplace install and derives its data directory', () => {
    const install = marketplaceInstall(root, env);
    assert.deepEqual(install, { pluginsRoot: plugins, marketplace: 'oh-my-hi', plugin: 'oh-my-hi', version: '0.16.0' });
    assert.equal(pluginDataDir({ ...install, marketplace: 'my.mkt' }), path.join(plugins, 'data', 'oh-my-hi-my-mkt'));
  });

  it('resolves in order: override, dev checkout, CLAUDE_PLUGIN_DATA, derived, root/output', () => {
    assert.equal(resolveOutputDir(root, { ...env, OMH_OUTPUT_DIR: '/x' }), '/x');
    assert.equal(resolveOutputDir(root, { ...env, OMH_BUILD_MODE: 'dev' }), path.join(root, 'output'));
    assert.equal(resolveOutputDir(root, { ...env, CLAUDE_PLUGIN_DATA: '/data' }), '/data');
    assert.equal(resolveOutputDir(root, env), path.join(plugins, 'data', 'oh-my-hi-oh-my-hi'));
    assert.equal(resolveOutputDir('/opt/npm/oh-my-hi', env), path.join('/opt/npm/oh-my-hi', 'output'));
  });

  it('honors CLAUDE_CODE_PLUGIN_CACHE_DIR as the plugins root', () => {
    const r = path.join('/p', 'cache', 'm', 'oh-my-hi', '1.0.0');
    assert.equal(resolveOutputDir(r, { OMH_BUILD_MODE: 'plugin', CLAUDE_CODE_PLUGIN_CACHE_DIR: '/p' }), path.join('/p', 'data', 'oh-my-hi-m'));
  });
});

describe('migration from older versions', () => {
  const setup = () => {
    const pluginsDir = tmp();
    const install = { pluginsRoot: pluginsDir, marketplace: 'm', plugin: 'oh-my-hi' };
    const out = (v) => path.join(pluginsDir, 'cache', 'm', 'oh-my-hi', v, 'output');
    const writeDb = (dir, mtimeMs) => {
      fs.mkdirSync(path.join(dir, 'db', '2026'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'cache'), { recursive: true });
      for (const f of ['2026-10.sqlite', '2026-10.sqlite-wal']) {
        const p = path.join(dir, 'db', '2026', f);
        fs.writeFileSync(p, dir);
        fs.utimesSync(p, mtimeMs / 1000, mtimeMs / 1000);
      }
      fs.writeFileSync(path.join(dir, 'cache', 'mtime-index.json'), '{}');
    };
    return { pluginsDir, install, out, writeDb };
  };

  it('copies the most recently written version, WAL and cache included', () => {
    const { install, out, writeDb } = setup();
    writeDb(out('0.14.0'), Date.now() - 5e6);
    writeDb(out('0.15.0'), Date.now() - 1e3);
    const dest = pluginDataDir(install);
    const from = migrateLegacyOutput(dest, legacyOutputDirs(install));
    assert.equal(from, out('0.15.0'));
    assert.equal(fs.readFileSync(path.join(dest, 'db', '2026', '2026-10.sqlite-wal'), 'utf-8'), out('0.15.0'));
    assert.ok(fs.existsSync(path.join(dest, 'cache', 'mtime-index.json')));
    assert.ok(fs.existsSync(path.join(out('0.15.0'), 'db')), 'source left in place');
  });

  it('never overwrites a data directory that already has a db', () => {
    const { install, out, writeDb } = setup();
    writeDb(out('0.15.0'), Date.now());
    const dest = pluginDataDir(install);
    fs.mkdirSync(path.join(dest, 'db'), { recursive: true });
    assert.equal(migrateLegacyOutput(dest, legacyOutputDirs(install)), null);
    assert.deepEqual(fs.readdirSync(path.join(dest, 'db')), []);
  });
});

describe('self-update decision', () => {
  const base = { current: '0.15.0', latest: '0.16.0', marketplaceInstall: true, disabled: false, env: {}, lastAttempt: null, now: 1e12 };

  it('updates a marketplace install to a newer release', () => {
    assert.deepEqual(shouldAutoUpdate(base), { run: true, reason: 'newer-version' });
  });

  it('skips when up to date, not a marketplace install, disabled or in CI', () => {
    assert.equal(shouldAutoUpdate({ ...base, latest: '0.15.0' }).reason, 'up-to-date');
    assert.equal(shouldAutoUpdate({ ...base, marketplaceInstall: false }).reason, 'not-a-marketplace-install');
    assert.equal(shouldAutoUpdate({ ...base, disabled: true }).reason, 'disabled');
    assert.equal(shouldAutoUpdate({ ...base, env: { CI: '1' } }).reason, 'ci');
  });

  it("follows Claude Code's update switches unless plugin updates are forced", () => {
    for (const k of ['DISABLE_UPDATES', 'DISABLE_AUTOUPDATER', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']) {
      assert.equal(shouldAutoUpdate({ ...base, env: { [k]: '1' } }).reason, 'updates-disabled-by-env');
    }
    assert.equal(shouldAutoUpdate({ ...base, env: { DISABLE_AUTOUPDATER: '1', FORCE_AUTOUPDATE_PLUGINS: '1' } }).run, true);
  });

  it('waits a day after a failed attempt at the same version', () => {
    const failed = { version: '0.16.0', at: base.now - 1000, ok: false };
    assert.equal(shouldAutoUpdate({ ...base, lastAttempt: failed }).reason, 'backoff');
    assert.equal(shouldAutoUpdate({ ...base, lastAttempt: { ...failed, at: base.now - RETRY_AFTER_MS - 1 } }).run, true);
    assert.equal(shouldAutoUpdate({ ...base, latest: '0.16.1', lastAttempt: failed }).run, true, 'a newer release retries at once');
  });
});

describe('Stop hook repoint', () => {
  it('moves only the oh-my-hi auto-refresh hook to the new version', () => {
    const oldCmd = 'node "/p/cache/m/oh-my-hi/0.15.0/scripts/generate-dashboard.mjs" --_auto-refresh';
    const newCmd = 'node "/p/cache/m/oh-my-hi/0.16.0/scripts/generate-dashboard.mjs" --_auto-refresh';
    const settings = { hooks: { Stop: [{ hooks: [{ type: 'command', command: oldCmd }, { type: 'command', command: 'echo other' }] }] } };
    assert.equal(repointAutoHook(settings, newCmd), true);
    assert.deepEqual(settings.hooks.Stop[0].hooks.map((h) => h.command), [newCmd, 'echo other']);
    assert.equal(repointAutoHook(settings, newCmd), false, 'already current');
  });

  it('reads the user-scope install path from installed_plugins.json', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'oh-my-hi@m': [
      { scope: 'project', installPath: '/proj', version: '0.14.0' },
      { scope: 'user', installPath: '/user', version: '0.16.0' },
    ] } }));
    assert.deepEqual(installedPluginPath(dir, 'oh-my-hi@m'), { path: '/user', version: '0.16.0' });
    assert.equal(installedPluginPath(dir, 'missing@m'), null);
  });
});
