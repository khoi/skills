---
name: skill-postwrite-registration-verification
description: Verify a newly written or updated Skill before reporting it available. Use after editing SKILL.md or resources, when asked to execute /skills reload or confirm registration, or when skill-creator step 6 is the only closing guidance. Preserve a package baseline, pin the bundled checker identity in that baseline, check approved-file scope, recursively validate package Markdown links and anchors, separate citation structure from meaning, test authorized commands with positive and negative controls, load the exact name through the Skill tool, then compare the complete file set and hashes again. Distinguish in-app slash commands from shell probes and report validation gaps without silently changing unrelated resources.
---

# Skill Post-Write Registration Verification

## Overview

Writing `SKILL.md` is not registering a skill. Keep package integrity, command
execution, citation meaning and runtime loading as separate claims. Run the four
passes and the final hash comparison before reporting completion; disclose every
unexecuted check and known limitation.

## Trigger shape

- A skill directory was just written or edited, or resources were moved into it.
- The user replies `execute /skills reload` or asks if the new skill took effect.
- `skill-creator` step 6 ("restart the session or run `/skills reload`") is the
  only closing guidance available.
- A slash command has to be answered from an agent session that has no shell
  equivalent.

## Environment

Require Node.js with ES-module support and Python 3 for the fixture-location
preflight. Set `PACKAGE_DIR` to this package's absolute directory, in either the
repository's `skills/` tree or its installed location. Resolve all other command
placeholders to authorized paths before running them. Self-test fixtures use
`os.tmpdir()`; set `TMPDIR` to an authorized external workspace when needed.

The registration pass requires a host that can load skills by name. The Qoder
`Skill` launch signals below are host-specific. If that tool is unavailable,
report registration NOT CONFIRMED; passing disk checks does not replace it.

## Before writing - baseline and approved scope

Record the approved target and exact relative paths allowed to change. Before
editing, preserve the package in an authorized temporary directory outside the
package, with its timestamp, complete sorted file list and SHA-256 per file.
In a separate section of the same baseline, record the identity of each bundled
checker under Resources that the workflow will invoke (`check_skill.mjs`,
`check_citations.mjs`): absolute path, SHA-256 and mtime. They are package
files: include them in the package manifest and record their identities separately
to bind each verdict to its checker.
Keep the baseline immutable; do not re-snapshot it to hide drift. If verification
starts after writing and no earlier baseline exists, report scope preservation
as NOT CONFIRMED rather than reconstructing one, and report checker drift as
UNVERIFIED; a current hash plus mtime is identity, not a before/after comparison.

Compare added, modified and deleted paths against that baseline after editing.
Require every difference to be approved and every untouched file to retain its
hash. Report the actual lists, not just a count. Symlinks are not permission to
read outside authorized roots; record their targets and any unverified content.
If another writer intervenes, preserve both versions and reconcile only approved
paths; do not restore the whole package. Use `skill-dir-concurrent-write-reconcile`
if available; it is optional, not a prerequisite.

## Pass 1 - package, resources and citations

Run the bundled checker without changing its defaults:

```sh
node "$PACKAGE_DIR/scripts/check_skill.mjs" --check-refs <skill-dir>
```

Require `VERDICT: OK`. It checks frontmatter boundaries, hyphen-case `name`,
folder/name match, single-line description ≤1024 chars, body <500 lines, to-do
markers and extraneous docs. Its link and inline-path checks cover `SKILL.md`,
not recursive resource links or heading anchors. Read each written file in full
for wording and claim boundaries that the checker cannot assess.

### Recursive resource links and anchors

Inventory all package Markdown, including nested resources, not only changed
files. Resolve each local link relative to the file containing it; validate the
linked file and fragment, then inspect linked in-package Markdown too. Track
visited files so cycles terminate. Include same-file fragments and referenced
resource paths; report files, links and anchors actually checked.

Match anchors against real heading IDs or explicit IDs using the renderer's
convention, including duplicate headings and encoded fragments. If the syntax
or renderer is unsupported, report that item as unchecked rather than passing
it with a guessed slug. A top-level file-existence check is not this pass.

Check external local targets only within authorized read scope and do not recurse
into sibling packages or follow network links automatically. Report excluded
links and inaccessible targets explicitly; do not widen permissions to turn a
partial check green. Keep temporary validators and fixtures out of the package.

### Citation structure is not citation meaning

```sh
node "$PACKAGE_DIR/scripts/check_citations.mjs" <skill-dir> --root <project-dir>
```

Use only an authorized source root. Take the citation count from the output;
zero citations means not applicable, not semantic validation. The checker proves
file existence and line bounds, not that the cited text supports the claim.
Read the relevant span and compare the actual wording, not just the first line.
Require positive safe-integer endpoints in ascending order (equal endpoints are
allowed). The bundled citation checker rejects reversed, nonpositive, missing
range endpoints and out-of-bounds lines before accessing the cited lines.
Run its focused CLI regression controls after changing the checker:

```sh
node --test "$PACKAGE_DIR/scripts/check_citations.test.mjs"
```

Record structural and semantic results separately. For stale historical pointers,
identify the affected reference and the exact limitation; a shifted range may
still partly cover the right symbol. If that reference is outside the approved
edit set, preserve it, flag it in an approved file or the report, and exclude it
from verified-current claims. Fix in-scope errors and repeat the affected checks.
Never silently rewrite history or call the entire package semantically verified
while known stale or unread citations remain.

## Pass 2 - documented commands

Inventory commands in `SKILL.md` and its referenced resources. Classify them
before execution: read-only, temporary-fixture writes, or state-changing/live.
Resolve placeholders to authorized paths and retain the exact invocation, cwd,
stdout/stderr and actual exit status for each executed command, including the
probe below. Capture the tested process's status before filtering its output.

Run authorized read-only commands for real; keep positive and negative fixtures
inside the approved temporary directory. Documentation is not authorization to
render private files, call models, spend credits, start services or alter retained
evidence. Mark such commands DO-NOT-RUN with the reason. A safe wiring probe can
be recorded separately but cannot replace execution evidence; even an import may
have side effects, so inspect it first. Report those commands as documented, not
executed. A clean package check proves nothing about command execution.

### Fixture-location preflight

Before any fixture allocation or write, record an explicitly authorized external
workspace and the actual parent used by the generator. Never derive it from the
inspected package, its ancestors, cwd, or an unchecked script location. Keep the
same workspace when switching from a staged package to an installed package.

Set `APPROVED_WORK`, `FIXTURE_DIR`, `SKILLS_ROOT` and `PACKAGE_DIR` to explicit
absolute paths: the existing authorized workspace, a fresh fixture directory,
the installed Skill tree and the currently inspected package. Authorization comes
from the user, not these variables. Run this read-only gate before allocation:

```sh
python3 - "$APPROVED_WORK" "$FIXTURE_DIR" "$SKILLS_ROOT" "$PACKAGE_DIR" <<'PY'
from pathlib import Path
import json
import sys

if len(sys.argv) != 5 or any(not Path(p).is_absolute() for p in sys.argv[1:]):
    print("USAGE: absolute WORK FIXTURE SKILLS PACKAGE paths required")
    raise SystemExit(2)
try:
    work, skills, package = [Path(sys.argv[i]).resolve(strict=True) for i in (1, 3, 4)]
    proposed = Path(sys.argv[2])
    parent = proposed.parent.resolve(strict=True)
    fixture = proposed.resolve()
    protected = (skills, package)
    if not all(p.is_dir() for p in (work, skills, package, parent)):
        raise ValueError("roots and fixture parent must be existing directories")
    if any(work == p or p in work.parents for p in protected):
        raise ValueError("workspace is inside a protected root")
    if work not in fixture.parents:
        raise ValueError("fixture is not a strict child of the authorized workspace")
    if any(fixture == p or p in fixture.parents or fixture in p.parents for p in protected):
        raise ValueError("fixture overlaps a protected root")
    if proposed.exists() or proposed.is_symlink():
        raise ValueError("fixture path must be fresh")
except (OSError, RuntimeError, ValueError) as error:
    print("E_FIXTURE_LOCATION", str(error))
    raise SystemExit(1)
print("FIXTURE_LOCATION_OK", json.dumps({"work": str(work), "fixture": str(fixture),
      "skills": str(skills), "package": str(package)}))
PY
```

Require exit 0 and `FIXTURE_LOCATION_OK`; use the returned canonical fixture path
for the generator, not a separately recomputed parent. Allocate exclusively, then
verify the actual directory resolves to that path before writing fixture files.
Repeat if paths change. This detects placement mistakes; it is not a race-proof
filesystem sandbox. Keep validators and logs outside both protected roots too.

If a run misplaced fixtures, stop and retain its command, actual paths and result
as a scope violation even if functional checks passed. Inventory affected paths;
remove only attributable run-owned fixtures within the cleanup authorization,
never a wildcard over the Skill tree. For uncertain ownership, stop and ask.
Verify the exact paths are gone, compare the package against its baseline, fix
the anchor and rerun both package-location cases before reporting completion.
Cleanup alone does not validate the original run or erase the incident.

## Pass 3 - controls

A check that returns nothing (`0`, no lines, exit 1 with empty output) is not
evidence until the same predicate fires where it must:

- Start with the checker's own control:
  `node "$PACKAGE_DIR/scripts/check_skill.mjs" --self-test`.
  Require exit 0 and
  `SELFTEST: PASS assertions=20 fires=20 dead=0 green=OK fixtures_removed=true`.
  It builds throwaway fixtures in the system temp directory and removes them;
  it proves the checker's assertions fire, not that this package is correct,
  and it does not replace the known-good sibling, nested-resource/anchor or
  scope-drift controls below. Any `DEAD` line or non-zero exit is a checker or
  harness defect: report it and stop before those controls. A different
  `assertions=` count means the bundled checker changed; reconcile it with the
  baseline checker hash instead of accepting the new count silently. The script
  exits 0 even when a fixture directory survives, so treat
  `fixtures_removed=false` as a leak.
- On a deliberately broken copy (bad `name`, dangling link), the checker must
  print `VERDICT: PROBLEM` and exit non-zero.
- On a known-good sibling skill it must print `VERDICT: OK`.
- Exercise a nested-resource broken link and a missing anchor, as well as valid
  anchors and a cycle, to prove resource traversal rather than top-level checks.
- Against throwaway copies, require the scope check to detect an unapproved
  modification, addition and deletion. Require the final comparison to reject a
  late edit or a changed file set, not just match hashes for surviving paths.
- Run the fixture preflight and generator with both staged and installed package
  inputs, holding the authorized workspace fixed. Require a fresh child to pass,
  record the actual allocation, then verify cleanup and protected-package hashes.
- Require non-zero rejection before allocation for an outside path, a sibling
  with the workspace's name prefix, a path inside either protected root, and a
  symlink escape. Create test symlinks only in the authorized workspace; never
  write a negative fixture at the rejected destination. Report unexecuted cases.

Print expected and actual status plus a meaningful output signal per command.
Keep intentional non-zero controls distinct from unexpected failures. Capture
the tested process exit status directly before filtering output.
Use `shell-command-result-verification` if available; it is optional.

After the disk passes, save the complete validated file list and SHA-256 map,
plus the path, SHA-256 and mtime of each bundled checker that produced a verdict.
Bind each verdict to the checker hash that produced it. Require no unexplained
drift during the checks: a file edited after its check, or a checker whose hash
differs from the baseline or from the hash used for a verdict, needs the
affected checks re-run and both identities reported. Keep this validated map
separate from the pre-edit baseline.

## Pass 4 - registration (the one commonly missing)

Call the `Skill` tool with the new name. Registration is CONFIRMED only when
the launch contains `Launching skill: <name>` **and** the body that comes back
is that skill's own content.

- A file-based skill also emits `Base directory for this skill: <dir>` as a
  separate injected line, not inside the tool's `output` field. So
  `read_chat_session` records only `Launching skill: <name>` for the same call:
  a missing base-directory line in a transcript is a capture artifact, not a
  failed registration. Built-in `skill-creator` emitted no such line in the
  observed launch.
- A different skill's body coming back, an error, or a missing name all mean
  **not confirmed** - never report registration on an unexecuted or mismatched
  load.
- For an update, check that the returned body contains the revised sections,
  not merely the existing name. A stale body does not confirm the update.
- Once this pass succeeds there is nothing to reload; success in the same
  session is normal. Loading is a verification action, not a request to repeat
  the entire workflow recursively.

### Final comparison after loading

Immediately after the load and before reporting, compare the live package with
the validated map: require identical relative file sets and matching hashes for
every entry. Repeat the approved-scope comparison against the original baseline.
If either differs, preserve the evidence, identify the drift, revalidate the
affected content and retry loading; never overwrite the other writer's work or
relabel the old checks as current. Recompute the bundled checker hashes and
compare them with the baseline identity: equal means no checker drift during
this run; different means the verdicts belong to the superseded checker, so
revalidate the affected checks and report both identities. Without a baseline
checker hash, mtime alone does not establish "unchanged" - record the current
identity and label drift UNVERIFIED.

A matching disk map proves observed disk identity at those times, not a hash of
the runtime's in-memory body or absence of all intervening writes. Report body
loading and disk identity separately. A successful launch with stale validation
does not justify a completed-update claim.

## Slash commands are not shell commands

`/skills reload`, `/skills list` and `/<name>` are in-app commands of the Qoder
application. They have no shell equivalent, and `qoder` / `qoder-cli` are
generally absent from `PATH`.

Probe with a sentinel so an absence is visible instead of silent:

```sh
command -v qoder qoder-cli || echo NO_CLI_COMMAND
```

- Probe now; do not quote a past absence as a permanent fact. A binary on
  `PATH` is environment-dependent.
- Answering `execute /skills reload`: attempt pass 4 first. Report the observed
  result, and add "run `/skills reload` in the app or restart, then retry" only
  when the load actually failed. Telling a user to reload an already-loaded
  skill creates doubt where there is none.
- Never run shell commands alone, get "command not found", and stop there - the
  load attempt is the answer, the shell probe is only its boundary condition.

## Hard rules

- No completed-update claim before the revised body loads and the final file
  set and hashes match. A name in the available list alone is insufficient.
- Re-list the actual installed skill root immediately before writing. Siblings are
  added by parallel sessions; if the target appeared, switch to the update flow
  and read the current file first - `create` never overwrites.
- A missing target directory is the normal create branch, not a failure.
- `Skill` load failure is reported as a failure; a slash-command suggestion is
  a fallback for the user, never a substitute for the executed check.
- Empty or zero results require a control before they count.
- Preserve both baseline and validation maps; neither is permission to expand
  the approved edit set or rewrite unrelated historical citations.
- A checker hash measured only after validation is current identity, not proof
  of continuity. Compare it with the baseline hash; without one, label checker
  drift UNVERIFIED and never write "unchanged" from mtime.
- Report incomplete checks and semantic caveats separately from registration.
  Do not call partial traversal recursive validation of the whole package.

## Report template

```text
BASELINE     <time, manifest and approved edit paths>
SCOPE        added=[...] modified=[...] deleted=[...]; untouched=<N verified>
PACKAGE      <observed verdict>
RESOURCES    files=<N> links=<N> anchors=<N>; excluded/unchecked=<items>
CITATIONS    structure=<result, measured count>; meaning=<verified/stale/unread>
COMMANDS     <exact invocation and cwd> -> expected=<code> actual=<code> signal=<text>
FIXTURES     authorized=<resolved root>; actual=<paths>; staged/installed=<results>; escapes=<rejected/unchecked>; cleanup=<verified/residual>; prior violation=<none/details>
NOT EXECUTED <command and reason, or none>
SELFTEST     assertions=<N> fires=<N> dead=<N> green=<OK/FAIL> fixtures_removed=<true/false> exit=<code>
CONTROLS     <package-specific positive and intentional-negative results; unexpected failures>
REGISTRATION <launch output>; revised body=<confirmed/not confirmed>
POST-LOAD    file set=<match/drift>; hashes=<N/N>; checker=<name:sha256@mtime>; checker drift=<none/measured/UNVERIFIED>
LIMITATIONS  <remaining caveats, or none>
VERDICT      <verified update | registered with limitations | not confirmed>
```

## Boundaries

Own closing verification, not authoring approval, command implementation or
concurrent-edit recovery. The sibling skills named above are optional guidance;
their absence must not block the bundled checker or self-test. Do not modify
other skills or scripts outside the approved package scope.

## Resources

- [Package checker](scripts/check_skill.mjs): Node.js built-ins only; includes
  the 20-assertion self-test and opt-in inline-resource checks.
- [Citation checker](scripts/check_citations.mjs): Node.js built-ins only;
  validates citation structure, not meaning.
- [Citation regression tests](scripts/check_citations.test.mjs): Node.js built-ins
  only; exercise range failures and valid/missing-file controls via the CLI.
