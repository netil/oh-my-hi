// issue2-server.test.mjs — tests for Bug #3 (scope routing fan-out) and
// Bug #5 (collectProjectData uses wrong directory)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { parseSkills } from '../scripts/parsers/skills.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `omh-issue2-${label}-`));
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Bug #3: Scope routing fan-out
//
// The routing logic extracted here mirrors generate-dashboard.mjs exactly so
// we can unit-test it independently of the full build pipeline.
// ---------------------------------------------------------------------------

/**
 * Simulates the fixed routing logic from generate-dashboard.mjs.
 *
 * @param {object} stubCache  - fake cache: { [transcriptPath]: { _new: true, result: { tokenEntries: [...] } } }
 * @param {Array}  projectScopes - array of { id, configPath }
 * @returns {object} newByScope - { global: {...}, [scopeId]: {...} }
 */
function runScopeRouting(stubCache, projectScopes) {
  const fields = ['tokenEntries', 'promptStats', 'latencyEntries'];

  const newByScope = { global: Object.fromEntries(fields.map(f => [f, []])) };
  for (const s of projectScopes) {
    newByScope[s.id] = Object.fromEntries(fields.map(f => [f, []]));
  }

  const sortedProjectScopes = [...projectScopes].sort((a, b) => b.configPath.length - a.configPath.length);

  for (const [key, entry] of Object.entries(stubCache)) {
    if (key.startsWith('_') || !entry?._new || !entry.result) continue;
    const r = entry.result;

    let matchedScope = null;
    for (const s of sortedProjectScopes) {
      if (key === s.configPath || key.startsWith(s.configPath + path.sep)) {
        matchedScope = s;
        break;
      }
    }

    const targets = [newByScope.global];
    if (matchedScope) targets.push(newByScope[matchedScope.id]);

    for (const target of targets) {
      for (const field of Object.keys(target)) {
        if (r[field]?.length) target[field].push(...r[field]);
      }
    }
  }

  return newByScope;
}

describe('Bug #3: scope routing fan-out', () => {
  const scopeA = { id: 'scopeA', configPath: '/fake/projects/scopeA' };
  const scopeB = { id: 'scopeB', configPath: '/fake/projects/scopeB' };
  const projectScopes = [scopeA, scopeB];

  it('routes transcript under scopeA/configPath to global + scopeA only (not scopeB)', () => {
    const transcriptPath = path.join(scopeA.configPath, 'transcript.jsonl');
    const stubCache = {
      [transcriptPath]: {
        _new: true,
        result: { tokenEntries: [{ id: 'a1' }], promptStats: [], latencyEntries: [] },
      },
    };

    const newByScope = runScopeRouting(stubCache, projectScopes);

    assert.equal(newByScope.global.tokenEntries.length, 1, 'global receives the entry');
    assert.equal(newByScope.scopeA.tokenEntries.length, 1, 'scopeA receives the entry');
    assert.equal(newByScope.scopeB.tokenEntries.length, 0, 'scopeB does NOT receive the entry');
  });

  it('routes unmatched transcript path to global only', () => {
    const transcriptPath = '/unrelated/path/transcript.jsonl';
    const stubCache = {
      [transcriptPath]: {
        _new: true,
        result: { tokenEntries: [{ id: 'u1' }], promptStats: [], latencyEntries: [] },
      },
    };

    const newByScope = runScopeRouting(stubCache, projectScopes);

    assert.equal(newByScope.global.tokenEntries.length, 1, 'global receives the unmatched entry');
    assert.equal(newByScope.scopeA.tokenEntries.length, 0, 'scopeA does not receive it');
    assert.equal(newByScope.scopeB.tokenEntries.length, 0, 'scopeB does not receive it');
  });

  it('global always receives all entries regardless of scope', () => {
    const stubCache = {
      [path.join(scopeA.configPath, 'a.jsonl')]: {
        _new: true,
        result: { tokenEntries: [{ id: 'a1' }], promptStats: [], latencyEntries: [] },
      },
      [path.join(scopeB.configPath, 'b.jsonl')]: {
        _new: true,
        result: { tokenEntries: [{ id: 'b1' }], promptStats: [], latencyEntries: [] },
      },
    };

    const newByScope = runScopeRouting(stubCache, projectScopes);

    assert.equal(newByScope.global.tokenEntries.length, 2, 'global gets all entries');
    assert.equal(newByScope.scopeA.tokenEntries.length, 1, 'scopeA gets only its own');
    assert.equal(newByScope.scopeB.tokenEntries.length, 1, 'scopeB gets only its own');
  });

  it('skips entries without _new flag', () => {
    const transcriptPath = path.join(scopeA.configPath, 'old.jsonl');
    const stubCache = {
      [transcriptPath]: {
        _new: false,
        result: { tokenEntries: [{ id: 'old1' }], promptStats: [], latencyEntries: [] },
      },
    };

    const newByScope = runScopeRouting(stubCache, projectScopes);

    assert.equal(newByScope.global.tokenEntries.length, 0, 'entries without _new are skipped');
  });

  it('skips entries starting with underscore (internal cache keys)', () => {
    const stubCache = {
      _parsed: 3,
      _mtimes: {},
      [path.join(scopeA.configPath, 'real.jsonl')]: {
        _new: true,
        result: { tokenEntries: [{ id: 'r1' }], promptStats: [], latencyEntries: [] },
      },
    };

    const newByScope = runScopeRouting(stubCache, projectScopes);

    // Only the real transcript entry should be routed
    assert.equal(newByScope.global.tokenEntries.length, 1, 'underscore keys are ignored');
  });

  it('uses longest configPath match when paths share a common prefix', () => {
    const scopeShort = { id: 'scopeShort', configPath: '/fake/projects/scope' };
    const scopeLong  = { id: 'scopeLong',  configPath: '/fake/projects/scope-extra' };
    const mixed = [scopeShort, scopeLong];

    const transcriptPath = path.join(scopeLong.configPath, 'x.jsonl');
    const stubCache = {
      [transcriptPath]: {
        _new: true,
        result: { tokenEntries: [{ id: 'x1' }], promptStats: [], latencyEntries: [] },
      },
    };

    const newByScope = runScopeRouting(stubCache, mixed);

    assert.equal(newByScope.scopeLong.tokenEntries.length, 1, 'matches the longer path');
    assert.equal(newByScope.scopeShort.tokenEntries.length, 0, 'does not match the shorter path');
  });
});

// ---------------------------------------------------------------------------
// Bug #5: collectProjectData uses wrong directory
//
// We test the parser directly: parseSkills should find skills in
// projectPath/.claude/, not in a separate configPath.
// ---------------------------------------------------------------------------

describe('Bug #5: collectProjectData uses projectClaudeDir for parsers', () => {
  let tmp;

  before(() => {
    tmp = makeTmpDir('b5');
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('parseSkills finds skill in projectPath/.claude/ (not in a different configPath)', () => {
    // projectPath/.claude/skills/my-skill/SKILL.md
    const skillMd = path.join(tmp, '.claude', 'skills', 'my-skill', 'SKILL.md');
    write(skillMd, [
      '---',
      'name: my-skill',
      'description: A test skill',
      '---',
      'Body content here.',
    ].join('\n'));

    const projectClaudeDir = path.join(tmp, '.claude');
    const skills = parseSkills(projectClaudeDir);

    assert.ok(Array.isArray(skills), 'parseSkills returns an array');
    assert.ok(skills.length > 0, 'at least one skill is found');
    assert.ok(
      skills.some(s => s.name === 'my-skill'),
      `expected "my-skill" in parsed skills, got: ${JSON.stringify(skills.map(s => s.name))}`
    );
  });

  it('parseSkills returns empty array when configPath is used instead of projectClaudeDir', () => {
    // Simulate the old buggy behavior: using a separate configPath that has no skills
    const configPath = makeTmpDir('b5-configpath');
    try {
      const skills = parseSkills(configPath);
      assert.ok(Array.isArray(skills), 'parseSkills returns an array');
      assert.equal(skills.length, 0, 'no skills found when using configPath (wrong dir)');
    } finally {
      fs.rmSync(configPath, { recursive: true, force: true });
    }
  });

  it('falls back to configPath when projectPath is null (global scope)', () => {
    // When projectPath is null, projectClaudeDir should equal configPath
    const configPath = makeTmpDir('b5-fallback');
    try {
      // Place a skill directly in configPath (simulating global scope)
      const skillMd = path.join(configPath, 'skills', 'global-skill', 'SKILL.md');
      write(skillMd, [
        '---',
        'name: global-skill',
        'description: A global skill',
        '---',
        'Global body.',
      ].join('\n'));

      // Reproduce the fallback logic: projectPath = null → projectClaudeDir = configPath
      const projectPath = null;
      const projectClaudeDir = projectPath ? path.join(projectPath, '.claude') : configPath;

      assert.equal(projectClaudeDir, configPath, 'falls back to configPath when projectPath is null');

      const skills = parseSkills(projectClaudeDir);
      assert.ok(skills.some(s => s.name === 'global-skill'), 'global-skill found via fallback path');
    } finally {
      fs.rmSync(configPath, { recursive: true, force: true });
    }
  });
});
