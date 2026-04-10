// @ts-check
// plugins.mjs — plugins/installed_plugins.json parser
import fs from 'fs';
import path from 'path';

/**
 * Read owner/author info from marketplace.json
 */
function readMarketplaceAuthor(configDir, marketplace, pluginName) {
  const mpDir = path.join(configDir, 'plugins', 'marketplaces', marketplace);
  const mpFile = path.join(mpDir, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(mpFile)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(mpFile, 'utf-8'));
    // plugin-level author
    if (data.plugins && Array.isArray(data.plugins)) {
      const plugin = data.plugins.find(p => p.name === pluginName);
      if (plugin?.author?.name) return plugin.author.name;
    }
    // marketplace-level owner
    if (data.owner?.name) return data.owner.name;
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} configDir
 * @returns {Array<{ name: string, marketplace: string, scope: string, version: string, installedAt: string, lastUpdated: string, installPath: string, enabled: boolean, author: string|null }>}
 */
export function parsePlugins(configDir) {
  const pluginsFile = path.join(configDir, 'plugins', 'installed_plugins.json');
  const settingsFile = path.join(configDir, 'settings.json');

  if (!fs.existsSync(pluginsFile)) return [];

  const installed = JSON.parse(fs.readFileSync(pluginsFile, 'utf-8'));

  // enabledPlugins can be an object { "name@market": true } or an array
  let enabledSet = new Set();
  if (fs.existsSync(settingsFile)) {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    const ep = settings.enabledPlugins;
    if (Array.isArray(ep)) {
      ep.forEach(k => enabledSet.add(k));
    } else if (ep && typeof ep === 'object') {
      Object.entries(ep).forEach(([k, v]) => { if (v) enabledSet.add(k); });
    }
  }

  // Collect all entries, then deduplicate by name (merge scopes)
  const byName = new Map();
  for (const [key, entries] of Object.entries(installed.plugins || {})) {
    const atIdx = key.lastIndexOf('@');
    const name = atIdx !== -1 ? key.slice(0, atIdx) : key;
    const marketplace = atIdx !== -1 ? key.slice(atIdx + 1) : '';
    const enabled = enabledSet.has(key);

    for (const entry of entries) {
      const existing = byName.get(name);
      if (!existing) {
        byName.set(name, {
          name,
          marketplace,
          scope: entry.scope || 'unknown',
          version: entry.version || 'unknown',
          installedAt: entry.installedAt || null,
          lastUpdated: entry.lastUpdated || null,
          installPath: entry.installPath || null,
          enabled,
          author: readMarketplaceAuthor(configDir, marketplace, name),
        });
      } else {
        // Merge: combine scopes, keep latest dates, prefer enabled
        if (existing.scope !== entry.scope) {
          existing.scope = existing.scope + ', ' + (entry.scope || 'unknown');
        }
        if (entry.lastUpdated && (!existing.lastUpdated || entry.lastUpdated > existing.lastUpdated)) {
          existing.lastUpdated = entry.lastUpdated;
          existing.version = entry.version || existing.version;
          existing.installPath = entry.installPath || existing.installPath;
        }
        if (enabled) existing.enabled = true;
      }
    }
  }

  return [...byName.values()];
}
