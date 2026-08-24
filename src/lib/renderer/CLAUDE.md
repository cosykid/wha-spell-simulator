# src/lib/renderer

The glyph overlay: everything the glyph canvas draws **over its own ink**. Two
files, one job, no spell behavior.

The name is now wider than the contents — nothing here renders a spell, and
`glyph-overlay/` would say what this directory is. Renaming it is a separate,
mechanical change and not part of the deletion that emptied it; left as it is on
purpose so this diff stays about what died.

What moved: `spellEffectRenderer.ts` and `effects/` (the field-driven renderer
and the five per-element ones) live under
[`../cast/classic/`](../cast/classic/CLAUDE.md) now, behind the same `CastEngine`
seam as the stage and chosen by the user's `EffectStyle`.

What died and stays dead: the ownership boolean, the per-spell fallback branch,
and the guide drawing — the idle ring glow, the prepared pulse and the invalid
flicker are this directory's `drawSealGuides`, on the glyph canvas. A spell that
is active and valid is a cast; R-11 makes "manifests nothing" a look rather than
an empty canvas, so there is nothing left to fall back to. `renderer/` still
renders no spells.

## File map

- [`glyphOverlayRenderer.ts`](glyphOverlayRenderer.ts) — activated-ink glow
  (`drawGlowingStrokes`), the seal guides (`drawSealGuides`), and the ring debug
  circle.
- [`sealIgnition.ts`](sealIgnition.ts) — R-01's charge beat on the ink
  (`drawSealIgnition`): a warm front runs the seal's strokes in the order they
  were drawn and is spent by the strike, where the cast takes the frame.
- [`glyphDebugOverlay.ts`](glyphDebugOverlay.ts) — the `showDiagnostics` layer:
  candidate boxes, recognizer verdicts, stroke ids.

## How it works

Two canvases are stacked. `#glyphCanvas` holds the ink and owns the only rAF
loop; `#effectCanvas` sits above it and gets its frames through that loop's
`onFrame` hook, which drives [`../cast/stage/stage.ts`](../cast/stage/stage.ts)
and nothing else. That canvas is WebGL now, so nothing on this side may take a
`2d` context on it — a canvas that ever hands one out can never host a WebGL one.

`drawSealGuides(ctx, spellIR, ring, timestamp)` reports how a seal reads _before_
it casts, in three states: a faint amber ring glow on any idle ring, a teal pulse
once the ring is prepared, and a dashed red flicker when the drawing will not
compile. An active spell draws none of them. The simulator gates the whole thing
on `ui.showGuides` in `glyph-scene.svelte.ts`'s `sealGuidesEntity` (z 40, above
the ink, below the ring debug).

## Invariants and gotchas

**Guides are UI feedback, not spell behavior.** That is why they live on the
glyph canvas beside the ink they annotate rather than on the effect canvas. They
draw only on non-active states, and the glyph canvas is flat on all of them, so
the portal tilt never touches them. Anything that draws while a spell is active
belongs in [`../cast/`](../cast/CLAUDE.md).

**This directory owns no portal numbers.** On activation the CSS in
[`../styles/canvas.css`](../styles/canvas.css) shrinks and tilts `#glyphCanvas`
only; `#effectCanvas` stays flat. [`../portal/`](../portal/CLAUDE.md) is the
single owner of both sides: it writes the CSS custom properties the transform is
built from, and it exports the projection the cast paints through. Never
re-declare a shrink, tilt, pivot, lift, or foreshortening here.

**The overlay reads `SpellIR`, never a plan or a score.** It answers "will this
compile", which is a validity question. If a piece of feedback needs to know what
the spell will _do_, it is a cast concern.

## Extending

- **New overlay feedback**: a function in `glyphOverlayRenderer.ts` and an
  `Entity` in
  [`../ui/simulator/glyph-scene.svelte.ts`](../ui/simulator/CLAUDE.md).
- **New look for a cast spell**: it is a look-table row in
  [`../cast/looks/`](../cast/CLAUDE.md), never a change in here.
- Iterate without drawing: `/tools/spell-effect-lab` runs the cast engine from
  canned sign arrangements.

## Related

- [`../cast/CLAUDE.md`](../cast/CLAUDE.md) — the effect path.
- [`../portal/CLAUDE.md`](../portal/CLAUDE.md) — the tilted paper.
- [`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md)
  and [`animation-spec.md`](../../../docs/animation-spec.md) — the redesign that
  emptied this directory, and its behavior rulings.
- [`../../../docs/spell-ir.md`](../../../docs/spell-ir.md) — the input contract.
- [`../ui/canvas/CLAUDE.md`](../ui/canvas/CLAUDE.md),
  [`../ui/simulator/CLAUDE.md`](../ui/simulator/CLAUDE.md) — rAF loop and wiring.
- Tests: [`../../../tests/glyphOverlay.test.ts`](../../../tests/glyphOverlay.test.ts).
