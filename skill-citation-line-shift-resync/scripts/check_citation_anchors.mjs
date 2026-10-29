#!/usr/bin/env node
// Assert both halves of a skill file:line citation: the citing line carries that
// exact target, and the target line still holds the asserted section text.
// Read-only. Prints one row per expectation so the anchor is visible.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HELP = [
  "USAGE: node check_citation_anchors.mjs <skill-dir> --expect <anchors.txt>",
  "       node check_citation_anchors.mjs --self-test",
  "",
  "expectation line:",
  "  SKILL.md:84 -> references/doc.md:249 | ## 11. Running the raster gate",
].join("\n");

const LINE_RE = /^(\S+):(\d+)\s*->\s*(\S+):(\d+)\s*\|\s*(.+)$/;
const PRINT_CAP = 200;

const clip = (s) => String(s).replace(/\s+/g, " ").trim().slice(0, 160);

function usage(msg) {
  console.log(`VERDICT: USAGE_ERROR\n${msg}\n${HELP}`);
  process.exit(2);
}

const args = process.argv.slice(2);
let dir = null;
let expectFile = null;
let selfTest = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h") {
    console.log(HELP);
    process.exit(0);
  } else if (a === "--self-test") {
    selfTest = true;
  } else if (a === "--expect") {
    const v = args[++i];
    if (v === undefined) usage("missing value for --expect");
    expectFile = v;
  } else if (a.startsWith("--")) {
    usage(`unknown argument: ${a}`);
  } else if (dir === null) {
    dir = a;
  } else {
    usage(`unexpected extra argument: ${a}`);
  }
}

if (selfTest) {
  if (dir !== null || expectFile !== null) usage("--self-test takes no other argument");
  selfTestMain();
}

if (dir === null) usage("missing <skill-dir> argument");
if (expectFile === null) usage("missing --expect <anchors.txt>");
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) usage(`not a directory: ${dir}`);
if (!fs.existsSync(path.join(dir, "SKILL.md"))) usage(`no SKILL.md in ${dir}`);
if (!fs.existsSync(expectFile)) usage(`expectation file not found: ${expectFile}`);

const fileCache = new Map();

function lines(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(dir, rel);
  if (!fileCache.has(abs)) {
    fileCache.set(abs, fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? fs.readFileSync(abs, "utf8").split(/\r?\n/)
      : null);
  }
  return { abs, body: fileCache.get(abs) };
}

const rows = fs
  .readFileSync(expectFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l !== "" && !l.startsWith("#"));

const problems = [];
const printed = [];

rows.forEach((row, i) => {
  const where = `line ${i + 1} of ${path.basename(expectFile)}`;
  const m = LINE_RE.exec(row);
  if (!m) {
    problems.push(`${where}: unparseable expectation: ${clip(row)}`);
    return;
  }
  const [, srcRel, srcLineStr, tgtRel, tgtLineStr, expected] = m;
  const srcLine = Number(srcLineStr);
  const tgtLine = Number(tgtLineStr);
  const here = `${srcRel}:${srcLine} -> ${tgtRel}:${tgtLine}`;

  const src = lines(srcRel);
  if (src.body === null) {
    problems.push(`${here}: citing file not found`);
    return;
  }
  if (srcLine < 1 || srcLine > src.body.length) {
    problems.push(`${here}: citing line out of range (${src.body.length} lines)`);
    return;
  }
  const needle = `${tgtRel}:${tgtLine}`;
  if (!src.body[srcLine - 1].includes(needle)) {
    problems.push(`${here}: citing line does not contain "${needle}"`);
    return;
  }

  const tgt = lines(tgtRel);
  if (tgt.body === null) {
    problems.push(`${here}: target file not found`);
    return;
  }
  if (tgtLine < 1 || tgtLine > tgt.body.length) {
    problems.push(`${here}: target line out of range (${tgt.body.length} lines)`);
    return;
  }
  const actual = tgt.body[tgtLine - 1];
  const want = expected.replace(/\s+/g, " ").trim();
  if (!actual.replace(/\s+/g, " ").trim().includes(want)) {
    problems.push(`${here}: anchor mismatch, expected "${want}", got "${clip(actual)}"`);
    return;
  }
  printed.push(`OK  ${here} | ${clip(actual)}`);
});

for (const l of printed.slice(0, PRINT_CAP)) console.log(l);
if (printed.length > PRINT_CAP) {
  console.log(`… ${printed.length - PRINT_CAP} more passed rows suppressed`);
}
console.log(`expectations: ${rows.length}  passed: ${printed.length}  failed: ${problems.length}`);
if (problems.length) {
  console.log("VERDICT: PROBLEM");
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
console.log("VERDICT: OK");
console.log(
  "note: this asserts the printed anchor text per expectation. It does not prove every citation in the package was listed.",
);
process.exit(0);

function selfTestMain() {
  const script = fileURLToPath(import.meta.url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-anchors-"));
  const pkg = path.join(tmp, "fixture");
  fs.mkdirSync(path.join(pkg, "references"), { recursive: true });

  const doc = [];
  for (let n = 1; n <= 260; n++) doc.push(`filler line ${n}`);
  doc[244] = "| `RASTER_CONTROL_FAILED` | the known-different control reported zero | discard |";
  doc[248] = "## 11. Running the raster gate";
  fs.writeFileSync(path.join(pkg, "references", "doc.md"), doc.join("\n") + "\n");

  const skill = [
    "---",
    "name: fixture",
    "description: Selftest fixture for the citation anchor checker; not a real skill.",
    "---",
    "Gate: (references/doc.md:249).",
    "Stale: (references/doc.md:245).",
    "Missing: (references/doc.md:9999).",
  ];
  fs.writeFileSync(path.join(pkg, "SKILL.md"), skill.join("\n") + "\n");

  const write = (name, body) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, body);
    return p;
  };
  const good = write("good.txt", "SKILL.md:5 -> references/doc.md:249 | ## 11. Running the raster gate\n");
  const stale = write("stale.txt", "SKILL.md:6 -> references/doc.md:245 | ## 11. Running the raster gate\n");
  const notInSource = write("not-in-source.txt", "SKILL.md:5 -> references/doc.md:249 | ## 9. Wrong section text\n");
  const outOfRange = write("out-of-range.txt", "SKILL.md:7 -> references/doc.md:9999 | anything\n");

  const cases = [
    ["green package", [pkg, "--expect", good], 0, "VERDICT: OK"],
    ["stale anchor must fail", [pkg, "--expect", stale], 1, "anchor mismatch"],
    ["wrong anchor text on a real line", [pkg, "--expect", notInSource], 1, "anchor mismatch"],
    ["target line out of range", [pkg, "--expect", outOfRange], 1, "target line out of range"],
    ["usage: missing --expect", [pkg], 2, "VERDICT: USAGE_ERROR"],
    ["usage: missing file", [pkg, "--expect", path.join(tmp, "nope.txt")], 2, "VERDICT: USAGE_ERROR"],
    ["help: --help", ["--help"], 0, "USAGE:"],
  ];

  let failed = 0;
  for (const [label, argv, wantCode, marker] of cases) {
    const r = spawnSync(process.execPath, [script, ...argv], { encoding: "utf8" });
    const ok = r.status === wantCode && String(r.stdout || "").includes(marker);
    if (!ok) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}  ->  exit ${r.status} (want ${wantCode}), marker "${marker}"`,
    );
    if (!ok) {
      console.log(`      stdout: ${clip(r.stdout || "")}`);
      if (r.stderr) console.log(`      stderr: ${clip(r.stderr)}`);
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(
    `SELFTEST: ${failed === 0 ? "PASS" : "FAIL"} cases=${cases.length} failed=${failed} fixtures_removed=${!fs.existsSync(tmp)}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}
