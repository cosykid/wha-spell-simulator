# src/lib/cast/cells

The performers. A parcel belonged to exactly one track; **a cell _is_ one
track**, performing that track's envelopes as macroscopic animated form under
the stage's seal-space root.

One bespoke cell per track kind, hand-resolved. That is the whole claim the
layer makes: the sign vocabulary is a small closed set, so resolving each
archetype by hand is a finite job, and it is what the statistical cloud of dots
before it could not do. Read
[`../../../../docs/animation-cells.md`](../../../../docs/animation-cells.md)
before adding one.

## The contract

[`cell.ts`](cell.ts) is the whole seam, and it is small on purpose.

- `cellFor(track, ctx)` builds one. `ctx` is `{ seed, look, quality }`, fixed for
  the cell's life: the seed starts its `Rng`, the look is the resolved row, and
  quality buys form roughness only, never magnitude.
- `cell.group` is a `THREE.Group` parented under the seal root, so everything the
  cell writes is in seal units.
- `cell.update(frame)` takes one `CellFrame`: `tMs`, `beat`, `beatT`, its own
  `emission` and `drive` at that instant, and the fixed `dtMs`. That is all a
  cell may know.
- `cell.dispose()` releases every geometry, material and texture it made.
- `constraint()` and `bind()` are optional and are the two halves of a coupling.
  A holder publishes a `CellConstraint` (`at`, `radius`, `closed`); the stage
  hands it to what the plan said it captured. A cell that implements neither is
  never capped, which is exactly what an uncaptured cell is.

## The laws

- **One track only.** No cell reads another cell, the score, the plan or the wall
  clock. The one cross-track path is a declared coupling, it arrives as a value,
  and neither side ever sees the other's internals.
- **Deterministic replay.** `update` is a function of (track, ctx, frames so
  far). Seeded rng only, from `ctx.seed`. Fresh-to-t and incremental stepping
  must agree, and the golden tier steps fixed `dtMs` to check it.
- **Phase-locked patterning.** Any procedural surface pattern (banding, licks,
  streaks, dashes) is driven by the same phase its geometry moves by. This is the
  rule that makes rotation and flow read in a still frame, and it is not
  negotiable.
- **Five visible beats.** Every cell states what it does in charge, strike
  (impulse, overshoot), body (sustain, the one beat that stretches, R-02),
  release (commit) and afterglow (dissipate), as a beat table at the top of the
  file. A cell whose beats look identical is a bug, and every law suite asserts
  it.
- **The charge is silent for everything non-ambient (R-01).** A cell is _absent_
  in the charge, not merely dark: `group.visible = frame.beat !== 'charge'`, then
  return. `ambient` is the sole exception, because the charge is its beat.
- **Dots may not be the body of anything.** The form is ribbons, sheets, shells,
  annuli and strokes. Particles exist only as garnish attached to a form.

## The catalog

| Cell                       | Track     | Form                                                                                                                      |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`beam.ts`](beam.ts)       | `jet`     | A core spine leaning onto `aim`, three to five twisting ink ribbons sheathing it, one feeder strand per drawn column.     |
| [`fan.ts`](fan.ts)         | `fan`     | One sector sheet per dispersion sign, serrated advancing edge, radial streaks, slivers thrown off the front as garnish.   |
| [`burst.ts`](burst.ts)     | `burst`   | An expanding shock annulus hugging the seal plane, and a brief flared flash column over the strike.                       |
| [`vortex.ts`](vortex.ts)   | `vortex`  | The Rankine funnel: helical arms on a flaring core, a calm eye, a boundary layer feeding the foot along the paper.        |
| [`hold.ts`](hold.ts)       | `hold`    | A shell filling toward capacity, ink rings orbiting it at the hold's own spin, faint tethers bowing back to the seal rim. |
| [`intake.ts`](intake.ts)   | `intake`  | Ambient streamlines bending in from outside the ring (or out, on a negative draw) and swallowed at a flaring mouth.       |
| [`ambient.ts`](ambient.ts) | `shimmer` | R-10's medium as one haze disc plus a few dozen speed-stroke motes. Capped hard in every beat, and never the frame.       |

[`registry.ts`](registry.ts) is the one place kind is switched on, and it is
exhaustive, so a new `PrimitiveKind` fails to compile until it has a cell. R-13's
`vessel` is the last primitive without one and the score routes it into a `fan`.

Beam and fan read their track id for a variant, because the score names its own
tracks: `jet-aim` is a column, `jet-exhaust` R-09's valve, `jet-default` R-11's
quiet plume, and `fan-vessel` is the routed stand-in that stirs rather than
spreads.

## Looks, roles and materials

A cell is handed one whole `LookRow` and takes two things from it.
`ctx.look[track.look]` is the role tint the score chose for this track (`core`,
`body`, `wisp`, `ember`, `skin`), and a cell may reach for a second role where a
piece of its form is a different substance — the fan's sparks take `ember`, the
medium's motes take `wisp`. `ctx.look.material` is the `MaterialProfile`:
`emissive`, `opacity`,
`edge`, `bands`, `noiseScale`, `ribbonWidth`, `garnishDensity`,
`trailPersistence`, `flicker`, `undulation`, `weight`. Element identity has to
survive with the geometry unchanged, so those eleven numbers are what make fire
lick where water sheets.

[`ink.ts`](ink.ts) is the one place look data becomes a GPU number (sRGB tints
into the renderer's linear space, `lighter` into additive blending). A cell never
reinterprets a tint, and never writes one: looks are data behind an ESLint wall
([`../CLAUDE.md`](../CLAUDE.md)).

## `forms/`

A form is a geometry module named for what it draws. It returns a mesh plus one
setter the cell calls each step, and it holds no beats, no envelopes and no
track. Cells compose them: `beam` is a spine, ribbons and feeders; `hold` is a
shell, rings and wisps.

Two are shared rather than owned: [`forms/ribbonStrip.ts`](forms/ribbonStrip.ts)
builds the batched strip geometry every ribbon in the stage is made of, and
[`forms/flowInk.ts`](forms/flowInk.ts) holds the GLSL that draws a flowing ink
surface's edge, banding and jitter. Everything else is one form for one cell.

Forms move in the vertex shader from uniforms, never by rebuilding geometry. A
shaft along local +Z lengthens, fattens and sharpens for the cost of a uniform
write, which is also why replay stays exact.

## Extending

- **New cell:** add its params to `PrimitiveParams` and its `Track<K>` to the
  `ScoreTrack` union in [`../../types/spell-score.ts`](../../types/spell-score.ts),
  write `<kind>.ts` here with its beat table at the top, add the one case in
  [`registry.ts`](registry.ts), build its geometry as modules in `forms/`, read
  the material profile rather than inventing constants for what it already says,
  and add a track builder in `../score/tracks/`. Then the law tests: R-01
  silence, five distinguishable beats, fresh-to-t identity, same score same
  form, and dispose leaving an empty group. Put them beside the nearest
  neighbour's suite (`tests/cellsDirectional.test.ts`, `cellsSwirl`,
  `cellsHold`), and cite the ruling id each one pins. Every cast baseline moves,
  because cells are seeded from the score signature.
- **New form:** a module in `forms/`, named for the shape. Build a shaft along
  local +Z, take the look and material as arguments rather than importing the
  table, and expose one setter. If two cells would both want it, it goes beside
  `ribbonStrip.ts` as shared geometry.
- **New material dial:** `MaterialProfile` in [`../looks/look.ts`](../looks/look.ts),
  and then every row in `looks/` stops type-checking until it is filled in.

## Related

- [`../CLAUDE.md`](../CLAUDE.md) — the cast and its four layers ·
  [`../stage/CLAUDE.md`](../stage/CLAUDE.md) — what advances these cells.
- [`../../../../docs/animation-spec.md`](../../../../docs/animation-spec.md) —
  every R-nn cited here · [`../../../../docs/ground-truth.md`](../../../../docs/ground-truth.md)
  — the physics the intake and vortex forms are argued from.
- [`../../../../tests/castCells.test.ts`](../../../../tests/castCells.test.ts) —
  the contract every cell keeps.
