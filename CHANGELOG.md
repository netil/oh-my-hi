# Changelog

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
