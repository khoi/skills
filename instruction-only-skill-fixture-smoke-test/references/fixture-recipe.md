# Fixture recipe for instruction-only skills

## 1. Preconditions

Use this recipe only when all four hold:

- The target skill is instruction-only: `SKILL.md` plus optional `references/`, with no executable scripts.
- The target has at least one observable outcome: a verdict, a keep/remove decision, a pass/fail, or an edit to a document.
- Its documented commands can run locally on synthetic files.
- You can keep the fixture outside any real workspace.

If the target has no documented command and no observable edit or outcome, this recipe cannot establish behavior. Say so; do not substitute a package check.

## 2. Layout

```
/tmp/<skill>-smoke/
├── fixture/                  # the copy the skill may edit
│   ├── report.md
│   ├── evidence/
│   │   ├── verification.json # raw artifact
│   │   └── README.md         # derivative restatement
│   └── vendor/
│       └── bundle.min.js     # excluded from evidence
├── baseline/                 # byte copy of fixture/ before the run
└── manifest.json             # path, size, sha256, mtime for every file; oracle if present
```

`baseline/` must sit outside `fixture/`. If it is inside, the skill's documented search can find it and treat the pre-edit copy as evidence.

If you are rebuilding a fixture from a prior run that recorded the post-edit hash of a file, add that hash to the manifest as `oracle.expected_sha256` and require the rebuilt file to match after the documented edit; a mismatch is fixture or rule drift, not a verdict.

## 3. Target hash ledger

Open a ledger with three checkpoints: `contract` (when you extract the observable contract), `pre` (immediately before invoking the skill), and `post` (after the sweep). Record `sha256` and mtime for `SKILL.md` and every reference file at each checkpoint.

| checkpoint | when | purpose |
|---|---|---|
| `contract` | after freezing the target | bind the test to a specific version of the skill |
| `pre` | immediately before invoke | detect moves between contract extraction and grading |
| `post` | after the sweep | detect moves during the run; label scope if changed |

If `contract` ≠ `pre`, re-read the contract and update the case matrix before grading — a mixed contract is not a test. If `pre` ≠ `post`, keep the result and label `scope: frozen version <pre> only`; name both hashes and do not claim the current package was tested.

### 3.1 A read-only target that moves is not a merge conflict

A target that changes during the run is a concurrent author, not a write conflict. Use `skill-dir-concurrent-write-reconcile` only when you are also writing the target. When the target is read-only and moves, preserve the frozen-version test results, label them `scope: frozen version only`, and name both hashes. Do not merge, revert, or reconcile the other session's edits.

If the move invalidates the contract you graded (for example, the verdict vocabulary or documented commands changed), re-read the contract and re-run the test; do not patch the old result onto the new version.

### 3.2 Fidelity oracle for a rebuilt fixture

If a prior run recorded the post-edit hash of a file, that hash is a fidelity oracle: a byte-identical end-state check. Add it to the manifest as `oracle.expected_sha256`. After the documented edit, compare the edited file's `sha256` to the oracle and report `matched`, `mismatched`, or `n/a`.

A match proves the rebuilt fixture reached the same end state as the prior run; it does not prove the inputs, target version, or intermediate steps were identical. A mismatch is fixture or rule drift, not a verdict — investigate whether the fixture, the skill's procedure, or the target changed.

Measured example: session `44a27f48-ea1c-4c92-98b3-4ff66ebdd839` (26 October 2026) self-applied the recipe to target `unbacked-measurement-trim`. The rebuilt fixture's post-edit hash matched the recorded oracle `e4ecb31b`, but the target moved during the run (`SKILL.md` 987716d3 → 2b7a5270, reference da3abfef → d1528afc). The result was labeled `scope: frozen version only`.

## 4. Planted-case matrix

One class per token. Fill this in before writing files.

| id | planted bytes | file | intended outcome | discriminating observation |
|---|---|---|---|---|
| C1 raw | `4219` in a named field | `evidence/verification.json` | keep / proven | standalone token, independent artifact, field matches the claim |
| C2 derivative | `4219` in prose | `evidence/README.md` | not independent evidence | hit exists, but the keep must rest on C1 |
| C3 substring | `812` inside `0.5666008123451233` | `evidence/verification.json` | collision / remove | hit context is a coordinate, not a count |
| C4 vendor | `1004552` | `vendor/bundle.min.js` | no artifact under the documented exclusion | `rc=1` with the exclusion, `rc=0` without it |
| C5 absent | `998301` | nowhere | no artifact | `rc=1` plus a positive control that proves the search works |
| C6 formatted | `4,219` in the document, `4219` in the artifact | `report.md` vs JSON | both forms searched | plain form hits only the artifact; formatted form hits only the document |

Add a must-keep token and a must-miss token. A must-miss token that any command finds means the search is too broad.

## 5. Illustrative fixture contents

The source run's exact input table was not preserved; the surviving `/tmp/trim-smoke` copy is a later state. The files below are layout examples, not a frozen reproduction.

`report.md` — the document carrying claims:

```markdown
# Fixture report

## 11. Renderer comparison

| Renderer | Page 1 differing pixels |
|---|---|
| recorded gate | 4,219 px |

Bound to `evidence/verification.json` `differingPixels` on page 1, pair
`approved-sample vs superseded`, renderer `recorded-gate`, 288 dpi, page size
`4762x3368`.

Rule: a substitute renderer is not a re-check.
```

`evidence/verification.json` — the raw artifact and the substring trap:

```json
{
  "pair": "approved-sample vs superseded",
  "renderer": "recorded-gate",
  "dpi": 288,
  "pages": [
    {
      "page": 1,
      "pageSize": "4762x3368",
      "differingPixels": 4219,
      "ocrBox": "0.5666008123451233"
    },
    {
      "page": 2,
      "pageSize": "4762x3368",
      "differingPixels": 0
    }
  ]
}
```

`evidence/README.md` — the derivative restatement:

```markdown
Restatement of a completed run: 4219 px differed on page 1.
```

`vendor/bundle.min.js` — a tiny bundle containing only the vendor-only token:

```js
var a=1004552;function b(){return a}
```

## 6. Command capture

Run the target's documented command from the fixture root, not a command you designed. Example from the source run:

```sh
grep -rIF --exclude-dir=vendor --exclude-dir=node_modules --exclude-dir=.git -l -- "<token>" .
```

Record each case in this shape:

```
cwd: <fixture root>
cmd: <exact command>
rc: <n>
hits: <path:line> <surrounding context>
control: <same command on a known-present token, or without the exclusion> rc=<n>
```

Measured on the surviving `/tmp/trim-smoke` copy on 26 October 2026:

| token | variant | rc | interpretation |
|---|---|---|---|
| `4219` | documented exclusion | 0 | raw JSON and derivative README |
| `4,219` | documented exclusion | 0 | document only |
| `812` | documented exclusion | 0 | only inside the `ocrBox` coordinate |
| `1004552` | documented exclusion | 1 | vendor excluded |
| `1004552` | no vendor exclusion | 0 | proves the exclusion, not a broken search, caused `rc=1` |
| `998301` | documented exclusion | 1 | absent |
| `1,004,552` | documented exclusion | 1 | absent from the surviving document |
| `998,301` | documented exclusion | 1 | absent from the surviving document |
| `same pairs`, `Origin note`, `substitute A` | documented exclusion | 1 | removed prose is absent |
| `4,219` | documented exclusion | 0 | retained value still present |

The surviving copy is a later state: 14 lines and `sha256 21fbf905…`, versus the run report's 13 lines and `e4ecb31b…`. The absent tokens returning `rc=1` on this state does not by itself prove the edit removed them; only a baseline diff can prove that.

The residue sweep is scoped to the edited document. A document-scoped sweep for `812` after the edit is `rc=1`; a fixture-wide sweep is `rc=0` because the raw coordinate keeps the substring. Record the sweep scope.

## 7. Grading worksheet

For each row:

```
case: <id>
intended: <outcome fixed before the run>
observed: <rc and context>
result: PASS | FAIL
if FAIL: fixture defect (case not discriminating) | skill defect (rule did not fire)
```

Rules:

- Do not change `intended` after seeing `observed`.
- Print enough context to classify a hit: standalone or substring, which field, which file, raw or derivative.
- A passing read-only grade does not excuse a failed residue sweep.
- A skill defect is reported, not repaired by rewriting the rule to fit the fixture.

## 8. Edit and sweep

1. Confirm `baseline/` still matches the manifest.
2. Let the skill perform its edit on `fixture/` only.
3. Re-read the edited files. Check that retained values still name their source and that the rule survives without the removed numbers.
4. Sweep the edited document or files, not the raw evidence tree. A removed claim can legitimately remain in the raw artifact, and the substring collision remains inside its coordinate. Require `rc=1` for every removed value in plain and formatted form, every removed prose phrase, and every dangling reference in the edited files.
   Sweep the exact removed phrase. A generic word can survive inside the preserved rule: after `substitute A`, `substitute B` and `substitute C` were removed, `grep -IF -- "substitute"` still returned `rc=0` because the kept rule reads "a substitute renderer is not a re-check". Record `rc=0` for that word as expected, and `rc=1` for each exact removed label.
5. Re-run the retained-value search and the binding check. Require `rc=0` and the binding line present.
6. Run `diff -ru baseline fixture` and keep the output.
7. Re-hash the target skill's `SKILL.md` and reference files and record `post`. If `post` differs from `pre`, label `scope: frozen version <pre> only` and name both hashes.
8. If the manifest carries an oracle, compare the edited file's `sha256` to `oracle.expected_sha256` and report `matched`, `mismatched`, or `n/a`. A mismatch is fixture or rule drift, not a verdict.

If the skill edits outside `fixture/`, stop. That is a safety failure, not a partial pass.

## 9. Worked source example

Source session `32aed1bb-2bea-49b5-ba06-43f4b08152ea`, owner turn "try running /unbacked-measurement-trim to test the skill" on 25 October 2026.

- The fixture had four small files in `/tmp/trim-smoke`.
- Planted classes: raw `4219`, derivative `4219`, coordinate substring `812`, vendor-only `1004552`, absent `998301`, and the `4,219` / `4219` formatted pair.
- The target's documented exclusion search and its residue sweep reproduced the intended verdicts: `PROVEN`, `SUBSTRING_HIT`, `NO_ARTIFACT`.
- The vendor exclusion was proven with a control: `rc=1` with the exclusion, `rc=0` without it.
- Every removed token returned `rc=1` after the edit; the retained `4,219` returned `rc=0`.
- Not exercised: citation re-pointing and the concurrent-write stop. The run said so explicitly.
- The creation run (session `44a27f48-ea1c-4c92-98b3-4ff66ebdd839`, 26 October 2026) self-applied this recipe to its own source target `unbacked-measurement-trim`. The target moved during the run; the result was labeled `scope: frozen version only` and the rebuilt fixture's post-edit hash matched the recorded oracle `e4ecb31b`.

What the source run did not preserve:

- No pre-edit copy, so the owner's later "compare with the original" request required a reconstruction.
- No manifest, so the surviving `/tmp` copy drifted and cannot serve as a byte-frozen regression fixture.

This recipe adds both.

## 10. Retention and cleanup

Retain the fixture only when:

- `manifest.json` records every file hash,
- `baseline/` and `fixture/` both still match their recorded state,
- the fixture is intended as a regression harness for future rule changes,
- if the manifest carries an oracle, the edited file's hash matches `oracle.expected_sha256`.

Otherwise delete `fixture/` and `baseline/` and record that cleanup. A fixture left in `/tmp` without a manifest looks reusable but is not.

Never build a fixture from patient records, credentials, production exports or any real workspace. Synthetic tokens only.

## 11. Self-test of this recipe

To smoke-test this skill itself:

1. Pick an instruction-only target that emits discrete verdicts.
2. Build a scratch fixture and baseline outside any real workspace.
3. Invoke this skill through the Skill tool and follow its workflow.
4. Confirm the output contains one PASS/FAIL row per planted class, the command/rc table, the sweep, the diff, an explicit `not_exercised` list, the target hash ledger (contract/pre/post), and the oracle result if applicable.
5. If the target moved during the run, confirm the result is labeled `scope: frozen version only` per §3.1 and both hashes are named.
6. Do not edit the target skill during the run. A self-test pass means the recipe executed end to end, not that the target's domain rules are correct.

If the loader does not expose this skill, report a registration gap and stop; do not simulate the run from memory.
