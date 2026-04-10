// @ts-check
// frontmatter.mjs — YAML frontmatter parser (no dependencies)
import fs from 'fs';

/**
 * Separate frontmatter and body from a markdown file
 * @param {string} filePath
 * @returns {{ meta: Record<string, any>, body: string, raw: string }}
 */
export function parseFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw, raw };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    meta[key] = value;
  }

  return { meta, body: match[2], raw };
}

/**
 * Batch-parse multiple markdown files
 * @param {string[]} filePaths
 * @returns {Array<{ path: string, meta: Record<string, any>, body: string }>}
 */
export function parseMultiple(filePaths) {
  return filePaths.map(fp => {
    try {
      const { meta, body } = parseFrontmatter(fp);
      return { path: fp, meta, body };
    } catch {
      return { path: fp, meta: {}, body: '' };
    }
  });
}
