import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Real subprocesses only: no imports, replacements, or patches of the matcher.
// Reproduce: OVERLAP_SCRIPT=/absolute/baseline/check_skill_overlap.mjs node --test /absolute/check_skill_overlap.test.mjs
// Optional OVERLAP_CAPTURE_OUTPUT=1 emits every child's exact output into the test transcript.
const CLI = path.resolve(process.env.OVERLAP_SCRIPT || fileURLToPath(new URL('./check_skill_overlap.mjs', import.meta.url)));
const WORDS = 'amber cobalt delta ember fable glade haven iris juniper kelp lunar maple nectar opal pearl quartz raven solar tulip umber'.split(' ');
const description = (n) => WORDS.slice(0, n).join(' ');
const manifest = (name, desc, headings = '## Workflow\n') => `---\nname: ${name}\ndescription: ${desc}\n---\n${headings}`;
const STACK = /(?:^|\n)(?:\s+at (?:.+\(|file:|node:)|node:internal\/|file:\/\/[^\n]+:\d+\n)/;

function put(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// Detect additions, deletions, byte changes, and mtime changes on every invocation.
// lstat prevents following fixture symlinks (in particular the CLI symlink).
function snapshot(base) {
  const entries = [];
  function visit(file) {
    const stat = fs.lstatSync(file, { bigint: true });
    const row = { path: path.relative(base, file), mode: String(stat.mode), mtimeNs: String(stat.mtimeNs) };
    if (stat.isSymbolicLink()) row.link = fs.readlinkSync(file);
    else if (stat.isFile()) {
      try {
        row.sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      } catch (error) {
        if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
        row.unreadable = error.code;
      }
    }
    entries.push(row);
    if (stat.isDirectory()) {
      let names;
      try {
        names = fs.readdirSync(file).sort();
      } catch (error) {
        if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
        row.unreadable = error.code;
        return;
      }
      for (const name of names) visit(path.join(file, name));
    }
  }
  visit(base);
  return entries;
}

async function fixture(t, fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-overlap-regression-'));
  const home = path.join(base, 'isolated home');
  const root = path.join(home, '.qoder', 'skills');
  fs.mkdirSync(root, { recursive: true });
  const f = {
    t, base, home, root,
    draft(name = 'cedar-proposal', desc = 'amber cobalt', headings) {
      return put(path.join(base, 'draft proposals', 'proposed SKILL.md'), manifest(name, desc, headings));
    },
    install(directory, name = directory, desc = 'amber cobalt', headings) {
      return put(path.join(root, directory, 'SKILL.md'), manifest(name, desc, headings));
    },
  };
  try {
    return await fn(f);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

function run(f, args, { defaultDir = true, script = CLI } = {}) {
  const argv = [script, ...args, ...(defaultDir ? ['--dir', f.root] : [])];
  const before = snapshot(f.base);
  const env = { ...process.env, HOME: f.home, NODE_OPTIONS: '', FORCE_COLOR: '0' };
  // Prevent the parent runner's coverage/cache settings from making child output files.
  delete env.NODE_V8_COVERAGE;
  delete env.NODE_COMPILE_CACHE;
  const child = spawnSync(process.execPath, argv, {
    cwd: f.base, env, encoding: 'utf8', timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
  });
  const result = { argv: [process.execPath, ...argv], status: child.status, signal: child.signal,
    stdout: child.stdout || '', stderr: child.stderr || '' };
  if (process.env.OVERLAP_CAPTURE_OUTPUT === '1') f.t.diagnostic(JSON.stringify(result));
  assert.ifError(child.error);
  assert.equal(child.signal, null, JSON.stringify(result));
  assert.deepEqual(snapshot(f.base), before, `CLI changed fixture bytes, inventory, mode, or mtime: ${JSON.stringify(result)}`);
  return { ...result, output: result.stdout + result.stderr };
}

function exitIs(result, status) {
  assert.equal(result.status, status, JSON.stringify(result, null, 2));
  assert.doesNotMatch(result.output, STACK, 'A friendly CLI result must not expose a raw stack');
}
function verdict(result, status) {
  exitIs(result, status);
  assert.match(result.output, status === 0 ? /VERDICT:\s*OK\b/ : /VERDICT:\s*REVIEW\b/);
}
function usage(result, diagnostic) {
  exitIs(result, 2);
  assert.match(result.output, /\bUSAGE\b/i);
  assert.match(result.output, diagnostic);
}
function errorResult(result, diagnostic) {
  exitIs(result, 1);
  assert.match(result.output, /\bERROR\b/);
  assert.match(result.output, diagnostic);
}
function count(result, label, expected) {
  const match = result.output.match(new RegExp(`^${label}\\s+(\\d+)\\b`, 'm'));
  assert.ok(match, `Missing ${label}: ${result.output}`);
  assert.equal(Number(match[1]), expected, result.output);
}
function rows(result) {
  return result.output.split(/\r?\n/).flatMap((line) => {
    const m = line.match(/^(STRONG|NEAR|weak)\s+(\d+\.\d+)\s+(.+)$/);
    return m ? [{ tag: m[1], score: Number(m[2]), name: m[3] }] : [];
  });
}
function row(result, name, tag, score) {
  const found = rows(result).find((r) => r.name === name);
  assert.deepEqual(found, { tag, score, name }, result.output);
}

// READ_ONLY is tested separately across all exit classes, so a missing marker
// does not obscure baseline evidence about scoring, identity, or validation.
test('description scoring, headings, name-only warning, and default HOME', async (t) => {
  await t.test('identical descriptions score 1; headings display but Related skills does not', (t) => fixture(t, (f) => {
    const draft = f.draft();
    f.install('quartz-recorder', 'quartz-recorder', 'amber cobalt', '## Unique workflow\n## Related skills\n');
    const r = run(f, [draft]);
    verdict(r, 1);
    row(r, 'quartz-recorder', 'STRONG', 1);
    count(r, 'CANDIDATES', 1);
    assert.match(r.output, /^HEADINGS quartz-recorder:.*Unique workflow/m);
    assert.doesNotMatch(r.output, /^HEADINGS .*Related skills/m);
  }));
  await t.test('identical headings cannot raise disjoint descriptions above 0', (t) => fixture(t, (f) => {
    const draft = f.draft('cedar-proposal', 'amber cobalt', '## Shared heading vocabulary\n');
    f.install('quartz-recorder', 'quartz-recorder', 'solar tulip', '## Shared heading vocabulary\n');
    const r = run(f, [draft]);
    verdict(r, 0);
    row(r, 'quartz-recorder', 'weak', 0);
    count(r, 'CANDIDATES', 0);
  }));
  await t.test('case folding, stopwords, short words, and set rather than frequency scoring', (t) => fixture(t, (f) => {
    const draft = f.draft('cedar-proposal', 'THE Amber amber cobalt and xx');
    f.install('quartz-recorder', 'quartz-recorder', 'AMBER cobalt');
    const r = run(f, [draft]);
    verdict(r, 1);
    row(r, 'quartz-recorder', 'STRONG', 1);
  }));
  await t.test('bare-name scoring is explicitly weaker, not a known description', (t) => fixture(t, (f) => {
    f.install('quartz-recorder');
    const r = run(f, ['amber-cobalt']);
    verdict(r, 1);
    row(r, 'quartz-recorder', 'STRONG', 1);
    assert.match(r.output, /name only|name-only/i);
    assert.match(r.output, /weaker|description unknown/i);
  }));
  await t.test('omitting --dir uses only the isolated HOME/.qoder/skills', (t) => fixture(t, (f) => {
    const draft = f.draft();
    f.install('quartz-recorder');
    const r = run(f, [draft], { defaultDir: false });
    verdict(r, 1);
    count(r, 'INSTALLED', 1);
    assert.ok(r.output.includes(f.root), r.output);
  }));
});

test('inclusive thresholds and preserved default description Jaccard', async (t) => {
  const cases = [
    ['below default review', 1, 6, [], 0, 'weak', 0.167],
    ['equal default review 0.2', 1, 5, [], 1, 'NEAR', 0.2],
    ['between default thresholds', 1, 3, [], 1, 'NEAR', 0.333],
    ['equal default flag 0.35', 7, 20, [], 1, 'STRONG', 0.35],
    ['equal custom review', 1, 2, ['--review', '0.5', '--flag', '0.8'], 1, 'NEAR', 0.5],
    ['equal custom review and flag', 1, 2, ['--review', '0.5', '--flag', '0.5'], 1, 'STRONG', 0.5],
    ['below custom review', 1, 2, ['--review', '0.6', '--flag', '0.8'], 0, 'weak', 0.5],
    ['zero review includes zero scores', 0, 1, ['--review', '0', '--flag', '1'], 1, 'NEAR', 0],
    ['one is a valid inclusive upper bound', 1, 1, ['--review', '1', '--flag', '1'], 1, 'STRONG', 1],
  ];
  for (const [label, shared, total, flags, status, tag, score] of cases) {
    await t.test(label, (t) => fixture(t, (f) => {
      const draft = f.draft('cedar-proposal', shared ? description(shared) : 'zircon');
      f.install('quartz-recorder', 'quartz-recorder', description(total));
      const r = run(f, [draft, ...flags]);
      verdict(r, status);
      row(r, 'quartz-recorder', tag, score);
      count(r, 'CANDIDATES', status === 1 ? 1 : 0);
    }));
  }
});

test('top ten display is not the candidate inventory limit', async (t) => {
  for (const collision of [false, true]) {
    await t.test(collision ? 'exact-name collision below top ten remains a candidate' : 'all twelve qualifying rows are candidates', (t) => fixture(t, (f) => {
      const draft = f.draft();
      for (let i = 0; i < 12; i++) f.install(`candidate-${String(i).padStart(2, '0')}`);
      if (collision) f.install('separate-directory', 'cedar-proposal', 'solar tulip');
      const r = run(f, [draft]);
      verdict(r, 1);
      count(r, 'INSTALLED', collision ? 13 : 12);
      count(r, 'CANDIDATES', collision ? 13 : 12);
      assert.equal(rows(r).length, 10, r.output);
      assert.ok(rows(r).every((entry) => entry.score === 1), r.output);
      for (let i = 0; i < 12; i++) assert.ok(r.output.includes(`HEADINGS candidate-${String(i).padStart(2, '0')}:`), r.output);
      if (collision) {
        assert.match(r.output, /^NAME_EXISTS\b.*cedar-proposal/m);
        assert.match(r.output, /^HEADINGS cedar-proposal:/m);
      }
    }));
  }
});

test('exact name identity, canonical self-exclusion, and advisory name clashes', async (t) => {
  for (const mode of ['file-disjoint', 'file-overlap', 'bare-name']) {
    await t.test(`another same-name manifest: ${mode}`, (t) => fixture(t, (f) => {
      const target = mode === 'bare-name' ? 'cedar-proposal' : f.draft();
      f.install('other-directory', 'cedar-proposal', mode === 'file-overlap' ? 'amber cobalt' : 'solar tulip');
      const r = run(f, [target]);
      verdict(r, 1);
      count(r, 'INSTALLED', 1);
      count(r, 'CANDIDATES', 1);
      assert.match(r.output, /^NAME_EXISTS\b.*cedar-proposal/m);
    }));
  }
  await t.test('the exact installed file is automatically excluded', (t) => fixture(t, (f) => {
    const own = f.install('directory-not-name', 'cedar-proposal');
    const r = run(f, [own]);
    verdict(r, 0);
    count(r, 'INSTALLED', 0);
    count(r, 'CANDIDATES', 0);
    assert.doesNotMatch(r.output, /^NAME_EXISTS\b/m);
  }));
  await t.test('canonical self plus another same-name manifest preserves the other collision', (t) => fixture(t, (f) => {
    const own = f.install('self-directory', 'cedar-proposal');
    f.install('other-directory', 'cedar-proposal', 'solar tulip');
    const r = run(f, [own]);
    verdict(r, 1);
    count(r, 'INSTALLED', 1);
    count(r, 'CANDIDATES', 1);
    assert.match(r.output, /^NAME_EXISTS\b.*cedar-proposal/m);
  }));
  await t.test('spaces and symlink spellings of CLI, root, and self are accepted', (t) => fixture(t, (f) => {
    const own = f.install('directory with spaces', 'cedar-proposal');
    const cliLink = path.join(f.base, 'matcher link with spaces.mjs');
    const rootLink = path.join(f.base, 'root link with spaces');
    const draftLink = path.join(f.base, 'draft link with spaces.md');
    fs.symlinkSync(CLI, cliLink);
    fs.symlinkSync(f.root, rootLink, 'dir');
    fs.symlinkSync(own, draftLink);
    const r = run(f, [draftLink, '--dir', rootLink], { defaultDir: false, script: cliLink });
    verdict(r, 0);
    count(r, 'INSTALLED', 0);
  }));
  for (const [name, clash] of [['amber-cobalt-ember', true], ['amber-ember-fable', false]]) {
    await t.test(clash ? 'name-token Jaccard 0.5 is advisory, not semantic proof' : 'name-token Jaccard below 0.5 does not clash', (t) => fixture(t, (f) => {
      const draft = f.draft('amber-cobalt-delta', 'lunar maple');
      f.install('name-comparison', name, 'solar tulip');
      const r = run(f, [draft]);
      verdict(r, 0);
      count(r, 'CANDIDATES', 0);
      if (clash) {
        assert.match(r.output, /^NAME_CLASH\s+0\.50\b/m);
        assert.doesNotMatch(r.output, /different name is still the same skill|(?:is|are) (?:a )?semantic duplicate/i);
      } else assert.doesNotMatch(r.output, /^NAME_CLASH\b/m);
    }));
  }
});

test('--update binds one eligible canonical file and never removes all equal names', async (t) => {
  for (const mode of ['only-target', 'preserve-other', 'selected-root-spelling', 'canonical-spelling']) {
    await t.test(`valid binding: ${mode}`, (t) => fixture(t, (f) => {
      const draft = f.draft();
      let installed = f.install('update-directory', 'cedar-proposal');
      let root = f.root;
      if (mode === 'preserve-other') f.install('other-directory', 'cedar-proposal', 'solar tulip');
      if (mode === 'selected-root-spelling' || mode === 'canonical-spelling') {
        root = path.join(f.base, 'selected root alias');
        fs.symlinkSync(f.root, root, 'dir');
        installed = mode === 'selected-root-spelling'
          ? path.join(root, 'update-directory', 'SKILL.md') : fs.realpathSync(installed);
      }
      const r = run(f, [draft, '--update', installed, '--dir', root], { defaultDir: false });
      verdict(r, mode === 'preserve-other' ? 1 : 0);
      count(r, 'INSTALLED', mode === 'preserve-other' ? 1 : 0);
      count(r, 'CANDIDATES', mode === 'preserve-other' ? 1 : 0);
      if (mode === 'preserve-other') assert.match(r.output, /^NAME_EXISTS\b.*cedar-proposal/m);
    }));
  }
  await t.test('explicit update removes only its binding, not an additional canonical self', (t) => fixture(t, (f) => {
    const draft = f.install('draft-directory', 'cedar-proposal');
    const installed = f.install('update-directory', 'cedar-proposal');
    const r = run(f, [draft, '--update', installed]);
    verdict(r, 1);
    count(r, 'INSTALLED', 1);
    count(r, 'CANDIDATES', 1);
    assert.match(r.output, /^NAME_EXISTS\b.*cedar-proposal/m);
  }));
  const invalid = ['bare-name', 'different-name', 'outside-inventory', 'explicitly-excluded', 'hidden', 'nested', 'missing', 'directory', 'unrelated-alias'];
  for (const mode of invalid) {
    await t.test(`invalid binding: ${mode}`, (t) => fixture(t, (f) => {
      let target = f.draft();
      let installed;
      let extra = [];
      if (mode === 'outside-inventory') installed = put(path.join(f.base, 'outside', 'SKILL.md'), manifest('cedar-proposal', 'amber cobalt'));
      else if (mode === 'missing') installed = path.join(f.root, 'missing', 'SKILL.md');
      else if (mode === 'hidden') installed = f.install('.hidden', 'cedar-proposal');
      else if (mode === 'nested') {
        f.install('container', 'container', 'solar tulip');
        installed = f.install('container/nested', 'cedar-proposal');
      } else installed = f.install('update-directory', mode === 'different-name' ? 'another-name' : 'cedar-proposal');
      if (mode === 'bare-name') target = 'cedar-proposal';
      if (mode === 'explicitly-excluded') extra = ['--exclude', 'update-directory'];
      if (mode === 'directory') installed = path.dirname(installed);
      if (mode === 'unrelated-alias') {
        const alias = path.join(f.base, 'unrelated alias.md');
        fs.symlinkSync(installed, alias);
        installed = alias;
      }
      const r = run(f, [target, '--update', installed, ...extra]);
      usage(r, /update|binding|eligible|draft/i);
    }));
  }
  await t.test('a linked candidate manifest is an inventory error before update binding', (t) => fixture(t, (f) => {
    const draft = f.draft();
    const installed = f.install('update-directory', 'cedar-proposal');
    const second = path.join(f.root, 'second-directory');
    fs.mkdirSync(second);
    fs.symlinkSync(installed, path.join(second, 'SKILL.md'));
    errorResult(run(f, [draft, '--update', installed]), /manifest is not a regular file/i);
  }));
});

test('argument validation rejects malformed inputs with usage 2', async (t) => {
  const cases = [
    ['no target', () => [], /target|name|manifest|draft/i],
    ['blank target', () => ['   '], /target|name|blank|empty/i],
    ['extra positional', (f, d) => [d, 'another-name'], /target|positional|argument|exactly/i],
    ['unknown flag', (f, d) => [d, '--mystery'], /unknown|mystery|unrecognized/i],
    ['unknown flag cannot supply a target', () => ['--mystery', 'concealed-name'], /unknown|mystery|unrecognized/i],
    ['help with target', (f, d) => [d, '--help'], /help|alone|standalone|argument/i],
    ['duplicate help', () => ['--help', '--help'], /help|duplicate|alone|standalone/i],
    ['duplicate dir', (f, d) => [d, '--dir', f.root, '--dir', f.root], /dir|duplicate/i],
    ['duplicate review', (f, d) => [d, '--review', '0.2', '--review', '0.2'], /review|duplicate/i],
    ['duplicate flag', (f, d) => [d, '--flag', '0.35', '--flag', '0.35'], /flag|duplicate/i],
    ['duplicate update', (f, d, i) => [d, '--update', i, '--update', i], /update|duplicate/i],
    ['review above flag', (f, d) => [d, '--review', '0.8', '--flag', '0.2'], /review|flag|threshold/i],
  ];
  for (const flag of ['--dir', '--review', '--flag', '--exclude', '--update']) {
    cases.push([`${flag} missing value`, (f, d) => [d, flag], /value|requires?|missing|expected/i]);
    cases.push([`${flag} blank value`, (f, d) => [d, flag, '   '], /value|blank|empty|non.?empty|invalid|requires?/i]);
  }
  cases.push(['a following flag is not a value', (f, d) => [d, '--dir', '--review', '0.2'], /dir|value|missing|requires?/i]);
  for (const [flag, value] of [
    ['--review', 'NaN'], ['--flag', 'Infinity'], ['--review', '-Infinity'],
    ['--review', '-0.1'], ['--flag', '-0.1'], ['--review', '1.1'], ['--flag', '1.1'],
    ['--review', '0.2junk'], ['--flag', 'not-a-number'],
  ]) cases.push([`${flag} rejects ${value}`, (f, d) => [d, flag, value], /review|flag|finite|number|threshold|invalid/i]);
  for (const value of ['.', '..', 'admin/cache', 'admin\\cache']) {
    cases.push([`exclude rejects ${JSON.stringify(value)}`, (f, d) => [d, '--exclude', value], /exclude|directory|name|invalid/i]);
  }
  for (const [label, build, diagnostic] of cases) {
    await t.test(label, (t) => fixture(t, (f) => {
      const draft = f.draft();
      const installed = f.install('quartz-recorder');
      // No appended --dir: a missing value must actually remain the last argument.
      usage(run(f, build(f, draft, installed), { defaultDir: false }), diagnostic);
    }));
  }
});

test('help is standalone and succeeds even without an installed root', (t) => fixture(t, (f) => {
  fs.rmSync(f.root, { recursive: true });
  const r = run(f, ['--help'], { defaultDir: false });
  exitIs(r, 0);
  assert.match(r.output, /\bUSAGE\b/i);
  assert.match(r.output, /--exclude/);
  assert.match(r.output, /--update/);
}));

test('filesystem type errors and malformed manifests have friendly diagnostics', async (t) => {
  const cases = [
    ['missing .md target', (f) => [path.join(f.base, 'missing.md')], 1, /target|draft|manifest|missing|not found|ENOENT/i],
    ['missing extensionless manifest path', (f) => [path.join(f.base, 'missing', 'manifest')], 1, /target|draft|manifest|missing|not found|ENOENT/i],
    ['missing root', (f, d) => [d, '--dir', path.join(f.base, 'missing-root')], 1, /directory|root|missing|not found|ENOENT/i],
    ['directory target', (f) => [f.root], 2, /target|draft|file|directory/i],
    ['non-directory --dir', (f, d) => [d, '--dir', d], 2, /dir|directory/i],
  ];
  for (const [label, build, status, diagnostic] of cases) {
    await t.test(label, (t) => fixture(t, (f) => {
      const draft = f.draft();
      const r = run(f, build(f, draft), { defaultDir: false });
      if (status === 1) errorResult(r, diagnostic);
      else usage(r, diagnostic);
    }));
  }
  const malformed = [
    ['no frontmatter', 'plain body only\n'],
    ['missing name', '---\ndescription: amber cobalt\n---\n'],
    ['missing description', '---\nname: malformed-name\n---\n'],
    ['blank name', '---\nname:   \ndescription: amber cobalt\n---\n'],
    ['blank description', '---\nname: malformed-name\ndescription:   \n---\n'],
    ['folded description', '---\nname: malformed-name\ndescription: >\n  amber cobalt\n---\n'],
    ['continued description', '---\nname: malformed-name\ndescription: amber\n  cobalt\n---\n'],
    ['comment-only description', manifest('malformed-name', '# no value')],
    ...['""', "''", '"   "', "'   '"].flatMap((value) => [
      [`empty quoted description ${value}`, manifest('malformed-name', value)],
      [`empty quoted description with comment ${value}`, manifest('malformed-name', value + ' # intentionally blank')],
    ]),
  ];
  for (const location of ['proposal', 'installed']) {
    for (const [label, content] of malformed) {
      await t.test(`${location}: ${label}`, (t) => fixture(t, (f) => {
        const draft = f.draft();
        const bad = location === 'proposal' ? draft : f.install('malformed-directory');
        fs.writeFileSync(bad, content);
        const r = run(f, [draft]);
        errorResult(r, /manifest|frontmatter|name|description|malformed|invalid/i);
      }));
    }
  }
});

test('real filesystem unreadable inputs (guarded for permission-bypassing users)', async (t) => {
  for (const location of ['proposal', 'installed', 'root']) {
    await t.test(location, (t) => fixture(t, (f) => {
      const draft = f.draft();
      const bad = location === 'root' ? f.root : location === 'proposal' ? draft : f.install('unreadable-directory');
      const before = snapshot(f.base);
      const originalMode = fs.statSync(bad).mode;
      fs.chmodSync(bad, 0o000);
      try {
        // A real read probe, not a mock: root/ACL environments may ignore mode 000.
        try {
          if (location === 'root') fs.readdirSync(bad);
          else fs.readFileSync(bad);
          t.skip('OS still permits reading mode-000 fixture; unreadability cannot be established');
          return;
        } catch (error) {
          assert.ok(['EACCES', 'EPERM'].includes(error.code), String(error));
        }
        const r = run(f, [draft]);
        errorResult(r, /read|permission|access|EACCES|EPERM/i);
      } finally {
        fs.chmodSync(bad, originalMode);
        assert.deepEqual(snapshot(f.base), before, 'Unreadable input hash/mtime changed');
      }
    }));
  }
});

test('inventory filtering excludes hidden/admin entries and never recurses or follows directories', async (t) => {
  await t.test('hidden directories with poisonous manifests are not read', (t) => fixture(t, (f) => {
    const draft = f.draft();
    f.install('visible', 'quartz-recorder', 'solar tulip');
    put(path.join(f.root, '.hidden', 'SKILL.md'), 'not a manifest');
    fs.mkdirSync(path.join(f.root, '.poison', 'SKILL.md'), { recursive: true });
    const r = run(f, [draft]);
    verdict(r, 0);
    count(r, 'INSTALLED', 1);
    assert.doesNotMatch(r.output, /not a manifest|HEADINGS \.hidden|HEADINGS \.poison/);
  }));
  await t.test('repeatable exclusions use directory names, not manifest names, before parsing', (t) => fixture(t, (f) => {
    const draft = f.draft();
    f.install('visible', 'admin-one', 'solar tulip');
    put(path.join(f.root, 'admin-one', 'SKILL.md'), 'invalid manifest');
    fs.mkdirSync(path.join(f.root, 'admin-two', 'SKILL.md'), { recursive: true });
    const r = run(f, [draft, '--exclude', 'admin-one', '--exclude', 'admin-two', '--exclude', 'admin-one']);
    verdict(r, 0);
    count(r, 'INSTALLED', 1);
    row(r, 'admin-one', 'weak', 0);
  }));
  await t.test('nested manifests, root-level files, and symlink directories are not candidates', (t) => fixture(t, (f) => {
    const draft = f.draft();
    f.install('container', 'container', 'solar tulip');
    f.install('container/nested', 'nested-overlap');
    put(path.join(f.root, 'SKILL.md'), manifest('root-level-overlap', 'amber cobalt'));
    put(path.join(f.root, 'ordinary-file'), 'not a directory');
    const outside = path.join(f.base, 'outside directory');
    put(path.join(outside, 'SKILL.md'), 'malformed linked manifest');
    fs.symlinkSync(outside, path.join(f.root, 'linked-directory'), 'dir');
    const r = run(f, [draft]);
    verdict(r, 0);
    count(r, 'INSTALLED', 1);
    row(r, 'container', 'weak', 0);
    count(r, 'CANDIDATES', 0);
    assert.doesNotMatch(r.output, /nested-overlap|root-level-overlap|malformed linked manifest/);
  }));
  await t.test('an eligible directory without a manifest is not a clean empty inventory', (t) => fixture(t, (f) => {
    const draft = f.draft();
    fs.mkdirSync(path.join(f.root, 'orphan'));
    const r = run(f, [draft]);
    errorResult(r, /candidate manifest not found:.*orphan/);
    assert.doesNotMatch(r.output, /VERDICT:\s*OK/);
  }));
});

test('CRLF normalization on either side preserves fields, headings, and score', async (t) => {
  for (const location of ['proposal', 'installed', 'both']) {
    await t.test(location, (t) => fixture(t, (f) => {
      const draft = f.draft();
      const installed = f.install('quartz-recorder', 'quartz-recorder', 'amber cobalt', '## Display heading\n');
      for (const file of location === 'both' ? [draft, installed] : [location === 'proposal' ? draft : installed]) {
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
      }
      const r = run(f, [draft]);
      verdict(r, 1);
      row(r, 'quartz-recorder', 'STRONG', 1);
      assert.match(r.output, /PROPOSED cedar-proposal\b/);
      assert.match(r.output, /^HEADINGS quartz-recorder:.*Display heading/m);
      assert.doesNotMatch(r.output, /\r/);
    }));
  }
});

test('READ_ONLY is emitted for every exit class; all input hashes and mtimes stay unchanged', async (t) => {
  for (const kind of ['OK', 'REVIEW', 'ERROR', 'USAGE', 'HELP']) {
    await t.test(kind, (t) => fixture(t, (f) => {
      const draft = f.draft();
      let args = [draft];
      let status = 0;
      if (kind === 'REVIEW') { f.install('quartz-recorder'); status = 1; }
      if (kind === 'ERROR') { args = [path.join(f.base, 'missing.md')]; status = 1; }
      if (kind === 'USAGE') { args = []; status = 2; }
      if (kind === 'HELP') args = ['--help'];
      const r = run(f, args, { defaultDir: false });
      exitIs(r, status);
      assert.match(r.output, /\bREAD_ONLY\b/);
    }));
  }
});
