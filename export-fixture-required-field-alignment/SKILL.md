---
name: export-fixture-required-field-alignment
description: Align synthetic test fixtures with an exporter's required-field preflight. Use when writing or changing fixtures for an Excel/CSV export path that rejects records missing required fields (STT, employee code, patient name), when tests fail with COMPANY_EXPORT_BLOCKED / REQUIRED_FIELD_MISSING / HTTP 409, when one shared "ambiguous" fixture is reused across export tests, or when a blank-cell assertion must move (e.g. C3 to D3) after the ambiguous field changes. Covers fixture role separation, column-bound assertions, the preflight canary, and the cross-exporter ripple check.
---

# Export Fixture / Required-Field Alignment

## Overview

A red export test often means the exporter is right and the fixture is wrong. When an exporter preflights required fields, an `ambiguous` or `not_visible` marker on a required field silently becomes a blocking error. Keep each fixture aligned with the export contract, and keep blank-cell assertions bound to the field they describe.

## 1. Read the preflight contract before touching the fixture

- Locate the preflight function and extract three things: the required field keys, the error codes, and how field statuses project to output values.
- Treat the required set as per-exporter. Do not assume STT / employee code / name applies everywhere; read the code.
- Note the projection rule. In the observed exporter, every status other than `readable` yields no value, so `ambiguous` on a required field becomes `REQUIRED_FIELD_MISSING`.
- Map each field key to its output column from the header row or a field-to-column table. Assertions need this map.

## 2. Give each fixture record one role

Use separate records instead of mutating one shared record:

| Role | Required fields | Expected outcome |
| --- | --- | --- |
| Exportable | all readable | preflight ok, workbook builds |
| Blocking | one required field missing or unreadable | preflight error, build throws |
| Ambiguous | optional fields only | preflight ok, those cells blank |

- Keep ambiguity and unreadability off required fields on any record that must pass preflight.
- If required-field ambiguity is the case under test, make it a blocking record and assert the exact error code and caseId.
- Do not reuse the blocking record in tests that expect a successful export, and do not resolve it in place to make another test pass.

## 3. Bind assertions to the field, not a remembered cell

- Derive the cell address from the header or column map. A hardcoded letter is a latent failure.
- Treat a change of ambiguous field as a ripple change. Sweep every blank-cell assertion in every exporter that consumes the shared fixture; a second exporter's assertion is easy to miss because its test can still be green.
- Pair the blank assertion with a positive check on the same row (a neighboring value or the header) so an empty cell cannot pass because the row or column moved.
- Update comments that describe the fixture's intent. A stale "ambiguous date/name" comment misleads the next reader.

## 4. Read the failure before editing

- `COMPANY_EXPORT_BLOCKED` or HTTP 409 (or the exporter's equivalent): inspect `error.preflight.errors`. `REQUIRED_FIELD_MISSING` names the field and caseId; `DUPLICATE_CASE` and `DUPLICATE_PERSON` point at the fixture set, not the writer.
- `false !== true` on a `preflight(...).ok` canary: the fixture set violates a required-field, duplicate-case or duplicate-person rule. The exporter is not necessarily broken.
- When the contract says the field is required, fix the fixture. Do not relax the preflight, delete the canary, or drop the blank-cell assertion to get green.
- Keep the blocking-path assertions intact; they prove the exporter still rejects bad input. A fixture refactor that turns them into no-ops hides a real regression.

## 5. Rerun in two layers

- Focused test file first, with exact pass / fail / skip counts.
- The pinned suite (`npm test` or equivalent) next, with exact counts and the exit code.
- Report both. A green focused file does not prove the pinned suite is green.

## Worked example

Observed on an exporter with required STT, employee code and patient name:

- Symptom: 12 tests, 9 pass, 3 fail.
  - Preflight canary `assert.equal(companyPreflight([good, ambiguous]).ok, true)` failed with `false !== true`.
  - Two workbook tests threw `Error: COMPANY_EXPORT_BLOCKED` (409).
- Cause: the shared fixture marked `patient_name`, a required field, as `ambiguous`.
- Wrong fixes: relax the required list, skip the canary, delete the blank assertion.
- Correct edits:
  1. Move ambiguity to optional fields (`date_of_birth`, `blood_pressure`).
  2. In the other exporter's test, retarget the blank assertion from the name column (`C3`) to the date-of-birth column (`D3`), and update its message.
- Result: 12/12 pass; pinned suite 74 pass / 0 fail / 0 skipped, exit 0.
- Lesson: one fixture edit crossed two exporters. The failing company tests pointed at the cause; the still-green SYT test held the latent stale assertion.

## Checklist before rerun

- [ ] Required fields readable on every exportable or ambiguous fixture
- [ ] Blocking fixtures isolated and asserting exact error codes and caseIds
- [ ] Each blank assertion addresses the field it names, with the column derived or verified
- [ ] All exporters sharing the fixture swept, not just the one that failed
- [ ] Preflight canary still asserts `ok === true` for the valid set
- [ ] Fixture comments describe the current intent
- [ ] Focused counts and pinned-suite counts captured with the exit code

## Scope boundary

Green synthetic tests prove fixture-to-code alignment only. They are not OCR accuracy, clinical approval, real-export acceptance, or production readiness.
