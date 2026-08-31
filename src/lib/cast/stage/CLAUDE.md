# src/lib/cast/stage

The stage: a `SpellScore` performed as cells on a WebGL canvas, through the
portal's own camera. It is the bottom of the cast. Above it everything is timing
and data; below it every cell draws its own form and nothing else.

`CastStage.render(spellIR, ring, timestamp, options)` kept the argument list of
the Canvas2D engine it replaced, which is what made the cutover a swap at its
three hosts rather than a rewrite of them. Read
[`../../../../docs/animation-cells.md`](../../../../docs/animation-cells.md) and
then [`../../../../docs/animation-volume.md`](../../../../docs/animation-volume.md),
the rulings this layer executes, before changing anything here.

Seal space everywhere (spec R-03): origin at the ring center, one unit = the ring
radius, x right, y screen-down, z out of the paper. This directory is the one
place it becomes three.js world space.

## File map

- [`stage.ts`](stage.ts) — `CastStage`: the running cast, the performance it is
  keyed on, the frame, and the paint budget.
- [`surface.ts`](surface.ts) — the `WebGLRenderer`, the canvas it is allowed to
  use, size bookkeeping and context loss. Knows nothing about a score.
- [`frames.ts`](frames.ts) — the fixed step (`STAGE`), the score-to-`CellFrame`
  sampling, and the couplings pass.
- [`portalCamera.ts`](portalCamera.ts) — the one owner of camera numbers.
- [`sealRoot.ts`](sealRoot.ts) — the `Group` whose matrix _is_ seal space.
- [`readback.ts`](readback.ts) — the test-only `?castReadback=1` signal.

## How it works

A frame is four steps. Match the drawing buffer to the canvas. Decide whether
this is a cast at all (active, valid, not prepared, past `activatedAt`, inside
`score.totalMs`) and clear if it is not. Aim the camera at the portal this ring
makes. Then advance every cell to `timestamp - activatedAt` in whole steps and paint
the final state once: the volume skin is stateless per repolygonize, so a call
that caught up simulates silently and paints only where it landed.

The cast itself is built once per performance: compile the score, resolve one
look row for the whole spell, build **one substrate for the whole cast** with its
pool divided among the tracks, build one cell per track seeded from
`` `${signature}:${index}` `` over its own channel, parent the substrate's meshes
under the seal root, and resolve the score's declared couplings into performer
pairs. Anything else disposes all of it and builds again from the strike.

## Invariants and gotchas

**The camera reproduces `projectSeal`, it does not out-perspective it.** The
paper stays CSS-tilted DOM and only the effect canvas is WebGL, so the identity
is the whole of what keeps a spell on the paper it was cast from.
[`../../../../tests/portalCamera.test.ts`](../../../../tests/portalCamera.test.ts)
projects probe points both ways and holds the agreement inside **0.05px**. The
long-lens frustum is what buys that: `PORTAL_CAMERA.viewDistanceUnits` trades
foreshortening for the perspective divide `projectSeal` does not do, and it stays
pinned until the portal's own fit becomes projective.

**The clock is a product, never a running sum.** `tMs` is always
`steps * STAGE.stepMs` at 120Hz, and every cell is handed the same fixed `dtMs`,
so a cell that integrates anything integrates it the same way at every frame
rate. Stepping fresh to a timestamp is identical to stepping there incrementally,
which is the contract both golden tiers stand on.

**The paint budget is counted in steps, never in frames.** The skin
repolygonizes once per `PAINT_EVERY` steps of the product clock and at most
`PAINT_BURST` (one) time per call however far behind it fell, because a
repolygonize per caught-up step is the catch-up spiral the prototype
diagnosed. At display rates above the paint cadence the mesh may lag one sim
step; it never interpolates. A frame that advanced no step redraws what
already stands.

**The volume is built once; the element's program compiles in the charge.**
The polygonizer's buffers, the blot atlas and the wash programs belong to the
stage ([`../volume/`](../volume/CLAUDE.md)) and are warmed before a seal is
closed; a cast's `attach` builds its element's ink material and compiles it
inside the 980ms charge beat, which is the budget that stall belongs in.

**A cast is keyed on the performance, `(signature, activatedAt)`, not on the
spell.** The signature alone is what a recompile of a running cast shares, so it
has to be part of the key; on its own it also makes a second cast of the same
drawing — undo and redo over a seal, a reopened ring closed again, a preview
replayed — look like the cast that already finished, and the running cast's clock
would be handed back with its steps already spent. `advanceCells` only ever steps
forward, so that cast paints nothing at all for its whole duration.
`carrySpellActivation` ([`../../compiler/spellBuilder.ts`](../../compiler/spellBuilder.ts))
is what makes `activatedAt` safe to key on: it holds the stamp steady across the
template and ML recompiles of one performance, and only a new activation moves
it.

**The camera is aimed before the cells are advanced**, because the paint at the
end of the call billboards the ambient washes against it.

**Seeded rng only.** `Math.random` and `Date.now` are banned below this
directory. The stage owns the only `timestamp` and converts it to cast time
immediately, and a cell's whole entropy budget is the `Rng` its seed starts.

**The couplings pass runs after every cell has taken the step.** A holder's
ceiling is only meaningful once the holder has performed the step that set it, so
`advanceCells` updates every cell first and only then hands each captured cell
its holder's `constraint()`. Nothing else crosses tracks, and anything that wants
to has to be declared in `plan/` first, where a text golden can see it.

**`preserveDrawingBuffer` is off unless a test asked.** Keeping a composited
frame readable costs a full-buffer copy per frame, so the shipped stage never
asks for it. Two signals turn it on and both are test-only: `?castReadback=1`
([`readback.ts`](readback.ts)) and the lab's scripted-clock hook
`?preset=<id>&frameMs=<n>`. Nothing in the app links to either.

**Dispose is not optional, and a lost context is not a crash.** Cells own
geometries, materials and textures that no garbage collector reclaims, so
`reset()` removes and disposes every performer and `dispose()` gives the context
back. A browser allows only a handful of live contexts, which is why the hosts
dispose the stage when their canvas is swapped or their card closes. A restored
context has no uploaded geometry, so `webglcontextrestored` rebuilds the cast
rather than trusting what the last one left behind.

**A canvas that ever handed out a `2d` context can never host WebGL.** Nothing
outside this directory may call `getContext` on the effect canvas. When the
requested canvas refuses a WebGL context, [`surface.ts`](surface.ts) inserts an
overlay of its own that copies its box and stacking, so the effect still lands
where the canvas it stands in for did.

**Seal space is left-handed, so the root matrix has determinant -1.** Every
triangle under it winds the other way. The substrate's meshes declare
`side: THREE.DoubleSide` rather than reversing their own indices.

**A cell owns no geometry, so `reset()` detaches the substrate.** What a cell
holds is a seat at it; what holds the mesh and the textures is
[`../volume/volumeStage.ts`](../volume/CLAUDE.md), and it is the thing parented
under the seal root.

## Extending

- **New stage capability** (a post pass, a light, a debug layer): it belongs in
  `stage.ts` beside the scene, or in a new module here if it carries state.
  Nothing kind-specific may land here — the stage is track-agnostic, and the
  switch on kind lives in [`../cells/registry.ts`](../cells/registry.ts).
- **New camera number:** [`portalCamera.ts`](portalCamera.ts) or nowhere. If it
  changes the projection, the 0.05px test moves with it, and the portal's own
  numbers move first ([`../../portal/CLAUDE.md`](../../portal/CLAUDE.md)).
- **New per-frame value a cell needs:** add it to `CellFrame` in
  [`../cells/cell.ts`](../cells/cell.ts) and sample it in `cellFrameFor`. A cell
  may only know its own track, so if the value is not on that track it is a
  coupling question instead.
- **New per-step work below the cells:** `advanceCells` takes a `StepListener`,
  and the stage is its only caller. The headless golden tier passes none, which
  is what keeps a cast performable in plain Node.
- **Never from here:** a cell's internals (the stage reads `group`, `update`,
  `dispose`, and the two optional coupling members, and nothing else) and the
  look table (data, behind an ESLint wall — [`../CLAUDE.md`](../CLAUDE.md)).
- **Iterate visually:** `/tools/spell-effect-lab`.

## Related

- [`../CLAUDE.md`](../CLAUDE.md) — the cast, and the score this performs ·
  [`../cells/CLAUDE.md`](../cells/CLAUDE.md) — the performers ·
  [`../volume/CLAUDE.md`](../volume/CLAUDE.md) — the substrate they paint with.
- [`../../portal/CLAUDE.md`](../../portal/CLAUDE.md) — the tilted paper and the
  projection this camera reproduces.
- [`../../renderer/CLAUDE.md`](../../renderer/CLAUDE.md) — the glyph overlay
  stacked under the effect canvas, and R-01's ink ignition.
- [`../../../../tests/CLAUDE.md`](../../../../tests/CLAUDE.md) — the golden
  tiers, and which change moves which baseline.
