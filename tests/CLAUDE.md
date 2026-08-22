# tests/

Unit tests for the pure core: recognition, the compiler, the spell field, presets, and stroke math. No browser, no DOM.

## How to run

```sh
npm run test:unit                              # node --import tsx --test tests/*.test.ts
node --import tsx --test tests/spellField.test.ts   # a single file while iterating
npm run test:golden                            # the motion golden tier, in tests/golden/
npm run test:golden:update                     # rewrite its baseline PNGs
```

The whole suite is ~176 tests in ~11s. Run it before you commit.

## Map

Load-bearing coverage, largest first:

- [`symbolRecognition.test.ts`](symbolRecognition.test.ts) — `recognizeCandidates` against the real dictionary: rotation invariance, sigil-versus-sign confusion, contamination.
- [`spellField.test.ts`](spellField.test.ts) — `buildSpellField` / `sampleFieldForce`: the emergent-behaviour canon (vortex eye, swirl lift, spawn domains).
- [`spellPlan.test.ts`](spellPlan.test.ts) — `resolvePlan` and its rule modules. **Law tests**: every test names the ruling id it pins from [`../docs/animation-spec.md`](../docs/animation-spec.md), so re-ruling canon is a visible edit here rather than a tuning drift.
- [`decomposition.test.ts`](decomposition.test.ts) — `classifyDrawing` end to end: stroke cleaning, fragment grouping, rotated drawings.
- [`spellBuilder.test.ts`](spellBuilder.test.ts) — `compileSpell`: GlyphAST to SpellIR, warnings, prepared versus active.
- [`mlRecognizer.test.ts`](mlRecognizer.test.ts) — `acceptMlResult` and the hybrid override rules, driven by fake `MlPrediction` fixtures. No ONNX runtime loads.
- [`ringDetector.test.ts`](ringDetector.test.ts) — `detectRing` closure and multiple-ring rejection.
- [`spellPreset.test.ts`](spellPreset.test.ts) — serialize/deserialize round trip and `cutRingGap`.

The rest are small and single-subject: stroke erase and preview, spell summary, effect timing, shape placement, grouping proximity, the chamfer matcher, sample picking, password hashing, connection strings.

[`dictionaryFixtures.ts`](dictionaryFixtures.ts) is a helper, not a suite. Helpers carry no `.test.ts` suffix.

## The golden tiers

[`golden/`](golden/) is the renderer-independent half of the verification rig in
[`../docs/animation-redesign.md`](../docs/animation-redesign.md) phase 0. For every
[lab preset](../src/lib/ui/spellEffectLabPresets.ts) it advects a seeded population of parcels
through `buildSpellField` / `sampleFieldForce` and rasterizes their positions at fixed timestamps
into committed PNGs, then re-renders and byte-compares.

- [`motion.ts`](golden/motion.ts) the fixed-step simulation · [`rasterizer.ts`](golden/rasterizer.ts) two seal-space panels · [`png.ts`](golden/png.ts) and [`rng.ts`](golden/rng.ts) salvaged from the `theorycrafting` branch.
- [`probes.ts`](golden/probes.ts) is the old scorecard as data: one row is one claim about one preset at one point and time, tagged with the ruling it pins in [`../docs/animation-spec.md`](../docs/animation-spec.md). `rulingId: 'legacy'` means current-engine behaviour no ruling covers yet.
- [`frames.ts`](golden/frames.ts) owns which presets and timestamps a baseline exists for; [`update.ts`](golden/update.ts) rewrites them.

Beside it sits the **cast tier**, the same idea run through `cast/` instead of `field/`:
[`casts.ts`](golden/casts.ts) compiles each lab preset's plan to a `SpellScore`, simulates it, and
rasterizes the parcels at 1100ms, 1600ms and 2600ms: one timestamp inside the strike, two inside the
body of a 4-second cast. It reads only the score's two inputs (a pinned duration and a pinned
signature), so a field or renderer change can never move a cast baseline. Its gate is the redesign's
replayability contract: [`cast.test.ts`](golden/cast.test.ts) checks that stepping fresh to a
timestamp is bit-identical to stepping there incrementally, that two renders produce the same bytes,
and that the charge beat is silent (R-01). Law tests for the same layers live one level up in
[`../tests/spellScore.test.ts`](spellScore.test.ts) and [`../tests/castSim.test.ts`](castSim.test.ts),
with the Paint layer's pure half (look resolution, the painter's size, fade and depth arithmetic) in
[`../tests/castLooks.test.ts`](castLooks.test.ts).

Below both sits the **plan tier**, the cheapest of the four: [`plans.ts`](golden/plans.ts) resolves each
lab preset to a `SpellPlan` and serializes it, [`plan.test.ts`](golden/plan.test.ts) compares the text
against [`plans/`](golden/plans/), one committed file per preset, and the same `update.ts` rewrites
those too. A changed canon ruling shows up as a changed line a reviewer can read.

Rules that keep it a baseline instead of a coin flip:

- **Nothing under `golden/` may call `Math.random` or read a clock.** Seeds come from `presetSeed(preset.id)`, time advances in whole `MOTION.stepMs` steps, and `stepsFor` must land exactly on every sampled timestamp.
- **It lives one level down on purpose.** The `test:unit` glob is one level deep, so the unit suite never depends on baseline PNGs, and `test:golden` runs the same `node --import tsx --test` toolchain.
- **Regenerate deliberately.** A field change moves every motion baseline and a score or sim change moves every cast baseline; run `npm run test:golden:update` and read the image diff before committing. Baselines are byte-compared, so an encoder or rasterizer tweak rewrites all 72 PNGs at once.
- **New behaviour gets a probe row, not a new closure.** Add a row citing its ruling id. If no ruling covers it, use `legacy` and say so in the row's `claim`.

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
