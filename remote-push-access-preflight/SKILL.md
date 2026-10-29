---
name: remote-push-access-preflight
description: Diagnose and repair GitHub push access before the push gate. Use when a push was rejected with 403 / "Permission to <owner>/<repo> denied to <account>" or "Permission denied (publickey)", when ssh -T prints no "Hi <account>!" or names the wrong account, when gh api reports permissions.push false, when gh ssh-key list returns 404 admin:public_key, when the owner asks to switch accounts or transport, or when a key must be generated, registered or verified. Covers blocker classification, transport read from git config not gh auth status, read-only identity and permission probes, candidate-transport testing before origin is rewritten, owner-authorized dedicated-key generation and registration, and an end-to-end access proof before any push. Never pushes, never reads tokens or private keys; changes remotes or credentials only under a separate explicit owner instruction. Push gate: git-push-destination-preflight; commit bytes: skill-artifact-commit-provenance; exit codes: shell-command-result-verification.
---

# Remote Push Access Preflight

## Overview

A push can fail before any history question matters: the sending account, key
or transport is not authorized. This skill classifies that blocker, gathers
read-only proof, and applies only the credential or transport change the owner
explicitly authorized, each one verified by its own measurement. It stops at
proven access and hands back to `git-push-destination-preflight`. It never
pushes, and it never converts "the owner asked me to set this up" into "it
works".

## Trigger shape

- Push rejected `403`, `Permission to <owner>/<repo>.git denied to <account>`.
- `Permission denied (publickey)`, exit 255, or `ssh-add -l` empty.
- `ssh -T git@github.com` prints no `Hi <account>!`, or names an unexpected
  account.
- `gh api repos/<owner>/<repo>` reports `permissions.push: false`.
- `gh ssh-key list` returns 404 `admin:public_key`.
- `repository not found` / 404 for a repo the owner says exists.
- Owner says "switch account", "use ssh instead of https", "add the key", or
  "make the push work".
- A transport or key change was made earlier and has not been proven since.

## Step 0 - classify the blocker before changing anything

| Symptom | Blocker class | Repair family |
| --- | --- | --- |
| 403 over HTTPS, an account is authenticated | Account lacks write on this repo | Access grant or a different account |
| 403 over HTTPS, no credential offered | No credential in the transport | Credential setup |
| `Permission denied (publickey)` | SSH transport has no accepted key | Key generation or registration |
| 404 / `repository not found` | URL wrong, or no read access | Resolve URL and access first |
| `non-fast-forward`, no merge base | Not an access blocker | Hand to `git-push-destination-preflight` |
| `ssh -T` names a different account than intended | Key registered on the wrong account | Key registration on the intended account |

- One blocker at a time. Fixing a key does not fix a missing write grant, and
  fixing a grant does not fix a missing key.
- Record the before state of every fact you will later claim changed: remote
  URL and protocol, identity, permission, and the key list if it is readable.

## Step 1 - read the transport from the repository, not from gh

```sh
git remote -v
git remote get-url --push origin
git config --show-origin --get-regexp '^(remote\..*\.(url|pushurl)|credential\.|url\.)'
stat -f '%Sm %N' .git/config 2>/dev/null || stat -c '%y %n' .git/config
```

- `gh auth status` reports `Git operations protocol: https` because gh wires a
  credential helper for HTTPS. That line describes gh's integration, not the
  repository's remote. Measured: it read `https` while `origin` was
  `git@github.com:khoi/skills.git`.
- The remote URL and its protocol decide which identity layer is even in play.
  Read them before diagnosing anything.
- Redact any `user:token@` segment before a URL enters a report. A URL is
  evidence of host and path, never of a credential.
- A remote can change between turns. Re-read it; never reuse an earlier
  reading, including one from your own previous message.

## Step 2 - gather read-only identity and permission proof

```sh
gh auth status
git config --show-origin --get-all credential.helper
ssh-add -l
gh api repos/<owner>/<repo> --jq '{push: .permissions.push, private: .private}'
ssh -T git@github.com; echo "ssh_t_exit=$?"
```

- `ssh -T` success prints `Hi <account>!` and exits 1; 255 means no accepted
  key. Exit 1 here is a pass, not an error.
- HTTPS sends the helper's account. SSH sends the account that owns the offered
  key. `gh api` reports the `gh` account only; when the two differ, the key
  account's write permission is `UNKNOWN`, never inherited from either side.
- Token scopes are not repository permission. Measured: a token carrying
  `repo` belonged to an account with `push:false`, and the push returned 403.
- Never run `gh auth token`, never query the keychain, never read, print or copy
  a private key. `gh auth status`, the helper config, `ssh-add -l`, `ssh -T` and
  the permissions probe are the whole allowed surface.
- If `gh` is not authenticated, or cannot see the repo, the permission answer is
  `PERMISSION_UNKNOWN`; report it as unknown rather than guessing from the URL.

## Step 3 - choose the repair that matches the blocker

| Blocker | Repair | Authority needed |
| --- | --- | --- |
| Account lacks write | Grant collaborator access, use an account that has it, or push to a repo it can write | Owner or repo admin |
| No accepted SSH key | Generate a dedicated key, add it to the agent, register it | Owner instruction |
| Key on the wrong account | Register the key on the intended account, or use a key already there | Owner instruction |
| Wrong transport or URL | Test the candidate transport, then change the remote | Owner instruction |
| No read access / 404 | Resolve the URL and access with the owner | Owner |

- Each row is a separate owner instruction. Approval for one is not approval for
  the next, and a failed push is not an instruction to install anything.
- Do not create accounts, enter tokens, or change security settings. Those are
  owner-executed actions.
- Never repair by widening the destination (a different repo, a fork, an
  unrelated account) unless the owner names that destination.

## Step 4 - prove the candidate transport before rewriting origin

```sh
ssh -i ~/.ssh/<key> -o IdentitiesOnly=yes -T git@github.com; echo "ssh_t_exit=$?"
git ls-remote --heads https://github.com/<owner>/<repo>.git main; echo "probe_exit=$?"
```

- Test first, then mutate. Measured: `origin` was switched to SSH before any
  SSH authentication succeeded, and the transport then failed 255; the config
  change had to be reported as unverified rather than as a fix.
- `-o IdentitiesOnly=yes` makes the test prove *that* key, not whichever key the
  agent offers first.
- A read-only `ls-remote` over public HTTPS shows the repo is reachable and a
  ref exists; it proves nothing about write access and is not an auth workaround.
- If the candidate transport cannot be proven, leave the remote as it is and
  report `BLOCKED` with the exact failure.

## Step 5 - generate a key only on explicit owner instruction

```sh
ls -l ~/.ssh/<key> ~/.ssh/<key>.pub    # must not exist first
ssh-keygen -t ed25519 -f ~/.ssh/<key> -C "<purpose>"
ssh-add ~/.ssh/<key>
ssh-keygen -lf ~/.ssh/<key>.pub
stat -f '%Sp %N' ~/.ssh/<key> ~/.ssh/<key>.pub
```

- Dedicated key per purpose. Never overwrite an existing key file; if the path
  exists, stop and ask. Do not reuse an account-wide default key silently.
- Passphrase is a decision, not a default. Surface it to the owner; a
  no-passphrase key enables non-interactive pushes but leaves the key usable by
  anyone who copies it. In the measured case the owner authorized that tradeoff.
- Print only the public half and the fingerprint. The private key never appears
  in output, a report or chat.
- Verify the result: both files exist, permissions are `600` / `644`, and the
  fingerprint is the one you will register. `ssh-add -l` should then list it.
- Generating a key proves nothing about access. Continue to Steps 6 and 7.

## Step 6 - register the key on the intended account, then verify it there

```sh
gh ssh-key list
gh api user --jq '{login: .login}'
```

- `gh ssh-key list` requires `admin:public_key`. A 404 whose body says the
  operation needs that scope is a **scope gap**, not evidence the key is
  missing. Measured exactly that on a token with `gist, read:org, repo,
  workflow`.
- Adding the scope (`gh auth refresh -s admin:public_key`) is an interactive,
  owner-executed credential change. Do not run it on your own initiative.
- Without the scope, registration is an account-side action: the owner signs in
  as the intended account and adds the public key, or authorizes a browser
  session that is already signed in as that account. A browser connector that
  is unavailable is a blocker, not permission to use a different account.
- Verify registration twice: the key is listed under the intended account, and
  `ssh -T git@github.com` prints `Hi <intended-account>!`. A key that exists in
  `~/.ssh` and in the agent is not yet a registered key.

## Step 7 - prove access end to end, or report blocked

All three, each measured after the last change:

1. `ssh -T git@github.com` prints `Hi <intended-account>!` for the account that
   must push.
2. That account has `push: true` on the target repo, from `gh api` when the
   authenticated account is that account, or from the account's own
   collaborator/access page otherwise. When it cannot be measured, it is
   `UNKNOWN`, not assumed.
3. A read-only `git ls-remote --heads <push-url> <branch>` succeeds over the
   transport that will be used to push.

- Identity, permission and reachability are three separate facts. A key that
  authenticates proves only the first. Adding a key to a pull-only account does
  nothing for write access.
- Report one of: `ACCESS_PROVEN (<account>, <transport>)`,
  `BLOCKED (<exact blocker>)`, or `ACCESS_UNVERIFIED (<what was not
  measured>)`.
- Only `ACCESS_PROVEN` hands back to the push gate. Handing back is not a push:
  the destination gate still re-resolves URL, protocol, history and publish set
  at push time.

## Hard rules

- Classify the blocker before changing anything; never repair two layers in one
  step.
- Read the transport from `.git/config` and the remote URL, never from
  `gh auth status`.
- Never read tokens, keychain entries or private keys. Public half and
  fingerprint only.
- Never change a remote, a credential helper, an account or a security setting
  without a specific owner instruction for that change.
- Test a candidate transport before rewriting the remote; an unproven change is
  reported as unverified, not as a fix.
- Token scopes are not repository permission; only the permission probe or a
  repository-side collaborator view speaks to write access.
- A key that authenticates is not a key with write access, and an SSH key that
  exists locally is not a key registered on GitHub.
- Adding a key to a pull-only account does not grant write; stop and report the
  missing grant instead of generating more keys.
- A 404 from `gh ssh-key list` naming `admin:public_key` is a scope gap; do not
  report the key list as empty or the key as absent.
- Never report access as done from having been asked to do it, from a key file's
  existence, or from an agent listing. Only the Step 7 measurements count.
- One attempt per change. A failure produces a report, not a retry loop.
- Never push, force, delete a ref, or create an account from this skill.

## Measured case (2026-10-25/26, GitHub `khoi/skills`)

- The push over HTTPS was denied 403, `Permission to khoi/skills.git denied to
  BaBiYeuCon`, exit 128. `gh api` reported `pull:true, push:false` for that
  account while its token carried `gist, read:org, repo, workflow` - scopes
  present, write absent.
- `origin` was switched to SSH before SSH was proven. `ssh -T` returned 255
  (`Permission denied (publickey)`), so the switch was unverified, not a fix.
- A dedicated ed25519 key was generated only after an explicit owner
  instruction, added to the agent, and its public half printed
  (`SHA256:E/ftjHYNZrnjJ7+P7f6kIVIpIFHEw/K25nuGXtmNHLg`). `ssh -T` still
  returned 255: the key existed locally and was not registered on the account.
- `gh ssh-key list` returned HTTP 404, "This API operation needs the
  `admin:public_key` scope." Registration could not be performed or verified
  from the CLI; the browser connector was unavailable, so the account-side step
  was never reached.
- Nothing was pushed, and the final answer said so: the key was not on GitHub
  and SSH auth still failed. No credential or config change was made by the
  push gate itself.
- Exit-code trap measured in the same session: one SSH `ls-remote` printed
  `ls_remote_exit=0` beside a fatal `Permission denied (publickey)`; re-running
  the command alone returned 128. Capture the command's own status, not a
  pipeline's or a helper's.
- Re-measured 2026-10-26: `origin` on SSH, `ssh -T` 255, `gh` account still
  `BaBiYeuCon` with `push:false`, so none of the access facts above had changed
  after the session ended. Re-measure on every run.

## Boundaries

- Destination, pushURL, protocol-at-push-time, history, publish set, ref-set
  bounding and post-push `ls-remote` proof belong to
  `git-push-destination-preflight`. Its Gate 1 observes identity state only; the
  lifecycle procedure lives here.
- Commit byte provenance belongs to `skill-artifact-commit-provenance`.
- Exit-code harness correctness and pipeline status belong to
  `shell-command-result-verification`.
- Source-session evidence grading belongs to `verify-skill-source-session`.
- Concurrent writes inside a skill directory belong to
  `skill-dir-concurrent-write-reconcile`.
- This skill never authorizes a push. Proven access is a precondition, not a
  permission, and the owner still authorizes one named ref on one destination.

## Related skills

- `git-push-destination-preflight` - the push gate this feeds; it explicitly
  excludes key and credential lifecycle.
- `skill-artifact-commit-provenance` - proves the committed bytes before a push.
- `shell-command-result-verification` - captures each command's own exit status.

## Resources

None. The procedure is read-only measurement plus a small number of
owner-authorized commands; a script that generated keys or edited remotes would
add exactly the write surface this skill is meant to gate.
