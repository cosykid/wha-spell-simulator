# src/lib/parser

Recognition. Turns raw `Stroke[]` into a `ClassifiedDrawing` (cleaned strokes, ring,
candidates, recognitions, `glyphAST`). Reports what was drawn, never what the spell does.

## File map

- [`classifier/`](classifier/) wires the stages together and holds the public entrypoints.
- [`strokeCleaner.ts`](strokeCleaner.ts), [`coordinateNormalizer.ts`](coordinateNormalizer.ts), [`layerMapper.ts`](layerMapper.ts) clean ink, then label strokes ring-relative.
- [`rings/`](rings/) ring detection: circle fit, angular coverage, glyph-loop veto. [`topology/`](topology/) is the raster flood fill, the only thing that sets `ring.complete`.
- [`grouping/`](grouping/) strokes to `SymbolCandidate[]`, by proximity or by recognition-guided tree cuts.
- [`shape-matcher/`](shape-matcher/) `$P` point-cloud distance plus chamfer over a rasterized ink distance map.
- [`recognition/`](recognition/) the deterministic recognizer: shape score, structural compatibility, layer fit, status.
- [`signRotation.ts`](signRotation.ts) rotates a sign's recognition copy into the canonical frame.
- [`ml/`](ml/) ONNX refinement: runtime load, raster render, predict, accept.
- [`recognitionMemo.ts`](recognitionMemo.ts) content-hash LRU caches shared by both passes.
- [`drawingClassifierClient.ts`](drawingClassifierClient.ts) + [`drawingClassifierWorker.ts`](drawingClassifierWorker.ts) the one off-thread classifier.
- [`recognitionPool.ts`](recognitionPool.ts) + [`recognitionWorker.ts`](recognitionWorker.ts) per-candidate fan-out, fallback path only.
- [`template-matcher/`](template-matcher/) standalone template scorer. Only `../ui/sigilDetector.ts` uses it, not the pipeline.

## How it works

`classifier/prepare.ts` cleans strokes, detects the ring, classifies strokes
against it, and groups candidates. `classifier/recognitionPass.ts` then runs the
template recognizer and, after it, the ML refinement. `classifier/assembly.ts`
folds the result into `GlyphAST` with warnings and global metrics.

Entrypoints in [`classifier/index.ts`](classifier/index.ts):

- `classifyDrawing` synchronous, template only. What unit tests call.
- `classifyDrawingPhasedLocal` emits a template result, then ML refinements.
- `classifyDrawingAsync` template pass over the recognition pool, then ML locally.
- `classifyDrawingOffThread` (in `drawingClassifierClient.ts`) is what the app calls.

Threading: the client keeps one module-level classifier worker, keyed by
dictionary/config/examples reference identity. A `classify` message returns a fast
`phase:'template'` result that resolves the promise, then `phase:'ml'` refinements
delivered through the `onMlResult` callback. Superseded requests reject with
`DrawingClassifierSupersededError`, which callers must swallow via
`isDrawingClassifierSuperseded`. `recognitionPool` is a separate fixed pool of
`min(hardwareConcurrency - 1, 8)` workers scoring one candidate per message. It runs
only inside `classifyDrawingAsync`, the fallback used when the classifier worker
cannot be created. The classifier worker itself scores candidates in-thread.

## Invariants and gotchas

- Recognition consumes `Stroke[]` and nothing else. Editable placements reach it
  only through `bakePlacementToStrokes` in `../input/shapeBaker.ts`. Do not teach
  the parser about `Placement`.
- `ring.complete` comes solely from topological closure. Open-ring coverage sets
  `completeness`, never `complete`. Meaning is assigned downstream: the compiler
  is what reads `complete` as "active". Keep that split.
- Ring-relative angles are math convention. `normalizePoint` and
  `angleDegFromCenter` flip y, so 0 is right, 90 is up, 270 is the bottom of the
  ring. Never mix them with raw canvas `atan2`.
- Sign templates are authored at 270 degrees. `signRotation.ts` rotates a _copy_
  into that frame and allows only +/- 15 degrees, because orientation is sign
  meaning. The public candidate keeps its true `angleDeg`. Do not widen that
  tolerance to rescue a miss.
- Recognition-guided decomposition runs only for complete rings.
  `classifier/prepare.ts` passes the dictionary to grouping only when
  `ring.complete`. In-progress drawings deliberately use the cheap proximity path.
- `config.recognition.groupPenalty` (0.55) must stay below the shape-match
  confidence real hand-drawn glyphs reach (roughly 0.55 to 0.75). Raise it and
  every group scores zero, the tree cut degenerates to touch merging, and
  adjacent symbols fuse.
- Memo keys are content hashes (`candidateContentKey`), not object identity,
  because strokes are structured-cloned across worker boundaries. Key new caches
  the same way.
- `ensureWorker` and `ensurePool` compare dictionary, config, and examples by
  reference. A fresh array literal for `recognitionExamples` on every call
  re-clones the dictionary into every worker. Reuse a stable reference.
- Only dictionary entries that yield a `RecognitionExample` are scored. An entry
  without `strokeTemplate.strokes` is invisible to the template recognizer.
- Every `session.run` goes through `runSession` in `ml/sessionQueue.ts`.
  Overlapping runs deadlock Firefox WebGPU. Never touch `runtime.session.run`.
- ONNX wasm paths are hardcoded to `/onnxruntime/`; `npm run postinstall` syncs
  the files into `static/`. ML stays advisory: if the runtime is missing or
  inference throws, `ml/hybrid.ts` returns the template results with
  `diagnostics.ml.available: false`.
- The ML class map holds ids with no dictionary JSON (`cool`, `gather`, `orb`).
  `ml/dictionary.ts` cannot resolve them, so `acceptMlResult` rejects them as
  `unknown_class`. Expected, not a bug.

## Extending

- New glyph: edit dictionary JSON only. See [`../dictionary/CLAUDE.md`](../dictionary/CLAUDE.md).
- New recognition signal: extend `structuralCompatibility` (`recognition/features.ts`) or `shape-matcher/scoring.ts`, then re-run `tests/symbolRecognition.test.ts`.
- Change when ML wins: `acceptMlResult` in `ml/acceptance.ts` is the single
  decision point. Every branch returns a named `reason` that surfaces in diagnostics.
- New warning: add the key to [`glyphWarnings.ts`](glyphWarnings.ts), emit it from `warningList` in `classifier/metrics.ts`.
- Tune thresholds in `../config.ts` under `recognition`, never inline.

## Related

- [`../../../docs/recognition.md`](../../../docs/recognition.md) full pipeline reference and scoring math.
- [`../../../docs/glyph-ast.md`](../../../docs/glyph-ast.md) the `GlyphAST` output contract.
- [`../dictionary/CLAUDE.md`](../dictionary/CLAUDE.md) where sigils and signs come from.
- [`../ui/simulator/CLAUDE.md`](../ui/simulator/CLAUDE.md) debounce, sequence guarding, and how results reach the UI.
- [`../field/CLAUDE.md`](../field/CLAUDE.md) how a sign's `rotationOffsetDeg` becomes force.
