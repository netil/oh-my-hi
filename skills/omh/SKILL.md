---
name: omh
description: Generate oh-my-hi dashboard. Visual catalog and usage/token analysis across Claude Code & Codex — skills, agents, plugins, hooks, memory, MCP servers, rules, and principles. Triggered by "/omh", "harness status", "dashboard", etc.
argument-hint: "[--data-only] [--enable-auto] [--disable-auto] [--status] [--update] [--help]"
---

# oh-my-hi

> **Oh, so that's what your coding agents have been doing!**

Generates a full harness insights dashboard (Claude Code & Codex) and opens it in the browser.

## Usage

- `/omh` — Full build (parse data → build web-ui → start local HTTP server → open browser)
- `/omh --data-only` — Regenerate data files only (server continues serving updated files)
- `/omh --enable-auto` — Enable automatic rebuild on session end
- `/omh --disable-auto` — Disable automatic rebuild
- `/omh --status` — Check auto-refresh status
- `/omh --update` — Check and install latest version
- `/omh --help` — Show help

## First Run Guide

If the console output after running the script shows **auto-refresh not configured**, ask the user:

> Would you like to enable automatic dashboard data refresh on session end?
> - If enabled, data is automatically refreshed at every session end, so the dashboard always shows the latest data.
> - If disabled, you need to manually run `/omh --data-only` or `/omh` to refresh data.

If the user chooses **enable**, run `--enable-auto`. If they choose **disable**, explain the manual refresh method.

## Behavior

1. Parses harness files from the Claude Code config directory
2. Analyzes usage data (history.jsonl, transcript)
3. Generates data files (`data-core.js`, `data-usage.js`) and `index.html`
4. Starts a local HTTP server (port 3939+) and opens browser

## Architecture

- **Local HTTP server**: `scripts/serve.mjs` serves `output/` over HTTP (port 8282, auto-detects next available); re-uses running instance on subsequent `/omh` calls
- **--data-only**: Regenerates data files only; server continues serving the updated files on next browser refresh
- **Auto-refresh**: `--enable-auto` registers a Stop hook — rebuilds data on every session end
- **Browser open**: macOS `open`, Windows `start`, Linux `xdg-open`

Find and run the script (picks the latest version from cache, falls back to marketplaces):

```bash
PLUGINS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins"
# Pick the highest semver version from cache (sort -V handles semantic versioning)
SCRIPT=$(find "$PLUGINS_DIR/cache" -name "generate-dashboard.mjs" -path "*/scripts/generate-dashboard.mjs" 2>/dev/null \
  | sort -V | tail -1)
# Fallback to marketplaces directory
if [ -z "$SCRIPT" ]; then
  SCRIPT=$(find "$PLUGINS_DIR/marketplaces" -name "generate-dashboard.mjs" -path "*/scripts/generate-dashboard.mjs" -print -quit 2>/dev/null)
fi
if [ -z "$SCRIPT" ]; then
  echo "oh-my-hi: ERROR — generate-dashboard.mjs not found. Try: /omh --update"
  exit 1
fi
# Ensure claude CLI is findable for --update (plugin context may have a stripped PATH)
for _claude_candidate in \
    "$HOME/.claude/local/claude" \
    "/usr/local/bin/claude" \
    "/opt/homebrew/bin/claude" \
    "$HOME/.local/bin/claude" \
    "/usr/bin/claude" \
    "/Applications/Claude.app/Contents/Resources/bin/claude"; do
  if [ -x "$_claude_candidate" ]; then
    export PATH="$(dirname "$_claude_candidate"):$PATH"
    break
  fi
done
node "$SCRIPT" $ARGUMENTS
```
