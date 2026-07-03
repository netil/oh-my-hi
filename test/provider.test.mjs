// @ts-check
// provider.test.mjs — provider registry & Claude normalization seam.
import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { claudeProvider } from '../scripts/providers/claude.mjs';
import { PROVIDERS, getProvider, discoverProviders } from '../scripts/providers/index.mjs';

test('claudeProvider.configDir honors CLAUDE_CONFIG_DIR env', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = '/tmp/omh-test-claude';
  try {
    assert.strictEqual(claudeProvider.configDir(), '/tmp/omh-test-claude');
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev;
  }
});

test('claudeProvider.configDir falls back to ~/.claude', () => {
  const prevC = process.env.CLAUDE_CONFIG_DIR;
  const prevH = process.env.HOME;
  delete process.env.CLAUDE_CONFIG_DIR;
  process.env.HOME = '/home/tester';
  try {
    assert.strictEqual(claudeProvider.configDir(), path.join('/home/tester', '.claude'));
  } finally {
    if (prevC !== undefined) process.env.CLAUDE_CONFIG_DIR = prevC;
    if (prevH !== undefined) process.env.HOME = prevH;
  }
});

test('claudeProvider.normalizeUsage: Anthropic additive accounting', () => {
  // input is uncached-only; cache_read + cache_creation add on top.
  const out = claudeProvider.normalizeUsage({
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 900,
    cache_creation_input_tokens: 200,
  });
  assert.deepStrictEqual(out, {
    inputTokens: 100 + 200 + 900, // 1200 total input
    outputTokens: 50,
    cacheRead: 900,
    cacheCreation: 200,
    rawInput: 100,
  });
});

test('claudeProvider.normalizeUsage: missing fields default to 0', () => {
  assert.deepStrictEqual(claudeProvider.normalizeUsage({}), {
    inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, rawInput: 0,
  });
});

test('normalizeUsage output key order is stable (byte-identical cache)', () => {
  // The token-entry cache relies on stable serialization; lock the key order
  // that usage.mjs spreads into each tokenEntry.
  const keys = Object.keys(claudeProvider.normalizeUsage({ input_tokens: 1 }));
  assert.deepStrictEqual(keys, ['inputTokens', 'outputTokens', 'cacheRead', 'cacheCreation', 'rawInput']);
});

test('registry: claude is registered and discoverable by id', () => {
  assert.ok(PROVIDERS.some(p => p.id === 'claude'));
  assert.strictEqual(getProvider('claude'), claudeProvider);
  assert.strictEqual(getProvider('nonexistent'), null);
});

test('discoverProviders returns only providers with existing config dirs', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = '/tmp/omh-definitely-missing-' + process.pid;
  try {
    assert.ok(!discoverProviders().some(p => p.id === 'claude'));
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev;
  }
});
