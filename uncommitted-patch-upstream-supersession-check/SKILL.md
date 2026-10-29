---
name: uncommitted-patch-upstream-supersession-check
description: Gate before re-reporting, reconciling, or re-applying a standing uncommitted patch. Fetch origin, compute behind/ahead, diff patched files from their base commit to origin/main, grep the exact rows/IDs the patch edits, and list which deltas origin/main has already rewritten. Reduce the patch to surviving deltas before quoting any hash as finished. Include the tree-SHA pitfall (git rev-parse <ref>^{tree} is the root tree; piping git ls-tree -r into shasum yields a listing digest, not the tree SHA) and a citation line-drift re-check. Use when a patch looks authoritative locally but origin/main may have independently rewritten the same rows, when reporting READY_FOR_REVIEW or finished status for uncommitted work, after a rebase or fetch, or when cited line numbers may have shifted.
---

# Uncommitted Patch Upstream Supersession Check

## Overview

An uncommitted patch can look finished — file hashes match, the ledger says READY_FOR_REVIEW — while origin/main has independently rewritten most of the same rows. This check costs four commands and prevents reporting a superseded deliverable.

## When this fires

- About to report a patch as READY_FOR_REVIEW or finished
- Re-applying a patch after a rebase or fetch
- A patch's file hashes look authoritative but the worktree is behind origin/main
- Cited line numbers in the patch may have drifted after upstream edits
- A ledger or hash manifest says the work is done, but no upstream comparison was run

## Workflow (in order)

1. **Fetch origin.** Update remote tracking branches so the comparison is against current upstream, not a stale local cache.

   ```bash
   git fetch origin
   ```

2. **Compute behind/ahead.** Quantify how far the local branch has fallen behind origin/main. A non-zero behind count means upstream has commits the local branch lacks; any of those commits may touch the same files the patch edits.

   ```bash
   git rev-list --left-right --count HEAD...origin/main
   ```

   If behind > 0, continue. If behind = 0 and ahead > 0, the patch is the only divergence; skip to step 5.

3. **Diff patched files from base to origin/main.** For each file the patch modifies, show what origin/main has changed since the patch's base commit. This reveals whether upstream has rewritten the same regions.

   ```bash
   git diff <base-commit>..origin/main -- <patched-file>
   ```

   Replace `<base-commit>` with the commit the patch was based on (often the merge-base of HEAD and origin/main). Replace `<patched-file>` with each file the patch touches.

4. **Grep the exact rows/IDs the patch edits.** For each specific row, ID, or key the patch modifies, search both the local file and the origin/main version. This identifies which specific deltas origin/main has already rewritten.

   ```bash
   grep -n '<exact-row-or-ID>' <local-file>
   git show origin/main:<patched-file> | grep -n '<exact-row-or-ID>'
   ```

   Compare line numbers and surrounding context. If origin/main has the same row at a different line number, upstream rewrote it; the patch's delta for that row is superseded.

5. **Reduce the patch to surviving deltas.** Remove any patch hunks whose target rows origin/main has already rewritten. Keep only the deltas that origin/main has not touched. Report the reduced patch, not the original.

6. **Re-check citation line drift.** If the patch or its report cites specific line numbers (e.g., "see en.ts:1678"), verify those lines still point to the same content after upstream edits. A line cited at 1678 may have shifted to 1683 after upstream insertions. Update citations to match the current file.

   ```bash
   sed -n '1678p' <file>
   ```

   If the content at the cited line no longer matches what the patch describes, update the citation.

## Tree-SHA pitfall

`git rev-parse <ref>^{tree}` returns the root tree object SHA for that commit. This is the SHA Git uses to identify the complete snapshot.

Piping `git ls-tree -r <ref>` into `shasum` or `sha256sum` yields a digest of the listing output, not the tree SHA. The listing digest changes if the output format changes, even if the tree is identical. Use `git rev-parse <ref>^{tree}` when you need the tree object SHA; use the listing digest only when you explicitly want a hash of the recursive listing text.

## Report format

After the check, report:

- Behind/ahead counts
- Which patched files origin/main has touched
- For each patched row/ID: whether origin/main has rewritten it (SUPERSEDED) or not (SURVIVING)
- The reduced patch (surviving deltas only)
- Updated citation line numbers, if any shifted
- The file hash of the reduced patch, not the original

Do not quote the original patch hash as finished if any of its deltas are superseded.

## Hard rules

- Never report a patch as finished without running this check when behind > 0.
- Never quote the original patch hash after reducing it; quote the reduced patch hash.
- Never assume a cited line number is still correct after upstream edits; verify it.
- Never confuse a listing digest with a tree SHA.
- A patch that looks authoritative locally (hashes match, ledger unchanged) is not authoritative until upstream is checked.

## Boundaries

- `superseded-recommendation-recheck` — owns reconciling a skill recommendation against an artifact's revision chain (archive directories, version tags, retired reports). This skill owns uncommitted patches and upstream divergence, not artifact revision chains.
- `git-push-destination-preflight` — owns the pre-push gate and post-push proof. This skill runs before the patch is reported, not before a push.
- `skill-citation-line-shift-resync` — owns re-pointing a skill package's file:line citations after the skill's own edit shifts a referenced file. This skill owns citation drift in patches and reports, not in skill packages.

## Origin note

From a session where origin/main independently rewrote three of four rows in a "finished" patch (D-02, D-08, and the §13 Care→Founder row in a repository-map.md table). The file hash and ledger both said READY_FOR_REVIEW; the worktree was 0 ahead / 35 behind origin/main. The four-command check revealed only D-07 survived. The cited en.ts line had shifted 1678→1683. The tree-SHA pitfall was a concrete error in the same session: the first "tree" value was a digest of `git ls-tree -r` output piped into shasum, not the root tree from `git rev-parse <ref>^{tree}`.
