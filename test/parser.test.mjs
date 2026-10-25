// parser.test.mjs — unit tests for content parsers (frontmatter, skills,
// agents, hooks, mcp-servers, memory). Uses isolated temp config dirs so the
// tests don't depend on the developer's real ~/.claude state.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { parseFrontmatter } from '../scripts/parsers/frontmatter.mjs';
import { parseSkills } from '../scripts/parsers/skills.mjs';
import { parseAgents } from '../scripts/parsers/agents.mjs';
import { parseHooks } from '../scripts/parsers/hooks.mjs';
import { parseMcpServers } from '../scripts/parsers/mcp-servers.mjs';
import { parseMemory } from '../scripts/parsers/memory.mjs';
import { parsePlugins } from '../scripts/parsers/plugins.mjs';
import { parseConfigFiles } from '../scripts/parsers/config-files.mjs';

// --- Fixture helpers --------------------------------------------------------

function makeTmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `omh-parser-${label}-`));
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// --- frontmatter -----------------------------------------------------------

describe('parsers/frontmatter', () => {
  let tmp;
  before(() => { tmp = makeTmpDir('fm'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('parses basic key/value frontmatter', () => {
    const fp = path.join(tmp, 'a.md');
    write(fp, '---\nname: foo\ndescription: bar\n---\nBody here.\n');
    const { meta, body } = parseFrontmatter(fp);
    assert.equal(meta.name, 'foo');
    assert.equal(meta.description, 'bar');
    assert.match(body, /Body here\./);
  });

  it('strips single and double quotes from values', () => {
    const fp = path.join(tmp, 'b.md');
    write(fp, '---\na: "quoted"\nb: \'single\'\n---\n');
    const { meta } = parseFrontmatter(fp);
    assert.equal(meta.a, 'quoted');
    assert.equal(meta.b, 'single');
  });

  it('coerces true/false literals to booleans', () => {
    const fp = path.join(tmp, 'c.md');
    write(fp, '---\nenabled: true\nhidden: false\n---\n');
    const { meta } = parseFrontmatter(fp);
    assert.strictEqual(meta.enabled, true);
    assert.strictEqual(meta.hidden, false);
  });

  it('returns empty meta when no frontmatter delimiter', () => {
    const fp = path.join(tmp, 'd.md');
    write(fp, 'Just body, no frontmatter.\n');
    const { meta, body } = parseFrontmatter(fp);
    assert.deepEqual(meta, {});
    assert.match(body, /Just body/);
  });

  it('ignores lines without a colon in the frontmatter block', () => {
    const fp = path.join(tmp, 'e.md');
    write(fp, '---\nname: ok\nnot a kv line\nanother: val\n---\n');
    const { meta } = parseFrontmatter(fp);
    assert.equal(meta.name, 'ok');
    assert.equal(meta.another, 'val');
    assert.equal(Object.keys(meta).length, 2);
  });

  it('reads a literal block scalar (|) as multi-line text', () => {
    const fp = path.join(tmp, 'f.md');
    write(fp, '---\nname: x\ndescription: |\n  Line one.\n  "quoted": still text\n\n  Line three.\nmodel: haiku\n---\nBody\n');
    const { meta } = parseFrontmatter(fp);
    assert.equal(meta.description, 'Line one.\n"quoted": still text\n\nLine three.\n');
    assert.equal(meta.model, 'haiku', 'key after the block is still parsed');
    assert.ok(!('"quoted"' in meta), 'colon inside the block is not a key');
  });

  it('folds a > block scalar and honors chomping indicators', () => {
    const fp = path.join(tmp, 'g.md');
    write(fp, '---\na: >\n  one\n  two\n\n  three\nb: |-\n  keep\n  lines\nc: >-\n  no\n  newline\n---\n');
    const { meta } = parseFrontmatter(fp);
    assert.equal(meta.a, 'one two\nthree\n');
    assert.equal(meta.b, 'keep\nlines');
    assert.equal(meta.c, 'no newline');
  });

  it('returns an empty string for an empty block scalar', () => {
    const fp = path.join(tmp, 'h.md');
    write(fp, '---\ndescription: |\nname: y\n---\n');
    const { meta } = parseFrontmatter(fp);
    assert.equal(meta.description, '');
    assert.equal(meta.name, 'y');
  });
});

// --- skills ----------------------------------------------------------------

describe('parsers/skills', () => {
  let tmp;
  before(() => {
    tmp = makeTmpDir('skills');
    // local skill
    write(path.join(tmp, 'skills/my-skill/SKILL.md'),
      '---\nname: my-skill\ndescription: local one\n---\nBody\n');
    // plugin skill under plugins/cache/marketplace/plugin-name/version/skills/...
    write(path.join(tmp, 'plugins/cache/market/cool-plugin/1.0.0/skills/cool/SKILL.md'),
      '---\nname: cool\ndescription: plugin one\n---\nPlugin body\n');
    // stray temp_git dir must be skipped
    write(path.join(tmp, 'plugins/cache/market/cool-plugin/1.0.0/temp_git_abc/SKILL.md'),
      '---\nname: stale\n---\n');
  });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('parses local and plugin skills and labels origin', () => {
    const skills = parseSkills(tmp);
    const byName = Object.fromEntries(skills.map(s => [s.name, s]));
    assert.ok(byName['my-skill'], 'local skill present');
    assert.equal(byName['my-skill'].plugin, null);
    assert.ok(byName['cool'], 'plugin skill present');
    assert.equal(byName['cool'].plugin, 'cool-plugin');
    assert.equal(byName['my-skill'].description, 'local one');
  });

  it('skips temp_git_ directories', () => {
    const skills = parseSkills(tmp);
    assert.ok(!skills.find(s => s.name === 'stale'), 'temp dir ignored');
  });

  it('deduplicates by name, local taking priority over plugin', () => {
    const tmp2 = makeTmpDir('skills-dedup');
    try {
      write(path.join(tmp2, 'skills/shared/SKILL.md'),
        '---\nname: shared\ndescription: local version\n---\n');
      write(path.join(tmp2, 'plugins/cache/m/p/1/skills/shared/SKILL.md'),
        '---\nname: shared\ndescription: plugin version\n---\n');
      const skills = parseSkills(tmp2);
      const shared = skills.filter(s => s.name === 'shared');
      assert.equal(shared.length, 1, 'deduped to one entry');
      assert.equal(shared[0].plugin, null, 'local variant wins');
      assert.equal(shared[0].description, 'local version');
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('returns empty array when configDir has no skills', () => {
    const empty = makeTmpDir('skills-empty');
    try {
      assert.deepEqual(parseSkills(empty), []);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

// --- agents ----------------------------------------------------------------

describe('parsers/agents', () => {
  let tmp;
  before(() => {
    tmp = makeTmpDir('agents');
    write(path.join(tmp, 'agents/writer.md'),
      '---\nname: writer\ndescription: writes stuff\nmodel: sonnet\n---\nBody\n');
    write(path.join(tmp, 'agents/noname.md'), '---\ndescription: no name\n---\n');
    write(path.join(tmp, 'agents/changelog.md'), '---\nname: should-skip\n---\n');
  });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('parses agents with frontmatter fields', () => {
    const agents = parseAgents(tmp);
    const writer = agents.find(a => a.name === 'writer');
    assert.ok(writer);
    assert.equal(writer.description, 'writes stuff');
    assert.equal(writer.model, 'sonnet');
  });

  it('falls back to filename when frontmatter has no name', () => {
    const agents = parseAgents(tmp);
    assert.ok(agents.find(a => a.name === 'noname'), 'filename used as fallback');
  });

  it('excludes changelog.md from results', () => {
    const agents = parseAgents(tmp);
    assert.ok(!agents.find(a => a.name === 'should-skip'), 'changelog excluded');
  });

  it('returns [] when agents dir missing', () => {
    const empty = makeTmpDir('agents-empty');
    try {
      assert.deepEqual(parseAgents(empty), []);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

// --- hooks -----------------------------------------------------------------

describe('parsers/hooks', () => {
  let tmp;
  before(() => {
    tmp = makeTmpDir('hooks');
    const settings = {
      hooks: {
        PostToolUse: [
          { matcher: 'Edit', hooks: [{ type: 'command', command: 'echo edit' }] },
          { matcher: 'Edit', hooks: [{ type: 'command', command: 'echo edit2' }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: 'echo write' }] },
        ],
        SessionStart: [
          { hooks: [{ type: 'command', command: 'echo start' }] }, // no matcher
        ],
      },
    };
    write(path.join(tmp, 'settings.json'), JSON.stringify(settings));
  });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('groups multiple commands with the same event+matcher', () => {
    const hooks = parseHooks(tmp);
    const edit = hooks.find(h => h.event === 'PostToolUse' && h.matcher === 'Edit');
    assert.ok(edit);
    assert.equal(edit.commandCount, 2, 'two commands merged');
    assert.match(edit.command, /echo edit\necho edit2/);
  });

  it('uses "*" as default matcher when not specified', () => {
    const hooks = parseHooks(tmp);
    const start = hooks.find(h => h.event === 'SessionStart');
    assert.ok(start);
    assert.equal(start.matcher, '*');
  });

  it('embeds raw JSON snippet per hook group', () => {
    const hooks = parseHooks(tmp);
    for (const h of hooks) {
      assert.ok(h.rawJson);
      const parsed = JSON.parse(h.rawJson);
      assert.ok(parsed[h.event], 'rawJson preserves event key');
    }
  });

  it('returns [] instead of throwing when settings.json is malformed', () => {
    const bad = makeTmpDir('hooks-bad');
    try {
      write(path.join(bad, 'settings.json'), '{ "hooks": ');
      assert.deepEqual(parseHooks(bad), []);
    } finally {
      fs.rmSync(bad, { recursive: true, force: true });
    }
  });

  it('returns [] when settings.json missing', () => {
    const empty = makeTmpDir('hooks-empty');
    try {
      assert.deepEqual(parseHooks(empty), []);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

// --- mcp-servers -----------------------------------------------------------

describe('parsers/mcp-servers', () => {
  let tmp;
  before(() => {
    tmp = makeTmpDir('mcp');
    const cfg = {
      mcpServers: {
        'my-server': {
          command: 'node',
          args: ['server.js'],
          type: 'stdio',
          env: { API_TOKEN: 'secret-value', OTHER: 'shh' },
        },
        'no-env': { command: 'python', args: ['x.py'] },
        'remote': { type: 'http', url: 'https://example.invalid/mcp', headers: { Authorization: 'Bearer header-secret' } },
      },
    };
    write(path.join(tmp, '.claude.json'), JSON.stringify(cfg));
  });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('extracts command, args, and type', () => {
    const servers = parseMcpServers(tmp);
    const my = servers.find(s => s.name === 'my-server');
    assert.equal(my.command, 'node');
    assert.deepEqual(my.args, ['server.js']);
    assert.equal(my.type, 'stdio');
  });

  it('returns env key names but NEVER exposes env values', () => {
    const servers = parseMcpServers(tmp);
    const my = servers.find(s => s.name === 'my-server');
    assert.deepEqual(my.envKeys.sort(), ['API_TOKEN', 'OTHER']);
    // critical: raw JSON must not contain the real token value
    assert.ok(!my.rawJson.includes('secret-value'), 'secret must be masked');
    assert.ok(my.rawJson.includes('***'), 'mask placeholder present');
  });

  it('masks header values (auth tokens) but keeps header names', () => {
    const servers = parseMcpServers(tmp);
    const remote = servers.find(s => s.name === 'remote');
    assert.ok(!remote.rawJson.includes('header-secret'), 'header value must be masked');
    assert.deepEqual(JSON.parse(remote.rawJson).remote.headers, { Authorization: '***' });
  });

  it('handles servers with no env block', () => {
    const servers = parseMcpServers(tmp);
    const noEnv = servers.find(s => s.name === 'no-env');
    assert.deepEqual(noEnv.envKeys, []);
  });

  it('ignores duplicate server names across candidate files', () => {
    const tmp2 = makeTmpDir('mcp-dup');
    try {
      write(path.join(tmp2, '.claude.json'),
        JSON.stringify({ mcpServers: { dup: { command: 'a' } } }));
      write(path.join(tmp2, 'mcp.json'),
        JSON.stringify({ mcpServers: { dup: { command: 'b' } } }));
      const servers = parseMcpServers(tmp2);
      const dup = servers.filter(s => s.name === 'dup');
      assert.equal(dup.length, 1, 'deduped');
      assert.equal(dup[0].command, 'a', 'first source wins');
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });
});

// --- memory ----------------------------------------------------------------

describe('parsers/memory', () => {
  let tmp;
  before(() => {
    tmp = makeTmpDir('memory');
    // project A: two memory entries + MEMORY.md (index)
    write(path.join(tmp, 'projects/-Users-a/memory/user_role.md'),
      '---\nname: User role\ndescription: role info\ntype: user\n---\nBody A\n');
    write(path.join(tmp, 'projects/-Users-a/memory/feedback_x.md'),
      '---\nname: Feedback X\ntype: feedback\n---\nBody X\n');
    write(path.join(tmp, 'projects/-Users-a/memory/MEMORY.md'),
      '- [User role](user_role.md)\n');
    // project B: no memory dir
    write(path.join(tmp, 'projects/-Users-b/something.json'), '{}');
  });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('parses memory files and tags scope by project dir', () => {
    const mems = parseMemory(tmp);
    assert.equal(mems.length, 2);
    const byName = Object.fromEntries(mems.map(m => [m.name, m]));
    assert.equal(byName['User role'].type, 'user');
    assert.equal(byName['User role'].scope, '-Users-a');
    assert.equal(byName['Feedback X'].type, 'feedback');
  });

  it('excludes MEMORY.md index file', () => {
    const mems = parseMemory(tmp);
    assert.ok(!mems.find(m => m.name === 'MEMORY'), 'index file skipped');
  });

  it('uses "unknown" when type field is missing', () => {
    const tmp2 = makeTmpDir('memory-notype');
    try {
      write(path.join(tmp2, 'projects/x/memory/bare.md'),
        '---\nname: Bare\n---\n');
      const mems = parseMemory(tmp2);
      assert.equal(mems[0].type, 'unknown');
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });
});

// --- plugins ---------------------------------------------------------------

describe('parsers/plugins', () => {
  it('returns [] instead of throwing when installed_plugins.json is malformed', () => {
    const tmp = makeTmpDir('plugins-bad');
    try {
      write(path.join(tmp, 'plugins', 'installed_plugins.json'), '{ "plugins": ');
      assert.deepEqual(parsePlugins(tmp), []);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('still lists plugins (as not enabled) when settings.json is malformed', () => {
    const tmp = makeTmpDir('plugins-bad-settings');
    try {
      write(path.join(tmp, 'plugins', 'installed_plugins.json'),
        JSON.stringify({ plugins: { 'p@m': [{ scope: 'user', version: '1.0.0' }] } }));
      write(path.join(tmp, 'settings.json'), '{ broken');
      const plugins = parsePlugins(tmp);
      assert.equal(plugins.length, 1);
      assert.equal(plugins[0].name, 'p');
      assert.equal(plugins[0].enabled, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// --- config-files ----------------------------------------------------------

describe('parsers/config-files', () => {
  it('masks settings.json env values but keeps key names', () => {
    const tmp = makeTmpDir('config-env');
    try {
      write(path.join(tmp, 'settings.json'),
        JSON.stringify({ env: { ANTHROPIC_API_KEY: 'sk-secret-value' }, model: 'opus' }));
      const settings = parseConfigFiles(tmp).find(f => f.name === 'settings.json');
      assert.ok(settings);
      assert.ok(!settings.jsonContent.includes('sk-secret-value'), 'env value must be masked');
      const parsed = JSON.parse(settings.jsonContent);
      assert.deepEqual(parsed.env, { ANTHROPIC_API_KEY: '***' });
      assert.equal(parsed.model, 'opus', 'non-env values are kept');
      assert.equal(settings.jsonStats.env, 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
