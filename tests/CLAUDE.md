# tests/

Unit tests for the pure core: recognition, the compiler, the cast, presets, and stroke math. No browser, no DOM.

## How to run

```sh
npm run test:unit                                # node --import tsx --test tests/*.test.ts
node --import tsx --test tests/spellPlan.test.ts # a single file while iterating
npm run test:golden                              # the cast and plan golden tiers, in tests/golden/
npm run test:golden:update                       # rewrite their baselines
```

The whole suite is ~250 tests in ~15s. Run it before you commit.

## Map

Load-bearing coverage, largest first:

- [`symbolRecognition.test.ts`](symbolRecognition.test.ts) — `recognizeCandidates` against the real dictionary: rotation invariance, sigil-versus-sign confusion, contamination.
- [`castHybrid.test.ts`](castHybrid.test.ts) — the substrate's pure core: the flow field both populations ride, the anti-confetti law, the ring attractor, the pigment ramp, the shared pool and the brush population. Its GPU half is a transcription of the same arithmetic and the look tier owns its pixels.
- [`spellPlan.test.ts`](spellPlan.test.ts) — `resolvePlan` and its rule modules. **Law tests**: every test names the ruling id it pins from [`../docs/animation-spec.md`](../docs/animation-spec.md), so re-ruling canon is a visible edit here rather than a tuning drift.
- [`spellScore.test.ts`](spellScore.test.ts), [`castCells.test.ts`](castCells.test.ts), [`castLooks.test.ts`](castLooks.test.ts) — the cast's three layers: the beat clock and track envelopes, the cell contract every performer keeps, and the look table. The per-cell law suites (`cellsDirectional`, `cellsHold`, `cellsSwirl`) sit beside them.
- [`sealReading.test.ts`](sealReading.test.ts) — `readSeal`: the facing source hierarchy, dead band, hysteresis, symmetry snap.
- [`decomposition.test.ts`](decomposition.test.ts) — `classifyDrawing` end to end: stroke cleaning, fragment grouping, rotated drawings.
- [`spellBuilder.test.ts`](spellBuilder.test.ts) — `compileSpell`: GlyphAST to SpellIR, warnings, prepared versus active.
- [`mlRecognizer.test.ts`](mlRecognizer.test.ts) — `acceptMlResult` and the hybrid override rules, driven by fake `MlPrediction` fixtures. No ONNX runtime loads.
- [`ringDetector.test.ts`](ringDetector.test.ts) — `detectRing` closure and multiple-ring rejection.
- [`spellPreset.test.ts`](spellPreset.test.ts) — serialize/deserialize round trip and `cutRingGap`.

The rest are small and single-subject: stroke erase and preview, spell summary, activation carry, the plan digest, the portal projection, shape placement, grouping proximity, the chamfer matcher, sample picking, password hashing, connection strings, the classic engine's field adapter ([`classicField.test.ts`](classicField.test.ts)) and the effect-style narrowing ([`effectStyle.test.ts`](effectStyle.test.ts)).

[`dictionaryFixtures.ts`](dictionaryFixtures.ts) is a helper, not a suite. Helpers carry no `.test.ts` suffix.

## The golden tiers

[`golden/`](golden/) is the renderer-independent half of the verification rig in
[`../docs/animation-redesign.md`](../docs/animation-redesign.md). Two tiers, both pure Node, both
keyed on the [lab presets](../src/lib/ui/spellEffectLabPresets.ts). The field motion tier that used to
sit beside them died with `sampleFieldForce`.

**Both golden tiers here are stage-only, and that is a decision rather than an
omission.** The cast tier serializes a cell scene graph — per track, per form,
every uniform a cell wrote — and the classic engine has no cells, no tracks and
no forms to serialize. It also stands on a determinism contract classic cannot
satisfy: classic calls `Math.random` about eighty times across its renderers and
would not be classic if it stopped. What pixels can say about it is said by the
look tier's `classic-*` baselines in
[`../tests-e2e/golden-look.e2e.ts`](../tests-e2e/golden-look.e2e.ts), with
`Math.random` seeded in the page; what its adapter says is unit-tested in
[`classicField.test.ts`](classicField.test.ts).

The **cast tier** is the motion tier now. [`casts.ts`](golden/casts.ts) compiles each lab preset's
plan to a `SpellScore`, performs it through the real cells on a headless substrate, and writes their
state as text at 850ms, 1100ms, 1600ms and 2600ms: the ambient medium alone during the charge, one
timestamp inside the strike, two inside the body of a 4-second cast. What it writes is each cell's
own **report** (how loudly it paints, where its mass stands, where its declared form is rooted and
reaches, its mark tallies, the scalars its archetype publishes), the **flow field** it wrote measured
at four fixed seal-space points, and the **ceiling** a holder publishes. No pixels — the mass lives in
a GPU texture and pure Node has no context, so pixel truth belongs to the look tier in
[`../tests-e2e/golden-look.e2e.ts`](../tests-e2e/golden-look.e2e.ts). It reads only the score's two
inputs (a pinned duration and a pinned signature), so a compiler change cannot move a cast baseline
and a score or cell change always does. Its gate is the redesign's replayability contract:
[`cast.test.ts`](golden/cast.test.ts) checks that stepping fresh to a timestamp reaches the same
state as stepping there incrementally, that two performances read the same, and that the charge beat
holds the ambient medium and nothing else (R-01, R-02).

- [`../castHarness.ts`](castHarness.ts) is the one place a test builds a cast, so this tier and the unit suites cannot disagree about how the stage builds one; [`cellHarness.ts`](golden/cellHarness.ts) re-exports it · [`cellState.ts`](golden/cellState.ts) reads a frame out as text · [`update.ts`](golden/update.ts) rewrites both tiers' baselines.
- [`castProbes.ts`](golden/castProbes.ts) over [`castProbeMetrics.ts`](golden/castProbeMetrics.ts) is the **probe table**: one row is one claim about one cast at one moment, tagged with the ruling it pins in [`../docs/animation-spec.md`](../docs/animation-spec.md), measured on the report a cell actually reached and selecting cells in R-10's vocabulary (`medium`, `manifested`, or one primitive by name). The metrics are `ink`, `marks`, one named `detail`, and the `mass`, `root`, `tip` and `ceiling` a cell declares. Every row names a lab preset; the hand-built `pinwheel` fixture retired when `column-pinwheel` joined them.
- Law tests for the same layers live one level up in [`spellScore.test.ts`](spellScore.test.ts) and [`castCells.test.ts`](castCells.test.ts), with the look table's own arguments in [`castLooks.test.ts`](castLooks.test.ts).

Below it sits the **plan tier**, the cheapest of the three: [`plans.ts`](golden/plans.ts) resolves each
lab preset to a `SpellPlan` and serializes it, [`plan.test.ts`](golden/plan.test.ts) compares the text
against [`plans/`](golden/plans/), one committed file per preset, and the same `update.ts` rewrites
those too. A changed canon ruling shows up as a changed line a reviewer can read.

Rules that keep it a baseline instead of a coin flip:

- **Nothing under `golden/` may call `Math.random` or read a clock.** The only randomness is each cell's own seeded `Rng`, and every sampled timestamp must land on a whole `STAGE.stepMs` step (`landsOnStep`).
- **It lives one level down on purpose.** The `test:unit` glob is one level deep, so the unit suite never depends on committed baselines, and `test:golden` runs the same `node --import tsx --test` toolchain.
- **Regenerate deliberately.** A score or cell change moves every cast baseline; run `npm run test:golden:update` and read the text diff before committing. Adding a track moves _every_ cast baseline even where its own tracks are untouched, because the cells are seeded from the score signature; read the changed lines rather than counting the files when you need to prove a behaviour did not change.
- **New behaviour gets a probe row, not a new closure.** Add a row citing the ruling id it pins. If no ruling covers it, the claim belongs in an open canon question first.
- **A new lab preset owes the full golden set**: a plan text, a cast text, three look snapshots, and at least one probe row for whatever it was added to cover.

## Invariants and gotchas

- **Import source files with a `.js` extension on the `.ts` path** (`'../src/lib/compiler/spellBuilder.js'`). Bundler-style resolution requires it and tsx honours it. Copy a neighbour's import header.
- **Only `node:test` and `node:assert/strict` are available.** No Vitest, no jsdom, no `document` or `window`. Anything that needs the real page belongs in [`../tests-e2e/`](../tests-e2e/).
- **Never let a rune execute.** tsx strips types but does not compile runes, so evaluating `$state` throws `ReferenceError: $state is not defined`. Importing a `.svelte.ts` module is fine when the tested path avoids runes — `samplePicker.test.ts` imports pure helpers that sit beside a `$state` class — but do not construct the rune-bearing class.
- **The runner glob is one level deep.** A test in a subdirectory of `tests/` never runs.
- **Recognition tests read the real dictionary and the real `CONFIG`.** `readRealDictionary()` loads `src/lib/dictionary/{sigils,signs}/*.json` off disk. That coupling is deliberate coverage: editing a glyph or a threshold is supposed to move these tests. When one breaks after a dictionary edit, judge whether the new outcome is correct. Do not stub the dictionary out.
- **Drive the pipeline through `classifyDrawing`** from `src/lib/parser/classifier/index.js`. It is the synchronous template-only path with no workers and no ONNX. `classifyDrawingPhasedLocal` and `recognitionPool` load the ML runtime, so keep them out of unit tests.
- **Keep randomness injectable.** A cell draws from the `Rng` its `CellContext` seeds and `weightedSample(symbols, counts, random)` takes a random function defaulting to `Math.random`. New performance logic must offer the same seam or it cannot be asserted on.
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
