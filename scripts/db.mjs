// @ts-check
// db.mjs — SQLite helper for oh-my-hi usage data.
//
// Backs the /api/usage endpoint and the optional on-disk snapshot that
// lives alongside data.json. SQLite is additive: if better-sqlite3 is not
// available (native module install failure), callers should catch the
// error from openDb() and fall back to the JSON flow.

import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { toMonthKey } from './util.mjs';

const require = createRequire(import.meta.url);

// ── Machine identity ───────────────────────────────────────────────────────
//
// Every usage row is stamped with a stable, normalized machine id so that DBs
// copied from other machines can be merged without colliding (the machine id
// is part of every unique key). Override with OH_MY_HI_MACHINE if hostnames
// clash or you want a friendlier label.

let _machineId = null;

/**
 * Stable machine identifier: normalized os.hostname().
 * Normalization: lowercase, strip trailing `.local`/`.lan`/`.localdomain`,
 * non [a-z0-9._-] chars replaced with '-'. Env override: OH_MY_HI_MACHINE.
 */
export function getMachineId() {
  if (_machineId) return _machineId;
  const raw = process.env.OH_MY_HI_MACHINE || os.hostname() || 'unknown';
  _machineId = String(raw)
    .toLowerCase()
    .replace(/\.(local|lan|localdomain)$/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
  return _machineId;
}

/**
 * Clear the better-sqlite3 native module from the CJS require cache so the
 * next openDb() call loads the freshly rebuilt binary.
 * Called after `npm rebuild better-sqlite3` succeeds.
 */
export function reloadNativeModule() {
  try {
    const resolved = require.resolve('better-sqlite3');
    delete require.cache[resolved];
  } catch { /* module not in cache — nothing to clear */ }
}

// Schema version rule: when the schema needs to change after release, bump
// CURRENT_SCHEMA_VERSION, add `if (v < N) migrateToVN(db)` in migrate(), and
// write migrateToVN ending with `db.pragma('user_version = N')` — always
// hardcode N, never use CURRENT_SCHEMA_VERSION inside a migration function.
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Open (and migrate) the oh-my-hi SQLite database.
 * Throws if better-sqlite3 cannot be loaded — callers decide whether that
 * is fatal or degrade-gracefully.
 *
 * @param {string} dbPath absolute path to the SQLite file
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(dbPath) {
  const Database = require('better-sqlite3');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

/** Read PRAGMA user_version. */
export function getSchemaVersion(db) {
  const row = db.pragma('user_version', { simple: true });
  return typeof row === 'number' ? row : parseInt(row, 10) || 0;
}

/**
 * Apply pending migrations.
 * New version: bump CURRENT_SCHEMA_VERSION, add `if (v < N) migrateToVN(db)`,
 * write migrateToVN with `db.pragma('user_version = N')` at the end.
 */
function migrate(db) {
  const v = getSchemaVersion(db);
  if (v === 0) { initSchema(db); return; }
  // Add latency_entries for DBs created before it was added to the schema (user_version <= 6)
  const hasLatency = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='latency_entries'").get();
  if (!hasLatency) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE latency_entries (
          scope      TEXT    NOT NULL,
          session_id TEXT,
          timestamp  INTEGER NOT NULL,
          latency_ms INTEGER NOT NULL,
          model      TEXT,
          UNIQUE(scope, timestamp, session_id)
        );
        CREATE INDEX idx_le_scope_ts ON latency_entries(scope, timestamp);
      `);
    })();
  }
  if (v < 2) migrateToV2(db);
  // Full-text search over user prompt texts (FTS5 virtual table).
  // Created lazily for both fresh and pre-existing DBs. Wrapped in try/catch:
  // if this SQLite build lacks FTS5, search is silently unavailable —
  // writers/readers check table existence via hasFtsTable().
  if (!hasFtsTable(db)) {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE prompt_fts USING fts5(
          text,
          scope      UNINDEXED,
          session_id UNINDEXED,
          timestamp  UNINDEXED,
          machine    UNINDEXED
        );
      `);
    } catch { /* FTS5 not compiled in — search disabled */ }
  }
  // Future incremental migrations go here:
  // if (v < 3) migrateToV3(db);
}

/**
 * v1 → v2: add a `machine` column to every usage-bearing table and fold it
 * into each unique key so rows from different machines never collide
 * (foundation for cross-machine merge via `node scripts/db.mjs --import`).
 *
 * Existing rows are stamped with the *current* machine id — a v1 DB by
 * definition only ever contained local data.
 *
 * - token_entries: the unique key is a standalone UNIQUE INDEX, so a cheap
 *   ALTER TABLE ADD COLUMN + index swap suffices (no row copy).
 * - prompt_entries / skill_usage / agent_usage / mcp_calls / latency_entries:
 *   the unique key is a table-level UNIQUE constraint, which SQLite cannot
 *   alter in place → rebuild via create-new-table + copy + drop + rename.
 */
function migrateToV2(db) {
  // getMachineId() output is sanitized to [a-z0-9._-], safe to inline as an SQL literal.
  const machine = getMachineId();
  db.transaction(() => {
    // token_entries — ALTER + unique-index swap (largest table; avoid copying rows)
    db.exec(`
      ALTER TABLE token_entries ADD COLUMN machine TEXT NOT NULL DEFAULT '';
      UPDATE token_entries SET machine = '${machine}';
      DROP INDEX IF EXISTS idx_te_unique;
      CREATE UNIQUE INDEX idx_te_unique
        ON token_entries(scope, timestamp, model, input_tokens, output_tokens, machine);
    `);

    // prompt_entries — rebuild (UNIQUE constraint gains `machine`)
    db.exec(`
      CREATE TABLE prompt_entries_v2 (
        scope      TEXT    NOT NULL,
        session_id TEXT    NOT NULL DEFAULT '',
        timestamp  INTEGER NOT NULL,
        char_len   INTEGER DEFAULT 0,
        preview    TEXT,
        machine    TEXT    NOT NULL DEFAULT '',
        UNIQUE(scope, session_id, timestamp, machine)
      );
      INSERT INTO prompt_entries_v2 (scope, session_id, timestamp, char_len, preview, machine)
        SELECT scope, session_id, timestamp, char_len, preview, '${machine}' FROM prompt_entries;
      DROP TABLE prompt_entries;
      ALTER TABLE prompt_entries_v2 RENAME TO prompt_entries;
      CREATE INDEX idx_pe_scope_ts ON prompt_entries(scope, timestamp);
    `);

    // skill_usage — rebuild
    db.exec(`
      CREATE TABLE skill_usage_v2 (
        scope   TEXT NOT NULL,
        name    TEXT NOT NULL,
        count   INTEGER DEFAULT 0,
        date    TEXT,
        machine TEXT NOT NULL DEFAULT '',
        UNIQUE(scope, name, date, machine)
      );
      INSERT INTO skill_usage_v2 (scope, name, count, date, machine)
        SELECT scope, name, count, date, '${machine}' FROM skill_usage;
      DROP TABLE skill_usage;
      ALTER TABLE skill_usage_v2 RENAME TO skill_usage;
      CREATE INDEX idx_skill_usage_scope_date ON skill_usage(scope, date);
    `);

    // agent_usage — rebuild
    db.exec(`
      CREATE TABLE agent_usage_v2 (
        scope   TEXT NOT NULL,
        name    TEXT NOT NULL,
        count   INTEGER DEFAULT 0,
        date    TEXT,
        machine TEXT NOT NULL DEFAULT '',
        UNIQUE(scope, name, date, machine)
      );
      INSERT INTO agent_usage_v2 (scope, name, count, date, machine)
        SELECT scope, name, count, date, '${machine}' FROM agent_usage;
      DROP TABLE agent_usage;
      ALTER TABLE agent_usage_v2 RENAME TO agent_usage;
      CREATE INDEX idx_agent_usage_scope_date ON agent_usage(scope, date);
    `);

    // mcp_calls — rebuild
    db.exec(`
      CREATE TABLE mcp_calls_v2 (
        scope   TEXT NOT NULL,
        tool    TEXT NOT NULL,
        count   INTEGER DEFAULT 0,
        date    TEXT,
        machine TEXT NOT NULL DEFAULT '',
        UNIQUE(scope, tool, date, machine)
      );
      INSERT INTO mcp_calls_v2 (scope, tool, count, date, machine)
        SELECT scope, tool, count, date, '${machine}' FROM mcp_calls;
      DROP TABLE mcp_calls;
      ALTER TABLE mcp_calls_v2 RENAME TO mcp_calls;
      CREATE INDEX idx_mcp_calls_scope_date ON mcp_calls(scope, date);
    `);

    // latency_entries — rebuild
    db.exec(`
      CREATE TABLE latency_entries_v2 (
        scope      TEXT    NOT NULL,
        session_id TEXT,
        timestamp  INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        model      TEXT,
        machine    TEXT    NOT NULL DEFAULT '',
        UNIQUE(scope, timestamp, session_id, machine)
      );
      INSERT INTO latency_entries_v2 (scope, session_id, timestamp, latency_ms, model, machine)
        SELECT scope, session_id, timestamp, latency_ms, model, '${machine}' FROM latency_entries;
      DROP TABLE latency_entries;
      ALTER TABLE latency_entries_v2 RENAME TO latency_entries;
      CREATE INDEX idx_le_scope_ts ON latency_entries(scope, timestamp);
    `);

    db.pragma('user_version = 2');
  })();
}

/** True when the prompt_fts virtual table exists (FTS5 available). */
function hasFtsTable(db) {
  try {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_fts'").get();
  } catch { return false; }
}

/**
 * Fresh install: create the complete schema at the current version in one shot.
 * No incremental steps needed — this is the canonical final state.
 */
function initSchema(db) {
  db.transaction(() => {
    db.exec(`
      -- Token entries: one row per API call.
      -- 'machine' identifies the machine that produced the row (cross-machine
      -- merge support) and is part of every unique key below.
      CREATE TABLE token_entries (
        scope         TEXT    NOT NULL,
        session_id    TEXT,
        timestamp     INTEGER NOT NULL,
        model         TEXT,
        input_tokens  INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read    INTEGER DEFAULT 0,
        cache_creation INTEGER DEFAULT 0,
        raw_input     INTEGER DEFAULT 0,
        context       TEXT,
        context_name  TEXT,
        machine       TEXT    NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_te_scope_ts ON token_entries(scope, timestamp);
      CREATE UNIQUE INDEX idx_te_unique
        ON token_entries(scope, timestamp, model, input_tokens, output_tokens, machine);

      -- Prompt entries: one row per user message
      CREATE TABLE prompt_entries (
        scope      TEXT    NOT NULL,
        session_id TEXT    NOT NULL DEFAULT '',
        timestamp  INTEGER NOT NULL,
        char_len   INTEGER DEFAULT 0,
        preview    TEXT,
        machine    TEXT    NOT NULL DEFAULT '',
        UNIQUE(scope, session_id, timestamp, machine)
      );
      CREATE INDEX idx_pe_scope_ts ON prompt_entries(scope, timestamp);

      -- Daily prompt aggregates (legacy — kept for reference, no longer written)
      CREATE TABLE prompt_stats (
        scope           TEXT NOT NULL,
        date            TEXT NOT NULL,
        message_count   INTEGER DEFAULT 0,
        session_count   INTEGER DEFAULT 0,
        tool_call_count INTEGER DEFAULT 0,
        PRIMARY KEY (scope, date)
      );

      -- Skill / agent / mcp usage: one row per (scope, name/tool, date, machine)
      CREATE TABLE skill_usage (
        scope   TEXT NOT NULL,
        name    TEXT NOT NULL,
        count   INTEGER DEFAULT 0,
        date    TEXT,
        machine TEXT NOT NULL DEFAULT '',
        UNIQUE(scope, name, date, machine)
      );
      CREATE INDEX idx_skill_usage_scope_date ON skill_usage(scope, date);

      CREATE TABLE agent_usage (
        scope   TEXT NOT NULL,
        name    TEXT NOT NULL,
        count   INTEGER DEFAULT 0,
        date    TEXT,
        machine TEXT NOT NULL DEFAULT '',
        UNIQUE(scope, name, date, machine)
      );
      CREATE INDEX idx_agent_usage_scope_date ON agent_usage(scope, date);

      CREATE TABLE mcp_calls (
        scope   TEXT NOT NULL,
        tool    TEXT NOT NULL,
        count   INTEGER DEFAULT 0,
        date    TEXT,
        machine TEXT NOT NULL DEFAULT '',
        UNIQUE(scope, tool, date, machine)
      );
      CREATE INDEX idx_mcp_calls_scope_date ON mcp_calls(scope, date);

      -- Latency entries: one row per measured API response time
      CREATE TABLE latency_entries (
        scope      TEXT    NOT NULL,
        session_id TEXT,
        timestamp  INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        model      TEXT,
        machine    TEXT    NOT NULL DEFAULT '',
        UNIQUE(scope, timestamp, session_id, machine)
      );
      CREATE INDEX idx_le_scope_ts ON latency_entries(scope, timestamp);
    `);
    db.pragma('user_version = 2');
  })();
}

// ── Monthly DB path helpers ────────────────────────────────────────────────

/**
 * Returns the path for a specific year/month DB.
 * Layout: {outputDir}/db/{year}/{year}-{MM}.sqlite
 */
export function getMonthlyDbPath(outputDir, year, month) {
  return path.join(outputDir, 'db', String(year), `${toMonthKey(year, month)}.sqlite`);
}

/** Returns the path for the current calendar month's DB. */
export function getCurrentMonthDbPath(outputDir) {
  const now = new Date();
  return getMonthlyDbPath(outputDir, now.getFullYear(), now.getMonth() + 1);
}

/**
 * Discovers all existing monthly DB files under {outputDir}/db/.
 * Returns array of { year, month, path } sorted ascending.
 */
export function listMonthlyDbs(outputDir) {
  const dbDir = path.join(outputDir, 'db');
  const results = [];
  if (!fs.existsSync(dbDir)) return results;
  for (const yearStr of fs.readdirSync(dbDir).sort()) {
    if (!/^\d{4}$/.test(yearStr)) continue;
    const yearPath = path.join(dbDir, yearStr);
    if (!fs.statSync(yearPath).isDirectory()) continue;
    const files = fs.readdirSync(yearPath);
    const mainFiles = new Set(files.filter(f => /^(\d{4})-(\d{2})\.sqlite$/.test(f)));
    // Clean up orphaned WAL/SHM files that have no corresponding main .sqlite
    for (const file of files) {
      const m = file.match(/^((\d{4})-(\d{2})\.sqlite)-(wal|shm)$/);
      if (m && !mainFiles.has(m[1])) {
        try { fs.unlinkSync(path.join(yearPath, file)); } catch { /* ignore */ }
      }
    }
    for (const file of files.sort()) {
      const m = file.match(/^(\d{4})-(\d{2})\.sqlite$/);
      if (!m) continue;
      results.push({
        year: parseInt(m[1], 10),
        month: parseInt(m[2], 10),
        path: path.join(yearPath, file),
      });
    }
  }
  return results;
}

// ── Write helpers ──────────────────────────────────────────────────────────

/** @returns {{ tokenEntries: any[], promptStats: any[], skills: any[], agents: any[], mcpCalls: any[], latencyEntries: any[] }} */
function emptyUsage() {
  return { tokenEntries: [], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [] };
}

/**
 * Append usage entries routed to the correct monthly DB files.
 * Each entry is written to the DB for the month its timestamp/date falls in.
 * Items with no date are written to the current month's DB.
 * Safe to call multiple times — uses INSERT OR IGNORE / ON CONFLICT DO UPDATE.
 *
 * Note: skill/agent/mcp counts accumulate on conflict, so re-writing a month is
 * NOT idempotent. Pass `completedMonths` (a Set of '${year}-${month}' keys) when
 * retrying after a partial failure: months already in the set are skipped, and
 * each month is added to the set as soon as its transaction commits.
 *
 * @param {Set<string>|null} [completedMonths] mutated in place with committed month keys
 */
export function appendUsageMonthly(outputDir, scope, usage, completedMonths = null) {
  if (!usage) return;

  const now = new Date();
  const [curYear, curMonth] = [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const groups = new Map(); // '${year}-${month}' → usage object

  const getGroup = (year, month) => {
    const key = `${year}-${month}`;
    if (!groups.has(key)) groups.set(key, emptyUsage());
    return groups.get(key);
  };

  for (const e of (usage.tokenEntries || [])) {
    const ts = Number(e.timestamp);
    if (!ts) continue; // skip zero/invalid timestamps
    const d = new Date(ts);
    getGroup(d.getUTCFullYear(), d.getUTCMonth() + 1).tokenEntries.push(e);
  }

  for (const p of (usage.promptStats || [])) {
    const ts = Number(p.timestamp);
    if (!ts) continue;
    const d = new Date(ts);
    getGroup(d.getUTCFullYear(), d.getUTCMonth() + 1).promptStats.push(p);
  }

  for (const s of (usage.skills || [])) {
    if (s.date) {
      const parts = s.date.split('-');
      if (parts.length >= 2) { getGroup(parseInt(parts[0], 10), parseInt(parts[1], 10)).skills.push(s); continue; }
    }
    const ts = Number(s.timestamp);
    const d = ts ? new Date(ts) : now;
    getGroup(d.getUTCFullYear(), d.getUTCMonth() + 1).skills.push(s);
  }

  for (const a of (usage.agents || [])) {
    if (a.date) {
      const parts = a.date.split('-');
      if (parts.length >= 2) { getGroup(parseInt(parts[0], 10), parseInt(parts[1], 10)).agents.push(a); continue; }
    }
    const ts = Number(a.timestamp);
    const d = ts ? new Date(ts) : now;
    getGroup(d.getUTCFullYear(), d.getUTCMonth() + 1).agents.push(a);
  }

  for (const m of (usage.mcpCalls || [])) {
    if (m.date) {
      const parts = m.date.split('-');
      if (parts.length >= 2) { getGroup(parseInt(parts[0], 10), parseInt(parts[1], 10)).mcpCalls.push(m); continue; }
    }
    const ts = Number(m.timestamp);
    const d = ts ? new Date(ts) : now;
    getGroup(d.getUTCFullYear(), d.getUTCMonth() + 1).mcpCalls.push(m);
  }

  for (const l of (usage.latencyEntries || [])) {
    const ts = Number(l.timestamp);
    if (!ts) continue;
    const d = new Date(ts);
    getGroup(d.getUTCFullYear(), d.getUTCMonth() + 1).latencyEntries.push(l);
  }

  for (const [key, monthUsage] of groups) {
    const empty = !monthUsage.tokenEntries.length && !monthUsage.promptStats.length &&
      !monthUsage.skills.length && !monthUsage.agents.length && !monthUsage.mcpCalls.length &&
      !monthUsage.latencyEntries.length;
    if (empty) continue;
    if (completedMonths?.has(key)) continue; // committed in a previous attempt — skip to keep counts idempotent
    const [year, month] = key.split('-').map(Number);
    const dbPath = getMonthlyDbPath(outputDir, year, month);
    let db;
    try {
      db = openDb(dbPath);
      appendUsage(db, scope, monthUsage);
      completedMonths?.add(key);
    } catch (e) {
      console.warn(`appendUsageMonthly: failed for ${key} —`, e.message);
      throw e;
    } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }
}

/**
 * Split a legacy oh-my-hi.sqlite into monthly DB files.
 * Reads all rows by scope, converts to usage format, calls appendUsageMonthly per scope.
 */
export function splitLegacyDb(legacyDb, outputDir) {
  // Collect all scopes from all tables
  const scopeSet = new Set();
  for (const table of ['token_entries', 'prompt_stats', 'skill_usage', 'agent_usage', 'mcp_calls']) {
    try {
      legacyDb.prepare(`SELECT DISTINCT scope FROM ${table}`).all().forEach(r => scopeSet.add(r.scope));
    } catch { /* table may not exist */ }
  }

  for (const scope of scopeSet) {
    const tokenRows = legacyDb.prepare('SELECT * FROM token_entries WHERE scope = ? ORDER BY timestamp').all(scope);
    const promptRows = legacyDb.prepare('SELECT * FROM prompt_stats WHERE scope = ?').all(scope);
    const skillRows = legacyDb.prepare('SELECT * FROM skill_usage WHERE scope = ?').all(scope);
    const agentRows = legacyDb.prepare('SELECT * FROM agent_usage WHERE scope = ?').all(scope);
    const mcpRows = legacyDb.prepare('SELECT * FROM mcp_calls WHERE scope = ?').all(scope);

    const usage = {
      tokenEntries: tokenRows.map(r => ({
        sessionId: r.session_id,
        timestamp: r.timestamp,
        model: r.model,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cacheRead: r.cache_read,
        cacheCreation: r.cache_creation,
        rawInput: r.raw_input,
        context: r.context,
        contextName: r.context_name,
        latencyMs: r.latency_ms,
        charLen: r.char_len,
        machine: r.machine,
      })),
      // Legacy prompt_stats are daily aggregates ({date, message_count, …}); individual
      // timestamps are not recoverable, so they cannot be stored in the new prompt_entries
      // table.  Skip rather than create misleading midnight-timestamp placeholders.
      promptStats: [],
      skills: skillRows.map(r => ({ name: r.name, count: r.count, date: r.date, machine: r.machine })),
      agents: agentRows.map(r => ({ name: r.name, count: r.count, date: r.date, machine: r.machine })),
      mcpCalls: mcpRows.map(r => ({ tool: r.tool, count: r.count, date: r.date, machine: r.machine })),
      latencyEntries: [],
    };

    appendUsageMonthly(outputDir, scope, usage);
  }
}

// ── Multi-DB query helpers ─────────────────────────────────────────────────

/** Query only token entries across multiple DBs, sorted by timestamp (usage export). */
export function queryTokenEntriesMultiDb(dbs, scope, from, to) {
  const entries = [];
  for (const db of dbs) entries.push(...queryTokenEntries(db, scope, from, to));
  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

/** Query and merge usage data from multiple DB instances (for date-spanning queries). */
export function queryUsageMultiDb(dbs, scope, from, to) {
  const merged = { tokenEntries: [], promptStats: [], latencyEntries: [], skills: [], agents: [], mcpCalls: [] };
  const promptMap = new Map();
  // key = `${name}\0${date}` → accumulated count entry
  const skillMap = new Map();
  const agentMap = new Map();
  const mcpMap = new Map();

  const mergeCountMap = (map, item, nameKey) => {
    const k = `${item[nameKey]}\0${item.date ?? ''}`;
    const existing = map.get(k);
    if (existing) {
      existing.count = (existing.count || 0) + (item.count || 0);
    } else {
      map.set(k, { ...item });
    }
  };

  const latencyMap = new Map();

  for (const db of dbs) {
    const r = queryUsage(db, scope, from, to);
    merged.tokenEntries.push(...r.tokenEntries);
    // Dedup keys include the machine so identical timestamps from different
    // machines (merged via --import) are kept as distinct entries.
    for (const p of r.promptStats) promptMap.set(`${p.machine || ''}\0${p.sessionId || ''}\0${p.timestamp}`, p);
    for (const s of r.skills) mergeCountMap(skillMap, s, 'name');
    for (const a of r.agents) mergeCountMap(agentMap, a, 'name');
    for (const m of r.mcpCalls) mergeCountMap(mcpMap, m, 'name');
    for (const l of r.latencyEntries) latencyMap.set(`${l.machine || ''}\0${l.sessionId || ''}\0${l.timestamp}`, l);
  }

  merged.promptStats = [...promptMap.values()].sort((a, b) => a.timestamp - b.timestamp);
  merged.tokenEntries.sort((a, b) => a.timestamp - b.timestamp);
  merged.latencyEntries = [...latencyMap.values()].sort((a, b) => a.timestamp - b.timestamp);
  merged.skills = [...skillMap.values()];
  merged.agents = [...agentMap.values()];
  merged.mcpCalls = [...mcpMap.values()];
  return merged;
}

/** Return all distinct (context_name, context) pairs across all monthly DBs. */
export function queryContextNamesAllMonths(outputDir) {
  const resultMap = new Map();
  for (const { path: p } of listMonthlyDbs(outputDir)) {
    let db;
    try {
      db = openDb(p);
      for (const r of queryContextNames(db)) resultMap.set(r.contextName, r.contextType);
    } catch { /* ignore */ } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }
  return [...resultMap.entries()].map(([contextName, contextType]) => ({ contextName, contextType }));
}

/** Return the earliest and latest token timestamps across all monthly DBs. */
export function queryDateRangeAllMonths(outputDir) {
  const monthly = listMonthlyDbs(outputDir);
  if (monthly.length === 0) return null;
  let earliest = Infinity;
  let latest = -Infinity;
  for (const { path: p } of monthly) {
    let db;
    try {
      db = openDb(p);
      const r = queryDateRange(db);
      if (r) {
        if (r.earliest < earliest) earliest = r.earliest;
        if (r.latest > latest) latest = r.latest;
      }
    } catch { /* ignore */ } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }
  return earliest === Infinity ? null : { earliest, latest };
}

// ── Full-text search (prompt_fts) ──────────────────────────────────────────

// Snippet highlight sentinels — control chars that cannot appear in HTML-escaped
// output. The frontend escapes the snippet, then converts these to <mark> tags.
export const SEARCH_MARK_START = '\u0001';
export const SEARCH_MARK_END = '\u0002';

/**
 * Convert raw user input into a safe FTS5 MATCH expression.
 * Each whitespace-separated term becomes a quoted prefix phrase ("term"*),
 * with embedded double quotes doubled — so FTS5 operators (AND, OR, NEAR,
 * parens, quotes, *, ^) in user input are treated as literal text and can
 * never produce a syntax error.
 * Returns null when the input contains no searchable terms.
 */
export function escapeFtsMatch(query) {
  const terms = String(query ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map(t => `"${t.replace(/"/g, '""')}"*`).join(' ');
}

/**
 * Search user prompt texts across all monthly DBs.
 * Results are grouped per session: each session keeps its best-ranked
 * (lowest bm25) snippet plus a match count, sorted best-first.
 *
 * @param {string} outputDir
 * @param {string} query raw user input (sanitized internally)
 * @param {{ limit?: number }} [opts]
 * @returns {Array<{ sessionId: string, scope: string, timestamp: number, snippet: string, rank: number, matches: number }>}
 */
export function searchPrompts(outputDir, query, { limit = 20 } = {}) {
  const match = escapeFtsMatch(query);
  if (!match) return [];

  const bySession = new Map();
  for (const { path: p } of listMonthlyDbs(outputDir)) {
    let db;
    try {
      db = openDb(p);
      const rows = searchPromptsInDb(db, match, limit);
      for (const r of rows) {
        if (!r.sessionId) continue; // unattributable rows are not linkable
        const cur = bySession.get(r.sessionId);
        if (!cur) {
          bySession.set(r.sessionId, { ...r, matches: 1 });
        } else {
          cur.matches += 1;
          if (r.rank < cur.rank) {
            cur.rank = r.rank;
            cur.snippet = r.snippet;
            cur.timestamp = r.timestamp;
            cur.scope = r.scope;
          }
        }
      }
    } catch { /* skip unreadable DB */ } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }
  return [...bySession.values()].sort((a, b) => a.rank - b.rank).slice(0, limit);
}

/**
 * Run an already-escaped MATCH expression against one DB's prompt_fts.
 * bm25() is negative — lower (more negative) means a better match.
 */
export function searchPromptsInDb(db, match, limit = 20) {
  if (!hasFtsTable(db)) return [];
  return db.prepare(`
    SELECT scope, session_id AS sessionId, timestamp,
           snippet(prompt_fts, 0, ?, ?, '…', 16) AS snippet,
           bm25(prompt_fts) AS rank
    FROM prompt_fts
    WHERE prompt_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(SEARCH_MARK_START, SEARCH_MARK_END, match, limit);
}

// ── Scope-level write operations ───────────────────────────────────────────

/**
 * Replace all rows for a given scope + machine with the supplied usage payload.
 * Idempotent: running twice with the same usage yields the same DB state.
 * Only the current machine's rows are deleted — rows imported from other
 * machines (via --import) survive local rebuilds.
 */
export function upsertUsage(db, scope, usage, machine = getMachineId()) {
  if (!usage) return;

  const ftsOk = hasFtsTable(db);
  const delTokens = db.prepare('DELETE FROM token_entries WHERE scope = ? AND machine = ?');
  const delPrompts = db.prepare('DELETE FROM prompt_entries WHERE scope = ? AND machine = ?');
  const delFts = ftsOk ? db.prepare('DELETE FROM prompt_fts WHERE scope = ? AND machine = ?') : null;
  const delLatency = db.prepare('DELETE FROM latency_entries WHERE scope = ? AND machine = ?');
  const delSkills = db.prepare('DELETE FROM skill_usage WHERE scope = ? AND machine = ?');
  const delAgents = db.prepare('DELETE FROM agent_usage WHERE scope = ? AND machine = ?');
  const delMcp = db.prepare('DELETE FROM mcp_calls WHERE scope = ? AND machine = ?');

  const insTokens = db.prepare(`
    INSERT INTO token_entries
      (scope, session_id, timestamp, model, input_tokens, output_tokens,
       cache_read, cache_creation, raw_input, context, context_name, machine)
    VALUES (@scope, @session_id, @timestamp, @model, @input_tokens, @output_tokens,
            @cache_read, @cache_creation, @raw_input, @context, @context_name, @machine)
  `);
  const insPrompts = db.prepare(`
    INSERT OR REPLACE INTO prompt_entries (scope, session_id, timestamp, char_len, preview, machine)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insFts = ftsOk ? db.prepare(`
    INSERT INTO prompt_fts (text, scope, session_id, timestamp, machine) VALUES (?, ?, ?, ?, ?)
  `) : null;
  const insSkill = db.prepare('INSERT INTO skill_usage (scope, name, count, date, machine) VALUES (?, ?, ?, ?, ?)');
  const insAgent = db.prepare('INSERT INTO agent_usage (scope, name, count, date, machine) VALUES (?, ?, ?, ?, ?)');
  const insMcp = db.prepare('INSERT INTO mcp_calls (scope, tool, count, date, machine) VALUES (?, ?, ?, ?, ?)');
  const insLatency = db.prepare(`
    INSERT OR IGNORE INTO latency_entries (scope, session_id, timestamp, latency_ms, model, machine)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    delTokens.run(scope, machine);
    delPrompts.run(scope, machine);
    delFts?.run(scope, machine);
    delLatency.run(scope, machine);
    delSkills.run(scope, machine);
    delAgents.run(scope, machine);
    delMcp.run(scope, machine);

    for (const e of (usage.tokenEntries || [])) {
      insTokens.run({
        scope,
        session_id: e.sessionId ?? null,
        timestamp: Number(e.timestamp) || 0,
        model: e.model ?? null,
        input_tokens: e.inputTokens | 0,
        output_tokens: e.outputTokens | 0,
        cache_read: e.cacheRead | 0,
        cache_creation: e.cacheCreation | 0,
        raw_input: e.rawInput | 0,
        context: e.context != null ? String(e.context) : null,
        context_name: e.contextName ?? null,
        machine: e.machine ?? machine,
      });
    }
    for (const p of (usage.promptStats || [])) {
      const ts = Number(p.timestamp);
      if (!ts) continue;
      insPrompts.run(scope, p.sessionId ?? '', ts, p.charLen | 0, p.preview ?? null, p.machine ?? machine);
      if (insFts && p.text) insFts.run(String(p.text), scope, p.sessionId ?? '', ts, p.machine ?? machine);
    }
    for (const s of (usage.skills || [])) {
      const date = s.date ?? (s.timestamp ? new Date(s.timestamp).toISOString().slice(0, 10) : null);
      insSkill.run(scope, s.name ?? '', s.count || 1, date, s.machine ?? machine);
    }
    for (const a of (usage.agents || [])) {
      const date = a.date ?? (a.timestamp ? new Date(a.timestamp).toISOString().slice(0, 10) : null);
      insAgent.run(scope, a.name ?? '', a.count || 1, date, a.machine ?? machine);
    }
    for (const m of (usage.mcpCalls || [])) {
      const toolName = m.tool ?? m.name ?? '';
      const date = m.date ?? (m.timestamp ? new Date(m.timestamp).toISOString().slice(0, 10) : null);
      insMcp.run(scope, toolName, m.count || 1, date, m.machine ?? machine);
    }
    for (const l of (usage.latencyEntries || [])) {
      const ts = Number(l.timestamp);
      if (!ts) continue;
      insLatency.run(scope, l.sessionId ?? null, ts, l.latencyMs || l.latency_ms || 0, l.model ?? null, l.machine ?? machine);
    }
  });
  tx();
}

/**
 * Append new usage entries to SQLite without deleting existing rows.
 * Uses INSERT OR IGNORE for token_entries (dedup by unique key).
 * Uses ON CONFLICT DO UPDATE for skill/agent/mcp to accumulate counts.
 * Use this for incremental updates; use upsertUsage for full rebuilds.
 * Rows are stamped with `machine` (per-entry `entry.machine` wins — used by
 * the cross-machine import path).
 */
export function appendUsage(db, scope, usage, machine = getMachineId()) {
  if (!usage) return;

  const insTokens = db.prepare(`
    INSERT OR IGNORE INTO token_entries
      (scope, session_id, timestamp, model, input_tokens, output_tokens,
       cache_read, cache_creation, raw_input, context, context_name, machine)
    VALUES (@scope, @session_id, @timestamp, @model, @input_tokens, @output_tokens,
            @cache_read, @cache_creation, @raw_input, @context, @context_name, @machine)
  `);
  const insPrompts = db.prepare(`
    INSERT OR REPLACE INTO prompt_entries (scope, session_id, timestamp, char_len, preview, machine)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  // FTS5 has no UNIQUE constraints — delete-then-insert keyed like prompt_entries'
  // UNIQUE(scope, session_id, timestamp) gives the same INSERT OR REPLACE idempotency.
  const ftsOk = hasFtsTable(db);
  const delFts = ftsOk ? db.prepare('DELETE FROM prompt_fts WHERE scope = ? AND session_id = ? AND timestamp = ?') : null;
  const insFts = ftsOk ? db.prepare('INSERT INTO prompt_fts (text, scope, session_id, timestamp, machine) VALUES (?, ?, ?, ?, ?)') : null;
  const insSkill = db.prepare(`
    INSERT INTO skill_usage (scope, name, count, date, machine) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, name, date, machine) DO UPDATE SET count = count + excluded.count
  `);
  const insAgent = db.prepare(`
    INSERT INTO agent_usage (scope, name, count, date, machine) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, name, date, machine) DO UPDATE SET count = count + excluded.count
  `);
  const insMcp = db.prepare(`
    INSERT INTO mcp_calls (scope, tool, count, date, machine) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, tool, date, machine) DO UPDATE SET count = count + excluded.count
  `);
  const insLatency = db.prepare(`
    INSERT OR IGNORE INTO latency_entries (scope, session_id, timestamp, latency_ms, model, machine)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const e of (usage.tokenEntries || [])) {
      insTokens.run({
        scope,
        session_id: e.sessionId ?? null,
        timestamp: Number(e.timestamp) || 0,
        model: e.model ?? null,
        input_tokens: e.inputTokens | 0,
        output_tokens: e.outputTokens | 0,
        cache_read: e.cacheRead | 0,
        cache_creation: e.cacheCreation | 0,
        raw_input: e.rawInput | 0,
        context: e.context != null ? String(e.context) : null,
        context_name: e.contextName ?? null,
        machine: e.machine ?? machine,
      });
    }
    for (const p of (usage.promptStats || [])) {
      const ts = Number(p.timestamp);
      if (!ts) continue;
      insPrompts.run(scope, p.sessionId ?? '', ts, p.charLen | 0, p.preview ?? null, p.machine ?? machine);
      if (insFts && p.text) {
        delFts.run(scope, p.sessionId ?? '', ts);
        insFts.run(String(p.text), scope, p.sessionId ?? '', ts, p.machine ?? machine);
      }
    }
    for (const s of (usage.skills || [])) {
      const date = s.date ?? (s.timestamp ? new Date(s.timestamp).toISOString().slice(0, 10) : null);
      insSkill.run(scope, s.name ?? '', s.count || 1, date, s.machine ?? machine);
    }
    for (const a of (usage.agents || [])) {
      const date = a.date ?? (a.timestamp ? new Date(a.timestamp).toISOString().slice(0, 10) : null);
      insAgent.run(scope, a.name ?? '', a.count || 1, date, a.machine ?? machine);
    }
    for (const m of (usage.mcpCalls || [])) {
      const toolName = m.tool ?? m.name ?? '';
      const date = m.date ?? (m.timestamp ? new Date(m.timestamp).toISOString().slice(0, 10) : null);
      insMcp.run(scope, toolName, m.count || 1, date, m.machine ?? machine);
    }
    for (const l of (usage.latencyEntries || [])) {
      const ts = Number(l.timestamp);
      if (!ts) continue;
      insLatency.run(scope, l.sessionId ?? null, ts, l.latencyMs || l.latency_ms || 0, l.model ?? null, l.machine ?? machine);
    }
  });
  tx();
}

// ── Query operations ───────────────────────────────────────────────────────

/**
 * Query token entries only for a scope within [from, to] (ms epoch).
 * Returns the camelCase entry shape the browser expects.
 */
export function queryTokenEntries(db, scope, from, to) {
  const fromMs = Number.isFinite(from) ? from : 0;
  const toMs = Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER;
  return db.prepare(`
    SELECT session_id, timestamp, model, input_tokens, output_tokens,
           cache_read, cache_creation, raw_input, context, context_name, machine
    FROM token_entries
    WHERE scope = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `).all(scope, fromMs, toMs).map(r => ({
    sessionId: r.session_id,
    timestamp: r.timestamp,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheRead: r.cache_read,
    cacheCreation: r.cache_creation,
    rawInput: r.raw_input,
    context: r.context,
    contextName: r.context_name,
    machine: r.machine,
  }));
}

/**
 * Query usage data for a scope within [from, to] (ms epoch).
 * Returns the same shape the browser expects from data-usage.js.
 */
export function queryUsage(db, scope, from, to) {
  const fromMs = Number.isFinite(from) ? from : 0;
  const toMs = Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER;

  const tokenEntries = queryTokenEntries(db, scope, fromMs, toMs);

  const promptStats = db.prepare(`
    SELECT session_id, timestamp, char_len, preview, machine
    FROM prompt_entries
    WHERE scope = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `).all(scope, fromMs, toMs).map(r => ({
    sessionId: r.session_id || null,
    timestamp: r.timestamp,
    charLen: r.char_len,
    preview: r.preview,
    machine: r.machine,
  }));

  // Convert epoch ms to YYYY-MM-DD, clamped to valid Date range.
  const msToDate = (ms) => {
    if (!Number.isFinite(ms) || ms > 8640000000000000) return null;
    return new Date(ms).toISOString().slice(0, 10);
  };
  const dateFrom = msToDate(fromMs) || '1970-01-01';
  const dateTo   = msToDate(toMs)   || '9999-12-31';

  // skills/agents: add a numeric timestamp derived from date string for period filtering
  const toTs = (dateStr) => dateStr ? new Date(dateStr).getTime() || null : null;

  // Date filter uses BETWEEN on the date column; NULL-dated rows are always included
  // (they predate the date field and should not be silently dropped).
  const skills = db.prepare(`
    SELECT name, count, date FROM skill_usage
    WHERE scope = ? AND (date IS NULL OR date BETWEEN ? AND ?)
  `).all(scope, dateFrom, dateTo)
    .map(r => ({ name: r.name, count: r.count, date: r.date, timestamp: toTs(r.date) }));
  const agents = db.prepare(`
    SELECT name, count, date FROM agent_usage
    WHERE scope = ? AND (date IS NULL OR date BETWEEN ? AND ?)
  `).all(scope, dateFrom, dateTo)
    .map(r => ({ name: r.name, count: r.count, date: r.date, timestamp: toTs(r.date) }));
  // mcpCalls: map 'tool' column → 'name' to match the shape the browser expects
  const mcpCalls = db.prepare(`
    SELECT tool, count, date FROM mcp_calls
    WHERE scope = ? AND (date IS NULL OR date BETWEEN ? AND ?)
  `).all(scope, dateFrom, dateTo)
    .map(r => ({ name: r.tool, count: r.count, date: r.date, timestamp: toTs(r.date) }));

  const latencyEntries = db.prepare(`
    SELECT session_id AS sessionId, timestamp, latency_ms AS latencyMs, machine
    FROM latency_entries
    WHERE scope = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `).all(scope, fromMs, toMs);

  return {
    tokenEntries,
    promptStats,
    latencyEntries,
    skills,
    agents,
    mcpCalls,
  };
}

/** Return all distinct (context_name, context) pairs — used by buildTaskCategories. */
export function queryContextNames(db) {
  return db.prepare(
    'SELECT DISTINCT context_name AS contextName, context AS contextType FROM token_entries WHERE context_name IS NOT NULL'
  ).all();
}

/** Return the earliest and latest token timestamps across all scopes. */
export function queryDateRange(db) {
  const row = db.prepare('SELECT MIN(timestamp) AS earliest, MAX(timestamp) AS latest FROM token_entries').get();
  return row?.earliest != null ? { earliest: row.earliest, latest: row.latest } : null;
}

/**
 * Count total token_entries rows across all monthly DBs in outputDir.
 * Returns 0 if no DBs exist or all are empty. Never throws.
 */
export function countDbRows(outputDir) {
  try {
    const dbs = listMonthlyDbs(outputDir);
    let total = 0;
    for (const { path: p } of dbs) {
      try {
        const db = openDb(p);
        const r = db.prepare('SELECT COUNT(*) as n FROM token_entries').get();
        total += r?.n ?? 0;
        db.close();
      } catch { /* skip unreadable DB */ }
    }
    return total;
  } catch { return 0; }
}

/**
 * Detect and auto-recover stale mtime-index.
 *
 * Case 1 (complete loss): mtime-index has ≥threshold entries but all monthly DBs are empty.
 * Case 2 (partial loss): mtime-index references files with mtimes covering months that have
 *   no corresponding monthly DB file. Clears only those months' entries from the mtime-index
 *   so the next build re-parses them.
 *
 * @param {string} outputDir  - e.g. path.join(ROOT, 'output')
 * @param {string} mtimeIndexPath - absolute path to mtime-index.json
 * @param {number} [threshold=50] - minimum cached count before check fires
 * @returns {{ recovered: boolean, cachedCount: number, dbRows: number }}
 */
export function recoverIfCorrupt(outputDir, mtimeIndexPath, threshold = 50) {
  try {
    if (!fs.existsSync(mtimeIndexPath)) return { recovered: false, cachedCount: 0, dbRows: 0 };

    let index;
    try { index = JSON.parse(fs.readFileSync(mtimeIndexPath, 'utf8')); } catch { return { recovered: false, cachedCount: 0, dbRows: 0 }; }
    const cachedCount = Object.keys(index).filter(k => !k.startsWith('_')).length;
    if (cachedCount < threshold) return { recovered: false, cachedCount, dbRows: -1 };

    // Single listMonthlyDbs call: derive both dbRows and existingMonths
    const monthly = listMonthlyDbs(outputDir);
    let dbRows = 0;
    const existingMonths = new Set();
    for (const { year, month, path: p } of monthly) {
      existingMonths.add(toMonthKey(year, month));
      try {
        const db = openDb(p);
        dbRows += db.prepare('SELECT COUNT(*) AS n FROM token_entries').get()?.n ?? 0;
        db.close();
      } catch { /* skip unreadable DB */ }
    }

    // Case 1: DB completely empty — nuke mtime-index + all empty DBs.
    // Also remove -wal/-shm siblings: a concurrent open connection (e.g. serve.mjs)
    // can prevent WAL checkpointing, and the DB is recreated at the same path in
    // this very run, so the orphan cleanup in listMonthlyDbs would never fire.
    if (dbRows === 0) {
      try { fs.unlinkSync(mtimeIndexPath); } catch { /* ignore */ }
      for (const { path: p } of monthly) {
        for (const f of [p, `${p}-wal`, `${p}-shm`]) {
          try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
      }
      return { recovered: true, cachedCount, dbRows: 0, existingMonths };
    }

    // Case 2: Partial loss — collect {key, month} pairs, then remove those in missing months
    const entryMonths = [];
    const coveredMonths = new Set();
    for (const [key, val] of Object.entries(index)) {
      if (key.startsWith('_')) continue;
      const mtimeMs = typeof val === 'number' ? val : null;
      if (!mtimeMs) continue;
      const d = new Date(mtimeMs);
      const month = toMonthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
      entryMonths.push({ key, month });
      coveredMonths.add(month);
    }
    const missingMonths = [...coveredMonths].filter(m => !existingMonths.has(m));
    if (missingMonths.length === 0) return { recovered: false, cachedCount, dbRows, existingMonths };

    const missingSet = new Set(missingMonths);
    let removed = 0;
    for (const { key, month } of entryMonths) {
      if (missingSet.has(month)) { delete index[key]; removed++; }
    }

    if (removed > 0) {
      try { fs.writeFileSync(mtimeIndexPath, JSON.stringify(index)); } catch { /* best effort */ }
    }
    return { recovered: true, cachedCount, dbRows, missingMonths, removedEntries: removed, existingMonths };
  } catch { return { recovered: false, cachedCount: 0, dbRows: 0 }; }
}

// ── Cross-machine import / merge ───────────────────────────────────────────
//
// Workflow (the dashboard's SQLite files are per-machine; this merges them):
//   1. On machine B, copy its monthly DB files
//        <plugin>/output/db/YYYY/YYYY-MM.sqlite
//      into any synced folder (iCloud Drive, git repo, USB, ...). Copy when no
//      Claude session is actively writing so the WAL is checkpointed; the
//      plain .sqlite files are enough (-wal/-shm need not be copied).
//   2. On machine A:
//        node scripts/db.mjs --import <synced folder> [--machine <id-for-v1-files>]
//      The directory is scanned recursively, so both a flat copy and the full
//      db/YYYY/ tree work.
//   3. Rebuild / refresh the dashboard — the Tokens page shows a per-machine
//      breakdown once more than one machine is present.
//
// Idempotent: rows are inserted with INSERT OR IGNORE on machine-inclusive
// unique keys; count tables use max(count, excluded.count). Re-running the
// import never duplicates rows or inflates counts.

/** Recursively collect monthly DB files (YYYY-MM.sqlite) under dir. */
function findMonthlyDbFiles(dir, depth = 0, results = []) {
  if (depth > 4) return results; // sanity bound — db/YYYY/ is only 2 deep
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) findMonthlyDbFiles(p, depth + 1, results);
    else if (/^(\d{4})-(\d{2})\.sqlite$/.test(ent.name)) {
      const m = ent.name.match(/^(\d{4})-(\d{2})\.sqlite$/);
      results.push({ year: parseInt(m[1], 10), month: parseInt(m[2], 10), path: p });
    }
  }
  return results;
}

/**
 * Merge another machine's monthly DB files into the local monthly DBs.
 *
 * Source files are opened read-only and are NEVER migrated (a v1 source from
 * an old install must not be stamped with the local machine id). Rows lacking
 * a machine value (v1 schema or empty string) are stamped with
 * `fallbackMachine` instead.
 *
 * @param {string} srcDir     directory containing copied YYYY-MM.sqlite files
 * @param {string} outputDir  local output dir (the one holding db/YYYY/...)
 * @param {{ fallbackMachine?: string, log?: (msg: string) => void }} [opts]
 * @returns {{ files: number, inserted: Record<string, number> }}
 */
export function importUsageDir(srcDir, outputDir, opts = {}) {
  const { fallbackMachine = 'unknown', log = () => {} } = opts;
  const Database = require('better-sqlite3');

  const files = findMonthlyDbFiles(srcDir);
  const inserted = {
    tokenEntries: 0, promptEntries: 0, skills: 0, agents: 0, mcpCalls: 0, latencyEntries: 0,
  };

  for (const { year, month, path: srcPath } of files) {
    const src = new Database(srcPath, { readonly: true, fileMustExist: true });
    let dest;
    try {
      const hasTable = (name) =>
        !!src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
      const hasMachineCol = (table) =>
        src.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === 'machine');
      const rowMachine = (r, withMachine) =>
        (withMachine && r.machine) ? r.machine : fallbackMachine;

      dest = openDb(getMonthlyDbPath(outputDir, year, month)); // migrates local DB to v2 if needed

      const insTokens = dest.prepare(`
        INSERT OR IGNORE INTO token_entries
          (scope, session_id, timestamp, model, input_tokens, output_tokens,
           cache_read, cache_creation, raw_input, context, context_name, machine)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insPrompts = dest.prepare(`
        INSERT OR IGNORE INTO prompt_entries (scope, session_id, timestamp, char_len, preview, machine)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      // Counts are running totals per (scope, name, date, machine) — the source
      // may have grown since the last import, so raise to the source value when
      // larger. Both steps are idempotent and monotonic; re-import never
      // inflates counts. Insert/update are split so `inserted` only reports
      // genuinely new rows.
      const insSkill = dest.prepare(`
        INSERT OR IGNORE INTO skill_usage (scope, name, count, date, machine) VALUES (?, ?, ?, ?, ?)
      `);
      const updSkill = dest.prepare(`
        UPDATE skill_usage SET count = ?
        WHERE scope = ? AND name = ? AND date IS ? AND machine = ? AND count < ?
      `);
      const insAgent = dest.prepare(`
        INSERT OR IGNORE INTO agent_usage (scope, name, count, date, machine) VALUES (?, ?, ?, ?, ?)
      `);
      const updAgent = dest.prepare(`
        UPDATE agent_usage SET count = ?
        WHERE scope = ? AND name = ? AND date IS ? AND machine = ? AND count < ?
      `);
      const insMcp = dest.prepare(`
        INSERT OR IGNORE INTO mcp_calls (scope, tool, count, date, machine) VALUES (?, ?, ?, ?, ?)
      `);
      const updMcp = dest.prepare(`
        UPDATE mcp_calls SET count = ?
        WHERE scope = ? AND tool = ? AND date IS ? AND machine = ? AND count < ?
      `);
      const insLatency = dest.prepare(`
        INSERT OR IGNORE INTO latency_entries (scope, session_id, timestamp, latency_ms, model, machine)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      dest.transaction(() => {
        if (hasTable('token_entries')) {
          const wm = hasMachineCol('token_entries');
          for (const r of src.prepare('SELECT * FROM token_entries').iterate()) {
            const info = insTokens.run(
              r.scope, r.session_id, r.timestamp, r.model, r.input_tokens, r.output_tokens,
              r.cache_read, r.cache_creation, r.raw_input, r.context, r.context_name,
              rowMachine(r, wm)
            );
            inserted.tokenEntries += info.changes;
          }
        }
        if (hasTable('prompt_entries')) {
          const wm = hasMachineCol('prompt_entries');
          for (const r of src.prepare('SELECT * FROM prompt_entries').iterate()) {
            const info = insPrompts.run(
              r.scope, r.session_id ?? '', r.timestamp, r.char_len, r.preview, rowMachine(r, wm)
            );
            inserted.promptEntries += info.changes;
          }
        }
        if (hasTable('skill_usage')) {
          const wm = hasMachineCol('skill_usage');
          for (const r of src.prepare('SELECT * FROM skill_usage').iterate()) {
            const m = rowMachine(r, wm);
            const ins = insSkill.run(r.scope, r.name, r.count, r.date, m).changes;
            inserted.skills += ins;
            if (!ins) updSkill.run(r.count, r.scope, r.name, r.date, m, r.count);
          }
        }
        if (hasTable('agent_usage')) {
          const wm = hasMachineCol('agent_usage');
          for (const r of src.prepare('SELECT * FROM agent_usage').iterate()) {
            const m = rowMachine(r, wm);
            const ins = insAgent.run(r.scope, r.name, r.count, r.date, m).changes;
            inserted.agents += ins;
            if (!ins) updAgent.run(r.count, r.scope, r.name, r.date, m, r.count);
          }
        }
        if (hasTable('mcp_calls')) {
          const wm = hasMachineCol('mcp_calls');
          for (const r of src.prepare('SELECT * FROM mcp_calls').iterate()) {
            const m = rowMachine(r, wm);
            const ins = insMcp.run(r.scope, r.tool, r.count, r.date, m).changes;
            inserted.mcpCalls += ins;
            if (!ins) updMcp.run(r.count, r.scope, r.tool, r.date, m, r.count);
          }
        }
        if (hasTable('latency_entries')) {
          const wm = hasMachineCol('latency_entries');
          for (const r of src.prepare('SELECT * FROM latency_entries').iterate()) {
            const info = insLatency.run(
              r.scope, r.session_id, r.timestamp, r.latency_ms, r.model, rowMachine(r, wm)
            );
            inserted.latencyEntries += info.changes;
          }
        }
      })();

      log(`  ${toMonthKey(year, month)}.sqlite — merged`);
    } finally {
      try { src.close(); } catch { /* ignore */ }
      try { dest?.close(); } catch { /* ignore */ }
    }
  }

  return { files: files.length, inserted };
}

// ── CLI: node scripts/db.mjs --import <dir> [--machine <id>] [--output <dir>] ─

const __dbCliFile = fileURLToPath(import.meta.url);
if (process.argv[1] && __dbCliFile === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const flagValue = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };

  if (args.includes('--import')) {
    const srcDir = flagValue('--import');
    if (!srcDir || !fs.existsSync(srcDir)) {
      console.error('oh-my-hi: --import requires an existing directory of copied YYYY-MM.sqlite files');
      process.exit(1);
    }
    const outputDir = flagValue('--output')
      || process.env.OMH_OUTPUT_DIR
      || path.resolve(path.dirname(__dbCliFile), '..', 'output');
    const fallbackMachine = flagValue('--machine') || 'unknown';

    console.log(`oh-my-hi: importing usage DBs from ${srcDir}`);
    console.log(`  → local output: ${outputDir} (this machine: ${getMachineId()})`);
    const result = importUsageDir(path.resolve(srcDir), outputDir, {
      fallbackMachine,
      log: (msg) => console.log(msg),
    });
    if (result.files === 0) {
      console.log('  no YYYY-MM.sqlite files found — nothing to import');
    } else {
      const s = result.inserted;
      console.log(`  ✅ ${result.files} file(s) merged — new rows: `
        + `tokens ${s.tokenEntries}, prompts ${s.promptEntries}, skills ${s.skills}, `
        + `agents ${s.agents}, mcp ${s.mcpCalls}, latency ${s.latencyEntries}`);
      console.log('  (re-running the same import is safe — it is idempotent)');
    }
  } else {
    console.log('Usage: node scripts/db.mjs --import <dir> [--machine <fallback-id>] [--output <outputDir>]');
    console.log('  Merges another machine\'s monthly usage DBs (YYYY-MM.sqlite) into the local DBs.');
  }
}
