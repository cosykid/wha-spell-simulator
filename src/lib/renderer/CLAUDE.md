# src/lib/renderer

Two things live here, and after the phase 5 cutover they no longer belong
together:

1. **The glyph overlay** — what the glyph canvas draws over its own ink. This is
   the directory's future and it is production code.
2. **The field engine** — the superseded effect renderer, kept alive for the
   Spell Effect Lab's `field` option and the library's preview book. **Pending
   deletion**, with `../field/`, `renderer/effects/` and `SpellIR.field`, in the
   second half of phase 5. Do not build on it.

The production effect path is [`../cast/`](../cast/CLAUDE.md). A spell that is
active and valid is a cast, full stop: the simulator has no ownership boolean
and no fallback branch, because R-11 makes "manifests nothing" a look.

## File map

The overlay (drawn on `#glyphCanvas`):

- [`glyphOverlayRenderer.ts`](glyphOverlayRenderer.ts) — activated-ink glow, the
  seal guides (`drawSealGuides`), and the ring debug circle.
- [`glyphDebugOverlay.ts`](glyphDebugOverlay.ts) — the `showDiagnostics` layer:
  candidate boxes, recognizer verdicts, stroke ids.

The field engine (drawn on an effect canvas, lab and library only):

- [`spellEffectRenderer.ts`](spellEffectRenderer.ts) — `SpellEffectRenderer`.
  Dispatch, `dt`, state reset, `spellEmission`.
- [`effects/effectUtils.ts`](effects/effectUtils.ts) — the shared model.
  `RenderSpellIR`, particle helpers, convergence, dispersion and bolt. The
  portal itself lives in [`../portal/`](../portal/CLAUDE.md).
- [`effects/fieldEffect.ts`](effects/fieldEffect.ts) — the field-driven renderer,
  used for every element once a spell has field sources.
- `effects/{fire,water,wind,earth,light}Effect.ts` — legacy per-element
  renderers, used only by sigil-only spells.

## How it works

Two canvases are stacked. `#glyphCanvas` holds the ink and owns the only rAF
loop; `#effectCanvas` sits above it and gets its frames through that loop's
`onFrame` hook. In the simulator that hook drives
[`../cast/render/castRenderer.ts`](../cast/render/castRenderer.ts) and nothing
else.

`drawSealGuides(ctx, spellIR, ring, timestamp)` reports how a seal reads
_before_ it casts, in three states: a faint amber ring glow on any idle ring, a
teal pulse once the ring is prepared, and a dashed red flicker when the drawing
will not compile. An active spell draws none of them. The simulator gates the
whole thing on `ui.showGuides` in `glyph-scene.svelte.ts`'s `sealGuidesEntity`
(z 40, above the ink, below the ring debug).

`SpellEffectRenderer.render(spellIR, ring, timestamp, { portalFit })` now branches
on two things only:

1. No `ring.found`, no `spellIR`, invalid, or prepared — draw nothing.
2. `spellIR.field.sources.length > 0` — `drawFieldEffect`, otherwise
   `EFFECTS[spellIR.element]`.

Both draw with `globalCompositeOperation = 'lighter'` and receive a
`RenderSpellIR` (the `SpellIR` plus `emission` and `portalFit`) and a
portal-scaled copy of the ring.

## Invariants and gotchas

**Guides are UI feedback, not spell behavior.** That is why they live on the
glyph canvas beside the ink they annotate rather than on the effect canvas. They
draw only on non-active states, and the glyph canvas is flat on all of them, so
the portal tilt never touches them. Anything that draws while a spell is active
belongs in [`../cast/`](../cast/CLAUDE.md).

**This directory owns no portal numbers.** On activation the CSS in
[`../styles/canvas.css`](../styles/canvas.css) shrinks and tilts `#glyphCanvas`
only; `#effectCanvas` stays flat, so effects have to place themselves on that
tilted paper by hand. [`../portal/`](../portal/CLAUDE.md) is the single owner of
both sides: it writes the CSS custom properties the transform is built from, and
it exports the projection the effects use. Take `portalScaledRing()`,
`activePortalPlane()`, `projectSeal()` and `projectSealDirection()` from there,
and never re-declare a shrink, tilt, pivot, lift, or foreshortening here. Ground
distance and height come from one elevation (`asin(scaleY)`), so a particle and
the paper it rose from cannot fall out of perspective.

`effectUtils.ts` re-exports `activePortalPlane` and `portalScaledRing` for the
spell-effect lab route, which imports the portal through it. New code should
import from `../portal/portal.js` directly.

**`spellEmission`'s portal-tilt hold is the field engine's, not the product's.**
It holds all emission back for `PORTAL.tiltMs`, which spends R-01's charge beat
on an idle canvas. The cast engine replaces that: its clock starts at
`activatedAt` and the charge carries the ambient medium. Nothing new should read
`spellEmission`.

**`dt` is 60fps frame units, not seconds.** Clamped to `[0.4, 2.5]`. Tune every
velocity, acceleration and lifetime in per-frame units and multiply by `dt`.

**All render state dies when `spellIR.signature` changes.** `resetParticleState`
deletes _every_ key on `EffectState`, not just `particles`. Never stash anything
on `state` that must outlive a recompile. The compiler folds the field digest
into the signature, so a field edit restarts the effect, while
`carrySpellActivation` preserves `activatedAt` across the template to ML
recompile so a refinement does not. The cast engine keys on the same signature
for the same reason.

**The field renderer differentiates elements only by palette.** `fieldEffect.ts`
ignores `elementFlow`, `convergence` and the dispersion/bolt modifiers.

## Extending

- **New look for a cast spell**: it is a look-table row in
  [`../cast/looks/`](../cast/CLAUDE.md), never a change in here.
- **New overlay feedback**: a function in `glyphOverlayRenderer.ts` and an
  `Entity` in
  [`../ui/simulator/glyph-scene.svelte.ts`](../ui/simulator/CLAUDE.md).
- **The field engine**: leave it alone. It exists so the lab can still show what
  the cast engine replaced, and it goes away with `field/`.
- Iterate without drawing: `/tools/spell-effect-lab` drives both engines from
  canned sign arrangements.

## Related

- [`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md) —
  the redesign, including what phase 5's deletion half removes, with
  [`animation-spec.md`](../../../docs/animation-spec.md) as its behavior rulings.
- [`../../../docs/effect-rendering.md`](../../../docs/effect-rendering.md) — per
  element behavior notes for the field engine.
- [`../../../docs/spell-ir.md`](../../../docs/spell-ir.md) — the input contract.
- [`../cast/CLAUDE.md`](../cast/CLAUDE.md) — the production effect path.
- [`../portal/CLAUDE.md`](../portal/CLAUDE.md) — the tilted paper and the
  projection every effect draws through.
- [`../ui/canvas/CLAUDE.md`](../ui/canvas/CLAUDE.md),
  [`../ui/simulator/CLAUDE.md`](../ui/simulator/CLAUDE.md) — rAF loop and wiring.
