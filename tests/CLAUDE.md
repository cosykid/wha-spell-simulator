# tests/

Unit tests for the pure core: recognition, the compiler, the cast, presets, and stroke math. No browser, no DOM.

## How to run

```sh
npm run test:unit                                # node --import tsx --test tests/*.test.ts
node --import tsx --test tests/spellPlan.test.ts # a single file while iterating
npm run test:golden                              # the cast and plan golden tiers, in tests/golden/
npm run test:golden:update                       # rewrite their baselines
```

The whole suite is ~240 tests in ~13s. Run it before you commit.

## Map

Load-bearing coverage, largest first:

- [`symbolRecognition.test.ts`](symbolRecognition.test.ts) — `recognizeCandidates` against the real dictionary: rotation invariance, sigil-versus-sign confusion, contamination.
- [`spellPlan.test.ts`](spellPlan.test.ts) — `resolvePlan` and its rule modules. **Law tests**: every test names the ruling id it pins from [`../docs/animation-spec.md`](../docs/animation-spec.md), so re-ruling canon is a visible edit here rather than a tuning drift.
- [`spellScore.test.ts`](spellScore.test.ts), [`castSim.test.ts`](castSim.test.ts), [`castLooks.test.ts`](castLooks.test.ts) — the cast's three layers: the beat clock and track envelopes, the fixed-step replayable sim, and the pure half of Paint.
- [`sealReading.test.ts`](sealReading.test.ts) — `readSeal`: the facing source hierarchy, dead band, hysteresis, symmetry snap.
- [`decomposition.test.ts`](decomposition.test.ts) — `classifyDrawing` end to end: stroke cleaning, fragment grouping, rotated drawings.
- [`spellBuilder.test.ts`](spellBuilder.test.ts) — `compileSpell`: GlyphAST to SpellIR, warnings, prepared versus active.
- [`mlRecognizer.test.ts`](mlRecognizer.test.ts) — `acceptMlResult` and the hybrid override rules, driven by fake `MlPrediction` fixtures. No ONNX runtime loads.
- [`ringDetector.test.ts`](ringDetector.test.ts) — `detectRing` closure and multiple-ring rejection.
- [`spellPreset.test.ts`](spellPreset.test.ts) — serialize/deserialize round trip and `cutRingGap`.

The rest are small and single-subject: stroke erase and preview, spell summary, activation carry, the plan digest, the portal projection, shape placement, grouping proximity, the chamfer matcher, sample picking, password hashing, connection strings.

[`dictionaryFixtures.ts`](dictionaryFixtures.ts) is a helper, not a suite. Helpers carry no `.test.ts` suffix.

## The golden tiers

[`golden/`](golden/) is the renderer-independent half of the verification rig in
[`../docs/animation-redesign.md`](../docs/animation-redesign.md). Two tiers, both pure Node, both
keyed on the [lab presets](../src/lib/ui/spellEffectLabPresets.ts). The field motion tier that used to
sit beside them died with `sampleFieldForce`.

The **cast tier** is the motion tier now. [`casts.ts`](golden/casts.ts) compiles each lab preset's
plan to a `SpellScore`, simulates it, and rasterizes the parcels at 850ms, 1100ms, 1600ms and 2600ms:
the ambient medium alone during the charge, one timestamp inside the strike, two inside the body of a
4-second cast. It reads only the score's two inputs (a pinned duration and a pinned signature), so a
compiler or renderer change cannot move a cast baseline and a score or sim change always does. Its
gate is the redesign's replayability contract: [`cast.test.ts`](golden/cast.test.ts) checks that
stepping fresh to a timestamp is bit-identical to stepping there incrementally, that two renders
produce the same bytes, and that the charge beat holds the ambient medium and nothing else (R-01,
R-02).

- [`rasterizer.ts`](golden/rasterizer.ts) two seal-space panels · [`png.ts`](golden/png.ts) and [`rng.ts`](golden/rng.ts) salvaged from the `theorycrafting` branch · [`update.ts`](golden/update.ts) rewrites both tiers' baselines.
- [`castProbes.ts`](golden/castProbes.ts) over [`castProbeMetrics.ts`](golden/castProbeMetrics.ts) is the **probe table**: one row is one claim about one cast at one moment, tagged with the ruling it pins in [`../docs/animation-spec.md`](../docs/animation-spec.md), measured on the parcels a score advected and selecting them in R-10's vocabulary (`medium`, `manifested`, or one primitive by name). Most rows name a lab preset; `pinwheel` is a fixture, because R-05's circulation is a column-family aggregate and no preset draws tangential columns.
- Law tests for the same layers live one level up in [`spellScore.test.ts`](spellScore.test.ts) and [`castSim.test.ts`](castSim.test.ts), with the Paint layer's pure half (look resolution, the painter's size, fade and depth arithmetic) in [`castLooks.test.ts`](castLooks.test.ts).

Below it sits the **plan tier**, the cheapest of the three: [`plans.ts`](golden/plans.ts) resolves each
lab preset to a `SpellPlan` and serializes it, [`plan.test.ts`](golden/plan.test.ts) compares the text
against [`plans/`](golden/plans/), one committed file per preset, and the same `update.ts` rewrites
those too. A changed canon ruling shows up as a changed line a reviewer can read.

Rules that keep it a baseline instead of a coin flip:

- **Nothing under `golden/` may call `Math.random` or read a clock.** The only randomness is the score's own seeded `Rng`, and every sampled timestamp must land on a whole `CAST.stepMs` step (`landsOnStep`).
- **It lives one level down on purpose.** The `test:unit` glob is one level deep, so the unit suite never depends on baseline PNGs, and `test:golden` runs the same `node --import tsx --test` toolchain.
- **Regenerate deliberately.** A score or sim change moves every cast baseline; run `npm run test:golden:update` and read the image diff before committing. Baselines are byte-compared, so an encoder or rasterizer tweak rewrites all 52 PNGs at once. Adding a track moves _every_ cast baseline even where its own tracks are untouched, because emission draws from one seeded stream; check the track params rather than the pixels when you need to prove a behaviour did not change.
- **New behaviour gets a probe row, not a new closure.** Add a row citing the ruling id it pins. If no ruling covers it, the claim belongs in an open canon question first.
- **A new lab preset owes the full golden set**: a plan text, four cast PNGs, three look snapshots, and at least one probe row for whatever it was added to cover.

## Invariants and gotchas

- **Import source files with a `.js` extension on the `.ts` path** (`'../src/lib/compiler/spellBuilder.js'`). Bundler-style resolution requires it and tsx honours it. Copy a neighbour's import header.
- **Only `node:test` and `node:assert/strict` are available.** No Vitest, no jsdom, no `document` or `window`. Anything that needs the real page belongs in [`../tests-e2e/`](../tests-e2e/).
- **Never let a rune execute.** tsx strips types but does not compile runes, so evaluating `$state` throws `ReferenceError: $state is not defined`. Importing a `.svelte.ts` module is fine when the tested path avoids runes — `samplePicker.test.ts` imports pure helpers that sit beside a `$state` class — but do not construct the rune-bearing class.
- **The runner glob is one level deep.** A test in a subdirectory of `tests/` never runs.
- **Recognition tests read the real dictionary and the real `CONFIG`.** `readRealDictionary()` loads `src/lib/dictionary/{sigils,signs}/*.json` off disk. That coupling is deliberate coverage: editing a glyph or a threshold is supposed to move these tests. When one breaks after a dictionary edit, judge whether the new outcome is correct. Do not stub the dictionary out.
- **Drive the pipeline through `classifyDrawing`** from `src/lib/parser/classifier/index.js`. It is the synchronous template-only path with no workers and no ONNX. `classifyDrawingPhasedLocal` and `recognitionPool` load the ML runtime, so keep them out of unit tests.
- **Keep randomness injectable.** `sampleAperture(aperture, rng)` takes the cast's seeded `Rng` and `weightedSample(symbols, counts, random)` takes a random function defaulting to `Math.random`. New simulation logic must offer the same seam or it cannot be asserted on.
- **No test touches a database.** `password.test.ts` exercises scrypt directly and `postgresConnection.test.ts` only normalizes connection strings. Keep it that way — DB coverage is opt-in and lives in the e2e specs.

## Writing a new test

1. Put the logic in a pure module under `src/lib/` and export it. If it is hard to test here, it is in the wrong place (code guide, Rule 9).
2. Create `tests/<subject>.test.ts` with the standard header: `node:assert/strict`, `node:test`, then `.js`-suffixed source imports.
3. Build fixtures with small local factory functions rather than JSON blobs. `sign()` in `spellPlan.test.ts` and `arcStroke()` in `ringDetector.test.ts` are the models.
4. For pipeline behaviour call `classifyDrawing({ strokes, previousRing: null, dictionary, config: CONFIG })` and assert on `ring`, `candidates`, `recognitions`, `glyphAST`.
5. Run the single file while iterating, then the full suite.

## Related

- [`../docs/CODE_GUIDE.md`](../docs/CODE_GUIDE.md) — Rule 9 covers what belongs here versus in an e2e spec.
- [`../docs/recognition.md`](../docs/recognition.md) — the pipeline these tests assert on.
- [`../tests-e2e/CLAUDE.md`](../tests-e2e/CLAUDE.md) — the browser-level counterpart.
