// @ts-check
// skills.mjs — local + plugin SKILL.md parser
import fs from 'fs';
import path from 'path';
import { parseFrontmatter } from './frontmatter.mjs';

/**
 * Recursively find all SKILL.md files in a directory
 * @param {string} dir
 * @returns {string[]}
 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'output', 'test']);
const SKIP_DIR_PREFIXES = ['temp_git_', 'temp_local_'];

function findSkillFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_DIR_PREFIXES.some(p => entry.name.startsWith(p))) continue;
      results.push(...findSkillFiles(full));
    } else if (entry.name === 'SKILL.md') {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract plugin name from plugin cache path
 * Path: {cacheDir}/{marketplace}/{plugin-name}/{version}/...
 * @param {string} filePath
 * @param {string} cacheDir
 * @returns {string}
 */
function extractPluginName(filePath, cacheDir) {
  const rel = path.relative(cacheDir, filePath);
  const parts = rel.split(path.sep);
  // parts[0] = marketplace, parts[1] = plugin-name
  return parts.length >= 2 ? parts[1] : parts[0];
}

/**
 * Extract skill fields from frontmatter meta
 * @param {Record<string, any>} meta
 * @param {string} filePath
 * @returns {object}
 */
function extractFields(meta, filePath) {
  return {
    name: meta['name'] ?? path.basename(path.dirname(filePath)),
    description: meta['description'] ?? '',
    version: meta['version'] ?? null,
    argumentHint: meta['argument-hint'] ?? null,
    allowedTools: meta['allowed-tools'] ?? null,
  };
}

/**
 * Parse and return all skills (local + plugin)
 * @param {string} configDir
 * @returns {Array<{
 *   name: string,
 *   description: string,
 *   plugin: string | null,
 *   filePath: string,
 *   body: string,
 *   version: string | null,
 *   argumentHint: string | null,
 *   allowedTools: string | null,
 * }>}
 */
export function parseSkills(configDir) {
  const skills = [];

  // 1. Local skills: skills/*/SKILL.md
  const localDir = path.join(configDir, 'skills');
  if (fs.existsSync(localDir)) {
    for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(localDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      try {
        const { meta, body } = parseFrontmatter(skillFile);
        const fields = extractFields(meta, skillFile);
        skills.push({ ...fields, plugin: null, filePath: skillFile, body });
      } catch {
        // Skip on parse failure
      }
    }
  }

  // 2. Plugin skills: plugins/cache/**/.../SKILL.md
  const cacheDir = path.join(configDir, 'plugins', 'cache');
  const pluginFiles = findSkillFiles(cacheDir);
  for (const filePath of pluginFiles) {
    try {
      const { meta, body } = parseFrontmatter(filePath);
      const fields = extractFields(meta, filePath);
      const plugin = extractPluginName(filePath, cacheDir);
      skills.push({ ...fields, plugin, filePath, body });
    } catch {
      // Skip on parse failure
    }
  }

  // 3. Deduplicate: keep only the latest file (by mtime) for the same name
  const deduped = new Map();
  for (const skill of skills) {
    const existing = deduped.get(skill.name);
    if (!existing) {
      deduped.set(skill.name, skill);
      continue;
    }
    // Local skills take priority over plugin skills
    if (!skill.plugin && existing.plugin) {
      deduped.set(skill.name, skill);
      continue;
    }
    if (skill.plugin && !existing.plugin) continue;
    // Same source: prefer the file with newer mtime
    try {
      const newMtime = fs.statSync(skill.filePath).mtimeMs;
      const oldMtime = fs.statSync(existing.filePath).mtimeMs;
      if (newMtime > oldMtime) deduped.set(skill.name, skill);
    } catch {
      // Keep existing on stat failure
    }
  }

  return [...deduped.values()];
}
