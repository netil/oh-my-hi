'use strict';

// Claim a stable tab name so /open launcher can reuse this tab via window.open(url, name)
window.name = 'oh-my-hi';

/* =============================================================================
 * app.js — oh-my-hi dashboard client script (browser bundle)
 * -----------------------------------------------------------------------------
 * This file is injected verbatim into dashboard.html at build time, inside a
 * single <script> block. It has no ESM exports — everything is script-scoped.
 * Helper modules from templates/*.mjs are stripped of `export` and prepended
 * to this file by scripts/generate-dashboard.mjs.
 *
 * Table of contents (search the marker to jump):
 *
 *   // ── Data state ──                    DATA object + tryApiInit()
 *   // ── i18n ──                          t(), locales, numLocale
 *   // ── Dark mode ──                     theme toggle + bb dark CSS swap
 *   // ── Constants ──                     CATEGORIES, color maps
 *   // ── State ──                         currentScope/View/Detail, ui flags
 *   // ── DOM refs ──                      sidebarNav, content, searchInput
 *   // ── Init ──                          init(), theme/help/lang buttons
 *   // ── History / Hash ──                pushState, applyHash routing
 *   // ── Data helpers ──                  getScopeData, getItems, countUsage
 *   // ── Date formatting ──               formatDate, relativeTime, fmtNum
 *   // ── Simple Markdown renderer ──      renderMarkdown + fmtCompact/fmtCost
 *   // ── Data range helpers ──            computeDateRange
 *   // ── Render orchestration ──          render(), renderContent()
 *   // ── Sidebar rendering ──             renderSidebar, category cap logic
 *   // ── Content rendering ──             dispatch by currentView
 *   // ── Period filter with calendar ──   left-panel period buttons
 *   // ── Calendar Picker ──               custom date range overlay
 *   // ── Tokens page ──                   #tokens root
 *   // ── Tokens: Cost sub-page ──         #tokens-cost
 *   // ── Tokens: Cache sub-page ──        #tokens-cache
 *   // ── Tokens: Prompt sub-page ──       #tokens-prompt
 *   // ── Tokens: Session sub-page ──      #tokens-session + session detail
 *   // ── Overview page ──                 #overview
 *   // ── Charts (billboard.js) ──         drawTokenTrendChart, drawRotatedBar…
 *   // ── Insights ──                      renderInsights cards
 *   // ── Help page ──                     #help
 *   // ── Structure page ──                #structure
 *   // ── Flowchart (hierarchical) ──      drawFlowchart SVG builder
 *   // ── Context Window Explorer ──       #context (example + session modes)
 *   // ── Category overview page ──        #{category}
 *   // ── Detail views ──                  #{category}/{name}
 *   // ── Detail-page helpers ──           filePathBlock, descriptionBlock…
 *   // ── Content action binding ──        delegated click handlers
 *   // ── Data staleness check ──          update banner trigger
 *   // ── Partial data banner ──           progressive first-run UX
 *   // ── New-data banner ──               firstRun dismiss
 *   // ── Boot ──                          tryApiInit() → init() entry point
 * ========================================================================== */

  // ── Data state ──
  // Populated by tryApiInit() via /api/meta. No embedded data files.
  let DATA = { scopes: [], scopeData: {}, _usageReady: false };

  // ── API-based data loading ──
  async function tryApiInit() {
    const overlay = document.getElementById('loading-overlay');
    try {
      const res = await fetch('/api/meta', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`/api/meta returned ${res.status}`);
      const meta = await res.json();
      Object.assign(DATA, meta);
      DATA._apiMode = true;
      DATA._usageReady = false;

      // Fetch usage for the initial period/scope.
      const range = computeCurrentPeriodRange();
      if (range) {
        const scope = currentScope || 'global';
        await fetchUsageForPeriod(scope, range.from, range.to);
      }
    } catch (e) {
      console.error('[oh-my-hi] Failed to load data from server:', e.message);
      throw e;
    } finally {
      if (overlay) overlay.remove();
    }
  }

  // ── i18n ──
  // All locales (en + system locale) injected at build time.
  const I18N = {};
  if (typeof __LOCALE__ !== 'undefined' && __LOCALE__._lang) {
    I18N[__LOCALE__._lang] = __LOCALE__;
  }
  I18N.en = (typeof __EN__ !== 'undefined') ? __EN__ : {};

  let systemLocale = (DATA.systemLocale || 'en').substring(0, 2);
  let currentLang = localStorage.getItem('harness-lang') || (I18N[systemLocale] ? systemLocale : 'en');

  // ── Dark mode ──
  function setBbDarkTheme(enabled) {
    const el = document.getElementById('bb-dark-theme');
    if (el) el.disabled = !enabled;
  }

  (function initTheme() {
    const stored = localStorage.getItem('harness-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') {
      document.body.classList.add('dark');
      setBbDarkTheme(true);
    }
    // Follow OS preference changes while the user has not made an explicit choice
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem('harness-theme')) return; // explicit user choice wins
      const isDark = e.matches;
      document.body.classList.toggle('dark', isDark);
      setBbDarkTheme(isDark);
      const themeBtn = document.getElementById('theme-toggle');
      if (themeBtn) themeBtn.textContent = isDark ? '☀️' : '🌙';
    });
  })();

  function t(key) {
    const args = Array.from(arguments).slice(1);
    let str = (I18N[currentLang] && I18N[currentLang][key]) || (I18N.en[key]) || key;
    args.forEach((a, i) => { str = str.replace('{' + i + '}', a); });
    if (str.indexOf('{{') !== -1) {
      str = str.replace(/\{\{configDir\}\}/g, DATA.configDir || '');
    }
    return str;
  }

  // ── Constants ──
  const CATEGORIES = [
    { key: 'configFiles', i18nKey: 'catConfigFiles', icon: '📄', color: '#059669' },
    { key: 'skills', i18nKey: 'catSkills', icon: '🧠', color: 'var(--color-skills)' },
    { key: 'agents', i18nKey: 'catAgents', icon: '🤖', color: 'var(--color-agents)' },
    { key: 'plugins', i18nKey: 'catPlugins', icon: '📦', color: 'var(--color-plugins)' },
    { key: 'hooks', i18nKey: 'catHooks', icon: '🪝', color: 'var(--color-hooks)' },
    { key: 'memory', i18nKey: 'catMemory', icon: '💾', color: 'var(--color-memory)' },
    { key: 'mcpServers', i18nKey: 'catMcpServers', icon: '🔌', color: 'var(--color-mcp)' },
    { key: 'rules', i18nKey: 'catRules', icon: '📏', color: 'var(--color-rules)' },
    { key: 'principles', i18nKey: 'catPrinciples', icon: '📐', color: 'var(--color-principles)' },
    { key: 'commands', i18nKey: 'catCommands', icon: '⌨️', color: '#6366f1' },
    { key: 'teams', i18nKey: 'catTeams', icon: '👥', color: '#ea580c' },
    { key: 'plans', i18nKey: 'catPlans', icon: '📋', color: '#0891b2' },
    { key: 'todos', i18nKey: 'catTodos', icon: '✅', color: '#16a34a' },
  ];
  // Dynamic label getter
  function getCatLabel(cat) { return t(cat.i18nKey) || cat.key; }

  const CATEGORY_COLOR_MAP = {};
  CATEGORIES.forEach((c) => { CATEGORY_COLOR_MAP[c.key] = c.color; });

  const CATEGORY_ICON_MAP = {};
  CATEGORIES.forEach((c) => { CATEGORY_ICON_MAP[c.key] = c.icon; });

  // ── State ──
  let currentScope = localStorage.getItem('harness-scope') || 'global';
  // Active tool filter: a concrete provider ('claude' | 'codex'). Controls which
  // scopes appear in the selector (C). Resolved to a valid value in init().
  let currentProvider = localStorage.getItem('harness-provider') || 'claude';
  let currentView = 'overview';
  let currentDetail = null;
  let currentPeriod = parseInt(localStorage.getItem('harness-period') || '30');
  // -1 means a custom date range was active, but customDateRange is not
  // persisted across page loads. Reset to 30d to avoid invalid calculations.
  if (currentPeriod < 0) { currentPeriod = 30; localStorage.setItem('harness-period', '30'); }
  let customDateRange = null; // { start: Date, end: Date }
  const expandedCategories = {};
  // Sidebar progressive rendering: categories with more children than
  // SIDEBAR_ITEM_LIMIT are truncated to the first N entries on first expand,
  // with a "show all" footer. Large skill/agent lists (500+) used to dump
  // hundreds of DOM nodes at once on expand — this caps the initial cost and
  // lets users opt-in via click (or use search, which always shows all hits).
  const SIDEBAR_ITEM_LIMIT = 50;
  const sidebarShowAll = new Set();
  let searchQuery = '';
  let activeInsightSource = 'all';
  let tokenBudget = null;
  try { tokenBudget = JSON.parse(localStorage.getItem('harness-budget') || 'null'); } catch (e) { /* ignore corrupt value */ }
  let currentSessionId = null;
  let pendingContextSid = null;
  // Sub-path for the context explorer page ('' | 'session' | '<sessionId>').
  // Lifted to module scope so getHash() / pushState() see it and don't overwrite
  // the URL on the initial render.
  let contextSubPath = '';
  let compareMode = localStorage.getItem('harness-compare') === 'true';
  const breakdownExpandedTypes = new Set();
  let sidebarCollapsed = localStorage.getItem('harness-sidebar-collapsed') === '1';
  let sidebarAutoCollapsed = false;

  // ── DOM refs ──
  const scopeSelect = document.getElementById('scope-select');
  const providerFilter = document.getElementById('provider-filter');
  const searchInput = document.getElementById('search');
  const sidebarNav = document.getElementById('sidebar-nav');
  const content = document.getElementById('content');

  // ── Init ──
  function init() {
    // Resolve the tool filter to a concrete tool (no 'all'): keep a still-valid
    // stored value, else the current scope's tool, else the first tool present.
    const _provs = availableProviders();
    if (_provs.indexOf(currentProvider) === -1) {
      currentProvider = _provs.indexOf(scopeProvider(currentScope)) !== -1
        ? scopeProvider(currentScope)
        : (_provs[0] || 'claude');
    }
    renderProviderFilter();
    populateScopeSelect();
    scopeSelect.addEventListener('change', onScopeChange);
    searchInput.addEventListener('input', onSearchInput);
    updateSearchPlaceholder();

    // Logo click → overview
    document.getElementById('sidebar-logo').addEventListener('click', () => {
      currentView = 'overview';
      currentDetail = null;
      pushState(true);
      render();
      content.scrollTop = 0;
    });

    // Dark mode toggle
    const themeBtn = document.createElement('button');
    themeBtn.id = 'theme-toggle';
    themeBtn.className = 'theme-btn';
    themeBtn.title = 'Toggle dark mode';
    themeBtn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isDark = document.body.classList.toggle('dark');
      localStorage.setItem('harness-theme', isDark ? 'dark' : 'light');
      themeBtn.textContent = isDark ? '☀️' : '🌙';
      // Toggle billboard.js dark theme — swaps a <style> block. The chart SVGs
      // restyle via CSS on the next paint, no regeneration needed.
      setBbDarkTheme(isDark);
      // Most pages are purely CSS-themed, so a full renderContent() rebuild is
      // wasted work (DOM churn, chart regen, scroll save/restore flicker).
      // Only these views compute theme-dependent values in JS and need a
      // rebuild to pick up the new theme:
      //   - overview: drawDonutChart uses getComputedStyle to resolve CSS var colors
      //   - structure: flowchart uses hardcoded hex colors that look wrong in
      //                the opposite theme and need re-render for correct swap
      // context is NOT in this list: all colors are now CSS-variable driven
      // and the floatTip re-applies its theme at show time, so no rebuild needed.
      const THEME_REBUILD_VIEWS = { overview: 1, structure: 1 };
      if (THEME_REBUILD_VIEWS[currentView] && !currentDetail) {
        const scrollPos = content.scrollTop;
        skipScrollReset = true;
        renderContent();
        skipScrollReset = false;
        requestAnimationFrame(function () { content.scrollTop = scrollPos; });
      }
    });

    // Help button
    const helpBtn = document.createElement('button');
    helpBtn.className = 'theme-btn';
    helpBtn.title = t('help');
    helpBtn.textContent = '❓';
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentView = 'help';
      currentDetail = null;
      pushState(true);
      render();
    });

    // Place theme toggle + help button in sidebar logo
    const logoEl = document.getElementById('sidebar-logo');
    const logoMainEl = logoEl ? logoEl.querySelector('.sidebar-logo-main') : null;
    const inlineToggle = document.getElementById('sidebar-toggle');
    if (logoMainEl) {
      if (inlineToggle) {
        logoMainEl.insertBefore(themeBtn, inlineToggle);
        logoMainEl.insertBefore(helpBtn, inlineToggle);
      } else {
        logoMainEl.appendChild(themeBtn);
        logoMainEl.appendChild(helpBtn);
      }
    }

    // Language toggle
    const langGroup = document.getElementById('lang-toggle-group');
    if (langGroup) {
      updateLangToggle();
      langGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('.lang-btn');
        if (!btn) return;
        let lang = btn.dataset.lang;
        if (lang && lang !== currentLang) {
          currentLang = lang;
          localStorage.setItem('harness-lang', currentLang);
          document.documentElement.lang = currentLang;
          updateNumFmt();
          updateLangToggle();
          updateSearchPlaceholder();
          const scrollPos = content.scrollTop;
          skipScrollReset = true;
          render();
          skipScrollReset = false;
          requestAnimationFrame(() => { content.scrollTop = scrollPos; });
        }
      });
    }

    // Browser history. Always re-derive the full route from the hash —
    // e.state only carries view/detail, not currentSessionId, compare
    // session IDs or contextSubPath, so trusting it restores wrong pages.
    // applyHash() is side-effect free w.r.t. history (no push/replace).
    window.addEventListener('popstate', () => {
      if (!window.location.hash) {
        currentView = 'overview';
        currentDetail = null;
      }
      applyHash();
      render();
    });

    // Dev build badge
    if (DATA._devBuild) {
      const badge = document.createElement('div');
      badge.className = 'dev-build-badge';
      badge.textContent = 'DEV BUILD';
      document.body.appendChild(badge);
    }

    initSidebarCollapse();

    // Wire unified tooltip for content area heatmap cells.
    // Health-factor-help elements have their own tooltip binding in
    // bindContentActions and are intentionally excluded here to avoid conflicts.
    bindDelegatedTooltips(content, '.heatmap-cell[data-tooltip]');

    // Apply initial hash
    if (window.location.hash) {
      applyHash();
    }

    render();
    pushState(false);
  }

  // ── Sidebar collapse ──
  function initSidebarCollapse() {
    if (sidebarCollapsed) document.body.classList.add('sidebar-collapsed');

    function onToggleClick(e) {
      e.stopPropagation();
      sidebarAutoCollapsed = false;
      sidebarCollapsed = !sidebarCollapsed;
      localStorage.setItem('harness-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
      document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
      removeNavTooltips();
    }
    document.getElementById('sidebar-toggle')?.addEventListener('click', onToggleClick);
    document.querySelector('.sidebar-toggle-collapsed')?.addEventListener('click', onToggleClick);

    const mql = window.matchMedia('(max-width: 1100px)');
    function onBreakpoint(e) {
      if (e.matches) {
        sidebarAutoCollapsed = true;
        document.body.classList.add('sidebar-collapsed');
      } else {
        sidebarAutoCollapsed = false;
        document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
      }
      removeNavTooltips();
    }
    mql.addEventListener('change', onBreakpoint);
    onBreakpoint(mql);
    initMobileDrawer();
  }

  // ── Mobile off-canvas drawer ──
  function initMobileDrawer() {
    const hamburger = document.getElementById('mobile-hamburger');
    const backdrop = document.getElementById('mobile-backdrop');
    if (!hamburger || !backdrop) return;

    function openDrawer() {
      document.body.classList.add('mobile-nav-open');
      hamburger.setAttribute('aria-expanded', 'true');
      hamburger.setAttribute('aria-label', t('mobileMenuOpen'));
    }

    function closeDrawer() {
      document.body.classList.remove('mobile-nav-open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', t('mobileMenuOpen'));
    }

    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.body.classList.contains('mobile-nav-open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    backdrop.addEventListener('click', closeDrawer);

    // Auto-close drawer after a nav item is tapped
    sidebarNav.addEventListener('click', (e) => {
      const navEl = e.target.closest('[data-action="nav"], [data-action="detail"]');
      if (navEl && window.matchMedia('(max-width: 768px)').matches) {
        closeDrawer();
      }
    });
  }

  // ── Unified tooltip ──
  // One shared element, reused for all tooltip triggers (collapsed sidebar nav
  // items with data-label, period buttons with data-tooltip, heatmap cells with
  // data-tooltip). Replaces the old .nav-tooltip and .period-tooltip JS systems.
  let _sharedTipEl = null;
  let _sharedTipTarget = null;

  function _getSharedTip() {
    if (!_sharedTipEl) {
      _sharedTipEl = document.createElement('div');
      _sharedTipEl.className = 'nav-tooltip';
      _sharedTipEl.id = 'shared-tooltip';
      _sharedTipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(_sharedTipEl);
    }
    return _sharedTipEl;
  }

  function showSharedTooltip(text, anchorEl, position) {
    if (!text) return;
    const tip = _getSharedTip();
    tip.textContent = text;
    tip.style.display = 'block';
    tip.removeAttribute('hidden');
    _sharedTipTarget = anchorEl;
    if (anchorEl) anchorEl.setAttribute('aria-describedby', 'shared-tooltip');

    const rect = anchorEl.getBoundingClientRect();
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left, top;
    if (position === 'right') {
      const sidebarEl = document.querySelector('.sidebar');
      const sidebarRight = sidebarEl ? sidebarEl.getBoundingClientRect().right : 52;
      left = sidebarRight + 8;
      top = rect.top + rect.height / 2 - tipH / 2;
    } else {
      // Default: above the element, horizontally centered
      left = rect.left + (rect.width - tipW) / 2;
      top = rect.top - tipH - 4;
    }
    // Clamp within viewport
    if (left < 4) left = 4;
    if (left + tipW > vw - 4) left = vw - 4 - tipW;
    if (top < 4) top = rect.bottom + 4; // flip below if no room above

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideSharedTooltip(anchorEl) {
    if (_sharedTipEl) {
      _sharedTipEl.style.display = 'none';
    }
    if (anchorEl) anchorEl.removeAttribute('aria-describedby');
    _sharedTipTarget = null;
  }

  function removeNavTooltips() {
    // Hide the shared tooltip (legacy callers still call this)
    hideSharedTooltip(_sharedTipTarget);
  }

  function bindNavTooltips() {
    sidebarNav.querySelectorAll('.nav-item[data-label]').forEach((item) => {
      // Keep a local tipEl reference so the test assertion on click cleanup passes
      let tipEl = null;
      item.addEventListener('mouseenter', () => {
        if (!document.body.classList.contains('sidebar-collapsed')) return;
        const label = item.dataset.label;
        if (!label) return;
        tipEl = _sharedTipEl || _getSharedTip();
        showSharedTooltip(label, item, 'right');
      });
      item.addEventListener('focusin', () => {
        if (!document.body.classList.contains('sidebar-collapsed')) return;
        const label = item.dataset.label;
        if (!label) return;
        tipEl = _sharedTipEl || _getSharedTip();
        showSharedTooltip(label, item, 'right');
      });
      item.addEventListener('mouseleave', () => {
        if (tipEl) { hideSharedTooltip(item); tipEl = null; }
      });
      item.addEventListener('focusout', () => {
        if (tipEl) { hideSharedTooltip(item); tipEl = null; }
      });
      item.addEventListener('click', () => {
        if (tipEl) { tipEl.remove(); tipEl = null; }
      });
    });
  }

  // bindDelegatedTooltips: wire unified JS tooltip to all [data-tooltip] elements
  // in a container. Pass an optional CSS selector to restrict which elements are
  // handled (useful to avoid double-firing with legacy per-element tooltip code).
  function bindDelegatedTooltips(container, selector) {
    selector = selector || '[data-tooltip]';
    container.addEventListener('mouseenter', (e) => {
      const el = e.target.closest(selector);
      if (!el || !container.contains(el)) return;
      if (el.classList.contains('active')) return;
      const tip = el.dataset.tooltip;
      if (!tip) return;
      showSharedTooltip(tip, el, 'above');
    }, true);
    container.addEventListener('focusin', (e) => {
      const el = e.target.closest(selector);
      if (!el || !container.contains(el)) return;
      if (el.classList.contains('active')) return;
      const tip = el.dataset.tooltip;
      if (!tip) return;
      showSharedTooltip(tip, el, 'above');
    }, true);
    container.addEventListener('mouseleave', (e) => {
      const el = e.target.closest(selector);
      if (el && container.contains(el)) hideSharedTooltip(el);
    }, true);
    container.addEventListener('focusout', (e) => {
      const el = e.target.closest(selector);
      if (el && container.contains(el)) hideSharedTooltip(el);
    }, true);
  }

  function updateSearchPlaceholder() {
    searchInput.placeholder = t('searchPlaceholder');
    const scopeLabel = document.querySelector('.scope-label');
    if (scopeLabel) scopeLabel.textContent = t('scopeLabel');
    const tagline = document.getElementById('sidebar-logo-tagline');
    if (tagline) tagline.textContent = t('tagline');
  }

  function updateLangToggle() {
    const group = document.getElementById('lang-toggle-group');
    if (!group) return;
    // Re-read from DATA in API mode (systemLocale may not be set at module init time)
    const activeLocale = (DATA.systemLocale || '').substring(0, 2) || systemLocale;
    if (activeLocale !== systemLocale) systemLocale = activeLocale;
    group.querySelectorAll('.lang-btn').forEach((btn) => {
      if (btn.dataset.lang === currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // ── History / Hash ──
  function getHash() {
    if (currentView === 'compare' && _compareSessionA && _compareSessionB) {
      return '#compare/' + encodeURIComponent(_compareSessionA) + '/' + encodeURIComponent(_compareSessionB);
    }
    if (currentView === 'session' && currentSessionId) {
      return '#session/' + encodeURIComponent(currentSessionId);
    }
    if (currentView === 'context' && contextSubPath) {
      return '#context/' + encodeURIComponent(contextSubPath);
    }
    if (currentDetail) {
      return '#' + currentDetail.category + '/' + encodeURIComponent(currentDetail.name);
    }
    return '#' + currentView;
  }

  function pushState(addToHistory) {
    let hash = getHash();
    const state = { view: currentView, detail: currentDetail };
    if (addToHistory !== false) {
      history.pushState(state, '', hash);
    } else {
      history.replaceState(state, '', hash);
    }
  }

  // Compare state — holds two session IDs for the compare view
  var _compareSessionA = null;
  var _compareSessionB = null;

  function applyHash() {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    let parts = hash.split('/');
    let view = parts[0];
    if (view === 'compare' && parts.length >= 3) {
      currentView = 'compare';
      _compareSessionA = decodeURIComponent(parts[1]);
      _compareSessionB = decodeURIComponent(parts.slice(2).join('/'));
      currentDetail = null;
      return;
    }
    if (view === 'context') {
      currentView = 'context';
      currentDetail = null;
      pendingContextSid = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : null;
      contextSubPath = pendingContextSid || '';
      return;
    }
    // Any other view → reset context sub-path so returning to #context doesn't stick
    if (view !== 'context') contextSubPath = '';
    if (view === 'session' && parts.length > 1) {
      currentView = 'session';
      currentSessionId = decodeURIComponent(parts.slice(1).join('/'));
      currentDetail = null;
      expandedCategories._tokens = true;
    } else if (parts.length > 1) {
      let name = decodeURIComponent(parts.slice(1).join('/'));
      currentView = view;
      currentDetail = { category: view, name: name };
      expandedCategories[view] = true;
    } else if (view === 'insights') {
      currentView = 'insights';
      currentDetail = null;
    } else if (view === 'overview' || view === 'structure' || view === 'context' || view === 'tokens' || view === 'tokens-cost' || view === 'tokens-cache' || view === 'tokens-prompt' || view === 'tokens-session' || view === 'tokens-analysis' || view === 'breakdown' || view === 'help') {
      currentView = view === 'tokens-analysis' ? 'tokens-prompt' : view;
      currentDetail = null;
      if (view.startsWith('tokens') || view === 'breakdown') expandedCategories._tokens = true;
    } else {
      // Check if it's a category key
      const isCat = CATEGORIES.some((c) => { return c.key === view; });
      if (isCat) {
        currentView = view;
        currentDetail = null;
        expandedCategories[view] = true;
      }
    }
  }

  // ── Provider (tool) helpers ──
  // A scope belongs to a provider (harness/tool). Claude scopes omit the field,
  // so it defaults to 'claude'. Codex (and future tools) set scope.provider.
  function scopeProvider(id) {
    const s = (DATA.scopes || []).find((x) => x.id === id);
    return (s && s.provider) || 'claude';
  }
  function providerLabel(p) {
    if (p === 'codex') return t('providerCodex');
    return t('providerClaude');
  }
  // Classify a pricing-table key by tool: OpenAI/Codex keys are gpt-*, the rest
  // are Anthropic/Claude. Used to show only the active tool's rate table.
  function pricingKeyProvider(key) {
    return key.indexOf('gpt-') === 0 ? 'codex' : 'claude';
  }

  // Distinct providers present in the data, in scope order.
  function availableProviders() {
    const seen = [];
    (DATA.scopes || []).forEach((s) => {
      const p = s.provider || 'claude';
      if (seen.indexOf(p) === -1) seen.push(p);
    });
    return seen;
  }

  function populateScopeSelect() {
    scopeSelect.innerHTML = '';
    const scopes = DATA.scopes || [];
    const addOption = (parent, s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      opt.title = s.projectPath || s.configPath || '';
      if (s.id === currentScope) opt.selected = true;
      parent.appendChild(opt);
    };
    // Scopes for the active tool filter (C) — always a single concrete tool,
    // so no <optgroup> grouping is needed (the filter separates tools instead).
    scopes.filter((s) => (s.provider || 'claude') === currentProvider).forEach((s) => addOption(scopeSelect, s));
    const sel = scopes.find((s) => s.id === currentScope);
    scopeSelect.title = sel ? (sel.projectPath || sel.configPath || '') : '';
  }

  // C: segmented tool filter — one pill per tool that actually has data
  // (Claude / Codex), no "All". Hidden unless more than one tool is present.
  function renderProviderFilter() {
    if (!providerFilter) return;
    const provs = availableProviders();
    if (provs.length <= 1) { providerFilter.hidden = true; return; }
    providerFilter.hidden = false;
    providerFilter.innerHTML = provs.map((p) =>
      '<button type="button" class="provider-filter-btn' + (p === currentProvider ? ' active' : '') +
      '" data-provider="' + p + '" title="' + escapeHtml(providerLabel(p)) + '">' +
      escapeHtml(providerLabel(p)) + '</button>'
    ).join('');
    providerFilter.querySelectorAll('.provider-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => onProviderChange(btn.dataset.provider));
    });
  }

  function onProviderChange(p) {
    // Switching tool always jumps to that tool's first scope.
    if (p === currentProvider) return;
    currentProvider = p;
    try { localStorage.setItem('harness-provider', p); } catch (_) {}
    const first = (DATA.scopes || []).find((s) => (s.provider || 'claude') === p);
    if (first) { currentScope = first.id; try { localStorage.setItem('harness-scope', currentScope); } catch (_) {} }
    renderProviderFilter();
    populateScopeSelect();
    currentDetail = null;
    pushState(true);
    render();
    if (DATA._apiMode) {
      const range = computeCurrentPeriodRange();
      if (range) refetchUsage(range);
    }
  }

  function onScopeChange() {
    currentScope = scopeSelect.value;
    try { localStorage.setItem('harness-scope', currentScope); } catch (_) {}
    const sel = DATA.scopes.find((s) => { return s.id === currentScope; });
    scopeSelect.title = sel ? (sel.projectPath || sel.configPath || '') : '';
    // Clear detail view but keep current category/page
    currentDetail = null;
    const scrollPos = content.scrollTop;
    skipScrollReset = true;
    pushState(true);
    render();
    skipScrollReset = false;
    requestAnimationFrame(() => { content.scrollTop = scrollPos; });
    // API mode: fetch usage for the new scope if not already hydrated.
    if (DATA._apiMode) {
      const sd = DATA.scopeData[currentScope];
      if (sd && (!sd.usage || !sd.usage.tokenEntries)) {
        const range = computeCurrentPeriodRange();
        if (range) refetchUsage(range);
      }
    }
  }

  function onSearchInput() {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderSidebar();
  }

  // ── Data helpers ──
  function getScopeData() {
    return DATA.scopeData[currentScope] || {};
  }

  // Accumulated set of days (local Y-M-D) that have activity, per scope. Grows
  // as usage is fetched for any period and never shrinks — so the calendar's
  // has-data markers stay complete even after a narrow custom-range fetch
  // replaces DATA.scopeData[scope].usage. Keyed by scope.
  const _activeDaysByScope = {};
  function recordActiveDays(scope, usage) {
    if (!usage) return;
    let set = _activeDaysByScope[scope] || (_activeDaysByScope[scope] = new Set());
    const arrs = [usage.tokenEntries, usage.promptStats, usage.latencyEntries, usage.skills, usage.agents, usage.commands];
    for (const arr of arrs) {
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const ts = arr[i].timestamp;
        let dt = null;
        if (typeof ts === 'number') dt = new Date(ts);
        else if (typeof ts === 'string') dt = new Date(ts);
        else if (arr[i].date) dt = new Date(arr[i].date);
        if (dt && !isNaN(dt.getTime())) {
          set.add(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'));
        }
      }
    }
  }

  // The calendar must offer the FULL data range regardless of the current
  // period, so once per scope fetch all-time usage (into the accumulator only —
  // never replacing the current view's usage) to complete the active-days set.
  const _activeDaysFull = {};
  async function ensureAllActiveDays(scope) {
    if (_activeDaysFull[scope]) return false;
    if (!DATA._apiMode) {
      recordActiveDays(scope, (DATA.scopeData[scope] || {}).usage);
      _activeDaysFull[scope] = true;
      return true;
    }
    const dr = DATA._dateRange;
    const from = dr && dr.from ? Math.floor(dr.from) : 0;
    const to = dr && dr.to ? Math.floor(dr.to) : Date.now();
    try {
      const res = await fetch('/api/usage?scope=' + encodeURIComponent(scope) + '&from=' + from + '&to=' + to);
      if (!res.ok) return false;
      const u = await res.json();
      if (u && u.error) return false;
      recordActiveDays(scope, u);
      _activeDaysFull[scope] = true;
      return true;
    } catch (e) { return false; }
  }

  // Compute the timestamp range (ms) matching the current period / custom
  // range controls. Used by the API loader to request only the needed slice.
  function computeCurrentPeriodRange() {
    const now = Date.now();
    if (customDateRange) {
      return { from: customDateRange.start.getTime(), to: customDateRange.end.getTime() };
    }
    if (currentPeriod === 0 || currentPeriod < 0) {
      // All-time — use the scope's dateRange if available, otherwise a wide window.
      const sd = DATA.scopeData && DATA.scopeData[currentScope];
      const dr = sd && sd.dateRange;
      if (dr && dr.start && dr.end) {
        return { from: new Date(dr.start).getTime(), to: new Date(dr.end).getTime() };
      }
      return { from: 0, to: now };
    }
    const from = now - (currentPeriod * 24 * 60 * 60 * 1000);
    return { from, to: now };
  }

  // Abort controller for in-flight /api/usage fetches — cancelled on each new request.
  let _usageFetchAbort = null;

  // Fetch usage data for the given scope+range from the server API and
  // replace DATA.scopeData[scope].usage. Returns true on success.
  async function fetchUsageForPeriod(scope, fromMs, toMs) {
    if (!DATA._apiMode) return false;
    if (!DATA.scopeData[scope]) return false;
    if (_usageFetchAbort) _usageFetchAbort.abort();
    _usageFetchAbort = new AbortController();
    const signal = _usageFetchAbort.signal;
    try {
      const params = new URLSearchParams({
        scope,
        from: String(Math.floor(fromMs)),
        to: String(Math.floor(toMs))
      });
      const res = await fetch('/api/usage?' + params, { signal });
      if (!res.ok) return false;
      const usage = await res.json();
      if (usage && usage.error) return false; // e.g. db_not_ready
      DATA.scopeData[scope].usage = usage;
      recordActiveDays(scope, usage); // accumulate for the calendar's has-data markers
      DATA._usageReady = true;
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return null; // superseded by newer fetch
      return false;
    }
  }

  // Refetch usage for the current scope and the given range. While the fetch
  // is in flight the content area is dimmed (DATA._usageReady drives the
  // `usage-loading` class); on failure a dismissible error strip with a retry
  // action is shown instead of silently keeping mislabeled stale data.
  function setUsageLoading(loading) {
    DATA._usageReady = !loading;
    content.classList.toggle('usage-loading', loading);
  }

  function refetchUsage(range) {
    removeUsageFetchError();
    setUsageLoading(true);
    fetchUsageForPeriod(currentScope, range.from, range.to).then((ok) => {
      if (ok === null) return; // aborted — a newer request owns the UI state
      setUsageLoading(false);
      if (ok) {
        render();
      } else {
        showUsageFetchError();
      }
    });
  }

  function removeUsageFetchError() {
    const prev = document.getElementById('usage-fetch-error');
    if (prev) prev.remove();
  }

  function showUsageFetchError() {
    removeUsageFetchError();
    const strip = document.createElement('div');
    strip.id = 'usage-fetch-error';
    strip.className = 'usage-error-strip';
    strip.innerHTML = '<span>' + t('usageFetchError') + '</span>'
      + '<button type="button" class="usage-error-retry">' + t('usageFetchRetry') + '</button>'
      + '<button type="button" class="usage-error-dismiss" aria-label="' + t('dismiss') + '">✕</button>';
    strip.querySelector('.usage-error-retry').addEventListener('click', () => {
      const range = computeCurrentPeriodRange();
      strip.remove();
      if (range) refetchUsage(range);
    });
    strip.querySelector('.usage-error-dismiss').addEventListener('click', () => { strip.remove(); });
    content.insertBefore(strip, content.firstChild);
  }

  function getItems(category) {
    return getScopeData()[category] || [];
  }

  function getUsage() {
    return getScopeData().usage || {};
  }

  function getItemName(category, item) {
    if (category === 'hooks' && item.event) {
      return item.matcher && item.matcher !== '*'
        ? item.event + ' (' + item.matcher + ')'
        : item.event;
    }
    return item.name || item.event || item.filePath || 'Unknown';
  }

  function getPluginAuthor(pluginName) {
    if (!pluginName) return null;
    let plugins = getScopeData().plugins || [];
    let plugin = plugins.find((p) => { return p.name === pluginName; });
    return plugin ? plugin.author || null : null;
  }

  // Category color map for type badges
  const TYPE_BADGE_COLORS = {
    configFiles: '#059669',
    skills: '#4263eb', agents: '#7c3aed', plugins: '#0ca678',
    hooks: '#e8590c', memory: '#0891b2', mcpServers: '#dc2626',
    rules: '#6b7280', principles: '#4f46e5'
  };

  /** Render a round type badge for a category */
  function typeBadge(category) {
    let cat = CATEGORIES.find((c) => { return c.key === category; });
    const label = cat ? getCatLabel(cat) : category;
    let color = TYPE_BADGE_COLORS[category] || '#6b7280';
    return '<span class="type-badge" style="background:' + color + '">' + escapeHtml(label) + '</span>';
  }

  /** Render parent plugin info if applicable */
  function parentBadge(category, itemName) {
    if (category !== 'skills') return '';
    let sd = getScopeData();
    const skill = (sd.skills || []).find((s) => { return s.name === itemName; });
    if (!skill || !skill.plugin) return '';
    return '<span class="parent-badge" data-action="goto-detail" data-category="plugins" data-name="' + escapeHtml(skill.plugin) + '">' + escapeHtml(skill.plugin) + '</span>';
  }

  function filterByPeriod(items, dateField, days) {
    if ((days === 0 || days < 0) && !customDateRange) return items;
    if (customDateRange) {
      return items.filter((i) => {
        let d = new Date(i[dateField]);
        return d >= customDateRange.start && d <= customDateRange.end;
      });
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    cutoff.setHours(0, 0, 0, 0);
    return items.filter((i) => { return new Date(i[dateField]) >= cutoff; });
  }

  function matchUsageName(logName, itemName) {
    if (logName === itemName) return true;
    // Match "plugin:skill" to "skill" (e.g., "superpowers:brainstorming" matches "brainstorming")
    if (logName.includes(':') && logName.split(':').pop() === itemName) return true;
    return false;
  }

  function getUsageList(type) {
    let usage = getUsage();
    if (type === 'mcpServers') return usage.mcpCalls || [];
    return usage[type] || [];
  }

  function countUsage(type, name, days) {
    let list = getUsageList(type);
    const filtered = filterByPeriod(list, 'timestamp', days);
    if (!name) return filtered.length;
    return filtered.filter((i) => { return matchUsageName(i.name, name); }).length;
  }

  function getLastUsed(type, name) {
    let list = getUsageList(type);
    let items = list.filter((i) => { return matchUsageName(i.name, name); }).sort((a, b) => { return new Date(b.timestamp) - new Date(a.timestamp); });
    return items.length > 0 ? items[0].timestamp : null;
  }

  function calcChange(type, name, days) {
    if (days === 0 && !customDateRange) return null;
    const list = getUsageList(type);
    if (customDateRange) {
      const rangeDays = Math.ceil((customDateRange.end - customDateRange.start) / 86400000);
      const prevEnd = new Date(customDateRange.start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      let prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - rangeDays);
      let cur = list.filter((i) => {
        let d = new Date(i.timestamp);
        return d >= customDateRange.start && d <= customDateRange.end && (!name || matchUsageName(i.name, name));
      }).length;
      let prev = list.filter((i) => {
        let d = new Date(i.timestamp);
        return d >= prevStart && d <= prevEnd && (!name || matchUsageName(i.name, name));
      }).length;
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    }
    let now = new Date();
    let curStart = new Date(now);
    curStart.setDate(curStart.getDate() - days);
    const prevStart2 = new Date(curStart);
    prevStart2.setDate(prevStart2.getDate() - days);
    const cur2 = list.filter((i) => {
      let d = new Date(i.timestamp);
      return d >= curStart && (!name || matchUsageName(i.name, name));
    }).length;
    let prev2 = list.filter((i) => {
      let d = new Date(i.timestamp);
      return d >= prevStart2 && d < curStart && (!name || matchUsageName(i.name, name));
    }).length;
    if (prev2 === 0) return cur2 > 0 ? 100 : 0;
    return Math.round(((cur2 - prev2) / prev2) * 100);
  }

  // ── Date formatting ──
  function relativeTime(dateStr) {
    if (!dateStr) return '-';
    let now = new Date();
    let d = new Date(dateStr);
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    if (seconds < 60) return t('justNow');
    if (minutes < 60) return t('minutesAgo', minutes);
    if (hours < 24) return t('hoursAgo', hours);
    if (days < 30) return t('daysAgo', days);
    if (months < 12) return t('monthsAgo', months);
    return t('yearsAgo', Math.floor(months / 12));
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    let d = new Date(dateStr);
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }

  function fmtChartTooltipTitle(d) {
    let dayNames = t('dayNames').split(',');
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0')
      + ' (' + dayNames[d.getDay()] + ')';
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    let d = new Date(dateStr);
    const date = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hrs = Math.floor(Math.abs(offset) / 60);
    const tz = 'UTC' + sign + hrs;
    return date + ' ' + time + ' (' + tz + ')';
  }

  // ── Simple Markdown renderer ──
  function renderMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      let trimmed = code.trim();
      if (lang === 'json') return '<pre><code class="lang-json">' + syntaxHighlightJson(trimmed, true, true) + '</code></pre>';
      return '<pre><code>' + trimmed + '</code></pre>';
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Markdown sources include externally-influenced text (memory files,
    // subagent prompts), so only safe URL schemes become live links:
    // http(s), mailto, and fragment/relative URLs. Anything else (e.g.
    // javascript:) renders as plain text. Control chars/whitespace are
    // stripped before the scheme check since browsers ignore them in URLs.
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      const href = url.trim();
      const scheme = (href.replace(/[\u0000-\u0020]/g, '').match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/) || [])[1];
      if (scheme && !/^(https?|mailto)$/i.test(scheme)) return text;
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    });
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (_, header, sep, body) => {
      const ths = header.split('|').filter((c) => { return c.trim(); }).map((c) => { return '<th>' + c.trim() + '</th>'; }).join('');
      const rows = body.trim().split('\n').map((row) => {
        const tds = row.split('|').filter((c) => { return c.trim(); }).map((c) => { return '<td>' + c.trim() + '</td>'; }).join('');
        return '<tr>' + tds + '</tr>';
      }).join('');
      return '<table><thead><tr>' + ths + '</tr></thead><tbody>' + rows + '</tbody></table>';
    });

    html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, text) => {
      return '<li>' + text + '</li>';
    });
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    html = html.split('\n').map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^<(h[1-4]|p|ul|ol|li|pre|blockquote|hr|table|thead|tbody|tr|th|td)/.test(trimmed)) return line;
      return '<p>' + trimmed + '</p>';
    }).join('\n');

    html = html.replace(/<p><\/p>/g, '');
    return html;
  }

  /** Format number with Intl.NumberFormat */
  let _numFmt = new Intl.NumberFormat(t('numLocale'));
  function fmtNum(n) {
    if (typeof n !== 'number') return String(n);
    return _numFmt.format(n);
  }
  function updateNumFmt() {
    _numFmt = new Intl.NumberFormat(t('numLocale'));
  }

  /**
   * Canonical number formatter — see docs/number-formatting.md for the rules.
   *   - Absolute value < 10,000 → Intl.NumberFormat (locale-aware thousands
   *     separator, keeps full precision for small numbers)
   *   - ≥ 10,000 → SI prefix (K / M / B). Decimal kept only when meaningful
   *     (e.g. 12.3K, but 12K instead of 12.0K)
   * This is the ONE function that should be used for every number the user
   * sees in the dashboard. Use fmtNum if you explicitly want no SI conversion
   * (rare — for IDs, versions, etc.), and fmtCost for currency.
   */
  function fmtCompact(n) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    const abs = Math.abs(n);
    if (abs < 1e4) return fmtNum(n);
    const sign = n < 0 ? '-' : '';
    const stripZero = (v) => v.toFixed(1).replace(/\.0$/, '');
    if (abs >= 1e9) return sign + stripZero(abs / 1e9) + 'B';
    if (abs >= 1e6) return sign + stripZero(abs / 1e6) + 'M';
    return sign + stripZero(abs / 1e3) + 'K';
  }

  /**
   * Canonical percent formatter.
   *   |n| >= 10  → integer (Math.round) + '%'
   *   |n| <  10  → 1 decimal + '%'
   *   sign preserved for negative values
   *   null / undefined / NaN → '0%'
   */
  function fmtPct(n) {
    if (n === null || n === undefined || (typeof n === 'number' && !isFinite(n))) return '0%';
    if (typeof n !== 'number' || isNaN(n)) return '0%';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 10) return sign + Math.round(abs) + '%';
    return sign + abs.toFixed(1) + '%';
  }

  /**
   * Canonical duration formatter (ms → human-readable).
   * Hoisted from 3 local copies in renderTokensSession / renderSessionDetail
   * / renderCompareView.
   */
  function fmtDur(ms) {
    if (ms >= 3600000) return (ms / 3600000).toFixed(1) + t('unitHour');
    if (ms >= 60000) return (ms / 60000).toFixed(0) + t('unitMin');
    return (ms / 1000).toFixed(0) + 's';
  }

  /**
   * Canonical millisecond formatter (ms → human-readable, sub-second precision).
   * Hoisted from 2 local copies. The copy in renderRegressionCard (line ~7148)
   * used Math.round(ms) for the raw-ms branch; we adopt that here for correctness.
   */
  function fmtMs(ms) {
    if (ms >= 60000) return (ms / 60000).toFixed(1) + t('unitMin');
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
    return Math.round(ms) + 'ms';
  }

  function fmtCost(n) {
    if (n >= 1000) return '$' + fmtNum(Math.round(n));
    if (n >= 100) return '$' + n.toFixed(1);
    if (n >= 1) return '$' + n.toFixed(2);
    if (n >= 0.01) return '$' + n.toFixed(3);
    if (n > 0) return '<$0.01';
    return '$0.00';
  }

  // Claude model pricing per 1M tokens (USD).
  // Fetched from Anthropic pricing docs at build time (DATA.modelPricing).
  // Hardcoded table below is the fallback when the build-time fetch fails.
  // cacheCreation = 5-minute cache write (1.25x input); cacheRead = cache hit (0.1x input)
  // Opus 4.5+ dropped to $5/$25 — distinct from original Opus 4 / 4.1 ($15/$75)
  const _PRICING_FALLBACK = {
    'opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
    'opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
    'opus-4-5': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
    'opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
    'sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
    'haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheCreation: 1.25 },
    'haiku-4': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
    'sonnet-3-5': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
    'haiku-3-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
    'opus-3': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
    'sonnet-3': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
    'haiku-3': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheCreation: 0.3 },
    // OpenAI / Codex (USD per 1M tokens). Cached input = 10% of input; Codex has
    // no cache-creation, so cacheCreation is 0. Keep in sync with export.mjs.
    'gpt-5.5': { input: 5, output: 30, cacheRead: 0.5, cacheCreation: 0 },
    'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0.25, cacheCreation: 0 },
    'gpt-5.1': { input: 0.63, output: 5, cacheRead: 0.063, cacheCreation: 0 },
    'gpt-5.3-codex': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreation: 0 },
    'gpt-5.2-codex': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreation: 0 },
    'gpt-5.1-codex': { input: 1.25, output: 10, cacheRead: 0.125, cacheCreation: 0 },
    'gpt-5.1-codex-mini': { input: 0.25, output: 2, cacheRead: 0.025, cacheCreation: 0 },
  };
  // Merge (not replace): fetched Claude pricing overlays the fallback, but the
  // fallback's OpenAI/Codex entries persist since the Claude feed omits them.
  const MODEL_PRICING = Object.assign({}, _PRICING_FALLBACK, DATA.modelPricing || {});

  function resolvePricingKey(model) {
    if (!model || model === 'unknown') return null;
    const s = model.replace(/^claude-/, '').replace(/-\d{8,}$/, '');
    if (MODEL_PRICING[s]) return s;
    const m = s.match(/^(opus|sonnet|haiku)-(\d+)(?:-(\d+))?$/);
    if (m) {
      // Check with minor version first (e.g. opus-4-6) then fall back to major (opus-4)
      if (m[3]) {
        const withMinor = m[1] + '-' + m[2] + '-' + m[3];
        if (MODEL_PRICING[withMinor]) return withMinor;
      }
      const base = m[1] + '-' + m[2];
      if (MODEL_PRICING[base]) return base;
    }
    return null;
  }

  function calcEntryCost(entry) {
    const key = resolvePricingKey(entry.model);
    if (!key) return 0;
    const p = MODEL_PRICING[key];
    return ((entry.rawInput || 0) * p.input
      + (entry.outputTokens || 0) * p.output
      + (entry.cacheRead || 0) * p.cacheRead
      + (entry.cacheCreation || 0) * p.cacheCreation) / 1e6;
  }

  // ── Usage export (CSV / JSON) ──
  // Client-side export of the currently filtered token entries via Blob +
  // anchor click — works on file:// and static hosting, no server required.
  // serve.mjs produces the same rows at /api/usage?format=csv|json for
  // scripting use; keep columns and escaping in sync with scripts/export.mjs.
  const EXPORT_COLUMNS = [
    'timestamp', 'scope', 'sessionId', 'model', 'context', 'contextName',
    'inputTokens', 'outputTokens', 'cacheRead', 'cacheWrite', 'cost',
  ];

  /** RFC 4180 field escaping: quote when the value contains `"`, `,`, CR or LF. */
  function csvEscape(value) {
    if (value == null) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildUsageExportRows(entries) {
    return entries.map((e) => {
      const ts = Number(e.timestamp) || new Date(e.timestamp).getTime();
      return {
        timestamp: ts > 0 ? new Date(ts).toISOString() : '',
        scope: currentScope,
        sessionId: e.sessionId || '',
        model: e.model || '',
        context: e.context || '',
        contextName: e.contextName || '',
        inputTokens: e.rawInput || 0,
        outputTokens: e.outputTokens || 0,
        cacheRead: e.cacheRead || 0,
        cacheWrite: e.cacheCreation || 0,
        cost: Math.round(calcEntryCost(e) * 1e6) / 1e6,
      };
    });
  }

  function usageRowsToCsv(rows) {
    const lines = [EXPORT_COLUMNS.map(csvEscape).join(',')];
    rows.forEach((row) => {
      lines.push(EXPORT_COLUMNS.map((c) => csvEscape(row[c])).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  function exportUsageData(format) {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const entries = filterByPeriod(usage.tokenEntries || [], 'timestamp', days);
    const rows = buildUsageExportRows(entries);
    const isCsv = format === 'csv';
    const body = isCsv ? usageRowsToCsv(rows) : JSON.stringify(rows, null, 2);
    const now = new Date();
    const stamp = String(now.getFullYear())
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0');
    const blob = new Blob([body], { type: isCsv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'oh-my-hi-usage-' + stamp + '.' + (isCsv ? 'csv' : 'json');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { URL.revokeObjectURL(href); }, 1000);
  }

  function renderExportButtons() {
    return '<div class="export-actions" title="' + escapeHtml(t('exportTooltip')) + '">'
      + '<button type="button" class="export-btn" data-export="csv">⬇ ' + t('exportCsv') + '</button>'
      + '<button type="button" class="export-btn" data-export="json">⬇ ' + t('exportJson') + '</button>'
      + '</div>';
  }

  // F2: Efficiency aggregation over tokenEntries.
  // Returns per-item stats for a given context type ('skill' or 'agent').
  // Cached per scope/entries-reference to avoid recomputing across renders.
  let _efficiencyCache = null;
  function computeEfficiencyMap(contextType) {
    const usage = getUsage();
    const entries = usage.tokenEntries || [];
    if (!_efficiencyCache || _efficiencyCache.entries !== entries) {
      _efficiencyCache = { entries, skill: null, agent: null };
    }
    if (_efficiencyCache[contextType]) return _efficiencyCache[contextType];
    const map = {};
    let totalContextCost = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.context !== contextType) continue;
      const name = e.contextName || 'unknown';
      const row = map[name] || (map[name] = {
        name, callCount: 0, totalInput: 0, totalOutput: 0, totalCache: 0, totalCost: 0,
      });
      row.callCount += 1;
      row.totalInput += (e.rawInput || 0);
      row.totalOutput += (e.outputTokens || 0);
      row.totalCache += (e.cacheRead || 0) + (e.cacheCreation || 0);
      const c = calcEntryCost(e);
      row.totalCost += c;
      totalContextCost += c;
    }
    const result = { map, totalCost: totalContextCost };
    _efficiencyCache[contextType] = result;
    return result;
  }

  /** Top N names (by totalCost) within a context type, optionally restricted
   *  to a whitelist (e.g. names that appear in the user's item list). */
  function topCostContributors(contextType, n, whitelist) {
    const { map } = computeEfficiencyMap(contextType);
    const wl = whitelist && whitelist.length ? new Set(whitelist) : null;
    return Object.values(map)
      .filter((r) => r.totalCost > 0 && (!wl || wl.has(r.name)))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, n)
      .map((r) => r.name);
  }

  function localizeDocsUrl(url) {
    if (!url) return url;
    // docs.anthropic.com/en/docs/ → /{lang}/docs/
    // code.claude.com/docs/en/   → /docs/{lang}/
    return url.replace('/en/docs/', '/' + currentLang + '/docs/')
              .replace('/docs/en/', '/docs/' + currentLang + '/');
  }

  function docsLinkHtml(url) {
    if (!url) return '';
    return '<br><a href="' + localizeDocsUrl(url) + '" target="_blank" class="docs-link">📖 ' + t('viewOfficialDocs') + '</a>';
  }

  function escapeHtml(text) {
    let map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return text.replace(/[&<>"']/g, (c) => { return map[c]; });
  }

  // ── Data range helpers ──
  function getDataDateRange() {
    const usage = getUsage();
    // tokenEntries is the canonical activity source and the only one Codex
    // populates (its skills/agents live in the structure catalog, not usage) —
    // include it so the all-time range shows for every provider. Single-pass
    // min/max avoids sorting large token arrays on each render.
    const sources = [usage.tokenEntries, usage.commands, usage.skills, usage.agents, usage.promptStats, usage.latencyEntries];
    let min = Infinity, max = -Infinity;
    for (const arr of sources) {
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const ts = new Date(arr[i].timestamp).getTime();
        if (!Number.isFinite(ts)) continue;
        if (ts < min) min = ts;
        if (ts > max) max = ts;
      }
    }
    if (min === Infinity) return null;
    return { start: new Date(min), end: new Date(max) };
  }

  function getPeriodLabel() {
    if (customDateRange) {
      return formatDate(customDateRange.start.toISOString()) + ' ~ ' + formatDate(customDateRange.end.toISOString());
    }
    if (currentPeriod === 0) {
      let range = getDataDateRange();
      if (range) return formatDate(range.start.toISOString()) + ' ~ ' + formatDate(range.end.toISOString());
      return t('all');
    }
    return currentPeriod + 'd';
  }

  // ── Render orchestration ──
  function render() {
    renderSidebar();
    renderSidebarPeriod();
    renderContent();
  }

  // ── Sidebar rendering ──
  function renderSidebar() {
    let sd = getScopeData();
    let html = '';

    html += navItem('overview', '📊', t('overview'), null, currentView === 'overview' && !currentDetail);
    const isTokensArea = currentView === 'tokens' || currentView === 'tokens-cost' || currentView === 'tokens-cache' || currentView === 'breakdown';
    // Tokens group is always expanded — no collapse toggle, sub-items
    // visible from first render. Clicking the header still navigates
    // to the Tokens overview.
    html += navItem('tokens', '🪙', t('tokens'), null, currentView === 'tokens');
    html += '<div class="nav-sub">'
      + navItem('tokens-cost', '💰', t('tokensCost'), null, currentView === 'tokens-cost')
      + navItem('tokens-cache', '♻️', t('tokensCache'), null, currentView === 'tokens-cache')
      + navItem('breakdown', '📊', t('bdTitle'), null, currentView === 'breakdown')
      + '</div>';
    html += '<div class="nav-section-label">' + t('usageAnalysis') + '</div>';
    html += navItem('context', '🪟', t('contextExplorer'), null, currentView === 'context' && !currentDetail);
    html += navItem('tokens-prompt', '💬', t('tokensPrompt'), null, currentView === 'tokens-prompt');
    html += navItem('tokens-session', '📋', t('tokensSession'), null, currentView === 'tokens-session' || currentView === 'session');
    const lintCount = (sd.lint || []).length;
    html += navItem('structure', '🗂️', t('structure'), lintCount > 0 ? '⚠️ ' + fmtNum(lintCount) : null, currentView === 'structure' && !currentDetail);
    const usage = getUsage();
    const insightsBadge = (typeof computeAllInsights === 'function')
      ? (function() { var all = computeAllInsights(usage, currentPeriod, sd); return all.length > 0 ? fmtNum(all.length) : null; })()
      : null;
    html += navItem('insights', '💡', t('insights'), insightsBadge, currentView === 'insights');
    html += '<div class="nav-separator"></div>';

    // F2: top 3 cost contributors for 🔥 badges on sidebar.
    // Restrict to items that actually appear in this user's item list so
    // built-in Claude contexts (Explore, general-purpose, …) don't crowd out
    // the user's own skills/agents.
    const skillNames = (sd.skills || []).map((s) => s.name);
    const agentNames = (sd.agents || []).map((a) => a.name);
    const topSkillSet = new Set(topCostContributors('skill', 3, skillNames));
    const topAgentSet = new Set(topCostContributors('agent', 3, agentNames));

    CATEGORIES.forEach((cat) => {
      let items = sd[cat.key] || [];
      if (items.length === 0) return;
      const filteredItems = searchQuery
        ? items.filter((i) => { return getItemName(cat.key, i).toLowerCase().includes(searchQuery); })
        : items;

      if (searchQuery && filteredItems.length === 0) return;

      let isExpanded = expandedCategories[cat.key] || false;
      const isActive = currentView === cat.key;

      const badgeText = searchQuery ? fmtNum(filteredItems.length) + '/' + fmtNum(items.length) : fmtNum(items.length);

      html += '<div class="nav-item' + (isActive ? ' active' : '') + '" data-action="toggle-category" data-category="' + cat.key + '" title="' + escapeHtml(getCatLabel(cat)) + '" data-label="' + escapeHtml(getCatLabel(cat)) + '" tabindex="0" role="button">'
        + '<span class="icon">' + cat.icon + '</span>'
        + '<span class="label">' + getCatLabel(cat) + '</span>'
        + '<span class="badge">' + badgeText + '</span>'
        + '<span class="chevron' + (isExpanded ? ' expanded' : '') + '">▶</span>'
        + '</div>';

      html += '<div class="nav-children' + (isExpanded ? ' open' : '') + '" data-children="' + cat.key + '">';
      // Only cap when there is no active search; search results are already
      // narrowed so hiding them would defeat the point.
      const shouldCap = !searchQuery
        && !sidebarShowAll.has(cat.key)
        && filteredItems.length > SIDEBAR_ITEM_LIMIT;
      const visibleItems = shouldCap ? filteredItems.slice(0, SIDEBAR_ITEM_LIMIT) : filteredItems;
      visibleItems.forEach((item) => {
        let name = getItemName(cat.key, item);
        const isChildActive = currentDetail && currentDetail.category === cat.key && currentDetail.name === name;
        const hotBadge = (cat.key === 'skills' && topSkillSet.has(name))
          || (cat.key === 'agents' && topAgentSet.has(name))
          ? '<span class="cost-hot" title="' + escapeHtml(t('efficiencyTopBadge')) + '">🔥</span>'
          : '';
        html += '<div class="nav-child' + (isChildActive ? ' active' : '') + '" data-action="detail" data-category="' + cat.key + '" data-name="' + escapeHtml(name) + '" title="' + escapeHtml(name) + '">'
          + '<span class="dot" style="background:' + cat.color + '"></span>'
          + '<span class="label">' + escapeHtml(name) + '</span>'
          + hotBadge
          + '</div>';
      });
      if (shouldCap) {
        const remaining = filteredItems.length - SIDEBAR_ITEM_LIMIT;
        html += '<div class="nav-child nav-child-more" data-action="show-all" data-category="' + cat.key + '" title="' + escapeHtml(t('sidebarShowAll')) + '">'
          + '<span class="dot" style="background:transparent;border:1px dashed ' + cat.color + '"></span>'
          + '<span class="label">' + escapeHtml(t('sidebarShowMore').replace('{0}', fmtNum(remaining))) + '</span>'
          + '</div>';
      }
      html += '</div>';
    });

    sidebarNav.innerHTML = html;
    bindNavTooltips();

    sidebarNav.onclick = function (e) {
      const navItemEl = e.target.closest('[data-action]');
      if (!navItemEl) return;
      let action = navItemEl.dataset.action;

      if (action === 'toggle-category') {
        let cat = navItemEl.dataset.category;
        expandedCategories[cat] = !expandedCategories[cat];
        currentView = cat;
        currentDetail = null;
        pushState(true);
        render();
      } else if (action === 'detail') {
        const cat2 = navItemEl.dataset.category;
        let name = navItemEl.dataset.name;
        currentView = cat2;
        currentDetail = { category: cat2, name: name };
        expandedCategories[cat2] = true;
        pushState(true);
        render();
      } else if (action === 'show-all') {
        // Reveal the rest of a capped category without any other state change.
        // Only the sidebar needs to rebuild; content stays put.
        sidebarShowAll.add(navItemEl.dataset.category);
        renderSidebar();
      } else if (action === 'nav') {
        // Let middle-click / cmd-click / ctrl-click open in a new tab natively.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        currentView = navItemEl.dataset.view;
        currentDetail = null;
        pushState(true);
        render();
      }
    };

    // Keyboard: Enter/Space activates toggle-category items (which are non-anchor)
    sidebarNav.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const navItemEl = e.target.closest('[data-action]');
      if (!navItemEl) return;
      const action = navItemEl.dataset.action;
      if (action === 'toggle-category') {
        e.preventDefault();
        navItemEl.click();
      }
    });
  }

  function navItem(view, icon, label, badge, active) {
    return '<a class="nav-item' + (active ? ' active' : '') + '" href="#' + view + '" data-action="nav" data-view="' + view + '" data-label="' + escapeHtml(label) + '">'
      + '<span class="icon">' + icon + '</span>'
      + '<span class="label">' + label + '</span>'
      + (badge !== null ? '<span class="badge">' + badge + '</span>' : '')
      + '</a>';
  }

  // ── Chart lifecycle ──
  // billboard.js instances survive innerHTML replacement (they keep detached
  // SVG refs + window resize handlers), so every chart must be created via
  // makeChart() and is destroyed at the top of renderContent(). This covers
  // lazy/deferred chart draws too — anything created after the last render
  // is registered here and torn down on the next navigation.
  let activeCharts = [];
  // Arc-family chart types stay on SVG rendering; every other chart uses the
  // canvas backend (billboard.js v4 `render.mode`). Canvas draws all primitives
  // into a single <canvas>, which is faster for the dense line/area/bar charts
  // here but does not create per-shape SVG nodes — arc charts (donut/gauge/…)
  // still rely on SVG DOM for their labels/interaction, so they are excluded.
  const ARC_CHART_TYPES = new Set(['donut', 'pie', 'gauge', 'polar', 'radar', 'sunburst']);
  function chartIsArc(cfg) {
    const d = cfg.data || {};
    if (d.type && ARC_CHART_TYPES.has(d.type)) return true;
    if (d.types) {
      for (const k in d.types) if (ARC_CHART_TYPES.has(d.types[k])) return true;
    }
    return false;
  }
  function makeChart(cfg) {
    if (!chartIsArc(cfg)) {
      cfg.render = Object.assign({ mode: 'canvas' }, cfg.render, { mode: 'canvas' });
      // In canvas mode billboard renders the bottom legend as an HTML element
      // and pins it with an inline `inset` to the canvas' bottom edge, leaving
      // it cramped against the x-axis tick labels. Strip that inline inset on
      // every render so the legend sits at its natural in-flow bottom position;
      // vertical spacing is then handled by the .bb-canvas-legend-bottom CSS.
      const prevOnRendered = cfg.onrendered;
      cfg.onrendered = function () {
        const host = typeof cfg.bindto === 'string' ? document.querySelector(cfg.bindto) : cfg.bindto;
        const leg = host && host.querySelector('.bb-canvas-legend-bottom');
        if (leg) leg.style.removeProperty('inset');
        if (prevOnRendered) return prevOnRendered.apply(this, arguments);
      };
    }
    const chart = bb.generate(cfg);
    activeCharts.push(chart);
    return chart;
  }
  function destroyActiveCharts() {
    activeCharts.forEach((c) => {
      try { c.destroy(); } catch (e) { /* DOM already replaced — ignore */ }
    });
    activeCharts = [];
  }

  // ── Content rendering ──
  let skipScrollReset = false;
  // Tear down Context Explorer globals (window/document handlers, rAF loop,
  // floating tooltip). Runs on EVERY navigation via renderContent() so the
  // animation loop and listeners never survive against detached DOM.
  function teardownContextExplorer() {
    if (window._cwRafId) { cancelAnimationFrame(window._cwRafId); window._cwRafId = null; }
    if (window._cwKeyHandler) { window.removeEventListener('keydown', window._cwKeyHandler); window._cwKeyHandler = null; }
    if (window._cwFsHandler) { document.removeEventListener('fullscreenchange', window._cwFsHandler); window._cwFsHandler = null; }
    if (window._cwMouseHandler) { document.removeEventListener('mousedown', window._cwMouseHandler); window._cwMouseHandler = null; }
    if (window._cwFloatTip && window._cwFloatTip.parentNode) {
      window._cwFloatTip.parentNode.removeChild(window._cwFloatTip);
      window._cwFloatTip = null;
    }
  }

  function renderContent() {
    destroyActiveCharts();
    teardownContextExplorer();
    if (!skipScrollReset) {
      content.scrollTop = 0;
      window.scrollTo(0, 0);
    }

    if (currentDetail) {
      renderDetailView();
    } else if (currentView === 'overview') {
      renderOverview();
    } else if (currentView === 'tokens') {
      renderTokensPage();
    } else if (currentView === 'tokens-cost') {
      renderTokensCost();
    } else if (currentView === 'tokens-cache') {
      renderTokensCache();
    } else if (currentView === 'tokens-prompt') {
      renderTokensPrompt();
    } else if (currentView === 'tokens-session') {
      renderTokensSession();
    } else if (currentView === 'breakdown') {
      renderBreakdown();
    } else if (currentView === 'session') {
      renderSessionDetail();
    } else if (currentView === 'structure') {
      renderStructure();
    } else if (currentView === 'insights') {
      renderInsightsPage();
    } else if (currentView === 'context') {
      renderContextExplorer();
    } else if (currentView === 'compare') {
      renderCompareView();
    } else if (currentView === 'help') {
      renderHelp();
    } else {
      renderCategoryOverview();
    }

    // Budget threshold alert — prepended to whatever page was just rendered
    renderBudgetAlertBanner();
  }

  // ── Period filter with calendar ──
  function renderSidebarPeriod() {
    hideSharedTooltip(_sharedTipTarget);
    const sidebarPeriod = document.getElementById('sidebar-period');
    if (!sidebarPeriod) return;

    const now = new Date();
    let rangeStart, rangeEnd;
    if (customDateRange) {
      rangeStart = customDateRange.start;
      rangeEnd = customDateRange.end;
    } else if (currentPeriod === 0) {
      const range = getDataDateRange();
      if (range) { rangeStart = range.start; rangeEnd = range.end; }
    } else if (currentPeriod > 0) {
      rangeEnd = now;
      rangeStart = new Date(now);
      rangeStart.setDate(rangeStart.getDate() - (currentPeriod - 1));
    }
    const rangeText = rangeStart && rangeEnd
      ? formatDate(rangeStart.toISOString()) + ' ~ ' + formatDate(rangeEnd.toISOString())
      : '';

    const start7 = new Date(now); start7.setDate(start7.getDate() - 6);
    const tip7 = formatDate(start7.toISOString()) + ' ~ ' + formatDate(now.toISOString());
    const start30 = new Date(now); start30.setDate(start30.getDate() - 29);
    const tip30 = formatDate(start30.toISOString()) + ' ~ ' + formatDate(now.toISOString());
    const dataRange = getDataDateRange();
    const tipAll = dataRange ? (formatDate(dataRange.start.toISOString()) + ' ~ ' + formatDate(dataRange.end.toISOString())) : '';

    sidebarPeriod.innerHTML = '<div class="sidebar-period-label">' + t('periodRangeLabel') + '</div>'
      + '<div class="sidebar-period-btns">'
      + '<button class="period-btn' + (currentPeriod === 7 && !customDateRange ? ' active' : '') + '" data-period="7" data-tooltip="' + tip7 + '">7d</button>'
      + '<button class="period-btn' + (currentPeriod === 30 && !customDateRange ? ' active' : '') + '" data-period="30" data-tooltip="' + tip30 + '">30d</button>'
      + '<button class="period-btn' + (currentPeriod === 0 && !customDateRange ? ' active' : '') + '" data-period="0" data-tooltip="' + tipAll + '">' + t('all') + '</button>'
      + '<button class="period-btn period-btn-calendar' + (customDateRange ? ' active' : '') + '" data-period="custom">📅</button>'
      + '<button class="period-btn period-btn-compare' + (compareMode && !customDateRange && currentPeriod !== 0 ? ' active' : '') + (customDateRange || currentPeriod === 0 ? ' disabled' : '') + '" data-period="compare" data-tooltip="' + t('compareToggle') + '"' + (customDateRange || currentPeriod === 0 ? ' disabled' : '') + '>⚖️</button>'
      + '</div>'
      + (rangeText ? '<div class="sidebar-period-range">' + rangeText + '</div>' : '');

    // Use unified shared tooltip for period buttons
    bindDelegatedTooltips(sidebarPeriod);

    // Bind period buttons
    const removePeriodTooltips = () => { hideSharedTooltip(_sharedTipTarget); };
    sidebarPeriod.querySelectorAll('.period-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePeriodTooltips();
        const val = btn.dataset.period;
        if (val === 'custom') {
          showCalendarPicker();
          return;
        }
        if (val === 'compare') {
          compareMode = !compareMode;
          localStorage.setItem('harness-compare', String(compareMode));
          renderSidebarPeriod();
          const scrollPos1 = content.scrollTop;
          skipScrollReset = true;
          renderContent();
          skipScrollReset = false;
          requestAnimationFrame(() => { content.scrollTop = scrollPos1; });
          return;
        }
        customDateRange = null;
        currentPeriod = parseInt(val);
        localStorage.setItem('harness-period', String(currentPeriod));
        renderSidebarPeriod();
        const scrollPos2 = content.scrollTop;
        skipScrollReset = true;
        renderContent();
        skipScrollReset = false;
        requestAnimationFrame(() => { content.scrollTop = scrollPos2; });
        // API mode: refetch usage for the new period and re-render on arrival.
        if (DATA._apiMode) {
          const range = computeCurrentPeriodRange();
          if (range) refetchUsage(range);
        }
      });
    });
  }

  // Legacy — no longer renders inline, returns empty string
  function renderPeriodFilter() { return ''; }

  function bindPeriodFilter() {
    // Period filter is now in sidebar, no content binding needed
  }

  // ── Calendar Picker ──
  function showCalendarPicker() {
    const existing = document.getElementById('calendar-overlay');
    if (existing) existing.remove();

    // The calendar reflects the FULL data range independent of the current
    // period. Seed with the current usage, and (below) fetch the all-time set so
    // days beyond the current period are shown and selectable too.
    recordActiveDays(currentScope, getUsage());
    const dataDays = _activeDaysByScope[currentScope] || (_activeDaysByScope[currentScope] = new Set());

    // Bounds re-read the accumulator on each render, so they widen once the
    // all-time set finishes loading.
    function computeBounds() {
      if (dataDays.size) {
        const sorted = [...dataDays].sort();
        const toLocal = (k) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
        return { min: toLocal(sorted[0]), max: toLocal(sorted[sorted.length - 1]) };
      }
      if (DATA._dateRange && DATA._dateRange.from && DATA._dateRange.to) {
        return { min: new Date(DATA._dateRange.from), max: new Date(DATA._dateRange.to) };
      }
      const dr = getDataDateRange();
      return { min: dr ? dr.start : new Date(2020, 0, 1), max: dr ? dr.end : new Date() };
    }
    let minDate = computeBounds().min, maxDate = computeBounds().max;

    // Initial highlighted range mirrors the CURRENT period (7d / 30d / all /
    // custom) so switching periods is reflected whenever the calendar reopens —
    // no stale range lingers. Day-boundary normalized.
    const _dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let selStart, selEnd;
    if (customDateRange) {
      selStart = _dayStart(customDateRange.start);
      selEnd = _dayStart(customDateRange.end);
    } else if (currentPeriod === 0) {
      selStart = new Date(minDate);
      selEnd = new Date(maxDate);
    } else {
      selEnd = new Date(maxDate);
      selStart = new Date(maxDate);
      selStart.setDate(selStart.getDate() - (currentPeriod - 1));
    }

    const viewMonth = new Date(selEnd.getFullYear(), selEnd.getMonth(), 1);
    let picking = 'start'; // 'start' or 'end'
    let tempStart = new Date(selStart);
    let tempEnd = new Date(selEnd);

    const overlay = document.createElement('div');
    overlay.id = 'calendar-overlay';
    overlay.className = 'calendar-overlay';

    function renderCalendar() {
      const b = computeBounds(); minDate = b.min; maxDate = b.max; // widen once all-time loads
      const year = viewMonth.getFullYear();
      const month = viewMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      const monthNames = t('monthNames').split(',');
      const dayNames = t('dayNamesShort').split(',');

      let html = '<div class="calendar-popup">'
        + '<div class="calendar-header-bar">'
        + '<button class="calendar-nav" data-dir="-1">◀</button>'
        + '<span class="calendar-month-label">' + year + ' ' + monthNames[month] + '</span>'
        + '<button class="calendar-nav" data-dir="1">▶</button>'
        + '</div>'
        + '<div class="calendar-range-display">'
        + '<span class="calendar-range-part' + (picking === 'start' ? ' picking' : '') + '" data-pick="start">' + formatDate(tempStart.toISOString()) + '</span>'
        + ' ~ '
        + '<span class="calendar-range-part' + (picking === 'end' ? ' picking' : '') + '" data-pick="end">' + formatDate(tempEnd.toISOString()) + '</span>'
        + '</div>'
        + '<div class="calendar-grid">';

      dayNames.forEach((d) => { html += '<div class="calendar-day-name">' + d + '</div>'; });

      for (let i = 0; i < firstDay; i++) { html += '<div class="calendar-cell empty"></div>'; }

      for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const cellKey = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const hasData = dataDays.has(cellKey);
        // Only days with activity are selectable as a range boundary (empty days
        // in between still fall inside a selected range visually).
        const isDisabled = !hasData;
        const isInRange = cellDate >= tempStart && cellDate <= tempEnd;
        const isStart = sameDay(cellDate, tempStart);
        const isEnd = sameDay(cellDate, tempEnd);
        let cls = 'calendar-cell';
        if (isDisabled) cls += ' disabled';
        if (hasData) cls += ' has-data';
        if (isInRange) cls += ' in-range';
        if (isStart) cls += ' range-start';
        if (isEnd) cls += ' range-end';
        html += '<div class="' + cls + '" data-date="' + cellKey + '">' + d + '</div>';
      }

      html += '</div>'
        + '<div class="calendar-actions">'
        + '<button class="calendar-btn cancel">' + t('calendarCancel') + '</button>'
        + '<button class="calendar-btn apply">' + t('calendarApply') + '</button>'
        + '</div>'
        + '</div>';

      overlay.innerHTML = html;
    }

    function sameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    renderCalendar();
    document.body.appendChild(overlay);

    // Load the full-history active-days set (independent of the current period)
    // and re-render so bounds/markers cover every month, not just the loaded one.
    ensureAllActiveDays(currentScope).then((added) => {
      if (added && document.body.contains(overlay)) renderCalendar();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); return; }

      const nav = e.target.closest('.calendar-nav');
      if (nav) {
        const dir = parseInt(nav.dataset.dir);
        viewMonth.setMonth(viewMonth.getMonth() + dir);
        renderCalendar();
        return;
      }

      const pickPart = e.target.closest('[data-pick]');
      if (pickPart) {
        picking = pickPart.dataset.pick;
        renderCalendar();
        return;
      }

      const cell = e.target.closest('.calendar-cell[data-date]');
      if (cell && !cell.classList.contains('disabled')) {
        const parts = cell.dataset.date.split('-');
        const clickedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (picking === 'start') {
          tempStart = clickedDate;
          if (tempStart > tempEnd) tempEnd = new Date(tempStart);
          picking = 'end';
        } else {
          tempEnd = clickedDate;
          if (tempEnd < tempStart) tempStart = new Date(tempEnd);
        }
        renderCalendar();
        return;
      }

      if (e.target.closest('.calendar-btn.cancel')) {
        overlay.remove();
        return;
      }

      if (e.target.closest('.calendar-btn.apply')) {
        customDateRange = { start: tempStart, end: new Date(tempEnd.getFullYear(), tempEnd.getMonth(), tempEnd.getDate(), 23, 59, 59) };
        currentPeriod = -1;
        localStorage.setItem('harness-period', String(currentPeriod));
        overlay.remove();
        renderSidebarPeriod();
        const scrollPosCal = content.scrollTop;
        skipScrollReset = true;
        renderContent();
        skipScrollReset = false;
        requestAnimationFrame(() => { content.scrollTop = scrollPosCal; });
        // API mode: refetch usage for the custom range.
        if (DATA._apiMode) {
          const range = computeCurrentPeriodRange();
          if (range) refetchUsage(range);
        }
        return;
      }
    });
  }

  // ── Tokens page ──
  function calcTokenChange(entries, days, sumFn) {
    if ((days === 0 && !customDateRange) || customDateRange) return null;
    let now = new Date();
    let curStart = new Date(now); curStart.setDate(curStart.getDate() - (days - 1)); curStart.setHours(0, 0, 0, 0);
    let prevStart = new Date(curStart); prevStart.setDate(prevStart.getDate() - days);
    let cur = 0, prev = 0;
    entries.forEach((e) => {
      let d = new Date(e.timestamp);
      if (d >= curStart) cur += sumFn(e);
      else if (d >= prevStart && d < curStart) prev += sumFn(e);
    });
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  }

  function renderTokensPage() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const allTokenEntries = usage.tokenEntries || [];
    const tokenEntries = filterByPeriod(allTokenEntries, 'timestamp', days);

    // Totals
    let totalInput = 0, totalOutput = 0, totalCache = 0;
    tokenEntries.forEach((e) => {
      totalInput += e.rawInput || 0;
      totalOutput += e.outputTokens || 0;
      totalCache += (e.cacheRead || 0) + (e.cacheCreation || 0);
    });
    const totalAll = totalInput + totalOutput + totalCache;

    const changeAll = calcTokenChange(allTokenEntries, days, (e) => (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0));
    const changeInput = calcTokenChange(allTokenEntries, days, (e) => e.rawInput || 0);
    const changeOutput = calcTokenChange(allTokenEntries, days, (e) => e.outputTokens || 0);
    const changeCache = calcTokenChange(allTokenEntries, days, (e) => (e.cacheRead || 0) + (e.cacheCreation || 0));

    // Compare mode
    const canCompare = compareMode && !customDateRange && days > 0;
    let prevTokenEntries = [];
    let prevInput = 0, prevOutput = 0, prevCache = 0, prevAll = 0;
    if (canCompare) {
      const now = new Date();
      const curStart = new Date(now); curStart.setDate(curStart.getDate() - (days - 1)); curStart.setHours(0, 0, 0, 0);
      const prevStart = new Date(curStart); prevStart.setDate(prevStart.getDate() - days);
      prevTokenEntries = allTokenEntries.filter((e) => { const d = new Date(e.timestamp); return d >= prevStart && d < curStart; });
      prevTokenEntries.forEach((e) => { prevInput += e.rawInput || 0; prevOutput += e.outputTokens || 0; prevCache += (e.cacheRead || 0) + (e.cacheCreation || 0); });
      prevAll = prevInput + prevOutput + prevCache;
    }

    let html = '<div class="page-header">'
      + '<div class="page-header-row"><h1>🪙 ' + t('tokensTitle') + '</h1>' + renderExportButtons() + '</div>'
      + '<div class="page-desc">' + t('tokensDesc') + '</div>'
      + '</div>'
      + renderPeriodFilter()
      + '<div class="overview-hero solo">'
      + renderBarCard({
          titleKey: 'totalTokens',
          total: totalAll,
          totalChange: changeAll,
          labelWidth: 60,
          rows: [
            { label: t('labelInput'),  value: totalInput,  change: changeInput,  color: '#4263eb' },
            { label: t('labelOutput'), value: totalOutput, change: changeOutput, color: '#0ca678' },
            { label: t('labelCache'),  value: totalCache,  change: changeCache,  color: '#e8590c' },
          ],
        })
      + '</div>';

    // Model map
    const modelMapForInsights = {};
    tokenEntries.forEach((e) => {
      const short = (e.model || 'unknown').replace(/^claude-/, '').replace(/-\d{8,}$/, '');
      if (!modelMapForInsights[short]) modelMapForInsights[short] = { input: 0, output: 0, cache: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
      modelMapForInsights[short].input += e.rawInput || 0;
      modelMapForInsights[short].output += e.outputTokens || 0;
      modelMapForInsights[short].cache += (e.cacheRead || 0) + (e.cacheCreation || 0);
      modelMapForInsights[short].cost += calcEntryCost(e);
    });

    // Charts: donut + trend
    html += '<div class="chart-row">'
      + '<div class="section chart-section chart-section-small">'
      + '<div class="section-title">' + t('modelDist') + '</div>'
      + '<div class="card chart-card"><div id="token-model-donut"></div></div>'
      + '</div>'
      + '<div class="section chart-section">'
      + '<div class="section-title">' + t('tokenTrend') + '</div>'
      + '<div class="card chart-card"><div id="token-trend-chart" style="padding-top:10px"></div></div>'
      + '</div>'
      + '</div>';

    // Heatmap
    const tokenActivityMap = buildActivityMap(tokenEntries, (e) => (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0));
    html += '<div class="section">'
      + '<div class="section-title">' + t('tokenActivity') + ' <span class="section-title-sub">' + t('tokenActivityDesc') + '</span></div>'
      + renderHeatmapFromMap(tokenActivityMap, days, t('tokenUnit'), true)
      + '</div>';

    // Task categories + Tool context (moved from analysis)
    const taskCatMapping = (DATA.taskCategories && DATA.taskCategories.mapping) || {};
    const taskCatMeta = (DATA.taskCategories && DATA.taskCategories.meta) || {};
    const taskCatMap = {};
    tokenEntries.forEach((e) => {
      const name = e.contextName || 'conversation';
      const catKey = taskCatMapping[name] || 'other';
      if (!taskCatMap[catKey]) taskCatMap[catKey] = { tokens: 0, count: 0 };
      taskCatMap[catKey].tokens += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      taskCatMap[catKey].count += 1;
    });
    const taskCatEntries = Object.entries(taskCatMap).sort((a, b) => b[1].tokens - a[1].tokens);

    const contextMap = {};
    tokenEntries.forEach((e) => {
      const ctx = e.contextName || 'conversation';
      if (!contextMap[ctx]) contextMap[ctx] = { tokens: 0, count: 0 };
      contextMap[ctx].tokens += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      contextMap[ctx].count += 1;
    });
    const contextEntries = Object.entries(contextMap).sort((a, b) => b[1].tokens - a[1].tokens).slice(0, 10);

    html += '<div class="chart-row">'
      + '<div class="section chart-section">'
      + '<div class="section-title">' + t('taskCategory') + '</div>'
      + '<div class="section-subtitle">' + t('taskCategoryDesc') + '</div>'
      + '<div class="card chart-card"><div id="task-cat-bar"></div></div>'
      + '</div>'
      + '<div class="section chart-section">'
      + '<div class="section-title">' + t('tokenByContext') + '</div>'
      + '<div class="section-subtitle">' + t('tokenByContextDesc') + '</div>'
      + '<div class="card chart-card"><div id="tool-ctx-bar"></div></div>'
      + '</div>'
      + '</div>';

    // Model breakdown table
    const modelEntries = Object.entries(modelMapForInsights).sort((a, b) => (b[1].input + b[1].output + b[1].cache) - (a[1].input + a[1].output + a[1].cache));
    if (modelEntries.length > 0) {
      html += '<div class="section"><div class="section-title">' + t('tokenByModel') + '</div>'
        + '<div class="card" style="padding:16px;overflow-x:auto"><table class="config-table" style="width:100%">'
        + '<thead><tr><th>Model</th><th style="text-align:right">Input</th><th style="text-align:right">Output</th><th style="text-align:right">Cache</th><th style="text-align:right">Total</th><th style="text-align:right">' + t('estimatedCost') + '</th></tr></thead><tbody>';
      let tableTotalCost = 0;
      modelEntries.forEach((entry) => {
        const d = entry[1], tot = d.input + d.output + d.cache;
        tableTotalCost += d.cost || 0;
        html += '<tr><td><strong>' + escapeHtml(entry[0]) + '</strong></td>'
          + '<td style="text-align:right">' + fmtCompact(d.input) + '</td>'
          + '<td style="text-align:right">' + fmtCompact(d.output) + '</td>'
          + '<td style="text-align:right">' + fmtCompact(d.cache) + '</td>'
          + '<td style="text-align:right"><strong>' + fmtCompact(tot) + '</strong></td>'
          + '<td style="text-align:right">' + fmtCost(d.cost || 0) + '</td></tr>';
      });
      html += '<tr style="border-top:2px solid var(--border)"><td colspan="5" style="text-align:right"><strong>Total</strong></td>'
        + '<td style="text-align:right"><strong>' + fmtCost(tableTotalCost) + '</strong></td></tr>';
      html += '</tbody></table></div></div>';
    }

    // Per-machine breakdown — only shown when usage from more than one machine
    // is present (after a cross-machine import via `node scripts/db.mjs --import`).
    const machineMap = {};
    tokenEntries.forEach((e) => {
      const m = e.machine || '';
      if (!machineMap[m]) machineMap[m] = { tokens: 0, calls: 0, cost: 0 };
      machineMap[m].tokens += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      machineMap[m].calls += 1;
      machineMap[m].cost += calcEntryCost(e);
    });
    const machineEntries = Object.entries(machineMap).sort((a, b) => b[1].tokens - a[1].tokens);
    if (machineEntries.length > 1) {
      html += '<div class="section"><div class="section-title">' + t('machinesTitle')
        + ' <span class="section-title-sub">' + t('machinesCount').replace('{n}', String(machineEntries.length)) + '</span></div>'
        + '<div class="section-subtitle">' + t('machinesDesc') + '</div>'
        + '<div class="card" style="padding:16px;overflow-x:auto"><table class="config-table" style="width:100%">'
        + '<thead><tr><th>' + t('machineLabel') + '</th>'
        + '<th style="text-align:right">' + t('machineCalls') + '</th>'
        + '<th style="text-align:right">' + t('totalTokens') + '</th>'
        + '<th style="text-align:right">' + t('estimatedCost') + '</th></tr></thead><tbody>';
      machineEntries.forEach((entry) => {
        const label = entry[0] || t('machineUnknown');
        const d = entry[1];
        html += '<tr><td><strong>' + escapeHtml(label) + '</strong></td>'
          + '<td style="text-align:right">' + fmtCompact(d.calls) + '</td>'
          + '<td style="text-align:right">' + fmtCompact(d.tokens) + '</td>'
          + '<td style="text-align:right">' + fmtCost(d.cost) + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }

    // Insights
    html += renderTokenInsights(tokenEntries, modelMapForInsights, days);

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';
    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();
    drawTokenTrendChart(tokenEntries, days, canCompare ? prevTokenEntries : null);
    drawTokenModelDonut(modelMapForInsights);
    drawRotatedBar('#task-cat-bar', taskCatEntries.map((e) => {
      const meta = taskCatMeta[e[0]] || taskCatMeta['other'] || { icon: '📦', label: e[0] };
      return { label: meta.icon + ' ' + (meta.label || e[0]), value: e[1].tokens };
    }));
    drawRotatedBar('#tool-ctx-bar', contextEntries.map((e) => ({ label: e[0], value: e[1].tokens })));
  }

  // ── Tokens Analysis sub-page ──

  // ── Tokens: Cost sub-page ──
  function renderTokensCost() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const allTokenEntries = usage.tokenEntries || [];
    const tokenEntries = filterByPeriod(allTokenEntries, 'timestamp', days);

    const canCompare = compareMode && !customDateRange && days > 0;
    let prevCost = 0;
    if (canCompare) {
      const now = new Date();
      const curStart = new Date(now); curStart.setDate(curStart.getDate() - (days - 1)); curStart.setHours(0, 0, 0, 0);
      const prevStart = new Date(curStart); prevStart.setDate(prevStart.getDate() - days);
      allTokenEntries.forEach((e) => { const d = new Date(e.timestamp); if (d >= prevStart && d < curStart) prevCost += calcEntryCost(e); });
    }

    let totalCost = 0, inputCost = 0, outputCost = 0, cacheCost = 0;
    const costDailyMap = {};
    tokenEntries.forEach((e) => {
      const key = resolvePricingKey(e.model);
      const cost = calcEntryCost(e);
      totalCost += cost;
      if (key) {
        const p = MODEL_PRICING[key];
        inputCost += (e.rawInput || 0) * p.input / 1e6;
        outputCost += (e.outputTokens || 0) * p.output / 1e6;
        cacheCost += ((e.cacheRead || 0) * p.cacheRead + (e.cacheCreation || 0) * p.cacheCreation) / 1e6;
      }
      const d = typeof e.timestamp === 'number' ? new Date(e.timestamp) : new Date(e.timestamp);
      const dk = d.toISOString().substring(0, 10);
      if (dk) costDailyMap[dk] = (costDailyMap[dk] || 0) + cost;
    });
    const changeCost       = calcTokenChange(allTokenEntries, days, (e) => calcEntryCost(e));
    const changeInputCost  = calcTokenChange(allTokenEntries, days, (e) => { const k = resolvePricingKey(e.model); return k ? (e.rawInput || 0) * MODEL_PRICING[k].input / 1e6 : 0; });
    const changeOutputCost = calcTokenChange(allTokenEntries, days, (e) => { const k = resolvePricingKey(e.model); return k ? (e.outputTokens || 0) * MODEL_PRICING[k].output / 1e6 : 0; });
    const changeCacheCost  = calcTokenChange(allTokenEntries, days, (e) => { const k = resolvePricingKey(e.model); return k ? ((e.cacheRead || 0) * MODEL_PRICING[k].cacheRead + (e.cacheCreation || 0) * MODEL_PRICING[k].cacheCreation) / 1e6 : 0; });

    let html = '<div class="page-header"><div class="page-header-row"><h1>💰 ' + t('tokensCost') + '</h1>' + renderExportButtons() + '</div></div>'
      + renderPeriodFilter()
      + '<div class="overview-hero solo">'
      + renderBarCard({
          titleKey: 'totalCost',
          total: totalCost,
          totalChange: changeCost,
          totalFmt: fmtCost,
          valueFmt: fmtCost,
          labelWidth: 60,
          rows: [
            { label: t('labelInput'),  value: inputCost,  change: changeInputCost,  color: '#4263eb' },
            { label: t('labelOutput'), value: outputCost, change: changeOutputCost, color: '#0ca678' },
            { label: t('labelCache'),  value: cacheCost,  change: changeCacheCost,  color: '#e8590c' },
          ],
        })
      + '</div>';

    // Budget
    html += renderBudgetSection(costDailyMap);

    // Cost trend charts
    html += '<div class="section">'
      + '<div class="section-title">' + t('costTrend') + '</div>'
      + '<div class="cost-trend-grid">'
      + '<div class="card chart-card"><div class="cost-trend-label">' + t('budgetDaily') + '</div><div id="cost-trend-daily"></div></div>'
      + '<div class="card chart-card"><div class="cost-trend-label">' + t('budgetWeekly') + '</div><div id="cost-trend-weekly"></div></div>'
      + '<div class="card chart-card"><div class="cost-trend-label">' + t('budgetMonthly') + '</div><div id="cost-trend-monthly"></div></div>'
      + '</div></div>';

    // Cost formula
    html += '<div class="section"><div class="section-title">' + t('costFormula') + '</div>'
      + '<div class="card" style="padding:16px;overflow-x:auto">'
      + '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">' + t(scopeProvider(currentScope) === 'codex' ? 'costFormulaDescCodex' : 'costFormulaDesc') + '</div>'
      + '<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-family:monospace;line-height:1.8">' + t('costFormulaDetail') + '</div>'
      + '<details><summary style="cursor:pointer;font-size:13px;font-weight:600;margin-bottom:8px">' + t('costPricingTable') + '</summary>'
      + '<table class="config-table" style="width:100%;margin-top:8px">'
      + '<thead><tr><th>Model</th><th style="text-align:right">Input</th><th style="text-align:right">Output</th><th style="text-align:right">Cache Read</th><th style="text-align:right">Cache Write</th></tr></thead><tbody>';
    // Show only the active tool's rate table (Codex → GPT rates, Claude → Claude rates).
    const _costProvider = scopeProvider(currentScope);
    Object.entries(MODEL_PRICING).filter((entry) => pricingKeyProvider(entry[0]) === _costProvider).forEach((entry) => {
      const p = entry[1];
      html += '<tr><td><strong>' + entry[0] + '</strong></td>'
        + '<td style="text-align:right">$' + p.input + '</td><td style="text-align:right">$' + p.output + '</td>'
        + '<td style="text-align:right">$' + p.cacheRead + '</td><td style="text-align:right">$' + p.cacheCreation + '</td></tr>';
    });
    const _priceSrc = _costProvider === 'codex'
      ? { url: 'https://developers.openai.com/api/docs/pricing', label: 'openai.com/pricing' }
      : { url: 'https://www.anthropic.com/pricing', label: 'anthropic.com/pricing' };
    html += '</tbody></table>'
      + '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">'
      + t('costPricingUnit') + ' · <a href="' + _priceSrc.url + '" target="_blank" style="color:var(--accent)">' + _priceSrc.label + '</a>'
      + '</div></details>';
    // Codex prices are always omh's built-in table (omh only fetches Claude
    // pricing), so the "fetched at {date}" note never applies to Codex.
    if (_costProvider === 'codex') {
      html += '<div style="margin-top:8px;font-size:11px;color:var(--accent)">'
        + t('costPricingFallbackCodex')
        + '</div>';
    } else if (DATA.pricingFetchedAt) {
      html += '<div style="margin-top:8px;font-size:11px;color:var(--accent)">'
        + t('costPricingFetchedAt').replace('{date}', formatDate(DATA.pricingFetchedAt))
        + '</div>';
    } else {
      html += '<div style="margin-top:8px;font-size:11px;color:var(--accent)">'
        + t('costPricingFallback')
        + '</div>';
    }
    html += '</div></div>';

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';
    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();
    bindBudgetActions();
    drawCostTrendCharts(costDailyMap, days);
  }

  // ── Tokens: Cache sub-page ──
  // Hit ratio formula: cacheRead / (cacheRead + cacheCreation + rawInput).
  // Same denominator as the Prompt page's cache composition — the share of
  // all input-side tokens served from the prompt cache.
  function cacheHitRatioPct(read, write, fresh) {
    const denom = read + write + fresh;
    return denom > 0 ? Math.round((read / denom) * 100) : 0;
  }

  // Estimated cost avoided by the prompt cache vs. sending everything as
  // fresh input: reads are billed at 0.1× the input rate (saves 0.9×),
  // writes at 1.25× (costs an extra 0.25×). Uses per-model pricing.
  function calcEntryCacheSavings(e) {
    const key = resolvePricingKey(e.model);
    if (!key) return 0;
    const p = MODEL_PRICING[key];
    return ((e.cacheRead || 0) * (p.input - p.cacheRead)
      - (e.cacheCreation || 0) * (p.cacheCreation - p.input)) / 1e6;
  }

  function renderTokensCache() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const allTokenEntries = usage.tokenEntries || [];
    const tokenEntries = filterByPeriod(allTokenEntries, 'timestamp', days);

    let totalRead = 0, totalWrite = 0, totalFresh = 0, totalSavings = 0;
    tokenEntries.forEach((e) => {
      totalRead += e.cacheRead || 0;
      totalWrite += e.cacheCreation || 0;
      totalFresh += e.rawInput || 0;
      totalSavings += calcEntryCacheSavings(e);
    });
    const hitPct = cacheHitRatioPct(totalRead, totalWrite, totalFresh);
    const changeRead = calcTokenChange(allTokenEntries, days, (e) => e.cacheRead || 0);
    const changeWrite = calcTokenChange(allTokenEntries, days, (e) => e.cacheCreation || 0);
    const savingsStr = (totalSavings < 0 ? '-' : '') + fmtCost(Math.abs(totalSavings));

    let html = '<div class="page-header"><h1>♻️ ' + t('tokensCache') + '</h1>'
      + '<div class="page-desc">' + t('cachePageDesc') + '</div></div>'
      + renderPeriodFilter();

    // Headline metrics
    html += '<div class="section"><div class="section-title">' + t('cacheEfficiency')
      + ' <span class="section-title-sub">' + t('cacheFormulaNote') + '</span></div>'
      + '<div class="card-grid">'
      + statCard(t('cacheHitRate'), hitPct + '%', null, { raw: true, note: t('cacheFormulaNote') })
      + statCard(t('cacheRead'), totalRead, changeRead, { si: true })
      + statCard(t('cacheWrite'), totalWrite, changeWrite, { si: true })
      + statCard(t('cacheEstSavings'), savingsStr, null, { raw: true, valueColor: totalSavings >= 0 ? '#0ca678' : '#ef4444', note: t('cacheEstSavingsNote') })
      + '</div></div>';

    // Daily trend: read/write areas + hit-ratio overlay
    html += '<div class="section"><div class="section-title">' + t('cacheTrendTitle')
      + ' <span class="section-title-sub">' + t('cacheTrendDesc') + '</span></div>'
      + '<div class="card chart-card"><div id="cache-trend-chart" style="padding-top:10px"></div></div>'
      + '</div>';

    // Hour-of-day efficiency
    html += '<div class="section"><div class="section-title">' + t('cacheHourlyTitle')
      + ' <span class="section-title-sub">' + t('cacheHourlyDesc') + '</span></div>'
      + '<div class="card chart-card"><div id="cache-hourly-chart"></div></div>'
      + '</div>';

    // Per-workspace breakdown, sorted by cache volume
    const scopeRows = [];
    (DATA.scopes || []).forEach((s) => {
      const su = (DATA.scopeData[s.id] && DATA.scopeData[s.id].usage) || {};
      const entries = filterByPeriod(su.tokenEntries || [], 'timestamp', days);
      let read = 0, write = 0, fresh = 0, savings = 0;
      entries.forEach((e) => {
        read += e.cacheRead || 0;
        write += e.cacheCreation || 0;
        fresh += e.rawInput || 0;
        savings += calcEntryCacheSavings(e);
      });
      if (read + write + fresh === 0) return;
      scopeRows.push({ id: s.id, label: s.label, read, write, fresh, savings, hit: cacheHitRatioPct(read, write, fresh) });
    });
    scopeRows.sort((a, b) => (b.read + b.write) - (a.read + a.write));

    if (scopeRows.length > 0) {
      html += '<div class="section"><div class="section-title">' + t('cacheByProjectTitle')
        + ' <span class="section-title-sub">' + t('cacheByProjectDesc') + '</span></div>'
        + '<div class="card" style="padding:16px;overflow-x:auto"><table class="config-table" style="width:100%">'
        + '<thead><tr><th>' + t('cacheColWorkspace') + '</th>'
        + '<th style="text-align:right">' + t('cacheRead') + '</th>'
        + '<th style="text-align:right">' + t('cacheWrite') + '</th>'
        + '<th style="text-align:right">' + t('freshInput') + '</th>'
        + '<th style="text-align:right">' + t('cacheHitRate') + '</th>'
        + '<th style="text-align:right">' + t('cacheEstSavings') + '</th></tr></thead><tbody>';
      scopeRows.forEach((r) => {
        const rowSavings = (r.savings < 0 ? '-' : '') + fmtCost(Math.abs(r.savings));
        html += '<tr>'
          + '<td><strong>' + escapeHtml(r.label) + '</strong>' + (r.id === currentScope ? ' <span class="badge">' + t('cacheCurrentScope') + '</span>' : '') + '</td>'
          + '<td style="text-align:right">' + fmtCompact(r.read) + '</td>'
          + '<td style="text-align:right">' + fmtCompact(r.write) + '</td>'
          + '<td style="text-align:right">' + fmtCompact(r.fresh) + '</td>'
          + '<td style="text-align:right"><strong>' + r.hit + '%</strong></td>'
          + '<td style="text-align:right">' + rowSavings + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';
    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();
    drawCacheTrendChart(tokenEntries, days);
    drawCacheHourlyChart(tokenEntries);
  }

  // Daily cache read/write tokens (area) with hit-ratio % overlay (line, y2)
  function drawCacheTrendChart(tokenEntries, days) {
    const el = document.getElementById('cache-trend-chart');
    if (!el) return;
    if (tokenEntries.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#6c757d;padding:40px 0;font-size:13px">' + t('noUsageData') + '</div>';
      return;
    }

    let numDays, endDate;
    if (customDateRange) {
      numDays = Math.ceil((customDateRange.end - customDateRange.start) / 86400000) + 1;
      endDate = customDateRange.end;
    } else if (days === 0) {
      const dataRange = getDataDateRange();
      if (dataRange) {
        const startDay = new Date(dataRange.start.getFullYear(), dataRange.start.getMonth(), dataRange.start.getDate());
        const endDay = new Date(dataRange.end.getFullYear(), dataRange.end.getMonth(), dataRange.end.getDate());
        endDate = endDay;
        numDays = Math.round((endDay - startDay) / 86400000) + 1;
      } else {
        numDays = 90;
        endDate = new Date();
      }
    } else {
      numDays = days;
      endDate = new Date();
    }

    const daily = {};
    const dateLabels = ['x'];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - (numDays - 1 - i));
      const key = dateKey(d);
      daily[key] = { read: 0, write: 0, fresh: 0 };
      dateLabels.push(key);
    }
    tokenEntries.forEach((e) => {
      const ts = e.timestamp;
      const key = typeof ts === 'string' ? ts.substring(0, 10) : typeof ts === 'number' ? new Date(ts).toISOString().substring(0, 10) : '';
      if (daily.hasOwnProperty(key)) {
        daily[key].read += e.cacheRead || 0;
        daily[key].write += e.cacheCreation || 0;
        daily[key].fresh += e.rawInput || 0;
      }
    });

    const readKey = t('cacheRead'), writeKey = t('cacheWrite'), ratioKey = t('cacheEfficiencyUnit');
    const readData = [readKey], writeData = [writeKey], ratioData = [ratioKey];
    for (let j = 1; j < dateLabels.length; j++) {
      const d = daily[dateLabels[j]];
      readData.push(d.read);
      writeData.push(d.write);
      ratioData.push(cacheHitRatioPct(d.read, d.write, d.fresh));
    }

    makeChart({
      bindto: '#cache-trend-chart',
      data: {
        x: 'x',
        columns: [dateLabels, readData, writeData, ratioData],
        types: { [readKey]: 'area', [writeKey]: 'area', [ratioKey]: 'line' },
        axes: { [ratioKey]: 'y2' },
        colors: { [readKey]: '#4263eb', [writeKey]: '#e8590c', [ratioKey]: '#0ca678' },
      },
      axis: {
        x: { type: 'timeseries', tick: { format: '%m-%d', count: 6, outer: false, text: { inner: true } } },
        y: { min: 0, padding: { bottom: 0 }, tick: { count: 5, format: (v) => fmtCompact(v) } },
        y2: {
          show: true,
          min: 0, max: 100,
          padding: { bottom: 0, top: 0 },
          label: { text: t('cacheEfficiencyUnit'), position: 'outer-middle' },
          tick: { count: 5, format: (v) => +v.toFixed(0) + '%' },
        },
      },
      point: { r: 3, focus: { only: true } },
      legend: { show: true },
      area: { linearGradient: true },
      size: { height: 260 },
      tooltip: { format: { title: fmtChartTooltipTitle, value: (v, ratio, id) => id === ratioKey ? v + '%' : fmtCompact(v) } },
    });
  }

  // Hit ratio % per hour of day — reveals whether work bursts stay within
  // the 5-minute cache TTL (warm cache) or scatter across the day (cold).
  function drawCacheHourlyChart(tokenEntries) {
    const el = document.getElementById('cache-hourly-chart');
    if (!el) return;
    if (tokenEntries.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#6c757d;padding:40px 0;font-size:13px">' + t('noUsageData') + '</div>';
      return;
    }

    const hours = Array.from({ length: 24 }, () => ({ read: 0, write: 0, fresh: 0 }));
    tokenEntries.forEach((e) => {
      const d = typeof e.timestamp === 'number' ? new Date(e.timestamp) : new Date(e.timestamp);
      if (!isNaN(d.getTime())) {
        const h = hours[d.getHours()];
        h.read += e.cacheRead || 0;
        h.write += e.cacheCreation || 0;
        h.fresh += e.rawInput || 0;
      }
    });
    const hourRatio = hours.map((h) => cacheHitRatioPct(h.read, h.write, h.fresh));

    const categories = Array.from({ length: 24 }, (_, i) => i + t('unitHourSuffix'));
    makeChart({
      bindto: '#cache-hourly-chart',
      data: {
        columns: [[t('cacheHitRate')].concat(hourRatio)],
        type: 'bar',
        color: (color, d) => {
          const v = hourRatio[d.index] || 0;
          return v > 70 ? '#087f5b' : v > 40 ? '#0ca678' : '#40a583';
        },
      },
      axis: {
        x: { type: 'category', categories: categories, tick: { outer: false } },
        y: { min: 0, max: 100, padding: { bottom: 0, top: 0 }, tick: { count: 5, format: (v) => +v.toFixed(0) + '%' } },
      },
      bar: { width: { ratio: 0.7 } },
      legend: { show: false },
      tooltip: {
        format: {
          value: (v, ratio, id, index) => {
            const h = hours[index];
            return v + '% (' + fmtCompact(h.read) + ' / ' + fmtCompact(h.read + h.write + h.fresh) + ')';
          },
        },
      },
      size: { height: 200 },
    });
  }

  // ── Tokens: Prompt sub-page ──
  function renderTokensPrompt() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const allPromptEntries = usage.promptStats || [];
    const tokenEntries = filterByPeriod(usage.tokenEntries || [], 'timestamp', days);
    const promptEntries = filterByPeriod(allPromptEntries, 'timestamp', days);

    let html = '<div class="page-header"><h1>💬 ' + t('tokensPrompt') + '</h1></div>'
      + renderPeriodFilter();

    // Prompt statistics
    if (promptEntries.length > 0) {
      const totalPrompts = promptEntries.length;
      const shortCount = promptEntries.filter((p) => p.charLen <= 100).length;
      const longCount = promptEntries.filter((p) => p.charLen >= 500).length;
      const mediumCount = totalPrompts - shortCount - longCount;
      const changeShort  = calcTokenChange(allPromptEntries, days, (p) => p.charLen <= 100 ? 1 : 0);
      const changeMedium = calcTokenChange(allPromptEntries, days, (p) => p.charLen > 100 && p.charLen < 500 ? 1 : 0);
      const changeLong   = calcTokenChange(allPromptEntries, days, (p) => p.charLen >= 500 ? 1 : 0);

      html += '<div class="overview-hero solo">'
        + renderBarCard({
            titleKey: 'totalPrompts',
            total: totalPrompts,
            labelWidth: 56,
            summaryHtml: '<span><span class="usage-bar-summary-dot" style="background:#4263eb"></span>' + t('shortPrompts') + '</span>'
              + '<span><span class="usage-bar-summary-dot" style="background:#0ca678"></span>' + t('mediumPrompts') + '</span>'
              + '<span><span class="usage-bar-summary-dot" style="background:#e8590c"></span>' + t('longPrompts') + '</span>',
            rows: [
              { label: t('labelShort'),  value: shortCount,  change: changeShort,  color: '#4263eb' },
              { label: t('labelMedium'), value: mediumCount, change: changeMedium, color: '#0ca678' },
              { label: t('labelLong'),   value: longCount,   change: changeLong,   color: '#e8590c' },
            ],
          })
        + '</div>';
    }

    // Response latency
    const latencyEntries = filterByPeriod(usage.latencyEntries || [], 'timestamp', days);
    if (latencyEntries.length > 0) {
      const latencies = latencyEntries.map((e) => e.latencyMs).sort((a, b) => a - b);
      const avg = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
      const median = latencies[Math.floor(latencies.length / 2)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const max = latencies[latencies.length - 1];
        html += '<div class="section"><div class="section-title">' + t('responseLatency') + ' <span class="section-title-sub">' + t('responseLatencyDesc') + '</span></div>'
        + '<div class="card-grid">'
        + statCard(t('avgLatency'), fmtMs(avg), null)
        + statCard(t('medianLatency'), fmtMs(median), null)
        + statCard(t('p95Latency'), fmtMs(p95), null)
        + statCard(t('maxLatency'), fmtMs(max), null)
        + '</div></div>';
    }

    // Hourly distribution
    html += '<div class="section">'
      + '<div class="section-title">' + t('hourlyDist') + ' <span class="section-title-sub">' + t('hourlyDistDesc') + '</span></div>'
      + '<div class="card chart-card"><div id="hourly-dist-chart"></div></div>'
      + '</div>';

    // Cache efficiency
    const sessionMap = {};
    tokenEntries.forEach((e) => {
      const sid = e.sessionId || '_unknown';
      if (!sessionMap[sid]) sessionMap[sid] = { count: 0 };
      sessionMap[sid].count += 1;
    });
    let totalRawInput = 0, totalCacheRead = 0, totalCacheCreation = 0;
    tokenEntries.forEach((e) => {
      totalRawInput += e.rawInput || 0;
      totalCacheRead += e.cacheRead || 0;
      totalCacheCreation += e.cacheCreation || 0;
    });
    const totalInputAll = totalRawInput + totalCacheRead + totalCacheCreation;
    if (totalInputAll > 0) {
      const hitRate = Math.round((totalCacheRead / totalInputAll) * 100);
      html += '<div class="section"><div class="section-title">' + t('cacheEfficiency') + ' <span class="section-title-sub">' + t('cacheEfficiencyDesc') + '</span></div>'
        + '<div class="card-grid">'
        + statCard(t('freshInput'), totalRawInput, null, { si: true, badge: Math.round((totalRawInput / totalInputAll) * 100) + '%' })
        + statCard(t('cacheRead'), totalCacheRead, null, { si: true, badge: Math.round((totalCacheRead / totalInputAll) * 100) + '%' })
        + statCard(t('cacheCreation'), totalCacheCreation, null, { si: true, badge: Math.round((totalCacheCreation / totalInputAll) * 100) + '%' })
        + statCard(t('cacheHitRate'), hitRate + '%', null)
        + '</div>';
      const cacheTips = buildCacheTips(tokenEntries, sessionMap, hitRate, totalRawInput, totalCacheRead, totalCacheCreation, totalInputAll);
      if (cacheTips.length > 0) {
        html += '<div class="insights-grid" style="margin-top:16px">';
        cacheTips.forEach((tip) => {
          html += '<div class="insight-card"><span class="insight-card-icon">' + tip.icon + '</span>'
            + '<div class="insight-card-body"><div class="insight-card-title">' + escapeHtml(tip.title) + '</div>'
            + '<div class="insight-card-detail">' + escapeHtml(tip.detail) + '</div></div></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }

    // Cache TTL Impact
    const { dailyCacheMap, sortedDates } = buildDailyCacheMap(tokenEntries);
    if (sortedDates.length >= 3) {
      const { bestEff, worstEff, bestEffPct, worstEffPct } = computeRollingEfficiency(dailyCacheMap, sortedDates);
      const { wasteCost } = computeWasteCost(
        { totalCacheRead, totalCacheCreation, bestEff },
        tokenEntries, MODEL_PRICING, resolvePricingKey
      );

      if (wasteCost > 0.001 || bestEff > 0) {
        html += '<div class="section"><div class="section-title">' + t('cacheTtlImpact')
          + ' <span class="section-title-sub">' + t('cacheTtlImpactDesc') + '</span></div>'
          + '<div class="card-grid">'
          + statCard(t('cacheBestEfficiency'), bestEffPct + '%', null, { raw: true, badge: t('cacheHitRate'), note: t('cacheBestEfficiencyNote') })
          + statCard(t('cacheWorstEfficiency'), worstEffPct + '%', null, { raw: true, valueColor: '#ef4444', badge: t('cacheHitRate'), note: t('cacheWorstEfficiencyNote') })
          + statCard(t('cacheWasteCost'), fmtCost(wasteCost), null, { raw: true, valueColor: '#ef4444', note: t('cacheWasteCostNote') })
          + '</div>'
          + '<div class="section-title" style="margin-top:16px">' + t('cacheEfficiencyTrend')
          + ' <span class="section-title-sub">' + t('cacheEfficiencyTrendDesc') + '</span></div>'
          + '<div class="card chart-card"><div id="cache-efficiency-chart"></div></div>'
          + '</div>';
      }
    }

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';
    content.innerHTML = html;
    bindContentActions();
    drawHourlyDistChart(tokenEntries);
    drawCacheEfficiencyChart(dailyCacheMap, sortedDates);
  }

  // ── Tokens: Session sub-page ──
  // Bookmark state — shared across session pages
  var _bmFilter = 'all'; // 'all' | 'starred' | tag name
  function _loadBm() { return loadBookmarks(localStorage.getItem('harness-bookmarks')); }
  function _saveBm(map) { localStorage.setItem('harness-bookmarks', saveBookmarks(map)); }

  // ── Session full-text search (#tokens-session) ──
  // Needs the serve.mjs HTTP API (/api/search) — rendered only in API mode.
  var _sessionSearchQuery = '';
  var _sessionSearchAbort = null;
  var _sessionSearchTimer = null;

  function renderSessionSearchBox() {
    return '<div class="card session-search-card">'
      + '<input type="search" id="session-search-input" class="session-search-input"'
      + ' placeholder="' + escapeHtml(t('sessionSearchPlaceholder')) + '"'
      + ' aria-label="' + escapeHtml(t('sessionSearchPlaceholder')) + '"'
      + ' value="' + escapeHtml(_sessionSearchQuery) + '">'
      + '<div id="session-search-results" class="session-search-results"></div>'
      + '</div>';
  }

  function bindSessionSearch() {
    var input = document.getElementById('session-search-input');
    if (!input) return;
    input.addEventListener('input', function () {
      _sessionSearchQuery = input.value;
      if (_sessionSearchTimer) clearTimeout(_sessionSearchTimer);
      _sessionSearchTimer = setTimeout(runSessionSearch, 250);
    });
    // Restore results when returning to the page with a previous query
    if (_sessionSearchQuery.trim()) runSessionSearch();
  }

  async function runSessionSearch() {
    var box = document.getElementById('session-search-results');
    if (!box) return;
    var q = _sessionSearchQuery.trim();
    if (!q) { box.innerHTML = ''; return; }
    if (_sessionSearchAbort) _sessionSearchAbort.abort();
    _sessionSearchAbort = new AbortController();
    try {
      var res = await fetch('/api/search?' + new URLSearchParams({ q: q, limit: '20' }), { signal: _sessionSearchAbort.signal });
      if (!res.ok) throw new Error('search returned ' + res.status);
      var data = await res.json();
      renderSessionSearchResults(box, data.results || []);
    } catch (e) {
      if (e.name === 'AbortError') return;
      box.innerHTML = '<div class="session-search-empty">' + t('sessionSearchError') + '</div>';
    }
  }

  function renderSessionSearchResults(box, results) {
    if (results.length === 0) {
      box.innerHTML = '<div class="session-search-empty">' + t('sessionSearchNoResults') + '</div>';
      return;
    }
    var html = '';
    results.forEach(function (r) {
      var scope = (DATA.scopes || []).find(function (s) { return s.id === r.scope; });
      var scopeLabel = scope ? scope.label : (r.scope || '');
      // Server marks matches with \u0001/\u0002 sentinels — escape HTML first,
      // then convert sentinels to <mark> so prompt content can never inject markup.
      var snippet = escapeHtml(r.snippet || '').replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
      var dateStr = r.timestamp ? formatDate(new Date(r.timestamp).toISOString()) : '';
      html += '<a class="session-search-result" href="#session/' + encodeURIComponent(r.sessionId) + '" data-session-id="' + escapeHtml(r.sessionId) + '">'
        + '<div class="session-search-result-meta">'
        + '<span>' + dateStr + '</span>'
        + '<span class="session-search-result-scope">' + escapeHtml(scopeLabel) + '</span>'
        + (r.matches > 1 ? '<span>' + t('sessionSearchMatches', fmtNum(r.matches)) + '</span>' : '')
        + '</div>'
        + '<div class="session-search-result-snippet">' + snippet + '</div>'
        + '</a>';
    });
    box.innerHTML = html;
    box.querySelectorAll('.session-search-result').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        currentView = 'session';
        currentSessionId = el.dataset.sessionId;
        currentDetail = null;
        expandedCategories._tokens = true;
        pushState(true);
        render();
      });
    });
  }

  function renderTokensSession() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const tokenEntries = filterByPeriod(usage.tokenEntries || [], 'timestamp', days);

    const sessionMap = {};
    tokenEntries.forEach((e) => {
      const sid = e.sessionId || '_unknown';
      if (!sessionMap[sid]) sessionMap[sid] = { count: 0, minTs: Infinity, maxTs: 0, totalTokens: 0, cost: 0, models: {} };
      const s = sessionMap[sid];
      s.count += 1;
      const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
      if (ts < s.minTs) s.minTs = ts;
      if (ts > s.maxTs) s.maxTs = ts;
      s.totalTokens += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      s.cost += calcEntryCost(e);
      const m = (e.model || 'unknown').replace(/^claude-/, '').replace(/-\d{8,}$/, '');
      s.models[m] = (s.models[m] || 0) + 1;
    });
    const sessions = Object.values(sessionMap).filter((s) => s.count > 1);
    const bmMap = _loadBm();

    let html = '<div class="page-header"><div class="page-header-row"><h1>📋 ' + t('tokensSession') + '</h1>' + renderExportButtons() + '</div></div>'
      + renderPeriodFilter();

    // Prompt search needs the serve.mjs API — hidden when not served (e.g. file://)
    if (DATA._apiMode) html += renderSessionSearchBox();

    if (sessions.length > 0) {
      const totalSessions = sessions.length;
      const shortSessions = sessions.filter((s) => s.count < 10).length;
      const longSessions = sessions.filter((s) => s.count > 30).length;
      const mediumSessions = totalSessions - shortSessions - longSessions;

      // Per-category change vs previous period
      function calcSessionCatChange(catFn) {
        if ((days === 0 && !customDateRange) || customDateRange) return null;
        const allEntries = usage.tokenEntries || [];
        const now = new Date();
        const curStart = new Date(now); curStart.setDate(curStart.getDate() - (days - 1)); curStart.setHours(0, 0, 0, 0);
        const prevStart = new Date(curStart); prevStart.setDate(prevStart.getDate() - days);
        const buildMap = (entries) => {
          const m = {};
          entries.forEach((e) => { const sid = e.sessionId || '_u'; if (!m[sid]) m[sid] = 0; m[sid]++; });
          return m;
        };
        const curMap  = buildMap(allEntries.filter((e) => new Date(e.timestamp) >= curStart));
        const prevMap = buildMap(allEntries.filter((e) => { const d = new Date(e.timestamp); return d >= prevStart && d < curStart; }));
        const cur  = Object.values(curMap).filter(catFn).length;
        const prev = Object.values(prevMap).filter(catFn).length;
        if (prev === 0) return cur > 0 ? 100 : 0;
        return Math.round(((cur - prev) / prev) * 100);
      }
      const changeShortSessions  = calcSessionCatChange((c) => c < 10);
      const changeMediumSessions = calcSessionCatChange((c) => c >= 10 && c <= 30);
      const changeLongSessions   = calcSessionCatChange((c) => c > 30);

      html += '<div class="overview-hero solo">'
        + renderBarCard({
            titleKey: 'totalSessions',
            total: totalSessions,
            labelWidth: 56,
            summaryHtml: '<span><span class="usage-bar-summary-dot" style="background:#4263eb"></span>' + t('shortSessions') + '</span>'
              + '<span><span class="usage-bar-summary-dot" style="background:#0ca678"></span>' + t('mediumSessions') + '</span>'
              + '<span><span class="usage-bar-summary-dot" style="background:#e8590c"></span>' + t('longSessions') + '</span>',
            rows: [
              { label: t('labelShort'),  value: shortSessions,  change: changeShortSessions,  color: '#4263eb' },
              { label: t('labelMedium'), value: mediumSessions, change: changeMediumSessions, color: '#0ca678' },
              { label: t('labelLong'),   value: longSessions,   change: changeLongSessions,   color: '#e8590c' },
            ],
          })
        + '</div>';

      // Bookmark filter bar
      var bmTags = allTags(bmMap);
      html += '<div class="bookmark-filter-bar" style="margin-top:12px">'
        + '<button class="bookmark-filter-btn' + (_bmFilter === 'all' ? ' active' : '') + '" data-action="filter-bookmarks" data-filter="all">' + t('bmFilterAll') + '</button>'
        + '<button class="bookmark-filter-btn' + (_bmFilter === 'starred' ? ' active' : '') + '" data-action="filter-bookmarks" data-filter="starred">' + t('bmFilterStarred') + '</button>';
      for (var ti = 0; ti < bmTags.length; ti++) {
        html += '<button class="bookmark-filter-btn' + (_bmFilter === bmTags[ti] ? ' active' : '') + '" data-action="filter-bookmarks" data-filter="' + escapeHtml(bmTags[ti]) + '">'
          + '<span class="bookmark-tag" style="border:0;background:none;padding:0">' + escapeHtml(bmTags[ti]) + '</span></button>';
      }
      html += '</div>';

      var allTopSessions = Object.entries(sessionMap)
        .filter((e) => e[0] !== '_unknown' && e[1].count > 1)
        .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
        .slice(0, 50);
      // Apply bookmark filter
      if (_bmFilter === 'starred') {
        allTopSessions = filterSessions(allTopSessions.map(function(e) { return { id: e[0], _e: e }; }), bmMap, { starredOnly: true })
          .map(function(s) { return s._e; });
      } else if (_bmFilter !== 'all') {
        allTopSessions = filterSessions(allTopSessions.map(function(e) { return { id: e[0], _e: e }; }), bmMap, { tagFilter: _bmFilter })
          .map(function(s) { return s._e; });
      }
      var topSessions = allTopSessions.slice(0, 20);
      if (topSessions.length > 0) {
        html += '<div class="card" style="padding:16px;margin-top:12px;overflow-x:auto">'
          + '<div style="font-size:13px;font-weight:600;margin-bottom:4px">' + t('sessionTopList') + '</div>'
          + '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">' + t('sessionTopListHint') + '</div>'
          + '<table class="session-timeline"><thead><tr>'
          + '<th style="width:30px"></th>'
          + '<th>' + t('sessionDate') + '</th>'
          + '<th style="text-align:right">' + t('totalTokens') + '</th>'
          + '<th style="text-align:right">' + t('estimatedCost') + '</th>'
          + '<th style="text-align:right">' + t('sessionDuration') + '</th>'
          + '<th>Model</th>'
          + '</tr></thead><tbody>';
        topSessions.forEach((entry) => {
          const s = entry[1];
          const sid = entry[0];
          const dur = s.maxTs - s.minTs;
          const modelNames = Object.keys(s.models).join(', ');
          const sessionDate = new Date(s.minTs);
          const dowNames = t('dayNames').split(',');
          const dow = dowNames[sessionDate.getDay()] || '';
          const isStarred = bmMap[sid] && bmMap[sid].starred;
          html += '<tr class="session-row" data-session-id="' + escapeHtml(sid) + '" style="cursor:pointer">'
            + '<td><span class="bookmark-star' + (isStarred ? ' active' : '') + '" data-action="toggle-bookmark" data-session-id="' + escapeHtml(sid) + '" title="' + (isStarred ? t('bmUnstar') : t('bmStar')) + '">★</span></td>'
            + '<td>' + formatDate(sessionDate.toISOString()) + ' (' + dow + ')</td>'
            + '<td style="text-align:right">' + fmtCompact(s.totalTokens) + '</td>'
            + '<td style="text-align:right">' + fmtCost(s.cost) + '</td>'
            + '<td style="text-align:right">' + fmtDur(dur) + '</td>'
            + '<td>' + escapeHtml(modelNames) + '</td>'
            + '</tr>';
        });
        html += '</tbody></table></div>';
      } else if (_bmFilter !== 'all') {
        html += '<div class="card" style="padding:16px;text-align:center;color:var(--text-secondary)">' + t('bmNoBookmarks') + '</div>';
      }
      html += '</div>';
    }

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';
    content.innerHTML = html;
    bindContentActions();
    if (DATA._apiMode) bindSessionSearch();
  }

  function renderSessionDetail() {
    if (!currentSessionId) { currentView = 'tokens-session'; renderTokensAnalysis(); return; }

    const usage = getUsage();
    const tokenEntries = (usage.tokenEntries || []).filter((e) => e.sessionId === currentSessionId);
    if (tokenEntries.length === 0) {
      currentView = 'tokens-session'; renderTokensAnalysis(); return;
    }

    const skills = (usage.skills || []).filter((e) => e.sessionId === currentSessionId);
    const agents = (usage.agents || []).filter((e) => e.sessionId === currentSessionId);
    const mcpCalls = (usage.mcpCalls || []).filter((e) => e.sessionId === currentSessionId);
    let totalTokens = 0, totalCost = 0, minTs = Infinity, maxTs = 0;
    const models = {};
    tokenEntries.forEach((e) => {
      const tok = (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      totalTokens += tok;
      totalCost += calcEntryCost(e);
      const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
      const m = (e.model || 'unknown').replace(/^claude-/, '').replace(/-\d{8,}$/, '');
      models[m] = (models[m] || 0) + 1;
    });
    const duration = maxTs - minTs;

    // Bookmark UI for session detail
    const bmMap = _loadBm();
    const isStarred = bmMap[currentSessionId] && bmMap[currentSessionId].starred;
    const bmEntry = bmMap[currentSessionId] || { starred: false, tags: [] };
    const bmTagsStr = (bmEntry.tags || []).join(', ');

    let html = '<button class="session-back-btn" id="session-back">← ' + t('sessionBackToSession') + '</button>'
      + '<div class="page-header">'
      + '<div style="display:flex;align-items:center;gap:12px">'
      + '<h1>📋 ' + t('sessionDetail') + '</h1>'
      + '<span class="bookmark-star' + (isStarred ? ' active' : '') + '" data-action="toggle-bookmark" data-session-id="' + escapeHtml(currentSessionId) + '" style="font-size:22px" title="' + (isStarred ? t('bmUnstar') : t('bmStar')) + '">★</span>'
      + '</div>'
      + '<div class="page-desc">' + formatDateTime(new Date(minTs).toISOString()) + '</div>'
      + '<div style="margin-top:8px;display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:12px;color:var(--text-secondary)">' + t('bmTags') + ':</span>'
      + '<input class="bookmark-tag-input" data-action="set-tags" data-session-id="' + escapeHtml(currentSessionId) + '" value="' + escapeHtml(bmTagsStr) + '" placeholder="' + t('bmTagPlaceholder') + '">'
      + '</div>'
      + '</div>';

    // Stat cards
    html += '<div class="card-grid">'
      + statCard(t('totalTokens'), totalTokens, null, { si: true })
      + statCard(t('estimatedCost'), fmtCost(totalCost), null, { raw: true })
      + statCard(t('sessionDuration'), fmtDur(duration), null, { raw: true })
      + statCard(t('sessionMessages'), tokenEntries.length, null)
      + '</div>';

    // Models
    html += '<div class="section"><div class="section-title">' + t('sessionModels') + '</div>'
      + '<div class="session-badge-list">';
    Object.entries(models).sort((a, b) => b[1] - a[1]).forEach((e) => {
      html += '<span class="session-badge">' + escapeHtml(e[0]) + ' (' + e[1] + ')</span>';
    });
    html += '</div></div>';

    // Skills / Agents / MCP used
    const uniqueSkills = [...new Set(skills.map((s) => s.name))];
    const uniqueAgents = [...new Set(agents.map((a) => a.name))];
    const uniqueMcps = [...new Set(mcpCalls.map((m) => m.name))];

    if (uniqueSkills.length > 0 || uniqueAgents.length > 0 || uniqueMcps.length > 0) {
      html += '<div class="section"><div class="section-title">' + t('sessionInvoked') + '</div>'
        + '<div class="session-badge-list">';
      uniqueSkills.forEach((n) => { html += '<span class="session-badge">🧠 ' + escapeHtml(n) + '</span>'; });
      uniqueAgents.forEach((n) => { html += '<span class="session-badge">🤖 ' + escapeHtml(n) + '</span>'; });
      uniqueMcps.forEach((n) => { html += '<span class="session-badge">🔌 ' + escapeHtml(n) + '</span>'; });
      html += '</div></div>';
    }

    // Timeline table
    html += '<div class="section"><div class="section-title">' + t('sessionTimeline') + '</div>'
      + '<div class="card" style="padding:16px;overflow-x:auto">'
      + '<table class="session-timeline"><thead><tr>'
      + '<th>' + t('sessionTime') + '</th><th>Model</th><th>Context</th>'
      + '<th style="text-align:right">Input</th><th style="text-align:right">Output</th>'
      + '<th style="text-align:right">Cache</th><th style="text-align:right">' + t('estimatedCost') + '</th>'
      + '</tr></thead><tbody>';

    const sorted = tokenEntries.slice().sort((a, b) => {
      const ta = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
      const tb = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
      return ta - tb;
    });
    sorted.forEach((e) => {
      const d = typeof e.timestamp === 'number' ? new Date(e.timestamp) : new Date(e.timestamp);
      const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
      const m = (e.model || 'unknown').replace(/^claude-/, '').replace(/-\d{8,}$/, '');
      const ctx = e.contextName || 'general';
      html += '<tr>'
        + '<td>' + time + '</td>'
        + '<td>' + escapeHtml(m) + '</td>'
        + '<td>' + escapeHtml(ctx) + '</td>'
        + '<td style="text-align:right">' + fmtCompact(e.rawInput || 0) + '</td>'
        + '<td style="text-align:right">' + fmtCompact(e.outputTokens || 0) + '</td>'
        + '<td style="text-align:right">' + fmtCompact((e.cacheRead || 0) + (e.cacheCreation || 0)) + '</td>'
        + '<td style="text-align:right">' + fmtCost(calcEntryCost(e)) + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div></div>';

    // Compare button — pick another session to compare side-by-side
    html += '<div class="section" style="text-align:center">'
      + '<button class="bookmark-filter-btn" id="session-compare-btn" style="padding:8px 20px;font-size:13px">⚖️ ' + t('cmpBtn') + '</button>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">' + t('cmpPickSecond') + '</div>'
      + '<div id="compare-session-picker" style="display:none;margin-top:12px"></div>'
      + '</div>';

    content.innerHTML = html;
    bindContentActions();

    // Back button
    const backBtn = document.getElementById('session-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        currentView = 'tokens-session';
        currentSessionId = null;
        pushState(true);
        render();
      });
    }

    // Compare button — show session picker
    const compareBtn = document.getElementById('session-compare-btn');
    if (compareBtn) {
      compareBtn.addEventListener('click', function() {
        const picker = document.getElementById('compare-session-picker');
        if (!picker) return;
        if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }
        // Build a list of sessions to pick from
        const allEntries = usage.tokenEntries || [];
        var sMap = {};
        allEntries.forEach(function(e) {
          var sid = e.sessionId || '_unknown';
          if (sid === currentSessionId) return; // exclude current
          if (!sMap[sid]) sMap[sid] = { count: 0, minTs: Infinity, totalTokens: 0 };
          sMap[sid].count += 1;
          var ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
          if (ts < sMap[sid].minTs) sMap[sid].minTs = ts;
          sMap[sid].totalTokens += (e.rawInput || 0) + (e.outputTokens || 0);
        });
        var candidates = Object.entries(sMap).filter(function(e) { return e[1].count > 1 && e[0] !== '_unknown'; })
          .sort(function(a, b) { return b[1].minTs - a[1].minTs; }).slice(0, 20);
        var pHtml = '<div style="max-height:250px;overflow-y:auto;text-align:left">';
        candidates.forEach(function(c) {
          pHtml += '<div class="session-row" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)" data-action="start-compare" data-compare-sid="' + escapeHtml(c[0]) + '">'
            + '<span style="font-size:12px">' + formatDate(new Date(c[1].minTs).toISOString()) + '</span>'
            + '<span style="font-size:12px;color:var(--text-secondary);margin-left:8px">' + fmtCompact(c[1].totalTokens) + ' tokens · ' + c[1].count + ' turns</span>'
            + '</div>';
        });
        pHtml += '</div>';
        picker.innerHTML = pHtml;
        picker.style.display = 'block';
        // Bind compare session clicks
        picker.querySelectorAll('[data-action="start-compare"]').forEach(function(el) {
          el.addEventListener('click', function() {
            var sid = el.dataset.compareSid;
            if (!sid) return;
            _compareSessionA = currentSessionId;
            _compareSessionB = sid;
            currentView = 'compare';
            currentDetail = null;
            pushState(true);
            render();
          });
        });
      });
    }
  }

  function buildCacheTips(tokenEntries, sessionMap, hitRate, totalRawInput, totalCacheRead, totalCacheCreation, totalInputAll) {
    const tips = [];
    if (totalInputAll === 0) return tips;

    // 1. Overall low hit rate
    if (hitRate < 20) {
      tips.push({ icon: '⚠️', title: t('cacheTipLowHitTitle'), detail: t('cacheTipLowHitDetail', hitRate) });
    } else if (hitRate > 70) {
      tips.push({ icon: '✅', title: t('cacheTipGoodTitle'), detail: t('cacheTipGoodDetail', hitRate) });
    }

    // 2. High creation / low read ratio
    if (totalCacheCreation > totalCacheRead * 2 && totalCacheCreation > 0) {
      tips.push({ icon: '🔄', title: t('cacheTipHighCreationTitle'), detail: t('cacheTipHighCreationDetail') });
    }

    // 3. Sessions with no cache reads
    const sessionIds = Object.keys(sessionMap);
    if (sessionIds.length > 2) {
      const noCacheSessions = sessionIds.filter((sid) => {
        return tokenEntries.filter((e) => e.sessionId === sid).every((e) => (e.cacheRead || 0) === 0);
      });
      const noCachePct = Math.round((noCacheSessions.length / sessionIds.length) * 100);
      if (noCachePct > 50) {
        tips.push({ icon: '📊', title: t('cacheTipNoSessionTitle'), detail: t('cacheTipNoSessionDetail', noCachePct) });
      }
    }

    return tips;
  }

  function drawCacheEfficiencyChart(dailyCacheMap, sortedDates) {
    const el = document.getElementById('cache-efficiency-chart');
    if (!el || !sortedDates || sortedDates.length < 2) return;

    // 7-day rolling efficiency
    const rollingEff = computeRollingEfficiencySeries(dailyCacheMap, sortedDates);

    const dailyEff = sortedDates.map((dk) => {
      const v = dailyCacheMap[dk];
      return (v.read + v.creation) > 0 ? Math.round((v.read / (v.read + v.creation)) * 100) : 0;
    });

    const bestEff = Math.max(...rollingEff.filter((v) => v > 0));
    const minEff = Math.min(...rollingEff.filter((v) => v > 0));
    const yMin = Math.max(0, Math.floor((minEff - 10) / 10) * 10); // round down to nearest 10, floor at 0

    makeChart({
      bindto: '#cache-efficiency-chart',
      data: {
        x: 'x',
        columns: [
          ['x', ...sortedDates.map((d) => new Date(d))],
          [t('cacheEfficiencyUnit'), ...dailyEff],
          ['7d avg', ...rollingEff],
        ],
        types: { [t('cacheEfficiencyUnit')]: 'area', '7d avg': 'line' },
        colors: { [t('cacheEfficiencyUnit')]: '#4263eb', '7d avg': '#e8590c' },
      },
      axis: {
        x: { type: 'timeseries', tick: { format: '%m-%d', count: 8, outer: false } },
        y: {
          min: yMin, max: 100,
          padding: { bottom: 0, top: 0 },
          tick: { count: 5, format: (v) => +v.toFixed(2) + '%' },
        },
      },
      grid: {
        y: { lines: [
          { value: bestEff, text: t('cacheBestEfficiency') + ' ' + bestEff + '%', class: 'cache-best-line',  position: 'start' },
          { value: minEff,  text: t('cacheWorstEfficiency') + ' ' + minEff + '%',  class: 'cache-worst-line', position: 'start' },
        ] },
      },
      point: { r: 3, focus: { only: true } },
      legend: { show: true },
      area: { linearGradient: true },
      size: { height: 180 },
      clipPath: false,
      tooltip: { format: { title: fmtChartTooltipTitle, value: (v) => v + '%' } },
      onrendered() {
        const gridLines = el.querySelector('.bb-grid.bb-grid-lines');
        if (gridLines) gridLines.removeAttribute('clip-path');
        el.querySelectorAll('.bb-ygrid-line > text').forEach((node) => {
          node.setAttribute('dy', '12');
        });
      },
    });
  }

  function drawHourlyDistChart(tokenEntries) {
    const el = document.getElementById('hourly-dist-chart');
    if (!el) return;

    const hourTokens = new Array(24).fill(0);
    tokenEntries.forEach((e) => {
      const d = typeof e.timestamp === 'number' ? new Date(e.timestamp) : new Date(e.timestamp);
      if (!isNaN(d.getTime())) {
        hourTokens[d.getHours()] += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      }
    });

    const categories = Array.from({ length: 24 }, (_, i) => i + t('unitHourSuffix'));
    const values = ['tokens'].concat(hourTokens);

    makeChart({
      bindto: '#hourly-dist-chart',
      data: {
        columns: [values],
        type: 'bar',
        // Canvas render mode invokes the per-datum color callback with only the
        // series id (no index/value), so a value-driven gradient can't be
        // computed here. Use a single deep blue for every bar instead.
        colors: { tokens: '#364fc7' },
      },
      axis: {
        x: {
          type: 'category',
          categories: categories,
          tick: { outer: false }
        },
        y: {
          tick: { count: 5, format: (v) => fmtCompact(v), outer: false }
        }
      },
      bar: { width: { ratio: 0.7 } },
      legend: { show: false },
      tooltip: {
        format: {
          value: (value) => fmtNum(value)
        }
      },
      size: { height: 200 }
    });
  }

  function drawRotatedBar(bindto, items) {
    const el = document.querySelector(bindto);
    if (!el || items.length === 0) {
      if (el) el.innerHTML = '<div style="text-align:center;color:#6c757d;padding:40px 0;font-size:13px">' + t('noUsageData') + '</div>';
      return;
    }

    const categories = items.map((d) => d.label);
    const values = ['tokens'].concat(items.map((d) => d.value));

    const barHeight = Math.max(200, items.length * 32 + 40);

    makeChart({
      bindto: bindto,
      data: {
        columns: [values],
        type: 'bar',
        labels: {
          format: (v) => fmtCompact(v)
        },
        color: (color, d) => {
          const colors = ['#4263eb', '#7c3aed', '#0ca678', '#e8590c', '#dc2626', '#d97706', '#6b7280', '#0891b2', '#be185d', '#4f46e5'];
          return colors[d.index % colors.length] || color;
        }
      },
      axis: {
        rotated: true,
        x: {
          type: 'indexed',
          tick: {
            format: (i) => categories[i] || '',
            multiline: false,
            count: categories.length,
            culling: false,
            outer: false,
            show: false
          }
        },
        y: {
          clipPath: false,
          tick: { count: 5, format: (v) => fmtCompact(v) }
        }
      },
      bar: { width: { ratio: 0.6 }, radius: { ratio: 0.3 } },
      legend: { show: false },
      tooltip: {
        format: {
          value: (value) => fmtNum(value)
        }
      },
      size: { height: barHeight },
      padding: { left: 120 }
    });
  }

  function renderTokenInsights(tokenEntries, modelMap, days) {
    if (tokenEntries.length === 0) return '';
    const insights = [];

    // Totals
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0, totalRawInput = 0;
    tokenEntries.forEach((e) => {
      totalRawInput += e.rawInput || 0;
      totalOutput += e.outputTokens || 0;
      totalCacheRead += e.cacheRead || 0;
      totalCacheCreation += e.cacheCreation || 0;
    });
    totalInput = totalRawInput + totalCacheRead + totalCacheCreation;
    const totalAll = totalInput + totalOutput;

    // 1. Cache efficiency
    if (totalInput > 0) {
      const cacheTotal = totalCacheRead + totalCacheCreation;
      const cacheRate = Math.round((totalCacheRead / totalInput) * 100);
      const creationRate = Math.round((totalCacheCreation / totalInput) * 100);
      const freshRate = Math.round((totalRawInput / totalInput) * 100);
      let detail = t('insightCacheDetail', cacheRate, creationRate, freshRate);
      if (cacheRate > 70) {
        detail += '\n' + t('insightCacheHighHit');
      } else if (cacheRate < 30) {
        detail += '\n' + t('insightCacheLowHit');
      }
      insights.push({ icon: '💰', title: t('insightCacheTitle'), detail: detail });
    }

    // 2. Output/Input ratio
    if (totalRawInput > 0) {
      const ratio = (totalOutput / totalRawInput).toFixed(1);
      let detail = t('insightRespDetail', ratio, fmtCompact(totalRawInput), fmtCompact(totalOutput));
      if (parseFloat(ratio) > 5) {
        detail += '\n' + t('insightRespHighRatio');
      }
      insights.push({ icon: '📊', title: t('insightRespTitle'), detail: detail });
    }

    // 3. Primary model
    const modelEntries = Object.entries(modelMap).sort((a, b) => {
      return (b[1].input + b[1].output + b[1].cache) - (a[1].input + a[1].output + a[1].cache);
    });
    if (modelEntries.length > 0) {
      const top = modelEntries[0];
      const topTotal = top[1].input + top[1].output + top[1].cache;
      const topPct = totalAll > 0 ? Math.round((topTotal / totalAll) * 100) : 0;
      let detail = t('insightModelDetail', top[0], topPct, fmtCompact(topTotal));
      if (modelEntries.length > 1) {
        const others = modelEntries.slice(1).map((e) => {
          const t2 = e[1].input + e[1].output + e[1].cache;
          return e[0] + ' ' + fmtCompact(t2);
        }).join(', ');
        detail += '\n' + t('insightModelOthers', others);
      }
      insights.push({ icon: '🤖', title: t('insightModelTitle'), detail: detail });
    }

    // 3b. Cost breakdown
    let totalCostInsight = 0;
    tokenEntries.forEach((e) => { totalCostInsight += calcEntryCost(e); });
    if (totalCostInsight > 0) {
      const costByModel = modelEntries.map((e) => e[0] + ' ' + fmtCost(e[1].cost || 0)).join(', ');
      let detail = t('insightCostDetail', fmtCost(totalCostInsight));
      detail += '\n' + t('insightCostByModel', costByModel);
      insights.push({ icon: '💵', title: t('insightCostTitle'), detail: detail });
    }

    // 4. Daily average, peak, day-of-week, peak hours
    const dailyMap = {};
    const dowTokens = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const hourTokens = new Array(24).fill(0);
    tokenEntries.forEach((e) => {
      const ts = e.timestamp;
      const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
      const key = d.toISOString().substring(0, 10);
      const tokVal = (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      if (key) dailyMap[key] = (dailyMap[key] || 0) + tokVal;
      if (!isNaN(d.getTime())) {
        dowTokens[d.getDay()] += tokVal;
        hourTokens[d.getHours()] += tokVal;
      }
    });
    const dailyValues = Object.entries(dailyMap);
    if (dailyValues.length > 0) {
      const totalDays = dailyValues.length;
      const dailyAvg = Math.round(totalAll / totalDays);
      const peak = dailyValues.sort((a, b) => b[1] - a[1])[0];

      // Day of week
      const dowNames = t('dayNames').split(',');
      const maxDow = dowTokens.indexOf(Math.max(...dowTokens));

      // Peak hours
      const maxHourVal = Math.max(...hourTokens);
      const peakHours = [];
      hourTokens.forEach((v, h) => { if (v >= maxHourVal * 0.7 && v > 0) peakHours.push(h); });
      const fmtH = (h) => t('amPrefix') || t('pmPrefix') ? (h < 12 ? t('amPrefix') : t('pmPrefix')) + (h === 0 ? 12 : h <= 12 ? h : h - 12) + t('unitHourSuffix') : h + ':00';
      const peakHourStr = peakHours.length <= 3
        ? peakHours.map(fmtH).join(', ')
        : fmtH(peakHours[0]) + '–' + fmtH(peakHours[peakHours.length - 1]);

      let detail = t('insightDailyDetail', fmtNum(totalDays), fmtCompact(dailyAvg));
      detail += '\n' + t('insightDailyPeak', peak[0], fmtCompact(peak[1]));
      detail += '\n' + t('insightDailyDow', dowNames[maxDow], fmtCompact(dowTokens[maxDow]), peakHourStr);
      insights.push({ icon: '📈', title: t('insightDailyTitle'), detail: detail });
    }

    // 5. Requests count & avg tokens per request
    const reqCount = tokenEntries.length;
    if (reqCount > 0) {
      const avgPerReq = Math.round(totalAll / reqCount);
      let detail = t('insightReqDetail', fmtNum(reqCount), fmtCompact(avgPerReq));
      if (avgPerReq > 50000) {
        detail += '\n' + t('insightReqHighTokens');
      }
      insights.push({ icon: '🔢', title: t('insightReqTitle'), detail: detail });
    }

    if (insights.length === 0) return '';

    let html = '<div class="section">'
      + '<div class="section-title">' + t('tokenInsights') + '</div>'
      + '<div class="insights-grid">';
    insights.forEach((ins) => {
      html += '<div class="insight-card">'
        + '<span class="insight-card-icon">' + ins.icon + '</span>'
        + '<div class="insight-card-body">'
        + '<div class="insight-card-title">' + escapeHtml(ins.title) + '</div>'
        + '<div class="insight-card-detail"><ul class="insight-list">' + escapeHtml(ins.detail).split('\n').map((line) => '<li>' + line + '</li>').join('') + '</ul></div>'
        + '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  function drawTokenTrendChart(tokenEntries, days, prevEntries) {
    let el = document.getElementById('token-trend-chart');
    if (!el) return;

    if (tokenEntries.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#6c757d;padding:40px 0;font-size:13px">' + t('noUsageData') + '</div>';
      return;
    }

    let numDays, endDate;
    if (customDateRange) {
      numDays = Math.ceil((customDateRange.end - customDateRange.start) / 86400000) + 1;
      endDate = customDateRange.end;
    } else if (days === 0) {
      let dataRange = getDataDateRange();
      if (dataRange) {
        let startDay = new Date(dataRange.start.getFullYear(), dataRange.start.getMonth(), dataRange.start.getDate());
        let endDay = new Date(dataRange.end.getFullYear(), dataRange.end.getMonth(), dataRange.end.getDate());
        endDate = endDay;
        numDays = Math.round((endDay - startDay) / 86400000) + 1;
      } else {
        numDays = 90;
        endDate = new Date();
      }
    } else {
      numDays = days;
      endDate = new Date();
    }

    const dailyInput = {};
    const dailyOutput = {};
    let dateLabels = ['x'];
    const inputData = [t('inputTokens')];
    const outputData = [t('outputTokens')];

    for (let i = 0; i < numDays; i++) {
      let d = new Date(endDate);
      d.setDate(d.getDate() - (numDays - 1 - i));
      let key = dateKey(d);
      dailyInput[key] = 0;
      dailyOutput[key] = 0;
      dateLabels.push(key);
    }

    tokenEntries.forEach((e) => {
      let ts = e.timestamp;
      let key = typeof ts === 'string' ? ts.substring(0, 10) : typeof ts === 'number' ? new Date(ts).toISOString().substring(0, 10) : '';
      if (dailyInput.hasOwnProperty(key)) {
        dailyInput[key] += (e.rawInput || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
        dailyOutput[key] += e.outputTokens || 0;
      }
    });

    for (let j = 1; j < dateLabels.length; j++) {
      inputData.push(dailyInput[dateLabels[j]] || 0);
      outputData.push(dailyOutput[dateLabels[j]] || 0);
    }

    const columns = [dateLabels, inputData, outputData];
    const types = {};
    const outputKey = t('outputTokens');
    const inputKey = t('inputTokens');
    const axes = {};
    axes[outputKey] = 'y2';
    const colors = {};

    // Compare mode: add previous period data aligned to current dates
    if (prevEntries && prevEntries.length > 0) {
      const prevDailyTotal = {};
      for (let i = 0; i < numDays; i++) {
        const d = new Date(endDate);
        d.setDate(d.getDate() - (numDays - 1 - i) - numDays);
        prevDailyTotal[dateKey(d)] = 0;
      }
      prevEntries.forEach((e) => {
        const ts = e.timestamp;
        const key = typeof ts === 'string' ? ts.substring(0, 10) : typeof ts === 'number' ? new Date(ts).toISOString().substring(0, 10) : '';
        if (prevDailyTotal.hasOwnProperty(key)) {
          prevDailyTotal[key] += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
        }
      });
      const prevLabel = t('comparePrev');
      const prevData = [prevLabel];
      const prevKeys = Object.keys(prevDailyTotal).sort();
      prevKeys.forEach((k) => { prevData.push(prevDailyTotal[k] || 0); });
      // Pad if shorter
      while (prevData.length < dateLabels.length) prevData.push(0);
      columns.push(prevData);
      types[prevLabel] = 'line';
      colors[prevLabel] = '#adb5bd';
    }

    // Mark anomalous days (spike vs trailing 7-day baseline) with x-grid lines
    const anomalySeries = buildDailyUsageSeries(tokenEntries, calcEntryCost);
    const anomalyGridLines = detectDailyAnomalies(anomalySeries.dailyMap, anomalySeries.sortedDates)
      .filter((a) => dailyInput.hasOwnProperty(a.date))
      // No `text:` label — canvas render mode garbles rotated grid-line text.
      // The vertical marker line stays; anomaly details are in the list below.
      .map((a) => ({ value: a.date, class: 'anomaly-grid-line' }));

    makeChart({
      bindto: '#token-trend-chart',
      data: {
        x: 'x',
        columns: columns,
        types: types,
        type: 'area',
        axes: axes,
        colors: colors
      },
      axis: {
        x: {
          type: 'timeseries',
          tick: { format: '%m-%d', count: 6, outer: false, text: { inner: true } }
        },
        y: {
          label: { text: inputKey, position: 'outer-middle' },
          min: 0,
          padding: { bottom: 0 },
          tick: {
            count: 5,
            format: (v) => fmtCompact(v)
          }
        },
        y2: {
          show: true,
          label: { text: outputKey, position: 'outer-middle' },
          min: 0,
          padding: { bottom: 0 },
          tick: {
            count: 5,
            format: (v) => fmtCompact(v)
          }
        }
      },
      grid: { x: { lines: anomalyGridLines } },
      point: { r: 3, focus: { only: true } },
      legend: { show: true },
      size: { height: 280 },
      color: { pattern: ['#4263eb', '#0ca678'] },
      clipPath: false,
      area: {
        linearGradient: true
      },
      tooltip: {
        format: {
          title: fmtChartTooltipTitle,
          value: (value) => fmtNum(value)
        }
      }
    });
  }

  function drawTokenModelDonut(modelMap) {
    let el = document.getElementById('token-model-donut');
    if (!el) return;

    const entries = Object.entries(modelMap);
    if (entries.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#6c757d;padding:40px 0;font-size:13px">' + t('noUsageData') + '</div>';
      return;
    }

    let columns = [];
    let total = 0;
    entries.forEach((e) => {
      const tot = e[1].input + e[1].output + e[1].cache;
      total += tot;
      columns.push([e[0], tot]);
    });

    // Assign distinct colors per model
    const modelColors = ['#4263eb', '#7c3aed', '#0ca678', '#e8590c', '#dc2626', '#6b7280'];
    let colors = {};
    columns.forEach((col, i) => { colors[col[0]] = modelColors[i % modelColors.length]; });

    makeChart({
      bindto: '#token-model-donut',
      data: {
        columns: columns,
        type: 'donut',
        colors: colors
      },
      donut: {
        title: fmtCompact(total),
        label: {
          format: (value, ratio) => { return Math.round(ratio * 100) + '%'; },
          ratio: 1.0
        },
        width: 51
      },
      tooltip: {
        format: {
          value: (value, ratio) => { return fmtCompact(value) + ' (' + Math.round(ratio * 100) + '%)'; }
        }
      },
      legend: { position: 'bottom' },
      size: { height: 280 }
    });
  }

  function renderBudgetSection(costDailyMap) {
    let html = '<div class="section"><div class="section-title">'
      + t('budgetTitle')
      + '</div>'
      + '<div style="margin-bottom:8px;font-size:12px;color:var(--text-secondary)">' + t('budgetDesc') + '</div>';

    // Config panel (always visible)
    const bd = tokenBudget || {};
    html += '<div class="budget-config-panel">'
      + '<div class="budget-config-row">'
      + '<label>' + t('budgetDaily') + ' $<input type="number" id="budget-daily" min="0" step="0.1" value="' + (bd.daily || '') + '"></label>'
      + '<label>' + t('budgetWeekly') + ' $<input type="number" id="budget-weekly" min="0" step="1" value="' + (bd.weekly || '') + '"></label>'
      + '<label>' + t('budgetMonthly') + ' $<input type="number" id="budget-monthly" min="0" step="1" value="' + (bd.monthly || '') + '"></label>'
      + '<div class="budget-config-actions">'
      + '<button class="period-btn" id="budget-save-btn">' + t('budgetSave') + '</button>'
      + '<button class="period-btn" id="budget-clear-btn">' + t('budgetClear') + '</button>'
      + '</div>'
      + '</div></div>';

    // Progress bars
    if (tokenBudget) {
      const today = new Date().toISOString().substring(0, 10);
      const todayCost = costDailyMap[today] || 0;

      // Weekly: sum last 7 days
      let weeklyCost = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        weeklyCost += costDailyMap[d.toISOString().substring(0, 10)] || 0;
      }

      // Monthly: sum last 30 days
      let monthlyCost = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        monthlyCost += costDailyMap[d.toISOString().substring(0, 10)] || 0;
      }

      const bars = [];
      if (tokenBudget.daily) bars.push({ label: t('budgetDaily'), spent: todayCost, budget: tokenBudget.daily });
      if (tokenBudget.weekly) bars.push({ label: t('budgetWeekly'), spent: weeklyCost, budget: tokenBudget.weekly });
      if (tokenBudget.monthly) bars.push({ label: t('budgetMonthly'), spent: monthlyCost, budget: tokenBudget.monthly });

      if (bars.length > 0) {
        html += '<div class="budget-bars">';
        bars.forEach((b) => {
          const rawPct = (b.spent / b.budget) * 100;
          const pct = Math.min(rawPct, 100);
          const cls = rawPct >= 100 ? 'exceeded' : rawPct >= 80 ? 'warning' : '';
          let suffix = '';
          if (rawPct >= 100) {
            const over = b.spent - b.budget;
            suffix = ' ⚠️ ' + t('budgetExceededDetail', fmtCost(over), Math.round(rawPct - 100));
          } else if (rawPct >= 80) {
            suffix = ' ⚠️';
          }
          html += '<div class="budget-bar-row">'
            + '<div class="budget-bar-label">' + b.label + '</div>'
            + '<div class="budget-bar-track"><div class="budget-bar-fill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></div></div>'
            + '<div class="budget-bar-text">' + fmtCost(b.spent) + ' / ' + fmtCost(b.budget) + suffix
            + '</div></div>';
        });
        html += '</div>';
      }
    }

    // Month-end projection (F1)
    const todayISO = new Date().toISOString().substring(0, 10);
    const proj = projectMonthEnd(costDailyMap, todayISO, tokenBudget && tokenBudget.monthly);
    if (proj) {
      html += '<div class="budget-projection">';
      if (proj.confidence === 'none') {
        html += '<div class="budget-projection-title">' + t('projectionTitle') + '</div>'
          + '<div class="budget-projection-empty">' + t('projectionInsufficient') + '</div>';
      } else {
        const diffCls = proj.overBudget ? 'over' : (proj.diff !== null ? 'under' : '');
        const diffText = proj.diff === null
          ? ''
          : (proj.overBudget
              ? ' · <span class="budget-projection-diff over">+' + fmtCost(proj.diff) + ' ' + t('overBudget') + '</span>'
              : ' · <span class="budget-projection-diff under">−' + fmtCost(-proj.diff) + ' ' + t('underBudget') + '</span>');
        const confBadge = proj.confidence === 'low'
          ? ' <span class="budget-projection-badge">' + t('projectionLowConfidence', proj.sampleDays) + '</span>'
          : '';
        html += '<div class="budget-projection-title">' + t('projectionTitle') + confBadge + '</div>'
          + '<div class="budget-projection-desc">' + t('projectionDesc') + '</div>'
          + '<div class="budget-projection-row">'
          + '<div class="budget-projection-metric"><div class="budget-projection-label">' + t('projected') + '</div>'
          + '<div class="budget-projection-value ' + diffCls + '">' + fmtCost(proj.projected) + '</div></div>'
          + '<div class="budget-projection-metric"><div class="budget-projection-label">' + t('monthToDate') + '</div>'
          + '<div class="budget-projection-value">' + fmtCost(proj.monthToDate) + '</div></div>'
          + '<div class="budget-projection-metric"><div class="budget-projection-label">' + t('dailyAvg7d') + '</div>'
          + '<div class="budget-projection-value">' + fmtCost(proj.dailyAvg) + '</div></div>'
          + '<div class="budget-projection-metric"><div class="budget-projection-label">' + t('daysRemaining', proj.daysRemaining) + '</div>'
          + '<div class="budget-projection-value">' + proj.daysRemaining + '</div></div>'
          + '</div>'
          + '<div class="budget-projection-footer">' + fmtCost(proj.monthToDate) + ' + ' + fmtCost(proj.dailyAvg) + ' × ' + proj.daysRemaining + diffText + '</div>';
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function bindBudgetActions() {
    const saveBtn = document.getElementById('budget-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const daily = parseFloat(document.getElementById('budget-daily').value) || null;
        const weekly = parseFloat(document.getElementById('budget-weekly').value) || null;
        const monthly = parseFloat(document.getElementById('budget-monthly').value) || null;
        if (daily || weekly || monthly) {
          tokenBudget = { daily, weekly, monthly };
          localStorage.setItem('harness-budget', JSON.stringify(tokenBudget));
        } else {
          tokenBudget = null;
          localStorage.removeItem('harness-budget');
        }
        skipScrollReset = true;
        renderContent();
      });
    }
    const clearBtn = document.getElementById('budget-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        tokenBudget = null;
        localStorage.removeItem('harness-budget');
        skipScrollReset = true;
        renderContent();
      });
    }
  }

  // ── Budget threshold alert banner ──
  // Shown at the top of the content area on every page when spend reaches 80%
  // (warning) or 100% (error) of a configured budget. Dismissals persist per
  // period+threshold in localStorage, so a new day/week/month or crossing a
  // higher threshold shows the banner again.
  const BUDGET_ALERT_DISMISS_KEY = 'harness-budget-alert-dismissed';

  function getBudgetAlertDismissals() {
    try { return JSON.parse(localStorage.getItem(BUDGET_ALERT_DISMISS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  // Returns [{ type, labelKey, spent, budget, pct, threshold, dismissKey }]
  // for every configured budget at >= 80% spend. Spend windows mirror
  // renderBudgetSection: daily = today, weekly = last 7 days, monthly = last 30.
  function computeBudgetAlerts() {
    if (!tokenBudget) return [];
    const entries = getUsage().tokenEntries || [];
    if (entries.length === 0) return [];
    const costDailyMap = {};
    entries.forEach((e) => {
      const dk = new Date(e.timestamp).toISOString().substring(0, 10);
      costDailyMap[dk] = (costDailyMap[dk] || 0) + calcEntryCost(e);
    });
    const sumLastDays = (n) => {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        s += costDailyMap[d.toISOString().substring(0, 10)] || 0;
      }
      return s;
    };
    const today = new Date().toISOString().substring(0, 10);
    // Dismissal period keys: calendar day / week (Monday) / month — a new
    // period produces a new key, which un-hides the banner.
    const wd = new Date();
    const dow = wd.getDay();
    wd.setDate(wd.getDate() + (dow === 0 ? -6 : 1 - dow));
    const weekKey = wd.toISOString().substring(0, 10);
    const monthKey = today.substring(0, 7);
    const defs = [
      { type: 'daily', labelKey: 'budgetDaily', spent: costDailyMap[today] || 0, budget: tokenBudget.daily, periodKey: today },
      { type: 'weekly', labelKey: 'budgetWeekly', spent: sumLastDays(7), budget: tokenBudget.weekly, periodKey: weekKey },
      { type: 'monthly', labelKey: 'budgetMonthly', spent: sumLastDays(30), budget: tokenBudget.monthly, periodKey: monthKey },
    ];
    const alerts = [];
    defs.forEach((d) => {
      if (!d.budget) return;
      const pct = (d.spent / d.budget) * 100;
      if (pct < 80) return;
      const threshold = pct >= 100 ? 100 : 80;
      alerts.push({
        type: d.type, labelKey: d.labelKey, spent: d.spent, budget: d.budget,
        pct: Math.round(pct), threshold,
        dismissKey: d.type + ':' + d.periodKey + ':' + threshold,
      });
    });
    return alerts;
  }

  function renderBudgetAlertBanner() {
    const old = document.getElementById('budget-alert-banner');
    if (old) old.remove();
    const dismissed = getBudgetAlertDismissals();
    const allAlerts = computeBudgetAlerts();
    const alerts = allAlerts.filter((a) => !dismissed[a.dismissKey]);
    if (alerts.length === 0) return;
    const severe = alerts.some((a) => a.threshold >= 100);
    const banner = document.createElement('div');
    banner.id = 'budget-alert-banner';
    banner.className = 'budget-alert-banner ' + (severe ? 'error' : 'warning');
    const linesHtml = alerts.map((a) =>
      '<span class="budget-alert-line">' + t('budgetAlertLine', t(a.labelKey), fmtCost(a.spent), fmtCost(a.budget), fmtCompact(a.pct)) + '</span>'
    ).join('');
    banner.innerHTML = '<span class="budget-alert-icon">' + (severe ? '🚨' : '⚠️') + '</span>'
      + '<div class="budget-alert-body">'
      + '<span class="budget-alert-title">' + (severe ? t('budgetAlertOverTitle') : t('budgetAlertWarnTitle')) + '</span>'
      + '<span class="budget-alert-lines">' + linesHtml + '</span>'
      + '</div>'
      + '<button class="budget-alert-dismiss" title="' + escapeHtml(t('budgetAlertDismiss')) + '">✕</button>';
    banner.querySelector('.budget-alert-dismiss').addEventListener('click', () => {
      const prev = getBudgetAlertDismissals();
      // Keep only keys still relevant to the current periods (auto-prune),
      // then add every alert shown in this banner.
      const currentKeys = allAlerts.map((a) => a.dismissKey);
      const next = {};
      Object.keys(prev).forEach((k) => { if (currentKeys.indexOf(k) !== -1) next[k] = true; });
      alerts.forEach((a) => { next[a.dismissKey] = true; });
      localStorage.setItem(BUDGET_ALERT_DISMISS_KEY, JSON.stringify(next));
      banner.remove();
    });
    content.insertBefore(banner, content.firstChild);
  }

  function drawCostTrendCharts(costDailyMap, days) {
    const keys = Object.keys(costDailyMap).sort();
    const noData = '<div style="text-align:center;color:#6c757d;padding:20px 0;font-size:13px">' + t('noUsageData') + '</div>';

    // Compute date range
    let numDays, endDate;
    if (customDateRange) {
      numDays = Math.ceil((customDateRange.end - customDateRange.start) / 86400000) + 1;
      endDate = customDateRange.end;
    } else if (days === 0) {
      const dataRange = getDataDateRange();
      if (dataRange) {
        const startDay = new Date(dataRange.start.getFullYear(), dataRange.start.getMonth(), dataRange.start.getDate());
        const endDay = new Date(dataRange.end.getFullYear(), dataRange.end.getMonth(), dataRange.end.getDate());
        endDate = endDay;
        numDays = Math.round((endDay - startDay) / 86400000) + 1;
      } else {
        numDays = 90; endDate = new Date();
      }
    } else {
      numDays = days; endDate = new Date();
    }

    // 1. Daily chart
    const elDaily = document.getElementById('cost-trend-daily');
    if (elDaily) {
      if (keys.length === 0) { elDaily.innerHTML = noData; }
      else {
        const dateLabels = ['x'];
        const costData = [t('estimatedCost')];
        for (let i = 0; i < numDays; i++) {
          const d = new Date(endDate);
          d.setDate(d.getDate() - (numDays - 1 - i));
          const key = dateKey(d);
          dateLabels.push(key);
          costData.push(costDailyMap[key] || 0);
        }
        const budgetLines = [];
        if (tokenBudget && tokenBudget.daily) {
          budgetLines.push({ value: tokenBudget.daily, text: fmtCost(tokenBudget.daily), class: 'budget-grid-line' });
        }
        makeChart({
          bindto: '#cost-trend-daily',
          data: { x: 'x', columns: [dateLabels, costData], type: 'area', colors: {} },
          axis: {
            x: { type: 'timeseries', tick: { format: '%m-%d', count: 6, outer: false } },
            y: { min: 0, padding: { bottom: 0, top: budgetLines.length > 0 ? 10 : 0 }, tick: { count: 4, format: (v) => fmtCost(v) } }
          },
          grid: { y: { lines: budgetLines } },
          point: { r: 2, focus: { only: true } },
          legend: { show: false },
          size: { height: 150 },
          color: { pattern: ['#e8590c'] },
          clipPath: false,
          area: { linearGradient: true },
          tooltip: { format: { title: fmtChartTooltipTitle, value: (v) => fmtCost(v) } }
        });
      }
    }

    // 2. Weekly chart — aggregate daily costs into weeks
    const elWeekly = document.getElementById('cost-trend-weekly');
    if (elWeekly) {
      if (keys.length === 0) { elWeekly.innerHTML = noData; }
      else {
        const weekMap = {};
        for (let i = 0; i < numDays; i++) {
          const d = new Date(endDate);
          d.setDate(d.getDate() - (numDays - 1 - i));
          const key = dateKey(d);
          // Week key = Monday of that week
          const wd = new Date(d);
          const dayOfWeek = wd.getDay();
          const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          wd.setDate(wd.getDate() + diff);
          const wk = dateKey(wd);
          weekMap[wk] = (weekMap[wk] || 0) + (costDailyMap[key] || 0);
        }
        const weekKeys = Object.keys(weekMap).sort();
        const wDateLabels = ['x'].concat(weekKeys);
        const wCostData = [t('estimatedCost')].concat(weekKeys.map((k) => weekMap[k]));
        const budgetLines = [];
        if (tokenBudget && tokenBudget.weekly) {
          budgetLines.push({ value: tokenBudget.weekly, text: fmtCost(tokenBudget.weekly), class: 'budget-grid-line' });
        }
        makeChart({
          bindto: '#cost-trend-weekly',
          data: { x: 'x', columns: [wDateLabels, wCostData], type: 'area', colors: {} },
          axis: {
            x: { type: 'timeseries', tick: { format: '%m-%d', count: Math.min(weekKeys.length, 8), outer: false } },
            y: { min: 0, padding: { bottom: 0, top: budgetLines.length > 0 ? 10 : 0 }, tick: { count: 4, format: (v) => fmtCost(v) } }
          },
          grid: { y: { lines: budgetLines } },
          point: { r: 2, focus: { only: true } },
          legend: { show: false },
          size: { height: 150 },
          color: { pattern: ['#7c3aed'] },
          clipPath: false,
          area: { linearGradient: true },
          tooltip: { format: { title: (d) => {
            const dt = d instanceof Date ? d : new Date(d);
            const monthNames = t('monthNames').split(',');
            const monthStr = monthNames[dt.getMonth()] || String(dt.getMonth() + 1);
            const w = Math.ceil(dt.getDate() / 7);
            const isEn = currentLang === 'en';
            const wStr = isEn ? (w + (['th','st','nd','rd'][w] || 'th')) : String(w);
            return t('weekLabel', monthStr, wStr);
          }, value: (v) => fmtCost(v) } }
        });
      }
    }

    // 3. Monthly chart — aggregate daily costs into months
    const elMonthly = document.getElementById('cost-trend-monthly');
    if (elMonthly) {
      if (keys.length === 0) { elMonthly.innerHTML = noData; }
      else {
        const monthMap = {};
        for (let i = 0; i < numDays; i++) {
          const d = new Date(endDate);
          d.setDate(d.getDate() - (numDays - 1 - i));
          const key = dateKey(d);
          const mk = key.substring(0, 7) + '-01';
          monthMap[mk] = (monthMap[mk] || 0) + (costDailyMap[key] || 0);
        }
        const monthKeys = Object.keys(monthMap).sort();
        const mDateLabels = ['x'].concat(monthKeys);
        const mCostData = [t('estimatedCost')].concat(monthKeys.map((k) => monthMap[k]));
        const budgetLines = [];
        if (tokenBudget && tokenBudget.monthly) {
          budgetLines.push({ value: tokenBudget.monthly, text: fmtCost(tokenBudget.monthly), class: 'budget-grid-line' });
        }
        makeChart({
          bindto: '#cost-trend-monthly',
          data: { x: 'x', columns: [mDateLabels, mCostData], type: 'area', colors: {} },
          axis: {
            x: { type: 'timeseries', tick: { format: '%Y-%m', count: Math.min(monthKeys.length, 12), outer: false } },
            y: { min: 0, padding: { bottom: 0, top: budgetLines.length > 0 ? 10 : 0 }, tick: { count: 4, format: (v) => fmtCost(v) } }
          },
          grid: { y: { lines: budgetLines } },
          point: { r: 2, focus: { only: true } },
          legend: { show: false },
          size: { height: 150 },
          color: { pattern: ['#0ca678'] },
          clipPath: false,
          area: { linearGradient: true },
          tooltip: { format: { title: (d) => {
            const dt = d instanceof Date ? d : new Date(d);
            return dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0');
          }, value: (v) => fmtCost(v) } }
        });
      }
    }
  }

  // ── Breakdown page ──
  function renderBreakdown() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const allEntries = usage.tokenEntries || [];
    const tokenEntries = filterByPeriod(allEntries, 'timestamp', days);

    // Aggregate: typeMap[type] = { tokens, count, items: { name: { tokens, count } } }
    const typeMap = {};
    tokenEntries.forEach((e) => {
      const type = e.context || 'general';
      const item = e.contextName || 'conversation';
      const tokens = (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      if (!typeMap[type]) typeMap[type] = { tokens: 0, count: 0, items: {} };
      typeMap[type].tokens += tokens;
      typeMap[type].count += 1;
      if (!typeMap[type].items[item]) typeMap[type].items[item] = { tokens: 0, count: 0 };
      typeMap[type].items[item].tokens += tokens;
      typeMap[type].items[item].count += 1;
    });

    const totalTokens = Object.values(typeMap).reduce((s, v) => s + v.tokens, 0);
    const sumTokens = (e) => (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
    const totalChange = calcTokenChange(allEntries, days, sumTokens);

    const typeInfo = {
      skill:   { icon: '🧠', label: t('catSkills'),          color: '#e8590c' },
      agent:   { icon: '🤖', label: t('catAgents'),          color: '#0ca678' },
      mcp:     { icon: '🔌', label: 'MCP',                   color: '#7c3aed' },
      tool:    { icon: '🔧', label: t('bdTypeTools'),        color: '#4263eb' },
      general: { icon: '💬', label: t('bdTypeConversation'), color: '#6b7280' }
    };
    const typeEntries = Object.entries(typeMap).sort((a, b) => b[1].tokens - a[1].tokens);

    // Sync accordion state from localStorage (each render reads fresh)
    const LS_KEY = 'harness-bd-expanded';
    breakdownExpandedTypes.clear();
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      saved.forEach((v) => breakdownExpandedTypes.add(v));
    } catch (e) { /* ignore */ }

    let html = '<div class="page-header">'
      + '<h1>📊 ' + t('bdTitle') + '</h1>'
      + '<div class="page-desc">' + t('bdDesc') + '</div>'
      + '</div>'
      + renderPeriodFilter();

    if (tokenEntries.length === 0) {
      html += '<div class="empty-state">' + t('noUsageData') + '</div>';
      content.innerHTML = html;
      bindContentActions();
      bindPeriodFilter();
      return;
    }

    // ── 0. Startup + Type charts side-by-side ──
    const cs = getScopeData().contextStats || {};
    const startupItems = [
      { key: 'globalClaudeTokens',   icon: '📄', labelKey: 'bdStartupClaudeMd',   color: '#4263eb' },
      { key: 'projectClaudeTokens',  icon: '📄', labelKey: 'bdStartupProjectMd',  color: '#0891b2' },
      { key: 'skillsDescTokens',     icon: '🧠', labelKey: 'bdStartupSkills',     color: '#e8590c' },
      { key: 'principlesTokens',     icon: '📐', labelKey: 'bdStartupPrinciples', color: '#7c3aed' },
      { key: 'mcpToolsTokens',       icon: '🔌', labelKey: 'bdStartupMcp',        color: '#dc2626' },
      { key: 'autoMemoryTokens',     icon: '🧠', labelKey: 'bdStartupMemory',     color: '#0ca678' },
    ].filter((item) => (cs[item.key] || 0) > 0);

    const sessionIds = new Set(tokenEntries.map((e) => e.sessionId).filter(Boolean));
    const sessionCount = sessionIds.size;
    const perSessionTokens = startupItems.reduce((s, item) => s + (cs[item.key] || 0), 0);
    const cumulativeTokens = perSessionTokens * sessionCount;

    // Average input cost per token from actual session data (for startup cost estimate)
    let avgInputCostPerToken = 0;
    if (tokenEntries.length > 0) {
      let totalCost = 0, totalInput = 0;
      tokenEntries.forEach((e) => { totalCost += calcEntryCost(e); totalInput += (e.rawInput || 0); });
      if (totalInput > 0) avgInputCostPerToken = totalCost / totalInput;
    }
    const startupCost = cumulativeTokens * avgInputCostPerToken;

    // Startup period-over-period change (session count comparison)
    let startupTotalChange = null;
    if (!customDateRange && days > 0 && sessionCount > 0) {
      const now = new Date();
      const curStart = new Date(now); curStart.setDate(curStart.getDate() - (days - 1)); curStart.setHours(0, 0, 0, 0);
      const prevStart = new Date(curStart); prevStart.setDate(prevStart.getDate() - days);
      const prevSessions = new Set(
        allEntries.filter((e) => { const d = new Date(e.timestamp); return d >= prevStart && d < curStart; })
          .map((e) => e.sessionId).filter(Boolean)
      ).size;
      startupTotalChange = prevSessions === 0
        ? 100
        : Math.round((sessionCount - prevSessions) / prevSessions * 100);
    }

    // One-row flex container for startup + type charts
    html += '<div class="chart-row">';

    if (startupItems.length > 0) {
      html += '<div class="section chart-section">'
        + renderBarCard({
            titleHtml: t('bdStartupTitle'),
            subtitleHtml: t('bdStartupDesc'),
            valueLabelHtml: t('bdStartupCumulative'),
            total: cumulativeTokens,
            totalChange: startupTotalChange,
            labelWidth: 150,
            fillHeight: true,
            summaryHtml: '<span style="font-size:12px;color:var(--text-secondary)">'
              + t('bdStartupPerSession') + ' <strong>' + fmtCompact(perSessionTokens) + '</strong>'
              + ' &nbsp;·&nbsp; ' + fmtNum(sessionCount) + ' ' + t('bdStartupSessions')
              + ' &nbsp;·&nbsp; ' + t('estimatedCost') + ' <strong>' + fmtCost(startupCost) + '</strong>'
              + '</span>',
            rows: startupItems.map((item) => ({
              labelHtml: item.icon + ' ' + t(item.labelKey),
              value: (cs[item.key] || 0) * sessionCount,
              change: startupTotalChange,
              color: item.color
            })),
            footerHtml: t('bdStartupNote')
          })
        + '</div>';
    }

    // ── 1. Type bar chart (renderBarCard style) ──
    html += '<div class="section chart-section">'
      + renderBarCard({
          titleHtml: t('bdByTypeTitle'),
          valueLabelHtml: t('totalTokens'),
          total: totalTokens,
          totalChange: totalChange,
          labelWidth: 110,
          fillHeight: true,
          rows: typeEntries.map(([type, data]) => {
            const info = typeInfo[type] || { icon: '📦', label: type, color: '#6b7280' };
            const typeAllEntries = allEntries.filter((e) => (e.context || 'general') === type);
            const rowChange = calcTokenChange(typeAllEntries, days, sumTokens);
            return {
              labelHtml: info.icon + ' ' + escapeHtml(info.label),
              value: data.tokens,
              change: rowChange,
              color: info.color
            };
          })
        })
      + '</div>';

    html += '</div>'; // chart-row

    // ── 2. Top 5 per type cards (general 제외) + 전체 Top 5 ──
    const renderTop5Card = (headerHtml, items, baseTokens) => {
      let card = '<div class="card" style="padding:14px">'
        + '<div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px">'
        + headerHtml + '</div>';
      items.slice(0, 5).forEach(([item, d], idx) => {
        const pct = baseTokens > 0 ? Math.round(d.tokens / baseTokens * 100) : 0;
        const barW = Math.max(2, pct);
        card += '<div style="margin-bottom:7px">'
          + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">'
          + '<span class="bd-tip-trigger" data-bd-tip="' + escapeHtml(item) + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;cursor:default">'
          + '<span style="color:var(--text-secondary);margin-right:4px">' + (idx + 1) + '.</span>'
          + escapeHtml(item) + '</span>'
          + '<span style="color:var(--text-secondary);flex-shrink:0;margin-left:4px">' + pct + '%</span>'
          + '</div>'
          + '<div style="height:4px;background:var(--border);border-radius:2px">'
          + '<div style="height:4px;width:' + barW + '%;background:' + (d.color || 'var(--accent)') + ';border-radius:2px;opacity:0.75"></div>'
          + '</div>'
          + '</div>';
      });
      return card + '</div>';
    };

    html += '<div class="section"><div class="section-title">' + t('bdTop5Title') + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:8px">';

    // 전체 Top 5 (유형 구분 없음)
    const allItemsMap = {};
    typeEntries.forEach(([type, data]) => {
      Object.entries(data.items).forEach(([item, d]) => {
        if (!allItemsMap[item]) allItemsMap[item] = { tokens: 0, count: 0, color: (typeInfo[type] || {}).color || '#6b7280' };
        allItemsMap[item].tokens += d.tokens;
        allItemsMap[item].count += d.count;
      });
    });
    const allItemsSorted = Object.entries(allItemsMap).sort((a, b) => b[1].tokens - a[1].tokens);
    html += renderTop5Card(
      '🏆 ' + t('bdTop5All') + '<span style="margin-left:auto;font-size:11px;font-weight:400;color:var(--text-secondary)">' + t('bdAllTag') + '</span>',
      allItemsSorted,
      totalTokens
    );

    // 유형별 Top 5
    typeEntries.filter(([type]) => type !== 'general').forEach(([type, data]) => {
      const info = typeInfo[type] || { icon: '📦', label: type };
      const items = Object.entries(data.items).sort((a, b) => b[1].tokens - a[1].tokens);
      html += renderTop5Card(
        info.icon + ' ' + escapeHtml(info.label)
        + '<span style="margin-left:auto;font-size:11px;font-weight:400;color:var(--text-secondary)">'
        + (totalTokens > 0 ? Math.round(data.tokens / totalTokens * 100) + '%' : '') + '</span>',
        items,
        data.tokens
      );
    });
    html += '</div></div>';

    // ── 3. Accordion: type rows → expandable item list ──
    html += '<div class="section"><div class="section-title">' + t('bdDetailTitle') + '</div>'
      + '<div class="card" style="overflow:hidden">';

    typeEntries.forEach(([type, data], tIdx) => {
      const info = typeInfo[type] || { icon: '📦', label: type };
      const pct = totalTokens > 0 ? (data.tokens / totalTokens * 100).toFixed(1) : '0.0';
      const avg = data.count > 0 ? Math.round(data.tokens / data.count) : 0;
      const isOpen = breakdownExpandedTypes.has(type);
      const borderTop = tIdx > 0 ? 'border-top:1px solid var(--border);' : '';
      const itemsSorted = Object.entries(data.items).sort((a, b) => b[1].tokens - a[1].tokens);

      // Header row
      html += '<div class="bd-accordion-header" data-bd-type="' + escapeHtml(type) + '" '
        + 'style="' + borderTop + 'display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;'
        + 'transition:background 0.15s" '
        + 'onmouseenter="this.style.background=\'rgba(66,99,235,0.05)\'" '
        + 'onmouseleave="this.style.background=\'\'">'
        + '<span style="font-size:16px">' + info.icon + '</span>'
        + '<span style="font-weight:600;font-size:14px;flex:1">' + escapeHtml(info.label) + '</span>'
        + '<span style="font-size:13px;color:var(--text-secondary);margin-right:8px">' + fmtNum(itemsSorted.length) + ' ' + t('bdItems') + '</span>'
        + '<span style="font-size:13px;min-width:60px;text-align:right">' + fmtCompact(data.tokens) + '</span>'
        + '<span style="font-size:12px;color:var(--text-secondary);min-width:40px;text-align:right">' + pct + '%</span>'
        + '<span style="font-size:11px;color:var(--accent);margin-left:8px;transition:transform 0.2s'
        + (isOpen ? ';transform:rotate(90deg)' : '') + '"  class="bd-chevron">▶</span>'
        + '</div>';

      // Expanded item table
      html += '<div class="bd-accordion-body" data-bd-body="' + escapeHtml(type) + '" '
        + 'style="' + (isOpen ? '' : 'display:none;') + 'background:var(--sidebar-bg,rgba(0,0,0,0.02));border-top:1px solid var(--border)">'
        + '<table class="config-table" style="width:100%;margin:0"><thead><tr style="background:transparent">'
        + '<th style="padding-left:24px">' + t('bdColItem') + '</th>'
        + '<th style="text-align:right">' + t('totalTokens') + '</th>'
        + '<th style="text-align:right">' + t('bdColCalls') + '</th>'
        + '<th style="text-align:right">' + t('bdColAvg') + '</th>'
        + '<th style="text-align:right">' + t('bdColShare') + '</th>'
        + '</tr></thead><tbody>';
      itemsSorted.forEach(([item, d]) => {
        const iPct = data.tokens > 0 ? (d.tokens / data.tokens * 100).toFixed(1) : '0.0';
        const iAvg = d.count > 0 ? Math.round(d.tokens / d.count) : 0;
        html += '<tr>'
          + '<td style="padding-left:24px">' + escapeHtml(item) + '</td>'
          + '<td style="text-align:right">' + fmtCompact(d.tokens) + '</td>'
          + '<td style="text-align:right">' + fmtNum(d.count) + '</td>'
          + '<td style="text-align:right">' + fmtCompact(iAvg) + '</td>'
          + '<td style="text-align:right">' + iPct + '%</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    });

    html += '</div></div>'; // card + section

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';

    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();

    // Accordion toggle
    const saveExpanded = () => {
      try { localStorage.setItem('harness-bd-expanded', JSON.stringify([...breakdownExpandedTypes])); } catch (e) { /* ignore */ }
    };
    content.querySelectorAll('.bd-accordion-header').forEach((hdr) => {
      hdr.addEventListener('click', () => {
        const type = hdr.dataset.bdType;
        const body = content.querySelector('[data-bd-body="' + type + '"]');
        const chevron = hdr.querySelector('.bd-chevron');
        if (breakdownExpandedTypes.has(type)) {
          breakdownExpandedTypes.delete(type);
          if (body) body.style.display = 'none';
          if (chevron) chevron.style.transform = '';
        } else {
          breakdownExpandedTypes.add(type);
          if (body) body.style.display = '';
          if (chevron) chevron.style.transform = 'rotate(90deg)';
        }
        saveExpanded();
      });
    });

    // Custom tooltip for truncated top-5 item names
    let _bdTip = null;
    content.querySelectorAll('.bd-tip-trigger').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (el.scrollWidth <= el.clientWidth) return; // not truncated
        _bdTip = document.createElement('div');
        _bdTip.className = 'period-tooltip';
        _bdTip.style.position = 'fixed';
        _bdTip.textContent = el.dataset.bdTip;
        document.body.appendChild(_bdTip);
        const r = el.getBoundingClientRect();
        let left = r.left;
        let top = r.top - _bdTip.offsetHeight - 6;
        if (left + _bdTip.offsetWidth > window.innerWidth - 4) left = window.innerWidth - 4 - _bdTip.offsetWidth;
        if (top < 4) top = r.bottom + 6;
        _bdTip.style.left = left + 'px';
        _bdTip.style.top = top + 'px';
      });
      el.addEventListener('mouseleave', () => {
        if (_bdTip) { _bdTip.remove(); _bdTip = null; }
      });
    });

    // bar chart is rendered inline via renderBarCard — no deferred draw needed
  }

  // ── Overview page ──
  // ── Weekly digest (Overview) ──
  // Build-time summary (DATA.weeklyDigest, per scope): last 7 days' cost /
  // tokens / sessions with % deltas vs the previous 7 days.
  function renderWeeklyDigestCard() {
    const digest = DATA.weeklyDigest && DATA.weeklyDigest[currentScope];
    if (!digest || !digest.current) return '';
    const cur = digest.current;
    const prev = digest.previous || {};
    const delta = digest.delta || {};
    const deltaBadge = (d) => {
      if (d === null || d === undefined) return '<span class="digest-delta flat">—</span>';
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
      const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '◆';
      const prefix = d > 0 ? '+' : '';
      return '<span class="digest-delta ' + cls + '" title="' + escapeHtml(t('digestVsPrev')) + '">'
        + arrow + ' ' + prefix + fmtCompact(d) + '%</span>';
    };
    const metric = (label, valueHtml, d, prevHtml) =>
      '<div class="digest-metric">'
      + '<div class="digest-metric-label">' + label + '</div>'
      + '<div class="digest-metric-value">' + valueHtml + '</div>'
      + '<div class="digest-metric-sub">' + deltaBadge(d)
      + ' <span class="digest-prev">' + t('digestPrevWeek', prevHtml) + '</span></div>'
      + '</div>';
    return '<div class="section">'
      + '<div class="section-title">' + t('digestTitle')
      + ' <span class="section-title-sub">' + t('digestDesc') + '</span></div>'
      + '<div class="card digest-card">'
      + metric(t('digestCost'), fmtCost(cur.cost || 0), delta.cost, fmtCost(prev.cost || 0))
      + metric(t('digestTokens'), fmtCompact(cur.tokens || 0), delta.tokens, fmtCompact(prev.tokens || 0))
      + metric(t('digestSessions'), fmtNum(cur.sessions || 0), delta.sessions, fmtNum(prev.sessions || 0))
      + '</div></div>';
  }

  function renderOverview() {
    let scope = DATA.scopes.find((s) => { return s.id === currentScope; });
    const scopePath = scope ? (scope.projectPath || scope.configPath || currentScope) : currentScope;
    const usage = getUsage();
    let days = customDateRange ? 0 : currentPeriod;

    const totalCommands = countUsageList(usage.commands, days);
    const totalSkills = countUsageList(usage.skills, days);
    const totalAgents = countUsageList(usage.agents, days);
    const totalAll = totalCommands + totalSkills + totalAgents;

    const allList = [].concat(usage.commands || [], usage.skills || [], usage.agents || []);
    const changeAll = calcChangeForList(allList, days);
    const changeSkills = calcChangeForList(usage.skills || [], days);
    const changeAgents = calcChangeForList(usage.agents || [], days);
    const changeCommands = calcChangeForList(usage.commands || [], days);

    // Popular skills — normalize plugin:skill names to match actual skill catalog
    let skillCounts = {};
    let sd = getScopeData();
    const actualSkillNames = (sd.skills || []).map((s) => { return s.name; });
    const skillList = filterByPeriod(usage.skills || [], 'timestamp', days);
    skillList.forEach((s) => {
      let name = s.name;
      // Resolve "plugin:skill" to actual skill name if it exists in catalog
      if (name.includes(':')) {
        let shortName = name.split(':').pop();
        if (actualSkillNames.indexOf(shortName) !== -1) name = shortName;
      }
      skillCounts[name] = (skillCounts[name] || 0) + 1;
    });
    const popularSkills = Object.entries(skillCounts)
      .sort((a, b) => { return b[1] - a[1]; })
      .slice(0, 5);

    // Recent items
    const allUsageItems = [].concat(
      (usage.commands || []).map((i) => { return Object.assign({}, i, { type: 'command', typeLabel: t('command'), icon: '⌨️' }); }),
      (usage.skills || []).map((i) => { return Object.assign({}, i, { type: 'skill', typeLabel: t('skill'), icon: '🧠' }); }),
      (usage.agents || []).map((i) => { return Object.assign({}, i, { type: 'agent', typeLabel: t('agent'), icon: '🤖' }); })
    ).sort((a, b) => { return new Date(b.timestamp) - new Date(a.timestamp); }).slice(0, 10);

    const dailyActivity = usage.dailyActivity || [];

    // Unused items
    const unusedSkills = getItems('skills').filter((s) => { return countUsage('skills', s.name, days) === 0; });
    const unusedAgents = getItems('agents').filter((a) => { return countUsage('agents', a.name, days) === 0; });
    const unusedMcps = getItems('mcpServers').filter((m) => { return countUsage('mcpServers', m.name, days) === 0; });

    const regressionHtml = renderRegressionCard(usage);
    const usageBarHtml = renderUsageBarCard(
      totalAll, totalSkills, totalAgents, totalCommands,
      changeAll, changeSkills, changeAgents, changeCommands
    );
    let html = '<div class="page-header">'
      + '<h1>' + t('overviewTitle') + '</h1>'
      + '<div class="file-path" style="margin-top:8px"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(scopePath) + '</div>'
      + '</div>'
      + renderPeriodFilter()
    // Health Score card
    var healthData = computeHealthScore({
      tokenEntries: filterByPeriod(usage.tokenEntries || [], 'timestamp', days),
      contextStats: sd.contextStats,
      skills: sd.skills || [], agents: sd.agents || [],
      mcpServers: sd.mcpServers || [],
      usage: { skills: usage.skills || [], agents: usage.agents || [], mcpCalls: usage.mcpCalls || [] },
      calcEntryCostFn: calcEntryCost,
      days: days,
    });
    var healthHtml = renderHealthScoreCard(healthData);

    html += '<div class="overview-hero' + (regressionHtml ? '' : ' solo') + '">'
      +   regressionHtml
      +   healthHtml
      +   usageBarHtml
      + '</div>';

    // Weekly digest (build-time, last 7 days vs previous 7)
    html += renderWeeklyDigestCard();

    // Category distribution + Daily trend chart
    html += '<div class="chart-row">'
      + '<div class="section chart-section chart-section-small">'
      + '<div class="section-title">' + t('categoryDist') + '</div>'
      + '<div class="card chart-card"><div id="donut-chart"></div></div>'
      + '</div>'
      + '<div class="section chart-section">'
      + '<div class="section-title">' + t('dailyTrend') + ' <span class="section-title-sub">' + t('dailyTrendDesc') + '</span></div>'
      + '<div class="card chart-card"><div id="trend-chart" style="padding-top:10px"></div></div>'
      + '</div>'
      + '</div>';

    // Anomalies — daily token/cost spikes vs trailing 7-day baseline.
    // Baselines are computed over the full available history so the rolling
    // mean stays accurate; the period filter only narrows which days are shown.
    const anomalySeries = buildDailyUsageSeries(usage.tokenEntries || [], calcEntryCost);
    const allAnomalies = detectDailyAnomalies(anomalySeries.dailyMap, anomalySeries.sortedDates);
    const anomalyList = filterByPeriod(
      allAnomalies.map((a) => Object.assign({ timestamp: a.date + 'T12:00:00' }, a)),
      'timestamp', days
    );
    if (anomalyList.length > 0) {
      const shownAnomalies = anomalyList.slice(0, 5);
      const moreAnomalies = anomalyList.length - shownAnomalies.length;
      html += '<div class="section">'
        + '<div class="section-title">' + t('anomalyTitle') + ' (' + anomalyList.length + ') <span class="section-title-sub">' + t('anomalyDesc') + '</span></div>'
        + '<div class="card anomaly-list">';
      shownAnomalies.forEach((a) => {
        const isTok = a.kind !== 'cost';
        const ratio = isTok ? a.tokenRatio : a.costRatio;
        const kindLabel = a.kind === 'cost' ? t('anomalyKindCost') : a.kind === 'both' ? t('anomalyKindBoth') : t('anomalyKindTokens');
        const valueHtml = a.kind === 'cost' ? fmtCost(a.cost)
          : a.kind === 'both' ? fmtCompact(a.tokens) + ' · ' + fmtCost(a.cost)
          : fmtCompact(a.tokens);
        html += '<div class="anomaly-item" data-action="goto-anomaly-day" data-date="' + a.date + '" title="' + t('anomalyClickHint') + '">'
          + '<span class="anomaly-icon">⚠️</span>'
          + '<span class="anomaly-date">' + a.date.replace(/-/g, '.') + '</span>'
          + '<span class="anomaly-kind">' + kindLabel + '</span>'
          + '<span class="anomaly-value">' + valueHtml + '</span>'
          + '<span class="anomaly-mult">' + t('anomalyVsAvg', fmtCompact(Math.round(ratio * 10) / 10)) + '</span>'
          + '</div>';
      });
      if (moreAnomalies > 0) {
        html += '<div class="anomaly-more">' + t('anomalyMore', moreAnomalies) + '</div>';
      }
      html += '</div></div>';
    }

    // Popular Skills
    if (popularSkills.length > 0) {
      html += '<div class="section">'
        + '<div class="section-title">' + t('popularSkills') + '</div>'
        + '<div class="popular-grid">';
      let rankColors = ['#4263eb', '#7c3aed', '#0ca678', '#e8590c', '#dc2626'];
      popularSkills.forEach((pair, i) => {
        let bgColor = rankColors[i] || '#6b7280';
        let cardStyle = 'border-top:3px solid ' + bgColor;
        if (i === 0) cardStyle += ';background:linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)';
        let rankClass = 'popular-card popular-card-ranked' + (i === 0 ? ' popular-rank-1' : '');
        html += '<div class="' + rankClass + '" style="' + cardStyle + '" data-action="goto-detail" data-category="skills" data-name="' + escapeHtml(pair[0]) + '">'
          + '<div class="pop-badges">' + typeBadge('skills') + parentBadge('skills', pair[0]) + '</div>'
          + '<div class="pop-rank-big" style="color:' + bgColor + '">' + (i + 1) + '</div>'
          + '<div class="pop-name">' + escapeHtml(pair[0]) + '</div>'
          + '<div class="pop-count">' + fmtNum(pair[1]) + ' ' + t('calls') + '</div>'
          + '</div>';
      });
      html += '</div></div>';
    }

    // Context Budget — visibility heatmap (filtered by selected period)
    let visBarSegments = [];
    const visLabels = {
      globalClaude: t('visGlobalClaude'), projectClaude: t('visProjectClaude'),
      autoMemory: t('visAutoMemory'), skillsDesc: t('visSkillsDesc'),
      mcpTools: t('visMcpTools'), principles: t('visPrinciples')
    };
    const filteredUsage = {
      tokenEntries: filterByPeriod(usage.tokenEntries || [], 'timestamp', days),
      promptStats: filterByPeriod(usage.promptStats || [], 'timestamp', days)
    };
    // Count distinct sessions in the filtered period for startup cost scaling.
    const periodSessionIds = new Set();
    filteredUsage.tokenEntries.forEach((e) => { if (e.sessionId) periodSessionIds.add(e.sessionId); });
    const visData = aggregateVisibility(filteredUsage, sd.contextStats || {}, visLabels, periodSessionIds.size);
    if (visData.length > 0) {
      const visTotal = visData.reduce((s, v) => s + v.totalTokens, 0);
      html += '<div class="section">'
        + '<div class="section-title">' + t('visHeatmapTitle') + ' <span class="section-title-sub">' + t('visHeatmapDesc') + '</span></div>'
        + '<div class="card" style="padding:16px">';
      // Canvas stacked bar
      const hiddenTok = visData.reduce((s, v) => s + (v.hidden > 0 ? v.totalTokens : 0), 0);
      const briefTok = visData.reduce((s, v) => s + (v.hidden === 0 && v.full === 0 ? v.totalTokens : 0), 0);
      const fullTok = visData.reduce((s, v) => s + (v.full > 0 && v.hidden === 0 ? v.totalTokens : 0), 0);
      visBarSegments = [
        { label: t('visHidden'), tokens: hiddenTok, color: '#6B6964' },
        { label: t('visBrief'),  tokens: briefTok,  color: '#E8A45C' },
        { label: t('visFull'),   tokens: fullTok,    color: '#558A42' }
      ].filter((s) => s.tokens > 0);
      const barSegments = visBarSegments;
      html += '<div style="height:24px;border-radius:6px;overflow:hidden;margin-bottom:12px;background:var(--color-bg-secondary)">'
        + '<canvas id="vis-bar" style="width:100%;height:100%;display:block"></canvas></div>';
      // Legend
      html += '<div style="display:flex;gap:16px;margin-bottom:14px;font-size:12px;color:var(--text-secondary)">';
      barSegments.forEach((seg) => {
        html += '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + seg.color + ';margin-right:4px;vertical-align:-1px"></span>'
          + escapeHtml(seg.label) + ' ' + fmtCompact(seg.tokens) + '</span>';
      });
      html += '</div>';
      // Top items list
      const topItems = visData.slice(0, 8);
      html += '<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;font-size:12px;align-items:center">';
      html += '<div style="font-weight:600;color:var(--text-secondary)">' + t('visName') + '</div>'
        + '<div style="font-weight:600;color:var(--text-secondary);text-align:right">' + t('visTokens') + '</div>'
        + '<div style="font-weight:600;color:var(--text-secondary);text-align:center">' + t('visVisibility') + '</div>';
      topItems.forEach((v) => {
        const vis = v.hidden > 0 ? 'hidden' : (v.full > 0 ? 'full' : 'brief');
        const visColor = vis === 'hidden' ? '#6B6964' : vis === 'full' ? '#558A42' : '#E8A45C';
        const visLabel = vis === 'hidden' ? t('visHidden') : vis === 'full' ? t('visFull') : t('visBrief');
        html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(v.name) + '">' + escapeHtml(v.name) + '</div>'
          + '<div style="text-align:right;font-family:var(--font-mono);color:var(--text-secondary)">' + fmtCompact(v.totalTokens) + '</div>'
          + '<div style="text-align:center"><span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;color:#fff;background:' + visColor + '">' + escapeHtml(visLabel) + '</span></div>';
      });
      html += '</div></div></div>';
    }

    // Activity Heatmap — based on transcript usage data
    html += '<div class="section">'
      + '<div class="section-title">' + t('activity') + ' <span class="section-title-sub">' + t('activityDesc') + '</span></div>'
      + renderHeatmapFromMap(buildActivityMap([].concat(usage.skills || [], usage.agents || [], usage.commands || [], usage.mcpCalls || [])), days)
      + '</div>';

    // Recent
    if (allUsageItems.length > 0) {
      html += '<div class="section">'
        + '<div class="section-title">' + t('recent') + '</div>'
        + '<div class="recent-list">';
      allUsageItems.forEach((item) => {
        const catForType = item.type === 'skill' ? 'skills' : item.type === 'agent' ? 'agents' : null;
        const clickAttr = catForType ? ' data-action="goto-detail" data-category="' + catForType + '" data-name="' + escapeHtml(item.name) + '"' : '';
        html += '<div class="recent-item"' + clickAttr + '>'
          + '<span class="ri-icon">' + item.icon + '</span>'
          + '<span class="ri-name">' + escapeHtml(item.name) + '</span>'
          + '<span class="ri-type badge-category" style="background:' + (catForType ? CATEGORY_COLOR_MAP[catForType] : 'var(--color-rules)') + '">' + item.typeLabel + '</span>'
          + '<span class="ri-time">' + relativeTime(item.timestamp) + '</span>'
          + '</div>';
      });
      html += '</div></div>';
    }

    // Insights & Recommendations
    html += renderInsights(usage, days, unusedAgents);

    // Unused Items
    const totalUnused = unusedSkills.length + unusedAgents.length + unusedMcps.length;
    if (totalUnused > 0) {
      html += '<div class="section">'
        + '<div class="section-title">' + t('unusedItems') + ' (' + totalUnused + ') <span class="section-title-sub">' + t('unusedCriteria') + '</span></div>';
      if (totalUnused > 3) {
        html += '<div class="insights-grid" style="margin-bottom:16px"><div class="insight-card">'
          + '<span class="insight-card-icon">🧹</span>'
          + '<div class="insight-card-body">'
          + '<div class="insight-card-title">' + t('unusedCleanupTipTitle') + '</div>'
          + '<div class="insight-card-detail">' + t('unusedCleanupTipDetail', totalUnused) + '</div>'
          + '</div></div></div>';
      }
      html += '<div class="unused-grid">';
      unusedSkills.forEach((s) => {
        html += '<div class="unused-item" data-action="goto-detail" data-category="skills" data-name="' + escapeHtml(s.name) + '">'
          + typeBadge('skills') + parentBadge('skills', s.name) + '<span>' + escapeHtml(s.name) + '</span></div>';
      });
      unusedAgents.forEach((a) => {
        html += '<div class="unused-item" data-action="goto-detail" data-category="agents" data-name="' + escapeHtml(a.name) + '">'
          + typeBadge('agents') + '<span>' + escapeHtml(a.name) + '</span></div>';
      });
      unusedMcps.forEach((m) => {
        html += '<div class="unused-item" data-action="goto-detail" data-category="mcpServers" data-name="' + escapeHtml(m.name) + '">'
          + typeBadge('mcpServers') + '<span>' + escapeHtml(m.name) + '</span></div>';
      });
      html += '</div></div>';
    }

    // Insights summary banner (compact; full view on #insights page)
    html += renderInsightsBanner(usage, days, sd);

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';

    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();

    // Draw charts with billboard.js
    drawHealthGauge(healthData.total);
    drawTrendChart(usage, days);
    drawDonutChart();
    // Draw canvas stacked bar for context budget
    if (visBarSegments.length > 0) {
      drawStackedBar('vis-bar', visBarSegments.map((s) => ({ value: s.tokens, color: s.color })));
    }
  }

  // ── Reusable canvas stacked bar ──
  // segments: [{ value: number, color: string }]
  // Draws proportional segments into a <canvas>, respecting devicePixelRatio.
  // Layout math lives in layoutStackedBar() (canvas-bars.mjs) and is unit-tested.
  function drawStackedBar(canvasId, segments) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = el.clientWidth * dpr;
    const H = el.clientHeight * dpr;
    el.width = W;
    el.height = H;
    const ctx = el.getContext('2d');
    const rects = layoutStackedBar(segments, W);
    for (const r of rects) {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, 0, r.w, H);
    }
  }

  // ── Charts (billboard.js) ──
  function drawTrendChart(usage, days) {
    let el = document.getElementById('trend-chart');
    if (!el) return;

    let allItems = [].concat(usage.commands || [], usage.skills || [], usage.agents || []);
    if (allItems.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:#6c757d;padding:40px 0;font-size:13px">' + t('noUsageData') + '</div>';
      return;
    }

    let numDays, endDate;
    if (customDateRange) {
      numDays = Math.ceil((customDateRange.end - customDateRange.start) / 86400000) + 1;
      endDate = customDateRange.end;
    } else if (days === 0) {
      let dataRange = getDataDateRange();
      if (dataRange) {
        const startDay = new Date(dataRange.start.getFullYear(), dataRange.start.getMonth(), dataRange.start.getDate());
        const endDay = new Date(dataRange.end.getFullYear(), dataRange.end.getMonth(), dataRange.end.getDate());
        endDate = endDay;
        numDays = Math.round((endDay - startDay) / 86400000) + 1;
      } else {
        numDays = 90;
        endDate = new Date();
      }
    } else {
      numDays = days;
      endDate = new Date();
    }
    const dailyMap = {};
    const dateLabels = ['x'];
    const countData = [t('totalUsage')];
    for (let i = 0; i < numDays; i++) {
      let d = new Date(endDate);
      d.setDate(d.getDate() - (numDays - 1 - i));
      let key = dateKey(d);
      dailyMap[key] = 0;
      dateLabels.push(key);
    }

    allItems.forEach((item) => {
      let ts = item.timestamp;
      let key = '';
      if (typeof ts === 'string') key = ts.substring(0, 10);
      else if (typeof ts === 'number') key = new Date(ts).toISOString().substring(0, 10);
      if (dailyMap.hasOwnProperty(key)) dailyMap[key] += countOf(item);
    });

    for (let j = 1; j < dateLabels.length; j++) {
      countData.push(dailyMap[dateLabels[j]] || 0);
    }

    makeChart({
      bindto: '#trend-chart',
      data: {
        x: 'x',
        columns: [dateLabels, countData],
        types: {},
        type: 'area',
        colors: {}
      },
      axis: {
        x: {
          type: 'timeseries',
          tick: { format: '%m-%d', count: 6, outer: false, text: { inner: true } }
        },
        y: {
          min: 0,
          padding: { bottom: 0 },
          tick: {
            count: 5,
            format: (v) => { return Math.round(v); }
          }
        }
      },
      point: { r: 3, focus: { only: true } },
      legend: { show: true },
      size: { height: 280 },
      color: { pattern: ['#4263eb'] },
      clipPath: false,
      area: {
        linearGradient: true
      },
      tooltip: {
        format: {
          title: fmtChartTooltipTitle
        }
      }
    });
  }

  function drawDonutChart() {
    let el = document.getElementById('donut-chart');
    if (!el) return;

    let sd = getScopeData();
    const columns = [];
    const colors = {};
    const tempEl = document.createElement('div');
    document.body.appendChild(tempEl);
    let total = 0;

    const donutExclude = { configFiles: 1, memory: 1, hooks: 1 };
    CATEGORIES.forEach((cat) => {
      if (donutExclude[cat.key]) return;
      let count = (sd[cat.key] || []).length;
      if (count === 0) return;
      total += count;
      columns.push([getCatLabel(cat), count]);
      // resolve CSS let color
      let color = cat.color;
      if (color && color.startsWith('var(')) {
        tempEl.style.color = color;
        color = getComputedStyle(tempEl).color;
      }
      colors[getCatLabel(cat)] = color;
    });
    tempEl.remove();

    if (total === 0) {
      el.innerHTML = '<div style="text-align:center;color:#6c757d;padding:40px 0;font-size:13px">' + t('noUsageData') + '</div>';
      return;
    }

    makeChart({
      bindto: '#donut-chart',
      data: {
        columns: columns,
        type: 'donut',
        colors: colors
      },
      donut: {
        title: fmtCompact(total),
        label: {
          format: (value, ratio) => { return Math.round(ratio * 100) + '%'; },
          ratio: 1.0
        },
        width: 51
      },
      tooltip: {
        format: {
          value: (value, ratio) => { return fmtNum(value) + ' (' + Math.round(ratio * 100) + '%)'; }
        }
      },
      legend: { position: 'bottom' },
      size: { height: 280 }
    });
  }

  // ── Insights ──
  function renderInsights(usage, days, unusedAgents) {
    const insights = [];
    let sd = getScopeData();
    const allItems = [].concat(usage.skills || [], usage.agents || [], usage.commands || []);
    if (allItems.length === 0) return '';

    const periodDays = customDateRange ? Math.ceil((customDateRange.end - customDateRange.start) / 86400000) : (days === 0 ? 90 : days);

    // ── helpers ──
    const allSkillDefs = sd.skills || [];
    const skillDefMap = {};
    allSkillDefs.forEach((s) => { skillDefMap[s.name] = s; });

    function fmtHour(h) {
      if (t('amPrefix') || t('pmPrefix')) return (h < 12 ? t('amPrefix') : t('pmPrefix')) + (h === 0 ? 12 : h <= 12 ? h : h - 12) + t('unitHourSuffix');
      return h + ':00';
    }

    // ── data prep ──
    const filteredSkills = filterByPeriod(usage.skills || [], 'timestamp', days);
    const filteredAgents = filterByPeriod(usage.agents || [], 'timestamp', days);

    const skillCounts = {};
    filteredSkills.forEach((s) => { skillCounts[s.name] = (skillCounts[s.name] || 0) + 1; });
    const sortedSkills = Object.entries(skillCounts).sort((a, b) => { return b[1] - a[1]; });

    const agentCounts = {};
    filteredAgents.forEach((a) => { agentCounts[a.name] = (agentCounts[a.name] || 0) + 1; });
    const sortedAgents = Object.entries(agentCounts).sort((a, b) => { return b[1] - a[1]; });

    // ── 1. Usage pattern - top skills with actionable detail ──
    if (sortedSkills.length > 0) {
      const top3 = sortedSkills.slice(0, 3);
      const topSkillDef = skillDefMap[top3[0][0]];
      const hasHint = topSkillDef && topSkillDef.argumentHint;
      let usedCount = sortedSkills.length;
      const totalCount = allSkillDefs.length;

      let detail = t('insightTopSkills', top3.map((p) => { return p[0] + ' (' + fmtNum(p[1]) + t('unitCallCount') + ')'; }).join(', '));

      if (!hasHint && top3[0][1] >= 5) {
        detail += '\n' + t('insightNoArgHint', top3[0][0]);
      } else {
        detail += '\n' + t('insightSkillUsageRate', fmtNum(usedCount), fmtNum(totalCount), Math.round(usedCount / totalCount * 100));
      }

      insights.push({ icon: '🏆', title: t('insightUsagePatternTitle'), detail: detail });
    }

    // ── 2. Unused agents cleanup - name specific agents ──
    if (unusedAgents && unusedAgents.length > 0) {
      let names = unusedAgents.map((a) => { return a.name; });
      let detail = t('insightUnusedAgents', fmtNum(names.length), fmtNum(periodDays), names.join(', '));
      insights.push({ icon: '⚠️', title: t('insightUnusedCleanupTitle'), detail: detail });
    }

    // ── 3. Efficiency - agent-specific actionable suggestions ──
    const agentSuggestions = {
      'Explore': 'agentAdviceExplore',
      'general-purpose': 'agentAdviceGeneral',
      'Plan': 'agentAdvicePlan'
    };

    if (sortedAgents.length > 0) {
      const topAgent = sortedAgents[0];
      const topAgentName = topAgent[0];
      const topAgentCount = topAgent[1];
      const top3agents = sortedAgents.slice(0, 3);
      const totalAgentCalls = filteredAgents.length;

      if (topAgentCount >= 10) {
        const pct = Math.round(topAgentCount / totalAgentCalls * 100);
        const suggestion = agentSuggestions[topAgentName];

        let detail = t('insightTopAgents', top3agents.map((p) => { return p[0] + ' (' + fmtNum(p[1]) + t('unitCallCount') + ')'; }).join(', '), topAgentName, pct);

        if (suggestion) {
          detail += '\n' + t(suggestion);
        } else {
          detail += '\n' + t('insightAgentGenericAdvice');
        }

        insights.push({ icon: '💡', title: t('insightEfficiencyTitle'), detail: detail });
      } else {
        let detail = t('insightMostActiveAgent', topAgentName, fmtNum(topAgentCount) + t('unitCalls'));
        if (sortedAgents.length > 1) {
          detail += t('insightOtherAgentTypes', sortedAgents.length - 1);
        }
        insights.push({ icon: '🤖', title: t('insightTopAgentTitle'), detail: detail });
      }
    }

    // ── 4. Time analysis - peak hours with top skills in that window ──
    const hourCounts = new Array(24).fill(0);
    const hourSkills = {};
    const allTimedItems = [].concat(filteredSkills, filteredAgents);
    allTimedItems.forEach((s) => {
      if (s.timestamp) {
        let d = typeof s.timestamp === 'number' ? new Date(s.timestamp) : new Date(s.timestamp);
        if (!isNaN(d.getTime())) {
          let h = d.getHours();
          hourCounts[h]++;
          if (s.name) {
            if (!hourSkills[h]) hourSkills[h] = {};
            hourSkills[h][s.name] = (hourSkills[h][s.name] || 0) + 1;
          }
        }
      }
    });
    const maxHourCount = Math.max(...hourCounts);
    if (maxHourCount > 0) {
      const peakHours = [];
      hourCounts.forEach((c, h) => {
        if (c >= maxHourCount * 0.7 && c > 0) peakHours.push(h);
      });
      if (peakHours.length > 0) {
        const peakStr = peakHours.length <= 3
          ? peakHours.map(fmtHour).join(', ')
          : fmtHour(peakHours[0]) + '–' + fmtHour(peakHours[peakHours.length - 1]);

        // find top skills during peak hours
        const peakSkillCounts = {};
        peakHours.forEach((h) => {
          const hs = hourSkills[h] || {};
          Object.keys(hs).forEach((name) => {
            peakSkillCounts[name] = (peakSkillCounts[name] || 0) + hs[name];
          });
        });
        const peakTopSkills = Object.entries(peakSkillCounts).sort((a, b) => { return b[1] - a[1]; }).slice(0, 3);

        let detail = t('insightPeakDetail', peakStr);
        if (peakTopSkills.length > 0) {
          detail += '\n' + t('insightPeakTopItems', peakTopSkills.map((p) => { return p[0] + ' (' + p[1] + t('unitCallCount') + ')'; }).join(', '));
        }

        insights.push({ icon: '🕐', title: t('insightTimeTitle'), detail: detail });
      }
    }

    // ── 5. Plugin utilization - name unused plugin skills ──
    const plugins = sd.plugins || [];
    const activePlugins = plugins.filter((p) => { return p.enabled !== false; });
    if (activePlugins.length >= 2) {
      const usedSkillNames = {};
      filteredSkills.forEach((s) => { usedSkillNames[s.name] = true; });

      const unusedPluginSkills = allSkillDefs.filter((s) => {
        return s.plugin && !usedSkillNames[s.name];
      });
      const usedPluginSkills = allSkillDefs.filter((s) => {
        return s.plugin && usedSkillNames[s.name];
      });

      // group unused by plugin
      const unusedByPlugin = {};
      unusedPluginSkills.forEach((s) => {
        const pName = s.plugin || 'unknown';
        if (!unusedByPlugin[pName]) unusedByPlugin[pName] = [];
        unusedByPlugin[pName].push(s.name);
      });

      let detail = t('insightPluginDetail', fmtNum(usedPluginSkills.length), fmtNum(activePlugins.length));

      if (unusedPluginSkills.length > 0) {
        const pluginEntries = Object.entries(unusedByPlugin).slice(0, 3);
        detail += '\n' + t('insightUnusedLabel', '');
        detail += pluginEntries.map((entry) => {
          let names = entry[1].slice(0, 2).join(', ');
          if (entry[1].length > 2) names += t('insightPluginMore', entry[1].length - 2);
          return entry[0] + ' → ' + names;
        }).join('; ') + '.';
        detail += '\n' + t('insightPluginAdvice');
      }

      insights.push({ icon: '📦', title: t('insightPluginTitle'), detail: detail });
    }

    // ── 6. Memory management - type breakdown with specific advice ──
    const memoryItems = sd.memory || [];
    if (memoryItems.length >= 5) {
      const typeCounts = {};
      memoryItems.forEach((m) => {
        let mtype = m.type || 'reference';
        typeCounts[mtype] = (typeCounts[mtype] || 0) + 1;
      });
      const sortedTypes = Object.entries(typeCounts).sort((a, b) => { return b[1] - a[1]; });
      const breakdown = sortedTypes.map((p) => { return p[0] + ' ' + p[1] + t('unitItems'); }).join(', ');

      const memoryAdvice = {
        feedback: 'insightMemAdviceFeedback',
        project: 'insightMemAdviceProject',
        user: 'insightMemAdviceUser',
        reference: 'insightMemAdviceReference'
      };

      const topType = sortedTypes[0][0];
      let detail = t('insightMemoryDetail', fmtNum(memoryItems.length), breakdown);

      const advice = memoryAdvice[topType];
      if (advice) {
        detail += '\n' + t(advice);
      }

      insights.push({ icon: '💾', title: t('insightMemoryTitle'), detail: detail });
    }

    if (insights.length === 0) return '';

    let html = '<div class="section">'
      + '<div class="section-title">' + t('insights') + '</div>'
      + '<div class="insights-grid">';
    insights.forEach((ins) => {
      html += '<div class="insight-card">'
        + '<span class="insight-card-icon">' + ins.icon + '</span>'
        + '<div class="insight-card-body">'
        + '<div class="insight-card-title">' + escapeHtml(ins.title) + '</div>'
        + '<div class="insight-card-detail"><ul class="insight-list">' + escapeHtml(ins.detail).split('\n').map((line) => '<li>' + line + '</li>').join('') + '</ul></div>'
        + '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  const countOf = (r) => typeof r.count === 'number' ? r.count : 1;

  function countUsageList(list, days) {
    if (!list) return 0;
    return filterByPeriod(list, 'timestamp', days).reduce((s, r) => s + countOf(r), 0);
  }

  function calcChangeForList(list, days) {
    if ((days === 0 && !customDateRange) || customDateRange) return null;
    const now = new Date();
    const curStart = new Date(now);
    curStart.setDate(curStart.getDate() - days);
    const prevStart = new Date(curStart);
    prevStart.setDate(prevStart.getDate() - days);
    let cur = 0, prev = 0;
    for (const r of list) {
      const d = new Date(r.timestamp);
      const v = countOf(r);
      if (d >= curStart) cur += v;
      else if (d >= prevStart) prev += v;
    }
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  }

  function statCard(label, value, change, opts) {
    let changeHtml = '';
    if (change !== null && change !== undefined) {
      const cls = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
      const prefix = change > 0 ? '+' : '';
      changeHtml = '<div class="stat-change ' + cls + '">' + prefix + fmtNum(change) + t('vsPrevPeriod') + '</div>';
    }
    // badge: displayed in same style as change but with neutral color (for ratios/percentages)
    let badgeHtml = '';
    if (opts && opts.badge) {
      const badgeCls = 'stat-badge' + (opts.badgeColor ? ' stat-badge--' + opts.badgeColor : '');
      badgeHtml = '<div class="' + badgeCls + '">' + opts.badge + '</div>';
    }
    const useRaw = opts && opts.raw;
    const useSI = opts && opts.si;
    const displayValue = useRaw ? value : (useSI ? fmtCompact(value) : fmtNum(value));
    const rawHtml = !useRaw && useSI && value >= 1e4 ? '<div class="stat-raw">' + fmtNum(value) + '</div>' : '';
    let compareHtml = '';
    if (opts && opts.compare && typeof opts.compare === 'object') {
      compareHtml = '<div class="stat-compare">'
        + '<span class="stat-compare-label">' + opts.compare.label + '</span>'
        + '<span class="stat-compare-value">' + opts.compare.value + '</span>'
        + '</div>';
    }
    const valueStyle = (opts && opts.valueColor) ? ' style="color:' + opts.valueColor + '"' : '';
    const noteHtml = (opts && opts.note) ? '<div class="stat-note">' + opts.note + '</div>' : '';
    return '<div class="stat-card">'
      + '<div class="stat-label">' + label + '</div>'
      + '<div class="stat-value"' + valueStyle + '>' + displayValue + '</div>'
      + rawHtml
      + changeHtml + badgeHtml + compareHtml + noteHtml + '</div>';
  }

  function buildActivityMap(items, valueFn) {
    const map = {};
    items.forEach((item) => {
      let ts = item.timestamp;
      let key = '';
      if (typeof ts === 'string') key = ts.substring(0, 10);
      else if (typeof ts === 'number') key = new Date(ts).toISOString().substring(0, 10);
      if (key) map[key] = (map[key] || 0) + (valueFn ? valueFn(item) : 1);
    });
    return map;
  }

  function renderHeatmapFromMap(activityMap, days, unitLabel, useSI) {

    let endDate, numDays;
    if (customDateRange) {
      endDate = customDateRange.end;
      numDays = Math.ceil((customDateRange.end - customDateRange.start) / 86400000) + 1;
    } else if (days === 0) {
      const dataRange = getDataDateRange();
      if (dataRange) {
        endDate = dataRange.end;
        numDays = Math.ceil((dataRange.end - dataRange.start) / 86400000) + 1;
      } else {
        endDate = new Date();
        numDays = 90;
      }
    } else {
      endDate = new Date();
      numDays = days;
    }
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - numDays + 1);
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    let maxVal = 0;
    const tempDate = new Date(startDate);
    while (tempDate <= endDate) {
      let key = dateKey(tempDate);
      const val = activityMap[key] || 0;
      if (val > maxVal) maxVal = val;
      tempDate.setDate(tempDate.getDate() + 1);
    }

    let weeksHtml = '';
    const cur = new Date(startDate);
    while (cur <= endDate) {
      let weekHtml = '';
      for (let d = 0; d < 7; d++) {
        if (cur > endDate) {
          weekHtml += '<div class="heatmap-cell" style="visibility:hidden"></div>';
        } else {
          const key2 = dateKey(cur);
          let val2 = activityMap[key2] || 0;
          const level = maxVal === 0 ? 0 : Math.min(4, Math.ceil((val2 / maxVal) * 4));
          const dayNames = t('dayNames').split(',');
          const tooltip = key2 + ' (' + dayNames[cur.getDay()] + '): ' + (useSI ? fmtCompact(val2) : fmtNum(val2)) + ' ' + (unitLabel || t('activities'));
          weekHtml += '<div class="heatmap-cell" data-level="' + (val2 === 0 ? 0 : level) + '" data-tooltip="' + tooltip + '"></div>';
        }
        cur.setDate(cur.getDate() + 1);
      }
      weeksHtml += '<div class="heatmap-week">' + weekHtml + '</div>';
    }

    return '<div class="heatmap-container">'
      + '<div class="heatmap-grid">' + weeksHtml + '</div>'
      + '<div class="heatmap-labels">'
      + '<span>' + t('less') + '</span>'
      + '<div class="heatmap-cell" data-level="0"></div>'
      + '<div class="heatmap-cell" data-level="1"></div>'
      + '<div class="heatmap-cell" data-level="2"></div>'
      + '<div class="heatmap-cell" data-level="3"></div>'
      + '<div class="heatmap-cell" data-level="4"></div>'
      + '<span>' + t('more') + '</span>'
      + '</div></div>';
  }

  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ── Insights page ──
  // Render insight detail: if the string contains "text: item1, item2, ..." pattern,
  // split at the first colon and render items after it as inline tag chips.
  function renderInsightDetail(detail) {
    var colonIdx = detail.indexOf(': ');
    if (colonIdx === -1) return escapeHtml(detail);
    var prose = detail.slice(0, colonIdx + 2); // "30일간 호출이 없는 MCP 서버 5개: "
    var rest = detail.slice(colonIdx + 2);     // "naver-works-mcp, github, ..."
    // Only treat as list if it looks like comma-separated short tokens (no spaces within items, or short words)
    var items = rest.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    if (items.length < 2) return escapeHtml(detail);
    var chips = items.map(function(item) {
      return '<code class="insight-detail-chip">' + escapeHtml(item) + '</code>';
    }).join(' ');
    return '<span class="insight-detail-prose">' + escapeHtml(prose) + '</span>' + chips;
  }

  function renderInsightsPage() {
    var usage = getUsage();
    var sd = getScopeData();
    var allInsights = (typeof computeAllInsights === 'function')
      ? computeAllInsights(usage, currentPeriod, sd)
      : [];

    // Source filter buttons
    var sources = ['all', 'optimizer', 'anomaly', 'lint', 'cache'];
    var counts = { all: allInsights.length };
    sources.slice(1).forEach(function(src) {
      counts[src] = allInsights.filter(function(i) { return i.source === src; }).length;
    });

    // Severity summary counts
    var sevCounts = { high: 0, medium: 0, low: 0, info: 0 };
    allInsights.forEach(function(i) { if (sevCounts[i.severity] !== undefined) sevCounts[i.severity]++; });

    // Filter bar
    var filterHtml = '<div class="insight-filter-bar">';
    sources.forEach(function(src) {
      var label = src === 'all' ? t('insightsAll') : t('insightsSource_' + src);
      var isActive = activeInsightSource === src;
      filterHtml += '<button class="insight-filter-btn' + (isActive ? ' active' : '') + '" data-action="insight-filter" data-source="' + src + '">'
        + escapeHtml(label)
        + (counts[src] > 0 ? ' <span>' + fmtNum(counts[src]) + '</span>' : '')
        + '</button>';
    });

    // Severity summary (right-aligned via margin-left:auto on the element)
    var sevHtml = '<div class="insight-severity-summary">';
    if (sevCounts.high > 0)   sevHtml += '<span class="sev-high">● ' + fmtNum(sevCounts.high) + ' High</span>';
    if (sevCounts.medium > 0) sevHtml += '<span class="sev-medium">● ' + fmtNum(sevCounts.medium) + ' Medium</span>';
    if (sevCounts.low > 0)    sevHtml += '<span class="sev-low">● ' + fmtNum(sevCounts.low) + ' Low</span>';
    if (sevCounts.info > 0)   sevHtml += '<span class="sev-info">● ' + fmtNum(sevCounts.info) + ' Info</span>';
    sevHtml += '</div>';
    filterHtml += sevHtml + '</div>';

    // Filtered list
    var filtered = activeInsightSource === 'all'
      ? allInsights
      : allInsights.filter(function(i) { return i.source === activeInsightSource; });

    var listHtml = '';
    if (filtered.length === 0) {
      listHtml = '<div class="insight-empty">' + escapeHtml(t('insightsEmpty')) + '</div>';
    } else {
      listHtml = '<div class="insight-row-list">';
      filtered.forEach(function(ins) {
        // Click navigation
        var actionAttr = '';
        if (ins.source === 'optimizer') {
          actionAttr = ' data-action="nav" data-view="overview"';
        } else if (ins.source === 'lint') {
          actionAttr = ' data-action="nav" data-view="structure"';
        } else if (ins.source === 'anomaly' && ins.meta && ins.meta.date) {
          actionAttr = ' data-action="goto-anomaly-day" data-date="' + escapeHtml(ins.meta.date) + '"';
        }

        // Impact block — tokens + cost as labeled pairs
        var impactHtml = '';
        if (ins.impact && (ins.impact.tokens || ins.impact.cost)) {
          var isAnomaly = ins.source === 'anomaly';
          impactHtml = '<div class="insight-row-impact">';
          if (ins.impact.tokens) {
            impactHtml += '<div class="insight-impact-item">'
              + '<span class="insight-impact-label">' + (isAnomaly ? t('insImpactUsage') : t('insImpactSave')) + '</span>'
              + '<span class="insight-impact-val">' + (isAnomaly ? '' : '−') + fmtCompact(ins.impact.tokens) + '</span>'
              + '</div>';
          }
          if (ins.impact.cost) {
            impactHtml += '<div class="insight-impact-item">'
              + '<span class="insight-impact-label">' + t('insImpactCost') + '</span>'
              + '<span class="insight-impact-val">' + (isAnomaly ? '' : '−') + fmtCost(ins.impact.cost) + '</span>'
              + '</div>';
          }
          impactHtml += '</div>';
        }

        var sourceLabel = t('insightsSource_' + ins.source) || ins.source || '';
        listHtml += '<div class="insight-row" data-sev="' + escapeHtml(ins.severity || 'low') + '"' + actionAttr + '>'
          + '<span class="insight-row-dot" data-sev="' + escapeHtml(ins.severity || 'low') + '"></span>'
          + '<div class="insight-row-body">'
          + '<div class="insight-row-header">'
          + '<span class="insight-row-title">' + escapeHtml(ins.title || '') + '</span>'
          + '<span class="insight-source-chip" data-source="' + escapeHtml(ins.source || '') + '">' + escapeHtml(sourceLabel) + '</span>'
          + '</div>'
          + (ins.detail ? '<div class="insight-row-detail">' + renderInsightDetail(ins.detail) + '</div>' : '')
          + '</div>'
          + impactHtml
          + '</div>';
      });
      listHtml += '</div>';
    }

    var html = '<div class="page-header">'
      + '<h1 class="page-title">' + t('insights') + '</h1>'
      + '</div>'
      + '<div class="section">'
      + filterHtml
      + listHtml
      + '</div>';

    content.innerHTML = html;
    bindContentActions();

    // Wire filter buttons
    content.querySelectorAll('[data-action="insight-filter"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activeInsightSource = btn.dataset.source || 'all';
        renderInsightsPage();
      });
    });
  }

  // ── Help page ──
  function renderHelp() {
    function helpRow(titleKey, descKey, icon) {
      return '<div class="help-row">'
        + '<span class="help-row-icon">' + icon + '</span>'
        + '<span class="help-row-title">' + t(titleKey) + '</span>'
        + '<span class="help-row-desc">' + t(descKey) + '</span>'
        + '</div>';
    }

    let html = '<div class="page-header">'
      + '<h1>❓ ' + t('helpTitle') + ' <a href="https://github.com/netil/oh-my-hi" target="_blank" style="font-size:14px;font-weight:400;color:var(--text-secondary);text-decoration:none;vertical-align:middle;margin-left:8px">GitHub ↗</a></h1>'
      + '</div>';

    // Parameters
    html += '<div class="section">'
      + '<div class="section-title">' + t('helpParams') + '</div>'
      + '<div class="card help-card">'
      + '<table class="config-table help-param-table" style="width:100%"><tbody>'
      + '<tr><td class="help-param-code"><code>/omh</code></td><td>' + t('helpParamDefault') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --data-only</code></td><td>' + t('helpParamDataOnly') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --enable-auto</code></td><td>' + t('helpParamEnableAuto') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --disable-auto</code></td><td>' + t('helpParamDisableAuto') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --update</code></td><td>' + t('helpParamUpdate') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --status</code></td><td>' + t('helpParamStatus') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh &lt;path&gt; [path...]</code></td><td>' + t('helpParamPaths') + '</td></tr>'
      + '</tbody></table>'
      + '</div></div>';

    // Breadcrumb helper: "부모 › 아이콘 라벨"
    function breadcrumb(parent, icon, label) {
      return '<span class="help-breadcrumb">' + parent + ' ›</span> ' + icon + ' ' + label;
    }

    // 🪙 토큰
    html += '<div class="section">'
      + '<div class="section-title">🪙 ' + t('tokens') + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpTokens', 'helpTokensDesc', '🪙')
      + helpRow('helpActivity', 'helpActivityDesc', '📊')
      + helpRow('helpCommands', 'helpCommandsDesc', '⌨️')
      + helpRow('helpBudgetBar', 'helpBudgetBarDesc', '▬')
      + helpRow('helpBudgetTable', 'helpBudgetTableDesc', '📋')
      + '</div></div>';

    // 🪙 토큰 > 💰 비용
    html += '<div class="section">'
      + '<div class="section-title">' + breadcrumb('🪙 ' + t('tokens'), '💰', t('tokensCost')) + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpUsageBar', 'helpUsageBarDesc', '▭')
      + helpRow('helpLogScale', 'helpLogScaleDesc', '📐')
      + helpRow('helpCostProjection', 'helpCostProjectionDesc', '💰')
      + '</div></div>';

    // 🪙 토큰 > 📊 항목별 분석
    html += '<div class="section">'
      + '<div class="section-title">' + breadcrumb('🪙 ' + t('tokens'), '📊', t('bdTitle')) + '</div>'
      + '<div class="card" style="padding:16px 20px">'
      + '<p style="margin:0 0 12px;font-size:14px;color:var(--text-secondary);line-height:1.6">' + t('helpBreakdownDesc') + '</p>'
      + '<div class="help-list" style="border:none;padding:0;margin:0">'
      + helpRow('helpBreakdownStartup', 'helpBreakdownStartupDesc', '⚡')
      + helpRow('helpBreakdownType', 'helpBreakdownTypeDesc', '📊')
      + helpRow('helpBreakdownTop5', 'helpBreakdownTop5Desc', '🏆')
      + helpRow('helpBreakdownAccordion', 'helpBreakdownAccordionDesc', '▶')
      + '</div>'
      + '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">'
      + '<a href="#breakdown" style="font-size:13px;font-weight:600;color:var(--accent);text-decoration:none">→ ' + t('bdTitle') + '</a>'
      + '</div>'
      + '</div></div>';

    // 사용 분석 > 🪟 컨텍스트 익스플로러
    html += '<div class="section">'
      + '<div class="section-title">' + breadcrumb(t('usageAnalysis'), '🪟', t('helpContextExplorer')) + '</div>'
      + '<div class="card" style="padding:16px 20px">'
      + '<p style="margin:0 0 12px;font-size:14px;color:var(--text-secondary);line-height:1.6">' + t('helpContextExplorerDesc') + '</p>'
      + '<div class="help-list" style="border:none;padding:0;margin:0">'
      + helpRow('helpCweSession', 'helpCweSessionDesc', '⏵')
      + helpRow('helpCweExample', 'helpCweExampleDesc', '▶')
      + helpRow('helpCweBar', 'helpCweBarDesc', '▬')
      + helpRow('helpCweTimeline', 'helpCweTimelineDesc', '⋮')
      + helpRow('helpCweSessionInfo', 'helpCweSessionInfoDesc', 'ℹ')
      + '</div>'
      + '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">'
      + '<a href="#context" style="font-size:13px;font-weight:600;color:var(--accent);text-decoration:none">→ ' + t('helpContextExplorer') + '</a>'
      + '</div>'
      + '</div></div>';

    // 사용 분석 > 💬 프롬프트
    html += '<div class="section">'
      + '<div class="section-title">' + breadcrumb(t('usageAnalysis'), '💬', t('tokensPrompt')) + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpPromptStats', 'helpPromptStatsDesc', '📝')
      + helpRow('helpLatency', 'helpLatencyDesc', '⏱️')
      + '</div></div>';

    // 사용 분석 > 📋 세션
    html += '<div class="section">'
      + '<div class="section-title">' + breadcrumb(t('usageAnalysis'), '📋', t('tokensSession')) + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpRegression', 'helpRegressionDesc', '⚠️')
      + helpRow('helpEfficiency', 'helpEfficiencyDesc', '⚡')
      + '</div></div>';

    // 💡 인사이트 & 최적화
    html += '<div class="section">'
      + '<div class="section-title">💡 ' + t('helpInsightsTitle') + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpInsightsPage', 'helpInsightsPageDesc', '💡')
      + helpRow('helpAnomalyDetection', 'helpAnomalyDetectionDesc', '⚠️')
      + helpRow('helpBudgetAlerts', 'helpBudgetAlertsDesc', '🎯')
      + helpRow('helpWeeklyDigest', 'helpWeeklyDigestDesc', '📊')
      + helpRow('helpRegression', 'helpRegressionDesc', '📉')
      + helpRow('helpEfficiency', 'helpEfficiencyDesc', '⚡')
      + '</div></div>';

    // 🪙 토큰 > 📦 캐시
    html += '<div class="section">'
      + '<div class="section-title">' + breadcrumb('🪙 ' + t('tokens'), '📦', t('tokensCache')) + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpCachePage', 'helpCachePageDesc', '📦')
      + '</div></div>';

    // 📤 내보내기 & 검색
    html += '<div class="section">'
      + '<div class="section-title">📤 ' + t('helpExport') + ' / 🔍 ' + t('helpFtsSearch') + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpExport', 'helpExportDesc', '📤')
      + helpRow('helpFtsSearch', 'helpFtsSearchDesc', '🔍')
      + helpRow('helpMultiMachine', 'helpMultiMachineDesc', '🖥️')
      + '</div></div>';

    // Data parsing reference
    html += '<div class="section">'
      + '<div class="section-title">' + t('helpDataSources') + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpConfigFiles', 'helpConfigFilesDesc', '📄')
      + helpRow('helpSkills', 'helpSkillsDesc', '🧠')
      + helpRow('helpAgents', 'helpAgentsDesc', '🤖')
      + helpRow('helpPlugins', 'helpPluginsDesc', '📦')
      + helpRow('helpHooks', 'helpHooksDesc', '🪝')
      + helpRow('helpMemory', 'helpMemoryDesc', '💾')
      + helpRow('helpMcpServers', 'helpMcpServersDesc', '🔌')
      + helpRow('helpRules', 'helpRulesDesc', '📏')
      + helpRow('helpCustomCommands', 'helpCustomCommandsDesc', '⌨️')
      + helpRow('helpTeams', 'helpTeamsDesc', '👥')
      + helpRow('helpPlans', 'helpPlansDesc', '📋')
      + helpRow('helpTodos', 'helpTodosDesc', '✅')
      + helpRow('helpScopes', 'helpScopesDesc', '🗂️')
      + '</div></div>';

    html += '<div class="generated-at">oh-my-hi v' + __VERSION__ + ' · <a href="https://github.com/netil/oh-my-hi" target="_blank" style="color:inherit">GitHub</a></div>';
    content.innerHTML = html;
  }

  // ── Structure page ──
  function getLintWarnings() {
    return getScopeData().lint || [];
  }

  function lintMessage(w) {
    return t.apply(null, ['lint_' + w.code].concat(w.args || []));
  }

  function renderStructure() {
    let sd = getScopeData();
    let html = '<div class="page-header">'
      + '<h1>' + t('structure') + '</h1>'
      + '<div class="subtext">' + t('structureSub') + '</div>'
      + '</div>';

    // Health check summary
    const lint = getLintWarnings();
    html += '<div class="section">'
      + '<div class="section-title">' + t('lintTitle') + '</div>';
    if (lint.length === 0) {
      html += '<div class="card lint-card"><div class="lint-all-clear">✅ ' + t('lintAllClear') + '</div></div>';
    } else {
      html += '<div class="card lint-card">'
        + '<div class="lint-summary">⚠️ ' + t('lintWarnCount', fmtNum(lint.length)) + '</div>';
      CATEGORIES.forEach((cat) => {
        const group = lint.filter((w) => { return w.category === cat.key; });
        if (group.length === 0) return;
        html += '<div class="lint-group">'
          + '<div class="lint-group-header">'
          + '<span class="tree-icon">' + cat.icon + '</span>'
          + '<span class="lint-group-label">' + getCatLabel(cat) + '</span>'
          + '<span class="lint-warn-badge">' + fmtNum(group.length) + '</span>'
          + '</div>';
        group.forEach((w) => {
          html += '<div class="lint-item">'
            + '<div class="lint-item-msg">' + escapeHtml(lintMessage(w)) + '</div>'
            + '<div class="lint-item-file">' + escapeHtml(w.file || '') + '</div>'
            + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Flowchart
    html += '<div class="section">'
      + '<div class="section-title">' + t('flowTitle') + '</div>'
      + '<div class="card flowchart-card"><svg id="flowchart-svg"></svg></div>'
      + '</div>';

    // File tree
    html += '<div class="section">'
      + '<div class="section-title">' + t('fileTree') + '</div>'
      + '<div class="tree">';

    CATEGORIES.forEach((cat) => {
      let items = sd[cat.key] || [];
      if (items.length === 0) return;
      const isExpanded = expandedCategories['tree_' + cat.key] || false;
      const catWarns = lint.filter((w) => { return w.category === cat.key; }).length;

      html += '<div class="tree-category">'
        + '<div class="tree-category-header" data-action="toggle-tree" data-tree-key="' + cat.key + '">'
        + '<span class="tree-icon">' + cat.icon + '</span>'
        + '<span class="tree-label">' + getCatLabel(cat) + '</span>'
        + '<span class="tree-count" style="background:' + cat.color + '">' + fmtNum(items.length) + '</span>'
        + (catWarns > 0 ? '<span class="lint-warn-badge" title="' + escapeHtml(t('lintWarnCount', fmtNum(catWarns))) + '">⚠️ ' + fmtNum(catWarns) + '</span>' : '')
        + '<span class="tree-chevron' + (isExpanded ? ' expanded' : '') + '">▶</span>'
        + '</div>'
        + '<div class="tree-items' + (isExpanded ? ' open' : '') + '" data-tree-items="' + cat.key + '">';

      items.forEach((item) => {
        let name = getItemName(cat.key, item);
        let extraBadge = '';
        if (cat.key === 'plugins') {
          extraBadge = item.enabled !== false
            ? '<span class="tree-item-badge badge-enabled">✅ Active</span>'
            : '<span class="tree-item-badge badge-disabled">⬜ Inactive</span>';
        }
        html += '<div class="tree-item" data-action="goto-detail" data-category="' + cat.key + '" data-name="' + escapeHtml(name) + '">'
          + '<span class="tree-item-dot" style="background:' + cat.color + '"></span>'
          + '<span class="tree-item-name">' + escapeHtml(name) + '</span>'
          + extraBadge + '</div>';
      });

      html += '</div></div>';
    });

    html += '</div></div>';
    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';

    content.innerHTML = html;

    // Bind tree toggles
    content.querySelectorAll('[data-action="toggle-tree"]').forEach((el) => {
      el.addEventListener('click', () => {
        let key = el.dataset.treeKey;
        expandedCategories['tree_' + key] = !expandedCategories['tree_' + key];
        const itemsEl = content.querySelector('[data-tree-items="' + key + '"]');
        const chevron = el.querySelector('.tree-chevron');
        if (itemsEl) itemsEl.classList.toggle('open');
        if (chevron) chevron.classList.toggle('expanded');
      });
    });

    bindContentActions();
    drawFlowchart();
  }

  // ── Flowchart (hierarchical) ──
  function drawFlowchart() {
    const svg = document.getElementById('flowchart-svg');
    if (!svg) return;

    const sd = getScopeData();

    const S = 'http://www.w3.org/2000/svg';
    // Horizontal layout constants
    const nodeW = 148, nodeH = 50, nodeRx = 6;
    const pad = 24, vGap = 10, groupPad = 16, groupRx = 8, hGap = 32;
    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    // Read live CSS variables for theme compatibility
    const cs = getComputedStyle(document.documentElement);
    const isDark = document.body.classList.contains('dark');
    const bgCard   = cs.getPropertyValue('--card-bg').trim()   || (isDark ? '#1c1c1b' : '#ffffff');
    const bgPage   = cs.getPropertyValue('--bg').trim()        || (isDark ? '#111110' : '#f5f5f4');
    const clrBorder= cs.getPropertyValue('--border').trim()    || (isDark ? '#2a2927' : '#e7e5e4');
    const clrBorderStrong = cs.getPropertyValue('--border-strong').trim() || (isDark ? '#3a3937' : '#d6d3d1');
    const clrText  = cs.getPropertyValue('--text').trim()      || (isDark ? '#e7e5e4' : '#1c1917');
    const clrMuted = cs.getPropertyValue('--text-secondary').trim() || (isDark ? '#a8a29e' : '#78716c');
    const clrTertiary = cs.getPropertyValue('--text-tertiary').trim() || (isDark ? '#78716c' : '#a8a29e');
    const clrAccent= cs.getPropertyValue('--accent').trim()    || (isDark ? '#14b8a6' : '#0f766e');
    const arrowColor = clrBorderStrong;

    // Category accent colors (from CSS vars, matching sidebar)
    const catColors = {
      claudemd: cs.getPropertyValue('--color-skills').trim()     || '#2563eb',
      rules:    cs.getPropertyValue('--color-rules').trim()      || '#6b7280',
      memory:   cs.getPropertyValue('--color-memory').trim()     || '#0284c7',
      hooks:    cs.getPropertyValue('--color-hooks').trim()      || '#d97706',
      skills:   cs.getPropertyValue('--color-agents').trim()     || '#7c3aed',
      commands: cs.getPropertyValue('--color-principles').trim() || '#4f46e5',
      mcp:      cs.getPropertyValue('--color-mcp').trim()        || '#dc2626',
    };

    // --- Data ---
    let groups = [
      { id: 'context', label: t('flowContextGroup'),
        children: [
          { id: 'claudemd', label: 'CLAUDE.md',      nav: 'configFiles', count: (sd.configFiles || []).length },
          { id: 'rules',    label: t('flowRules'),    nav: 'rules',       count: (sd.rules || []).length + (sd.principles || []).length },
          { id: 'memory',   label: t('flowMemory'),   nav: 'memory',      count: (sd.memory || []).length },
        ]
      },
      { id: 'event', label: t('flowEventGroup'),
        children: [
          { id: 'hooks', label: t('flowHooksNode'), nav: 'hooks', count: (sd.hooks || []).length },
        ]
      },
      { id: 'invoke', label: t('flowInvokeGroup'),
        children: [
          { id: 'skills',   label: t('flowSkillsNode'),   nav: 'skills',     count: (sd.skills || []).length + (sd.agents || []).length },
          { id: 'commands', label: t('flowCommandsNode'), nav: 'commands',    count: (sd.commands || []).length },
          { id: 'mcp',      label: t('flowMcpNode'),      nav: 'mcpServers',  count: (sd.mcpServers || []).length },
        ]
      },
    ];
    groups.forEach((g) => { g.children = g.children.filter((c) => c.count === undefined || c.count > 0); });
    groups = groups.filter((g) => g.children.length > 0);

    // --- Horizontal layout ---
    // Children stack vertically inside each group; groups flow left → right.
    const labelH = 24;  // group label area height

    groups.forEach((g) => {
      g.innerH = g.children.length * nodeH + (g.children.length - 1) * vGap;
      g.w = nodeW + groupPad * 2;
      g.h = labelH + groupPad + g.innerH + groupPad;
    });

    const maxGroupH = groups.reduce(function(m, g) { return Math.max(m, g.h); }, 0);
    const termH = nodeH;          // prompt / output node height
    const svgH = Math.max(maxGroupH, termH) + pad * 2;

    // Horizontal positions
    const promptNode = { id: 'prompt', label: t('flowPromptNode'), w: 120, h: termH };
    const outputNode = { id: 'output', label: t('flowOutputNode'), w: 110, h: termH };

    let curX = pad;
    promptNode.x = curX; promptNode.y = svgH / 2 - termH / 2;
    curX += promptNode.w + hGap;

    groups.forEach((g) => {
      g.x = curX; g.y = svgH / 2 - g.h / 2;
      var startY = g.y + labelH + groupPad;
      g.children.forEach((c) => {
        c.x = g.x + groupPad; c.y = startY; c.w = nodeW; c.h = nodeH;
        startY += nodeH + vGap;
      });
      curX += g.w + hGap;
    });

    outputNode.x = curX; outputNode.y = svgH / 2 - termH / 2;
    curX += outputNode.w + pad;

    const svgW = curX;
    svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.innerHTML = '';

    // --- Defs: arrowhead + drop shadows ---
    const defs = document.createElementNS(S, 'defs');

    const marker = document.createElementNS(S, 'marker');
    marker.setAttribute('id', 'fc-arrow'); marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '5'); marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '2.5'); marker.setAttribute('orient', 'auto');
    const ap = document.createElementNS(S, 'path');
    ap.setAttribute('d', 'M0,0 L7,2.5 L0,5 Z');
    ap.setAttribute('fill', arrowColor); marker.appendChild(ap); defs.appendChild(marker);

    const filter = document.createElementNS(S, 'filter');
    filter.setAttribute('id', 'fc-shadow'); filter.setAttribute('x', '-5%'); filter.setAttribute('y', '-10%');
    filter.setAttribute('width', '110%'); filter.setAttribute('height', '130%');
    const fe = document.createElementNS(S, 'feDropShadow');
    fe.setAttribute('dx', '0'); fe.setAttribute('dy', '1'); fe.setAttribute('stdDeviation', '1.5');
    fe.setAttribute('flood-color', isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)');
    filter.appendChild(fe); defs.appendChild(filter);
    svg.appendChild(defs);

    // --- Draw helpers ---
    // Horizontal bezier arrow: exits from right edge of source, enters left edge of target
    function drawHArrow(x1, y1, x2, y2) {
      var midX = (x1 + x2) / 2;
      var path = document.createElementNS(S, 'path');
      path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + midX + ',' + y1 + ' ' + midX + ',' + y2 + ' ' + x2 + ',' + y2);
      path.setAttribute('stroke', arrowColor); path.setAttribute('stroke-width', '1.5');
      path.setAttribute('fill', 'none'); path.setAttribute('marker-end', 'url(#fc-arrow)');
      svg.appendChild(path);
    }

    // Card node: white bg + left accent bar
    function drawNode(n, accentColor, isSpecial) {
      var g = document.createElementNS(S, 'g');
      g.setAttribute('class', 'flowchart-node');
      if (n.nav) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', function() {
          currentView = n.nav; currentDetail = null;
          expandedCategories[n.nav] = true; pushState(true); render();
        });
      }
      var rect = document.createElementNS(S, 'rect');
      rect.setAttribute('x', n.x); rect.setAttribute('y', n.y);
      rect.setAttribute('width', n.w); rect.setAttribute('height', n.h);
      rect.setAttribute('rx', nodeRx);
      rect.setAttribute('fill', isSpecial ? accentColor : bgCard);
      rect.setAttribute('stroke', isSpecial ? 'none' : clrBorder);
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('filter', 'url(#fc-shadow)');
      g.appendChild(rect);

      // No decorative accent bar — category color applied to label text only

      var hasCount = n.count !== undefined;
      // Category nodes: use accent color for label text; special nodes use white
      var textColor = isSpecial ? '#fff' : (accentColor || clrText);
      var offsetX = 0;
      var txt = document.createElementNS(S, 'text');
      txt.setAttribute('x', n.x + n.w / 2 + offsetX);
      txt.setAttribute('y', n.y + n.h / 2 + (hasCount ? -5 : 5));
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', textColor);
      txt.setAttribute('font-size', '13'); txt.setAttribute('font-weight', '600');
      txt.setAttribute('font-family', font); txt.textContent = n.label; g.appendChild(txt);

      if (hasCount) {
        var ct = document.createElementNS(S, 'text');
        ct.setAttribute('x', n.x + n.w / 2 + offsetX);
        ct.setAttribute('y', n.y + n.h / 2 + 12);
        ct.setAttribute('text-anchor', 'middle');
        ct.setAttribute('fill', isSpecial ? 'rgba(255,255,255,0.75)' : clrMuted);
        ct.setAttribute('font-size', '11'); ct.setAttribute('font-family', font);
        ct.textContent = n.count; g.appendChild(ct);
      }
      svg.appendChild(g);
    }

    // Per-group tint colors (bg + border), themed
    var groupTints = {
      context: {
        bg:     isDark ? 'rgba(37,99,235,0.12)'  : 'rgba(37,99,235,0.07)',
        border: isDark ? 'rgba(37,99,235,0.35)'  : 'rgba(37,99,235,0.22)',
        label:  isDark ? '#93c5fd'                : '#1d4ed8',
      },
      event: {
        bg:     isDark ? 'rgba(217,119,87,0.12)' : 'rgba(217,119,87,0.08)',
        border: isDark ? 'rgba(217,119,87,0.35)' : 'rgba(217,119,87,0.25)',
        label:  isDark ? '#fdba74'                : '#c2410c',
      },
      invoke: {
        bg:     isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.07)',
        border: isDark ? 'rgba(124,58,237,0.35)' : 'rgba(124,58,237,0.22)',
        label:  isDark ? '#c4b5fd'                : '#6d28d9',
      },
    };
    // User Prompt: stone-500 fill (more visible than border-strong)
    var promptFill = isDark ? '#57534e' : '#78716c';

    // --- Draw ---
    drawNode(promptNode, promptFill, true);

    // prompt → first group (right edge of prompt → left edge of group, at vertical centers)
    if (groups.length > 0) {
      drawHArrow(promptNode.x + promptNode.w, promptNode.y + promptNode.h / 2,
                 groups[0].x, groups[0].y + groups[0].h / 2);
    }

    groups.forEach((g, gi) => {
      var tint = groupTints[g.id] || { bg: bgPage, border: clrBorder };
      // Group container
      var grect = document.createElementNS(S, 'rect');
      grect.setAttribute('x', g.x); grect.setAttribute('y', g.y);
      grect.setAttribute('width', g.w); grect.setAttribute('height', g.h);
      grect.setAttribute('rx', groupRx); grect.setAttribute('fill', tint.bg);
      grect.setAttribute('stroke', tint.border); grect.setAttribute('stroke-width', '1.5');
      svg.appendChild(grect);

      var glabel = document.createElementNS(S, 'text');
      glabel.setAttribute('x', g.x + groupPad);
      glabel.setAttribute('y', g.y + 16);
      glabel.setAttribute('fill', tint.label || clrMuted);
      glabel.setAttribute('font-size', '9');
      glabel.setAttribute('font-weight', '600');
      glabel.setAttribute('letter-spacing', '0.07em');
      glabel.setAttribute('font-family', font);
      glabel.textContent = g.label.toUpperCase();
      svg.appendChild(glabel);

      g.children.forEach((c) => { drawNode(c, catColors[c.id] || clrAccent, false); });

      // Arrow to next group: right edge → left edge at vertical centers
      if (gi < groups.length - 1) {
        drawHArrow(g.x + g.w, g.y + g.h / 2,
                   groups[gi + 1].x, groups[gi + 1].y + groups[gi + 1].h / 2);
      }
    });

    // last group → output
    if (groups.length > 0) {
      var lg = groups[groups.length - 1];
      drawHArrow(lg.x + lg.w, lg.y + lg.h / 2,
                 outputNode.x, outputNode.y + outputNode.h / 2);
    }
    drawNode(outputNode, clrAccent, true);
  }

  // ── Context Window Explorer ──
  // Ported from https://code.claude.com/docs/en/context-window (interactive simulation).
  // Single source of truth for events/gates/meta; renders via innerHTML and updates via closure state.
  function renderContextExplorer() {
    const MAX = 200000;        // standard Claude Code context window
    const BIG_MAX = 1000000;   // 1M-context models (Opus/Sonnet 4.6 [1m])
    const STARTUP_END = 0.2;

    // Pull real environment stats (from computeContextStats in the build script).
    // For any event marked with `statKey`, we override the illustrative default
    // with the measured value. Zero-valued stats still get shown (they are informative).
    const stats = getScopeData().contextStats || {};

    // Each event has an `id` used to look up `cwe_ev{id}_label`, `_desc`, and optionally `_tip`.
    // `statKey` points to a field in `stats` that overrides `tokens` (or `subTokens` for sub events).
    // EXAMPLE_EVENTS / EXAMPLE_GATES / KIND_META are defined in
    // templates/context-example.mjs and prepended to this file at build time.
    // They're treated as read-only constants here; update the .mjs source
    // when adding new events or kinds.

    const VIS_META = {
      hidden: { labelKey: 'cwe_visHidden', subKey: 'cwe_visHiddenSub' },
      brief:  { labelKey: 'cwe_visBrief',  subKey: 'cwe_visBriefSub' },
      full:   { labelKey: 'cwe_visFull',   subKey: 'cwe_visFullSub' }
    };

    // Provider-aware legend label: Codex's config file is AGENTS.md and its
    // assistant is Codex, not CLAUDE.md / Claude.
    const cweLabel = (key) => {
      if (scopeProvider(currentScope) === 'codex') {
        if (key === 'cwe_legClaudeMd') return t('cwe_legAgentsMd');
        if (key === 'cwe_legClaude') return t('cwe_legCodex');
      }
      return t(key);
    };

    const LEGEND = [
      { c: '#6B6964', labelKey: 'cwe_legSystem' },   { c: '#6A9BCC', labelKey: 'cwe_legClaudeMd' },
      { c: '#E8A45C', labelKey: 'cwe_legMemory' },   { c: '#D4A843', labelKey: 'cwe_legSkills' },
      { c: '#9B7BC4', labelKey: 'cwe_legMcp' },      { c: '#4A9B8E', labelKey: 'cwe_legRules' },
      { c: '#558A42', labelKey: 'cwe_legYou' },      { c: '#8A8880', labelKey: 'cwe_legFiles' },
      { c: '#A09E96', labelKey: 'cwe_legOutput' },   { c: '#D97757', labelKey: 'cwe_legClaude' },
      { c: '#B8860B', labelKey: 'cwe_legHooks' }
    ];

    // Helpers: fetch localized label/desc/tip for example events.
    function shortModel(m) {
      if (!m) return '';
      return m.replace(/^claude-/, '').replace(/-\d{8,}$/, '');
    }
    function fmtClock(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    const evtLabel = (e) => {
      if (e.isSession) {
        if (e.kind === 'compact') return t('cwe_compactionDetected');
        if (e.kind === 'user') return t('cwe_sessionUserTurn');
        return e.contextName || 'turn';
      }
      return t('cwe_ev' + e.id + '_label');
    };
    const evtDesc  = (e) => {
      if (e.isSession) {
        if (e.kind === 'compact') return t('cwe_compactionDesc');
        return t('cwe_sessionEvtDesc', shortModel(e.model), fmtClock(e.timestamp), fmt(e.cumulative));
      }
      return t('cwe_ev' + e.id + '_desc');
    };
    const evtTip   = (e) => (!e.isSession && e.hasTip) ? t('cwe_ev' + e.id + '_tip') : null;
    function resolveStat(statKey) {
      if (!statKey) return null;
      if (statKey === 'mcpPlusSkills') {
        const a = stats.mcpToolsTokens, b = stats.skillsDescTokens;
        if (a == null && b == null) return null;
        return (a || 0) + (b || 0);
      }
      return stats[statKey] != null ? stats[statKey] : null;
    }
    // Returns final tokens used for an event (stat → real, else default).
    function evtTokens(e) {
      if (e.isSession) return e.tokens || 0;
      if (e.subStat) return e.tokens; // sub events override subTokens instead
      const real = resolveStat(e.statKey);
      return real != null ? real : e.tokens;
    }
    function evtSubTokens(e) {
      if (!e.subStat) return e.subTokens || 0;
      const real = resolveStat(e.statKey);
      return real != null ? real : (e.subTokens || 0);
    }

    // Build the list of "sessions that can be replayed" — sessions with at least 2 token
    // entries so there is a meaningful timeline. Each entry carries a short preview
    // of the first user prompt so the dropdown is recognizable, not just a hash.
    // Thin closure wrappers around the pure helpers defined in
    // templates/session-events.mjs (inlined by the build). These shadow the
    // module-level names so the rest of renderContextExplorer can call them
    // with the existing zero-arg / single-arg signatures. The logic itself
    // lives in the testable module — don't put business rules here.
    const _listReplayableSessionsPure = listReplayableSessions;
    const _mapSessionCtxPure = mapSessionCtx;
    const _buildSessionEventsPure = buildSessionEvents;
    function listReplayableSessionsScoped() {
      return _listReplayableSessionsPure(getUsage());
    }
    function buildSessionEventsScoped(sessionId) {
      const contextStats = (getScopeData() || {}).contextStats || {};
      const labels = {
        ev1: t('cwe_ev1_label'),
        ev2: t('cwe_ev2_label'),
        ev3: t('cwe_ev3_label'),
        ev4: t('cwe_ev4_label'),
        ev5: t('cwe_ev5_label'),
        ev6: t('cwe_ev6_label'),
        ev7: t('cwe_ev7_label'),
        principles: t('catPrinciples'),
      };
      return _buildSessionEventsPure(sessionId, getUsage(), contextStats, labels);
    }

    // Build a timeline of events from a real session's tokenEntries.
    // Each API turn in the conversation becomes one event — see the extracted
    // buildSessionEvents in templates/session-events.mjs for the details.

    // Delegate to the canonical fmtCompact so Context Explorer numbers follow
    // the same Intl.NumberFormat + SI rules as the rest of the dashboard.
    // Kept as a local alias to minimize churn at the call sites.
    const fmt = fmtCompact;
    const renderCode = (s) => {
      if (!s) return '';
      return escapeHtml(s).split('`').map((p, i) => i % 2 === 1
        ? '<code class="cw-code">' + p + '</code>' : p).join('');
    };

    // ── State ──
    const state = {
      time: 0, playing: false, hovIdx: null, selIdx: null, hovCat: null,
      gatesPassed: 0, hasInteracted: false, isFullscreen: false, rafId: null, lastTs: null,
      // 'example' = fixed scripted scenario · 'session' = real session replay.
      mode: 'example',
      sessionId: null,
      sessionEvents: [],
      // Effective context budget — 200K for standard sessions, 1M when the
      // selected session's peak inputTokens goes beyond 200K (1m-context model).
      budget: MAX
    };

    // Accessors that return the events/gates for the current mode.
    // Session mode has no gates (pure replay) and its events are built on demand.
    function activeEvents() { return state.mode === 'session' ? state.sessionEvents : EXAMPLE_EVENTS; }
    function activeGates()  { return state.mode === 'session' ? [] : EXAMPLE_GATES; }

    // Cancel any previous animation / global handlers on re-entry
    // (renderContent() already runs this, but keep the explicit call so
    // direct re-entry paths stay safe).
    teardownContextExplorer();

    // ── Render shell (static structure + styles) ──
    // The <style> block below defines only the --cw-* CSS custom properties that
    // drive the component's light/dark theme. All layout and utility styles live
    // in templates/styles.css (the cw-* section) and are shipped in the build.
    content.innerHTML = ''
      + '<style>'
      + '.cw-root {'
      + '  --cw-bg: #FAFAF8; --cw-text: #1A1918; --cw-text-2: #3D3C38; --cw-text-3: #5E5D59;'
      + '  --cw-text-dim: #6E6C64; --cw-text-faint: #8A8880;'
      + '  --cw-surface: rgba(0,0,0,0.025); --cw-surface-2: rgba(0,0,0,0.04);'
      + '  --cw-border: rgba(0,0,0,0.08); --cw-track: rgba(0,0,0,0.04);'
      + '  --cw-hover: rgba(0,0,0,0.04); --cw-rail: rgba(0,0,0,0.08);'
      + '  --cw-scrollbar: rgba(0,0,0,0.22);'
      + '  --cw-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;'
      + '  background: var(--cw-bg); border-radius: 12px; overflow: hidden;'
      + '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;'
      + '  color: var(--cw-text); border: 1px solid var(--cw-border);'
      + '  display: flex; flex-direction: column;'
      + '  height: calc(100vh - 64px); min-height: 850px;'
      + '}'
      + 'body.dark .cw-root {'
      + '  --cw-bg: #111110; --cw-text: #E8E6DC; --cw-text-2: #B8B6AE; --cw-text-3: #9C9A92;'
      + '  --cw-text-dim: #8A8880; --cw-text-faint: #6E6C64;'
      + '  --cw-surface: rgba(255,255,255,0.02); --cw-surface-2: rgba(255,255,255,0.015);'
      + '  --cw-border: rgba(255,255,255,0.06); --cw-track: rgba(255,255,255,0.03);'
      + '  --cw-hover: rgba(255,255,255,0.04); --cw-rail: rgba(255,255,255,0.04);'
      + '  --cw-scrollbar: rgba(255,255,255,0.18);'
      + '}'
      + '.cw-root:fullscreen { height: 100vh; border-radius: 0; }'
      + '.cw-scroll::-webkit-scrollbar { width: 6px; }'
      + '.cw-scroll::-webkit-scrollbar-track { background: transparent; }'
      + '.cw-scroll::-webkit-scrollbar-thumb { background: var(--cw-scrollbar); border-radius: 3px; }'
      + '@keyframes cw-blink { 50% { opacity: 0; } }'
      + '@keyframes cw-fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }'
      + '.cw-compacted-row { animation: cw-fadein 0.3s ease-out backwards; }'
      + '.cw-code { font-family: var(--cw-font-mono); font-size: 0.92em; background: var(--cw-track); padding: 1px 4px; border-radius: 3px; }'
      + '.cw-mobile-fallback { display: none; padding: 14px 16px; border-radius: 8px; font-size: 14px; border: 1px solid var(--cw-border); background: var(--cw-surface); color: var(--text); }'
      + '@media (max-width: 700px) { .cw-root { display: none !important; } .cw-mobile-fallback { display: block; } }'
      + '.cw-root a { color: var(--cw-accent); }'
      + '.cw-tip { position: relative; }'
      + '.cw-tip::after {'
      + '  content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%;'
      + '  transform: translateX(-50%); width: max-content; max-width: 320px;'
      + '  padding: 8px 11px; border-radius: 6px;'
      + '  background: rgba(30,28,24,0.95); color: #F5F3EC;'
      + '  font-size: 11px; font-weight: 400; line-height: 1.5;'
      + '  white-space: pre-wrap; text-align: left;'
      + '  pointer-events: none; opacity: 0; transform-origin: top center;'
      + '  transition: opacity 0.15s ease 0.25s; z-index: 50;'
      + '  box-shadow: 0 6px 18px rgba(0,0,0,0.18);'
      + '}'
      + '.cw-tip-right::after { left: auto; right: 0; transform: none; }'
      + '.cw-tip:hover::after, .cw-tip:focus-visible::after { opacity: 1; }'
      + 'body.dark .cw-tip::after { background: rgba(240,238,230,0.95); color: #1A1918; }'
      + '</style>'
      + '<div class="cw-mobile-fallback">' + escapeHtml(t('cwe_mobileFallback')) + '</div>'
      + '<div class="cw-root" id="cw-root" tabindex="-1">'
      +   '<div class="cw-header">'
      +     '<div class="cw-header-left">'
      +       '<div class="cw-header-title">' + escapeHtml(t('cwe_title')) + '</div>'
      +       '<div class="cw-header-sub">' + escapeHtml(t('cwe_subtitle')) + '</div>'
      +     '</div>'
      +     '<div class="cw-header-right">'
      +       '<div id="cw-tokens-display" class="cw-tokens-display"></div>'
      +       '<div class="cw-tokens-sub-row">'
      +         '<span id="cw-tokens-sub">/ ' + fmt(MAX) + ' · ' + escapeHtml(t('cwe_illustrative')) + '</span>'
      +         '<span id="cw-budget-help" class="cw-tip cw-tip-right cw-budget-help" data-tip="">?</span>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="cw-toolbar">'
      +     '<div role="tablist" class="cw-tab-group">'
      +       '<button data-cw-mode="session" class="cw-mode-btn">' + escapeHtml(t('cwe_modeSession')) + '</button>'
      +       '<button data-cw-mode="example" class="cw-mode-btn">' + escapeHtml(t('cwe_modeExample')) + '</button>'
      +     '</div>'
      +     '<div id="cw-session-tools" class="cw-session-tools">'
      +       '<div style="position:relative">'
      +         '<input id="cw-session-input" type="text" autocomplete="off" spellcheck="false" placeholder="' + escapeHtml(t('cwe_searchHint')) + '" class="cw-session-input" />'
      +         '<div id="cw-session-list" class="cw-session-dropdown cw-scroll">'
      +           '<div id="cw-session-items"></div>'
      +           '<div id="cw-session-nav" class="cw-list-nav">'
      +             '<button id="cw-list-top" class="cw-icon-btn cw-icon-btn--fade" title="' + escapeHtml(t('navScrollTop')) + '"><svg width="9" height="6" viewBox="0 0 9 6" fill="currentColor"><path d="M4.5 0L9 6H0z"/></svg></button>'
      +             '<button id="cw-list-bottom" class="cw-icon-btn cw-icon-btn--fade" title="' + escapeHtml(t('navScrollBottom')) + '"><svg width="9" height="6" viewBox="0 0 9 6" fill="currentColor"><path d="M4.5 6L0 0H9z"/></svg></button>'
      +           '</div>'
      +         '</div>'
      +       '</div>'
      +       '<div role="group" class="cw-tab-group cw-tab-group--sm">'
      +         '<button data-cw-sort="recent" class="cw-sort-btn">' + escapeHtml(t('cwe_sortRecent')) + '</button>'
      +         '<button data-cw-sort="turns" class="cw-sort-btn cw-tip" data-tip="' + escapeHtml(t('cwe_turnsHelp')) + '">' + escapeHtml(t('cwe_sortTurns')) + '</button>'
      +         '<button data-cw-sort="tokens" class="cw-sort-btn">' + escapeHtml(t('cwe_sortTokens')) + '</button>'
      +       '</div>'
      +     '</div>'
      +     '<span id="cw-session-empty" class="cw-no-sessions">' + escapeHtml(t('cwe_noSessions')) + '</span>'
      +   '</div>'
      +   '<div class="cw-bar-area">'
      +     '<div class="cw-progress-track">'
      +       '<div id="cw-progress-top" style="width:0%;height:100%;transition:width 0.6s cubic-bezier(0.4,0,0.2,1), background 0.3s"></div>'
      +     '</div>'
      +     '<div class="cw-canvas-track"><canvas id="cw-bar"></canvas></div>'
      +     '<div class="cw-legend-row">'
      +       '<div id="cw-legend" class="cw-legend-items"></div>'
      +       '<div class="cw-vis-key">'
      +         '<div class="cw-vis-key-item">'
      +           '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="cw-faint" style="opacity:0.35"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      +           '<span class="cw-faint">' + escapeHtml(t('cwe_visHidden')) + '</span>'
      +         '</div>'
      +         '<div class="cw-vis-key-item">'
      +           '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="cw-faint-half"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><line x1="9" y1="12" x2="15" y2="12"/></svg>'
      +           '<span>' + escapeHtml(t('cwe_visBrief')) + '</span>'
      +         '</div>'
      +         '<div class="cw-vis-key-item">'
      +           '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--cw-you)" stroke-width="3"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      +           '<span>' + escapeHtml(t('cwe_visFull')) + '</span>'
      +         '</div>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div id="cw-main" class="cw-main">'
      +     '<div class="cw-tl-wrap">'
      +       '<div id="cw-timeline" class="cw-timeline cw-scroll"></div>'
      +       '<div id="cw-tl-nav" class="cw-nav-overlay">'
      +         '<button id="cw-tl-top" class="cw-icon-btn" title="' + escapeHtml(t('navScrollTop')) + '"><svg width="9" height="6" viewBox="0 0 9 6" fill="currentColor"><path d="M4.5 0L9 6H0z"/></svg></button>'
      +         '<button id="cw-tl-bottom" class="cw-icon-btn" title="' + escapeHtml(t('navScrollBottom')) + '"><svg width="9" height="6" viewBox="0 0 9 6" fill="currentColor"><path d="M4.5 6L0 0H9z"/></svg></button>'
      +       '</div>'
      +     '</div>'
      +     '<div class="cw-detail-wrap">'
      +       '<div id="cw-detail" class="cw-detail cw-scroll"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div id="cw-session-info" class="cw-session-info"></div>'
      +   '<div id="cw-playback-bar" class="cw-playback">'
      +     '<button id="cw-play" aria-label="Play" class="cw-play-btn">▶</button>'
      +     '<button id="cw-skip" title="' + escapeHtml(t('cwe_skipToEnd')) + '" class="cw-ctrl-btn">⏭</button>'
      +     '<div class="cw-scrubber-track">'
      +       '<div id="cw-progress-bottom" style="width:0%;height:100%;background:var(--cw-accent);transition:width 0.1s linear"></div>'
      +     '</div>'
      +     '<span id="cw-percent" class="cw-percent">0%</span>'
      +     '<span class="cw-kbd-hint">' + escapeHtml(t('cwe_kbdHint')) + '</span>'
      +     '<button id="cw-fs" aria-label="Fullscreen" title="Fullscreen" class="cw-ctrl-btn cw-ctrl-btn--lg">⛶</button>'
      +   '</div>'
      + '</div>';

    const root = document.getElementById('cw-root');
    const tokensDisplay = document.getElementById('cw-tokens-display');
    const tokensSub = document.getElementById('cw-tokens-sub');
    const budgetHelp = document.getElementById('cw-budget-help');
    const progressTop = document.getElementById('cw-progress-top');
    const barEl = document.getElementById('cw-bar');
    const legendEl = document.getElementById('cw-legend');
    const timelineEl = document.getElementById('cw-timeline');
    const detailEl = document.getElementById('cw-detail');
    const playBtn = document.getElementById('cw-play');
    const progressBottom = document.getElementById('cw-progress-bottom');
    const percentEl = document.getElementById('cw-percent');
    const fsBtn = document.getElementById('cw-fs');
    const mainEl = document.getElementById('cw-main');
    const sessionInfo = document.getElementById('cw-session-info');
    const sessionTools = document.getElementById('cw-session-tools');
    const sessionInput = document.getElementById('cw-session-input');
    const sessionList = document.getElementById('cw-session-list');
    const sessionItems = document.getElementById('cw-session-items');
    const sessionNav = document.getElementById('cw-session-nav');
    const sessionEmpty = document.getElementById('cw-session-empty');
    const modeBtns = Array.from(root.querySelectorAll('[data-cw-mode]'));
    const sortBtns = Array.from(root.querySelectorAll('[data-cw-sort]'));
    const bottomBar = document.getElementById('cw-playback-bar'); // the playback control row

    // Render legend once
    legendEl.innerHTML = LEGEND.map((x) => {
      const label = cweLabel(x.labelKey);
      return '<div class="cw-legend-item" data-cw-legend="' + x.c + '" data-cw-pct="' + x.c + '" data-cw-label="' + escapeHtml(label) + '" data-tip="">'
        + '<div class="cw-legend-dot" style="background:' + x.c + '"></div>'
        + '<span class="cw-legend-label">' + escapeHtml(label) + '</span>'
        + '</div>';
    }).join('');

    // Floating tooltip for the legend — attached to body so it escapes the
    // .cw-root overflow:hidden clipping. Position is computed on hover and
    // clamped to the viewport so leftmost/rightmost items never get cut off.
    if (window._cwFloatTip && window._cwFloatTip.parentNode) {
      window._cwFloatTip.parentNode.removeChild(window._cwFloatTip);
    }
    const floatTip = document.createElement('div');
    floatTip.style.cssText = 'position:fixed; pointer-events:none; opacity:0;'
      + ' z-index:10000; padding:7px 10px; border-radius:6px;'
      + ' font-size:11px; font-weight:400; line-height:1.45;'
      + ' max-width:300px; white-space:normal; text-align:left;'
      + ' box-shadow:0 6px 18px rgba(0,0,0,0.18);'
      + ' transition:opacity 0.15s ease;';
    document.body.appendChild(floatTip);
    window._cwFloatTip = floatTip;

    function showFloatTipFor(el) {
      const txt = el.getAttribute('data-tip') || '';
      if (!txt) return;
      // Apply theme colours at show time so the tip stays correct after a
      // theme toggle without requiring a full re-render.
      const isDark = document.body.classList.contains('dark');
      floatTip.style.background = isDark ? 'rgba(240,238,230,0.95)' : 'rgba(30,28,24,0.95)';
      floatTip.style.color = isDark ? '#1A1918' : '#F5F3EC';
      floatTip.textContent = txt;
      // First set approximate position so we can measure, then clamp.
      const rect = el.getBoundingClientRect();
      floatTip.style.left = '0px';
      floatTip.style.top = (rect.bottom + 6) + 'px';
      floatTip.style.opacity = '1';
      const tipRect = floatTip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      const margin = 8;
      if (left < margin) left = margin;
      if (left + tipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - margin - tipRect.width;
      }
      floatTip.style.left = left + 'px';
    }
    function hideFloatTip() { floatTip.style.opacity = '0'; }

    // ── Helpers ──
    function computeView() {
      const events = activeEvents();
      const gates = activeGates();
      const visibleCount = events.filter((e) => e.t <= state.time).length;
      const preCompactVisible = events.slice(0, visibleCount);
      const compactGateIdx = gates.length - 1;
      // Session mode replays real history — there is no scripted compact gate,
      // compactions manifest as naturally shrinking `cumulative` values.
      const isCompacted = state.mode !== 'session'
        && state.gatesPassed > compactGateIdx
        && preCompactVisible.some((e) => e.kind === 'compact');

      let visible, preCompactTotal = 0;
      if (!isCompacted) {
        visible = preCompactVisible;
      } else {
        const nonCompact = preCompactVisible.filter((e) => e.kind !== 'compact');
        const autoLoads = nonCompact.filter((e) => e.kind === 'auto' && e.t < STARTUP_END && !e.noSurviveCompact);
        const summarized = nonCompact.filter((e) => e.t >= STARTUP_END && e.kind !== 'sub');
        const sumTokens = summarized.reduce((s, e) => s + evtTokens(e), 0);
        // Synthetic block shown after /compact. `id: 0` → i18n keys cwe_ev0_label / cwe_ev0_desc.
        const summaryBlock = {
          id: 0, t: STARTUP_END, kind: 'compact', isSummary: true,
          tokens: Math.round(sumTokens * 0.12), color: '#A09E96', vis: 'hidden',
          link: 'https://code.claude.com/docs/en/how-claude-code-works#the-context-window'
        };
        visible = autoLoads.concat([summaryBlock]);
        preCompactTotal = nonCompact.reduce((s, e) => s + evtTokens(e), 0);
      }

      const blocks = visible.map((e, visIdx) => {
        return Object.assign({}, e, { _tokens: evtTokens(e), visIdx: visIdx });
      }).filter((e) => e._tokens > 0 || e.isSummary);
      let totalTokens = blocks.reduce((s, b) => s + b._tokens, 0);
      // Session mode: show the peak context size reached so far (max cumulative
      // across all visible entries). Using "last entry" would under-report after a
      // mid-session compaction; peak is what actually sized the model's buffer.
      if (state.mode === 'session' && visible.length > 0) {
        let peak = 0;
        for (let i = 0; i < visible.length; i++) {
          const c = visible[i].cumulative || 0;
          if (c > peak) peak = c;
        }
        totalTokens = peak;
      }
      const subTotal = visible.filter((e) => e.kind === 'sub').reduce((s, e) => s + evtSubTokens(e), 0);

      return { visible: visible, blocks: blocks, totalTokens: totalTokens, subTotal: subTotal, isCompacted: isCompacted, preCompactTotal: preCompactTotal };
    }

    function activeGateNow() {
      return activeGates().find((g, i) => i >= state.gatesPassed && state.time >= g.at && state.time < g.resumeTo) || null;
    }

    function getTakeaway(focusT, isCompacted) {
      if (isCompacted) return t('cwe_take_compacted');
      if (focusT < STARTUP_END) return t('cwe_take_start');
      if (focusT < 0.28) return t('cwe_take_userPrompt');
      if (focusT < 0.50) return t('cwe_take_fileRead');
      if (focusT < 0.71) return t('cwe_take_hooks');
      if (focusT < 0.79) return t('cwe_take_followup');
      if (focusT < 0.87) return t('cwe_take_subagent');
      if (focusT < 0.88) return t('cwe_take_bang');
      if (focusT < 0.90) return t('cwe_take_slash');
      return t('cwe_take_compact');
    }

    function getTerminalView(focusT, isCompacted) {
      if (isCompacted) return t('cwe_term_compacted');
      if (focusT < STARTUP_END) return t('cwe_term_start');
      if (focusT < 0.28) return t('cwe_term_userPrompt');
      if (focusT < 0.52) return t('cwe_term_fileRead');
      if (focusT < 0.72) return t('cwe_term_claudeWork');
      if (focusT < 0.79) return t('cwe_term_followup');
      if (focusT < 0.86) return t('cwe_term_subagent');
      if (focusT < 0.90) return t('cwe_term_commitPush');
      return t('cwe_term_full');
    }

    // ── Render sub-regions ──
    function renderBarSegments(view) {
      const ctx = barEl.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const W = barEl.clientWidth || barEl.parentElement?.clientWidth || 600;
      const H = barEl.clientHeight || 28;
      // Resize only when dimensions actually changed (avoids unnecessary resets)
      if (barEl.width !== Math.round(W * dpr) || barEl.height !== Math.round(H * dpr)) {
        barEl.width = Math.round(W * dpr);
        barEl.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const activeIdx = state.selIdx !== null ? state.selIdx : state.hovIdx;
      const segments = []; // { visIdx, x, w } for hit-testing

      if (state.mode === 'session') {
        // Geometry lives in layoutSessionBar() (canvas-bars.mjs, unit-tested).
        // Hover/alpha colouring stays here because it depends on live UI state.
        const laid = layoutSessionBar(view.blocks, view.totalTokens, state.budget, W);
        const blockByVis = new Map();
        view.blocks.forEach((b) => blockByVis.set(b.visIdx, b));
        laid.forEach((seg) => {
          const b = blockByVis.get(seg.visIdx);
          if (!b) return;
          const isHov = b.visIdx === activeIdx;
          const catMatch = state.hovCat && b.color === state.hovCat;
          const dimmed = state.hovCat ? !catMatch : (activeIdx !== null && !isHov);
          const opacity = (isHov || catMatch) ? 1 : (dimmed ? 0.25 : 0.65);
          ctx.globalAlpha = opacity;
          ctx.fillStyle = b.color;
          ctx.fillRect(seg.x, 0, seg.w, H);
          segments.push({ visIdx: b.visIdx, x: seg.x, w: seg.w });
        });
      } else {
        // Example mode (~36 blocks)
        let cumX = 0;
        view.blocks.forEach((b) => {
          const segW = Math.max(b._tokens / state.budget * 100, 0.15) / 100 * W;
          const isHov = b.visIdx === activeIdx;
          const catMatch = state.hovCat && b.color === state.hovCat;
          const dimmed = state.hovCat ? !catMatch : (activeIdx !== null && !isHov);
          const opacity = (isHov || catMatch) ? 1 : (dimmed ? 0.25 : 0.65);
          ctx.globalAlpha = opacity;
          ctx.fillStyle = b.color;
          ctx.fillRect(cumX, 0, segW, H);
          segments.push({ visIdx: b.visIdx, x: cumX, w: segW });
          cumX += segW;
        });
      }

      ctx.globalAlpha = 1;
      barEl._segments = segments;
    }

    function barSegmentAt(clientX) {
      const segs = barEl._segments;
      if (!segs || segs.length === 0) return null;
      const rect = barEl.getBoundingClientRect();
      const x = clientX - rect.left;
      // Binary search — segments are left-to-right ordered
      let lo = 0, hi = segs.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (x < segs[mid].x) hi = mid - 1;
        else if (x >= segs[mid].x + segs[mid].w) lo = mid + 1;
        else return segs[mid];
      }
      return null;
    }

    // ── Virtual timeline ──────────────────────────────────────────────────────
    // Render only visible rows; use position:absolute within a fixed-height
    // container so sub-pixel rounding and 1000+ DOM nodes never accumulate.
    const TL_ROW_H = 38;    // base row height (px) — padding(10) + font(15) + line
    const TL_PHASE_H = 36;  // section-label height incl. margins (margin-top:14 + content + margin-bottom:6 + gap)
    const TL_ENTER_H = 26;  // "entering subagent" label height
    const TL_LEAVE_H = 28;  // "left subagent" label height
    const TL_BUFFER = 4;    // extra rows to render above/below viewport

    let _tlLayout = null;   // { slotTops[], slotHeights[], totalH }
    let _tlVisible = null;
    let _tlView = null;

    function computeTlLayout(visible) {
      const slotTops = [], slotHeights = [];
      let y = 0;
      visible.forEach((evt, i) => {
        const prevKind = i > 0 ? visible[i - 1].kind : null;
        const isSub = evt.kind === 'sub';
        let extraH = 0;
        if (state.mode !== 'session') {
          if ((evt.kind === 'user' && prevKind !== 'user')
            || (evt.kind === 'claude' && prevKind === 'user')
            || evt.isSummary) extraH += TL_PHASE_H;
        }
        if (prevKind === 'sub' && !isSub) extraH += TL_LEAVE_H;
        if (isSub && prevKind !== 'sub') extraH += TL_ENTER_H;
        slotTops.push(y);
        const h = extraH + TL_ROW_H;
        slotHeights.push(h);
        y += h;
      });
      return { slotTops, slotHeights, totalH: y };
    }

    function renderTimelineSlot(visible, i, view) {
      const evt = visible[i];
      const meta = KIND_META[evt.kind];
      const isHov = state.hovIdx === i;
      const isSel = state.selIdx === i;
      const prevKind = i > 0 ? visible[i - 1].kind : null;
      const isSub = evt.kind === 'sub';
      const enteringSub = isSub && prevKind !== 'sub';
      const leavingSub = prevKind === 'sub' && !isSub;
      const { subTotal, isCompacted } = view;

      let showPhase = null;
      if (state.mode !== 'session') {
        if (evt.kind === 'user' && prevKind !== 'user') showPhase = t('cwe_phaseYou');
        else if (evt.kind === 'claude' && prevKind === 'user') showPhase = t('cwe_phaseClaudeWorks');
        else if (evt.isSummary) showPhase = t('cwe_phaseSummarized');
      }
      const isNewRow = isCompacted && !(evt.kind === 'auto' && evt.t < STARTUP_END);
      const rowOpen = '<div' + (isNewRow ? ' class="cw-compacted-row" style="animation-delay:' + (i * 60) + 'ms"' : '') + '>';

      let html = '';
      if (showPhase) {
        html += rowOpen + '<div class="cw-phase-label">' + escapeHtml(showPhase) + '</div>';
      } else {
        html += rowOpen;
      }
      if (enteringSub) {
        html += '<div class="cw-subagent-enter">' + escapeHtml(t('cwe_subagentCtxLabel')) + '</div>';
      }
      if (leavingSub) {
        html += '<div class="cw-subagent-leave">↓ ' + escapeHtml(t('cwe_subagentReturned', fmt(subTotal))) + '</div>';
      }

      const dimmed = state.hovCat && evt.color !== state.hovCat;
      const rowBg = (isSel || isHov) ? 'var(--cw-hover)' : 'transparent';
      const outline = isSel ? '1px solid var(--cw-sel-ring)' : 'none';
      const rowStyle = 'display:flex;align-items:flex-start;border-radius:6px;cursor:pointer;'
        + 'background:' + rowBg + ';outline:' + outline + ';opacity:' + (dimmed ? 0.35 : 1) + ';'
        + 'transition:background 0.1s,opacity 0.15s;'
        + (isSub ? 'margin-left:28px;padding-left:10px;border-left:2px solid var(--cw-mcp-ring);' : '');

      html += '<div data-cw-item="' + i + '" style="' + rowStyle + '">';
      const dotSz = (evt.kind === 'user' || evt.kind === 'compact') ? 10 : 7;
      html += '<div class="cw-row-dot-col">'
        + '<div style="width:' + dotSz + 'px;height:' + dotSz + 'px;border-radius:50%;background:' + evt.color + ';opacity:' + (isHov ? 1 : 0.6) + ';transition:opacity 0.15s;' + (isHov ? 'box-shadow:0 0 8px ' + evt.color + '40' : '') + '"></div>';
      if (i < visible.length - 1) {
        html += '<div class="cw-row-connector"></div>';
      }
      html += '</div>';

      const labelColor = isHov ? 'var(--cw-text)'
        : evt.kind === 'user' ? 'var(--cw-you)'
        : evt.kind === 'auto' ? 'var(--cw-text-dim)' : 'var(--cw-text-2)';
      const tok = evtTokens(evt);
      const subTok = evtSubTokens(evt);
      html += '<div class="cw-row-label-col">'
        + '<span class="cw-badge" style="background:' + meta.badgeBg + ';color:' + meta.badgeColor + '">' + escapeHtml(t(meta.badgeKey)) + '</span>'
        + '<span class="cw-row-name" style="color:' + labelColor + ';font-weight:' + (evt.kind === 'user' ? 550 : 400) + '">' + escapeHtml(evtLabel(evt)) + '</span>';
      if (tok > 0) {
        html += '<span class="cw-row-tok">+' + fmt(tok) + '</span>';
      }
      if (subTok > 0) {
        html += '<span class="cw-row-subtok">+' + fmt(subTok) + '</span>';
      }
      if (tok > 0) {
        const mw = Math.min(tok / 5000 * 100, 100);
        html += '<div class="cw-mini-bar-track">'
          + '<div style="width:' + mw + '%;height:100%;background:' + evt.color + ';opacity:' + (isHov ? 0.8 : 0.4) + ';transition:opacity 0.15s"></div>'
          + '</div>';
      }
      html += '<span class="cw-vis-icon" title="' + escapeHtml(t(VIS_META[evt.vis].labelKey)) + '">';
      if (evt.vis === 'hidden') {
        // Closed eye — same muted style, slash across the eye path
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="cw-faint" style="opacity:0.35"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      } else if (evt.vis === 'brief') {
        // Eye outline + dash inside: visible but abbreviated
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="cw-faint-half"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><line x1="9" y1="12" x2="15" y2="12"/></svg>';
      } else {
        // full — open eye, green (uses CSS var for theme)
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cw-you)" stroke-width="3.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      }
      html += '</span>';
      html += '</div>'; // label container
      html += '</div>'; // row
      html += '</div>'; // rowOpen wrapper
      return html;
    }

    function updateVirtualRows() {
      if (!timelineEl) return;
      const virtEl = timelineEl.querySelector('#cw-tl-virt');
      if (!virtEl || !_tlLayout || !_tlVisible || _tlVisible.length === 0) return;

      const hdrEl = timelineEl.querySelector('#cw-tl-hdr');
      const hdrH = hdrEl ? hdrEl.offsetHeight : 0;
      const scrollTop = timelineEl.scrollTop;
      const relScroll = Math.max(0, scrollTop - hdrH);
      const viewH = timelineEl.clientHeight || 500;
      const { slotTops, slotHeights, totalH } = _tlLayout;
      const n = _tlVisible.length;

      // Binary search: first slot whose bottom edge is below the viewport top
      let start = n;
      let lo = 0, hi = n - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (slotTops[mid] + slotHeights[mid] <= relScroll) { start = mid + 1; lo = mid + 1; }
        else { start = mid; hi = mid - 1; }
      }
      start = Math.max(0, start - TL_BUFFER);

      // Linear scan for last visible slot
      let end = start;
      while (end < n - 1 && slotTops[end + 1] < relScroll + viewH) end++;
      end = Math.min(n - 1, end + TL_BUFFER);

      let html = '';
      for (let i = start; i <= end; i++) {
        html += '<div style="position:absolute;top:' + slotTops[i] + 'px;left:0;right:0">'
          + renderTimelineSlot(_tlVisible, i, _tlView)
          + '</div>';
      }
      virtEl.innerHTML = html;
    }

    function renderTimeline(view) {
      const activeGate = activeGateNow();
      const { visible, subTotal, isCompacted, preCompactTotal, totalTokens } = view;

      _tlVisible = visible;
      _tlView = view;

      // Save scroll position — innerHTML resets it to 0
      const savedScrollTop = timelineEl.scrollTop;

      // ── Empty states ──
      if (state.mode === 'session' && state.sessionEvents.length === 0) {
        timelineEl.innerHTML = '<div id="cw-tl-hdr" class="cw-empty-state">'
          + '<div class="cw-empty-icon">⌕</div>'
          + '<div class="cw-empty-title">' + escapeHtml(t('cwe_pickSessionTitle')) + '</div>'
          + '<div class="cw-empty-desc">' + escapeHtml(t('cwe_pickSessionHint')) + '</div>'
          + '</div>';
        return;
      }
      if (visible.length === 0 && !state.playing && state.mode !== 'session') {
        timelineEl.innerHTML = '<div id="cw-tl-hdr" class="cw-start-state">'
          + '<div class="cw-start-cursor">'
          +   '<span class="cw-faint">$</span><span>claude</span>'
          +   '<span class="cw-start-cursor-blink"></span>'
          + '</div>'
          + '<button data-cw-start="1" class="cw-start-btn"><span>▶</span><span>' + escapeHtml(t('cwe_startSession')) + '</span></button>'
          + '<div class="cw-start-hint">'
          +   renderCode(t('cwe_startHint'))
          + '</div>'
          + '</div>';
        return;
      }

      // ── Header (non-virtual) ──
      let hdrHtml = '<div id="cw-tl-hdr">';
      if (isCompacted) {
        hdrHtml += '<div class="cw-compact-header">'
          + '<div class="cw-compact-title">' + escapeHtml(t('cwe_afterCompactTitle')) + '</div>'
          + '<div class="cw-compact-stats">'
          +   escapeHtml(t('cwe_afterCompactStats', fmt(preCompactTotal), fmt(totalTokens), fmt(preCompactTotal - totalTokens)))
          + '</div>'
          + '<div class="cw-compact-desc">'
          +   escapeHtml(t('cwe_afterCompactDesc'))
          + '</div>'
          + '</div>';
      }
      if (state.mode !== 'session' && state.time > 0 && visible.length > 0) {
        hdrHtml += '<div class="cw-section-label">'
          + escapeHtml(isCompacted ? t('cwe_reloadedAfterCompact') : t('cwe_beforeYouType'))
          + '</div>';
      }
      if (state.mode === 'session' && visible.length > 0) {
        hdrHtml += '<div class="cw-section-label">'
          + escapeHtml(t('cwe_sessionReplay'))
          + '</div>';
      }
      hdrHtml += '</div>';

      // ── Virtual list container ──
      const showRows = state.time > 0 || state.mode === 'session';
      _tlLayout = (showRows && visible.length > 0) ? computeTlLayout(visible) : null;
      const virtH = _tlLayout ? _tlLayout.totalH : 0;
      const virtHtml = (showRows && visible.length > 0)
        ? '<div id="cw-tl-virt" style="position:relative;height:' + virtH + 'px"></div>'
        : '';

      // ── Gate card (non-virtual footer) ──
      let ftrHtml = '';
      // Gate card — displays the fixed scripted prompt for this scenario step.
      if (activeGate) {
        const gateText = t(activeGate.gateKey);
        const isCompact = activeGate.kind === 'compact';
        const textSpan = '<span class="cw-gate-prompt-text">' + escapeHtml(gateText) + '</span>';
        if (!isCompact) {
          ftrHtml += '<div class="cw-gate-wrap">'
            + '<div class="cw-gate-you-label">' + escapeHtml(t('cwe_youTypeHeader')) + '</div>'
            + '<div class="cw-gate-input-row">'
            +   '<span class="cw-gate-prompt-icon">❯</span>'
            +   textSpan
            +   '<button data-cw-gate="1" class="cw-gate-btn cw-gate-btn--you">'
            +     escapeHtml(activeGate.kind === 'prompt' ? t('cwe_sendBtn') : t('cwe_runBtn'))
            +   '</button>'
            + '</div>'
            + '</div>';
        } else {
          const pct = totalTokens / state.budget * 100;
          const barColorVar = pct > 75 ? 'var(--cw-accent)' : pct > 50 ? 'var(--cw-gold)' : 'var(--cw-you)';
          ftrHtml += '<div class="cw-gate-wrap">'
            + '<div class="cw-gate-compact-box">'
            +   '<div class="cw-gate-compact-desc">'
            +     escapeHtml(t('cwe_compactPromptPre')) + ' <span style="font-family:var(--cw-font-mono);font-weight:600;color:' + barColorVar + '">' + fmt(totalTokens) + ' ' + escapeHtml(t('cwe_tokensWord')) + '</span>. '
            +     renderCode(t('cwe_compactPromptPost'))
            +   '</div>'
            +   '<div class="cw-gate-compact-row">'
            +     '<span class="cw-gate-compact-icon">❯</span>'
            +     textSpan
            +     '<button data-cw-gate="1" class="cw-gate-btn cw-gate-btn--accent">' + escapeHtml(t('cwe_runBtn')) + '</button>'
            +   '</div>'
            + '</div>'
            + '</div>';
        }
      }

      timelineEl.innerHTML = hdrHtml + virtHtml + ftrHtml;
      timelineEl.scrollTop = savedScrollTop;
      updateVirtualRows();
    }

    function renderDetail(view) {
      const activeIdx = state.selIdx !== null ? state.selIdx : state.hovIdx;
      const hovEvent = activeIdx !== null ? view.visible[activeIdx] : null;
      const focusT = hovEvent ? hovEvent.t : state.time;
      const takeaway = getTakeaway(focusT, view.isCompacted);
      const terminalView = getTerminalView(focusT, view.isCompacted);

      let html = '';
      if (hovEvent && hovEvent.isSession && hovEvent.isSynthetic) {
        const meta = KIND_META[hovEvent.kind];
        html += '<div>'
          + '<div class="cw-detail-title-row">'
          +   '<div class="cw-detail-dot" style="background:' + hovEvent.color + '"></div>'
          +   '<span class="cw-detail-title">' + escapeHtml(evtLabel(hovEvent)) + '</span>'
          + '</div>'
          + '<div class="cw-detail-badge-row">'
          +   '<div class="cw-detail-badge-inline" style="background:' + meta.badgeBg + '">'
          +     '<span class="cw-badge" style="color:' + meta.badgeColor + '">' + escapeHtml(t(meta.detailKey)) + '</span>'
          +   '</div>'
          +   '<div class="cw-detail-badge-inline cw-detail-badge--neutral">'
          +     '<span class="cw-badge" style="color:var(--cw-text-faint)">' + escapeHtml(t('cwe_estimatedTag')) + '</span>'
          +   '</div>'
          + '</div>'
          + '<div class="cw-detail-token-row">'
          +   '<span class="cw-detail-token">~' + fmt(hovEvent.tokens) + ' ' + escapeHtml(t('cwe_tokensWord')) + '</span>'
          + '</div>'
          + '<p class="cw-detail-desc--dim">' + escapeHtml(t('cwe_sessionStartupDesc')) + '</p>'
          + '</div>';
        detailEl.innerHTML = html;
        detailEl.scrollTop = 0;
        return;
      }
      if (hovEvent && hovEvent.isSession) {
        const meta = KIND_META[hovEvent.kind];
        const pctCache = hovEvent.cumulative > 0
          ? Math.round((hovEvent.cacheRead / hovEvent.cumulative) * 100)
          : 0;
        html += '<div>'
          + '<div class="cw-detail-title-row">'
          +   '<div class="cw-detail-dot" style="background:' + hovEvent.color + '"></div>'
          +   '<span class="cw-detail-title">' + escapeHtml(evtLabel(hovEvent)) + '</span>'
          + '</div>'
          + '<div class="cw-detail-badge" style="background:' + meta.badgeBg + '">'
          +   '<span class="cw-badge" style="color:' + meta.badgeColor + '">' + escapeHtml(t(meta.detailKey)) + '</span>'
          + '</div>'
          + '<div class="cw-detail-meta">'
          +   escapeHtml(shortModel(hovEvent.model)) + ' · ' + escapeHtml(fmtClock(hovEvent.timestamp))
          + '</div>'
          + '<div class="cw-detail-cumul">'
          +   escapeHtml(t('cwe_sessionCumulative')) + ': <strong>' + fmt(hovEvent.cumulative) + '</strong> ' + escapeHtml(t('cwe_tokensWord'))
          + '</div>'
          + '<div class="cw-detail-delta">'
          +   escapeHtml(t('cwe_sessionDelta')) + ': ' + (hovEvent.delta >= 0 ? '+' : '') + fmt(hovEvent.delta)
          + '</div>'
          + '<div class="cw-detail-cache-box">'
          +   escapeHtml(t('cwe_sessionCache')) + ': ' + pctCache + '%<br>'
          +   'raw: ' + fmt(hovEvent.rawInput) + ' · cache R/W: ' + fmt(hovEvent.cacheRead) + ' / ' + fmt(hovEvent.cacheCreation) + '<br>'
          +   'out: ' + fmt(hovEvent.outputTokens)
          + '</div>'
          + '</div>';
        detailEl.innerHTML = html;
        detailEl.scrollTop = 0;
        return;
      }
      if (hovEvent) {
        const meta = KIND_META[hovEvent.kind];
        const tok = evtTokens(hovEvent);
        const subTok = evtSubTokens(hovEvent);
        html += '<div>'
          + '<div class="cw-detail-title-row">'
          +   '<div class="cw-detail-dot" style="background:' + hovEvent.color + '"></div>'
          +   '<span class="cw-detail-title">' + escapeHtml(evtLabel(hovEvent)) + '</span>'
          + '</div>'
          + '<div class="cw-detail-badge" style="background:' + meta.badgeBg + '">'
          +   '<span class="cw-badge" style="color:' + meta.badgeColor + '">' + escapeHtml(t(meta.detailKey)) + '</span>'
          + '</div>';
        {
          const isMeasured = hovEvent.statKey && resolveStat(hovEvent.statKey) != null;
          if (tok > 0) {
            const badgeLabel = isMeasured ? t('cwe_measured') : t('cwe_illustrativeTag');
            const badgeTitle = isMeasured ? t('cwe_measuredDesc') : t('cwe_illustrativeTagDesc');
            html += '<div class="cw-detail-token-row">'
              + '<span class="cw-detail-token">' + fmt(tok) + ' ' + escapeHtml(t('cwe_tokensWord')) + '</span>'
              + '<span title="' + escapeHtml(badgeTitle) + '" class="cw-detail-tag ' + (isMeasured ? 'cw-detail-tag--measured' : 'cw-detail-tag--illus') + '">' + escapeHtml(badgeLabel) + '</span>'
              + '</div>';
          } else if (isMeasured && tok === 0) {
            html += '<div class="cw-detail-token-row">'
              + '<span class="cw-detail-token cw-faint">0 ' + escapeHtml(t('cwe_tokensWord')) + '</span>'
              + '<span class="cw-detail-tag cw-detail-tag--measured">' + escapeHtml(t('cwe_measured')) + '</span>'
              + '</div>'
              + '<div class="cw-detail-zero-note">' + escapeHtml(t('cwe_zeroTokens')) + '</div>';
          }
        }
        if (subTok > 0) {
          html += '<div class="cw-detail-subtok">' + escapeHtml(t('cwe_tokensInSubagent', fmt(subTok))) + '</div>';
        }
        html += '<p class="cw-detail-desc">' + renderCode(evtDesc(hovEvent)) + '</p>';

        const visBg = hovEvent.vis === 'full' ? 'var(--cw-you-bg2)' : 'var(--cw-surface-2)';
        const visBorder = hovEvent.vis === 'full' ? 'var(--cw-you-ring)' : 'var(--cw-border)';
        const dot = hovEvent.vis === 'full' ? '●' : hovEvent.vis === 'brief' ? '◐' : '○';
        const dotCol = hovEvent.vis === 'full' ? 'var(--cw-you)' : 'var(--cw-text-dim)';
        html += '<div class="cw-vis-box" style="background:' + visBg + ';border:1px solid ' + visBorder + '">'
          + '<div class="cw-vis-box-inner">'
          +   '<span style="font-size:13px;color:' + dotCol + '">' + dot + '</span>'
          +   '<span class="cw-vis-box-label">' + escapeHtml(t(VIS_META[hovEvent.vis].labelKey)) + '</span>'
          + '</div>'
          + '<div class="cw-vis-box-desc">' + escapeHtml(t(VIS_META[hovEvent.vis].subKey)) + '</div>'
          + '</div>';

        const tip = evtTip(hovEvent);
        if (tip) {
          html += '<div class="cw-tip-box">'
            + '<div class="cw-tip-box-title"><span>💡</span> ' + escapeHtml(t('cwe_saveContext')) + '</div>'
            + '<div class="cw-tip-box-body">' + renderCode(tip) + '</div>'
            + '</div>';
        }
        if (hovEvent.link) {
          html += '<a href="' + escapeHtml(localizeDocsUrl(hovEvent.link)) + '" target="_blank" class="cw-learn-more">' + escapeHtml(t('cwe_learnMore')) + '</a>';
        }
        html += '</div>';
      } else {
        html += '<div class="cw-hover-hint">'
          + '<div class="cw-hover-hint-icon">👁</div>'
          + '<div class="cw-hover-hint-title">' + escapeHtml(t('cwe_hoverHintTitle')) + '</div>'
          + '<div class="cw-hover-hint-desc">' + escapeHtml(t('cwe_hoverHintDesc')) + '</div>'
          + '</div>';
      }

      if (state.mode !== 'session') {
        html += '<div class="cw-takeaway-box">'
          + '<div class="cw-takeaway-label">' + escapeHtml(t('cwe_keyTakeaway')) + '</div>'
          + '<div class="cw-takeaway-body">' + escapeHtml(takeaway) + '</div>'
          + '</div>';

        html += '<div class="cw-terminal-box">'
          + '<div class="cw-terminal-label">' + escapeHtml(t('cwe_terminalView')) + '</div>'
          + '<div class="cw-detail-desc--sm">' + escapeHtml(terminalView) + '</div>'
          + '</div>';
      }

      // Mixed data note — shown when we have at least one measured stat
      const hasMeasured = stats && Object.values(stats).some((v) => v != null && v > 0);
      if (hasMeasured && state.time > 0) {
        html += '<div class="cw-mixed-note">'
          + '<span class="cw-mixed-note-icon">ℹ</span>'
          + '<span>' + escapeHtml(t('cwe_mixedDataNote')) + '</span>'
          + '</div>';
      }

      detailEl.innerHTML = html;
      detailEl.scrollTop = 0;
    }

    function update() {
      const view = computeView();
      const pct = view.totalTokens / state.budget * 100;
      // barColor: dynamic threshold colour — must stay JS-side since it drives
      // canvas ctx.fillStyle and inline element colour simultaneously.
      // Uses CSS vars so the values follow the theme palette.
      const _cwStyle = getComputedStyle(root);
      const barColor = pct > 75
        ? (_cwStyle.getPropertyValue('--cw-accent').trim() || '#D97757')
        : pct > 50
          ? (_cwStyle.getPropertyValue('--cw-gold').trim() || '#B8860B')
          : (_cwStyle.getPropertyValue('--cw-you').trim() || '#558A42');

      // Header tokens
      tokensDisplay.style.color = barColor;
      const prefix = state.mode === 'session' ? '' : '~';
      tokensDisplay.innerHTML = prefix + fmt(view.totalTokens) + '<span class="cw-tokens-word">' + escapeHtml(t('cwe_tokensWord')) + '</span>';
      // Collect unique real model names for the current session (if any).
      let modelsStr = '';
      if (state.mode === 'session' && state.sessionEvents.length > 0) {
        const seen = {};
        state.sessionEvents.forEach((e) => {
          if (!e.model) return;
          // Skip synthetic markers Claude Code writes for tool-result pseudo-messages.
          if (e.model.indexOf('<') >= 0 || e.model === 'unknown') return;
          seen[shortModel(e.model)] = true;
        });
        modelsStr = Object.keys(seen).join(', ');
      }
      if (tokensSub) {
        const tag = state.mode === 'session' ? t('cwe_measured') : t('cwe_illustrative');
        const pctStr = pct >= 10 ? Math.round(pct) + '%' : pct.toFixed(1) + '%';
        let text = '/ ' + fmt(state.budget) + ' (' + pctStr + ')';
        if (modelsStr) text += ' · ' + modelsStr;
        text += ' · ' + tag;
        tokensSub.textContent = text;
      }
      // Budget help tooltip — general explanation only (size + model now inline).
      if (budgetHelp) {
        budgetHelp.setAttribute('data-tip', t('cwe_budgetHelp'));
      }

      // Top progress line
      progressTop.style.width = pct + '%';
      progressTop.style.background = barColor;

      // Stacked bar
      renderBarSegments(view);

      // Legend percentages — shown as a CSS hover tooltip (data-tip attribute).
      // Denominator is the sum over all visible blocks so percentages sum to ~100%.
      const catTotals = {};
      view.blocks.forEach((b) => { catTotals[b.color] = (catTotals[b.color] || 0) + b._tokens; });
      const catSum = Object.values(catTotals).reduce((s, v) => s + v, 0) || 1;
      legendEl.querySelectorAll('[data-cw-pct]').forEach((el) => {
        const c = el.getAttribute('data-cw-pct');
        const label = el.getAttribute('data-cw-label') || '';
        const pct = ((catTotals[c] || 0) / catSum) * 100;
        const pctStr = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
        const tokStr = fmt(catTotals[c] || 0);
        el.setAttribute('data-tip', label + ': ' + pctStr + '% · ' + tokStr + ' ' + t('cwe_tokensWord'));
      });

      // Timeline + detail
      renderTimeline(view);
      renderDetail(view);

      const gate = activeGateNow();
      // Auto-scroll timeline
      if (view.isCompacted) {
        timelineEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (state.playing || gate) {
        timelineEl.scrollTop = timelineEl.scrollHeight;
      }
      // Re-render virtual rows after scroll position may have changed
      updateVirtualRows();

      // Bottom progress (scrubber = playback position; label = context usage in session mode
      // so it matches the top bar and header — avoids showing "100%" vs "18.7%" confusion).
      progressBottom.style.width = (state.time * 100) + '%';
      if (state.mode === 'session') {
        percentEl.textContent = (pct >= 10 ? Math.round(pct) : pct.toFixed(1)) + '%';
      } else {
        percentEl.textContent = Math.round(state.time * 100) + '%';
      }

      // Play button icon (reuses `gate` computed earlier for focus restore)
      playBtn.textContent = state.time >= 1 ? '↺' : state.playing ? '⏸' : '▶';
      playBtn.setAttribute('aria-label', state.time >= 1 ? 'Restart' : gate ? 'Continue' : state.playing ? 'Pause' : 'Play');
    }

    // ── Animation loop ──
    function startAnim() {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.lastTs = null;
      state.playing = true;
      const tick = (ts) => {
        if (!root.isConnected) { state.playing = false; return; }
        if (!state.playing) return;
        if (state.lastTs === null) state.lastTs = ts;
        const dt = (ts - state.lastTs) / 1000;
        state.lastTs = ts;
        // Session mode: slow down for long timelines so each entry is legible
        // (aim for ~1 entry per second regardless of session length).
        const speed = state.mode === 'session'
          ? 0.032 / Math.max(1, Math.min(6, (state.sessionEvents.length || 1) / 36))
          : 0.032;
        const next = state.time + dt * speed;
        const prev = state.time;
        const gates = activeGates();
        const gate = gates.find((g, i) => i >= state.gatesPassed && next >= g.at && prev < g.resumeTo);
        if (gate) {
          state.time = gate.at;
          state.playing = false;
          update();
          return;
        }
        if (next >= 1) {
          state.time = 1;
          state.playing = false;
          update();
          return;
        }
        state.time = next;
        update();
        state.rafId = requestAnimationFrame(tick);
        window._cwRafId = state.rafId;
      };
      state.rafId = requestAnimationFrame(tick);
      window._cwRafId = state.rafId;
      update();
    }

    function sendGate() {
      const gate = activeGateNow();
      if (!gate) return;
      const isCompact = gate.kind === 'compact';
      state.gatesPassed += 1;
      state.time = gate.resumeTo;
      state.selIdx = null;
      state.hovIdx = null;
      if (!isCompact) startAnim(); else { state.playing = false; update(); }
    }

    function togglePlay() {
      if (state.time >= 1) {
        state.time = 0;
        state.gatesPassed = 0;
        state.selIdx = null;
        state.hovIdx = null;
        startAnim();
        return;
      }
      if (activeGateNow()) { sendGate(); return; }
      if (state.playing) { state.playing = false; update(); } else { startAnim(); }
    }

    // ── Event wiring ──
    root.addEventListener('click', (e) => {
      state.hasInteracted = true;
      const startBtn = e.target.closest('[data-cw-start]');
      if (startBtn) { startAnim(); return; }
      const gateBtn = e.target.closest('[data-cw-gate]');
      if (gateBtn) { sendGate(); return; }
      const item = e.target.closest('[data-cw-item]');
      if (item) {
        const i = parseInt(item.getAttribute('data-cw-item'), 10);
        state.selIdx = state.selIdx === i ? null : i;
        update();
        return;
      }
    });

    root.addEventListener('mouseover', (e) => {
      const item = e.target.closest('[data-cw-item]');
      if (item) { state.hovIdx = parseInt(item.getAttribute('data-cw-item'), 10); update(); return; }
      const leg = e.target.closest('[data-cw-legend]');
      if (leg) {
        state.hovCat = leg.getAttribute('data-cw-legend');
        update();
        showFloatTipFor(leg);
        return;
      }
    });

    root.addEventListener('mouseout', (e) => {
      const leaving = e.relatedTarget;
      if (e.target.closest('[data-cw-item]')) {
        if (!leaving || !leaving.closest || !leaving.closest('[data-cw-item]')) {
          state.hovIdx = null; update();
        }
      }
      if (e.target.closest('[data-cw-legend]')) {
        if (!leaving || !leaving.closest || !leaving.closest('[data-cw-legend]')) {
          state.hovCat = null; update();
          hideFloatTip();
        }
      }
    });

    // Canvas bar interactions (replaces data-cw-block delegation)
    barEl.addEventListener('mousemove', (e) => {
      const seg = barSegmentAt(e.clientX);
      const newIdx = seg ? seg.visIdx : null;
      if (newIdx !== state.hovIdx) {
        state.hovIdx = newIdx;
        state.hovCat = null;
        update();
      }
    });
    barEl.addEventListener('mouseleave', () => {
      if (state.hovIdx !== null) { state.hovIdx = null; update(); }
    });
    barEl.addEventListener('click', (e) => {
      state.hasInteracted = true;
      const seg = barSegmentAt(e.clientX);
      if (seg) {
        state.selIdx = state.selIdx === seg.visIdx ? null : seg.visIdx;
        update();
      }
    });

    // ── Mode + session combobox wiring ──
    const replayableSessions = listReplayableSessionsScoped();

    // Combobox state
    const ui = {
      search: '',       // current filter query
      sort: 'recent',   // 'recent' | 'turns' | 'tokens'
      // Set to true whenever the sort criterion actually changes. The next
      // renderSessionList() consumes it, resets sessionList.scrollTop, and
      // clears it back to false. Opening the list with the SAME sort leaves
      // the scroll offset untouched so users can scroll, pick an item, and
      // later re-open the list back at the same position.
      _pendingScrollReset: false
    };

    function cleanSessionSnippet(raw) {
      if (!raw) return null;
      // <command-name> can appear anywhere (e.g. after <command-message>)
      const cmd = raw.match(/<command-name>([\s\S]*?)(?:<\/command-name>|$)/i);
      if (cmd) {
        const name = cmd[1].replace(/<.*$/, '').trim();
        if (!name) return null;
        const cmdStr = name.startsWith('/') ? name : '/' + name;
        const args = raw.match(/<command-args>([\s\S]*?)(?:<\/command-args>|$)/i);
        const argsStr = args ? args[1].replace(/<.*$/, '').trim() : '';
        return argsStr ? cmdStr + ' ' + argsStr : cmdStr;
      }
      // Strip leading XML-like wrapper tags (hooks, system-reminder, etc.) iteratively
      const leadingTag = /^<([a-z][a-z0-9-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*|^<[a-z][a-z0-9-]*(?:\s[^>]*)?\/>\s*/i;
      let s = raw;
      let prev;
      do { prev = s; s = s.replace(leadingTag, ''); } while (s !== prev);
      // Drop unclosed/truncated leading tag (e.g. "<command-nam" or "<user-prompt-submit-hook>truncated...")
      s = s.replace(/^<[a-z][a-z0-9-]*[\s\S]*$/, '').trim();
      return s || null;
    }

    function formatSessionOption(s) {
      const d = new Date(s.maxTs);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const dayNames = (t('dayNames') || 'Sun,Mon,Tue,Wed,Thu,Fri,Sat').split(',');
      const dateStr = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + (dayNames[d.getDay()] || '')
        + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      const raw = (s.firstPrompt && s.firstPrompt.text) ? s.firstPrompt.text : null;
      const cleaned = cleanSessionSnippet(raw);
      const hasSnippet = !!cleaned;
      const snippet = cleaned || '(no preview)';
      const modelStr = s.model ? shortModel(s.model) : '';
      const peakStr = s.peakTokens > 0 ? fmt(s.peakTokens) : '';
      return { snippet: snippet, hasSnippet: hasSnippet, dateStr: dateStr, turns: s.count, modelStr: modelStr, peakStr: peakStr };
    }

    // Apply search / sort / global period to produce the visible session list.
    // The date range comes from the left-panel period filter (currentPeriod /
    // customDateRange) — same knob that drives the rest of the dashboard.
    function sessionInGlobalPeriod(s) {
      if (customDateRange) {
        return s.maxTs >= customDateRange.start.getTime() && s.maxTs <= customDateRange.end.getTime();
      }
      if (currentPeriod === 0) return true;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (currentPeriod - 1));
      cutoff.setHours(0, 0, 0, 0);
      return s.maxTs >= cutoff.getTime();
    }
    function filteredSessions() {
      const q = ui.search.trim().toLowerCase();
      let list = replayableSessions.filter((s) => {
        if (!sessionInGlobalPeriod(s)) return false;
        if (!q) return true;
        const txt = ((s.firstPrompt && s.firstPrompt.text) || '').toLowerCase();
        return txt.indexOf(q) >= 0 || s.id.toLowerCase().indexOf(q) >= 0;
      });
      if (ui.sort === 'turns') {
        list = list.slice().sort((a, b) => b.count - a.count);
      } else if (ui.sort === 'tokens') {
        list = list.slice().sort((a, b) => b.peakTokens - a.peakTokens);
      } else {
        list = list.slice().sort((a, b) => b.maxTs - a.maxTs);
      }
      return list;
    }

    function renderSessionList() {
      const list = filteredSessions();
      if (list.length === 0) {
        sessionItems.innerHTML = '<div class="cw-session-no-match">' + escapeHtml(t('cwe_noMatch')) + '</div>';
        sessionNav.style.display = 'none';
        return;
      }
      const html = list.map((s) => {
        const f = formatSessionOption(s);
        const active = s.id === state.sessionId;
        const rowBg = active ? 'background:var(--cw-accent-bg)' : '';
        const metaParts = [f.dateStr, fmtCompact(f.turns) + ' ' + t('cwe_sessionTurns')];
        const tagParts = [];
        if (f.modelStr) tagParts.push('<span class="cw-pick-tag--accent">' + escapeHtml(f.modelStr) + '</span>');
        if (f.peakStr)  tagParts.push('<span class="cw-pick-tag--neutral">' + escapeHtml(f.peakStr) + ' ctx</span>');
        const snippetCls = f.hasSnippet ? 'cw-pick-snippet--plain' : 'cw-pick-snippet--faint';
        return '<div data-cw-pick="' + escapeHtml(s.id) + '" class="cw-pick-row" style="' + rowBg + '">'
          +   '<div data-cw-tip="' + escapeHtml(f.snippet) + '" class="' + snippetCls + '">' + escapeHtml(f.snippet) + '</div>'
          +   '<div class="cw-pick-meta-row">'
          +     '<span class="cw-pick-meta-text">' + escapeHtml(metaParts.join(' · ')) + '</span>'
          +     tagParts.join('')
          +   '</div>'
          + '</div>';
      }).join('');
      sessionItems.innerHTML = html;
      sessionNav.style.display = list.length > 3 ? 'flex' : 'none';
      bindSnippetTooltips();
    }

    function bindSnippetTooltips() {
      let tipEl = null;
      const removeTip = () => { if (tipEl) { tipEl.remove(); tipEl = null; } };
      sessionItems.querySelectorAll('[data-cw-tip]').forEach((el) => {
        el.addEventListener('mouseenter', () => {
          const tip = el.dataset.cwTip;
          if (!tip || el.scrollWidth <= el.offsetWidth) return;
          removeTip();
          tipEl = document.createElement('div');
          tipEl.className = 'period-tooltip';
          tipEl.style.maxWidth = '480px';
          tipEl.style.whiteSpace = 'normal';
          tipEl.style.wordBreak = 'break-all';
          tipEl.textContent = tip;
          document.body.appendChild(tipEl);
          const r = el.getBoundingClientRect();
          const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
          let left = r.left;
          if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
          if (left < 8) left = 8;
          const topAbove = r.top - th - 4;
          tipEl.style.left = left + 'px';
          tipEl.style.top = (topAbove > 8 ? topAbove : r.bottom + 4) + 'px';
        });
        el.addEventListener('mouseleave', removeTip);
      });
    }

    function openSessionList() {
      if (replayableSessions.length === 0) return;
      renderSessionList();
      sessionList.style.display = 'block';
      // Only reset scroll if the sort was changed since the last render.
      // Otherwise preserve the user's scroll position so picking an item
      // from the middle of the list doesn't lose their place.
      if (ui._pendingScrollReset) {
        sessionList.scrollTop = 0;
        ui._pendingScrollReset = false;
      }
    }
    function closeSessionList() { sessionList.style.display = 'none'; }

    function applySessionInputLabel() {
      const cur = replayableSessions.find((s) => s.id === state.sessionId);
      if (cur) {
        const f = formatSessionOption(cur);
        sessionInput.value = f.snippet + '  —  ' + f.dateStr;
      } else {
        sessionInput.value = '';
      }
    }

    // Renders the metadata panel shown in place of the playback bar when a
    // real session is loaded. Kept separate from the input label so the full
    // prompt snippet stays visible even when the input clips it.
    function renderSessionInfo() {
      if (!sessionInfo) return;
      if (state.mode !== 'session') { sessionInfo.style.display = 'none'; return; }
      const cur = replayableSessions.find((s) => s.id === state.sessionId);
      if (!cur) { sessionInfo.style.display = 'none'; sessionInfo.innerHTML = ''; return; }
      const f = formatSessionOption(cur);
      const chip = (label, value, mono) => {
        if (!value) return '';
        return '<div class="cw-info-chip">'
          +   '<span class="cw-info-label">' + escapeHtml(label) + '</span>'
          +   '<span class="cw-info-value' + (mono ? ' cw-info-value--mono' : '') + '">' + escapeHtml(value) + '</span>'
          + '</div>';
      };
      const parts = [];
      // Prompt snippet takes the remaining width — clipped with ellipsis so
      // long first-prompts do not push the meta chips off the row.
      parts.push('<div class="cw-info-wrap">'
        + '<span class="cw-info-label">' + escapeHtml(t('cwe_infoPrompt')) + '</span>'
        + '<span title="' + escapeHtml(f.snippet) + '" class="cw-info-snippet ' + (f.hasSnippet ? 'cw-info-snippet--plain' : 'cw-info-snippet--faint') + '">' + escapeHtml(f.snippet) + '</span>'
        + '</div>');
      parts.push(chip(t('cwe_infoDate'), f.dateStr, true));
      parts.push(chip(t('cwe_infoTurns'), fmtCompact(f.turns), true));
      if (f.modelStr) parts.push(chip(t('cwe_infoModel'), f.modelStr, true));
      if (f.peakStr)  parts.push(chip(t('cwe_infoPeak'), f.peakStr, true));
      sessionInfo.innerHTML = parts.join('');
      sessionInfo.style.display = 'flex';
    }

    function selectSession(sessionId) {
      const events = buildSessionEventsScoped(sessionId);
      state.sessionId = sessionId;
      state.sessionEvents = events;
      state.sessionLabelStash = null; // new selection — discard any stashed previous label
      ui.search = '';
      // Bump the budget to 1M for sessions whose peak cumulative exceeds 200K
      // (those sessions must have been on a 1m-context model).
      const peak = events.reduce((m, e) => e.cumulative > m ? e.cumulative : m, 0);
      state.budget = peak > MAX ? BIG_MAX : MAX;
      // Default to "full view": show the whole timeline immediately.
      state.time = 1;
      state.gatesPassed = 0;
      state.selIdx = null;
      state.hovIdx = null;
      state.playing = false;
      applySessionInputLabel();
      renderSessionInfo();
      closeSessionList();
      update();
      // Persist selection in the URL so refresh keeps the user on this session.
      contextSubPath = sessionId;
      try { pushState(false); } catch (e) { /* ignore */ }
    }

    function updateSortStyling() {
      sortBtns.forEach((b) => {
        const active = b.getAttribute('data-cw-sort') === ui.sort;
        b.style.background = active ? 'var(--cw-bg)' : 'transparent';
        b.style.color = active ? 'var(--cw-text)' : 'var(--cw-text-2)';
        b.style.boxShadow = active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none';
      });
    }

    function setMode(mode) {
      if (mode === state.mode) return;
      if (mode === 'session' && replayableSessions.length === 0) return;
      state.mode = mode;
      state.time = 0;
      state.gatesPassed = 0;
      state.selIdx = null;
      state.hovIdx = null;
      state.playing = false;
      state.hasInteracted = true;
      modeBtns.forEach((b) => {
        const active = b.getAttribute('data-cw-mode') === mode;
        b.style.background = active ? 'var(--cw-bg)' : 'transparent';
        b.style.color = active ? 'var(--cw-text)' : 'var(--cw-text-2)';
        b.style.boxShadow = active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none';
      });
      if (mode === 'session') {
        sessionTools.style.display = 'inline-flex';
        bottomBar.style.display = 'none';
        if (tlNav) tlNav.style.display = 'flex';
        // Bar hidden → give cw-main the same 16px bottom that the bar used to provide.
        mainEl.style.paddingBottom = '16px';
        // Entering session mode always starts fresh — nothing selected,
        // input shows only the placeholder. User must pick a session.
        state.sessionId = null;
        state.sessionEvents = [];
        state.sessionLabelStash = null;
        state.budget = MAX;
        sessionInput.value = '';
        ui.search = '';
        renderSessionInfo();
        update();
        // Persist mode so refresh keeps the user on the session tab even without a pick.
        contextSubPath = 'session';
        try { pushState(false); } catch (e) { /* ignore */ }
      } else {
        sessionTools.style.display = 'none';
        bottomBar.style.display = 'flex';
        if (tlNav) { tlNav.style.display = 'none'; tlNav.style.opacity = '0'; tlNav.style.pointerEvents = 'none'; }
        mainEl.style.paddingBottom = '0';
        state.budget = MAX;
        closeSessionList();
        renderSessionInfo();
        update();
        // Use 'example' (not '') so re-renders stay in example mode.
        // Empty path '' is reserved for "fresh navigation → default to session".
        contextSubPath = 'example';
        try { pushState(false); } catch (e) { /* ignore */ }
      }
    }

    // Initialize empty-state hint
    if (replayableSessions.length === 0) {
      sessionEmpty.style.display = 'inline';
      modeBtns.forEach((b) => {
        if (b.getAttribute('data-cw-mode') === 'session') {
          b.disabled = true;
          b.style.opacity = '0.4';
          b.style.cursor = 'not-allowed';
        }
      });
    }

    // Restore session state from contextSubPath so re-renders (e.g. scope /
    // period changes) don't bounce the user back to example mode.
    // `pendingContextSid` was only used by the original deep-link path; we now
    // rely on the module-level `contextSubPath` which is kept in sync by
    // setMode() / selectSession() / applyHash().
    pendingContextSid = null;
    const tlNav = document.getElementById('cw-tl-nav');
    const deepLinkSid = contextSubPath;
    if (deepLinkSid === 'session' && replayableSessions.length > 0) {
      state.mode = 'session';
      sessionTools.style.display = 'inline-flex';
      bottomBar.style.display = 'none';
      if (tlNav) tlNav.style.display = 'flex';
      mainEl.style.paddingBottom = '16px';
    } else if (deepLinkSid && deepLinkSid !== 'example' && replayableSessions.some((s) => s.id === deepLinkSid)) {
      state.mode = 'session';
      sessionTools.style.display = 'inline-flex';
      bottomBar.style.display = 'none';
      if (tlNav) tlNav.style.display = 'flex';
      mainEl.style.paddingBottom = '16px';
      selectSession(deepLinkSid);
    } else if (!deepLinkSid && replayableSessions.length > 0) {
      // Fresh navigation (#context with no sub-path) → default to session mode.
      state.mode = 'session';
      sessionTools.style.display = 'inline-flex';
      bottomBar.style.display = 'none';
      if (tlNav) tlNav.style.display = 'flex';
      mainEl.style.paddingBottom = '16px';
      contextSubPath = 'session';
      try { pushState(false); } catch (e) { /* ignore */ }
    }

    // Initialize mode + sort tab styling on first render.
    modeBtns.forEach((b) => {
      const active = b.getAttribute('data-cw-mode') === state.mode;
      if (active) {
        b.style.background = 'var(--cw-bg)';
        b.style.color = 'var(--cw-text)';
        b.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
      }
    });
    updateSortStyling();
    renderSessionInfo();

    modeBtns.forEach((b) => {
      b.addEventListener('click', () => setMode(b.getAttribute('data-cw-mode')));
    });

    // Combobox interactions
    // When a session is selected, any re-interaction (focus via Tab, or mousedown
    // while the input is already focused) should clear the value. We use mousedown
    // AND focus because focus does not re-fire on already-focused inputs.
    function clearInputIfSessionPicked() {
      if (state.sessionId && sessionInput.value && !state.sessionLabelStash) {
        state.sessionLabelStash = sessionInput.value;
        sessionInput.value = '';
        ui.search = '';
      }
    }
    sessionInput.addEventListener('focus', () => {
      clearInputIfSessionPicked();
      openSessionList();
    });
    sessionInput.addEventListener('mousedown', () => {
      clearInputIfSessionPicked();
      openSessionList();
    });
    sessionInput.addEventListener('input', () => {
      ui.search = sessionInput.value;
      openSessionList();
    });
    sessionInput.addEventListener('blur', () => {
      // If the user blurred without actually picking a new session, restore the
      // previous label. selectSession() clears the stash on successful selection,
      // so when stash is still set here it means "no new pick happened".
      if (state.sessionLabelStash) {
        sessionInput.value = state.sessionLabelStash;
        ui.search = '';
      }
      state.sessionLabelStash = null;
    });
    sessionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeSessionList(); sessionInput.blur(); }
      else if (e.key === 'Enter') {
        const first = sessionList.querySelector('[data-cw-pick]');
        if (first) selectSession(first.getAttribute('data-cw-pick'));
      }
    });
    sessionItems.addEventListener('mousedown', (e) => {
      // mousedown (not click) so the input doesn't lose focus before we select.
      const row = e.target.closest('[data-cw-pick]');
      if (!row) return;
      e.preventDefault();
      selectSession(row.getAttribute('data-cw-pick'));
    });
    // Stored on window (like _cwKeyHandler) so teardownContextExplorer()
    // can remove it — an anonymous listener here would pin detached DOM.
    window._cwMouseHandler = (e) => {
      if (!sessionTools.contains(e.target)) closeSessionList();
    };
    document.addEventListener('mousedown', window._cwMouseHandler);
    // Session list scroll nav — sticky overlay inside the list
    const listTopBtn = document.getElementById('cw-list-top');
    const listBottomBtn = document.getElementById('cw-list-bottom');
    if (listTopBtn) listTopBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); sessionList.scrollTop = 0; });
    if (listBottomBtn) listBottomBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); sessionList.scrollTop = sessionList.scrollHeight; });

    // Timeline scroll nav — overlay at bottom-right, visible on hover
    const tlTopBtn = document.getElementById('cw-tl-top');
    const tlBottomBtn = document.getElementById('cw-tl-bottom');
    if (tlNav && timelineEl) {
      const tlWrap = timelineEl.parentElement;
      tlWrap.addEventListener('mouseenter', () => { tlNav.style.opacity = '1'; tlNav.style.pointerEvents = 'auto'; });
      tlWrap.addEventListener('mouseleave', () => { tlNav.style.opacity = '0'; tlNav.style.pointerEvents = 'none'; });
      if (tlTopBtn) tlTopBtn.addEventListener('click', () => { timelineEl.scrollTop = 0; updateVirtualRows(); });
      if (tlBottomBtn) tlBottomBtn.addEventListener('click', () => { timelineEl.scrollTop = timelineEl.scrollHeight; updateVirtualRows(); });
    }
    // Virtual timeline: re-render visible rows on scroll
    timelineEl.addEventListener('scroll', updateVirtualRows, { passive: true });

    sortBtns.forEach((b) => {
      b.addEventListener('mousedown', (e) => {
        // Prevent input blur so the session list stays open and label stash is not restored.
        e.preventDefault();
      });
      b.addEventListener('click', () => {
        const next = b.getAttribute('data-cw-sort');
        if (next === ui.sort) return; // no change, nothing to do
        ui.sort = next;
        updateSortStyling();
        if (sessionList.style.display !== 'none') {
          // Layer is open → apply immediately and reset scroll now.
          renderSessionList();
          sessionList.scrollTop = 0;
        } else {
          // Layer is hidden → defer scroll reset until the next open.
          ui._pendingScrollReset = true;
        }
      });
    });

    playBtn.addEventListener('click', togglePlay);
    const skipBtn = document.getElementById('cw-skip');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      state.playing = false;
      if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
      // In example mode, jump to the current gate rather than past it.
      const nextGate = activeGates().find((g, i) => i >= state.gatesPassed);
      if (state.mode === 'example' && nextGate) {
        state.time = nextGate.at;
      } else {
        state.time = 1;
      }
      update();
    });
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else root.requestFullscreen && root.requestFullscreen().catch(() => {});
    });
    window._cwFsHandler = () => {
      state.isFullscreen = !!document.fullscreenElement;
      fsBtn.textContent = state.isFullscreen ? '⤡' : '⛶';
    };
    document.addEventListener('fullscreenchange', window._cwFsHandler);

    // Keyboard: Space
    window._cwKeyHandler = (e) => {
      if (!root.isConnected) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      const rect = root.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (e.code === 'Space') {
        if (!state.hasInteracted) return;
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', window._cwKeyHandler);

    update();
  }

  // ── Category overview page ──
  function renderCategoryOverview() {
    let cat = CATEGORIES.find((c) => { return c.key === currentView; });
    if (!cat) { renderOverview(); return; }

    let items = getItems(currentView);
    const scope = DATA.scopes.find((s) => { return s.id === currentScope; });
    const days = customDateRange ? 0 : currentPeriod;

    // Category descriptions
    const CATEGORY_DESC = {
      skills: { key: 'catDescSkills', docs: 'https://docs.anthropic.com/en/docs/claude-code/skills' },
      agents: { key: 'catDescAgents', docs: 'https://docs.anthropic.com/en/docs/claude-code/sub-agents' },
      rules: { key: 'catDescRules' },
      principles: { key: 'catDescPrinciples' },
      hooks: { key: 'catDescHooks', docs: 'https://docs.anthropic.com/en/docs/claude-code/hooks' },
      memory: { key: 'catDescMemory', docs: 'https://docs.anthropic.com/en/docs/claude-code/memory' },
      mcpServers: { key: 'catDescMcpServers', docs: 'https://docs.anthropic.com/en/docs/claude-code/mcp' },
      plugins: { key: 'catDescPlugins', docs: 'https://docs.anthropic.com/en/docs/claude-code/plugins' },
      configFiles: { key: 'catDescConfigFiles', docs: 'https://docs.anthropic.com/en/docs/claude-code/settings' }
    };
    const catDesc = CATEGORY_DESC[currentView];
    const catDescText = catDesc ? escapeHtml(t(catDesc.key)) : '';

    let html = '<div class="page-header">'
      + '<h1>' + cat.icon + ' ' + t('categoryOverview', getCatLabel(cat)) + '</h1>'
      + '<div class="subtext">' + t('itemsIn', items.length, scope ? scope.label : currentScope) + '</div>'
      + (catDescText ? '<div class="page-desc">' + catDescText
        + docsLinkHtml(catDesc.docs)
        + '</div>' : '')
      + '</div>';

    // Stat cards for category
    let usageType = currentView;
    const hasUsageTracking = usageType === 'skills' || usageType === 'agents' || usageType === 'commands' || usageType === 'mcpServers';

    if (hasUsageTracking) {
      html += renderPeriodFilter();
    }

    if (hasUsageTracking) {
      const totalUsage = countUsageList(getUsageList(usageType), days);
      let usedCount = items.filter((item) => {
        return countUsage(usageType, getItemName(currentView, item), days) > 0;
      }).length;
      const unusedCount = items.length - usedCount;
      html += '<div class="card-grid">'
        + statCard(t('totalCount'), items.length, null)
        + statCard(t('periodUsage'), totalUsage, null)
        + statCard(t('usedCount'), usedCount, null)
        + statCard(t('unusedCount'), unusedCount, null)
        + '</div>';
    } else {
      html += '<div class="card-grid">'
        + statCard(t('totalCount'), items.length, null)
        + '</div>';
    }

    // Top used (for skills/agents/mcpServers) — overview style with ranked colors
    if (usageType === 'skills' || usageType === 'agents' || usageType === 'mcpServers') {
      const usageCounts = {};
      const uList = filterByPeriod(getUsageList(usageType), 'timestamp', days);
      // Normalize skill names
      const actualNames = items.map((i) => { return getItemName(currentView, i); });
      uList.forEach((u) => {
        let name = u.name;
        if (usageType === 'skills' && name.includes(':')) {
          let short = name.split(':').pop();
          if (actualNames.indexOf(short) !== -1) name = short;
        }
        usageCounts[name] = (usageCounts[name] || 0) + 1;
      });
      const topUsed = Object.entries(usageCounts).sort((a, b) => { return b[1] - a[1]; }).slice(0, 5);

      if (topUsed.length > 0) {
        const rankColors = ['#4263eb', '#7c3aed', '#0ca678', '#e8590c', '#dc2626'];
        html += '<div class="section"><div class="section-title">' + t('topUsed') + '</div><div class="popular-grid">';
        topUsed.forEach((pair, i) => {
          const bgColor = rankColors[i] || '#6b7280';
          let cardStyle = 'border-top:3px solid ' + bgColor;
          if (i === 0) cardStyle += ';background:linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)';
          const rankClass = 'popular-card popular-card-ranked' + (i === 0 ? ' popular-rank-1' : '');
          html += '<div class="' + rankClass + '" style="' + cardStyle + '" data-action="goto-detail" data-category="' + currentView + '" data-name="' + escapeHtml(pair[0]) + '">'
            + '<div class="pop-badges">' + typeBadge(currentView) + parentBadge(currentView, pair[0]) + '</div>'
            + '<div class="pop-rank-big" style="color:' + bgColor + '">' + (i + 1) + '</div>'
            + '<div class="pop-name">' + escapeHtml(pair[0]) + '</div>'
            + '<div class="pop-count">' + fmtNum(pair[1]) + ' ' + t('calls') + '</div>'
            + '</div>';
        });
        html += '</div></div>';
      }

      // Recently used
      const recentUsed = [].concat(getUsageList(usageType)).sort((a, b) => { return new Date(b.timestamp) - new Date(a.timestamp); });
      const seen = {};
      let recentUnique = [];
      recentUsed.forEach((u) => {
        let name = u.name;
        if (usageType === 'skills' && name.includes(':')) {
          const short = name.split(':').pop();
          if (actualNames.indexOf(short) !== -1) name = short;
        }
        if (!seen[name]) { seen[name] = true; recentUnique.push({ name: name, timestamp: u.timestamp }); }
      });
      recentUnique = recentUnique.slice(0, 10);

      if (recentUnique.length > 0) {
        html += '<div class="section"><div class="section-title">' + t('recentlyUsed') + '</div><div class="recent-list">';
        recentUnique.forEach((item) => {
          html += '<div class="recent-item" data-action="goto-detail" data-category="' + currentView + '" data-name="' + escapeHtml(item.name) + '">'
            + '<span class="ri-icon">' + cat.icon + '</span>'
            + '<span class="ri-name">' + escapeHtml(item.name) + '</span>'
            + '<span class="ri-time">' + relativeTime(item.timestamp) + '</span>'
            + '</div>';
        });
        html += '</div></div>';
      }

      // Unused
      const unusedItems = items.filter((item) => {
        return countUsage(usageType, getItemName(currentView, item), days) === 0;
      });
      if (unusedItems.length > 0) {
        html += '<div class="section"><div class="section-title">' + t('unused') + ' (' + fmtNum(unusedItems.length) + ') <span class="section-title-sub">' + t('unusedCriteria') + '</span></div><div class="unused-grid">';
        unusedItems.forEach((item) => {
          let name = getItemName(currentView, item);
          html += '<div class="unused-item" data-action="goto-detail" data-category="' + currentView + '" data-name="' + escapeHtml(name) + '">'
            + typeBadge(currentView) + parentBadge(currentView, name) + '<span>' + escapeHtml(name) + '</span></div>';
        });
        html += '</div></div>';
      }
    }

    // All items list
    html += '<div class="section"><div class="section-title">' + t('allItems') + '</div>';

    if (items.length === 0) {
      html += '<div class="empty-state">'
        + '<div class="empty-icon">' + cat.icon + '</div>'
        + '<div class="empty-text">' + t('noItems', getCatLabel(cat).toLowerCase()) + '</div>'
        + '</div>';
    } else {
      html += '<div class="recent-list">';
      items.forEach((item) => {
        let name = getItemName(currentView, item);
        const desc = item.description || '';
        let extra = '';
        if (currentView === 'skills') {
          const cnt = countUsage('skills', name, 0);
          extra = '<span class="ri-time">' + fmtNum(cnt) + ' ' + t('calls') + '</span>';
        } else if (currentView === 'agents') {
          let model = item.model || '';
          let modelClass = model.includes('haiku') ? 'haiku' : model.includes('sonnet') ? 'sonnet' : model.includes('opus') ? 'opus' : 'default';
          extra = model ? '<span class="badge badge-model-' + modelClass + '">' + escapeHtml(model) + '</span>' : '';
        } else if (currentView === 'plugins') {
          extra = item.enabled !== false
            ? '<span class="badge badge-enabled">Enabled</span>'
            : '<span class="badge badge-disabled">Disabled</span>';
        } else if (currentView === 'memory') {
          let mtype = item.type || 'reference';
          extra = '<span class="badge badge-type-' + mtype + '">' + mtype + '</span>';
        } else if (currentView === 'teams') {
          extra = '<span class="ri-time">' + (item.members || 0) + ' members</span>';
        } else if (currentView === 'todos') {
          extra = '<span class="ri-time">' + (item.pending || 0) + '/' + (item.total || 0) + '</span>';
        } else if (currentView === 'commands') {
          extra = item.allowedTools ? '<span class="ri-time" style="font-size:11px">' + escapeHtml((item.allowedTools + '').slice(0, 40)) + '</span>' : '';
        }
        html += '<div class="recent-item" data-action="goto-detail" data-category="' + currentView + '" data-name="' + escapeHtml(name) + '">'
          + '<span class="ri-icon">' + cat.icon + '</span>'
          + '<span class="ri-name">' + escapeHtml(name) + '</span>'
          + (desc ? '<span class="ri-time" style="flex:2;color:var(--text-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(desc.slice(0, 60)) + '</span>' : '')
          + extra + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();
  }

  // ── Detail views ──
  function renderDetailView() {
    let category = currentDetail.category;
    let name = currentDetail.name;
    const items = getItems(category);
    let item = items.find((i) => { return getItemName(category, i) === name; });

    // Resolve plugin:skill names (e.g., "superpowers:brainstorming" → skill "brainstorming")
    if (!item && category === 'skills' && name.includes(':')) {
      const shortName = name.split(':').pop();
      item = items.find((i) => { return getItemName(category, i) === shortName; });
      if (item) { name = shortName; currentDetail.name = shortName; }
    }
    // Resolve agent description names to actual agent names
    if (!item && category === 'agents') {
      item = items.find((i) => {
        return i.name && (name.toLowerCase().includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(name.toLowerCase()));
      });
      if (item) { name = item.name; currentDetail.name = item.name; }
    }

    if (!item) {
      const cat = CATEGORIES.find((c) => { return c.key === category; });
      const catLabel = cat ? getCatLabel(cat) : category;
      // Fuzzy suggestions: find items whose names share a subsequence or prefix with the requested name
      const lowerName = name.toLowerCase();
      const suggestions = items
        .map((i) => { return getItemName(category, i); })
        .filter((n) => {
          const ln = n.toLowerCase();
          return ln.includes(lowerName) || lowerName.includes(ln) || ln.startsWith(lowerName.slice(0, 3));
        })
        .slice(0, 5);

      let html = '<div class="empty-state">'
        + '<div class="empty-icon">🔍</div>'
        + '<div class="empty-text">' + t('itemNotFound', escapeHtml(name)) + '</div>'
        + '<div style="margin-top:12px">'
        +   '<button class="session-back-btn" data-action="nav-view" data-view="' + escapeHtml(category) + '">'
        +   '← ' + t('itemNotFoundBack', escapeHtml(catLabel))
        +   '</button>'
        + '</div>';
      if (suggestions.length > 0) {
        html += '<div style="margin-top:16px;font-size:13px;color:var(--text-secondary)">' + t('itemNotFoundSuggest') + '</div>'
          + '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">';
        suggestions.forEach((sug) => {
          html += '<span class="skill-chip" data-action="goto-detail" data-category="' + escapeHtml(category) + '" data-name="' + escapeHtml(sug) + '">'
            + escapeHtml(sug) + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';
      content.innerHTML = html;
      bindContentActions();
      return;
    }

    let cat = CATEGORIES.find((c) => { return c.key === category; });
    let html = '<div class="page-header">'
      + '<div class="detail-badges">' + typeBadge(category) + parentBadge(category, name) + '</div>'
      + '<h1>' + (cat ? cat.icon : '') + ' ' + escapeHtml(name) + '</h1>'
      + '</div>';

    switch (category) {
      case 'configFiles': html += renderConfigFileDetail(item); break;
      case 'skills': html += renderSkillDetail(item); break;
      case 'agents': html += renderAgentDetail(item); break;
      case 'plugins': html += renderPluginDetail(item); break;
      case 'hooks': html += renderHookDetail(item); break;
      case 'memory': html += renderMemoryDetail(item); break;
      case 'mcpServers': html += renderMcpDetail(item); break;
      case 'rules': html += renderRuleDetail(item); break;
      case 'principles': html += renderPrincipleDetail(item); break;
      case 'commands': html += renderCommandDetail(item); break;
      case 'teams': html += renderTeamDetail(item); break;
      case 'plans': html += renderPlanDetail(item); break;
      case 'todos': html += renderTodoDetail(item); break;
    }

    content.innerHTML = html;
    bindContentActions();
  }

  function syntaxHighlightJson(json, showLineNumbers, alreadyEscaped) {
    const highlighted = (alreadyEscaped ? json : escapeHtml(json)).replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span class="json-key">$1</span>:'
    ).replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      ': <span class="json-string">$1</span>'
    ).replace(
      /:\s*(true|false)/g,
      ': <span class="json-bool">$1</span>'
    ).replace(
      /:\s*(\d+(?:\.\d+)?)/g,
      ': <span class="json-number">$1</span>'
    ).replace(
      /:\s*(null)/g,
      ': <span class="json-null">$1</span>'
    );
    if (!showLineNumbers) return highlighted;
    const lines = highlighted.split('\n');
    const pad = String(lines.length).length;
    return lines.map((line, i) => {
      let num = String(i + 1);
      while (num.length < pad) num = ' ' + num;
      return '<span class="line-num">' + num + '</span>' + line;
    }).join('\n');
  }

  function renderConfigFileDetail(item) {
    let html = '';
    if (item.scope) {
      html += '<div class="detail-meta">' + metaCard('SCOPE', item.scope) + '</div>';
    }
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }

    // Per-file descriptions
    const CONFIG_DESC = {
        'settings.json': { key: 'configDescSettings', docs: 'https://docs.anthropic.com/en/docs/claude-code/settings' },
        'settings.local.json': { key: 'configDescSettingsLocal', docs: 'https://docs.anthropic.com/en/docs/claude-code/settings' },
        'CLAUDE.md': { key: 'configDescClaudeMd', docs: 'https://docs.anthropic.com/en/docs/claude-code/memory' },
        'AGENTS.md': { key: 'configDescAgentsMd', docs: 'https://docs.anthropic.com/en/docs/claude-code/sub-agents' }
      };
      const descEntry = CONFIG_DESC[item.name];
      if (descEntry) {
        html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
          + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(t(descEntry.key))
          + docsLinkHtml(descEntry.docs)
          + '</div></div>';
      }

    // JSON config file (settings.json, etc.)
    if (item.jsonContent) {
      const stats = item.jsonStats || {};
      const keys = item.jsonKeys || [];

      // Summary section
      const summaryParts = [];
      if (stats.hooks) summaryParts.push('hooks: ' + fmtNum(stats.hooks) + t('unitEvents'));
      if (stats.enabledPlugins) summaryParts.push('enabledPlugins: ' + fmtNum(stats.enabledPlugins));
      if (stats.permissions) summaryParts.push('permissions: ' + t('configuredLabel'));
      if (stats.env) summaryParts.push('env: ' + fmtNum(stats.env) + t('unitVars'));

      html += '<div class="section"><div class="section-title">' + t('configSummary') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">'
        + '<strong>' + t('configTopLevelKeys') + '</strong> ' + keys.map((k) => { return '<code>' + escapeHtml(k) + '</code>'; }).join(', ')
        + (summaryParts.length > 0 ? '<br>' + summaryParts.join(' · ') : '')
        + '</div></div>';

      // JSON code
      html += '<div class="section"><div class="section-title">' + t('configFull') + '</div>'
        + '<div class="content-preview"><pre><code class="lang-json">' + syntaxHighlightJson(item.jsonContent, true) + '</code></pre></div></div>';

    } else {
      // Markdown config files (CLAUDE.md, AGENTS.md)
      if (item.body) {
        html += '<div class="content-preview">' + renderMarkdown(item.body) + '</div>';
      } else {
        html += '<div class="empty-state"><div class="empty-text">' + t('noContent') + '</div></div>';
      }
    }
    return html;
  }

  function renderSkillDetail(item) {
    let html = '<div class="detail-meta">';
    html += usageMetaCards('skills', item.name);
    if (item.version) html += metaCard('VERSION', item.version);
    if (item.plugin) html += metaCard('PLUGIN', item.plugin);
    const skillAuthor = getPluginAuthor(item.plugin);
    if (skillAuthor) html += metaCard('AUTHOR', skillAuthor);
    html += '</div>';

    html += renderEfficiencyBlock('skill', item.name);
    html += descriptionBlock(item.description);

    if (item.argumentHint) {
      html += '<div class="section"><div class="section-title">' + t('argumentHint') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px"><code>' + escapeHtml(item.argumentHint) + '</code></div></div>';
    }

    if (item.allowedTools && item.allowedTools.length > 0) {
      const tools = Array.isArray(item.allowedTools) ? item.allowedTools : item.allowedTools.split(/,\s*/);
      html += '<div class="section"><div class="section-title">' + t('allowedTools') + '</div>'
        + '<div class="card" style="padding:16px"><div class="skills-list">'
        + tools.map((tt) => { return '<span class="skill-chip" style="cursor:default">' + escapeHtml(tt.trim()) + '</span>'; }).join('')
        + '</div></div></div>';
    }

    html += filePathBlock(item.filePath);
    html += markdownBodyBlock(item.body, 'content');
    return html;
  }

  function renderAgentDetail(item) {
    const model = item.model || '';
    const modelClass = model.includes('haiku') ? 'haiku' : model.includes('sonnet') ? 'sonnet' : model.includes('opus') ? 'opus' : 'default';

    let html = '<div class="detail-meta">';
    html += usageMetaCards('agents', item.name);
    if (model) html += '<div class="meta-card"><div class="meta-label">MODEL</div><div class="meta-value"><span class="badge badge-model-' + modelClass + '">' + escapeHtml(model) + '</span></div></div>';
    if (item.plugin) html += metaCard('PLUGIN', item.plugin);
    const agentAuthor = getPluginAuthor(item.plugin);
    if (agentAuthor) html += metaCard('AUTHOR', agentAuthor);
    html += '</div>';

    html += renderEfficiencyBlock('agent', item.name);
    html += descriptionBlock(item.description);
    html += filePathBlock(item.filePath);
    html += markdownBodyBlock(item.body, 'content');
    return html;
  }

  function renderPluginDetail(item) {
    const enabled = item.enabled !== false;
    let html = '<div class="detail-meta">';
    if (item.version) html += metaCard('VERSION', item.version);
    if (item.author) html += metaCard('AUTHOR', item.author);
    html += '<div class="meta-card"><div class="meta-label">STATUS</div><div class="meta-value"><span class="badge ' + (enabled ? 'badge-enabled' : 'badge-disabled') + '">' + (enabled ? 'Enabled' : 'Disabled') + '</span></div></div>';
    if (item.scope) html += metaCard('SCOPE', item.scope);
    if (item.marketplace) html += metaCard('MARKETPLACE', item.marketplace);
    if (item.installedAt) html += metaCard('INSTALLED', formatDate(item.installedAt));
    if (item.lastUpdated) html += metaCard('UPDATED', formatDate(item.lastUpdated));
    html += '</div>';

    html += filePathBlock(item.installPath);

    const pluginSkills = getItems('skills').filter((s) => { return s.plugin === item.name; });
    if (pluginSkills.length > 0) {
      html += '<div class="section"><div class="section-title">' + t('includedSkills') + ' (' + pluginSkills.length + ')</div>'
        + '<div class="card" style="padding:16px"><div class="skills-list">'
        + pluginSkills.map((s) => { return '<span class="skill-chip" data-action="goto-detail" data-category="skills" data-name="' + escapeHtml(s.name) + '">' + escapeHtml(s.name) + '</span>'; }).join('')
        + '</div></div></div>';
    }

    return html;
  }

  function renderHookDetail(item) {
    let html = '<div class="detail-meta">';
    if (item.event) html += metaCard('EVENT', item.event);
    if (item.type) html += metaCard('TYPE', item.type);
    if (item.commandCount > 1) html += metaCard('COMMANDS', item.commandCount);
    html += '</div>';

    // Hook event description
    const hookDescKey = item.event ? 'hookDesc' + item.event : '';
    const hookDesc = hookDescKey && I18N.en[hookDescKey] ? t(hookDescKey) : '';
    if (hookDesc) {
      html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(hookDesc)
        + docsLinkHtml('https://docs.anthropic.com/en/docs/claude-code/hooks#' + item.event.toLowerCase())
        + '</div></div>';
    }

    html += '<div class="section"><div class="section-title">' + t('configuration') + '</div>'
      + '<div class="card" style="padding:16px"><table class="config-table">';
    if (item.event) html += '<tr><td>Event</td><td>' + escapeHtml(item.event) + '</td></tr>';
    if (item.matcher) html += '<tr><td>Matcher</td><td>' + escapeHtml(item.matcher) + '</td></tr>';
    if (item.type) html += '<tr><td>Type</td><td>' + escapeHtml(item.type) + '</td></tr>';
    if (item.command) html += '<tr><td>Command</td><td>' + escapeHtml(item.command) + '</td></tr>';
    html += '</table></div></div>';

    if (item.command) {
      html += '<div class="section"><div class="section-title">' + t('script') + '</div>'
        + '<div class="content-preview"><pre><code>' + escapeHtml(item.command) + '</code></pre></div></div>';
    }

    if (item.rawJson) {
      html += '<div class="section"><div class="section-title">settings.json</div>'
        + '<div class="content-preview"><pre><code class="lang-json">' + syntaxHighlightJson(item.rawJson, true) + '</code></pre></div></div>';
    }

    return html;
  }

  function renderMemoryDetail(item) {
    const mtype = item.type || 'reference';
    let html = '<div class="detail-meta">';
    html += '<div class="meta-card"><div class="meta-label">TYPE</div><div class="meta-value"><span class="badge badge-type-' + mtype + '">' + mtype + '</span></div></div>';
    if (item.scope) html += metaCard('SCOPE', item.scope);
    html += '</div>';

    html += descriptionBlock(item.description);
    html += filePathBlock(item.filePath);
    html += markdownBodyBlock(item.body, 'content');
    return html;
  }

  function renderMcpDetail(item) {
    let html = '<div class="detail-meta">';
    html += usageMetaCards('mcpServers', item.name);
    if (item.type) html += metaCard('TYPE', item.type);
    html += '</div>';

    html += '<div class="section"><div class="section-title">' + t('serverConfig') + '</div>'
      + '<div class="card" style="padding:16px"><table class="config-table">';
    if (item.command) html += '<tr><td>Command</td><td>' + escapeHtml(item.command) + '</td></tr>';
    if (item.args && item.args.length) html += '<tr><td>Args</td><td>' + item.args.map((a) => { return escapeHtml(a); }).join(' ') + '</td></tr>';
    if (item.type) html += '<tr><td>Type</td><td>' + escapeHtml(item.type) + '</td></tr>';
    if (item.sourcePath) html += '<tr><td>Source</td><td>' + escapeHtml(item.sourcePath) + '</td></tr>';
    html += '</table></div></div>';

    if (item.envKeys && item.envKeys.length > 0) {
      html += '<div class="section"><div class="section-title">' + t('envKeys') + '</div>'
        + '<div class="card" style="padding:16px">'
        + item.envKeys.map((k) => { return '<span class="env-key">' + escapeHtml(k) + '</span>'; }).join('')
        + '</div></div>';
    }

    if (item.rawJson) {
      html += '<div class="section"><div class="section-title">.claude.json</div>'
        + '<div class="content-preview"><pre><code class="lang-json">' + syntaxHighlightJson(item.rawJson, true) + '</code></pre></div></div>';
    }

    html += filePathBlock(item.sourcePath);
    return html;
  }

  // Shared body for "simple" detail pages — path header + markdown body or
  // an empty-state hint. Used by rules, principles, and plans.
  function renderSimpleBodyDetail(item) {
    let html = filePathBlock(item.filePath);
    if (item.body) {
      html += '<div class="content-preview">' + renderMarkdown(item.body) + '</div>';
    } else {
      html += '<div class="empty-state"><div class="empty-text">' + t('noContent') + '</div></div>';
    }
    return html;
  }

  function renderRuleDetail(item) { return renderSimpleBodyDetail(item); }
  function renderPrincipleDetail(item) { return renderSimpleBodyDetail(item); }

  function renderCommandDetail(item) {
    let html = descriptionBlock(item.description);
    if (item.allowedTools) {
      html += '<div class="section"><div class="section-title">' + t('allowedTools') + '</div>'
        + '<div class="card" style="padding:16px"><code>' + escapeHtml(item.allowedTools) + '</code></div></div>';
    }
    html += filePathBlock(item.filePath);
    if (item.body) {
      html += '<div class="content-preview">' + renderMarkdown(item.body) + '</div>';
    }
    return html;
  }

  function renderTeamDetail(item) {
    let html = filePathBlock(item.filePath);
    html += descriptionBlock(item.description);
    html += '<div class="detail-meta">'
      + metaCard(t('labelMembers'), item.members || 0)
      + (item.leadAgentId ? metaCard('Lead', item.leadAgentId) : '')
      + (item.createdAt ? metaCard(t('labelCreated'), formatDateTime(item.createdAt)) : '')
      + '</div>';
    // Member list
    if (item.memberList && item.memberList.length > 0) {
      html += '<div class="section"><div class="section-title">' + t('memberList') + '</div>'
        + '<div class="card" style="padding:0;overflow:hidden">'
        + '<div class="recent-item" style="background:var(--hover);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);cursor:default;border-bottom:1px solid var(--border)">'
        + '<span class="ri-icon" style="visibility:hidden">🤖</span>'
        + '<span class="ri-name">' + t('colName') + '</span>'
        + '<span class="ri-time" style="flex:2">' + t('colRole') + '</span>'
        + '<span style="font-size:11px">' + t('colModel') + '</span>'
        + '</div>'
        + '<div class="recent-list" style="margin:0">';
      item.memberList.forEach((m, idx) => {
        let modelShort = (m.model || '').replace(/^claude-/, '').replace(/-\d{8,}$/, '');
        let modelClass = m.model && m.model.includes('haiku') ? 'haiku' : m.model && m.model.includes('sonnet') ? 'sonnet' : m.model && m.model.includes('opus') ? 'opus' : 'default';
        let hasDetail = m.prompt || m.cwd;
        html += '<div class="recent-item' + (hasDetail ? ' team-member-toggle' : '') + '"' + (hasDetail ? ' data-member-idx="' + idx + '" style="cursor:pointer"' : '') + '>'
          + '<span class="ri-icon">🤖</span>'
          + '<span class="ri-name">' + escapeHtml(m.name) + (m.color ? ' <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + escapeHtml(m.color) + ';vertical-align:middle;margin-left:4px"></span>' : '') + '</span>'
          + '<span class="ri-time" style="flex:2;color:var(--text-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(m.agentType || '') + '</span>'
          + (modelShort ? '<span class="badge badge-model-' + modelClass + '">' + escapeHtml(modelShort) + '</span>' : '')
          + (hasDetail ? '<span class="chevron" style="font-size:10px;color:var(--text-secondary);margin-left:8px">▶</span>' : '')
          + '</div>';
        if (hasDetail) {
          html += '<div class="team-member-detail" id="team-member-' + idx + '" style="display:none;padding:12px 16px 12px 44px;border-bottom:1px solid var(--border);background:var(--hover)">';
          if (m.cwd) {
            html += '<div class="file-path" style="margin-bottom:8px"><span class="file-path-label">cwd</span> ' + escapeHtml(m.cwd) + '</div>';
          }
          if (m.prompt) {
            html += '<div class="content-preview" style="font-size:12px;line-height:1.6">' + renderMarkdown(m.prompt) + '</div>';
          }
          html += '</div>';
        }
      });
      html += '</div></div></div>';
    }
    return html;
  }

  function renderPlanDetail(item) { return renderSimpleBodyDetail(item); }

  function renderTodoDetail(item) {
    let html = '<div class="detail-meta">'
      + metaCard(t('labelTotal'), item.total || 0)
      + metaCard(t('labelPending'), item.pending || 0)
      + metaCard(t('labelCompleted'), item.completed || 0)
      + '</div>';
    html += filePathBlock(item.filePath);
    return html;
  }

  function metaCard(label, value) {
    return '<div class="meta-card">'
      + '<div class="meta-label">' + label + '</div>'
      + '<div class="meta-value">' + escapeHtml(String(value)) + '</div>'
      + '</div>';
  }

  // ── Health Score card ──
  // billboard.js gauge (left) + factor details (right), always visible.

  function drawHealthGauge(score) {
    makeChart({
      bindto: '#health-gauge-chart',
      data: {
        columns: [['score', score]],
        type: 'gauge',
      },
      gauge: {
        label: { show: false },
        title: String(score),
        width: 18,
        max: 100,
        min: 0,
      },
      color: {
        pattern: ['#ef4444', '#f97316', '#eab308', '#22c55e'],
        threshold: { values: [40, 60, 80, 100] },
      },
      size: { height: 60 },
      legend: { show: false },
      tooltip: {
        format: {
          value: function(value) { return value + ' / 100'; },
        },
      },
    });
  }

  function renderHealthScoreCard(healthData) {
    var gradeLabel = { A: t('healthGradeA'), B: t('healthGradeB'), C: t('healthGradeC'), D: t('healthGradeD'), F: t('healthGradeF') };
    var gradeColor = healthData.total >= 80 ? '#22c55e' : healthData.total >= 60 ? '#eab308' : healthData.total >= 40 ? '#f97316' : '#ef4444';
    var factorNames = {
      contextEfficiency: t('healthFactorContext'),
      costTrend: t('healthFactorCostTrend')
        + '<span class="health-factor-help" data-tooltip="' + escapeHtml(t('healthCostTrendHelp')) + '">?</span>',
      unusedItems: t('healthFactorUnused'),
      cacheEfficiency: t('healthFactorCache'),
      coverage: t('healthFactorCoverage'),
    };
    var html = '<div class="health-score-card card">'
      + '<div class="health-score-top">'
      + '<span class="health-score-title">' + t('healthScoreTitle') + '</span>'
      + '<span class="health-grade" style="color:' + gradeColor + '">' + (gradeLabel[healthData.grade] || healthData.grade) + '</span>'
      + '</div>'
      + '<div class="health-score-inner">'
      + '<div class="health-score-header">'
      + '<div id="health-gauge-chart"></div>'
      + '</div>'
      + '<div class="usage-bar-rows">';
    for (var i = 0; i < healthData.factors.length; i++) {
      var f = healthData.factors[i];
      var barColor = f.score >= 80 ? '#22c55e' : f.score >= 60 ? '#eab308' : f.score >= 40 ? '#f97316' : '#ef4444';
      var isNa = f.na === true;
      html += '<div class="usage-bar-row">'
        + '<div class="usage-bar-row-label">' + (factorNames[f.name] || f.name) + '</div>'
        + '<div class="usage-bar-row-track">'
        + (isNa ? '' : '<div class="usage-bar-row-fill" style="width:' + f.score + '%;background:' + barColor + '"></div>')
        + '</div>'
        + '<div class="usage-bar-row-value">' + (isNa ? t('healthNa') : f.score) + '</div>'
        + '<div class="usage-bar-row-pct">' + Math.round(f.weight * 100) + '%</div>'
        + '</div>';
    }
    html += '</div></div></div>';
    return html;
  }

  // ── Session Compare View ──
  // Side-by-side session comparison page (#compare/{id1}/{id2}).
  function renderCompareView() {
    const usage = getUsage();
    const entries = usage.tokenEntries || [];

    function sessionStats(sid) {
      const se = entries.filter(function(e) { return e.sessionId === sid; });
      if (se.length === 0) return null;
      var totalTokens = 0, totalCost = 0, minTs = Infinity, maxTs = 0, peakInput = 0;
      var models = {};
      var totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;
      for (var i = 0; i < se.length; i++) {
        var e = se[i];
        totalTokens += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
        totalCost += calcEntryCost(e);
        var ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
        if ((e.inputTokens || 0) > peakInput) peakInput = e.inputTokens || 0;
        var m = (e.model || 'unknown').replace(/^claude-/, '').replace(/-\d{8,}$/, '');
        models[m] = (models[m] || 0) + 1;
        totalInput += (e.rawInput || 0);
        totalOutput += (e.outputTokens || 0);
        totalCacheRead += (e.cacheRead || 0);
        totalCacheCreation += (e.cacheCreation || 0);
      }
      return {
        sid: sid, turnCount: se.length, totalTokens: totalTokens, totalCost: totalCost,
        minTs: minTs, maxTs: maxTs, duration: maxTs - minTs,
        peakInput: peakInput, models: models,
        totalInput: totalInput, totalOutput: totalOutput,
        totalCacheRead: totalCacheRead, totalCacheCreation: totalCacheCreation,
      };
    }

    var sA = sessionStats(_compareSessionA);
    var sB = sessionStats(_compareSessionB);

    var html = '<div class="page-header">'
      + '<h1>⚖️ ' + t('cmpTitle') + '</h1>'
      + '<button class="session-back-btn" id="compare-back">← ' + t('cmpBack') + '</button>'
      + '</div>';

    if (!sA || !sB) {
      html += '<div class="card" style="padding:24px;text-align:center;color:var(--text-secondary)">Session data not found.</div>';
      content.innerHTML = html;
      bindContentActions();
      document.getElementById('compare-back').addEventListener('click', function() {
        currentView = 'context'; pushState(true); render();
      });
      return;
    }

    // Diff cards
    function diffArrow(valA, valB) {
      if (valA === valB) return '';
      return '<span class="compare-diff-arrow ' + (valA > valB ? 'up' : 'down') + '">' + (valA > valB ? '▲' : '▼') + '</span>';
    }
    function diffCard(label, valA, valB, formatter) {
      var diff = Math.abs(valA - valB);
      return '<div class="card compare-diff-card">'
        + '<div class="compare-diff-label">' + label + '</div>'
        + '<div class="compare-diff-value">' + formatter(diff) + diffArrow(valA, valB) + '</div>'
        + '</div>';
    }

    html += '<div class="compare-summary">'
      + diffCard(t('cmpTokenDiff'), sA.totalTokens, sB.totalTokens, fmtCompact)
      + diffCard(t('cmpTurnDiff'), sA.turnCount, sB.turnCount, fmtCompact)
      + diffCard(t('cmpPeakDiff'), sA.peakInput, sB.peakInput, fmtCompact)
      + diffCard(t('cmpCostDiff'), sA.totalCost, sB.totalCost, fmtCost)
      + '</div>';

    // Tab bar for mobile
    html += '<div class="compare-tab-bar">'
      + '<button class="compare-tab active" data-action="compare-tab" data-tab="a">' + t('cmpSessionA') + '</button>'
      + '<button class="compare-tab" data-action="compare-tab" data-tab="b">' + t('cmpSessionB') + '</button>'
      + '</div>';

    // Two columns
    function renderColumn(s, label) {
      var cacheHitRate = (s.totalCacheRead + s.totalCacheCreation) > 0
        ? Math.round(s.totalCacheRead / (s.totalCacheRead + s.totalCacheCreation) * 100) : 0;
      var modelList = Object.entries(s.models).sort(function(a, b) { return b[1] - a[1]; });
      var col = '<div class="compare-column-header">' + label + ' — ' + formatDateTime(new Date(s.minTs).toISOString()) + '</div>'
        + '<div class="card-grid">'
        + statCard(t('totalTokens'), fmtCompact(s.totalTokens), null)
        + statCard(t('estimatedCost'), fmtCost(s.totalCost), null, { raw: true })
        + statCard(t('sessionDuration'), fmtDur(s.duration), null)
        + statCard(t('cwe_sessionTurns'), fmtCompact(s.turnCount), null)
        + '</div>'
        + '<div class="card" style="padding:12px;margin-top:12px">'
        + '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">' + t('tokenBreakdown') + '</div>'
        + renderBarCard({
            titleKey: null,
            total: s.totalTokens,
            totalChange: null,
            rows: [
              { label: 'Input', value: s.totalInput, change: null, color: '#4263eb' },
              { label: 'Output', value: s.totalOutput, change: null, color: '#22c55e' },
              { label: 'Cache Read', value: s.totalCacheRead, change: null, color: '#0891b2' },
              { label: 'Cache Create', value: s.totalCacheCreation, change: null, color: '#f97316' },
            ]
          })
        + '</div>'
        + '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">Cache hit: ' + cacheHitRate + '%</div>'
        + '<div style="margin-top:8px">';
      modelList.forEach(function(pair) {
        col += '<span class="model-badge">' + escapeHtml(pair[0]) + ' (' + pair[1] + ')</span> ';
      });
      col += '</div>'
        + '<div style="margin-top:12px">'
        + '<a href="#context/' + encodeURIComponent(s.sid) + '" style="font-size:13px;color:var(--accent)">' + t('contextExplorer') + ' →</a>'
        + ' · <a href="#session/' + encodeURIComponent(s.sid) + '" style="font-size:13px;color:var(--accent)">' + t('sessionDetail') + ' →</a>'
        + '</div>';
      return col;
    }

    html += '<div class="compare-container">'
      + '<div class="compare-column" id="compare-col-a">' + renderColumn(sA, t('cmpSessionA')) + '</div>'
      + '<div class="compare-column" id="compare-col-b">' + renderColumn(sB, t('cmpSessionB')) + '</div>'
      + '</div>';

    content.innerHTML = html;
    bindContentActions();

    // Back button
    document.getElementById('compare-back').addEventListener('click', function() {
      currentView = 'context'; pushState(true); render();
    });

    // Mobile tab switching
    content.querySelectorAll('[data-action="compare-tab"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.tab;
        content.querySelectorAll('.compare-tab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var colA = document.getElementById('compare-col-a');
        var colB = document.getElementById('compare-col-b');
        if (colA) colA.classList.toggle('hidden', tab !== 'a');
        if (colB) colB.classList.toggle('hidden', tab !== 'b');
      });
    });
  }

  // ── Optimizer section ──
  // Compact insights banner shown on #overview — replaces the full optimizer section.
  // Full detail lives on the #insights page.
  function renderInsightsBanner(usage, days, sd) {
    var suggestions = computeSuggestions({
      tokenEntries: filterByPeriod(usage.tokenEntries || [], 'timestamp', days),
      contextStats: sd.contextStats,
      skills: sd.skills || [], agents: sd.agents || [],
      mcpServers: sd.mcpServers || [],
      memory: sd.memory || [],
      usage: { skills: usage.skills || [], agents: usage.agents || [], mcpCalls: usage.mcpCalls || [] },
      dismissed: [],
      calcEntryCostFn: calcEntryCost,
    });

    var lintCount = getLintWarnings().length;
    var counts = { high: 0, medium: lintCount, low: 0 };
    for (var i = 0; i < suggestions.length; i++) {
      var sev = suggestions[i].severity;
      if (counts[sev] != null) counts[sev]++;
    }
    var total = counts.high + counts.medium + counts.low;
    if (total === 0) return '';

    var top = suggestions.length > 0 ? t(suggestions[0].titleKey) : '';

    var countsHtml = '';
    if (counts.high > 0)   countsHtml += '<span class="insights-count high">● ' + counts.high + ' High</span>';
    if (counts.medium > 0) countsHtml += '<span class="insights-count medium">● ' + counts.medium + ' Medium</span>';
    if (counts.low > 0)    countsHtml += '<span class="insights-count low">● ' + counts.low + ' Low</span>';

    return '<div class="card insights-banner">'
      + '<div class="insights-banner-head">'
      + '<span class="section-title">' + t('insightsBannerTitle') + '</span>'
      + '<a class="insights-banner-link" data-action="nav" data-view="insights" href="#insights">'
      + t('insightsBannerViewAll') + ' →</a>'
      + '</div>'
      + '<div class="insights-banner-counts">' + countsHtml + '</div>'
      + (top ? '<div class="insights-banner-top">' + escapeHtml(top) + '</div>' : '')
      + '</div>';
  }

  // Rule-based suggestions for #insights page, powered by context-optimizer.mjs.

  function renderOptimizerSection(usage, days, sd) {
    var suggestions = computeSuggestions({
      tokenEntries: filterByPeriod(usage.tokenEntries || [], 'timestamp', days),
      contextStats: sd.contextStats,
      skills: sd.skills || [], agents: sd.agents || [],
      mcpServers: sd.mcpServers || [],
      memory: sd.memory || [],
      usage: { skills: usage.skills || [], agents: usage.agents || [], mcpCalls: usage.mcpCalls || [] },
      dismissed: [],
      calcEntryCostFn: calcEntryCost,
    });

    if (suggestions.length === 0) return '';

    var html = '<div class="section optimizer-section">'
      + '<div class="section-title">' + t('optTitle') + ' <span class="section-title-sub">' + t('optDesc') + '</span></div>';

    if (suggestions.length === 0) {
      html += '<div class="card" style="padding:16px;text-align:center;color:var(--text-secondary)">' + t('optEmpty') + '</div>';
    } else {
      html += '<div class="optimizer-grid">';
      for (var i = 0; i < suggestions.length; i++) {
        var s = suggestions[i];
        var desc = t(s.descKey);
        for (var j = 0; j < s.descArgs.length; j++) {
          desc = desc.replace('{' + j + '}', escapeHtml(s.descArgs[j]));
        }
        var savings = '';
        if (s.savingsTokens > 0) {
          savings = '−' + fmtCompact(s.savingsTokens);
          if (s.savingsCost > 0.001) savings += ' / ' + fmtCost(s.savingsCost);
        }
        html += '<div class="optimizer-card" data-severity="' + s.severity + '">'
          + '<span class="optimizer-severity" data-sev="' + s.severity + '"></span>'
          + '<span class="optimizer-card-title">' + t(s.titleKey) + '</span>'
          + (savings ? '<span class="optimizer-savings">' + savings + '</span>' : '<span></span>')
          + '<div class="optimizer-card-desc">' + desc + '</div>'
          + '</div>';
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ── Insights aggregator ──
  // computeAllInsights(usage, days, sd) collects findings from 4 sources:
  //   1. optimizer suggestions (computeSuggestions)
  //   2. daily anomalies (buildDailyUsageSeries + detectDailyAnomalies)
  //   3. lint warnings (getLintWarnings)
  //   4. cache inefficiencies (tokenEntries cache fields)
  // Returns a unified sorted array. Each item has the schema:
  //   { id, source, severity, title, detail, impact: {tokens, cost}, meta }
  // Sorted descending by: severity weight * 1000 + impact.cost * 100 + impact.tokens / 1e6
  function computeAllInsights(usage, days, sd) {
    var items = [];
    var sevWeight = { high: 3, medium: 2, low: 1, info: 0 };

    // ── 1. Optimizer suggestions ──
    try {
      var suggestions = computeSuggestions({
        tokenEntries: filterByPeriod(usage.tokenEntries || [], 'timestamp', days),
        contextStats: sd.contextStats,
        skills: sd.skills || [], agents: sd.agents || [],
        mcpServers: sd.mcpServers || [],
        memory: sd.memory || [],
        usage: { skills: usage.skills || [], agents: usage.agents || [], mcpCalls: usage.mcpCalls || [] },
        dismissed: [],
        calcEntryCostFn: calcEntryCost,
      });
      for (var si = 0; si < suggestions.length; si++) {
        var s = suggestions[si];
        var desc = t(s.descKey);
        for (var di = 0; di < s.descArgs.length; di++) {
          desc = desc.replace('{' + di + '}', s.descArgs[di]);
        }
        items.push({
          id: 'opt-' + s.titleKey,
          source: 'optimizer',
          severity: s.severity || 'medium',
          title: t(s.titleKey),
          detail: desc,
          impact: { tokens: s.savingsTokens || 0, cost: s.savingsCost || 0 },
          meta: { titleKey: s.titleKey, descKey: s.descKey },
        });
      }
    } catch (e) { /* computeSuggestions not available or failed */ }

    // ── 2. Daily anomalies ──
    try {
      var anomalySeries = buildDailyUsageSeries(usage.tokenEntries || [], calcEntryCost);
      var allAnomalies = detectDailyAnomalies(anomalySeries.dailyMap, anomalySeries.sortedDates);
      var anomalyList = filterByPeriod(
        allAnomalies.map(function(a) { return Object.assign({ timestamp: a.date + 'T12:00:00' }, a); }),
        'timestamp', days
      );
      for (var ai = 0; ai < anomalyList.length; ai++) {
        var a = anomalyList[ai];
        var isTok = a.kind !== 'cost';
        var ratio = isTok ? a.tokenRatio : a.costRatio;
        var roundedRatio = Math.round(ratio * 10) / 10;
        var kindLabel = a.kind === 'cost' ? t('anomalyKindCost') : a.kind === 'both' ? t('anomalyKindBoth') : t('anomalyKindTokens');
        var aSev = ratio >= 5 ? 'high' : ratio >= 3 ? 'medium' : 'low';
        var aDetail = t('anomalyVsAvg', fmtCompact(roundedRatio));
        if (a.kind === 'both') {
          aDetail += ' · ' + fmtCompact(a.tokens) + ' / ' + fmtCost(a.cost);
        } else if (a.kind === 'cost') {
          aDetail += ' · ' + fmtCost(a.cost);
        } else {
          aDetail += ' · ' + fmtCompact(a.tokens);
        }
        items.push({
          id: 'anomaly-' + a.date,
          source: 'anomaly',
          severity: aSev,
          title: a.date + ' · ' + kindLabel,
          detail: aDetail,
          impact: { tokens: a.tokens || 0, cost: a.cost || 0 },
          meta: { date: a.date, kind: a.kind, tokenRatio: a.tokenRatio, costRatio: a.costRatio },
        });
      }
    } catch (e) { /* anomaly detection not available or failed */ }

    // ── 3. Lint warnings ──
    try {
      var lintWarnings = getLintWarnings();
      for (var li = 0; li < lintWarnings.length; li++) {
        var w = lintWarnings[li];
        items.push({
          id: 'lint-' + (w.code || 'unknown') + '-' + li,
          source: 'lint',
          severity: w.severity || 'medium',
          title: lintMessage(w),
          detail: w.path || w.file || '',
          impact: { tokens: 0, cost: 0 },
          meta: { code: w.code, category: w.category, file: w.file, path: w.path },
        });
      }
    } catch (e) { /* getLintWarnings not available or failed */ }

    // ── 4. Cache inefficiencies ──
    // TODO: Per-day cache efficiency breakdown would require building a
    // dailyCacheMap (by iterating tokenEntries day-by-day). That logic is
    // non-trivial to extract cleanly without duplicating drawCacheEfficiencyChart.
    // For now, flag a single overall insight when the aggregate hit rate is below 30%.
    try {
      var cacheEntries = filterByPeriod(usage.tokenEntries || [], 'timestamp', days);
      var cTotalRead = 0, cTotalWrite = 0, cTotalFresh = 0;
      for (var ci = 0; ci < cacheEntries.length; ci++) {
        var ce = cacheEntries[ci];
        cTotalRead += ce.cacheRead || 0;
        cTotalWrite += ce.cacheCreation || 0;
        cTotalFresh += ce.rawInput || 0;
      }
      var cTotal = cTotalRead + cTotalWrite + cTotalFresh;
      if (cTotal > 0) {
        var hitPct = Math.round((cTotalRead / cTotal) * 100);
        if (hitPct < 30) {
          var cacheSev = hitPct < 10 ? 'high' : 'medium';
          items.push({
            id: 'cache-low-hit-rate',
            source: 'cache',
            severity: cacheSev,
            title: t('cacheTipLowHitTitle'),
            detail: t('cacheTipLowHitDetail', hitPct),
            impact: { tokens: 0, cost: 0 },
            meta: { hitPct: hitPct, totalRead: cTotalRead, totalWrite: cTotalWrite, totalFresh: cTotalFresh },
          });
        }
      }
    } catch (e) { /* cache data not available or failed */ }

    // ── Sort: severity weight * 1000 + impact.cost * 100 + impact.tokens / 1e6 ──
    items.sort(function(a, b) {
      var scoreA = (sevWeight[a.severity] || 0) * 1000 + a.impact.cost * 100 + a.impact.tokens / 1e6;
      var scoreB = (sevWeight[b.severity] || 0) * 1000 + b.impact.cost * 100 + b.impact.tokens / 1e6;
      return scoreB - scoreA;
    });

    return items;
  }

  // ── Detail-page helpers ──
  // These extract the repeated blocks used by renderSkillDetail,
  // renderAgentDetail, renderMemoryDetail, etc. Each helper renders nothing
  // (empty string) when the field is missing, so callers can chain them
  // unconditionally and keep each detail renderer focused on its unique bits.

  function filePathBlock(filePath) {
    if (!filePath) return '';
    return '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(filePath) + '</div>';
  }

  function descriptionBlock(text) {
    if (!text) return '';
    return '<div class="section"><div class="section-title">' + t('description') + '</div>'
      + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(text) + '</div></div>';
  }

  function markdownBodyBlock(body, titleKey) {
    if (!body) return '';
    const title = titleKey ? ('<div class="section-title">' + t(titleKey) + '</div>') : '';
    const wrapOpen = titleKey ? '<div class="section">' + title : '';
    const wrapClose = titleKey ? '</div>' : '';
    return wrapOpen + '<div class="content-preview">' + renderMarkdown(body) + '</div>' + wrapClose;
  }

  function usageMetaCards(category, name) {
    const usageCount = countUsage(category, name, 0);
    const lastUsed = getLastUsed(category, name);
    return metaCard('USAGE', fmtNum(usageCount) + ' ' + t('calls'))
      + metaCard('LAST USED', lastUsed ? relativeTime(lastUsed) : t('never'));
  }

  // F6: Generic bar breakdown card — one card showing a total with its
  // sub-metrics rendered as proportional bars (relative to the total).
  // Used on #overview (harness usage) and #tokens (token breakdown).
  //
  // opts = {
  //   titleKey: string,             // i18n key for the card title
  //   total:    number,             // total value, used as 100% baseline
  //   totalChange: number|null,     // percentage change vs previous period
  //   rows: [{ label, value, change, color }]
  //   barScale: 'linear' | 'log' | 'auto' (default: 'auto')
  // }
  //
  // barScale auto-switches to log when max(row.value)/min(row.value) > 100,
  // so wide-range data (e.g. tokens where cache dwarfs input/output) still
  // shows visible sub-metrics. The %/value columns always display the real
  // linear share — only the bar fill width changes.
  function renderBarCard(opts) {
    const total = opts.total || 0;
    const rows = opts.rows || [];
    const valueFmt = opts.valueFmt || fmtCompact;
    const totalFmt = opts.totalFmt || fmtCompact;
    const labelStyle = opts.labelWidth ? ' style="flex:0 0 ' + opts.labelWidth + 'px;width:' + opts.labelWidth + 'px;min-width:0"' : '';
    const changeBadge = (change) => {
      if (change === null || change === undefined) return '';
      const cls = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
      const prefix = change > 0 ? '+' : '';
      return '<span class="usage-bar-change ' + cls + '" title="' + escapeHtml(t('vsPrevPeriodTooltip')) + '">'
        + prefix + fmtCompact(change) + '%</span>';
    };

    // Decide scale. Layout math (log-threshold + width computation) lives
    // in canvas-bars.mjs and is unit-tested.
    const rowValues = rows.map((r) => r.value);
    const autoScale = computeBarScale(rowValues);
    /** @type {{ useLog: boolean, logMinExp: number, logMaxExp: number }} */
    let scale = autoScale;
    if (opts.barScale === 'linear') {
      scale = { useLog: false, logMinExp: 0, logMaxExp: 0 };
    } else if (opts.barScale === 'log') {
      scale = { useLog: true, logMinExp: autoScale.logMinExp, logMaxExp: autoScale.logMaxExp };
    }
    const useLog = scale.useLog;

    const headLeftHtml = opts.titleHtml || (opts.titleKey ? t(opts.titleKey) : '');
    const headSubtitle = opts.subtitleHtml ? '<div class="usage-bar-head-subtitle">' + opts.subtitleHtml + '</div>' : '';
    const valueLabel = !!opts.valueLabelHtml;
    const fillClass = opts.fillHeight ? ' usage-bar-card--fill' : '';

    let html = '<div class="usage-bar-card' + fillClass + '">'
      + '<div class="usage-bar-head">'
      +   '<div><div class="usage-bar-head-label">' + headLeftHtml + '</div>' + headSubtitle + '</div>'
      +   '<div class="usage-bar-head-right">'
      +     (valueLabel ? '<div class="usage-bar-value-label">' + (opts.valueLabelHtml || '') + '</div>' : '')
      +     '<div class="usage-bar-head-value">'
      +       changeBadge(opts.totalChange)
      +       '<span class="usage-bar-total">' + totalFmt(total) + '</span>'
      +     '</div>'
      +     '<div class="usage-bar-head-sub">' + t('vsPrevPeriodCaption') + '</div>'
      +   '</div>'
      + '</div>';
    if (useLog) {
      html += '<div class="usage-bar-scale-notice">'
        +   '<span class="usage-bar-scale-badge">' + t('barScaleLog') + '</span>'
        +   '<span class="usage-bar-scale-desc">' + t('barScaleLogDesc') + '</span>'
        + '</div>';
    }
    if (opts.summaryHtml) {
      html += '<div class="usage-bar-summary">' + opts.summaryHtml + '</div>';
    }
    const rowsStyle = opts.fillHeight ? ' style="flex:1"' : '';

    html += '<div class="usage-bar-rows"' + rowsStyle + '>';
    for (const r of rows) {
      const linearPct = total > 0 ? (r.value / total) * 100 : 0;
      const barWidth = computeBarWidth(r.value, total, scale);
      html += '<div class="usage-bar-row">'
        + '<div class="usage-bar-row-label"' + labelStyle + '>' + (r.labelHtml || escapeHtml(String(r.label))) + '</div>'
        + '<div class="usage-bar-row-track">'
        +   '<div class="usage-bar-row-fill" style="width:' + barWidth.toFixed(1) + '%;background:' + r.color + '"></div>'
        + '</div>'
        + '<div class="usage-bar-row-value">' + valueFmt(r.value) + '</div>'
        + '<div class="usage-bar-row-pct">' + (linearPct < 1 && linearPct > 0 ? '<1' : Math.round(linearPct)) + '%</div>'
        + '<div class="usage-bar-row-change">' + changeBadge(r.change) + '</div>'
        + '</div>';
    }
    html += '</div>';
    if (opts.footerHtml) {
      html += '<div class="usage-bar-footer">' + opts.footerHtml + '</div>';
    }
    html += '</div>';
    return html;
  }

  // Harness usage bar card — thin wrapper around renderBarCard
  function renderUsageBarCard(totalAll, totalSkills, totalAgents, totalCommands, changeAll, changeSkills, changeAgents, changeCommands) {
    return renderBarCard({
      titleKey: 'totalUsage',
      total: totalAll,
      totalChange: changeAll,
      rows: [
        { label: t('skillCalls'),  value: totalSkills,   change: changeSkills,   color: 'var(--color-skills)' },
        { label: t('agentCalls'),  value: totalAgents,   change: changeAgents,   color: 'var(--color-agents)' },
        { label: t('commands'),    value: totalCommands, change: changeCommands, color: '#6366f1' },
      ],
    });
  }

  // F5: Compact regression card shown inside the Overview card-grid.
  // Returns empty string when there's no regression — opt-in by data.
  // - Shows the worst regressed metric as the headline (icon + delta %).
  // - Secondary metric count appears as "+1 more" when both metrics
  //   regressed.
  // - Probable cause (cache drop / opus shift) or generic hint is
  //   embedded as a title attribute (hover tooltip) and the card
  //   navigates to that sub-page on click.
  function renderRegressionCard(usage) {
    const report = computeRegression(usage, Date.now());
    if (!report.anyRegressed) return '';

    // Pick the "worst" metric (highest deltaPct) as the headline.
    const candidates = [];
    if (report.latency && report.latency.regressed) {
      candidates.push({
        metric: 'latency',
        icon: '🐢',
        label: t('regressionLatency'),
        delta: report.latency.deltaPct,
        detail: fmtMs(report.latency.previous) + ' → ' + fmtMs(report.latency.current),
      });
    }
    if (report.tokensPerTurn && report.tokensPerTurn.regressed) {
      candidates.push({
        metric: 'tokensPerTurn',
        icon: '📈',
        label: t('regressionTokens'),
        delta: report.tokensPerTurn.deltaPct,
        detail: fmtCompact(Math.round(report.tokensPerTurn.previous)) + ' → ' + fmtCompact(Math.round(report.tokensPerTurn.current)),
      });
    }
    candidates.sort((a, b) => b.delta - a.delta);
    const worst = candidates[0];
    const moreCount = candidates.length - 1;

    // Determine the most actionable insight + navigation target.
    // Priority: data-driven causes > generic per-metric hints.
    let insightText = '';
    let linkView = 'tokens-prompt';
    let linkLabel = t('regressionCheckLatency');
    if (report.causes && report.causes.cacheDrop) {
      const c = report.causes.cacheDrop;
      insightText = t('regressionCauseCacheDrop', fmtPct(c.prev * 100), fmtPct(c.cur * 100));
      linkView = 'tokens-prompt';
      linkLabel = t('regressionCheckCache');
    } else if (report.causes && report.causes.opusShift) {
      const c = report.causes.opusShift;
      insightText = t('regressionCauseOpusShift', fmtPct(c.prev * 100), fmtPct(c.cur * 100));
      linkView = 'tokens';
      linkLabel = t('regressionCheckModels');
    } else if (worst.metric === 'latency') {
      insightText = t('regressionGenericLatency');
      linkView = 'tokens-prompt';
      linkLabel = t('regressionCheckLatency');
    } else {
      insightText = t('regressionGenericTokens');
      linkView = 'tokens-session';
      linkLabel = t('regressionCheckSessions');
    }

    const moreBadge = moreCount > 0
      ? '<span class="regression-card-more">+' + moreCount + ' ' + t('regressionMore') + '</span>'
      : '';

    // Build the comparison period text using explicit dates so there's
    // no confusion with the sidebar's period filter (7d/30d/all). The
    // regression check is ALWAYS today-anchored, independent of filter.
    const fmtShortDate = (ms) => {
      const d = new Date(ms);
      return String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    };
    // current window is [start, end) — show [start, end-1day] as inclusive
    const curStartStr = fmtShortDate(report.currentWindow.startMs);
    const curEndStr = fmtShortDate(report.currentWindow.endMs - 1);
    const prevStartStr = fmtShortDate(report.previousWindow.startMs);
    const prevEndStr = fmtShortDate(report.previousWindow.endMs - 1);
    const periodHtml = '<div class="regression-card-period-bars">'
      +   '<div class="regression-card-period-bar prev"></div>'
      +   '<div class="regression-card-period-bar cur"></div>'
      + '</div>'
      + '<div class="regression-card-period-cols">'
      +   '<div class="regression-card-period-col">'
      +     '<span class="regression-card-period-col-label">' + t('regressionPrev7d') + '</span> '
      +     '<span class="regression-card-period-col-dates">' + prevStartStr + '~' + prevEndStr + '</span>'
      +   '</div>'
      +   '<div class="regression-card-period-col">'
      +     '<span class="regression-card-period-col-label cur">' + t('regressionLast7d') + '</span> '
      +     '<span class="regression-card-period-col-dates">' + curStartStr + '~' + curEndStr + '</span>'
      +   '</div>'
      + '</div>';

    return '<div class="stat-card regression-card" '
      + 'data-action="nav-view" data-view="' + linkView + '" '
      + 'title="' + escapeHtml(insightText + ' — ' + linkLabel) + '">'
      + '<div class="stat-label"><span class="regression-card-warn">⚠️</span> ' + t('regressionTitle') + '</div>'
      + '<div class="regression-card-period">' + periodHtml + '</div>'
      + '<div class="stat-value regression-card-value">'
      +   '<span class="regression-card-icon">' + worst.icon + '</span>'
      +   '<span class="regression-card-delta">+' + fmtPct(worst.delta) + '</span>'
      + '</div>'
      + '<div class="stat-change regression-card-sub">'
      +   '<span class="regression-card-metric-label">' + escapeHtml(worst.label) + '</span>'
      +   '<span class="regression-card-detail">' + escapeHtml(worst.detail) + '</span>'
      +   moreBadge
      + '</div>'
      + '<div class="regression-card-link">' + escapeHtml(linkLabel) + ' →</div>'
      + '</div>';
  }

  // F2: Efficiency section for a skill or agent detail page
  function renderEfficiencyBlock(contextType, name) {
    const { map, totalCost } = computeEfficiencyMap(contextType);
    const row = map[name];
    if (!row || row.callCount === 0) return '';
    const avgTokens = (row.totalInput + row.totalOutput + row.totalCache) / row.callCount;
    const avgOutput = row.totalOutput / row.callCount;
    const sharePct = totalCost > 0 ? Math.round((row.totalCost / totalCost) * 100) : 0;
    return '<div class="section">'
      + '<div class="section-title">⚡ ' + t('efficiencyTitle')
      + ' <span class="section-title-sub">' + t('efficiencyDesc') + '</span></div>'
      + '<div class="card-grid">'
      + statCard(t('effCalls'), fmtCompact(row.callCount), null)
      + statCard(t('effAvgTokens'), fmtCompact(Math.round(avgTokens)), null, { badge: fmtCompact(Math.round(avgOutput)) + ' out' })
      + statCard(t('effTotalCost'), fmtCost(row.totalCost), null, { raw: true, badge: sharePct + '% ' + t('effShare') })
      + statCard(t('effAvgCost'), fmtCost(row.totalCost / row.callCount), null, { raw: true })
      + '</div></div>';
  }

  // ── Content action binding ──
  function bindContentActions() {
    // Usage export buttons (CSV / JSON)
    content.querySelectorAll('[data-export]').forEach((el) => {
      el.addEventListener('click', () => { exportUsageData(el.dataset.export); });
    });
    content.querySelectorAll('[data-action="goto-detail"]').forEach((el) => {
      el.addEventListener('click', () => {
        const cat = el.dataset.category;
        const name = el.dataset.name;
        if (cat && name) {
          currentView = cat;
          currentDetail = { category: cat, name: name };
          expandedCategories[cat] = true;
          pushState(true);
          render();
        }
      });
    });
    // Session row click
    content.querySelectorAll('.session-row').forEach((el) => {
      el.addEventListener('click', () => {
        currentView = 'session';
        currentSessionId = el.dataset.sessionId;
        currentDetail = null;
        expandedCategories._tokens = true;
        pushState(true);
        render();
      });
    });
    // Anomaly row click → tokens page filtered to that single day.
    // Reuses the calendar-picker custom range path (customDateRange +
    // currentPeriod = -1), so no new drill-down infrastructure is needed.
    content.querySelectorAll('[data-action="goto-anomaly-day"]').forEach((el) => {
      el.addEventListener('click', () => {
        const dk = el.dataset.date;
        if (!dk) return;
        const p = dk.split('-').map((x) => parseInt(x, 10));
        customDateRange = {
          start: new Date(p[0], p[1] - 1, p[2]),
          end: new Date(p[0], p[1] - 1, p[2], 23, 59, 59)
        };
        currentPeriod = -1;
        localStorage.setItem('harness-period', String(currentPeriod));
        currentView = 'tokens';
        currentDetail = null;
        expandedCategories._tokens = true;
        pushState(true);
        render();
        // API mode: refetch usage for the selected day.
        if (DATA._apiMode) {
          const range = computeCurrentPeriodRange();
          if (range) {
            fetchUsageForPeriod(currentScope, range.from, range.to).then((ok) => {
              if (ok) render();
            });
          }
        }
      });
    });
    // F5: Regression banner insight → navigate to sub-page
    content.querySelectorAll('[data-action="nav-view"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const view = el.dataset.view;
        if (!view) return;
        currentView = view;
        currentDetail = null;
        if (view === 'tokens-cost' || view === 'tokens-cache' || view === 'tokens-prompt' || view === 'tokens-session' || view === 'tokens') {
          expandedCategories._tokens = true;
        }
        pushState(true);
        render();
      });
    });
    // Bookmark toggle
    content.querySelectorAll('[data-action="toggle-bookmark"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        var sid = el.dataset.sessionId;
        if (!sid) return;
        var map = _loadBm();
        map = toggleStar(map, sid);
        _saveBm(map);
        var starred = map[sid] && map[sid].starred;
        el.classList.toggle('active', starred);
        el.title = starred ? t('bmUnstar') : t('bmStar');
      });
    });
    // Bookmark tag input
    content.querySelectorAll('[data-action="set-tags"]').forEach((el) => {
      var handler = function() {
        var sid = el.dataset.sessionId;
        if (!sid) return;
        var tags = el.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        var map = _loadBm();
        map = setTags(map, sid, tags);
        _saveBm(map);
      };
      el.addEventListener('blur', handler);
      el.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); handler(); } });
    });
    // Bookmark filter
    content.querySelectorAll('[data-action="filter-bookmarks"]').forEach((el) => {
      el.addEventListener('click', () => {
        var filter = el.dataset.filter;
        _bmFilter = filter || 'all';
        skipScrollReset = true;
        renderContent();
        skipScrollReset = false;
      });
    });
    // Health factor help tooltip
    content.querySelectorAll('.health-factor-help[data-tooltip]').forEach((el) => {
      let tipEl = null;
      el.addEventListener('mouseenter', () => {
        tipEl = document.createElement('div');
        tipEl.className = 'health-factor-tooltip';
        tipEl.textContent = el.dataset.tooltip;
        document.body.appendChild(tipEl);
        const r = el.getBoundingClientRect();
        const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
        let left = r.left + (r.width - tw) / 2;
        let top = r.top - th - 6;
        if (left < 4) left = 4;
        if (left + tw > window.innerWidth - 4) left = window.innerWidth - 4 - tw;
        if (top < 4) top = r.bottom + 6;
        tipEl.style.left = left + 'px';
        tipEl.style.top = top + 'px';
      });
      el.addEventListener('mouseleave', () => {
        if (tipEl) { tipEl.remove(); tipEl = null; }
      });
    });
    // Team member toggle
    content.querySelectorAll('.team-member-toggle').forEach((el) => {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        let idx = el.dataset.memberIdx;
        let detail = document.getElementById('team-member-' + idx);
        const chevron = el.querySelector('.chevron');
        if (detail) {
          const open = detail.style.display !== 'none';
          detail.style.display = open ? 'none' : 'block';
          if (chevron) chevron.textContent = open ? '▶' : '▼';
        }
      });
    });
  }

  // ── Data staleness check (once on load) ──
  var _updateBannerShown = false;

  function checkDataVersion() {
    // Only works with HTTP (local server / index.html), not file://
    if (location.protocol === 'file:') return;
    fetch('./version.json?' + Date.now()).then(r => r.json()).then(v => {
      if (!v || !v.generatedAt) return;
      if (v.generatedAt !== DATA.generatedAt && !_updateBannerShown) {
        _updateBannerShown = true;
        showUpdateBanner();
      }
    }).catch(() => {});
  }

  // Poll every 30 s so the banner appears after --data-only auto-refresh
  function startVersionPolling() {
    if (location.protocol === 'file:') return;
    setInterval(checkDataVersion, 30000);
  }

  function showUpdateBanner() {
    // Remove partial banner if still present — update banner supersedes it
    var partial = document.querySelector('.partial-banner');
    if (partial) partial.remove();
    var banner = document.createElement('div');
    banner.className = 'update-banner';
    var msg = document.createElement('span');
    msg.textContent = t('updateBannerMsg');
    var refreshBtn = document.createElement('button');
    refreshBtn.textContent = t('updateBannerRefresh');
    refreshBtn.onclick = function () { location.reload(); };
    var closeBtn = document.createElement('button');
    closeBtn.textContent = t('close');
    closeBtn.onclick = function () { banner.remove(); };
    banner.appendChild(msg);
    banner.appendChild(refreshBtn);
    banner.appendChild(closeBtn);
    document.body.prepend(banner);
  }

  // ── Partial data banner ──
  function showPartialBanner() {
    if (!DATA._partial) return;
    const banner = document.createElement('div');
    banner.className = 'partial-banner';
    banner.innerHTML = '<span class="partial-spinner"></span><span>' + t('partialBannerMsg') + '</span>';
    document.body.prepend(banner);
  }

  // ── New-data banner ──
  function showFirstRunBanner() {
    // Only show when the server explicitly marks this as the first full history collection.
    // Subsequent /omh runs regenerate data but do not set _firstRun, so this banner
    // does not appear on every refresh after a data update.
    if (!DATA._firstRun) return;
    const current = DATA.generatedAt;
    if (!current) return;
    // Use URL ?seen=<generatedAt> to track "already shown" state across tab duplicates.
    const params = new URLSearchParams(location.search);
    if (params.get('seen') === current) return;
    params.set('seen', current);
    try { history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash); } catch (e) { /* ignore */ }
    const dr = DATA._dateRange;
    let dateStr = '';
    if (dr && dr.from && dr.to) {
      const fmt = d => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      dateStr = ' · ' + fmt(dr.from) + ' – ' + fmt(dr.to);
    }
    const banner = document.createElement('div');
    banner.className = 'firstrun-banner';
    banner.innerHTML = '<span>' + t('firstRunBannerMsg') + dateStr + '</span>'
      + '<button class="firstrun-close" onclick="this.parentElement.remove()" title="' + t('close') + '">✕</button>';
    document.body.prepend(banner);
    setTimeout(() => {
      banner.classList.add('firstrun-banner--hiding');
      const removeBanner = () => { if (banner.isConnected) banner.remove(); };
      banner.addEventListener('transitionend', removeBanner, { once: true });
      setTimeout(removeBanner, 500); // fallback if transitionend doesn't fire
    }, 3000);
  }

  // ── Boot ──
  tryApiInit().then(() => {
    init();
    render();
    showPartialBanner();
    showFirstRunBanner();
    checkDataVersion();
    startVersionPolling();
  }).catch(() => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.innerHTML = '<div style="text-align:center"><div style="font-size:2rem;margin-bottom:.5rem">⚠️</div><div style="color:#dc2626">Could not connect to oh-my-hi server.<br>Run <code>/omh</code> to start it.</div></div>';
    }
  });
