# src/lib/cast/cells

The performers. A parcel belonged to exactly one track; **a cell _is_ one
track**, and what it performs is a **choreography**, not a shape.

A cell owns no geometry. It writes the flow shape its parcels feel and the arc
its brush marks are laid at, and the shared substrate in
[`../hybrid/`](../hybrid/CLAUDE.md) paints both. An archetype is that shape plus
a spawn program plus a mark behaviour, which is why seven of them can look like
one hand drew them and cost one budget between them. Read
[`../../../../docs/animation-hybrid.md`](../../../../docs/animation-hybrid.md)
before adding one.

## The contract

[`cell.ts`](cell.ts) is the whole seam, and it is small on purpose.

- `cellFor(track, ctx)` builds one. `ctx` is `{ seed, look, quality, channel }`,
  fixed for the cell's life: the seed starts its `Rng`, the look is the resolved
  row, quality buys form roughness only, and the channel is its seat at the
  substrate.
- `cell.update(frame)` takes one `CellFrame`: `tMs`, `beat`, `beatT`, its own
  `emission` and `drive` at that instant, and the fixed `dtMs`. That is all a
  cell may know. It writes `channel.shape` and `channel.arc` and then calls
  `channel.perform`.
- `cell.report()` returns a `CellReport`: how loudly it is painting, where its
  mass stands, where the form it declares is rooted and reaches, its mark tallies,
  and the named scalars its archetype publishes. It is the whole of what a test
  may read, and it is CPU-only by construction — the mass lives in a GPU texture
  no assertion can see, so what is asserted on is the choreography that put it
  there.
- `cell.dispose()` gives its channel back.
- `constraint()` and `bind()` are optional and are the two halves of a coupling.
  A holder publishes a `CellConstraint` (`at`, `radius`, `closed`); the stage
  hands it to what the plan said it captured. A cell that implements neither is
  never capped, which is exactly what an uncaptured cell is.

## The laws

- **One track only.** No cell reads another cell, the score, the plan or the wall
  clock. The one cross-track path is a declared coupling, it arrives as a value,
  and neither side ever sees the other's internals. The substrate's pool is
  divided once when the cast is built for the same reason: a share that moved
  with the live population would make one cell's state a function of another's.
- **Deterministic replay.** `update` is a function of (track, ctx, frames so
  far). Seeded rng only, from `ctx.seed`. Fresh-to-t and incremental stepping
  must agree, and both golden tiers check it.
- **Phase-locked patterning.** Anything a cell writes that patterns the mass is
  driven by the same phase the mass moves by. The brush marks integrating the
  very field the parcels do is that rule taken as far as it goes.
- **Five visible beats.** Every cell states what it does in charge, strike
  (impulse, overshoot), body (sustain, the one beat that stretches, R-02),
  release (commit) and afterglow (dissipate), as a beat table at the top of the
  file. A cell whose beats look identical is a bug, and every law suite asserts
  it.
- **The charge is silent for everything non-ambient (R-01).** A cell is _absent_
  there, not merely dark: `if (hushed(frame, channel)) return;` asks its channel
  for no parcels and lays no marks, which also keeps every accumulator at zero
  until the strike. `shimmer` is the sole exception, because the charge is its
  beat.
- **Dots may not be the body of anything.** The body is a dense mass of pigment
  and the accents are drawn marks. A thin population at full opacity is the
  countable-specks look this layer exists to be rid of; a channel that wants to
  be faint runs _more_ parcels through a lower `veil`.

## The catalog

| Cell                       | Track     | The choreography                                                                                          |
| -------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| [`jet.ts`](jet.ts)         | `jet`     | Buoyant rise along `aim`, pinched and lightly swirled, fed by the drawn columns. Licks torn off the edge. |
| [`burst.ts`](burst.ts)     | `burst`   | R-01's strike as a punch-class radial splash: brief, violent, no outline and no smoke.                    |
| [`fan.ts`](fan.ts)         | `fan`     | A sector of the plane running outward under a ceiling, capped at two ring radii, thinning as it runs.     |
| [`vortex.ts`](vortex.ts)   | `vortex`  | Swirl over lift on a flaring boundary, fed at the foot by a ring attractor.                               |
| [`hold.ts`](hold.ts)       | `hold`    | Containment at the locus: the ball fills toward capacity, breathes, and turns on its own spin.            |
| [`intake.ts`](intake.ts)   | `intake`  | The signed sink: the medium drawn to the mouth, or pushed out of it, twisting only where the ink did.     |
| [`shimmer.ts`](shimmer.ts) | `shimmer` | R-10's medium as a broad, near-transparent veil drawn onto the ring. Pigment, never light.                |

[`registry.ts`](registry.ts) is the one place kind is switched on, and it is
exhaustive, so a new `PrimitiveKind` fails to compile until it has a cell. R-13's
`vessel` is the last primitive without one and the score routes it into a `fan`.

`jet` reads its track id for a variant, because the score names its own tracks:
`jet-aim` is R-05's column, `jet-exhaust` R-09's valve (rooted off-centre and off
the paper), and `jet-default` R-11's quiet plume. `fan`'s vessel case is
param-driven rather than id-driven: a fan no sign asked for carries no sites, so
it opens the whole seal, and its `swirl` stirs what it cannot spread.

## Shared work

- [`arc.ts`](arc.ts) — the energy arc read off R-01's beats: `punchAt`,
  `sootAt`, `burnAt`, and `shapeOf`, which turns an envelope into the 0..1 share
  of its own peak a channel's density is expressed in. Pure functions of one
  frame, so they cannot drift between a fresh replay and an incremental one.
- [`perform.ts`](perform.ts) — `hushed` (the R-01 gate, one line in every cell
  but the medium's) and `reportOf`.

## Looks

A cell is handed one whole `LookRow` and reads two things from it. Its own
`material` profile reaches the substrate through `hybrid/pigments.ts`, which
turns eleven numbers into multipliers on substrate dials — a row may be denser,
hotter, heavier or thinner than the reference, and may not invent a shape. A cell
may also read `material` directly for something only it can decide: the burst
leans on `weight`, the intake strobes its mouth with `flicker`, the vortex sways
on `undulation`. Looks are data behind an ESLint wall
([`../CLAUDE.md`](../CLAUDE.md)): a cell never writes one.

## Extending

- **New cell:** add its params to `PrimitiveParams` and its `Track<K>` to the
  `ScoreTrack` union in [`../../types/spell-score.ts`](../../types/spell-score.ts),
  write `<kind>.ts` here with its beat table at the top, add the one case in
  [`registry.ts`](registry.ts), fill in a `FlowShape` and add its mouth to
  `hybrid/spawn.glsl.ts`, and add a track builder in `../score/tracks/`. Then the
  law tests: R-01 silence, five distinguishable beats, fresh-to-t identity, same
  score same report, and dispose leaving an empty channel. Put them beside the
  nearest neighbour's suite (`tests/cellsDirectional.test.ts`, `cellsSwirl`,
  `cellsHold`), and cite the ruling id each one pins. Every cast baseline moves,
  because cells are seeded from the score signature.
- **New reported scalar:** add it to the `detail` map the cell returns, and a
  probe row in `tests/golden/castProbes.ts` citing the ruling it pins.
- **New material dial:** `MaterialProfile` in [`../looks/look.ts`](../looks/look.ts),
  then a multiplier in `hybrid/pigments.ts`, and then every row in `looks/` stops
  type-checking until it is filled in.

## Related

- [`../CLAUDE.md`](../CLAUDE.md) — the cast and its layers ·
  [`../hybrid/CLAUDE.md`](../hybrid/CLAUDE.md) — the substrate these write into ·
  [`../stage/CLAUDE.md`](../stage/CLAUDE.md) — what advances them.
- [`../../../../docs/animation-hybrid.md`](../../../../docs/animation-hybrid.md)
  — the rework this layer executes ·
  [`../../../../docs/animation-spec.md`](../../../../docs/animation-spec.md) —
  every R-nn cited here · [`../../../../docs/ground-truth.md`](../../../../docs/ground-truth.md)
  — the physics the intake and vortex are argued from.
- [`../../../../tests/castCells.test.ts`](../../../../tests/castCells.test.ts) —
  the contract every cell keeps.
