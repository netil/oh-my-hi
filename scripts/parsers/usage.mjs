// @ts-check
// usage.mjs — history, transcript, stats-cache parser

/**
 * @typedef {{ timestamp: number|string, model: string|null,
 *   inputTokens: number, outputTokens: number,
 *   cacheRead: number, cacheCreation: number, rawInput: number,
 *   context: string, contextName: string, sessionId: string,
 *   latencyMs?: number }} TokenEntry
 */

/**
 * @typedef {{ timestamp: number|string, text: string, preview: string,
 *   charLen: number, sessionId: string }} PromptStat
 */

/**
 * @typedef {{ timestamp: number|string, latencyMs: number,
 *   sessionId: string }} LatencyEntry
 */

/**
 * @typedef {{ name: string, count: number, sessionId: string }} CommandUsage
 */

/**
 * @typedef {{ _schemaVersion: number, [filePath: string]: {
 *   size: number, mtime: number,
 *   result: TranscriptParseResult } }} MtimeIndex
 */

/**
 * @typedef {{ parsed: number, total: number }} CacheStats
 */

/**
 * @typedef {{ commands: CommandUsage[], skills: string[], agents: string[],
 *   mcpCalls: string[], tokenEntries: TokenEntry[], promptStats: PromptStat[],
 *   latencyEntries: LatencyEntry[], dailyActivity: object[],
 *   _cacheStats: CacheStats }} UsageResult
 */

/**
 * @typedef {{ skills: string[], agents: string[], mcpCalls: string[],
 *   tokenEntries: TokenEntry[], promptStats: PromptStat[],
 *   latencyEntries: LatencyEntry[] }} TranscriptParseResult
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { gzipSync, gunzipSync } from 'zlib';
import { toMonthKey } from '../util.mjs';

const PARALLEL_CONCURRENCY = Math.max(os.cpus().length, 4);

// Increment when parser output schema changes (forces full re-parse via mtime index invalidation)
// v3: promptStats entries carry full `text` for FTS5 session search
const CACHE_SCHEMA_VERSION = 3;

// Max chars of prompt text kept for full-text search indexing
const FTS_TEXT_MAX = 5000;

/**
 * Run async functions in parallel with concurrency limit
 */
async function parallelMap(items, fn, concurrency = PARALLEL_CONCURRENCY) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ── Incremental Cache ──

// Key shortening map for cache minification (same pattern as inline HTML)
const CACHE_KEY_MAP = {
  timestamp: 'ts', model: 'm', inputTokens: 'it', outputTokens: 'ot',
  cacheRead: 'cr', cacheCreation: 'cc', rawInput: 'ri', context: 'cx',
  contextName: 'cn', sessionId: 'sid', latencyMs: 'ms', charLen: 'cl',
  name: 'n', tool: 't',
};
const CACHE_KEY_REV = Object.fromEntries(Object.entries(CACHE_KEY_MAP).map(([k, v]) => [v, k]));

/**
 * Minify a cache result for disk storage.
 * - Shortens keys in array entries
 * - Interns repeated string values (model, context, contextName, sessionId)
 */
function minifyCacheResult(result) {
  const modelSet = new Set();
  const ctxSet = new Set();
  const cnSet = new Set();
  const sidSet = new Set();

  // Collect unique strings across all arrays
  for (const arr of Object.values(result)) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (e.model != null) modelSet.add(e.model);
      if (e.context != null) ctxSet.add(e.context);
      if (e.contextName != null) cnSet.add(e.contextName);
      if (e.sessionId != null) sidSet.add(e.sessionId);
    }
  }

  const models = [...modelSet];
  const contexts = [...ctxSet];
  const contextNames = [...cnSet];
  const sessionIds = [...sidSet];
  const mIdx = Object.fromEntries(models.map((v, i) => [v, i]));
  const cxIdx = Object.fromEntries(contexts.map((v, i) => [v, i]));
  const cnIdx = Object.fromEntries(contextNames.map((v, i) => [v, i]));
  const sidIdx = Object.fromEntries(sessionIds.map((v, i) => [v, i]));

  // Shorten keys and replace strings with indices
  const out = {};
  for (const [field, arr] of Object.entries(result)) {
    if (!Array.isArray(arr)) { out[field] = arr; continue; }
    out[field] = arr.map(e => {
      const o = {};
      for (const [k, v] of Object.entries(e)) {
        const sk = CACHE_KEY_MAP[k] || k;
        if (k === 'model') o[sk] = v != null ? mIdx[v] : v;
        else if (k === 'context') o[sk] = v != null ? cxIdx[v] : v;
        else if (k === 'contextName') o[sk] = v != null ? cnIdx[v] : v;
        else if (k === 'sessionId') o[sk] = v != null ? sidIdx[v] : v;
        else o[sk] = v;
      }
      return o;
    });
  }
  out._intern = { m: models, cx: contexts, cn: contextNames, sid: sessionIds };
  return out;
}

/**
 * Restore a minified cache result to full-key format.
 */
function restoreCacheResult(minResult) {
  const intern = minResult._intern;
  if (!intern) return minResult; // not minified (legacy cache)

  const out = {};
  for (const [field, arr] of Object.entries(minResult)) {
    if (field === '_intern') continue;
    if (!Array.isArray(arr)) { out[field] = arr; continue; }
    out[field] = arr.map(e => {
      const o = {};
      for (const [k, v] of Object.entries(e)) {
        const rk = CACHE_KEY_REV[k] || k;
        if (rk === 'model') o[rk] = v != null ? intern.m[v] : v;
        else if (rk === 'context') o[rk] = v != null ? intern.cx[v] : v;
        else if (rk === 'contextName') o[rk] = v != null ? intern.cn[v] : v;
        else if (rk === 'sessionId') o[rk] = v != null ? intern.sid[v] : v;
        else o[rk] = v;
      }
      return o;
    });
  }
  return out;
}

// ── Segment-based Cache I/O ──
// Cache dir contains immutable gzipped segments + optional compacted base.
// On save, only new entries are written as a new segment.
// On load, base + all segments are merged (later overrides earlier).
// Compaction merges all into a new base when segment count exceeds threshold.

const COMPACT_THRESHOLD = 50;

/**
 * Derive cache directory from the legacy cachePath.
 * "output/transcript-cache.json" → "output/cache/"
 */
function cacheDir(cachePath) {
  return path.join(path.dirname(cachePath), 'cache');
}

/**
 * Read a single gzipped JSON cache file. Returns {} on any error.
 */
function readCacheFile(filePath) {
  try {
    return JSON.parse(gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * Write a gzipped JSON cache file.
 */
function writeCacheFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, gzipSync(JSON.stringify(data), { level: 1 }));
}

/**
 * Load transcript cache by merging base + all segments.
 * Also migrates legacy formats (single JSON, year-split gz).
 * @param {string} cachePath - legacy base path (used to derive cache dir)
 * @returns {Record<string, any>} merged cache keyed by file path
 */
export function loadTranscriptCache(cachePath) {
  if (!cachePath) return {};

  const dir = cacheDir(cachePath);
  const cache = {};

  // Migrate legacy single-file JSON cache
  if (fs.existsSync(cachePath)) {
    try {
      Object.assign(cache, JSON.parse(fs.readFileSync(cachePath, 'utf8')));
      fs.unlinkSync(cachePath);
    } catch { /* ignore corrupt legacy */ }
  }

  if (!fs.existsSync(dir)) return cache;

  // Read files sorted: base first, then segments in order
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort();
  for (const f of files) {
    const data = readCacheFile(path.join(dir, f));
    Object.assign(cache, data);
  }

  // Restore minified results
  for (const key of Object.keys(cache)) {
    if (cache[key]?.result?._intern) {
      cache[key].result = restoreCacheResult(cache[key].result);
    }
  }
  return cache;
}

/**
 * Save only newly parsed entries as a new segment file.
 * Triggers compaction when segment count exceeds threshold.
 * @param {string} cachePath - legacy base path
 * @param {object} cache - full in-memory cache
 */
export function saveTranscriptCache(cachePath, cache) {
  if (!cachePath) return;
  try {
    const dir = cacheDir(cachePath);
    fs.mkdirSync(dir, { recursive: true });

    // Collect only entries that were parsed in this run
    const newEntries = {};
    for (const [key, entry] of Object.entries(cache)) {
      if (key.startsWith('_')) continue;
      if (!entry?._new) continue;
      const { _new, ...clean } = entry;
      newEntries[key] = { ...clean, result: minifyCacheResult(clean.result) };
    }

    if (Object.keys(newEntries).length === 0) return;

    // Write new segment with timestamp-based name (sorts chronologically)
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    writeCacheFile(path.join(dir, `seg-${ts}.json.gz`), newEntries);

    // Clean _new flags from in-memory cache
    for (const key of Object.keys(cache)) {
      if (cache[key]?._new) delete cache[key]._new;
    }

    // Compact if too many segments
    const files = fs.readdirSync(dir).filter(f => f.startsWith('seg-'));
    if (files.length >= COMPACT_THRESHOLD) {
      compactCache(cachePath, cache);
    }
  } catch { /* best effort */ }
}

/**
 * Merge all segments + base into a single new base file.
 * Removes old segments and base after successful compaction.
 */
function compactCache(cachePath, cache) {
  const dir = cacheDir(cachePath);

  // Build compacted data from in-memory cache (already fully merged)
  const compacted = {};
  for (const [key, entry] of Object.entries(cache)) {
    if (key.startsWith('_') || !entry?.result) continue;
    compacted[key] = { ...entry, result: minifyCacheResult(entry.result) };
    delete compacted[key]._new;
  }

  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const basePath = path.join(dir, `base-${ts}.json.gz`);
  writeCacheFile(basePath, compacted);

  // Remove old files (keep only the new base)
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json.gz'))) {
    const fp = path.join(dir, f);
    if (fp !== basePath) {
      try { fs.unlinkSync(fp); } catch { /* best effort */ }
    }
  }
}

// ── Mtime Index (lightweight change detection without full cache load) ──

/**
 * Path to the mtime index file.
 */
function mtimeIndexPath(cachePath) {
  return path.join(cacheDir(cachePath), 'mtime-index.json');
}

/**
 * Find longest common directory prefix across all paths.
 * Returns '' when paths share no common directory (filesystem root reached).
 * Exported for tests.
 */
export function commonPrefix(paths) {
  if (paths.length === 0) return '';
  let prefix = path.dirname(paths[0]);
  for (const p of paths) {
    while (prefix && !p.startsWith(prefix + path.sep)) {
      const parent = path.dirname(prefix);
      // Loop guard: dirname of a root ('/', 'C:\\') is itself — no common dir
      if (parent === prefix) return '';
      prefix = parent;
    }
  }
  return prefix;
}

/**
 * Load mtime index: returns { filePath: mtimeMs } with absolute paths restored.
 * File format: { _base: "/common/prefix", "relative/path": mtimeMs, ... }
 */
export function loadMtimeIndex(cachePath) {
  if (!cachePath) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(mtimeIndexPath(cachePath), 'utf8'));
    // Schema version mismatch → invalidate index to force full re-parse
    if (raw._schemaVersion !== CACHE_SCHEMA_VERSION) return {};
    const base = raw._base || '';
    const result = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === '_base' || key === '_schemaVersion') continue;
      result[base ? path.join(base, key) : key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Save mtime index from the full cache object.
 * Stores paths relative to common prefix to reduce file size.
 */
export function saveMtimeIndex(cachePath, cache) {
  if (!cachePath) return;
  try {
    const entries = [];
    for (const [key, entry] of Object.entries(cache)) {
      if (key.startsWith('_') || !entry?.mtimeMs) continue;
      entries.push([key, entry.mtimeMs]);
    }
    const base = commonPrefix(entries.map(e => e[0]));
    const index = { _base: base, _schemaVersion: CACHE_SCHEMA_VERSION };
    for (const [absPath, mtimeMs] of entries) {
      // No common prefix → store absolute paths (loadMtimeIndex handles _base: '')
      index[base ? absPath.slice(base.length + 1) : absPath] = mtimeMs;
    }
    const fp = mtimeIndexPath(cachePath);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(index), 'utf8');
  } catch { /* best effort */ }
}

/**
 * Parse a transcript file with cache support.
 * Always parses without cutoff (full data) so cache is reusable across time ranges.
 */
async function cachedParseTranscriptFile(fp, cache) {
  try {
    let stat;
    try { stat = fs.statSync(fp); } catch { return null; }
    const cached = cache[fp];
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      // Full cache hit (has result) or mtime-only stub (skip — already processed)
      if (cached.size === stat.size) {
        // Schema check: if promptStats entries lack 'preview' or 'text', cache is stale — re-parse
        const ps = cached.result?.promptStats;
        if (!ps || ps.length === 0 || ('preview' in ps[0] && 'text' in ps[0])) return cached.result;
      }
      // Mtime match but size=0 means mtime-only stub from lightweight mode — skip
      if (cached.size === 0) return null;
    }
    const result = await parseTranscriptFile(fp, 0);
    cache[fp] = { mtimeMs: stat.mtimeMs, size: stat.size, result, _new: true };
    cache._parsed = (cache._parsed || 0) + 1;
    return result;
  } finally {
    cache._processed = (cache._processed || 0) + 1;
    cache._onProgress?.();
  }
}

/**
 * Apply cutoff filter to merged transcript results
 */
function applyCutoff(merged, cutoffMs) {
  if (!cutoffMs) return merged;
  const filterByTs = (arr) => arr.filter(e => {
    const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
    return ts >= cutoffMs;
  });
  return {
    skills: filterByTs(merged.skills),
    agents: filterByTs(merged.agents),
    mcpCalls: filterByTs(merged.mcpCalls),
    tokenEntries: filterByTs(merged.tokenEntries),
    promptStats: filterByTs(merged.promptStats),
    latencyEntries: filterByTs(merged.latencyEntries),
  };
}

// Built-in Claude CLI slash commands (to be filtered out)
const BUILTIN_COMMANDS = new Set([
  'clear', 'exit', 'help', 'config', 'login', 'logout', 'doctor',
  'mcp', 'model', 'memory', 'status', 'statusline', 'init', 'ide',
  'summary', 'usage', 'cost', 'stats', 'plugin', 'skills', 'context',
  'sandbox', 'compact',
]);

/**
 * Determine if a display string is a user-defined slash command
 * - Must start with /
 * - Excludes built-in commands
 * - Excludes paths (/Users/...) and typos (non-alpha patterns like /celar)
 */
function isUserCommand(display) {
  if (!display || !display.startsWith('/')) return false;

  // Exclude path patterns (multiple slashes or /Users/, /tmp/, etc.)
  if (display.startsWith('/Users/') || display.startsWith('/tmp/') || display.startsWith('/var/')) return false;
  if (/^\/[a-z]:[/\\]/i.test(display)) return false; // Windows path

  // Extract command name (up to whitespace or newline)
  const name = display.slice(1).split(/[\s\n]/)[0].toLowerCase();

  // Exclude empty names
  if (!name) return false;

  // Exclude built-in commands
  if (BUILTIN_COMMANDS.has(name)) return false;

  // Allow only alphanumeric/hyphen/colon/dot (typical command names)
  if (!/^[a-z0-9:.\-_]+$/i.test(name)) return false;

  return true;
}

/**
 * Calculate cutoffMs: days=0 returns 0 (all), days>0 returns now - days*24h
 */
function calcCutoff(days) {
  if (!days || days <= 0) return 0;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/**
 * Parse user commands from history.jsonl
 */
async function parseCommands(configDir, cutoffMs) {
  const histPath = path.join(configDir, 'history.jsonl');
  if (!fs.existsSync(histPath)) return [];

  const commands = [];
  const raw = await fsp.readFile(histPath, 'utf8');

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (!entry.display || !entry.timestamp) continue;
      if (cutoffMs && entry.timestamp < cutoffMs) continue;
      if (!isUserCommand(entry.display)) continue;

      const name = entry.display.slice(1).split(/[\s\n]/)[0].toLowerCase();
      commands.push({
        name,
        timestamp: entry.timestamp,
        project: entry.project ?? null,
        sessionId: entry.sessionId ?? null,
      });
    } catch {
      // Skip on parse failure
    }
  }

  return commands;
}

/**
 * Parse Skill/Agent tool_use entries from transcript JSONL
 * @param {string} jsonlPath
 * @param {number} cutoffMs
 * @returns {{ skills: Array, agents: Array }}
 */
async function parseTranscriptFile(jsonlPath, cutoffMs) {
  const skills = [];
  const agents = [];
  const mcpCalls = [];
  const tokenEntries = [];
  let raw;
  try {
    raw = await fsp.readFile(jsonlPath, 'utf8');
  } catch {
    return { skills, agents, mcpCalls, tokenEntries };
  }

  // Track last active context per session for token attribution
  const sessionContext = {}; // sessionId → { type, name }
  const promptStats = []; // user prompt stats
  const latencyEntries = []; // response latency
  const lastHumanTs = {}; // sessionId → timestamp of last human message

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);

      // Collect user prompt stats + track human timestamp for latency
      // isMeta entries are skill/tool injections (e.g. SKILL.md content), not real user messages
      if ((entry.type === 'human' || entry.type === 'user') && !entry.isMeta) {
        const tsMs = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
        if (cutoffMs && tsMs < cutoffMs) continue;
        const sid = entry.sessionId ?? '_default';
        if (tsMs) lastHumanTs[sid] = tsMs;
        const msg = entry.message;
        let charLen = 0;
        let fullText = '';
        if (typeof msg === 'string') {
          charLen = msg.length;
          fullText = msg;
        } else if (msg && typeof msg === 'object') {
          const content = msg.content;
          if (typeof content === 'string') { charLen = content.length; fullText = content; }
          else if (Array.isArray(content)) {
            content.forEach(c => {
              if (c.type === 'text' && c.text) {
                charLen += c.text.length;
                if (!fullText) fullText = c.text;
              }
            });
          }
        }
        // Skip tool-result and system-reminder pseudo-prompts so the preview is a real user message.
        const isToolResult = /^<(tool_use_result|command-stdout|command-stderr|system-reminder|local-command-stdout)/i.test(fullText.trimStart());
        if (charLen > 0 && !isToolResult) {
          let previewText = fullText.replace(/\s+/g, ' ').trim();
          // Convert <command-name>foo</command-name> to /foo for legibility
          const cmdMatch = previewText.match(/<command-name>([\s\S]*?)<\/command-name>/i);
          if (cmdMatch) {
            const cmdName = cmdMatch[1].trim();
            const cmdStr = cmdName.startsWith('/') ? cmdName : '/' + cmdName;
            const argsMatch = previewText.match(/<command-args>([\s\S]*?)<\/command-args>/i);
            const argsStr = argsMatch ? argsMatch[1].trim() : '';
            previewText = argsStr ? cmdStr + ' ' + argsStr : cmdStr;
          } else {
            // Strip leading XML-like wrapper tags iteratively (hooks, system tags, etc.)
            const leadingTag = /^<([a-z][a-z0-9-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*|^<[a-z][a-z0-9-]*(?:\s[^>]*)?\/>\s*/i;
            let prev;
            do { prev = previewText; previewText = previewText.replace(leadingTag, ''); } while (previewText !== prev);
            previewText = previewText.trim();
          }
          const preview = previewText.slice(0, 120);
          // Full(-ish) prompt text for FTS5 search. Capped to keep cache/DB lean —
          // pathological pasted blobs (logs, file dumps) add little search value past this.
          const text = previewText.slice(0, FTS_TEXT_MAX);
          promptStats.push({ timestamp: tsMs || entry.timestamp, charLen, sessionId: entry.sessionId ?? null, preview, text });
        }
        continue;
      }

      if (entry.type !== 'assistant') continue;

      const tsMs = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      if (cutoffMs && tsMs < cutoffMs) continue;

      const sid = entry.sessionId ?? '_default';

      // Response latency: diff from last human message
      if (lastHumanTs[sid] && tsMs) {
        const latencyMs = tsMs - lastHumanTs[sid];
        if (latencyMs > 0 && latencyMs < 600000) { // max 10min, filter outliers
          latencyEntries.push({
            timestamp: tsMs,
            latencyMs,
            model: entry.message?.model || 'unknown',
            sessionId: entry.sessionId ?? null,
          });
        }
        delete lastHumanTs[sid]; // consume, avoid double counting
      }

      // Scan tool_use first to update context
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item?.type !== 'tool_use') continue;
          if (item.name === 'Skill') {
            const skillName = item.input?.skill;
            if (skillName) {
              sessionContext[sid] = { type: 'skill', name: skillName };
              skills.push({ name: skillName, timestamp: tsMs || entry.timestamp, sessionId: entry.sessionId ?? null });
            }
          } else if (item.name === 'Agent') {
            const agentName = item.input?.subagent_type ?? item.input?.description ?? 'unknown';
            sessionContext[sid] = { type: 'agent', name: agentName };
            agents.push({ name: agentName, timestamp: tsMs || entry.timestamp, sessionId: entry.sessionId ?? null });
          } else if (item.name.startsWith('mcp__')) {
            const parts = item.name.split('__');
            const serverName = parts[1] || item.name;
            sessionContext[sid] = { type: 'mcp', name: serverName };
            mcpCalls.push({ name: serverName, tool: item.name, timestamp: tsMs || entry.timestamp, sessionId: entry.sessionId ?? null });
          } else {
            // Built-in tools (Read, Write, Edit, Bash, Grep, Glob, etc.)
            sessionContext[sid] = { type: 'tool', name: item.name };
          }
        }
      }

      // Token usage with context
      const usage = entry.message?.usage;
      if (usage) {
        const ctx = sessionContext[sid] || { type: 'general', name: 'conversation' };
        tokenEntries.push({
          timestamp: tsMs || entry.timestamp,
          model: entry.message?.model || 'unknown',
          inputTokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
          outputTokens: usage.output_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          cacheCreation: usage.cache_creation_input_tokens || 0,
          rawInput: usage.input_tokens || 0,
          context: ctx.type,
          contextName: ctx.name,
          sessionId: entry.sessionId ?? null,
        });
      }
    } catch {
      // Skip on parse failure
    }
  }

  return { skills, agents, mcpCalls, tokenEntries, promptStats, latencyEntries };
}

/**
 * Collect JSONL paths from a single project directory.
 * Covers flat ({uuid}.jsonl), session-subdir ({sessionId}/*.jsonl),
 * and subagent ({sessionId}/subagents/*.jsonl) layouts.
 */
function collectProjectJsonlPaths(projDirPath) {
  const filePaths = [];
  let files;
  try { files = fs.readdirSync(projDirPath, { withFileTypes: true }); } catch { return filePaths; }
  for (const f of files) {
    if (f.isFile() && f.name.endsWith('.jsonl')) {
      filePaths.push(path.join(projDirPath, f.name));
    } else if (f.isDirectory()) {
      const sessionDir = path.join(projDirPath, f.name);
      let hasSubagents = false;
      try {
        for (const sf of fs.readdirSync(sessionDir, { withFileTypes: true })) {
          if (sf.isFile() && sf.name.endsWith('.jsonl')) filePaths.push(path.join(sessionDir, sf.name));
          else if (sf.isDirectory() && sf.name === 'subagents') hasSubagents = true;
        }
      } catch { /* skip */ }
      if (hasSubagents) try {
        for (const af of fs.readdirSync(path.join(sessionDir, 'subagents'), { withFileTypes: true })) {
          if (af.isFile() && af.name.endsWith('.jsonl')) filePaths.push(path.join(sessionDir, 'subagents', af.name));
        }
      } catch { /* skip */ }
    }
  }
  return filePaths;
}

function collectJsonlPaths(projectsDir) {
  const filePaths = [];
  if (!fs.existsSync(projectsDir)) return filePaths;
  try {
    for (const projectDir of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!projectDir.isDirectory()) continue;
      filePaths.push(...collectProjectJsonlPaths(path.join(projectsDir, projectDir.name)));
    }
  } catch { /* skip */ }
  return filePaths;
}

async function parseTranscripts(configDir, cutoffMs, cache = {}) {
  const projectsDir = path.join(configDir, 'projects');
  if (!fs.existsSync(projectsDir)) return { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] };

  const filePaths = collectJsonlPaths(projectsDir);

  // Phase 2: Parse all files in parallel (with cache)
  cache._total = (cache._total || 0) + filePaths.length;
  const results = await parallelMap(filePaths, fp => cachedParseTranscriptFile(fp, cache));

  return applyCutoff(mergeTranscriptResults(results.filter(Boolean)), cutoffMs);
}

/**
 * Parse dailyActivity from stats-cache.json
 */
async function parseDailyActivity(configDir, cutoffMs) {
  const cachePath = path.join(configDir, 'stats-cache.json');
  if (!fs.existsSync(cachePath)) return [];

  try {
    const data = JSON.parse(await fsp.readFile(cachePath, 'utf8'));
    const activities = data.dailyActivity ?? [];

    if (!cutoffMs) return activities;

    const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);
    return activities.filter(a => a.date >= cutoffDate);
  } catch {
    return [];
  }
}

/**
 * Merge multiple transcript parse results into one
 */
function mergeTranscriptResults(results) {
  const merged = { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] };
  for (const r of results) {
    if (r.skills) merged.skills.push(...r.skills);
    if (r.agents) merged.agents.push(...r.agents);
    if (r.mcpCalls) merged.mcpCalls.push(...r.mcpCalls);
    if (r.tokenEntries) merged.tokenEntries.push(...r.tokenEntries);
    if (r.promptStats) merged.promptStats.push(...r.promptStats);
    if (r.latencyEntries) merged.latencyEntries.push(...r.latencyEntries);
  }
  return merged;
}

/**
 * Fast coverage scan: returns month → file-count map for all transcript JSONL files.
 * Uses readdir + stat only — no JSONL content parsing. Suitable for startup checks.
 * @param {string} configDir
 * @returns {Map<string, number>} e.g. Map { '2026-02' => 30, '2026-04' => 315 }
 */
export function scanTranscriptMonths(configDir) {
  const counts = new Map();
  for (const fp of collectJsonlPaths(path.join(configDir, 'projects'))) {
    try {
      const d = new Date(fs.statSync(fp).mtimeMs);
      const m = toMonthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
      counts.set(m, (counts.get(m) || 0) + 1);
    } catch { /* skip */ }
  }
  return counts;
}

/**
 * Parse all usage data from transcripts and history.
 * @param {string} configDir - Claude config root path
 * @param {number} [days=0] - 0 for all, >0 for last N days
 * @param {string|null} [projectDir=null] - single project dir, or null for global
 * @param {{ cache?: Record<string, any>, cachePath?: string }} [opts]
 * @returns {Promise<UsageResult>}
 */
export async function parseUsage(configDir, days = 0, projectDir = null, opts = {}) {
  const cutoffMs = calcCutoff(days);
  const cache = opts.cache ?? loadTranscriptCache(opts.cachePath);
  if (cache._parsed == null) cache._parsed = 0;

  // Run commands, transcripts, and dailyActivity in parallel
  const [commands, transcriptResult, dailyActivity] = await Promise.all([
    parseCommands(configDir, cutoffMs),
    projectDir
      ? parseProjectTranscripts(projectDir, cutoffMs, cache)
      : parseTranscripts(configDir, cutoffMs, cache),
    parseDailyActivity(configDir, cutoffMs),
  ]);

  // Note: cache saving is handled by the caller (collectAllScopes) after all
  // concurrent parseUsage calls complete, to avoid race conditions on _new flags.

  const { skills, agents, mcpCalls, tokenEntries, promptStats, latencyEntries } = transcriptResult;

  return {
    commands, skills, agents, mcpCalls, tokenEntries, promptStats, latencyEntries, dailyActivity,
    _cacheStats: { parsed: cache._parsed || 0, total: Object.keys(cache).length - 1 },
  };
}

/**
 * Parse transcripts from a single project directory only
 * Uses incremental cache like parseTranscripts.
 */
async function parseProjectTranscripts(projDirPath, cutoffMs, cache = {}) {
  const empty = { skills: [], agents: [], mcpCalls: [], tokenEntries: [], promptStats: [], latencyEntries: [] };
  if (!fs.existsSync(projDirPath)) return empty;

  // Phase 1: Collect all candidate file paths (sync — fast directory scan)
  // Include legacy projDirPath/subagents/ root in addition to projDirPath itself
  const filePaths = [
    ...collectProjectJsonlPaths(projDirPath),
    ...collectProjectJsonlPaths(path.join(projDirPath, 'subagents')),
  ];

  // Phase 2: Parse all files in parallel (with cache)
  cache._total = (cache._total || 0) + filePaths.length;
  const results = await parallelMap(filePaths, fp => cachedParseTranscriptFile(fp, cache));

  return applyCutoff(mergeTranscriptResults(results.filter(Boolean)), cutoffMs);
}
