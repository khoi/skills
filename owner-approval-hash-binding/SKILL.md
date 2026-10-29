---
name: owner-approval-hash-binding
description: Bind human owner QA approval to a generated artifact as a separate hash-anchored record instead of flipping a status field. Use when an owner says QA passed/approved/đạt/duyệt, when a manifest or job status could be set to approved, when a draft PDF/report/export receives sign-off, when verifying an approval record after a visual or geometry change, or when a delivery store/UI serves a copy that may not be byte-identical to the approved file. Covers exact file/bytes/SHA-256, approved scope plus explicit non-approvals, superseded approved samples, verifier-side hash recomputation with APPROVAL_RECORD_STALE, the byte-vs-raster delivery evidence split, how to run the raster gate with the recorded renderer and a positive control, and keeping unchanged hard gates hard.
---

# Owner Approval Hash Binding

## Overview

A human "QA passed" is evidence of a decision, not a field value. Turn it into a
separate record bound to the exact artifact bytes, and let a verifier derive the
approved status only while the current artifact still matches. This prevents
self-approval, stale approvals, and an "approved" label travelling to copies or
later changes the owner never saw.

## Trigger shape

- The owner says "QA passed", "approved", "đạt", "duyệt", "looks good" or
  "hoàn hảo" after reviewing a generated artifact.
- A manifest, job, or UI status is `CANDIDATE_PENDING_OWNER_QA` and someone is
  about to change it to approved.
- A generated PDF, report, image, or export receives human sign-off.
- A position or geometry change is approved while hard gates still fail.
- A delivery store or UI serves a blob whose hash differs from the approved file.
- A file changed after approval, or an older approved sample is being reused as
  evidence for a newer artifact.

## Core model

Keep three axes separate:

| Axis | Evidence | Produced by |
|---|---|---|
| Artifact identity | exact bytes, byte count, SHA-256 | the build |
| Human decision | verbatim message, approved scope, explicit non-approvals, supersession | the owner, written into the record |
| Delivery evidence | transport hash, served-blob hash, raster comparison | the verifier |

A status field may mirror the human decision. It may never mint it.

## Workflow

1. **Freeze the candidate.** Read the file into one buffer, hash that buffer,
   and take the length from the same buffer. Do not hash a path and stat it
   later. Record the relative path, byte count, and SHA-256.
2. **Write the approval record.** Include `kind`, `recordedAt`, verbatim
   `ownerMessage`, `approves{change,file,sha256,bytes}`,
   `supersedes{file,sha256,status,note}`, `doesNotApprove[]`, and
   `invariants`. See [record shape and field rules](references/approval-record-and-delivery.md)
   (references/approval-record-and-delivery.md:1).
3. **State the narrow scope.** `approves.change` names the slots, lines, or
   pages and the amount of movement. Put every applicable exclusion in
   `doesNotApprove`: simulation or imputation presented as fact, OCR accuracy,
   provisional geometry, unrelated defects, gate relaxations, and clinical
   approval when the sign-off is data review only. See
   [scope versus non-approval](references/approval-record-and-delivery.md)
   (references/approval-record-and-delivery.md:63).
4. **Mirror, do not mint.** The manifest names the record path and repeats the
   approved hash, message, covers/excludes, current candidate hash, and previous
   approved hash. Only the verifier derives `OWNER_QA_APPROVED`.
5. **Verify by recomputation.** Missing record gives
   `APPROVAL_RECORD_MISSING` (pending); malformed gives
   `APPROVAL_RECORD_INVALID`; hash or byte-count mismatch gives
   `APPROVAL_RECORD_STALE` and fails; a match gives `OWNER_QA_APPROVED`. See
   [verifier shape](references/approval-record-and-delivery.md)
   (references/approval-record-and-delivery.md:159).
6. **Re-run layout verification without OCR** when only layout changed, and
   label it `noOCR: true`. Skipping OCR is not zero work: the verifier may
   still re-render every page.
7. **Prove delivery with three separate checks.** Transport hash versus
   downloaded bytes; served-blob hash versus approved hash (byte identity or a
   recorded `BYTE_DIFF`); raster identity at a fixed renderer, DPI, and color
   space. See [delivery evidence matrix](references/approval-record-and-delivery.md)
   (references/approval-record-and-delivery.md:102).
   Never call raster equality byte identity.
8. **Run the raster gate with the recorded renderer.** Render page by page with
   the renderer, DPI, color space and rotation handling named in the record.
   Check page count and per-page size, declare the threshold, and join pages by
   index. Run an identity control (a file against itself gives 0) and a positive
   control (a pair known to differ must be non-zero) before trusting a zero; a
   failing positive control is `RASTER_CONTROL_FAILED`, not a pass. If the
   recorded renderer is absent, report the gate as retained evidence only — a
   substitute renderer is not a re-check. See
   [running the raster gate](references/approval-record-and-delivery.md)
   (references/approval-record-and-delivery.md:249).
9. **Keep hard gates hard.** A record may say `OWNER_QA_APPROVED` while the
   summary says `hardPass: false`. Report the owner-approved scope and the
   unchanged gates separately; do not relax a gate to make the record pass. See
   [hard gates](references/approval-record-and-delivery.md)
   (references/approval-record-and-delivery.md:185).

## Approval record: minimal shape

```json
{
  "kind": "<project>_owner_qa_approval",
  "recordedAt": "<ISO-8601 with zone>",
  "ownerMessage": "<verbatim>",
  "approves": {
    "change": "<smallest visible change the owner saw>",
    "file": "<candidate path>",
    "sha256": "<64 hex>",
    "bytes": 0
  },
  "supersedes": {
    "file": "<prior approved path>",
    "sha256": "<64 hex>",
    "status": "PREVIOUS_OWNER_QA_APPROVED_HISTORICAL",
    "note": "not the current deliverable"
  },
  "doesNotApprove": ["<each applicable exclusion>"],
  "invariants": {"ocrRerun": false, "clinicalApproval": "not_approved"}
}
```

`ownerMessage` is never translated or paraphrased in place. A translation may
live in a separate field.

## Failure codes

| Code | Meaning | Action |
|---|---|---|
| `APPROVAL_RECORD_MISSING` | no record | pending; create one; never approve |
| `APPROVAL_RECORD_INVALID` | missing or malformed fields | fail closed |
| `ARTIFACT_MISSING` | candidate file cannot be read | fail closed |
| `APPROVAL_RECORD_STALE` | hash or byte count differs | request new owner QA or revert |
| `APPROVAL_SCOPE_MISMATCH` | diff extends beyond `approves.change` | request a new approval |
| `APPROVAL_SCOPE_OVERREACH` | a claim covers a `doesNotApprove` item | retract the claim |
| `DELIVERY_HASH_MISMATCH` | download differs from the advertised hash | fail the transport |
| `BYTE_DIFF` | served blob differs from approved bytes | informational unless exact bytes are required |
| `CANDIDATE_RASTER_DIFF` | rendered pages differ | fail visual delivery |
| `RASTER_RENDERER_MISMATCH` | renderer, DPI, color space or rotation handling differs from the record | re-render with the recorded tool; otherwise report retained evidence only |
| `RASTER_PAGE_COUNT_MISMATCH` | rendered page counts differ | fail; the copies are not the same deliverable |
| `RASTER_PAGE_SIZE_MISMATCH` | a page renders at a different size | fail closed; check media box, crop box and rotation |
| `RASTER_CONTROL_FAILED` | the known-different control reported zero | discard the measurement; fix the harness |
| `GATE_RELAXED_WITHOUT_APPROVAL` | a gate was made to pass without a recorded exception | restore the gate |

## Re-approval rules

- Any byte change invalidates the recorded hash; recompute before reuse.
- Pixels changed: the approval is stale. Request new owner QA and supersede the
  old record.
- Bytes changed with zero pixel difference (metadata-only): decide explicitly.
  Either re-approve, or keep the old approval as the visual reference and add a
  delivery block naming both hashes and the zero-pixel result. Never rewrite
  `approves.sha256` without owner sign-off.
- Pixels changed outside `approves.change`: emit `APPROVAL_SCOPE_MISMATCH`.
- A later claim covers a `doesNotApprove` item: emit
  `APPROVAL_SCOPE_OVERREACH`.
- Raster equivalence is scoped to the recorded renderer, DPI, color space,
  rotation handling and page set. A substitute renderer's zero is not evidence
  that the pixels match.
- The full decision tree is in
  [re-approval decision tree](references/approval-record-and-delivery.md)
  (references/approval-record-and-delivery.md:138).

## Reporting format

Report the two verdicts separately:

```
ownerApprovedScope: <change + record path + approved hash>
delivery: {transport: PASS|FAIL, bytes: BYTE_IDENTICAL|BYTE_DIFF, raster: <dpi + differing pixels>}
hardGates: {status: UNCHANGED, verdict: PASS|FAIL, blockedBy: [...]}
```

A green owner approval next to a red hard gate is a valid, informative state.
Collapsing them into one boolean hides which decision is still missing.

## Bundled verifier

```sh
node ~/.qoder/skills/owner-approval-hash-binding/scripts/check_owner_approval.mjs \
  --record <approval.json> --artifact <candidate-file>
```

Exit `0` APPROVED, `2` STALE (with `code=APPROVAL_RECORD_STALE`), `3`
INPUT_ERROR (`APPROVAL_RECORD_MISSING`, `APPROVAL_RECORD_INVALID`,
`ARTIFACT_MISSING`, or `USAGE`). Add `--json` for machine output.
The command is read-only and writes nothing. It checks only the hash and byte
count; raster comparison and hard gates stay in the project's own verifier.

## Boundaries

- `unforgeable-provenance-authority-verification` decides who may mint
  provenance and rejects a self-hashed claim. This skill binds a human decision
  to artifact bytes; it does not design an authority module.
- `skill-artifact-commit-provenance` proves committed bytes equal validated
  bytes. This skill does not commit or stage.
- `frozen-snapshot-immutability-rehash` proves a frozen snapshot is unchanged.
  This skill records a new human decision about a changed artifact.
- `local-scan-fill-preservation-gate` and
  `filled-pdf-unsanctioned-mark-audit` measure ink and pixel gates. This skill
  consumes those verdicts and keeps them unchanged.
- `policy-fallback-value-gate` and `filled-draft-fact-imputation-discipline`
  classify value provenance. This skill records what the owner did not approve.
- `scanned-slot-baseline-nudge` performs a geometry move. This skill records
  approval after the move.
- `rotated-pdf-raster-overlay` renders rotated pages and draws overlays. This
  skill only compares already-rendered pages under a recorded renderer.

## Origin note

The rules come from a local fill run where the owner said "QA passed hoàn hảo"
after three lines moved down 3 pt. The approval record bound one file hash; the
batch and served copies were byte-different but raster-identical at 288 dpi;
the hard gates stayed red, and a 299 px stamp collision on another record was
explicitly excluded from the approval. See
[sanitized worked example](references/approval-record-and-delivery.md)
(references/approval-record-and-delivery.md:226).
The hashes there identify one historical run only, not constants to reuse.
The 288 dpi count belongs to the renderer that produced it, which is why step 8
pins the renderer and demands a positive control.

## Resources

- [references/approval-record-and-delivery.md](references/approval-record-and-delivery.md)
  — record schema, scope split, supersession, delivery matrix, re-approval tree,
  raster-gate procedure, failure codes, and checklist.
- [scripts/check_owner_approval.mjs](scripts/check_owner_approval.mjs)
  — read-only hash and byte-count gate.
