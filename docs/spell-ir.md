# SpellIR Contract

`SpellIR` means spell intermediate representation. It is the compiler output consumed by the renderer, diagnostics, and UI summary. It describes spell behavior after `GlyphAST` has already handled stroke parsing, ring detection, symbol grouping, and recognition.

## Ownership

- `GlyphAST` owns parser facts: ring geometry, ring completeness, stroke ids, candidates, recognitions, unknowns, and parser warnings.
- `SpellIR` owns compiled behavior: validity, active or prepared state, element choice, effect parameters, stability, quality, and compiler warnings.
- `SpellIR` should not duplicate raw parser state unless the renderer needs that value directly.

## State Fields

| Field         | Meaning                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `valid`       | The glyph has a usable ring and primary sigil, and passes compiler confidence checks.                       |
| `active`      | The spell is valid and the ring is complete. Active spells render full effects.                             |
| `prepared`    | The spell is valid and the ring is incomplete. Prepared spells can show diagnostics and soft guide effects. |
| `activatedAt` | A `performance.now()` timestamp when an active spell is compiled, otherwise `null`.                         |
| `status`      | User-facing summary text for the spell state.                                                               |

State combinations:

| Case                          | `valid` | `active` | `prepared` | Ring state source                  |
| ----------------------------- | ------- | -------- | ---------- | ---------------------------------- |
| No ring or invalid glyph      | `false` | `false`  | `false`    | `GlyphAST.ring`                    |
| Valid open ring               | `true`  | `false`  | `true`     | `GlyphAST.ring.complete === false` |
| Valid closed ring             | `true`  | `true`   | `false`    | `GlyphAST.ring.complete === true`  |
| Closed ring but invalid spell | `false` | `false`  | `false`    | `GlyphAST.ring.complete === true`  |

There is no separate `ringActivated` field. Use `spellIR.active` for "valid spell is firing", use `GlyphAST.ring.complete` for "ring is closed", and use `pipeline.ring.activationEvent` for "this parse detected the closure transition".

Multiple ring candidates compile to invalid `SpellIR` with `status: "Multiple rings detected"` because the current playable slice supports one enclosing ring only.

Multiple recognized sigils compile to invalid `SpellIR` with `status: "Multiple sigils detected"` because the current compiler supports one primary element only.

## Behavior Fields

| Field                  | Meaning                                                                                                                         | Sample values and range                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `element`              | Supported primary effect key from the selected primary sigil. The current compiler emits one element only.                      | `"fire"`, `"water"`, `"wind"`, `"earth"`, `"light"`, or `null` for invalid spells.     |
| `elementConfidence`    | Recognition confidence for the primary element source.                                                                          | `0.91`; `0..1`.                                                                        |
| `primarySizeNorm`      | Primary sigil size normalized against the ring.                                                                                 | `0.2`; usually `0..1`.                                                                 |
| `effectScale`          | Renderer scale derived from primary sigil size and config clamps.                                                               | `1.7`; currently clamped by config to `1..2.35`.                                       |
| `primaryManifestation` | Summary label for the strongest manifestation, or `aura` when no signs are present.                                             | `"aura"`, `"column"`, `"levitation"`, `"convergence"`, or `"none"` for invalid spells. |
| `manifestations`       | Object of active manifestation profiles keyed by id. Multiple entries can coexist, such as `levitation` plus `convergence`.     | `{ "column": { "strength": 0.82 } }`; each `strength` is `0..1`.                       |
| `direction`            | Paper-local 3D direction for directional effects. `z` points out of the paper, while `x` and `y` lean across the paper surface. | `{ "x": 0, "y": -0.65, "z": 0.76 }`; components are normalized.                        |
| `directionCoherence`   | Measure of how strongly signs agree on a sideways direction. Balanced signs can be `0`.                                         | `1`; `0..1`.                                                                           |
| `gravity`              | Physics hint derived from levitation influence. `0` means fully suspended, `1` means normal element motion.                     | `1`; `0..1`.                                                                           |
| `force`                | Overall intensity, speed, or push.                                                                                              | `0.78`; `0..1`.                                                                        |
| `spread`               | Width or dispersion.                                                                                                            | `0.22`; `0..1`.                                                                        |
| `focus`                | Concentration or tightness.                                                                                                     | `0.81`; `0..1`.                                                                        |
| `range`                | Reach or travel distance.                                                                                                       | `0.64`; `0..1`.                                                                        |
| `duration`             | Active spell lifetime in seconds.                                                                                               | `5.1`; currently clamped to `0.65..8.5` for valid spells, `0` for invalid spells.      |
| `stability`            | Resistance to flicker, noise, or failure.                                                                                       | `0.71`; `0..1`.                                                                        |
| `quality`              | Overall glyph quality after ring, sigil, sign, and neatness scoring.                                                            | `0.76`; `0..1`.                                                                        |
| `neatness`             | Global neatness carried into the compiled spell.                                                                                | `0.74`; `0..1`.                                                                        |
| `warnings`             | Parser and compiler warnings relevant to the spell.                                                                             | `[]` or `["primary_sigil_confidence_low"]`.                                            |
| `signature`            | Compact identity string used to reset renderer state when behavior changes.                                                     | `"fire:column.82:true:170:..."`; string format is internal and may change.             |

`direction` is normalized and includes component angles for diagnostics and effect tuning:

| Direction Field | Meaning                                                                                                                          | Sample values and range                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `x`             | Paper-surface X component. Positive leans toward the right side of the paper.                                                    | `0`; normalized component, usually `-1..1`. Neutral is `0`.     |
| `y`             | Paper-surface Y component. Positive leans toward the lower side of the paper canvas.                                             | `-0.65`; normalized component, usually `-1..1`. Neutral is `0`. |
| `z`             | Out-of-paper component. `1` means straight out from the flat paper surface.                                                      | `0.76`; normalized component, `0..1`. Neutral is `1`.           |
| `xTiltDeg`      | Degrees tilted away from paper Z toward the X axis.                                                                              | `0`; current component tilt helper clamps to `-82..82`.         |
| `yTiltDeg`      | Degrees tilted away from paper Z toward the Y axis.                                                                              | `-40.5`; current component tilt helper clamps to `-82..82`.     |
| `tiltFromZDeg`  | Total tilt away from the paper normal. `0` means straight out of the paper, while values near `90` are close to the paper plane. | `40.5`; current force-derived tilt is `0..76`.                  |

The compiler derives the surface lean from sign direction. Force increases the total tilt from Z when a directional sign exists, so stronger directional spells travel closer to the paper plane. Without directional signs, or when directional signs cancel out, the neutral direction is `{ "x": 0, "y": 0, "z": 1 }`.

`directionCoherence` preserves whether the signs actually agree on that sideways direction. For example, four balanced levitation signs can cancel to `directionCoherence: 0`, while levitation influence can reduce `gravity` toward `0`. Renderers use that low gravity as suspension instead of a separate categorical mode, so later signs can mix gravity, column behavior, and direction without replacing one another.

`manifestations` is composable. Each recognized sign contributes to the entry named by `semantic.manifestation`, and the compiler keeps every active entry instead of choosing one winner. Every manifestation profile has `strength` from `0` to `1`. Some manifestations add their own fields:

| Manifestation | Extra fields                  | Meaning                                                                                                                                                                                                                                                     |
| ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aura`        | none                          | Default valid spell with no signs.                                                                                                                                                                                                                          |
| `levitation`  | none                          | Contributes to top-level `gravity`; stronger levitation lowers gravity.                                                                                                                                                                                     |
| `column`      | none                          | Uses top-level direction, force, focus, spread, and range.                                                                                                                                                                                                  |
| `convergence` | `point`, `radius`, `rigidity` | Compresses the effect's sideways spread around its current path. `point.x` and `point.y` offset the compression centerline from the portal, `radius` is the final cross-section size, and `rigidity` is how tightly the effect holds that compressed shape. |

`duration` is the spell's actual active lifetime, not a particle trail or redraw cycle. The compiler derives it mostly from glyph quality and neatness, with dictionary `lifetimeBias` semantics nudging that lifetime. Clean drawings can sustain an effect for several seconds, while messy but still recognizable drawings can activate as a short burst.

## Invalid Spell Defaults

Invalid spells keep the same top-level shape so diagnostics and renderer code can remain simple:

- `active`, `prepared`, and `valid` are all `false`.
- `activatedAt` is `null`.
- Element fields are `null` or neutral defaults.
- `primaryManifestation` is `none` and `manifestations` is empty.
- Numeric behavior fields are `0`, except neutral renderer defaults such as `effectScale` and `gravity`.
- `warnings` contains parser warnings plus the compiler reason.

Missing or unsupported primary elements compile to invalid `SpellIR` with `status: "Unsupported element"`. Multiple recognized sigils compile to invalid `SpellIR` with `status: "Multiple sigils detected"`. The renderer does not fall back to another element effect.

## Example

```json
{
	"type": "SpellIR",
	"active": true,
	"prepared": false,
	"valid": true,
	"status": "Active spell",
	"activatedAt": 17845.1,
	"element": "fire",
	"elementConfidence": 0.91,
	"primarySizeNorm": 0.2,
	"effectScale": 1.7,
	"primaryManifestation": "column",
	"manifestations": {
		"column": {
			"strength": 0.82
		},
		"convergence": {
			"strength": 0.46,
			"point": {
				"x": -0.16,
				"y": 0
			},
			"radius": 0.14,
			"rigidity": 0.38
		}
	},
	"direction": {
		"x": 0,
		"y": -0.65,
		"z": 0.76,
		"xTiltDeg": 0,
		"yTiltDeg": -40.5,
		"tiltFromZDeg": 40.5
	},
	"directionCoherence": 1,
	"gravity": 1,
	"force": 0.78,
	"spread": 0.22,
	"focus": 0.81,
	"range": 0.64,
	"duration": 5.1,
	"stability": 0.71,
	"quality": 0.76,
	"neatness": 0.74,
	"warnings": [],
	"signature": "fire:column.82,convergence.46.p-16.0.r14:true:170:78:22:510:0:-41:100:100:76:71"
}
```
