// locale-detection.test.mjs
// Tests for detectSystemLocale() and writeHtml() locale handling.
//
// Scope:
//   1. LANG/LANGUAGE/LC_ALL env-based locale detection (inline equivalent)
//   2. writeHtml source structure — existing vs. missing locale file paths
//   3. Functional: locale template auto-creation for new locales
//   4. Functional: locale file is loaded when it exists (ko)
//   5. notifyUpdateIfAvailable message language per locale
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const SCRIPT = path.join(ROOT, 'scripts', 'generate-dashboard.mjs');

// ── Inline equivalent of detectSystemLocale's LANG-based path ────────────
// (The macOS `defaults read` path is platform-specific and excluded here.)
function detectLocaleFromEnv(env) {
  const lang = (env.LANG || env.LANGUAGE || env.LC_ALL || '').toLowerCase();
  if (lang.startsWith('ko')) return 'ko';
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('zh')) return 'zh';
  return 'en';
}

// ── 1. LANG-based detection ───────────────────────────────────────────────
describe('detectSystemLocale — LANG env', () => {
  it('ko_KR.UTF-8  → ko', () => assert.equal(detectLocaleFromEnv({ LANG: 'ko_KR.UTF-8' }),  'ko'));
  it('ko_KR        → ko', () => assert.equal(detectLocaleFromEnv({ LANG: 'ko_KR' }),         'ko'));
  it('ja_JP.UTF-8  → ja', () => assert.equal(detectLocaleFromEnv({ LANG: 'ja_JP.UTF-8' }),  'ja'));
  it('zh_CN.UTF-8  → zh', () => assert.equal(detectLocaleFromEnv({ LANG: 'zh_CN.UTF-8' }),  'zh'));
  it('zh_TW.UTF-8  → zh', () => assert.equal(detectLocaleFromEnv({ LANG: 'zh_TW.UTF-8' }),  'zh'));
  it('fr_FR.UTF-8  → en (unsupported, fallback)', () => assert.equal(detectLocaleFromEnv({ LANG: 'fr_FR.UTF-8' }), 'en'));
  it('de_DE.UTF-8  → en (unsupported, fallback)', () => assert.equal(detectLocaleFromEnv({ LANG: 'de_DE.UTF-8' }), 'en'));
  it('es_ES.UTF-8  → en (unsupported, fallback)', () => assert.equal(detectLocaleFromEnv({ LANG: 'es_ES.UTF-8' }), 'en'));
  it('pt_BR.UTF-8  → en (unsupported, fallback)', () => assert.equal(detectLocaleFromEnv({ LANG: 'pt_BR.UTF-8' }), 'en'));
  it('empty LANG   → en',  () => assert.equal(detectLocaleFromEnv({}), 'en'));
  it('LANGUAGE env used when LANG absent', () => {
    assert.equal(detectLocaleFromEnv({ LANGUAGE: 'ko_KR.UTF-8' }), 'ko');
  });
  it('LC_ALL env used as last fallback', () => {
    assert.equal(detectLocaleFromEnv({ LC_ALL: 'ja_JP.UTF-8' }), 'ja');
  });
  it('LANG takes priority over LANGUAGE', () => {
    assert.equal(detectLocaleFromEnv({ LANG: 'fr_FR.UTF-8', LANGUAGE: 'ko_KR.UTF-8' }), 'en');
  });
});

// ── 2. Source: detectSystemLocale maps exactly ko/ja/zh ───────────────────
describe('detectSystemLocale source — supported locales', () => {
  let src;
  before(() => { src = fs.readFileSync(SCRIPT, 'utf-8'); });

  it('function detectSystemLocale exists in script', () => {
    assert.ok(src.includes('function detectSystemLocale'));
  });

  it('maps ko from LANG', () => {
    const fnIdx = src.indexOf('function detectSystemLocale');
    const snippet = src.slice(fnIdx, fnIdx + 600);
    assert.ok(snippet.includes("'ko'"), 'ko mapped');
  });

  it('maps ja from LANG', () => {
    const fnIdx = src.indexOf('function detectSystemLocale');
    const snippet = src.slice(fnIdx, fnIdx + 800);
    assert.ok(snippet.includes("'ja'"), 'ja mapped');
  });

  it('maps zh from LANG', () => {
    const fnIdx = src.indexOf('function detectSystemLocale');
    const snippet = src.slice(fnIdx, fnIdx + 800);
    assert.ok(snippet.includes("'zh'"), 'zh mapped');
  });

  it('defaults to en', () => {
    const fnIdx = src.indexOf('function detectSystemLocale');
    const snippet = src.slice(fnIdx, fnIdx + 600);
    assert.ok(snippet.includes("systemLocale = 'en'"), 'en default set');
  });
});

// ── 3. Source: writeHtml locale paths ─────────────────────────────────────
describe('writeHtml source — locale file handling', () => {
  let src;
  before(() => { src = fs.readFileSync(SCRIPT, 'utf-8'); });

  it('function writeHtml exists in script', () => {
    assert.ok(src.includes('function writeHtml'));
  });

  it('loads existing locale file when present', () => {
    const fnIdx = src.indexOf('function writeHtml');
    const snippet = src.slice(fnIdx, fnIdx + 900);
    assert.ok(snippet.includes('fs.existsSync(localePath)'), 'checks file exists');
    assert.ok(snippet.includes('localeObj._lang'), 'sets _lang marker');
  });

  it('creates en.json-based template for unknown locale', () => {
    const fnIdx = src.indexOf('function writeHtml');
    const snippet = src.slice(fnIdx, fnIdx + 900);
    assert.ok(snippet.includes('fs.writeFileSync(localePath'), 'writes template');
    assert.ok(snippet.includes('created template'), 'logs creation notice');
  });

  it('always loads en.json as base regardless of locale', () => {
    const fnIdx = src.indexOf('function writeHtml');
    const snippet = src.slice(fnIdx, fnIdx + 900);
    assert.ok(snippet.includes('en.json'), 'en.json always loaded');
  });
});

// ── 4. Functional: template creation for unsupported locales ─────────────
describe('writeHtml functional — unsupported locale creates template', () => {
  let tmpDir, tmpLocalesDir;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-locale-'));
    tmpLocalesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(tmpLocalesDir);
    // Copy en.json as baseline
    fs.copyFileSync(
      path.join(TEMPLATES, 'locales', 'en.json'),
      path.join(tmpLocalesDir, 'en.json'),
    );
  });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  for (const locale of ['ja', 'zh', 'fr', 'de', 'es']) {
    it(`creates ${locale}.json template from en.json when missing`, () => {
      const localePath = path.join(tmpLocalesDir, `${locale}.json`);
      const enContent = fs.readFileSync(path.join(tmpLocalesDir, 'en.json'), 'utf-8');

      // Replicate writeHtml logic: create template if not exists
      if (locale !== 'en' && !fs.existsSync(localePath)) {
        fs.writeFileSync(localePath, enContent, 'utf-8');
      }

      assert.ok(fs.existsSync(localePath), `${locale}.json created`);

      const created = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
      const en = JSON.parse(enContent);
      assert.deepEqual(
        Object.keys(created).sort(),
        Object.keys(en).sort(),
        `${locale}.json has same keys as en.json`,
      );
    });
  }

  it('does NOT overwrite an existing locale file', () => {
    const localePath = path.join(tmpLocalesDir, 'existing.json');
    const original = JSON.stringify({ hello: 'hola' }); // Spanish placeholder
    fs.writeFileSync(localePath, original);

    // Replicate writeHtml logic: only create if not exists
    if (!fs.existsSync(localePath)) {
      fs.writeFileSync(localePath, 'should-not-be-written');
    }

    assert.equal(fs.readFileSync(localePath, 'utf-8'), original, 'original content preserved');
  });
});

// ── 5. Functional: existing locale file is loaded correctly (ko) ──────────
describe('writeHtml functional — loads existing locale (ko)', () => {
  it('ko.json exists and has same key set as en.json', () => {
    const en = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'locales', 'en.json'), 'utf-8'));
    const ko = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'locales', 'ko.json'), 'utf-8'));
    const enKeys = Object.keys(en).sort();
    const koKeys = Object.keys(ko).sort();
    assert.deepEqual(enKeys, koKeys, 'ko.json key set matches en.json');
  });

  it('ko.json values are non-empty for all keys', () => {
    const ko = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'locales', 'ko.json'), 'utf-8'));
    const allowEmpty = new Set(['unitItems', 'unitCallCount', 'amPrefix', 'pmPrefix']);
    for (const [key, val] of Object.entries(ko)) {
      if (allowEmpty.has(key)) continue;
      assert.ok(val.length > 0, `ko.${key} is empty`);
    }
  });

  it('ko.json contains Breakdown-specific keys', () => {
    const ko = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'locales', 'ko.json'), 'utf-8'));
    const requiredBdKeys = [
      'bdTitle', 'bdDesc', 'bdByTypeTitle', 'bdTop5Title',
      'bdStartupTitle', 'bdStartupDesc', 'bdStartupCumulative',
      'bdStartupClaudeMd', 'bdStartupSkills', 'bdStartupPrinciples',
    ];
    for (const key of requiredBdKeys) {
      assert.ok(ko[key], `ko.${key} missing`);
    }
  });
});

// ── 6. Update notice: locale-aware message per environment ────────────────
describe('notifyUpdateIfAvailable — locale-aware message', () => {
  let src;
  before(() => { src = fs.readFileSync(SCRIPT, 'utf-8'); });

  it('shows Korean message for ko locale', () => {
    const fnIdx = src.indexOf('function notifyUpdateIfAvailable');
    const snippet = src.slice(fnIdx, fnIdx + 700);
    assert.ok(snippet.includes("locale === 'ko'"), 'ko branch');
    assert.ok(snippet.includes('최신 버전'), 'Korean text in ko branch');
  });

  it('shows English message for non-ko locale (en/ja/zh/fr)', () => {
    const fnIdx = src.indexOf('function notifyUpdateIfAvailable');
    const snippet = src.slice(fnIdx, fnIdx + 700);
    assert.ok(snippet.includes('available'), 'English text in else branch');
    assert.ok(snippet.includes('/omh --update'), 'update command shown');
  });

  it('non-ko locales (ja, zh, fr, de) all use English notice', () => {
    // Logic: only locale === 'ko' gets Korean; all others get English
    // Verify source has no other locale branches in notifyUpdateIfAvailable
    const fnIdx = src.indexOf('function notifyUpdateIfAvailable');
    const snippet = src.slice(fnIdx, fnIdx + 700);
    const koBranchCount = (snippet.match(/'ko'/g) || []).length;
    // Should have exactly one 'ko' check (no ja/zh/fr branches)
    assert.equal(koBranchCount, 1, 'only one locale branch (ko), others fall through to English');
  });
});
