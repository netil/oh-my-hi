// @ts-check
// teams.mjs — teams/*/config.json parser
import fs from 'fs';
import path from 'path';

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, description: string, members: number, filePath: string }>}
 */
export function parseTeams(configDir) {
  const dir = path.join(configDir, 'teams');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => {
      try { return fs.statSync(path.join(dir, f)).isDirectory(); } catch { return false; }
    })
    .map(f => {
      const configPath = path.join(dir, f, 'config.json');
      try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const memberList = Array.isArray(raw.members)
          ? raw.members.map(m => ({
              name: m.name || m.agentId || 'unknown',
              agentType: m.agentType || '',
              model: m.model || '',
              prompt: m.prompt || '',
              color: m.color || '',
              cwd: m.cwd || '',
            }))
          : [];
        return {
          name: raw.name || f,
          description: raw.description || '',
          members: memberList.length,
          memberList,
          leadAgentId: raw.leadAgentId || null,
          createdAt: raw.createdAt || null,
          filePath: configPath,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
