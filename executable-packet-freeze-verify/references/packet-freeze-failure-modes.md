# Packet Freeze Failure Modes

Observed while turning a proposal-only admission packet into executable, hash-locked bytes for independent review. Each case lists the symptom as it appeared, the cause, and the ordering that fixed it.

## 1. The controller drifts its own sums

**Symptom.** The first `--check` passes. The second reports a sums mismatch on a file nobody edited, and the recorded hash is the one from the run before.

**Cause.** `controller-check.json` was included in `SHA256SUMS`, but `--check` rewrites that file each time it runs (the same holds for `phase-proof.json`, written by `--run`). The sums therefore describe the packet as it was before the check that is verifying them.

**Fix.** Exclude every mutable output — `SHA256SUMS`, `controller-check.json`, `phase-proof.json`, run directories — then regenerate and run the check twice. Two clean runs are the proof; a regeneration that is not followed by a second check proves nothing.

## 2. Evidence written inside the packet re-breaks it

**Symptom.** After a refusal is recorded, the next check reports `drift logs/smoke-refuse-review-pending.log` and `drift logs/smoke-controller-refuse.log`. The refusal itself was correct (exit 1, expected token).

**Cause.** The refusal logs were written directly into `logs/`, which is inside the summed tree. The sums were generated before those writes.

**Why this is not a tooling bug.** The controller was reporting the true ordering: summed bytes changed after freezing. Deleting the drift lines or excluding `logs/` would both hide a real ordering error.

**Fix, in this order:**

1. run the probe with output redirected to `/tmp`;
2. copy the logs into the packet;
3. refresh any proof JSON that hashes those logs;
4. regenerate the sums;
5. run the check twice.

Repeating steps 3–5 for every later write (summary edits, refreshed manifests, new proofs) is what keeps `STABLE` meaningful.

## 3. A stale bundle hash masks the gate under test

**Symptom.** A refusal probe expected `PACKET_INDEPENDENT_REVIEW_REQUIRED` but got `PACKET_BUNDLE_DRIFT`, with no run directory created.

**Cause.** The allocation file had been written before the executable manifest changed, so it carried the previous bundle hash. The runner checks bundle identity before review status, refused at the earlier gate, and never reached the one being proven.

**Fix.** Rebuild the allocation from the current bundle manifest hash and re-run the probe. Do not accept a drift refusal as proof of the review or allocation gate; it proves only that the bundle check works.

## 4. An over-broad exclusion hides a real file

**Symptom.** Verification reports a file listed in `SHA256SUMS` as `missing` even though it is on disk and `shasum -c` passes.

**Cause.** The directory exclusion was written `run-*`, which also matches a script named `run-owned-qa.py`. The walker skipped the file, so the recomputed set was one entry short.

**Fix.** Exclude directories with a trailing slash (`run-*/`). `packet_freeze.py` treats a trailing-slash pattern as directory-only and never applies it to files.

## 5. Checksum verification from the wrong directory

**Symptom.** Every entry prints `FAILED open or read` and the command exits nonzero.

**Cause.** `SHA256SUMS` stores root-relative paths; `shasum -c` was invoked from elsewhere.

**Fix.** `cd` into the packet root first. If a single entry fails while the rest pass, that is genuine drift, not a path problem.

## 6. Argument splitting in shell probes

**Symptom.** `verify: error: argument ports: invalid int value: '65164 65165'`.

**Cause.** An unquoted variable holding two ports expanded into a single argument.

**Fix.** Pass each value as its own argument, and keep probe commands identical to the ones recorded in the evidence.

## Dated snapshot

Values below identify one frozen revision of a packet that was verified with these procedures. They are a dated record, not a statement about the packet's current bytes: another writer has since modified that runner in place, so the same sums now report `drift executable/run-owned-qa.py`.

| Item | Value |
| --- | --- |
| `SHA256SUMS` | 77 entries, sha256 `484f371f4572d3c06f16f3fe26cf475efa43abaafd06b677a2eb0450f4638e19` |
| Excluded from sums | `SHA256SUMS`, `controller-check.json`, `phase-proof.json`, `run-1/` |
| Bundle manifest | `MANIFEST.sha256.json` sha256 `60aeccae8dd09d0350fe27ffab4d692dee9c9a4bca59012402f7479b24c7c516` |
| Controller | `packet-controller.py` sha256 `5bc52d94025c4bb54d822f8634f4c3b1c04bb7b6d564a9c09b9128ec7845226e` |
| Runner (as listed in sums) | `run-owned-qa.py` sha256 `50708e19bd94028fd5be9435684a7e07b319e759e1b378393e53398634dc4a59` |

Both checks returned exit 0 with identical counters (`bundleFiles` 35, `inputFiles` 71, `historyFiles` 10, `sumsFiles` 77) and `reviewStatus` `PENDING_INDEPENDENT_REVIEW`, `allocationStatus` `NOT_ALLOCATED`, `readyForAllocation` false. `shasum -c` from the packet root returned 77/77 OK, exit 0, at that time.
