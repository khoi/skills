---
name: skill-dir-concurrent-write-reconcile
description: Keep a real run attributable and another session's edits intact while two sessions write one skill directory. Use when a skill's SKILL.md, references/ or scripts/ mtime moves between your read and your edit, when a new file appears in a skill you run, when a description length moves without you, when a report must name the tooling bytes it used, or when adjacent work must land beside a sibling being rewritten. Covers mtime timeline, backup before takeover, hash-pinned tooling, surgical anchored edits, landing an adjacent package citing a moving sibling by skill name and section title, not line number, proving an untouched set stayed byte-identical, verifying their numbers at artefacts and separating a matching value from an unconfirmed cause, reconciling conflicting totals in labelled columns, recording a deliberate default, timestamping verification counts, and disclosing the race. Not the in-file merge loop (concurrent-skill-md-edit-recovery) or pre-write duplication audit (user-skill-overlap-audit).
---

# Skill directory concurrent write reconcile

## Overview

Two sessions writing one skill directory is a normal state in this workspace, not an incident. What
must survive is twofold: the other session's work, and the attributability of your own result. A run
that finished while the tooling was changing underneath it is only reportable if you can name the
bytes it used. This skill is the directory-level procedure; when the conflict is inside one file's
edit, hand off to the sibling skill named in Resources.

## When this fires

- A file's mtime is newer than your last write and you did not write it.
- A new `references/` or `scripts/` file appears while you work.
- `description` length, heading outline or line count moved between your read and your edit.
- Two sessions' edits interleave to the second.
- You must keep producing a real result from a package that is still being extended.

## 1. Build a timeline before touching anything

Record your own clock, then list every file with its mtime. The other writer is identified by
mtime, not by content guesses.

```sh
date "+%H:%M:%S"
find <skill-dir> -type f -exec stat -f "%Sm %z %N" -t "%H:%M:%S" {} \; | sort
```

Compare each mtime against your own edit timestamps from the same session. A file newer than your
last edit, which you did not write, is a concurrent author. Say that; do not call it corruption and
do not revert it.

## 2. Back up before takeover

```sh
cp -R <skill-dir> "/tmp/<name>-backup-$(date +%H%M)"
```

Hash the backup and one live file to confirm the copy is real. From here on, "restore" means
restoring *your* edits from this snapshot, never rolling the directory back over the other
session's work.

## 3. Pin the tooling, then run the copy

```sh
node scripts/snapshot-package.mjs snapshot <skill-dir> \
  --out <run-dir>/HASHES.txt --copy-to <run-dir>/tooling
```

Run the job from `<run-dir>/tooling`, not from the live skill directory, and cite
`<run-dir>/HASHES.txt` in the report. Pin after your own edits and immediately before the real
run; if you edit again afterwards, re-pin and state which run used which manifest. A report that
says "ran the skill's script" without a manifest is unattributable once the package moves again.

## 4. Edit surgically

- Re-read the file immediately before each Edit, and anchor on surrounding text, never on line
  offsets captured before the race.
- Never rewrite a whole file from a cached copy and never `git checkout`/`restore` a file another
  session is writing — both erase their work.
- Keep payloads small and complete; that is `chunked-write-edit-payloads`.
- If an Edit says the file changed since your last read, stop editing and switch to
  `concurrent-skill-md-edit-recovery` for the in-file merge (re-read whole file, judge coverage by
  meaning, withdraw only your own block).

## 5. When the work belongs beside a moving sibling, land a separate package

Complementary work is not automatically a new section of the nearest skill. If that neighbour is
being rewritten while you draft, adding to it means writing into a file whose headings move under
you.

- Standalone procedure, gate or ownership boundary → author a new package. One fact that belongs
  inside the neighbour's existing step → leave it to that file's author, or wait until it settles.
- Cite the moving sibling by skill name and section title, never `path:line`. Measured: the sibling
  went 232 → 274 → 337 lines within one proposal turn, then 499 → 510 lines while this landing was
  being checked; a line captured at the first read was already wrong at the second.
- State the boundary in both directions: what the sibling owns, what it leaves to you, and the
  section you checked.
- Immediately before the single landing copy, not at drafting time, re-hash the sibling and re-read
  that section. If it now claims your topic, stop — that is duplication, not a boundary. If it moved,
  correct your wording first.
- Record the sibling's hash and line count at landing beside the section you checked.
- Read the citation checker's denominator. `citations: 0` with `VERDICT: OK` is a vacuous pass; a
  name-and-title reference is proven by the landing re-read, not by that script.

## 6. Prove the untouched set stayed put, with a control

```sh
node scripts/snapshot-package.mjs verify <run-dir>/HASHES.txt \
  --root <skill-dir> --only <relative/file>,<relative/file>
```

Name only files you did not touch, as package-relative paths the manifest actually contains. A name
absent from the manifest is a usage error (exit 2) — that is how a path list copied from another
package fails, so re-derive the list instead of pasting one. `VERIFY OK ... checked=N` means those
bytes are identical to the snapshot, so the other writer has not reached them.

The clean result counts only with an expected-drift control on the same manifest: re-run the same
command with `--only` on a file you know you edited (an approved edit), and require `VERIFY DRIFT
... CHANGED <file> <before> -> <after>` and exit 1. Also confirm the usage branch still separates
from drift: the script with no arguments exits 2. A verifier that silently compares nothing also
prints `VERIFY OK`, so the control is what turns the clean line from an assumed exit code into a
measured one. Report both lines, labelled `clean` and `control`.

Measured 2026-10-26 against one pre-edit manifest: `--only scripts/snapshot-package.mjs` →
`VERIFY OK ... checked=1 changed=0`, exit 0; the same manifest with `--only SKILL.md` → `VERIFY
DRIFT ... CHANGED SKILL.md d8aa42a3 -> 19aee0e7`, exit 1; no arguments → exit 2. The drift was the
approved edit, not a defect — that is exactly what makes the clean line interpretable.

Two limits remain: your own later edits still show as `CHANGED`, so scope with `--only` instead of
re-snapshotting away the evidence; and a clean check proves only that no write was observed between
the snapshot and this check. Report it as "no writes observed between A and B", not "the process
stopped". A single clean check immediately after a foreign write is not a quiet interval — re-check
after work continues.

## 7. Verify the other writer's numbers at the artefact

Their prose is a claim, not a measurement. For every number you intend to keep, open the cited
artifact and read the field. Keep their wording when it is right; correct only what the artefact
contradicts; label what you could not check as unverified. Recipes are in
`references/evidence-reconciliation.md`.

A matching value does not validate the explanation attached to it. The artefact can confirm
`inkLost: 6` and say nothing about why. Keep the recorded value, mark the cause unattributed, and
re-run the tool that produced it on the retained inputs before you repeat the cause in your own
words. Measured case: the file held `inkLost: 6`, the merged prose explained it as ink sitting under
the glyphs, and a re-run over the retained rasters produced `0` — the value was kept, the
explanation withdrawn.

## 8. Reconcile conflicts in two labelled columns

Two tools with different state models legitimately produce different totals for the same page. Do
not pick one, average them, or silently relabel one to match the other. Write both readings with the
tool and state model named, and say which conclusion each supports. In the measured case, the
two-state tool read `4 empty / 19 occupied` while the three-state gate read `4 empty / 6 occupied /
13 indeterminate`; only the three-state reading prevents a report from claiming those boxes were
already ticked. The disagreement is information, not noise to smooth.

## 9. Disclose the race in the report

Add a short section that names: which files the other session wrote and when, where the backup is,
the run manifest path with the hash of the tooling it pins, what stayed untouched, and what the
reconciliation changed. Write it even when the race changed nothing — an unattributed quiet race is
still a fact about the environment, and the next reader cannot reconstruct it from a clean report.

## 10. Record a deliberate default

When the owner keeps a permissive default instead of tightening it, write the decision into the
reference with its date and its reason, in a shape a later pass cannot read as a bug: what the
default accepts, why existing inputs still depend on it, and that strictness belongs to an opt-in
flag. Measured wording from 2026-10-25: "The permissive default is deliberate (decided 2026-10-25)
… Do not 'fix' it by making absence mean `unverified`; tighten it per invocation with the flag
instead." Say it in the report too, so a reviewer reads a decision rather than an oversight.

## 11. Verify the package and timestamp the counts

Run the package checker and the package's own self-test after your edits, and quote the counts with
the command and the run they came from. Counts move as a package grows: one session measured
`passed=19` at merge time and `passed=24` after a later feature, both with `VERDICT: OK`. A count
without its run is not evidence about the current package, and it must not be copied forward.

## Hard rules

- A foreign mtime is a concurrent author. Preserve their work; never revert or delete it.
- Back up before takeover, and restore only your own edits from that backup.
- Run from pinned bytes. No manifest, no attributable result.
- A clean untouched-set check counts only with its expected-drift control on the same manifest; a
  verifier that cannot be made to fail proves nothing.
- Edits are anchored and incremental; no whole-file rewrites of files another session may be writing.
- In-file edit conflicts go to `concurrent-skill-md-edit-recovery`; do not improvise a merge here.
- "Stopped" is a time-bounded observation, never a claim about the other process.
- Numbers are verified at the artefact. Unchecked claims are labelled, not assumed correct.
- Conflicting totals are reported as two labelled readings, never merged.
- The race is disclosed in the report, including when it changed nothing.
- Adjacent work lands as its own package; never widen a moving sibling to make room for it.
- A moving sibling is cited by skill name and section title, never by line number; re-read its
  boundary clause immediately before landing.
- A `VERDICT: OK` from a run with `citations: 0` is vacuous; name what the checker did not cover.

## Boundaries

This skill governs how to keep working safely in a shared directory. It does not authorize editing
another session's files, deleting anything you did not create, widening the task, committing,
deploying, or touching skills outside the one named by the task.

## Resources

- `scripts/snapshot-package.mjs` — hash every file in a skill directory to a manifest, copy the
  bytes for the run (`--copy-to`), then `verify` drift with `--only` for an untouched set. Exit 0
  clean, 1 drift, 2 usage error. Raises a usage error rather than a traceback for a missing
  directory or manifest.
- `references/evidence-reconciliation.md` — per-claim-type verification recipes, the measured
  examples, and the reporting lines to copy.
- `/Users/khoi/.qoder/skills/concurrent-skill-md-edit-recovery/SKILL.md` — the in-file merge loop.
- `/Users/khoi/.qoder/skills/verify-skill-source-session/scripts/check_skill.mjs` — read-only package
  checker for the target skill after your edits land.
