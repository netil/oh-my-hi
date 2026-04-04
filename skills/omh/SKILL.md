---
name: omh
description: Generate oh-my-hi dashboard. Visual catalog and usage/token analysis of skills, agents, plugins, hooks, memory, MCP servers, rules, and principles. Triggered by "/omh", "harness status", "dashboard", etc.
argument-hint: "[--data-only] [--enable-auto] [--disable-auto] [--status] [--update] [--help]"
---

# oh-my-hi

Generates a full harness insights dashboard and opens it in the browser.

## Usage

- `/omh` — Full build (parse data → build web-ui → open/refresh browser)
- `/omh --data-only` — Regenerate data + web-ui (skip auto-refresh notice)
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
3. Generates data + web-ui (index.html with inlined data, file:// compatible)
4. Opens or refreshes browser tab

## Architecture

- **Inline data**: index.html embeds data directly (file:// compatible, no CORS issues)
- **--data-only**: Regenerates data + web-ui without auto-refresh notice
- **Auto-refresh**: `--enable-auto` registers a Stop hook — rebuilds on every session end
- **Browser reuse**: macOS AppleScript tab detection; Windows/Linux fallback to system open

Find and run the script (searches plugin cache first, then marketplaces):

```bash
SCRIPT=$(find "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins" -name "generate-dashboard.mjs" -path "*/scripts/generate-dashboard.mjs" -print -quit 2>/dev/null)
if [ -z "$SCRIPT" ]; then
  echo "oh-my-hi: ERROR — generate-dashboard.mjs not found. Try: /omh --update"
  exit 1
fi
node "$SCRIPT" $ARGUMENTS
```
