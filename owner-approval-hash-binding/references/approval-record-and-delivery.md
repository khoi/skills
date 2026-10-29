# Owner approval record and delivery evidence

## 1. Record shape

```json
{
  "kind": "<project>_owner_qa_approval",
  "recordedAt": "2026-10-25T17:36:55Z",
  "ownerMessage": "QA passed hoàn hảo",
  "approves": {
    "change": "preliminary, confirmed and adviceFirst moved 3 pt down; adviceSecond unchanged",
    "file": "out/demo-filled-stt600.pdf",
    "sha256": "d03eceb705e84ba2f6d29578ccdc05395f920cdf11247fb7e03be81a705ec583",
    "bytes": 1996332
  },
  "supersedes": {
    "file": "out/demo-filled-stt600-qa-approved.pdf",
    "sha256": "b7861d5deb3516903c219d02d9321718d9389352b61a68e73d8dba4ad7dd64fb",
    "status": "PRE_NUDGE_OWNER_QA_APPROVED_HISTORICAL",
    "note": "kept byte-for-byte as the prior approved reference; not the current deliverable"
  },
  "doesNotApprove": [
    "V2.7 simulation texts or imputations as clinical approval or as OCR facts",
    "OCR accuracy of the five Vision fact fields",
    "the PROVISIONAL signature keep-out geometry",
    "the STT617 red-stamp collision (299 painted pixels over the stamp) or any move/skip of the blood pointer",
    "a redefinition of the zero-overlap gate for the intentional dotted writing-guide contact"
  ],
  "invariants": {
    "ocrRerun": false,
    "clinicalApproval": "not_approved"
  }
}
```

This example is sanitized from one local fill run. The hashes are historical
identifiers, not constants to reuse.

## 2. Field rules

- `kind` names the record type and the project. A generic `approval.json` is not
  enough to prove what was approved.
- `recordedAt` is an ISO-8601 timestamp with a zone. A date without a time
  cannot order two approvals of the same file.
- `ownerMessage` is verbatim, in the owner's language. Never replace it with a
  translation or a summary. Put any translation in a separate field.
- `approves.change` is the smallest change the owner actually saw. Name the
  slots, lines, or pages and the amount of movement. "Approved the PDF" is too
  broad when only one line moved.
- `approves.file` is the exact candidate the owner reviewed. `sha256` and
  `bytes` must come from one read of that file, not from a list command or a
  previous build.
- `supersedes` names the prior approved artifact and its hash, and marks it
  historical. Do not delete the prior file; keep it as the reference for the
  earlier decision.
- `doesNotApprove` is not boilerplate. Include every axis present in the run:
  simulation or imputed values presented as facts, OCR accuracy, provisional
  geometry, unrelated known defects, gate relaxations, and clinical approval
  when the sign-off is data-review only.
- `invariants` records what was not rerun or not granted, for example
  `ocrRerun: false` and `clinicalApproval: "not_approved"`.

## 3. Approved scope versus non-approval

A human "QA passed" answers a narrow question: does this visual result look
right? It does not answer whether:

- a simulated or imputed value is a fact;
- an OCR field is accurate;
- a provisional signature box is the right geometry;
- an unrelated defect elsewhere on the page is fixed;
- a hard gate may be relaxed to make the record pass.

Put those answers in `doesNotApprove` at the moment of approval. Later reports
must quote that list rather than infer a broader approval from the word
"passed".

If the owner approves a position that causes a gate failure, keep the gate
failure. Mark the specific contact as an owner decision pending, and record the
owner's accept/reject decision separately. Never turn the gate green by
editing its threshold.

## 4. Supersession and version chains

A chain can contain several approved hashes:

| Role | Example hash | Meaning |
|---|---|---|
| Earlier QA | `603416c8…` | first approved baseline |
| Position fix | `964ac002…` | advice position changed; re-approved |
| Pre-nudge reference | `b7861d5d…` | approved before the last movement |
| Current approval | `d03eceb7…` | current deliverable after the last movement |

Rules:

- The current record names the immediately prior approved file and hash.
- A superseded record says it is historical and not the current deliverable.
- An approval of an earlier hash is never evidence for a later change, even
  when the later change looks small.
- A rebuilt copy with a new hash is a new artifact, not an inherited approval.

## 5. Delivery evidence matrix

Three questions, three measurements:

| Question | Measurement | Pass | Failure code |
|---|---|---|---|
| Did the client receive the advertised bytes? | hash downloaded bytes; compare with the response header or checksum | equal | `DELIVERY_HASH_MISMATCH` |
| Is the served blob the approved artifact byte-for-byte? | hash served bytes; compare with `approves.sha256` | equal, or an explicitly recorded byte difference | `BYTE_DIFF` (informational unless exact bytes are required) |
| Is the served artifact visually the approved artifact? | render both with the same renderer, DPI, and color space; compare page sizes and per-pixel channels | zero differing pixels, or a declared tolerance | `CANDIDATE_RASTER_DIFF` |

`BYTE_DIFF` is not automatically a failure. It is a failure when the approval
record declares `delivery.expectedByteIdentity: true`, or when the domain
requires exact bytes: a signed container, a regulated submission, or a
hash-addressed store. Otherwise record the known reason (metadata dates,
compression, a re-save) and rely on the raster gate.

Use the adjective that matches the measurement:

- "byte-identical" only when the SHA-256 and byte count match;
- "raster-identical at 288 dpi" when rendered pages have zero differing pixels;
- "byte-different, raster-identical at 288 dpi" when both are true.

Never write "byte-identical" because a raster comparison returned zero.

Optional delivery block:

```json
"delivery": {
  "expectedByteIdentity": false,
  "reason": "the PDF writer rewrites metadata dates on every save",
  "rasterGate": {"renderer": "the project renderer", "dpi": 288, "requiredDifferingPixels": 0}
}
```

When `expectedByteIdentity` is true, the byte comparison is a gate, not a note.

## 6. Re-approval decision tree

After any write to the artifact:

1. **Candidate bytes unchanged?** Recompute the hash. If it still matches the
   record, the approval stands. A cached hash is not evidence.
2. **Bytes changed, pixels changed?** The approval is stale. Request new owner
   QA, write a new record, and mark the old one superseded.
3. **Bytes changed, zero pixel difference (metadata-only)?** The approval hash
   is stale. Decide explicitly:
   - if the record binds exact bytes, re-approve or re-issue;
   - if the record declares raster equivalence as the delivery gate, keep the
     old approval as the visual reference and add a delivery block naming both
     hashes and the zero-pixel result. Do not rewrite `approves.sha256` without
     owner sign-off.
4. **Changed pixels outside the approved scope?** Emit
   `APPROVAL_SCOPE_MISMATCH`. Request a new approval or revert the change.
5. **Only the copy changed, not the approved artifact?** Keep the approval
   record untouched; report the copy's own hash and its raster relationship to
   the approved artifact.

## 7. Verifier shape

```
read record -> validate shape
read artifact bytes once -> sha256(buffer), buffer.length
if record missing -> APPROVAL_RECORD_MISSING (pending, not approved)
if record malformed -> APPROVAL_RECORD_INVALID (fail closed)
if hash != approves.sha256 or bytes != approves.bytes -> APPROVAL_RECORD_STALE (fail)
else -> OWNER_QA_APPROVED
```

Rules:

- The verifier owns the status. The manifest may mirror it, but a hand-edited
  manifest status is not evidence.
- Missing record is a pending state, never an approved state.
- Compare bytes, not a filename, a UI badge, or a status string.
- Read the artifact once into a buffer, then hash that buffer and take its
  length. Hashing a path and stat-ing it later leaves a race.
- Recompute after every artifact write.
- `noOCR: true` means no OCR inference. It does not mean zero work: a layout
  re-verification can still re-render every page.
- If the record and the artifact are reached through different path spellings
  or symlinks, compare resolved real paths and keep the recorded path in the
  output.

## 8. Hard gates stay hard

Approval of a visual change does not:

- turn simulation or imputation into an OCR fact or a clinical approval;
- approve OCR accuracy;
- approve provisional signature geometry;
- cover an unrelated defect or a later fix;
- relax zero-overlap, ink-preservation, page-pairing, or content gates.

A record can legitimately produce both:

```
ownerChange.status = OWNER_QA_APPROVED
summary.hardPass = false
summary.writingGuideContact.status = OWNER_DECISION_PENDING
```

This means the owner approved the position while the release gate remains
blocked. Report the owner-approved scope separately from the unchanged gates.
Do not collapse them into one boolean.

## 9. Failure codes

| Code | Meaning | Action |
|---|---|---|
| `APPROVAL_RECORD_MISSING` | no record exists | status pending; create a record; never approve |
| `APPROVAL_RECORD_INVALID` | missing or malformed fields | fail closed; fix the record |
| `ARTIFACT_MISSING` | candidate file cannot be read | fail closed; fix the path |
| `APPROVAL_RECORD_STALE` | artifact hash or byte count differs | fail; request new owner QA or revert |
| `APPROVAL_SCOPE_MISMATCH` | diff extends beyond `approves.change` | fail; request a new approval |
| `APPROVAL_SCOPE_OVERREACH` | a claim covers an item in `doesNotApprove` | fail; retract the claim |
| `DELIVERY_HASH_MISMATCH` | download differs from the advertised hash | fail the transport, retry |
| `BYTE_DIFF` | served blob differs from approved bytes | record as informational unless exact bytes are required |
| `CANDIDATE_RASTER_DIFF` | rendered pages differ | fail visual delivery |
| `RASTER_RENDERER_MISMATCH` | renderer, DPI, color space or rotation handling differs from the record | re-render with the recorded tool; otherwise report retained evidence only |
| `RASTER_PAGE_COUNT_MISMATCH` | rendered page counts differ | fail; the copies are not the same deliverable |
| `RASTER_PAGE_SIZE_MISMATCH` | a page renders at a different size | fail closed; check media box, crop box and rotation |
| `RASTER_CONTROL_FAILED` | the known-different control reported zero | discard the measurement; fix the harness |
| `GATE_RELAXED_WITHOUT_APPROVAL` | a gate was changed to pass without a recorded exception | fail; restore the gate |

## 10. Sanitized worked example

One local fill run produced four byte hashes for what looked like the same
two-page document:

- approved candidate `d03eceb7…`, 1,996,332 bytes;
- superseded approved reference `b7861d5d…`;
- batch copy `fbfc8d32…`, byte-different, zero differing pixels at 288 dpi on
  both pages;
- served application copy `521d66af…`, byte-different, zero differing pixels
  at 288 dpi.

The approval record bound `d03eceb7…`. The manifest showed
`ownerChange.status = OWNER_QA_APPROVED`, while the verification summary kept
`hardPass = false`: 8 of 10 records still failed on writing-guide contact, and
a 299 px stamp collision on another record was explicitly excluded from the
approval.

Lesson: bind the approval to one exact file. Prove every other copy with its
own hash plus a raster comparison, and label it as a copy, not as newly
approved bytes. A status label and a hard-gate verdict answer different
questions and must be reported separately.

## 11. Running the raster gate

Zero differing pixels measures two renders. It is not a property of two files,
and it is only reproducible with the renderer, DPI, color space and page
transform that produced the gate.

### Target selection

1. Enumerate every copy by recomputed SHA-256 and byte count. One visual
   deliverable routinely exists as several byte-distinct copies.
2. The comparison target is `approves.file`. A `supersedes.file` is the target
   only when the question is "what changed since the last approval".
3. Never pick "the newest file", "the batch copy" or "the file the app
   returned". Name the target path and hash in the report.
4. A candidate hash different from the approved hash is the trigger for this
   gate, not a verdict. Run the gate before calling it drift.
5. A stored `matchesCurrentCandidate: true` is the writer's assertion.
   Recompute the candidate hash and byte count before treating the record as
   current.

### Pin the renderer

Record all of these in the gate output:

| Field | Example | Why it matters |
|---|---|---|
| renderer | `poppler pdftoppm` | two renderers disagree on the same file |
| version | first line of `pdftoppm -v` | upgrades change hinting and antialiasing |
| resolution | `-r 288`, `pixelsPerPoint: 4` | pixel counts scale with DPI |
| color space | sRGB or the renderer's default | gamma and profiles move channels |
| rotation handling | viewer rotation applied or ignored | a `/Rotate 90` page renders in two orientations |
| page selection | `-f 1 -l N`, one image per page | a whole-document preview is not a page |

A3 landscape at 288 dpi is 4762 x 3368 px; the same page at 72 dpi is
1191 x 842. Never compare across the two.

### Pre-diff checks

- Page counts equal. Different counts are `RASTER_PAGE_COUNT_MISMATCH`, not a
  pixel count.
- Per-page width and height equal after the renderer's rotation normalization.
  A mismatch is `RASTER_PAGE_SIZE_MISMATCH`; do not rescale one side.
- Join pages by index and report each page separately. A single total hides
  that one page changed.
- Declare the threshold before measuring. "Any channel differs" and "max
  channel delta > 30" are different measurements; keep one for the whole
  comparison and write it into the method string.

### Controls

Run both before trusting a zero:

- **Identity control** — the same file against itself must report exactly zero.
- **Positive control** — a pair known to differ, such as `supersedes.file` when
  the record says a position moved, must report non-zero on the expected page.
  If it reports zero, the harness is not measuring: stop and report
  `RASTER_CONTROL_FAILED`.

### Renderer substitution is not a re-check

One workspace-proven pair: the approved sample against `supersedes.file`,
compared at the recorded 288 dpi, differs on page 1 and not on page 2.

| Renderer | Page 1 | Page 2 |
|---|---|---|
| recorded gate, 288 dpi | 35,718 px | 0 px |

That count is evidence for the recorded renderer, DPI and color space only. It
does not transfer to another tool: a substitute renderer changes the
measurement, and its zero proves nothing.

If the recorded renderer is absent, report `retained evidence only` with the
recorded numbers and name the missing tool.

### What zero does not prove

- Only the rendered pages, at that renderer and DPI. Not unrendered regions.
- Not content correctness, OCR accuracy or clinical approval.
- Not signature coverage: zero changed pixels inside keep-out boxes does not
  prove the boxes cover the whole signature.
- Not byte identity. Write "byte-different, raster-identical at <renderer>
  <dpi>" and never shorten it to "identical".

### Report block

```
target: <record file> <sha256> <bytes>
candidate: <file> <sha256> <bytes>
renderer: <name> <version> <dpi> <px/pt> <color space> <rotation handling>
threshold: <any channel differs | max channel delta > N>
controls: {identity: 0, positive: <page + count>}
pages: [{page, size, differingPixels, maxChannelDelta}]
verdict: RASTER_IDENTICAL | CANDIDATE_RASTER_DIFF | RASTER_CONTROL_FAILED
disposition: BYTE_DIFF (expected) | APPROVAL_RECORD_STALE | retained evidence only
```

## 12. Checklist

- [ ] Candidate bytes frozen and hashed from one buffer.
- [ ] Record has `kind`, `recordedAt`, verbatim `ownerMessage`.
- [ ] `approves` has `change`, `file`, `sha256`, `bytes`.
- [ ] `supersedes` names the prior file, hash, and historical status.
- [ ] `doesNotApprove` names every applicable exclusion.
- [ ] Verifier recomputes; missing, stale, and invalid records are handled.
- [ ] Manifest mirrors the status and names the record path.
- [ ] Re-verification is labeled `noOCR` when OCR was not rerun.
- [ ] Delivery reports transport hash, byte comparison, and raster comparison.
- [ ] Hard gates are reported separately; no silent relaxation.
- [ ] Old approved artifacts are retained.
- [ ] Raster gate names renderer, version, DPI, color space, rotation handling
      and threshold.
- [ ] Identity and positive controls ran before a zero was trusted.
- [ ] Pages compared by index, with page count and per-page size checked first.
