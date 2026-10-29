---
name: user-skill-overlap-audit
description: Read-only duplication and concurrent-write audit of the ~/.qoder/skills tree, run before creating or renaming a Skill. Use when a recommendation proposes a new name and you must prove the content is new: near-duplicate clusters by description and heading vocabulary, Skills that ship scripts/ but have no SKILL.md yet (the blind spot the scored matcher cannot see), links in a SKILL.md that resolve to nothing, and another agent writing into the same tree (mtime window plus source-session revision growth). Use when a duplicate check came back clean and you must decide whether that is proof - a measured known near-duplicate pair scored below the default threshold and still passed. The scored matcher and the scope decision live in session-sourced-skill-distillation step 4; this adds the orphan inventory, the link-resolution control and the concurrency measurements. Not the source-session verification flow (verify-skill-source-session) and not edit-conflict recovery (concurrent-skill-md-edit-recovery).
---

# User Skill overlap audit

## Overview

Use two phases: inspect the existing tree and present scope before confirmation;
after approval, score the authorized draft before changing the installed Skill.
The audit itself is read-only. If no authorized draft exists, defer step 3 rather
than writing one to satisfy the checker; complete the other read-only steps first.

## Step 1 - authoritative tree listing

Define one candidate set: direct, non-hidden Skill directories in the verified
skills root. Exclude dot-prefixed entries such as `.git` and any other identified
administrative directories before counting packages, checking for `SKILL.md`, or
inspecting orphan contents. Reuse that set for counts, step 2 and step 4; an
excluded entry is neither an orphan nor a concurrency candidate, and its contents
must not be enumerated. Materialize the set once per audit pass; when using Python,
retain it as `candidates`, a list of absolute `pathlib.Path` directory objects.

```
cd /Users/khoi/.qoder/skills && ls -1d */ | wc -l && ls -1 */SKILL.md | wc -l
```

These shell examples assume default globbing that excludes hidden entries and no
additional non-hidden administrative directories. When substituting Python,
Node.js or `find`, preserve the same root, depth and exclusions explicitly; raw
filesystem enumeration does not inherit shell glob filtering. If additional
administrative directories exist, filter them in the candidate set rather than
running these examples unchanged. Verify a replacement against both a visible
orphan and an excluded administrative directory before trusting an empty result.

Two numbers. Measured `27` dirs / `26` SKILL.md at 23:44, then `33` / `33` at
23:49 - both the total and the gap move within minutes. Unequal means orphans
exist (step 2). The count in a recommendation is never current: one session
reported `8` near-duplicates at proposal and `7` at completion. Re-run this
listing immediately before every write and report the number you just measured.

## Step 2 - half-product inventory (what a name scan cannot see)

Run in the same verified root, using step 1's candidate set. Apply exclusions
before inspecting contents, not merely before printing the final count. Prune
hidden administrative subtrees inside an orphan as well.

```
for d in */; do d="${d%/}"; [ -f "$d/SKILL.md" ] || echo "NO_SKILL_MD $d :: $(find "$d" -name '.*' -prune -o -type f -print | sed "s|^$d/||" | paste -sd, -)"; done
```

Measured at 23:33: `NO_SKILL_MD user-skill-overlap-audit ::
scripts/check_skill_overlap.mjs` and `NO_SKILL_MD
filled-pdf-unsanctioned-mark-audit :: scripts/png.mjs,...`. Both were complete by
23:47 and the loop then returned nothing - which is a pass, not a stale claim,
only because the timestamp is stated. Always print the loop's output with the
run time, never a remembered list.

A Skill with resources but no `SKILL.md` is invisible to description-matching
tools, including the checker in step 3, because they index only directories that
have one. So an orphan is both a broken package and a blind spot. Use this
inventory or an equivalent filtered enumeration, not the scored matcher alone.

For dangling links inside an existing Skill, use the package checker rather than
a path grep:

```
node /Users/khoi/.qoder/skills/verify-skill-source-session/scripts/check_skill.mjs <skill-dir>
```

Verified in both directions: a known-good Skill returns `VERDICT: OK` (exit 0);
a fixture linking a nonexistent resource returned `VERDICT: PROBLEM` /
`broken relative link: references/nope.md` (exit 1).

Do not substitute a bare-path grep for it. A `grep -oE '[A-Za-z0-9._-]+/...\.(mjs|md|...)'`
over all SKILL.md files produced 36 unresolved hits here and almost none were
real: `out/draft.pdf`, `tests/ocr-benchmark/cli.test.mjs` and `work/...` are
workspace-relative paths, and `/Users/...` loses its leading slash. That command
is a false-positive machine; report it as noise, not as findings.

## Step 3 - score the draft against installed Skills

Check authorization before requiring a draft. If no authorized draft file exists
and writes await confirmation, compare existing descriptions and bodies only;
report `DRAFT_SCORING_DEFERRED: awaiting authorized draft`. Do not create even a
temporary draft to unblock this read-only phase, and do not replace it with a
bare-name score or report that the proposed draft passed. An installed Skill may
be scored as an explicitly labeled baseline, not as the proposed revision.

After approval, prepare the draft in the authorized staging location, run this
step and refresh steps 1-2 before applying the approved change. If new overlap
changes the approved scope, stop and ask again. A deferred score is not a waiver.

When the top candidate is the sibling the owner has already approved as this
Skill's complement, a REVIEW there confirms the approved division of labor
instead of reporting an undisclosed duplicate. Record the exact score and a
two-sided threshold control, each with its command and exit code: a higher
`--review` that clears the candidate and a lower one that admits it. Measured:
score `0.208` against the approved complement at the default `--review 0.2`
(`CANDIDATES 1`, `VERDICT: REVIEW`, exit 1); `--review 0.5` returned
`CANDIDATES 0` / exit 0; `--review 0.1` returned `CANDIDATES 2` / exit 1. A REVIEW against a sibling
outside the approved split still stops the landing and reopens step 5, unless
the only cause is the boundary clause you just added; move that clause to the
body and re-score first. A REVIEW that survives the move is the real scope
signal.

```
node /Users/khoi/.qoder/skills/session-sourced-skill-distillation/scripts/check_skill_overlap.mjs <draft-SKILL.md> [--dir <skills-dir>] [--review 0.2] [--flag 0.35] [--update <installed-SKILL.md>]
```

When the draft updates an installed Skill, pass the installed predecessor to
`--update` so the draft is not compared with the version it replaces; without
it, the same-name installed copy is a candidate and the verdict is a
self-collision, not an overlap finding. The flag requires a file draft and a
name match.

The matcher is owned by `session-sourced-skill-distillation` step 4; it moved
there mid-audit, so reference it at its real path and verify the path before
running it. Pass the draft file, never a bare name - two measured reasons: a
bare name has no description tokens to compare, scoring the real same-topic pair
at `0.012` with `CANDIDATES 0`; and while your working directory is the skills
tree, a bare name resolves to a directory, which the matcher reads as a file and
dies on with an uncaught `EISDIR: illegal operation on a directory, read`.

Read the printed top rows and `HEADINGS`, not just the verdict. `--review` and
`--flag` are display heuristics and adjustable flags, not measured limits. The
matcher scores only the `description`; `HEADINGS` are printed for context and do
not affect the score. A description rewrite is therefore a new input, and a
score from an earlier draft is not evidence for the landed text. Re-score after
every wording change and attach the score to the exact final description (byte
count or hash), not the first attempt. Move trigger detail the description no
longer carries into the body instead of dropping it.

Proof that the verdict is a threshold artifact, measured on this Skill's own
`SKILL.md` at 2026-10-26 (1010-char description, 51 packages): the default
`--review 0.2` returned top score `0.121`, `CANDIDATES 0`, `VERDICT: OK`, exit
0; `--review 0.10` returned `CANDIDATES 3`, `VERDICT: REVIEW`, exit 1. An
earlier reading of `0.142` / `2` was taken against a different description and
tree; both inputs moved. Re-run the same draft at a lower `--review` as the
positive control before trusting a clean verdict - the predicate must be able
to fire. The scorer sorts wording; the overlap judgment, made by opening the
candidate's body, stays yours.

## Step 4 - concurrency signals (two independent ones)

Filesystem side: consume step 1's materialized candidate set, not a fresh
root-wide search. Inspect only each candidate's direct `SKILL.md`; do not recurse
into resources or excluded directories and filter their names afterward.

Run these read-only Python fragments in the same interpreter as the inventory,
with `candidates` from step 1. They are not standalone shell commands. Capture one
clock value and one metadata snapshot for both filters; report the observation
time, chosen bounds and matched paths. Rebuild the inventory with the same
exclusions for a later audit pass rather than silently mixing two candidate sets.

```python
from time import time

observed_at = time()
mtimes = {}
for directory in candidates:
    manifest = directory / "SKILL.md"
    if manifest.is_file():
        mtimes[manifest] = manifest.stat().st_mtime
recent = {str(path) for path, stamp in mtimes.items()
          if stamp > observed_at - 600}
print("RECENT", sorted(recent))
```

For a fixed window, set `window_start` and `window_end` to Unix timestamps from
explicit timezone-aware bounds, with start before end. Preserve the original
strict lower / inclusive upper comparison:

```python
window = {str(path) for path, stamp in mtimes.items()
          if window_start < stamp <= window_end}
print("WINDOW", sorted(window))
```

After fixture writes are authorized, prove both filters with an exact expected
path set, not just an exit code or hit count. Include an eligible manifest inside
the window and one outside it; place in-window sentinels in both a hidden
administrative directory and an explicitly excluded non-hidden directory. Neither
excluded sentinel may be inspected or returned. Add a nested resource manifest
to prove the direct-file limit. Test the lower and upper boundaries for the fixed
window, and pair any empty-result case with an eligible positive control.

The source audit's recent-mtime control returned both `./good/SKILL.md` and
`./.admin/SKILL.md` while reporting success. Its narrow-window control returned
only the good file, which did not prove directory exclusion: the excluded
sentinels must themselves fall inside each tested window. Treat any extra path
as a failed control even when the process exits 0.

Session side: call `mcp_get` once, then `mcp_call` on
`mcp__builtin__read_chat_session` with the source `sessionId` twice. A growing
`revision` with `runtimeState: "running"` means that session is still executing
and may be writing Skills now - measured `revision: 62` then `68` on the same id.
`hasMoreBefore` does not affect this reading.

## Step 5 - present scope, then let the user choose

Never merge silently. Offer, with each option's blast radius:

1. update the overlapping sibling with only the uncovered rules - default when
   one topic already has a home;
2. complete the orphan found in step 2 instead of adding a fourth name;
3. create a thin orchestrator that delegates to the siblings;
4. create the new name and narrow the siblings' trigger wording.

State the verified non-overlapping residue separately from the duplicate
finding, so the user can still choose to create.

When a new or updated Skill is approved, keep the named division of labor in the
package body - a `## Boundaries` or equivalent section - where it does not feed
the scorer. The `description` carries this Skill's own triggers and topic-level
exclusions; a clause that names a sibling and restates its scope imports that
sibling's vocabulary into the only scored field. Measured 2026-10-26 on a draft:
the initial 1017-char description scored `0.181`; adding a boundary clause
naming `instruction-only-skill-fixture-smoke-test` and restating its scope raised
the top score to `0.246` at 1009 chars; shortening the description to 790 chars
and moving the named division into the body's `## Boundaries` returned it to
`0.134`, `CANDIDATES 0`, exit 0. The `0.246` row shared `asked run never
executed checks green` - the sibling's own trigger words - so the mechanism is
the restated scope, not the name by itself. If the only `REVIEW` is the clause
you just added, move it to the body and re-score before treating the candidate
as a real duplicate; a `REVIEW` that survives the move is a scope signal.

The named boundary can stay in the description when routing needs it, but only
with a measured score below the review threshold and the full division in the
body. The accepted model `Process contract and report-order rules live in
bounded-evidence-benchmark-report; engine specifics live in
apple-vision-ocr-harness` is one such instance (950-char description, top score
`0.189`), not a template: it sits close to the threshold and was not measured
against a shorter alternative. Put that sentence in the body's Boundaries
section; copy it into a description only after measuring that exact sentence.

## Step 6 - build outside the tree, then land in one copy

Steps 1-5 perform read-only inspection; step 3 can be deferred until an authorized
draft exists. Only after approval, author the package outside the tree, complete
any deferred score and refresh the inventory before landing the approved change.
For updates, preserve the existing package and apply only approved file changes.

DO NOT RUN the following creation copy during validation: it changes the installed
tree. It is a creation-only template for an approved, absent destination, not an
update command or permission to overwrite an existing package.

```
# author the package under a directory named exactly after the Skill
/tmp/<stage-dir>/<name>/SKILL.md   (/tmp/<stage-dir>/<name>/scripts/...)

# the checker reads the parent folder name, so run it on the package directory
node /Users/khoi/.qoder/skills/verify-skill-source-session/scripts/check_skill.mjs \
  /tmp/<stage-dir>/<name>

# re-run steps 1-3 against the staged file, then land once
cp -R /tmp/<stage-dir>/<name> "/Users/khoi/.qoder/skills/<name>"
```

Author the whole package - `SKILL.md` plus its resources - before any of it
enters the tree. A directory in the tree with resources but no `SKILL.md` is the
orphan from step 2, and while it is half-written it is also invisible to the
matcher in step 3, so it can be neither audited nor deduped. Landing in one copy
leaves the final state as the only observable one.

Measured 2026-10-25: a draft at
`/tmp/remote-push-access-preflight-stage/SKILL.md` failed with `VERDICT:
PROBLEM` / `name 'remote-push-access-preflight' != folder
'remote-push-access-preflight-stage'` and exit 1; the identical bytes under
`/tmp/rpap-stage/remote-push-access-preflight/SKILL.md` (same SHA) returned
`VERDICT: OK` and exit 0. The checker judges the parent folder name, so a flat
stage root fails on layout even with correct content. Copy from the package
directory, not the stage root, or the tree lands `<name>/<name>/SKILL.md`. That
run also reported `description 1073 chars > 1024`, a content failure the layout
fix does not cover.

Two timing facts this section exists for, measured 2026-10-25. A start-of-turn
listing at 16:21 did not contain the sibling that later forced the stop; it
appeared at 16:32, and only a listing taken after the first file was already
written could see it - so the step 1 re-listing is meaningful immediately before
the copy, not at task start. Second, an empty `references/` beside a just
written `SKILL.md` is a state, not a verdict: it held `total 0` at 16:32:55 and
the cited file was there by 16:34. Re-poll an in-flight sibling before reporting
its link as dangling.

Immediately before the copy, re-hash every sibling named in the division of
labor and re-read the section that states its scope boundary; a hash that moved
since the approved score is a new input, so re-run step 3 at that hash before
copying. After the copy, hash the landed `SKILL.md` against the staged file and
run the package checker on the landed path. Measured 2026-10-25: the approved
complement moved through five hashes from `134e6c97` to `f769d81a` and 232 to
462 lines between the first score and the landing; the landing gate re-listed
the tree, re-read the sibling's boundary lines and hashed `f769d81a` at
06:46:27, `cp` exited 0, and staged and landed files both hashed `897340557d8e…`
with `VERDICT: OK` on the landed path.

## Hard rules

- Read-only. This audit never deletes, renames, merges or "tidies" a Skill.
- Filter administrative directories before counts, orphan inspection and concurrency
  metadata reads; reuse the same candidate set across steps 1, 2 and 4.
- Verify timestamp controls by exact path sets, with eligible and excluded
  in-window sentinels; exit 0 alone cannot prove scope correctness.
- No draft writes before confirmation, including temporary files. Report deferred
  scoring explicitly, then complete it on the authorized draft before installation.
- `CANDIDATES 0` and any clean script verdict are display results, never proof.
- Existence and absence claims expire in minutes. Re-inspect the path; the
  orphan measured at 14:14 had an 11 KB `SKILL.md` by 14:15.
- Never report a threshold you have not run. Quote the score and the flag that
  produced it.
- The description is the only scored field. Re-score after every description
  rewrite and attach the score to the final wording; a score from an earlier
  draft is stale. A `REVIEW` that disappears when the named boundary moves to
  the body was a wording artifact, not a duplicate.
- Keep the named division of labor in the body. A sibling name in the
  description needs a measured score below the review threshold and the full
  division in the body.
- A new Skill is authored outside the tree and landed in one copy; a directory
  with resources but no `SKILL.md` is the step 2 orphan, never an acceptable
  intermediate state.
- Stage as `<stage-dir>/<name>/SKILL.md`, pass the package checker on that
  directory before the copy, land that directory, and prove staged == landed
  hash. A flat stage root fails the folder-name check with correct content.
- A REVIEW against the owner-approved complement is recorded with its score and
  higher/lower threshold controls; REVIEW against any other sibling stops.
  Re-hash and re-read that sibling's boundary section immediately before the copy.
- If the file you chose is mid-edit by another session, stop and use
  `concurrent-skill-md-edit-recovery` instead of overwriting it.

## Resources

No bundled resources. The scored matcher used in step 3 lives in
`session-sourced-skill-distillation/scripts/check_skill_overlap.mjs` and the
package checker used in step 2 lives in
`verify-skill-source-session/scripts/check_skill.mjs`. Both are read-only and are
invoked by absolute path instead of copied here - a second copy would be the
duplication this audit exists to catch.
