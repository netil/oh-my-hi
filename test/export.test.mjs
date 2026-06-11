import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const {
  csvEscape, toCsv, buildExportRows, parseDateParam, exportFilename,
  EXPORT_COLUMNS, PRICING_FALLBACK,
} = await import(`file://${path.join(ROOT, 'scripts/export.mjs')}`);

describe('export.mjs — CSV escaping', () => {
  it('should pass plain values through unchanged', () => {
    assert.strictEqual(csvEscape('claude-sonnet-4'), 'claude-sonnet-4');
    assert.strictEqual(csvEscape(12345), '12345');
    assert.strictEqual(csvEscape(0.018), '0.018');
  });

  it('should return empty string for null/undefined', () => {
    assert.strictEqual(csvEscape(null), '');
    assert.strictEqual(csvEscape(undefined), '');
  });

  it('should quote values containing commas', () => {
    assert.strictEqual(csvEscape('a,b'), '"a,b"');
  });

  it('should double embedded quotes and wrap in quotes', () => {
    assert.strictEqual(csvEscape('say "hi"'), '"say ""hi"""');
  });

  it('should quote values containing newlines (LF and CRLF)', () => {
    assert.strictEqual(csvEscape('line1\nline2'), '"line1\nline2"');
    assert.strictEqual(csvEscape('line1\r\nline2'), '"line1\r\nline2"');
  });
});

describe('export.mjs — toCsv', () => {
  it('should emit the header row first', () => {
    const csv = toCsv([]);
    assert.strictEqual(csv.split('\r\n')[0], EXPORT_COLUMNS.join(','));
  });

  it('should end with a trailing CRLF', () => {
    assert.ok(toCsv([]).endsWith('\r\n'));
  });

  it('should emit one line per row in column order', () => {
    const rows = buildExportRows([
      { timestamp: 1700000000000, model: 'claude-sonnet-4-20250514', rawInput: 10, outputTokens: 20, cacheRead: 30, cacheCreation: 40, sessionId: 's1', context: 'skill', contextName: 'omh' },
    ], 'global');
    const lines = toCsv(rows).trimEnd().split('\r\n');
    assert.strictEqual(lines.length, 2);
    const fields = lines[1].split(',');
    assert.strictEqual(fields.length, EXPORT_COLUMNS.length);
    assert.strictEqual(fields[EXPORT_COLUMNS.indexOf('scope')], 'global');
    assert.strictEqual(fields[EXPORT_COLUMNS.indexOf('inputTokens')], '10');
    assert.strictEqual(fields[EXPORT_COLUMNS.indexOf('cacheWrite')], '40');
  });

  it('should escape tricky values so the row stays one logical record', () => {
    const rows = buildExportRows([
      { timestamp: 1700000000000, model: 'm', contextName: 'evil,"name"\nx', rawInput: 1 },
    ], 'global');
    const csv = toCsv(rows);
    assert.ok(csv.includes('"evil,""name""\nx"'), 'context name must be quoted with doubled quotes');
    // Header + 1 record; the embedded LF must not start a new CRLF-record
    assert.strictEqual(csv.split('\r\n').filter(Boolean).length, 2);
  });
});

describe('export.mjs — buildExportRows', () => {
  it('should compute cost from the fallback pricing table', () => {
    const rows = buildExportRows([
      { timestamp: 1700000000000, model: 'claude-sonnet-4-20250514', rawInput: 1000, outputTokens: 1000, cacheRead: 0, cacheCreation: 0 },
    ], 'global', PRICING_FALLBACK);
    // (1000*3 + 1000*15) / 1e6 = 0.018
    assert.strictEqual(rows[0].cost, 0.018);
  });

  it('should produce ISO timestamps and map cacheCreation → cacheWrite', () => {
    const rows = buildExportRows([
      { timestamp: 1700000000000, model: 'unknown', cacheCreation: 7 },
    ], 'proj-a');
    assert.strictEqual(rows[0].timestamp, new Date(1700000000000).toISOString());
    assert.strictEqual(rows[0].cacheWrite, 7);
    assert.strictEqual(rows[0].scope, 'proj-a');
    assert.strictEqual(rows[0].cost, 0, 'unknown model has no pricing');
  });
});

describe('export.mjs — parseDateParam', () => {
  it('should parse YYYY-MM-DD as UTC start of day', () => {
    assert.strictEqual(parseDateParam('2026-01-15'), Date.UTC(2026, 0, 15));
  });

  it('should parse YYYY-MM-DD with endOfDay as inclusive end of day', () => {
    assert.strictEqual(parseDateParam('2026-01-15', true), Date.UTC(2026, 0, 16) - 1);
  });

  it('should parse epoch ms strings', () => {
    assert.strictEqual(parseDateParam('1700000000000'), 1700000000000);
  });

  it('should return null for missing or invalid input', () => {
    assert.strictEqual(parseDateParam(null), null);
    assert.strictEqual(parseDateParam(''), null);
    assert.strictEqual(parseDateParam('not-a-date'), null);
    assert.strictEqual(parseDateParam('2026/01/15'), null);
  });
});

describe('export.mjs — exportFilename', () => {
  it('should match oh-my-hi-usage-YYYYMMDD.{format}', () => {
    const name = exportFilename('csv', new Date(2026, 5, 11));
    assert.strictEqual(name, 'oh-my-hi-usage-20260611.csv');
    assert.match(exportFilename('json'), /^oh-my-hi-usage-\d{8}\.json$/);
  });
});
