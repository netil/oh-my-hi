// @ts-check
// todos.mjs — todos/*.json parser (active tasks only)
import fs from 'fs';
import path from 'path';

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, status: string, items: number, filePath: string }>}
 */
export function parseTodos(configDir) {
  const dir = path.join(configDir, 'todos');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const filePath = path.join(dir, f);
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        // Each file is an array of task items
        const items = Array.isArray(raw) ? raw : [];
        if (items.length === 0) return null;
        const pending = items.filter(i => i.status !== 'completed').length;
        const completed = items.filter(i => i.status === 'completed').length;
        // Derive a name from the filename (strip UUID prefix)
        const baseName = path.basename(f, '.json');
        const shortName = baseName.replace(/^[0-9a-f-]+-agent-[0-9a-f-]+$/, 'task-list');
        return {
          name: shortName,
          total: items.length,
          pending,
          completed,
          filePath,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
