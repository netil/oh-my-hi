// lint.test.mjs — unit tests for harness health checks (parsers/lint.mjs).
// Uses isolated temp dirs as synthetic fixtures so the tests don't depend on
// the developer's real ~/.claude state.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  checkHookPaths,
  checkSkillFrontmatter,
  checkMemoryLinks,
  extractPathCandidates,
  lintScope,
} from '../scripts/parsers/lint.mjs';
import { parseSkills } from '../scripts/parsers/skills.mjs';

function makeTmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `omh-lint-${label}-`));
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// --- checkHookPaths ----------------------------------------------------------

describe('lint/checkHookPaths', () => {
  let tmp;
  let opts;
  before(() => {
    tmp = makeTmpDir('hooks');
    write(path.join(tmp, 'scripts', 'exists.sh'), '#!/bin/sh\n');
    opts = {
      settingsPath: path.join(tmp, 'settings.json'),
      claudeConfigDir: tmp,
      home: tmp,
    };
  });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const hook = (command, event = 'Stop') => ({ event, matcher: '*', command });

  it('flags an absolute script path that does not exist', () => {
    const missing = path.join(tmp, 'scripts', 'gone.sh');
    const warnings = checkHookPaths([hook(`bash "${missing}"`)], opts);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'hookPathMissing');
    assert.equal(warnings[0].category, 'hooks');
    assert.equal(warnings[0].file, opts.settingsPath);
    assert.deepEqual(warnings[0].args, ['Stop', missing]);
  });

  it('does not flag existing paths', () => {
    const existing = path.join(tmp, 'scripts', 'exists.sh');
    assert.equal(checkHookPaths([hook(`bash "${existing}" --flag`)], opts).length, 0);
  });

  it('expands $CLAUDE_CONFIG_DIR, ${CLAUDE_CONFIG_DIR}, $HOME and ~', () => {
    assert.equal(checkHookPaths([hook('bash "$CLAUDE_CONFIG_DIR/scripts/exists.sh"')], opts).length, 0);
    assert.equal(checkHookPaths([hook('bash "${CLAUDE_CONFIG_DIR}/scripts/exists.sh"')], opts).length, 0);
    assert.equal(checkHookPaths([hook('bash $HOME/scripts/exists.sh')], opts).length, 0);
    assert.equal(checkHookPaths([hook('bash ~/scripts/exists.sh')], opts).length, 0);

    assert.equal(checkHookPaths([hook('bash "$CLAUDE_CONFIG_DIR/scripts/gone.sh"')], opts).length, 1);
    assert.equal(checkHookPaths([hook('bash ~/scripts/gone.sh')], opts).length, 1);
  });

  it('ignores inline shell and PATH binaries', () => {
    assert.equal(checkHookPaths([hook('echo hello && node script.mjs')], opts).length, 0);
    assert.equal(checkHookPaths([hook('jq -r .file_path | xargs prettier --write')], opts).length, 0);
  });

  it('ignores unexpanded variables and globs', () => {
    assert.equal(checkHookPaths([hook('cat $SOME_VAR/nope.txt')], opts).length, 0);
    assert.equal(checkHookPaths([hook(`rm ${tmp}/cache/*.tmp`)], opts).length, 0);
  });

  it('skips redirect targets that may not exist yet', () => {
    const log = path.join(tmp, 'logs', 'out.log');
    assert.equal(checkHookPaths([hook(`${path.join(tmp, 'scripts', 'exists.sh')} > ${log} 2>> ${log}`)], opts).length, 0);
  });

  it('checks the right-hand side of --flag=/abs/path tokens', () => {
    const missing = path.join(tmp, 'gone.json');
    const warnings = checkHookPaths([hook(`tool --config=${missing}`)], opts);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].args[1], missing);
  });

  it('handles multiple commands per hook and includes the matcher in the label', () => {
    const a = path.join(tmp, 'a.sh');
    const b = path.join(tmp, 'b.sh');
    const warnings = checkHookPaths(
      [{ event: 'PostToolUse', matcher: 'Edit', command: `bash ${a}\nbash ${b}` }],
      opts
    );
    assert.equal(warnings.length, 2);
    assert.equal(warnings[0].args[0], 'PostToolUse (Edit)');
  });

  it('dedupes the same missing path', () => {
    const missing = path.join(tmp, 'gone.sh');
    const warnings = checkHookPaths([hook(`bash ${missing}`), hook(`sh ${missing}`, 'Stop')], opts);
    assert.equal(warnings.length, 1);
  });
});

// --- checkSkillFrontmatter ---------------------------------------------------

describe('lint/checkSkillFrontmatter', () => {
  const skill = (dir, metaName, description = 'desc') => ({
    name: metaName ?? dir,
    metaName,
    description,
    filePath: path.join('/cfg/skills', dir, 'SKILL.md'),
  });

  it('passes a spec-compliant skill', () => {
    assert.equal(checkSkillFrontmatter([skill('my-skill', 'my-skill')]).length, 0);
  });

  it('flags a missing name field', () => {
    const warnings = checkSkillFrontmatter([skill('my-skill', null)]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'skillNameMissing');
    assert.equal(warnings[0].category, 'skills');
  });

  it('flags invalid name format (uppercase, underscore, leading hyphen)', () => {
    for (const bad of ['MySkill', 'my_skill', '-my-skill', 'my skill']) {
      const warnings = checkSkillFrontmatter([skill('my-skill', bad)]);
      assert.equal(warnings.length, 1, `expected warning for "${bad}"`);
      assert.equal(warnings[0].code, 'skillNameInvalid');
    }
  });

  it('flags a valid name that does not match the parent directory', () => {
    const warnings = checkSkillFrontmatter([skill('my-skill', 'other-name')]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'skillNameMismatch');
    assert.deepEqual(warnings[0].args, ['other-name', 'my-skill']);
  });

  it('flags a missing description', () => {
    const warnings = checkSkillFrontmatter([skill('my-skill', 'my-skill', '')]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'skillDescMissing');
  });

  it('reports name and description problems independently', () => {
    const warnings = checkSkillFrontmatter([skill('my-skill', 'Bad_Name', '')]);
    assert.deepEqual(warnings.map(w => w.code).sort(), ['skillDescMissing', 'skillNameInvalid']);
  });

  it('works end-to-end with parseSkills output (metaName plumbing)', () => {
    const tmp = makeTmpDir('skills');
    try {
      write(path.join(tmp, 'skills', 'good-skill', 'SKILL.md'),
        '---\nname: good-skill\ndescription: A valid skill\n---\nBody\n');
      write(path.join(tmp, 'skills', 'no-name', 'SKILL.md'),
        '---\ndescription: Missing name\n---\nBody\n');
      const warnings = checkSkillFrontmatter(parseSkills(tmp));
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].code, 'skillNameMissing');
      assert.ok(warnings[0].file.endsWith(path.join('no-name', 'SKILL.md')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// --- checkMemoryLinks --------------------------------------------------------

describe('lint/checkMemoryLinks', () => {
  const mem = (scope, file, body, name) => ({
    name: name ?? path.basename(file, '.md'),
    filePath: path.join('/cfg/projects', scope, 'memory', file),
    body,
    scope,
  });

  it('passes when all wiki-links resolve within the same scope', () => {
    const warnings = checkMemoryLinks([
      mem('proj-a', 'one.md', 'See [[two]] for details'),
      mem('proj-a', 'two.md', 'Back to [[one]]'),
    ]);
    assert.equal(warnings.length, 0);
  });

  it('flags links with no matching memory file', () => {
    const warnings = checkMemoryLinks([mem('proj-a', 'one.md', 'See [[missing-note]]')]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'memoryLinkUnresolved');
    assert.equal(warnings[0].category, 'memory');
    assert.deepEqual(warnings[0].args, ['missing-note']);
  });

  it('resolves against frontmatter name slugs, not just filenames', () => {
    const warnings = checkMemoryLinks([
      mem('proj-a', 'file-on-disk.md', '', 'pretty-name'),
      mem('proj-a', 'other.md', 'See [[pretty-name]]'),
    ]);
    assert.equal(warnings.length, 0);
  });

  it('does not resolve across different memory directories', () => {
    const warnings = checkMemoryLinks([
      mem('proj-a', 'one.md', 'See [[two]]'),
      mem('proj-b', 'two.md', ''),
    ]);
    assert.equal(warnings.length, 1);
  });

  it('handles [[name|alias]] and [[name#heading]] forms and dedupes per file', () => {
    const warnings = checkMemoryLinks([
      mem('proj-a', 'one.md', '[[two|Alias]] and [[two#section]] and [[gone|x]] and [[gone]]'),
      mem('proj-a', 'two.md', ''),
    ]);
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0].args, ['gone']);
  });
});

// --- lintScope ---------------------------------------------------------------

describe('lint/lintScope', () => {
  it('aggregates all three checks and returns [] when everything is clean', () => {
    const tmp = makeTmpDir('scope');
    try {
      const opts = { settingsPath: path.join(tmp, 'settings.json'), claudeConfigDir: tmp, home: tmp };
      assert.deepEqual(lintScope({ hooks: [], skills: [], memory: [] }, opts), []);

      const warnings = lintScope({
        hooks: [{ event: 'Stop', matcher: '*', command: `node ${path.join(tmp, 'gone.mjs')}` }],
        skills: [{ name: 's', metaName: null, description: '', filePath: path.join(tmp, 'skills', 's', 'SKILL.md') }],
        memory: [{ name: 'a', filePath: path.join(tmp, 'a.md'), body: '[[nope]]', scope: 'p' }],
      }, opts);
      assert.deepEqual(
        warnings.map(w => w.category).sort(),
        ['hooks', 'memory', 'skills', 'skills']
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// --- extractPathCandidates ---------------------------------------------------

describe('lint/extractPathCandidates', () => {
  const env = { home: '/home/u', claudeConfigDir: '/home/u/.claude' };

  it('extracts quoted absolute paths with spaces', () => {
    assert.deepEqual(
      extractPathCandidates('node "/home/u/My Dir/script.mjs" --flag', env),
      ['/home/u/My Dir/script.mjs']
    );
  });

  it('returns nothing for plain shell one-liners', () => {
    assert.deepEqual(extractPathCandidates("echo 'done' | tee -a log.txt", env), []);
  });
});
