# Audit checklist

Companion to `skill-rule-contradiction-audit`. Every command here is read-only.
A search hit is a lead for reading, never a finding by itself.

## 1. Freeze record

```text
target: <absolute path>
sha256: <digest>
mtime:  <timestamp>
lines:  <n>
scope:  <whole file | sections>
```

Worked-case target: `/Users/khoi/.qoder/skills/git-push-destination-preflight/SKILL.md`.
It was being rewritten by another session during this audit: `edb42d8f...` at
06:50:33 (499 lines), `60191f25...` at 06:57:59 (506 lines), `5c3a8867...` at
06:59 (502 lines), with a line shifting between two reads seconds apart. The
worked case therefore cites section headings and quoted sentences, not line
numbers. A digest above is an observation of drift, not a constant, and no line
anchor from this record should be reused without re-locating the quote. The file
changed again (`3bbf037e...`, still 502 lines) while the quotes in section 5
were being checked.

## 2. Cue inventory

| Cue | What to capture |
|---|---|
| Hard stop | The exact wording, the object it names, the condition it names |
| Alternative | Whether it reaches the same object and action, and what approval it names |
| Command | Command, code, stderr class, and the empty-result control |
| Identity | Account, key, token, helper, protocol, permission, visibility |
| Field | Template line, the axis it measures, and what it cannot show |
| Boundary | "Not for" sentence and the sibling it names |
| Claim | "Measured" / "verified" and the artifact or command behind it |

Read-only lead finders, run from the skill directory:

```sh
rg -n -i 'never|must not|do not|stop|blocked|forbidden' SKILL.md
rg -n -i 'instead|alternatively|offer|fallback|failover|escape|option' SKILL.md
rg -n 'exit [0-9]+|exit code|non-zero|empty result' SKILL.md
rg -n -i 'account|token|scope|key|agent|helper|ssh|https|protocol' SKILL.md
rg -n '^[A-Z][A-Z0-9_]*:' SKILL.md
rg -n -i 'measured|verified|confirmed|proven' SKILL.md
```

The patterns find leads. The finding still needs the quoted line and a stated
conflict. Re-run the same pattern on a phrase known to exist as a positive
control when a search returns nothing.

## 3. Pairing matrix

For each hard stop, fill one row per alternative:

| Question | If yes | If no |
|---|---|---|
| Same object? | Continue | `SCOPE_GAP` unless the stop is already qualified |
| Same action? | Continue | `SCOPE_GAP` unless the stop is already qualified |
| Same condition? | Continue | `SCOPE_GAP` or `OK` if a different failure mode |
| Approval named and required? | `OK` | `AUTHORIZATION_GAP` |

Same object, same action, same condition, no approval: `CONTRADICTION`.

Check the reverse direction too: does the options list omit the option that is
compatible with the stop, or does a triage row recommend the forbidden action?
A stop that survives its own alternatives is not a finding, even when the
wording is absolute.

## 4. Command-semantics reference

| Command and result | Meaning | Not evidence of |
|---|---|---|
| `git merge-base A B` exit 1 | No common ancestor | A broken command |
| `git merge-base A B` exit 128 + fatal | Missing or unreadable ref | Unrelated history |
| `ssh -T` exit 1 after `Hi <account>!` | Key accepted; no shell | Failed authentication |
| `ssh -T` exit 255 | Connection or key rejection | Account permission |
| `gh api <path>` 404 | Wrong endpoint, missing scope or no access | Repository absence |
| `git remote -v` empty, exit 0 | No remote in effective config | Never pushed anywhere |
| `git log --not --remotes` empty, exit 0 | No positive revision given | Everything published |
| `cmd \| grep -q` non-zero | No match in `grep` | `cmd` failure |
| `curl` exit 0 with HTTP 404 | Transport succeeded | Resource exists |
| `diff A B` exit 1 | Files differ | Tool error |
| `grep` exit 1 | No match | I/O error |
| `timeout` exit 124 | Timed out | Command result |

To confirm a code for a document: run the command in a scratch directory with a
known state, read `$?` immediately, and record stderr. For an empty result, run
the same command where it must produce output. For a pipeline, use
`${PIPESTATUS[0]}` in bash or `set -o pipefail`; otherwise the status is the
last stage's. Harness mechanics belong to `shell-command-result-verification`.

## 5. Worked case: git push gate

The source session reported a contradiction between an absolute "no merge base
means no push" rule and a "new branch on a writable remote" option. The pre-fix
file was not retained in this workspace, so those exact old strings are
`REPORTED`, not `CONFIRMED`. The current file contains the repaired forms; each
anchor below was read on disk, but the live file was moving, so the anchor is a
section heading plus a quoted sentence rather than a line number.

- `## Gate 1 - identify the credential path without reading secrets` - "line
  describes gh's own integration, not the repository's remote." The credential
  tool's protocol line is not the push transport.
- Same section - the check is matched to the protocol: HTTPS 403 is the sent
  credential's write access; SSH `Permission denied (publickey)` is a key or
  agent problem, while `ERROR: Permission to <owner>/<repo> denied to <user>`
  is an authenticated key without write access, and switching gh accounts does
  not change the key's account.
- Same section - SSH identity is the key's account; `ssh -T` maps an accepted
  key to an account, `gh api` reports the gh account only; a differing key
  account's permission is `UNKNOWN`, not inherited.
- `## Gate 2 - prove the histories are related` - "Empty merge-base with exit 1
  means no common ancestor. Exit 128 with a fatal message means the ref is
  missing or unreadable - a measurement failure, not an unrelated-history
  result."
- Same section - the stop is scoped to "that existing remote branch", the
  forbidden substitutes are listed, and "A new branch is a different
  destination, not a workaround: it needs the owner's explicit confirmation and
  the Gate 3 collision check."
- `## Failure triage` - the permission rows stop, then "Offer a new branch on a
  writable remote, an owner-granted access change, or leaving the commit local."
- `## Options to offer after a stop` - "**New branch on a writable remote** -
  preserves the exact commit hash" (the sentence continues on the next line).
- `## Report template` - `IDENTITY_PATH`, `IDENTITY`, `PERMISSION` and
  `VISIBILITY` are separate lines; `REFS_BEFORE`, `REFS_CARRIED`, `REFS_AFTER`
  and `REFS_UPDATED` are separate fields with measured, inferred and
  not-measured forms.
- `## Hard rules` - "No merge base blocks a push to that existing remote branch;
  never force, delete or rename a remote ref without explicit owner direction
  naming that ref. A new branch is a new destination requiring owner
  confirmation."

Classification of the historical pair: different destination (a new branch is
not the blocked remote branch), so the absolute wording was a `SCOPE_GAP`; if
the original option also omitted the confirmation the repair now requires, it
was an `AUTHORIZATION_GAP` as well. It was not a same-object
`CONTRADICTION`, because the option never pushed to the blocked branch. That
distinction is the point of the four pairing questions: the repair keeps the
option and qualifies the stop instead of deleting either.

The current file also shows the other classes: `PROTOCOL_MISMATCH` in the gh
protocol line under Gate 1, `COMMAND_SEMANTICS` in the merge-base distinction
under Gate 2, and `CONFLATED_FIELD` in the identity and refs fields of the
report template.

## 6. Synthetic second example

A made-up record-deletion skill, used only to show finding shapes:

```text
Gate 1: "Never delete a record without a verified backup."
Options: "If the backup fails, export a CSV and delete the source record."
Hard rule: "Never skip the backup step."
Report: "DELETE: ok"
```

| Finding | Class | Why |
|---|---|---|
| Gate 1 vs Options | `CONTRADICTION` | Same record, same delete action, backup absent, no approval named |
| Options vs Hard rule | `DUPLICATE_DRIFT` | The two copies disagree on whether export substitutes for backup |
| `DELETE: ok` | `CONFLATED_FIELD` | It merges "row deleted" with "backup verified"; split into `DELETED` and `BACKUP` |
| "Measured: 0 rows remain" from a query against another database | `CLAIM_UNSUPPORTED` | The command does not measure this database |
| "Never delete a record" vs "delete stale drafts after 30 days" | `SCOPE_GAP` | Different object and a stated condition; qualify the stop, do not delete the exception |

A correct repair names the object, the condition and the approval; it does not
silently widen the skill. A gate that already names all three is `OK` even when
it uses "never".

## 7. Filled report example

```text
TARGET: /tmp/example-skill/SKILL.md | SHA256 0000...0000 | mtime 2026-10-26 07:10:00 | lines 84
SCOPE: whole file
INVENTORY: hard_stops 3 | options 2 | commands 2 | fields 1 | boundaries 1
FINDINGS:
  F1 | line 12 | CONTRADICTION | "Never delete a record without a verified backup." vs line 19 "If the backup fails, export a CSV and delete the source record." | same object (record), same action (delete), backup absent, no approval | Replace line 19 with: "If the backup fails, stop; export is not a backup substitute." | narrows
  F2 | line 23 | DUPLICATE_DRIFT | "Never skip the backup step." vs line 19 | copies disagree | Delete line 23 and reference Gate 1 | narrows
  F3 | line 61 | CONFLATED_FIELD | "DELETE: ok" | row deleted and backup verified collapse into one value | Split into DELETED: yes/no and BACKUP: verified/absent/unknown | none
CLEAN: hard_stop line 40 pairs with option line 44 (different object, approval named); boundary line 78 matches the body
UNVERIFIED: exit code for the export command was not executed
VERDICT: FINDINGS_OPEN
```

## 8. Edit and recheck sequence

Only after the owner authorizes fixes:

```sh
shasum -a 256 <target>
node /Users/khoi/.qoder/skills/verify-skill-source-session/scripts/check_skill.mjs --check-refs <skill-dir>
node /Users/khoi/.qoder/skills/verify-skill-source-session/scripts/check_citations.mjs <skill-dir> --root <root>
```

1. Re-hash; stop if the digest differs from the freeze record.
2. Edit the smallest span; replace exact text, not a paraphrase.
3. Label `none`, `narrows` or `widens`; stop for approval on `widens`.
4. Re-run both checkers and read every printed citation anchor.
5. Re-anchor line numbers in the findings and in any reference file; use
   `skill-citation-line-shift-resync` when a cited target moved.
6. Re-hash the edited files and confirm the digest is stable.
7. Re-run the pairings the edit touched, including the reverse direction.

A green checker verdict proves structure, not rule consistency. A clean audit
proves only that these checks found no conflict.
