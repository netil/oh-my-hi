// @ts-check
// db.mjs — SQLite helper for oh-my-hi usage data.
//
// Backs the /api/usage endpoint and the optional on-disk snapshot that
// lives alongside data.json. SQLite is additive: if better-sqlite3 is not
// available (native module install failure), callers should catch the
// error from openDb() and fall back to the JSON flow.

import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Schema version rule: when the schema needs to change after release, bump
// CURRENT_SCHEMA_VERSION, add `if (v < N) migrateToVN(db)` in migrate(), and
// write migrateToVN ending with `db.pragma('user_version = N')` — always
// hardcode N, never use CURRENT_SCHEMA_VERSION inside a migration function.
const CURRENT_SCHEMA_VERSION = 1;

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
  if (v === 0) initSchema(db);
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
  // Future incremental migrations go here:
  // if (v < 2) migrateToV2(db);
}

/**
 * Fresh install: create the complete schema at the current version in one shot.
 * No incremental steps needed — this is the canonical final state.
 */
function initSchema(db) {
  db.transaction(() => {
    db.exec(`
      -- Token entries: one row per API call
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
        context_name  TEXT
      );
      CREATE INDEX idx_te_scope_ts ON token_entries(scope, timestamp);
      CREATE UNIQUE INDEX idx_te_unique
        ON token_entries(scope, timestamp, model, input_tokens, output_tokens);

      -- Prompt entries: one row per user message
      CREATE TABLE prompt_entries (
        scope      TEXT    NOT NULL,
        session_id TEXT    NOT NULL DEFAULT '',
        timestamp  INTEGER NOT NULL,
        char_len   INTEGER DEFAULT 0,
        preview    TEXT,
        UNIQUE(scope, session_id, timestamp)
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

      -- Skill / agent / mcp usage: one row per (scope, name/tool, date)
      CREATE TABLE skill_usage (
        scope TEXT NOT NULL,
        name  TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        date  TEXT,
        UNIQUE(scope, name, date)
      );
      CREATE INDEX idx_skill_usage_scope_date ON skill_usage(scope, date);

      CREATE TABLE agent_usage (
        scope TEXT NOT NULL,
        name  TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        date  TEXT,
        UNIQUE(scope, name, date)
      );
      CREATE INDEX idx_agent_usage_scope_date ON agent_usage(scope, date);

      CREATE TABLE mcp_calls (
        scope TEXT NOT NULL,
        tool  TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        date  TEXT,
        UNIQUE(scope, tool, date)
      );
      CREATE INDEX idx_mcp_calls_scope_date ON mcp_calls(scope, date);

      -- Latency entries: one row per measured API response time
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
    db.pragma('user_version = 1');
  })();
}

// ── Monthly DB path helpers ────────────────────────────────────────────────

/**
 * Returns the path for a specific year/month DB.
 * Layout: {outputDir}/db/{year}/{year}-{MM}.sqlite
 */
export function getMonthlyDbPath(outputDir, year, month) {
  return path.join(outputDir, 'db', String(year), `${year}-${String(month).padStart(2, '0')}.sqlite`);
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
    for (const file of fs.readdirSync(yearPath).sort()) {
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
 */
export function appendUsageMonthly(outputDir, scope, usage) {
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
    const [year, month] = key.split('-').map(Number);
    const dbPath = getMonthlyDbPath(outputDir, year, month);
    let db;
    try {
      db = openDb(dbPath);
      appendUsage(db, scope, monthUsage);
    } catch (e) {
      console.warn(`appendUsageMonthly: failed for ${key} —`, e.message);
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
      })),
      // Legacy prompt_stats are daily aggregates ({date, message_count, …}); individual
      // timestamps are not recoverable, so they cannot be stored in the new prompt_entries
      // table.  Skip rather than create misleading midnight-timestamp placeholders.
      promptStats: [],
      skills: skillRows.map(r => ({ name: r.name, count: r.count, date: r.date })),
      agents: agentRows.map(r => ({ name: r.name, count: r.count, date: r.date })),
      mcpCalls: mcpRows.map(r => ({ tool: r.tool, count: r.count, date: r.date })),
      latencyEntries: [],
    };

    appendUsageMonthly(outputDir, scope, usage);
  }
}

// ── Multi-DB query helpers ─────────────────────────────────────────────────

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
    for (const p of r.promptStats) promptMap.set(`${p.sessionId || ''}\0${p.timestamp}`, p);
    for (const s of r.skills) mergeCountMap(skillMap, s, 'name');
    for (const a of r.agents) mergeCountMap(agentMap, a, 'name');
    for (const m of r.mcpCalls) mergeCountMap(mcpMap, m, 'name');
    for (const l of r.latencyEntries) latencyMap.set(`${l.sessionId || ''}\0${l.timestamp}`, l);
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

// ── Scope-level write operations ───────────────────────────────────────────

/**
 * Replace all rows for a given scope with the supplied usage payload.
 * Idempotent: running twice with the same usage yields the same DB state.
 */
export function upsertUsage(db, scope, usage) {
  if (!usage) return;

  const delTokens = db.prepare('DELETE FROM token_entries WHERE scope = ?');
  const delPrompts = db.prepare('DELETE FROM prompt_entries WHERE scope = ?');
  const delLatency = db.prepare('DELETE FROM latency_entries WHERE scope = ?');
  const delSkills = db.prepare('DELETE FROM skill_usage WHERE scope = ?');
  const delAgents = db.prepare('DELETE FROM agent_usage WHERE scope = ?');
  const delMcp = db.prepare('DELETE FROM mcp_calls WHERE scope = ?');

  const insTokens = db.prepare(`
    INSERT INTO token_entries
      (scope, session_id, timestamp, model, input_tokens, output_tokens,
       cache_read, cache_creation, raw_input, context, context_name)
    VALUES (@scope, @session_id, @timestamp, @model, @input_tokens, @output_tokens,
            @cache_read, @cache_creation, @raw_input, @context, @context_name)
  `);
  const insPrompts = db.prepare(`
    INSERT OR REPLACE INTO prompt_entries (scope, session_id, timestamp, char_len, preview)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insSkill = db.prepare('INSERT INTO skill_usage (scope, name, count, date) VALUES (?, ?, ?, ?)');
  const insAgent = db.prepare('INSERT INTO agent_usage (scope, name, count, date) VALUES (?, ?, ?, ?)');
  const insMcp = db.prepare('INSERT INTO mcp_calls (scope, tool, count, date) VALUES (?, ?, ?, ?)');
  const insLatency = db.prepare(`
    INSERT OR IGNORE INTO latency_entries (scope, session_id, timestamp, latency_ms, model)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    delTokens.run(scope);
    delPrompts.run(scope);
    delLatency.run(scope);
    delSkills.run(scope);
    delAgents.run(scope);
    delMcp.run(scope);

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
      });
    }
    for (const p of (usage.promptStats || [])) {
      const ts = Number(p.timestamp);
      if (!ts) continue;
      insPrompts.run(scope, p.sessionId ?? '', ts, p.charLen | 0, p.preview ?? null);
    }
    for (const s of (usage.skills || [])) {
      const date = s.date ?? (s.timestamp ? new Date(s.timestamp).toISOString().slice(0, 10) : null);
      insSkill.run(scope, s.name ?? '', s.count || 1, date);
    }
    for (const a of (usage.agents || [])) {
      const date = a.date ?? (a.timestamp ? new Date(a.timestamp).toISOString().slice(0, 10) : null);
      insAgent.run(scope, a.name ?? '', a.count || 1, date);
    }
    for (const m of (usage.mcpCalls || [])) {
      const toolName = m.tool ?? m.name ?? '';
      const date = m.date ?? (m.timestamp ? new Date(m.timestamp).toISOString().slice(0, 10) : null);
      insMcp.run(scope, toolName, m.count || 1, date);
    }
    for (const l of (usage.latencyEntries || [])) {
      const ts = Number(l.timestamp);
      if (!ts) continue;
      insLatency.run(scope, l.sessionId ?? null, ts, l.latencyMs || l.latency_ms || 0, l.model ?? null);
    }
  });
  tx();
}

/**
 * Append new usage entries to SQLite without deleting existing rows.
 * Uses INSERT OR IGNORE for token_entries (dedup by unique key).
 * Uses ON CONFLICT DO UPDATE for skill/agent/mcp to accumulate counts.
 * Use this for incremental updates; use upsertUsage for full rebuilds.
 */
export function appendUsage(db, scope, usage) {
  if (!usage) return;

  const insTokens = db.prepare(`
    INSERT OR IGNORE INTO token_entries
      (scope, session_id, timestamp, model, input_tokens, output_tokens,
       cache_read, cache_creation, raw_input, context, context_name)
    VALUES (@scope, @session_id, @timestamp, @model, @input_tokens, @output_tokens,
            @cache_read, @cache_creation, @raw_input, @context, @context_name)
  `);
  const insPrompts = db.prepare(`
    INSERT OR REPLACE INTO prompt_entries (scope, session_id, timestamp, char_len, preview)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insSkill = db.prepare(`
    INSERT INTO skill_usage (scope, name, count, date) VALUES (?, ?, ?, ?)
    ON CONFLICT(scope, name, date) DO UPDATE SET count = count + excluded.count
  `);
  const insAgent = db.prepare(`
    INSERT INTO agent_usage (scope, name, count, date) VALUES (?, ?, ?, ?)
    ON CONFLICT(scope, name, date) DO UPDATE SET count = count + excluded.count
  `);
  const insMcp = db.prepare(`
    INSERT INTO mcp_calls (scope, tool, count, date) VALUES (?, ?, ?, ?)
    ON CONFLICT(scope, tool, date) DO UPDATE SET count = count + excluded.count
  `);
  const insLatency = db.prepare(`
    INSERT OR IGNORE INTO latency_entries (scope, session_id, timestamp, latency_ms, model)
    VALUES (?, ?, ?, ?, ?)
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
      });
    }
    for (const p of (usage.promptStats || [])) {
      const ts = Number(p.timestamp);
      if (!ts) continue;
      insPrompts.run(scope, p.sessionId ?? '', ts, p.charLen | 0, p.preview ?? null);
    }
    for (const s of (usage.skills || [])) {
      const date = s.date ?? (s.timestamp ? new Date(s.timestamp).toISOString().slice(0, 10) : null);
      insSkill.run(scope, s.name ?? '', s.count || 1, date);
    }
    for (const a of (usage.agents || [])) {
      const date = a.date ?? (a.timestamp ? new Date(a.timestamp).toISOString().slice(0, 10) : null);
      insAgent.run(scope, a.name ?? '', a.count || 1, date);
    }
    for (const m of (usage.mcpCalls || [])) {
      const toolName = m.tool ?? m.name ?? '';
      const date = m.date ?? (m.timestamp ? new Date(m.timestamp).toISOString().slice(0, 10) : null);
      insMcp.run(scope, toolName, m.count || 1, date);
    }
    for (const l of (usage.latencyEntries || [])) {
      const ts = Number(l.timestamp);
      if (!ts) continue;
      insLatency.run(scope, l.sessionId ?? null, ts, l.latencyMs || l.latency_ms || 0, l.model ?? null);
    }
  });
  tx();
}

// ── Query operations ───────────────────────────────────────────────────────

/**
 * Query usage data for a scope within [from, to] (ms epoch).
 * Returns the same shape the browser expects from data-usage.js.
 */
export function queryUsage(db, scope, from, to) {
  const fromMs = Number.isFinite(from) ? from : 0;
  const toMs = Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER;

  const tokenRows = db.prepare(`
    SELECT session_id, timestamp, model, input_tokens, output_tokens,
           cache_read, cache_creation, raw_input, context, context_name
    FROM token_entries
    WHERE scope = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `).all(scope, fromMs, toMs);

  const tokenEntries = tokenRows.map(r => ({
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
  }));

  const promptStats = db.prepare(`
    SELECT session_id, timestamp, char_len, preview
    FROM prompt_entries
    WHERE scope = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp
  `).all(scope, fromMs, toMs).map(r => ({
    sessionId: r.session_id || null,
    timestamp: r.timestamp,
    charLen: r.char_len,
    preview: r.preview,
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
    SELECT session_id AS sessionId, timestamp, latency_ms AS latencyMs
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
