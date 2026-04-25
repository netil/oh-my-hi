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

const CURRENT_SCHEMA_VERSION = 3;

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

/** Apply pending migrations. Each version step is an if/block so future
 *  versions can be added without touching earlier ones. */
function migrate(db) {
  const v = getSchemaVersion(db);
  if (v < 1) initV1(db);
  if (v < 2) migrateToV2(db);
  if (v < 3) migrateToV3(db);
}

function initV1(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_entries (
      scope TEXT NOT NULL,
      session_id TEXT,
      timestamp INTEGER NOT NULL,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read INTEGER DEFAULT 0,
      cache_creation INTEGER DEFAULT 0,
      raw_input INTEGER DEFAULT 0,
      context INTEGER DEFAULT 0,
      context_name TEXT,
      latency_ms INTEGER,
      char_len INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_te_scope_ts ON token_entries(scope, timestamp);

    CREATE TABLE IF NOT EXISTS prompt_stats (
      scope TEXT NOT NULL,
      date TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      session_count INTEGER DEFAULT 0,
      tool_call_count INTEGER DEFAULT 0,
      PRIMARY KEY (scope, date)
    );

    CREATE TABLE IF NOT EXISTS skill_usage (
      scope TEXT NOT NULL,
      name TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      date TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_usage (
      scope TEXT NOT NULL,
      name TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      date TEXT
    );

    CREATE TABLE IF NOT EXISTS mcp_calls (
      scope TEXT NOT NULL,
      tool TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      date TEXT
    );
  `);
  db.pragma(`user_version = 1`);
}

/** v1 → v2: change context column from INTEGER to TEXT. */
function migrateToV2(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_entries_v2 (
      scope TEXT NOT NULL,
      session_id TEXT,
      timestamp INTEGER NOT NULL,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read INTEGER DEFAULT 0,
      cache_creation INTEGER DEFAULT 0,
      raw_input INTEGER DEFAULT 0,
      context TEXT,
      context_name TEXT,
      latency_ms INTEGER,
      char_len INTEGER
    );
    INSERT INTO token_entries_v2 SELECT
      scope, session_id, timestamp, model,
      input_tokens, output_tokens, cache_read, cache_creation, raw_input,
      CAST(context AS TEXT), context_name, latency_ms, char_len
    FROM token_entries;
    DROP TABLE token_entries;
    ALTER TABLE token_entries_v2 RENAME TO token_entries;
    CREATE INDEX IF NOT EXISTS idx_te_scope_ts ON token_entries(scope, timestamp);
  `);
  db.pragma(`user_version = 2`);
}

/** v2 → v3: add unique index to enable INSERT OR IGNORE for incremental appends.
 *  Deduplicates existing rows first (keeps first rowid per key) to avoid
 *  UNIQUE constraint failures on databases that were written without the index. */
function migrateToV3(db) {
  db.exec(`
    DELETE FROM token_entries WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM token_entries
      GROUP BY scope, timestamp, input_tokens, output_tokens
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_te_unique
      ON token_entries(scope, timestamp, input_tokens, output_tokens);
  `);
  db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
}

/**
 * Replace all rows for a given scope with the supplied usage payload.
 * Idempotent: running twice with the same usage yields the same DB state.
 */
export function upsertUsage(db, scope, usage) {
  if (!usage) return;

  const delTokens = db.prepare('DELETE FROM token_entries WHERE scope = ?');
  const delPrompts = db.prepare('DELETE FROM prompt_stats WHERE scope = ?');
  const delSkills = db.prepare('DELETE FROM skill_usage WHERE scope = ?');
  const delAgents = db.prepare('DELETE FROM agent_usage WHERE scope = ?');
  const delMcp = db.prepare('DELETE FROM mcp_calls WHERE scope = ?');

  const insTokens = db.prepare(`
    INSERT INTO token_entries
      (scope, session_id, timestamp, model, input_tokens, output_tokens,
       cache_read, cache_creation, raw_input, context, context_name,
       latency_ms, char_len)
    VALUES (@scope, @session_id, @timestamp, @model, @input_tokens, @output_tokens,
            @cache_read, @cache_creation, @raw_input, @context, @context_name,
            @latency_ms, @char_len)
  `);
  const insPrompts = db.prepare(`
    INSERT OR REPLACE INTO prompt_stats
      (scope, date, message_count, session_count, tool_call_count)
    VALUES (@scope, @date, @message_count, @session_count, @tool_call_count)
  `);
  const insSkill = db.prepare('INSERT INTO skill_usage (scope, name, count, date) VALUES (?, ?, ?, ?)');
  const insAgent = db.prepare('INSERT INTO agent_usage (scope, name, count, date) VALUES (?, ?, ?, ?)');
  const insMcp = db.prepare('INSERT INTO mcp_calls (scope, tool, count, date) VALUES (?, ?, ?, ?)');

  const tx = db.transaction(() => {
    delTokens.run(scope);
    delPrompts.run(scope);
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
        latency_ms: e.latencyMs ?? null,
        char_len: e.charLen ?? null,
      });
    }
    for (const p of (usage.promptStats || [])) {
      insPrompts.run({
        scope,
        date: String(p.date || ''),
        message_count: p.messageCount | 0,
        session_count: p.sessionCount | 0,
        tool_call_count: p.toolCallCount | 0,
      });
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
  });
  tx();
}

/**
 * Append new usage entries to SQLite without deleting existing rows.
 * Uses INSERT OR IGNORE so re-running with the same data is safe.
 * Use this for incremental updates (--data-only); use upsertUsage for full rebuilds.
 */
export function appendUsage(db, scope, usage) {
  if (!usage) return;

  const insTokens = db.prepare(`
    INSERT OR IGNORE INTO token_entries
      (scope, session_id, timestamp, model, input_tokens, output_tokens,
       cache_read, cache_creation, raw_input, context, context_name,
       latency_ms, char_len)
    VALUES (@scope, @session_id, @timestamp, @model, @input_tokens, @output_tokens,
            @cache_read, @cache_creation, @raw_input, @context, @context_name,
            @latency_ms, @char_len)
  `);
  const insPrompts = db.prepare(`
    INSERT OR REPLACE INTO prompt_stats
      (scope, date, message_count, session_count, tool_call_count)
    VALUES (@scope, @date, @message_count, @session_count, @tool_call_count)
  `);
  const insSkill = db.prepare('INSERT INTO skill_usage (scope, name, count, date) VALUES (?, ?, ?, ?)');
  const insAgent = db.prepare('INSERT INTO agent_usage (scope, name, count, date) VALUES (?, ?, ?, ?)');
  const insMcp = db.prepare('INSERT INTO mcp_calls (scope, tool, count, date) VALUES (?, ?, ?, ?)');

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
        latency_ms: e.latencyMs ?? null,
        char_len: e.charLen ?? null,
      });
    }
    for (const p of (usage.promptStats || [])) {
      insPrompts.run({
        scope,
        date: String(p.date || ''),
        message_count: p.messageCount | 0,
        session_count: p.sessionCount | 0,
        tool_call_count: p.toolCallCount | 0,
      });
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
  });
  tx();
}

/**
 * Query usage data for a scope within [from, to] (ms epoch).
 * Returns the same shape the browser expects from data-usage.js.
 */
export function queryUsage(db, scope, from, to) {
  const fromMs = Number.isFinite(from) ? from : 0;
  const toMs = Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER;

  const tokenRows = db.prepare(`
    SELECT session_id, timestamp, model, input_tokens, output_tokens,
           cache_read, cache_creation, raw_input, context, context_name,
           latency_ms, char_len
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
    latencyMs: r.latency_ms,
    charLen: r.char_len,
  }));

  const promptRows = db.prepare(`
    SELECT date, message_count, session_count, tool_call_count
    FROM prompt_stats
    WHERE scope = ?
    ORDER BY date
  `).all(scope);
  const promptStats = promptRows.map(r => ({
    date: r.date,
    messageCount: r.message_count,
    sessionCount: r.session_count,
    toolCallCount: r.tool_call_count,
  }));

  // skills/agents: add a numeric timestamp derived from date string for period filtering
  const toTs = (dateStr) => dateStr ? new Date(dateStr).getTime() || null : null;

  const skills = db.prepare('SELECT name, count, date FROM skill_usage WHERE scope = ?').all(scope)
    .map(r => ({ name: r.name, count: r.count, date: r.date, timestamp: toTs(r.date) }));
  const agents = db.prepare('SELECT name, count, date FROM agent_usage WHERE scope = ?').all(scope)
    .map(r => ({ name: r.name, count: r.count, date: r.date, timestamp: toTs(r.date) }));
  // mcpCalls: map 'tool' column → 'name' to match the shape the browser expects
  const mcpCalls = db.prepare('SELECT tool, count, date FROM mcp_calls WHERE scope = ?').all(scope)
    .map(r => ({ name: r.tool, count: r.count, date: r.date, timestamp: toTs(r.date) }));

  return {
    tokenEntries,
    promptStats,
    latencyEntries: [],
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

