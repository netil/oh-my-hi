// Model pricing: the one source for the browser (inlined before app.js by the
// build) and for Node (scripts/export.mjs, scripts/digest.mjs).
//
// Prices are USD per 1M tokens. The build fetches current Claude prices from
// the Anthropic pricing page (DATA.modelPricing) and overlays them on this
// table; the table is the fallback when that fetch fails, and the only source
// for OpenAI/Codex models. cacheCreation = 5-minute cache write, cacheRead =
// cache hit. Claude 5 values taken from the pricing page on 2026-10-23.
export const PRICING_FALLBACK = {
  'fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheCreation: 12.5 },
  'mythos-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheCreation: 12.5 },
  'fable-5': { input: 10, output: 50, cacheRead: 1, cacheCreation: 12.5 },
  'mythos-5': { input: 10, output: 50, cacheRead: 1, cacheCreation: 12.5 },
  'opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheCreation: 5 },
  'opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
  'sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheCreation: 2.5 },
  // Haiku 5.5 is tiered by prompt size; this is the tier for prompts up to 100K tokens.
  'haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheCreation: 0.125 },
  'opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
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
  // OpenAI / Codex. Cached input = 10% of input; Codex has no cache-creation
  // concept, so cacheCreation is 0 (Codex entries never set it).
  'gpt-5.5': { input: 5, output: 30, cacheRead: 0.5, cacheCreation: 0 },
  'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0.25, cacheCreation: 0 },
  'gpt-5.1': { input: 0.63, output: 5, cacheRead: 0.063, cacheCreation: 0 },
  'gpt-5.3-codex': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreation: 0 },
  'gpt-5.2-codex': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreation: 0 },
  'gpt-5.1-codex': { input: 1.25, output: 10, cacheRead: 0.125, cacheCreation: 0 },
  'gpt-5.1-codex-mini': { input: 0.25, output: 2, cacheRead: 0.025, cacheCreation: 0 },
};

/**
 * Resolve a raw model id ('claude-opus-5-5', 'claude-haiku-4-5-20251001',
 * 'gpt-5.5') to a key of `pricing`: exact id first, then family-major-minor,
 * then family-major. Returns null when the model has no price.
 */
export function pricingKeyFor(model, pricing) {
  if (!model || model === 'unknown') return null;
  const s = model.replace(/^claude-/, '').replace(/-\d{8,}$/, '');
  if (pricing[s]) return s;
  const m = s.match(/^(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?$/);
  if (m) {
    if (m[3]) {
      const withMinor = m[1] + '-' + m[2] + '-' + m[3];
      if (pricing[withMinor]) return withMinor;
    }
    const base = m[1] + '-' + m[2];
    if (pricing[base]) return base;
  }
  return null;
}

/** Estimated USD cost of one token entry. 0 when the model has no price. */
export function entryCost(entry, pricing) {
  const key = pricingKeyFor(entry.model, pricing);
  if (!key) return 0;
  const p = pricing[key];
  return ((entry.rawInput || 0) * p.input
    + (entry.outputTokens || 0) * p.output
    + (entry.cacheRead || 0) * p.cacheRead
    + (entry.cacheCreation || 0) * p.cacheCreation) / 1e6;
}
