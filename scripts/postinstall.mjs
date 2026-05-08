#!/usr/bin/env node
// Patch better-sqlite3 rpath on macOS arm64 — prebuild missing LC_RPATH for libc++
// Also auto-rebuilds if the binary fails to load (Node.js ABI mismatch after Node upgrade).
import { execFileSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const nativeModule = resolve(ROOT, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node');

if (!existsSync(nativeModule)) process.exit(0);

// ── macOS arm64: patch LC_RPATH for libc++ ──────────────────────────────────
if (process.platform === 'darwin' && process.arch === 'arm64') {
  const otool = spawnSync('otool', ['-l', nativeModule], { encoding: 'utf8' });
  if (otool.stdout && !otool.stdout.includes('LC_RPATH')) {
    try {
      execFileSync('install_name_tool', [
        '-change', '@rpath/libc++.1.dylib', '/usr/lib/libc++.1.dylib',
        nativeModule,
      ]);
      console.log('oh-my-hi: patched better_sqlite3.node rpath on arm64');
    } catch (e) {
      console.warn('oh-my-hi: rpath patch skipped —', e.message);
    }
  }
}

// ── ABI load check: rebuild if the binary doesn't load with this Node.js ────
// Run in a child process so a native crash (segfault) doesn't kill postinstall itself.
const probe = spawnSync(process.execPath, ['-e', "require('better-sqlite3')"], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, NODE_PATH: resolve(ROOT, 'node_modules') },
});
if (probe.status !== 0) {
  console.warn('oh-my-hi: better-sqlite3 load failed (ABI mismatch?) — rebuilding…');
  try {
    execFileSync('npm', ['rebuild', 'better-sqlite3'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    console.log('oh-my-hi: better-sqlite3 rebuild complete');
  } catch (rebuildErr) {
    console.warn('oh-my-hi: rebuild failed — monthly usage data will be unavailable:', rebuildErr.message);
  }
}
