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
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const DB_PATH = path.join(OUTPUT_DIR, 'oh-my-hi.sqlite');
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

let _db = null;
function getDb() {
  if (_db) return _db;
  if (!dbModule) return null;
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    _db = dbModule.openDb(DB_PATH);
    return _db;
  } catch (e) {
    console.warn('serve: could not open DB —', e.message);
    return null;
  }
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
  const db = getDb();
  const scope = url.searchParams.get('scope') || 'global';
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const from = fromRaw != null ? parseInt(fromRaw, 10) : 0;
  const to = toRaw != null ? parseInt(toRaw, 10) : Number.MAX_SAFE_INTEGER;

  // Fall back to data.json when SQLite is absent or not yet populated (migration in progress).
  if (!db) return handleUsageFallback(res, scope);
  try {
    const count = db.prepare('SELECT COUNT(*) AS n FROM token_entries').get().n;
    if (count === 0) return handleUsageFallback(res, scope);
  } catch { return handleUsageFallback(res, scope); }

  try {
    const payload = dbModule.queryUsage(db, scope, from, to);
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
  // /static/ files are versioned (app-x.y.z.js) or billboard files gated by .bb-version,
  // so they never change in-place — safe for long-lived immutable caching.
  const cacheControl = pathname.startsWith('/static/')
    ? 'public, max-age=31536000, immutable'
    : 'no-store';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
  });
  fs.createReadStream(filePath).pipe(res);
}

function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (pathname === '/api/meta') return handleMeta(req, res);
  if (pathname === '/api/usage') return handleUsage(req, res, url);
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

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') execSync(`open "${url}"`);
    else if (process.platform === 'win32') execSync(`start "" "${url}"`, { shell: true });
    else execSync(`xdg-open "${url}"`);
  } catch {
    console.log(`  → Open manually: ${url}`);
  }
}

const PREFERRED_PORT = 7979;
// All ports follow the XX-repeated pattern (XY+XY) to stay memorable.
// 8080/8888 omitted — too commonly used by other tools.
const FALLBACK_PORTS = [8181, 8282, 8383, 9191, 9292];

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
    server.once('error', (err) => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE' && portIndex < portQueue.length - 1) {
        portIndex++;
        tryListen();
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
