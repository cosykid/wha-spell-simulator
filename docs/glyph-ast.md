# GlyphAST Contract

`GlyphAST` means glyph abstract syntax tree. It is the parser output consumed by the compiler, diagnostics, and debug overlays. It describes what the drawing appears to contain after stroke cleanup, ring detection, stroke classification, symbol decomposition, and dictionary recognition.

`AST` is the same programming-language term used by compilers for parsed source code structure. This project uses the term by analogy: the glyph drawing is parsed into a structured representation before it is compiled into `SpellIR`.

The current structure is mostly flat because the playable slice supports one enclosing ring. Future nested rings may make the tree shape more literal, but nested glyphs are not part of the current contract.

## Ownership

- `GlyphAST` owns parser facts: ring geometry, ring completeness, symbol candidates, recognized primary sigil, unsupported extra sigils, recognized signs, unknown marks, global parser metrics, and parser warnings.
- `SpellIR` owns compiled behavior: validity, active or prepared state, element choice, effect parameters, stability, quality, and compiler warnings.
- `GlyphAST` should not contain renderer-only values, effect parameters, or duplicate compiler state.

## Top-Level Fields

| Field                       | Meaning                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `type`                      | Always `GlyphAST`.                                                                                                   |
| `version`                   | App contract version from `CONFIG.appVersion`.                                                                       |
| `ring`                      | The detected enclosing ring, or a not-found ring object.                                                             |
| `candidates`                | Public symbol candidates created from grouped strokes. Raw stroke point arrays are omitted.                          |
| `primarySigil`              | Best recognized sigil used as the primary spell source, or `null`.                                                   |
| `unsupportedMultipleSigils` | Extra recognized sigils beyond `primarySigil`. The current compiler rejects these instead of trying to mix elements. |
| `signs`                     | Recognized sign entries that can modify the primary sigil.                                                           |
| `unknowns`                  | Candidate summaries that were not confidently recognized.                                                            |
| `globalMetrics`             | Parser-level neatness, radial symmetry, and instability estimates.                                                   |
| `warnings`                  | Parser warnings that explain incomplete, invalid, ambiguous, messy, or unsupported input.                            |

## Ring Fields

`ring` is produced by `detectRing` and defines the spell coordinate system.

| Field                      | Meaning                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `found`                    | A usable enclosing ring was detected.                                                   |
| `center`                   | Ring center in canvas coordinates when found.                                           |
| `radius`                   | Ring radius in canvas pixels when found.                                                |
| `complete`                 | The ring is topologically closed. This does not mean the spell is valid.                |
| `activationEvent`          | This parse detected a transition from prepared open ring to closed ring.                |
| `completeness`             | 0..1 coverage estimate, or 1 for a closed ring.                                         |
| `strokeIds`                | Stroke ids treated as the ring boundary.                                                |
| `gap`                      | Largest open angular gap for incomplete rings.                                          |
| `gapArcLength`             | Largest gap length in canvas pixels.                                                    |
| `coverageRatio`            | Angular coverage ratio used for open-ring detection.                                    |
| `roundness`                | How close the ring is to a circle.                                                      |
| `lineSmoothness`           | Ring stroke smoothness estimate.                                                        |
| `neatness`                 | Combined ring quality score.                                                            |
| `overdrawAmount`           | Extra boundary ink beyond expected circumference.                                       |
| `unsupportedMultipleRings` | Additional distinct ring candidates. The current playable slice does not compile these. |
| `unsupportedNestedRings`   | Detected inner rings that are not compiled in the current playable slice.               |

`ring.complete` answers "is the boundary closed". `SpellIR.active` answers "is there a valid spell firing". Closed invalid rings stay closed in `GlyphAST`, but compile to inactive invalid `SpellIR`.

When `unsupportedMultipleRings` is non-empty, the app treats the drawing as invalid for the current one-ring spell model. The UI locks further drawing, but Undo and Clear can still recover the canvas.

## Candidate Fields

`candidates` are grouped symbol-like marks selected by decomposition. For ringed drawings, they are inside the spell ring and exclude ring strokes. For no-ring diagnostic preview, the parser may expose one synthetic standalone sigil candidate with id `preview-symbol`.

Candidates are useful for diagnostics and recognition debugging. Their boxes in the overlay are bounding boxes around the selected stroke group. They are not the recognition algorithm itself; the matcher scores normalized point clouds and ink distance maps derived from the candidate strokes.

| Field                    | Meaning                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `candidateId`            | Stable id within the current parse, such as `c1`, or `preview-symbol` for no-ring preview.  |
| `strokeIds`              | Source stroke ids included in the candidate.                                                |
| `rawStrokeCount`         | Number of strokes before candidate cleanup.                                                 |
| `cleanedStrokeCount`     | Number of cleaned strokes in the candidate.                                                 |
| `bounds`                 | Candidate bounding box in canvas coordinates.                                               |
| `center`                 | Candidate center in canvas coordinates.                                                     |
| `radiusNorm`             | Candidate distance from ring center, normalized by ring radius.                             |
| `angleDeg`               | Candidate angle around the ring.                                                            |
| `layer`                  | Layer label from ring-relative position, such as `center`, `middle`, or `outer`.            |
| `nearBoundary`           | Candidate is close to a layer boundary.                                                     |
| `sizeNorm`               | Candidate size normalized against ring diameter.                                            |
| `lengthNorm`             | Candidate stroke length normalized against ring circumference.                              |
| `orientationDeg`         | Undirected principal orientation.                                                           |
| `directedOrientationDeg` | Direction from first point to last point across the grouped strokes.                        |
| `radialFacing`           | Whether the directed stroke faces inward, outward, clockwise, counterclockwise, or unclear. |
| `closedness`             | Endpoint closure score for the grouped strokes.                                             |
| `overdrawAmount`         | Excess candidate ink relative to its bounds.                                                |
| `neatness`               | Candidate-level neatness estimate.                                                          |

## Recognized Symbol Fields

`primarySigil`, entries in `unsupportedMultipleSigils`, and each entry in `signs` are recognition objects. They carry the matched dictionary id plus parsed placement and quality data.

These objects are the public parser contract for gameplay and compiler use. Low-level matcher details such as point-cloud distance, chamfer distance, kNN votes, ink overlap, structural sub-scores, alternate matches, and recognition rotation live in the separate `recognitions[].diagnostics` output returned by the classifier, not in `GlyphAST.primarySigil` or `GlyphAST.signs`.

Common fields include:

| Field                                | Meaning                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `candidateId`                        | Candidate that produced the recognition.                                                  |
| `strokeIds`                          | Source stroke ids for the recognized symbol.                                              |
| `id`                                 | Dictionary id.                                                                            |
| `kind`                               | `sigil` or `sign`.                                                                        |
| `recognized`                         | Recognition passed the configured confidence threshold.                                   |
| `confidence`                         | Final recognizer confidence.                                                              |
| `recognitionStatus`                  | Recognition result label, such as `valid`, `ambiguous`, `contaminated`, or `valid_messy`. |
| `semantic`                           | Dictionary semantic payload for compiler use.                                             |
| `layer`, `radiusNorm`, `angleDeg`    | Ring-relative placement copied from the candidate.                                        |
| `sizeNorm`, `lengthNorm`, `neatness` | Candidate-derived quality and scale values.                                               |
| `shape`                              | Shape measurements used by semantic rules, such as elongation and dominant-axis strength. |

The accepted status values are:

- `valid`
- `valid_messy`
- `ambiguous`
- `contaminated`
- `unknown`

Only `valid` and `valid_messy` recognitions become public sigils or signs in `GlyphAST`.

## Recognition Diagnostics

`classifyDrawing(...)` also returns a `recognitions` array beside `GlyphAST`. Each entry keeps matcher diagnostics for the corresponding candidate:

| Field                                         | Meaning                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `diagnostics.bestGuess`                       | Best tentative dictionary match when the candidate was not accepted. |
| `diagnostics.topMatches`                      | Top scored matches, used by the overlay for tentative labels.        |
| `diagnostics.template.$pDistance`             | Point-cloud distance to the best template example.                   |
| `diagnostics.template.chamferScore`           | Chamfer and ink-map score for the best template example.             |
| `diagnostics.matcher.knnVotes`                | kNN vote totals from nearest recognition examples.                   |
| `diagnostics.matcher.nearestExamples`         | Nearest example ids and distances used by the vote.                  |
| `diagnostics.matcher.candidateExplainedRatio` | How much drawn ink is explained by the template.                     |
| `diagnostics.matcher.templateCoveredRatio`    | How much required template ink is present in the candidate.          |
| `diagnostics.matcher.unexplainedInkRatio`     | Extra candidate ink that does not map well to the template.          |
| `diagnostics.structure`                       | Aspect, stroke-count, stroke-profile, and axis compatibility scores. |

These diagnostics are intentionally excluded from public `GlyphAST` sigil and sign objects so compiler semantics stay stable.

## Unknowns And Metrics

`unknowns` summarize candidates that did not become recognized symbols. They preserve enough placement and a compact `bestGuess` for diagnostics without copying raw strokes or full matcher internals.

`globalMetrics` contains:

| Field            | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `neatness`       | Combined parser neatness estimate from ring and recognized symbols.                               |
| `radialSymmetry` | Balance estimate from recognized sign placement.                                                  |
| `instability`    | Parser-level risk estimate from unknowns, contamination, ambiguity, messiness, and ring neatness. |

## Warnings

Warnings are stable string labels intended for diagnostics and compiler decisions. Parser-emitted warning labels include:

- `no_ring_detected`
- `ring_incomplete`
- `unsupported_multiple_rings`
- `unsupported_nested_ring`
- `unsupported_multiple_sigils`
- `missing_primary_sigil`
- `center_unknown_contamination`
- `symbol_near_layer_boundary`
- `symbol_contaminated`
- `symbol_ambiguous`
- `symbol_messy`

## Example

```json
{
	"type": "GlyphAST",
	"version": "0.1.0-poc",
	"ring": {
		"found": true,
		"complete": true,
		"activationEvent": true,
		"center": { "x": 400, "y": 300 },
		"radius": 180,
		"completeness": 1,
		"strokeIds": ["s1", "s2"],
		"neatness": 0.78
	},
	"candidates": [
		{
			"candidateId": "c1",
			"strokeIds": ["s3"],
			"layer": "center",
			"radiusNorm": 0.12,
			"angleDeg": 92,
			"sizeNorm": 0.2,
			"neatness": 0.82
		}
	],
	"primarySigil": {
		"candidateId": "c1",
		"strokeIds": ["s3"],
		"id": "fire",
		"kind": "sigil",
		"recognized": true,
		"confidence": 0.91,
		"element": "fire"
	},
	"unsupportedMultipleSigils": [],
	"signs": [],
	"unknowns": [],
	"globalMetrics": {
		"neatness": 0.8,
		"radialSymmetry": 0.9,
		"instability": 0.12
	},
	"warnings": []
}
```
