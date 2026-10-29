#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const STOP = new Set(['use', 'when', 'this', 'that', 'with', 'from', 'into', 'the',
  'and', 'for', 'are', 'was', 'has', 'have', 'not', 'but', 'you', 'your', 'them', 'they',
  'skill', 'skills', 'task', 'tasks', 'file', 'files']);
const USAGE = 'USAGE: node check_skill_overlap.mjs <proposed-name | draft-SKILL.md> [--dir <skills-dir>] [--review 0.2] [--flag 0.35] [--exclude <directory-name>]... [--update <installed-SKILL.md>]';

function fail(message, exitCode = 1) {
  throw Object.assign(new Error(message), { exitCode });
}

function parseArgs(argv) {
  const options = { '--dir': path.join(process.env.HOME || '', '.qoder', 'skills'),
    '--review': '0.2', '--flag': '0.35', '--update': null };
  const seen = new Set();
  const excluded = new Set();
  let target;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('-')) {
      if (!(arg in options) && arg !== '--exclude') fail('unknown argument: ' + arg, 2);
      if (seen.has(arg) && arg !== '--exclude') fail('duplicate argument: ' + arg, 2);
      const value = argv[++i];
      if (!value?.trim() || value.startsWith('--')) fail('missing value for ' + arg, 2);
      seen.add(arg);
      if (arg === '--exclude') {
        if (value === '.' || value === '..' || /[/\\]/.test(value)) fail('invalid directory name for --exclude: ' + value, 2);
        excluded.add(value);
      } else options[arg] = value;
    } else {
      if (target !== undefined) fail('unexpected positional argument: ' + arg, 2);
      target = arg;
    }
  }
  if (!target?.trim()) fail('no target given', 2);
  const reviewAt = Number(options['--review']);
  const flagAt = Number(options['--flag']);
  if (!Number.isFinite(reviewAt) || !Number.isFinite(flagAt) || reviewAt < 0 || reviewAt > flagAt || flagAt > 1) {
    fail('thresholds must be finite and satisfy 0 <= --review <= --flag <= 1', 2);
  }
  return { target, skillsDir: path.resolve(options['--dir']), reviewAt, flagAt, excluded, update: options['--update'] };
}

function tokens(text) {
  return new Set(String(text).toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t)));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function parseSkill(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = src.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const field = (name) => (fm?.[1].match(new RegExp('^' + name + ':[ \\t]*([^\\n]*)$', 'm'))?.[1] || '').trim();
  const name = field('name');
  const description = field('description');
  if (!fm || !/^[a-z0-9-]+$/.test(name) || !description || /^(['"])\s*\1(?:\s+#.*)?$/.test(description) || /^[>|#]/.test(description) || /^description:[^\n]*\n[ \t]+\S/m.test(fm[1])) {
    fail('invalid manifest (plain name and nonempty single-line description required): ' + file);
  }
  const headings = [...src.slice(fm[0].length).matchAll(/^##+ (.+)$/gm)].map((m) => m[1].trim());
  return { name, description, headings, file: fs.realpathSync(file), sourcePath: path.resolve(file) };
}

function collect(skillsDir, excluded) {
  const candidates = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && !excluded.has(entry.name) && entry.isDirectory());
  const out = [];
  for (const entry of candidates) {
    const file = path.join(skillsDir, entry.name, 'SKILL.md');
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) fail('candidate manifest not found: ' + file);
    if (!stat.isFile()) fail('manifest is not a regular file: ' + file);
    out.push(parseSkill(file));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  const { target, skillsDir, reviewAt, flagAt, excluded, update } = parseArgs(argv);
  const rootStat = fs.statSync(skillsDir, { throwIfNoEntry: false });
  if (!rootStat) fail('skills directory not found: ' + skillsDir);
  if (!rootStat.isDirectory()) fail('--dir is not a directory: ' + skillsDir, 2);
  const targetStat = fs.statSync(target, { throwIfNoEntry: false });
  const isDraft = Boolean(targetStat) || target.endsWith('.md') || /[/\\]/.test(target);
  if (isDraft && !targetStat) fail('draft file not found: ' + target);
  if (targetStat && !targetStat.isFile()) fail('target is not a regular file: ' + target, 2);
  if (!isDraft && !/^[a-z0-9-]+$/.test(target)) fail('invalid proposed name: ' + target, 2);
  if (update && !isDraft) fail('--update requires a file draft', 2);
  const proposed = isDraft ? parseSkill(target) : { name: target, description: target.replace(/-/g, ' '), headings: [], file: null };
  const allInstalled = collect(skillsDir, excluded);
  let self = proposed.file;
  if (update) {
    const identity = path.resolve(update);
    const matches = allInstalled.filter((s) => s.file === identity || s.sourcePath === identity);
    if (matches.length !== 1 || matches[0].name !== proposed.name) fail('--update must match one eligible installed manifest and the draft name', 2);
    self = matches[0].file;
  }
  const installed = allInstalled.filter((s) => s.file !== self);
  const pDesc = tokens(proposed.description);
  process.stdout.write('DIR ' + skillsDir + '\n');
  process.stdout.write('PROPOSED ' + proposed.name + (isDraft ? ' (draft file)' : ' (name only: description unknown, comparison is weaker)') + '\n');
  process.stdout.write('INSTALLED ' + installed.length + '\n');
  if (allInstalled.some((s) => s.file === self)) process.stdout.write('SELF_EXCLUDED ' + self + '\n');
  const rows = installed.map((s) => {
    const d = tokens(s.description);
    return { s, j: jaccard(pDesc, d), shared: [...pDesc].filter((t) => d.has(t)).slice(0, 12) };
  }).sort((a, b) => b.j - a.j);
  const high = rows.filter((r) => r.j >= reviewAt || r.s.name === proposed.name);
  const pName = tokens(proposed.name.replace(/-/g, ' '));
  for (const s of installed.filter((s) => s.name === proposed.name)) {
    process.stdout.write('NAME_EXISTS ' + s.name + ' ' + s.file + '\n');
  }
  const nameClash = installed.map((s) => ({ s, n: jaccard(pName, tokens(s.name.replace(/-/g, ' '))) }))
    .filter((r) => r.n >= 0.5).sort((a, b) => b.n - a.n);
  for (const r of nameClash) {
    process.stdout.write('NAME_CLASH ' + r.n.toFixed(2) + '  ' + r.s.name + ' — vocabulary similarity only; inspect the body\n');
  }
  for (const r of rows.slice(0, 10)) {
    const tag = r.j >= flagAt ? 'STRONG' : r.j >= reviewAt ? 'NEAR' : 'weak';
    process.stdout.write(tag + ' ' + r.j.toFixed(3) + '  ' + r.s.name + (r.shared.length ? '\n        shared: ' + r.shared.join(' ') : '') + '\n');
  }
  process.stdout.write('CANDIDATES ' + high.length + ' (>= ' + reviewAt + ' or exact name; adjustable thresholds, not measured limits)\n');
  if (high.length) {
    for (const r of high) {
      process.stdout.write('HEADINGS ' + r.s.name + ': ' + (r.s.headings.filter((h) => !/^Related skills$/i.test(h)).join(' | ') || '(none)') + '\n');
    }
    process.stdout.write('VERDICT: REVIEW — read the candidates above, then choose create / narrow / merge with the user.\n');
    return 1;
  }
  process.stdout.write('VERDICT: OK — no threshold or exact-name candidate; still read the top rows before writing.\n');
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.exitCode = error.exitCode || 1;
  process.stdout.write('ERROR: ' + error.message.replace(/[\r\n]+/g, ' ') + '\n');
  if (process.exitCode === 2) process.stdout.write(USAGE + '\n');
} finally {
  process.stdout.write('READ_ONLY no files written\n');
}
