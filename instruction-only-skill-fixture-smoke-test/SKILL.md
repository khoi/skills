---
name: instruction-only-skill-fixture-smoke-test
description: Behavioral smoke test for an instruction-only Skill with no scripts. Build a throwaway fixture with one planted case per verdict class, invoke the Skill, run its own documented commands verbatim, require each planted class to reproduce its outcome, let the Skill edit the fixture, then sweep for residue. Use when asked to run /<skill-name> to test it, when a Skill has only SKILL.md and references, or when package and registration checks are green but the procedure was never executed. Covers raw artifact vs derivative restatement, substring collisions, vendor-only hits, absent tokens, formatted variants, empty-result positive controls, must-keep and must-miss tokens, pre-edit baseline preservation, and exercised vs not-exercised coverage. Not for bundled scripts (bundled-script-verification-checklist), post-write structure (skill-postwrite-registration-verification), source-session claim grading (verify-skill-source-session), or document trimming (unbacked-measurement-trim).
---

# Instruction-only skill fixture smoke test

## Overview

Package, citation and registration checks prove a skill exists and is structurally valid. They do not prove its procedure behaves. For a skill that ships no scripts, the only executable thing is the procedure applied to data you control.

Build a small fixture with known ground truth, invoke the skill through the Skill tool, run the commands its own documentation gives, and require every planted case to reproduce its intended verdict. Then let the skill perform its edit and sweep the fixture for residue. The fixture run is the test; a green package check is not.

## Trigger shape

- "Run /<skill-name> to test it" where the skill has only `SKILL.md` and references.
- Package, citation and registration checks are green, and the owner still asks whether the skill actually works.
- A rule, verdict vocabulary or documented command changed in an instruction-only skill and needs a regression run.
- The skill emits discrete outcomes (keep / remove / unproven, pass / fail, match / collision), but no command was ever executed against known ground truth.

## Core model

Keep three claims separate and never merge them:

1. **Loads** — the loader exposes the skill name.
2. **Valid** — checkers accept the frontmatter, links, citations and file set.
3. **Behaves** — the documented procedure produces the intended outcome on ground truth.

This skill tests only claim 3.

- **Ground truth is constructed before the run.** Decide which planted case must produce which verdict. Never let the skill's output define the expected result.
- **One case per verdict class.** Cover the classes the skill claims to distinguish. At minimum: a raw artifact that must be kept, a derivative restatement of the same value, a substring collision, a vendor or minified-only hit, an absent token, and the formatted variants the skill says it searches.
- **Run the skill's own documented commands.** A better search you invented tests your search, not the skill. Record any adaptation forced by the fixture root.
- **Exit codes and match context are evidence.** A hit list is not a verdict. Inspect whether the hit is standalone, which field it sits in, and whether the artifact is independent.
- **Every empty result needs a positive control.** Run the same command on a known-present token, or without the exclusion that produced `rc=1`. Otherwise the empty result only proves the command did not run as intended.
- **The edit is part of the procedure.** Grade before the edit; sweep for residue after it. A passing read-only grade plus a failed sweep is a failure.
- **A class that never fired is a gap, not a pass.** Report unexercised branches explicitly.

## Workflow

1. **Freeze the target and open a hash ledger.** Record the `sha256` and mtime of `SKILL.md` and every reference file before extracting the contract. If a hash moves before the contract is fixed, re-read and restart — a mixed contract is not a test. Extract the observable contract: verdict vocabulary, documented commands verbatim, edit behavior, stop conditions, and branches the skill says it cannot handle. If the skill has no documented command and no observable edit or outcome, this test cannot establish behavior; say so instead of substituting a package check.

2. **Design the case matrix before writing any fixture file.** For each case record: id, planted bytes, file, intended outcome, and the observation that discriminates it. One class per token; do not let one token satisfy two classes. Include a must-keep token and a must-miss token.

3. **Build a fixture and a separate baseline.** Use a throwaway root outside any real workspace, for example `/tmp/<skill>-smoke/`. Put the editable copy in `fixture/` and an untouched copy in `baseline/`. The baseline must live outside the fixture root, or the skill's documented search can hit it as false evidence. Write a manifest with every fixture file's path, size, `sha256` and mtime. If you are rebuilding a fixture from a prior run that recorded the post-edit hash of a file, add that hash to the manifest as an oracle and require the rebuilt file to match after the documented edit; a mismatch is fixture or rule drift, not a verdict. Synthetic data only: no patient, clinical, credential or production records.

4. **Load the skill.** Invoke it through the Skill tool (`/<skill-name>`). Re-hash immediately before invoking and record `pre`; if it differs from the contract hash, re-read the contract and update the case matrix before grading. If it does not load, report a registration gap; do not proceed to a behavioral pass. Confirm the commands you will run are the ones written in the skill.

5. **Grade read-only.** From the fixture root, run each documented command exactly as written. Capture the command, working directory, exit code, matching `path:line`, and surrounding context. Compare every case with the intended outcome. Stop on the first failing class; do not let the later edit mask a grading failure.

6. **Prove the negatives.** For an `rc=1` caused by an exclusion or filter, re-run without it and require `rc=0`. For an empty search, run a known-present token with the same command and exclusions and require `rc=0`. Keep a must-miss token that no command should find. Search the plain token and each formatted variant separately; a miss on one form is not a miss on the other.

7. **Run the edit.** Let the skill perform its documented edit on `fixture/` only. Re-read the edited files. Confirm that retained values still carry their source binding and that rules survive without the removed numbers. If the skill edits outside the fixture root or touches `baseline/`, stop and treat it as a safety failure.

8. **Sweep the edited files for residue.** Scope the sweep to the files the skill was supposed to edit, not the raw evidence tree: a removed claim can legitimately remain inside the raw artifact, and a substring collision remains inside its coordinate. Every removed value in plain and formatted form, every removed prose phrase, and every dangling cross-reference must return `rc=1` in those files. Sweep the exact removed label or phrase, not a generic word: a word such as `substitute` survives inside the preserved rule "a substitute renderer is not a re-check" and returns `rc=0` even when `substitute A`, `substitute B` and `substitute C` are gone. Every retained value must return `rc=0`, and its binding line must still be present. Re-run the commands that should be unchanged and compare exit codes.

9. **Diff against the baseline.** Run `diff -ru baseline fixture` or the platform equivalent. Report exact changed files and hunks. If the manifest carries an oracle, compare the edited file's `sha256` to `oracle.expected_sha256` and report `matched`, `mismatched` or `n/a`; a mismatch is fixture or rule drift, not a verdict. Without a pre-edit baseline the diff is a reconstruction and cannot prove the exact before/after state.

10. **Report and decide retention.** Re-hash the target after the sweep and record `post`. If `post` differs from `pre`, keep the result and label `scope: frozen version <pre> only`; name both hashes and do not claim the current package was tested. A read-only target that moves is not a merge conflict: use `skill-dir-concurrent-write-reconcile` only when you are also writing the target, or when the move invalidates the contract you graded — then re-read and re-run, not merge. Fill the reporting block. Separate expected from observed, list exercised and not-exercised branches, and state what the run does not prove. Retain the fixture only when its manifest is frozen and it is meant as a regression harness; otherwise delete both `fixture/` and `baseline/` and say so.

## Fixture design rules

- **Raw vs derivative.** Keep the derivative restatement in a different file from the raw artifact. A keep justified only by the restatement is a failure of the skill's own rule.
- **Substring collision.** Plant the value inside a realistic longer token, such as a coordinate, hash or ID. A naive digit search hits it; the intended verdict is a collision, not proof.
- **Vendor-only.** Put the token only in a tiny vendor or minified bundle. The documented exclusion must produce `rc=1`, and removing the exclusion must produce `rc=0`.
- **Absent.** The token exists nowhere in the fixture. Its `rc=1` is meaningful only after a positive control proves the search works.
- **Formatted variants.** The document uses one form and the raw artifact another, such as `4,219` and `4219`. Searching one form alone can look like "no evidence".
- **Search root.** Make the fixture root the working directory or the explicit root the documented command expects, so scope matches the skill's instructions.
- **Size.** Four small files are enough. Cover classes, not volume.

## Failure handling

| Observation | Meaning | Action |
|---|---|---|
| Skill does not load | Registration gap | Report it; do not call the test passed |
| You replaced the documented command | You tested your own command | Record the substitution; do not claim the documented one works |
| `rc=1` with no positive control | Empty result unproven | Run the control before grading the case |
| All cases pass, no edit occurred | Edit branch untested | Report it under not exercised |
| Skill edits outside the fixture root | Safety failure | Stop and preserve the evidence |
| Wrong verdict because the case is not discriminating | Fixture defect | Fix the fixture and re-run |
| Wrong verdict with a discriminating case | Skill defect | Report it; do not rewrite the skill's rule to fit the fixture |

## Reporting block

```
target: <skill-name>
  contract_sha256: <hash at contract extraction>
  pre_sha256: <hash immediately before invoke>
  post_sha256: <hash after sweep>
  scope: current | frozen version <pre> only
  oracle: <expected post-edit sha256 from prior run> | none
  oracle_result: matched | mismatched | n/a
fixture: <path>  baseline: <path>  manifest: <path>
loaded: yes | no   via: Skill tool
cases:
  - id: <case>
    planted: <token> in <file>
    intended: <verdict or outcome>
    command: <exact command>
    observed: rc=<n>; <path:line> <context>
    result: PASS | FAIL
edit:
  changed: <files and hunks>
  rules_preserved: <rules that survived without the numbers>
sweep:
  - removed <token or phrase> in <edited file>: rc=1
  - retained <token> in <edited file>: rc=0
exercised:
  - <class or command>
not_exercised:
  - <branch> — <why>
limits:
  - <what this run does not prove>
cleanup: retained | deleted; <paths>
```

## Boundaries

- `bundled-script-verification-checklist` owns scripts and their branches. This skill covers skills with no executable scripts.
- `skill-postwrite-registration-verification` owns package integrity, links, registration and load. This skill assumes those claims and tests behavior; positive-control mechanics are shared through `shell-command-result-verification`.
- `skill-dir-concurrent-write-reconcile` owns write-conflict recovery when you are also writing the target. A read-only target that moves during the run is not a merge conflict — keep the result, label it `scope: frozen version <pre> only`, and name both hashes; reconcile only when the move invalidates the contract you graded, then re-read and re-run.
- `measurement-claim-evidence-audit` owns the evidence gate for numeric claims in shared documents. This skill does not audit measurements; it tests whether a procedure behaves on planted ground truth.
- `verify-skill-source-session` owns grading claims from a source session. This skill tests a procedure against a fixture, not a transcript.
- `session-sourced-skill-distillation` owns end-to-end creation and update orchestration. This skill is the acceptance step for an instruction-only result.
- `unbacked-measurement-trim` is the source example target. This skill does not trim documents or restate its evidence rules.
- This is not a domain-correctness, clinical, legal or release-acceptance test, and not a substitute for validation on real data.

## Origin note

Source session `32aed1bb-2bea-49b5-ba06-43f4b08152ea`, owner turn "try running /unbacked-measurement-trim to test the skill" on 25 October 2026. A four-file fixture in `/tmp/trim-smoke` planted a raw artifact (`4219`), a derivative restatement (`4219`), a substring collision (`812` inside an OCR coordinate), a vendor-only token (`1004552`), and an absent token (`998301`). The skill's documented exclusion search, its edit, and its residue sweep reproduced the intended verdicts, with every removed token at `rc=1` and the retained token at `rc=0`. The run explicitly did not exercise citation re-pointing or the concurrent-write stop.

Two gaps in that run shaped this procedure: no pre-edit copy was kept, so the owner's later request to compare with the original required a reconstruction; and the surviving fixture is not byte-identical to the run-end file (14 lines and `sha256 21fbf905…` at check time on 26 October 2026, versus the run report's 13 lines and `e4ecb31b…`). Freeze a baseline and a manifest before invoking the skill.

The creation run (session `44a27f48-ea1c-4c92-98b3-4ff66ebdd839`, 26 October 2026) self-applied the recipe to its own source target `unbacked-measurement-trim`. The target moved during the run (`SKILL.md` 987716d3 → 2b7a5270, reference da3abfef → d1528afc); the run preserved the fixture and baseline, and the rebuilt end state matched the recorded post-edit hash `e4ecb31b`. The result was labeled `scope: frozen version only` and the target's concurrent author was not merged. This shaped the ledger and oracle rules: a read-only target that moves is not a merge conflict, and a recorded post-edit hash is a fidelity oracle, not a verdict.

## Resources

- [references/fixture-recipe.md](references/fixture-recipe.md) — fixture layout, case matrix, exact command capture, worked source example, grading worksheet, baseline and cleanup checklists, target hash ledger and fidelity oracle.
