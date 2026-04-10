// @ts-check
// mcp-servers.mjs — .claude.json / mcp.json MCP server parser
// IMPORTANT: Never expose env values (tokens/secrets); only return key names
import fs from 'fs';
import path from 'path';

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, command: string, args: string[], type: string|null, envKeys: string[], sourcePath: string }>}
 */
export function parseMcpServers(configDir) {
  const candidates = [
    path.join(configDir, '.claude.json'),
    path.join(configDir, 'mcp.json'),
  ];

  const seen = new Set();
  const result = [];

  for (const sourcePath of candidates) {
    if (!fs.existsSync(sourcePath)) continue;

    let data;
    try {
      data = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    } catch {
      continue;
    }

    const servers = data.mcpServers || {};
    for (const [name, cfg] of Object.entries(servers)) {
      if (seen.has(name)) continue; // first source wins (avoid duplicates)
      seen.add(name);

      // Construct raw JSON with env values masked
      const safeCfg = { ...cfg };
      if (safeCfg.env) {
        const maskedEnv = {};
        for (const k of Object.keys(safeCfg.env)) maskedEnv[k] = '***';
        safeCfg.env = maskedEnv;
      }

      result.push({
        name,
        command: cfg.command || '',
        args: Array.isArray(cfg.args) ? cfg.args : [],
        type: cfg.type || null,
        envKeys: cfg.env ? Object.keys(cfg.env) : [],
        sourcePath,
        rawJson: JSON.stringify({ [name]: safeCfg }, null, 2),
      });
    }
  }

  return result;
}
