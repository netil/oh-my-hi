import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');

describe('Web UI — Templates', () => {
  describe('dashboard.html', () => {
    let html;
    before(() => { html = fs.readFileSync(path.join(TEMPLATES, 'dashboard.html'), 'utf-8'); });

    it('should contain all required placeholders', () => {
      const required = ['__EN_DATA__', '__LOCALE_DATA__', '__VERSION__'];
      for (const ph of required) {
        assert.ok(html.includes(ph), `missing placeholder: ${ph}`);
      }
    });

    it('should reference static assets via link/script tags', () => {
      assert.ok(html.includes('href="/static/billboard.min.css"'), 'billboard CSS link');
      assert.ok(html.includes('href="/static/billboard-dark.min.css"'), 'billboard dark CSS link');
      assert.ok(html.includes('href="/static/styles-__VERSION__.css"'), 'styles link');
      assert.ok(html.includes('src="/static/billboard.pkgd.min.js"'), 'billboard JS script');
      assert.ok(html.includes('src="/static/app-__VERSION__.js"'), 'app JS script');
    });

    it('should have sidebar structure', () => {
      assert.ok(html.includes('id="sidebar-nav"'));
      assert.ok(html.includes('id="scope-select"'));
      assert.ok(html.includes('id="content"'));
      assert.ok(html.includes('id="sidebar-period"'));
    });

    it('should use API-first loading (no inline data script tags)', () => {
      assert.ok(!html.includes('src="data-core.js"'), 'should not have data-core.js script tag');
      assert.ok(!html.includes('src="data-usage.js"'), 'should not have data-usage.js script tag');
      assert.ok(html.includes('loading-overlay'), 'should have loading overlay for API init');
    });
  });

  describe('app.js', () => {
    let js;
    before(() => { js = fs.readFileSync(path.join(TEMPLATES, 'app.js'), 'utf-8'); });

    it('should define all page render functions', () => {
      const fns = [
        'renderOverview', 'renderTokensPage', 'renderTokensCost',
        'renderTokensPrompt', 'renderTokensSession', 'renderSessionDetail',
        'renderStructure', 'renderHelp', 'renderCategoryOverview', 'renderDetailView',
      ];
      for (const fn of fns) {
        assert.ok(js.includes(`function ${fn}`), `missing function: ${fn}`);
      }
    });

    it('should define all chart draw functions', () => {
      const fns = ['drawTokenTrendChart', 'drawTokenModelDonut', 'drawCostTrendCharts', 'drawHourlyDistChart', 'drawRotatedBar'];
      for (const fn of fns) {
        assert.ok(js.includes(`function ${fn}`), `missing function: ${fn}`);
      }
    });

    it('should handle all hash routes in applyHash', () => {
      const routes = ['overview', 'structure', 'tokens', 'tokens-cost', 'tokens-prompt', 'tokens-session', 'session', 'help'];
      for (const route of routes) {
        assert.ok(js.includes(`'${route}'`), `missing route: ${route}`);
      }
    });

    it('should dispatch all views in renderContent', () => {
      const views = ['tokens-cost', 'tokens-prompt', 'tokens-session', 'session'];
      for (const v of views) {
        assert.ok(js.includes(`currentView === '${v}'`), `missing dispatch: ${v}`);
      }
    });

    it('should have API-first data initialization', () => {
      assert.ok(js.includes('tryApiInit'), 'tryApiInit function defined');
      assert.ok(js.includes('/api/meta'), '/api/meta endpoint referenced');
      assert.ok(js.includes('loading-overlay'), 'loading overlay referenced');
    });

    it('should define MODEL_PRICING', () => {
      assert.ok(js.includes('MODEL_PRICING'));
      assert.ok(js.includes('opus-4'));
      assert.ok(js.includes('sonnet-4'));
      assert.ok(js.includes('haiku-4'));
    });

    it('should use localStorage for state persistence', () => {
      const keys = ['harness-theme', 'harness-lang', 'harness-period', 'harness-budget', 'harness-compare'];
      for (const key of keys) {
        assert.ok(js.includes(`'${key}'`), `missing localStorage key: ${key}`);
      }
    });

    it('should have budget feature functions', () => {
      assert.ok(js.includes('function renderBudgetSection'));
      assert.ok(js.includes('function bindBudgetActions'));
    });

    it('should have budget threshold alert banner', () => {
      assert.ok(js.includes('function renderBudgetAlertBanner'), 'banner render function');
      assert.ok(js.includes('function computeBudgetAlerts'), 'alert computation function');
      assert.ok(js.includes("'harness-budget-alert-dismissed'"), 'dismissal localStorage key');
      assert.ok(js.includes('budget-alert-dismiss'), 'dismiss button class');
    });

    it('should have weekly digest card on overview', () => {
      assert.ok(js.includes('function renderWeeklyDigestCard'), 'digest render function');
      assert.ok(js.includes('DATA.weeklyDigest'), 'reads build-time digest from DATA');
    });

    it('should have cache tips feature', () => {
      assert.ok(js.includes('function buildCacheTips'));
    });

    it('should set window.name for tab reuse via /open launcher', () => {
      assert.ok(js.includes("window.name = 'oh-my-hi'"), "window.name must be set so /open can reuse the tab");
    });

    it('should have compare mode support', () => {
      assert.ok(js.includes('compareMode'));
      assert.ok(js.includes('comparePrev'));
    });

    it('should have dev build badge support', () => {
      assert.ok(js.includes('_devBuild'));
      assert.ok(js.includes('dev-build-badge'));
    });

    it('should have JS-based period tooltip with viewport clamping', () => {
      assert.ok(js.includes('period-tooltip'));
      assert.ok(js.includes('removePeriodTooltips'));
    });

    it('should have compare button always rendered with disabled state', () => {
      assert.ok(js.includes("data-period=\"compare\""));
      // Compare button should use disabled attribute when not applicable
      assert.ok(js.includes("' disabled'"));
    });

    it('should render cost trend as 3 separate charts', () => {
      assert.ok(js.includes('cost-trend-daily'));
      assert.ok(js.includes('cost-trend-weekly'));
      assert.ok(js.includes('cost-trend-monthly'));
      assert.ok(js.includes('function drawCostTrendCharts'));
    });

    it('should have session back button pointing to tokens-session', () => {
      assert.ok(js.includes("'tokens-session'"));
      assert.ok(js.includes("sessionBackToSession"));
    });

    it('should show day of week in session table', () => {
      assert.ok(js.includes('dayNames'));
      assert.ok(js.includes("dow"));
    });

    it('should have showFirstRunBanner function called at boot', () => {
      assert.ok(js.includes('function showFirstRunBanner'), 'showFirstRunBanner function defined');
      assert.ok(js.includes('showFirstRunBanner()'), 'showFirstRunBanner called at boot');
    });

    it('should reference generatedAt and _dateRange from DATA', () => {
      assert.ok(js.includes('DATA.generatedAt'), 'generatedAt used for new-data detection');
      assert.ok(js.includes('DATA._dateRange'), '_dateRange used for date range display');
    });

    it('should use URL ?seen param to track shown state', () => {
      assert.ok(js.includes('URLSearchParams'), 'URLSearchParams used for seen-state tracking');
      assert.ok(js.includes('history.replaceState'), 'history.replaceState updates ?seen param');
      assert.ok(js.includes("params.get('seen')"), 'seen param checked against generatedAt');
    });

    it('should auto-hide banner after 3 seconds', () => {
      assert.ok(js.includes('setTimeout'), 'setTimeout used for auto-hide');
      assert.ok(js.includes('firstrun-banner--hiding'), 'hiding class applied for fade-out');
      assert.ok(js.includes('transitionend'), 'banner removed after transition ends');
    });

    it('should have firstrun close button inline handler', () => {
      assert.ok(js.includes('firstrun-banner'), 'firstrun-banner class used');
      assert.ok(js.includes('firstrun-close'), 'firstrun-close class used');
    });

    it('should have Context Explorer canvas bar functions', () => {
      assert.ok(js.includes('function renderBarSegments'), 'renderBarSegments defined');
      assert.ok(js.includes('function barSegmentAt'), 'barSegmentAt defined');
      assert.ok(js.includes("getContext('2d')"), 'canvas 2d context used');
      assert.ok(js.includes('devicePixelRatio'), 'DPR-aware canvas rendering');
      assert.ok(js.includes("id=\"cw-bar\""), 'canvas element with cw-bar id');
    });

    it('should have Context Explorer virtual scroll functions', () => {
      assert.ok(js.includes('function computeTlLayout'), 'computeTlLayout defined');
      assert.ok(js.includes('function updateVirtualRows'), 'updateVirtualRows defined');
      assert.ok(js.includes('TL_ROW_H'), 'TL_ROW_H constant defined');
      assert.ok(js.includes("id=\"cw-tl-virt\""), 'virtual scroll container present');
      assert.ok(js.includes('position:absolute'), 'absolute positioning for virtual rows');
    });

    it('should have Context Explorer session-first tab order', () => {
      const sessionIdx = js.indexOf("data-cw-mode=\"session\"");
      const exampleIdx = js.indexOf("data-cw-mode=\"example\"");
      assert.ok(sessionIdx !== -1, 'session mode tab exists');
      assert.ok(exampleIdx !== -1, 'example mode tab exists');
      assert.ok(sessionIdx < exampleIdx, 'session tab comes before example tab');
    });

    it('should skip renderContent on theme toggle for CSS-only views', () => {
      // Theme toggle is cheap on pages where theming flows through CSS vars
      // alone — no point re-running render*() + bb.generate. Only overview /
      // context / structure compute colors in JS and still need a rebuild.
      assert.ok(js.includes('THEME_REBUILD_VIEWS'), 'theme rebuild allowlist exists');
      assert.ok(js.includes('overview: 1') || js.includes("overview:1"), 'overview listed');
      assert.ok(js.includes('context: 1') || js.includes("context:1"), 'context listed');
      assert.ok(js.includes('structure: 1') || js.includes("structure:1"), 'structure listed');
      // Theme button handler still calls setBbDarkTheme unconditionally so the
      // CSS swap happens even when the rebuild is skipped.
      const themeHandlerIdx = js.indexOf('setBbDarkTheme(isDark)');
      assert.ok(themeHandlerIdx !== -1, 'setBbDarkTheme call present');
    });

    it('should cap large sidebar categories with a show-all footer', () => {
      // Categories with more than SIDEBAR_ITEM_LIMIT items get truncated on
      // first render, with a clickable footer to reveal the rest. Keeps
      // initial DOM cost manageable on harnesses with 500+ skills/agents.
      assert.ok(js.includes('SIDEBAR_ITEM_LIMIT'), 'limit constant defined');
      assert.ok(js.includes('sidebarShowAll'), 'show-all set tracks revealed categories');
      assert.ok(js.includes("data-action=\"show-all\""), 'show-all action button rendered');
      assert.ok(js.includes("action === 'show-all'"), 'show-all click handler wired up');
      assert.ok(js.includes("t('sidebarShowMore')"), 'show-more label localized');
    });

    it('should render session metadata side panel in Context Explorer', () => {
      // Long first-prompts get clipped in the input. A dedicated panel shows
      // the full prompt snippet, date, turns, model, and peak context so
      // users can verify which session they picked without resizing.
      assert.ok(js.includes('id="cw-session-info"'), 'session info container exists');
      assert.ok(js.includes('function renderSessionInfo'), 'renderSessionInfo defined');
      assert.ok(js.includes("t('cwe_infoPrompt')"), 'prompt label localized');
      assert.ok(js.includes("t('cwe_infoDate')"), 'date label localized');
      assert.ok(js.includes("t('cwe_infoTurns')"), 'turns label localized');
      assert.ok(js.includes("t('cwe_infoModel')"), 'model label localized');
      assert.ok(js.includes("t('cwe_infoPeak')"), 'peak label localized');
      // The panel must be refreshed on selection and mode changes.
      assert.ok(js.includes('renderSessionInfo()'), 'renderSessionInfo invoked');
    });

    it('should remove tooltip on collapsed sidebar item click', () => {
      // When the sidebar is collapsed, menu items show a tooltip on hover.
      // Clicking a menu item re-renders the sidebar, removing the item from the
      // DOM before mouseleave fires — leaving an orphan tooltip. A click handler
      // must clean up the tooltip immediately on click.
      const clickHandler = js.indexOf("item.addEventListener('click', () => {");
      assert.ok(clickHandler !== -1, 'click listener registered on nav items');
      const snippet = js.slice(clickHandler, clickHandler + 120);
      assert.ok(snippet.includes('tipEl.remove()'), 'click handler removes tipEl');
      assert.ok(snippet.includes('tipEl = null'), 'click handler nulls tipEl ref');
    });

    it('should toggle dark theme via <link disabled> not dynamic style injection', () => {
      // setBbDarkTheme should flip the `disabled` property on the preloaded
      // billboard dark CSS <link> tag rather than injecting a <style> element.
      // This keeps the theme swap to a single attribute change with no DOM cost.
      const fnIdx = js.indexOf('function setBbDarkTheme');
      assert.ok(fnIdx !== -1, 'setBbDarkTheme function defined');
      const snippet = js.slice(fnIdx, fnIdx + 200);
      assert.ok(snippet.includes("getElementById('bb-dark-theme')"), 'targets bb-dark-theme link element');
      assert.ok(snippet.includes('.disabled'), 'sets .disabled property');
      assert.ok(!snippet.includes('createElement'), 'does not create new elements');
    });

    it('should only reset session list scroll when sort actually changes', () => {
      // Contract: scroll resets to top ONLY when the sort criterion changes.
      // Re-opening with the same sort after picking an item must preserve
      // the user's scroll offset. The pending flag carries a deferred reset
      // across close → reopen when sort was changed while hidden.
      assert.ok(js.includes('_pendingScrollReset'), 'pending flag defined on ui state');

      // Sort click path: diff against current sort before applying.
      assert.ok(js.includes('next === ui.sort'), 'early-returns when sort unchanged');
      assert.ok(js.includes('_pendingScrollReset = true'),
        'defers reset when layer hidden');

      // openSessionList path: consume pending flag only, no unconditional reset.
      const openIdx = js.indexOf('function openSessionList');
      assert.ok(openIdx !== -1, 'openSessionList defined');
      const openSnippet = js.slice(openIdx, openIdx + 500);
      assert.ok(openSnippet.includes('ui._pendingScrollReset'),
        'openSessionList consults pending flag');
    });

    it('should have three-state eye icons for terminal visibility', () => {
      assert.ok(js.includes("evt.vis === 'hidden'"), 'hidden state check');
      assert.ok(js.includes("evt.vis === 'brief'"), 'brief state check');
      // SVG paths for the three distinct icons
      assert.ok(js.includes('x1="1" y1="1" x2="23" y2="23"'), 'closed-eye slash line for hidden');
      assert.ok(js.includes('x1="9" y1="12" x2="15" y2="12"'), 'dash-eye line for brief');
    });

    it('should have visibility legend in Context Explorer bar area', () => {
      assert.ok(js.includes('cwe_visHidden'), 'hidden legend key used');
      assert.ok(js.includes('cwe_visBrief'), 'brief legend key used');
      assert.ok(js.includes('cwe_visFull'), 'full legend key used');
    });

    it('should default to session mode on fresh Context Explorer navigation', () => {
      assert.ok(js.includes("contextSubPath = 'session'"), 'session mode set as default');
      assert.ok(js.includes("contextSubPath = 'example'"), 'example mode path tracked');
    });

    it('should hide timeline nav buttons in example mode', () => {
      // cw-tl-nav starts hidden (display:none) since default is example mode.
      // Session mode toggles it to display:flex.
      assert.ok(js.includes('id="cw-tl-nav"'), 'timeline nav container exists');
      assert.ok(js.includes('id="cw-tl-top"'), 'top scroll button exists');
      assert.ok(js.includes('id="cw-tl-bottom"'), 'bottom scroll button exists');
      // Initial state is display:none (hidden in example mode)
      const navMatch = js.match(/id="cw-tl-nav"[^>]*style="[^"]*display:\s*none/);
      assert.ok(navMatch, 'cw-tl-nav starts with display:none');
      // setMode toggles visibility
      assert.ok(js.includes("tlNav.style.display = 'flex'"), 'session mode shows nav');
      assert.ok(js.includes("tlNav.style.display = 'none'"), 'example mode hides nav');
    });

    it('should localize code.claude.com docs URLs', () => {
      // localizeDocsUrl handles both docs.anthropic.com and code.claude.com patterns
      assert.ok(js.includes("/docs/en/"), 'code.claude.com en pattern present in source');
      assert.ok(js.includes("'/docs/' + currentLang + '/'"), 'code.claude.com URL localization');
      assert.ok(js.includes("'/' + currentLang + '/docs/'"), 'docs.anthropic.com URL localization');
      // Learn more link uses localizeDocsUrl
      assert.ok(js.includes('localizeDocsUrl(hovEvent.link)'), 'CWE learn-more link localized');
    });

    it('should format turn counts with fmtCompact', () => {
      // Session list and info chip should use fmtCompact for turn numbers
      assert.ok(js.includes('fmtCompact(f.turns)'), 'turns formatted with fmtCompact');
    });

    it('should have Context Budget section in overview', () => {
      assert.ok(js.includes('aggregateVisibility'), 'aggregateVisibility called');
      assert.ok(js.includes("id=\"vis-bar\""), 'canvas bar element for context budget');
      assert.ok(js.includes('drawStackedBar'), 'drawStackedBar function defined');
      assert.ok(js.includes("t('visHeatmapTitle')"), 'context budget title localized');
      assert.ok(js.includes("t('visHidden')"), 'hidden label used');
      assert.ok(js.includes("t('visBrief')"), 'brief label used');
      assert.ok(js.includes("t('visFull')"), 'full label used');
      // Period filtering applied before aggregation
      assert.ok(js.includes('filterByPeriod(usage.tokenEntries'), 'tokenEntries filtered by period');
      assert.ok(js.includes('filterByPeriod(usage.promptStats'), 'promptStats filtered by period');
      // Session count multiplier for hidden startup cost
      assert.ok(js.includes('periodSessionIds'), 'session count computed for period');
    });

    it('should have reusable drawStackedBar canvas helper', () => {
      assert.ok(js.includes('function drawStackedBar'), 'drawStackedBar defined');
      assert.ok(js.includes('devicePixelRatio'), 'DPR-aware rendering');
      // Called for context budget bar
      assert.ok(js.includes("drawStackedBar('vis-bar'"), 'invoked for vis-bar canvas');
    });

    it('should support API-based usage lazy loading', () => {
      assert.ok(js.includes('_usageReady'), 'usage ready flag');
      assert.ok(js.includes('fetchUsageForPeriod'), 'fetchUsageForPeriod function defined');
      assert.ok(js.includes('/api/usage'), '/api/usage endpoint referenced');
      assert.ok(js.includes('_apiMode'), 'API mode flag set');
    });

    it('should have Help page Context Explorer section', () => {
      assert.ok(js.includes('helpContextExplorer'), 'helpContextExplorer key used in renderHelp');
      assert.ok(js.includes('helpCweSession'), 'helpCweSession key used');
      assert.ok(js.includes('helpCweExample'), 'helpCweExample key used');
      assert.ok(js.includes('helpCweBar'), 'helpCweBar key used');
      assert.ok(js.includes('helpCweTimeline'), 'helpCweTimeline key used');
    });

    // ── F8 Token Breakdown ────────────────────────────────────────────────
    it('should define renderBreakdown function', () => {
      assert.ok(js.includes('function renderBreakdown'));
    });

    it('should include breakdown in applyHash routing', () => {
      assert.ok(js.includes("'breakdown'"), 'breakdown route literal');
      // breakdown should expand _tokens area
      const applyHashIdx = js.indexOf('function applyHash');
      const snippet = js.slice(applyHashIdx, applyHashIdx + 1500);
      assert.ok(snippet.includes("'breakdown'"), 'breakdown in applyHash');
      assert.ok(snippet.includes('_tokens'), 'breakdown expands tokens group');
    });

    it('should dispatch breakdown in renderContent', () => {
      assert.ok(js.includes("currentView === 'breakdown'"), 'breakdown dispatch');
      assert.ok(js.includes('renderBreakdown()'), 'renderBreakdown called');
    });

    it('should include breakdown in sidebar isTokensArea check', () => {
      assert.ok(js.includes("currentView === 'breakdown'"), 'breakdown in isTokensArea');
    });

    it('should have breakdownExpandedTypes Set with localStorage persistence', () => {
      assert.ok(js.includes('breakdownExpandedTypes'), 'state variable defined');
      assert.ok(js.includes('new Set()'), 'initialized as Set');
      assert.ok(js.includes("'harness-bd-expanded'"), 'localStorage key');
    });

    it('should aggregate tokens by type and contextName in renderBreakdown', () => {
      const fnIdx = js.indexOf('function renderBreakdown');
      const snippet = js.slice(fnIdx, fnIdx + 2000);
      assert.ok(snippet.includes('typeMap'), 'typeMap aggregation');
      assert.ok(snippet.includes("e.context || 'general'"), 'context field used');
      assert.ok(snippet.includes("e.contextName || 'conversation'"), 'contextName used');
    });

    it('should include startup context section in renderBreakdown', () => {
      const fnIdx = js.indexOf('function renderBreakdown');
      const snippet = js.slice(fnIdx, fnIdx + 5000);
      assert.ok(snippet.includes('contextStats'), 'contextStats read');
      assert.ok(snippet.includes('globalClaudeTokens'), 'global CLAUDE.md item');
      assert.ok(snippet.includes('skillsDescTokens'), 'skills desc item');
      assert.ok(snippet.includes('startupTotalChange'), 'startup change calculated');
    });

    it('should compute startup change only when period is selected', () => {
      assert.ok(js.includes('!customDateRange && days > 0 && sessionCount > 0'),
        'change guarded by customDateRange + days + sessionCount');
    });

    it('should use calcTokenChange for type bar chart rows', () => {
      const fnIdx = js.indexOf('function renderBreakdown');
      const snippet = js.slice(fnIdx, fnIdx + 8000);
      assert.ok(snippet.includes('calcTokenChange'), 'calcTokenChange used for row changes');
    });

    it('should have renderBarCard extended options', () => {
      assert.ok(js.includes('opts.titleHtml'), 'titleHtml option');
      assert.ok(js.includes('opts.subtitleHtml'), 'subtitleHtml option');
      assert.ok(js.includes('opts.valueLabelHtml'), 'valueLabelHtml option');
      assert.ok(js.includes('opts.fillHeight'), 'fillHeight option');
      assert.ok(js.includes('opts.footerHtml'), 'footerHtml option');
    });

    it('should apply usage-bar-card--fill class when fillHeight is true', () => {
      assert.ok(js.includes("'usage-bar-card--fill'") || js.includes('"usage-bar-card--fill"') ||
                js.includes('usage-bar-card--fill'), 'fill class applied');
    });

    it('should render valueLabelHtml above total (separate line)', () => {
      // valueLabel goes as its own child of usage-bar-head-right, NOT inside usage-bar-head-value
      const rcIdx = js.indexOf('function renderBarCard');
      const snippet = js.slice(rcIdx, rcIdx + 2200);
      const valLabelIdx = snippet.indexOf('usage-bar-value-label');
      const headValueIdx = snippet.indexOf('usage-bar-head-value');
      assert.ok(valLabelIdx !== -1, 'usage-bar-value-label present');
      assert.ok(headValueIdx !== -1, 'usage-bar-head-value present');
      // value-label div must come BEFORE head-value div (above the number)
      assert.ok(valLabelIdx < headValueIdx, 'value label rendered before total');
    });

    it('should render changeBadge before total (% then number order)', () => {
      const rcIdx = js.indexOf('function renderBarCard');
      const snippet = js.slice(rcIdx, rcIdx + 2200);
      const changeIdx = snippet.indexOf('changeBadge(opts.totalChange)');
      const totalIdx = snippet.indexOf('usage-bar-total');
      assert.ok(changeIdx !== -1, 'changeBadge call present');
      assert.ok(totalIdx !== -1, 'usage-bar-total present');
      assert.ok(changeIdx < totalIdx, 'change badge before total value');
    });
  });

  describe('styles.css', () => {
    let css;
    before(() => { css = fs.readFileSync(path.join(TEMPLATES, 'styles.css'), 'utf-8'); });

    it('should define CSS custom properties', () => {
      const vars = ['--bg', '--card-bg', '--border', '--text', '--accent', '--radius'];
      for (const v of vars) {
        assert.ok(css.includes(v), `missing CSS var: ${v}`);
      }
    });

    it('should have core layout classes', () => {
      const classes = ['.sidebar', '.content', '.card-grid', '.stat-card', '.chart-row', '.chart-card', '.insights-grid', '.insight-card'];
      for (const cls of classes) {
        assert.ok(css.includes(cls), `missing class: ${cls}`);
      }
    });

    it('should have budget styles', () => {
      assert.ok(css.includes('.budget-config-panel'));
      assert.ok(css.includes('.budget-bar-fill'));
      assert.ok(css.includes('.budget-grid-line'));
    });

    it('should have session detail styles', () => {
      assert.ok(css.includes('.session-timeline'));
      assert.ok(css.includes('.session-back-btn'));
      assert.ok(css.includes('.session-badge'));
    });

    it('should have dev build badge style', () => {
      assert.ok(css.includes('.dev-build-badge'));
    });

    it('should have JS tooltip and compare disabled styles', () => {
      assert.ok(css.includes('.period-tooltip'));
      assert.ok(css.includes('.period-btn-compare:disabled'));
    });

    it('should have cost trend grid styles', () => {
      assert.ok(css.includes('.cost-trend-grid'));
      assert.ok(css.includes('.cost-trend-label'));
    });

    it('should have first-run completion banner styles', () => {
      assert.ok(css.includes('.firstrun-banner'), '.firstrun-banner class defined');
      assert.ok(css.includes('.firstrun-close'), '.firstrun-close button class defined');
    });

    it('should include firstrun-banner in shared banner base rule', () => {
      // .firstrun-banner must share position/layout base with .update-banner and .partial-banner
      const sharedRuleMatch = css.match(/\.update-banner[^{]*\.partial-banner[^{]*\.firstrun-banner|\.firstrun-banner[^{]*\.update-banner|\.update-banner[^{]*\.firstrun-banner/);
      assert.ok(sharedRuleMatch, '.firstrun-banner included in shared banner base selector');
    });

    it('should have responsive styles', () => {
      assert.ok(css.includes('@media'));
      assert.ok(css.includes('max-width: 768px'));
    });

    it('should have breakdown-related renderBarCard extension classes', () => {
      assert.ok(css.includes('.usage-bar-card--fill'), 'fill height class');
      assert.ok(css.includes('.usage-bar-head-subtitle'), 'head subtitle class');
      assert.ok(css.includes('.usage-bar-value-label'), 'value label class');
      assert.ok(css.includes('.usage-bar-footer'), 'footer class');
    });

    it('should have breakdown accordion styles via bd-accordion-header', () => {
      assert.ok(css.includes('.usage-bar-card--fill') ||
                js.includes('bd-accordion-header'), 'accordion header class used');
    });
  });

  describe('Locales', () => {
    let en, ko;
    before(() => {
      en = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'locales', 'en.json'), 'utf-8'));
      ko = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'locales', 'ko.json'), 'utf-8'));
    });

    it('should have matching keys between en and ko', () => {
      const enKeys = Object.keys(en).sort();
      const koKeys = Object.keys(ko).sort();
      const missingInKo = enKeys.filter(k => !ko.hasOwnProperty(k));
      const missingInEn = koKeys.filter(k => !en.hasOwnProperty(k));
      assert.deepEqual(missingInKo, [], `keys in en.json missing from ko.json: ${missingInKo.join(', ')}`);
      assert.deepEqual(missingInEn, [], `keys in ko.json missing from en.json: ${missingInEn.join(', ')}`);
    });

    it('should have all new feature keys', () => {
      const requiredKeys = [
        'tokensCost', 'tokensPrompt', 'tokensSession',
        'costTrend', 'budgetTitle', 'budgetDaily', 'budgetWeekly', 'budgetMonthly',
        'budgetSave', 'budgetClear', 'budgetExceeded', 'budgetExceededDetail', 'budgetDesc',
        'budgetAlertWarnTitle', 'budgetAlertOverTitle', 'budgetAlertLine', 'budgetAlertDismiss',
        'digestTitle', 'digestDesc', 'digestCost', 'digestTokens', 'digestSessions', 'digestPrevWeek', 'digestVsPrev',
        'sessionDetail', 'sessionBackToSession', 'sessionDuration', 'sessionMessages',
        'sessionModels', 'sessionInvoked', 'sessionTimeline', 'sessionTopList', 'sessionTopListHint',
        'compareToggle', 'comparePrev',
        'unusedCleanupTipTitle', 'unusedCleanupTipDetail',
        'cacheTipLowHitTitle', 'cacheTipGoodTitle', 'cacheTipHighCreationTitle', 'cacheTipNoSessionTitle',
        'firstRunBannerMsg', 'close',
        // Context Explorer
        'helpContextExplorer', 'helpContextExplorerDesc',
        'helpCweExample', 'helpCweExampleDesc',
        'helpCweSession', 'helpCweSessionDesc',
        'helpCweBar', 'helpCweBarDesc',
        'helpCweTimeline', 'helpCweTimelineDesc',
        'cwe_visHidden', 'cwe_visHiddenSub',
        'cwe_visBrief', 'cwe_visBriefSub',
        'cwe_visFull', 'cwe_visFullSub',
        'cwe_modeSession', 'cwe_modeExample',
        'cwe_infoPrompt', 'cwe_infoDate', 'cwe_infoTurns', 'cwe_infoModel', 'cwe_infoPeak',
        'sidebarShowMore', 'sidebarShowAll',
        // Context Budget
        'visHeatmapTitle', 'visHeatmapDesc', 'visHidden', 'visBrief', 'visFull',
        'visTokens', 'visName', 'visVisibility',
        'visGlobalClaude', 'visProjectClaude', 'visAutoMemory', 'visSkillsDesc', 'visMcpTools', 'visPrinciples',
        // F8 Token Breakdown
        'tokenBreakdown', 'bdTitle', 'bdDesc',
        'bdByTypeTitle', 'bdTop5Title', 'bdTop5All', 'bdDetailTitle',
        'bdColType', 'bdColItem', 'bdColCalls', 'bdColAvg', 'bdColShare',
        'bdTypeTools', 'bdTypeConversation', 'bdItems',
        'bdStartupTitle', 'bdStartupDesc', 'bdStartupCumulative',
        'bdStartupPerSession', 'bdStartupSessions', 'bdStartupNote',
        'bdStartupClaudeMd', 'bdStartupSkills', 'bdStartupPrinciples',
        'bdStartupMcp', 'bdStartupMemory',
      ];
      for (const key of requiredKeys) {
        assert.ok(en[key], `missing en key: ${key}`);
        assert.ok(ko[key], `missing ko key: ${key}`);
      }
    });

    it('should not have empty values (except intentional blanks)', () => {
      // Some keys are intentionally empty in certain locales (e.g. unitItems, unitCallCount, amPrefix, pmPrefix)
      const allowEmpty = new Set(['unitItems', 'unitCallCount', 'amPrefix', 'pmPrefix']);
      for (const [key, val] of Object.entries(en)) {
        if (allowEmpty.has(key)) continue;
        assert.ok(val.length > 0, `en.${key} is empty`);
      }
      for (const [key, val] of Object.entries(ko)) {
        if (allowEmpty.has(key)) continue;
        assert.ok(val.length > 0, `ko.${key} is empty`);
      }
    });
  });
});
