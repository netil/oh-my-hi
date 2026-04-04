#!/usr/bin/env node
// generate-dashboard.mjs — oh-my-hi dashboard generator
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

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
import { parseUsage, loadTranscriptCache, saveTranscriptCache, savePending, mergePending, hasPending, loadMtimeIndex, saveMtimeIndex } from './parsers/usage.mjs';
import { detectScopes } from './parsers/scopes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const OUTPUT = path.join(ROOT, 'output');

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
    execSync(`claude plugin update ${pkg.name}@${marketplace}`, { stdio: 'inherit' });
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

  // ── Migration detection ──
  const dataJsPath = path.join(OUTPUT, 'data.js');
  const needsMigration = fs.existsSync(dataPath) && !fs.existsSync(dataJsPath);
  const needsVersionUpdate = needsHtmlRebuild(indexPath);

  if (needsMigration || needsVersionUpdate) {
    console.log('oh-my-hi: data structure changed — rebuilding (one-time)...');
  }

  // ── Lightweight mode (--data-only, triggered by Stop hook) ──
  // Parse changed files, update data.js for browser, save pending for cache.
  if (dataOnly) {
    if (!needsMigration && !needsVersionUpdate) {
      console.log('oh-my-hi: collecting data (lightweight)...');
    }

    // Load mtime index (tiny file) instead of full cache
    const mtimeIndex = loadMtimeIndex(CACHE_PATH);
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

    // Save as pending + update mtime index
    savePending(CACHE_PATH, cache);
    saveMtimeIndex(CACHE_PATH, cache);

    // Build index.html if missing or version changed
    if (needsHtmlRebuild(indexPath)) {
      writeHtml(indexPath, detectSystemLocale());
    }

    // Update data.js by merging new entries into existing data.json
    const dataJsPath = path.join(OUTPUT, 'data.js');
    const dataJsMissing = !fs.existsSync(dataJsPath);

    if ((parsed > 0 || dataJsMissing) && fs.existsSync(dataPath)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        // Merge new usage entries from freshly parsed files
        if (parsed > 0) {
          for (const [key, entry] of Object.entries(cache)) {
            if (key.startsWith('_') || !entry?._new || !entry.result) continue;
            const r = entry.result;
            const globalUsage = existingData.scopeData?.global?.usage;
            if (globalUsage) {
              for (const field of ['skills', 'agents', 'mcpCalls', 'tokenEntries', 'promptStats', 'latencyEntries']) {
                if (r[field]?.length) globalUsage[field].push(...r[field]);
              }
            }
          }
        }
        existingData.generatedAt = new Date().toISOString();
        writeDataJs(existingData, dataPath);
        console.log('  data.js updated');
      } catch { /* skip — full rebuild on next /omh */ }
    }

    console.log('oh-my-hi: done (lightweight)');
    return;
  }

  // ── Full mode (user-initiated /omh) ──
  const scopes = detectScopes(CLAUDE_CONFIG_DIR, extraPaths);
  const systemLocale = detectSystemLocale();

  // Check cache state to decide progressive mode
  const cacheDirPath = path.join(OUTPUT, 'cache');
  const cacheExists = fs.existsSync(CACHE_PATH) || fs.existsSync(cacheDirPath);
  const pendingExists = hasPending(CACHE_PATH);

  // Rebuild index.html only when needed (first run or version change)
  if (needsHtmlRebuild(indexPath)) {
    writeHtml(indexPath, systemLocale);
  }

  if (!cacheExists && !pendingExists) {
    // Progressive mode: no cache at all (first run)
    console.log('oh-my-hi: first run — generating dashboard from scratch...');
    console.log(`  [1/4] scanning ${scopes.length} workspace(s)...`);

    const cache = {};
    console.log('  [2/4] building 7-day preview...');
    const phase1ScopeData = await collectAllScopes(scopes, { days: 7, cache, progress: true });
    const phase1Data = buildDataObject(scopes, phase1ScopeData, systemLocale, { _partial: true });
    writeDataJs(phase1Data, dataPath);

    console.log('  [3/4] opening browser with preview...');
    openOrRefreshBrowser(indexPath);

    console.log('  [4/4] loading full history (this may take a moment)...');
    const phase2ScopeData = await collectAllScopes(scopes, { days: 0, cache, cachePath: CACHE_PATH, progress: true });
    const phase2Data = buildDataObject(scopes, phase2ScopeData, systemLocale, { _firstRun: true, _dateRange: computeDateRange(phase2ScopeData) });
    writeDataJs(phase2Data, dataPath);
    openOrRefreshBrowser(indexPath);
  } else {
    // Normal mode: load cache + merge pending + full data
    console.log('oh-my-hi: collecting data...');
    console.log(`  [1/3] scanning ${scopes.length} workspace(s)...`);
    const scopeData = await collectAllScopes(scopes, { days: 0, cachePath: CACHE_PATH, progress: true });
    console.log('  [2/3] building dashboard...');
    const data = buildDataObject(scopes, scopeData, systemLocale, { _dateRange: computeDateRange(scopeData) });
    writeDataJs(data, dataPath);
    console.log('  [3/3] opening browser...');
    openOrRefreshBrowser(indexPath);
  }

  console.log('oh-my-hi: ✅ done');

  // Auto-refresh status notice
  const settings = readSettings();
  if (!hasAutoHook(settings)) {
    console.log('');
    console.log('oh-my-hi: ⚠️ Auto data refresh is not configured.');
    console.log('  → Enable auto-refresh on session end: /omh --enable-auto');
    console.log('  → Manual refresh:                     /omh --data-only');
  }

  // Async update check (non-blocking, result awaited at end)
  await checkForUpdate();
}

/** Check GitHub tags for newer version (non-blocking, cached for 24h) */
async function checkForUpdate() {
  const UPDATE_CHECK_FILE = path.join(OUTPUT, 'cache', '.update-check');
  try {
    // Skip if checked within last 24 hours
    if (fs.existsSync(UPDATE_CHECK_FILE)) {
      const lastCheck = JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, 'utf8'));
      if (Date.now() - lastCheck.timestamp < 24 * 60 * 60 * 1000) {
        if (lastCheck.latest && semverGt(lastCheck.latest, lastCheck.current)) {
          console.log(`\noh-my-hi: ✨ v${lastCheck.latest} available (current: v${lastCheck.current})`);
          console.log('  → Update: /omh --update');
        }
        return;
      }
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const current = pkg.version;
    let latest = null;

    // Check GitHub tags first (primary distribution channel)
    const repoUrl = pkg.repository?.url || '';
    const ghMatch = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (ghMatch) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`https://api.github.com/repos/${ghMatch[1]}/tags`, {
        signal: controller.signal, headers: { 'Accept': 'application/vnd.github+json' },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const tags = await res.json();
        for (const tag of tags) {
          const v = tag.name.replace(/^v/, '');
          if (/^\d+\.\d+\.\d+$/.test(v) && (!latest || semverGt(v, latest))) latest = v;
        }
      }
    }

    // Fallback to npm registry
    if (!latest) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, {
        signal: controller.signal, headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        latest = data.version;
      }
    }

    if (!latest) return;

    // Cache the result
    fs.mkdirSync(path.dirname(UPDATE_CHECK_FILE), { recursive: true });
    fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify({ timestamp: Date.now(), current, latest }), 'utf8');

    if (semverGt(latest, current)) {
      console.log(`\noh-my-hi: ✨ v${latest} available (current: v${current})`);
      console.log('  → Update: /omh --update');
    }
  } catch { /* offline or error — silently skip */ }
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
async function collectAllScopes(scopes, { days = 0, cache, cachePath, progress = false } = {}) {
  const projectScopes = scopes.filter(s => s.type !== 'global');
  // Load or reuse cache; reset parse counter for this collection round
  const sharedCache = cache || (cachePath ? loadTranscriptCache(cachePath) : {});

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

  const usageOpts = { days, cache: sharedCache, cachePath };

  const [globalData, ...projectResults] = await Promise.all([
    collectScopeData(CLAUDE_CONFIG_DIR, usageOpts),
    ...projectScopes.map(scope =>
      !fs.existsSync(scope.configPath)
        ? Promise.resolve({ id: scope.id, data: emptyScopeData() })
        : collectProjectData(scope.configPath, scope.projectPath, usageOpts).then(data => ({ id: scope.id, data }))
    ),
  ]);

  // Save cache once after all concurrent parseUsage calls complete
  // This also consolidates any pending entries merged above into compressed segments
  // Always attempt save — saveTranscriptCache internally checks for _new entries
  if (cachePath) saveTranscriptCache(cachePath, sharedCache);
  // Update mtime index for lightweight mode
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
  return scopeData;
}

/** Build data object from scope data (strips internal _cacheStats) */
/** Compute min/max date range from all tokenEntries across all scopes */
function computeDateRange(scopeData) {
  let minTs = null, maxTs = null;
  for (const sdata of Object.values(scopeData)) {
    for (const entry of (sdata?.usage?.tokenEntries || [])) {
      const ts = entry.timestamp;
      if (!ts) continue;
      if (!minTs || ts < minTs) minTs = ts;
      if (!maxTs || ts > maxTs) maxTs = ts;
    }
  }
  return minTs && maxTs ? { from: minTs, to: maxTs } : null;
}

function buildDataObject(scopes, scopeData, systemLocale, extra = {}) {
  // Strip _cacheStats from usage data before building output
  const cleanScopeData = {};
  for (const [key, sdata] of Object.entries(scopeData)) {
    if (sdata.usage?._cacheStats) {
      const { _cacheStats, ...cleanUsage } = sdata.usage;
      cleanScopeData[key] = { ...sdata, usage: cleanUsage };
    } else {
      cleanScopeData[key] = sdata;
    }
  }
  const taskCategories = buildTaskCategories(cleanScopeData);
  // 스크립트가 ~/.claude 하위(플러그인)에서 실행되면 배포본, 그 외는 dev
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const isDevBuild = !scriptDir.startsWith(CLAUDE_CONFIG_DIR);
  return {
    scopes,
    scopeData: cleanScopeData,
    taskCategories,
    generatedAt: new Date().toISOString(),
    configDir: CLAUDE_CONFIG_DIR,
    systemLocale,
    _devBuild: isDevBuild || undefined,
    ...extra,
  };
}

// ── Minify usage data for browser (key shortening + sessionId indexing) ──
const USAGE_KEY_MAP = {
  timestamp: 'ts', model: 'm', inputTokens: 'it', outputTokens: 'ot',
  cacheRead: 'cr', cacheCreation: 'cc', rawInput: 'ri', context: 'cx',
  contextName: 'cn', sessionId: 'sid', latencyMs: 'ms', charLen: 'cl',
  name: 'n', tool: 't', count: 'c', date: 'd', command: 'cmd', project: 'p',
  messageCount: 'mc', sessionCount: 'sc', toolCallCount: 'tc',
};

function minifyUsageData(scopeDataObj) {
  const result = {};
  for (const [scope, sdata] of Object.entries(scopeDataObj)) {
    const copy = { ...sdata };
    if (copy.usage) {
      const u = copy.usage;
      const sidSet = new Set();
      for (const arr of Object.values(u)) {
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          if (item.sessionId != null) sidSet.add(item.sessionId);
        }
      }
      const sidList = [...sidSet];
      const sidIndex = Object.fromEntries(sidList.map((s, i) => [s, i]));
      const minUsage = {};
      for (const [field, arr] of Object.entries(u)) {
        if (!Array.isArray(arr)) { minUsage[field] = arr; continue; }
        minUsage[field] = arr.map(item => {
          const obj = {};
          for (const [k, v] of Object.entries(item)) {
            if (k === 'sessionId') obj.sid = v != null ? sidIndex[v] : null;
            else obj[USAGE_KEY_MAP[k] || k] = v;
          }
          return obj;
        });
      }
      minUsage._sidList = sidList;
      copy.usage = minUsage;
    }
    result[scope] = copy;
  }
  return result;
}

const escapeForScript = (str) => str
  .replaceAll('</', String.raw`<\u002f`)
  .replaceAll('\u2028', String.raw`\u2028`)
  .replaceAll('\u2029', String.raw`\u2029`);

/**
 * Write data.js (minified data for browser) + data.json (full data for programmatic access).
 * This is the lightweight operation — no template processing, no esbuild.
 */
function writeDataJs(data, dataPath) {
  // data.json — full data for programmatic access
  fs.writeFileSync(dataPath, JSON.stringify(data), 'utf-8');

  // data.js — minified data for browser (<script src="data.js">)
  const inlineData = { ...data, scopeData: minifyUsageData(data.scopeData), _minified: true };
  const dataJsPath = path.join(path.dirname(dataPath), 'data.js');
  fs.writeFileSync(dataJsPath, 'let DATA = ' + escapeForScript(JSON.stringify(inlineData)) + ';', 'utf-8');
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
  const rawStyles = fs.readFileSync(path.join(TEMPLATES, 'styles.css'), 'utf-8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const rawAppJs = fs.readFileSync(path.join(TEMPLATES, 'app.js'), 'utf-8')
    .replace(/__VERSION__/g, JSON.stringify(pkg.version));

  const bbDir = path.join(ROOT, 'node_modules', 'billboard.js', 'dist');
  if (!fs.existsSync(bbDir)) {
    console.error('oh-my-hi: ❌ node_modules not found. Run `npm install` in', ROOT);
    process.exit(1);
  }
  const bbJs = fs.readFileSync(path.join(bbDir, 'billboard.pkgd.min.js'), 'utf-8');
  const bbCss = fs.readFileSync(path.join(bbDir, 'billboard.min.css'), 'utf-8');
  const bbDarkCss = fs.readFileSync(path.join(bbDir, 'theme', 'dark.min.css'), 'utf-8');

  const styles = transformSync(rawStyles, { loader: 'css', minify: true }).code;
  const appJs = transformSync(rawAppJs, { loader: 'js', minify: true }).code;

  const placeholders = {
    __BB_CSS__: bbCss,
    __BB_DARK_CSS_STR__: JSON.stringify(bbDarkCss),
    __BB_JS__: bbJs,
    __STYLES__: styles,
    __EN_DATA__: escapeForScript(JSON.stringify(enObj)),
    __LOCALE_DATA__: escapeForScript(JSON.stringify(localeObj)),
    __APP_JS__: appJs,
    __VERSION__: pkg.version,
  };
  const placeholderRe = new RegExp(Object.keys(placeholders).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const html = template.replace(placeholderRe, (match) => placeholders[match]);

  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log(`oh-my-hi: index.html generated → ${indexPath}`);
}

/**
 * Check if index.html needs rebuild (missing or version mismatch).
 */
function needsHtmlRebuild(indexPath) {
  if (!fs.existsSync(indexPath)) return true;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const html = fs.readFileSync(indexPath, 'utf-8');
    return !html.includes(pkg.version);
  } catch { return true; }
}

/** Legacy wrapper — writes both data.js and index.html */
function writeDashboard(data, dataPath, indexPath, systemLocale) {
  writeDataJs(data, dataPath);
  writeHtml(indexPath, systemLocale);
}

/** Open browser tab or refresh if already open */
function openOrRefreshBrowser(filePath) {
  // Windows / Linux: open only (no tab reuse)
  if (process.platform === 'win32') {
    try { execSync(`start "" "${filePath}"`, { shell: true }); } catch {
      console.log('Please open manually in your browser:', filePath);
    }
    return;
  }
  if (process.platform !== 'darwin') {
    try { execSync(`xdg-open "${filePath}"`); } catch {
      console.log('Please open manually in your browser:', filePath);
    }
    return;
  }

  // macOS: try tab reuse via AppleScript, fallback to open

  const fileUrl = 'file://' + filePath.replace(/ /g, '%20');
  const needle = 'oh-my-hi';

  // Try Chrome first, then Safari, then fallback to open
  const chromeScript = `
    tell application "System Events"
      if not (exists process "Google Chrome") then return "not_running"
    end tell
    tell application "Google Chrome"
      set i to 0
      repeat with w in windows
        set j to 0
        repeat with t in tabs of w
          set j to j + 1
          if URL of t contains "${needle}" then
            tell t to reload
            set active tab index of w to j
            set index of w to 1
            activate
            return "refreshed"
          end if
        end repeat
      end repeat
      return "not_found"
    end tell`;

  const safariScript = `
    tell application "System Events"
      if not (exists process "Safari") then return "not_running"
    end tell
    tell application "Safari"
      repeat with w in windows
        repeat with t in tabs of w
          if URL of t contains "${needle}" then
            set URL of t to "${fileUrl}"
            set current tab of w to t
            set index of w to 1
            activate
            return "refreshed"
          end if
        end repeat
      end repeat
      return "not_found"
    end tell`;

  try {
    const chromeResult = execSync(`osascript -e '${chromeScript.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' }).trim();
    if (chromeResult === 'refreshed') return;
    if (chromeResult === 'not_found') {
      execSync(`open -a "Google Chrome" "${filePath}"`);
      return;
    }
  } catch { /* Chrome not available */ }

  try {
    const safariResult = execSync(`osascript -e '${safariScript.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' }).trim();
    if (safariResult === 'refreshed') return;
    if (safariResult === 'not_found') {
      execSync(`open -a "Safari" "${filePath}"`);
      return;
    }
  } catch { /* Safari not available */ }

  // Fallback
  try { execSync(`open "${filePath}"`); } catch {
    console.log('Please open manually in your browser:', filePath);
  }
}

/** Collect global scope data (sync parsers + async usage in parallel) */
async function collectScopeData(configDir, { days = 0, cache, cachePath } = {}) {
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

  // Async usage parser runs concurrently with sync parsers' setup
  const usage = await parseUsage(configDir, days, null, { cache, cachePath });

  return { ...syncData, usage };
}

/** Collect project scope data */
async function collectProjectData(configPath, projectPath, { days = 0, cache, cachePath } = {}) {
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

  // Async usage parser
  let usage;
  try { usage = await parseUsage(CLAUDE_CONFIG_DIR, days, configPath, { cache, cachePath }); } catch { usage = emptyUsage; }

  return { ...syncData, usage };
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

function buildTaskCategories(scopeData) {
  // 1. Collect descriptions from harness data
  const descMap = {};
  for (const sd of Object.values(scopeData)) {
    for (const s of (sd.skills || [])) {
      if (s.name && s.description) descMap[s.name] = s.description;
    }
    for (const a of (sd.agents || [])) {
      if (a.name && a.description) descMap[a.name] = a.description;
    }
  }

  // 2. Collect all contextNames from token data
  const allNames = new Set();
  for (const sd of Object.values(scopeData)) {
    for (const e of (sd.usage?.tokenEntries || [])) {
      allNames.add(e.contextName || 'conversation');
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

  // 4. Build mapping: auto-classify all contextNames
  const mapping = {};
  for (const sd of Object.values(scopeData)) {
    for (const e of (sd.usage?.tokenEntries || [])) {
      const name = e.contextName || 'conversation';
      if (mapping[name]) continue;
      mapping[name] = autoClassify(name, e.context || 'general');
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
    usage: { commands: [], skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [], dailyActivity: [] },
  };
}

/** Safe call wrapper (ignores errors) */
function safeCall(fn) {
  try { return fn(); } catch { return []; }
}

if (!args.includes('--update')) {
  main().catch(err => { console.error(err); process.exit(1); });
}
