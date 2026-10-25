// usage-v4.test.mjs: idempotent usage storage (schema v4), transcript
// de-duplication, pre-v4 row cleanup and the shared pricing module.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

import {
  openDb,
  getMachineId,
  appendUsage,
  appendUsageMonthly,
  getMonthlyDbPath,
  queryUsage,
  queryUsageMultiDb,
  hasLegacyRows,
  purgeLegacyRows,
} from '../scripts/db.mjs';
import { parseUsage } from '../scripts/parsers/usage.mjs';
import { PRICING_FALLBACK, pricingKeyFor, entryCost } from '../templates/pricing.mjs';

const require = createRequire(import.meta.url);
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'omh-v4-'));
const cleanDir = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const count = (db, sql, ...args) => db.prepare(sql).get(...args).c;

describe('schema v4: idempotent writes', () => {
  it('stores one token row per message id, however often it is written', () => {
    const db = openDb(':memory:');
    const e = { messageId: 'msg_1', sessionId: 's', timestamp: 1000, model: 'claude-opus-5-5', inputTokens: 2, outputTokens: 50 };
    // the same message seen on a later line (different timestamp), then the whole batch again
    appendUsage(db, 'global', { tokenEntries: [e, { ...e, timestamp: 1500 }] });
    appendUsage(db, 'global', { tokenEntries: [e] });
    assert.equal(count(db, 'SELECT COUNT(*) AS c FROM token_entries'), 1);
    db.close();
  });

  it('counts each skill/agent/mcp call once by its event id', () => {
    const db = openDb(':memory:');
    const usage = {
      skills: [
        { id: 'toolu_a', name: 'unslop', timestamp: 2000 },
        { id: 'toolu_b', name: 'unslop', timestamp: 3000 },
      ],
      agents: [{ id: 'toolu_c', name: 'Explore', timestamp: 2000 }],
      mcpCalls: [{ id: 'toolu_d', name: 'github', tool: 'mcp__github__get', timestamp: 2000 }],
    };
    appendUsage(db, 'global', usage);
    appendUsage(db, 'global', usage); // re-parsed transcript, retry or rescue replay
    assert.equal(count(db, "SELECT SUM(count) AS c FROM skill_usage WHERE name = 'unslop'"), 2);
    assert.equal(count(db, 'SELECT SUM(count) AS c FROM agent_usage'), 1);
    assert.equal(count(db, 'SELECT SUM(count) AS c FROM mcp_calls'), 1);
    db.close();
  });

  it('returns each call with its own timestamp and local date', () => {
    const db = openDb(':memory:');
    // 2026-10-23 08:30 local is still 10-22 or 10-23 in UTC depending on the zone;
    // the stored date must be the local one.
    const ts = new Date(2026, 9, 23, 8, 30).getTime();
    appendUsage(db, 'global', { skills: [{ id: 'toolu_x', name: 'unslop', timestamp: ts }] });
    const [row] = queryUsage(db, 'global', ts - 1000, ts + 1000).skills;
    assert.equal(row.timestamp, ts);
    assert.equal(row.date, '2026-10-23');
    assert.equal(count(db, "SELECT COUNT(*) AS c FROM skill_usage WHERE date = '2026-10-23'"), 1);
    db.close();
  });
});

describe('schema v4: reading calls back', () => {
  it('keeps every call with its own time and names MCP calls by server', () => {
    const db = openDb(':memory:');
    appendUsage(db, 'global', {
      skills: [{ id: 't1', name: 'a', timestamp: 1000 }, { id: 't2', name: 'a', timestamp: 2000 }],
      mcpCalls: [{ id: 't3', name: 'chrome', tool: 'mcp__chrome__navigate', timestamp: 1500 }],
    });
    const u = queryUsageMultiDb([db], 'global', 0, 9999);
    // same name and day: still two calls, not one merged row
    assert.deepEqual(u.skills.map(s => [s.name, s.count, s.timestamp]), [['a', 1, 1000], ['a', 1, 2000]]);
    assert.deepEqual(u.mcpCalls.map(m => [m.name, m.tool]), [['chrome', 'mcp__chrome__navigate']]);
    db.close();
  });
});

describe('schema v4: migration and pre-v4 cleanup', () => {
  function createV3Db(dbPath) {
    const Database = require('better-sqlite3');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE token_entries (
        scope TEXT NOT NULL, session_id TEXT, timestamp INTEGER NOT NULL, model TEXT,
        input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cache_read INTEGER DEFAULT 0,
        cache_creation INTEGER DEFAULT 0, raw_input INTEGER DEFAULT 0, context TEXT, context_name TEXT,
        machine TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'claude');
      CREATE UNIQUE INDEX idx_te_unique ON token_entries(scope, timestamp, model, input_tokens, output_tokens, machine);
      CREATE TABLE prompt_entries (scope TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '', timestamp INTEGER NOT NULL,
        char_len INTEGER DEFAULT 0, preview TEXT, machine TEXT NOT NULL DEFAULT '', UNIQUE(scope, session_id, timestamp, machine));
      CREATE TABLE skill_usage (scope TEXT NOT NULL, name TEXT NOT NULL, count INTEGER DEFAULT 0, date TEXT,
        machine TEXT NOT NULL DEFAULT '', UNIQUE(scope, name, date, machine));
      CREATE TABLE agent_usage (scope TEXT NOT NULL, name TEXT NOT NULL, count INTEGER DEFAULT 0, date TEXT,
        machine TEXT NOT NULL DEFAULT '', UNIQUE(scope, name, date, machine));
      CREATE TABLE mcp_calls (scope TEXT NOT NULL, tool TEXT NOT NULL, count INTEGER DEFAULT 0, date TEXT,
        machine TEXT NOT NULL DEFAULT '', UNIQUE(scope, tool, date, machine));
      CREATE TABLE latency_entries (scope TEXT NOT NULL, session_id TEXT, timestamp INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL, model TEXT, machine TEXT NOT NULL DEFAULT '', UNIQUE(scope, timestamp, session_id, machine));
      PRAGMA user_version = 3;
    `);
    return db;
  }

  it('keeps pre-v4 aggregates under a synthetic id and replaces those still backed by transcripts', () => {
    const out = tempDir();
    const me = getMachineId();
    const dbPath = getMonthlyDbPath(out, 2026, 9);
    try {
      const old = createV3Db(dbPath);
      const tsOld = Date.UTC(2026, 8, 10);   // before the oldest surviving transcript
      const tsKept = Date.UTC(2026, 8, 20);  // re-parsed this run
      for (const [t, n] of [[tsOld, 1], [tsKept, 2], [tsKept + 1, 3]]) {
        old.prepare('INSERT INTO token_entries (scope, timestamp, model, input_tokens, output_tokens, machine) VALUES (?, ?, ?, ?, ?, ?)')
          .run('global', t, 'claude-opus-5', n, n, me);
      }
      old.prepare("INSERT INTO skill_usage VALUES ('global', 'unslop', 9, '2026-09-10', ?)").run(me);
      old.prepare("INSERT INTO skill_usage VALUES ('global', 'unslop', 65, '2026-09-20', ?)").run(me);
      old.close();

      const db = openDb(dbPath); // v3 → v4
      assert.equal(count(db, "SELECT COUNT(*) AS c FROM skill_usage WHERE event_id LIKE 'agg:%'"), 2);
      db.close();
      assert.equal(hasLegacyRows(out, me), true);

      const deleted = purgeLegacyRows(out, 'global', tsKept, me);
      assert.equal(deleted, 3, 'two token rows and one aggregate from the re-parsed window');
      appendUsageMonthly(out, 'global', {
        tokenEntries: [{ messageId: 'msg_1', timestamp: tsKept, model: 'claude-opus-5', inputTokens: 2, outputTokens: 2 }],
        skills: [{ id: 'toolu_1', name: 'unslop', timestamp: tsKept }],
      });

      const after = openDb(dbPath);
      assert.equal(count(after, 'SELECT COUNT(*) AS c FROM token_entries'), 2, 'older legacy row + re-parsed row');
      assert.equal(count(after, "SELECT SUM(count) AS c FROM skill_usage WHERE date < '2026-09-15'"), 9, 'older aggregate kept');
      assert.equal(count(after, "SELECT SUM(count) AS c FROM skill_usage WHERE date >= '2026-09-15'"), 1, 'inflated aggregate replaced');
      after.close();
    } finally {
      cleanDir(out);
    }
  });

  it('reports no legacy rows for a DB written only by v4', () => {
    const out = tempDir();
    try {
      appendUsageMonthly(out, 'global', {
        tokenEntries: [{ messageId: 'msg_1', timestamp: Date.UTC(2026, 9, 1), model: 'claude-opus-5-5', inputTokens: 1, outputTokens: 1 }],
        skills: [{ id: 'toolu_1', name: 'unslop', timestamp: Date.UTC(2026, 9, 1) }],
      });
      assert.equal(hasLegacyRows(out), false);
    } finally {
      cleanDir(out);
    }
  });
});

describe('transcript parsing: one token entry per message', () => {
  it('collapses the per-block lines of a message and attributes it to the block that called a tool', async () => {
    const configDir = tempDir();
    try {
      const projDir = path.join(configDir, 'projects', '-tmp-proj');
      fs.mkdirSync(projDir, { recursive: true });
      const usage = { input_tokens: 2, output_tokens: 238, cache_read_input_tokens: 25591 };
      const line = (ts, content) => JSON.stringify({
        type: 'assistant', sessionId: 's1', timestamp: ts, requestId: 'req_1',
        message: { id: 'msg_1', model: 'claude-opus-5-5', usage, content },
      });
      fs.writeFileSync(path.join(projDir, 's1.jsonl'), [
        line('2026-10-23T11:35:58.835Z', [{ type: 'thinking', thinking: '' }]),
        line('2026-10-23T11:35:59.144Z', [{ type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill: 'unslop' } }]),
      ].join('\n'));

      const r = await parseUsage(configDir, 0, null, { cache: {} });
      assert.equal(r.tokenEntries.length, 1);
      assert.equal(r.tokenEntries[0].messageId, 'msg_1');
      assert.equal(r.tokenEntries[0].outputTokens, 238);
      assert.equal(r.tokenEntries[0].contextName, 'unslop');
      assert.deepEqual(r.skills.map(s => [s.id, s.name]), [['toolu_1', 'unslop']]);
    } finally {
      cleanDir(configDir);
    }
  });
});

describe('pricing module', () => {
  it('prices Claude 5 models instead of falling through to $0', () => {
    assert.equal(pricingKeyFor('claude-opus-5-5', PRICING_FALLBACK), 'opus-5-5');
    assert.equal(pricingKeyFor('claude-sonnet-5-5', PRICING_FALLBACK), 'sonnet-5-5');
    assert.equal(pricingKeyFor('claude-haiku-5-5', PRICING_FALLBACK), 'haiku-5-5');
    assert.equal(pricingKeyFor('claude-fable-5-1', PRICING_FALLBACK), 'fable-5-1');
    assert.equal(pricingKeyFor('claude-haiku-4-5-20251001', PRICING_FALLBACK), 'haiku-4-5');
    const cost = entryCost({ model: 'claude-opus-5-5', rawInput: 1e6, outputTokens: 1e6 }, PRICING_FALLBACK);
    assert.equal(cost, 4 + 20);
  });
});
