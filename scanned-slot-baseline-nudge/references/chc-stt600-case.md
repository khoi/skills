# CHC STT600 — measured slot nudges

Simulation record, simulated data. Nothing here is a clinical approval, a signature approval, an
OCR-accuracy result, an original-PDF acceptance or a batch pass.

All paths are relative to the snapshot's `work/local-record-1/e2e/` directory. The measurement script
and the zones file live in this skill.

## Record, slots and method

- Source: `source/record-001.pdf`, SHA-256
  `6900ddb0af5503241ac5c38c02d459b60bea838c5a5052de7c385a7096b817cc`, two pages.
- Engine: local Apple Vision `VNRecognizeTextRequest`, revision 3. Conclusion: CMO V2.7 simulation,
  `Loại I`. Labels: `draft: true`, `signature: null`, `clinicalApproval: "not_approved"`.
- Painter draw position is `baseline - lift`; a positive lift moves the line up, a negative lift down.
- Slots on page 1 used by this case:

| Slot | x | baseline | maxWidth | lift at final state |
|---|---:|---:|---:|---:|
| preliminary | 249.5 | 515.0333 | 300 | 0 |
| confirmed | 263.5 | 528.3 | 286 | 0 |
| adviceFirst | 343 | 633.4 | 202 | -1 |
| adviceSecond | 76 | 646.5 | 465 | -3 |

The early rounds started from `3 / 3 / 3 / 3`; `preliminary` and `confirmed` were still at 3 until the
last round. Always read the live registry and the code path that draws the line; do not copy a lift from
this table into another form or another round.

Rasters: 288 dpi, `/Rotate 270` already applied, 4 px/pt, displayed-page points with top-left origin.
Blue test `B - R > 30 && B - G > 15`; a band opens on a row with at least 3 blue pixels; covered printed
ink is output blue where the source pixel has `min(R,G,B) < 140`.

Source printed bands are identical in every state (the scan does not change):

| Zone | Printed band | Printed pixels |
|---|---|---:|
| adviceFirst | 633.5–636.0 | 1352 |
| adviceSecond | 636.0–639.75 | 1855 |
| adviceSecond, further down | 657.75–660.0 | 335 |

`deepestPrintedInkPt` in `adviceSecond` is 660, not the guide at 639.75. The nearest printed band is the
gap authority: a deeper printed element elsewhere in the zone makes the deepest pixel wrong.

## Measured rounds

`Covered` is the target band's `coveredPrintedPixels`. The naive gate column is
`naiveGateLostSourceInkPixels`, the generic `min(R,G,B) < 128` ink-loss check.

| State | Slots moved | Lifts (p / c / a1 / a2) | Line 1 band | Line 2 band | Covered printed | Naive gate | Output SHA-256 | Bytes |
|---|---|---|---|---|---:|---:|---|---:|
| starting draft, `demo-filled-stt600-lift3.pdf` | none | 3 / 3 / 3 / 3 | 623.75–632.50 | 636.75–645.50 | L1 0 / L2 **120** | 0 / 0 | `603416c8…` | 1,996,521 |
| earlier, `demo-filled-stt600-lift0.pdf` | a2 only | 3 / 3 / 3 / 0 | 623.75–632.50 | 639.75–648.50 | L1 0 / L2 0 | 0 / 0 | `18302266…` | 1,996,331 |
| double drop, `demo-filled-stt600-both6.pdf` | a1, a2 | 3 / 3 / -3 / -3 | 629.75–638.50 | 642.75–651.50 | L1 **455** / L2 0 | 0 / 0 | `389878b1…` | 1,996,331 |
| line-1 correction, `demo-filled-stt600-qa-approved.pdf` | a1 only | 3 / 3 / 2 / -3 | 624.75–633.50 | 642.75–651.50 | L1 0 / L2 0 | 0 / 0 | `b7861d5d…` | 1,996,331 |
| upload-to-download E2E, `e2e-final-stt600.pdf` | none (new job) | 3 / 3 / 2 / -3 | 624.75–633.50 | 642.75–651.50 | L1 0 / L2 0 | 0 / 0 | `964ac002…` | 1,996,521 |
| three-line drop, current `demo-filled-stt600.pdf` | p, c, a1 | 0 / 0 / -1 / -3 | not band-measured | not band-measured | 31 / 232 / 411 / 0 (p / c / a1 / a2) | 0 | `d03eceb7…` | 1,996,332 |

Exact SHAs:

- starting `603416c8855b9032a6a81ef3d335fecc8c449e4d95659f55f60dae3ee9642671`
- earlier `18302266722a5b0fd4586c2496dbc82589a8c5a17a2f90fbdcbe0ef4227130b8`
- double drop `389878b189e50ff89b220e612b14a77974cb71ae4036dcb6e4b26254d9f1f5a2`
- line-1 correction `b7861d5deb3516903c219d02d9321718d9389352b61a68e73d8dba4ad7dd64fb`
- E2E `964ac0020ea4468633b914747789fbadb7da1f8f36063540f74e3b9fd68cf14f`
- three-line drop `d03eceb705e84ba2f6d29578ccdc05395f920cdf11247fb7e03be81a705ec583`

### What each round showed

1. **Starting draft.** `adviceSecond` overlapped its guide by 3 pt (636.75–639.75 inside the line band
   636.75–645.50) and covered 120 printed pixels. `adviceFirst` sat 1 pt above its guide with 0 covered.
2. **Earlier round, line 2 only.** Lift 3 → 0 moved the line to 639.75–648.50, 0 covered, below the guide
   by 0. This is artifact-evidenced: the applied state is preserved in `rasters/demo-288-lift0` and the
   report `out/advice-shift-3pt.json`, but the owner message is outside the readable session window
   (`hasMoreBefore: true`). Do not quote that message.
3. **Double drop.** Both lines −3. `adviceFirst` moved to 629.75–638.50, overlapped the guide, and
   covered **455** printed pixels. `adviceSecond` at 642.75–651.50 was clean with a 3 pt gap.
4. **Line-1 correction.** Only `adviceFirst` moved, from −3 to 2 (5 pt up). Band 624.75–633.50, 0
   covered, 0 gap above the guide. `adviceSecond` untouched at 642.75–651.50, 3 pt below its guide.
   This was the last advice state verified by the covered-pixel metric.
5. **Final E2E.** A fresh upload ran OCR (2 calls, 2852 ms), fill and store, creating job
   `ab2ea775-1e15-494c-bd54-b4958f1898ce`. Its output was raster-identical to the line-1 correction
   state, not byte-identical (new PDF dates).
6. **Three-line drop.** `preliminary`, `confirmed` and `adviceFirst` moved 3 pt down; `adviceSecond`
   unchanged. All three now sit on the printed writing guide. The batch text-region gate measured
   31 / 232 / 411 / 0 painted pixels over printed ink for the four slots (674 on page 1). The owner
   approved the layout carrying that contact ("QA passed hoàn hảo", SHA `d03eceb7…`). This is the
   approved-file-with-contact case: the zero-overlap gate still reports the contact, and the approval
   record explicitly does not redefine that gate.

### Neighbour bands inside a zone

The two advice slots overlap in x, so a full-travel zone can contain the neighbour's band. The script
reports every band; attribute by position against the slot baseline:

- `adviceFirst` zone in the starting and earlier states also contains the top of `adviceSecond`
  (636.75–641, 1928 blue px; and 639.75–641, 240 blue px). The target band is the upper one.
- `adviceSecond` zone in the double-drop state also contains the bottom of `adviceFirst`
  (636–638.50, 1246 blue px). The target band is the lower one at 642.75–651.50.
- In the line-1 correction and E2E states each zone contains exactly one band.

Do not clip the zone to exclude the neighbour. A clipped zone undercounts coverage as soon as the target
moves lower: clipping `adviceFirst` at y635 reduced the 455 covered pixels to 375.

## Job patch and served bytes

Repaints reused job `5b1b9459-c031-4a12-ac98-acf8b465f028` (created
`2026-10-25T15:45:51.180Z`; stored scan 1,248,939 bytes). Each patch kept the upload's facts, 20
unresolved fields, 32 imputations, `ocrCalls: 2` and the stored `elapsedMs`, and replaced only
`outputSHA256`, `outputPages`, `drawn`, `ticks`, `labels` plus a `repaint` block.

The stored repaint block after the three-line drop (`updatedAt 2026-10-25T17:29:49.196Z`):

```json
{
  "reason": "owner: preliminary, confirmed and adviceFirst sit too high; move those three lines down 3 pt, keep adviceSecond",
  "ocrRerun": false,
  "previousOutputSHA256": "b7861d5deb3516903c219d02d9321718d9389352b61a68e73d8dba4ad7dd64fb",
  "previousOutputFile": "out/demo-filled-stt600-qa-approved.pdf",
  "slotLift": {"preliminary": 0, "confirmed": 0, "adviceFirst": -1, "adviceSecond": -3}
}
```

The line-1 correction's report records the analogous block: previous SHA `389878b1…`, previous file
`out/demo-filled-stt600-both6.pdf`, `ocrRerun: false`, lifts `3 / 3 / 2 / -3`.

`server/app.mjs` builds `jobs = new Map(db.all()… )` once at boot. The code path therefore keeps serving
the old bytes after a database upsert until the process restarts; this is code-derived, not a measured
stale response. The final E2E restarted the server, rehydrated 2 jobs, and the downloaded job SHA matched
`964ac002…`.

Backups were per round; the repaint scripts guard the backup SHA, and each preserved file matches the
previous output SHA recorded in its report:

| Round | Backup file | Old output SHA |
|---|---|---|
| earlier | `out/demo-filled-stt600-lift3.pdf` | `603416c8…` |
| double drop | `out/demo-filled-stt600-lift0.pdf` | `18302266…` |
| line-1 correction | `out/demo-filled-stt600-both6.pdf` | `389878b1…` |
| three-line drop | `out/demo-filled-stt600-qa-approved.pdf` | `b7861d5d…` |

A fixed backup name would either overwrite a round or trip the SHA guard on the next run.

## Final E2E and preservation

`out/e2e-final-compare.json` and `out/e2e-final-run.json`:

- Job `ab2ea775-1e15-494c-bd54-b4958f1898ce`; source SHA `6900ddb0…`; output
  `out/e2e-final-stt600.pdf` SHA `964ac002…`, 1,996,521 bytes, 2 pages.
- Five fact fields read, 20 unresolved fields retained, 32 simulation imputations, `Loại I`; labels
  `draft: true`, `signature: null`, `clinicalApproval: "not_approved"`.
- Raster comparison `rasters/final-288` vs `rasters/demo-288`: page 1 and page 2 each 0 differing
  pixels. The two raster files have the same SHA-256
  `9f371e31cd4be3f711d5889046cb7440d475eebb1f1024172db42bd0e1bfd91a`. PDF bytes differ
  (1,996,521 vs 1,996,331): raster identity, not byte identity.
- Preservation (`out/e2e-final-preservation.json`): page 1 changed 42,342 px, page 2 changed 7,659 px,
  `lostSourceInkPixels: 0` on both. Signature inside: `changedInside: 0`, `lostSourceInkInside: 0`,
  status `PROVISIONAL_OWNER_UNAPPROVED`.
- Restart: 2 jobs restored; the job download SHA after restart remained `964ac002…`.

The three-line drop has no fresh upload-to-download E2E. Its batch verification
(`out/batch-10-final-down3/verification.json`) rendered the batch copy `STT600_DRAFT.pdf` (SHA
`fbfc8d32…`, 1,993,417 bytes) and compared it with the current demo: 0 differing pixels on both pages,
byte-identical false. The 10-record gate reported 10 records, 0 errors, 2 passed, 8 failed,
`hardPass: false`; the 50-record run was not started. The same approval record explicitly does not
approve the STT617 red-stamp collision or a redefinition of the zero-overlap gate.

## Reproduce

From this skill directory, with `E2E` set to the snapshot's `work/local-record-1/e2e`:

```
node scripts/measure-slot-bands.mjs --source "$E2E/rasters/src-288/page-0001.png" \
  --output "$E2E/rasters/demo-288-lift3/page-0001.png" \
  --zones references/zones.example.json --out /tmp/stt600-original.json
```

Repeat with `demo-288-lift0` (earlier), `demo-288-both6` (double drop), `demo-288` (line-1 correction)
and `final-288` (E2E). Expected verdicts: `COVERED_PRINTED_INK` / exit 1 for the starting draft and the
double drop; `NO_COVERED_PRINTED_INK` / exit 0 for the rest. The reproduced target-band covered counts
are 0/120, 0/0, 455/0, 0/0 and 0/0.

The `demo-288` raster is the line-1 correction state (`b7861d5d…`), not the current
`out/demo-filled-stt600.pdf` (`d03eceb7…`). The current file's own raster was not preserved in this
evidence set; its coverage comes from the batch verification. Re-render before measuring it.

## What this case does not prove

- No clinical approval and no signature approval. The signature keep-out remains
  `PROVISIONAL_OWNER_UNAPPROVED`; zero changed pixels inside it is preservation evidence only.
- No OCR-accuracy claim. Only five fact fields were read; 20 fields stayed unresolved or ambiguous. The
  V2.7 conclusion texts and imputations are simulation output, never OCR facts.
- No batch pass: the 10-record gate failed 8 of 10 and the 50-record run was not started.
- No zero-overlap claim for the three-line drop: 674 painted pixels over printed ink on page 1 were
  measured; the owner approved the layout containing that contact, and the approval record explicitly
  does not redefine the zero-overlap gate.
- The naive `min(R,G,B) < 128` gate reported `lostSourceInkPixels: 0` in every state, including the
  120-, 455- and 674-pixel coverage states. It cannot detect blue-over-printed collisions.
- The earliest round's owner message is outside the readable session window; only its applied state is
  evidenced by the preserved raster and report.
