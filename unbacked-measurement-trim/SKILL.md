---
name: unbacked-measurement-trim
description: Trim a document, report or Skill package section down to the measured values the workspace can actually prove, while keeping the rules those values support. Use when a reviewer asks to keep only what is provable, when a section contains numbers from absent tools or runs, when a concurrent author added measurement claims, or when an exact-string search returns suspicious hits. Covers enumerating numeric claims, binding each to an artifact and the same page/pair/renderer/version context, rejecting substring collisions and unrelated fields, excluding vendor/minified bundles, preserving the rule and measurement conditions, rewriting dependent prose and origin notes, and re-running package/citation checks after line shifts. Not for writing a benchmark report from retained rows (synthetic-ocr-result-reporting), running or scoring a benchmark (bounded-evidence-benchmark-report), binding owner approval (owner-approval-hash-binding), or form-field value ledgers (filled-draft-fact-imputation-discipline).
---

# Unbacked measurement trim

## Overview

A document can keep a rule without keeping every number that was used to illustrate it. This skill removes measured values that the current workspace cannot prove, while preserving the rule, the measurement conditions of any surviving value, and the reader's ability to tell what was removed and why.

It is not a truth oracle: a missing artifact means "unproven here", not "false".

Package and citation checks prove package structure and citation plumbing, not claim truth; a green checker run can coexist with numbers no artifact binds. Run this trim before reporting a Skill package as complete.

## Trigger shape

- "Trim section 11 to the one row this workspace can prove."
- "These numbers have no artifact; remove them but keep the rule."
- "A concurrent session added a measurement table; only one row checks out."
- "Find the evidence for this figure, or delete it."
- A search for a number returns hits that are substrings, vendor bundles, derivative reports, or fields measuring something else.
- A package check and a citation check are green, but the section still states numbers no artifact here can bind.
- The only evidence sits in a gitignored directory, so the default search reports nothing.

## Core model

Every numeric claim gets one of three verdicts:

| Verdict | Meaning | Action |
|---|---|---|
| `PROVEN` | An independent artifact in this workspace binds the exact quantity to the same subject, page/pair, renderer/DPI, version and unit | Keep, with the binding stated |
| `UNPROVEN HERE` | No artifact was found, or the artifact cannot be tied to this claim | Remove the number and its dependent prose; keep the rule |
| `FALSE-POSITIVE HIT` | A hit exists, but it is a substring, a different field, a different subject, a derivative restatement, or a different version | Remove the number; record why the hit does not count |

The rule outlives the number. "A substitute renderer is not a re-check" survives deletion of the substitute-renderer figures. "Byte identity is not expected; raster identity is the delivery evidence" survives deletion of a pixel count that cannot be reproduced.

## Workflow

1. **Freeze the target.** Read the whole section and record the file's current hash and mtime. If another session may be writing, re-read immediately before every edit and stop on a changed hash. Do not edit a moving file; use `concurrent-skill-md-edit-recovery` if a collision is already in progress.

2. **Map every numeric claim.** List each number with its line and its role: table cell, prose, caption, row count, origin note, footnote, code block, or generated summary. For each, write the rule it supports and the exact claim it makes (quantity, unit, subject, page/pair, renderer/DPI, version). A section can have more numbers than the disputed table; enumerate them before deciding which ones matter.

3. **Define the evidence target.** Before searching, write what would count: artifact path role, field or sentence, identity keys, page/pair, renderer/DPI/version, unit, and the date or hash of the run. "A file mentions the number" is not a target. A retained report that restates the number is derivative, not independent.

4. **Search exact strings.** Use fixed-string search, not a regex that lets `.` match any character. Search the plain token and its formatted variants (commas, spaces, units, decimals) separately. Exclude vendor, minified, dependency and cache trees; do not exclude retained evidence outputs. Record the command, the root, the exclusions and the hit list. Include ignored and untracked paths (`rg --no-ignore`): evidence often lives in a gitignored `work/` tree, and a default search skips it silently. When a search returns nothing, run the same command on a token known to exist as a positive control; otherwise the empty result proves only that the search did not run as intended. Keep a must-miss token too, so a search that matches everything is visible.

5. **Grade every hit.** Check, in order: exact token or substring; same quantity or a different field; same subject/page/pair; same renderer/DPI/version; independent artifact or derivative; current or superseded. A hit that fails any binding is a false positive, not evidence. A `differingPixels` field can prove a pixel count when it is bound to the same pair, page, run and renderer/DPI; a coordinate fragment inside an OCR bounding box cannot. Example: `11795` inside `observations[78].norm[1]` = `0.5666666665117959`, where `norm` is a four-number box, not a pixel count.

6. **Keep only the provable row.** Quote the artifact's line and state the binding: pair, page, renderer, DPI, color space, threshold, and unit. Label it as one workspace-proven pair, not a general rule. If the artifact does not name the renderer or tool, do not infer one from context; write "recorded gate" or "the renderer named in the record". If you state that a tool was absent, run the availability check and record its output and exit code (for example `command -v pdftoppm || echo NO_PDFTOPPM`); that proves availability on this machine now, not what produced an existing figure.

7. **Remove and rewrite.** Delete each unproven number and every sentence that depends on it: table rows, "three tools" counts, "the same pairs produced..." claims, origin-note figures, captions, and cross-references. If a sentence still states a valid rule, rewrite it without the number. Do not substitute a new unproven number, round to a different figure, or add "approximately" without an artifact-backed range. State "no artifact found in this workspace" rather than "fabricated".

8. **Sweep the section.** Re-read the whole section after the edit. Look for dangling row counts, "the first row" references, a table header with one remaining row, prose that still says "two substitute renderers reported...", and origin notes that repeat deleted figures. Check that the surviving number's measurement conditions are still attached.

9. **Re-verify.** Re-run the package checker, the citation checker and any link check. Treat an in-range citation as unverified until its printed line matches the asserted heading or sentence: a pointer can resolve inside the file and still print the wrong line (an origin-note pointer to line 214 of `owner-approval-hash-binding/SKILL.md` that now prints `## Resources` instead of the cited sentence). Line shifts can be caused by your edit or by a concurrent writer. If a citation moved, use `skill-citation-line-shift-resync`. Re-run any documented command that the section asserts, and capture exit codes. Report a positive control for every empty search.

10. **Report.** Use the report block in `references/evidence-search-and-trim.md`. List kept numbers with artifact and binding, removed numbers with the reason (no artifact, substring, wrong field, wrong subject, derivative, superseded), rules preserved, checks run with counts, and residual uncertainty. Do not claim the removed numbers are false; claim only that this workspace cannot prove them.

## False-positive discipline

- **Substring collision.** A plain-digit search can match a decimal, coordinate, hash, ID or timestamp. Inspect the surrounding token, not just the hit. Keep the exact context in the report.
- **Wrong field.** A number in a field named for one quantity does not prove another. The field name, the unit and the surrounding object are part of the evidence.
- **Wrong subject or page.** The same count on a different pair, page, record or version is a different measurement.
- **Wrong renderer or DPI.** Pixel counts are renderer-, DPI-, color-space- and rotation-dependent. A count from a substitute renderer cannot prove the gate's count.
- **Vendor and minified bundles.** They contain arbitrary digit sequences and change independently of the document. Exclude them from evidence; do not cite them as artifacts.
- **Derivative restatement.** A report or origin note that repeats a number is downstream of the measurement. Trace to the raw output or retain the number as unproven.
- **Formatted variants.** `35,718` and `35718` are the same quantity but different strings; search both. A miss on one form is not a miss on the other.
- **Absence is not fabrication.** A search that finds nothing in this workspace says the value is unproven here; it does not say the author invented it.
- **Presence is not proof.** A hit that cannot be bound to the claim is a false positive, not evidence.
- **Tool availability.** `command -v` proves whether a tool is present on this machine at check time. It does not attribute an existing figure to, or away from, that tool.
- **In-range citation.** A line number inside the file is not a match. The printed line must be the asserted heading or sentence.

## Reporting block

```
kept:
  - value: <number> <unit>
    artifact: <role/path> <field or line>
    binding: <subject/page/pair/renderer/DPI/version>
    verdict: PROVEN
removed:
  - value: <number> <unit>
    reason: NO_ARTIFACT | SUBSTRING_HIT | WRONG_FIELD | WRONG_SUBJECT | DERIVATIVE_ONLY | SUPERSEDED
    evidence: <what the search found and why it does not count>
rules_preserved:
  - <rule without the number>
checks:
  package: <verdict, exit code>
  citations: <count, in range, printed anchors>
  searches: <command, positive control, exit code>
residual_uncertainty:
  - <what could not be verified>
```

## Boundaries

- `synthetic-ocr-result-reporting` owns writing an OCR benchmark report from retained rows and labeling measured / estimated / `UNKNOWN`. This skill edits an existing section to remove unproven numbers.
- `bounded-evidence-benchmark-report` owns running, gating and reporting a bounded benchmark. This skill does not run or score a benchmark.
- `owner-approval-hash-binding` owns approval records, hash binding and the verifier. This skill may trim prose in such a document but makes no approval verdict and changes no gate.
- `filled-draft-fact-imputation-discipline` owns per-field source / imputed / unresolved value buckets. This skill handles numeric claims in prose and tables, not form fields.
- `shell-command-result-verification` owns exit-code proof and failing controls. This skill calls it for re-checks and does not restate its mechanics.
- `skill-citation-line-shift-resync` owns re-pointing `file:line` citations after a shift. This skill triggers it after an edit and does not duplicate its heading-map repair.
- `concurrent-skill-md-edit-recovery` owns recovery when another writer changes the same file. This skill stops and delegates; it does not overwrite a moving file.
- `chunked-write-edit-payloads` keeps a large edit reviewable. This skill can use it for a multi-block rewrite.

## Origin note

The procedure comes from a source session where a concurrent author added a three-row renderer table to section 11 of another skill. The only locally provable row was `35,718 px` on page 1 and `0 px` on page 2, bound to a retained verification JSON at `4762 x 3368` (`work/local-record-1/e2e/out/batch-10-final-ink/verification.json:102` for page 1, `work/local-record-1/e2e/out/batch-10-final-ink/verification.json:112` for page 2, field `differingPixels`). `11,795` was a fragment of `observations[78].norm[1]` = `0.5666666665117959` in `work/local-record-1/e2e/ocr/probe-page-2.json` (a `box_candidate` coordinate), and also occurs in the minified vendor bundle `ui/vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js`; `1,223,098` and `1,335,841` had no artifact. The table was reduced to the one row, the origin-note figures were removed, and the package and citation checks were re-run.

Not verified in that session, and therefore stated here as rules rather than history: a complete enumeration of every numeric claim, and the exact command flags used for the searches. The renderer was not named in the record, and `command -v pdftoppm` printed nothing at writing time; no tool name is attributed to the measurement.

## Resources

- [references/evidence-search-and-trim.md](references/evidence-search-and-trim.md) — evidence-target template, exact search recipe, grading table, worked example, edit sweep and report template.
