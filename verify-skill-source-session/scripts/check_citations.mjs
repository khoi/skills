#!/usr/bin/env node
// Read-only file:line citation checker for a skill package.
// Usage: node check_citations.mjs <skill-dir> [--root <workspace-dir>] [--full]
// Proves a cited file exists and the cited line numbers are in range, then
// prints the actual line so the asserted wording can be compared by eye.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXT_RE =
  "(?:mjs|cjs|js|ts|tsx|jsx|py|sh|bash|swift|md|markdown|json|ya?ml|toml|csv|txt|html|css|pdf|go|rb)";
const CITATION_RE = new RegExp(
  "([~A-Za-z0-9._/-]+\\." + EXT_RE + "):(\\d+)(?:-(\\d+))?",
  "g",
);
const PRINT_CAP = 120;

const args = process.argv.slice(2);
let dir = null;
let root = process.cwd();
let full = false;

function usage(msg) {
  const line =
    "usage: node check_citations.mjs <skill-dir> [--root <workspace-dir>] [--full]";
  if (msg) console.log(`VERDICT: USAGE_ERROR\n${msg}\n${line}`);
  else console.log(line);
  process.exit(2);
}

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--root") {
    const v = args[++i];
    if (v === undefined) usage("missing value for --root");
    root = v;
  } else if (a === "--full") {
    full = true;
  } else if (a.startsWith("--")) {
    usage(`unknown argument: ${a}`);
  } else if (dir === null) {
    dir = a;
  } else {
    usage(`unexpected extra argument: ${a}`);
  }
}

if (dir === null) usage("missing <skill-dir> argument");
if (!fs.existsSync(dir)) usage(`not found: ${dir}`);
if (!fs.statSync(dir).isDirectory()) usage(`not a directory: ${dir}`);
if (!fs.existsSync(path.join(dir, "SKILL.md"))) usage(`no SKILL.md in ${dir}`);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
  usage(`--root is not a directory: ${root}`);

function expand(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (path.isAbsolute(p)) return p;
  return null;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "vendor"]);
const NAME_SEARCH_MAX_DEPTH = 5;
const NAME_SEARCH_MAX_ENTRIES = 20000;
let nameCache = new Map();

function searchByName(base) {
  if (nameCache.has(base)) return nameCache.get(base);
  const hits = [];
  let seen = 0;
  (function walk(d, depth) {
    if (depth > NAME_SEARCH_MAX_DEPTH || seen > NAME_SEARCH_MAX_ENTRIES) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      seen++;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p, depth + 1);
      } else if (e.name === base) {
        hits.push(p);
        if (hits.length > 1) break;
      }
    }
  })(root, 0);
  nameCache.set(base, hits);
  return hits;
}

// A bare relative citation may mean "inside this skill" or "inside the project
// the skill documents", so both bases are tried and the first existing wins. A
// filename written without its path is resolved by a bounded name search: one
// hit is usable but flagged, several hits are ambiguous.
function resolveTarget(rel) {
  const abs = expand(rel);
  if (abs) return { found: fs.existsSync(abs) ? abs : null, candidates: [abs] };
  const local = path.resolve(dir, rel);
  const project = path.resolve(root, rel);
  const direct = [local, project].find((c) => fs.existsSync(c));
  if (direct) return { found: direct, candidates: [local, project] };
  const base = path.basename(rel);
  if (base === rel) {
    const hits = searchByName(base);
    if (hits.length === 1) return { found: hits[0], candidates: [local, project], byName: true };
    if (hits.length > 1) return { found: null, candidates: hits, ambiguous: true };
  }
  return { found: null, candidates: [local, project] };
}

const mdFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(md|markdown)$/i.test(e.name)) mdFiles.push(p);
  }
})(dir);

const problems = [];
const notes = [];
const printed = [];
let total = 0;
const filesUsed = new Set();

for (const file of mdFiles) {
  const text = fs.readFileSync(file, "utf8");
  const own = path.relative(dir, file);
  let m;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    total++;
    const [, ref, startStr, endStr] = m;
    const start = Number(startStr);
    const end = endStr === undefined ? start : Number(endStr);
    const here = `${own}:${text.slice(0, m.index).split(/\r?\n/).length}`;
    const { found, candidates, byName, ambiguous } = resolveTarget(ref);
    if (!found) {
      if (ambiguous)
        problems.push(
          `${here} -> ${ref}:${startStr} ambiguous filename (${candidates.join(" | ")}); cite it with its directory`,
        );
      else
        problems.push(`${here} -> ${ref}:${startStr} file not found (${candidates.join(" | ")})`);
      continue;
    }
    if (byName) notes.push(`${here} -> ${ref}:${startStr} resolved by name search to ${path.relative(root, found)}; write the path`);
    filesUsed.add(found);
    const lines = fs.readFileSync(found, "utf8").split(/\r?\n/);
    const max = lines.length;
    if (start < 1 || start > max) {
      problems.push(`${here} -> ${ref}:${startStr} line out of range (${max} lines)`);
      continue;
    }
    if (end > max) {
      problems.push(`${here} -> ${ref}-${end} end line out of range (${max} lines)`);
      continue;
    }
    const clip = (s) => s.replace(/\s+/g, " ").trim().slice(0, 140);
    const shape = end === start ? `${ref}:${start}` : `${ref}:${start}-${end}`;
    printed.push(`OK  ${here} -> ${shape} | ${clip(lines[start - 1])}`);
    if (end !== start) {
      printed.push(`    ${shape} last | ${clip(lines[end - 1])}`);
      const span = end - start + 1;
      if (span > 40) {
        problems.push(`${here} -> ${shape} spans ${span} lines; cite the declaration line instead`);
      }
    }
  }
}

const shown = full ? printed : printed.slice(0, PRINT_CAP);
console.log(
  `md files scanned: ${mdFiles.length}  citations: ${total}  in range: ${printed.filter((l) => l.startsWith("OK")).length}  distinct targets: ${filesUsed.size}`,
);
for (const l of shown) console.log(l);
if (!full && printed.length > PRINT_CAP)
  console.log(`… ${printed.length - PRINT_CAP} more citation lines suppressed; rerun with --full`);

console.log(
  "note: this proves the cited file exists and the cited line numbers are in range. The printed line still has to be compared against the wording the skill asserts.",
);

for (const n of notes) console.log(`NOTE ${n}`);

if (problems.length) {
  console.log("VERDICT: PROBLEM");
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
console.log("VERDICT: OK");
process.exit(0);
