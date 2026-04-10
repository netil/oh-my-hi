// @ts-check
// memory.mjs — projects/*/memory/*.md parser
import fs from 'fs';
import path from 'path';
import { parseFrontmatter } from './frontmatter.mjs';

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, description: string, type: string, filePath: string, body: string, scope: string }>}
 */
export function parseMemory(configDir) {
  const projectsDir = path.join(configDir, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const result = [];

  for (const projectEntry of fs.readdirSync(projectsDir)) {
    const memoryDir = path.join(projectsDir, projectEntry, 'memory');
    if (!fs.existsSync(memoryDir)) continue;

    for (const file of fs.readdirSync(memoryDir)) {
      if (!file.endsWith('.md') || file === 'MEMORY.md') continue;

      const filePath = path.join(memoryDir, file);
      try {
        const { meta, body } = parseFrontmatter(filePath);
        result.push({
          name: meta.name || path.basename(file, '.md'),
          description: meta.description || '',
          type: meta.type || 'unknown',
          filePath,
          body,
          scope: projectEntry,
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  return result;
}
