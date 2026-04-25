#!/usr/bin/env node
// @ts-check
// generate-dashboard.mjs — oh-my-hi dashboard generator

/**
 * @typedef {{ id: string, label: string, type: 'global'|'project',
 *   configPath: string, projectPath: string|null }} Scope
 */

/**
 * @typedef {{ globalClaudeTokens: number, projectClaudeTokens: number,
 *   autoMemoryTokens: number, skillsDescTokens: number,
 *   mcpToolsTokens: number, principlesTokens: number }} ContextStats
 */

/**
 * @typedef {{ usage: import('./parsers/usage.mjs').UsageResult,
 *   contextStats: ContextStats,
 *   dateRange: { start: number|null, end: number|null } }} ScopeData
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';

// Auto-install dependencies if missing
const __boot_dir = path.dirname(fileURLToPath(import.meta.url));
const __boot_root = path.resolve(__boot_dir, '..');
if (!fs.existsSync(path.join(__boot_root, 'node_modules'))) {
  console.log('oh-my-hi: installing dependencies...');
  execSync('npm install --omit=dev', { cwd: __boot_root, stdio: 'inherit' });
}

const { transformSync } = await import('esbuild');

import { parseSkills } from './parsers/skills.mjs';
import { parseAgents } from './parsers/agents.mjs';
import { parsePlugins } from './parsers/plugins.mjs';
import { parseHooks } from './parsers/hooks.mjs';
import { parseMemory } from './parsers/memory.mjs';
import { parseMcpServers } from './parsers/mcp-servers.mjs';
import { parseRules, parsePrinciples } from './parsers/rules.mjs';
import { parseCommands } from './parsers/commands.mjs';
import { parseTeams } from './parsers/teams.mjs';
import { parsePlans } from './parsers/plans.mjs';
import { parseTodos } from './parsers/todos.mjs';
import { parseConfigFiles } from './parsers/config-files.mjs';
import { parseUsage, savePending, mergePending, hasPending, loadMtimeIndex, saveMtimeIndex } from './parsers/usage.mjs';
import { detectScopes } from './parsers/scopes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const OUTPUT = path.join(ROOT, 'output');

// Dev vs plugin build detection.
// Dev build:     script is running from the source git checkout (the folder
//                with .git and package.json name === "oh-my-hi"). Always
//                rebuilds HTML from templates (skips mtime short-circuit),
//                and prints a [dev] marker so you can tell which mode is
//                active. Used when editing templates locally.
// Plugin build:  script is running from ~/.claude/plugins/cache/... — the
//                current optimized path that reuses cached HTML when the
//                templates haven't changed.
// Detection: check the script's own repo root, not process.cwd(), so
// invoking the binary from any directory still picks the right mode.
// IS_DEV_BUILD: controls HTML rebuild skipping and plugin-mode behaviour.
// OMH_BUILD_MODE=plugin forces false so tests can exercise the plugin code path.
const IS_DEV_BUILD = (() => {
  if (process.env.OMH_BUILD_MODE === 'plugin') return false;
  if (process.env.OMH_BUILD_MODE === 'dev') return true;
  try {
    if (!fs.existsSync(path.join(ROOT, '.git'))) return false;
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    return pkg.name === 'oh-my-hi';
  } catch { return false; }
})();

// IS_ACTUAL_DEV_REPO: true when the script is running from the real source
// checkout (not a plugin install). Used only for the _devBuild badge so that
// OMH_BUILD_MODE=plugin tests don't strip the badge from shared output files.
const IS_ACTUAL_DEV_REPO = (() => {
  try {
    if (!fs.existsSync(path.join(ROOT, '.git'))) return false;
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    return pkg.name === 'oh-my-hi';
  } catch { return false; }
})();

const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
  || path.join(process.env.HOME, '.claude');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`oh-my-hi — Full harness status dashboard

Usage:
  oh-my-hi                    Full build (index.html + data.json)
  oh-my-hi --data-only        Regenerate data + web-ui (skip browser open)
  oh-my-hi --enable-auto      Enable auto data refresh on session end
  oh-my-hi --disable-auto     Disable auto data refresh
  oh-my-hi --status           Check auto-refresh status
  oh-my-hi --update           Check and install latest version
  oh-my-hi <path> [path...]   Include specified projects only
  oh-my-hi --help             Show help`);
  process.exit(0);
}

// ── Pricing fetch ───────────────────────────────────────────────────────────
const PRICING_CACHE_FILE = path.join(OUTPUT, 'cache', '.pricing-cache.json');
const PRICING_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function _modelNameToKey(name) {
  // "Claude Opus 4.7 (deprecated)" → "opus-4-7", "Claude Sonnet 4" → "sonnet-4"
  const clean = name.replace(/\([^)]*\)/g, '').trim();
  const m = clean.match(/^Claude\s+(Opus|Sonnet|Haiku)\s+(\d+)(?:\.(\d+))?$/i);
  if (!m) return null;
  return [m[1].toLowerCase(), m[2], m[3]].filter(Boolean).join('-');
}

function _parsePricingHtml(html) {
  const pricing = {};
  let headerCols = null;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRe.exec(html)) !== null) {
    const cells = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cM;
    while ((cM = cellRe.exec(trM[1])) !== null) {
      cells.push(
        cM[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
      );
    }
    if (cells.length < 4) continue;
    if (!headerCols && /^model$/i.test(cells[0]) && cells.some(c => /input/i.test(c))) {
      headerCols = cells.map(c => c.toLowerCase());
      continue;
    }
    if (!headerCols || !/^claude\s/i.test(cells[0])) continue;
    const key = _modelNameToKey(cells[0]);
    if (!key) continue;
    const pick = (kw) => {
      const i = headerCols.findIndex(h => h.includes(kw));
      if (i < 0 || i >= cells.length) return null;
      const m2 = cells[i].match(/\$([\d.]+)/);
      return m2 ? parseFloat(m2[1]) : null;
    };
    const input = pick('input'), output = pick('output');
    if (input == null || output == null) continue;
    pricing[key] = { input, output, cacheRead: pick('hit') ?? pick('refresh'), cacheCreation: pick('5m') };
  }
  return Object.keys(pricing).length > 0 ? pricing : null;
}

async function fetchModelPricing() {
  // Returns { pricing, ts } or null on failure.
  try {
    if (fs.existsSync(PRICING_CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(PRICING_CACHE_FILE, 'utf-8'));
      if (Date.now() - (cached.ts || 0) < PRICING_CACHE_TTL) {
        return { pricing: cached.pricing, ts: cached.ts };
      }
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch('https://platform.claude.com/docs/en/docs/about-claude/pricing', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const pricing = _parsePricingHtml(await res.text());
    if (!pricing) return null;
    const ts = Date.now();
    try {
      fs.mkdirSync(path.dirname(PRICING_CACHE_FILE), { recursive: true });
      fs.writeFileSync(PRICING_CACHE_FILE, JSON.stringify({ ts, pricing }));
    } catch { /* ignore */ }
    console.log('  pricing: fetched from Anthropic docs');
    return { pricing, ts };
  } catch {
    return null;
  }
}

// ── Internal: background cache refresh (spawned as detached child) ──
if (args.includes('--_update-cache')) {
  _runUpdateCacheRefresh().then(() => process.exit(0)).catch(() => process.exit(0));
}

/** Read .update-check cache and print a one-line notice if a newer version exists.
 *  Purely synchronous (file read only) — adds ~0ms to startup. */
function notifyUpdateIfAvailable() {
  const UPDATE_CHECK_FILE = path.join(OUTPUT, 'cache', '.update-check');
  try {
    if (!fs.existsSync(UPDATE_CHECK_FILE)) return;
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const cached = JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, 'utf-8'));
    if (!semverGt(cached.latest, pkg.version)) return;
    const locale = detectSystemLocale();
    if (locale === 'ko') {
      console.log(`oh-my-hi: 🆕 최신 버전 v${cached.latest} 이 있습니다 — /omh --update`);
    } else {
      console.log(`oh-my-hi: 🆕 v${cached.latest} available — /omh --update to upgrade`);
    }
  } catch { /* best effort */ }
}

/** Spawn a detached child process to refresh the update cache in the background.
 *  Only spawns when cache is missing or older than 12 hours.
 *  The child is unref'd so the parent exits immediately. */
function scheduleUpdateCacheRefresh() {
  const UPDATE_CHECK_FILE = path.join(OUTPUT, 'cache', '.update-check');
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  try {
    if (fs.existsSync(UPDATE_CHECK_FILE)) {
      const cached = JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, 'utf-8'));
      if (Date.now() - (cached.timestamp || 0) < TWELVE_HOURS) return; // fresh, skip
    }
    const child = spawn(process.execPath, [__filename, '--_update-cache'], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, CLAUDE_CONFIG_DIR, OMH_OUTPUT: OUTPUT },
    });
    child.unref();
  } catch { /* best effort */ }
}

/** Fetches the latest version tag and writes it to .update-check cache. */
async function _runUpdateCacheRefresh() {
  const outputDir = process.env.OMH_OUTPUT || OUTPUT;
  const UPDATE_CHECK_FILE = path.join(outputDir, 'cache', '.update-check');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const repoUrl = pkg.repository?.url || '';
    const ghMatch = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    let latest = null;

    if (ghMatch) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch(`https://api.github.com/repos/${ghMatch[1]}/tags`,
          { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json' } });
        clearTimeout(t);
        if (res.ok) {
          const tags = await res.json();
          for (const tag of tags) {
            const v = tag.name.replace(/^v/, '');
            if (/^\d+\.\d+\.\d+$/.test(v) && (!latest || semverGt(v, latest))) latest = v;
          }
        }
      } catch { /* timeout or network error */ }
    }

    if (!latest) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`,
          { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        clearTimeout(t);
        if (res.ok) { const d = await res.json(); latest = d.version; }
      } catch { /* timeout or network error */ }
    }

    if (latest) {
      fs.mkdirSync(path.dirname(UPDATE_CHECK_FILE), { recursive: true });
      fs.writeFileSync(UPDATE_CHECK_FILE,
        JSON.stringify({ timestamp: Date.now(), current: pkg.version, latest }), 'utf8');
    }
  } catch { /* best effort */ }
}

// ── Update ──
if (args.includes('--update')) {
  runUpdate().then(() => process.exit(0)).catch(() => process.exit(1));
}

async function runUpdate() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  console.log(`oh-my-hi: current version v${pkg.version}`);
  console.log('oh-my-hi: checking for updates...');

  // Detect marketplace name and cache dir
  const pluginCacheDir = path.join(CLAUDE_CONFIG_DIR, 'plugins', 'cache');
  let marketplace = 'oh-my-hi';
  if (fs.existsSync(pluginCacheDir)) {
    for (const entry of fs.readdirSync(pluginCacheDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('temp_')) continue;
      if (fs.existsSync(path.join(pluginCacheDir, entry.name, pkg.name))) {
        marketplace = entry.name;
        break;
      }
    }
  }

  // Refresh marketplace cache so claude plugin update sees latest tags
  const marketplaceCacheDir = path.join(CLAUDE_CONFIG_DIR, 'plugins', 'marketplaces', marketplace);
  if (fs.existsSync(marketplaceCacheDir)) {
    try {
      execSync('git fetch --tags --quiet', { cwd: marketplaceCacheDir, stdio: 'pipe', timeout: 10000 });
    } catch { /* best effort — offline or not a git repo */ }
  }

  try {
    // Check latest version via GitHub tags API (git-based distribution)
    const repoUrl = pkg.repository?.url || '';
    const ghMatch = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    let latest = null;

    if (ghMatch) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://api.github.com/repos/${ghMatch[1]}/tags`, {
        signal: controller.signal, headers: { 'Accept': 'application/vnd.github+json' },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const tags = await res.json();
        // Find highest semver tag
        for (const tag of tags) {
          const v = tag.name.replace(/^v/, '');
          if (/^\d+\.\d+\.\d+$/.test(v) && (!latest || semverGt(v, latest))) latest = v;
        }
      }
    }

    // Fallback to npm registry if GitHub API unavailable
    if (!latest) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, {
        signal: controller.signal, headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        latest = data.version;
      }
    }

    if (!latest) throw new Error('could not determine latest version');

    // Cache check result
    const UPDATE_CHECK_FILE = path.join(OUTPUT, 'cache', '.update-check');
    try {
      fs.mkdirSync(path.dirname(UPDATE_CHECK_FILE), { recursive: true });
      fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify({ timestamp: Date.now(), current: pkg.version, latest }), 'utf8');
    } catch { /* best effort */ }

    if (!semverGt(latest, pkg.version)) {
      console.log('oh-my-hi: ✅ already up to date');
      return;
    }
    console.log(`oh-my-hi: v${latest} available`);
    console.log(`oh-my-hi: updating v${pkg.version} → v${latest}...`);
    execSync(`claude plugin update ${pkg.name}@${marketplace}`, {
      stdio: 'inherit',
      env: { ...process.env, CLAUDE_CONFIG_DIR },
    });
    console.log(`oh-my-hi: ✅ updated to v${latest}`);
  } catch (e) {
    if (e.name === 'AbortError') console.log('oh-my-hi: ❌ network timeout');
    else console.log('oh-my-hi: ❌ update failed —', e.message);
    throw e;
  }
}

// ── Auto-refresh hook management ──
const SETTINGS_PATH = path.join(CLAUDE_CONFIG_DIR, 'settings.json');
const AUTO_HOOK_CMD = `node "${path.join(ROOT, 'scripts', 'generate-dashboard.mjs')}" --data-only`;

/** Returns true if version a is greater than version b (semver, numeric comparison) */
function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); } catch { return {}; }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

function hasAutoHook(settings) {
  const stopHooks = settings.hooks?.Stop;
  if (!Array.isArray(stopHooks)) return false;
  return stopHooks.some(entry =>
    entry.hooks?.some(h => h.command?.includes('oh-my-hi') && h.command?.includes('--data-only'))
  );
}

function addAutoHook() {
  const settings = readSettings();
  if (hasAutoHook(settings)) {
    console.log('oh-my-hi: ✅ Auto-refresh is already enabled.');
    return;
  }
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  settings.hooks.Stop.push({
    matcher: '*',
    hooks: [{ type: 'command', command: AUTO_HOOK_CMD }]
  });
  writeSettings(settings);
  console.log('oh-my-hi: ✅ Auto-refresh enabled. data.json will be refreshed automatically on session end.');
}

function removeAutoHook() {
  const settings = readSettings();
  if (!hasAutoHook(settings)) {
    console.log('oh-my-hi: ℹ️ Auto-refresh is not configured.');
    return;
  }
  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(entry =>
      !entry.hooks?.some(h => h.command?.includes('oh-my-hi') && h.command?.includes('--data-only'))
    );
    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }
  writeSettings(settings);
  console.log('oh-my-hi: ✅ Auto-refresh disabled.');
  console.log('oh-my-hi: ℹ️ Run `/omh --data-only` or `/omh` to refresh data manually.');
}

function showStatus() {
  const settings = readSettings();
  const enabled = hasAutoHook(settings);
  console.log('oh-my-hi: Auto-refresh status: ' + (enabled ? '✅ Enabled' : '❌ Disabled'));
  if (!enabled) {
    console.log('oh-my-hi: ℹ️ To enable, run `/omh --enable-auto`.');
    console.log('oh-my-hi: ℹ️ To refresh data manually, run `/omh --data-only`.');
  }
}

if (args.includes('--enable-auto')) { addAutoHook(); process.exit(0); }
if (args.includes('--disable-auto')) { removeAutoHook(); process.exit(0); }
if (args.includes('--status')) { showStatus(); process.exit(0); }

const extraPaths = args.filter(a => !a.startsWith('-'));

const CACHE_PATH = path.join(OUTPUT, 'transcript-cache.json');

async function main() {
  const dataOnly = args.includes('--data-only');
  const indexPath = path.join(OUTPUT, 'index.html');
  const dataPath = path.join(OUTPUT, 'data.json');

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT, { recursive: true });

  // ── SQLite: load module + handle legacy DB split ──
  let dbModule = null;
  try {
    dbModule = await import('./db.mjs');

    // Split legacy oh-my-hi.sqlite into monthly files if needed (one-time upgrade)
    const LEGACY_DB = path.join(OUTPUT, 'oh-my-hi.sqlite');
    const removeLegacyFiles = () => {
      for (const suffix of ['', '-shm', '-wal', '.migrated']) {
        try { fs.unlinkSync(LEGACY_DB + suffix); } catch { /* ignore */ }
      }
    };
    if (fs.existsSync(LEGACY_DB)) {
      if (dbModule.listMonthlyDbs(OUTPUT).length === 0) {
        console.log('oh-my-hi: 레거시 DB를 월별 파일로 분리하는 중...');
        const legacyDb = dbModule.openDb(LEGACY_DB);
        try { dbModule.splitLegacyDb(legacyDb, OUTPUT); } finally { legacyDb.close(); }
        console.log('oh-my-hi: ✅ 레거시 DB 분리 완료');
      }
      removeLegacyFiles();
    } else {
      // No oh-my-hi.sqlite, but leftover WAL/SHM/.migrated may exist — clean them up
      removeLegacyFiles();
    }
  } catch (e) {
    console.warn('oh-my-hi: SQLite unavailable —', e.message);
  }

  const appendToMonthly = (scope, usage) => {
    if (!dbModule || !usage) return;
    try { dbModule.appendUsageMonthly(OUTPUT, scope, usage); } catch (e) {
      console.warn('oh-my-hi: SQLite append failed —', e.message);
    }
  };

  const syncDb = (scopeData) => {
    for (const [scope, sdata] of Object.entries(scopeData || {})) {
      if (sdata?.usage) appendToMonthly(scope, sdata.usage);
    }
  };

  const getDbCtxNames = () => {
    if (!dbModule) return [];
    try { return dbModule.queryContextNamesAllMonths(OUTPUT); } catch { return []; }
  };

  const getDbDateRange = () => {
    if (!dbModule) return null;
    try {
      const r = dbModule.queryDateRangeAllMonths(OUTPUT);
      return r ? { from: r.earliest, to: r.latest } : null;
    } catch { return null; }
  };

  // ── One-time upgrade: remove legacy JS data files ──
  cleanupLegacyFiles(OUTPUT);
  // Migration (data.json → SQLite) is deferred until after server start so the
  // browser can immediately display existing data via the data.json fallback.
  const needsMigration = checkNeedsMigration(dbModule, OUTPUT, dataPath);

  // ── Lightweight mode (--data-only, triggered by Stop hook) ──
  // Parse changed files, update data.js for browser, save pending for cache.
  if (dataOnly) {
    if (IS_DEV_BUILD) console.log('oh-my-hi: [dev] running from source checkout');
    console.log('oh-my-hi: collecting data (lightweight)...');

    // Load mtime index (tiny file) instead of full cache
    const mtimeIndex = loadMtimeIndex(CACHE_PATH);
    const mtimeIndexSize = Object.keys(mtimeIndex).length;
    const cache = {};
    for (const [fp, mtimeMs] of Object.entries(mtimeIndex)) {
      cache[fp] = { mtimeMs, size: 0, result: null };
    }
    cache._parsed = 0;

    // Parse only changed transcript files
    const scopes = detectScopes(CLAUDE_CONFIG_DIR, extraPaths);
    const projectScopes = scopes.filter(s => s.type !== 'global');
    await Promise.all([
      parseUsage(CLAUDE_CONFIG_DIR, 0, null, { cache }),
      ...projectScopes.map(s =>
        fs.existsSync(s.configPath) ? parseUsage(CLAUDE_CONFIG_DIR, 0, s.configPath, { cache }) : Promise.resolve()
      ),
    ]);

    const parsed = cache._parsed || 0;
    const total = Object.keys(cache).filter(k => !k.startsWith('_')).length;
    console.log(`  transcripts: ${total} files (${parsed} parsed, ${total - parsed} skipped)`);

    // Append new entries to SQLite — must run BEFORE savePending()
    // because savePending clears _new flags that the merge depends on.
    if (parsed > 0 && dbModule) {
      const newUsage = { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] };
      for (const [key, entry] of Object.entries(cache)) {
        if (key.startsWith('_') || !entry?._new || !entry.result) continue;
        const r = entry.result;
        for (const field of Object.keys(newUsage)) {
          if (r[field]?.length) newUsage[field].push(...r[field]);
        }
      }
      appendToMonthly('global', newUsage);
    }

    // Update data.json generatedAt (and pricingFetchedAt from cache if present)
    if (fs.existsSync(dataPath)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        existingData.generatedAt = new Date().toISOString();
        if (!existingData.pricingFetchedAt && fs.existsSync(PRICING_CACHE_FILE)) {
          try {
            const pc = JSON.parse(fs.readFileSync(PRICING_CACHE_FILE, 'utf-8'));
            if (pc.ts) existingData.pricingFetchedAt = new Date(pc.ts).toISOString();
            if (pc.pricing) existingData.modelPricing = pc.pricing;
          } catch { /* ignore */ }
        }
        writeDataJs(existingData, dataPath);
        console.log('  data.json updated');
      } catch { /* skip — full rebuild on next /omh */ }
    }

    // Save as pending + update mtime index
    savePending(CACHE_PATH, cache);
    saveMtimeIndex(CACHE_PATH, cache);

    // Ensure _devBuild flag is set when running from the real dev repo
    if (IS_ACTUAL_DEV_REPO && fs.existsSync(dataPath)) {
      try {
        const d = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        if (!d._devBuild) {
          d._devBuild = true;
          writeDataJs(d, dataPath);
        }
      } catch { /* best effort */ }
    }

    // Build index.html if missing or version changed
    if (needsHtmlRebuild(indexPath)) {
      writeHtml(indexPath, detectSystemLocale());
    }

    // Deferred migration: server is already running, browser uses data.json fallback
    if (needsMigration) await migrateWithProgress(dbModule, OUTPUT, dataPath);

    console.log('oh-my-hi: done (lightweight)');
    return;
  }

  // ── Full mode (user-initiated /omh) ──
  notifyUpdateIfAvailable(); // instant: reads cache only, no network
  const scopes = detectScopes(CLAUDE_CONFIG_DIR, extraPaths);
  const systemLocale = detectSystemLocale();
  const _pricingResult = await fetchModelPricing();
  const modelPricing = _pricingResult?.pricing ?? null;
  const pricingFetchedAt = _pricingResult?.ts ? new Date(_pricingResult.ts).toISOString() : null;

  // Check cache state to decide progressive mode
  const cacheDirPath = path.join(OUTPUT, 'cache');
  const cacheExists = fs.existsSync(CACHE_PATH) || fs.existsSync(cacheDirPath);
  const pendingExists = hasPending(CACHE_PATH);

  // Rebuild index.html only when needed (first run or version change)
  if (needsHtmlRebuild(indexPath)) {
    writeHtml(indexPath, systemLocale);
  }

  let dashboardUrl;

  if (!cacheExists && !pendingExists) {
    // Progressive mode: first run — no SQLite data and no mtime-index yet
    console.log('oh-my-hi: first run — generating dashboard from scratch...');
    console.log(`  [1/4] scanning ${scopes.length} workspace(s)...`);

    const cache = {};
    console.log('  [2/4] building 7-day preview...');
    const phase1ScopeData = await collectAllScopes(scopes, { days: 7, cache, progress: true });
    syncDb(phase1ScopeData); // seed SQLite so browser can display while full load runs
    const phase1Data = buildDataObject(scopes, phase1ScopeData, systemLocale, [], { _partial: true, modelPricing, pricingFetchedAt });
    writeDataJs(phase1Data, dataPath);

    console.log('  [3/4] starting server...');
    dashboardUrl = await spawnServeOrRefresh();

    console.log('  [4/4] loading full history (this may take a moment)...');
    // cachePath: saves mtime-index (no seg-*.json.gz — collectAllScopes no longer calls saveTranscriptCache)
    const phase2ScopeData = await collectAllScopes(scopes, { days: 0, cache, cachePath: CACHE_PATH, progress: true });
    syncDb(phase2ScopeData); // seed full history into monthly SQLite files
    const dbCtxNames = getDbCtxNames();
    const phase2Data = buildDataObject(scopes, phase2ScopeData, systemLocale, dbCtxNames, { _firstRun: true, _dateRange: getDbDateRange(), modelPricing, pricingFetchedAt });
    writeDataJs(phase2Data, dataPath);
  } else {
    // Normal mode: structure scan + incremental SQLite update
    if (IS_DEV_BUILD) console.log('oh-my-hi: [dev] running from source checkout — forcing full rebuild');
    console.log('oh-my-hi: collecting data...');
    console.log(`  [1/3] scanning ${scopes.length} workspace(s)...`);

    // Structure data only (fast config-file scan, no transcript parsing)
    const scopeData = await collectAllScopes(scopes, { days: 0, skipUsage: true, progress: false });

    // Incremental usage: parse only new/changed transcript files, append to monthly SQLite
    if (dbModule) {
      const mtimeIndex = loadMtimeIndex(CACHE_PATH);
      const stubCache = Object.fromEntries(Object.entries(mtimeIndex).map(([fp, mtimeMs]) => [fp, { mtimeMs, size: 0, result: null }]));
      stubCache._parsed = 0;
      stubCache._processed = 0;
      stubCache._total = 0;
      const projectScopes = scopes.filter(s => s.type !== 'global');
      await Promise.all([
        parseUsage(CLAUDE_CONFIG_DIR, 0, null, { cache: stubCache }),
        ...projectScopes.map(s =>
          fs.existsSync(s.configPath) ? parseUsage(CLAUDE_CONFIG_DIR, 0, s.configPath, { cache: stubCache }) : Promise.resolve()
        ),
      ]);
      if (stubCache._parsed > 0) {
        // Collect new entries from all scopes and append per-scope to monthly DBs
        const newByScope = { global: { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] } };
        for (const s of projectScopes) newByScope[s.id] = { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] };
        for (const [key, entry] of Object.entries(stubCache)) {
          if (key.startsWith('_') || !entry?._new || !entry.result) continue;
          const r = entry.result;
          for (const target of Object.values(newByScope)) {
            for (const field of Object.keys(target)) {
              if (r[field]?.length) target[field].push(...r[field]);
            }
          }
        }
        for (const [scopeId, usage] of Object.entries(newByScope)) {
          if (usage.tokenEntries.length > 0 || usage.skills.length > 0) {
            appendToMonthly(scopeId, usage);
          }
        }
        saveMtimeIndex(CACHE_PATH, stubCache);
        console.log(`  transcripts: ${stubCache._parsed} new file(s) parsed`);
      }
    }

    console.log('  [2/3] building dashboard...');
    // If migration needed: start server first so browser shows old data.json, then migrate
    if (needsMigration) {
      console.log('  [3/3] starting server...');
      dashboardUrl = await spawnServeOrRefresh();
      await migrateWithProgress(dbModule, OUTPUT, dataPath);
    }

    const dbCtxNames = getDbCtxNames();
    const data = buildDataObject(scopes, scopeData, systemLocale, dbCtxNames, { _dateRange: getDbDateRange(), modelPricing, pricingFetchedAt });
    writeDataJs(data, dataPath);

    if (!needsMigration) {
      console.log('  [3/3] starting server...');
      dashboardUrl = await spawnServeOrRefresh();
    }
  }

  console.log(`oh-my-hi: ✅ done → ${dashboardUrl}`);

  // Auto-refresh status notice
  const settings = readSettings();
  if (!hasAutoHook(settings)) {
    console.log('');
    console.log('oh-my-hi: ⚠️ Auto data refresh is not configured.');
    console.log('  → Enable auto-refresh on session end: /omh --enable-auto');
    console.log('  → Manual refresh:                     /omh --data-only');
  }

  // Schedule background cache refresh (detached child, non-blocking)
  scheduleUpdateCacheRefresh();
}


/** Detect system locale */
function detectSystemLocale() {
  let systemLocale = 'en';
  try {
    if (process.platform === 'darwin') {
      const appleLocale = execSync('defaults read -g AppleLanguages 2>/dev/null', { encoding: 'utf8' });
      const match = appleLocale.match(/"?(\w{2})/);
      if (match) systemLocale = match[1].toLowerCase();
    }
    if (systemLocale === 'en') {
      const lang = (process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || '').toLowerCase();
      if (lang.startsWith('ko')) systemLocale = 'ko';
      else if (lang.startsWith('ja')) systemLocale = 'ja';
      else if (lang.startsWith('zh')) systemLocale = 'zh';
    }
  } catch { /* fallback to en */ }
  return systemLocale;
}

/** Render an in-place progress bar to stdout */
function renderProgressBar(processed, total) {
  if (!total) return;
  const pct = Math.round((processed / total) * 100);
  const width = 25;
  const filled = Math.round((processed / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  process.stdout.write(`\r  [${bar}] ${pct}% (${processed}/${total} files)`);
}

/** Collect all scopes (global + projects) with given options */
async function collectAllScopes(scopes, { days = 0, cache, cachePath, skipUsage = false, progress = false } = {}) {
  const projectScopes = scopes.filter(s => s.type !== 'global');
  // Load or reuse cache; reset parse counter for this collection round
  const sharedCache = cache || {};

  // Merge pending files into cache (from previous --data-only runs)
  if (cachePath) {
    const pendingCount = mergePending(cachePath, sharedCache);
    if (pendingCount > 0) console.log(`  pending: ${pendingCount} files merged`);
  }

  sharedCache._parsed = 0;
  sharedCache._processed = 0;
  sharedCache._total = 0;
  sharedCache._onProgress = progress
    ? () => renderProgressBar(sharedCache._processed, sharedCache._total)
    : undefined;

  const usageOpts = { days, cache: sharedCache, cachePath, skipUsage };

  const [globalData, ...projectResults] = await Promise.all([
    collectScopeData(CLAUDE_CONFIG_DIR, usageOpts),
    ...projectScopes.map(scope =>
      !fs.existsSync(scope.configPath)
        ? Promise.resolve({ id: scope.id, data: emptyScopeData() })
        : collectProjectData(scope.configPath, scope.projectPath, usageOpts).then(data => ({ id: scope.id, data }))
    ),
  ]);

  // Update mtime index only — seg-*.json.gz no longer generated (SQLite is the store)
  if (cachePath) saveMtimeIndex(cachePath, sharedCache);

  if (progress) process.stdout.write('\n');

  const totalFiles = Object.keys(sharedCache).filter(k => !k.startsWith('_')).length;
  const parsed = Math.min(sharedCache._parsed || 0, totalFiles);
  console.log(`  transcripts: ${totalFiles} files (${parsed} parsed, ${totalFiles - parsed} cached)`);
  console.log(`  global: ${globalData.skills.length} skills, ${globalData.agents.length} agents, ${globalData.plugins.length} plugins`);

  const scopeData = { global: globalData };
  for (const result of projectResults) {
    scopeData[result.id] = result.data;
  }

  // Backfill: project scopes always load global skills/MCP alongside their own,
  // so add global counts to project-local counts for the full startup picture.
  const gs = globalData.contextStats;
  if (gs) {
    for (const [id, sd] of Object.entries(scopeData)) {
      if (id === 'global' || !sd.contextStats) continue;
      sd.contextStats.skillsCount += gs.skillsCount;
      sd.contextStats.skillsDescTokens += gs.skillsDescTokens;
      sd.contextStats.mcpServersCount += gs.mcpServersCount;
      sd.contextStats.mcpToolsTokens += gs.mcpToolsTokens;
    }
  }

  return scopeData;
}

// computeDateRange is superseded by getDbDateRange() closure in main(); kept as dead code guard.

function buildDataObject(scopes, scopeData, systemLocale, dbContextNames = [], extra = {}) {
  // Strip usage arrays — SQLite is the sole store for usage data.
  // data.json holds only structural/config data and metadata.
  const cleanScopeData = {};
  for (const [key, sdata] of Object.entries(scopeData)) {
    // eslint-disable-next-line no-unused-vars
    const { usage, ...rest } = sdata || {};
    cleanScopeData[key] = rest;
  }
  const taskCategories = buildTaskCategories(scopeData, dbContextNames);
  return {
    scopes,
    scopeData: cleanScopeData,
    taskCategories,
    generatedAt: new Date().toISOString(),
    configDir: CLAUDE_CONFIG_DIR,
    systemLocale,
    // Uses the canonical IS_DEV_BUILD flag defined at the top of the file
    // (checks .git + package.json name, honors OMH_BUILD_MODE override).
    _devBuild: IS_ACTUAL_DEV_REPO || undefined,
    ...extra,
  };
}

const escapeForScript = (str) => str
  .replaceAll('</', String.raw`<\u002f`)
  .replaceAll('\u2028', String.raw`\u2028`)
  .replaceAll('\u2029', String.raw`\u2029`);

/**
 * Write data.json (full data for API and programmatic access).
 * This is the lightweight operation — no template processing, no esbuild.
 */
function writeDataJs(data, dataPath) {
  fs.writeFileSync(dataPath, JSON.stringify(data), 'utf-8');
}

/** Remove legacy JS data files and transcript cache segments from output/. */
function cleanupLegacyFiles(outDir) {
  for (const name of ['data.js', 'data-core.js', 'data-usage.js']) {
    const p = path.join(outDir, name);
    try { if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`  cleanup: removed ${name}`); } } catch { /* ignore */ }
  }
  // Remove seg-*.json.gz and base-*.json.gz — superseded by SQLite + mtime-index
  const cacheDir = path.join(outDir, 'cache');
  if (fs.existsSync(cacheDir)) {
    try {
      for (const f of fs.readdirSync(cacheDir)) {
        if (!/^(seg|base)-.*\.json\.gz$/.test(f)) continue;
        try { fs.unlinkSync(path.join(cacheDir, f)); console.log(`  cleanup: removed cache/${f}`); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
}

/**
 * Returns true if no monthly DBs have token data but data.json exists with usage.
 * Covers the upgrade path for users coming from the file-based era.
 */
function checkNeedsMigration(dbMod, outputDir, dataPath) {
  if (!dbMod || !fs.existsSync(dataPath)) return false;
  try {
    const monthly = dbMod.listMonthlyDbs(outputDir);
    if (monthly.length === 0) return true; // no DB files at all
    return !monthly.some(({ path: p }) => {
      try {
        const db = dbMod.openDb(p);
        const n = db.prepare('SELECT COUNT(*) AS n FROM token_entries').get().n;
        db.close();
        return n > 0;
      } catch { return false; }
    });
  } catch { return false; }
}

/**
 * Migrate data.json → monthly SQLite files with per-scope progress output.
 * Prints progress to stdout so the user sees it in the terminal while the
 * browser is already served from the data.json fallback.
 */
async function migrateWithProgress(dbMod, outputDir, dataPath) {
  if (!dbMod) return;
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const scopes = Object.entries(data.scopeData || {}).filter(([, s]) => s?.usage);
    if (scopes.length === 0) return;

    const totalEntries = scopes.reduce((sum, [, s]) => sum + (s.usage?.tokenEntries?.length || 0), 0);
    console.log(`oh-my-hi: 이전 데이터 마이그레이션 시작 (${scopes.length}개 워크스페이스, ${totalEntries.toLocaleString()}개 항목)`);

    let doneScopes = 0;
    let doneEntries = 0;
    for (const [scope, sdata] of scopes) {
      dbMod.appendUsageMonthly(outputDir, scope, sdata.usage);
      doneScopes++;
      doneEntries += sdata.usage?.tokenEntries?.length || 0;
      const pct = Math.round((doneScopes / scopes.length) * 100);
      const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
      process.stdout.write(`  [${bar}] ${pct}% — ${doneScopes}/${scopes.length} 워크스페이스 (${doneEntries.toLocaleString()}항목)\r`);
    }
    process.stdout.write(' '.repeat(80) + '\r'); // clear line
    console.log(`oh-my-hi: ✅ 마이그레이션 완료 (${scopes.length}개 워크스페이스, ${doneEntries.toLocaleString()}개 항목)`);
  } catch (e) {
    console.warn('\noh-my-hi: 마이그레이션 실패 —', e.message);
  }
}

/**
 * Write index.html (the dashboard shell — CSS, JS, locales, billboard.js).
 * Only needed on version change or first build. Data is loaded via <script src="data.js">.
 */
function writeHtml(indexPath, systemLocale) {
  const LOCALES_DIR = path.join(TEMPLATES, 'locales');
  const enObj = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf-8'));
  let localeObj = {};
  const localePath = path.join(LOCALES_DIR, systemLocale + '.json');
  if (systemLocale !== 'en' && fs.existsSync(localePath)) {
    try {
      localeObj = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
      localeObj._lang = systemLocale;
      console.log(`  locale: ${systemLocale} (${Object.keys(localeObj).length - 1} keys)`);
    } catch { /* fallback to English */ }
  }
  if (systemLocale !== 'en' && !fs.existsSync(localePath)) {
    fs.mkdirSync(LOCALES_DIR, { recursive: true });
    fs.writeFileSync(localePath, JSON.stringify(enObj, null, 2), 'utf-8');
    console.log(`  locale: created template ${localePath} (translate and rebuild)`);
  }

  const template = fs.readFileSync(path.join(TEMPLATES, 'dashboard.html'), 'utf-8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

  const STATIC_DIR = path.join(path.dirname(indexPath), 'static');
  fs.mkdirSync(STATIC_DIR, { recursive: true });

  // Copy billboard static files only when the billboard.js version changes.
  const bbDir = path.join(ROOT, 'node_modules', 'billboard.js', 'dist');
  if (!fs.existsSync(bbDir)) {
    console.error('oh-my-hi: ❌ node_modules not found. Run `npm install` in', ROOT);
    process.exit(1);
  }
  const bbPkg = JSON.parse(fs.readFileSync(path.join(bbDir, '..', 'package.json'), 'utf-8'));
  const bbVersion = bbPkg.version;
  const bbVersionMarker = path.join(STATIC_DIR, '.bb-version');
  const installedBbVersion = fs.existsSync(bbVersionMarker)
    ? fs.readFileSync(bbVersionMarker, 'utf-8').trim()
    : null;
  if (bbVersion !== installedBbVersion) {
    fs.copyFileSync(path.join(bbDir, 'billboard.pkgd.min.js'), path.join(STATIC_DIR, 'billboard.pkgd.min.js'));
    fs.copyFileSync(path.join(bbDir, 'billboard.min.css'), path.join(STATIC_DIR, 'billboard.min.css'));
    fs.copyFileSync(path.join(bbDir, 'theme', 'dark.min.css'), path.join(STATIC_DIR, 'billboard-dark.min.css'));
    fs.writeFileSync(bbVersionMarker, bbVersion, 'utf-8');
    console.log(`  billboard.js ${bbVersion} → static/`);
  }

  // Build versioned app.js and styles.css. In dev mode always regenerate;
  // otherwise skip if the versioned file already exists (same version = same content).
  const appJsDest = path.join(STATIC_DIR, `app-${pkg.version}.js`);
  const stylesDest = path.join(STATIC_DIR, `styles-${pkg.version}.css`);

  // Pure helper modules that live alongside app.js but are authored as ESM
  // so they can be unit-tested. Strip the `export ` keywords and prepend the
  // code before app.js so the symbols land in the same script scope. Source
  // of truth is the .mjs file — never edit the inlined copy.
  const stripExports = (src) => src.replace(/^export\s+/gm, '');
  const INLINED_MODULES = [
    'session-events.mjs',
    'context-example.mjs',
    'cost-projection.mjs',
    'canvas-bars.mjs',
    'regression.mjs',
    'health-score.mjs',
    'context-optimizer.mjs',
    'session-bookmarks.mjs',
    'cache-ttl.mjs',
  ].map(f => stripExports(fs.readFileSync(path.join(TEMPLATES, f), 'utf-8'))).join('\n');

  const rawAppJs = (INLINED_MODULES + '\n' + fs.readFileSync(path.join(TEMPLATES, 'app.js'), 'utf-8'))
    .replace(/__VERSION__/g, JSON.stringify(pkg.version));

  if (IS_DEV_BUILD || !fs.existsSync(appJsDest)) {
    const appJs = transformSync(rawAppJs, { loader: 'js', minify: true }).code;
    fs.writeFileSync(appJsDest, appJs, 'utf-8');
  }
  if (IS_DEV_BUILD || !fs.existsSync(stylesDest)) {
    const rawStyles = fs.readFileSync(path.join(TEMPLATES, 'styles.css'), 'utf-8');
    const styles = transformSync(rawStyles, { loader: 'css', minify: true }).code;
    fs.writeFileSync(stylesDest, styles, 'utf-8');
  }

  const placeholders = {
    __EN_DATA__: escapeForScript(JSON.stringify(enObj)),
    __LOCALE_DATA__: escapeForScript(JSON.stringify(localeObj)),
    __VERSION__: pkg.version,
  };
  const placeholderRe = new RegExp(Object.keys(placeholders).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const html = template.replace(placeholderRe, (match) => placeholders[match]);

  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log(`oh-my-hi: index.html generated → ${indexPath}`);
}

/**
 * Check if index.html needs rebuild (missing, version mismatch, or template newer than output).
 */
function needsHtmlRebuild(indexPath) {
  // Dev builds always rebuild from templates — mtime shortcuts have caused
  // stale HTML during active template editing, and the extra cost is small.
  if (IS_DEV_BUILD) return true;
  if (!fs.existsSync(indexPath)) return true;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const html = fs.readFileSync(indexPath, 'utf-8');
    if (!html.includes(pkg.version)) return true;
    // Rebuild if versioned static assets are missing
    const staticDir = path.join(path.dirname(indexPath), 'static');
    if (!fs.existsSync(path.join(staticDir, `app-${pkg.version}.js`))) return true;
    if (!fs.existsSync(path.join(staticDir, `styles-${pkg.version}.css`))) return true;
    // Rebuild if any template file is newer than the output
    const outMtime = fs.statSync(indexPath).mtimeMs;
    const templateFiles = ['app.js', 'styles.css', 'dashboard.html', 'session-events.mjs', 'context-example.mjs', 'cost-projection.mjs', 'canvas-bars.mjs', 'regression.mjs', 'health-score.mjs', 'context-optimizer.mjs', 'session-bookmarks.mjs', 'cache-ttl.mjs'].map(f => path.join(TEMPLATES, f));
    return templateFiles.some(f => fs.existsSync(f) && fs.statSync(f).mtimeMs > outMtime);
  } catch { return true; }
}

/** Legacy wrapper — writes both data.js and index.html */
function writeDashboard(data, dataPath, indexPath, systemLocale) {
  writeDataJs(data, dataPath);
  writeHtml(indexPath, systemLocale);
}


/** Collect global scope data (sync parsers + async usage in parallel) */
async function collectScopeData(configDir, { days = 0, cache, cachePath, skipUsage = false } = {}) {
  // Run sync parsers immediately (fast, small files)
  const syncData = {
    configFiles: parseConfigFiles(configDir),
    skills: parseSkills(configDir),
    agents: parseAgents(configDir),
    plugins: parsePlugins(configDir),
    hooks: parseHooks(configDir),
    memory: parseMemory(configDir),
    mcpServers: parseMcpServers(configDir),
    rules: parseRules(configDir),
    principles: parsePrinciples(configDir),
    commands: parseCommands(configDir),
    teams: parseTeams(configDir),
    plans: parsePlans(configDir),
    todos: parseTodos(configDir),
  };

  const usage = skipUsage ? emptyScopeData().usage : await parseUsage(configDir, days, null, { cache, cachePath });

  const contextStats = computeContextStats(syncData, configDir, { type: 'global', configPath: configDir });
  return { ...syncData, contextStats, usage };
}

/** Collect project scope data */
async function collectProjectData(configPath, projectPath, { days = 0, cache, cachePath, skipUsage = false } = {}) {
  const emptyUsage = emptyScopeData().usage;

  // Sync parsers (fast)
  const syncData = {
    configFiles: safeCall(() => parseConfigFiles(configPath, projectPath)),
    skills: safeCall(() => parseSkills(configPath)),
    agents: safeCall(() => parseAgents(configPath)),
    plugins: [],
    hooks: safeCall(() => parseHooks(configPath)),
    memory: safeCall(() => parseMemory(configPath)),
    mcpServers: [],
    rules: safeCall(() => parseRules(configPath)),
    principles: safeCall(() => parsePrinciples(configPath)),
    commands: [],
    teams: [],
    plans: [],
    todos: [],
  };

  let usage = emptyUsage;
  if (!skipUsage) {
    try { usage = await parseUsage(CLAUDE_CONFIG_DIR, days, configPath, { cache, cachePath }); } catch { /* fallback */ }
  }

  const contextStats = computeContextStats(syncData, CLAUDE_CONFIG_DIR, { type: 'project', configPath, projectPath });
  return { ...syncData, contextStats, usage };
}

/**
 * Build task categories by classifying contextNames into work types.
 *
 * Classification is auto-generated at every build:
 *  - contextNames are classified from their description using keyword matching.
 *  - Built-in tools (context='tool') use a fixed structural mapping.
 *  - Category labels come from locale files (taskCat_* keys).
 */
const TASK_CAT_FILE = path.join(OUTPUT, 'task-categories.json');

// Work types loaded from external file (categories, tool mapping, keywords)
const WORK_TYPES = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'work-types.json'), 'utf-8'));
const WORK_TYPE_META = WORK_TYPES.categories;
const TOOL_CATEGORY = WORK_TYPES.toolMapping;
const CAT_KEYWORDS = WORK_TYPES.keywords;

function buildTaskCategories(scopeData, dbContextNames = []) {
  // 1. Collect descriptions from harness data (structure — always available)
  const descMap = {};
  for (const sd of Object.values(scopeData)) {
    for (const s of (sd.skills || [])) {
      if (s.name && s.description) descMap[s.name] = s.description;
    }
    for (const a of (sd.agents || [])) {
      if (a.name && a.description) descMap[a.name] = a.description;
    }
  }

  // 3. Auto-classify each contextName
  function autoClassify(name, contextType) {
    if (contextType === 'tool' && TOOL_CATEGORY[name]) return TOOL_CATEGORY[name];
    if (contextType === 'general') return 'general';

    const text = (name + ' ' + (descMap[name] || '')).toLowerCase();
    let bestCat = null, bestScore = 0;
    for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) score++;
      }
      if (score > bestScore) { bestScore = score; bestCat = cat; }
    }
    return bestCat || 'other';
  }

  // 4. Build mapping: prefer SQLite-queried names (includes contextType), fall back to in-memory
  const mapping = {};
  if (dbContextNames.length > 0) {
    for (const { contextName, contextType } of dbContextNames) {
      const name = contextName || 'conversation';
      if (!mapping[name]) mapping[name] = autoClassify(name, contextType || 'general');
    }
  } else {
    for (const sd of Object.values(scopeData)) {
      for (const e of (sd.usage?.tokenEntries || [])) {
        const name = e.contextName || 'conversation';
        if (mapping[name]) continue;
        mapping[name] = autoClassify(name, e.context || 'general');
      }
    }
  }

  // 5. Save mapping for reference
  const sorted = {};
  for (const key of Object.keys(mapping).sort()) sorted[key] = mapping[key];
  fs.writeFileSync(TASK_CAT_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`  task-categories: ${Object.keys(sorted).length} items → ${TASK_CAT_FILE}`);

  return { mapping, meta: WORK_TYPE_META };
}

/** Empty scope data */
function emptyScopeData() {
  return {
    configFiles: [], skills: [], agents: [], plugins: [], hooks: [],
    memory: [], mcpServers: [], rules: [], principles: [],
    commands: [], teams: [], plans: [], todos: [],
    contextStats: null,
    usage: { commands: [], skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [], dailyActivity: [] },
  };
}

/**
 * Rough token estimator for the context explorer.
 * ASCII alphanumeric/space ~4 chars/tok, ASCII punctuation ~2 chars/tok (often
 * individual tokens in code), non-ASCII (CJK etc) ~1.5 chars/tok.
 */
function estimateTokens(text) {
  if (!text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 128) { n += 0.65; }
    else if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 32 || code === 10 || code === 9) { n += 0.25; }
    else { n += 0.5; }
  }
  return Math.round(n);
}

/** Compute real stats for the context explorer for one scope. */
function computeContextStats(scopeData, globalConfigDir, scope) {
  // Global CLAUDE.md: always read from the global config dir so project scopes see it too.
  let globalClaudeTokens = 0;
  try {
    const gp = path.join(globalConfigDir, 'CLAUDE.md');
    if (fs.existsSync(gp)) globalClaudeTokens = estimateTokens(fs.readFileSync(gp, 'utf-8'));
  } catch { /* ignore */ }

  // Project CLAUDE.md: sum all project-scope config files (project root + .claude/ subdir).
  let projectClaudeTokens = 0;
  if (scope.type === 'project') {
    for (const f of (scopeData.configFiles || [])) {
      if (f.scope === 'project' && f.body &&
          (f.name === 'CLAUDE.md' || f.name === 'CLAUDE.md (project)' || f.name === 'CLAUDE.md (.claude)' ||
           f.name === 'AGENTS.md' || f.name === 'AGENTS.md (project)' || f.name === 'AGENTS.md (.claude)')) {
        projectClaudeTokens += estimateTokens(f.body);
      }
    }
    // Also walk parent directories up to HOME for CLAUDE.md / AGENTS.md.
    // Claude Code loads instruction files from every ancestor directory up to the home dir.
    if (scope.projectPath) {
      const homeDir = process.env.HOME || '';
      let dir = path.dirname(scope.projectPath);
      while (dir && dir !== homeDir && dir !== path.dirname(dir)) {
        for (const name of ['CLAUDE.md', 'AGENTS.md']) {
          const fp = path.join(dir, name);
          try {
            if (fs.existsSync(fp)) projectClaudeTokens += estimateTokens(fs.readFileSync(fp, 'utf-8'));
          } catch { /* skip */ }
        }
        dir = path.dirname(dir);
      }
    }
  }

  // Auto memory (MEMORY.md) — only exists for project scopes under configPath/memory/MEMORY.md.
  let autoMemoryTokens = 0;
  if (scope.type === 'project' && scope.configPath) {
    try {
      const mp = path.join(scope.configPath, 'memory', 'MEMORY.md');
      if (fs.existsSync(mp)) autoMemoryTokens = estimateTokens(fs.readFileSync(mp, 'utf-8'));
    } catch { /* ignore */ }
  }

  // Skill descriptions: the startup context holds one-liners per skill. Sum description tokens.
  const skills = scopeData.skills || [];
  let skillsDescTokens = 0;
  for (const s of skills) {
    if (s.description) skillsDescTokens += estimateTokens(s.description);
  }
  // Add a small per-skill framing overhead (~10 tokens) to match observed context cost.
  skillsDescTokens += skills.length * 10;

  // MCP tool listing (deferred): estimate ~50 tokens per server (server name + typical tool names).
  // Actual cost depends on the number of tools each server exposes, which isn't known at build time.
  const mcpServersCount = (scopeData.mcpServers || []).length;
  const mcpToolsTokens = mcpServersCount * 50;

  // Principles: always-on instruction files loaded alongside CLAUDE.md at startup.
  const principles = scopeData.principles || [];
  let principlesTokens = 0;
  for (const p of principles) {
    if (p.body) principlesTokens += estimateTokens(p.body);
  }

  return {
    globalClaudeTokens,
    projectClaudeTokens,
    autoMemoryTokens,
    skillsCount: skills.length,
    skillsDescTokens,
    mcpServersCount,
    mcpToolsTokens,
    principlesTokens,
    scopeType: scope.type,
  };
}

/** Safe call wrapper (ignores errors) */
function safeCall(fn) {
  try { return fn(); } catch { return []; }
}


/** Spawn serve.mjs as a detached background process, or reuse if already running.
 *  Returns the server URL once the lock file is written.
 *
 *  Browser open policy (ABSOLUTE RULE — do not change):
 *  - True first launch (no prior lock file): open browser once via --open.
 *  - Server restart (stale lock file, dead pid): start server WITHOUT --open.
 *    The user's browser already has the tab; opening again creates unwanted new tabs.
 *  - Server already alive: return URL immediately, no browser action. */
async function spawnServeOrRefresh() {
  const LOCK = path.join(OUTPUT, 'cache', '.serve.json');

  // Case 1: server alive → reuse port, do not open browser
  if (fs.existsSync(LOCK)) {
    try {
      const { port, pid } = JSON.parse(fs.readFileSync(LOCK, 'utf-8'));
      process.kill(pid, 0); // throws if dead
      return `http://127.0.0.1:${port}`;
    } catch {
      // Stale lock file (server crashed/killed) — clean up and restart WITHOUT --open.
      // Browser already has the tab from the previous session.
      try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
      return spawnServe(LOCK, { open: false });
    }
  }

  // Case 2: no lock file — true first launch, open browser once
  return spawnServe(LOCK, { open: true });
}

async function spawnServe(lockPath, { open }) {
  const serveScript = path.join(ROOT, 'scripts', 'serve.mjs');
  const serveArgs = open ? [serveScript, '--open'] : [serveScript];
  spawn(process.execPath, serveArgs, { detached: true, stdio: 'ignore' }).unref();

  // Wait up to 3s for serve.mjs to write the lock file
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      if (fs.existsSync(lockPath)) {
        const { port } = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        return `http://127.0.0.1:${port}`;
      }
    } catch { /* retry */ }
  }
  return `http://127.0.0.1:8282`; // preferred port fallback
}

if (!args.includes('--update')) {
  main().catch(err => { console.error(err); process.exit(1); });
}
