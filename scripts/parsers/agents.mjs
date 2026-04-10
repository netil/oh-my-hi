// @ts-check
// agents.mjs — agents/*.md parser
import fs from 'fs';
import path from 'path';
import { parseFrontmatter } from './frontmatter.mjs';

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, description: string, model: string|null, filePath: string, body: string }>}
 */
export function parseAgents(configDir) {
  const agentsDir = path.join(configDir, 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md') && f !== 'changelog.md')
    .map(f => {
      const filePath = path.join(agentsDir, f);
      try {
        const { meta, body } = parseFrontmatter(filePath);
        return {
          name: meta.name || path.basename(f, '.md'),
          description: meta.description || '',
          model: meta.model || null,
          filePath,
          body,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
