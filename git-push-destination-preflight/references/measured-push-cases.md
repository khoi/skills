# Measured push cases

Full detail behind the inline `Measured:` notes in `SKILL.md`. Values are bound
to their measurement time and repository snapshot; re-measure every run.

## Case 1 - 2026-10-25/26: destination and identity changed under the task

Repository `~/.qoder/skills`.

- Commit `663b2d6` was proven locally (H0=H1=H2=H3) before the push request.
- The push turn began 06:16:34; its first `git remote -v` was empty (exit 0).
  `origin` appeared with `.git/config` mtime 06:16:47 and was fetched at
  06:16:55; the commit was created 06:16:11. The mtime dates the write, not the
  author.
- The push to `https://github.com/khoi/skills.git` was denied
  `Permission ... denied to BaBiYeuCon`, 403, exit 128. No `ls-remote` snapshot
  preceded the attempt, so "no refs updated" is inferred from the rejection,
  not measured. Later read-only HTTPS queries returned `main 8a6423f`, no
  `local-skills-2026-10-26` branch, and the `main` control returned a ref.
- Histories: left/right `15 4` at the push request, `15 10` at 06:47; no merge
  base; roots `30a826a` (remote) / `91d6051` (local).
- The "switch account" request at 06:21:18: only `BaBiYeuCon` was
  authenticated, helper `osxkeychain`, no SSH identities at that turn, no
  second account. No credential or config change was made by this gate.
- Re-measured 2026-10-26 06:47: `origin` and its push URL are
  `git@github.com:khoi/skills.git` (SSH), config mtime 06:23:01, no upstream
  (`@{u}` exit 128), no URL rewrite, `push.followTags` unset,
  `remote.origin.push` unset. `gh auth status` still names `BaBiYeuCon`
  (HTTPS preference) with the `repo` scope; `gh api` returns `push:false`,
  `private:false`, `visibility:public`. One ED25519 key
  `qoder-skills-2026-10-26` is loaded, so the unpinned probe was unambiguous;
  `ssh -o BatchMode=yes -T git@github.com` prints `Permission denied
  (publickey)` and exits 255. Fetch and push URL matched, so the slug/host
  rules were preventive, not measured.
- Local `main` moved from `663b2d6` (06:16:11) through `65fed42` (06:29:52),
  `c7c5db6` (06:43:42) and `9d47ba4` (06:46:59) to `a839af7` (06:49:15); the
  remote head stayed `8a6423f`. The writers after the task were not measured;
  the destination changed after the push turn. Re-measure everything on every
  run.
- `git log --not --remotes` returned empty with exit 0 while
  `git log HEAD --not --remotes` listed 10 commits at 06:47, 11 at 06:48 and
  12 at 06:50 - the positive-revision form is required.
- Exit-code trap measured in the same session: the first SSH `ls-remote`
  printed `ls_remote_exit=0` beside a fatal error; re-running the command alone
  returned 128. Capture the command's own status, not a pipeline's.
- Post-push and ref-set proof measured 2026-10-26 in throwaway repos (git
  2.55.0), never against `khoi/skills`: `push.followTags=true` added
  `* [new tag] vA -> vA` to an explicit single-refspec push, and
  `--no-follow-tags` kept the next tag local; with `pushurl` = `B.git` and
  fetch URL `A.git`, the push landed in B, local `origin/main` updated to the
  pushed SHA, `git ls-remote origin` returned empty with exit 0, and A had no
  such branch; `--dry-run` left the remote SHA unchanged; `git push | tail`
  printed `push_exit=0` while the same rejected push exited 1 without the pipe.

## Case 2 - 2026-10-26: the owner named a commit, not the branch tip

Repository `~/.qoder/skills`. Source session
`c13953d8-947a-4ff5-8ca1-7f9d0db211d5`, the push turn after the owner's
message "push the commit".

- The named commit was `b34da4e46d80ae022deff86fed60992d9fe98e0a`
  ("Add unbacked-measurement-trim skill package"), created 06:55:56 +0700 and
  proven by the commit gate before the push request.
- At the push turn, `main` was `1e27035` ("scanned-slot-baseline-nudge: add
  path-root check before measuring", 06:57:00), the child of `b34da4e`.
  `git rev-parse 1e27035^` returns `b34da4e`.
- `git merge-base --is-ancestor b34da4e HEAD` exited 0.
  `git rev-list --count b34da4e` is 17 and `git rev-list --count 1e27035` is
  18, so a branch at `b34da4e` would publish 17 commits (16 ancestors plus the
  commit itself) - not one, and not all 18.
- The remote branch was read over public HTTPS because SSH failed:
  `main 8a6423f5b850d2dd8f8e8531578931af7e5bc8cf`. SSH `ls-remote` exited 128
  with `Permission denied (publickey)`.
- History: merge-base exit 1, left/right `15 18`, both ancestor checks exit 1,
  roots `91d6051` (local) / `30a826a` (remote). A plain push to `main` is
  non-fast-forward and a force push would overwrite 15 remote commits.
- Identity: `gh` account `BaBiYeuCon`, `osxkeychain` helper, `push:false`,
  `private:false`, `visibility:public`; one ED25519 key loaded, `ssh -T`
  exit 255 with `Permission denied (publickey)`.
- The publish set `8a6423f..HEAD` listed 18 commits, all authored by BBYC. The
  44 `git status --short` entries were uncommitted and outside the set.
- No push was attempted in the recorded turn. There was no post-attempt
  `ls-remote`, so "no refs changed" is inferred from not-attempted, not
  measured.
- The repository moved after the turn: `45c3044` at 06:58:06 and `9139db6` at
  07:02:21. The values above belong to the push turn, not to current `HEAD`.
