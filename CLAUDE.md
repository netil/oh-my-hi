# Oh-My-Hi

Claude Code plugin — harness configuration & token usage dashboard.

## Tech Stack

- Node.js (ESM), vanilla JS frontend (no framework)
- esbuild for CSS/JS minification
- billboard.js for charts (bundled inline, no CDN)
- Single-file HTML output (`file://` compatible)

## Build & Test

```bash
npm run build         # Generate output/index.html + data.json (--data-only)
npm test              # Run all tests (build, web-ui, plugin)
```

Build entry: `node scripts/generate-dashboard.mjs` reads `templates/dashboard.html`, replaces placeholders, and inlines all CSS/JS/data.

### Build Gotcha

Running without `node_modules` causes `__BB_JS__ is not defined` errors. Since v0.2.4 dependencies auto-install, but verify `npm install` first when building manually.

## File Structure

```
scripts/generate-dashboard.mjs   # Build script (entry point)
scripts/parsers/*.mjs            # 15 data parsers
templates/dashboard.html         # HTML shell with placeholders
templates/app.js                 # Frontend JS (~3700 lines)
templates/styles.css             # All CSS
templates/locales/{en,ko}.json   # i18n (en default, ko supported)
templates/work-types.json        # Task category schema (25 types)
skills/omh/SKILL.md              # Plugin skill definition
.claude-plugin/marketplace.json  # Marketplace metadata
.claude-plugin/plugin.json       # Plugin metadata
test/*.test.mjs                  # Tests (Node test runner)
output/                          # Generated artifacts (gitignored)
```

## Dashboard Pages

| Page | Hash | Sub-menu of |
|------|------|-------------|
| Harness Overview | `#overview` | — |
| Token Overview | `#tokens` | — |
| Token: Cost | `#tokens-cost` | Tokens |
| Token: Prompt | `#tokens-prompt` | Tokens |
| Token: Session | `#tokens-session` | Tokens |
| Session Detail | `#session/{id}` | Tokens > Session |
| Structure | `#structure` | — |
| Help | `#help` | — |
| Category / Detail | `#{key}` / `#{key}/{name}` | Sidebar |

## Release Workflow

Execute in order when a version bump is requested:

1. `npm test` — abort on failure
2. **Semver bump** — update package.json + .claude-plugin/marketplace.json simultaneously
3. **CHANGELOG.md** — add new version section with changes
4. **SPEC.md** / **GUIDE.md** — sync if structure or features changed
5. **Commit & push** — commit message format: `vX.Y.Z: {summary}`
6. **Git tag** — create `git tag vX.Y.Z` and push
7. **npm publish** — prompt user for OTP

## Code Conventions

- Rendering pattern: build HTML string → `content.innerHTML = html` → `bindContentActions()` → draw charts
- Adding a new page: register route in `applyHash()` → add branch in `renderContent()` → add menu in `renderSidebar()` → write render function
- i18n: use `t(key)` function; add new keys to both en.json and ko.json
- Charts: `bb.generate({ bindto, data, ... })` via billboard.js API
- State persistence via localStorage: `harness-theme`, `harness-lang`, `harness-period`, `harness-budget`, `harness-compare`

## Skill Spec Compliance

SKILL.md follows the [Agent Skills Specification](https://agentskills.io/specification):
- `name` must be lowercase alphanumeric + hyphens, matching the parent directory name
- `description` is required (1-1024 chars), should describe what + when
- `argument-hint` is a Claude Code extension (not in agentskills.io spec, but harmless)
- Keep SKILL.md body under 500 lines; move detailed content to `references/` or `scripts/`

## Distribution

- **npm**: `npm publish` (package name: `oh-my-hi`)
- **Marketplace**: git-based (`netil/oh-my-hi`)
- **Install**: `claude plugin marketplace add netil/oh-my-hi` → `claude plugin install oh-my-hi`
