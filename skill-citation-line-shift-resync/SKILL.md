---
name: skill-citation-line-shift-resync
description: Re-point a skill package's file:line citations after your own edit shifts a referenced file. Use when an insertion or deletion above a citation in references/*.md moves the headings below it, when check_skill.mjs and check_citations.mjs both return VERDICT: OK while a citation now prints a table row or the wrong heading, or when added rows are duplicated between SKILL.md and a reference and both copies must change in one pass. Covers the pre-edit heading map, change-point selection, recomputing from the post-edit heading map instead of adding a guessed offset, asserting the printed anchor with scripts/check_citation_anchors.mjs, and re-running the package and citation checks. Detection rules stay in verify-skill-source-session and skill-postwrite-registration-verification; this skill is the repair and re-sync procedure. Not for authoring skill content, not for another session's concurrent edit (concurrent-skill-md-edit-recovery), and not for citations inside other packages.
---

# Skill Citation Line Shift Resync

## Overview

A `path.md:line` citation can survive an edit that moves its target. The checker
proves the file exists and the line is in range, and it prints that line so the
wording can be compared — but an in-range line may already point at a table row
or the wrong heading. This skill recomputes and re-points those citations from
the post-edit heading map, then keeps a table mirrored across `SKILL.md` and its
reference in the same pass.

## Trigger shape

- You inserted or deleted lines in a skill's `references/*.md` above an existing
  `file:line` citation.
- `check_skill.mjs` and `check_citations.mjs` both say `VERDICT: OK`, but a
  printed target line is not the section the skill claims.
- You added rows to a code table that also exists in `SKILL.md`.
- A citation number is still below the file's line count, so nothing failed.

## What the checkers can and cannot prove

Measured 2026-10-26 on a temporary fixture: a reference whose line 245 is a
`RASTER_CONTROL_FAILED` table row, cited by a `SKILL.md` that asserts
"§11 Running the raster gate" at that number.

```
check_citations.mjs -> OK  SKILL.md line 9 -> references/doc.md line 245
                            printed: | `RASTER_CONTROL_FAILED` | the known-different control ...
VERDICT: OK  rc=0
check_skill.mjs     -> VERDICT: OK  rc=0
```

Both green, anchor wrong. Only the printed text shows it, which is why
`check_citations.mjs` prints its own note that the line still has to be compared
against the asserted wording. `VERDICT: OK` from either tool is the starting
condition of this procedure, not its result.

Related trap, measured on this skill's own draft: `check_citations.mjs` scans
every Markdown file in the package, including fenced examples. Illustrative
citation paths written in the `path:line` form were reported as `file not found`
by the package's own pass. Keep examples in a non-parsed form, as this file does.

## Procedure

1. **Freeze the pre-edit map.** Before editing the reference:

   ```sh
   grep -n '^## ' references/doc.md > /tmp/doc.headings.before
   node ~/.qoder/skills/verify-skill-source-session/scripts/check_citations.mjs <skill-dir> --full > /tmp/cites.before
   ```

   The second file holds the assertions you are about to invalidate. After the
   edit the old line numbers are gone, so this snapshot is the only record of
   which claim sat where.

2. **Pick the change point.** The first inserted or deleted line of the edit.
   An insertion or deletion shifts only citations whose target line is at or
   after that point. Appending at the very end of the file shifts nothing;
   editing a section above the citations shifts all of them.

3. **Select affected citations.** From the pre-edit list, every citation into the
   edited file whose target line is at or after the change point. Citations into
   other files, and citations above the change point, do not move — leave them
   alone in this pass.

4. **Recompute from the post-edit heading map, never by assuming one offset.**

   ```sh
   grep -n '^## ' references/doc.md > /tmp/doc.headings.after
   diff /tmp/doc.headings.before /tmp/doc.headings.after
   ```

   Match by heading text. More than one insert in the same edit makes a single
   `+N` wrong. If a heading was renamed or removed, the asserted section no
   longer exists: that is a content fix, and the prose that cites it must change
   too.

5. **Re-point every affected citation.** Rewrite each one to the heading's new
   line. Do not assert yet: step 6 still writes to a citing file, and that moves
   the source line numbers this skill is checked against.

6. **Sync the mirrored table in the same pass.** When the rows you changed are
   duplicated (for example failure codes in `SKILL.md` and reference `§9`),
   every row edit in the referenced file belongs before step 4: an insert there
   moves the headings again. Mirror the rows into `SKILL.md` here and compare
   the code column of both tables in row order, not sorted — a sorted diff
   proves set and count only, not the order the hard rules also require. A
   green package check will not notice that one copy has 14 rows and the other
   13. The `SKILL.md` insert renumbers the citing lines below the table, so
   re-read them instead of reusing numbers captured earlier. If a
   reference-side row edit happens at this step, redo step 4 and step 5 before
   asserting.

7. **Assert the anchors against the final files, then re-run and tabulate.**
   Build the expectation file from the post-edit source lines and assert both
   halves — the citing line still contains that exact target, and the target
   line's text is the asserted section:

   ```sh
   node ~/.qoder/skills/skill-citation-line-shift-resync/scripts/check_citation_anchors.mjs \
     <skill-dir> --expect /tmp/anchors.txt
   ```

   One expectation per line, in the form `<source>:<line> -> <target>:<line> |
   <asserted section text>`. The script's `--help` prints a concrete sample.
   Then run `check_skill.mjs --check-refs`, then `check_citations.mjs --full`.
   The flag resolves only backticked inline code whose path begins with
   `scripts/`, `references/` or `assets/`, relative to the checked package; a
   `~/` or absolute path is not matched. A sibling package's file therefore has
   to be cited by its full `~/.qoder/skills/<pkg>/references/<file>.md` path —
   written bare it is read as a file this package must contain and fails as
   `broken inline-code path`. Do not copy the sibling file in to silence it.
   Report one row per citation: old line, new line, printed heading, asserted
   section. A citation you touched but did not print the anchor for is not
   verified. When rehearsing on a copy, name the copy directory after the skill:
   `check_skill.mjs` compares the frontmatter `name` to the folder name and fails
   on anything else.

## Worked example (one run, historical)

- Insert: four rows in `## 9. Failure codes` of
  `~/.qoder/skills/owner-approval-hash-binding/references/approval-record-and-delivery.md`
  (362 → 366 lines).
- Drift: `## 10. Sanitized worked example` moved from line 222 to 226;
  `## 11. Running the raster gate` moved from line 245 to 249.
- Affected: line 209 of `SKILL.md` cited 222; line 84 cited 245. Both stayed in
  range; the first printed a `RASTER_*` row instead of a heading.
- Repair: re-pointed to 226 and 249; the final citation pass printed
  `## 10.` and `## 11.` at both numbers.
- Mirrored table: `SKILL.md` failure codes and reference `§9` ended with the
  same 14 codes.

The counts above identify one run only; the line numbers are not constants to
reuse.

Rehearsed end-to-end on a copy of that package: two inserted rows moved `## 10.`
to 228 and `## 11.` to 251, and the mirrored two-row insert in `SKILL.md` then
moved the lower citation from line 209 to 211. The expectation written before
the mirror edit was rejected with `citing line does not contain …`; rebuilt
against the final lines it passed, and both checkers returned `OK` with 16 codes
in each copy of the table.

## Hard rules

- In range is not correct. Any citation at or after the change point needs
  review even when no checker complained.
- Recompute from the heading map. Do not re-point by adding the number of
  inserted lines when the edit had more than one change.
- Never call a package citation-verified from `VERDICT: OK` alone. Quote the
  printed anchor for every citation you touched.
- An assertion describes the final state. Its source line is itself a line
  number: an insert above it in that file moves it, so an assertion made before
  the last edit is stale. Rebuild the expectation and assert again; do not quote
  an earlier green.
- Do not re-point a citation owned by another package or outside the approved
  edit set; preserve it and flag it.
- A shifted range that still covers the right symbol is still wrong when the
  skill asserts a heading. Point at the heading line.
- Keep mirrored copies identical in code set, order and count.
- Write illustrative citations so the checker does not parse them, or the
  package's own citation pass will report them as missing files. Cite another
  package's file by its full `~/.qoder/skills/<pkg>/references/<file>.md` path;
  a bare `references/<file>.md` is resolved inside this package. Never copy the
  sibling file in to pass the check.
- If the file changed between your read and your edit, stop and use
  `concurrent-skill-md-edit-recovery` instead of writing over it.

## Boundaries

- `verify-skill-source-session` owns the post-write citation print-back and
  `skill-postwrite-registration-verification` owns the structure-versus-meaning
  split. This skill starts once a shift is suspected and ends when every
  affected citation has been re-pointed and asserted.
- `concurrent-skill-md-edit-recovery` handles another writer in the same file.
- `chunked-write-edit-payloads` keeps the edit itself reviewable.
- This skill does not author or restructure skill content, and it makes no claim
  about project artifacts, scans or clinical records.

## Resources

- `scripts/check_citation_anchors.mjs` — assertion gate for both halves of a
  citation. `--self-test` includes a must-fail stale-anchor fixture, so a clean
  run is only trusted after the predicate has been shown to fire.
- Shared read-only checkers live in `verify-skill-source-session/scripts/` and
  are invoked by absolute path instead of copied here.
