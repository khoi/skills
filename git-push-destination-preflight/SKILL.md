---
name: git-push-destination-preflight
description: Pre-push gate and post-push proof for git push. Use when asked to push a commit or branch; when the commit the owner named is not the branch tip; when a push failed with 403 / non-fast-forward / forced update / "Permission denied (publickey)"; when origin appeared or its URL/protocol/pushURL changed; when histories share no merge base; when push.followTags or remote.<name>.push may carry extra refs; when an account cannot push; or naming a remote branch. Covers destination/identity re-reads, named-commit vs HEAD resolution, merge-base and divergence counts, publish-set and visibility disclosure, push-URL collision checks, one explicit src:dst push, exit-code capture, and ls-remote verification with full object IDs, plus a read-only HTTPS probe when SSH auth fails. Stops with the exact blocker instead of retrying, force-pushing, adding remotes or changing credentials. Commit provenance: skill-artifact-commit-provenance; exit codes: shell-command-result-verification; key/credential lifecycle is out of scope.
---

# Git Push Destination Preflight

## Overview

A push writes to shared state, and its destination is not stable across a task.
Measure four facts immediately before pushing: destination (remote, URL,
pushURL, protocol), sender (credential path, account), history relationship,
and the exact commits that would become visible. If any is unresolved or
contradictory, stop and report the exact blocker. A successful `git commit`
says nothing about any of them, and a successful push report says nothing about
where it landed: query the push URL and compare full object IDs after it.

## Trigger shape

- "Push this commit", "push to origin", "push the branch", "publish it".
- A push failed with 403, exit 128, `non-fast-forward`, `fetch first`, or
  `Permission denied (publickey)`.
- `git remote -v` was empty earlier and a destination exists now;
  `.git/config` mtime is newer than the task start; the URL or protocol changed.
- Local and remote histories share no merge base.
- "Switch to the account that can write" while only one account is
  authenticated.
- The owner names a new remote branch, or a push has returned success and the
  remote ref must be verified rather than assumed.
- `push.followTags` is set, `remote.<name>.push` exists, or the remote has a
  pushURL that differs from its fetch URL.
- Commit provenance just passed and the owner now asks to push.
- The owner names a commit (SHA, short SHA, tag or subject) rather than a
  branch, or `HEAD` has moved past the commit they named.

## Gate 0 - resolve the destination at push time

Run these now, not from memory:

```sh
git rev-parse --abbrev-ref HEAD
git branch -vv
git remote -v
git config --show-origin --get-regexp '^(remote\..*\.(url|pushurl)|branch\..*\.(remote|merge)|push\.|url\.)'
stat -f '%Sm %N' .git/config 2>/dev/null || stat -c '%y %n' .git/config
git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
```

- An empty `git remote -v` is not proof there is no destination. Measured: empty
  with exit 0 at 06:16:34, `origin` present at 06:16:47 and fetched at 06:16:55;
  the mtime dates the write, not its author. Re-run and read `.git/config`.
- Read URL and pushURL. They can differ; a push uses the push URL. Capture it
  once and use it for every remote measurement in Gates 3 and 4:

  ```sh
  PUSH_URL="$(git remote get-url --push <remote>)"; echo "$PUSH_URL"
  ```

  Redact any `user:token@` part before it enters a report; the URL that proves a
  push is its host and path, never a credential.
- Read the protocol. HTTPS uses the git credential helper or `gh`; SSH uses
  ssh-agent and keys. Gate 1 depends on it.
- URL rewrites can replace the effective URL without changing the remote
  entry: `insteadOf` for fetches, `pushInsteadOf` for pushes. The `url\.` part
  of the query above lists both; check it before trusting `remote.<name>.url`.
- `@{u}` is the only proof of tracking; a `refs/remotes/...` ref can exist
  without it. Exit 128 `no upstream configured` is a result, not a failure.
- A remote can change between turns. Measured here: HTTPS at the failed push,
  SSH at a later measurement (config mtime 06:23:01). Never reuse an earlier
  URL or protocol.
- Capture the exact destination and branch mapping in the report; transcript
  entries lose command arguments, so quote the command you will run.

Do not add, rename, edit or delete a remote on your own. If one appeared
mid-task, report its `.git/config` mtime and say the author is unattributed;
ask whether it is the intended target.

## Gate 1 - identify the credential path without reading secrets

```sh
# HTTPS destination
gh auth status
git config --show-origin --get-all credential.helper

# SSH destination
ssh-add -l; echo "ssh_add_exit=$?"        # 0 = keys listed, 1 = no identities
ssh -o BatchMode=yes -T git@github.com; echo "ssh_t_exit=$?"   # 1 = authenticated
# several identities loaded: pin the intended key
ssh -i ~/.ssh/<key> -o IdentitiesOnly=yes -o BatchMode=yes -T git@github.com; echo "ssh_t_exit=$?"
```

- `gh auth status` reports the active account, scopes and a masked token. That
  is identity inspection, not a secret read. Its `Git operations protocol`
  line describes gh's own integration, not the repository's remote.
- Scopes are not permission. Measured: the denied account's token carried the
  `repo` scope and still received 403; a scope is an ask, not a write grant.
- Run `ssh-add -l` only for an SSH destination. Exit 1 with "The agent has no
  identities" is a result, not a command failure. A listed key proves only that
  a key is loaded - not its account, whether GitHub has it, or whether that
  account can write. Several identities make the unpinned `ssh -T` ambiguous;
  pin the intended key with `-i ~/.ssh/<key> -o IdentitiesOnly=yes`.
- `ssh -o BatchMode=yes -T git@github.com` maps an offered key to an account
  without a passphrase prompt. Success prints `Hi <account>!` and exits 1; 255
  is ssh's generic error (DNS, proxy, timeout, refused port), so only
  `Permission denied (publickey)` on stderr means no accepted key; other 255
  leaves identity `UNKNOWN`. Capture each probe's own status: exit 1 is a pass,
  so `set -e` or a pipeline misreports it.
- `gh auth status`, `gh api` and `ssh -T git@github.com` are GitHub-specific;
  on another host use its probe/API or report identity and permission `UNKNOWN`.
- Never run `gh auth token`, never query the keychain
  (`security find-internet-password` or equivalents), never print, request or
  accept a token in chat, and never change the credential helper.
- Match the check to the protocol. On HTTPS, a 403 means the credential git
  sends lacks write access. On SSH, `Permission denied (publickey)` is a key or
  agent problem, while `ERROR: Permission to <owner>/<repo> denied to <user>`
  is an authenticated key whose account lacks write access - switching gh
  accounts does not change the key's account.
- Account-switch request: enumerate the authenticated accounts; if only one
  exists, stop. `gh auth login`, `gh auth switch`, `gh auth setup-git`, creating
  an account or entering a token need the owner's explicit direction. With
  `osxkeychain`, `gh auth switch` alone may not change the credential git sends.
- Measure push permission and repo visibility before Gate 3, not by attempting
  the push and reading its 403. When `gh` is authenticated and can read the
  repo:

  ```sh
  gh api repos/<owner>/<repo> \
    --jq '{push: .permissions.push, private: .private, visibility: .visibility}'
  ```

  Resolve `<owner>/<repo>` from `PUSH_URL`, not `remote.<name>.url`, and print
  it beside the URL; a fetch-URL slug names the other repo when `pushurl` differs.

  - HTTPS: `gh api` reports the `gh` account; git sends whatever the helper
    returns (`gh auth setup-git` matches, `osxkeychain` can differ). When they
    match, `push:false` means stop. Measured 2026-10-26 06:47: `push:false`,
    `private:false`, `visibility:public` for `BaBiYeuCon`; the original push had
    no pre-push probe and failed 403, exit 128.
  - SSH: the sending identity is the key's account, which need not be the `gh`
    account. `ssh -T` maps an accepted key to an account; `gh api` reports the
    `gh` account's permissions only. If they differ, the key account's
    permission is `UNKNOWN`; it is not inherited from either side.
  - If the probe errors or the account cannot see the repo, report
    `PERMISSION_UNKNOWN` and require the owner's explicit go-ahead naming the
    repo and the account. Unknown is not authorized.
  - A probe is not the push result: permission can change before the attempt,
    so the 403 triage still applies.
- Repairing access - switching account or transport, generating or registering
  a key - is a separate owner-authorized task owned by
  `remote-push-access-preflight`. This gate observes and stops.

## Gate 2 - prove the histories are related

```sh
REMOTE=<remote>; BRANCH=<remote-branch>; UP="$REMOTE/$BRANCH"
git merge-base HEAD "$UP"; echo "merge_base_rc=$?"
git rev-list --left-right --count "$UP...HEAD"
git merge-base --is-ancestor HEAD "$UP"; echo "local_ancestor_rc=$?"
git merge-base --is-ancestor "$UP" HEAD; echo "remote_ancestor_rc=$?"
git rev-list --max-parents=0 HEAD
git rev-list --max-parents=0 "$UP"
git reflog show --date=iso "$UP"
```

- Empty merge-base with exit 1 means no common ancestor. Exit 128 with a fatal
  message means the ref is missing or unreadable - a measurement failure, not
  an unrelated-history result. Measured: left/right `15 4`, then `15 10` at
  06:47, roots `30a826a`/`91d6051`; a plain push is non-fast-forward and a
  force-push would overwrite 15 remote commits.
- A remote-tracking ref can be stale. Its reflog date is the measurement.
  `git fetch <remote> <branch>` refreshes it but mutates local remote-tracking
  refs, so classify the fetch and run it only against a confirmed remote.
- Both ancestor checks exiting 1 with an empty merge base is unrelated history;
  an exit 0 means fast-forward is possible that way - report which. A merge
  base with both checks exiting 1 is divergence; both forbid a plain and a force
  push. An empty result needs the control `git merge-base HEAD HEAD`.
- No merge base blocks a plain and a force push to that existing remote
  branch; never substitute `--force`, `--force-with-lease`, ref deletion or a
  branch rename. A new branch is a different destination, not a workaround: it
  needs the owner's explicit confirmation and the Gate 3 collision check.

## Gate 2a - disclose every commit the push would publish

```sh
REMOTE=<remote>; BRANCH=<remote-branch>; UP="$REMOTE/$BRANCH"
git log --format='%h %an <%ae> %s' "$UP"..HEAD
git log --format='%h %an <%ae> %s' HEAD --not --remotes   # if "$UP" does not exist
git status --short
```

- A push publishes commits, not a task. List every commit that would become
  reachable on the remote, with author and subject. If the remote branch does
  not exist or has no merge base, use the `HEAD --not --remotes` form, state
  that the tracking refs may be stale, and name the base you compared against.
- If the owner named a commit, resolve it with Gate 2b and use that commit here.
- Keep the explicit `HEAD`. Measured 2026-10-26: `git log --not --remotes`
  alone returned empty with exit 0 while `git log HEAD --not --remotes` listed
  10 commits at 06:47 and 11 at 06:48, when another writer committed
  `9d47ba4`. An empty publish set is a claim, so re-run the form that has a
  positive revision.
- Stop and ask the owner if any commit is outside the commit set they approved.
  Measured at the push request: the four local-only commits were `91d6051`,
  `0e0465d`, `136f723` and the task commit `663b2d6`; the first three predate
  the task and their attribution was not measured. Disclose them; do not assume
  they are yours.
- `git status --short` is not the publish set; it shows uncommitted work that
  will **not** be pushed. Report both.
- State the destination's visibility with the publish set. `private:false`
  makes the whole set readable by anyone at once, including commits from other
  sessions; a private repo limits it to its readers. If visibility is unknown,
  say so - "reachable" and "public" are different blast radii.
- If the owner approved a commit set, a later commit on the same branch is a
  new publish set and needs a new confirmation.

## Gate 2b - resolve the commit the owner named against HEAD

An owner can name a commit instead of a branch; resolve it before Gate 2a's
set, because the source ref decides what is published.

```sh
TARGET=<owner-named-commit>
TARGET_SHA="$(git rev-parse --verify "$TARGET^{commit}")"; echo "target_rc=$?"
git merge-base --is-ancestor "$TARGET_SHA" HEAD; echo "target_ancestor_rc=$?"
git rev-parse HEAD; git rev-list --count "$TARGET_SHA"; git rev-list --count HEAD
```

- Report `TARGET_COMMIT` and `HEAD_AT_PUSH` as full SHAs with subjects. A tag
  resolves to its commit, not the tag object. `target_rc` 128, or more than one
  `git log --all --oneline --fixed-strings --grep=<subject>` match, is
  ambiguous: stop and ask which commit.
- Equal SHAs: Gate 2a's set stands. Ancestor exit 0 with a different SHA: the
  target is already in `HEAD`'s history, so pushing the branch publishes it plus
  every later commit. Push `"$TARGET_SHA:refs/heads/<branch>"` only after the
  owner confirms that commit, and still disclose those later commits, with Gate
  2a recomputed against `$TARGET_SHA`. A new branch is not isolation: it
  publishes the target's whole ancestry.
- Exit 1: the target is not in `HEAD`'s history; its own ancestry is the publish
  set, and Gate 2 still decides whether any destination can take it. Exit 128 is
  a measurement failure, not "unrelated". Resolving a target never bypasses
  Gate 2's stop.
- Measured 2026-10-26: the named `b34da4e` carries 17 commits, its child
  `1e27035` (`HEAD`) 18; `target_ancestor_rc=0` and no push was attempted.

## Gate 3 - push once, on the named destination

- Push only after Gates 0-2b and the permission check are green and the owner
  named the remote and branch, or confirmed the resolved ones. The owner's
  instruction authorizes one push of that ref; it does not authorize a retry or
  a different ref.
- Before pushing a new branch, prove the name is free:

  ```sh
  PUSH_URL="$(git remote get-url --push <remote>)"; BRANCH=<base-branch>
  git ls-remote --heads "$PUSH_URL" "<new-branch>"
  git ls-remote --heads "$PUSH_URL" "$BRANCH"   # positive control
  ```

  Empty for the candidate and a ref for the control means the check
  discriminates. If the candidate already exists, stop and ask; never
  overwrite it. If the control is also empty, the remote has no refs or no such
  base branch and the check proves nothing: use a base ref that exists, or
  report the collision check as unmeasurable before pushing. Ask the push URL,
  not `ls-remote <remote>`: the latter reads the fetch URL, so a name held in
  the other repository can come back free.
- Bound the ref set before sending. An explicit single refspec is necessary but
  not sufficient:

  ```sh
  git config --get push.followTags
  git config --get-all remote.<remote>.push
  ```

  Measured (git 2.55.0, throwaway repos): with `push.followTags=true`,
  `git push origin main:refs/heads/main` also carried an annotated tag
  (`* [new tag] vA -> vA`), and `--no-follow-tags` kept the next tag local.
  `remote.<remote>.push` refspecs are another source of extra refs. Report every
  ref the push carried, not only the one you asked for.
- Use the explicit mapping, for example
  `git push --porcelain --no-follow-tags <remote> <src>:refs/heads/<branch>`.
  No `--force`, no `--force-with-lease`, no tags or other refs unless asked,
  and no `-u` unless the tracking decision was made. `push.autosetupremote`
  can set an upstream without `-u`; check it and report any tracking change.
- Rehearse with `--dry-run`: measured, it left the remote SHA unchanged and
  still printed the extra refs the real push would carry; it is not proof.
- Snapshot the remote heads and the local cache before and after:

  ```sh
  PUSH_URL="$(git remote get-url --push <remote>)"
  git ls-remote --heads "$PUSH_URL"
  git for-each-ref refs/remotes/<remote>
  ```

  The first is authoritative; the second is a local cache and can be stale.
- Record the command, stderr, exit code and both snapshots. Capture the exit
  code outside any pipeline (`git push … >push.out 2>push.err; rc=$?`):
  measured, `git push | tail` printed `push_exit=0` from `tail` while the same
  rejected push exited 1 when captured without the pipe. One attempt only; a
  failure goes to triage, not a retry loop.

## Gate 4 - verify the remote ref, not the tracking cache

After the single push attempt:

```sh
PUSH_URL="$(git remote get-url --push <remote>)"; DEST=<remote-branch>
SRC=<source-ref>; BASE=<base-branch>
git ls-remote --heads "$PUSH_URL" "$DEST"
git rev-parse "$SRC"
git ls-remote --heads "$PUSH_URL" "$BASE"
```

- Query the **push URL**, not `git ls-remote <remote>`. The latter reads the
  fetch URL; when `pushurl` differs it answers about the other repository.
  Measured: pushurl `B.git` received the commit, fetch URL `A.git` stayed
  empty, and `git ls-remote origin` printed nothing with exit 0.
- The pushed ref must exist on the remote and its SHA must equal the local
  source SHA. The base branch must still equal the pre-push SHA - unless the
  push targets the base branch itself, where its SHA is expected to become the
  pushed SHA. Any other change to the base means something else wrote to the
  remote and needs explanation before the push is reported.
- Compare full 40-character object IDs. The pushed commit must equal the commit
  proven by `skill-artifact-commit-provenance`; an abbreviated match is
  ambiguous.
- Read the `--porcelain` lines for every ref. A forced update (`+` or `forced
  update`) replaced remote history; report it as such and never as a proven push
  of the commit you validated. `Everything up-to-date` means the remote already
  held that SHA: not a failed push, and still not a substitute for the
  `ls-remote` reading.
- `refs/remotes/<remote>/<branch>` is a local cache. A failed push can leave it
  stale; a successful push may update it, but the remote query is authoritative.
  Report `REMOTE_REF` from `ls-remote`, not `for-each-ref`. Measured: a second
  `pushurl` moved local `origin/main` while the fetch URL had no such branch.
- If SSH auth blocks `ls-remote`, query the public HTTPS URL directly for a
  read-only check:

  ```sh
  git ls-remote --heads https://github.com/<owner>/<repo>.git "$DEST"
  ```

  Do not change `origin`, the credential helper or the protocol just to verify.
  If the repo is private or the query fails, report `UNVERIFIED` instead of
  `PUSHED`. Derive `<owner>/<repo>` from `PUSH_URL` and use this form only for a
  github.com push URL; another host reports `UNVERIFIED`. A differing URL
  verifies only the fetch URL.
- Positive control: query the known base branch and require a ref. An empty
  candidate result proves nothing until the same command returns the control.
- A successful push proves transfer only - not CI, review, correctness or acceptance.

## Failure triage

| Symptom | Meaning | Action |
| --- | --- | --- |
| HTTPS `403` / `Permission ... denied to <account>` | The credential git sent lacks write access to this repo | Stop. Report URL, account, stderr, exit code. Offer a new branch on a writable remote, an owner-granted access change, or leaving the commit local. |
| SSH `ERROR: Permission to <owner>/<repo> denied to <user>` | The key authenticated as `<user>`, who lacks write access | Stop. Report the user, URL, stderr, exit code. Do not switch gh accounts; the key's account is the identity. Offer a new branch on a writable remote, a granted access change, or leaving the commit local. |
| `non-fast-forward`, `fetch first`, no merge base | Histories are unrelated or diverged | Stop. Show merge-base, left/right counts and roots. Never force. |
| `Permission denied (publickey)` | SSH key or agent problem, named by this stderr rather than by 255 alone | Stop. Report `ssh-add -l` and the key state. Do not switch gh accounts, edit config or add keys. A public remote can still be read over its HTTPS URL for ref verification; that is a read-only probe, not an auth workaround. |
| `repository not found`, `404` | Wrong URL, or no access to a private repo | Re-resolve the URL. Stop. |
| `push` returned success but the remote ref is missing or has a different SHA | The transfer report is not a ref measurement | Stop. Re-measure with `ls-remote`; report `PUSHED_UNVERIFIED`, not `PUSHED`. |
| `[new tag]` or an unrequested ref in the output | `push.followTags` or `remote.<name>.push` added refs | Stop. Report every ref carried; remove nothing without owner direction. |
| `ls-remote <remote>` empty with exit 0, or local `origin/<branch>` moved while the fetch URL lacks it | You measured the fetch URL; the push may go to another repository | Re-read `git remote get-url --push <remote>` and query that URL. |
| `No configured push destination`, no upstream | The remote or tracking is unset | Stop. Ask the owner for the destination. Do not add a remote silently. |

After a failed attempt, report whether refs changed as `measured` (from the
remote-head `ls-remote` snapshots) or `inferred` (from the rejection message). A
rejection text alone is not a ref measurement; the local tracking cache is not
the remote ref.

Credential changes are outside this gate; `remote-push-access-preflight` owns
that lifecycle. If the owner authorizes generating or adding a key, treat it as
a separate task: dedicated key, public half only, never print the private key,
and confirm the account has write access. A key that authenticates proves
identity, not permission; `gh ssh-key list` needs `admin:public_key`, which the
measured token lacked. Report it only from its own measurement (`ssh -T`, the
key listed on the account), never from having been asked. Passphrase policy is
an owner decision, not a default.

## Options to offer after a stop

1. **New branch on a writable remote** - preserves the exact commit hash,
   publishes that commit's whole ancestry, and leaves the remote default branch
   untouched.
2. **Reconcile histories** - merge or rebase, then push; the commit hash changes
   and the previously proven commit no longer exists.
3. **Leave the commit local** - report its hash, branch and worktree path.

For an account request, name the account needed, the protocol, and that login or
`setup-git` is an owner-executed credential/config change. Do not create
accounts or enter tokens.

## Report template

```text
REPO: <top-level> | BRANCH: <local> -> <remote>/<branch>
DESTINATION: <remote> <url> (pushurl <url>) | protocol <https|ssh> | config mtime <time>
UPSTREAM: <remote>/<branch> from @{u} | none (exit 128)
IDENTITY_PATH: https (helper <...>, gh <account>) | ssh (agent <n identities>)
IDENTITY: <sending account|unknown> | key account <name|unknown>
PERMISSION: <push true|false|unknown> for <account> | VISIBILITY: <public|private|unknown>
HISTORY: merge-base <sha|none> (exit <n>) | left/right <remote>/<local> | roots <sha>/<sha>
TARGET_COMMIT: <full sha and subject | none named> | HEAD_AT_PUSH: <full sha> | target ancestor of HEAD: <yes|no|unknown>
PUBLISH_SET: <n commits; authors; non-task commits disclosed>
PUSH_URL: <url> | same as fetch URL
COMMAND: <exact push command, or not-attempted>
PUSH: not-attempted | attempted once (exit <n>, captured outside a pipeline) | <stderr summary>
REFS_BEFORE: <remote heads at push URL, before>
REFS_CARRIED: <refs from --porcelain> | not-measured
REFS_AFTER: <remote heads at push URL, after>
REFS_UPDATED: measured (<before> -> <after>) | inferred none (<evidence>) | not-measured
REMOTE_REF: <full sha at push URL|unverified> | BASE_REF: <unchanged|changed|unverified>
PROOF: <remote sha> = <validated commit sha> | differs | forced | not-measured
VERDICT: BLOCKED (<reason>) | PUSHED_AND_VERIFIED (<sha>) | PUSHED_UNVERIFIED (<reason>) | LEFT_LOCAL
```

## Measured cases

[references/measured-push-cases.md](references/measured-push-cases.md) holds
both runs with commands and readings: `663b2d6` (403, no merge base `15 4` ->
`15 10`, roots `30a826a`/`91d6051`, exit-code traps) and `b34da4e` (named
commit behind `HEAD`, 17 vs 18). Both ended blocked; neither proves a push.

## Hard rules

- Resolve destination, protocol, identity, history and publish set immediately
  before pushing; never from an earlier turn or a summary.
- Empty `git remote -v` is not proof of no destination; inspect `.git/config`,
  its mtime and the reflog.
- Never read tokens, keychain entries or private keys. `gh auth status`, the
  credential-helper config, `ssh-add -l` and `ssh -o BatchMode=yes -T
  git@github.com` are the identity probes; `ssh -T` contacts GitHub and may add
  a host key to `known_hosts`. `gh api ... .permissions` is a permission probe.
- Match the credential check to the resolved protocol.
- Token scopes are not repository write permission; only the `permissions`
  probe or the push result speaks to write access.
- Measure push permission and visibility before the attempt. `push:false` for
  the sending account, or `PERMISSION_UNKNOWN` without the owner naming the
  account, stops the push.
- No merge base blocks a push to that existing remote branch; never force,
  delete or rename a remote ref without explicit owner direction naming that
  ref. A new branch is a new destination requiring owner confirmation.
- One push attempt. A failure produces a report, not a retry.
- List the publish set and every author before pushing. Stop if any commit is
  not part of the approved task.
- Resolve the commit the owner named to a full SHA and compare it with `HEAD`
  before computing the publish set; a commit is not a branch tip.
- A push publishes the source ref's whole ancestry: a branch or commit at `C`
  carries every ancestor of `C`, never `C` alone.
- Check a new branch name is free before pushing; never overwrite an existing
  remote ref.
- An explicit refspec is not a ref-set guarantee; read `push.followTags` and
  `remote.<name>.push`, and report every ref the push carried.
- `push.autosetupremote` or `-u` changes tracking; report any upstream change.
- Verify the pushed ref at the push URL with `ls-remote`, comparing full object
  IDs; `refs/remotes/...` is a cache, not proof.
- Capture the push's and each probe's own exit code outside any pipeline;
  `ssh-add -l` and `ssh -T` exit 1 are valid results; a bare `ssh` 255 is a
  probe failure, not "no key", unless stderr says `Permission denied
  (publickey)`. A forced update is not a proven push of the commit you validated.
- Never generate or install credentials or keys from this gate; that is a
  separate explicit owner task.
- Never add or edit remotes, change credentials or git config, or alter refs on
  your own initiative.
- "No refs updated" is measured from remote heads, or it is labeled inferred.
- A successful push proves transfer only - not correctness, CI, review,
  accuracy or acceptance.

## Boundaries

- Commit byte provenance (H0-H3, staged set, package completeness) belongs to
  `skill-artifact-commit-provenance`; its hard rules explicitly exclude push.
  Run it before this gate; this skill does not re-prove commits.
- Exit-code harness correctness and `set -e`/`pipefail` behavior belong to
  `shell-command-result-verification`.
- Concurrent writes inside a skill directory belong to
  `skill-dir-concurrent-write-reconcile`; edit-conflict merging belongs to
  `concurrent-skill-md-edit-recovery`.
- Source-session evidence grading belongs to `verify-skill-source-session`.
- Credential and SSH-key lifecycle (generating, adding, rotating, passphrase
  policy) is owned by `remote-push-access-preflight`; this gate observes
  identity state and stops. Its `ACCESS_PROVEN` is a precondition, never an
  authorization to push.
- This skill never authorizes a push by itself. The owner's instruction
  authorizes one named ref, one destination.

## Related skills

- `remote-push-access-preflight` - diagnoses and repairs push access; stops
  before this gate and never pushes.
- `skill-artifact-commit-provenance` - proves the committed bytes; excludes
  push.
- `shell-command-result-verification` - captures exit codes per branch,
  including non-zero results that are valid outcomes.
- `user-skill-overlap-audit` - checks for a duplicate before creating or
  expanding a skill.
- `skill-postwrite-registration-verification` - proves a written skill loads.

## Resources

- [references/measured-push-cases.md](references/measured-push-cases.md) - the
  measured runs, commands and exit codes.
- No bundled scripts: the gate is read-only `git`/`gh` measurements plus a stop
  decision; a push helper would add a write-capable surface this skill prevents.
