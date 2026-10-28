#!/usr/bin/env node
// Read-only skill-package checker.
//   node check_skill.mjs <skill-dir>
//   node check_skill.mjs --self-test        exercise every assertion, exit 0 only if all fire
//   node check_skill.mjs --check-refs <dir> additionally require backticked scripts/ paths to exist
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Built at runtime so this file never contains the marker literal itself.
const TODO_MARKER = "TO" + "DO" + ":";
const HELP = [
  "USAGE: node check_skill.mjs <skill-dir>",
  "       node check_skill.mjs --self-test",
  "       node check_skill.mjs --check-refs <skill-dir>",
].join("\n");
// Spliced at runtime so this file never carries the backtick-delimited sample.
const MARK = "M" + "A" + "R" + "K";
const SAMPLE = String.raw`\u0060` + MARK;

function checkPackage(dir, opts = {}) {
  const refs = opts.refs === true;
  if (!fs.existsSync(dir)) return { verdict: "USAGE", line: `not found: ${dir}` };
  if (!fs.statSync(dir).isDirectory()) return { verdict: "USAGE", line: `not a directory: ${dir}` };
  const skillPath = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillPath)) return { verdict: "USAGE", line: `no SKILL.md in ${dir}` };

  const problems = [];
  const text = fs.readFileSync(skillPath, "utf8");
  const lines = text.split(/\r?\n/);

  // frontmatter
  if (lines[0] !== "---") problems.push("SKILL.md must start with '---'");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { end = i; break; }
  }
  if (end === -1) problems.push("no closing '---' for frontmatter");

  let name = null;
  let descLen = 0;
  if (end !== -1) {
    const fm = lines.slice(1, end);
    const nameMatch = fm.find((l) => /^name:\s*(.+)$/.test(l));
    if (!nameMatch) problems.push("frontmatter missing 'name'");
    else {
      name = nameMatch.replace(/^name:\s*/, "").trim();
      if (!/^[a-z0-9-]+$/.test(name)) problems.push(`name not hyphen-case: ${name}`);
      const folder = path.basename(path.resolve(dir));
      if (folder !== name) problems.push(`name '${name}' != folder '${folder}'`);
    }
    const descMatch = fm.find((l) => /^description:\s*(.*)$/.test(l));
    if (!descMatch) problems.push("frontmatter missing 'description'");
    else {
      const raw = descMatch.replace(/^description:\s*/, "");
      const value = raw.trim();
      if (/^[|>][+-]?\d*$/.test(value)) {
        problems.push(
          `description is a block scalar ('${value}') — the loader needs a single-line string`,
        );
        descLen = value.length;
      } else {
        descLen = value.length;
        // A plain scalar continues while the next lines stay indented inside the
        // block; the naive first-line match alone would pass those as "single-line".
        const cont = [];
        for (let i = fm.indexOf(descMatch) + 1; i < fm.length; i++) {
          const l = fm[i];
          if (/^[A-Za-z0-9_-]+:/.test(l)) break;
          if (/^(?:\s+\S|\s*$)/.test(l)) {
            if (l.trim()) cont.push(l.trim());
          } else break;
        }
        if (cont.length) {
          problems.push(
            `description spans ${cont.length + 1} physical lines — not single-line`,
          );
          descLen += cont.join(" ").length;
        }
        if (descLen > 1024) problems.push(`description ${descLen} chars > 1024`);
      }
    }
    const body = lines.slice(end + 1);
    if (body.length >= 500) problems.push(`body ${body.length} lines >= 500`);
    body.forEach((l, i) => {
      if (l.includes(TODO_MARKER)) problems.push(`${TODO_MARKER} at body line ${i + 1}`);
    });
  }

  // relative markdown links in SKILL.md must resolve
  const linkRe = /\]\((?!https?:\/\/|#|mailto:)([^)#?]+)(?:#[^)]*)?\)/g;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    const target = path.resolve(dir, m[1].trim());
    if (!fs.existsSync(target)) problems.push(`broken relative link: ${m[1]}`);
  }

  // Opt-in: bundled resources named only in inline code (never a []() link) are
  // otherwise unchecked. Off by default so existing wording stays valid.
  if (refs) {
    const sampleRe = new RegExp(SAMPLE + "(?:scripts|references|assets)" + SAMPLE, "g");
    const probe = text.replace(sampleRe, "");
    const refRe = /`((?:scripts|references|assets)\/[A-Za-z0-9._/-]+)`/g;
    let r;
    while ((r = refRe.exec(probe)) !== null) {
      if (!fs.existsSync(path.resolve(dir, r[1]))) {
        problems.push(`broken inline-code path: ${r[1]}`);
      }
    }
  }

  // extraneous docs at skill root
  const extraneous = ["README.md", "CHANGELOG.md", "INSTALLATION_GUIDE.md", "LICENSE.md"];
  for (const f of extraneous) {
    if (fs.existsSync(path.join(dir, f))) problems.push(`extraneous file: ${f}`);
  }

  // Anything else at the root is unexpected too: the known shape is SKILL.md plus
  // the scripts/, references/, assets/ directories.
  const allowedRoot = new Set(["SKILL.md", "scripts", "references", "assets"]);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!allowedRoot.has(e.name)) {
      problems.push(`unexpected root entry: ${e.name}${e.isDirectory() ? "/" : ""}`);
    }
  }

  // TODO scan across all text files
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|mjs|js|cjs|ts|json|sh)$/i.test(e.name)) {
        const t = fs.readFileSync(p, "utf8");
        t.split(/\r?\n/).forEach((l, i) => {
          if (l.includes(TODO_MARKER) && p !== skillPath)
            problems.push(`${TODO_MARKER} in ${path.relative(dir, p)} line ${i + 1}`);
        });
      }
    }
  }
  walk(dir);

  if (problems.length) return { verdict: "PROBLEM", problems, skillPath };
  return { verdict: "OK", name, descLen, skillPath };
}

// ---- self-test ----------------------------------------------------------

const F = (name, desc) => ["---", `name: ${name}`, `description: ${desc}`, "---", "# t", "", "body", ""].join("\n");
const MARKER = "T0D0" + "_MARK";
const withMarker = (s) => s.split(MARKER).join(TODO_MARKER);

const GREEN = {
  folder: "green",
  skill: ["---", "name: green", "description: a valid single-line description", "---", "# Green", "",
    "Body text with a real link.", "", "[target](scripts/check_target.mjs)", ""].join("\n"),
  files: { "scripts/check_target.mjs": "console.log('ok');\n" },
};

const FIXTURES = {
  u_noarg: GREEN,
  u_missing: { synthetic: "does-not-exist" },
  u_notdir: { synthetic: "green/SKILL.md" },
  u_noskill: { folder: "empty-dir-no-skill-md" },
  p_nostart: { folder: "p-nostart", skill: "name: p-nostart\ndescription: d\n---\n# t\n" },
  p_noend: { folder: "p-noend", skill: "---\nname: p-noend\ndescription: d\n# no closing fence\n" },
  p_noname: { folder: "p-noname", skill: "---\ndescription: only a description\n---\n# t\n" },
  p_hyphen: { folder: "p-hyphen", skill: F("Bad_Name", "d") },
  p_folder: { folder: "p-folder", skill: F("a-different-name", "d") },
  p_folded: { folder: "p-folded", skill: "---\nname: p-folded\ndescription: first half\n   second folded half\n---\n# t\n" },
  p_block: { folder: "p-block", skill: "---\nname: p-block\ndescription: >\n  folded block\n---\n# t\n" },
  p_desclong: { folder: "p-desclong", skill: F("p-desclong", "x".repeat(1030)) },
  p_nodesc: { folder: "p-nodesc", skill: "---\nname: p-nodesc\n---\n# t\n" },
  p_bodylong: { folder: "p-bodylong", skill: ["---", "name: p-bodylong", "description: d", "---",
    ...Array.from({ length: 501 }, (_, i) => `l${i}`)].join("\n") },
  p_todobody: { folder: "p-todobody", skillWithMarker: F("p-todobody", "d").replace("\nbody\n", `\n${MARKER}: leftover\n`) },
  p_link: { folder: "p-link", skill: F("p-link", "d").replace("\nbody\n", "\n[gone](scripts/gone.mjs)\n") },
  p_readme: { folder: "p-readme", skill: F("p-readme", "d"), files: { "README.md": "x\n" } },
  p_stray: { folder: "p-stray", skill: F("p-stray", "d"), files: { ".DS_Store": "junk" } },
  p_todoextra: { folder: "p-todoextra", skill: F("p-todoextra", "d"), filesWithMarker: { "scripts/helper.mjs": `${MARKER}: in a script\n` } },
  p_ghostref: { folder: "p-ghostref", skill: "" },
};
// A resource named only in inline code, so the default link scan never sees it.
FIXTURES.p_ghostref.skill = ["---", "name: p-ghostref", "description: d", "---", "# t", "",
  "Run \u0060scripts/ghost.mjs\u0060 to check.", ""].join("\n");

// `expect` is the verbatim fragment the checker emits, never a paraphrase: a
// paraphrased needle reads as DEAD and hides a fixture that does not bite.
const ASSERTIONS = [
  { id: "usage: missing <skill-dir> argument", kind: "cli", args: [], exit: 2, expect: "missing <skill-dir> argument" },
  { id: "usage: not found", kind: "usage", fix: "u_missing", expect: "not found:" },
  { id: "usage: not a directory", kind: "usage", fix: "u_notdir", expect: "not a directory:" },
  { id: "usage: no SKILL.md", kind: "usage", fix: "u_noskill", expect: "no SKILL.md in" },
  { id: "frontmatter must start with '---'", kind: "problem", fix: "p_nostart", expect: "must start with '---'" },
  { id: "no closing '---' for frontmatter", kind: "problem", fix: "p_noend", expect: "no closing '---'" },
  { id: "frontmatter missing 'name'", kind: "problem", fix: "p_noname", expect: "frontmatter missing 'name'" },
  { id: "name not hyphen-case", kind: "problem", fix: "p_hyphen", expect: "name not hyphen-case" },
  { id: "name != folder", kind: "problem", fix: "p_folder", expect: "!= folder" },
  { id: "description spans physical lines", kind: "problem", fix: "p_folded", expect: "not single-line" },
  { id: "description is a block scalar", kind: "problem", fix: "p_block", expect: "block scalar" },
  { id: "description > 1024", kind: "problem", fix: "p_desclong", expect: "> 1024" },
  { id: "frontmatter missing 'description'", kind: "problem", fix: "p_nodesc", expect: "frontmatter missing 'description'" },
  { id: "body >= 500 lines", kind: "problem", fix: "p_bodylong", expect: "lines >= 500" },
  { id: `to-do marker in SKILL.md body`, kind: "problem", fix: "p_todobody", expect: TODO_MARKER },
  { id: "broken relative link", kind: "problem", fix: "p_link", expect: "broken relative link" },
  { id: "extraneous file", kind: "problem", fix: "p_readme", expect: "extraneous file" },
  { id: "unexpected root entry", kind: "problem", fix: "p_stray", expect: "unexpected root entry" },
  { id: "to-do marker in another file", kind: "problem", fix: "p_todoextra", expect: "in scripts/helper.mjs" },
  { id: "broken inline-code path (needs --check-refs)", kind: "problem", fix: "p_ghostref", expect: "broken inline-code path", refs: true },
];

function buildFixtures(root) {
  const made = {};
  const writeDir = (spec) => {
    const dir = path.join(root, spec.folder);
    fs.mkdirSync(dir, { recursive: true });
    if (spec.skill) fs.writeFileSync(path.join(dir, "SKILL.md"), spec.skill);
    if (spec.skillWithMarker) fs.writeFileSync(path.join(dir, "SKILL.md"), withMarker(spec.skillWithMarker));
    for (const bucket of ["files", "filesWithMarker"]) {
      for (const [rel, content] of Object.entries(spec[bucket] || {})) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, bucket === "filesWithMarker" ? withMarker(content) : content);
      }
    }
    return dir;
  };
  for (const [key, spec] of Object.entries(FIXTURES)) {
    if (spec.synthetic) { made[key] = path.join(root, spec.synthetic); continue; }
    made[key] = writeDir(spec);
  }
  return made;
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-skill-selftest-"));
  const dirs = buildFixtures(root);
  let fires = 0, dead = 0;

  // The no-argument fixture doubles as the green package: it is a valid skill.
  const green = checkPackage(dirs.u_noarg);
  const greenOk = green.verdict === "OK";
  console.log(greenOk
    ? `GREEN: VERDICT: OK (name=${green.name})`
    : `GREEN: FAIL verdict=${green.verdict} ${JSON.stringify(green.problems || green.line)}`);

  for (const a of ASSERTIONS) {
    if (a.kind === "cli") {
      // Spawn the real CLI: proves arg parsing and the verdict-to-exit mapping,
      // which checkPackage() alone cannot see.
      const r = spawnSync(process.execPath, [process.argv[1], ...a.args], { encoding: "utf8" });
      const out = String(r.stdout);
      const hit = r.status === a.exit && out.includes(a.expect);
      if (hit) { fires++; console.log(`FIRES   ${a.id}  ->  exit ${r.status}, ${out.split("\n")[1] || out.split("\n")[0]}`); }
      else { dead++; console.log(`DEAD    ${a.id}  ->  exit ${r.status} (want ${a.exit}) ${out.split("\n").slice(0, 2).join(" / ")}`); }
      continue;
    }
    const r = checkPackage(dirs[a.fix], { refs: a.refs === true });
    let hit, shown;
    if (a.kind === "usage") {
      hit = r.verdict === "USAGE" && String(r.line).startsWith(a.expect);
      shown = String(r.line).split("\n")[0];
    } else {
      const list = r.problems || [];
      hit = r.verdict === "PROBLEM" && list.some((p) => p.includes(a.expect));
      shown = list.find((p) => p.includes(a.expect)) || `${r.verdict} ${JSON.stringify(r.line || list)}`;
    }
    if (hit) { fires++; console.log(`FIRES   ${a.id}  ->  ${String(shown).split("\n")[0]}`); }
    else { dead++; console.log(`DEAD    ${a.id}  ->  ${String(shown).split("\n")[0]}`); }
  }

  fs.rmSync(root, { recursive: true, force: true });
  const removed = !fs.existsSync(root);
  const total = ASSERTIONS.length;
  if (!greenOk || dead) {
    console.log(`SELFTEST: FAIL assertions=${total} fires=${fires} dead=${dead} green=${greenOk ? "OK" : "FAIL"} fixtures_removed=${removed}`);
    process.exit(1);
  }
  console.log(`SELFTEST: PASS assertions=${total} fires=${fires} dead=0 green=OK fixtures_removed=${removed}`);
  process.exit(0);
}

// ---- CLI ----------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { console.log(HELP); process.exit(0); }
if (args.includes("--self-test")) selfTest();
const refs = args.includes("--check-refs");
const positional = args.filter((a) => !a.startsWith("--"));
if (positional.length === 0) { console.log(`VERDICT: USAGE_ERROR\nmissing <skill-dir> argument\n${HELP}`); process.exit(2); }
if (positional.length > 1) { console.log(`VERDICT: USAGE_ERROR\nunexpected extra argument: ${positional[1]}\n${HELP}`); process.exit(2); }

const r = checkPackage(positional[0], { refs });
if (r.verdict === "USAGE") { console.log(`VERDICT: USAGE_ERROR\n${r.line}`); process.exit(2); }
if (r.verdict === "PROBLEM") {
  console.log("VERDICT: PROBLEM");
  for (const p of r.problems) console.log(`- ${p}`);
  console.log(`checked: ${r.skillPath}`);
  process.exit(1);
}
console.log("VERDICT: OK");
console.log(`checked: ${r.skillPath}`);
console.log(`name=${r.name} description=${r.descLen} chars`);
process.exit(0);
