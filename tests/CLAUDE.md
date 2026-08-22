# tests/

Unit tests for the pure core: recognition, the compiler, the spell field, presets, and stroke math. No browser, no DOM.

## How to run

```sh
npm run test:unit                              # node --import tsx --test tests/*.test.ts
node --import tsx --test tests/spellField.test.ts   # a single file while iterating
```

The whole suite is ~167 tests in ~11s. Run it before you commit.

## Map

Load-bearing coverage, largest first:

- [`symbolRecognition.test.ts`](symbolRecognition.test.ts) — `recognizeCandidates` against the real dictionary: rotation invariance, sigil-versus-sign confusion, contamination.
- [`spellField.test.ts`](spellField.test.ts) — `buildSpellField` / `sampleFieldForce`: the emergent-behaviour canon (vortex eye, swirl lift, spawn domains).
- [`decomposition.test.ts`](decomposition.test.ts) — `classifyDrawing` end to end: stroke cleaning, fragment grouping, rotated drawings.
- [`spellBuilder.test.ts`](spellBuilder.test.ts) — `compileSpell`: GlyphAST to SpellIR, warnings, prepared versus active.
- [`mlRecognizer.test.ts`](mlRecognizer.test.ts) — `acceptMlResult` and the hybrid override rules, driven by fake `MlPrediction` fixtures. No ONNX runtime loads.
- [`ringDetector.test.ts`](ringDetector.test.ts) — `detectRing` closure and multiple-ring rejection.
- [`spellPreset.test.ts`](spellPreset.test.ts) — serialize/deserialize round trip and `cutRingGap`.

The rest are small and single-subject: stroke erase and preview, spell summary, effect timing, shape placement, grouping proximity, the chamfer matcher, sample picking, password hashing, connection strings.

[`dictionaryFixtures.ts`](dictionaryFixtures.ts) is a helper, not a suite. Helpers carry no `.test.ts` suffix.

## Invariants and gotchas

- **Import source files with a `.js` extension on the `.ts` path** (`'../src/lib/compiler/spellBuilder.js'`). Bundler-style resolution requires it and tsx honours it. Copy a neighbour's import header.
- **Only `node:test` and `node:assert/strict` are available.** No Vitest, no jsdom, no `document` or `window`. Anything that needs the real page belongs in [`../tests-e2e/`](../tests-e2e/).
- **Never let a rune execute.** tsx strips types but does not compile runes, so evaluating `$state` throws `ReferenceError: $state is not defined`. Importing a `.svelte.ts` module is fine when the tested path avoids runes — `samplePicker.test.ts` imports pure helpers that sit beside a `$state` class — but do not construct the rune-bearing class.
- **The runner glob is one level deep.** A test in a subdirectory of `tests/` never runs.
- **Recognition tests read the real dictionary and the real `CONFIG`.** `readRealDictionary()` loads `src/lib/dictionary/{sigils,signs}/*.json` off disk. That coupling is deliberate coverage: editing a glyph or a threshold is supposed to move these tests. When one breaks after a dictionary edit, judge whether the new outcome is correct. Do not stub the dictionary out.
- **Drive the pipeline through `classifyDrawing`** from `src/lib/parser/classifier/index.js`. It is the synchronous template-only path with no workers and no ONNX. `classifyDrawingPhasedLocal` and `recognitionPool` load the ML runtime, so keep them out of unit tests.
- **Keep randomness injectable.** `spawnDomainPosition(domain, random)` and `weightedSample(symbols, counts, random)` both take a random function defaulting to `Math.random`. New field or simulation logic must offer the same seam or it cannot be asserted on.
- **No test touches a database.** `password.test.ts` exercises scrypt directly and `postgresConnection.test.ts` only normalizes connection strings. Keep it that way — DB coverage is opt-in and lives in the e2e specs.

## Writing a new test

1. Put the logic in a pure module under `src/lib/` and export it. If it is hard to test here, it is in the wrong place (code guide, Rule 9).
2. Create `tests/<subject>.test.ts` with the standard header: `node:assert/strict`, `node:test`, then `.js`-suffixed source imports.
3. Build fixtures with small local factory functions rather than JSON blobs. `sign()` in `spellField.test.ts` and `arcStroke()` in `ringDetector.test.ts` are the models.
4. For pipeline behaviour call `classifyDrawing({ strokes, previousRing: null, dictionary, config: CONFIG })` and assert on `ring`, `candidates`, `recognitions`, `glyphAST`.
5. Run the single file while iterating, then the full suite.

## Related

- [`../docs/CODE_GUIDE.md`](../docs/CODE_GUIDE.md) — Rule 9 covers what belongs here versus in an e2e spec.
- [`../docs/recognition.md`](../docs/recognition.md) — the pipeline these tests assert on.
- [`../tests-e2e/CLAUDE.md`](../tests-e2e/CLAUDE.md) — the browser-level counterpart.
