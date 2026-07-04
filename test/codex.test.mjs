// @ts-check
// codex.test.mjs — Codex provider: normalization, rollout parsing, DB round-trip.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { codexProvider, collectRolloutFiles, parseCodexStructure, codexPromptPreview } from '../scripts/providers/codex.mjs';
import { calcEntryCost, resolvePricingKey, PRICING_FALLBACK } from '../scripts/export.mjs';

function tmpCodexHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omh-codex-'));
}

/** Write a rollout file at sessions/YYYY/MM/DD/rollout-<id>.jsonl */
function writeRollout(home, sub, name, lines) {
  const dir = path.join(home, sub, '2026', '06', '02');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

test('codexProvider.configDir honors CODEX_HOME env', () => {
  const prev = process.env.CODEX_HOME;
  process.env.CODEX_HOME = '/tmp/omh-codex-home';
  try {
    assert.strictEqual(codexProvider.configDir(), '/tmp/omh-codex-home');
  } finally {
    if (prev === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prev;
  }
});

test('normalizeUsage: cached ⊆ input, reasoning folded into output, no cache-creation', () => {
  const out = codexProvider.normalizeUsage({
    input_tokens: 1000,
    cached_input_tokens: 250,
    output_tokens: 125,
    reasoning_output_tokens: 75,
  });
  assert.deepStrictEqual(out, {
    inputTokens: 1000,      // already total
    outputTokens: 200,      // 125 + 75 reasoning
    cacheRead: 250,
    cacheCreation: 0,
    rawInput: 750,          // 1000 - 250 uncached
  });
});

test('normalizeUsage clamps cached to input (never negative rawInput)', () => {
  const out = codexProvider.normalizeUsage({ input_tokens: 100, cached_input_tokens: 500 });
  assert.strictEqual(out.cacheRead, 100);
  assert.strictEqual(out.rawInput, 0);
});

test('parseUsage: turn_context model + token_count → normalized entries', async () => {
  const home = tmpCodexHome();
  try {
    writeRollout(home, 'sessions', 'rollout-abc.jsonl', [
      { timestamp: '2026-06-02T09:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.5', cwd: '/proj' } },
      { timestamp: '2026-06-02T09:01:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: {
        model: 'gpt-5.5', time_to_first_token_ms: 420,
        last_token_usage: { input_tokens: 2000, cached_input_tokens: 1800, output_tokens: 100, reasoning_output_tokens: 50, total_tokens: 2150 },
        total_token_usage: { input_tokens: 2000, cached_input_tokens: 1800, output_tokens: 100, reasoning_output_tokens: 50, total_tokens: 2150 },
      } } },
      // idle/empty token_count is skipped
      { timestamp: '2026-06-02T09:02:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: {
        last_token_usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
      } } },
    ]);
    const usage = await codexProvider.parseUsage(home, 0);
    assert.strictEqual(usage.tokenEntries.length, 1);
    const e = usage.tokenEntries[0];
    assert.strictEqual(e.provider, 'codex');
    assert.strictEqual(e.model, 'gpt-5.5');
    assert.strictEqual(e.inputTokens, 2000);
    assert.strictEqual(e.cacheRead, 1800);
    assert.strictEqual(e.outputTokens, 150);
    assert.strictEqual(e.rawInput, 200);
    assert.strictEqual(e.context, 'general');
    // latency from time_to_first_token_ms
    assert.strictEqual(usage.latencyEntries.length, 1);
    assert.strictEqual(usage.latencyEntries[0].latencyMs, 420);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('parseUsage: extracts user prompts (for the session list / Context Explorer)', async () => {
  const home = tmpCodexHome();
  try {
    writeRollout(home, 'sessions', 'rollout-p.jsonl', [
      { timestamp: '2026-06-02T09:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.5' } },
      { timestamp: '2026-06-02T09:00:30.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'read the handoff doc please' } },
      { timestamp: '2026-06-02T09:01:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: {
        last_token_usage: { input_tokens: 100, output_tokens: 10 } } } },
      // developer/permission messages are response_item/message — not user prompts
      { timestamp: '2026-06-02T09:00:20.000Z', type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'permissions...' }] } },
    ]);
    const usage = await codexProvider.parseUsage(home, 0);
    assert.strictEqual(usage.promptStats.length, 1, 'one user prompt');
    assert.strictEqual(usage.promptStats[0].text, 'read the handoff doc please');
    assert.strictEqual(usage.promptStats[0].sessionId, 'rollout-p');
    assert.ok(usage.promptStats[0].charLen > 0);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('codexPromptPreview: extracts the real task from parallel-run system preambles', () => {
  // Task: label past the 200-char cutoff → extracted
  const withTask = 'You are working in /Users/x/proj on branch b. The user asked to do things. '
    + 'You are not alone in the codebase; do not revert. Ownership: a.ts and b.ts only. '
    + 'You may read any files, but only edit those two files. Task: improve canvas axis rendering for v1';
  assert.strictEqual(codexPromptPreview(withTask), 'improve canvas axis rendering for v1');
  // No Task: label → strip the working-dir lead
  assert.strictEqual(
    codexPromptPreview('You are working in /Users/x/proj. Implement a focused perf fix. Ownership: x.ts'),
    'Implement a focused perf fix. Ownership: x.ts');
  // Plain prompt passes through
  assert.strictEqual(codexPromptPreview('read the handoff doc'), 'read the handoff doc');
  // iCloud path with spaces
  assert.strictEqual(codexPromptPreview('You are working in /Users/x/Mobile Documents/work. do the thing'), 'do the thing');
});

test('parseUsage: cutoffMs filters out older entries', async () => {
  const home = tmpCodexHome();
  try {
    writeRollout(home, 'sessions', 'rollout-cut.jsonl', [
      { timestamp: '2026-06-02T09:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.5' } },
      { timestamp: '2026-06-01T00:00:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: {
        last_token_usage: { input_tokens: 10, output_tokens: 5 } } } },
      { timestamp: '2026-06-03T00:00:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: {
        last_token_usage: { input_tokens: 20, output_tokens: 6 } } } },
    ]);
    const cutoff = new Date('2026-06-02T00:00:00.000Z').getTime();
    const usage = await codexProvider.parseUsage(home, cutoff);
    assert.strictEqual(usage.tokenEntries.length, 1);
    assert.strictEqual(usage.tokenEntries[0].inputTokens, 20);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('parseUsage mtimeIndex skips unchanged files on re-parse', async () => {
  const home = tmpCodexHome();
  try {
    writeRollout(home, 'sessions', 'rollout-inc.jsonl', [
      { timestamp: '2026-06-02T09:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.5' } },
      { timestamp: '2026-06-02T09:01:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: {
        last_token_usage: { input_tokens: 100, output_tokens: 10 } } } },
    ]);
    const idx = {};
    const first = await codexProvider.parseUsage(home, 0, { mtimeIndex: idx });
    assert.strictEqual(first.tokenEntries.length, 1, 'first pass parses the file');
    assert.strictEqual(Object.keys(idx).length, 1, 'index records the file mtime');

    // Second pass with the same index: unchanged file is skipped.
    const second = await codexProvider.parseUsage(home, 0, { mtimeIndex: idx });
    assert.strictEqual(second.tokenEntries.length, 0, 'unchanged file skipped');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('pricing: gpt models resolve and cost is computed from Codex normalization', () => {
  assert.strictEqual(resolvePricingKey('gpt-5.5', PRICING_FALLBACK), 'gpt-5.5');
  assert.strictEqual(resolvePricingKey('gpt-5.1-codex-mini', PRICING_FALLBACK), 'gpt-5.1-codex-mini');
  // A gpt-5.5 turn: rawInput 1000, cacheRead 4000, output 400.
  const entry = { model: 'gpt-5.5', rawInput: 1000, cacheRead: 4000, cacheCreation: 0, outputTokens: 400 };
  const cost = calcEntryCost(entry, PRICING_FALLBACK);
  // 1000*5 + 400*30 + 4000*0.5 = 5000 + 12000 + 2000 = 19000 / 1e6 = 0.019
  assert.ok(Math.abs(cost - 0.019) < 1e-9, `cost ${cost}`);
});

test('pricing: unknown gpt model yields 0 cost (no guessing)', () => {
  assert.strictEqual(resolvePricingKey('gpt-9-imaginary', PRICING_FALLBACK), null);
  assert.strictEqual(calcEntryCost({ model: 'gpt-9-imaginary', rawInput: 100 }, PRICING_FALLBACK), 0);
});

test('parseCodexStructure: skills, memory, and MCP from config dir', () => {
  const home = tmpCodexHome();
  try {
    // skill (Claude SKILL.md layout)
    fs.mkdirSync(path.join(home, 'skills', 'backup'), { recursive: true });
    fs.writeFileSync(path.join(home, 'skills', 'backup', 'SKILL.md'),
      '---\nname: "backup"\ndescription: "Backup skill"\n---\n# Backup\n');
    // memory
    fs.mkdirSync(path.join(home, 'memories'), { recursive: true });
    fs.writeFileSync(path.join(home, 'memories', 'ctx.md'),
      '---\nname: ctx\ndescription: work context\ntype: project\n---\nbody\n');
    // MCP in config.toml
    fs.writeFileSync(path.join(home, 'config.toml'),
      '[mcp_servers.fs]\ncommand = "npx"\nargs = ["-y", "fs-mcp"]\n\n[projects."/x"]\n');

    const s = parseCodexStructure(home);
    assert.strictEqual(s.skills.length, 1);
    assert.strictEqual(s.skills[0].name, 'backup');
    assert.strictEqual(s.memory.length, 1);
    assert.strictEqual(s.memory[0].scope, 'codex');
    assert.strictEqual(s.memory[0].type, 'project');
    assert.strictEqual(s.mcpServers.length, 1);
    assert.strictEqual(s.mcpServers[0].name, 'fs');
    assert.strictEqual(s.mcpServers[0].command, 'npx');
    assert.deepStrictEqual(s.mcpServers[0].args, ['-y', 'fs-mcp']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('parseCodexStructure: empty/missing dirs return empty arrays', () => {
  const home = tmpCodexHome();
  try {
    const s = parseCodexStructure(home);
    assert.deepStrictEqual(s, { skills: [], memory: [], mcpServers: [] });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('collectRolloutFiles finds sessions and archived_sessions', () => {
  const home = tmpCodexHome();
  try {
    writeRollout(home, 'sessions', 'rollout-a.jsonl', [{ type: 'x' }]);
    writeRollout(home, 'archived_sessions', 'rollout-b.jsonl', [{ type: 'y' }]);
    const files = collectRolloutFiles(home);
    assert.strictEqual(files.length, 2);
    assert.ok(files.some(f => f.includes('archived_sessions')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('DB round-trip: provider column persists and returns', async () => {
  let dbMod;
  try { dbMod = await import('../scripts/db.mjs'); } catch { return; } // skip if better-sqlite3 unavailable
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-db-'));
  const dbPath = path.join(dir, 'test.sqlite');
  try {
    const db = dbMod.openDb(dbPath);
    dbMod.appendUsage(db, 'codex', {
      tokenEntries: [{
        sessionId: 's1', timestamp: Date.UTC(2026, 5, 2, 9, 0), model: 'gpt-5.5',
        inputTokens: 2000, outputTokens: 150, cacheRead: 1800, cacheCreation: 0, rawInput: 200,
        context: 'general', contextName: 'conversation', provider: 'codex',
      }],
    });
    const rows = dbMod.queryTokenEntries(db, 'codex', 0, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].provider, 'codex');
    assert.strictEqual(rows[0].cacheCreation, 0);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB: Claude entries default provider to claude when unset', async () => {
  let dbMod;
  try { dbMod = await import('../scripts/db.mjs'); } catch { return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-db-'));
  const dbPath = path.join(dir, 'test.sqlite');
  try {
    const db = dbMod.openDb(dbPath);
    dbMod.appendUsage(db, 'global', {
      tokenEntries: [{ sessionId: 's', timestamp: Date.UTC(2026, 5, 2), model: 'opus',
        inputTokens: 10, outputTokens: 5, cacheRead: 0, cacheCreation: 0, rawInput: 10 }],
    });
    const rows = dbMod.queryTokenEntries(db, 'global', 0, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(rows[0].provider, 'claude');
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
