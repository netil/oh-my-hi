#!/usr/bin/env node
// @ts-check
// serve.mjs — local HTTP server for oh-my-hi dashboard.
//
// Serves output/ as static files and exposes two API endpoints backed by
// the SQLite snapshot written by generate-dashboard.mjs:
//   GET /api/meta         — data.json with usage arrays stripped + segment index
//   GET /api/usage?...    — queried usage payload from SQLite

import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
// Dev build: templates can change without version bump, so don't use immutable cache.
const IS_DEV_BUILD = (() => {
  try {
    if (!fs.existsSync(path.join(ROOT, '.git'))) return false;
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    return pkg.name === 'oh-my-hi';
  } catch { return false; }
})();
const LEGACY_DB_PATH = path.join(OUTPUT_DIR, 'oh-my-hi.sqlite');
const DATA_JSON = path.join(OUTPUT_DIR, 'data.json');
const CACHE_DIR = path.join(OUTPUT_DIR, 'cache');
const LOCK_FILE = path.join(CACHE_DIR, '.serve.json');

// Load the db module lazily — static file serving works even without SQLite.
let dbModule = null;
try {
  dbModule = await import('./db.mjs');
} catch (e) {
  console.warn('serve: SQLite unavailable —', e.message);
}

// Lazily opened monthly DB instances — keyed by '${year}-${month}'.
const _monthlyDbs = new Map();
let _legacyDb = null;

/**
 * Return open DB instances that cover the given [fromMs, toMs] range.
 * Falls back to the legacy oh-my-hi.sqlite if no monthly DBs exist yet.
 */
function getDbsForRange(fromMs, toMs) {
  if (!dbModule) return [];
  let monthly;
  try { monthly = dbModule.listMonthlyDbs(OUTPUT_DIR); } catch { return []; }

  if (monthly.length === 0) {
    // Legacy fallback for pre-partitioned installs
    if (!fs.existsSync(LEGACY_DB_PATH)) return [];
    if (!_legacyDb) {
      try { _legacyDb = dbModule.openDb(LEGACY_DB_PATH); } catch (e) {
        console.warn('serve: could not open legacy DB —', e.message);
        return [];
      }
    }
    return [_legacyDb];
  }

  const dbs = [];
  for (const { year, month, path: p } of monthly) {
    const monthStart = Date.UTC(year, month - 1, 1);
    const monthEnd = Date.UTC(year, month, 1); // first ms of next month (exclusive)
    if (monthStart < toMs && monthEnd > fromMs) {
      const key = `${year}-${month}`;
      if (!_monthlyDbs.has(key)) {
        try { _monthlyDbs.set(key, dbModule.openDb(p)); } catch { continue; }
      }
      dbs.push(_monthlyDbs.get(key));
    }
  }
  return dbs;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.gz':   'application/gzip',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function handleMeta(req, res) {
  if (!fs.existsSync(DATA_JSON)) {
    return sendJson(res, 503, { error: 'data_not_ready' });
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8'));
  } catch (e) {
    return sendJson(res, 500, { error: 'data_parse_failed', detail: e.message });
  }

  // Strip usage arrays — keep contextStats/dateRange metadata.
  const scopeData = {};
  for (const [scope, sdata] of Object.entries(data.scopeData || {})) {
    const { usage, ...rest } = sdata || {};
    scopeData[scope] = { ...rest, usage: {} };
  }

  // Scan cache/ for seg-*.json.gz segments.
  const segments = [];
  if (fs.existsSync(CACHE_DIR)) {
    try {
      for (const file of fs.readdirSync(CACHE_DIR)) {
        if (!/^seg-\d+\.json\.gz$/.test(file)) continue;
        const id = path.basename(file, '.json.gz');
        const from = parseInt(id.replace('seg-', ''), 10);
        if (!Number.isFinite(from)) continue;
        segments.push({ id, from, to: from + 86400000 });
      }
      segments.sort((a, b) => a.from - b.from);
    } catch { /* ignore */ }
  }

  sendJson(res, 200, { ...data, scopeData, _apiMode: true, segments });
}

/** Fallback: serve usage directly from data.json when SQLite is not yet ready. */
function handleUsageFallback(res, scope) {
  if (!fs.existsSync(DATA_JSON)) {
    return sendJson(res, 503, { error: 'data_not_ready' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8'));
    const usage = data.scopeData?.[scope]?.usage;
    if (!usage) {
      return sendJson(res, 200, { tokenEntries: [], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [] });
    }
    sendJson(res, 200, usage);
  } catch (e) {
    sendJson(res, 500, { error: 'fallback_failed', detail: e.message });
  }
}

function handleUsage(req, res, url) {
  const scope = url.searchParams.get('scope') || 'global';
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const from = fromRaw != null ? parseInt(fromRaw, 10) : 0;
  const to = toRaw != null ? parseInt(toRaw, 10) : Number.MAX_SAFE_INTEGER;

  if (!dbModule) return handleUsageFallback(res, scope);

  const dbs = getDbsForRange(from, to);
  if (dbs.length === 0) return handleUsageFallback(res, scope);

  try {
    const payload = dbModule.queryUsageMultiDb(dbs, scope, from, to);
    sendJson(res, 200, payload);
  } catch (e) {
    sendJson(res, 500, { error: 'query_failed', detail: e.message });
  }
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(OUTPUT_DIR, decodeURIComponent(rel)));
  // Path traversal guard
  if (!filePath.startsWith(OUTPUT_DIR + path.sep) && filePath !== OUTPUT_DIR) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(filePath).toLowerCase();
  // /static/ files are versioned (app-x.y.z.js) or billboard files gated by .bb-version.
  // In dev builds skip immutable so hard-reload always fetches the latest file.
  const cacheControl = pathname.startsWith('/static/')
    ? IS_DEV_BUILD ? 'no-store' : 'public, max-age=31536000, immutable'
    : 'no-store';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
  });
  fs.createReadStream(filePath).pipe(res);
}

function handleOpen(req, res) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>oh-my-hi</title></head><body>
<script>
(function () {
  var base = location.protocol + '//' + location.host + '/';
  // Make this launcher tab become the named dashboard tab.
  // This avoids the duplicate-tab problem caused by window.open() creating a second tab
  // and window.close() being blocked (tabs opened by the OS cannot close themselves).
  window.name = 'oh-my-hi';
  window.location.replace(base);
}());
<\/script>
</body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (pathname === '/api/meta') return handleMeta(req, res);
  if (pathname === '/api/usage') return handleUsage(req, res, url);
  if (pathname === '/open') return handleOpen(req, res);
  serveStatic(req, res, pathname);
}

function writeLockFile(port) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ port, pid: process.pid }));
  } catch { /* ignore */ }
}

function deleteLockFile() {
  try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
}

// Chromium-based browsers that support AppleScript tab control on macOS.
const CHROMIUM_APPS = [
  'Google Chrome', 'Brave Browser', 'Microsoft Edge', 'Chromium',
  'Google Chrome Canary', 'Google Chrome Beta', 'Arc',
];

/**
 * On macOS, use AppleScript to focus an existing dashboard tab or open a new one.
 * Returns true on success, false if no supported browser is running or AppleScript fails.
 * Approach: same as Create React App / better-opn / Vite.
 */
function tryAppleScriptOpen(url) {
  if (process.platform !== 'darwin') return false;

  // Find the first Chromium browser that is currently running
  let browser = null;
  for (const app of CHROMIUM_APPS) {
    try {
      const r = spawnSync('osascript', ['-e', `tell application "System Events" to (name of processes) contains "${app}"`], { encoding: 'utf8', timeout: 2000 });
      if (r.stdout.trim() === 'true') { browser = app; break; }
    } catch { /* skip */ }
  }
  if (!browser) return false;

  // AppleScript: focus existing tab whose URL starts with `url`, else open a new tab.
  // Use loop counter for tab index — Chrome AppleScript doesn't expose `index of tab` directly.
  const script = `
tell application "${browser}"
  set theURL to "${url.replace(/"/g, '\\"')}"
  set found to false
  if (count of windows) > 0 then
    repeat with w in windows
      set tabCount to count of tabs of w
      repeat with i from 1 to tabCount
        set t to tab i of w
        if (URL of t) starts with theURL then
          set active tab index of w to i
          set index of w to 1
          activate
          set found to true
          exit repeat
        end if
      end repeat
      if found then exit repeat
    end repeat
  end if
  if not found then
    activate
    open location theURL
  end if
end tell`;

  const r = spawnSync('osascript', [], { input: script, encoding: 'utf8', timeout: 5000 });
  return r.status === 0;
}

function openBrowser(url) {
  // macOS + Chromium: AppleScript for reliable tab reuse (same approach as CRA/Vite/better-opn)
  if (tryAppleScriptOpen(url)) return;

  // Fallback: /open route uses window.name so the launcher tab navigates in-place
  const launchUrl = new URL('/open', url).href;
  try {
    if (process.platform === 'darwin') execSync(`open "${launchUrl}"`);
    else if (process.platform === 'win32') execSync(`start "" "${launchUrl}"`, { shell: true });
    else execSync(`xdg-open "${launchUrl}"`);
  } catch {
    console.log(`  → Open manually: ${url}`);
  }
}

/**
 * Returns true when an oh-my-hi server is already listening on the given port.
 * Probes GET /api/meta and checks for application/json response — a fingerprint
 * specific to oh-my-hi's serve.mjs (generic servers won't match this path).
 */
function checkOmhRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/api/meta', timeout: 600 },
      (res) => {
        res.resume();
        resolve((res.headers['content-type'] || '').startsWith('application/json'));
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

const PREFERRED_PORT = 8282;
// All ports follow the XX-repeated pattern (XY+XY) to stay memorable.
// 8080/8888 omitted — too commonly used by other tools.
const FALLBACK_PORTS = [7979, 8181, 8383, 9191, 9292];

function listen(startPort = PREFERRED_PORT, { open = false } = {}) {
  const server = http.createServer(requestHandler);
  const portQueue = [startPort, ...FALLBACK_PORTS.filter(p => p !== startPort)];
  let portIndex = 0;

  const onListening = () => {
    const port = portQueue[portIndex];
    const url = `http://127.0.0.1:${port}`;
    writeLockFile(port);
    if (port !== PREFERRED_PORT) {
      console.log(`oh-my-hi: port ${PREFERRED_PORT} in use — serving → ${url}  (Ctrl+C to stop)`);
    } else {
      console.log(`oh-my-hi: serving → ${url}  (Ctrl+C to stop)`);
    }
    if (open) openBrowser(url);
  };

  const tryListen = () => {
    const port = portQueue[portIndex];
    server.once('error', async (err) => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE') {
        const omhRunning = await checkOmhRunning(port);
        if (omhRunning) {
          // oh-my-hi is already serving on this port — reuse it instead of
          // switching to a fallback. No new process or browser tab needed.
          const url = `http://127.0.0.1:${port}`;
          console.log(`oh-my-hi: already running → ${url}`);
          process.exit(0);
        }
        if (portIndex < portQueue.length - 1) {
          portIndex++;
          tryListen();
        } else {
          console.error('serve: failed to bind —', err.message);
          process.exit(1);
        }
      } else {
        console.error('serve: failed to bind —', err.message);
        process.exit(1);
      }
    });
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  };
  tryListen();

  process.on('SIGINT', () => { deleteLockFile(); server.close(); process.exit(0); });
  process.on('SIGTERM', () => { deleteLockFile(); server.close(); process.exit(0); });

  return server;
}

// Invoked directly: node scripts/serve.mjs [--open]
if (import.meta.url === `file://${process.argv[1]}`) {
  listen(PREFERRED_PORT, { open: process.argv.includes('--open') });
}

export { requestHandler, listen };
