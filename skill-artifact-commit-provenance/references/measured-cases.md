# Measured Cases

Every figure below is a measurement from that run. Counts drift; re-measure
them on every run.

## Measured case (2026-10-25, re-measured 2026-10-26)

Artifact: `~/.qoder/skills/session-sourced-skill-distillation/SKILL.md`.

- No repo enclosed the skills directory (`git rev-parse` exited 128), the open
  workspace repo forbade commits, and the agent stopped instead of running
  `git init`; the owner then chose to initialise one. Identity resolved (BBYC);
  no config changed.
- The pre-commit re-hash expected `b98dbba…` but found `2136534…` (191 → 212
  lines). The agent re-read the whole file, confirmed its two edits survived,
  and ran the newly referenced citation checker (`VERDICT: OK`,
  `citations: 0`) before committing.
- Commit `91d6051`: 1 file, 212 insertions, worktree digest equal to
  `git show HEAD:…`; 34 sibling directories stayed untracked, and the referenced
  `session-sourced-skill-distillation/scripts/check_skill_overlap.mjs` remains
  untracked — the commit is proven while the package is partial.
- The drift-time re-validation is the cautionary part: duplicate-heading and
  citation checks were visible, but a full package check after the 212-line
  edit was not. Re-run everything.
- These counts drift. Re-measure them on every run.

### Reproduced 2026-10-26: pathspec base and set checks

- From inside `shell-command-result-verification/`, `git status --porcelain`
  with that directory as the pathspec printed nothing, exit 0 — identical to an
  invented pathspec. From the repo root, `status -uall` named its three files;
  without `-uall` only `?? <dir>/`.
- `--require-complete` with no `--ref` printed `PACKAGE: not-checked`, exit 0,
  for an already-committed file: it constrains H2/H3 only.
- This package is `SKILL.md` plus `scripts/commit-provenance.mjs`; it reads
  `complete` only when that repo-relative `--ref` is passed.
- Commit `65fed42` staged exactly those two files. The pre-commit inspector, run
  artifact-only, printed `STAGED_SET_NOT_EXACT (extra:
  scripts/commit-provenance.mjs)` and exited 1, although the set was exactly
  the intended paths and each H2 equalled its own H0. The set was checked
  independently NUL-split; `--expect-path` exists so that run reports the set
  instead of a false failure.
- `unbacked-measurement-trim/` (`SKILL.md` plus one reference) was committed as
  `b34da4e` after a 0-path preflight; the post-staging per-file runs (own
  `--expect` and `--ref`/`--refs-none`, other file as `--expect-path`,
  `--require-complete`) printed `STAGED_OK: yes`, `h2=h3 head-absent` and
  `CHAIN_INCOMPLETE (head absent)`, exit 4; post-commit `MATCH`, exit 0.

### Reproduced 2026-10-26: one commit for a three-file package

`~/.qoder/skills/owner-approval-hash-binding/` was committed as one package:
`SKILL.md` plus
`owner-approval-hash-binding/references/approval-record-and-delivery.md` and
`owner-approval-hash-binding/scripts/check_owner_approval.mjs`.

- Three independent H0s were recorded after the package's validation run:
  `bbffe25d…` (`SKILL.md`), `1c910c67…` (reference), `a711674a…` (script). No
  single digest stood for the package.
- Before staging, the inspector printed `MEASURED_ONLY` — a measurement, not a
  proof, because no `--expect` had been supplied yet.
- One commit carried exactly those three paths, checked NUL-split. The run
  predates `--expect-path`, so the set was proven independently of the
  inspector rather than by it.
- After the commit, three inspector runs — one per file, each with its own
  `--expect` — printed `MATCH (h0=h1=h2=h3)`. `SKILL.md` passed both of its
  `--ref` resources and read `PACKAGE: complete`; the reference and the script
  passed `--refs-none` and read `complete (0 referenced resources)`. One run
  could not have covered the package.
- `--require-complete` was passed on those runs but leaves no output trace once
  H2 and H3 exist: it is a gate on missing stages, not a report line. Do not
  cite it as evidence of anything the output does not show.
- The repo's recursive counts moved `TRACKED_FILES` 4 → 7 and
  `UNTRACKED_FILES` 120 → 117 across the commit.
- Re-measured 2026-10-26: all three worktree files still hash to those H0
  values, and `git diff b81a6a3..HEAD -- owner-approval-hash-binding` is empty.
  HEAD moved twice during the check (`c7c5db6` → `9d47ba4`); the commit proof
  survives later commits, the counts and HEAD do not.
