# src/lib/renderer

Turns a compiled `SpellIR` into pixels on the effect canvas. Visual only. What a
spell _means_ is decided upstream by the compiler. This directory decides how it
looks.

## File map

- [`spellEffectRenderer.ts`](spellEffectRenderer.ts) — `SpellEffectRenderer`, the
  one entry point. Dispatch, `dt`, state reset, guide shapes.
- [`glyphOverlayRenderer.ts`](glyphOverlayRenderer.ts) — draws on the **glyph**
  canvas, not the effect canvas: activated ink glow, ring and candidate debug.
- [`effects/effectUtils.ts`](effects/effectUtils.ts) — the shared model. Portal
  geometry, `RenderSpellIR`, particle helpers, convergence, dispersion and bolt.
- [`effects/fieldEffect.ts`](effects/fieldEffect.ts) — the field-driven renderer,
  used for every element once a spell has field sources.
- `effects/{fire,water,wind,earth,light}Effect.ts` — legacy per-element
  renderers, used only by sigil-only spells.

## How it works

Two canvases are stacked. `#glyphCanvas` holds the ink and owns the only rAF
loop; `#effectCanvas` sits above it and gets its frames through that loop's
`onFrame` hook. `SpellEffectRenderer` owns `#effectCanvas` alone and clears it
every frame.

`render(spellIR, ring, timestamp, { showGuides, portalFit })` branches in order:

1. No `ring.found` or no `spellIR` — draw nothing.
2. `!spellIR.valid` — dashed red flicker.
3. `spellIR.prepared` (ring drawn but not sealed) — teal pulse.
4. `spellIR.field.sources.length > 0` — `drawFieldEffect`.
5. Otherwise — `EFFECTS[spellIR.element]`, the per-element renderer.

Steps 2 and 3 are guides: they draw only when `showGuides` is set, as does the
faint ring glow on any inactive spell. Steps 4 and 5 draw with
`globalCompositeOperation = 'lighter'` and receive a `RenderSpellIR` (the
`SpellIR` plus `emission` and `portalFit`) and a portal-scaled copy of the ring.

## Invariants and gotchas

**The portal is a CSS transform mirrored by hand in JS. Change both together.**
On activation the CSS in [`../styles/canvas.css`](../styles/canvas.css) shrinks
and tilts `#glyphCanvas` only. `#effectCanvas` stays flat, so `effectUtils.ts`
duplicates the same magic numbers: `PORTAL_SHRINK` <-> `scale()`,
`PORTAL_SCALE_Y` <-> `rotateX()`, `PORTAL_ORIGIN_Y` <-> `transform-origin`,
`PORTAL_LIFT_Y` <-> `translateY`, all scaled by `portalFit` <-> `--portal-fit`.
`portalScaledRing()` and `activePortalPlane()` consume them. Edit one side alone
and every effect drifts off the tilted paper.

**Keep `renderer.portalTiltMs` equal to `--portal-tilt-duration`.** They live in
[`../config.ts`](../config.ts) and [`../styles/tokens.css`](../styles/tokens.css)
(980ms). The renderer holds all emission back for that long so the paper visibly
tilts before the spell erupts. Drift makes the effect fire early or late.

**`dt` is 60fps frame units, not seconds.** Clamped to `[0.4, 2.5]`. Tune every
velocity, acceleration and lifetime in per-frame units and multiply by `dt`.

**All render state dies when `spellIR.signature` changes.** `resetParticleState`
deletes _every_ key on `EffectState`, not just `particles`. Never stash anything
on `state` that must outlive a recompile. The compiler folds the field digest
into the signature, so a field edit restarts the effect, while
`carrySpellActivation` preserves `activatedAt` across the template to ML
recompile so a refinement does not.

**`emission` gates the whole timeline.** `spellEmission()` is 0 until
`portalTiltMs` after `activatedAt`, 1 for `duration` (seconds, not ms), then
fades over 420ms. Effects should read it through `effectOpacity`, never
recompute their own end-of-spell fade.

**The field renderer differentiates elements only by palette.** `fieldEffect.ts`
ignores `elementFlow`, `convergence` and the dispersion/bolt modifiers. Anything
that must apply to sign-bearing spells belongs in the field, not here.

## Extending

- New look for a spell with signs: tune `FIELD_MOTION` / `PARTICLE_SHAPE` /
  `ELEMENT_PALETTES` in `fieldEffect.ts`, or reshape the forces in
  [`../field/`](../field/CLAUDE.md).
- New element: add the `ElementId`, a palette entry in `fieldEffect.ts`, and a
  `drawXEffect` registered in the `EFFECTS` table.
- New shaping shared by all element effects (as dispersion and bolt are): add a
  helper to `effectUtils.ts` and call it from each element file.
- Iterate without drawing: `/tools/spell-effect-lab` drives this renderer from
  canned sign arrangements.

## Related

- [`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md) —
  the planned replacement for this directory, with
  [`animation-spec.md`](../../../docs/animation-spec.md) as its behavior rulings.
- [`../../../docs/effect-rendering.md`](../../../docs/effect-rendering.md) — per
  element behavior notes. It explicitly sanctions replacing everything here, as
  long as the replacement consumes `SpellIR`.
- [`../../../docs/spell-ir.md`](../../../docs/spell-ir.md) — the input contract.
- [`../field/CLAUDE.md`](../field/CLAUDE.md) — the force field being rendered.
- [`../ui/canvas/CLAUDE.md`](../ui/canvas/CLAUDE.md),
  [`../ui/simulator/CLAUDE.md`](../ui/simulator/CLAUDE.md) — rAF loop and wiring.
