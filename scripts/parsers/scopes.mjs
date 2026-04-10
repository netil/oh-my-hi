// @ts-check
// scopes.mjs — project scope detector
import fs from 'fs';
import path from 'path';
import os from 'os';

const HOME = os.homedir();
const USERNAME = os.userInfo().username || path.basename(HOME);

/**
 * Convert label to human-readable form: replace HOME with username
 */
function toLabel(absPath) {
  if (absPath.startsWith(HOME)) {
    return USERNAME + absPath.slice(HOME.length);
  }
  return absPath;
}

/**
 * Extract cwd (actual project path) from JSONL files in projects/ directory
 * Reads the cwd field from the first valid entry in the transcript
 * @param {string} projDirPath - projects/{encoded-name} 절대 경로
 * @returns {string | null}
 */
function readProjectCwd(projDirPath) {
  let files;
  try {
    files = fs.readdirSync(projDirPath).filter(f => f.endsWith('.jsonl'));
  } catch {
    return null;
  }

  for (const file of files) {
    const filePath = path.join(projDirPath, file);
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.cwd && typeof entry.cwd === 'string') {
          return entry.cwd;
        }
      } catch {
        // Skip on parse failure
      }
    }
  }

  return null;
}

/**
 * Detect scope list
 * @param {string} configDir - Claude config 루트 경로
 * @param {string[]} extraPaths - CLI에서 추가된 프로젝트 경로
 * @returns {Array<{
 *   id: string,
 *   label: string,
 *   type: 'global' | 'project',
 *   configPath: string,
 *   projectPath: string | null,
 * }>}
 */
export function detectScopes(configDir, extraPaths = []) {
  const scopes = [];

  // 1. Global scope (always first)
  scopes.push({
    id: 'global',
    label: 'Global',
    type: 'global',
    configPath: configDir,
    projectPath: null,
  });

  const projectsDir = path.join(configDir, 'projects');
  const seenPaths = new Set();

  // 2. Auto-detect from subdirectories under projects/
  if (fs.existsSync(projectsDir)) {
    let entries;
    try {
      entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projDirPath = path.join(projectsDir, entry.name);

      // Read actual cwd from transcript
      const projectPath = readProjectCwd(projDirPath);
      if (!projectPath) continue;

      // Verify actual path exists
      if (!fs.existsSync(projectPath)) continue;

      // Deduplicate
      if (seenPaths.has(projectPath)) continue;
      seenPaths.add(projectPath);

      scopes.push({
        id: entry.name,
        label: toLabel(projectPath),
        type: 'project',
        configPath: projDirPath,
        projectPath,
      });
    }
  }

  // 3. extraPaths (additional paths from CLI)
  for (const extraPath of extraPaths) {
    const absPath = path.resolve(extraPath);

    if (!fs.existsSync(absPath)) continue;
    if (seenPaths.has(absPath)) continue;
    seenPaths.add(absPath);

    // Generate id using projects/ directory name encoding (leading '/' → '-')
    const id = absPath.replace(/\//g, '-');

    scopes.push({
      id,
      label: toLabel(absPath),
      type: 'project',
      configPath: path.join(projectsDir, id),
      projectPath: absPath,
    });
  }

  return scopes;
}
