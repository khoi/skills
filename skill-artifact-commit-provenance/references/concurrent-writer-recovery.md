# Concurrent-Writer Recovery

## When this fires

The drift gate normally runs before staging. This is the case it does not
cover: the re-measure happens after `git add`, and `H1 != H0` while `H2 == H0`.
The index then holds the bytes you validated; the worktree holds someone else's
newer ones, and another session is rewriting the file you are about to commit.

Everything below is read-only except the single `git restore --staged`.

## 1. Clear your stale index entry first

```
git -C <root> restore --staged -- <rel>
```

Path-scoped, so nothing else leaves the index. Do this before waiting, reading
or validating. A stale staged blob is not a harmless leftover: if any other
writer commits while it sits there, that commit records your old bytes and
reverts the concurrent writer's work.

## 2. Wait for a sustained quiet window

Do not validate bytes while a writer is active, and never accept three quick
identical reads as stability. Measured: three identical reads over 15 s at 335
lines were followed by 337, 350 and 388 lines, and a 49 s quiet window at 350
lines was followed by more writes. Both "settled" verdicts were wrong.

Read the digest and the line count together and require both to hold across a
window longer than the largest gap already observed in the run:

```
for i in 1 2 3; do shasum -a 256 <artifact-path>; wc -l <artifact-path>; sleep 30; done
```

A digest that changes every 10-30 s is a sustained rewrite, not a tail-off: keep
waiting. In the measured case the writes stopped at 06:34:50 after roughly two
minutes of continuous activity. Re-measure after the wait, then start reading.

## 3. Separate your bytes from theirs

You staged before the rewrite, so the blob you validated is still in the object
store. The diff header names it:

```
git -C <root> diff --cached -- <rel>        # header reads: index <old>..<new>
git -C <root> cat-file -p <old> > /tmp/validated.md
diff -u /tmp/validated.md <artifact-path>
```

Hunks present only in the worktree are the concurrent writer's content: name
them in the commit message instead of presenting them as yours. If the object
store no longer holds `<old>` (a `git gc` after the entry left the index), you
can no longer separate the two, and the message must not claim authorship either
way.

## 4. Trust the inspector only after checking it

The script that prints H0-H3 lives in the same repository and can be modified by
the same writer:

```
git -C <root> status --porcelain -- <inspector-path>
```

Non-empty output means the inspector on disk is not the committed one, and its
verdict is a measurement by an unknown revision. Cross-check H0-H3 against raw
`shasum` readings before quoting any of it.

## 5. Report HEAD movement

Read `git -C <root> rev-parse --short HEAD` before staging and again after the
commit. Movement means another writer committed during your task: report both
values and state that your commit landed on top of theirs. It does not break the
chain proof, but an unreported one hides whose history you joined.

## Measured case (2026-10-26)

Committing `git-push-destination-preflight/SKILL.md` in the skills repo:

- H0 recorded at validation: `134e6c97…29221` (232 lines), then staged.
- After staging, H1 read `5f8abfcd…` while H2 still held `134e6c97…`: the file
  had been rewritten under the stage. The entry was cleared with
  `git restore --staged` for that path only.
- Rewrite observed: `134e6c97` → `5f8abfcd` → `a6258d17` in under a minute;
  `ddb5b79b` at 335 lines; then 337, 350, 388.
- The index blob `49128c1` held exactly the validated content: 12368 bytes, 232
  lines, `git cat-file -p 49128c1 | shasum -a 256` = `134e6c97…29221`.
  Re-verified 2026-10-26.
- New H0 `c8d722bc…1118` (388 lines) recorded after a passing re-validation and
  committed as `039a5de`; `git show 039a5de:… | shasum -a 256` reproduces it.
  Re-verified 2026-10-26.
- HEAD moved `663b2d6` → `65fed42` (three commits by another writer) during the
  task.
- The inspector was itself worktree-modified by the other session (an additive
  `--expect-path` flag); its H0-H3 output was cross-checked against manual
  `shasum` readings, which agreed.
- Only the staged path was committed: no push, no config change, no amend, no
  reset.