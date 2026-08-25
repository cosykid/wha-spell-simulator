# SpellIR Contract

`SpellIR` means spell intermediate representation. It is the compiler output consumed by the renderer, diagnostics, and UI summary. It describes spell behavior after `GlyphAST` has already handled stroke parsing, ring detection, symbol grouping, and recognition.

## Ownership

- `GlyphAST` owns parser facts: ring geometry, ring completeness, stroke ids, candidates, recognitions, unknowns, and parser warnings.
- `SpellIR` owns compiled behavior: validity, active or prepared state, element choice, effect parameters, stability, quality, and compiler warnings.
- `SpellIR` should not duplicate raw parser state unless the renderer needs that value directly.

## State Fields

| Field         | Meaning                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valid`       | The glyph has a usable ring and primary sigil, and passes compiler confidence checks.                                                                                                                                                                                             |
| `active`      | The spell is valid and the ring is complete. Active spells render full effects.                                                                                                                                                                                                   |
| `prepared`    | The spell is valid and the ring is incomplete. Prepared spells can show diagnostics and soft guide effects.                                                                                                                                                                       |
| `activatedAt` | A `performance.now()` timestamp when an active spell is compiled, otherwise `null`. The recognition pipeline carries the first active timestamp across ML refinement recompiles (`carrySpellActivation`) so the effect timeline stays anchored to the moment the ring was sealed. |
| `status`      | User-facing summary text for the spell state.                                                                                                                                                                                                                                     |

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

| Field                  | Meaning                                                                                                                                                                                            | Sample values and range                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `element`              | Supported primary effect key from the selected primary sigil. The current compiler emits one element only.                                                                                         | `"fire"`, `"water"`, `"wind"`, `"earth"`, `"light"`, or `null` for invalid spells.     |
| `elementConfidence`    | Recognition confidence for the primary element source.                                                                                                                                             | `0.91`; `0..1`.                                                                        |
| `primarySizeNorm`      | Primary sigil size normalized against the ring.                                                                                                                                                    | `0.2`; usually `0..1`.                                                                 |
| `sizeRatio`            | Primary sigil footprint divided by its regular size (`primarySizeNorm / referenceSizeNorm`). `1` is regular; below is weaker, above is stronger. Recovers the size the recognizer normalizes away. | `1.0`; `0` for invalid spells.                                                         |
| `strength`             | Spell strength derived from `sizeRatio`, so a bigger sigil is a stronger spell. Regular size reads as `1 / strengthFullSizeRatio`.                                                                 | `0.5`; `0..1`.                                                                         |
| `effectScale`          | Renderer scale derived from `sizeRatio` (centered on a regular-size sigil) and config clamps.                                                                                                      | `1.91` at regular size; currently clamped by config to `1..2.35`.                      |
| `primaryManifestation` | Summary label for the strongest manifestation, or `aura` when no signs are present.                                                                                                                | `"aura"`, `"column"`, `"levitation"`, `"convergence"`, or `"none"` for invalid spells. |
| `manifestations`       | Object of active manifestation profiles keyed by id. Multiple entries can coexist, such as `levitation` plus `convergence`.                                                                        | `{ "column": { "strength": 0.82 } }`; each `strength` is `0..1`.                       |
| `reading`              | The gated reading of the signs (`SealReading`). The Plan layer's input, and the debug overlay's. Never rendered from directly.                                                                     | See [Reading and Plan](#reading-and-plan).                                             |
| `plan`                 | The resolved plan of named motion primitives (`SpellPlan`). This is what the cast performs.                                                                                                        | See [Reading and Plan](#reading-and-plan).                                             |
| `direction`            | Paper-local 3D direction for directional effects. `z` points out of the paper, while `x` and `y` lean across the paper surface.                                                                    | `{ "x": 0, "y": -0.65, "z": 0.76 }`; components are normalized.                        |
| `directionCoherence`   | Measure of how strongly signs agree on a sideways direction. Balanced signs can be `0`.                                                                                                            | `1`; `0..1`.                                                                           |
| `gravity`              | Physics hint derived from levitation influence. `0` means fully suspended, `1` means normal element motion.                                                                                        | `1`; `0..1`.                                                                           |
| `force`                | Overall intensity, speed, or push.                                                                                                                                                                 | `0.78`; `0..1`.                                                                        |
| `spread`               | Width or dispersion.                                                                                                                                                                               | `0.22`; `0..1`.                                                                        |
| `focus`                | Concentration or tightness.                                                                                                                                                                        | `0.81`; `0..1`.                                                                        |
| `range`                | Reach or travel distance.                                                                                                                                                                          | `0.64`; `0..1`.                                                                        |
| `duration`             | Active spell lifetime in seconds.                                                                                                                                                                  | `5.1`; currently clamped to `0.65..8.5` for valid spells, `0` for invalid spells.      |
| `stability`            | Resistance to flicker, noise, or failure.                                                                                                                                                          | `0.71`; `0..1`.                                                                        |
| `quality`              | Overall glyph quality after ring, sigil, sign, and neatness scoring.                                                                                                                               | `0.76`; `0..1`.                                                                        |
| `neatness`             | Global neatness carried into the compiled spell.                                                                                                                                                   | `0.74`; `0..1`.                                                                        |
| `warnings`             | Parser and compiler warnings relevant to the spell.                                                                                                                                                | `[]` or `["primary_sigil_confidence_low"]`.                                            |
| `signature`            | Compact identity string used to reset the cast when behavior changes. Folds in the sigil, element, manifestations, the **plan digest**, and the rounded scalars.                                   | `"fire:column.82:plan1:create:...:true:170:..."`; format is internal and may change.   |

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

## Reading and Plan

`manifestations` and `direction` collapse all signs into global scalars plus one net direction. That is enough for a status line but discards where each sign sits and what kind of motion it asks for. `reading` and `plan` keep that information, in two steps rather than one.

**`reading` is a `SealReading`**: the signs after recognition noise has been gated out. Each `SignReading` carries its dictionary `manifestation` (never inferred), its seal-space position and drawn `length`, a unit `facing` with the `facingClass` rules branch on, the `facingSource` that facing came from, a `facingTrust` in `0..1`, and a `power`. Trust is not power: a sloppy sign contributes length and nothing else (R-06). Facing comes from the ML pose head first, then template rotation, then stroke geometry, then canon inward, each at declining trust, so a missing ML verdict degrades instead of collapsing. Downstream spell code never sees a raw `Recognition`; it reads this.

**`plan` is a `SpellPlan`**: the reading resolved into a finite, named list of motion primitives, and the only shape canon rulings are written into. Each sign family pays into its own budget and owns a different verb (R-13), so nothing overrides anything: column is the engine (`aim`, `dispersion`, `circulation`, `budget`), region is the valve (`aperture`, `exhaust`, `hardness`, `reach`), levitation is the spring (`hold`), pull is the ambient coupling (`intake`), convergence is the lens (`focus`), and `vessel` is deferred. `mode` is R-10's create-versus-manipulate call, `couplings` names every interaction the cast is allowed to make across primitives, and `notes` records the arrangement a plan came from when a ruling gives it a name. `sites` and `symmetry` are the drawn geometry the fold would otherwise discard, carried so the cast can shape form to the arrangement; they pay no magnitude, which stays R-05's job for `budget`. Both shapes are seal space: origin at the ring center, unit length one ring radius, `y` positive toward the screen bottom, `z` out of the paper.

Field-by-field reference: [`src/lib/types/seal-reading.ts`](../src/lib/types/seal-reading.ts) and [`src/lib/types/spell-plan.ts`](../src/lib/types/spell-plan.ts). The rulings themselves are R-05 through R-13 in [`animation-spec.md`](animation-spec.md).

The **plan digest** is folded into `signature`, so changing a sign's family, position, or facing resets the running cast. `reading` is not: it is a debug surface, and every part of it that changes behavior arrives in the plan. The digest rounds to hundredths like the rest of the signature, so a sub-hundredth tuning change tunes in place instead of reseeding the parcel stream.

## Invalid Spell Defaults

Invalid spells keep the same top-level shape so diagnostics and renderer code can remain simple:

- `active`, `prepared`, and `valid` are all `false`.
- `activatedAt` is `null`.
- Element fields are `null` or neutral defaults.
- `primaryManifestation` is `none` and `manifestations` is empty.
- `reading` is the empty reading (no signs, no sigil, no element) and `plan` is the inert plan, which is what the empty reading resolves to. Consumers read both unguarded.
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
	"sizeRatio": 0.67,
	"strength": 0.33,
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
	"reading": {
		"signs": [
			{
				"id": "column",
				"manifestation": "column",
				"at": { "x": 0, "y": 0.66 },
				"length": 0.82,
				"facing": { "x": 0, "y": -1 },
				"facingClass": "inward",
				"facingSource": "ml-pose",
				"facingTrust": 0.9,
				"power": 0.7
			}
		],
		"sigil": "fire",
		"element": "fire",
		"quality": 0.76,
		"symmetry": null,
		"notes": []
	},
	"plan": {
		"version": 1,
		"sigil": "fire",
		"element": "fire",
		"mode": "create",
		"aim": { "x": 0, "y": -0.82, "z": 0.54 },
		"dispersion": 0,
		"circulation": 0,
		"budget": 0.82,
		"sites": {
			"column": [{ "at": { "x": 0, "y": 0.8 }, "facing": { "x": 0, "y": -1 } }],
			"dispersion": []
		},
		"aperture": { "kind": "disc" },
		"exhaust": { "x": 0, "y": 0, "z": 0 },
		"hardness": 0,
		"reach": 1,
		"hold": null,
		"intake": null,
		"vessel": null,
		"focus": 1,
		"quality": 0.76,
		"symmetry": null,
		"couplings": [],
		"notes": []
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
	"signature": "fire:fire:column.82,convergence.46.p-16.0.r14:plan1:create:fire/fire:b82:a0,-82,54:d0:c0:f100:q76:disc:x0,0,0:h0:r100:-:-:-:-:-:true:170:33:78:22:510:0:-41:100:100:76:71"
}
```
