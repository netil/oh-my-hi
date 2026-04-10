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
      const required = ['__BB_CSS__', '__STYLES__', '__BB_JS__', '__EN_DATA__', '__LOCALE_DATA__', '__APP_JS__', '__VERSION__', '__BB_DARK_CSS_STR__'];
      for (const ph of required) {
        assert.ok(html.includes(ph), `missing placeholder: ${ph}`);
      }
    });

    it('should have sidebar structure', () => {
      assert.ok(html.includes('id="sidebar-nav"'));
      assert.ok(html.includes('id="scope-select"'));
      assert.ok(html.includes('id="content"'));
      assert.ok(html.includes('id="sidebar-period"'));
    });

    it('should use progressive loading split scripts', () => {
      assert.ok(html.includes('src="data-core.js"'), 'loads data-core.js sync');
      assert.ok(html.includes('src="data-usage.js" defer'), 'loads data-usage.js deferred');
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

    it('should have _KEY_REV for minified data restoration', () => {
      assert.ok(js.includes('_KEY_REV'));
      assert.ok(js.includes("ts:'timestamp'"));
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

    it('should have cache tips feature', () => {
      assert.ok(js.includes('function buildCacheTips'));
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

    it('should support progressive data loading', () => {
      assert.ok(js.includes('_usageReady'), 'usage ready flag');
      assert.ok(js.includes('mergeUsageData'), 'mergeUsageData function defined');
      assert.ok(js.includes('DATA_USAGE'), 'DATA_USAGE referenced');
      assert.ok(js.includes('_onUsageReady'), 'deferred callback registered');
      // Legacy single data.js path sets _usageReady immediately
      assert.ok(js.includes('DATA._usageReady = true'), 'legacy path marks ready');
    });

    it('should have Help page Context Explorer section', () => {
      assert.ok(js.includes('helpContextExplorer'), 'helpContextExplorer key used in renderHelp');
      assert.ok(js.includes('helpCweSession'), 'helpCweSession key used');
      assert.ok(js.includes('helpCweExample'), 'helpCweExample key used');
      assert.ok(js.includes('helpCweBar'), 'helpCweBar key used');
      assert.ok(js.includes('helpCweTimeline'), 'helpCweTimeline key used');
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
