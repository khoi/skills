#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const USAGE = `snapshot-package — freeze a skill directory to hashes, then prove no one else wrote it

  node snapshot-package.mjs snapshot <skill-dir> --out <HASHES.txt> [--copy-to <dir>]
  node snapshot-package.mjs verify <HASHES.txt> --root <dir> [--only <a,b,c>]

snapshot  hash every file under <skill-dir>; --copy-to also writes a byte copy to run the job from
verify    recompute and compare; exit 1 on any drift, 2 on usage error
--only    compare only the named relative paths (added files still count as drift)`;

const fail = (msg) => {
  console.log(`ERROR ${msg}`);
  console.log(USAGE);
  process.exit(2);
};

const sha = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');

const walk = (root) => {
  const found = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.DS_Store') continue;
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) visit(abs);
      else if (st.isFile()) found.push(relative(root, abs).split(sep).join('/'));
    }
  };
  visit(root);
  return found;
};

const requireDir = (p, flag) => {
  if (!existsSync(p)) fail(`${flag} does not exist: ${p}`);
  if (!statSync(p).isDirectory()) fail(`${flag} is not a directory: ${p}`);
};

const inside = (child, parent) => {
  const p = resolve(parent) + sep;
  return resolve(child).startsWith(p);
};

const takeFlag = (args, flag) => {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  if (i === args.length - 1 || args[i + 1].startsWith('--')) fail(`${flag} needs a value`);
  return args.splice(i, 2)[1];
};

const args = process.argv.slice(2);
const mode = args.shift();
if (mode !== 'snapshot' && mode !== 'verify') fail('first argument must be snapshot or verify');
const target = args.shift();
if (!target || target.startsWith('--')) fail('missing skill directory or manifest path');

if (mode === 'snapshot') {
  const out = takeFlag(args, '--out');
  const copyTo = takeFlag(args, '--copy-to');
  if (!out) fail('snapshot needs --out <HASHES.txt>');
  if (args.length) fail(`unexpected argument ${args[0]}`);

  const root = resolve(target);
  requireDir(root, 'skill directory');
  if (inside(out, root)) fail('--out must be outside the skill directory or it hashes itself');

  const entries = walk(root).map((p) => {
    const abs = join(root, p);
    return { p, sha: sha(abs), bytes: statSync(abs).size };
  });
  if (!entries.length) fail(`no files under ${root}`);

  const header = [
    '# snapshot-package v1',
    `# root: ${root}`,
    `# taken: ${new Date().toISOString()}`,
    `# files: ${entries.length}`,
  ];
  const body = entries.map((e) => `${e.sha}\t${e.bytes}\t${e.p}`);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, `${header.concat(body).join('\n')}\n`);

  let line = `SNAPSHOT_OK root=${root} files=${entries.length} manifest=${resolve(out)}`;
  if (copyTo) {
    if (inside(copyTo, root)) fail('--copy-to must be outside the skill directory');
    for (const e of entries) {
      const dest = join(copyTo, e.p);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, e.p), dest);
      if (sha(dest) !== e.sha) fail(`copy diverged at ${e.p}`);
    }
    line += ` copy=${resolve(copyTo)}`;
  }
  console.log(line);
  process.exit(0);
}

const manifest = resolve(target);
const rootFlag = takeFlag(args, '--root');
const onlyFlag = takeFlag(args, '--only');
if (!rootFlag) fail('verify needs --root <dir>');
if (args.length) fail(`unexpected argument ${args[0]}`);
const root = resolve(rootFlag);
requireDir(root, '--root');
if (!existsSync(manifest)) fail(`cannot read manifest, no such file: ${manifest}`);

const declared = readFileSync(manifest, 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [sha256, bytes, p] = l.split('\t');
    if (!sha256 || !p || !/^[0-9a-f]{64}$/.test(sha256)) fail(`malformed manifest line: ${l}`);
    return { p, sha: sha256, bytes: Number(bytes) };
  });
if (!declared.length) fail(`manifest has no file lines: ${manifest}`);

const only = onlyFlag ? onlyFlag.split(',').map((s) => s.trim()).filter(Boolean) : null;
if (only) {
  for (const p of only) if (!declared.some((e) => e.p === p)) fail(`--only names a file not in the manifest: ${p}`);
}

const current = new Map(walk(root).map((p) => [p, join(root, p)]));
const lines = [];
let changed = 0;
let removed = 0;

for (const e of declared) {
  if (only && !only.includes(e.p)) continue;
  if (!current.has(e.p)) {
    removed += 1;
    lines.push(`REMOVED ${e.p}`);
    continue;
  }
  const now = sha(current.get(e.p));
  if (now !== e.sha) {
    changed += 1;
    lines.push(`CHANGED ${e.p} ${e.sha.slice(0, 12)} -> ${now.slice(0, 12)}`);
  }
}

const known = new Set(declared.map((e) => e.p));
const added = [...current.keys()].filter((p) => !known.has(p)).sort();
for (const p of added) lines.push(`ADDED ${p}`);

const checked = only ? only.length : declared.length;
const drift = changed + removed + added.length;
console.log(
  drift
    ? `VERIFY DRIFT root=${root} checked=${checked} changed=${changed} added=${added.length} removed=${removed}`
    : `VERIFY OK root=${root} checked=${checked} changed=0 added=0 removed=0`,
);
for (const l of lines.slice(0, 40)) console.log(l);
if (lines.length > 40) console.log(`... +${lines.length - 40} more`);
process.exit(drift ? 1 : 0);
