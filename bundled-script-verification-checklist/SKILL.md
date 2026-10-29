---
name: bundled-script-verification-checklist
description: Acceptance checklist for scripts bundled inside a Skill (scripts/*.mjs and similar). Use right after writing or editing a bundled script, when a reviewer asks whether a skill's script actually works, when a documented command crashes (traceback, ENOENT, raw throw stacks), when a documented command exits 0 having printed nothing, and when a skill ships a verification/CLI tool whose failure branches were never exercised. Covers the syntax gate, verbatim execution of the command exactly as written in SKILL.md, a throwaway fixture workspace with symlinked scripts so the text stays intact, silent skips from a string-based entry guard, per-branch failure testing (tampered/missing/out-of-root records, invalid JSON, unknown or value-less arguments, target port listener present, --json into a nonexistent subdirectory), one-line usage with conventional exit codes instead of tracebacks, and the read-only/evidence-safety re-run. Not for authoring the script's business logic or the skill package's frontmatter checks.
---

# Bundled script verification checklist

## Overview

A bundled script is only "verified" after each documented behavior — success and
failure — has actually been executed in a real workspace. Run the gates below
in order; do not skip branches, do not spot-check, and do not report the
script as working from a syntax check alone.

Worked example used throughout: `~/.qoder/skills/bounded-synthetic-benchmark-evidence-report/scripts/verify-preservation.mjs`
(read-only hash re-checker; exit 0 = PASS, 1 = FAIL, 2 = usage error).

## Gate 1 — syntax

Before anything else, parse-check the script without executing it:

```
node --check ~/.qoder/skills/<skill>/scripts/<script>.mjs && echo 'syntax ok'
```

For other runtimes use the equivalent (`python -m py_compile`, `bash -n`).
This proves only that the file parses — it is never sufficient evidence alone.

## Gate 2 — verbatim documented command

Copy the command out of the skill's own SKILL.md **verbatim**, including `~`
paths and relative defaults (`--root .`), and run it from a real workspace:

```
node ~/.qoder/skills/<skill>/scripts/<script>.mjs \
  --root . --manifest SNAPSHOT_MANIFEST.json \
  --protected work/<run>/protected-before-hashes.json --port 11434
```

- `~` must expand the same way a user's shell would expand it; the resolved
  root echoed in output (`root: /Users/.../workspace`) is the proof.
- Keep the full stdout and the exit code. Counts in the output (entries, match)
  must equal the known baseline for that tree — a matching shape with wrong
  numbers is a fail.
- If SKILL.md documents several invocations, run every one of them.

## Gate 2b — silent success: exit 0 with empty stdout

A documented command that exits 0 having printed nothing is a **FAIL**, not a
pass. Measured in one session: `measure` and `compare` both returned 0 with no
output while a third command in the same run printed normally, and the run was
reported green.

The cause was a string-based entry guard:

```js
if (import.meta.url === `file://${process.argv[1]}`) main();
```

`import.meta.url` is the resolved path; `argv[1]` is what the caller passed.
When they differ — a symlinked script, or an absolute path under a symlinked
directory such as macOS `/var` → `/private/var` — the guard is false and the
whole CLI body is skipped without an error. The same script then behaves
differently depending only on how its path is spelled. Reproduced on this
machine:

```text
node guard-string.mjs              exit=0  RAN_STRING
node /var/.../guard-string.mjs     exit=0  (no output)
node sub/link-string.mjs           exit=0  (no output)
node guard-real.mjs                exit=0  RAN_REAL
node sub/link-real.mjs             exit=0  RAN_REAL
```

Fix by resolving both sides, then re-run every documented command:

```js
import fs, {realpathSync} from 'node:fs';
...
realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
```

A command that only works under one spelling of its path is a fail. Require the
expected output, not just the status.

## Gate 2c — fixture workspace that leaves the command text alone

With no real input available, build a one-shot workspace outside the package and
symlink the scripts in, so the documented line runs verbatim:

```sh
FIX="$(mktemp -d)/run" && mkdir -p "$FIX/out"
ln -s /Users/khoi/.qoder/skills/<skill>/scripts "$FIX/scripts"
# generate the smallest real input the commands need, into "$FIX"
cd "$FIX" && node scripts/<script>.mjs <documented arguments>
```

- Never write fixtures into the skill directory. A leftover fixture becomes a
  shipped resource and changes later package-check, inventory and link results.
- Do not rewrite the documented command to an absolute path to make it work:
  the symlink exists so the literal relative command stays the thing under test.
- Keep the generator and its output under the temp root for the run, but copy
  the generator (or the literal fixture files) into the run's evidence notes
  outside the package before cleanup: a temp path is not preservation. Report
  the temp path and the preserved location.
- Run the command under both path spellings, relative and symlinked absolute, to
  catch Gate 2b.

## Gate 3 — failure branches, one by one

Each branch below gets its own run, using a throwaway fixture (`mktemp -d`) for
file-content cases. "Not tested" is never an acceptable status; if a branch
cannot run, record why in the report.

### Capture the status of every command you cite

Run the branch without a pipe and capture `$?` as the next statement:

```sh
node scripts/<script>.mjs <branch args> > out/branch.txt 2>&1
code=$?
```

`$?` after a pipe is the filter's status. In zsh, `${PIPESTATUS[0]}` is unset,
so `${PIPESTATUS[0]:-$?}` reports the filter's 0; if a pipeline is unavoidable,
read `${pipestatus[1]}` (1-indexed), never `${PIPESTATUS[0]}`. An unexpected
zero where the table requires 1 or 2 is unmeasured, not a pass: re-run the
tampered-record branch as the positive control (it must exit 1), then re-capture
the suspect branch without a pipe. Observed once: every branch of a covered-ink
gate, including the one that must exit 1, printed `EXIT=0` under zsh; direct
`$?` gave 1, and usage errors gave 2. Capture rules and the runner belong to
`shell-command-result-verification`.

The rule covers any command whose status is cited, not only branch runs. While
this subsection was written, the package checker (`check_skill.mjs` from
`verify-skill-source-session`) was run as
`check_skill.mjs --check-refs <dir> | tail; echo CHECK_EXIT=$?` and printed
`CHECK_EXIT=0` — the status of `tail`, not the checker. The redirected re-run
with `code=$?` was the first real measurement. Before citing a checker's
`VERDICT: OK` with exit 0, run the same `--check-refs` invocation on a throwaway
package built to fail (a backticked reference to a `ghost.mjs` file under
scripts/ that does not exist) and require exit 1 **with that ref named in the
problem line** — this checker prints `broken inline-code path: <ref>`. Keep the
fixture otherwise valid (matching name and folder, single-line description) and
require that line to be the **only** problem printed: the checker collects every
problem before exiting 1, so a second problem line means the fixture is being
measured instead of the ref check. The flag is opt-in — the same fixture without
`--check-refs` returns `VERDICT: OK` with exit 0, so a control that passes
proves only that the flag was left off. In any SKILL.md, do not
spell that fixture ref as a backticked path under scripts/, references/ or
assets/: `--check-refs` treats every such inline-code path in the file as a
bundled resource that must exist in the checked package. `--self-test` covers
the checker's assertions; the throwaway package proves the invoked mode can
reject something. The checker owns the package rules; do not restate them here.

### Reusing a control result recorded earlier

A control output from an earlier turn — or from the source session that prompted
the edit — is evidence about the checker and the input that produced it, not
about the checker on disk now. Reuse it only when both are still reproducible.

- Record one SHA-256 for the checker revision that produced the
  control/discriminator pair, and re-hash it before citing either result. Re-run
  the pair when the digest moved: the recorded verdicts then belong to a
  different tool.
- Preserve the input with the digest: the literal fixture files — for this
  checker, the two `SKILL.md` packages — or a generator that recreates them
  byte-for-byte, in the run notes. A reported `/tmp` or `$TMPDIR` path is not
  preservation; check it with `test -e` before quoting the result. If it no
  longer resolves, the result is a quote, not a control — rebuild from the
  preserved source and re-run, or label the old output unverified.
- Keep the digest and the fixture source in the run notes, not in this file:
  either written here outlives the run that produced it and lets a later run
  cite an old verdict as current.

Measured 2026-10-26: a source session's control output was reusable only because
`check_skill.mjs` still hashed to the digest recorded in that session (the same
digest was re-checked after the edit) and the two ghost packages could be
recreated in a fresh temp root from the properties the record enumerated,
reproducing the recorded 1 and 2 problem lines.

| Branch | How to force it | Required behavior |
|---|---|---|
| Tampered record | Rewrite one fixture file so its content no longer matches the recorded hash | listed under `modified`, FAIL, exit 1 |
| Missing record | Reference a hashed file that is deleted | listed under `missing`, FAIL, exit 1 |
| Out-of-root record | Put BOTH `../escape` and `/abs/pwn` paths in the record | both listed under `outside-root`, FAIL, exit 1 |
| Invalid / wrong-shape JSON | Feed a non-JSON or keyless file as the record | one-line `ERROR reading <file>: <reason>`, FAIL, exit 1 |
| Unknown argument | `--bogus` | one-line `unknown argument: --bogus` + usage, exit 2 |
| Missing flag value | trailing `--root` with no value | one-line `missing value for --root` + usage, exit 2 |
| Port listener present | Start a temporary listener on the probed port, re-run with the port argument | `LISTENER_PRESENT (pid …)` + FAIL + exit 1; kill the listener afterwards and confirm FREE again |
| `--json` target dir absent | Point `--json` at `out/nested/verify.json` under a fresh temp root | directory created, record written (check byte count), no crash |
| Grader on a silent child | Feed the case runner a command that exits with its expected code printing nothing, with `expect_output: true` | graded `FAIL` / `NO_RESULT`, never `PASS`; without the flag the same row prints `NO_OUTPUT` in the notes column and must be treated as unverified |
| Grader on a hanging child | Add `timeout_ms` to a case whose command never returns | graded `TIMEOUT`, kept distinct from `SPAWN_ERROR:ENOENT` (never started) and `SIG(...)`; the runner itself must stop blocking |

These last two branches test the harness, not the script. `shell-command-result-verification`
owns that runner and ships `node scripts/exit-case-runner.mjs --self-test` (11
classification assertions, one per grading token); run it whenever you rely on a
green table.

Path rules the script must enforce (and the fixture must prove it enforces):
every recorded path resolves against one explicit root; absolute record paths
and any `..` segment are refused as `outside-root`, never joined onto the root.
`startsWith("..")` is not the check — it misjudges legitimate children like
`..repair-child`; use `rel === ".."` or `rel` starting with `".." + path.sep`.

## Gate 4 — error presentation

Every failure path prints one line plus usage and a conventional exit code.
Raw Node tracebacks (`throw new Error(...)`, `ENOENT ... at Object.writeFileSync
node:fs:...`) are a FAIL of this gate even when the exit code is nonzero.
Conventions to keep consistent: 0 success/PASS, 1 check failure, 2 usage error;
`--help` exits 0. Fix the script and re-run Gate 3 whenever a traceback leaks.

## Gate 5 — read-only / evidence safety

After all destructive fixture tests, prove the script did not touch real
evidence:

1. Re-run the Gate 2 command on the real tree. PASS and every count must be
   identical to the pre-test baseline.
2. The script's own output must state it wrote nothing outside `--json`
   (e.g. `no files written (hash checks were read-only)`).
3. Confirm target files' mtimes/hashes unchanged if the tree provides a
   re-hash mechanism.

A runner that deletes or overwrites existing results before refusing an
existing target fails this gate outright; guard checks must happen before any
allocation or write.

## Failure signatures

| Signal | Response |
|---|---|
| `Error: ENOENT ... open '.../out/verify.json'` with full stack | `--json` parent dir missing; add `mkdirSync(dirname, {recursive:true})`, re-run Gate 3 |
| `else throw new Error(...)` traceback on `--bogus` | Unknown/missing args not converted to one-line usage + exit 2; fix parser, re-run Gate 3 |
| `outside-root 0` though fixture contains `/abs/...` | Absolute record paths silently joined onto root; resolve all records against the explicit root only |
| PASS counts differ between fixture run and real-tree run | Different denominator; recheck which record files were loaded before grading |
| Listener test reported FREE while a server was up | Probe checks `status === 1 && !stdout`; verify with a positive control before trusting a negative result |
| `exit 0` with empty stdout on a documented command | String-based entry guard comparing `import.meta.url` with a `file://` string built from `argv[1]`; resolve both with `realpathSync`, then re-run every documented command |
| Same command prints via a relative path but is silent via its absolute or symlinked path | The guard matched only because node normalized the relative path through the resolved cwd; the path spelling, not the input, decided the result |
| Every failure branch prints the same code, usually `EXIT=0` | The status came from a pipeline's last command or from unset zsh `PIPESTATUS`; re-run without a pipe with `code=$?` and require the tampered-record control to exit 1 before reporting |
| `CHECK_EXIT=0` on the only checker run, whose output went through `tail`/`head` | The code was the filter's. Re-run with `> out/check.txt 2>&1` and `code=$?`, then require a throwaway package built to fail to exit 1 **and** name the missing ref in its problem line before citing `VERDICT: OK` |
| Known-failing control prints `VERDICT: OK` with exit 0 | `--check-refs` is opt-in and was left off — the same package fails only when the flag is given; re-run with it before concluding the checker accepts the package |
| Known-failing control exits 1 but prints more than the one expected problem line | The fixture fails on its own (name/folder mismatch, folded description, stray root file), so the exit code is unattributable to the ref check; fix the fixture, keep the ref, re-run |
| Control output cited with a matching checker digest but only a temp path, and `test -e` on that path fails | The input is gone, so the result is a quote, not a control; rebuild the fixtures from the preserved source and re-run, or label the old output unverified |

## Boundaries

- This checklist verifies operability and error hygiene of a bundled script; it
  does not endorse the script's domain logic, nor authorize editing files
  outside the skill directory while fixing it.
- Skill package checks (frontmatter, name/description, folder match) belong to
  the skill-creation workflow; node `--test` suite running and exact-count
  reporting belong to node-test-suite-verification. Do not duplicate them here.
- Fixing a gate failure never licenses weakening a recorded expectation,
  deleting prior run evidence, or narrowing the branch list.
