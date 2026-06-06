# Recognition Pipeline

The parser uses a two-layer recognizer:

1. A decomposition layer proposes plausible stroke groups.
2. A shape recognizer scores each group against dictionary-backed recognition examples.

The public entrypoint remains `classifyDrawing(...)`. Callers still receive compatible `Recognition`, `SymbolCandidate`, and `GlyphAST` structures. New matcher details live under diagnostics so the UI and compiler do not need to depend on low-level scoring internals.

## Drawing Flow

`classifyDrawing(...)` performs these steps:

1. Clean strokes with the configured input thresholds.
2. Detect the spell ring and remove ring strokes from symbol recognition.
3. When no ring is found, build a synthetic standalone sigil preview candidate so diagnostics can show a tentative sigil label before the enclosing circle exists.
4. When a ring is found, classify strokes by ring-relative layer and boundary position.
5. Build symbol candidates from non-ring strokes with proximity grouping plus recognition-guided tree cuts.
6. Recognize each candidate with the hybrid shape matcher.
7. Build `GlyphAST`, warnings, parser diagnostics, and compiler-ready recognitions.

The no-ring preview is diagnostics-only. It can show a likely sigil while drawing, but it does not create a valid spell because the spell still needs a ring.

`classifyDrawingAsync(...)` produces the same result, but dispatches the final per-candidate recognition across a Web Worker pool when one is available. It falls back to the synchronous recognizer for non-browser runtimes, a single candidate, or any worker error, so both entrypoints return identical output. See [Parallel Recognition](#parallel-recognition).

## Decomposition

The decomposition layer works on whole cleaned strokes. It intentionally does not split a stroke into fragments yet.

Grouping starts from a proximity pass over non-ring strokes:

- Builds a proximity graph using bounding-box gap, sampled point distance, center distance, layer compatibility, and nearby polar angle.
- Gives center sigils extra tolerance so multi-stroke sigils can stay together even when their pieces do not overlap tightly.
- Uses connected components from that proximity graph as the starting groups.

Proximity alone cannot separate two symbols that are bridged into one connected component, for example a center sigil drawn next to a ring sign. So by default (`CONFIG.recognition.recognitionGuidedDecomposition`, on) each component is then refined with a recognition-guided tree cut: it is clustered into a single-linkage merge forest with union-find, every viable whole-symbol tree node is scored, and the parser chooses between keeping a node whole or taking its child groups. Each group in a cut pays `CONFIG.recognition.groupPenalty`, currently `0.75`, so a split only wins when the child groups clearly outscore the whole.

Node scoring during the tree cut is deliberately lightweight. It runs only the `$P` + chamfer shape match, not kNN voting or the full structural blend, and it stops scoring signs for a node once a sigil clears a dominant threshold. The full hybrid recognizer runs once afterward on the chosen groups, so the expensive pass is not repeated per tree node. The union-find clustering also replaces an earlier all-pairs rescan, keeping the path fast.

The `groupPenalty` is tuned so complex multi-stroke sigils (water, wind, light) and multi-stroke signs (levitation, column) stay whole, while genuinely separate symbols split apart. Setting `recognitionGuidedDecomposition` to false falls back to plain proximity-connected-component grouping, which is cheaper but cannot separate bridged symbols.

The boxes shown by glyph diagnostics are candidate bounds, not every internal grouping possibility. A box around a tentative symbol means "these strokes were selected as one candidate for this parse." It does not mean the recognizer only sees square pixels.

## Shape Matching

`src/lib/parser/shapeMatcher.ts` normalizes each candidate and example into two representations:

- A `$P`-style point cloud with order-tolerant nearest-neighbor distance.
- A low-resolution ink mask with a distance map for chamfer scoring and ink coverage.

The matcher records:

- `$pDistance` and `pScore`
- `chamferDistance` and `chamferScore`
- `candidateExplainedRatio`
- `templateCoveredRatio`
- `unexplainedInkRatio`
- kNN votes and nearest examples

For v1, the core matcher confidence is:

```txt
0.45 * pScore + 0.35 * chamferScore + 0.20 * knnVoteConfidence
```

The symbol recognizer then blends that matcher confidence with structural compatibility, layer fit, size fit, and candidate neatness. Structural compatibility checks aspect ratio, stroke count, stroke-length profile, and dominant-axis alignment. Simple signs get extra caps so a lone line is not too easily accepted as a complete sign.

Dictionary-derived recognition examples are cached per dictionary object, and candidate/example matcher scores are reused within a recognition pass. This keeps repeated kNN voting and final entry scoring from recomputing the same normalized shape match.

## Parallel Recognition

Final candidate recognition is the dominant cost once candidates are grouped, and each candidate is scored independently. `classifyDrawingAsync(...)` fans those per-candidate scores across a long-lived Web Worker pool in `src/lib/parser/recognitionPool.ts`:

- The pool sizes itself to `min(8, hardwareConcurrency - 1)` module workers.
- Each worker (`src/lib/parser/recognitionWorker.ts`) is initialized once per dictionary, so its example caches warm up and persist across the candidates it scores.
- Candidates are dispatched independently and reassembled in their original order.

The pool degrades to the synchronous `recognizeCandidates(...)` when `Worker` is unavailable (server or test runtime), when there is at most one candidate, or when a worker errors. Output is identical to the synchronous path either way, so `classifyDrawing(...)` stays correct for tests and server use while the browser UI uses `classifyDrawingAsync(...)`. The UI guards overlapping recomputes with a sequence token so only the newest result is applied, and disposes the pool when the parser view unmounts.

## Acceptance Rules

Recognition statuses are unchanged:

- `valid`
- `valid_messy`
- `ambiguous`
- `contaminated`
- `unknown`

A candidate is accepted only when all of these are true:

- Its final confidence meets `CONFIG.recognition.minConfidence`.
- Its unexplained ink stays below `CONFIG.recognition.contaminationThreshold`.
- Its template coverage meets `CONFIG.recognition.minTemplateCoverage`.
- The nearest-neighbor vote is not tied and agrees with the best scored dictionary entry.

Close competitors, tied votes, missing required ink, and structural mismatch can turn a high-looking score into `ambiguous` or `unknown`. Extra unrelated ink can produce `contaminated`.

## Rotation Semantics

Sigils use their dictionary rotation rules. `recognitionRotationInvariant` and `allowedRotationsDeg` are copied into recognition examples.

Signs keep their spell meaning from their original ring position and drawn orientation. For matching only, the recognizer rotates sign candidates into the canonical bottom-of-ring pose before comparison. The original `angleDeg`, `orientationDeg`, `directedOrientationDeg`, and `radialFacing` remain available to the compiler.

## Recognition Examples

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

## Neon Storage

Neon Postgres is the primary storage layer for future recognition examples. The schema lives in `migrations/001_recognition_examples.sql`.

Server helpers are in `src/lib/server/storage`:

- `getNeonSql(...)` creates a cached Neon query function from `DATABASE_URL` or `NEON_DATABASE_URL`.
- `listRecognitionExamples(...)` reads active examples.
- `upsertRecognitionExamples(...)` inserts or updates examples by id.
- `seedDictionaryRecognitionExamples(...)` stores dictionary-derived seed examples.

The browser parser modules stay pure and server-portable. They do not import Neon or browser-only APIs.

## Diagnostics Overlay

Glyph diagnostics now show tentative names from recognition diagnostics, not just final accepted labels. If a candidate is not accepted yet, the overlay can display the top match with a question mark and confidence value. This makes in-progress sigil recognition visible before the ring is completed.

The overlay still draws candidate bounds. It does not visualize proximity graph edges, merge tree nodes, or the chamfer ink map.

## Tests

Relevant coverage:

- `tests/matcher.test.ts` covers point-cloud distance, chamfer scoring, and kNN voting.
- `tests/decomposition.test.ts` covers grouping one sigil plus one sign, keeping nearby signs separate, preserving multi-stroke signs, ignoring ring strokes, contamination from noise, and standalone sigil diagnostics before ring drawing.
- `tests/symbolRecognition.test.ts` keeps recognition regressions for signs, sigils, diagnostics, rotation, contamination, and messy valid matches.
- `tests/ringDetector.test.ts` keeps ring behavior independent of symbol recognition.
