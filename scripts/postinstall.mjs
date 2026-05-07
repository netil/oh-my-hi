#!/usr/bin/env node
// Patch better-sqlite3 rpath on macOS arm64 — prebuild missing LC_RPATH for libc++
import { execFileSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const nativeModule = resolve(ROOT, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node');

if (process.platform !== 'darwin' || process.arch !== 'arm64') process.exit(0);
if (!existsSync(nativeModule)) process.exit(0);

const otool = spawnSync('otool', ['-l', nativeModule], { encoding: 'utf8' });
if (otool.stdout && otool.stdout.includes('LC_RPATH')) process.exit(0);

// Patch: rewrite @rpath/libc++.1.dylib → absolute path
// The dyld shared cache makes /usr/lib/libc++.1.dylib work even though ls shows nothing (since Big Sur)
try {
  execFileSync('install_name_tool', [
    '-change', '@rpath/libc++.1.dylib', '/usr/lib/libc++.1.dylib',
    nativeModule,
  ]);
  console.log('oh-my-hi: patched better_sqlite3.node rpath on arm64');
} catch (e) {
  // Non-fatal: the binary may load anyway if the system resolves it
  console.warn('oh-my-hi: rpath patch skipped —', e.message);
}
