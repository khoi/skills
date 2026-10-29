---
name: executable-packet-freeze-verify
description: Freeze a reviewable executable admission packet and keep its hash lock stable while its gates are proven to refuse. Use when a controller/runner bundle must be hash-locked for independent review, when SHA256SUMS must cover immutable files only because the controller rewrites its own check output, when a refusal log or proof written inside the packet invalidates the sums, when a stale allocation hash raises PACKET_BUNDLE_DRIFT and masks the real gate, or when "stable" has to mean the check ran twice with exit 0 and identical counters.
---

# Executable Packet Freeze Verify

## Overview

A packet is frozen when its immutable bytes are listed in `SHA256SUMS`, every gate refuses with a captured exit code, and two consecutive checks produce identical counters. Each evidence write inside the packet breaks the second condition unless the sums are regenerated afterwards.

## Non-negotiable rules

1. `SHA256SUMS` lists immutable bytes only. Never list `SHA256SUMS` itself, the controller's own check output, phase proofs, run directories, or any file a probe rewrites.
2. Evidence is produced outside the packet (`/tmp`), copied in, then the sums are regenerated. Never write inside a summed tree and then treat the earlier sums as valid.
3. "Stable" means the check command ran twice back to back, both exit 0, with identical counters and zero errors. One passing run proves nothing.
4. A gate is proven by a nonzero exit code, the expected reason token, and the absence of the side effect it guards (no run directory, no bound port, no started process). Prose is not proof.
5. When a check reports drift, regenerate the sums and re-run. Never widen an exclusion, relax a gate, or delete evidence to make a check pass.

## Procedure

### 1. Inventory what rewrites itself

Read the controller and runner for every write inside the packet root before hashing anything. Grep for the packet root in write calls; anything a `--check`, `--run`, or evidence step writes is mutable and must stay out of the sums.

### 2. Freeze identity before bytes

Record candidate head and tree, the executable bundle manifest hash, the guard hash, and the review/allocation status fields. The runner re-derives these, so they must be final before the sums are generated. A later source edit invalidates the whole packet and requires a rebinding note, not a quiet sums refresh.

### 3. Generate the sums

```bash
S=~/.qoder/skills/executable-packet-freeze-verify/scripts/packet_freeze.py
P=/path/to/packet
python3 "$S" sums --root "$P" --write \
  --exclude SHA256SUMS --exclude controller-check.json \
  --exclude phase-proof.json --exclude 'run-*/'
```

Expect `WRITTEN entries=N sha256=…`; keep both values. Omit `--write` to verify: `VERIFIED entries=N sha256=…` with exit 0, or `SUMS_DRIFT` with the missing/unlisted/drifted paths and exit 1.

Exclude with a trailing slash for directories. A bare `run-*` also hides files such as `run-owned-qa.py` and reports them as missing; `run-*/` prunes only the directory.

### 4. Prove stability

```bash
python3 "$S" stable --root "$P" --out-dir /tmp/freeze \
  --cmd "python3 executable/packet-controller.py --check"
```

The script refuses an `--out-dir` inside the packet, redirects both runs outside the tree, verifies the sums before and after, and compares the JSON counters. Expect `STABLE entries=N counters=…`. `SUMS_DRIFT_BEFORE`, `SUMS_DRIFT_AFTER`, or `DRIFT counters differ: …` is a failure, not a warning.

### 5. Prove the refusal paths

```bash
python3 "$S" refuse --root "$P" --out-dir /tmp/freeze \
  --cmd "python3 executable/run-owned-qa.py --run /tmp/alloc.json" \
  --token PACKET_INDEPENDENT_REVIEW_REQUIRED --no-new run-1
```

Minimum set for a governed packet: no allocation supplied, allocation present but review still pending, malformed or mismatched allocation, and the controller's own `--run` path. Each must print `REFUSED exit=1 token=… sideEffects=absent`.

- `NO_REFUSAL` — the gate let the command through; nothing was proven.
- `WRONG_TOKEN` — a different gate fired first. `PACKET_BUNDLE_DRIFT` here means the allocation carried hashes from an earlier bundle: rebuild the allocation from the current bundle manifest so the intended gate is the one under test. A drift refusal is still a refusal, but it does not prove the review/allocation gate.
- `SIDE_EFFECT_CREATED` — the command did work it claimed to gate.

### 6. Absorb every later write

After copying logs, refreshing a smoke or proof JSON, or editing a summary inside the packet, do all three in order: regenerate the sums, re-run the double check, re-hash the affected manifests. Logs written straight into `logs/` will otherwise appear as `drift logs/...` on the next check — that report is accurate about the order of operations, not a tooling bug.

### 7. Final read-only sweep

```bash
cd "$P" && shasum -a 256 -c SHA256SUMS     # every entry OK, exit 0
ls -d run-* 2>/dev/null || echo NO_RUN_DIR
pgrep -fl "next build|next start|gotrue|kong" || echo NO_SERVICES
```

Sums paths are relative to the packet root; running this elsewhere reports every entry as `FAILED open or read`.

### 8. Report

State the frozen hashes (head/tree, bundle manifest, controller, runner, `SHA256SUMS`), the sums entry count, both check exit codes and counters, each gate's exit code and reason token, and what was explicitly not run. Do not describe a pending-review or not-allocated packet as executable or approved, and do not present a packet you did not just re-verify as still frozen.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Second check reports a sums mismatch | `controller-check.json` listed in `SHA256SUMS` while `--check` rewrites it | Exclude mutable outputs, regenerate, double-check |
| Refusal log shows `drift logs/...` | Log written inside the packet before regeneration | Write to `/tmp`, copy in, regenerate, double-check |
| `PACKET_BUNDLE_DRIFT` instead of the review gate | Allocation built from an earlier bundle hash | Rebuild the allocation from the current bundle manifest |
| A file listed in sums reported `missing` | Over-broad exclusion such as `run-*` hiding `run-owned-qa.py` | Use `run-*/` for directories |
| Every entry `FAILED open or read` | `shasum -c` run outside the packet root | Run it from the root |
| `invalid int value: '65164 65165'` | Unquoted variable expanded into one argument | Pass each port as its own argument |

Case notes with symptoms, root causes, and the ordering that fixed them: [references/packet-freeze-failure-modes.md](references/packet-freeze-failure-modes.md).

## Resources

- `scripts/packet_freeze.py` — `sums` (immutable-only write or verify), `stable` (double check outside the tree, sums verified before and after), `refuse` (exit code + reason token + absent side effect). Exit codes: 0 pass, 1 failure, 2 usage error.
- `references/packet-freeze-failure-modes.md` — observed cases, the exact ordering that fixed each, and a dated snapshot of a frozen packet.
