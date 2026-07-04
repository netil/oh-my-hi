// @ts-check
// providers/claude.mjs — Claude Code harness provider adapter.
//
// A "provider" encapsulates everything that is specific to one AI coding tool:
// where its config/transcripts live, and how to normalize its raw token-usage
// accounting into oh-my-hi's common TokenEntry shape. Claude is the original
// (and default) provider; additional providers (e.g. Codex) plug in alongside.
import path from 'path';

/**
 * @typedef {{ inputTokens: number, outputTokens: number,
 *   cacheRead: number, cacheCreation: number, rawInput: number }} NormalizedUsage
 */

export const claudeProvider = {
  id: 'claude',
  label: 'Claude Code',

  /**
   * Root config directory. Mirrors the historical resolution in
   * generate-dashboard.mjs: CLAUDE_CONFIG_DIR env, falling back to ~/.claude.
   * @returns {string}
   */
  configDir() {
    return process.env.CLAUDE_CONFIG_DIR
      || path.join(process.env.HOME || '', '.claude');
  },

  /**
   * Normalize an Anthropic `message.usage` object into common token fields.
   *
   * Anthropic accounting is *additive*: input_tokens counts only the
   * uncached portion, and cache_read / cache_creation are billed on top.
   * So the "total input" = input + cache_creation + cache_read.
   *
   * @param {{ input_tokens?: number, output_tokens?: number,
   *   cache_read_input_tokens?: number, cache_creation_input_tokens?: number }} usage
   * @returns {NormalizedUsage}
   */
  normalizeUsage(usage) {
    return {
      inputTokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
      outputTokens: usage.output_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
      cacheCreation: usage.cache_creation_input_tokens || 0,
      rawInput: usage.input_tokens || 0,
    };
  },
};
