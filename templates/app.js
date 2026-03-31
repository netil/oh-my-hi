'use strict';

  // ── Restore minified usage data ──
  if (typeof DATA !== 'undefined' && DATA._minified) {
    const _KEY_REV = {
      ts:'timestamp', m:'model', it:'inputTokens', ot:'outputTokens',
      cr:'cacheRead', cc:'cacheCreation', ri:'rawInput', cx:'context',
      cn:'contextName', sid:'sessionId', ms:'latencyMs', cl:'charLen',
      n:'name', t:'tool', c:'count', d:'date', cmd:'command', p:'project',
      mc:'messageCount', sc:'sessionCount', tc:'toolCallCount'
    };
    for (const _scope in DATA.scopeData) {
      const _u = DATA.scopeData[_scope].usage;
      if (!_u) continue;
      const _sidList = _u._sidList || [];
      delete _u._sidList;
      for (const _field in _u) {
        if (!Array.isArray(_u[_field])) continue;
        _u[_field] = _u[_field].map((item) => {
          const obj = {};
          for (const k in item) {
            const rk = _KEY_REV[k] || k;
            if (rk === 'sessionId') { obj[rk] = item[k] != null ? _sidList[item[k]] : null; }
            else { obj[rk] = item[k]; }
          }
          return obj;
        });
      }
    }
    delete DATA._minified;
  }

  // ── i18n ──
  // All locales (en + system locale) injected at build time.
  const I18N = {};
  if (typeof __LOCALE__ !== 'undefined' && __LOCALE__._lang) {
    I18N[__LOCALE__._lang] = __LOCALE__;
  }
  I18N.en = (typeof __EN__ !== 'undefined') ? __EN__ : {};

  const systemLocale = (DATA.systemLocale || 'en').substring(0, 2);
  let currentLang = localStorage.getItem('harness-lang') || (I18N[systemLocale] ? systemLocale : 'en');

  // ── Dark mode ──
  function setBbDarkTheme(enabled) {
    let el = document.getElementById('bb-dark-theme');
    if (enabled && !el) {
      el = document.createElement('style');
      el.id = 'bb-dark-theme';
      el.textContent = typeof __BB_DARK_CSS__ === 'string' ? __BB_DARK_CSS__ : '';
      document.head.appendChild(el);
    } else if (!enabled && el) {
      el.remove();
    }
  }

  (function initTheme() {
    let theme = localStorage.getItem('harness-theme') || 'light';
    if (theme === 'dark') {
      document.body.classList.add('dark');
      setBbDarkTheme(true);
    }
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
  let currentScope = 'global';
  let currentView = 'overview';
  let currentDetail = null;
  let currentPeriod = parseInt(localStorage.getItem('harness-period') || '30');
  let customDateRange = null; // { start: Date, end: Date }
  const expandedCategories = {};
  let searchQuery = '';

  // ── DOM refs ──
  const scopeSelect = document.getElementById('scope-select');
  const searchInput = document.getElementById('search');
  const sidebarNav = document.getElementById('sidebar-nav');
  const content = document.getElementById('content');

  // ── Init ──
  function init() {
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
      // Toggle billboard.js dark theme
      setBbDarkTheme(isDark);
      // Re-render while preserving scroll position
      const scrollPos = content.scrollTop;
      skipScrollReset = true;
      renderContent();
      skipScrollReset = false;
      requestAnimationFrame(function () { content.scrollTop = scrollPos; });
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
    if (logoMainEl) {
      logoMainEl.appendChild(themeBtn);
      logoMainEl.appendChild(helpBtn);
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

    // Browser history
    window.addEventListener('popstate', (e) => {
      if (e.state) {
        currentView = e.state.view || 'overview';
        currentDetail = e.state.detail || null;
        if (currentDetail && currentDetail.category) {
          expandedCategories[currentDetail.category] = true;
        }
        render();
      } else {
        applyHash();
        render();
      }
    });

    // Apply initial hash
    if (window.location.hash) {
      applyHash();
    }

    render();
    pushState(false);
  }

  function updateSearchPlaceholder() {
    searchInput.placeholder = t('searchPlaceholder');
    const scopeLabel = document.querySelector('.scope-label');
    if (scopeLabel) scopeLabel.textContent = t('scopeLabel');
  }

  function updateLangToggle() {
    const group = document.getElementById('lang-toggle-group');
    if (!group) return;
    // Hide toggle if system locale is English (only one language available)
    if (systemLocale === 'en') {
      group.style.display = 'none';
      return;
    }
    group.style.display = '';
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

  function applyHash() {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    let parts = hash.split('/');
    let view = parts[0];
    if (parts.length > 1) {
      let name = decodeURIComponent(parts.slice(1).join('/'));
      currentView = view;
      currentDetail = { category: view, name: name };
      expandedCategories[view] = true;
    } else if (view === 'overview' || view === 'structure' || view === 'tokens' || view === 'tokens-analysis' || view === 'help') {
      currentView = view;
      currentDetail = null;
      if (view === 'tokens' || view === 'tokens-analysis') expandedCategories._tokens = true;
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

  function populateScopeSelect() {
    scopeSelect.innerHTML = '';
    (DATA.scopes || []).forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      opt.title = s.configPath || s.projectPath || '';
      if (s.id === currentScope) opt.selected = true;
      scopeSelect.appendChild(opt);
    });
    let sel = DATA.scopes.find((s) => { return s.id === currentScope; });
    scopeSelect.title = sel ? (sel.configPath || sel.projectPath || '') : '';
  }

  function onScopeChange() {
    currentScope = scopeSelect.value;
    const sel = DATA.scopes.find((s) => { return s.id === currentScope; });
    scopeSelect.title = sel ? (sel.configPath || sel.projectPath || '') : '';
    // Clear detail view but keep current category/page
    currentDetail = null;
    const scrollPos = content.scrollTop;
    skipScrollReset = true;
    pushState(true);
    render();
    skipScrollReset = false;
    requestAnimationFrame(() => { content.scrollTop = scrollPos; });
  }

  function onSearchInput() {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderSidebar();
  }

  // ── Data helpers ──
  function getScopeData() {
    return DATA.scopeData[currentScope] || {};
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
    if (days === 0 && !customDateRange) return items;
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
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
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

  /** Format large number compactly (e.g., 10.2k) for donut center */
  function fmtCompact(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return fmtNum(n);
  }

  function fmtCost(n) {
    if (n >= 1000) return '$' + fmtNum(Math.round(n));
    if (n >= 100) return '$' + n.toFixed(1);
    if (n >= 1) return '$' + n.toFixed(2);
    if (n >= 0.01) return '$' + n.toFixed(3);
    if (n > 0) return '<$0.01';
    return '$0.00';
  }

  // Claude model pricing per 1M tokens (USD)
  // https://docs.anthropic.com/en/docs/about-claude/models
  const MODEL_PRICING = {
    'opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
    'sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
    'haiku-4': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
    'sonnet-3-5': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
    'haiku-3-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
    'opus-3': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
    'sonnet-3': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
    'haiku-3': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheCreation: 0.3 },
  };

  function resolvePricingKey(model) {
    if (!model || model === 'unknown') return null;
    const s = model.replace(/^claude-/, '').replace(/-\d{8,}$/, '');
    if (MODEL_PRICING[s]) return s;
    const m = s.match(/^(opus|sonnet|haiku)-(\d+)(?:-\d+)?$/);
    if (m) {
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

  function localizeDocsUrl(url) {
    if (!url) return url;
    // /en/docs/ → /{lang}/docs/
    return url.replace('/en/docs/', '/' + currentLang + '/docs/');
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
    let usage = getUsage();
    let allItems = [].concat(usage.commands || [], usage.skills || [], usage.agents || []);
    if (allItems.length === 0) return null;
    const dates = allItems.map((i) => { return new Date(i.timestamp); }).sort((a, b) => { return a - b; });
    return { start: dates[0], end: dates[dates.length - 1] };
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
    const isTokensArea = currentView === 'tokens' || currentView === 'tokens-analysis';
    // Auto-expand on tokens-analysis entry, manual toggle otherwise
    if (currentView === 'tokens-analysis') expandedCategories._tokens = true;
    const isTokensExpanded = expandedCategories._tokens || false;
    html += '<div class="nav-item' + (isTokensArea ? ' active' : '') + '" data-action="toggle-tokens">'
      + '<span class="icon">🪙</span>'
      + '<span class="label">' + t('tokens') + '</span>'
      + '<span class="chevron' + (isTokensExpanded ? ' expanded' : '') + '">▶</span>'
      + '</div>';
    if (isTokensExpanded) {
      html += '<div class="nav-sub">'
        + navItem('tokens-analysis', '📋', t('tokenAnalysis'), null, currentView === 'tokens-analysis')
        + '</div>';
    }
    html += navItem('structure', '🗂️', t('structure'), null, currentView === 'structure' && !currentDetail);
    html += '<div class="nav-separator"></div>';

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

      html += '<div class="nav-item' + (isActive ? ' active' : '') + '" data-action="toggle-category" data-category="' + cat.key + '" title="' + escapeHtml(getCatLabel(cat)) + '">'
        + '<span class="icon">' + cat.icon + '</span>'
        + '<span class="label">' + getCatLabel(cat) + '</span>'
        + '<span class="badge">' + badgeText + '</span>'
        + '<span class="chevron' + (isExpanded ? ' expanded' : '') + '">▶</span>'
        + '</div>';

      html += '<div class="nav-children' + (isExpanded ? ' open' : '') + '" data-children="' + cat.key + '">';
      filteredItems.forEach((item) => {
        let name = getItemName(cat.key, item);
        const isChildActive = currentDetail && currentDetail.category === cat.key && currentDetail.name === name;
        html += '<div class="nav-child' + (isChildActive ? ' active' : '') + '" data-action="detail" data-category="' + cat.key + '" data-name="' + escapeHtml(name) + '" title="' + escapeHtml(name) + '">'
          + '<span class="dot" style="background:' + cat.color + '"></span>'
          + '<span class="label">' + escapeHtml(name) + '</span>'
          + '</div>';
      });
      html += '</div>';
    });

    sidebarNav.innerHTML = html;

    sidebarNav.onclick = function (e) {
      const navItemEl = e.target.closest('[data-action]');
      if (!navItemEl) return;
      let action = navItemEl.dataset.action;

      if (action === 'toggle-tokens') {
        expandedCategories._tokens = !expandedCategories._tokens;
        currentView = 'tokens';
        currentDetail = null;
        pushState(true);
        render();
      } else if (action === 'toggle-category') {
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
      } else if (action === 'nav') {
        currentView = navItemEl.dataset.view;
        currentDetail = null;
        pushState(true);
        render();
      }
    };
  }

  function navItem(view, icon, label, badge, active) {
    return '<div class="nav-item' + (active ? ' active' : '') + '" data-action="nav" data-view="' + view + '">'
      + '<span class="icon">' + icon + '</span>'
      + '<span class="label">' + label + '</span>'
      + (badge !== null ? '<span class="badge">' + badge + '</span>' : '')
      + '</div>';
  }

  // ── Content rendering ──
  let skipScrollReset = false;
  function renderContent() {
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
    } else if (currentView === 'tokens-analysis') {
      renderTokensAnalysis();
    } else if (currentView === 'structure') {
      renderStructure();
    } else if (currentView === 'help') {
      renderHelp();
    } else {
      renderCategoryOverview();
    }
  }

  // ── Period filter with calendar ──
  function renderSidebarPeriod() {
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
    } else {
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
      + '</div>'
      + (rangeText ? '<div class="sidebar-period-range">' + rangeText + '</div>' : '');

    // Bind period buttons
    sidebarPeriod.querySelectorAll('.period-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = btn.dataset.period;
        if (val === 'custom') {
          showCalendarPicker();
          return;
        }
        customDateRange = null;
        currentPeriod = parseInt(val);
        localStorage.setItem('harness-period', String(currentPeriod));
        renderSidebarPeriod();
        renderContent();
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

    let dataRange = getDataDateRange();
    const minDate = dataRange ? dataRange.start : new Date(2020, 0, 1);
    const maxDate = dataRange ? dataRange.end : new Date();

    let selStart = customDateRange ? customDateRange.start : new Date(maxDate);
    selStart = new Date(selStart);
    selStart.setDate(selStart.getDate() - 29);
    const selEnd = customDateRange ? customDateRange.end : new Date(maxDate);

    const viewMonth = new Date(selEnd.getFullYear(), selEnd.getMonth(), 1);
    let picking = 'start'; // 'start' or 'end'
    let tempStart = new Date(selStart);
    let tempEnd = new Date(selEnd);

    const overlay = document.createElement('div');
    overlay.id = 'calendar-overlay';
    overlay.className = 'calendar-overlay';

    function renderCalendar() {
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
        const isDisabled = cellDate < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) || cellDate > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
        const isInRange = cellDate >= tempStart && cellDate <= tempEnd;
        const isStart = sameDay(cellDate, tempStart);
        const isEnd = sameDay(cellDate, tempEnd);
        let cls = 'calendar-cell';
        if (isDisabled) cls += ' disabled';
        if (isInRange) cls += ' in-range';
        if (isStart) cls += ' range-start';
        if (isEnd) cls += ' range-end';
        html += '<div class="' + cls + '" data-date="' + year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0') + '">' + d + '</div>';
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
        renderContent();
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
    let usage = getUsage();
    let days = customDateRange ? 0 : currentPeriod;
    const allTokenEntries = usage.tokenEntries || [];
    const tokenEntries = filterByPeriod(allTokenEntries, 'timestamp', days);

    // Totals
    let totalInput = 0, totalOutput = 0, totalCache = 0;
    tokenEntries.forEach((e) => {
      totalInput += e.rawInput || 0;
      totalOutput += e.outputTokens || 0;
      totalCache += (e.cacheRead || 0) + (e.cacheCreation || 0);
    });
    let totalAll = totalInput + totalOutput + totalCache;

    // Changes
    let changeAll = calcTokenChange(allTokenEntries, days, (e) => { return (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0); });
    const changeInput = calcTokenChange(allTokenEntries, days, (e) => { return e.rawInput || 0; });
    const changeOutput = calcTokenChange(allTokenEntries, days, (e) => { return e.outputTokens || 0; });
    const changeCache = calcTokenChange(allTokenEntries, days, (e) => { return (e.cacheRead || 0) + (e.cacheCreation || 0); });

    const siOpts = { si: true };
    let html = '<div class="page-header">'
      + '<h1>🪙 ' + t('tokensTitle') + '</h1>'
      + '<div class="page-desc">' + t('tokensDesc') + '</div>'
      + '</div>'
      + renderPeriodFilter()
      + '<div class="card-grid">'
      + statCard(t('totalTokens'), totalAll, changeAll, siOpts)
      + statCard(t('inputTokens'), totalInput, changeInput, siOpts)
      + statCard(t('outputTokens'), totalOutput, changeOutput, siOpts)
      + statCard(t('cacheTokens'), totalCache, changeCache, siOpts)
      + '</div>';

    // Prep: modelMap + cost
    let totalCost = 0;
    const costDailyMap = {};
    const modelMapForInsights = {};
    tokenEntries.forEach((e) => {
      const cost = calcEntryCost(e);
      totalCost += cost;
      let short = (e.model || 'unknown').replace(/^claude-/, '').replace(/-\d{8,}$/, '');
      if (!modelMapForInsights[short]) modelMapForInsights[short] = { input: 0, output: 0, cache: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
      modelMapForInsights[short].input += e.rawInput || 0;
      modelMapForInsights[short].output += e.outputTokens || 0;
      modelMapForInsights[short].cache += (e.cacheRead || 0) + (e.cacheCreation || 0);
      modelMapForInsights[short].cacheRead += e.cacheRead || 0;
      modelMapForInsights[short].cacheCreation += e.cacheCreation || 0;
      modelMapForInsights[short].cost += cost;
      // daily cost
      const d = typeof e.timestamp === 'number' ? new Date(e.timestamp) : new Date(e.timestamp);
      const dk = d.toISOString().substring(0, 10);
      if (dk) costDailyMap[dk] = (costDailyMap[dk] || 0) + cost;
    });
    const changeCost = calcTokenChange(allTokenEntries, days, (e) => calcEntryCost(e));
    const costDays = Object.keys(costDailyMap).length;
    const dailyAvgCost = costDays > 0 ? totalCost / costDays : 0;

    // Cost cards: total, daily avg, top models
    const modelsByCost = Object.entries(modelMapForInsights).sort((a, b) => b[1].cost - a[1].cost);
    html += '<div style="margin-top:16px;margin-bottom:4px;font-size:13px;color:var(--text-secondary)">' + t('costCardNote') + '</div>'
      + '<div class="card-grid">'
      + statCard(t('totalCost'), fmtCost(totalCost), changeCost, { raw: true })
      + statCard(t('dailyAvgCost'), fmtCost(dailyAvgCost), null, { raw: true, badge: t('activeDaysBadge', costDays) });
    modelsByCost.slice(0, 3).forEach((entry) => {
      if (entry[1].cost > 0) {
        const pct = totalCost > 0 ? Math.round((entry[1].cost / totalCost) * 100) : 0;
        html += statCard(entry[0], fmtCost(entry[1].cost), null, { raw: true, badge: pct + '%' });
      }
    });
    html += '</div>';

    // Cost formula explanation
    html += '<div class="section"><div class="section-title">' + t('costFormula') + '</div>'
      + '<div class="card" style="padding:16px;overflow-x:auto">'
      + '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px">' + t('costFormulaDesc') + '</div>'
      + '<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-family:monospace;line-height:1.8">'
      + t('costFormulaDetail')
      + '</div>'
      + '<details><summary style="cursor:pointer;font-size:13px;font-weight:600;margin-bottom:8px">' + t('costPricingTable') + '</summary>'
      + '<table class="config-table" style="width:100%;margin-top:8px">'
      + '<thead><tr><th>Model</th><th style="text-align:right">Input</th><th style="text-align:right">Output</th><th style="text-align:right">Cache Read</th><th style="text-align:right">Cache Write</th></tr></thead><tbody>';
    Object.entries(MODEL_PRICING).forEach((entry) => {
      const p = entry[1];
      html += '<tr><td><strong>' + entry[0] + '</strong></td>'
        + '<td style="text-align:right">$' + p.input + '</td>'
        + '<td style="text-align:right">$' + p.output + '</td>'
        + '<td style="text-align:right">$' + p.cacheRead + '</td>'
        + '<td style="text-align:right">$' + p.cacheCreation + '</td></tr>';
    });
    html += '</tbody></table>'
      + '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">'
      + t('costPricingUnit') + ' · <a href="https://www.anthropic.com/pricing" target="_blank" style="color:var(--accent)">anthropic.com/pricing</a>'
      + '</div></details></div></div>';

    // 1. Charts
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

    // 2. Heatmap
    const tokenActivityMap = buildActivityMap(tokenEntries, (e) => {
      return (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
    });
    html += '<div class="section">'
      + '<div class="section-title">' + t('tokenActivity') + ' <span class="section-title-sub">' + t('tokenActivityDesc') + '</span></div>'
      + renderHeatmapFromMap(tokenActivityMap, days, t('tokenUnit'), true)
      + '</div>';

    // 3. Model breakdown table
    const modelEntries = Object.entries(modelMapForInsights).sort((a, b) => {
      return (b[1].input + b[1].output + b[1].cache) - (a[1].input + a[1].output + a[1].cache);
    });
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

    // 4. Insights
    html += renderTokenInsights(tokenEntries, modelMapForInsights, days);

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';

    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();
    drawTokenTrendChart(tokenEntries, days);
    drawTokenModelDonut(modelMapForInsights);
  }

  // ── Tokens Analysis sub-page ──

  function renderTokensAnalysis() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const tokenEntries = filterByPeriod(usage.tokenEntries || [], 'timestamp', days);
    const promptEntries = filterByPeriod(usage.promptStats || [], 'timestamp', days);

    let html = '<div class="page-header">'
      + '<h1>📋 ' + t('tokenAnalysis') + '</h1>'
      + '</div>';

    // 1. Prep data: task categories (classified at build time) & tool-level context
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

    // 2. Two rotated bar charts side by side
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

    // 3. Prompt statistics
    if (promptEntries.length > 0) {
      const totalPrompts = promptEntries.length;
      const totalChars = promptEntries.reduce((sum, p) => sum + p.charLen, 0);
      const avgLen = Math.round(totalChars / totalPrompts);
      const shortCount = promptEntries.filter((p) => p.charLen <= 100).length;
      const longCount = promptEntries.filter((p) => p.charLen >= 500).length;
      const shortPct = Math.round((shortCount / totalPrompts) * 100);
      const longPct = Math.round((longCount / totalPrompts) * 100);

      html += '<div class="section"><div class="section-title">' + t('promptStats') + ' <span class="section-title-sub">' + t('promptStatsDesc') + '</span></div>'
        + '<div class="card-grid">'
        + statCard(t('totalPrompts'), totalPrompts, null, { si: true })
        + statCard(t('avgPromptLen'), fmtNum(avgLen) + t('unitChars'), null)
        + statCard(t('shortPrompts'), fmtNum(shortCount), null, { badge: shortPct + '%', badgeColor: 'teal' })
        + statCard(t('longPrompts'), fmtNum(longCount), null, { badge: longPct + '%', badgeColor: 'teal' })
        + '</div></div>';
    }

    // 4. Response latency
    const latencyEntries = filterByPeriod(usage.latencyEntries || [], 'timestamp', days);
    if (latencyEntries.length > 0) {
      const latencies = latencyEntries.map((e) => e.latencyMs).sort((a, b) => a - b);
      const avg = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
      const median = latencies[Math.floor(latencies.length / 2)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const max = latencies[latencies.length - 1];
      const fmtMs = (ms) => ms >= 60000 ? (ms / 60000).toFixed(1) + t('unitMin') : ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';

      html += '<div class="section"><div class="section-title">' + t('responseLatency') + ' <span class="section-title-sub">' + t('responseLatencyDesc') + '</span></div>'
        + '<div class="card-grid">'
        + statCard(t('avgLatency'), fmtMs(avg), null)
        + statCard(t('medianLatency'), fmtMs(median), null)
        + statCard(t('p95Latency'), fmtMs(p95), null)
        + statCard(t('maxLatency'), fmtMs(max), null)
        + '</div></div>';
    }

    // 5. Session analysis
    const sessionMap = {};
    tokenEntries.forEach((e) => {
      const sid = e.sessionId || '_unknown';
      if (!sessionMap[sid]) sessionMap[sid] = { count: 0, minTs: Infinity, maxTs: 0 };
      sessionMap[sid].count += 1;
      const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
      if (ts < sessionMap[sid].minTs) sessionMap[sid].minTs = ts;
      if (ts > sessionMap[sid].maxTs) sessionMap[sid].maxTs = ts;
    });
    const sessions = Object.values(sessionMap).filter((s) => s.count > 1);
    if (sessions.length > 0) {
      const durations = sessions.map((s) => s.maxTs - s.minTs).filter((d) => d > 0);
      const totalSessions = sessions.length;
      const avgMsg = Math.round(sessions.reduce((s, v) => s + v.count, 0) / totalSessions);
      const avgDur = durations.length > 0 ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0;
      const maxDur = durations.length > 0 ? Math.max(...durations) : 0;
      const fmtDur = (ms) => ms >= 3600000 ? (ms / 3600000).toFixed(1) + t('unitHour') : ms >= 60000 ? (ms / 60000).toFixed(0) + t('unitMin') : (ms / 1000).toFixed(0) + 's';

      html += '<div class="section"><div class="section-title">' + t('sessionAnalysis') + ' <span class="section-title-sub">' + t('sessionAnalysisDesc') + '</span></div>'
        + '<div class="card-grid">'
        + statCard(t('totalSessions'), totalSessions, null, { si: true })
        + statCard(t('avgMsgPerSession'), avgMsg, null)
        + statCard(t('avgSessionDuration'), fmtDur(avgDur), null)
        + statCard(t('longestSession'), fmtDur(maxDur), null)
        + '</div></div>';
    }

    // 6. Hourly token distribution
    html += '<div class="section">'
      + '<div class="section-title">' + t('hourlyDist') + ' <span class="section-title-sub">' + t('hourlyDistDesc') + '</span></div>'
      + '<div class="card chart-card"><div id="hourly-dist-chart"></div></div>'
      + '</div>';

    // 7. Cache efficiency
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
        + '</div></div>';
    }

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';
    content.innerHTML = html;
    bindContentActions();

    // Draw charts
    drawRotatedBar('#task-cat-bar', taskCatEntries.map((e) => {
      const meta = taskCatMeta[e[0]] || taskCatMeta['other'] || { icon: '📦', label: e[0] };
      return { label: meta.icon + ' ' + (meta.label || e[0]), value: e[1].tokens };
    }));
    drawRotatedBar('#tool-ctx-bar', contextEntries.map((e) => {
      return { label: e[0], value: e[1].tokens };
    }));
    drawHourlyDistChart(tokenEntries);
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

    bb.generate({
      bindto: '#hourly-dist-chart',
      data: {
        columns: [values],
        type: 'bar',
        color: (color, d) => {
          const v = hourTokens[d.index] || 0;
          const maxVal = Math.max(...hourTokens);
          const ratio = maxVal > 0 ? v / maxVal : 0;
          return ratio > 0.7 ? '#4263eb' : ratio > 0.3 ? '#748ffc' : '#c5d2f6';
        }
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
      bar: { width: { ratio: 0.7 }, radius: { ratio: 0.2 } },
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

    bb.generate({
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

  function drawTokenTrendChart(tokenEntries, days) {
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

    const outputKey = t('outputTokens');
    const inputKey = t('inputTokens');
    const axes = {};
    axes[outputKey] = 'y2';

    bb.generate({
      bindto: '#token-trend-chart',
      data: {
        x: 'x',
        columns: [dateLabels, inputData, outputData],
        types: {},
        type: 'area',
        axes: axes,
        colors: {}
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

    bb.generate({
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

  // ── Overview page ──
  function renderOverview() {
    let scope = DATA.scopes.find((s) => { return s.id === currentScope; });
    const scopePath = scope ? (scope.configPath || scope.projectPath || currentScope) : currentScope;
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

    let html = '<div class="page-header">'
      + '<h1>' + t('overviewTitle') + '</h1>'
      + '<div class="file-path" style="margin-top:8px"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(scopePath) + '</div>'
      + '</div>'
      + renderPeriodFilter()
      + '<div class="card-grid">'
      + statCard(t('totalUsage'), totalAll, changeAll, { si: true })
      + statCard(t('skillCalls'), totalSkills, changeSkills, { si: true })
      + statCard(t('agentCalls'), totalAgents, changeAgents, { si: true })
      + statCard(t('commands'), totalCommands, changeCommands, { si: true })
      + '</div>';

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
    if (unusedSkills.length > 0 || unusedAgents.length > 0) {
      html += '<div class="section">'
        + '<div class="section-title">' + t('unusedItems') + ' <span class="section-title-sub">' + t('unusedCriteria') + '</span></div>'
        + '<div class="unused-grid">';
      unusedSkills.forEach((s) => {
        html += '<div class="unused-item" data-action="goto-detail" data-category="skills" data-name="' + escapeHtml(s.name) + '">'
          + typeBadge('skills') + parentBadge('skills', s.name) + '<span>' + escapeHtml(s.name) + '</span></div>';
      });
      unusedAgents.forEach((a) => {
        html += '<div class="unused-item" data-action="goto-detail" data-category="agents" data-name="' + escapeHtml(a.name) + '">'
          + typeBadge('agents') + '<span>' + escapeHtml(a.name) + '</span></div>';
      });
      html += '</div></div>';
    }

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';

    content.innerHTML = html;
    bindContentActions();
    bindPeriodFilter();

    // Draw charts with billboard.js
    drawTrendChart(usage, days);
    drawDonutChart();
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
      if (dailyMap.hasOwnProperty(key)) dailyMap[key]++;
    });

    for (let j = 1; j < dateLabels.length; j++) {
      countData.push(dailyMap[dateLabels[j]] || 0);
    }

    bb.generate({
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

    bb.generate({
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

  function countUsageList(list, days) {
    if (!list) return 0;
    return filterByPeriod(list, 'timestamp', days).length;
  }

  function calcChangeForList(list, days) {
    if ((days === 0 && !customDateRange) || customDateRange) return null;
    const now = new Date();
    const curStart = new Date(now);
    curStart.setDate(curStart.getDate() - days);
    const prevStart = new Date(curStart);
    prevStart.setDate(prevStart.getDate() - days);
    let cur = list.filter((i) => { return new Date(i.timestamp) >= curStart; }).length;
    let prev = list.filter((i) => {
      let d = new Date(i.timestamp);
      return d >= prevStart && d < curStart;
    }).length;
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
    return '<div class="stat-card">'
      + '<div class="stat-label">' + label + '</div>'
      + '<div class="stat-value">' + displayValue + '</div>'
      + rawHtml
      + changeHtml + badgeHtml + '</div>';
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

    // Install / Update
    html += '<div class="section">'
      + '<div class="section-title">' + t('helpInstall') + '</div>'
      + '<div class="card help-card"><p>' + t('helpInstallDesc') + '</p>'
      + '<pre style="margin:8px 0 0;padding:8px 12px;background:#1a1b1e;color:#e0e0e0;border-radius:6px;font-size:13px;line-height:1.6"><code>'
      + '<span style="color:#6c757d"># ' + t('helpUpdateCli') + '</span>\n'
      + '$ claude plugin marketplace add netil/oh-my-hi\n'
      + '$ claude plugin install oh-my-hi\n\n'
      + '<span style="color:#6c757d"># ' + t('helpUpdateSession') + '</span>\n'
      + '/plugin marketplace add netil/oh-my-hi\n'
      + '/plugin install oh-my-hi@oh-my-hi-marketplace'
      + '</code></pre>'
      + '<p style="margin:10px 0 0;font-size:12px;color:var(--text-secondary);line-height:1.6">' + t('helpUpdateCaveat') + '</p>'
      + '</div></div>';

    // Parameters
    html += '<div class="section">'
      + '<div class="section-title">' + t('helpParams') + '</div>'
      + '<div class="card help-card">'
      + '<table class="config-table help-param-table" style="width:100%"><tbody>'
      + '<tr><td class="help-param-code"><code>/omh</code></td><td>' + t('helpParamDefault') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --data-only</code></td><td>' + t('helpParamDataOnly') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --enable-auto</code></td><td>' + t('helpParamEnableAuto') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --disable-auto</code></td><td>' + t('helpParamDisableAuto') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh --status</code></td><td>' + t('helpParamStatus') + '</td></tr>'
      + '<tr><td class="help-param-code"><code>/omh &lt;path&gt; [path...]</code></td><td>' + t('helpParamPaths') + '</td></tr>'
      + '</tbody></table>'
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

    // Token & usage parsing
    html += '<div class="section">'
      + '<div class="section-title">🪙 ' + t('tokens') + ' & ' + t('activity') + '</div>'
      + '<div class="card help-list">'
      + helpRow('helpTokens', 'helpTokensDesc', '🪙')
      + helpRow('helpPromptStats', 'helpPromptStatsDesc', '📝')
      + helpRow('helpLatency', 'helpLatencyDesc', '⏱️')
      + helpRow('helpActivity', 'helpActivityDesc', '📊')
      + helpRow('helpCommands', 'helpCommandsDesc', '⌨️')
      + '</div></div>';

    html += '<div class="generated-at">oh-my-hi v' + __VERSION__ + ' · <a href="https://github.com/netil/oh-my-hi" target="_blank" style="color:inherit">GitHub</a></div>';
    content.innerHTML = html;
  }

  // ── Structure page ──
  function renderStructure() {
    let sd = getScopeData();
    let html = '<div class="page-header">'
      + '<h1>' + t('structure') + '</h1>'
      + '<div class="subtext">' + t('structureSub') + '</div>'
      + '</div>';

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

      html += '<div class="tree-category">'
        + '<div class="tree-category-header" data-action="toggle-tree" data-tree-key="' + cat.key + '">'
        + '<span class="tree-icon">' + cat.icon + '</span>'
        + '<span class="tree-label">' + getCatLabel(cat) + '</span>'
        + '<span class="tree-count" style="background:' + cat.color + '">' + fmtNum(items.length) + '</span>'
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
    let containerW = svg.parentElement.clientWidth - 40;
    if (containerW < 500) containerW = 500;

    const S = 'http://www.w3.org/2000/svg';
    const nodeH = 36, nodeRx = 8, pad = 16, gap = 12, groupPad = 14, groupRx = 12;
    const font = '-apple-system, sans-serif';
    const arrowColor = '#adb5bd';

    // --- Data: groups with child nodes ---
    let groups = [
      { id: 'context', label: t('flowContextGroup'), color: '#f1f3f5', borderColor: '#dee2e6',
        children: [
          { id: 'claudemd', label: 'CLAUDE.md', color: '#4263eb', nav: 'configFiles', count: (sd.configFiles || []).length },
          { id: 'rules', label: t('flowRules'), color: '#6b7280', nav: 'rules', count: (sd.rules || []).length + (sd.principles || []).length },
          { id: 'memory', label: t('flowMemory'), color: '#0891b2', nav: 'memory', count: (sd.memory || []).length },
        ]
      },
      { id: 'event', label: t('flowEventGroup'), color: '#fff4e6', borderColor: '#ffd8a8',
        children: [
          { id: 'hooks', label: t('flowHooksNode'), color: '#e8590c', nav: 'hooks', count: (sd.hooks || []).length },
        ]
      },
      { id: 'invoke', label: t('flowInvokeGroup'), color: '#f3f0ff', borderColor: '#d0bfff',
        children: [
          { id: 'skills', label: t('flowSkillsNode'), color: '#7c3aed', nav: 'skills', count: (sd.skills || []).length + (sd.agents || []).length },
          { id: 'commands', label: t('flowCommandsNode'), color: '#6366f1', nav: 'commands', count: (sd.commands || []).length },
          { id: 'mcp', label: t('flowMcpNode'), color: '#dc2626', nav: 'mcpServers', count: (sd.mcpServers || []).length },
        ]
      },
    ];

    // Filter children with 0 count, remove empty groups
    groups.forEach((g) => {
      g.children = g.children.filter((c) => { return c.count === undefined || c.count > 0; });
    });
    groups = groups.filter((g) => { return g.children.length > 0; });

    // --- Measure node widths ---
    function textWidth(str) { return Math.max(90, str.length * 7.5 + 30); }

    // --- Layout ---
    const promptNode = { id: 'prompt', label: t('flowPromptNode'), color: '#e9ecef', textColor: '#212529', w: 0, h: nodeH };
    const outputNode = { id: 'output', label: t('flowOutputNode'), color: '#0ca678', textColor: '#fff', w: 0, h: nodeH };
    promptNode.w = textWidth(promptNode.label);
    outputNode.w = textWidth(outputNode.label);

    // Calculate group dimensions
    let maxGroupW = 0;
    groups.forEach((g) => {
      let childrenW = 0;
      g.children.forEach((c) => {
        c.w = textWidth(c.label);
        c.h = nodeH;
        childrenW += c.w;
      });
      childrenW += (g.children.length - 1) * gap;
      g.innerW = childrenW;
      g.w = childrenW + groupPad * 2;
      g.innerH = nodeH;
      g.h = nodeH + groupPad * 2 + 22; // 22 for label
      if (g.w > maxGroupW) maxGroupW = g.w;
    });

    // Normalize group widths
    const groupW = Math.max(maxGroupW, 300);
    groups.forEach((g) => { g.w = groupW; });

    // Vertical layout: prompt → groups → output
    let curY = pad;
    promptNode.x = containerW / 2 - promptNode.w / 2;
    promptNode.y = curY;
    curY += promptNode.h + gap * 2;

    groups.forEach((g) => {
      g.x = containerW / 2 - g.w / 2;
      g.y = curY;
      // Position children centered inside group
      let startX = g.x + (g.w - g.innerW) / 2;
      g.children.forEach((c) => {
        c.x = startX;
        c.y = g.y + 22 + groupPad;
        startX += c.w + gap;
      });
      curY += g.h + gap;
    });

    outputNode.x = containerW / 2 - outputNode.w / 2;
    outputNode.y = curY;
    curY += outputNode.h + pad;

    const svgH = curY;
    svg.setAttribute('viewBox', '0 0 ' + containerW + ' ' + svgH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.innerHTML = '';

    // --- Defs ---
    const defs = document.createElementNS(S, 'defs');
    const marker = document.createElementNS(S, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const ap = document.createElementNS(S, 'path');
    ap.setAttribute('d', 'M0,0 L8,3 L0,6 Z');
    ap.setAttribute('fill', arrowColor);
    marker.appendChild(ap);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // --- Draw helpers ---
    function drawArrow(x1, y1, x2, y2) {
      const line = document.createElementNS(S, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', arrowColor);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(line);
    }

    function drawNode(n, isWhite) {
      const g = document.createElementNS(S, 'g');
      g.setAttribute('class', 'flowchart-node');
      if (n.nav) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', function () {
          currentView = n.nav;
          currentDetail = null;
          expandedCategories[n.nav] = true;
          pushState(true);
          render();
        });
      }
      const rect = document.createElementNS(S, 'rect');
      rect.setAttribute('x', n.x); rect.setAttribute('y', n.y);
      rect.setAttribute('width', n.w); rect.setAttribute('height', n.h);
      rect.setAttribute('rx', nodeRx);
      rect.setAttribute('fill', n.color);
      g.appendChild(rect);

      const hasCount = n.count !== undefined;
      const txt = document.createElementNS(S, 'text');
      txt.setAttribute('x', n.x + n.w / 2);
      txt.setAttribute('y', n.y + n.h / 2 + (hasCount ? -3 : 4));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', isWhite ? n.textColor || '#212529' : '#fff');
      txt.setAttribute('font-size', '11');
      txt.setAttribute('font-weight', '600');
      txt.setAttribute('font-family', font);
      txt.textContent = n.label;
      g.appendChild(txt);

      if (hasCount) {
        const ct = document.createElementNS(S, 'text');
        ct.setAttribute('x', n.x + n.w / 2);
        ct.setAttribute('y', n.y + n.h / 2 + 12);
        ct.setAttribute('text-anchor', 'middle');
        ct.setAttribute('fill', isWhite ? '#6b7280' : '#fff');
        ct.setAttribute('font-size', '9');
        ct.setAttribute('opacity', '0.8');
        ct.setAttribute('font-family', font);
        ct.textContent = '(' + n.count + ')';
        g.appendChild(ct);
      }
      svg.appendChild(g);
    }

    // --- Draw ---
    // Prompt
    drawNode(promptNode, true);

    // Arrow: prompt → first group
    if (groups.length > 0) {
      drawArrow(containerW / 2, promptNode.y + promptNode.h, containerW / 2, groups[0].y);
    }

    // Groups
    groups.forEach((g, gi) => {
      // Group rect
      const grect = document.createElementNS(S, 'rect');
      grect.setAttribute('x', g.x); grect.setAttribute('y', g.y);
      grect.setAttribute('width', g.w); grect.setAttribute('height', g.h);
      grect.setAttribute('rx', groupRx);
      grect.setAttribute('fill', g.color);
      grect.setAttribute('stroke', g.borderColor);
      grect.setAttribute('stroke-width', '1.5');
      svg.appendChild(grect);

      // Group label
      const glabel = document.createElementNS(S, 'text');
      glabel.setAttribute('x', g.x + groupPad);
      glabel.setAttribute('y', g.y + 16);
      glabel.setAttribute('fill', '#6b7280');
      glabel.setAttribute('font-size', '11');
      glabel.setAttribute('font-weight', '500');
      glabel.setAttribute('font-family', font);
      glabel.textContent = g.label;
      svg.appendChild(glabel);

      // Children
      g.children.forEach((c) => { drawNode(c, false); });

      // Arrow to next group
      if (gi < groups.length - 1) {
        drawArrow(containerW / 2, g.y + g.h, containerW / 2, groups[gi + 1].y);
      }
    });

    // Arrow: last group → output
    if (groups.length > 0) {
      drawArrow(containerW / 2, groups[groups.length - 1].y + groups[groups.length - 1].h, containerW / 2, outputNode.y);
    }

    // Output
    drawNode(outputNode, false);
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
      content.innerHTML = '<div class="empty-state">'
        + '<div class="empty-icon">🔍</div>'
        + '<div class="empty-text">Item not found: ' + escapeHtml(name) + '</div>'
        + '</div>';
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
    let usageCount = countUsage('skills', item.name, 0);
    let lastUsed = getLastUsed('skills', item.name);
    let html = '<div class="detail-meta">';
    html += metaCard('USAGE', fmtNum(usageCount) + ' ' + t('calls'));
    html += metaCard('LAST USED', lastUsed ? relativeTime(lastUsed) : t('never'));
    if (item.version) html += metaCard('VERSION', item.version);
    if (item.plugin) html += metaCard('PLUGIN', item.plugin);
    const skillAuthor = getPluginAuthor(item.plugin);
    if (skillAuthor) html += metaCard('AUTHOR', skillAuthor);
    html += '</div>';

    if (item.description) {
      html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(item.description) + '</div></div>';
    }

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

    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }

    if (item.body) {
      html += '<div class="section"><div class="section-title">' + t('content') + '</div>'
        + '<div class="content-preview">' + renderMarkdown(item.body) + '</div></div>';
    }

    return html;
  }

  function renderAgentDetail(item) {
    let usageCount = countUsage('agents', item.name, 0);
    let lastUsed = getLastUsed('agents', item.name);
    const model = item.model || '';
    const modelClass = model.includes('haiku') ? 'haiku' : model.includes('sonnet') ? 'sonnet' : model.includes('opus') ? 'opus' : 'default';

    let html = '<div class="detail-meta">';
    html += metaCard('USAGE', fmtNum(usageCount) + ' ' + t('calls'));
    html += metaCard('LAST USED', lastUsed ? relativeTime(lastUsed) : t('never'));
    if (model) html += '<div class="meta-card"><div class="meta-label">MODEL</div><div class="meta-value"><span class="badge badge-model-' + modelClass + '">' + escapeHtml(model) + '</span></div></div>';
    if (item.plugin) html += metaCard('PLUGIN', item.plugin);
    const agentAuthor = getPluginAuthor(item.plugin);
    if (agentAuthor) html += metaCard('AUTHOR', agentAuthor);
    html += '</div>';

    if (item.description) {
      html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(item.description) + '</div></div>';
    }

    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }

    if (item.body) {
      html += '<div class="section"><div class="section-title">' + t('content') + '</div>'
        + '<div class="content-preview">' + renderMarkdown(item.body) + '</div></div>';
    }

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

    if (item.installPath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.installPath) + '</div>';
    }

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

    if (item.description) {
      html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(item.description) + '</div></div>';
    }

    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }

    if (item.body) {
      html += '<div class="section"><div class="section-title">' + t('content') + '</div>'
        + '<div class="content-preview">' + renderMarkdown(item.body) + '</div></div>';
    }

    return html;
  }

  function renderMcpDetail(item) {
    const usageCount = countUsage('mcpServers', item.name, 0);
    const lastUsed = getLastUsed('mcpServers', item.name);
    let html = '<div class="detail-meta">';
    html += metaCard('USAGE', fmtNum(usageCount) + ' ' + t('calls'));
    html += metaCard('LAST USED', lastUsed ? relativeTime(lastUsed) : t('never'));
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

    if (item.sourcePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.sourcePath) + '</div>';
    }

    return html;
  }

  function renderRuleDetail(item) {
    let html = '';
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }
    if (item.body) {
      html += '<div class="content-preview">' + renderMarkdown(item.body) + '</div>';
    } else {
      html += '<div class="empty-state"><div class="empty-text">' + t('noContent') + '</div></div>';
    }
    return html;
  }

  function renderPrincipleDetail(item) {
    let html = '';
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }
    if (item.body) {
      html += '<div class="content-preview">' + renderMarkdown(item.body) + '</div>';
    } else {
      html += '<div class="empty-state"><div class="empty-text">' + t('noContent') + '</div></div>';
    }
    return html;
  }

  function renderCommandDetail(item) {
    let html = '';
    if (item.description) {
      html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(item.description) + '</div></div>';
    }
    if (item.allowedTools) {
      html += '<div class="section"><div class="section-title">' + t('allowedTools') + '</div>'
        + '<div class="card" style="padding:16px"><code>' + escapeHtml(item.allowedTools) + '</code></div></div>';
    }
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }
    if (item.body) {
      html += '<div class="content-preview">' + renderMarkdown(item.body) + '</div>';
    }
    return html;
  }

  function renderTeamDetail(item) {
    let html = '';
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }
    if (item.description) {
      html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(item.description) + '</div></div>';
    }
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

  function renderPlanDetail(item) {
    let html = '';
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }
    if (item.body) {
      html += '<div class="content-preview">' + renderMarkdown(item.body) + '</div>';
    } else {
      html += '<div class="empty-state"><div class="empty-text">' + t('noContent') + '</div></div>';
    }
    return html;
  }

  function renderTodoDetail(item) {
    let html = '';
    html += '<div class="detail-meta">'
      + metaCard(t('labelTotal'), item.total || 0)
      + metaCard(t('labelPending'), item.pending || 0)
      + metaCard(t('labelCompleted'), item.completed || 0)
      + '</div>';
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }
    return html;
  }

  function metaCard(label, value) {
    return '<div class="meta-card">'
      + '<div class="meta-label">' + label + '</div>'
      + '<div class="meta-value">' + escapeHtml(String(value)) + '</div>'
      + '</div>';
  }

  // ── Content action binding ──
  function bindContentActions() {
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
  function checkDataVersion() {
    // Only works with HTTP (local server / index.html), not file://
    if (location.protocol === 'file:') return;
    fetch('./version.json?' + Date.now()).then(r => r.json()).then(v => {
      if (!v || !v.generatedAt) return;
      if (v.generatedAt !== DATA.generatedAt) {
        showUpdateBanner();
      }
    }).catch(() => {});
  }

  function showUpdateBanner() {
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = '<span>' + t('updateBannerMsg') + '</span>'
      + '<button onclick="location.reload()">' + t('updateBannerRefresh') + '</button>'
      + '<button onclick="this.parentElement.remove()">✕</button>';
    document.body.prepend(banner);
  }

  // ── Boot ──
  init();
  checkDataVersion();
