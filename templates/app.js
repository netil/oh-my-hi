'use strict';

  // ── i18n ──
  // Base: English (hardcoded). Locale: injected at build time via __LOCALE__.
  const I18N = {};
  if (typeof __LOCALE__ !== 'undefined' && __LOCALE__._lang) {
    I18N[__LOCALE__._lang] = __LOCALE__;
  }
  I18N.en = {
    configFilesLabel: "Config Files",
    viewOfficialDocs: "View official docs",
    overview: "Harness",
    overviewTitle: "Harness: Overview",
    structure: "Structure",
    tokens: "Tokens",
    tokensTitle: "Tokens: Overview",
    tokensDesc: "Token usage across all responses including skills, agents, etc. (transcript-based, collected since first Claude Code session)",
    tokenActivity: "Token Activity",
    tokenActivityDesc: "Daily total token usage heatmap",
    tokenUnit: "tokens",
    totalTokens: "Total Tokens",
    inputTokens: "Input Tokens",
    outputTokens: "Output Tokens",
    cacheTokens: "Cache Tokens",
    estimatedCost: "Estimated Cost",
    totalCost: "Total Cost",
    dailyAvgCost: "Daily Avg Cost",
    costFormula: "Cost Calculation",
    costFormulaDesc: "Reference cost converted at Anthropic API token pricing (per 1M tokens, USD). Claude Code CLI is subscription-based (Pro/Max/Team/Enterprise) and not billed per token — this estimate is unrelated to actual subscription charges.",
    costFormulaDetail: "Cost = (Input × input price + Output × output price + Cache Read × cache read price + Cache Write × cache write price) ÷ 1,000,000",
    costPricingTable: "Model Pricing Table (per 1M tokens)",
    costCardNote: "Based on Anthropic API token pricing (<span style='color:#e74c3c'>not actual CLI subscription billing</span>)",
    costPricingUnit: "USD per 1M tokens",
    tokenTrend: "Daily Token Usage",
    modelDist: "Model Distribution",
    tokenByModel: "Token Usage by Model",
    tokenByContext: "Token Usage by Tool",
    tokenByContextDesc: "Tokens attributed to the most recently active individual skill, agent, or tool",
    tokenInsights: "Token Insights",
    tokenAnalysis: "Analysis",
    tokenActivityPage: "Activity Log",
    taskCategory: "Tokens by Task Category",
    taskCategoryDesc: "Token usage grouped into higher-level task categories from skills, agents, and tools",
    promptStats: "Prompt Statistics",
    responseLatency: "Response Latency",
    responseLatencyDesc: "Time from prompt submission to first response (human→assistant interval)",
    avgLatency: "Avg Response Time",
    medianLatency: "Median (P50)",
    p95Latency: "95th Percentile (P95)",
    maxLatency: "Max",
    sessionAnalysis: "Session Analysis",
    sessionAnalysisDesc: "Messages per session and duration",
    totalSessions: "Total Sessions",
    avgSessionDuration: "Avg Session Duration",
    avgMsgPerSession: "Avg Messages/Session",
    longestSession: "Longest Session",
    hourlyDist: "Hourly Token Distribution",
    hourlyDistDesc: "Token usage by hour of day (24h)",
    cacheEfficiency: "Cache Efficiency",
    cacheEfficiencyDesc: "Cache composition of input tokens",
    freshInput: "Fresh Input",
    cacheRead: "Cache Read",
    cacheCreation: "Cache Creation",
    cacheHitRate: "Cache Hit Rate",
    promptStatsDesc: "User input prompt length and frequency analysis (estimated by character count)",
    avgPromptLen: "Avg Prompt Length",
    totalPrompts: "Total Prompts",
    shortPrompts: "Short (≤100 chars)",
    longPrompts: "Long (≥500 chars)",
    chars: " chars",
    scopeLabel: "Workspace",
    searchPlaceholder: "Search...",
    catConfigFiles: "Config Files",
    catSkills: "Skills",
    catAgents: "Agents",
    catPlugins: "Plugins",
    catHooks: "Hooks",
    catMemory: "Memory",
    catMcpServers: "MCP Servers",
    catRules: "Rules",
    catPrinciples: "Principles",
    catCommands: "Commands",
    catTeams: "Teams",
    catPlans: "Plans",
    catTodos: "Tasks",
    totalUsage: "Total Usage",
    skillCalls: "Skill Calls",
    agentCalls: "Agent Calls",
    commands: "Commands",
    popularSkills: "Popular Skills",
    recent: "Recent",
    activity: "Activity",
    activityDesc: "Daily activity combining skills, agents, commands, and MCP calls (transcript-based, collected since first Claude Code session)",
    unusedItems: "Unused Items",
    unusedCriteria: "0 calls in selected period",
    generatedAt: "Generated at",
    calls: "calls",
    never: "Never",
    noItems: "No {0} found in this scope",
    itemsIn: "{0} items in {1}",
    vsPrevPeriod: "% vs prev period",
    less: "Less",
    more: "More",
    description: "Description",
    content: "Content",
    configuration: "Configuration",
    serverConfig: "Server Configuration",
    envKeys: "Environment Keys",
    includedSkills: "Included Skills",
    allowedTools: "Allowed Tools",
    argumentHint: "Argument Hint",
    script: "Script",
    noContent: "No content available",
    flowOutput: "Output",
    configPathLabel: "Path",
    periodRangeLabel: "Period",
    dailyTrend: "Daily Usage Trend",
    dailyTrendDesc: "Total daily calls combining skills, agents, and commands",
    categoryDist: "Harness Composition",
    insights: "Insights & Recommendations",
    mostActiveSkill: "Most active skill: {0} ({1} calls)",
    unusedAgentRec: "Unused agent for {0} days: {1} — consider removing",
    peakHour: "Peak skill usage hours: {0}",
    mostActiveAgent: "Most active agent: {0} ({1} calls)",
    noUsageData: "No usage data available",
    insightUsagePatternTitle: "Usage Pattern",
    insightUnusedCleanupTitle: "Unused Items Cleanup",
    insightEfficiencyTitle: "Efficiency Suggestion",
    insightTimeTitle: "Time Analysis",
    insightPluginTitle: "Harness Configuration",
    insightMemoryTitle: "Memory Management",
    insightTopAgentTitle: "Agent Utilization",
    categoryOverview: "{0} Overview",
    topUsed: "Top Used",
    recentlyUsed: "Recently Used",
    unused: "Unused",
    allItems: "All Items",
    totalCount: "Total Count",
    periodUsage: "Period Usage",
    usedCount: "Used",
    unusedCount: "Unused",
    flowTitle: "Component Flow",
    flowSubtext: "How a user prompt flows through the harness",
    flowUserPrompt: "User Prompt",
    flowClaudeMd: "CLAUDE.md",
    flowRulesPrinciples: "Rules / Principles",
    flowHooks: "Hooks",
    flowSkillsAgents: "Skills / Agents",
    flowMcpServers: "MCP Servers",
    fileTree: "File Tree",
    fileTreeSub: "File tree of the harness configuration",
    structureSub: "Component interaction flow and file tree",
    langLabel: "🌐",
    all: "All",
    custom: "Custom",
    calendarTitle: "Select Date Range",
    calendarApply: "Apply",
    calendarCancel: "Cancel",
    command: "Command",
    skill: "Skill",
    agent: "Agent",
    rank: "#{0}",
    justNow: "Just now",
    minutesAgo: "{0}m ago",
    hoursAgo: "{0}h ago",
    daysAgo: "{0}d ago",
    monthsAgo: "{0}mo ago",
    yearsAgo: "{0}y ago",
    activities: "activities",
    help: "Help",
    helpTitle: "Help",
    helpUsage: "Usage",
    helpUsageDesc: "Generate the dashboard via the /omh skill.",
    helpParams: "Parameters",
    helpParamDefault: "Parse and generate data, build web-ui, then open automatically in browser",
    helpParamDataOnly: "Regenerate data only without rebuilding web-ui",
    helpParamEnableAuto: "Auto-rebuild data+web-ui on session end (registers Stop hook). Manual browser refresh required",
    helpParamDisableAuto: "Disable auto-rebuild (removes Stop hook)",
    helpParamStatus: "Check auto-refresh hook status",
    helpParamPaths: "Build with only the specified project paths",
    helpDataSources: "Data Parsing Reference",
    helpConfigFiles: "Config Files",
    helpConfigFilesDesc: "Reads CLAUDE.md, AGENTS.md (global/project), settings.json, and settings.local.json. Extracts content and statistics.",
    helpSkills: "Skills",
    helpSkillsDesc: "Parses {{configDir}}/skills/*/SKILL.md and plugins/cache/**/SKILL.md. Extracts name, description, version, argument-hint, allowed-tools from YAML frontmatter. Local skills take priority over plugin skills with the same name.",
    helpAgents: "Agents",
    helpAgentsDesc: "Parses {{configDir}}/agents/*.md. Extracts name, description, model from frontmatter. changelog.md is excluded.",
    helpPlugins: "Plugins",
    helpPluginsDesc: "Reads installed plugin list from plugins/installed_plugins.json. Checks enabled status via enabledPlugins in settings.json. Looks up author info from marketplace.json.",
    helpHooks: "Hooks",
    helpHooksDesc: "Parses the hooks section of settings.json. Groups by event (PreToolUse, PostToolUse, Stop, etc.) and matcher, then aggregates commands.",
    helpMemory: "Memory",
    helpMemoryDesc: "Parses {{configDir}}/projects/*/memory/*.md. Extracts name, description, type from frontmatter. MEMORY.md (index file) is excluded.",
    helpMcpServers: "MCP Servers",
    helpMcpServersDesc: "Reads mcpServers from .claude.json and mcp.json. Environment variable values are masked (***) for security; only key names are exposed.",
    helpRules: "Rules & Principles",
    helpRulesDesc: "Reads {{configDir}}/rules/*.md and principles/*.md. Treats entire file content as body without frontmatter parsing.",
    helpScopes: "Scopes (Workspaces)",
    helpScopesDesc: "Global scope (default) + auto-detected from projects/ subdirectories. Extracts the cwd field from .jsonl files to find actual project paths. Paths that no longer exist are filtered out.",
    helpTokens: "Token Usage",
    helpTokensDesc: "Parses projects/*/*.jsonl (transcripts). Extracts input/output/cache tokens from assistant message usage fields. Attributed by model, session, and active context (skill/agent/MCP/tool).",
    helpPromptStats: "Prompt Statistics",
    helpPromptStatsDesc: "Estimates character count (charLen) of human messages from transcripts. Calculates short (≤100 chars) and long (≥500 chars) prompt ratios.",
    helpLatency: "Response Latency",
    helpLatencyDesc: "Measures time difference between human→assistant messages. Only 0–600,000ms (10 min) range is valid. Tracked per session.",
    helpActivity: "Activity Heatmap",
    helpActivityDesc: "Aggregates skill/agent/command/MCP calls by day and visualizes as a heatmap.",
    helpCommands: "Command History",
    helpCommandsDesc: "Extracts user commands starting with / from history.jsonl. Built-in commands (clear, help, model, etc. — 20 types) and file paths are excluded.",
    helpCustomCommands: "Commands",
    helpCustomCommandsDesc: "Parses {{configDir}}/commands/*.md. Extracts description and allowed-tools from frontmatter.",
    helpTeams: "Teams",
    helpTeamsDesc: "Parses {{configDir}}/teams/*/config.json. Extracts team name, description, and member count.",
    helpPlans: "Plans",
    helpPlansDesc: "Parses {{configDir}}/plans/*.md. Lists execution plan documents by filename.",
    helpTodos: "Tasks",
    helpTodosDesc: "Parses {{configDir}}/todos/*.json. Aggregates total/pending/completed task counts.",
  };

  const systemLocale = (DATA.systemLocale || 'en').substring(0, 2);
  let currentLang = localStorage.getItem('harness-lang') || (I18N[systemLocale] ? systemLocale : 'en');

  // ── Dark mode ──
  (function initTheme() {
    let theme = localStorage.getItem('harness-theme') || 'light';
    if (theme === 'dark') {
      document.body.classList.add('dark');
      let bbDark = document.getElementById('bb-dark-theme');
      if (bbDark) bbDark.disabled = false;
    }
  })();

  function t(key) {
    const args = Array.prototype.slice.call(arguments, 1);
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
      const bbDark = document.getElementById('bb-dark-theme');
      if (bbDark) bbDark.disabled = !isDark;
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
      return d >= curStart && (!name || i.name === name);
    }).length;
    let prev2 = list.filter((i) => {
      let d = new Date(i.timestamp);
      return d >= prevStart2 && d < curStart && (!name || i.name === name);
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
    let dayNames = currentLang === 'ko'
      ? ['일', '월', '화', '수', '목', '금', '토']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
  let _numFmt = new Intl.NumberFormat(currentLang === 'ko' ? 'ko-KR' : 'en-US');
  function fmtNum(n) {
    if (typeof n !== 'number') return String(n);
    return _numFmt.format(n);
  }
  function updateNumFmt() {
    _numFmt = new Intl.NumberFormat(currentLang === 'ko' ? 'ko-KR' : 'en-US');
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
      const monthNames = currentLang === 'ko'
        ? ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayNames = currentLang === 'ko'
        ? ['일', '월', '화', '수', '목', '금', '토']
        : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
      + statCard(t('dailyAvgCost'), fmtCost(dailyAvgCost), null, { raw: true, badge: (currentLang === 'ko' ? '활동 ' : '') + costDays + (currentLang === 'ko' ? '일 기준' : ' active days') });
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
    Object.entries(MODEL_PRICING).forEach(function(entry) {
      var p = entry[1];
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
    const ko = currentLang === 'ko';

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
        + statCard(t('avgPromptLen'), fmtNum(avgLen) + (ko ? '자' : ' chars'), null)
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
      const fmtMs = (ms) => ms >= 60000 ? (ms / 60000).toFixed(1) + (ko ? '분' : 'm') : ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';

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
      const fmtDur = (ms) => ms >= 3600000 ? (ms / 3600000).toFixed(1) + (ko ? '시간' : 'h') : ms >= 60000 ? (ms / 60000).toFixed(0) + (ko ? '분' : 'm') : (ms / 1000).toFixed(0) + 's';

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
      const meta = taskCatMeta[e[0]] || taskCatMeta['other'] || { icon: '📦', ko: e[0], en: e[0] };
      return { label: meta.icon + ' ' + (ko ? meta.ko : meta.en), value: e[1].tokens };
    }));
    drawRotatedBar('#tool-ctx-bar', contextEntries.map((e) => {
      return { label: e[0], value: e[1].tokens };
    }));
    drawHourlyDistChart(tokenEntries, ko);
  }

  function drawHourlyDistChart(tokenEntries, ko) {
    const el = document.getElementById('hourly-dist-chart');
    if (!el) return;

    const hourTokens = new Array(24).fill(0);
    tokenEntries.forEach((e) => {
      const d = typeof e.timestamp === 'number' ? new Date(e.timestamp) : new Date(e.timestamp);
      if (!isNaN(d.getTime())) {
        hourTokens[d.getHours()] += (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
      }
    });

    const categories = Array.from({ length: 24 }, (_, i) => i + (ko ? '시' : 'h'));
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

  // ── Tokens Activity sub-page ──
  function renderTokensActivity() {
    const usage = getUsage();
    const days = customDateRange ? 0 : currentPeriod;
    const tokenEntries = filterByPeriod(usage.tokenEntries || [], 'timestamp', days);

    let html = '<div class="page-header">'
      + '<h1>🗓️ ' + t('tokenActivityPage') + '</h1>'
      + '</div>';

    const tokenActivityMap = buildActivityMap(tokenEntries, (e) => {
      return (e.rawInput || 0) + (e.outputTokens || 0) + (e.cacheRead || 0) + (e.cacheCreation || 0);
    });
    html += '<div class="section">'
      + '<div class="section-title">' + t('tokenActivity') + ' <span class="section-title-sub">' + t('tokenActivityDesc') + '</span></div>'
      + renderHeatmapFromMap(tokenActivityMap, days, t('tokenUnit'), true)
      + '</div>';

    html += '<div class="generated-at">' + t('generatedAt') + ' ' + formatDateTime(DATA.generatedAt) + ' · ' + (DATA.configDir || '') + '</div>';
    content.innerHTML = html;
    bindContentActions();
  }

  function renderTokenInsights(tokenEntries, modelMap, days) {
    if (tokenEntries.length === 0) return '';
    const ko = currentLang === 'ko';
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
      let detail = ko
        ? '전체 Input 중 캐시 읽기 ' + cacheRate + '%, 캐시 생성 ' + creationRate + '%, 신규 입력 ' + freshRate + '%.'
        : 'Of total input: cache read ' + cacheRate + '%, cache creation ' + creationRate + '%, fresh input ' + freshRate + '%.';
      if (cacheRate > 70) {
        detail += '\n' + (ko
          ? '캐시 히트율이 높아 비용 효율이 우수합니다.'
          : 'High cache hit rate indicates excellent cost efficiency.');
      } else if (cacheRate < 30) {
        detail += '\n' + (ko
          ? '캐시 히트율이 낮습니다. 대화가 짧거나 컨텍스트가 자주 변경되는 패턴일 수 있습니다.'
          : 'Low cache hit rate. Conversations may be short or context changes frequently.');
      }
      insights.push({ icon: '💰', title: ko ? '캐시 효율성' : 'Cache Efficiency', detail: detail });
    }

    // 2. Output/Input ratio
    if (totalRawInput > 0) {
      const ratio = (totalOutput / totalRawInput).toFixed(1);
      let detail = ko
        ? '신규 입력 대비 출력 비율: ' + ratio + 'x (Input ' + fmtCompact(totalRawInput) + ' → Output ' + fmtCompact(totalOutput) + ').'
        : 'Output to fresh input ratio: ' + ratio + 'x (Input ' + fmtCompact(totalRawInput) + ' → Output ' + fmtCompact(totalOutput) + ').';
      if (parseFloat(ratio) > 5) {
        detail += '\n' + (ko
          ? '출력 비율이 높습니다. 코드 생성이나 긴 응답이 많은 패턴입니다.'
          : 'High output ratio. Pattern indicates frequent code generation or lengthy responses.');
      }
      insights.push({ icon: '📊', title: ko ? '응답 효율' : 'Response Efficiency', detail: detail });
    }

    // 3. Primary model
    const modelEntries = Object.entries(modelMap).sort((a, b) => {
      return (b[1].input + b[1].output + b[1].cache) - (a[1].input + a[1].output + a[1].cache);
    });
    if (modelEntries.length > 0) {
      const top = modelEntries[0];
      const topTotal = top[1].input + top[1].output + top[1].cache;
      const topPct = totalAll > 0 ? Math.round((topTotal / totalAll) * 100) : 0;
      let detail = ko
        ? '주력 모델: ' + top[0] + ' (전체의 ' + topPct + '%, ' + fmtCompact(topTotal) + ' 토큰).'
        : 'Primary model: ' + top[0] + ' (' + topPct + '% of total, ' + fmtCompact(topTotal) + ' tokens).';
      if (modelEntries.length > 1) {
        const others = modelEntries.slice(1).map((e) => {
          const t2 = e[1].input + e[1].output + e[1].cache;
          return e[0] + ' ' + fmtCompact(t2);
        }).join(', ');
        detail += '\n' + (ko ? '기타: ' : 'Others: ') + others;
      }
      insights.push({ icon: '🤖', title: ko ? '모델 사용 분석' : 'Model Usage', detail: detail });
    }

    // 3b. Cost breakdown
    let totalCostInsight = 0;
    tokenEntries.forEach((e) => { totalCostInsight += calcEntryCost(e); });
    if (totalCostInsight > 0) {
      const costByModel = modelEntries.map((e) => e[0] + ' ' + fmtCost(e[1].cost || 0)).join(', ');
      let detail = ko
        ? '총 예상 비용: ' + fmtCost(totalCostInsight) + ' (Anthropic 공식 가격 기준).'
        : 'Total estimated cost: ' + fmtCost(totalCostInsight) + ' (based on Anthropic official pricing).';
      detail += '\n' + (ko ? '모델별: ' : 'By model: ') + costByModel;
      insights.push({ icon: '💵', title: ko ? '비용 분석' : 'Cost Breakdown', detail: detail });
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
      const dowNames = ko
        ? ['일', '월', '화', '수', '목', '금', '토']
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const maxDow = dowTokens.indexOf(Math.max(...dowTokens));

      // Peak hours
      const maxHourVal = Math.max(...hourTokens);
      const peakHours = [];
      hourTokens.forEach((v, h) => { if (v >= maxHourVal * 0.7 && v > 0) peakHours.push(h); });
      const fmtH = (h) => ko
        ? (h < 12 ? '오전 ' : '오후 ') + (h === 0 ? 12 : h <= 12 ? h : h - 12) + '시'
        : h + ':00';
      const peakHourStr = peakHours.length <= 3
        ? peakHours.map(fmtH).join(', ')
        : fmtH(peakHours[0]) + '–' + fmtH(peakHours[peakHours.length - 1]);

      let detail = ko
        ? '활동일 ' + fmtNum(totalDays) + '일, 일평균 ' + fmtCompact(dailyAvg) + ' 토큰.'
        : fmtNum(totalDays) + ' active days, daily avg ' + fmtCompact(dailyAvg) + ' tokens.';
      detail += '\n' + (ko
        ? '피크: ' + peak[0] + ' (' + fmtCompact(peak[1]) + ' 토큰)'
        : 'Peak: ' + peak[0] + ' (' + fmtCompact(peak[1]) + ' tokens)');
      detail += '\n' + (ko
        ? '요일별: ' + dowNames[maxDow] + '요일에 가장 많이 사용 (' + fmtCompact(dowTokens[maxDow]) + ' 토큰). 시간대: ' + peakHourStr + '에 집중.'
        : 'Busiest day: ' + dowNames[maxDow] + ' (' + fmtCompact(dowTokens[maxDow]) + ' tokens). Peak hours: ' + peakHourStr + '.');
      insights.push({ icon: '📈', title: ko ? '일별 사용 패턴' : 'Daily Pattern', detail: detail });
    }

    // 5. Requests count & avg tokens per request
    const reqCount = tokenEntries.length;
    if (reqCount > 0) {
      const avgPerReq = Math.round(totalAll / reqCount);
      let detail = ko
        ? '총 ' + fmtNum(reqCount) + '회 요청, 요청당 평균 ' + fmtCompact(avgPerReq) + ' 토큰.'
        : fmtNum(reqCount) + ' total requests, avg ' + fmtCompact(avgPerReq) + ' tokens per request.';
      if (avgPerReq > 50000) {
        detail += '\n' + (ko
          ? '요청당 토큰이 큽니다. 긴 컨텍스트를 포함한 작업이 많은 패턴입니다.'
          : 'High tokens per request. Pattern suggests tasks with large context windows.');
      }
      insights.push({ icon: '🔢', title: ko ? '요청 분석' : 'Request Analysis', detail: detail });
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
          format: function (value, ratio) { return Math.round(ratio * 100) + '%'; },
          ratio: 1.0
        },
        width: 51
      },
      tooltip: {
        format: {
          value: function (value, ratio) { return fmtCompact(value) + ' (' + Math.round(ratio * 100) + '%)'; }
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
            format: function (v) { return Math.round(v); }
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
      // resolve CSS var color
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
          format: function (value, ratio) { return Math.round(ratio * 100) + '%'; },
          ratio: 1.0
        },
        width: 51
      },
      tooltip: {
        format: {
          value: function (value, ratio) {
            return fmtNum(value) + ' (' + Math.round(ratio * 100) + '%)';
          }
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
    let ko = currentLang === 'ko';
    const allItems = [].concat(usage.skills || [], usage.agents || [], usage.commands || []);
    if (allItems.length === 0) return '';

    const periodDays = customDateRange ? Math.ceil((customDateRange.end - customDateRange.start) / 86400000) : (days === 0 ? 90 : days);

    // ── helpers ──
    const allSkillDefs = sd.skills || [];
    const skillDefMap = {};
    allSkillDefs.forEach((s) => { skillDefMap[s.name] = s; });

    function fmtHour(h) {
      if (ko) return (h < 12 ? '오전 ' : '오후 ') + (h === 0 ? 12 : h <= 12 ? h : h - 12) + '시';
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

      let detail = (ko ? '상위 스킬: ' : 'Top skills: ')
        + top3.map((p) => { return p[0] + ' (' + fmtNum(p[1]) + (ko ? '회' : '') + ')'; }).join(', ') + '.';

      if (!hasHint && top3[0][1] >= 5) {
        detail += '\n' + (ko
          ? top3[0][0] + '에 argument-hint가 없습니다. frontmatter에 argument-hint를 추가하면 사용자에게 인자 형식을 안내할 수 있습니다.'
          : top3[0][0] + ' has no argument-hint. Add one to its frontmatter to guide argument input.');
      } else {
        detail += '\n' + (ko
          ? '전체 ' + fmtNum(totalCount) + '개 스킬 중 ' + fmtNum(usedCount) + '개(' + Math.round(usedCount / totalCount * 100) + '%)를 실제 사용 중입니다.'
          : fmtNum(usedCount) + ' of ' + fmtNum(totalCount) + ' skills (' + Math.round(usedCount / totalCount * 100) + '%) are actively used.');
      }

      insights.push({ icon: '🏆', title: t('insightUsagePatternTitle'), detail: detail });
    }

    // ── 2. Unused agents cleanup - name specific agents ──
    if (unusedAgents && unusedAgents.length > 0) {
      let names = unusedAgents.map((a) => { return a.name; });
      let detail = ko
        ? fmtNum(periodDays) + '일간 미사용 에이전트 ' + fmtNum(names.length) + '개: ' + names.join(', ') + '.'
          + '\n에이전트 정의 파일을 삭제하면 컨텍스트 로딩이 가벼워집니다.'
        : fmtNum(names.length) + ' unused agents for ' + fmtNum(periodDays) + ' days: ' + names.join(', ') + '.'
          + '\nRemove their definition files to reduce context loading.';
      insights.push({ icon: '⚠️', title: t('insightUnusedCleanupTitle'), detail: detail });
    }

    // ── 3. Efficiency - agent-specific actionable suggestions ──
    const agentSuggestions = {
      'Explore': {
        ko: '코드베이스 탐색용으로 빈번하게 사용됩니다. 자주 탐색하는 경로를 CLAUDE.md에 명시하거나, 특정 탐색 패턴(예: "API 엔드포인트 찾기", "컴포넌트 구조 파악")을 전용 스킬로 만들면 탐색 시간이 단축됩니다.',
        en: 'Frequently used for codebase exploration. Add commonly searched paths to CLAUDE.md, or create dedicated skills for recurring patterns (e.g., "find API endpoints", "trace component structure").'
      },
      'general-purpose': {
        ko: '범용 에이전트로 다양한 작업에 사용됩니다. 반복되는 작업 패턴을 분석하여 전용 에이전트(subagent_type)로 분리하면 프롬프트 품질과 도구 권한을 최적화할 수 있습니다.',
        en: 'Used for various tasks as a general-purpose agent. Analyze recurring patterns and create dedicated agent types with optimized prompts and tool permissions.'
      },
      'Plan': {
        ko: '계획 수립에 자주 사용됩니다. 프로젝트별 계획 템플릿을 스킬로 만들면 일관된 형식의 계획을 더 빠르게 생성할 수 있습니다.',
        en: 'Frequently used for planning. Create project-specific plan template skills for faster, consistent plan generation.'
      }
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

        let detail = (ko ? '상위 에이전트: ' : 'Top agents: ')
          + top3agents.map((p) => { return p[0] + ' (' + fmtNum(p[1]) + (ko ? '회' : '') + ')'; }).join(', ')
          + (ko ? '. ' + topAgentName + '이 전체의 ' + pct + '%를 차지합니다.' : '. ' + topAgentName + ' accounts for ' + pct + '% of all agent calls.');

        if (suggestion) {
          detail += '\n' + (suggestion[currentLang] || suggestion.en);
        } else {
          detail += '\n' + (ko
            ? '이 에이전트의 반복 호출 패턴을 분석하여, 자주 수행하는 작업을 전용 스킬이나 rules/principles로 정의하면 자동화 효율이 높아집니다.'
            : 'Analyze this agent\'s recurring call patterns and define frequently performed tasks as dedicated skills or rules/principles.');
        }

        insights.push({ icon: '💡', title: t('insightEfficiencyTitle'), detail: detail });
      } else {
        let detail = (ko ? '가장 활발한 에이전트: ' : 'Most active agent: ')
          + topAgentName + ' (' + fmtNum(topAgentCount) + (ko ? '회' : ' calls') + '). ';
        if (sortedAgents.length > 1) {
          detail += ko
            ? '그 외 ' + (sortedAgents.length - 1) + '종의 에이전트가 사용되었습니다.'
            : (sortedAgents.length - 1) + ' other agent type(s) were also used.';
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
    const maxHourCount = Math.max.apply(null, hourCounts);
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

        let detail = ko
          ? peakStr + '에 사용이 집중됩니다.'
          : 'Usage peaks at ' + peakStr + '.';
        if (peakTopSkills.length > 0) {
          detail += '\n' + (ko
            ? '이 시간대 주요 항목: ' + peakTopSkills.map((p) => { return p[0] + '(' + p[1] + '회)'; }).join(', ') + '.'
            : 'Top items during peak: ' + peakTopSkills.map((p) => { return p[0] + ' (' + p[1] + ')'; }).join(', ') + '.');
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

      let detail = ko
        ? '활성 플러그인 ' + fmtNum(activePlugins.length) + '개에서 ' + fmtNum(usedPluginSkills.length) + '개 스킬만 사용 중입니다.'
        : 'Only ' + fmtNum(usedPluginSkills.length) + ' plugin skills are actively used from ' + fmtNum(activePlugins.length) + ' active plugins.';

      if (unusedPluginSkills.length > 0) {
        const pluginEntries = Object.entries(unusedByPlugin).slice(0, 3);
        detail += '\n' + (ko ? '미사용 스킬: ' : 'Unused: ');
        detail += pluginEntries.map((entry) => {
          let names = entry[1].slice(0, 2).join(', ');
          if (entry[1].length > 2) names += (ko ? ' 외 ' + (entry[1].length - 2) + '개' : ' +' + (entry[1].length - 2));
          return entry[0] + ' → ' + names;
        }).join('; ') + '.';
        detail += '\n' + (ko
          ? '미사용 플러그인을 비활성화하면 세션 시작 시 컨텍스트 로딩이 줄어듭니다.'
          : 'Disabling unused plugins reduces context loading at session start.');
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
      const breakdown = sortedTypes.map((p) => { return p[0] + ' ' + p[1] + (ko ? '개' : ''); }).join(', ');

      const memoryAdvice = {
        feedback: { ko: 'feedback 메모리가 많습니다. 중복되거나 이미 CLAUDE.md에 반영된 항목이 있는지 확인하고 정리하세요.', en: 'Many feedback memories. Check for duplicates or items already reflected in CLAUDE.md.' },
        project: { ko: 'project 메모리가 많습니다. 완료된 프로젝트나 오래된 상태 정보를 정리하면 컨텍스트가 정확해집니다.', en: 'Many project memories. Clean up completed projects or outdated status to keep context accurate.' },
        user: { ko: 'user 메모리가 많습니다. 변경된 역할이나 선호도가 있는지 확인하고 통합하세요.', en: 'Many user memories. Review for outdated roles or preferences and consolidate.' },
        reference: { ko: 'reference 메모리가 많습니다. 더 이상 유효하지 않은 외부 링크나 리소스가 있는지 확인하세요.', en: 'Many reference memories. Verify that external links and resources are still valid.' }
      };

      const topType = sortedTypes[0][0];
      let detail = ko
        ? '메모리 ' + fmtNum(memoryItems.length) + '개 — ' + breakdown + '.'
        : fmtNum(memoryItems.length) + ' memories — ' + breakdown + '.';

      const advice = memoryAdvice[topType];
      if (advice) {
        detail += '\n' + (advice[currentLang] || advice.en);
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
          const dayNames = currentLang === 'ko'
            ? ['일', '월', '화', '수', '목', '금', '토']
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

    // Usage
    html += '<div class="section">'
      + '<div class="section-title">' + t('helpUsage') + '</div>'
      + '<div class="card help-card"><p>' + t('helpUsageDesc') + '</p></div>'
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

    html += '<div class="generated-at">oh-my-hi v0.1.0 · <a href="https://github.com/netil/oh-my-hi" target="_blank" style="color:inherit">GitHub</a></div>';
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
    const ko = currentLang === 'ko';
    let containerW = svg.parentElement.clientWidth - 40;
    if (containerW < 500) containerW = 500;

    const S = 'http://www.w3.org/2000/svg';
    const nodeH = 36, nodeRx = 8, pad = 16, gap = 12, groupPad = 14, groupRx = 12;
    const font = '-apple-system, sans-serif';
    const arrowColor = '#adb5bd';

    // --- Data: groups with child nodes ---
    var groups = [
      { id: 'context', label: ko ? '컨텍스트 (자동 로드)' : 'Context (auto-loaded)', color: '#f1f3f5', borderColor: '#dee2e6',
        children: [
          { id: 'claudemd', label: 'CLAUDE.md', color: '#4263eb', nav: 'configFiles', count: (sd.configFiles || []).length },
          { id: 'rules', label: ko ? '규칙 / 원칙' : 'Rules / Principles', color: '#6b7280', nav: 'rules', count: (sd.rules || []).length + (sd.principles || []).length },
          { id: 'memory', label: ko ? '💾 메모리' : '💾 Memory', color: '#0891b2', nav: 'memory', count: (sd.memory || []).length },
        ]
      },
      { id: 'event', label: ko ? '이벤트 기반 (자동 트리거)' : 'Event-driven (auto-trigger)', color: '#fff4e6', borderColor: '#ffd8a8',
        children: [
          { id: 'hooks', label: ko ? '🪝 훅' : '🪝 Hooks', color: '#e8590c', nav: 'hooks', count: (sd.hooks || []).length },
        ]
      },
      { id: 'invoke', label: ko ? '사용자 실행 (직접 호출)' : 'User-invoked (direct call)', color: '#f3f0ff', borderColor: '#d0bfff',
        children: [
          { id: 'skills', label: ko ? '🧠 스킬 / 에이전트' : '🧠 Skills / Agents', color: '#7c3aed', nav: 'skills', count: (sd.skills || []).length + (sd.agents || []).length },
          { id: 'commands', label: ko ? '⌨️ 명령어' : '⌨️ Commands', color: '#6366f1', nav: 'commands', count: (sd.commands || []).length },
          { id: 'mcp', label: ko ? '🔌 MCP 서버' : '🔌 MCP Servers', color: '#dc2626', nav: 'mcpServers', count: (sd.mcpServers || []).length },
        ]
      },
    ];

    // Filter children with 0 count, remove empty groups
    groups.forEach(function (g) {
      g.children = g.children.filter(function (c) { return c.count === undefined || c.count > 0; });
    });
    groups = groups.filter(function (g) { return g.children.length > 0; });

    // --- Measure node widths ---
    function textWidth(str) { return Math.max(90, str.length * 7.5 + 30); }

    // --- Layout ---
    var promptNode = { id: 'prompt', label: ko ? '사용자 프롬프트' : 'User Prompt', color: '#e9ecef', textColor: '#212529', w: 0, h: nodeH };
    var outputNode = { id: 'output', label: ko ? '결과 출력' : 'Output', color: '#0ca678', textColor: '#fff', w: 0, h: nodeH };
    promptNode.w = textWidth(promptNode.label);
    outputNode.w = textWidth(outputNode.label);

    // Calculate group dimensions
    var totalH = 0;
    var maxGroupW = 0;
    groups.forEach(function (g) {
      var childrenW = 0;
      g.children.forEach(function (c) {
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
    var groupW = Math.max(maxGroupW, 300);
    groups.forEach(function (g) { g.w = groupW; });

    // Vertical layout: prompt → groups → output
    var curY = pad;
    promptNode.x = containerW / 2 - promptNode.w / 2;
    promptNode.y = curY;
    curY += promptNode.h + gap * 2;

    groups.forEach(function (g) {
      g.x = containerW / 2 - g.w / 2;
      g.y = curY;
      // Position children centered inside group
      var startX = g.x + (g.w - g.innerW) / 2;
      g.children.forEach(function (c) {
        c.x = startX;
        c.y = g.y + 22 + groupPad;
        startX += c.w + gap;
      });
      curY += g.h + gap;
    });

    outputNode.x = containerW / 2 - outputNode.w / 2;
    outputNode.y = curY;
    curY += outputNode.h + pad;

    var svgH = curY;
    svg.setAttribute('viewBox', '0 0 ' + containerW + ' ' + svgH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.innerHTML = '';

    // --- Defs ---
    var defs = document.createElementNS(S, 'defs');
    var marker = document.createElementNS(S, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    var ap = document.createElementNS(S, 'path');
    ap.setAttribute('d', 'M0,0 L8,3 L0,6 Z');
    ap.setAttribute('fill', arrowColor);
    marker.appendChild(ap);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // --- Draw helpers ---
    function drawArrow(x1, y1, x2, y2) {
      var line = document.createElementNS(S, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', arrowColor);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(line);
    }

    function drawNode(n, isWhite) {
      var g = document.createElementNS(S, 'g');
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
      var rect = document.createElementNS(S, 'rect');
      rect.setAttribute('x', n.x); rect.setAttribute('y', n.y);
      rect.setAttribute('width', n.w); rect.setAttribute('height', n.h);
      rect.setAttribute('rx', nodeRx);
      rect.setAttribute('fill', n.color);
      g.appendChild(rect);

      var hasCount = n.count !== undefined;
      var txt = document.createElementNS(S, 'text');
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
        var ct = document.createElementNS(S, 'text');
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
    groups.forEach(function (g, gi) {
      // Group rect
      var grect = document.createElementNS(S, 'rect');
      grect.setAttribute('x', g.x); grect.setAttribute('y', g.y);
      grect.setAttribute('width', g.w); grect.setAttribute('height', g.h);
      grect.setAttribute('rx', groupRx);
      grect.setAttribute('fill', g.color);
      grect.setAttribute('stroke', g.borderColor);
      grect.setAttribute('stroke-width', '1.5');
      svg.appendChild(grect);

      // Group label
      var glabel = document.createElementNS(S, 'text');
      glabel.setAttribute('x', g.x + groupPad);
      glabel.setAttribute('y', g.y + 16);
      glabel.setAttribute('fill', '#6b7280');
      glabel.setAttribute('font-size', '11');
      glabel.setAttribute('font-weight', '500');
      glabel.setAttribute('font-family', font);
      glabel.textContent = g.label;
      svg.appendChild(glabel);

      // Children
      g.children.forEach(function (c) { drawNode(c, false); });

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
      skills: {
        ko: 'Skills는 사용자가 /명령어로 호출하는 재사용 가능한 프롬프트 템플릿입니다. skills/ 디렉토리 또는 플러그인을 통해 제공되며, 각 SKILL.md 파일의 frontmatter에 이름·설명·인자 힌트를 정의합니다. Skill 도구를 통해 대화 중 자동으로 호출될 수도 있습니다.',
        en: 'Skills are reusable prompt templates invoked via /commands. Provided from the skills/ directory or plugins, each SKILL.md defines name, description, and argument hints in its frontmatter. They can also be auto-invoked via the Skill tool during conversations.',
        docs: 'https://docs.anthropic.com/en/docs/claude-code/skills'
      },
      agents: {
        ko: 'Agents는 복잡한 작업을 자율적으로 수행하는 서브프로세스입니다. agents/ 디렉토리에 마크다운으로 정의하며, 모델(haiku/sonnet/opus), 사용 가능 도구, 전문 영역을 설정할 수 있습니다. Agent 도구로 디스패치되어 독립적인 컨텍스트에서 실행됩니다.',
        en: 'Agents are subprocesses that autonomously handle complex tasks. Defined as markdown in the agents/ directory, they specify model (haiku/sonnet/opus), available tools, and domain expertise. Dispatched via the Agent tool, they run in independent contexts.',
        docs: 'https://docs.anthropic.com/en/docs/claude-code/sub-agents'
      },
      rules: {
        ko: 'Rules는 Claude의 동작을 제어하는 지시 파일입니다. {{configDir}}/rules/ 디렉토리에 마크다운 파일로 저장되며, 모든 세션에서 자동으로 컨텍스트에 로드됩니다. CLAUDE.md와 달리 개별 파일로 분리하여 관심사를 구분할 수 있습니다.',
        en: 'Rules are instruction files that control Claude\'s behavior. Stored as markdown files in {{configDir}}/rules/, they are automatically loaded into context in every session. Unlike CLAUDE.md, they allow separation of concerns into individual files.'
      },
      principles: {
        ko: 'Principles는 Rules와 동일한 구조이나, 팀 전체에 적용되는 상위 원칙을 정의합니다. {{configDir}}/principles/ 디렉토리에 저장되며, 코드 작성 원칙, 리뷰 기준, 자동화 정책 등 반복적으로 참조해야 할 지침을 모아둡니다.',
        en: 'Principles share the same structure as Rules but define higher-level guidelines applied across the team. Stored in {{configDir}}/principles/, they collect reusable directives such as coding standards, review criteria, and automation policies.'
      },
      hooks: {
        ko: 'Hooks는 Claude Code의 특정 이벤트(도구 실행 전/후, 알림 등)에 자동으로 실행되는 셸 커맨드입니다. settings.json에 정의되며, 사용자가 직접 호출하지 않고 이벤트 기반으로 트리거됩니다.',
        en: 'Hooks are shell commands that run automatically on specific Claude Code events (pre/post tool use, notifications, etc.). Defined in settings.json, they are event-driven and not invoked manually.',
        docs: 'https://docs.anthropic.com/en/docs/claude-code/hooks'
      },
      memory: {
        ko: 'Memory는 대화 간 지속되는 파일 기반 기억 시스템입니다. user, feedback, project, reference 타입으로 구분되며, MEMORY.md가 인덱스 역할을 합니다. 모든 세션에서 자동 로드되어 맥락을 유지합니다.',
        en: 'Memory is a file-based persistence system across conversations. Organized by type (user, feedback, project, reference), with MEMORY.md as the index. Automatically loaded in every session to maintain context.',
        docs: 'https://docs.anthropic.com/en/docs/claude-code/memory'
      },
      mcpServers: {
        ko: 'MCP Servers는 Claude Code에 외부 도구를 연결하는 서버입니다. .claude.json에 정의되며, 브라우저 자동화, n8n 워크플로, Obsidian 등 다양한 외부 시스템과 통합할 수 있습니다.',
        en: 'MCP Servers connect external tools to Claude Code. Defined in .claude.json, they enable integration with browser automation, n8n workflows, Obsidian, and other external systems.',
        docs: 'https://docs.anthropic.com/en/docs/claude-code/mcp'
      },
      plugins: {
        ko: 'Plugins는 스킬, 에이전트, 훅을 묶어 배포하는 패키지입니다. 마켓플레이스에서 설치하거나 직접 만들 수 있으며, settings.json의 enabledPlugins로 활성화/비활성화를 제어합니다.',
        en: 'Plugins are packages bundling skills, agents, and hooks for distribution. Installable from marketplaces or custom-built, controlled via enabledPlugins in settings.json.',
        docs: 'https://docs.anthropic.com/en/docs/claude-code/plugins'
      },
      configFiles: {
        ko: '설정 파일은 Claude Code의 동작을 정의하는 핵심 파일들입니다. CLAUDE.md(프로젝트 지시), AGENTS.md(서브에이전트 지시), settings.json(공유 설정), settings.local.json(로컬 전용 설정)으로 구성됩니다.',
        en: 'Config files are core files defining Claude Code behavior. Includes CLAUDE.md (project instructions), AGENTS.md (subagent instructions), settings.json (shared config), and settings.local.json (local-only config).',
        docs: 'https://docs.anthropic.com/en/docs/claude-code/settings'
      }
    };
    const catDesc = CATEGORY_DESC[currentView];
    const catDescText = catDesc ? escapeHtml(catDesc[currentLang] || catDesc.en) : '';

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
    const ko = currentLang === 'ko';
    const CONFIG_DESC = {
        'settings.json': {
          ko: 'Claude Code의 공유 설정 파일입니다. hooks, 플러그인 활성화, 권한, 환경변수 등 하네스의 핵심 동작을 정의합니다. Git으로 추적되어 팀원 간 설정을 공유할 수 있습니다.',
          en: 'Shared configuration file for Claude Code. Defines core harness behavior including hooks, plugin activation, permissions, and environment variables. Tracked by Git for team-wide sharing.',
          docs: 'https://docs.anthropic.com/en/docs/claude-code/settings'
        },
        'settings.local.json': {
          ko: 'Git에 추적되지 않는 로컬 전용 설정 파일입니다. 개인 API 토큰, 로컬 환경에 특화된 경로, 디바이스별 설정 등 공유하지 않아야 할 설정을 저장합니다. settings.json과 동일한 구조이며, 동일 키가 있으면 이 파일의 값이 우선 적용됩니다.',
          en: 'Local-only configuration file, not tracked by Git. Stores settings that should not be shared: personal API tokens, local-specific paths, device-specific preferences. Same structure as settings.json — overlapping keys here take precedence.',
          docs: 'https://docs.anthropic.com/en/docs/claude-code/settings'
        },
        'CLAUDE.md': {
          ko: '프로젝트의 최상위 지시 파일입니다. 모든 세션에서 자동으로 컨텍스트에 로드되며, 코드 규칙, 작업 원칙, 프로젝트 구조 등을 정의합니다.',
          en: 'Top-level instruction file for the project. Automatically loaded into context in every session. Defines code conventions, work principles, and project structure.',
          docs: 'https://docs.anthropic.com/en/docs/claude-code/memory'
        },
        'AGENTS.md': {
          ko: '서브에이전트에 대한 추가 지시 파일입니다. Agent 도구로 생성된 서브에이전트의 동작을 커스터마이즈합니다.',
          en: 'Additional instruction file for subagents. Customizes the behavior of subagents spawned via the Agent tool.',
          docs: 'https://docs.anthropic.com/en/docs/claude-code/sub-agents'
        }
      };
      const descEntry = CONFIG_DESC[item.name];
      if (descEntry) {
        html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
          + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(descEntry[currentLang] || descEntry.en)
          + docsLinkHtml(descEntry.docs)
          + '</div></div>';
      }

    // JSON config file (settings.json, etc.)
    if (item.jsonContent) {
      const stats = item.jsonStats || {};
      const keys = item.jsonKeys || [];

      // Summary section
      const summaryParts = [];
      if (stats.hooks) summaryParts.push('hooks: ' + fmtNum(stats.hooks) + (ko ? '개 이벤트' : ' events'));
      if (stats.enabledPlugins) summaryParts.push('enabledPlugins: ' + fmtNum(stats.enabledPlugins));
      if (stats.permissions) summaryParts.push('permissions: ' + (ko ? '설정됨' : 'configured'));
      if (stats.env) summaryParts.push('env: ' + fmtNum(stats.env) + (ko ? '개 변수' : ' vars'));

      html += '<div class="section"><div class="section-title">' + (ko ? '구성 요약' : 'Summary') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">'
        + '<strong>' + (ko ? '최상위 키:' : 'Top-level keys:') + '</strong> ' + keys.map((k) => { return '<code>' + escapeHtml(k) + '</code>'; }).join(', ')
        + (summaryParts.length > 0 ? '<br>' + summaryParts.join(' · ') : '')
        + '</div></div>';

      // JSON code
      html += '<div class="section"><div class="section-title">' + (ko ? '전체 설정' : 'Full Configuration') + '</div>'
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

  const HOOK_DESCRIPTIONS = {
    ko: {
      PreToolUse: '도구가 실행되기 직전에 호출됩니다. 도구 실행을 허용/거부/수정할 수 있습니다.',
      PostToolUse: '도구가 성공적으로 실행된 후 호출됩니다. 결과를 검증하거나 후처리를 수행할 수 있습니다.',
      Notification: 'Claude가 사용자에게 알림을 보낼 때 호출됩니다. 알림 사운드 재생 등에 사용됩니다.',
      Stop: 'Claude의 응답이 완료된 후 호출됩니다. 추가 작업을 요청하거나 완료 알림을 보낼 수 있습니다.',
      SessionStart: '새 세션이 시작되거나 재개될 때 호출됩니다. 환경 초기화, 컨텍스트 주입에 사용됩니다.',
      UserPromptSubmit: '사용자가 프롬프트를 제출한 직후 호출됩니다. 프롬프트를 차단하거나 컨텍스트를 추가할 수 있습니다.',
      PostToolUseFailure: '도구 실행이 실패한 후 호출됩니다. 에러 처리나 복구 로직에 사용됩니다.',
      SubagentStop: '서브에이전트가 작업을 완료했을 때 호출됩니다. 결과를 검증하거나 계속 실행을 강제할 수 있습니다.',
      SessionEnd: '세션이 종료될 때 호출됩니다. 정리 작업이나 로깅에 사용됩니다.',
      InstructionsLoaded: 'CLAUDE.md와 rules 파일이 로드된 후 호출됩니다.',
      PermissionRequest: '권한 다이얼로그가 표시될 때 호출됩니다. 자동 허용/거부를 설정할 수 있습니다.',
      ConfigChange: '설정 파일이 변경될 때 호출됩니다.',
      PreCompact: '컨텍스트 압축이 시작되기 직전에 호출됩니다.',
      PostCompact: '컨텍스트 압축이 완료된 후 호출됩니다.',
    },
    en: {
      PreToolUse: 'Called just before a tool executes. Can allow, deny, or modify the tool call.',
      PostToolUse: 'Called after a tool completes successfully. Used for validation or post-processing.',
      Notification: 'Called when Claude sends a notification. Commonly used for notification sounds.',
      Stop: 'Called when Claude finishes responding. Can force continuation or trigger follow-up actions.',
      SessionStart: 'Called when a new session starts or resumes. Used for environment init and context injection.',
      UserPromptSubmit: 'Called right after user submits a prompt. Can block prompts or inject additional context.',
      PostToolUseFailure: 'Called after a tool execution fails. Used for error handling or recovery.',
      SubagentStop: 'Called when a subagent completes. Can validate results or force continued execution.',
      SessionEnd: 'Called when a session ends. Used for cleanup or logging.',
      InstructionsLoaded: 'Called after CLAUDE.md and rules files are loaded.',
      PermissionRequest: 'Called when a permission dialog is shown. Can auto-allow or deny.',
      ConfigChange: 'Called when a settings file changes.',
      PreCompact: 'Called just before context compaction begins.',
      PostCompact: 'Called after context compaction completes.',
    }
  };

  function renderHookDetail(item) {
    let html = '<div class="detail-meta">';
    if (item.event) html += metaCard('EVENT', item.event);
    if (item.type) html += metaCard('TYPE', item.type);
    if (item.commandCount > 1) html += metaCard('COMMANDS', item.commandCount);
    html += '</div>';

    // Hook event description
    const hookDesc = (HOOK_DESCRIPTIONS[currentLang] || HOOK_DESCRIPTIONS.ko)[item.event];
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
    const ko = currentLang === 'ko';
    if (item.filePath) {
      html += '<div class="file-path"><span class="file-path-label">' + t('configPathLabel') + '</span> ' + escapeHtml(item.filePath) + '</div>';
    }
    if (item.description) {
      html += '<div class="section"><div class="section-title">' + t('description') + '</div>'
        + '<div class="card" style="padding:16px;font-size:13px;color:var(--text-secondary)">' + escapeHtml(item.description) + '</div></div>';
    }
    html += '<div class="detail-meta">'
      + metaCard(ko ? '멤버' : 'Members', item.members || 0)
      + (item.leadAgentId ? metaCard('Lead', item.leadAgentId) : '')
      + (item.createdAt ? metaCard(ko ? '생성일' : 'Created', formatDateTime(item.createdAt)) : '')
      + '</div>';
    // Member list
    if (item.memberList && item.memberList.length > 0) {
      html += '<div class="section"><div class="section-title">' + (ko ? '멤버 목록' : 'Member List') + '</div>'
        + '<div class="card" style="padding:0;overflow:hidden">'
        + '<div class="recent-item" style="background:var(--hover);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);cursor:default;border-bottom:1px solid var(--border)">'
        + '<span class="ri-icon" style="visibility:hidden">🤖</span>'
        + '<span class="ri-name">' + (ko ? '이름' : 'Name') + '</span>'
        + '<span class="ri-time" style="flex:2">' + (ko ? '역할' : 'Role') + '</span>'
        + '<span style="font-size:11px">' + (ko ? '모델' : 'Model') + '</span>'
        + '</div>'
        + '<div class="recent-list" style="margin:0">';
      item.memberList.forEach(function (m, idx) {
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
    const ko = currentLang === 'ko';
    html += '<div class="detail-meta">'
      + metaCard(ko ? '전체' : 'Total', item.total || 0)
      + metaCard(ko ? '진행중' : 'Pending', item.pending || 0)
      + metaCard(ko ? '완료' : 'Completed', item.completed || 0)
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
    content.querySelectorAll('.team-member-toggle').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = el.dataset.memberIdx;
        var detail = document.getElementById('team-member-' + idx);
        var chevron = el.querySelector('.chevron');
        if (detail) {
          var open = detail.style.display !== 'none';
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
    const ko = currentLang === 'ko';
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = '<span>' + (ko
      ? '⚡ 새로운 데이터가 감지되었습니다. 페이지를 새로고침하면 최신 데이터를 확인할 수 있습니다.'
      : '⚡ New data detected. Refresh the page to see the latest data.')
      + '</span>'
      + '<button onclick="location.reload()">' + (ko ? '새로고침' : 'Refresh') + '</button>'
      + '<button onclick="this.parentElement.remove()">✕</button>';
    document.body.prepend(banner);
  }

  // ── Boot ──
  init();
  checkDataVersion();
