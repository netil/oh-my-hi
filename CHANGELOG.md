# Changelog

## [0.11.1] - 2026-04-25

### Fixed
- Added `.npmignore` to exclude `.claude/` and `.vscode/` from npm package

## [0.11.0] - 2026-04-25

### Added
- **Local HTTP server** (`scripts/serve.mjs`, port 8282) — replaces `file://` protocol. Serves `output/` as static files and exposes two REST endpoints:
  - `GET /api/meta` — `data.json` with usage arrays stripped, for fast initial load
  - `GET /api/usage?scope=&from=&to=` — SQLite query returning usage payload for the requested scope and time range
  - Server reused across builds via a lock file (`cache/.serve.json`). Dev build serves with `Cache-Control: no-store`; production with `immutable`.
- **Monthly-partitioned SQLite** (`scripts/db.mjs`) — usage data stored in `output/db/{year}/{year-MM}.sqlite`. Each entry is routed to the DB for the month its timestamp falls in. Tables: `token_entries`, `prompt_entries`, `skill_usage`, `agent_usage`, `mcp_calls`, `latency_entries`. Schema v1 with UNIQUE indexes on all tables for safe incremental writes.
  - `prompt_entries` replaces legacy `prompt_stats` daily aggregates — stores individual prompt events with `{sessionId, timestamp, charLen, preview}`.
  - `latency_entries` — new table for response latency measurements per API call.
  - `appendUsageMonthly()` — routes all 6 data types to the correct monthly DB by timestamp.
  - `queryUsageMultiDb()` — merges and deduplicates results across multiple monthly DBs for date-spanning queries.
  - `splitLegacyDb()` — one-time migration helper from pre-partitioned `oh-my-hi.sqlite`.
- **API-based data loading in `app.js`** — inline `DATA` embed removed. `tryApiInit()` fetches `/api/meta` at startup; `fetchUsageForPeriod(scope, from, to)` fetches `/api/usage` on demand. `AbortController` cancels stale in-flight requests when scope or period changes rapidly.
- **Loading overlay** — shown during initial API fetch, removed when data is ready.
- **`better-sqlite3`** added to `dependencies`.
- **19 new DB tests** — `latencyEntries` write/read/filter/dedup, `upsertUsage` latencyEntries replacement, `queryUsageMultiDb` latencyEntries merge, `appendUsageMonthly` routing, `splitLegacyDb` migration.

### Changed
- `generate-dashboard.mjs` now spawns `serve.mjs` instead of opening `file://` directly. `appendUsageMonthly()` called after every data write. Deferred migration (`data.json` → SQLite) runs after the server is already serving data.
- `--data-only` lightweight path always runs collect + merge + SQLite sync.
- Default server port changed from 7979 to **8282**. Fallback ports: 7979, 8181, 8383, 9191, 9292.
- `SPEC.md` updated to reflect monthly DB structure and port change.

### Tests
- **459 → 478** (+19): `db.test.mjs` latencyEntries, appendUsageMonthly, splitLegacyDb

## [0.10.0] - 2026-04-15

### Added
- **Token Breakdown page** (`#breakdown`) — new page under Tokens group. Breaks down token usage by context type (skill / agent / MCP / built-in tool) and individual item.
  - **Startup context cost** — estimates cumulative cost of auto-loaded items (CLAUDE.md, skill descriptions, principles, MCP tool listings) × session count. Shows period-over-period change and estimated cost derived from the session's actual average input cost per token.
  - **Type bar chart** — `renderBarCard`-style horizontal bar for skill / agent / MCP / tool / conversation with period comparison (% vs previous equal-length period).
  - **Top 5 per type** — mini cards showing top 5 token consumers for Overall + each type. Custom hover tooltip for truncated names.
  - **Detail accordion** — expandable rows per type showing all items with token count, call count, avg tokens/call, and share. State persisted to localStorage across refreshes.
  - **Startup vs usage proportion bar** added and removed (too small a ratio to be meaningful).
- **`renderBarCard` extended options** — `titleHtml`, `subtitleHtml`, `valueLabelHtml` (rendered above total on right side), `fillHeight` (CSS class for equal-height cards in flex rows), `footerHtml` (inside card, below rows with border-top). Change badge now renders before the total value (% → number order).
- **Automatic update check** on `/omh` run — `notifyUpdateIfAvailable()` reads `.update-check` cache synchronously (≤1ms, no network); `scheduleUpdateCacheRefresh()` spawns a detached unref'd child process when cache is stale (>12h). Locale-aware messages (ko/en). `--_update-cache` internal flag for the background worker.
- **README** — Token Breakdown section with `assets/token-breakdown.png` screenshot.
- **Help page** (`#help`) — reorganized sections to follow sidebar order; section titles show menu breadcrumb (e.g., "토큰 › 💰 비용"); version tag removed from Insights title; Token Breakdown section added.
- **Test files** — `test/update-check.test.mjs` (22 tests for update-check infrastructure and semverGt), `test/locale-detection.test.mjs` (31 tests for LANG env detection, writeHtml locale creation, locale-aware update messages).
- **Locale detection tests** — `web-ui.test.mjs` gains 13 new tests for Breakdown feature (routing, state, aggregation, renderBarCard options, CSS classes) and 14 new i18n keys.

### Changed
- **Sidebar restructured** — Tokens group now only contains 비용 and 항목별 분석. A `nav-section-label` ("사용 분석") separates the flat items: 🪟 컨텍스트 익스플로러, 💬 프롬프트, 📋 세션, 🗂️ 구조. "Token Breakdown" shortened to "Breakdown" (redundant prefix removed).
- **`IS_ACTUAL_DEV_REPO`** — new constant that ignores `OMH_BUILD_MODE=plugin` override so the dev build badge persists even when `cache.test.mjs` runs plugin-mode builds against the shared output directory.
- **`--data-only` lightweight path** — always syncs `_devBuild` flag after transcript merge (previously only ran when `parsed > 0`).
- **`build.test.mjs`** — captures `data.json` snapshot immediately after `execSync` to guard against concurrent test runs overwriting it.

### Tests
- **364 → 430** (+66): `update-check.test.mjs` (+22), `locale-detection.test.mjs` (+31), `web-ui.test.mjs` (+13)

## [0.9.0] - 2026-04-14

### Added
- **Harness Health Score** (`#overview`) — billboard.js gauge (0–100) with 5 weighted factors: Context Efficiency (30%), Cost Trend (25%), Unused Items (20%), Cache Efficiency (15%), Skill Coverage (10%). Grade A–F. Cost Trend shows N/A when no previous-period data is available and is excluded from the weighted total.
- **Context Optimizer** — 8 rule-based suggestion cards on `#overview`: unused MCP, unused skills, unused memory, large CLAUDE.md, low cache hit rate, high-cost skill, Opus overuse, context bloat. Dismiss removed — cards always show current state.
- **Session Bookmark & Tag** (`#tokens-session`) — star toggle and free-text tags per session, persisted in localStorage. Filter bar: All / Starred / tag.
- **Session Compare** (`#compare/{id1}/{id2}`) — side-by-side diff of two sessions: tokens, turns, peak context, cost. Mobile tab-switch layout.
- **Cache TTL Impact** (`#tokens`) — detects cost waste from short cache TTL. Shows best/worst 7-day rolling efficiency stat cards, estimated waste cost (red), and a daily cache efficiency area chart with best/worst reference lines.
- **`cache-ttl.mjs`** — pure module for cache TTL math: `buildDailyCacheMap`, `computeRollingEfficiency`, `computeWasteCost`, `computeRollingEfficiencySeries`. 15 unit tests.
- **Bar card sub-pages** — Token/Cost/Prompt/Session sub-pages now use `renderBarCard` (overview-hero solo) with per-row change badges. Labels shortened (Input/Output/Cache, Short/Medium/Long). Summary range line above prompt/session bars.
- **Scroll position preserved** on date range / period change — page no longer jumps to top when switching periods.

### Changed
- **Health Score Cost Trend** shows N/A (excluded from weighted sum) when `days === 0` or no previous-period data exists. Help icon (?) with custom tooltip explains the logic.
- **`renderBarCard`** gains `labelWidth`, `summaryHtml`, `valueFmt`, `totalFmt` options. Labels right-aligned.
- **Optimizer memory card** shows filename instead of Korean `name` field.
- **Health Score labels** abbreviated for English: `Ctx Eff.`, `Unused`, `Cache Eff.`, `Coverage`.

### Tests
- **346 → 364** (+18): `cache-ttl.test.mjs` (15), `health-score.test.mjs` +3 (N/A cost trend, weight exclusion)

## [0.8.0] - 2026-04-11

### Added
- **Response performance regression detection** — compares the trailing 7 days against the previous 7 days for average response latency and average tokens per turn. When any metric degrades by ≥15% a compact warning card appears in the Harness Overview hero row. The card shows a dual time-period bar (직전 7일 / 최근 7일) with concrete dates, the worst regressed metric, and a click-through link to the most actionable sub-page.
- **Probable-cause detection for regressions** — `detectCauses()` inspects cache hit rate and Opus share across the two windows. If the cache hit rate dropped ≥10pp or Opus share grew ≥10pp the banner swaps the generic hint for a data-driven one ("캐시 히트율이 {A}에서 {B}로 하락" / "Opus 비중이 {A}에서 {B}로 증가") plus a check link to the relevant page.
- **Month-end cost projection** on `#tokens-cost` — trailing 7-day daily average extrapolated to month end, with over/under budget comparison (needs ≥3 active days in the window, `confidence: low` if 3–4, `high` otherwise). Projection card sits inside the existing budget section.
- **Skill & agent efficiency cards** — `#skills/{name}` and `#agents/{name}` detail pages show total calls, average tokens per call, total cost contribution, average cost per call, and the item's share of its category cost. The top 3 cost contributors in each category get a 🔥 badge in the sidebar (restricted to the user's own item list so built-in Claude contexts don't crowd out real skills).
- **Usage bar card** (`renderBarCard`) — replaces the four stat cards on Harness Overview (Total / Skills / Agents / Commands) and Token Overview (Total / Input / Output / Cache) with a single card. The total anchors the 100% baseline and each sub-metric is rendered as a proportional horizontal bar with label, raw value, linear %, and % change vs. the previous period. All numbers go through `fmtCompact` per the number-formatting principle.
- **Automatic log-scale bars** — when the largest row value is more than 100× the smallest (common on the Tokens page where cache dwarfs input/output), bar widths switch to a logarithmic scale so small items stay visible at 8% minimum width. A "로그 스케일" notice above the rows explains the switch. The % column always shows the real linear share.
- **Overview hero row** — new 2-column flex layout (`container-type: inline-size`) that pairs the regression card (left, fixed 280px) with the usage bar card (right, flexible). Wraps to a single column below 720px container width.
- **Pure helpers in `canvas-bars.mjs`** — `computeBarScale()` and `computeBarWidth()` extracted from `renderBarCard()` so the log-threshold decision and width computation can be unit-tested without a DOM.
- **New test files** — `test/regression.test.mjs` (31 tests covering window math, cache/model-mix detection, end-to-end regression computation) and `test/cost-projection.test.mjs` (18 tests for `projectMonthEnd()`). `test/canvas-bars.test.mjs` expanded with 13 new tests for the bar-scale helpers.
- **#help page — new "Insights & Optimization" section** with entries for regression detection, the usage bar card, log-scale bars, cost projection, and efficiency scoring. Ten new locale keys in `en`/`ko`.

### Changed
- **Left sidebar "Tokens" group always expanded** — removed the collapse/toggle chevron. The three sub-items (Cost / Prompt / Session) are visible from first render; clicking the Tokens header still navigates to `#tokens`.
- **Drum bar layout math moved to `canvas-bars.mjs`** — `drawStackedBar()` and the Context Window Explorer session bar (`renderBarSegments`) now delegate geometry to `layoutStackedBar()` / `layoutSessionBar()`. Hover/alpha state still lives in the closure.
- **`page-desc` visual style simplified** — removed the rounded pill background/border from the Token Overview description so it reads as plain inline text under the title.
- **Usage-bar card title size** — bumped from 12px uppercase caption to 18px primary-colored title so it reads as a proper section header.

### Tests
- **288 → 301** (+13 canvas-bars tests for `computeBarScale` + `computeBarWidth`)
- Total new tests written this release across all files: **60+**
- All regression metrics (latency, tokens/turn, cache-drop cause, opus-shift cause) covered by 19 dedicated regression tests.

### Fixed
- **Cleaned up unused locale keys** from the earlier full-size regression banner prototype (`regressionInsightsTitle`).

### Added
- **Context Budget section** on Overview page — estimates token distribution across hidden (startup), brief (tool output), and full (user-visible) contexts. Canvas-based stacked bar + top-8 ranked table. Hidden token cost is multiplied by session count in the selected period for accurate estimation. Subtitle explicitly labels the data as "estimated."
- **Progressive data loading** — dashboard now loads in two phases: `data-core.js` (515KB, sync) for instant initial render, then `data-usage.js` (~9MB, deferred) for usage-heavy views. Legacy single `data.js` preserved for backwards compatibility.
- **`drawStackedBar()` reusable canvas helper** — DPR-aware proportional bar renderer, used by Context Budget and available for future sections.
- **`aggregateVisibility()` function** in `session-events.mjs` — aggregates tokenEntries + contextStats into per-context visibility breakdown with session count scaling for startup costs.
- **`localizeDocsUrl` extended** — now handles `code.claude.com/docs/en/` URLs in addition to `docs.anthropic.com/en/docs/`, enabling i18n for all Claude documentation links in the Context Explorer.
- **Test coverage reporting** — `npm test` now includes `--experimental-test-coverage` flag, printing line/branch/function coverage on every run.
- **Tests**: 216 total (+18 new) — aggregateVisibility (8), progressive loading build (1), session count multiplier (2); web-ui template tests (7); cache schema version (1), flaky cache test fix (1).

### Changed
- **Help page section order** — Run Parameters section moved to the top for faster discoverability.
- **Context Explorer timeline nav buttons** (top/bottom) hidden in example mode, visible only in session mode.
- **Context Explorer "자세히 →" links** now follow i18n locale — Korean users see `/docs/ko/` URLs instead of `/docs/en/`.
- **Turn count in session list** now formatted with `fmtCompact` (locale-aware comma separators under 10K, SI prefix above).

### Fixed
- **Session list showing hash IDs** — `promptStats` entries from old cache lacked `preview` field. Added `CACHE_SCHEMA_VERSION` to mtime index; version mismatch invalidates the index and forces a full re-parse with correct preview extraction.
- **Lightweight mode merge never applied** — `savePending()` cleared `_new` flags before the merge step read them, so incremental data.js updates were always empty. Merge now runs before `savePending`. Full re-parse (schema invalidation) replaces arrays instead of appending to avoid duplicates.
- **Context Budget period filter** — visibility data now filtered by the selected date range (was showing unfiltered totals).

## [0.6.0] - 2026-04-09

### Added
- **Tagline** — "Oh, so that's what Claude's been doing!" / "아, 이래서 Claude가 그랬구나!" shown under the sidebar logo, applied across `package.json`, `marketplace.json`, `README.md`, and `SKILL.md`.
- **Context Explorer: session metadata panel** — the full prompt snippet, date, turn count, model, and peak context are now rendered in a dedicated row beneath the timeline so long prompts are no longer clipped in the search input.
- **Sidebar: progressive rendering for large categories** — categories with more than 50 items render only the first 50 with a "+N more" footer to keep initial DOM cost bounded on harnesses with hundreds of skills/agents. Search bypasses the cap since results are already narrowed.
- **Parser test suite** (`test/parser.test.mjs`) — 24 unit tests covering `frontmatter`, `skills`, `agents`, `hooks`, `mcp-servers`, and `memory` parsers, including a security assertion that MCP env values are masked (never exposed in `rawJson`).
- **`templates/session-events.mjs` module** — `mapSessionCtx`, `listReplayableSessions`, and `buildSessionEvents` extracted as pure functions with 18 unit tests (`test/session-events.test.mjs`). Source of truth for Context Explorer session logic.
- **`templates/context-example.mjs` module** — `EXAMPLE_EVENTS`, `EXAMPLE_GATES`, and `KIND_META` constants extracted from the Context Explorer renderer.
- **Number formatting principle** documented in `CLAUDE.md` → Code Conventions → Number Formatting. `fmtCompact()` is now the canonical formatter: `Intl.NumberFormat` for `|n| < 10,000`, SI prefix (K/M/B) above. Sign preserved, trailing `.0` stripped, non-numeric guarded. Context Explorer's local `fmt()` now delegates to it, so session numbers are locale-aware.
- **Dev vs plugin build mode** — `IS_DEV_BUILD` auto-detects source checkouts (`.git` + `package.json.name === 'oh-my-hi'`) and forces full HTML rebuild every run. `OMH_BUILD_MODE=dev|plugin` env var provides an explicit override for tests.
- **Number format unit tests** (`test/number-format.test.mjs`) — 9 tests verifying `fmtCompact` / `fmtNum` behavior by extracting and evaluating the functions from `app.js`.
- **TOC header in `templates/app.js`** — a section index at the top of the file lists all 37 `// ── X ──` markers with one-line descriptions for quick navigation.
- **`README.md` Context Window Explorer section** — new feature entry + screenshot + example GIF showing a guided session replay.

### Changed
- **Sidebar logo layout** — the tagline now lives on its own row above the version badge + language toggle, so the longer catchphrase has room to breathe.
- **Theme toggle** only calls `renderContent()` for views that compute theme-dependent values in JS (`overview`, `context`, `structure`). All other pages theme via CSS alone, making the toggle instantaneous on token/category/detail pages.
- **Detail renderer dedup** — extracted `filePathBlock`, `descriptionBlock`, `markdownBodyBlock`, `usageMetaCards`, and `renderSimpleBodyDetail` helpers. `renderRuleDetail` / `renderPrincipleDetail` / `renderPlanDetail` now share a single implementation.
- **`bottomBar` reference** — Context Explorer's playback row now uses an explicit `#cw-playback-bar` id instead of `root.children[last]` indexing, fixing a bug where adding sibling elements after the row silently broke show/hide logic.
- **Korean translations completed** for `flowUserPrompt`, `flowRulesPrinciples`, `flowHooks`, `flowSkillsAgents`, `flowMcpServers`, `cwe_kindAuto`, `cwe_kindHook`.
- **`_devBuild` flag in data.json** now sources from `IS_DEV_BUILD` instead of a duplicate `scriptDir` check.
- **Build script** inlines `.mjs` helper modules via a generic `INLINED_MODULES` list (`session-events.mjs`, `context-example.mjs`), making future extractions a one-line change.

### Fixed
- **Session search list scroll reset** now follows a precise contract: scroll resets to top **only** when the sort criterion actually changes. Selecting an item and reopening the list with the same sort preserves the user's scroll position. Changing sort while the layer is hidden defers the reset via a `_pendingScrollReset` flag consumed on the next open.
- **Sort button on focused input** — `mousedown` preventDefault stops the session input from losing focus when the user clicks a sort button.
- **`v0.0.0` leaking into `index.html`** — `cache.test.mjs` version-mismatch test now wraps its tamper in `try/finally` to always restore the original HTML.
- **DEV BUILD badge disappearing after test run** — `cache.test.mjs` now snapshots `data.json` / `data.js` / `index.html` before the suite and restores them in the `after` hook, so plugin-mode test runs don't leak `_devBuild: undefined` into the developer's live dashboard.

### Removed
- Unused `isDevBuild` locally-scoped flag in `scripts/generate-dashboard.mjs` (replaced by module-level `IS_DEV_BUILD`).

## [0.5.1] - 2026-04-09

### Added
- **Context Explorer: 3-state terminal visibility eye icons** — timeline rows now show a closed-eye icon (hidden from terminal), dash-eye icon (brief one-liner), or filled green eye+circle (full content shown).
- **Visibility legend** in the Context Explorer bar area labels all three states inline.
- **Help page: Context Explorer section** — documents the two modes, context bar, and timeline with visibility icons.
- **Test coverage** for all new Context Explorer features: canvas bar functions, virtual scroll functions, tab order, eye icon SVGs, visibility legend, session-default navigation, and Help page content (131 → 140 tests).

### Changed
- **Context Explorer tab order** — Real session tab now appears before Example session tab.
- **Default mode on navigation** — opening `#context` now lands on Real session mode (previously Example session).
- **Scroll buttons** replaced emoji arrows with SVG triangles matching the current design language; timeline top/bottom buttons now jump instantly (no smooth-scroll animation).
- **Context bar rendered as a single Canvas node** — replaced stacked `div` segments with a Canvas 2D API implementation for better rendering performance. Hit testing via stored segment coordinates with binary search.
- **Timeline virtual scrolling** — `cw-tl-virt` container now renders only visible rows (+ buffer) with absolute positioning, eliminating DOM bloat on sessions with 1000+ events.
- **Help page section order** — Context Explorer → Token & Usage → Parameters → Data Parsing Reference.

### Fixed
- **Build: template changes now trigger HTML rebuild** — `needsHtmlRebuild()` previously only checked the version string. Now compares mtime of `app.js`, `styles.css`, and `dashboard.html` against `index.html` so template edits are always reflected without manually deleting the output file.

## [0.5.0] - 2026-04-08

### Added
- **Context Explorer: Real Session Mode** — new `실제 세션` tab that replays any recorded session's actual token usage on the timeline. Click to switch from the example scenario to a real session from your transcript history.
- Session search combobox with prompt-text previews, autocomplete filtering, and two sort modes (`Recent` / `Most turns`).
- Session list integrates with the left-panel global period filter (no separate date dropdown).
- Dynamic context budget — automatically switches between 200K and 1M based on the selected session's peak cumulative tokens (for 1M-context models like `claude-opus-4-6[1m]`).
- Header now shows peak cumulative tokens, current budget, percentage, and the unique model name(s) used in the session.
- Legend hover reveals a floating tooltip with the category's percentage share and token count; uses body-level positioning so edge items never clip against the container.
- Help tooltip explains how the context budget varies per session (model window size).
- Turns sort button has a hover tooltip explaining what "턴" counts (every assistant API response, including each tool invocation).
- URL-hash state persistence (`#context/session`, `#context/{sessionId}`) — refresh, scope change, and period change all preserve the selected session.
- Session events get distinct kind badges (skill / mcp / agent / tool) instead of all showing "claude".
- Parser: `promptStats` now carries a 60-char preview text (with tool-result messages filtered out) so session lists can show recognizable first-prompt snippets.

### Changed
- `fmt()` now formats values ≥1M with the `M` suffix (e.g. `1M`, `1.2M`).
- Example-mode gate cards now show static prompt text instead of editable inputs.
- Example-mode is polished: kept for instruction, but playback state (`typedTexts`, `gateFocusWanted`, `replayMode`) removed along with the input-restore plumbing.
- `.cw-root` height pinned to `calc(100vh - 64px)` with a `min-height: 850px` and balanced 16 px top/bottom padding.
- Top/bottom paddings matched for visual symmetry.
- Stacked bar in session mode is now scaled so its total width equals peak-cumulative/budget, matching the header number exactly. Removed the 0.15%-minimum width clamp that used to inflate the bar on long sessions.
- Terminal-visibility eye icon thicker stroke: `full`=3.5, `brief`=3.

### Fixed
- Session list previously reverted to example mode whenever the global period filter was changed. `contextSubPath` module-level state now keeps session selection across any re-render.
- Re-clicking an already-focused search input now clears the value (was a no-op because focus does not re-fire).
- Legend tooltips on the leftmost category ("System") no longer get clipped by `.cw-root { overflow: hidden }` — switched to a body-level floating tooltip with viewport clamping.

## [0.4.7] - 2026-04-04

### Fixed
- Banner "seen" state now tracked via URL `?seen=<generatedAt>` instead of `localStorage` — `localStorage` is blocked on `file://` URLs in Chrome, causing the banner to show on every refresh. `history.replaceState` persists across refreshes without any storage API
- `_dateRange` now included in all builds (was only set during first-run), so banner always shows date range
- Banner auto-hide: added `setTimeout` fallback in case `transitionend` event does not fire

## [0.4.6] - 2026-04-04

### Changed
- First-run completion banner now shows only when new data has been generated (compares `generatedAt` with localStorage), and auto-hides after 3 seconds with a fade-out transition

## [0.4.5] - 2026-04-04

### Fixed
- SKILL.md: `find` now picks the highest semver version from cache (`sort -V | tail -1`) instead of the first filesystem match, preventing older cached versions from being used after an update

## [0.4.4] - 2026-04-04

### Fixed
- SKILL.md: show explicit error message (`ERROR — generate-dashboard.mjs not found`) and exit 1 when script is not found, instead of silently failing

### Added
- Tests: `test/firstrun.test.mjs` — 10 tests covering `computeDateRange` logic (empty data, null timestamps, multi-scope aggregation) and SKILL.md bash command correctness
- Tests: `web-ui.test.mjs` — `showFirstRunBanner` function, `_firstRun`/`_dateRange` references, CSS classes, locale keys
- Tests: `build.test.mjs` — normal builds must not include `_firstRun` or `_partial` flags

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
