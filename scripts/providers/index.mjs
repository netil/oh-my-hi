// @ts-check
// providers/index.mjs — provider registry & discovery.
//
// Data selection is driven by which config directories exist on this machine,
// NOT by which harness launched oh-my-hi. Each provider resolves its own
// config dir from an environment variable (CLAUDE_CONFIG_DIR / CODEX_HOME),
// mirroring the same pattern. A provider whose config dir is absent is simply
// skipped, so a Claude-only machine behaves exactly as before.
import fs from 'fs';
import { claudeProvider } from './claude.mjs';

/** All known providers, in display order. */
export const PROVIDERS = [claudeProvider];

/** @param {string} id */
export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || null;
}

/**
 * Providers whose config directory currently exists on disk.
 * @returns {typeof PROVIDERS}
 */
export function discoverProviders() {
  return PROVIDERS.filter(p => {
    try { return fs.existsSync(p.configDir()); } catch { return false; }
  });
}
