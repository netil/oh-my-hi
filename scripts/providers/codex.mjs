// @ts-check
// providers/codex.mjs — OpenAI Codex CLI harness provider adapter.
//
// Codex persists each session as an append-only rollout JSONL file under
// $CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl (+ archived_sessions/).
// Token accounting differs fundamentally from Anthropic:
//   - input_tokens is already the FULL prompt size (cached portion included)
//   - cached_input_tokens ⊆ input_tokens (a subset, not billed on top)
//   - there is NO cache-creation concept
//   - reasoning_output_tokens is separate from output_tokens (both in total)
// See docs/plan/oh-my-hi/2026.07.03 codex 멀티 provider 지원.md for the schema.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { parseSkills } from '../parsers/skills.mjs';
import { parseFrontmatter } from '../parsers/frontmatter.mjs';

/**
 * @typedef {{ inputTokens: number, outputTokens: number,
 *   cacheRead: number, cacheCreation: number, rawInput: number }} NormalizedUsage
 */

export const codexProvider = {
  id: 'codex',
  label: 'Codex',

  /**
   * Root config directory. Mirrors CLAUDE_CONFIG_DIR resolution: CODEX_HOME
   * env, falling back to ~/.codex. Users who keep Codex config elsewhere
   * (e.g. an iCloud dev folder) point CODEX_HOME at it.
   * @returns {string}
   */
  configDir() {
    return process.env.CODEX_HOME
      || path.join(process.env.HOME || '', '.codex');
  },

  /**
   * Normalize a Codex token-usage object (last_token_usage / total_token_usage)
   * into common token fields.
   *
   * @param {{ input_tokens?: number, cached_input_tokens?: number,
   *   output_tokens?: number, reasoning_output_tokens?: number }} usage
   * @returns {NormalizedUsage}
   */
  normalizeUsage(usage) {
    const input = usage.input_tokens || 0;
    const cached = Math.min(usage.cached_input_tokens || 0, input); // cached ⊆ input
    const output = usage.output_tokens || 0;
    const reasoning = usage.reasoning_output_tokens || 0;
    return {
      inputTokens: input,          // already total (cached included)
      outputTokens: output + reasoning,
      cacheRead: cached,
      cacheCreation: 0,            // no equivalent in Codex
      rawInput: input - cached,    // uncached portion
    };
  },

  /**
   * Parse all Codex rollout transcripts into the common usage shape.
   * Returns provider-tagged tokenEntries + latencyEntries. Structure arrays
   * (skills/agents/mcpCalls) are left empty here — the structure catalog is
   * parsed separately (see P5).
   *
   * Incremental: pass an `mtimeIndex` map ({ absPath: mtimeMs }) to skip files
   * whose size/mtime are unchanged since the last parse (their entries are
   * already in SQLite). The index is mutated in place with each parsed file's
   * mtime. This is essential on iCloud-backed configs where reading every
   * rollout re-downloads placeholder files.
   *
   * @param {string} configDir
   * @param {number} [cutoffMs] only entries at/after this epoch-ms are kept (0 = all)
   * @param {{ mtimeIndex?: Record<string, number>|null }} [opts]
   * @returns {Promise<{ tokenEntries: any[], promptStats: any[], skills: any[],
   *   agents: any[], mcpCalls: any[], latencyEntries: any[] }>}
   */
  async parseUsage(configDir, cutoffMs = 0, { mtimeIndex = null } = {}) {
    const empty = { tokenEntries: [], promptStats: [], skills: [], agents: [], mcpCalls: [], latencyEntries: [] };
    const files = collectRolloutFiles(configDir);
    for (const file of files) {
      // Skip unchanged files (stat is cheap metadata; readFile would download).
      if (mtimeIndex) {
        let mt;
        try { mt = fs.statSync(file).mtimeMs; } catch { continue; }
        if (mtimeIndex[file] === mt) continue;
        mtimeIndex[file] = mt;
      }
      let raw;
      try { raw = await fsp.readFile(file, 'utf8'); } catch { continue; }
      const sessionId = path.basename(file).replace(/\.jsonl$/, '');
      let currentModel = null;
      for (const line of raw.split('\n')) {
        const s = line.trim();
        if (!s) continue;
        let o;
        try { o = JSON.parse(s); } catch { continue; }

        // turn_context announces the model used for subsequent token_count events
        if (o.type === 'turn_context' && o.payload?.model) {
          currentModel = o.payload.model;
          continue;
        }
        const p = o.payload;
        // User prompts — event_msg/user_message carries the raw prompt text.
        // Needed for the session list / Context Explorer (a session is only
        // replayable if it has a first-prompt preview).
        if (o.type === 'event_msg' && p?.type === 'user_message') {
          const text = typeof p.message === 'string' ? p.message : '';
          const tsMs = o.timestamp ? new Date(o.timestamp).getTime() : 0;
          if (text && !(cutoffMs && tsMs && tsMs < cutoffMs)) {
            empty.promptStats.push({
              timestamp: tsMs || o.timestamp,
              text,
              preview: text.slice(0, 200),
              charLen: text.length,
              sessionId,
            });
          }
          continue;
        }
        if (o.type !== 'event_msg' || p?.type !== 'token_count') continue;

        const info = p.info || {};
        // Prefer per-turn increment (last_token_usage) — cumulative totals
        // double-count and inflate (see ccusage #950).
        const usage = info.last_token_usage || info.total_token_usage;
        if (!usage) continue;
        // Skip idle/empty token_count events (startup pings).
        if (!usage.input_tokens && !usage.output_tokens && !usage.reasoning_output_tokens) continue;

        const tsMs = o.timestamp ? new Date(o.timestamp).getTime() : 0;
        if (cutoffMs && tsMs && tsMs < cutoffMs) continue;

        const model = info.model || currentModel || 'unknown';
        empty.tokenEntries.push({
          timestamp: tsMs || o.timestamp,
          model,
          provider: 'codex',
          ...codexProvider.normalizeUsage(usage),
          context: 'general',
          contextName: 'conversation',
          sessionId,
        });

        // time_to_first_token_ms → latency
        const ttft = info.time_to_first_token_ms ?? p.time_to_first_token_ms ?? null;
        if (ttft != null && ttft > 0 && tsMs) {
          empty.latencyEntries.push({
            timestamp: tsMs,
            latencyMs: ttft,
            model,
            sessionId,
          });
        }
      }
    }
    return empty;
  },
};

/**
 * Parse the Codex harness structure catalog for the dashboard's #structure /
 * sidebar. Codex reuses the Claude SKILL.md format, so parseSkills applies
 * directly; memory (memories/*.md) and MCP (config.toml [mcp_servers.*]) get
 * lightweight dedicated parsers. Returns partial scopeData structure fields.
 *
 * @param {string} configDir
 * @returns {{ skills: any[], memory: any[], mcpServers: any[] }}
 */
export function parseCodexStructure(configDir) {
  return {
    skills: parseSkills(configDir),   // Codex skills/*/SKILL.md — same layout as Claude
    memory: parseCodexMemory(configDir),
    mcpServers: parseCodexMcp(configDir),
  };
}

/** Read memories/*.md frontmatter into the shared memory shape. */
function parseCodexMemory(configDir) {
  const dir = path.join(configDir, 'memories');
  const out = [];
  let files;
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const file of files) {
    if (!file.endsWith('.md') || file === 'MEMORY.md') continue;
    const filePath = path.join(dir, file);
    try {
      const { meta, body } = parseFrontmatter(filePath);
      out.push({
        name: meta.name || path.basename(file, '.md'),
        description: meta.description || '',
        type: meta.type || 'unknown',
        filePath,
        body,
        scope: 'codex',
      });
    } catch { /* skip unreadable */ }
  }
  return out;
}

/**
 * Parse `[mcp_servers.NAME]` tables from config.toml. Minimal TOML: captures
 * server name, command, and args. Never exposes env values (secrets).
 */
function parseCodexMcp(configDir) {
  const tomlPath = path.join(configDir, 'config.toml');
  let raw;
  try { raw = fs.readFileSync(tomlPath, 'utf8'); } catch { return []; }
  const out = [];
  // Split into lines; track the current [mcp_servers.NAME] table.
  let cur = null;
  for (const line of raw.split('\n')) {
    const s = line.trim();
    const header = s.match(/^\[mcp_servers\.([^\]]+)\]$/);
    if (header) {
      cur = { name: header[1].replace(/^"|"$/g, ''), command: '', args: [], type: null, envKeys: [], sourcePath: tomlPath };
      out.push(cur);
      continue;
    }
    if (/^\[/.test(s)) { cur = null; continue; } // left the table
    if (!cur) continue;
    const cmd = s.match(/^command\s*=\s*"([^"]*)"/);
    if (cmd) { cur.command = cmd[1]; continue; }
    const args = s.match(/^args\s*=\s*\[(.*)\]/);
    if (args) {
      cur.args = args[1].split(',').map(a => a.trim().replace(/^"|"$/g, '')).filter(Boolean);
      continue;
    }
    const env = s.match(/^env\s*=\s*\{(.*)\}/);
    if (env) {
      cur.envKeys = [...env[1].matchAll(/"?([A-Za-z_][A-Za-z0-9_]*)"?\s*=/g)].map(m => m[1]);
    }
  }
  return out;
}

/**
 * Recursively collect rollout JSONL files under sessions/ and archived_sessions/.
 * @param {string} configDir
 * @returns {string[]}
 */
export function collectRolloutFiles(configDir) {
  const out = [];
  for (const sub of ['sessions', 'archived_sessions']) {
    walkJsonl(path.join(configDir, sub), out);
  }
  return out;
}

/** @param {string} dir @param {string[]} out */
function walkJsonl(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJsonl(p, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
}
