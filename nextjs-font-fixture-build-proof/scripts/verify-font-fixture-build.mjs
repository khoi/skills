#!/usr/bin/env node
// Measure a Next.js font fixture, and prove a build consumed exactly it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const USAGE = `USAGE:
  node verify-font-fixture-build.mjs fixture --fixture <f.json|f.cjs> [--font-root <dir>]
      [--require-families "Inter,Lexend"] [--json]
  node verify-font-fixture-build.mjs emitted --fixture <f> --media <dir> --log <build.log> [--json]

Exit codes: 0 pass, 1 verification failed, 2 usage error.`;

function usage(message) {
  process.stderr.write(`ERROR: ${message}\n${USAGE}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = {};
  let mode;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      if (mode !== undefined) usage('unexpected positional argument: ' + arg);
      mode = arg;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    const allowed = ['--fixture', '--font-root', '--require-families', '--media', '--log'];
    if (!allowed.includes(arg)) usage('unknown argument: ' + arg);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) usage('missing value for ' + arg);
    options[arg.slice(2)] = value;
    i += 1;
  }
  if (mode !== 'fixture' && mode !== 'emitted') usage('mode must be fixture or emitted');
  if (!options.fixture) usage('--fixture is required');
  if (mode === 'emitted' && (!options.media || !options.log)) usage('emitted mode requires --media and --log');
  return { mode, options };
}

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const normalizeFamily = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    usage('fixture not readable: ' + file);
  }
}

// A fixture is either the JSON map {googleCssUrl: css} or a .cjs object literal with the same shape.
function parseFixture(file) {
  const src = readText(file);
  if (path.extname(file).toLowerCase() === '.json') {
    let parsed;
    try {
      parsed = JSON.parse(src);
    } catch {
      usage('fixture is not valid JSON: ' + file);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) usage('fixture JSON must be an object');
    return { kind: 'json', bodies: Object.values(parsed).filter((v) => typeof v === 'string'), text: src };
  }
  return { kind: 'module', bodies: [src], text: src };
}

function familiesOf(text) {
  const found = new Set();
  for (const m of text.matchAll(/family=([^&:"'\s)]+)/g)) found.add(decodeURIComponent(m[1].replace(/\+/g, ' ')));
  return [...found];
}

function fontPaths(bodies, fontRoot) {
  const refs = new Map();
  for (const body of bodies) {
    for (const m of body.matchAll(/url\(\s*['"]?([^)'"\s]+\.woff2)['"]?\s*\)/gi)) {
      const raw = m[1];
      const resolved = path.isAbsolute(raw) ? raw : path.resolve(fontRoot ?? '.', raw);
      if (!refs.has(resolved)) refs.set(resolved, raw);
    }
  }
  return refs;
}

function runFixture(options) {
  const parsed = parseFixture(options['fixture']);
  const fontRoot = options['font-root'] ? path.resolve(options['font-root']) : null;
  const refs = fontPaths(parsed.bodies, fontRoot);

  const files = [];
  const missing = [];
  const contentAddressMismatch = [];
  for (const [file] of refs) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missing.push(file);
      continue;
    }
    const digest = sha256(file);
    const stem = path.basename(file, path.extname(file)).toLowerCase();
    const isContentAddressed = /^[0-9a-f]{64}$/.test(stem);
    files.push({ file, digest, contentAddressed: isContentAddressed && stem === digest });
    if (isContentAddressed && stem !== digest) contentAddressMismatch.push({ file, stem, digest });
  }

  const families = familiesOf(parsed.text);
  const required = (options['require-families'] ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const have = new Set(families.map(normalizeFamily));
  const uncoveredFamilies = required.filter((f) => !have.has(normalizeFamily(f)));
  const uniqueDigests = new Set(files.map((f) => f.digest));

  const errors = [];
  if (missing.length) errors.push(`${missing.length} referenced font file(s) missing`);
  if (contentAddressMismatch.length) errors.push(`${contentAddressMismatch.length} content-address mismatch(es)`);
  if (uncoveredFamilies.length) errors.push(`fixture does not cover required family: ${uncoveredFamilies.join(', ')}`);
  if (!uniqueDigests.size) errors.push('fixture references no WOFF2 bytes');

  return {
    mode: 'fixture',
    fixture: path.resolve(options['fixture']),
    fixtureSha256: sha256(options['fixture']),
    families,
    requiredFamilies: required,
    uncoveredFamilies,
    woff2Files: files.length,
    uniqueDigests: uniqueDigests.size,
    missing,
    contentAddressMismatch,
    digests: [...uniqueDigests].sort(),
    passed: errors.length === 0,
    errors,
    lines: [
      `fixture ${path.basename(options['fixture'])} sha256=${sha256(options['fixture']).slice(0, 16)}`,
      `families=${families.length} (${families.join(', ') || 'none detected'})`,
      `woff2=${files.length} unique=${uniqueDigests.size} missing=${missing.length} content_address_mismatch=${contentAddressMismatch.length}`,
      ...(required.length ? [`required_families_covered=${required.length - uncoveredFamilies.length}/${required.length}`] : []),
    ],
  };
}

function runEmitted(options) {
  const fixture = runFixture({ ...options, 'require-families': options['require-families'] });
  const media = path.resolve(options['media']);
  if (!fs.existsSync(media)) usage('media directory not found: ' + media);
  const log = path.resolve(options['log']);
  const logText = readText(log);

  const emitted = fs.readdirSync(media)
    .filter((name) => name.toLowerCase().endsWith('.woff2'))
    .map((name) => ({ name, digest: sha256(path.join(media, name)) }));
  const emittedDigests = new Set(emitted.map((f) => f.digest));
  const fixtureDigests = new Set(fixture.digests);

  const extra = [...emittedDigests].filter((d) => !fixtureDigests.has(d));
  const absent = [...fixtureDigests].filter((d) => !emittedDigests.has(d));
  const googleUrls = (logText.match(/fonts\.(?:googleapis|gstatic)\.com/g) ?? []).length;

  const errors = [...fixture.errors];
  if (!emitted.length) errors.push('no .woff2 emitted');
  if (extra.length) errors.push(`${extra.length} emitted font(s) not bound to the fixture`);
  if (absent.length) errors.push(`${absent.length} fixture font(s) not emitted`);
  if (googleUrls) errors.push(`build log references ${googleUrls} Google font URL(s)`);

  return {
    ...fixture,
    mode: 'emitted',
    media,
    log,
    emitted: emitted.length,
    emittedUnique: emittedDigests.size,
    fixtureUnique: fixtureDigests.size,
    emittedNotInFixture: extra,
    fixtureNotEmitted: absent,
    googleFontUrlsInLog: googleUrls,
    passed: errors.length === 0,
    errors,
    lines: [
      `emitted=${emitted.length} unique=${emittedDigests.size} fixture=${fixtureDigests.size}`,
      `emitted_not_in_fixture=${extra.length} fixture_not_emitted=${absent.length}`,
      `google_font_urls_in_log=${googleUrls}`,
    ],
  };
}

const { mode, options } = parseArgs(process.argv.slice(2));
const result = mode === 'fixture' ? runFixture(options) : runEmitted(options);

if (options.json) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  for (const line of result.lines) process.stdout.write(line + '\n');
  for (const error of result.errors) process.stdout.write(`FAIL ${error}\n`);
  process.stdout.write(`VERDICT: ${result.passed ? 'PASS' : 'FAIL'}\n`);
}
process.exit(result.passed ? 0 : 1);
