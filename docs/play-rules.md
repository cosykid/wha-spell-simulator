# Play Rules

This file is the compact contract for parser, compiler, and renderer behavior. Use it as the reference before adding new parser fields, config knobs, or dictionary properties. The parsed glyph output shape is documented in [GlyphAST Contract](glyph-ast.md), and the compiled spell output shape is documented in [SpellIR Contract](spell-ir.md).

## Core Shape Rules

- The ring is the spell boundary. A complete ring activates the spell; a prepared open ring can still show diagnostics.
- Ring neatness contributes to spell quality and stability.
- The current compiler chooses one primary sigil as the element or element variant.
- Multiple recognized sigils are unsupported for now. The parser reports them, and the compiler rejects the spell instead of guessing how to mix elements.
- Sigil size changes effect scale. Larger sigils make larger effects, within renderer clamps.
- Sigils can be recognized in center, middle, or outer ring layers.
- Sigil orientation does not carry meaning for the current spell model.
- Signs modify the primary sigil. They affect manifestations, direction, force, focus, spread, range, and lifetime bias.
- Sign position around the ring can contribute direction when `semantic.directionMode` is `position`.
- Sign position can also point inward when `semantic.directionMode` is `inward`. A left-side column sign sends the effect to the right, toward the opposite side of the ring.
- Sign stroke orientation can contribute direction when `semantic.directionMode` is `orientation`.
- Directional effects use a paper-local 3D direction. `z` points out of the paper, while `x` and `y` lean across the paper surface.
- Force can increase the tilt away from paper `z` when a directional sign exists, making stronger directional effects travel closer to the paper plane.
- Levitation signs reduce compiled gravity. Balanced levitation signs can cancel sideways motion while suspending the effect above the paper.
- Convergence signs add a manifestation that compresses the effect's sideways spread toward a tighter centerline. It can coexist with levitation, column, or other manifestations.
- Sign elongation and dominant stroke shape can strengthen direction, force, and focus. This is built into compiler shape rules, not stored as per-sign tuning data.
- Neatness matters at every level: ring, sigil, signs, and overall spell quality.
- Neater active spells last longer. Messy but recognizable active spells can fire as a short burst.
- Unknown, ambiguous, contaminated, and messy symbols lower stability or prevent activation when they affect the primary sigil.
- Multiple distinct rings are unsupported in the current playable slice. The drawing becomes invalid until the extra ring is undone or the canvas is cleared.
- Sample spells in the Dictionary panel are visual references only. They are not parser fixtures and do not inject strokes into the canvas.

## Recognition Terms

- `strokeTemplate` is the reference ink shape.
- Candidate grouping works on whole strokes. No-ring guide preview and prepared open rings use fast layer-aware proximity grouping for responsiveness; complete rings can use recognition-guided tree cuts to separate close-together symbols before final recognition.
- Template recognition rasterizes normalized candidate and reference strokes into bitmap masks, then combines ink overlap with structural checks.
- Browser ML recognition uses an ONNX-exported multi-head ResNet18 to predict glyph class and pose, then applies confidence, margin, layer, and template-verifier rules before accepting or overriding a template result.
- `CONFIG.recognition.minConfidence` is the minimum final recognizer score for accepting a symbol.
- `recognitionRotationInvariant` controls sigil matching only. Current sigils should usually be `false`.
- Sign templates are authored in the bottom-of-ring pose at `270` degrees. Sign recognition rotates candidates from their ring position back to that canonical pose.
- Uniformly larger symbols can keep the same identity. Size and stroke length still affect gameplay after recognition.
- Distortion, missing simple sign strokes, or a close competing match should lower identity confidence or produce `ambiguous` instead of choosing a wrong symbol.
- Rough simple sign candidates can be diagnostically preferred over weak sigil guesses in sign-capable layers, but acceptance still requires confidence, ink coverage, and nearest-neighbor agreement.

## Keep Out Of Public Data

Prefer internal constants or local helper code for implementation heuristics:

- grouping distance thresholds
- recognition-guided decomposition heuristics and the group-split penalty
- raster grid sizes and mask radii
- rotation tie-break margins
- renderer diagnostic parameter mix values
- low-level ring topology sampling values, unless a gameplay rule needs them

Only expose a property in `GlyphAST`, `SpellIR`, dictionary JSON, or `CONFIG` when it maps to one of the core shape rules above or helps diagnose a real user-facing failure.
