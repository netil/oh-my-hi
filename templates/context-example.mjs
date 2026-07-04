// context-example.mjs — static data for the Context Explorer "Example session"
// mode. Extracted from templates/app.js so that (a) the huge renderer function
// isn't buried under 60+ lines of inline literals and (b) the dataset can be
// updated without touching renderer logic.
//
// Build integration: the generator strips `export ` and prepends the file
// into the app.js bundle so these identifiers resolve as module-scope
// constants. Source of truth lives here — don't edit the inlined copy.
//
// Schema reminder:
//   EXAMPLE_EVENTS: 36 scripted events of a simulated Claude Code session.
//     id           — stable identifier used by i18n label keys (cwe_evN_label)
//     t            — 0..1 position on the timeline
//     kind         — badge category (auto|user|claude|hook|compact|sub)
//     tokens       — delta tokens contributed by this step
//     color        — hex color for the bar segment
//     vis          — terminal visibility tier (hidden|brief|full)
//     link         — optional docs link
//     statKey      — optional scopeData.contextStats key to substitute the
//                    scripted value with a live measurement
//     noSurviveCompact, hasTip, subTokens, subStat — per-event flags
//
//   EXAMPLE_GATES: pedagogical pauses — the animation stops at `at`, waits for
//   the user to resume, then jumps to `resumeTo`. Gate text is i18n via gateKey.
//
//   KIND_META: badge styling + i18n keys per `kind`.

export const EXAMPLE_EVENTS = [
  { id: 1,  t: 0.015, kind: 'auto',   tokens: 4200, color: '#6B6964', vis: 'hidden', link: null },
  { id: 2,  t: 0.035, kind: 'auto',   tokens: 680,  color: '#E8A45C', vis: 'hidden', statKey: 'autoMemoryTokens',  link: 'https://code.claude.com/docs/en/memory#auto-memory' },
  { id: 3,  t: 0.06,  kind: 'auto',   tokens: 280,  color: '#6B6964', vis: 'hidden', link: null },
  { id: 4,  t: 0.08,  kind: 'auto',   tokens: 120,  color: '#9B7BC4', vis: 'hidden', statKey: 'mcpToolsTokens',    link: 'https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search' },
  { id: 5,  t: 0.10,  kind: 'auto',   tokens: 450,  color: '#D4A843', vis: 'hidden', statKey: 'skillsDescTokens',  noSurviveCompact: true, link: 'https://code.claude.com/docs/en/skills' },
  { id: 6,  t: 0.12,  kind: 'auto',   tokens: 320,  color: '#6A9BCC', vis: 'hidden', statKey: 'globalClaudeTokens',link: 'https://code.claude.com/docs/en/memory#choose-where-to-put-claude-md-files' },
  { id: 7,  t: 0.14,  kind: 'auto',   tokens: 1800, color: '#6A9BCC', vis: 'hidden', statKey: 'projectClaudeTokens', hasTip: true, link: 'https://code.claude.com/docs/en/memory' },
  { id: 8,  t: 0.22,  kind: 'user',   tokens: 45,   color: '#558A42', vis: 'full',   link: null },
  { id: 9,  t: 0.28,  kind: 'claude', tokens: 2400, color: '#8A8880', vis: 'brief',  hasTip: true, link: null },
  { id: 10, t: 0.32,  kind: 'claude', tokens: 1100, color: '#8A8880', vis: 'brief',  link: null },
  { id: 11, t: 0.35,  kind: 'auto',   tokens: 380,  color: '#4A9B8E', vis: 'brief',  link: 'https://code.claude.com/docs/en/memory#path-specific-rules' },
  { id: 12, t: 0.38,  kind: 'claude', tokens: 1800, color: '#8A8880', vis: 'brief',  link: null },
  { id: 13, t: 0.41,  kind: 'claude', tokens: 1600, color: '#8A8880', vis: 'brief',  link: null },
  { id: 14, t: 0.44,  kind: 'auto',   tokens: 290,  color: '#4A9B8E', vis: 'brief',  link: 'https://code.claude.com/docs/en/memory#path-specific-rules' },
  { id: 15, t: 0.47,  kind: 'claude', tokens: 600,  color: '#A09E96', vis: 'brief',  link: null },
  { id: 16, t: 0.53,  kind: 'claude', tokens: 800,  color: '#D97757', vis: 'full',   link: null },
  { id: 17, t: 0.57,  kind: 'claude', tokens: 400,  color: '#D97757', vis: 'full',   link: null },
  { id: 18, t: 0.59,  kind: 'hook',   tokens: 120,  color: '#B8860B', vis: 'hidden', hasTip: true, link: 'https://code.claude.com/docs/en/hooks-guide' },
  { id: 19, t: 0.62,  kind: 'claude', tokens: 600,  color: '#D97757', vis: 'full',   link: null },
  { id: 20, t: 0.64,  kind: 'hook',   tokens: 100,  color: '#B8860B', vis: 'hidden', link: 'https://code.claude.com/docs/en/hooks-guide' },
  { id: 21, t: 0.67,  kind: 'claude', tokens: 1200, color: '#A09E96', vis: 'brief',  link: null },
  { id: 22, t: 0.70,  kind: 'claude', tokens: 400,  color: '#D97757', vis: 'full',   link: null },
  { id: 23, t: 0.72,  kind: 'user',   tokens: 40,   color: '#558A42', vis: 'full',   hasTip: true, link: null },
  { id: 24, t: 0.79,  kind: 'claude', tokens: 80,   color: '#D97757', vis: 'brief',  link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 25, t: 0.795, kind: 'sub',    tokens: 0, subTokens: 900,  color: '#6B6964', vis: 'hidden', link: 'https://code.claude.com/docs/en/sub-agents#enable-persistent-memory' },
  { id: 26, t: 0.80,  kind: 'sub',    tokens: 0, subTokens: 1800, color: '#6A9BCC', vis: 'hidden', statKey: 'projectClaudeTokens', subStat: true, link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 27, t: 0.805, kind: 'sub',    tokens: 0, subTokens: 970,  color: '#9B7BC4', vis: 'hidden', statKey: 'mcpPlusSkills',       subStat: true, link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 28, t: 0.81,  kind: 'sub',    tokens: 0, subTokens: 120,  color: '#558A42', vis: 'hidden', link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 29, t: 0.82,  kind: 'sub',    tokens: 0, subTokens: 2200, color: '#8A8880', vis: 'hidden', link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 30, t: 0.825, kind: 'sub',    tokens: 0, subTokens: 800,  color: '#8A8880', vis: 'hidden', link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 31, t: 0.83,  kind: 'sub',    tokens: 0, subTokens: 3100, color: '#8A8880', vis: 'hidden', link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 32, t: 0.85,  kind: 'claude', tokens: 420, color: '#D97757', vis: 'brief',   link: 'https://code.claude.com/docs/en/sub-agents' },
  { id: 33, t: 0.86,  kind: 'claude', tokens: 1200, color: '#D97757', vis: 'full',   link: null },
  { id: 34, t: 0.875, kind: 'user',   tokens: 180, color: '#558A42', vis: 'full',    link: 'https://code.claude.com/docs/en/interactive-mode#bash-mode-with-prefix' },
  { id: 35, t: 0.89,  kind: 'user',   tokens: 620, color: '#558A42', vis: 'brief',   hasTip: true, link: 'https://code.claude.com/docs/en/skills#control-who-invokes-a-skill' },
  { id: 36, t: 0.93,  kind: 'compact',tokens: 0,   color: '#D97757', vis: 'brief',   link: 'https://code.claude.com/docs/en/how-claude-code-works#the-context-window' }
];

export const EXAMPLE_GATES = [
  { at: 0.18,  kind: 'prompt',  gateKey: 'cwe_gate1', resumeTo: 0.22 },
  { at: 0.705, kind: 'prompt',  gateKey: 'cwe_gate2', resumeTo: 0.72 },
  { at: 0.865, kind: 'bang',    gateKey: 'cwe_gate3', resumeTo: 0.875 },
  { at: 0.88,  kind: 'slash',   gateKey: 'cwe_gate4', resumeTo: 0.89 },
  { at: 0.90,  kind: 'compact', gateKey: 'cwe_gate5', resumeTo: 1 }
];

export const KIND_META = {
  auto:    { badgeKey: 'cwe_kindAuto',    detailKey: 'cwe_kindAutoDetail',    badgeBg: 'rgba(94,93,89,0.15)',  badgeColor: '#8A8880' },
  user:    { badgeKey: 'cwe_kindUser',    detailKey: 'cwe_kindUserDetail',    badgeBg: 'rgba(85,138,66,0.15)', badgeColor: '#6BA656' },
  claude:  { badgeKey: 'cwe_kindClaude',  detailKey: 'cwe_kindClaudeDetail',  badgeBg: 'rgba(217,119,87,0.12)',badgeColor: '#D97757' },
  codex:   { badgeKey: 'cwe_kindCodex',   detailKey: 'cwe_kindCodexDetail',   badgeBg: 'rgba(16,163,127,0.12)',badgeColor: '#10a37f' },
  hook:    { badgeKey: 'cwe_kindHook',    detailKey: 'cwe_kindHookDetail',    badgeBg: 'rgba(184,134,11,0.15)',badgeColor: '#CCA020' },
  compact: { badgeKey: 'cwe_kindCompact', detailKey: 'cwe_kindCompactDetail', badgeBg: 'rgba(217,119,87,0.12)',badgeColor: '#D97757' },
  sub:     { badgeKey: 'cwe_kindSub',     detailKey: 'cwe_kindSubDetail',     badgeBg: 'rgba(155,123,196,0.12)',badgeColor: '#9B7BC4' },
  // Session-mode kinds — distinct badges so skill/mcp/tool/agent aren't mislabeled as "claude".
  skill:   { badgeKey: 'cwe_kindSkill',   detailKey: 'cwe_kindSkillDetail',   badgeBg: 'rgba(212,168,67,0.15)', badgeColor: '#B8890B' },
  mcp:     { badgeKey: 'cwe_kindMcp',     detailKey: 'cwe_kindMcpDetail',     badgeBg: 'rgba(155,123,196,0.12)',badgeColor: '#9B7BC4' },
  agent:   { badgeKey: 'cwe_kindAgent',   detailKey: 'cwe_kindAgentDetail',   badgeBg: 'rgba(155,123,196,0.12)',badgeColor: '#9B7BC4' },
  tool:    { badgeKey: 'cwe_kindTool',    detailKey: 'cwe_kindToolDetail',    badgeBg: 'rgba(138,136,128,0.15)',badgeColor: '#6E6C64' }
};
