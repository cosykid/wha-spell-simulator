# Recognition Pipeline

The parser uses a hybrid recognizer:

1. A decomposition layer proposes plausible stroke groups.
2. A template recognizer scores each group against dictionary-backed recognition examples.
3. When browser model assets are available, an ONNX-exported multi-head ResNet18 predicts glyph class and pose for each candidate, then reinforces, accepts, or overrides the template result under confidence and verifier rules.

The public entrypoint remains `classifyDrawing(...)`. Callers still receive compatible `Recognition`, `SymbolCandidate`, and `GlyphAST` structures. New matcher details live under diagnostics so the UI and compiler do not need to depend on low-level scoring internals.

As of June 16, 2026, the ML training dataset contains more than 8,000 hand-drawn labelled glyph samples collected through the Sample Maker workflow.

## Drawing Flow

`classifyDrawing(...)` performs these steps:

1. Clean strokes with the configured input thresholds.
2. Detect the spell ring and remove ring strokes from symbol recognition.
3. When no ring is found, build diagnostics-only preview candidates. If canvas guide geometry is available, use guide-relative layers so center sigils and sign-like marks can be labeled separately; otherwise build one synthetic standalone sigil preview candidate.
4. When a ring is found, classify strokes by ring-relative layer and boundary position.
5. Build symbol candidates from non-ring strokes. In-progress drawings use fast layer-aware proximity grouping; complete rings can use recognition-guided tree cuts to separate close symbols.
6. Recognize each candidate with the hybrid template plus ML recognizer.
7. Build `GlyphAST`, warnings, parser diagnostics, and compiler-ready recognitions.

The no-ring preview is diagnostics-only. It can show likely symbol labels while drawing, but it does not create a valid spell because the spell still needs a ring.

`classifyDrawingAsync(...)` produces the same result, but dispatches the final per-candidate recognition across a Web Worker pool when one is available. It falls back to the synchronous recognizer for non-browser runtimes, a single candidate, or any worker error, so both entrypoints return identical output. See [Parallel Recognition](#parallel-recognition).

## Decomposition

The decomposition layer works on whole cleaned strokes. It intentionally does not split a stroke into fragments yet.

Grouping starts from a proximity pass over non-ring strokes:

- Builds a proximity graph using bounding-box gap, sampled point distance, center distance, layer compatibility, and nearby polar angle.
- Gives center sigils extra tolerance so multi-stroke sigils can stay together even when their pieces do not overlap tightly.
- Uses connected components from that proximity graph as the starting groups.

Candidate building has two refinement modes:

- Fast layer-aware grouping is used for no-ring guide preview and incomplete or prepared rings. It keeps editing responsive, respects ring-relative layers, and rejoins touching same-layer fragments that belong to one rough multi-stroke sign.
- Recognition-guided decomposition is used for complete rings when `CONFIG.recognition.recognitionGuidedDecomposition` is on. It handles close or bridged symbols that proximity alone cannot separate, for example a center sigil drawn next to a ring sign.

In recognition-guided mode, each component is clustered into a single-linkage merge forest with union-find, every viable whole-symbol tree node is scored, and the parser chooses between keeping a node whole or taking its child groups. Each group in a cut pays `CONFIG.recognition.groupPenalty`, currently `0.75`, so a split only wins when the child groups clearly outscore the whole.

Node scoring during the tree cut is deliberately lightweight. It runs only the `$P` + chamfer shape match, not the full structural blend or ONNX inference, and it stops scoring signs for a node once a sigil clears a dominant threshold. The full hybrid recognizer runs once afterward on the chosen groups, so the expensive pass is not repeated per tree node. The union-find clustering also replaces an earlier all-pairs rescan, keeping the path fast.

The `groupPenalty` is tuned so complex multi-stroke sigils (water, wind, light) and multi-stroke signs (levitation, column) stay whole, while genuinely separate symbols split apart. Setting `recognitionGuidedDecomposition` to false keeps candidate building on the cheaper proximity path, which is responsive but cannot separate every bridged symbol.

The boxes shown by glyph diagnostics are candidate bounds, not every internal grouping possibility. A box around a tentative symbol means "these strokes were selected as one candidate for this parse." It does not mean the recognizer only sees square pixels.

## Template Matching

`src/lib/parser/shapeMatcher.ts` normalizes each candidate and example into two representations:

- A `$P`-style point cloud with order-tolerant nearest-neighbor distance.
- A low-resolution ink mask with a distance map for chamfer scoring and ink coverage.

The matcher records:

- `$pDistance` and `pScore`
- `chamferDistance` and `chamferScore`
- `candidateExplainedRatio`
- `templateCoveredRatio`
- `unexplainedInkRatio`

The core matcher confidence is:

```txt
0.45 * pScore + 0.35 * chamferScore
```

The `0.20` confidence headroom formerly reserved for kNN is intentionally left unfilled rather than renormalized. This keeps weak or ambiguous matches from looking stronger just because the kNN vote was removed.

The decomposition scorer runs only the `$P` + chamfer shape match and skips structural blending and status logic, which are reserved for the final pass over the chosen groups.

The symbol recognizer then blends matcher confidence with structural compatibility, layer fit, size fit, and candidate neatness. The final contextual score weights matcher confidence at `0.66` and structural compatibility at `0.16`, with the remainder split across layer fit, size fit, and neatness.

Structural compatibility checks aspect ratio, stroke count, stroke-length profile, dominant-axis alignment, and a **shape signature** that captures curve character. The shape signature is computed over the arc-length of the ink, not per stroke, so it does not depend on how a drawing is segmented into strokes:

- `straightness` — the arc-length fraction of the ink that runs locally straight. A polygon only spikes in curvature at its corners, while a smooth arc sustains curvature along its whole length, so angular glyphs score high and flowing ones score low.
- `loopRatio` — the arc-length fraction of the ink that lives in closed (looping) strokes.

For sigils, the structural score leads with shape compatibility (`0.5`) because aspect ratio is near-useless when most sigils fill the same square box; stroke-length profile and stroke count contribute the rest. This is what keeps an angular glyph (for example `crystal`) from being absorbed by a dense, flowing template (for example `aeriform`), which the ink-proximity matcher alone cannot separate since both fill the same bounds. Signs keep their stroke-structure-led blend, and simple signs get extra caps so a lone line is not too easily accepted as a complete sign.

Rough two-stroke sign candidates in sign-capable layers can receive a small structural confidence floor when they strongly match a simple sign such as `column`. This helps diagnostics prefer a rough column over a weak sigil guess such as `aeriform`, but acceptance still requires ink coverage, confidence, and structural compatibility.

Dictionary-derived recognition examples are cached per dictionary object, and candidate/example matcher scores are reused within a recognition pass. This keeps repeated entry scoring from recomputing the same normalized shape match.

## ML Recognition

`scripts/training/wha_multitask.py` defines the browser model architecture:

- `GlyphManifestDataset` loads rasterized glyph images and class/pose targets from `manifest.jsonl`.
- `GlyphResNet18MultiHead` adapts a ResNet18 backbone for grayscale glyph images.
- The class head predicts the glyph id.
- The pose head predicts angle as `[sin(angle), cos(angle)]`, plus normalized `scale_x`, `scale_y`, `center_x`, and `center_y`.

The training workflow in `scripts/training/run_glyph_training.sh` exports approved `labelled_samples` rows from Postgres, rasterizes them, trains the multi-head ResNet18 model, and exports the best checkpoint to:

```text
static/models/
  glyph-recognizer.onnx
  glyph-class-to-idx.json
```

The browser hybrid recognizer lives in `src/lib/parser/mlRecognizer.ts` and runs through `onnxruntime-web` when the model files are available. Template recognition still runs first. The ML result can:

- reinforce a matching template result when the model is more confident;
- accept a template-unknown candidate when the template verifier still sees glyph-like evidence;
- override a different template result when ML confidence and margin clear stricter thresholds;
- bypass the loose verifier only when the model is super-confident;
- fall back to template-only recognition if model loading or inference fails.

This keeps the learned model in charge for clear hand-drawn glyphs while using template geometry, layer constraints, and contamination checks to avoid accepting ordinary closed-set guesses for random ink.

## Parallel Recognition

Final candidate recognition is the dominant cost once candidates are grouped, and each candidate is scored independently. `classifyDrawingAsync(...)` fans template recognition across a long-lived Web Worker pool in `src/lib/parser/recognitionPool.ts`, then applies the browser ML recognizer over the resulting candidates when configured:

- The pool sizes itself to `min(8, hardwareConcurrency - 1)` module workers.
- Each worker (`src/lib/parser/recognitionWorker.ts`) is initialized once per dictionary, so its example caches warm up and persist across the candidates it scores.
- Candidates are dispatched independently and reassembled in their original order.

The pool degrades to the synchronous `recognizeCandidates(...)` when `Worker` is unavailable (server or test runtime), when there is at most one candidate, or when a worker errors. Output remains compatible either way, so `classifyDrawing(...)` stays correct for tests and server use while the browser UI uses `classifyDrawingAsync(...)`. The no-ring guide preview and prepared-ring paths still use cheap grouping first, then send final candidate recognition through the same async path when useful. The UI guards overlapping recomputes with a sequence token so only the newest result is applied, and disposes the pool when the parser view unmounts.

## Acceptance Rules

Recognition statuses are unchanged:

- `valid`
- `valid_messy`
- `ambiguous`
- `contaminated`
- `unknown`

For template-only recognition, a candidate is accepted only when all of these are true:

- Its final confidence meets `CONFIG.recognition.minConfidence`.
- Its unexplained ink stays below `CONFIG.recognition.contaminationThreshold`.
- Its template coverage meets `CONFIG.recognition.minTemplateCoverage`.

Close competitors, missing required ink, and structural mismatch can turn a high-looking score into `ambiguous` or `unknown`. Extra unrelated ink can produce `contaminated`.

For ML recognition, `CONFIG.recognition.ml` adds separate accept, override, and super-confident thresholds. ML acceptance still respects dictionary layer constraints and the template verifier unless the prediction clears the super-confident path.

## Rotation Semantics

Sigils use their dictionary rotation rules. `recognitionRotationInvariant` and `allowedRotationsDeg` are copied into recognition examples.

Signs keep their spell meaning from their original ring position and drawn orientation. For matching only, the recognizer rotates sign candidates into the canonical bottom-of-ring pose before comparison. The original `angleDeg`, `orientationDeg`, `directedOrientationDeg`, and `radialFacing` remain available to the compiler.

## Recognition Examples And Training Data

The recognizer consumes `RecognitionExample` objects:

```ts
{
	id: string;
	kind: 'sigil' | 'sign';
	symbolId: string;
	strokes: Point[][];
	source: string;
	rotationInvariant: boolean;
	allowedRotationsDeg?: number[];
}
```

`buildExamplesFromDictionary(...)` converts current dictionary `strokeTemplate`s into seed examples. Additional real user examples can be passed to `classifyDrawing(...)` or `recognizeCandidates(...)` without changing the recognizer API.

The ML model is trained from labelled handwriting samples captured by the Sample Maker, not from the dictionary templates alone. As of June 16, 2026, that dataset contains more than 8,000 hand-drawn samples.

## Storage

Runtime recognition does not query the database. The browser loads the static ONNX model and class map from `static/models/` when available, and the template recognizer derives `RecognitionExample` values from the in-repo dictionary at runtime.

The browser parser modules stay pure and server-portable. They do not import Neon or browser-only APIs.

Neon Postgres is still used to persist the by-eye labelled handwriting samples produced by the Sample Maker tool. Those samples are exported by the training scripts and compiled into the static model assets used by browser inference. See the Labelled Samples API in the README.

## Diagnostics Overlay

Glyph diagnostics now show tentative names from recognition diagnostics, not just final accepted labels. If a candidate is not accepted yet, the overlay can display the top match with a question mark and confidence value. This makes in-progress sigil recognition visible before the ring is completed.

For an accepted sigil or sign, the overlay also shows its size relative to its regular size as `×<ratio> <tag>` (for example `×1.32 strong`), where `ratio = sizeNorm / referenceSizeNorm` and the tag is `weak`, `regular`, or `strong`. Both sigils and signs carry a `referenceSizeNorm` in the dictionary, so the readout works for either. This surfaces the same size signal the compiler turns into spell strength, read from the raw candidate footprint rather than the size-invariant recognizer.

The overlay still draws candidate bounds. It does not visualize proximity graph edges, merge tree nodes, or the chamfer ink map.

## Tests

Relevant coverage:

- `tests/matcher.test.ts` covers point-cloud distance and chamfer scoring.
- `tests/mlRecognizer.test.ts` covers hybrid ML acceptance, override, verifier, and fallback behavior.
- `tests/decomposition.test.ts` covers grouping one sigil plus one sign, keeping nearby signs separate, preserving multi-stroke signs, rejoining touching sign fragments, ignoring ring strokes, contamination from noise, no-ring guide preview grouping, and prepared-ring fast grouping.
- `tests/symbolRecognition.test.ts` keeps recognition regressions for signs, sigils, diagnostics, rotation, contamination, messy valid matches, rough two-stroke column diagnostics, and curve-character separation (angular `crystal` ink is not absorbed by the flowing `aeriform` sigil).
- `tests/ringDetector.test.ts` keeps ring behavior independent of symbol recognition.
