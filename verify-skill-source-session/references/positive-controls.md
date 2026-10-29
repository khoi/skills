# Positive controls for an empty or zero-item result

A check that returns nothing needs a control before it counts as evidence. The
hard case is a checker that legitimately finds zero items in the package under
test: its verdict is identical to a scanner that resolved nothing.

Step 11 (Controls) decides *that* a control is required. This file covers
*which* control to run and what its output must contain.

Division of labour: `bundled-script-verification-checklist` owns the exit
branches of a script you write, `skill-postwrite-registration-verification`
owns the full post-write pass set, `shell-command-result-verification` owns
shell status capture, and `exit-code-harness.md` owns the harness traps. Do not
restate them here.

## 1. The ambiguous verdict

Measured 2026-10-26 with the package's citation checker on a new skill that has
no `file:line` citations:

```
md files scanned: 2  citations: 0  in range: 0  distinct targets: 0
VERDICT: OK                                                          exit 0
```

Nothing in that output separates "the package has none" from "the scanner
matched nothing", "the root resolved nowhere" or "the walk found no Markdown".
`VERDICT: OK` and exit 0 are not the evidence; the item count is.

## 2. Control shape: same invocation, populated target, counted assertion

Run the same binary, with the same root and the same exclusions, on a sibling
package known to contain items. Accept the control only when all three hold:

- the exit code was captured and equals the expected value — a blank value is a
  harness defect, not a pass;
- the measured count is above zero and is quoted;
- at least one printed anchor is named and matches the section the package
  claims to cite.

Measured example, same binary, same root, 2026-10-26:

```
md files scanned: 2  citations: 8  in range: 8  distinct targets: 1
OK  <package SKILL.md>:209 -> <sibling reference>:226 | ## 10. Sanitized worked example
OK  <package SKILL.md>:84 -> <sibling reference>:249 | ## 11. Running the raster gate
VERDICT: OK                                                          exit 0
```

The anchors are the assertion. Without them, `VERDICT: OK` on the populated
package still cannot distinguish "found 8" from "matched nothing": the verdict
is computed from the problem list, which is empty in both cases.

A control run on a different root, a different binary or with a filter applied
exercises a different resolution path than the run under test, so it proves
nothing about that run. Re-run the real invocation shape.

## 3. A lowered threshold is not a detection control

A matcher's review flag is a reporting threshold: it decides which scores are
labelled, counted and printed. The score itself is unchanged, and the tool says
so in its own summary (`display thresholds, adjustable flags — not measured
limits`).

Measured 2026-10-26 in the origin session, default threshold: `CANDIDATES 0`,
`VERDICT: OK`, exit 0. Same target with the threshold lowered: the top row
(`0.141`) is promoted to `NEAR`, `CANDIDATES 1`, `VERDICT: REVIEW`, exit 1.

That run proves the comparison and the labelling fire. It does not prove the
matcher detects a genuinely overlapping package above the real threshold, and
it is not evidence that the default zero was correct. When a threshold run is
the only control available, say so and keep the default verdict unproven; the
detection control is a target known to overlap, required to reach the review
band on the unmodified default.

## 4. Fixed-string search: must-hit, must-miss, variant

For a search documented into a skill, three probes, each with its captured
code:

```
token=35718     rc=0  lines=2    # must hit
token=35,718    rc=1  lines=0    # formatted variant is a different string
token=1223098   rc=1  lines=0    # must miss
```

The must-hit proves the search and its exclusions can reach a known artifact;
the must-miss proves it is not returning everything; the variant proves the
search is literal, so a comma-formatted figure cannot be evidenced by the plain
token. Record the root and exclusions with the codes.

A nearby substring is not a hit: a plain `11795` found only inside
`0.5666666665117959` is a coordinate fragment, not the claimed pixel count.

## 5. Capture the control's own exit code

Measured in the origin session: the first control pass printed its verdict and
an empty assignment —

```
VERDICT: OK
control_exit=
```

— which is indistinguishable from a control that never ran. The re-run printed
`control_exit=0` with the full citation list. Treat an empty exit-code field as
a harness defect and re-run; the per-branch capture recipe is in
[exit-code-harness.md](exit-code-harness.md).

## 6. What this file does not decide

- It does not choose control targets for a project's own gates; those carry
  their own controls.
- It does not upgrade a control into semantic validation: the citation checker
  still cannot tell whether the printed line supports the claim.
- Figures above are single measured runs, some in the origin session, not
  thresholds to reuse; re-measure before quoting.
