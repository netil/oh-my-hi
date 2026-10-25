// @ts-check
// paths.mjs: where oh-my-hi keeps its output (SQLite DBs, caches, the built
// dashboard). One resolver shared by the build, the server and the DB CLI.
//
// A marketplace install runs from a per-version directory
// (<plugins>/cache/<marketplace>/<plugin>/<version>/) that Claude Code replaces
// on every update and deletes 14 days later, so its output lives in the
// plugin's persistent data directory (<plugins>/data/<id>/) instead.

import fs from 'fs';
import path from 'path';

/**
 * True when running from the source git checkout (not an installed copy).
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isDevCheckout(root, env = process.env) {
  if (env.OMH_BUILD_MODE === 'plugin') return false;
  if (env.OMH_BUILD_MODE === 'dev') return true;
  try {
    if (!fs.existsSync(path.join(root, '.git'))) return false;
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    return pkg.name === 'oh-my-hi';
  } catch { return false; }
}

/**
 * Where Claude Code keeps plugins: CLAUDE_CODE_PLUGIN_CACHE_DIR, else
 * <config dir>/plugins.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function pluginsRoot(env = process.env) {
  if (env.CLAUDE_CODE_PLUGIN_CACHE_DIR) return env.CLAUDE_CODE_PLUGIN_CACHE_DIR;
  const home = env.HOME || env.USERPROFILE || '';
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'plugins');
}

/**
 * The marketplace install `root` belongs to, or null when it is not one
 * (dev checkout, npm install, marketplace clone).
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ pluginsRoot: string, marketplace: string, plugin: string, version: string } | null}
 */
export function marketplaceInstall(root, env = process.env) {
  const base = path.resolve(pluginsRoot(env), 'cache');
  const rel = path.relative(base, path.resolve(root));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.length !== 3) return null;
  const [marketplace, plugin, version] = parts;
  return { pluginsRoot: pluginsRoot(env), marketplace, plugin, version };
}

/**
 * The persistent data directory Claude Code assigns a plugin
 * (${CLAUDE_PLUGIN_DATA}): <plugins>/data/<plugin@marketplace, sanitized>.
 * @param {{ pluginsRoot: string, marketplace: string, plugin: string }} install
 */
export function pluginDataDir(install) {
  const id = `${install.plugin}@${install.marketplace}`.replace(/[^A-Za-z0-9_-]/g, '-');
  return path.join(install.pluginsRoot, 'data', id);
}

/**
 * Output directory, first match wins: OMH_OUTPUT_DIR (tests, overrides) →
 * <root>/output for the dev checkout → CLAUDE_PLUGIN_DATA → the derived data
 * directory of a marketplace install → <root>/output.
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveOutputDir(root, env = process.env) {
  if (env.OMH_OUTPUT_DIR) return env.OMH_OUTPUT_DIR;
  if (isDevCheckout(root, env)) return path.join(root, 'output');
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  const install = marketplaceInstall(root, env);
  if (install) return pluginDataDir(install);
  return path.join(root, 'output');
}

/** Newest modification time (ms) among the SQLite files under <dir>/db, 0 if none. */
function newestDbMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.sqlite(-wal)?$/.test(e.name)) newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  walk(path.join(dir, 'db'));
  return newest;
}

/**
 * Output directories that earlier installs left behind: other versions'
 * <version>/output and the marketplace clone's output.
 * @param {{ pluginsRoot: string, marketplace: string, plugin: string }} install
 */
export function legacyOutputDirs(install) {
  const dirs = [];
  const versionsDir = path.join(install.pluginsRoot, 'cache', install.marketplace, install.plugin);
  try {
    for (const v of fs.readdirSync(versionsDir)) dirs.push(path.join(versionsDir, v, 'output'));
  } catch { /* none */ }
  dirs.push(path.join(install.pluginsRoot, 'marketplaces', install.marketplace, 'output'));
  return dirs.filter((d) => fs.existsSync(path.join(d, 'db')));
}

/**
 * First run with a persistent data directory: copy the most recently written
 * legacy output into it, so usage history survives the move. Copies (never
 * moves) because an older version may still be running from its directory;
 * the -wal/-shm files travel with each DB. Does nothing once `dest` has a db/.
 * @param {string} dest
 * @param {string[]} candidates legacy output directories
 * @returns {string|null} the directory copied from
 */
export function migrateLegacyOutput(dest, candidates) {
  if (fs.existsSync(path.join(dest, 'db'))) return null;
  const best = candidates
    .map((dir) => ({ dir, mtime: newestDbMtime(dir) }))
    .filter((c) => c.mtime > 0 && path.resolve(c.dir) !== path.resolve(dest))
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!best) return null;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of ['db', 'cache']) {
    const src = path.join(best.dir, name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, name), { recursive: true });
  }
  return best.dir;
}
