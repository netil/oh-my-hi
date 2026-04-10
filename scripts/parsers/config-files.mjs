// @ts-check
// config-files.mjs — CLAUDE.md, AGENTS.md and other root config file parser
import fs from 'fs';
import path from 'path';

/**
 * Parse root config files
 * @param {string} configDir - $CLAUDE_CONFIG_DIR or project .claude/ path
 * @param {string|null} projectPath - Project root path (for project scope)
 * @returns {Array<{ name: string, filePath: string, body: string, scope: string }>}
 */
export function parseConfigFiles(configDir, projectPath = null) {
  const files = [];
  const targets = ['CLAUDE.md', 'AGENTS.md'];

  // 1) Markdown files in configDir
  for (const name of targets) {
    const fp = path.join(configDir, name);
    if (fs.existsSync(fp)) {
      try {
        files.push({
          name,
          filePath: fp,
          body: fs.readFileSync(fp, 'utf-8'),
          scope: 'global',
        });
      } catch { /* skip */ }
    }
  }

  // 1b) settings.json
  const jsonTargets = ['settings.json', 'settings.local.json'];
  for (const name of jsonTargets) {
    const fp = path.join(configDir, name);
    if (fs.existsSync(fp)) {
      try {
        const raw = fs.readFileSync(fp, 'utf-8');
        const parsed = JSON.parse(raw);
        const keys = Object.keys(parsed);
        const stats = {};
        if (parsed.hooks) stats.hooks = Object.keys(parsed.hooks).length;
        if (parsed.enabledPlugins) {
          const ep = parsed.enabledPlugins;
          stats.enabledPlugins = Array.isArray(ep) ? ep.length : Object.keys(ep).length;
        }
        if (parsed.permissions) stats.permissions = true;
        if (parsed.env) stats.env = Object.keys(parsed.env).length;

        files.push({
          name,
          filePath: fp,
          body: null,
          jsonContent: JSON.stringify(parsed, null, 2),
          jsonKeys: keys,
          jsonStats: stats,
          scope: 'global',
        });
      } catch { /* skip */ }
    }
  }

  // 2) Files in project root (project scope)
  if (projectPath && fs.existsSync(projectPath)) {
    for (const name of targets) {
      const fp = path.join(projectPath, name);
      if (fs.existsSync(fp)) {
        // Dedup check (skip if same file exists in configDir)
        if (files.some(f => f.filePath === fp)) continue;
        try {
          files.push({
            name: name + ' (project)',
            filePath: fp,
            body: fs.readFileSync(fp, 'utf-8'),
            scope: 'project',
          });
        } catch { /* skip */ }
      }
      // Also check under .claude/ subdirectory
      const fpDot = path.join(projectPath, '.claude', name);
      if (fs.existsSync(fpDot) && !files.some(f => f.filePath === fpDot)) {
        try {
          files.push({
            name: name + ' (.claude)',
            filePath: fpDot,
            body: fs.readFileSync(fpDot, 'utf-8'),
            scope: 'project',
          });
        } catch { /* skip */ }
      }
    }
  }

  return files;
}
