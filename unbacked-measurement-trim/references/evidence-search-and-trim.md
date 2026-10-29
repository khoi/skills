# Evidence search and trim

Detailed companion to `unbacked-measurement-trim`. Load this when you need the search recipe, the grading table, the worked example or the edit sweep.

## 1. Evidence target template

Before searching, fill one row per number:

| Field | Question | Example |
|---|---|---|
| quantity | What exactly is counted? | differing pixels |
| unit | What unit? | px |
| subject | Which pair, file or record? | approved sample vs superseded |
| page or region | Which page or region? | page 1 |
| renderer and DPI | What produced it? | recorded gate, 288 dpi |
| version or time | Which run? | retained final verification |
| artifact role | What file would prove it? | verification JSON |
| field or line | Where in that artifact? | `differingPixels` |
| independence | Is this raw evidence or a restatement? | raw gate output |

A number without all of these is not yet a claim you can prove.

## 2. Exact search recipe

Use a fixed-string search so `.` and other regex metacharacters cannot manufacture hits. Search the plain token and formatted variants separately. Exclude third-party, minified, dependency and cache trees, but keep retained evidence outputs.

```sh
# plain token, excluding vendor/minified/dependency trees
grep -rIF --exclude-dir=vendor --exclude-dir=node_modules --exclude-dir=.git -- "35718" .

# formatted variant
grep -rIF --exclude-dir=vendor --exclude-dir=node_modules --exclude-dir=.git -- "35,718" .

# include gitignored evidence; retained output often sits under an ignored work/
rg --no-ignore -F -l -- "35718" .
```

Record the command, root, exclusions and ignore mode in the report. Plain `rg` honors `.gitignore`, so it can report nothing while the artifact sits in an ignored `work/` tree; run the `--no-ignore` form, or `grep -r` with explicit exclusions, and say which you used. If the search returns nothing, run the same command on a token you know exists (the kept number, a file name, a field name) and on a token you know is absent. A search that cannot find a known token, or that "finds" a known-absent one, is not evidence of absence.

Do not exclude the retained evidence directory just because it is generated. The point is to find the raw output, not to make the search quiet.

## 3. Grading hits

| Question | Pass | Fail |
|---|---|---|
| Exact token? | standalone number | substring of a decimal, coordinate, hash, ID or timestamp |
| Same quantity? | same field or meaning | different field that happens to share digits |
| Same subject? | same file pair or record | a different pair or record |
| Same page or region? | same page index or region | another page |
| Same renderer and DPI? | recorded gate | substitute renderer or different DPI |
| Same version? | current or retained final | superseded or draft |
| Independent? | raw output | report or origin note repeating it |

A hit that fails any row is `FALSE-POSITIVE HIT`. A hit that passes every row is `PROVEN`; quote the line and the binding.

## 4. Worked example (sanitized)

A three-row renderer table claimed:

| Renderer | Approved vs superseded | Approved vs batch |
|---|---|---|
| recorded gate, 288 dpi | 35,718 px page 1, 0 px page 2 | 0 px on both pages |
| substitute A, 842 x 1191 | 0 px | 0 px |
| substitute B, 144 dpi | 11,795 px page 1, 0 px page 2 | 1,223,098 px page 1, 1,335,841 px page 2 |

The workspace search found:

- `35718` in two retained verification JSONs, field `differingPixels`, page 1, with page size `4762 x 3368` and page 2 `0` (lines 102 and 112 of the retained `verification.json`).
- `11795` only inside `observations[78].norm[1]` = `0.5666666665117959`, a `box_candidate` OCR coordinate; no standalone token, and the only plain-token match is the minified vendor bundle `ui/vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js`.
- `1223098` and `1335841` nowhere in the workspace once ignored paths are included (`rg --no-ignore`, exit 1 each).
- No artifact for the "15 streams matched" or "JPEG layers byte-identical" sentence.

Verdicts: the first row is `PROVEN` when bound to the retained pair, page and recorded gate/DPI; the substitute rows and the prose claims are `UNPROVEN HERE` or `FALSE-POSITIVE HIT`. Keep one row; remove the rest and the origin-note figures. The rule "a substitute renderer is not a re-check" survives.

## 5. Edit sweep

After deleting rows, check:

- [ ] Table header still matches the remaining rows; no "three tools" or "first row" dangling count.
- [ ] Prose that cited a removed row is rewritten, not left with a dangling "as shown above".
- [ ] Origin note, captions, footnotes and cross-references no longer repeat removed figures.
- [ ] The surviving number keeps its renderer, DPI, page, pair and unit binding.
- [ ] No new unproven number, rounded substitute, or "approximately" without a range.
- [ ] The rule the number supported is still stated, without the number.
- [ ] The section reads as a whole after the edit; no orphaned table with one cell.

## 6. Re-verification

- Package check: `node verify-skill-source-session/scripts/check_skill.mjs --check-refs <skill-dir>` from the skills root; record the verdict and exit code.
- Citation check: `node verify-skill-source-session/scripts/check_citations.mjs <skill-dir> --root <workspace> --full`; record the count, in-range count and every printed anchor. A green verdict is not enough; compare the printed line to the asserted heading.
- Anchor check: `node skill-citation-line-shift-resync/scripts/check_citation_anchors.mjs <skill-dir> --expect <anchors.txt>` when both the citing line and the target line must be asserted.
- In-range is not a match: a citation can resolve inside the file and print the wrong line. A pointer to line 214 of `owner-approval-hash-binding/SKILL.md` printed `## Resources` instead of the origin note it was cited for while the package and citation checks stayed green. Compare every printed line; if it moved, use `skill-citation-line-shift-resync`.
- Tool availability: `command -v pdftoppm || echo NO_PDFTOPPM`; record the output and exit code. Absence on this machine now is not a measurement condition of an earlier run.
- Link check: every relative Markdown link resolves.
- Documented command: run the read-only search recipe with a must-hit and a must-miss case; capture exit codes.
- Positive control: show the search finds a known token before trusting any empty result.
- Report the exact commands and counts; do not report a remembered number.

## 7. Report template

Copy the block from `SKILL.md` and fill it. Keep `removed` reasons in the fixed vocabulary: `NO_ARTIFACT`, `SUBSTRING_HIT`, `WRONG_FIELD`, `WRONG_SUBJECT`, `DERIVATIVE_ONLY`, `SUPERSEDED`. Add a one-line `residual_uncertainty` entry for anything you could not check.

## 8. What this procedure does not do

- It does not decide clinical, legal or release acceptance.
- It does not re-run a measurement with a substitute tool and call it a re-check.
- It does not edit another session's surrounding content.
- It does not claim a removed number is false; it claims this workspace cannot prove it.
- It does not replace `synthetic-ocr-result-reporting`, `bounded-evidence-benchmark-report`, `owner-approval-hash-binding` or `filled-draft-fact-imputation-discipline`.
