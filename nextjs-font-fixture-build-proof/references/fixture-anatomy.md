# Font Fixture Anatomy — Measured Example

All figures below were measured on a Next.js App Router repository with six Google font families imported from `next/font/google`, built with Node v22.23.2.

## The two candidates

| Candidate | Families | WOFF2 | SHA-256 | Outcome |
|---|---|---|---|---|
| `all-active/font-response-fixture.json` | 6 | 38 | `399c796fb0293a51a2323d533834dc4a6013afdf40d27ecf497540c67b84b725` | used |
| `actual-font-response-fixture.cjs` | 1 (Inter) | 7 | `3973cc4c68fd3d32b66e997f78cdd441b5de5f83c8524c5488515d805d967836` | rejected |

The `.cjs` was not stale or corrupt — its 7 referenced files existed and every one matched its content-addressed name. It was rejected purely on **coverage**: the app imports six families, the fixture supplied one. Coverage is the gate; provenance and integrity do not substitute for it.

## Approved fixture directory

48 files, which must decompose:

| Part | Count |
|---|---|
| CSS bodies (one per family) | 6 |
| WOFF2 under `font-files/` | 38 |
| `manifest.json`, `font-response-fixture.json`, `installed-loader-proof.json`, `negative-extension-fixture.json` | 4 |
| **Total** | **48** |

Additional measured values:

- WOFF2 bytes total: 635,264
- `installed-loader-proof.json`: 12 per-family checks (server and client), 0 network calls, SHA-256 `956fe33e4ccd46b648e1de18339e20867510d361bf1cd14702b969a9f9ba9dde`
- Distinct `url(...)` references: 111 (Inter 35, Lexend 21, Be Vietnam Pro 15, JetBrains Mono 18, Instrument Serif 4, Lexend Deca 18) mapping to 38 distinct files

## Response fixture shape

A JSON object keyed by the exact Google CSS URL, each value a CSS body with `url(...)` rewritten to an absolute local path:

```json
{
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap":
    "/* latin */\n@font-face {\n  font-family: 'Inter';\n  src: url(/abs/path/font-files/<sha256>.woff2) format('woff2');\n  ...\n}"
}
```

`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` points at this file. The keys must match the URLs the code requests — a weight or subset that the app requests but the fixture omits falls through to the network.

Because the local paths are absolute, the fixture root is machine-bound. Record its path in the manifest and re-verify the bytes; do not assume portability.

## Input manifest block

Bind the fixture as a first-class input group, not as loose extras:

```json
"fontFixture": {
  "root": "/abs/path/all-active",
  "authority": "<capture authority id>",
  "capturedAt": "<capture timestamp>",
  "sourceCandidateSha": "<sha the capture was taken at>",
  "fonts": 38,
  "families": ["Inter", "Lexend", "Be_Vietnam_Pro", "JetBrains_Mono", "Instrument_Serif", "Lexend_Deca"],
  "loaderChecks": 12,
  "networkCallsAllowed": 0,
  "realFontBytes": 635264,
  "fixtureSha256": "399c796f...",
  "loaderProof": "installed-loader-proof.json",
  "loaderProofSha256": "956fe33e...",
  "files": { "font-files/<stem>.woff2": "<sha256>", "Inter.css": "<sha256>", "...": "..." },
  "excludedAlternateFixture": {
    "path": "/abs/path/actual-font-response-fixture.cjs",
    "reason": "Inter-only (7 WOFF2); not the approved six-family fixture"
  }
}
```

`excludedAlternateFixture` is deliberate: the near-miss is recorded next to the accepted fixture so a reviewer can see the decision instead of an absence.

## Build result

```
emitted=38 unique=38 fixture=38
emitted_not_in_fixture=0 fixture_not_emitted=0
google_font_urls_in_log=0
VERDICT: PASS
```

Pair this with the build log hash and `node --version` in the same proof record. The set equality is the claim; the log grep is what rules out a mocked build that still reached the network for an unlisted family.

## Boundary note carried into acceptance

The same acceptance map recorded:

- `SA-A41` status `SOURCE_AND_I18N_CHECKED_FONT_FIXTURE_BOUND_BROWSER_PENDING`
- evidence: `i18n:check`, `resilience-zoom-compact-density-source.test.ts` (source-level only), the 48-input fixture binding, this build proof
- note: the source-level zoom test and font-input binding are **not** substitutes for native 125% browser evidence; that matrix remains `NOT_RUN`

Keep that split visible whenever a font build pass is reported.
