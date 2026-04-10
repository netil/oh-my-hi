// @ts-check
// rules.mjs — rules/*.md and principles/*.md parser (no frontmatter)
import fs from 'fs';
import path from 'path';

/**
 * Parse .md files in the specified directory
 * @param {string} dir
 * @returns {Array<{ name: string, filePath: string, body: string }>}
 */
function parseMdDir(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dir, f);
      try {
        const body = fs.readFileSync(filePath, 'utf-8');
        return {
          name: path.basename(f, '.md'),
          filePath,
          body,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, filePath: string, body: string }>}
 */
export function parseRules(configDir) {
  return parseMdDir(path.join(configDir, 'rules'));
}

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, filePath: string, body: string }>}
 */
export function parsePrinciples(configDir) {
  return parseMdDir(path.join(configDir, 'principles'));
}
