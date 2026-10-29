---
name: skill-artifact-commit-provenance
description: Commit an artifact or multi-file Skill package outside the open project repo, and prove the committed bytes are the validated bytes. Use when asked to commit, stage or write a commit message for a path under ~/.qoder/skills or any file outside the working repo, when one commit carries several files (SKILL.md plus references/ and scripts/), when the artifact directory reports 'not a git repository' while another repo is open, when AGENTS.md forbids committing the workspace, when a first commit in a shared directory would sweep in untracked siblings, or when a file changes after validation or staging. Covers git -C rev-parse ownership detection, stopping for owner approval before git init in a shared config directory, one H0 per file, re-validation after drift, staging and NUL-split diffing the exact expected path set with one inspector run per file, the per-file H0 = H1 = H2 = H3 chain with H4 separate, and untracked referenced resources. Not the in-file merge, package checking or skill registration.
---

# Skill Artifact Commit Provenance

## Overview

Two questions decide every commit of an artifact or package outside the current
project: which repository may receive it, and whether the committed bytes are
the bytes that were validated. Answer both with measurements; a successful `git commit`
line answers neither.

## Trigger shape

- "Commit this", "stage it" or "write the commit message" for a `SKILL.md`,
  a skill package, a dotfile or any path outside the working repo.
- One commit carries a whole package: `SKILL.md` plus the `references/…` and
  `scripts/…` files it names, validated together and committed together.
- `git rev-parse` in the artifact's directory prints
  `fatal: not a git repository (or any of the parent directories)`.
- The open workspace repo is unrelated, has no commits, or its AGENTS.md or
  task rules forbid commits.
- The artifact sits in a shared directory whose siblings are untracked.
- The file changed after you validated it, or after you staged it.

## Workflow (in order)

1. **Resolve ownership from the artifact, not the cwd.**

   ```
   git -C <artifact-dir> rev-parse --show-toplevel
   ```

   Exit 0 prints the top-level directory. Exit 128 with `fatal: not a git
   repository` means no enclosing repo. Never infer the repo from the session
   cwd: `git status` there answers a different question and can hand you a
   repository that must not receive this commit.

   Then pin the pathspec base once. Derive `<rel>`, the artifact's path relative
   to `<root>`, and pass it to every later command as `git -C <root> … -- <rel>`.
   Do not re-enter the artifact directory for a status check: `-C
   <artifact-dir>` moves the pathspec base there, so `git -C <artifact-dir>
   status -- <dir-name>` asks about `<artifact-dir>/<dir-name>` and prints
   nothing with exit 0 — the same output an invented pathspec produces. Empty
   porcelain means "nothing matched", not "untracked" and not "clean". Settle
   the state with exit codes:

   ```
   git -C <root> ls-files --error-unmatch -- <rel>   # 1 = untracked
   git -C <root> check-ignore -v -- <rel>            # 0 = an ignore rule wins
   ```

2. **Classify authority.** Three cases, three behaviours:
   - The top-level is the repo you were told to commit into: proceed.
   - The path sits inside a different repo (dotfiles, monorepo): proceed only
     if that repo's own rules allow the commit.
   - AGENTS.md or the task forbids committing that repo: stop. Repo membership
     is not permission.

3. **Outside every repo: write the message, then ask the owner.** Present
   exactly these choices: (a) initialise a repo at a named directory and commit
   only this repo-relative path; (b) keep the message only, the file stays
   uncommitted; (c) commit into an owner-named existing repo, if its rules
   allow. Never run `git init` in a shared config directory on your own
   initiative. If the owner picks (a), state what init changes: HEAD becomes a
   root commit, every sibling directory now shows as an untracked entry, and
   `.gitignore` versus track-all remains the owner's decision.

4. **Re-measure before staging (drift gate).** Compare each committed file's
   current digest with its own H0, the hash recorded after validation. A
   multi-file package has no single H0: one per file, each recorded in the same
   passing validation run.

   ```
   shasum -a 256 <artifact-path> [<companion>...]
   ```

   If no H0 exists — validation passed but no digest was taken, or the recorded
   one predates a later edit — do not backfill it from this measurement. Re-run
   the complete validation suite first, then record its digest as H0. A
   backfilled H0 equals H1 by construction, so the drift gate could never fire.

   Equal means H1 = H0. Different means the validated bytes are gone: re-read
   the whole file, confirm your own edits survived, read what was added, prove
   any newly referenced resource exists **and runs**, then re-run the complete
   validation suite and record the new H0. One passing check is not a
   re-validation. In a package, a drift in one file means the package-level
   suite never saw those bytes: re-run the whole suite, not only that file's
   check.

   Re-measure after staging too: if H1 differs from H0 while H2 still equals
   H0, the validated bytes are in the index and the worktree moved on — a
   concurrent writer. Clear the stale entry first (`git restore --staged --
   <rel>`) so a later commit cannot revert their work, then follow
   [references/concurrent-writer-recovery.md](references/concurrent-writer-recovery.md).

5. **Stage exactly the expected paths, then verify the staged set.**

   Preflight the index before the first `git add`: `git -C <root> diff --cached
   --name-only -z | tr '\0' '\n'` must print nothing. Staged paths there belong
   to another session or an earlier task; `git add` keeps them and your commit
   would carry them. Stop and name them — never unstage, restore or reset them.
   A resumed run whose index holds exactly the expected set with each H2 equal
   to that file's own H0 is the only exception.

   ```
   git -C <root> add -- <repo-relative-path> [<companion>...]
   git -C <root> diff --cached --name-only -z | tr '\0' '\n' | LC_ALL=C sort
   ```

   The staged list must be exactly the expected set — the artifact plus every
   companion named in the approved scope — compared NUL-split, both sides
   sorted under `LC_ALL=C` so the result does not depend on pathspec order. A
   skill package commit is several files (`SKILL.md`, its `references/…` and
   its `scripts/…`), so name each companion with `--expect-path`; the
   inspector's default of artifact-only would report the companion as
   `STAGED_SET_NOT_EXACT (extra: …)`. The expected set still excludes
   everything the owner did not name. The default
   `--name-only` output C-quotes non-ASCII paths (`tệp.txt` arrives as
   `"t\341\273\207p.txt"`), so a literal comparison reports a false
   `STAGED_SET_NOT_EXACT`; `git -c core.quotePath=false` unquotes the display
   but still splits on newlines, so only `-z` is exact. Where untracked
   siblings exist, `git add -A` and `git add .` are forbidden.

   Before staging, an untracked directory is collapsed: `git status --porcelain
   -- <dir>` prints `?? <dir>/` and names no file, so add `-uall` (or read `git
   ls-files --others --exclude-standard -z`) whenever you need the file itself.
   After staging, compare the cached set only; the worktree list answers a
   different question.

6. **Check identity; never configure it.** `git config user.name` and
   `git config user.email` must resolve. Never change git config.

7. **Commit from a message file.** `git -C <root> commit -F <msg-file>`.

8. **Prove the bytes.** Every value below is SHA-256 over content:
   - H0 — the digest recorded after validation.
   - H1 — pre-commit worktree: `shasum -a 256 <artifact-path>`.
   - H2 — index: `git -C <root> show :<rel> | shasum -a 256`.
   - H3 — HEAD: `git -C <root> show HEAD:<rel> | shasum -a 256`.

   Require H0 = H1 = H2 = H3 for every committed file; one chain row proves
   only the file it measured. H4 is the worktree after the commit, reported
   separately per file — a three-file package has three of every value, and a
   matching row for `SKILL.md` says nothing about its script. H2 absent while
   H3 is present means the index no longer holds the target: the staged change
   is a deletion (`git rm --cached` on an intact worktree produces exactly
   this). That is a chain break, never
   a match, even when H0 = H1. H2 equal to a stale H0 while H1 differs is the
   same break from the other side: the index holds bytes the worktree lost.
   `git ls-files -s` confirms mode, blob and
   stage, but its hash is a git object SHA-1 — never compare it with the
   SHA-256 digest. A commit exit code is not provenance.

9. **Report package completeness per file.** For every committed file,
   enumerate the resources that file references (`scripts/…`, `references/…`,
   `assets/…`) from the file itself, not from memory:

   ```
   for f in <artifact-path> [<companion>...]; do
     grep -oE '(^|[^A-Za-z0-9._/-])(scripts|references|assets)/[A-Za-z0-9._/-]+' \
       "$f" | sed -E 's#.*(scripts|references|assets)/#\1/#' | sort -u
   done
   ```

   The left boundary matters: `other-skill/scripts/helper.mjs` is that skill's
   resource, not this package's, and must not be passed as `--ref`. A looser
   class that admits backticks and closing punctuation also counts the
   placeholder `scripts/…` and cuts a markdown link in half. The matches are
   skill-relative; `--ref` and `ls-files` want repo-relative ones, so prefix
   them with the skill directory. Test each:

   ```
   git -C <root> ls-files --error-unmatch -- <ref>
   ```

   Exit 0 means tracked, exit 1 means untracked. Any untracked resource means
   the package is not committed, whatever the commit says. A package is
   complete only when every committed file's own resources are tracked: pass
   each file's matches as that file's `--ref`, and `--refs-none` for a file
   whose enumeration returned none — the inspector measures one file per run,
   so a clear `PACKAGE` line for `SKILL.md` says nothing about the reference
   file beside it. Zero matches is a conclusion, not a skip: an artifact that
   references no `scripts/`, `references/` or `assets/` path is a complete
   package, and `--refs-none` makes the inspector print exactly that.
   `PACKAGE: not-checked` only means nobody enumerated — never copy it into
   the report, and never read it as partial.

## One-shot inspector

`--expect` is optional; without it the output is a measurement, not a proof.

```
# before staging: records H1 and shows that the target is not staged yet
node ~/.qoder/skills/skill-artifact-commit-provenance/scripts/commit-provenance.mjs <artifact-path>

# after staging, and again after the commit (the final proof)
node ~/.qoder/skills/skill-artifact-commit-provenance/scripts/commit-provenance.mjs \
  <artifact-path> --expect <sha256> [--require-complete] \
  [--expect-path <repo-relative-path>]... \
  [--ref <repo-relative-path>]... [--refs-none]
```

It prints `REPO`, `HEAD`, `H0`–`H3`, `CHAIN` (`h0=h1`, `h1=h2`, `h2=h3` as
`match`/`differ`/`absent`/`index-absent`/`head-absent`/`not-checked`),
`TARGET_STAGED` (`no`, `yes` or `deleted`), `STAGED_PATHS`, `STAGED_EXTRA`,
`STAGED_MISSING`, `STAGED_OK`, one `REF` line per resource, `PACKAGE`,
`TRACKED_FILES`, `UNTRACKED_FILES` and `VERDICT`; it writes
nothing. Both counts are recursive file counts from `git ls-files`, not the
entry count of `git status`. `--expect-path` widens the expected staged set:
the artifact is always in it, each repeatable value adds a companion, and a
duplicate or the artifact itself is dropped. A staged path outside the set, or
an expected companion that is not staged, makes `STAGED_OK: no`. Before the
artifact is staged, `STAGED_MISSING` reads `not-checked`: no `git add` has run
yet, so "not yet" and "forgotten" are indistinguishable. `--ref` and
`--expect-path` accept repo-relative paths only: an empty
value, an absolute path or any `..` segment is a usage error. `--refs-none`
declares that the enumeration found no referenced resource: `PACKAGE` becomes
`complete (0 referenced resources)`, and combining it with `--ref` is a usage
error. Without either flag the line stays `not-checked`.

Exit codes: 0 `MATCH` or `MEASURED_ONLY`, 1 `DRIFT`, `STAGED_SET_NOT_EXACT` or
`CHAIN_BROKEN`, 2 usage, 3 `OUTSIDE_REPO`, 4 `CHAIN_INCOMPLETE`. A staged extra
or a missing expected companion returns `STAGED_SET_NOT_EXACT` with the
offending paths in parentheses (`extra: …`, `missing: …`, or both). A staged
deletion shows `TARGET_STAGED: deleted` with `H2_INDEX: absent` while `H3_HEAD`
is present, and returns `CHAIN_BROKEN` — never `MATCH`. Run it before staging
(records H1), after staging (H2 appears), after commit (H3 appears; a later
run's H1 is H4). Read the verdict, not just the exit code.

With `--require-complete`, exit 4 `CHAIN_INCOMPLETE (head absent)` is the
expected post-staging, pre-commit state: `CHAIN: … h2=h3 head-absent`,
`STAGED_OK: yes`, and H0 = H1 = H2 per file. An exact staged set plus that
chain means proceed to commit — the proof is the post-commit
`MATCH (h0=h1=h2=h3)`. Exit 4 that names `index`, or arrives with `STAGED_OK:
no` or a `differ`, is not that state: stop.

The digests prove content bytes only. A `.gitattributes` filter such as Git
LFS makes the stored blob (a pointer) differ from the worktree content, and a
file-mode-only change leaves every digest equal; neither is detected. A
symlinked artifact is resolved with `realpathSync`, so the `PATH` reported is
the link target and a target outside the repo returns `OUTSIDE_REPO`. A worktree
edit after the commit makes H1 (now H4) differ from H0 = H2 = H3: the commit
proof still holds, the worktree claim does not.

Every line above is only as trustworthy as the script that prints it; after
editing the inspector, run the self-check below before trusting any verdict.

## Inspector self-check (after any edit to the script)

The script prints every verdict in this skill, so edit it only with its own
controls. Run all of these on a clean, committed skills repo; none of them
writes there. The staged-set block below uses a throwaway repo under `/tmp`.

```
INSPECTOR=~/.qoder/skills/skill-artifact-commit-provenance/scripts/commit-provenance.mjs
node --check "$INSPECTOR"    # exit 0
node "$INSPECTOR" --help     # exit 0; lists --expect, --expect-path, --ref, --refs-none
```

Then a paired discrimination run on a committed package that references no
`scripts/`, `references/` or `assets/` path — the same command, one flag apart:

```
ZERO=~/.qoder/skills/export-fixture-required-field-alignment/SKILL.md
H0=$(shasum -a 256 "$ZERO" | cut -d' ' -f1)
node "$INSPECTOR" "$ZERO" --expect "$H0" --refs-none   # PACKAGE: complete (0 referenced resources); exit 0
node "$INSPECTOR" "$ZERO" --expect "$H0"              # PACKAGE: not-checked; exit 0
```

The flag must change the `PACKAGE` line. Identical output with and without it
means the flag is inert, whatever the exit code says. Then the conflict and
own-package branches:

```
node "$INSPECTOR" "$ZERO" --refs-none --ref skill-artifact-commit-provenance/scripts/commit-provenance.mjs
# ERROR: --refs-none cannot be combined with --ref; exit 2

node "$INSPECTOR" ~/.qoder/skills/skill-artifact-commit-provenance/SKILL.md \
  --ref skill-artifact-commit-provenance/scripts/commit-provenance.mjs
# REF skill-artifact-commit-provenance/scripts/commit-provenance.mjs: tracked; PACKAGE: complete; exit 0
```

`--expect-path` needs a staged set, so exercise it in a throwaway repo; the
skills repo is untouched:

```
T=$(mktemp -d); git -C "$T" init -q
printf 'a\n' > "$T/a.txt"; printf 'b\n' > "$T/b.txt"
git -C "$T" add a.txt b.txt; git -C "$T" commit -qm t
printf 'a2\n' > "$T/a.txt"; printf 'b2\n' > "$T/b.txt"; git -C "$T" add a.txt b.txt
node "$INSPECTOR" "$T/a.txt" --expect-path b.txt   # STAGED_OK: yes; exit 0
git -C "$T" reset -q b.txt
node "$INSPECTOR" "$T/a.txt" --expect-path b.txt   # STAGED_SET_NOT_EXACT (missing: b.txt); exit 1
```

The second run must name `b.txt` and exit 1; two identical verdicts mean the
flag is inert.

Measured 2026-10-26: the zero-reference package above (`543b8f42…`) printed
`complete (0 referenced resources)` with the flag and `not-checked` without it,
both exit 0; the conflict exited 2; the own-package run printed the tracked
`REF` and `PACKAGE: complete`, exit 0; the staged-set pair printed
`STAGED_OK: yes` then `STAGED_SET_NOT_EXACT (missing: b.txt)`, exits 0 and 1.
A new flag needs its own paired run that changes a named output line before
this file documents it.

## Commit message rules

- The subject states the staged change, not the plan.
- A package commit names the package in the subject and carries the whole
  expected set in one commit; one commit per file leaves validated files
  uncommitted and the package partial.
- A first commit of a file that concurrent sessions also edited must name their
  content in a separate paragraph; never present it as yours.
- Name concurrent sections from the recovered blob, not from memory, and record
  HEAD before and after: a moved HEAD means your commit landed on another
  writer's commits and the report must say so.
- If only the file was committed while its bundled resources stay untracked,
  say so.
- Do not claim tests, accuracy, registration, clinical approval or a winning
  engine unless this run measured it.

## Report template

```
REPO: <top-level> | none | forbidden (<parent>, <reason>)
AUTHORITY: <owner choice or rule>
EXPECT_PATHS: artifact-only | <companion paths>
COMMITTED_PATHS: <paths>
PER-FILE CHAIN (one row per committed file):
  <path>
    H0/H1/H2/H3: <sha256> MATCH | DRIFT at <stage>
    CHAIN: h0=h1 <match|differ>; h1=h2 <match|differ|absent>; h2=h3 <match|differ|absent|index-absent|head-absent>
    PACKAGE: complete | complete (0 referenced resources) | partial (<untracked refs>)
TARGET_STAGED: no | yes | deleted
H4: <sha256 per file> | not-measured
COMMIT: <short sha> | not created
HEAD: <short sha before staging> -> <short sha after the commit>
STAGED_EXTRA: none | <paths>
STAGED_MISSING: none | <paths> | not-checked
TRACKED_FILES / UNTRACKED_FILES: <n> / <n> (recursive)
VERDICT: COMMITTED_PROVEN | MESSAGE_ONLY | BLOCKED (<reason>)
```

A one-file commit has one row; a three-file package has three, each with its
own digest chain and its own `PACKAGE` reading — never collapsed into one
digest or one `PACKAGE` line.

The inspector's `VERDICT` is mechanical; the report's is a conclusion. Map them
explicitly: `MATCH (h0=h1=h2=h3)` under `--require-complete` →
`COMMITTED_PROVEN`; `MEASURED_ONLY` or a pending index/head → `MESSAGE_ONLY`;
`DRIFT`, `STAGED_SET_NOT_EXACT` or `CHAIN_BROKEN` → `BLOCKED` naming the stage.
A pre-commit `CHAIN_INCOMPLETE (head absent)` becomes `MESSAGE_ONLY` only if
the commit is never made; while the workflow runs it is not a verdict.
`PACKAGE` is never `not-checked` in a report: pass `--ref` for each enumerated
resource, or `--refs-none` when the enumeration returned none. `--expect-path`
checks membership in the staged set, not the companion's bytes: run the
inspector once per committed file, with that file as `<artifact-path>` and the
others as `--expect-path`, so every file gets its own H0–H3 chain.

`STAGED_EXTRA` and `STAGED_MISSING` are quoted from the run made while the set
was staged. After the commit the index is clean, so a post-commit run prints
`STAGED_EXTRA: none` trivially and `STAGED_MISSING: not-checked`; those are not
set proof.

## Measured cases

The measured runs behind this skill ground the rules above; their digests,
counts and headings live in
[references/measured-cases.md](references/measured-cases.md). Counts drift, so
re-measure them on every run.

## Hard rules

- Measure repo membership from the artifact's directory every time; a sibling
  repo is not a default target.
- After that resolution, run status, add, diff and show from `<root>` with
  repo-relative paths. Never use the artifact directory as the pathspec base,
  and never read empty output as clean or as untracked.
- AGENTS.md and task rules outrank convenience; repo membership is not
  permission.
- No `git init` in a shared directory without the owner's explicit choice;
  report the side effects afterwards.
- Drift means re-read the whole file and re-run the complete validation suite;
  update H0 only after it passes.
- H0 is recorded only after a passing validation of those exact bytes and is
  never backfilled from H1.
- A multi-file commit has no single H0: record one per file, all from the same
  passing validation run.
- Prove a newly referenced resource exists and runs before it enters the
  commit.
- Stage exact paths only, then verify the staged set against the expected paths;
  name each approved companion with `--expect-path`.
- Preflight the index before the first `git add`; a non-empty index that is not
  your own resumed expected set stops the commit, and never unstage another
  writer's paths.
- `--expect-path` proves set membership; each committed file still needs its own
  H0 = H1 = H2 = H3 chain.
- A first commit carrying concurrent content must name it.
- A file-level commit is not a committed package; list untracked referenced
  resources.
- Zero referenced resources is `complete (0 referenced resources)`;
  `not-checked` is not a reportable package state.
- H0 = H1 = H2 = H3 is the proof; the commit's exit code is not.
- An inspector edit is unproven until each documented flag changes a named
  output line in a paired run; `node --check` and `--help` alone prove nothing.
- Drift after staging is cleared with `git restore --staged -- <rel>` before
  anything else; never commit around a stale index entry.
- Wait for a sustained quiet window before validating bytes a concurrent writer
  is still changing; three quick identical reads are not stability.
- Recover your validated blob from the object store to attribute hunks you did
  not write, and cross-check a worktree-modified inspector against raw digests.
- No config changes, amend, reset, force-push or push.

## Boundaries / non-claims

- A proven commit says nothing about correctness, test coverage, skill
  registration or clinical validity.
- `COMMITTED_PROVEN` is local. Publishing is a separate authorised action: the
  source session's push was denied 403, local and remote `main` shared no merge
  base, and `origin` had appeared mid-run from another terminal.
- The owner's choice authorises one commit of one named path set, not a
  tracking policy for the whole directory.
- Do not stage memory files, sibling skills or evidence directories that were
  not named.

## Related skills

- `skill-dir-concurrent-write-reconcile` — concurrent writes inside one skill
  directory; its Boundaries explicitly exclude committing.
- `concurrent-skill-md-edit-recovery` — merges an in-file edit conflict before
  you get here.
- `skill-postwrite-registration-verification` — proves a written skill
  actually loads.
- `verify-skill-source-session` — verifies claims about a session; this skill
  verifies committed bytes.
- `bundled-script-verification-checklist` — general gates for bundled scripts
  (syntax, silent exit-0, per-branch failures); the self-check above is this
  inspector's flag-discrimination matrix.
- `shell-command-result-verification` — why an empty or exit-0 result is not
  proof; this skill applies that to git status output.
- `git-push-destination-preflight` — owns publishing; `COMMITTED_PROVEN` is
  local, and a push re-resolves credentials, destination and history.
- `frozen-snapshot-immutability-rehash` — re-hashes frozen snapshot lists, not
  commits.
- `session-sourced-skill-distillation` — orchestrates skill creation and
  delegates commit proof here.

## Resources

- [scripts/commit-provenance.mjs](scripts/commit-provenance.mjs) — read-only
  inspector for repo ownership, H0–H3, the equality chain, `TARGET_STAGED`,
  staged extras, missing expected paths, referenced-resource tracking and the
  verdict. `--help` prints usage.
- [references/concurrent-writer-recovery.md](references/concurrent-writer-recovery.md)
  — post-staging drift, quiescence, blob recovery, inspector trust, HEAD moves.
- [references/measured-cases.md](references/measured-cases.md) — the runs behind
  these rules: digests, counts and what each run did and did not prove.
