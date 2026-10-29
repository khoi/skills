---
name: skill-rule-contradiction-audit
description: Audit a written SKILL.md for internal rule contradictions and command-semantics errors before an update. Use when a hard stop coexists with an offered alternative, one rule is repeated across sections with different scope, an exit code is given a generic success/failure meaning, an identity check does not match the effective transport, one report field merges two axes, or a claim exceeds its documented command. Covers a line-numbered rule inventory, pairing each hard stop with every alternative, scope/authorization verdicts, command-specific exit meanings, protocol-bound identity probes, split report fields, duplicate-rule and boundary checks, and a findings table with each line and a minimal replacement. Not source-session evidence (verify-skill-source-session), numeric claims (measurement-claim-evidence-audit), duplicate skills (user-skill-overlap-audit), exit-code harnesses (shell-command-result-verification), or concurrent edits (concurrent-skill-md-edit-recovery).
---

# Skill Rule Contradiction Audit

## Overview

A skill can pass every format, link, citation and registration check and still
contradict itself: a gate forbids every push, an options list offers a new
branch, and both sentences hold only if that option is a different destination
with its own authorization. Checkers read structure. This audit reads the rules.

The deliverable is a findings table. Every finding names a line, quotes it,
states the conflict in terms of object, action, condition and authorization, and
proposes a minimal replacement. Editing is a separate step the reviewer
authorizes.

A clean result means these checks found no conflict. It is not proof that the
procedure is correct, safe, complete or authorized.

## Trigger shape

- "Check this SKILL.md for contradictions before updating it."
- An absolute stop and an offered alternative appear in the same file.
- One rule appears in a gate, a failure table, an options list, the hard rules
  and the report template, and the copies disagree.
- An exit code is explained as "non-zero means failure".
- A credential or identity check names a tool git may not use for this remote.
- A report field answers two questions in one value.
- A "Measured:" sentence has no command, artifact or retained output behind it.
- The file is uncommitted and another session may be writing it.

## Finding classes

| Class | Meaning | Default repair |
|---|---|---|
| `CONTRADICTION` | Same object and action are forbidden in one place and permitted in another under the same condition | Add the missing condition, or remove the weaker copy |
| `SCOPE_GAP` | A stop is stated absolutely but was meant for one object, transport or failure mode | Qualify the scope; keep the stop |
| `AUTHORIZATION_GAP` | An alternative is reachable without the approval the file requires elsewhere | Name the approval and the gate in the option |
| `COMMAND_SEMANTICS` | An exit code, empty result or stderr class is given one global meaning | Bind the code to the command and its stderr |
| `PROTOCOL_MISMATCH` | An identity, credential or permission check measures a different transport than the operation uses | Resolve the effective transport, then choose the probe |
| `CONFLATED_FIELD` | One report field merges two axes | One field per axis with an explicit not-measured value |
| `DUPLICATE_DRIFT` | Copies of one rule differ in wording or scope | One canonical statement; other sites reference it |
| `BOUNDARY_CONFLICT` | An "out of scope" line and the body instruct opposite things | Align the boundary with the step, or remove the step |
| `CLAIM_UNSUPPORTED` | A measured or verified claim exceeds its command or retained output | Downgrade the label or cite the run |

## Workflow

### 0. Freeze the target

Record path, SHA-256, mtime and line count, then quote from that version only.
Re-hash immediately before any edit. If the digest changes mid-audit, stop and
hand over to `concurrent-skill-md-edit-recovery`; an audit across two versions
is not one audit.

### 1. Inventory the rule lines

Read the whole file, not the disputed section. Build a line-numbered list of
candidate rules with the exact quote and its role:

- `HARD_STOP`: never, must not, stop, blocked, forbidden, do not.
- `OPTION`: or, instead, alternatively, offer, fallback, failover, escape.
- `DUPLICATE`: the same rule restated in a gate, table, list, template or case.
- `COMMAND`: a command, exit code, empty result or stderr string.
- `IDENTITY`: account, key, token, scope, helper, protocol, permission.
- `FIELD`: a report line or template placeholder.
- `BOUNDARY`: "not for", "out of scope", "defer to", sibling names.
- `CLAIM`: measured, verified, confirmed, proven, or a count.

Report the counts. A section with a disputed table usually holds more claims
than the table.

### 2. Pair every hard stop with every alternative

For each `HARD_STOP`, list every `OPTION` that could reach the same goal, then
ask four questions before calling it a contradiction:

1. **Object** - same target? A remote branch, a new branch and a local commit
   are three different objects.
2. **Action** - same operation? Push, force-push, delete, rename and open a PR
   are different actions.
3. **Condition** - same trigger? No common ancestor, 403, missing key and
   missing approval are different conditions.
4. **Authorization** - does the option require the explicit owner confirmation
   the file demands elsewhere, and does the option say so?

Verdicts:

- Same object, action and condition, no approval required: `CONTRADICTION`.
- Different object or action, but the stop is unqualified: `SCOPE_GAP`.
- Different object or action, but the option omits the required approval:
  `AUTHORIZATION_GAP`.
- Different object or action, approval stated: `OK`; the stop still holds.

Run the pairing in both directions. A hard stop can also be undermined by a
triage table that recommends the forbidden action, by an options list that
drops the stop-compatible option, or by a report template that records the
forbidden state as success.

A minimal repair usually adds a qualifier or an approval clause. Deleting the
option is a `widens` behavior change and needs owner approval; deleting the
stop is almost always `widens`.

### 3. Audit command and exit-code semantics

An exit code means what its command defines, not a global success flag. For
every `COMMAND` line, bind three things: the exact command, the exact code, and
the condition class it distinguishes. Add a positive control whenever the code
is read from an empty result.

| Observation | Correct meaning | Wrong reading |
|---|---|---|
| `git merge-base A B` exit 1 | No common ancestor | Command failed |
| Same, exit 128 with a fatal message | Ref missing or unreadable; measurement failure | Unrelated history |
| `ssh -T` exit 1 after `Hi <account>!` | Key authenticated; no shell offered | Authentication failed |
| `ssh -T` exit 255 | Connection or key rejection | Wrong account permission |
| `gh api` 404 | Wrong URL or endpoint, missing scope, or no access | Repo does not exist |
| `git remote -v` empty, exit 0 | No remote in the effective config | Never pushed anywhere |
| `git log --not --remotes` empty, exit 0 | No positive revision; exclusion covers everything | Every commit is published |
| `cmd \| grep` non-zero | `grep` found nothing | `cmd` failed |
| `curl` exit 0 on HTTP 404 | Transfer succeeded | Request succeeded |
| `diff` exit 1 | Files differ | Command error |

Rules: read the code and stderr together; use `${PIPESTATUS[0]}` or
`set -o pipefail` for pipelines; require a positive control for every empty
result; do not reuse a code from one command to explain another. Harness
mechanics belong to `shell-command-result-verification`; this step audits what
the document says the code means.

### 4. Bind identity checks to the effective transport

Resolve the transport from the repository first: `git config --get
remote.<name>.url`, `git config --get remote.<name>.pushurl`, and
`git config --show-origin` for overrides. Only then choose a probe.

- A credential tool's own protocol line describes that tool's integration, not
  the repository's remote. `gh auth status` is identity inspection for the `gh`
  account, not a statement about how `git push` authenticates.
- HTTPS: the credential helper or token decides. A 403 means the credential git
  actually sends lacks write access, not that the account lacks a scope.
- SSH: the sending identity is the key's account. `ssh -T` maps an accepted key
  to an account; `gh api` reports only the `gh` account's permission.
- Permission does not inherit across identities. When the key's account differs
  from the `gh` account, the one not measured is `UNKNOWN`, not a copy of the
  other.
- An account switch does not fix an SSH permission error, and a key change does
  not fix an HTTPS credential error.

Probes must be read-only and must never print a token or private key.

### 5. Split conflated report fields

One field carries one axis, one subject, one measurement time and one explicit
not-measured value. A field is conflated when two different states produce the
same string.

Split these pairs:

- identity path, identity, permission, visibility;
- history result, exit code, stderr class;
- refs before, refs carried, refs after, refs updated (measured vs inferred);
- command run, result observed;
- source object, destination object;
- what was checked, what was not checked.

If a value can be inferred rather than measured, the field needs both a
measured form and an inferred form with its evidence. `unknown` is a value;
blank is not.

### 6. Reconcile duplicates and boundaries

Search each rule's distinctive phrase across the whole file, including gates,
failure tables, options, hard rules, templates and worked cases. A fix in one
copy is not a fix. Either update every copy or make one canonical statement and
have the others reference it.

Check boundaries in both directions: an "out of scope" sentence must not be
contradicted by body steps that perform that work without a handoff, and a
sibling named as owner must actually own the rule. A boundary that repeats
another skill's rules instead of naming it is a maintenance conflict, not a
scope split.

### 7. Check measured and verified claims

A `CLAIM` line needs a command plus retained output, or a `file:line` anchor
whose printed line supports it. A sentence that reports a result the documented
command cannot produce is `CLAIM_UNSUPPORTED` even when the result is true. Flag
the claim shape and the missing artifact; retrieving evidence belongs to
`verify-skill-source-session`, and numeric proof to
`measurement-claim-evidence-audit`.

### 8. Report, then edit only if asked

Audit-only is the default. State each finding before touching the file. When
the owner also asks for the fix:

1. Re-hash and confirm the digest from step 0.
2. Edit the smallest span that resolves the finding; do not restructure
   unrelated text.
3. Label the behavior change: `none`, `narrows`, or `widens`. Stop for owner
   approval on any `widens`.
4. Re-run `check_skill.mjs --check-refs` and `check_citations.mjs`.
5. Re-anchor every line number in the findings and in any reference file; use
   `skill-citation-line-shift-resync` when a cited target moved.
6. Re-hash the edited files and confirm stability.
7. Re-run the pairings that the edit touched; a fix in one copy can leave
   another copy stale.

Verdict `CONSISTENT` means no finding survived these checks. `FINDINGS_OPEN`
means at least one finding is unfixed. `FIXED_PENDING_RECHECK` means edits are
on disk but the re-check has not finished.

## Hard rules

- Audit the bytes you hashed; stop on digest drift.
- A hard stop plus an option is not automatically a contradiction. Decide
  object, action, condition and authorization first.
- Never give an exit code a global meaning; bind command, code and stderr.
- Resolve the transport from the repository, not from the credential tool's
  protocol line.
- Do not inherit permission across identities; write `UNKNOWN`.
- One field, one axis; blank is not `unknown`.
- Fix every copy of a duplicated rule, or make one canonical.
- A `widens` replacement needs explicit owner approval.
- A clean audit is not a correctness, safety or authorization verdict.
- Audit-only means edit nothing.
- Quote the line; a paraphrase is not a finding.
- Do not edit a moving file.

## Report template

```text
TARGET: <path> | SHA256 <hash> | mtime <time> | lines <n>
SCOPE: <whole file | named sections>
INVENTORY: hard_stops <n> | options <n> | commands <n> | fields <n> | boundaries <n>
FINDINGS:
  F1 | line <n> | <class> | "<quote>" | <conflict: object/action/condition/authorization> | <minimal replacement> | <none|narrows|widens>
  F2 | ...
CLEAN: <pairings and checks with no finding>
UNVERIFIED: <what was not checked and why>
VERDICT: CONSISTENT | FINDINGS_OPEN | FIXED_PENDING_RECHECK
```

## Boundaries

- `verify-skill-source-session` owns source-session evidence and the three-pass
  post-write verification. This skill audits text already on disk; it does not
  grade session claims.
- `measurement-claim-evidence-audit` and `unbacked-measurement-trim` own numeric
  claims, their artifacts and their removal. This skill flags the claim shape
  only.
- `user-skill-overlap-audit` owns duplicate skills in the tree. This skill
  checks duplicate rules inside one file.
- `session-sourced-skill-distillation` orchestrates session-to-skill work and can
  call this audit between proposal and write.
- `shell-command-result-verification` owns exit-code harness mechanics and
  failing controls. This skill audits how a document interprets codes.
- `skill-postwrite-registration-verification` owns package checks, recursive
  links, registration and the final hash comparison. This audit runs before it.
- `concurrent-skill-md-edit-recovery` and `skill-dir-concurrent-write-reconcile`
  own mid-write collisions. This skill stops and delegates.
- `skill-citation-line-shift-resync` owns re-pointing citations after a shift.
- `git-push-destination-preflight` and `remote-push-access-preflight` are the
  domain procedure behind the worked case in the reference file. They are not
  audited by this skill.
- `skill-creator` owns authoring rules and package shape.

## Resources

- [references/audit-checklist.md](references/audit-checklist.md) - cue inventory,
  pairing matrix, command-semantics table, the worked case with heading and
  quote anchors, a synthetic second example and a filled report.
