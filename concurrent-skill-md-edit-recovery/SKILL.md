---
name: concurrent-skill-md-edit-recovery
description: Recovery and merge procedure for a skill file that another session is writing at the same time. Use when an Edit or Write to an existing SKILL.md returns "The file changed since your last read", when an Edit returns "0 occurrences found" and you must decide whether the file moved or your old_string is stale, when another session may be extending the same skill, or when a rule you just added may already exist on disk. Compare the current hash and mtime with the last successful edit before choosing; unchanged bytes mean a local old_string or whitespace mismatch, and changed bytes mean concurrent recovery. For concurrency, re-read the whole file, judge whether the disk text already covers your rule, withdraw the redundant block or fold the missing increment into the existing section, never restore an old copy or undo another session's work, then declare each rule's expected occurrence count and prove the package passes a checker before reporting success.
---

# Concurrent SKILL.md Edit Recovery

## Overview

Two sessions editing one skill file at once is normal in this workspace:
`~/.qoder/skills` gains and rewrites entries while other tasks are running.
The failure this skill prevents is silent semantic duplication — the edit
lands, the package checker still passes, and the file now states one rule
twice in two shapes. Treat a concurrent-write notice as a merge problem, not
as an error to retry. A notice-free `0 occurrences found` is the opposite
case: nothing was written, and until the bytes show a move it is a stale
`old_string`, not a conflict.

## When this fires

- The edit result carries: "The file changed since your last read. Your edit
  was applied to the current contents; read it before relying on surrounding
  changes you have not seen." The wording may change; match the meaning, not
  the sentence.
- An Edit fails with `0 occurrences found` and no concurrency notice, and you
  need to decide whether the file moved or the block is stale. Run the triage
  below before any recovery step.
- You are adding a rule to a skill whose mtime, headings, or line count moved
  since you read it, or a sibling session is working on the same skill.
- Line numbers from your plan no longer match what the file shows.

## What the notice does and does not mean

- It means the edit was applied against the file's current contents, and other
  writes landed after your read.
- It does not mean your `old_string` still sits in the surroundings you
  planned against.
- It does not mean a conflict. Often the other session already added the rule,
  placed better, and your addition is the redundant one.
- `0 occurrences found` is not this notice: it writes nothing, so it cannot be
  treated as an applied edit.

## Triage before recovering

A failed edit is not proof of a concurrent writer. Only the notice means the
edit was applied; `0 occurrences found` means nothing was written. Decide with
a measurement, not with the error text.

1. **Measure the file now.** Run `node scripts/skill_md_state.mjs <SKILL.md>`.
   Compare sha256, mtime and byte count with your baseline: the state run after
   your last successful edit, or that edit's mtime and resulting size.
2. **Unchanged -> stale `old_string`.** If mtime is not later than your last
   successful edit and the size is what that edit produced, no other session
   wrote. The quoted block is wrong — commonly leading spaces, indentation,
   re-wrapped lines, or text copied from the pre-edit version. Read that
   section, copy its exact current text, and retry once. The mechanical repair
   is in `chunked-write-edit-payloads` rule 6. Do not run the full re-read,
   coverage judgement or withdrawal below, and do not report a concurrent
   write.
3. **Changed -> concurrent write.** If the hash or mtime moved after your last
   successful edit, or the concurrency notice fired, start at Workflow step 1.
   With no baseline and a notice, treat it as changed; the notice is the
   evidence.
4. **Cannot date the last edit -> UNKNOWN.** Re-read the target section before
   editing and label the attribution, rather than claiming either cause.

A second `0 occurrences found` with unchanged bytes is still a local mismatch;
re-read the whole file before a third attempt, and never answer it with a
merge or a withdrawal.

## Workflow

Start here only after triage says the bytes moved or the concurrency notice
fired; the steps assume another write landed.

1. **Stop editing on the stale view.** Do not chain another Edit using offsets
   from the pre-notice read. Nothing in the file is known-good until re-read.

2. **Re-read the entire file.** A partial Read (offset/limit) is not enough:
   concurrent additions can sit anywhere, and the decision depends on whether
   any of them already covers your rule. If the file looks mid-write — unclosed
   frontmatter, a section that visibly trails off — re-read once more before
   judging, and do not finish the other session's paragraph.

3. **Snapshot both states.** Run `scripts/skill_md_state.mjs` on the file
   before and after (sha256, line count, heading outline). You compare
   outlines, not line numbers. Without a pre-edit snapshot, use your own
   intended block text as the baseline.

4. **Judge coverage by meaning.** For each thing you were adding, ask whether
   the current disk text already states it, in any phrasing that carries the
   rule.
   - Covered → withdraw your block.
   - Partly covered → merge the missing increment into the step, bullet, or
     hard rule that already owns the topic.
   - Not covered → keep the change, but relocate it if the other session
     restructured the section it belongs to.

5. **Withdraw only your block.** Delete exactly the lines you inserted and
   leave every concurrent change in place. Never rewrite the file from a
   cached full copy, and never `git checkout` or `git restore` a skill file —
   both erase the other session's work. If the withdrawal edit itself reports
   a concurrent change, restart at step 2.

6. **Merge into the existing structure.** Extend the existing step or rule
   list instead of adding a heading that says the same thing. A second
   "Verification" or "Hard rules" block for a rule that already has a home is
   the duplication this skill exists to prevent. Keep the other session's
   wording where it is at least as precise as yours; add only the gap.

7. **Prove it landed as declared.**
   - `node scripts/skill_md_state.mjs <SKILL.md>` — no duplicate report.
   - Before the grep, write down each touched rule's intended occurrence count
     and where every occurrence lives. One is not the default: a permission
     rule that belongs in its gate and again in Hard rules is intentionally 2,
     and deleting the procedural copy to reach 1 would satisfy the grep while
     breaking the workflow.
   - Copy each predicate verbatim from the current file, re-read after your
     last edit — never from memory or another session's wording. A count below
     the declaration is a provenance question first: one rule can live in two
     shapes — tense, an article, a synonym — so re-read the owning section for
     a near-paraphrase before calling the rule missing or editing text to reach
     the declared count.
   - `grep -n "<distinctive predicate of the rule>" <SKILL.md>` — the count
     must equal your declaration. Choose words no paraphrase of the rule could
     drop. A predicate split by a line wrap never matches a line-oriented
     grep; normalize first, or choose a predicate that fits on one line:
     `tr '\n' ' ' < SKILL.md | tr -s ' ' | grep -o -F "<predicate>" | wc -l`
     A zero from a wrapped phrase is a false negative, not evidence the rule
     is missing; re-count normalized before re-adding or deleting anything.
   - `node /Users/khoi/.qoder/skills/verify-skill-source-session/scripts/check_skill.mjs <skill-dir>`
     — package structure.
   - Re-read the heading outline: no two sibling sections now cover one topic.
   The package checker proves none of this on its own. It validates
   frontmatter, name/folder match, description length, body size, relative
   links and extraneous files — not whether a rule is stated twice.
   - Registration is a separate claim from package shape: these checks read the
     file, they do not prove a later session loads the edited body. Load the
     skill, confirm the touched rule appears in the returned body, then re-hash;
     a hash that moved between the write and the load is another concurrent
     write, so restart triage with that hash as the baseline. The full pass set
     is `skill-postwrite-registration-verification`.

8. **Report the divergence.** State what the other session changed, what you
   withdrew or merged, and the heading plus quoted sentence where your rule
   finally lives. Cite headings and quoted text instead of line numbers taken
   before the re-read. If the outcome is "no rule added, disk already had it",
   say exactly that rather than reporting an update that did not happen.

## Hard rules

- The concurrency notice is a prompt to re-read, never a prompt to retry.
- Full-file re-read before any further edit; a partial read cannot establish
  coverage.
- Withdrawal removes only your own block — no full-copy rewrite, no VCS
  restore of a file another session is writing.
- Do not delete or silently rewrite what the other session wrote; if it looks
  wrong, report it.
- Coverage is judged by meaning. Same rule in different words is still one
  rule.
- A green package checker is not evidence of no duplication; run the duplicate
  check and the predicate grep against your declared count.
- Line numbers from a pre-notice read are stale; locate changes by heading and
  quoted text.
- Claim success only from a post-write run: duplicate report clean, grep count
  as intended, checker exit 0, and a `Skill` load that returns the revised body.
  Otherwise state what could not be verified.

## Resources

- `scripts/skill_md_state.mjs` — read-only snapshot: sha256, byte and line
  counts, mtime, frontmatter summary, heading outline with line numbers, and a
  duplicate report for non-frontmatter lines of eight or more words that
  recur after whitespace and case normalization. Exits 1 when duplicates are
  found. Limitation: the same rule re-wrapped at different column widths can
  escape line-level detection, so pair it with the predicate grep.
- `/Users/khoi/.qoder/skills/verify-skill-source-session/scripts/check_skill.mjs`
  — sibling package checker (frontmatter boundaries, name/folder match,
  single-line description ≤1024 chars, body <500 lines, relative links,
  extraneous docs). Reference it by absolute path; do not copy it here, since
  a copy is itself the duplication this skill guards against.
