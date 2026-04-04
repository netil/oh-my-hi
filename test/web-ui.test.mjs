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

    it('should auto-hide banner after 3 seconds', () => {
      assert.ok(js.includes('setTimeout'), 'setTimeout used for auto-hide');
      assert.ok(js.includes('firstrun-banner--hiding'), 'hiding class applied for fade-out');
      assert.ok(js.includes('transitionend'), 'banner removed after transition ends');
    });

    it('should have firstrun close button inline handler', () => {
      assert.ok(js.includes('firstrun-banner'), 'firstrun-banner class used');
      assert.ok(js.includes('firstrun-close'), 'firstrun-close class used');
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
