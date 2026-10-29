---
name: scanned-slot-baseline-nudge
description: Re-position one or more registered text slots on a filled scanned form after owner QA, without re-running OCR. Use when a reviewer says a conclusion or advice line sits too high or too low, asks to lower both lines or adjust only one, when a per-slot lift must change and the draft repainted from the original scan, when a stored job's PDF must be replaced while its OCR facts survive, when a cache-backed server must be restarted before the download SHA changes, or when a post-QA end-to-end run must be proved raster-identical to the approved sample. Includes the separate blue-over-printed-ink measurement a generic min(R,G,B) ink-loss gate cannot see.
---

# Scanned slot baseline nudge

## Overview

An owner QA round that says "lower this line" is a measured geometry change, not a font, offset or
threshold guess. The loop is: measure the approved draft, move only the named slot, repaint from the
original scan without OCR, patch the stored job, restart the cache-backed server, re-measure, then run
one real E2E after QA approval. Two proofs stay separate: the requested line moved, and the scan was
preserved.

## Use when

- An owner or QA reviewer approved one draft and now asks one or more text slots to move up or down.
- The request names a line, a relative amount ("a little", "double it") or a comparison ("line 1 is too
  low, line 2 is fine") but gives no coordinates.
- A per-slot lift in a registered slot table must change and the record must be repainted without OCR.
- A stored job's PDF must be replaced while its facts, unresolved fields and provenance survive.
- The download endpoint must be proved to serve the new bytes after a database update.
- A final upload-to-download run must be proved raster-identical to the approved sample.

## Do not use when

- The record has not been filled yet. Start from `scanned-form-local-fill-pipeline`.
- The question is whether a slot is blank, occupied or verified. Use
  `local-scan-fill-preservation-gate`.
- The ask changes the conclusion, a grade, a tick, a signature or an approval. A layout nudge never
  creates clinical content.
- The ask expands a batch. The round loop is per record; batch expansion needs its own gate.
- The signature area or its keep-out geometry is unapproved. Stop and report the blocker.

## Round loop

Do not reorder. Each step is cheaper than the next and can stop the round.

### 0. Pin the reference and the target

- Name the slot(s), the page, and the exact QA-approved file with its SHA-256 and byte count. A verdict
  about "the sample" is meaningless if the sample changed.
- Read the approval record behind that file, not only the owner's message. Record its `approves` scope
  (file, SHA, change) and every `doesNotApprove` entry; the record covers only that scope.
- Preserve the approved file before touching the live output.
- If the owner approved only one slot, only that slot is in scope this round. "The other line is fine"
  is an approval of its current position, not permission to re-measure it into a new value.
- Record the current lift and the baseline actually used by the painter. Comments and constants drift;
  read the code path that draws the line.

### 1. Measure before moving

Rasterise the approved output and the original scan with the same renderer, dpi and page transform.
Define zones in displayed-page points, with the rotation already applied. A zone must contain the full
travel range of the target painted band and the specific printed guide line it belongs to. When two
slots overlap in x, the same rectangle can contain the neighbour's band: identify the target band by
its position against the slot baseline and read that band's `coveredPrintedPixels`, never the
neighbour's. Do not clip the zone to exclude the neighbour; a clipped zone undercounts coverage when
the target line moves lower.

**Path check.** The block is a template with mixed roots; prove both before reading a result.

- From this skill directory, both `rasters/…` inputs are absent and `references/zones.example.json`
  is present. Running the block exits 2 with `SOURCE_PNG_UNREADABLE`; that is a path failure, not a
  measurement.
- From the E2E directory that holds the rasters, `scripts/measure-slot-bands.mjs` is absent. Node
  exits 1 with `Cannot find module`; also not a measurement.
- Run the Reproduce command in `references/chc-stt600-case.md` from this skill directory with `E2E`
  set. Require at least one must-fail and one pass branch: `demo-288-lift3` exits 1 with
  `COVERED_PRINTED_INK`; `demo-288` exits 0 with `NO_COVERED_PRINTED_INK`.
- Pass an absolute `--out` outside this skill directory, such as `$E2E/out/measure.json` or
  `/tmp/stt600-measure.json`. The script creates the parent directory, so a relative
  `out/measure.json` after fixing only `--source` would leave a stray `out/` under the skill root.

```
node scripts/measure-slot-bands.mjs \
  --source rasters/src-288/page-0001.png \
  --output rasters/demo-288/page-0001.png \
  --zones references/zones.example.json \
  --dpi 288 --out out/measure.json
```

Read three things per zone:

- `outputBands`: the painted blue row bands, in points. When the zone also catches a neighbouring line,
  pick the band that belongs to the slot; do not report the neighbour as this slot's band.
- `coveredPrintedPixels`: per band, painted blue pixels whose source pixel is printed ink (source
  `min(R,G,B) < 140`). Use the target band's value; `coveredPrintedPixelsTotal` is zone-wide and can
  include a neighbour.
- `nearestPrintedBand`: the closest source printed band, its relation (`above`, `below`, `overlap`) and
  the signed gap. Prefer this over `deepestPrintedInkPt`. A deeper printed element elsewhere in the
  zone can make the deepest pixel wrong; the nearest band is the local guide.

The blue test is `B - R > 30 && B - G > 15`. A band opens on a run of rows with at least three blue
pixels. Both thresholds are local to the dpi and renderer; record them with the result and do not move
one run's threshold into another form's run.

**Vertical overlap is not coverage.** A band can overlap a dotted guide line vertically and cover zero
dots; the STT600 line-1 correction state does exactly that. Conversely, a line that looks "on" the
guide can cover hundreds of printed dots. Count the pixels.

**The generic ink-loss gate is not a coverage detector.** It uses `ink = min(R,G,B) < 128`; blue paint
is itself ink, so a blue glyph sitting on a printed dot still yields `lostSourceInkPixels: 0`. The
separate `coveredPrintedPixels` metric is the one that sees the collision. For the same reason, do not
cite the ink-loss gate as proof that text did not cover printed furniture.

### 2. Change one per-slot lift

- Edit the slot registry, not a shared constant. The painter draws at `baseline - lift`; keep `x`,
  `maxWidth`, font, size policy and the slot name unchanged.
- Move only the named slots. "Lower both lines" is two per-slot values, not one global offset applied
  to every line.
- When two lines move together, preserve their separation unless the owner asks to change it. Measure
  each line; do not assume the same lift fits both.
- Re-measure the candidate before rebuilding a batch. A lift that lands on a dotted guide may have zero
  covered pixels; a lift that lands on printed text does not.
- Never shrink the font, widen the slot, relabel the region, or lower a threshold to make the line fit.

### 3. Repaint without OCR

- Repaint from the exact original page pair with a minimal paint-only extraction: case id, policy
  flags, output regions. Never re-run OCR for a layout change.
- Mark the run `freshSourceRead:false`, `ocrRerun:false` and `repaintOf:<oldSHA256>`.
- The minimal extraction is not a field draft and not OCR evidence. Keep placeholder fields, policy
  imputations and OCR facts in separate arrays. Never publish the stub as the extraction or the field
  ledger.
- Keep the single-draw ownership contract. A nudge must not change which component paints a region.

### 4. Back up per round

- Before writing new bytes, copy the current output to a round-specific name and verify its SHA-256
  equals the old output. Fail closed on a mismatch.
- Never reuse a backup name across rounds. A fixed name either overwrites the first backup or trips
  the SHA guard on the second run, and the second round is exactly when the history matters.
- Keep every round's file and record old/new SHA-256 and byte counts. The old file is evidence, not
  scratch.

### 5. Patch the stored job summary

- The repaint summary is not a replacement for the upload summary. Start from the original job summary
  and patch only `outputSHA256`, `outputPages`, `drawn`, `ticks`, `labels` and a `repaint` block.
- Keep `facts`, `unresolved`, `imputations`, `ocrCalls` and `elapsedMs`. If the original summary carried
  a null fact, keep it null; a repaint does not create OCR facts.
- `ocrCalls` and `elapsedMs` in a patched summary are the original upload's provenance. The repaint's
  own statement is `repaint.ocrRerun:false`. Never present inherited counts as new engine calls.
- Record the previous output SHA and file in the repaint block, plus the per-slot lift actually used.

### 6. Restart and verify what is served

- Upsert the job row, then restart the server. A memory map in front of SQLite keeps serving the old
  bytes until the process restarts; a database row with the new hash is not proof of the HTTP response.
- Download the job through the API and compare its SHA-256 to the file just measured. Also confirm the
  number of jobs rehydrated from disk.
- If the served SHA differs, stop. Do not update the UI, the manifest or the report to match the stale
  bytes.

### 7. Measure after and report

- Re-run the same measurement with the same dpi, thresholds and zone definitions.
- A round passes the coverage check only when the requested slots moved, the other slots did not,
  `coveredPrintedPixels` is 0, source ink loss is 0, and the signature box is unchanged. The signature
  verdict remains provisional unless its geometry is approved.
- If the owner approves a file that carries a measured contact, record two separate results: the coverage
  verdict stays `COVERED_PRINTED_INK`, and the file is an owner-approved deliverable for the named change.
  It is not a coverage pass, not an accepted overlap and not a redefinition of the gate. Read the record's
  `doesNotApprove` list before describing what the approval covers.
- If a band is missing, do not assume the line is correct. A missing band means the wrong zone, the
  wrong page, a failed repaint or an empty slot; resolve which before reporting.
- Report per slot: old lift, new lift, old band, new band, nearest printed band, gap, covered pixels,
  output SHA/bytes, previous SHA/bytes, OCR rerun false, served SHA.
- If the round fails, keep the files and stop. Do not iterate by loosening a threshold.

### 8. Final E2E after QA approval

- After the owner approves the layout, run the full path: upload, local OCR, fill, store, download.
  This run makes new OCR calls and a new job; it is not the no-OCR repaint.
- Rasterise the downloaded PDF and the approved sample at the same dpi and compare every page. Expect
  zero differing pixels. Do not expect identical bytes: PDF creation dates, modification dates and
  container choices differ even when the rendered pages are identical.
- Re-run the preservation gate on the E2E output. Report source-ink loss and signature status
  separately; a zero raster diff is a layout result, not a signature approval.
- Restart once more and confirm the downloaded SHA is unchanged.
- A nudge after the final E2E invalidates that E2E as evidence for the new bytes. Re-run it, or report
  the E2E as pre-nudge and the later round as repaint-only. Do not carry the old E2E's raster identity
  forward.

## Hard rules

- Never re-run OCR to fix a layout defect.
- One slot, one measured lift. Never apply a global offset to lines the owner did not name.
- Never rebuild a stored job summary from the minimal repaint extraction.
- Never reuse a backup name across QA rounds.
- Never treat `lostSourceInkPixels: 0` as proof that painted text did not cover printed ink.
- Never report a path failure (exit 2, or `Cannot find module`) as a coverage verdict. Prove both
  roots first.
- Never claim byte identity from a zero raster diff; claim raster identity only.
- Never shrink a font, widen a slot, relabel a region or lower a threshold to make a line fit.
- Never move, paint or measure into a signature keep-out while its geometry is unapproved.
- Never claim clinical approval, OCR accuracy, a batch pass or a completed migration from a layout
  round.
- Before citing an owner approval, read its `doesNotApprove` list. Never restate "the owner approved the
  file carrying a measured contact" as "the overlap was accepted", a relaxed or redefined zero-overlap
  gate, a signature approval or a clinical approval.
- Keep every round's output, backup, measurement and old hash.

## Report

Use one record per slot per round. Keep measured facts separate from estimates.

```
{
  "round": 3,
  "slot": "adviceFirst",
  "page": 1,
  "approvedRef": {"file": "out/demo-filled-...pdf", "sha256": "..."},
  "oldLift": -3,
  "newLift": 2,
  "baseline": 633.4,
  "oldBand": {"topPt": 629.75, "bottomPt": 638.5, "coveredPrintedPixels": 455},
  "newBand": {"topPt": 624.75, "bottomPt": 633.5, "coveredPrintedPixels": 0},
  "nearestPrintedBand": {"topPt": 633.5, "bottomPt": 636.0, "relation": "above", "gapPt": 0},
  "untouched": ["preliminary", "confirmed", "adviceSecond"],
  "output": {"file": "...", "sha256": "...", "bytes": 1996331},
  "previous": {"file": "...", "sha256": "...", "bytes": 1996331},
  "ocrRerun": false,
  "servedSHA256": "...",
  "gate": {"lostSourceInkPixels": 0, "signatureChanged": 0,
           "signatureStatus": "PROVISIONAL_OWNER_UNAPPROVED"}
}
```

If the round cites an owner approval, record its file, SHA, `approves` scope and `doesNotApprove` entries
next to `approvedRef`.

State what is unmeasured and why: an unapproved signature box, a page not rastered, a slot left out of
the round, an inherited OCR count, a zone whose printed guide was not isolated.

## Case evidence

CHC STT600, 25 October 2026, two-page simulated record, local Apple Vision rev 3, V2.7 simulation
draft. Three measured rounds moved the two advice lines:

| Round | Request | Lift (line 1 / line 2) | Band line 1 | Band line 2 | Covered printed |
|---|---|---:|---|---|---:|
| original | starting draft, before any nudge | 3 / 3 | 623.75–632.50 | 636.75–645.50 | 0 / 120 |
| earlier | lower line 2 only (artifact-evidenced) | 3 / 0 | 623.75–632.50 | 639.75–648.50 | 0 / 0 |
| 2 | lower both, double the nudge | -3 / -3 | 629.75–638.50 | 642.75–651.50 | **455** / 0 |
| 3 | line 1 too low, lower it only a little | 2 / -3 | 624.75–633.50 | 642.75–651.50 | 0 / 0 |

Round 3 was the last covered-pixel-verified advice state: `coveredPrintedPixels: 0`, only `adviceFirst`
touched, `adviceSecond` at its passed position, no OCR. The generic gate reported
`lostSourceInkPixels: 0` in every round, including the 455-pixel collision. The final E2E from upload to
download made two OCR calls, produced a new job, and was raster-identical to that state on both pages
(0 differing pixels) while its PDF bytes differed.

A later round (recorded 2026-10-25T17:29Z, 26 October local) moved `preliminary`, `confirmed` and
`adviceFirst` 3 pt down and kept `adviceSecond`; the owner then approved it ("QA passed hoàn hảo",
approved SHA `d03eceb7…`). That round is an owner-approved file carrying a measured contact, not a zero:
the batch text-region gate counted 31 / 232 / 411 / 0 painted pixels over printed ink for the four slots,
674 on page 1. The owner approved the layout carrying that contact; the approval record's
`doesNotApprove` list includes "a redefinition of the zero-overlap gate", and the gate still reported the
contact. No fresh upload-to-download E2E followed that round,
and the 10-record batch gate failed 8 of 10, so it is not a batch pass. Details, SHAs and the job/restart
evidence are in `references/chc-stt600-case.md`.

The earliest round is not verbatim in the readable session window (`hasMoreBefore: true`); its applied
state is evidenced by the preserved `lift0` raster and file. Do not quote that round as a message.

## Resources

- `scripts/measure-slot-bands.mjs` — measures painted blue bands, covered printed pixels and the nearest
  printed band. Exit 0 completed, 1 covered printed ink found, 2 usage/input error. `--report-only`
  downgrades the covered finding to exit 0 while keeping the verdict.
- `scripts/png.mjs` — dependency-free 8-bit RGB/RGBA PNG codec used by the measurement.
- `scripts/self-test.mjs` — 12 synthetic checks, including the sparse-dot negative control and the naive
  gate blind spot.
- `references/chc-stt600-case.md` — the measured rounds, the owner-approved file carrying a measured
  contact, SHAs, E2E and restart evidence, and what remains unproven.
- `references/zones.example.json` — the two STT600 advice zones in displayed-page points.

Run the self-test before trusting the measurement in a new environment:

```
node scripts/self-test.mjs
```

## Related skills

- `scanned-form-single-draw-overlay` — owner of the single-draw contract and the baseline measurement
  rules. This skill applies a verified nudge; it does not weaken that contract.
- `local-scan-fill-preservation-gate` — owner of the ink-loss, blankness and comparator thresholds. This
  skill adds the coverage measurement that gate cannot see.
- `scanned-form-local-fill-pipeline` — the upstream fill and first-pass QA path.
- `scanned-form-ocr-fill-pipeline` — OCR facts, page pairing and the field ledger.
- `filled-pdf-unsanctioned-mark-audit` — post-build mark integrity; a nudge must not add or remove a
  mark.
