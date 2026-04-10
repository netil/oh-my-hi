// @ts-check
// commands.mjs — commands/*.md parser (frontmatter-based, like skills)
import fs from 'fs';
import path from 'path';
import { parseFrontmatter } from './frontmatter.mjs';

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, description: string, filePath: string, body: string }>}
 */
export function parseCommands(configDir) {
  const dir = path.join(configDir, 'commands');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dir, f);
      try {
        const { meta, body } = parseFrontmatter(filePath);
        return {
          name: path.basename(f, '.md'),
          description: meta.description || '',
          allowedTools: meta['allowed-tools'] || null,
          filePath,
          body,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
