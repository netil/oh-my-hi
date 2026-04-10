// @ts-check
// plans.mjs — plans/*.md parser (plain markdown, no frontmatter)
import fs from 'fs';
import path from 'path';

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, filePath: string, body: string }>}
 */
export function parsePlans(configDir) {
  const dir = path.join(configDir, 'plans');
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
