# src/lib/compiler

Turns a parsed `GlyphAST` into `SpellIR`, the compiled spell that the renderer, diagnostics, and summary
panel all read. This is where a drawing stops being geometry and starts having meaning.

## Files

- [`spellBuilder.ts`](spellBuilder.ts): `compileSpell` (the entry point) and `carrySpellActivation`.
  Owns the gate checks, the scalar parameters, and the signature.
- [`semanticRules.ts`](semanticRules.ts): how recognized signs combine. `signInfluence`,
  `aggregateManifestations`, `aggregateSemanticDeltas`, `combineSignDirection`.
- [`spellDirection.ts`](spellDirection.ts): the paper-local 3D `direction` vector, `z` out of the paper.
- [`spellQuality.ts`](spellQuality.ts): `calculateSpellQuality` and `calculateSpellStability`.

Per-sign meaning is not authored here. It lives in the `semantic` block of each dictionary entry
([`../dictionary/signs/`](../dictionary/signs/)). `semanticRules.ts` only decides how those authored
numbers are weighted and merged.

## How it works

`compileSpell({ glyphAST, config })` runs a fixed sequence.

1. Gate checks. Missing ring, multiple rings, multiple sigils, no primary sigil, confidence below
   `config.compiler.minimumPrimarySigilConfidence`, an ambiguity gap under
   `PRIMARY_SIGIL_AMBIGUITY_GAP`, or an element outside `SUPPORTED_ELEMENTS` each return
   `invalidSpell(status, ...)` with a warning key from [`../parser/glyphWarnings.ts`](../parser/glyphWarnings.ts).
2. Aggregation. Signs are weighted by `signInfluence` and folded into `manifestations`, `SemanticDeltas`,
   a surface direction, and the typed `field` built by [`../field/buildSpellField.ts`](../field/buildSpellField.ts).
3. Scalars. `focus`, `spread`, `force`, `range`, `duration`, `gravity`, `strength`, and `effectScale` come
   from `SPELL_PARAMETER_TUNING` plus the primary sigil's own semantic plus the sign deltas.
4. Signature. A digest of everything the renderer animates from.

Field-by-field reference: [`docs/spell-ir.md`](../../../docs/spell-ir.md). Parser side:
[`docs/glyph-ast.md`](../../../docs/glyph-ast.md).

## Invariants and gotchas

**Activation is ring closure and nothing else.** `active` is `Boolean(glyphAST.ring.complete)` and
`prepared` is `!active`. Do not introduce a second source of truth for "the spell is firing". Invalid
spells are neither active nor prepared, so the three flags describe three states.

**Wrap every recompile in `carrySpellActivation(previous, next)`.** Recognition emits a fast template
result and then one or more ML refinements for the same drawing, and each pass recompiles. A fresh
`activatedAt` restarts the portal-tilt hold and the whole effect timeline, so the effect would begin only
after the last refinement instead of when the ring was sealed.
[`../ui/simulator/recognition-pipeline.svelte.ts`](../ui/simulator/recognition-pipeline.svelte.ts) is the
sole production caller and should stay that way.

**`SpellIR.signature` is a reset key, not a debug string.**
[`../renderer/spellEffectRenderer.ts`](../renderer/spellEffectRenderer.ts) compares it every frame and
drops all particle state when it changes. It folds in the sigil id, element, `manifestationSignature`,
`spellFieldSignature` from the field builder, `active`, and rounded scalars. Changing what goes into it
changes when a running effect restarts, so treat any edit as a renderer behavior change.

**Signature components round to hundredths.** A smaller change will not reset particles. Fold a value in
at coarser rounding if it should be a hot knob, or leave it out if it should tune in place.

**Every field set in `compileSpell` must also be set in `invalidSpell`.** They are the only two
constructors of `SpellIR` and consumers read fields unguarded.

**`signInfluence` is shared with the field builder.** `buildSpellField` uses it for source strengths, so
retuning `SIGN_INFLUENCE_TUNING` moves both the scalar channel and the force field at once.

**`status` is user-facing.** It reaches the simulator status line, but
[`../ui/spellSummary.ts`](../ui/spellSummary.ts) can substitute its own text keyed on warnings, so pair
any new rejection with a `GLYPH_WARNINGS` entry.

**Sign-free spells still compile.** `aggregateManifestations([])` returns `aura` at strength 1 and the
field comes back empty, which routes the renderer to the per-element path instead of the field path.

**Keep tuning in the named constant tables** (`SPELL_PARAMETER_TUNING`, `SIGN_SHAPE_TUNING`,
`SIGN_INFLUENCE_TUNING`, `CONVERGENCE_TUNING`, `QUALITY_TUNING`, `STABILITY_TUNING`). Do not inline magic
numbers at the use site.

## Extending

- **New sign meaning**: author the `semantic` block in the dictionary entry. The scalar channels (`force`,
  `focus`, `spread`, `range`, `lifetimeBias`) and `manifestation` / `directionMode` flow through with no
  compiler edit. See [`docs/dictionary-authoring.md`](../../../docs/dictionary-authoring.md).
- **Manifestation needing more than `{ strength }`**: extend `aggregateManifestations` the way
  `convergence` does through `convergenceProfile`, and give it a branch in `manifestationSignature`.
- **Manifestation that should move particles**: add a source in `buildSpellField` instead. The field is
  the preferred path for new behavior.
- **New `SpellIR` field**: declare it in [`../types/spell-ir.ts`](../types/spell-ir.ts), fill it in both
  `compileSpell` and `invalidSpell`, fold it into `signature` if the renderer animates from it, and
  document it in `docs/spell-ir.md`.

## Related

- [`docs/effect-rendering.md`](../../../docs/effect-rendering.md): the renderer is replaceable as long as
  the replacement consumes `SpellIR`.
- Tests: [`tests/spellBuilder.test.ts`](../../../tests/spellBuilder.test.ts),
  [`tests/spellEffectTiming.test.ts`](../../../tests/spellEffectTiming.test.ts),
  [`tests/spellField.test.ts`](../../../tests/spellField.test.ts).
