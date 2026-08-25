# src/lib/cast/classic

The classic engine: the Canvas2D effect renderer the app shipped before the
animation redesign, restored from `b439a01` and offered beside the cell stage as
one of two user-selectable styles.

**This directory is frozen.** It is preserved behavior, not a second place to
develop. A new canon ruling, a new primitive, a new look row lands in
[`../stage/`](../stage/CLAUDE.md) and `classic/` does not follow it. Changing
classic to chase the stage would recreate the forked behavior model the redesign
deleted; the whole point of keeping it is that it does not move.

Seal space as everywhere below `SpellIR`: origin at the ring center, one unit =
the ring radius, x right, y screen-down, z out of the paper (spec R-03).

## File map

- [`classicCast.ts`](classicCast.ts) — `ClassicCast`, the engine a host holds:
  the frame, the emission clock, the particle state, and which of its own
  renderers draws. Restored from `renderer/spellEffectRenderer.ts`.
- [`tuning.ts`](tuning.ts) — `CLASSIC`, the two particle-count numbers that used
  to live in `CONFIG.renderer` and the frame numbers `dt` is measured in.
- `effects/` — [`effectUtils.ts`](effects/effectUtils.ts) the shared particle
  helpers, then one renderer per element (`fire`, `water`, `wind`, `earth`,
  `light`) plus [`fieldEffect.ts`](effects/fieldEffect.ts), the generic one every
  element shares when the seal carries force sources.
- `field/` — [`spellField.ts`](field/spellField.ts) the four force operators,
  [`buildSpellField.ts`](field/buildSpellField.ts) the adapter from the seal
  reading, [`sampleField.ts`](field/sampleField.ts) their superposition.

## How it works

`ClassicCast.render(spellIR, ring, timestamp, options)` is the same argument list
`CastStage` takes, because both implement [`../engine.ts`](../engine.ts)'s
`CastEngine`. A frame clears the canvas, gates on `isCasting`, measures `dt`,
picks a renderer, works out this instant's emission, shrinks the ring onto the
portal, and draws with `globalCompositeOperation = 'lighter'`.

**The field is derived, not carried.** `SpellIR` lost its `field` at the
redesign, so `buildSpellField(spellIR.reading)` rebuilds one per signature. The
legacy builder read raw `Recognition` and worked out position, facing, twist and
radial alignment itself; the reading already carries all four, gated, so the
adapter reads them instead of measuring them.

## Invariants and gotchas

**Classic reads `SpellIR` and derives its own field. It never reads
`SpellPlan`.** Two engines, two inputs, one IR. The plan is the stage's, and
classic predates it. Nothing here may reach past the IR into recognition either.

**The reset key is `SpellIR.signature` plus the field's own digest.** The stage
keys on the signature alone and is right to: it performs the plan, and the plan
is in the digest the signature folds. Classic performs a field derived from the
`reading`, which the compiler deliberately leaves out of the signature, so a
reading change that moved no plan dial would otherwise leave a stale field
running. Recognition recompiles the same drawing several times, so the key is a
value comparison and never object identity, or the ML refinement pass would
restart the cast mid-performance.

**The clock is the wall's, and it is not the stage's.** `spellEmission` returns
0 until `activatedAt + PORTAL.tiltMs`, 1 through `duration`, then fades over
`CLASSIC.endFadeMs`. The stage starts at `activatedAt` and makes the tilt R-01's
charge beat instead. **A frame number fitted to one style means nothing to the
other**: 700ms is charge content on the stage and guaranteed blank here, which is
why the look tier keeps two frame lists.

**`dt` is in 60fps frames, not milliseconds.** Every effect integrates in those
units, clamped to `[0.4, 2.5]` so a stalled tab cannot teleport a particle. The
clamp is also why the engine forgets `lastTime` whenever it is not casting: the
next cast starts its own clock rather than inheriting the gap since the last one.

**Choosing between the field and the five element renderers is internal.** It
picks which of _this engine's own_ renderers draws, and no engine boundary is
crossed: classic never hands a cast to the stage, the stage never hands one here,
and neither has an "it drew nothing, try the other" path. The style picks the
engine; the spell never does.

**This is the only place `Math.random` is allowed below `SpellIR`.** Classic
calls it about eighty times across the engine and cannot be made deterministic
without ceasing to be classic, which is why it has no cell-state golden tier and
why its look baselines are taken with `Math.random` seeded in the page
([`../../../../tests-e2e/golden-look.e2e.ts`](../../../../tests-e2e/golden-look.e2e.ts))
at a looser tolerance than the stage's.

**No guides.** The legacy dispatcher drew the idle ring glow, the prepared pulse
and the invalid flicker. `drawSealGuides` in
[`../../renderer/`](../../renderer/CLAUDE.md) owns those now, on the glyph
canvas, and drawing them here would double them.

**The portal's numbers are the portal's.** The legacy file kept its own copies of
the shrink, the tilt ellipse and the height foreshortening, and two of them had
drifted: the emission direction foreshortened height by 1.0 and the field
particle by 0.8, where the fitted camera implies 0.898. Both now read
[`../../portal/`](../../portal/CLAUDE.md). This is the one behavior difference
from `b439a01` that was taken on purpose.

**`SignReading.power` is not `signInfluence`.** The legacy per-source strength
folded confidence, size and layer; the reading keeps confidence out (R-06). So a
restored field is not numerically identical to `b439a01`'s, and that is the
intended trade rather than a bug to fix.

**A sigil added since `b439a01` falls through to its element.** Classic knows
five elements and three sigil variants (`aeroform`, `wind-underfoot`, `crystal`).
Anything newer draws its plain element here while the stage gives it a look row.
That follows from the freeze.

## Extending

Do not, as a rule. The reasons to touch this directory are: a bug that makes it
diverge from `b439a01`'s behavior, a change to the shared `CastEngine` seam, or a
portal number moving. Anything that sounds like new behavior belongs in
`../stage/`.

## Related

- [`../engine.ts`](../engine.ts) — the seam both engines implement ·
  [`../selectEngine.ts`](../selectEngine.ts) — the one construction site.
- [`../../structures/effectStyle.ts`](../../structures/effectStyle.ts) — the
  preference that chooses between them.
- [`../stage/CLAUDE.md`](../stage/CLAUDE.md) — the engine canon develops in.
- [`../../portal/CLAUDE.md`](../../portal/CLAUDE.md) — the tilted paper both
  paint on.
- [`../../../../tests/classicField.test.ts`](../../../../tests/classicField.test.ts)
  — the adapter's unit coverage ·
  [`../../../../tests-e2e/classic-shoot.e2e.ts`](../../../../tests-e2e/classic-shoot.e2e.ts)
  — its wiring.
