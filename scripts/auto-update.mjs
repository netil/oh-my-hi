// @ts-check
// auto-update.mjs: decisions behind oh-my-hi's self-update (pure, no I/O
// except the small state readers at the bottom).
//
// A marketplace install updates itself when the background version check
// finds a newer release: `claude plugin marketplace update` then
// `claude plugin update`, run from the detached update-check child. The new
// version loads in the next session (or after /reload-plugins).

import fs from 'fs';
import path from 'path';

export const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

/** True when version a is greater than version b (numeric semver). */
export function semverGt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

/**
 * Whether to install `latest` now.
 * @param {{ current: string, latest: string|null, marketplaceInstall: boolean,
 *   disabled: boolean, env: NodeJS.ProcessEnv,
 *   lastAttempt?: { version: string, at: number, ok: boolean } | null, now: number }} input
 * @returns {{ run: boolean, reason: string }}
 */
export function shouldAutoUpdate({ current, latest, marketplaceInstall, disabled, env, lastAttempt, now }) {
  if (!latest || !semverGt(latest, current)) return { run: false, reason: 'up-to-date' };
  if (!marketplaceInstall) return { run: false, reason: 'not-a-marketplace-install' };
  if (disabled) return { run: false, reason: 'disabled' };
  if (env.CI) return { run: false, reason: 'ci' };
  // Respect Claude Code's own switches for turning updates off
  const updatesOff = env.DISABLE_UPDATES || env.DISABLE_AUTOUPDATER || env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
  if (updatesOff && !env.FORCE_AUTOUPDATE_PLUGINS) return { run: false, reason: 'updates-disabled-by-env' };
  // A failed attempt at this version waits a day before the next try
  if (lastAttempt && lastAttempt.version === latest && !lastAttempt.ok && now - lastAttempt.at < RETRY_AFTER_MS) {
    return { run: false, reason: 'backoff' };
  }
  return { run: true, reason: 'newer-version' };
}

/** Is this Stop-hook command oh-my-hi's auto-refresh hook? */
export function isAutoRefreshCommand(cmd) {
  return typeof cmd === 'string' && cmd.includes('oh-my-hi')
    && (cmd.includes('--_auto-refresh') || cmd.includes('--data-only'));
}

/**
 * Point oh-my-hi's Stop hook at `command` (the auto-refresh entry of the
 * installed version). The hook embeds a per-version path, which Claude Code
 * deletes 14 days after an update. Mutates `settings`.
 * @returns {boolean} whether anything changed
 */
export function repointAutoHook(settings, command) {
  let changed = false;
  for (const entry of settings?.hooks?.Stop || []) {
    for (const h of entry.hooks || []) {
      if (isAutoRefreshCommand(h.command) && h.command !== command) {
        h.command = command;
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Install directory of `<plugin>@<marketplace>` per installed_plugins.json
 * (the user-scope install, else the first one), or null.
 * @param {string} pluginsRootDir
 * @param {string} id e.g. 'oh-my-hi@oh-my-hi'
 */
export function installedPluginPath(pluginsRootDir, id) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(pluginsRootDir, 'installed_plugins.json'), 'utf-8'));
    const installs = (data.plugins || data)[id];
    const list = Array.isArray(installs) ? installs : installs ? [installs] : [];
    const pick = list.find((i) => i.scope === 'user') || list[0];
    return pick && pick.installPath ? { path: pick.installPath, version: pick.version || null } : null;
  } catch { return null; }
}

/** Auto-update state kept with the output (survives updates). */
export function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return {}; }
}

export function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
}
