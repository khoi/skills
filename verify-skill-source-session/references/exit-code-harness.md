# Exit-code harness for documented commands

A documented command is verified only when its **exit code** was captured. Two
shell behaviors hide a rejection code behind a successful-looking line; both were
observed while verifying a bundled gate script, and one produced a literal
`unexpected pass` in the verification output.

Division of labor: `shell-command-result-verification` owns the general shell
discipline (`$?` after a pipe, `${PIPESTATUS[0]}`, per-case capture, zsh
no-match). This file covers the two `set -e` variants specific to a
**verification harness** and the production-evidence cross-check in step 11 — it
does not restate that sibling's rules.

Run in a `mktemp -d` scratch directory. `crop_fit_gate.mjs` /
`make_stub_card.mjs` are the bundled scripts of the `ocr-fixture-crop-fit-gate`
skill — any command with distinct success/failure exit codes can stand in, and
the trap shapes are what matter.

Run the setup once, then each trap block **in its own shell**
(`bash -c '<block>'`), because Trap A's own `set -e` ends the session it runs in:

```sh
SCRATCH=$(mktemp -d) && cd "$SCRATCH"
D=~/.qoder/skills/ocr-fixture-crop-fit-gate/scripts
[ -f "$D/crop_fit_gate.mjs" ] || { echo "SETUP_ERROR gate script not found at $D" >&2; exit 2; }
node "$D/make_stub_card.mjs" --out clean.png --size 200x80 --ink 40,20,160,55
node "$D/make_stub_card.mjs" --out clip.png  --size 200x80 --ink 19,20,160,55
node "$D/make_stub_card.mjs" --out zero.png  --size 200x80 --ink 20,20,179,55
node "$D/crop_fit_gate.mjs" clip.png --crop 20,10,160,60; echo "gate direct exit=$?"
```

The last line is the ground truth every block below must reproduce: the gate
rejects a 1px overhang with exit **1**. A harness that reports anything else for
this command is broken, not the gate.

## Trap A — `set -e` plus a pipe reports the parser's status

`set -e` alone does **not** abort on a failing pipeline element: the pipeline's
status is the *last* command's, so `python3` returning 0 overwrites the gate's 1.

```sh
set -e
node "$D/crop_fit_gate.mjs" clip.png --crop 20,10,160,60 \
  | python3 -c 'import sys,json;print("verdict",json.load(sys.stdin)["verdict"])'
echo "exit=$?"
```

Observed:

```
verdict FIT_REJECTED
exit=0
>>> harness overall exit=0
```

`exit=0` is the pipeline status, not the gate's. The rejection looks accepted —
this is the false "pass".

## Trap B — `set -e` plus a bare command ends the harness silently

```sh
set -e
node "$D/crop_fit_gate.mjs" clip.png --crop 20,10,160,60 >/dev/null
echo "exit=$?"        # never printed
echo "REACHED END"    # never printed
```

Observed: no output at all, `>>> harness overall exit=1`. The harness aborted
before the assertion, so the remaining checks silently never ran — a green
partial run.

## Trap C — `pipefail` makes it fatal, still without reporting

```sh
set -e -o pipefail
node "$D/crop_fit_gate.mjs" clip.png --crop 20,10,160,60 \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])'
echo "exit=$?"
```

Observed: `FIT_REJECTED` printed, then the harness aborts — `exit=` never
prints. `pipefail` fixes which status the pipeline carries, not the abort.

## The shape that works — no `set -e`, explicit capture

```sh
check() {                       # check LABEL EXPECTED cmd...
  local label=$1 expect=$2; shift 2
  local out rc verdict
  out=$("$@" 2>/dev/null) && rc=0 || rc=$?
  verdict=$(printf '%s' "$out" | python3 -c \
    'import sys,json;d=json.load(sys.stdin);print(d["verdict"],d["minMarginPx"],d["outsideBand"])' \
    2>/dev/null || echo NON_JSON)
  if [ "$rc" = "$expect" ]; then echo "PASS $label exit=$rc $verdict"
  else echo "FAIL $label exit=$rc expected=$expect $verdict"; fi
}

check "clean (positive)"        0 node "$D/crop_fit_gate.mjs" clean.png --crop 20,10,160,60 --expect-size 200,80
check "1px clip (must reject)"  1 node "$D/crop_fit_gate.mjs" clip.png  --crop 20,10,160,60
check "zero clearance (reject)" 1 node "$D/crop_fit_gate.mjs" zero.png  --crop 20,10,160,60
check "missing --crop (usage)"  2 node "$D/crop_fit_gate.mjs" clean.png
```

Observed — every branch reports, and the code is the command's own:

```
PASS clean (positive) exit=0 FIT_OK 10 []
PASS 1px clip (must reject) exit=1 FIT_REJECTED -1 ['left']
PASS zero clearance (reject) exit=1 FIT_REJECTED 0 []
PASS missing --crop (usage) exit=2 NON_JSON
```

Keep a rejection expectation in the list: a positive-only harness cannot tell a
working gate from one that always exits 0. Prefer one captured `rc` per branch
over `set -e`/`set -o pipefail` in a verification harness — those options exist
for production scripts, not for reporting.

## Cross-checking an independent rewrite against retained production evidence

Running only synthetic fixtures proves the rewritten script runs. It does not
prove it **measures the same thing** as the production code it re-implements. For
that, run it on the project's real inputs and compare with the production run's
retained evidence file.

Two rules from the first attempt at this comparison:

1. **Join by identity, not position.** Sampling `measurements[i]` against
   `cards[i]` produced `script.minMarginPx=20 / production=14` mismatches on
   three of three cards purely from ordering — a positional join invents
   disagreement. Match each measurement to its input by the stable key the
   evidence records (`payloadId` / `documentId` / `classId`, or a filename
   pattern), then compare.
2. **Compare the whole field set, and read the report's shape first.** These
   reports keep per-item records under a `measurements` array; the top level
   holds summary keys (`cardsMeasured`, `allCardsFit`, `fitRule`,
   `protocolAmendment`). Indexing the top level as a record list yields an empty
   list and a crash, not a result.

Identity-joined, the standalone script and the retained production report agreed
on all compared fields for every card:

```
IDENTITY-JOINED: 36/36 cards agree on all 8 measurement fields
```

Fields compared: `minMarginPx`, `fits`, `ink`, `coreInk`, `margins`,
`outsideBand`, `clearanceViolations`, `clippedByCrop`.

Figures from that one source run, recorded here as what was measured, **not as
thresholds to reuse**: 36 cards, all fitting, per-card minimum clearance ranging
14–21 px at the amended crop. A later recommendation summarized the same range as
14–20; the retained reports say 14–21. Re-read the evidence file rather than
carrying a summary figure forward.
