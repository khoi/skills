---
name: nextjs-font-fixture-build-proof
description: Prove a Next.js build consumed an approved real-font fixture instead of the network. Use when a build must be deterministic and offline, when next/font/google or Google CSS links make builds fetch fonts, when a font-response fixture (font-response-fixture.json, NEXT_FONT_GOOGLE_MOCKED_RESPONSES) must be accepted or rejected for family coverage, when proving emitted .next/static/media WOFF2 bytes equal the hash-bound fixture bytes, or when deciding whether font binding and a source-level zoom test can stand in for native 125% browser acceptance (they cannot).
---

# Next.js Font Fixture Build Proof

## Overview

A Next.js build that imports `next/font/google` fetches Google CSS and font bytes at build time. Point `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` at a captured response fixture and the build becomes deterministic and offline — but `exit 0` proves nothing about which bytes were used. This skill binds every fixture input by hash, builds through the mock, and proves the emitted media set equals the fixture set exactly.

Two rules drive everything below:

1. **A fixture is accepted on coverage, not on filename or recency.** A parent-directory fixture that happens to be adjacent is not the approved one.
2. **Emitted bytes are the evidence.** Exit code, "no errors in log", and file counts alone are not proof.

## Step 1 — Accept the fixture on measured coverage

Measure the candidate before use. Count distinct families and distinct WOFF2 digests, and compare against the families the app actually imports:

```
grep -rn 'next/font/google\|fonts.googleapis.com' src next.config.* --include=*.tsx --include=*.ts --include=*.css | head -30
```

Then run `scripts/verify-font-fixture-build.mjs fixture` with `--require-families` set to that list (see Resources). A partial fixture must fail this gate.

Observed failure it catches: a `.cjs` fixture sitting next to the approved `all-active/` directory measured 1 family / 7 WOFF2 while the app imported six families; the approved `font-response-fixture.json` measured 6 families / 38 WOFF2. The `.cjs` was rejected as a fixture — not deleted, not silently ignored.

Record the exclusion with its path, hash and reason in the manifest. An undocumented near-miss fixture is how a later run "succeeds" against the wrong bytes.

Require the loader proof too: a `installed-loader-proof.json` with per-family server/client checks and `networkCallsAllowed: 0` is what makes "no network at build" a claim rather than an assumption.

## Step 2 — Bind every input by hash before building

Write the fixture block into the input manifest, then make the runner re-verify it immediately before the build. Bind by absolute path plus SHA-256; include the CSS bodies, the WOFF2 bytes, `manifest.json`, the response fixture itself, the loader proof and the negative-extension fixture.

The decomposition must add up. If the manifest says 48 inputs, enumerate them: 6 CSS + 38 WOFF2 + 4 metadata files. A count that does not decompose is a binding you cannot audit.

Fail closed with a named error before the build starts:

```python
def verify_font_inputs():
    fixture = json.loads((PACKET/'INPUT-MANIFEST.json').read_text())['fontFixture']
    root = Path(fixture['root'])
    for relative, expected in fixture['files'].items():
        path = root/relative
        if not path.is_file() or digest(path) != expected:
            raise RuntimeError('FONT_INPUT_DRIFT_'+relative)
    return fixture['fixtureSha256'], str(root/'font-response-fixture.json')
```

Drift must abort, not warn. A build that proceeds past a drifted fixture produces valid-looking evidence for the wrong bytes.

## Step 3 — Build through the mock

```
NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<fixture-root>/font-response-fixture.json npm run build
```

The variable takes the path to the response fixture: a JSON object keyed by the exact Google CSS URL, each value the captured CSS body whose `url(...)` entries point at local WOFF2 files. Use the toolchain's Node version (the CI `setup-node` major), and record `node --version` into the proof so the result is reproducible.

Capture the full build log to a file. The log is an input to Step 4, not a debugging afterthought.

## Step 4 — Prove consumption, not success

Four checks, all required:

1. **Count** emitted `.woff2` under `.next/static/media`.
2. **Hash** each emitted file with SHA-256 and deduplicate.
3. **Set-compare** emitted digests against fixture digests in both directions: `emitted_not_in_fixture == 0` and `fixture_not_emitted == 0`.
4. **Grep the build log** for `fonts.googleapis.com` and `fonts.gstatic.com`; the count must be 0.

```
node scripts/verify-font-fixture-build.mjs emitted \
  --fixture <root>/font-response-fixture.json --media .next/static/media --log <build.log>
```

`VERDICT: PASS` requires all four. Emit the JSON form (`--json`) into the evidence file so the digests, not just the verdict, are archived.

Compare **content hashes, never filenames**: emitted media names are generated and differ from the content-addressed fixture stems. Equality of names is neither necessary nor expected; equality of hash sets is the proof.

## Bounds — what this does not prove

- **Not browser evidence.** A font fixture plus a source-level zoom test (`tests/resilience-zoom-compact-density-source.test.ts` and similar) is not native 125% browser evidence. Keep the browser matrix explicitly `NOT_RUN`, and say so in the same artifact that reports the build pass.
- **Not a product change.** The fixture alters build inputs only. Claiming it verifies rendering, typography at runtime, or zoom behaviour overstates it.
- **Not fixture provenance.** These checks prove the build consumed *this* fixture. Whether the fixture is the approved one rests on the capture authority recorded with it; do not self-certify that.

State the boundary in the acceptance record, not just in your reply — a passing font build next to an unqualified "A41 done" reads as browser acceptance to the next reader.

## Pitfalls

- **Missing font files stay silent without a check.** A path typo inside a CSS body resolves to nothing and the build still links the family. Always resolve every `url(...)` against the fixture root and assert existence.
- **Don't assume the binding map's field name.** A hash map located by walking the JSON is trustworthy; one read via a guessed key (`evidence`) that is actually a prose string is not. Verify the container's type and expected count before trusting entries.
- **Distinct URL references exceed distinct files.** Six CSS bodies referenced 111 `url(...)` entries but only 38 files; expect and reconcile that gap, because a "38 references" claim would be wrong.
- **Scope the log grep.** Count Google URLs in the build log only; the repo source legitimately contains `fonts.googleapis.com` links (print templates, CSS `@import`), and those are not build fetches.

## Resources

- `scripts/verify-font-fixture-build.mjs` — measures a fixture (`fixture` mode: families, unique WOFF2, missing files, content-address mismatches, required-family coverage) and verifies a build (`emitted` mode: emitted-vs-fixture set equality plus Google URL count in log). Exit 0 pass / 1 verification failure / 2 usage error; `--json` for evidence files.
- `references/fixture-anatomy.md` — the worked six-family example with measured counts, fixture/manifest shapes, and the `.cjs` rejection.
