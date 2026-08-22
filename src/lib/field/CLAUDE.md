# src/lib/field

Compiles recognized signs into a superposable force field and samples it. The
whole physics model of a spell lives in these two files.

Seal space: origin at the ring center, one unit = the ring radius, x to the
right, y screen-down (canvas convention), z out of the paper. Every number here
is in seal space. Projecting onto the tilted portal is the renderer's job.

## File map

- [`buildSpellField.ts`](buildSpellField.ts) — `Recognition[]` to `SpellField`.
  Also `facingTwistDeg` and `spellFieldSignature`.
- [`sampleField.ts`](sampleField.ts) — `sampleFieldForce`, `spawnDomainPosition`,
  `fieldBuoyancy`, and `FIELD_TUNING`.
- Operators and `SpawnDomain` are typed in [`../types/spell-field.ts`](../types/spell-field.ts).

## How it works

`compileSpell` calls `buildSpellField(glyphAST.signs)` and hangs the result on
`SpellIR.field`. Each sign's `semantic.manifestation` picks one operator:

- `column` — `axial` beam, or `radial` twist 180 when its facing reads outward.
- `dispersion` — `radial` twist 180 (push out).
- `pull` — `radial` twist `facingTwistDeg` (0 pulls in, +/-90 swirls, 180 pushes).
- `collection` — `radial` twist 0.
- `convergence` — all such signs pool into one `radial` at their weighted focus.
- `levitation` (also the `float` sign) — `buoyancy`.
- `directed` (the `region` sign) — `directed` jet, and a vote on the spawn domain.

Position comes from `sealPosition` (`angleDeg`, `radiusNorm`), strength from
`signInfluence` in [`../compiler/semanticRules.ts`](../compiler/semanticRules.ts),
twist from `facingTwistDeg`. `regionDomain` reads the region signs together:
opposed in and out gives `ring`, coherent facing gives `sector`, all inward
`inside`, all outward `outside`, otherwise `anywhere`.

`crush`, `billowing`, `repetition` and `weave` produce no source. A spell of only
those has empty `field.sources` and falls through to the scalar element renderer.

## Invariants and gotchas

**Behaviors must emerge from summing sources.** A leaning beam, a vortex with a
hollow eye, an orb held between opposed levitation signs: each is the sum of
independent operators, never a special case. Never branch on a spell or an
arrangement. When one looks wrong, fix the operator math.

**All tuning goes in `FIELD_TUNING`.** One named, commented constant per
behavior. Never inline a magic number into a `case` block.

**Facing comes only from the ML pose head.** `facingTwistDeg` returns 0 unless
`diagnostics.ml.accepted` and `rotationOffsetDeg` is set, and 0 is canon's
default inward pose. Template matching pre-rotates signs into the bottom-of-ring
frame ([`../parser/signRotation.ts`](../parser/signRotation.ts)) so their offsets
just echo ring position, and `directedOrientationDeg` / `radialFacing` are stroke
draw-order junk. Reading either as facing once made four columns spray outward as
fake inverted ones. `stripRecognitionDiagnostics` in
`../parser/classifier/format.ts` keeps the compact `diagnostics.ml` verdict on AST
signs for exactly this reason. Drop it and every sign falls back to twist 0.

**Palette stamps default to `rotationDeg: 0`.** `defaultTransformForShape` in
[`../input/shapeLibrary.ts`](../input/shapeLibrary.ts) does not orient a dropped
sign toward the ring. The user rotates it, `bakePlacementToStrokes` bakes that
rotation into real ink, and the ML pose head reads it back. Orientation is
meaning, so a stamped seal left unrotated has every sign facing the same way.

**Every dial must reach `spellFieldSignature`.** It is folded into
`SpellIR.signature`, which is what resets renderer particle state. Add a field to
an operator but not to the digest and your edit will not show on screen until
something else changes.

**Keep these files rune-free.** Unit tests import them directly under `node:test`,
which cannot load `.svelte.ts` modules.

**The axial lean follows the sign's facing, not its rim position.**
`columnSource` puts `facingDirection(sign)` on `AxialSource.direction`, and the
`axial` case in `sampleFieldForce` offsets the beam axis along it by
`|at| * FIELD_TUNING.axialLean`. Canon's sign-length demo draws a long column on
the left and the jet tilts right, so a canonically inward sign throws the beam
past the center to its far side. Leaning toward `at` instead reads as a beam
glued to its own sign, and contradicts the scalar `SpellIR.direction` the
compiler already derives from the same signs. The correct law is R-05 in
[`../../../docs/animation-spec.md`](../../../docs/animation-spec.md), and
[`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md)
plans this directory's replacement.

## Extending

- New manifestation: add a `case` to `buildSpellField`, reusing an operator when
  the _kind_ of force matches. A new kind needs an interface in
  `../types/spell-field.ts` plus `sampleFieldForce` and `spellFieldSignature` branches.
- Check it twice: a canon-anchored assertion in
  [`../../../tests/spellField.test.ts`](../../../tests/spellField.test.ts), then a
  preset in [`../ui/spellEffectLabPresets.ts`](../ui/spellEffectLabPresets.ts)
  viewed at `/tools/spell-effect-lab`.

## Related

- [`../renderer/CLAUDE.md`](../renderer/CLAUDE.md) — `fieldEffect.ts` advects
  particles through this field.
- [`../../../docs/effect-rendering.md`](../../../docs/effect-rendering.md) — the
  emergent behaviors this field owes.
- `../dictionary/signs/*.json` — each sign's `sourceNotes` is the canon record.
