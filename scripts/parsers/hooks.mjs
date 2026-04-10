// @ts-check
// hooks.mjs — settings.json hooks parser
import fs from 'fs';
import path from 'path';

/**
 * @param {string} configDir
 * @returns {Array<{ event: string, matcher: string, type: string, command: string }>}
 */
export function parseHooks(configDir) {
  const settingsFile = path.join(configDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) return [];

  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  const hooks = settings.hooks || {};

  // Group by event+matcher, merge commands into array
  const byKey = new Map();
  for (const [event, entries] of Object.entries(hooks)) {
    for (const entry of entries) {
      const matcher = entry.matcher || '*';
      const key = event + '::' + matcher;
      if (!byKey.has(key)) {
        byKey.set(key, { event, matcher, type: 'command', commands: [] });
      }
      for (const hook of entry.hooks || []) {
        byKey.get(key).commands.push(hook.command || '');
      }
    }
  }

  return [...byKey.values()].map(h => {
    // Reconstruct the original settings.json snippet for this hook
    const entries = hooks[h.event] || [];
    const matchedEntries = entries.filter(e => (e.matcher || '*') === h.matcher);
    const rawSnippet = { [h.event]: matchedEntries };

    return {
      event: h.event,
      matcher: h.matcher,
      type: h.type,
      command: h.commands.join('\n'),
      commandCount: h.commands.length,
      rawJson: JSON.stringify(rawSnippet, null, 2),
    };
  });
}
