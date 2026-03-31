#!/usr/bin/env node
// generate-dashboard.mjs — oh-my-hi dashboard generator
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

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
import { parseUsage } from './parsers/usage.mjs';
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
  oh-my-hi --data-only        Data-only refresh (fast reload)
  oh-my-hi --enable-auto      Enable auto data refresh on session end
  oh-my-hi --disable-auto     Disable auto data refresh
  oh-my-hi --status           Check auto-refresh status
  oh-my-hi <path> [path...]   Include specified projects only
  oh-my-hi --help             Show help`);
  process.exit(0);
}

// ── Auto-refresh hook management ──
const SETTINGS_PATH = path.join(CLAUDE_CONFIG_DIR, 'settings.json');
const AUTO_HOOK_CMD = `node "${path.join(ROOT, 'scripts', 'generate-dashboard.mjs')}" --data-only`;

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

async function main() {
  console.log('oh-my-hi: collecting data...');

  // 1) Detect scopes
  const scopes = detectScopes(CLAUDE_CONFIG_DIR, extraPaths);
  console.log(`  scopes: ${scopes.length} detected`);

  // 2) Collect global data + per-project data in parallel
  const projectScopes = scopes.filter(s => s.type !== 'global');

  const [globalData, ...projectResults] = await Promise.all([
    collectScopeData(CLAUDE_CONFIG_DIR),
    ...projectScopes.map(scope =>
      !fs.existsSync(scope.configPath)
        ? Promise.resolve({ id: scope.id, data: emptyScopeData() })
        : collectProjectData(scope.configPath, scope.projectPath).then(data => ({ id: scope.id, data }))
    ),
  ]);
  console.log(`  global: ${globalData.skills.length} skills, ${globalData.agents.length} agents, ${globalData.plugins.length} plugins`);

  // 3) Assemble scope data
  const scopeData = { global: globalData };
  for (const result of projectResults) {
    scopeData[result.id] = result.data;
  }

  // 4) Detect system locale (macOS: AppleLanguages first, others: LANG env var)
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

  // 5) Ensure output directory exists before writing task-categories
  fs.mkdirSync(OUTPUT, { recursive: true });

  // 5a) Build task categories dynamically from token data
  const taskCategories = buildTaskCategories(scopeData);

  // 6) Build full data object
  const data = {
    scopes,
    scopeData,
    taskCategories,
    generatedAt: new Date().toISOString(),
    configDir: CLAUDE_CONFIG_DIR,
    systemLocale,
  };
  const dataOnly = args.includes('--data-only');
  const indexPath = path.join(OUTPUT, 'index.html');
  const dataPath = path.join(OUTPUT, 'data.json');

  // 5a) data.json — always generated (for programmatic access)
  const safeJson = JSON.stringify(data);
  fs.writeFileSync(dataPath, safeJson, 'utf-8');

  // 5b) Load locale for system language
  const LOCALES_DIR = path.join(TEMPLATES, 'locales');
  let localeObj = {};
  const localePath = path.join(LOCALES_DIR, systemLocale + '.json');
  if (systemLocale !== 'en' && fs.existsSync(localePath)) {
    try {
      localeObj = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
      localeObj._lang = systemLocale;
      console.log(`  locale: ${systemLocale} (${Object.keys(localeObj).length - 1} keys)`);
    } catch { /* fallback to English */ }
  }
  // For unknown locales: generate English template file on first run
  if (systemLocale !== 'en' && !fs.existsSync(localePath)) {
    const enKeys = {};
    const appSrc = fs.readFileSync(path.join(TEMPLATES, 'app.js'), 'utf-8');
    const enMatch = appSrc.match(/I18N\.en\s*=\s*\{([\s\S]*?)\n  \};/);
    if (enMatch) {
      for (const line of enMatch[1].split('\n')) {
        const m = line.match(/^\s*(\w+):\s*"(.*)"/);
        if (m) enKeys[m[1]] = m[2];
      }
    }
    fs.mkdirSync(LOCALES_DIR, { recursive: true });
    fs.writeFileSync(localePath, JSON.stringify(enKeys, null, 2), 'utf-8');
    console.log(`  locale: created template ${localePath} (translate and rebuild)`);
  }

  // 5c) index.html — always regenerated (data is inlined for file:// compatibility)
  const template = fs.readFileSync(path.join(TEMPLATES, 'dashboard.html'), 'utf-8');
  const styles = fs.readFileSync(path.join(TEMPLATES, 'styles.css'), 'utf-8');
  const appJs = fs.readFileSync(path.join(TEMPLATES, 'app.js'), 'utf-8');

  const escapeForScript = (str) => str
    .replaceAll('</', String.raw`<\u002f`)
    .replaceAll('\u2028', String.raw`\u2028`)
    .replaceAll('\u2029', String.raw`\u2029`);

  const escapedJson = escapeForScript(safeJson);
  const escapedLocale = escapeForScript(JSON.stringify(localeObj));

  // Use a single-pass replacer to avoid cross-contamination when data payloads
  // contain placeholder-like strings (e.g. __LOCALE_DATA__ inside skill descriptions).
  const placeholders = {
    __STYLES__: styles,
    __LOCALE_DATA__: escapedLocale,
    __APP_JS__: appJs,
    __DATA__: escapedJson,
  };
  const placeholderRe = new RegExp(Object.keys(placeholders).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const html = template.replace(placeholderRe, (match) => placeholders[match]);

  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log(`oh-my-hi: index.html generated → ${indexPath}`);

  console.log(`oh-my-hi: done`);

  // Auto-refresh status notice (on first run or full build)
  if (!dataOnly) {
    const settings = readSettings();
    if (!hasAutoHook(settings)) {
      console.log('');
      console.log('oh-my-hi: ⚠️ Auto data refresh is not configured.');
      console.log('  → Enable auto-refresh on session end: /omh --enable-auto');
      console.log('  → Manual refresh:                     /omh --data-only');
    }
  }

  // Open/refresh browser (skip for --status and --disable-auto)
  openOrRefreshBrowser(indexPath);
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
async function collectScopeData(configDir) {
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
  const usage = await parseUsage(configDir, 0);

  return { ...syncData, usage };
}

/** Collect project scope data */
async function collectProjectData(configPath, projectPath) {
  const emptyUsage = { commands: [], skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [], dailyActivity: [] };

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
  try { usage = await parseUsage(CLAUDE_CONFIG_DIR, 0, configPath); } catch { usage = emptyUsage; }

  return { ...syncData, usage };
}

/**
 * Build task categories by classifying contextNames into work types.
 *
 * Classification is persisted in task-categories.json:
 *  - Existing entries are preserved (user can edit the file to override).
 *  - New contextNames are auto-classified from their description at build time.
 *  - Built-in tools (context='tool') use a fixed structural mapping.
 */
const TASK_CAT_FILE = path.join(OUTPUT, 'task-categories.json');

// Category schema — universal work types (fixed structure)
const WORK_TYPE_META = {
  'code-edit':   { icon: '✏️', ko: '코드 편집',       en: 'Code Editing' },
  'code-search': { icon: '🔍', ko: '코드 탐색',       en: 'Code Search' },
  'execution':   { icon: '▶️', ko: '실행 / 디버깅',    en: 'Execution & Debug' },
  'review':      { icon: '🔎', ko: '코드 리뷰',       en: 'Code Review' },
  'planning':    { icon: '📐', ko: '설계 / 계획',      en: 'Planning & Design' },
  'docs':        { icon: '📝', ko: '문서 작성',        en: 'Documentation' },
  'browser':     { icon: '🌐', ko: '브라우저',         en: 'Browser Automation' },
  'workflow':    { icon: '⚙️', ko: '워크플로 자동화',    en: 'Workflow Automation' },
  'team':        { icon: '👥', ko: '팀 관리',          en: 'Team Management' },
  'config':      { icon: '🔧', ko: '설정 / 유지보수',   en: 'Config & Maintenance' },
  'general':     { icon: '💬', ko: '일반 대화',        en: 'General' },
  'other':       { icon: '📦', ko: '기타',            en: 'Other' },
};

// Built-in tool → category (structural, not user data)
const TOOL_CATEGORY = {
  Edit: 'code-edit', Write: 'code-edit', NotebookEdit: 'code-edit',
  Read: 'code-search', Grep: 'code-search', Glob: 'code-search',
  LSP: 'code-search', ToolSearch: 'code-search', Explore: 'code-search',
  AskUserQuestion: 'code-search',
  Bash: 'execution',
  EnterPlanMode: 'planning', ExitPlanMode: 'planning', Plan: 'planning',
  TaskCreate: 'planning', TaskUpdate: 'planning', TaskOutput: 'planning', TaskStop: 'planning',
  TeamCreate: 'team', TeamDelete: 'team', SendMessage: 'team',
  WebFetch: 'browser', WebSearch: 'browser',
};

// Category keyword seeds — used ONLY for auto-classifying new items
const CAT_KEYWORDS = {
  'review':   ['review', 'lint', 'simplif', '리뷰', '검수', '검토'],
  'planning': ['plan', 'design', 'architect', 'brainstorm', '계획', '설계', '기획'],
  'docs':     ['doc', 'report', 'meeting', 'wiki', 'publish', 'humaniz', 'summary', '문서', '회의', '보고', '정리', '요약', '작성', '기술공유', '기록'],
  'browser':  ['browser', 'chrome', 'scrape', 'page', '브라우저'],
  'workflow': ['workflow', 'n8n', 'cron', 'schedule', '자동화', '워크플로'],
  'team':     ['team', 'leader', 'manager', '팀', '매니저'],
  'config':   ['config', 'setting', 'setup', 'hook', 'plugin', 'health', 'improve', 'skill-creator', '설정', '개선'],
  'execution':['debug', 'test', 'exec', 'build', 'implement', '디버그', '실행', '테스트', '구현'],
};

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

  // 2. Load existing persistent mapping (user overrides preserved)
  let persisted = {};
  try {
    persisted = JSON.parse(fs.readFileSync(TASK_CAT_FILE, 'utf-8'));
  } catch { /* first run or missing file */ }

  // 3. Collect all contextNames from token data
  const allNames = new Set();
  for (const sd of Object.values(scopeData)) {
    for (const e of (sd.usage?.tokenEntries || [])) {
      allNames.add(e.contextName || 'conversation');
    }
  }

  // 4. Auto-classify items not in persisted mapping
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

  // 5. Build final mapping: persisted → auto-classified → tool mapping
  const mapping = {};
  for (const sd of Object.values(scopeData)) {
    for (const e of (sd.usage?.tokenEntries || [])) {
      const name = e.contextName || 'conversation';
      if (mapping[name]) continue;

      if (persisted[name]) {
        mapping[name] = persisted[name];
      } else {
        mapping[name] = autoClassify(name, e.context || 'general');
      }
    }
  }

  // 6. Save updated mapping to file (user-editable)
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
    usage: { commands: [], skills: [], agents: [], dailyActivity: [] },
  };
}

/** Safe call wrapper (ignores errors) */
function safeCall(fn) {
  try { return fn(); } catch { return []; }
}

main().catch(err => { console.error(err); process.exit(1); });
