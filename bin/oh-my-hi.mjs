#!/usr/bin/env node
// bin/oh-my-hi.mjs — standalone CLI entry point.
//
// Lets the dashboard run WITHOUT Claude Code: `npx oh-my-hi`, or a global
// install exposing `oh-my-hi` / `omh`. It's a thin launcher that delegates to
// the dashboard generator, which builds output/ and (in full mode) starts the
// local server and opens a browser. All flags (--data-only, --help, --update,
// <path>…) pass straight through.
//
// Data selection is by config-dir discovery (CLAUDE_CONFIG_DIR / CODEX_HOME),
// independent of how this launcher was invoked.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'scripts', 'generate-dashboard.mjs');

const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on('error', (err) => {
  console.error('oh-my-hi:', err.message);
  process.exit(1);
});
