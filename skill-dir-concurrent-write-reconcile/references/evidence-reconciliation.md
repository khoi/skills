# Evidence reconciliation

A concurrent session's text is a claim. Before you keep it, move it into one of three buckets:
**verified at the artefact**, **contradicted at the artefact**, or **unverified**. Never leave a
number in a fourth bucket called "it sounded specific".

## 1. Locate, open, quote

For each claim:

1. Resolve the cited path against the workspace. Existence proves only existence.
2. Open the file and read the field the sentence depends on.
3. Quote the field and value in your report: `verified <path> → <field> = <value>`.
4. If the path or field is absent, write `unverified: <claim> — <reason>` and keep the sentence
   visibly provisional in the merged text.

A cited path that exists with different contents is a contradiction, not a verification. File
existence, mtime and hash are three different facts; check the one you actually need.

## 2. Recipes by claim type

| Claim shape | What to open | What to compare |
|---|---|---|
| "N rows", "N dpi", "N verified" | the JSON the audit wrote | exact keys and integer values, not a rounded summary |
| "verdict FAIL", "inkLost N" | the per-page preservation JSON | page index → `verdict`, `inkLost`, `changed`; confirm the page, not the run |
| "the tool reads 4 empty / 19 occupied" | the tool's own report | re-derive from the same artifact; identify the tool's state model |
| "same 6 px as the other finding" | both source records | coordinates/bounds of each; equal counts from different causes are not equal findings |
| "threshold is 20" | the command that produced it | the dpi it was measured at; a threshold does not transfer across dpi |
| "it was lost because …" — a cause attached to a matching number | the tool that produced the number, and its retained inputs | re-run it; a number that does not reproduce keeps its recorded value and loses its cause |
| "X owns / does not own this topic" — a boundary clause | the sibling's `Boundaries` section, re-read at landing | that it still leaves the topic to you and does not claim it; cite a section title, not a line number |

Threshold provenance matters because pixel counts scale with the raster. `k = dpi / 72`, so a 7 pt
box is 14 px at 144 dpi and 28 px at 288 dpi; a bleed allowance measured as 20 interior pixels at
144 dpi is a different physical clearance at 288 dpi. Re-derive, do not carry the number across.

## 3. Measured examples

These are measurements from real reconciliations on 2026-10-25 (the source session) and 2026-10-26
(an adjacent-package landing); use them as shapes, not as constants.

- `grade-geometry-v6.json` → `{dpi: 288, rowsTotal: 15, rowsWithAllFiveSlots: 10,
  rowsWithVerifiedOutlines: 0, rowsWithSingleMeasuredTick: 0}`. The concurrent session's prose
  matched the file on every figure, so its wording was kept.
- `record-001-filled-v2.preservation.json` → page 1 `verdict: FAIL_EXISTING_MARKS_LOST`,
  `inkLost: 6`, `changed: 14347`, `outside: 0`; page 2 `PASS`, `inkLost: 0`. The run verdict is
  `FAIL` even though only one page failed — report per page and then the run.

  The `6` is recorded, not explained. Re-running the comparator over every retained raster pair
  under `work/local-record-1/e2e/rasters` returns `inkLost 0` under both the shipped rule and an
  alpha-aware rule, and no pair returns `6`. The comparator also tests alpha at `i+3`
  unconditionally (`ui/overlay/rendered-pixel-comparison.mjs`), which on the 3-channel PNGs actually
  used is the next pixel's red channel. Keep the value and label the cause `unverified`; do not
  repeat "printed leader dots" as a measurement until the producing pair and decoder are named.
- Page-1 region counts: two-state tool `4 empty / 19 occupied`; three-state gate `4 empty /
  6 occupied / 13 indeterminate`. Reconciled as two labelled columns, not as a correction of
  either. The 13 indeterminate boxes are unpaintable under both readings; only the three-state
  one prevents "these are already ticked".
- Two different "6 px" findings existed in the same package: 60 neutral specks lost when a status
  label was painted, and a recorded `inkLost: 6` attributed — still unconfirmed — to conclusion text
  over printed leader dots. Same integer, different origin, different coordinates. Write the cause,
  not the number alone, and mark the cause when it is only an attribution.
- 2026-10-26, adjacent-package landing: `git-push-destination-preflight/SKILL.md` read 232, 274 and
  337 lines inside one proposal turn, then 499 and 510 lines at the two landing checks, with its
  `## Boundaries` still naming the concurrent-write skill. The package that landed beside it cites it
  by skill name and section title only. `check_citations.mjs` on that package printed `citations: 0`
  with `VERDICT: OK` (exit 0) — a pass over zero citations, so it says nothing about whether the
  boundary sentence is still true. The proof was re-reading the sibling's `## Boundaries`
  immediately before the landing copy and again after it moved.

## 4. Reporting lines

```
verified   <path> → <field> = <value>
verified   <path> → does not contain <field>; claim dropped
unverified <claim> — <reason: path absent | field absent | artifact from another run>
conflict   <metric>: <tool A / state model> = <values>; <tool B / state model> = <values>
boundary   <sibling-skill> @ <sha256:12> <lines> lines → "<section title>" still <excludes|claims> <topic>
vacuous    <checker> citations: 0 → VERDICT: OK proves nothing about <what>
```

## 5. Do not

- Average two totals, or switch one tool to the other's state model to make them agree.
- Treat a missing artifact as agreement.
- Treat equal numbers as the same finding without matching coordinates and cause.
- Promote a claim to "measured" because another session wrote it confidently.
- Promote a cause to measured because its number matched the artefact; the number and the reason are
  two separate claims.
- Delete the concurrent session's sentence when it is right; keep their wording and cite the field.
- Cite a moving sibling by line number, or read a zero-citation `VERDICT: OK` as coverage of a
  name-and-title reference.
- Append to a file whose mtime moved during the same drafting window; land your own package instead.
