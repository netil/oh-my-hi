// @ts-check
// lint.mjs — harness health checks (build-time lint over already-parsed data)
//
// Each check is a small pure function over data the other parsers already
// produced, plus targeted fs.existsSync calls. Warnings are structured so the
// frontend can localize them:
//   { category: 'hooks'|'skills'|'memory', code: string, file: string, args: string[] }
// The frontend renders the message via t('lint_' + code, ...args).
import fs from 'fs';
import path from 'path';

/** name must be lowercase alphanumeric + hyphens (agentskills.io spec) */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Expand $HOME / ~ / $CLAUDE_CONFIG_DIR prefixes in a token.
 * Returns null when the token still contains unexpanded variables or globs.
 * @param {string} token
 * @param {{ home: string, claudeConfigDir: string }} env
 * @returns {string|null}
 */
function expandPathToken(token, env) {
  let t = token;
  t = t.replace(/^~(?=\/|$)/, env.home);
  t = t.replace(/^\$\{?HOME\}?(?=\/|$)/, env.home);
  t = t.replace(/^\$\{?CLAUDE_CONFIG_DIR\}?(?=\/|$)/, env.claudeConfigDir);
  if (t.includes('$') || /[*?[]/.test(t)) return null; // unexpanded var or glob — skip
  return t;
}

/**
 * Extract path-like candidates from a shell command string.
 * Only absolute paths (after ~ / $HOME / $CLAUDE_CONFIG_DIR expansion) are
 * returned — bare PATH binaries (node, bash) and inline shell are ignored.
 * Tokens that are redirect targets (> file, 2>> file) are skipped because
 * they may legitimately not exist yet.
 * @param {string} command
 * @param {{ home: string, claudeConfigDir: string }} env
 * @returns {string[]}
 */
export function extractPathCandidates(command, env) {
  const candidates = [];
  // Tokenize: double-quoted, single-quoted, or bare tokens
  const tokenRe = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  let prevBare = '';
  while ((m = tokenRe.exec(command)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3];
    const isBare = m[3] !== undefined;
    const afterRedirect = /(^|[^<>])\d?>{1,2}$/.test(prevBare) || prevBare === '<';
    prevBare = isBare ? raw : '';
    if (afterRedirect) continue;
    // --flag=/path/to/file → check the right-hand side
    let token = raw;
    if (isBare && token.includes('=')) {
      const rhs = token.slice(token.indexOf('=') + 1);
      if (/^[~/$]/.test(rhs)) token = rhs; else continue;
    }
    // strip trailing shell punctuation on bare tokens
    if (isBare) token = token.replace(/[;,)&|]+$/, '');
    if (!/^[~/$]/.test(token)) continue;
    const expanded = expandPathToken(token, env);
    if (expanded === null || !path.isAbsolute(expanded)) continue;
    candidates.push(expanded);
  }
  return candidates;
}

/**
 * Check 1: hook commands referencing script paths that don't exist on disk.
 * @param {Array<{ event: string, matcher: string, command: string }>} hooks parsed hooks (parsers/hooks.mjs)
 * @param {{ settingsPath: string, home?: string, claudeConfigDir: string, existsSync?: typeof fs.existsSync }} opts
 * @returns {Array<{ category: string, code: string, file: string, args: string[] }>}
 */
export function checkHookPaths(hooks, opts) {
  const env = {
    home: opts.home ?? (process.env.HOME || process.env.USERPROFILE || ''),
    claudeConfigDir: opts.claudeConfigDir,
  };
  const exists = opts.existsSync ?? fs.existsSync;
  const warnings = [];
  const seen = new Set();
  for (const hook of hooks || []) {
    for (const line of String(hook.command || '').split('\n')) {
      for (const candidate of extractPathCandidates(line, env)) {
        if (seen.has(candidate) || exists(candidate)) continue;
        seen.add(candidate);
        warnings.push({
          category: 'hooks',
          code: 'hookPathMissing',
          file: opts.settingsPath,
          args: [hook.event + (hook.matcher && hook.matcher !== '*' ? ' (' + hook.matcher + ')' : ''), candidate],
        });
      }
    }
  }
  return warnings;
}

/**
 * Check 2: SKILL.md frontmatter spec compliance (agentskills.io).
 * Relies on `metaName` (raw frontmatter `name`, null when absent) added by
 * parsers/skills.mjs — `name` itself falls back to the directory name.
 * @param {Array<{ name: string, metaName?: string|null, description: string, filePath: string }>} skills
 * @returns {Array<{ category: string, code: string, file: string, args: string[] }>}
 */
export function checkSkillFrontmatter(skills) {
  const warnings = [];
  for (const skill of skills || []) {
    const dirName = path.basename(path.dirname(skill.filePath));
    const metaName = skill.metaName ?? null;
    if (metaName === null) {
      warnings.push({ category: 'skills', code: 'skillNameMissing', file: skill.filePath, args: [dirName] });
    } else if (!SKILL_NAME_RE.test(metaName)) {
      warnings.push({ category: 'skills', code: 'skillNameInvalid', file: skill.filePath, args: [metaName] });
    } else if (metaName !== dirName) {
      warnings.push({ category: 'skills', code: 'skillNameMismatch', file: skill.filePath, args: [metaName, dirName] });
    }
    if (!skill.description) {
      warnings.push({ category: 'skills', code: 'skillDescMissing', file: skill.filePath, args: [metaName || dirName] });
    }
  }
  return warnings;
}

/**
 * Check 3: [[wiki-links]] in memory files that don't resolve to any memory
 * file's name slug within the same memory directory (= same scope).
 * @param {Array<{ name: string, filePath: string, body: string, scope: string }>} memory parsed memory (parsers/memory.mjs)
 * @returns {Array<{ category: string, code: string, file: string, args: string[] }>}
 */
export function checkMemoryLinks(memory) {
  const warnings = [];
  // Group entries by memory directory (scope)
  const byScope = new Map();
  for (const entry of memory || []) {
    if (!byScope.has(entry.scope)) byScope.set(entry.scope, []);
    byScope.get(entry.scope).push(entry);
  }
  for (const entries of byScope.values()) {
    const known = new Set();
    for (const e of entries) {
      if (e.name) known.add(e.name);
      known.add(path.basename(e.filePath, '.md'));
    }
    for (const e of entries) {
      const seen = new Set();
      const linkRe = /\[\[([^\]]+)\]\]/g;
      let m;
      while ((m = linkRe.exec(e.body || '')) !== null) {
        // [[name|alias]] / [[name#heading]] → name
        const target = m[1].split('|')[0].split('#')[0].trim();
        if (!target || known.has(target) || seen.has(target)) continue;
        seen.add(target);
        warnings.push({ category: 'memory', code: 'memoryLinkUnresolved', file: e.filePath, args: [target] });
      }
    }
  }
  return warnings;
}

/**
 * Run all health checks for one scope's already-parsed structure data.
 * @param {{ hooks?: any[], skills?: any[], memory?: any[] }} syncData
 * @param {{ settingsPath: string, claudeConfigDir: string, home?: string }} opts
 * @returns {Array<{ category: string, code: string, file: string, args: string[] }>}
 */
export function lintScope(syncData, opts) {
  return [
    ...checkHookPaths(syncData.hooks || [], opts),
    ...checkSkillFrontmatter(syncData.skills || []),
    ...checkMemoryLinks(syncData.memory || []),
  ];
}
