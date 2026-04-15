# oh-my-hi — Specification

## Overview

Claude Code harness dashboard generator. Invoked as `/omh` skill.
Parses harness configuration and usage data, builds a single-file HTML dashboard.

## Directory Structure

```
oh-my-hi/
├── SKILL.md                     # Skill definition (invoked as /omh)
├── spec.md                      # This file
├── scripts/
│   ├── generate-dashboard.mjs   # Main entry point
│   └── parsers/
│       ├── agents.mjs           # agents/*.md (frontmatter)
│       ├── commands.mjs         # commands/*.md (frontmatter)
│       ├── config-files.mjs     # CLAUDE.md, AGENTS.md, settings.json
│       ├── frontmatter.mjs      # Shared YAML frontmatter parser
│       ├── hooks.mjs            # settings.json hooks section
│       ├── mcp-servers.mjs      # .claude.json, mcp.json (env values masked)
│       ├── memory.mjs           # projects/*/memory/*.md (excludes MEMORY.md)
│       ├── plans.mjs            # plans/*.md (plain markdown)
│       ├── plugins.mjs          # installed_plugins.json + settings.json
│       ├── rules.mjs            # rules/*.md, principles/*.md (no frontmatter)
│       ├── scopes.mjs           # Global + project scope detection
│       ├── skills.mjs           # skills/*/SKILL.md + plugin cache
│       ├── teams.mjs            # teams/*/config.json
│       ├── todos.mjs            # todos/*.json
│       └── usage.mjs            # history.jsonl + transcripts
├── templates/
│   ├── dashboard.html           # HTML shell with placeholders
│   ├── styles.css               # All CSS
│   ├── app.js                   # Frontend JS (ES6+) — see TOC at top of file
│   ├── session-events.mjs       # Pure Context Explorer session helpers (testable)
│   ├── context-example.mjs      # EXAMPLE_EVENTS, EXAMPLE_GATES, KIND_META constants
│   ├── cost-projection.mjs      # Month-end cost projection (projectMonthEnd, testable)
│   ├── canvas-bars.mjs          # Stacked/session bar layout + log-scale helpers (testable)
│   ├── regression.mjs           # Week-over-week regression detection (testable)
│   ├── work-types.json          # Task category schema (25 types)
│   └── locales/
│       ├── en.json              # English locale (base)
│       └── ko.json              # Korean locale
└── output/                      # Generated artifacts
    ├── data.json                # Raw data (for programmatic access)
    ├── data-core.js             # Core data for instant load (~515KB, sync)
    ├── data-usage.js            # Usage data (~9MB, deferred via <script defer>)
    ├── data.js                  # Legacy single-file (backwards compat)
    ├── index.html               # Dashboard shell (CSS+JS+locales, loads data-core.js + data-usage.js)
    ├── cache/
    │   ├── mtime-index.json     # File path → mtime mapping (relative paths)
    │   ├── base-*.json.gz       # Compacted cache (after 50 segments)
    │   ├── seg-*.json.gz        # Incremental cache segments
    │   └── .update-check        # npm registry check cache (24h TTL)
    └── pending/
        └── *.json               # Lightweight mode deltas (plain JSON)
```

## CLI Parameters

| Parameter | Description |
|-----------|-------------|
| `/omh` | Full build: parse data → build web-ui → open/refresh browser |
| `--data-only` | Lightweight data collection — parse changed files, update data.js (skip full build) |
| `--enable-auto` | Register Stop hook for auto-rebuild on session end |
| `--disable-auto` | Remove Stop hook |
| `--update` | Check npm registry and install latest version |
| `--status` | Show auto-refresh hook status |
| `<path> [path...]` | Include only specified project paths |
| `--help` | Show help |

## Build Pipeline

```
Full mode (/omh):
  1. Detect scopes (global + projects)
  2. Load cache segments + merge pending files
  3. Parse changed transcript files (incremental via mtime/size cache)
  4. Save cache segment (gzipped, append-only) + mtime index
  5. Build task categories (description-based classification → task-categories.json)
  6. Generate data.json + data-core.js + data-usage.js + data.js (minified for browser)
  7. Generate index.html (only on version change or first run):
     - dashboard.html template + __STYLES__ + __APP_JS__ + __LOCALE_DATA__ + billboard.js
     - __APP_JS__ = inlined .mjs modules (session-events, context-example) + app.js
     - Data loaded via <script src="data-core.js"> (sync) + <script src="data-usage.js" defer>
  8. Open/refresh browser + async update check (24h cache)

Lightweight mode (--data-only, Stop hook):
  1. Load mtime-index.json (~34KB) for change detection
  2. Parse only changed transcript files
  3. Save pending file (plain JSON, no gzip)
  4. Update data.js by merging into existing data.json
  5. Rebuild index.html only if missing or version changed
```

### Dev vs Plugin Build Mode

`scripts/generate-dashboard.mjs` detects whether it's running from a source
checkout or from the plugin cache:

- **Dev build** — script's ROOT has `.git` and `package.json.name === 'oh-my-hi'`.
  `needsHtmlRebuild()` always returns true (template edits reflect immediately),
  and `[dev]` is printed to the console.
- **Plugin build** — default for `/omh` runs from `~/.claude/plugins/cache/...`.
  Uses the optimized mtime shortcut for HTML reuse.

Tests force plugin mode with `OMH_BUILD_MODE=plugin` in the subprocess env
where they need to exercise the optimized path.

## Data Sources (13 parsers)

| Parser | Source | Key Fields |
|--------|--------|------------|
| config-files | CLAUDE.md, AGENTS.md, settings.json | name, body, jsonContent, jsonStats |
| skills | skills/*/SKILL.md + plugins/cache | name, description, version, argument-hint, allowed-tools, plugin |
| agents | agents/*.md | name, description, model |
| plugins | installed_plugins.json + settings.json | name, marketplace, version, enabled, author |
| hooks | settings.json hooks | event, matcher, commands |
| memory | projects/*/memory/*.md | name, description, type, scope |
| mcpServers | .claude.json, mcp.json | name, command, args, envKeys (values masked) |
| rules | rules/*.md | name, body (no frontmatter) |
| principles | principles/*.md | name, body (no frontmatter) |
| commands | commands/*.md | name, description, allowed-tools |
| teams | teams/*/config.json | name, description, memberList (name, agentType, model, prompt, color, cwd) |
| plans | plans/*.md | name, body |
| todos | todos/*.json | name, total, pending, completed |

### Usage Parser (usage.mjs)

Parses `history.jsonl` and `projects/*/*.jsonl` transcripts.

| Output | Source | Notes |
|--------|--------|-------|
| commands | history.jsonl | Filters built-in commands (20 types), file paths |
| skills | transcript tool_use (name=Skill) | Extracted from input.skill |
| agents | transcript tool_use (name=Agent) | From input.subagent_type or input.description |
| mcpCalls | transcript tool_use (name=mcp__*) | Server name from between `__` delimiters |
| tokenEntries | transcript assistant.usage | input/output/cache tokens, model, context attribution |
| promptStats | transcript human messages | charLen (text character count) |
| latencyEntries | human→assistant timestamp diff | 0–600,000ms range, per session |

**Token context attribution**: Tracks most recently active context per session (`skill` / `agent` / `mcp` / `tool` / `general`) and attaches it to each token entry.

## Task Categories

Built at build time in `generate-dashboard.mjs`. Persisted in `task-categories.json`.

**Classification priority**:
1. `task-categories.json` existing entry → preserved (user edits survive)
2. Built-in tool name → structural mapping (Edit→code-edit, Bash→execution, etc.)
3. Skill/agent description + name → keyword matching against category seeds
4. Fallback → `other`

**Categories** (25): code-edit, code-search, execution, review, planning, docs, browser, workflow, team, config, general, refactor, test, git, frontend, backend, database, devops, security, data, research, i18n, comms, pm, other

## i18n

- **Base language**: English (`locales/en.json`, externalized)
- **Korean**: `locales/ko.json` (shipped with project)
- **Other locales**: Auto-generated English template on first build if locale file missing
- **Build injection**: System locale detected → `locales/{locale}.json` loaded → injected as `__LOCALE_DATA__` with `_lang` field
- **Runtime**: `t()` function checks `I18N[currentLang]` → falls back to `I18N.en`
- **Template variables**: `{{configDir}}` → `DATA.configDir` (replaced at runtime by `t()`)

## Browser Open/Refresh

| OS | Tab Reuse | Open |
|----|-----------|------|
| macOS | AppleScript: Chrome → Safari (search by URL containing "oh-my-hi", reload + activate) | `open` fallback |
| Windows | — | `start ""` |
| Linux | — | `xdg-open` |

## Dashboard Pages

| Page | Hash | Content |
|------|------|---------|
| Harness Overview | `#overview` | Stats cards, category distribution donut, daily trend, popular skills, context budget (canvas stacked bar + top items, estimated), activity heatmap, recent activity, insights, unused items (incl. MCP servers + cleanup tips) |
| Token Overview | `#tokens` | Token stats, model distribution donut, trend chart, activity heatmap, task category bar, tool context bar, model table, insights |
| Token: Cost | `#tokens-cost` | Cost cards, budget config + progress bars, cost trend charts (daily/weekly/monthly with budget grid lines), cost formula |
| Token Breakdown | `#breakdown` | Startup context cost (CLAUDE.md + skills + principles + MCP × session count, period comparison), type bar chart (skill/agent/MCP/tool/conversation), Top 5 per type, expandable accordion per type |
| Prompt | `#tokens-prompt` | Prompt stats, response latency, hourly distribution, cache efficiency + tips |
| Session | `#tokens-session` | Session stats, top sessions table (clickable) |
| Session Detail | `#session/{id}` | Session stat cards, models/skills/agents/MCP badges, activity timeline table |
| Context Explorer | `#context` | Interactive simulator of what fills the context window during a session. Defaults to Real session mode. Two modes: `Real session` (`#context/{sessionId}` or `#context/session`) — replays actual session token usage with per-turn delta/cumulative, auto-scaling 200K↔1M budget, 3-state terminal visibility eye icons; `Example` — scripted 36-step scenario using real startup measurements. Canvas bar + virtual scroll timeline for performance. |
| Structure | `#structure` | Component flow SVG, file tree |
| Help | `#help` | Context Explorer guide, token/usage reference, parameters table, data parsing reference |
| Category Overview | `#{categoryKey}` | Total count, usage stats, all items list |
| Detail View | `#{categoryKey}/{name}` | Per-item detail (varies by category) |

## Sidebar Categories (13)

Dynamically shown — hidden when item count is 0.

configFiles, skills, agents, plugins, hooks, memory, mcpServers, rules, principles, commands, teams, plans, todos

## Key Architectural Decisions

1. **Data separated from shell**: `index.html` is the dashboard shell (CSS/JS/locales). Data is split into `data-core.js` (~515KB, sync) and `data-usage.js` (~9MB, deferred). Shell is rebuilt only on version change; data is updated independently. Works with `file://` protocol.
2. **Progressive data loading**: `data-core.js` loads instantly with scopes + metadata, allowing Overview to render immediately. `data-usage.js` loads asynchronously with full token/prompt/latency data, then triggers `mergeUsageData()` → re-render. Legacy single `data.js` is also generated for backwards compatibility.
3. **Incremental cache**: Transcript parse results cached as gzipped segments (append-only). Only changed files are re-parsed. Compaction merges segments when count exceeds 50.
4. **Lightweight mode**: `--data-only` (Stop hook) uses a mtime-index for change detection without loading full cache. Writes plain JSON pending files, updates `data.js` by merging into existing `data.json`.
5. **Persistent category mapping**: `task-categories.json` auto-generated at every build from `work-types.json` schema.
6. **Auto-update check**: `/omh` queries npm registry asynchronously (3s timeout, 24h cache). Notifies when new version is available.
7. **AppleScript tab reuse**: macOS-only optimization. Searches all browser windows/tabs for URL match.
8. **Pure modules prepended to `app.js`**: `session-events.mjs`, `context-example.mjs`, `cost-projection.mjs`, `canvas-bars.mjs`, and `regression.mjs` are authored as ESM for unit-testability. The generator strips `export` keywords and prepends them to `app.js` so symbols land in the same script scope. Source of truth lives in the `.mjs` files — never edit the inlined copies.
9. **Week-over-week regression anchored to today**: regression detection (F5) always uses `Date.now()` as the anchor, independent of the sidebar period filter. The card shows explicit dates (`직전 7일 03.28~04.04 / 최근 7일 04.04~04.11`) to avoid confusion with the filter.
10. **Auto log-scale for wide-range data**: `computeBarScale()` switches bar widths from linear to logarithmic when `max/min > 100` so small rows stay visible (applies to `#tokens` where cache dwarfs input/output). The `%` column always shows the real linear share.
