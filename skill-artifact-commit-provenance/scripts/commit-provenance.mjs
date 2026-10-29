#!/usr/bin/env node
// Read-only commit provenance inspector. Computes digests; writes no files.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const EXIT = { OK: 0, DRIFT: 1, USAGE: 2, OUTSIDE_REPO: 3, CHAIN_INCOMPLETE: 4 };

const USAGE = `USAGE
  node commit-provenance.mjs <artifact-path> [options]

Prints the repository that owns <artifact-path> and its SHA-256 identity chain
H0 (expected) / H1 (worktree) / H2 (index) / H3 (HEAD), the staged set, and
whether referenced resources are tracked. Read-only: writes no files.

OPTIONS
  --expect <sha256>    H0, the digest recorded after validation (optional)
  --require-complete   H2 and H3 must both exist (exit 4 otherwise)
  --ref <path>         repo-relative resource to test; repeatable; must not be
                       absolute or contain a ".." segment
  --expect-path <path> additional repo-relative path that must be staged with
                       the artifact; repeatable; same validity rules as --ref
  --refs-none          declare that the enumeration found zero referenced
                       resources; PACKAGE becomes "complete (0 referenced
                       resources)"; not combinable with --ref
  -h, --help           print this text

OUTPUT LINES
  H1_WORKTREE / H2_INDEX / H3_HEAD   content digests (absent = not at that stage)
  CHAIN                              h0=h1, h1=h2, h2=h3 comparisons
  TARGET_STAGED                      no | yes | deleted
  STAGED_PATHS / STAGED_EXTRA        the staged set, and entries other than the
                                     expected paths
  EXPECT_PATHS / STAGED_MISSING      with --expect-path: the extra expected paths,
                                     and those not staged (not-checked before the
                                     artifact itself is staged)
  REF <path> / PACKAGE               tracked or untracked per referenced resource;
                                     PACKAGE stays not-checked until --ref or
                                     --refs-none says what was enumerated
  TRACKED_FILES / UNTRACKED_FILES    recursive counts from git ls-files

VERDICTS / EXIT
  MATCH 0   MEASURED_ONLY 0   DRIFT 1   USAGE 2   OUTSIDE_REPO 3
  CHAIN_INCOMPLETE 4        STAGED_SET_NOT_EXACT 1   CHAIN_BROKEN 1`;

class UsageError extends Error {}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const nul = (buf) => buf.toString("utf8").split("\0").filter(Boolean);
const firstLine = (buf) => (buf && buf.toString("utf8").split("\n")[0].trim()) || "";

function validateRef(ref, flag = "--ref") {
  const segments = ref.split(/[\\/]/);
  if (!ref) throw new UsageError(`${flag} must be a non-empty repo-relative path`);
  if (path.isAbsolute(ref)) throw new UsageError(`${flag} must be repo-relative, not absolute: ${ref}`);
  if (segments.includes("..")) throw new UsageError(`${flag} must not contain a ".." segment: ${ref}`);
  if (ref.startsWith("-")) throw new UsageError(`${flag} must not start with "-": ${ref}`);
  return ref;
}

function git(root, args, { allowFail = false } = {}) {
  try {
    return {
      status: 0,
      stdout: execFileSync("git", ["-C", root, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      }),
      stderr: Buffer.alloc(0),
    };
  } catch (err) {
    if (err.code === "ENOENT") throw new UsageError("git executable not found");
    const status = typeof err.status === "number" ? err.status : 1;
    const result = {
      status,
      stdout: err.stdout ?? Buffer.alloc(0),
      stderr: err.stderr ?? Buffer.alloc(0),
    };
    if (allowFail) return result;
    throw new UsageError(`git ${args.join(" ")} failed: ${firstLine(result.stderr) || `exit ${status}`}`);
  }
}

function parseArgs(argv) {
  const opts = { artifact: null, expect: null, requireComplete: false, refs: [], refsNone: false, expectPaths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${USAGE}\n`);
      process.exit(EXIT.OK);
    } else if (arg === "--expect") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError("missing value for --expect");
      opts.expect = value;
    } else if (arg === "--require-complete") {
      opts.requireComplete = true;
    } else if (arg === "--expect-path") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError("missing value for --expect-path");
      opts.expectPaths.push(validateRef(value, "--expect-path"));
    } else if (arg === "--refs-none") {
      opts.refsNone = true;
    } else if (arg === "--ref") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError("missing value for --ref");
      opts.refs.push(validateRef(value));
    } else if (arg.startsWith("-")) {
      throw new UsageError(`unknown argument: ${arg}`);
    } else if (opts.artifact === null) {
      opts.artifact = arg;
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }
  if (!opts.artifact) throw new UsageError("missing <artifact-path>");
  if (opts.refsNone && opts.refs.length) {
    throw new UsageError("--refs-none cannot be combined with --ref");
  }
  if (opts.expect !== null) {
    if (!/^[0-9a-fA-F]{64}$/.test(opts.expect)) {
      throw new UsageError("--expect must be a 64-character hex SHA-256");
    }
    opts.expect = opts.expect.toLowerCase();
  }
  return opts;
}

function resolveArtifact(arg) {
  const abs = path.resolve(arg);
  let info;
  try {
    info = statSync(abs);
  } catch {
    throw new UsageError(`artifact not found: ${arg}`);
  }
  if (!info.isFile()) throw new UsageError(`artifact must be a regular file: ${arg}`);
  return realpathSync(abs);
}

function repoOf(artifactReal) {
  const probe = git(path.dirname(artifactReal), ["rev-parse", "--show-toplevel"], { allowFail: true });
  if (probe.status !== 0) {
    const message = firstLine(probe.stderr);
    if (/not a git repository/i.test(message)) return null;
    throw new UsageError(`git rev-parse failed: ${message || `exit ${probe.status}`}`);
  }
  return realpathSync(probe.stdout.toString("utf8").trim());
}

function main(argv) {
  const opts = parseArgs(argv);
  const artifactReal = resolveArtifact(opts.artifact);
  const root = repoOf(artifactReal);

  if (root === null) {
    process.stdout.write(
      [
        "REPO: none",
        "PATH: -",
        `H0_EXPECTED: ${opts.expect ?? "not-supplied"}`,
        "READ_ONLY: yes (no files written)",
        "VERDICT: OUTSIDE_REPO (artifact is not inside any git repository)",
      ].join("\n") + "\n",
    );
    process.exitCode = EXIT.OUTSIDE_REPO;
    return;
  }

  const rel = path.relative(root, artifactReal);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    process.stdout.write(
      [
        `REPO: ${root}`,
        "PATH: -",
        `H0_EXPECTED: ${opts.expect ?? "not-supplied"}`,
        "READ_ONLY: yes (no files written)",
        "VERDICT: OUTSIDE_REPO (resolved artifact is outside the owning repository)",
      ].join("\n") + "\n",
    );
    process.exitCode = EXIT.OUTSIDE_REPO;
    return;
  }
  const relPosix = rel.split(path.sep).join("/");

  const h1 = sha256(readFileSync(artifactReal));

  const inIndex = git(root, ["ls-files", "--error-unmatch", "--", relPosix], { allowFail: true }).status === 0;
  const h2 = inIndex ? sha256(git(root, ["show", `:${relPosix}`]).stdout) : null;

  const inHead = git(root, ["rev-parse", "--verify", "--quiet", `HEAD:${relPosix}`], { allowFail: true }).status === 0;
  const h3 = inHead ? sha256(git(root, ["show", `HEAD:${relPosix}`]).stdout) : null;

  const head = git(root, ["rev-parse", "--short", "HEAD"], { allowFail: true });

  const stagedProbe = git(root, ["diff", "--cached", "--name-only", "-z"], { allowFail: true });
  const staged =
    stagedProbe.status === 0
      ? nul(stagedProbe.stdout)
      : nul(git(root, ["ls-files", "--cached", "-z"], { allowFail: true }).stdout);
  const targetStaged = staged.includes(relPosix);
  const expectPaths = [...new Set(opts.expectPaths)].filter((p) => p !== relPosix);
  const expected = new Set([relPosix, ...expectPaths]);
  const stagedExtra = staged.filter((p) => !expected.has(p));
  const stagedMissing = targetStaged ? expectPaths.filter((p) => !staged.includes(p)) : [];
  const stagedOk = stagedExtra.length === 0 && stagedMissing.length === 0;
  const targetState = targetStaged ? (inIndex ? "yes" : "deleted") : "no";

  const trackedCount = nul(git(root, ["ls-files", "-z"], { allowFail: true }).stdout).length;
  const untrackedCount = nul(git(root, ["ls-files", "--others", "--exclude-standard", "-z"], { allowFail: true }).stdout).length;

  const refs = opts.refs.map((ref) => ({
    ref,
    tracked: git(root, ["ls-files", "--error-unmatch", "--", ref], { allowFail: true }).status === 0,
  }));
  let packageState = "not-checked";
  if (refs.length > 0) packageState = refs.every((r) => r.tracked) ? "complete" : "partial";
  else if (opts.refsNone) packageState = "complete (0 referenced resources)";

  const drift = [];
  if (opts.expect !== null) {
    if (h1 !== opts.expect) drift.push("worktree");
    if (h2 && h2 !== opts.expect) drift.push("index");
    if (h3 && h3 !== opts.expect) drift.push("head");
  }
  const missing = [];
  if (opts.requireComplete) {
    if (!h2) missing.push("index");
    if (!h3) missing.push("head");
  }
  const chainBroken = h2 === null && h3 !== null;

  const chainH0H1 = opts.expect === null ? "not-checked" : h1 === opts.expect ? "match" : "differ";
  const chainH1H2 = h2 === null ? "absent" : h2 === h1 ? "match" : "differ";
  const chainH2H3 =
    h2 === null
      ? h3 === null ? "absent" : "index-absent"
      : h3 === null ? "head-absent" : h2 === h3 ? "match" : "differ";

  const out = [
    `REPO: ${root}`,
    `PATH: ${relPosix}`,
    `HEAD: ${head.status === 0 ? head.stdout.toString("utf8").trim() : "none"}`,
    `H0_EXPECTED: ${opts.expect ?? "not-supplied"}`,
    `H1_WORKTREE: ${h1}`,
    `H2_INDEX: ${h2 ?? "absent"}`,
    `H3_HEAD: ${h3 ?? "absent"}`,
    `CHAIN: h0=h1 ${chainH0H1}; h1=h2 ${chainH1H2}; h2=h3 ${chainH2H3}`,
    `TARGET_STAGED: ${targetState}`,
    `STAGED_PATHS: ${staged.length ? staged.join(", ") : "none"}`,
    `STAGED_EXTRA: ${stagedExtra.length ? stagedExtra.join(", ") : "none"}`,
    ...(expectPaths.length
      ? [
          `EXPECT_PATHS: ${expectPaths.join(", ")}`,
          `STAGED_MISSING: ${
            targetStaged ? (stagedMissing.length ? stagedMissing.join(", ") : "none") : "not-checked"
          }`,
        ]
      : []),
    `STAGED_OK: ${stagedOk ? "yes" : "no"}`,
    ...refs.map((r) => `REF ${r.ref}: ${r.tracked ? "tracked" : "untracked"}`),
    `PACKAGE: ${packageState}`,
    `TRACKED_FILES: ${trackedCount}`,
    `UNTRACKED_FILES: ${untrackedCount}`,
    "READ_ONLY: yes (no files written)",
  ];

  const issues = [];
  if (drift.length) issues.push(`DRIFT (${drift.join(", ")})`);
  if (!stagedOk) {
    const parts = [];
    if (stagedExtra.length) parts.push(`extra: ${stagedExtra.join(", ")}`);
    if (stagedMissing.length) parts.push(`missing: ${stagedMissing.join(", ")}`);
    issues.push(`STAGED_SET_NOT_EXACT (${parts.join("; ")})`);
  }
  if (chainBroken) issues.push("CHAIN_BROKEN (index absent while HEAD present; target staged as deletion)");
  if (missing.length) issues.push(`CHAIN_INCOMPLETE (${missing.join(", ")} absent)`);

  let verdict;
  let code;
  if (drift.length || !stagedOk || chainBroken) {
    verdict = issues.join("; ");
    code = EXIT.DRIFT;
  } else if (missing.length) {
    verdict = issues.join("; ");
    code = EXIT.CHAIN_INCOMPLETE;
  } else if (opts.expect !== null) {
    const pending = [!h2 && "index", !h3 && "head"].filter(Boolean);
    const proven = h2 && h3 ? "h0=h1=h2=h3" : h2 ? "h0=h1=h2" : "h0=h1";
    verdict = pending.length
      ? `MATCH (${proven}; ${pending.join(", ")} pending)`
      : `MATCH (${proven})`;
    code = EXIT.OK;
  } else {
    verdict = "MEASURED_ONLY (no --expect supplied)";
    code = EXIT.OK;
  }

  out.push(`VERDICT: ${verdict}`);
  process.stdout.write(out.join("\n") + "\n");
  process.exitCode = code;
}

try {
  main(process.argv.slice(2));
} catch (err) {
  const message = err instanceof UsageError ? err.message : (err && err.message) || String(err);
  process.stderr.write(`ERROR: ${message}\n\n${USAGE}\n`);
  process.exitCode = EXIT.USAGE;
}
