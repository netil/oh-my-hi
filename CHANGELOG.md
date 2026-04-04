# Changelog

## [0.4.3] - 2026-04-04

### Fixed
- Plugin path resolution: SKILL.md `find` command now searches `plugins/` cache directory instead of relying on `CLAUDE_PLUGIN_ROOT` (which points to the marketplace mirror, not the versioned install cache with `scripts/`)

### Added
- First-run completion banner: after full data loads on first run, a green banner shows the parsed date range (e.g. "✅ Full data loaded · Jan 1, 2025 – Apr 4, 2026") with an × close button that only disappears on user click

## [0.4.2] - 2026-04-03

### Changed
- Progress output improved: step-numbered messages (`[1/3]`, `[1/4]`) replace generic lines; first-run vs normal-run messaging differentiated
- In-place progress bar (`█░` style) rendered during file collection
- `collectAllScopes` accepts `progress` flag to enable/disable bar rendering
- Update check now queries **GitHub tags** first (primary distribution channel), with npm registry as fallback

### Fixed
- Progress bar newline flushed after collection completes (no broken terminal output)
- Update check now compares versions numerically; pre-publish local versions no longer trigger spurious "downgrade" attempts
- `--update` now runs `git fetch --tags` on the marketplace cache before calling `claude plugin update`, so stale local caches no longer report "already at latest" when a newer version exists on GitHub
- Test: replaced flaky mtime comparison with output-based assertion (macOS APFS sub-ms timestamp precision artifact)

## [0.4.0] - 2026-04-02

### Added
- **Incremental cache**: Transcript parse results cached as gzipped append-only segments. Only changed files are re-parsed on subsequent runs
- **Progressive loading**: Cold start shows 7-day preview immediately, then loads full data in background with partial banner notification
- **Lightweight mode** (`--data-only`): Uses mtime-index for change detection without loading full cache. Writes plain JSON pending files merged on next `/omh` run
- **Data/shell separation**: `data.js` (data) separated from `index.html` (shell). Shell rebuilt only on version change, data updated independently
- **Update check**: `/omh --update` to check and install latest version. Auto-check runs once per day on `/omh` with 24h cache
- **Migration detection**: Auto-rebuilds on version upgrade with informational message
- **Cache minification**: Key shortening + string interning (model, context, sessionId) reduces cache size ~80%
- **Mtime-index**: Lightweight change detection file with relative paths and common prefix compression

### Changed
- `--data-only` now runs in lightweight mode (no full cache load, no dashboard rebuild)
- Stop hook collects data only (~0.15s), dashboard updates via `data.js`
- Help page: removed install section (redundant for installed users), update via `--update` parameter
- `findSkillFiles` excludes `node_modules`, `.git`, `temp_git_*`, `temp_local_*` directories

### Fixed
- `findSkillFiles` hanging when plugin cache contains `node_modules` directories

## [0.3.0] - 2026-04-01

### Added
- **Cost trend charts**: Daily/weekly/monthly cost trend with area gradient (Token: Cost page)
- **Token budget**: Configurable daily/weekly/monthly spending thresholds with progress bars and chart grid lines (localStorage-persisted)
- **Session deep dive**: Clickable top sessions table → detailed view with timeline, models, skills/agents/MCP used (`#session/{id}`)
- **Period comparison**: Compare toggle (⚖) overlays previous period data on stat cards and trend chart
- **Unused items cleanup**: MCP servers added to unused detection; cleanup tip shown when >3 unused items
- **Cache efficiency tips**: Contextual insight cards for low hit rate, high creation/read ratio, no-cache sessions
- **Test suite**: 55 tests covering build output, web-ui templates, plugin structure, and parameter behavior (`npm test`)
- **CLAUDE.md**: Project-level instructions for contributors and AI assistants

### Changed
- Token sub-menu restructured into 3 pages: Cost (`#tokens-cost`), Prompt (`#tokens-prompt`), Session (`#tokens-session`)
- Task category and tool context charts moved from Analysis to Token Overview
- Old `#tokens-analysis` route auto-redirects to `#tokens-prompt`
- Session detail sidebar keeps Session menu highlighted

### Fixed
- Marketplace plugin discovery: added `.claude-plugin/plugin.json`, aligned `marketplace.json` with official schema
- Install command in README and Help: `oh-my-hi@oh-my-hi-marketplace` → `oh-my-hi@oh-my-hi`
- Budget save/clear no longer scrolls page to top

## [0.2.4] - 2026-04-01

### Fixed
- Auto-install dependencies (`npm install`) when `node_modules` is missing, preventing `__BB_JS__`/`__EN_DATA__` build errors on first run
- Use dynamic `import()` for esbuild to allow pre-import dependency check

## [0.2.3] - 2026-03-31

### Fixed
- Fix `ReferenceError: ko is not defined` crash on Token Analysis page (hourly distribution chart)
- Fix `calcChange()` using strict equality instead of `matchUsageName()` for non-custom date ranges, causing incorrect change percentages for plugin-namespaced skills
- Fix `--data-only` mode still opening/refreshing browser tab (now correctly skips browser activation)

### Removed
- Dead code: unused `renderTokensActivity()` function, duplicate `clipPath` property, unused `totalH` variable

## [0.2.2] - 2026-03-31

### Added
- Update caveat note in README and Help page for known plugin cache issue
- Use `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` for cross-environment compatibility

## [0.2.1] - 2026-03-31

### Changed
- Merge Installation and Update sections into single "Installation & Update" in README and Help page
- Fix update instructions: marketplace add required before install

## [0.2.0] - 2026-03-31

### Added
- esbuild for CSS/JS minification (CSS -20%, JS -31%)
- Billboard.js (pkgd) bundled inline — full offline support, no CDN dependencies
- Usage data minification: key shortening + sessionId indexing (14.8MB → 8.5MB, -43%)
- English locale file (`locales/en.json`) — extracted from hardcoded `I18N.en`
- Task category schema file (`work-types.json`) — externalized from build script
- 13 new work type categories (25 total): Refactor, Test, Git, Frontend, Backend, Database, DevOps, Security, Data, Research, i18n, Comms, PM

### Changed
- All i18n strings externalized from app.js to locale files (324 keys)
- Task categories auto-generated at every build (no longer user-editable)
- Category labels use English only (removed per-language labels from schema)
- app.js converted from ES5 to ES6+ (const/let, arrow functions, spread)
- Dark theme CSS dynamically injected via JS (replaces `<style media>` approach)

### Fixed
- Donut chart text color override (`.bb-chart-arc text` specificity)
- `--data-only` help text now matches actual behavior
- Added `node_modules` guard with clear error message

## [0.1.3] - 2026-03-31

### Added
- Dashboard guide document (GUIDE.md) with detailed walkthrough of each section
- Update instructions in README and Help page (CLI + in-session commands)
- Shell-styled command block in Help page
- Privacy section in README
- Improved `--data-only` and `--enable-auto` descriptions with bookmark/refresh tips
- Version display in sidebar now auto-injected from package.json at build time

## [0.1.2] - 2026-03-31

### Added
- Estimated cost calculation based on Anthropic API token pricing (per model: input/output/cache read/cache write)
- Cost stat cards: total cost, daily average cost, top 3 models by cost
- Cost column and total row in model breakdown table
- Cost breakdown insight in Token Insights section
- Cost formula explanation with collapsible model pricing table and source link (anthropic.com/pricing)
- Disclaimer note clarifying API-based estimate vs CLI subscription billing

### Fixed
- Period filter (7d/30d) now correctly counts today-inclusive (7d = today + 6 prior days)
- Hide tooltip on active period button (date range already shown below)

## [0.1.1] - 2026-03-31

### Fixed
- Fix missing `type: "command"` field in `--enable-auto` Stop hook registration, which caused Claude Code settings validation error on startup

## [0.1.0] - 2026-03-30

### Added
- Initial release as Claude Code plugin
- Harness overview dashboard with stats cards, category distribution, daily trend chart, popular skills, activity heatmap
- Token analytics: usage by model, daily trends, cache efficiency, prompt statistics, response latency, session analysis, hourly distribution
- Token analysis: task category classification (auto-classified at build time from skill/agent descriptions), tool context breakdown
- Structure page with hierarchical component flow diagram (context / event-driven / user-invoked groups) and file tree
- Help page with parameter reference and data parsing documentation
- 13 data parsers: configFiles, skills, agents, plugins, hooks, memory, mcpServers, rules, principles, commands, teams, plans, todos
- Multi-workspace support (global + per-project scopes)
- Dark/Light mode toggle
- i18n: English (built-in default) + Korean (locales/ko.json), auto-generated locale template for other languages
- `{{configDir}}` template variable for cross-platform path display
- Browser tab reuse on macOS (AppleScript: Chrome → Safari), Windows/Linux fallback
- Auto-refresh via Stop hook (`--enable-auto`)
- Persistent task category mapping (`task-categories.json`, user-editable)
- Single-file HTML output with inlined data (file:// protocol compatible)
