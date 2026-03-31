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
│   ├── app.js                   # Frontend JS (ES6+)
│   ├── work-types.json          # Task category schema (25 types)
│   └── locales/
│       ├── en.json              # English locale (base)
│       └── ko.json              # Korean locale
└── output/                      # Generated artifacts
    ├── data.json                # Raw data (for programmatic access)
    └── index.html               # Single file with inlined data+locale+CSS+JS
```

## CLI Parameters

| Parameter | Description |
|-----------|-------------|
| `/omh` | Full build: parse data → build web-ui → open/refresh browser |
| `--data-only` | Regenerate data + web-ui (skip auto-refresh notice and browser open) |
| `--enable-auto` | Register Stop hook for auto-rebuild on session end |
| `--disable-auto` | Remove Stop hook |
| `--status` | Show auto-refresh hook status |
| `<path> [path...]` | Include only specified project paths |
| `--help` | Show help |

## Build Pipeline

```
1. Detect scopes (global + projects)
2. Parse all data sources per scope
3. Build task categories (description-based classification → task-categories.json)
4. Detect system locale → load locales/{locale}.json
5. Generate data.json
6. Generate index.html:
   - dashboard.html template
   - __STYLES__ → styles.css
   - __DATA__ → data.json (escaped, inlined)
   - __LOCALE_DATA__ → locale JSON (with _lang field)
   - __APP_JS__ → app.js
7. Open/refresh browser
```

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
| Harness Overview | `#overview` | Stats cards, category distribution donut, daily trend, popular skills, activity heatmap, recent activity, insights, unused items |
| Token Overview | `#tokens` | Token stats, model distribution donut, trend chart, activity heatmap, model table, insights |
| Token Analysis | `#tokens-analysis` | Task category bar, tool context bar, prompt stats, response latency, session analysis, hourly distribution, cache efficiency |
| Structure | `#structure` | Component flow SVG, file tree |
| Help | `#help` | Parameters table, data parsing reference, token/activity reference |
| Category Overview | `#{categoryKey}` | Total count, usage stats, all items list |
| Detail View | `#{categoryKey}/{name}` | Per-item detail (varies by category) |

## Sidebar Categories (13)

Dynamically shown — hidden when item count is 0.

configFiles, skills, agents, plugins, hooks, memory, mcpServers, rules, principles, commands, teams, plans, todos

## Key Architectural Decisions

1. **Data inline (no fetch)**: index.html embeds data.json as `DATA` variable. Required for file:// protocol compatibility.
2. **Single output file**: All CSS, JS, data, locale inlined into index.html. Billboard.js bundled inline, no CDN dependencies.
3. **Persistent category mapping**: `task-categories.json` auto-generated at every build from `work-types.json` schema.
4. **Locale built once**: Locale file generated on first build for unknown locales. Not rebuilt on subsequent runs.
5. **AppleScript tab reuse**: macOS-only optimization. Searches all browser windows/tabs for URL match.
