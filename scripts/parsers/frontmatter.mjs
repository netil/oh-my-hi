// @ts-check
// frontmatter.mjs — YAML frontmatter parser (no dependencies)
import fs from 'fs';

/**
 * Separate frontmatter and body from a markdown file
 * @param {string} filePath
 * @returns {{ meta: Record<string, any>, body: string, raw: string }}
 */
export function parseFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw, raw };

  const meta = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // YAML block scalar (`|`, `>`, with optional chomping/indent indicators):
    // the value is the following more-indented (or blank) lines.
    const block = value.match(/^([|>])([+-]?)\d*([+-]?)$/);
    if (block) {
      const keyIndent = line.length - line.trimStart().length;
      const body = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.trim() !== '' && next.length - next.trimStart().length <= keyIndent) break;
        body.push(next);
        i++;
      }
      meta[key] = blockScalar(body, block[1], block[2] || block[3]);
      continue;
    }
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    meta[key] = value;
  }

  return { meta, body: match[2], raw };
}

/**
 * Build a YAML block scalar value from its raw content lines.
 * @param {string[]} lines - lines after the `key: |` line (still indented)
 * @param {string} style - '|' literal (keep newlines) or '>' folded (join with spaces)
 * @param {string} chomp - '' clip (one trailing newline), '-' strip, '+' keep
 * @returns {string}
 */
function blockScalar(lines, style, chomp) {
  const indents = lines.filter(l => l.trim() !== '').map(l => l.length - l.trimStart().length);
  const indent = indents.length ? Math.min(...indents) : 0;
  const content = lines.map(l => l.slice(indent).trimEnd());
  // Separate trailing blank lines so chomping can decide what to keep.
  let end = content.length;
  while (end > 0 && content[end - 1] === '') end--;
  const text = content.slice(0, end);
  const trailing = content.length - end;

  let value;
  if (style === '|') {
    value = text.join('\n');
  } else {
    // Folded: single line breaks become spaces, blank lines become newlines.
    value = '';
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '') { value += '\n'; continue; }
      if (i > 0 && text[i - 1] !== '') value += ' ';
      value += text[i];
    }
  }
  if (!text.length) return '';
  if (chomp === '-') return value;
  if (chomp === '+') return value + '\n'.repeat(trailing + 1);
  return value + '\n';
}

/**
 * Batch-parse multiple markdown files
 * @param {string[]} filePaths
 * @returns {Array<{ path: string, meta: Record<string, any>, body: string }>}
 */
export function parseMultiple(filePaths) {
  return filePaths.map(fp => {
    try {
      const { meta, body } = parseFrontmatter(fp);
      return { path: fp, meta, body };
    } catch {
      return { path: fp, meta: {}, body: '' };
    }
  });
}
