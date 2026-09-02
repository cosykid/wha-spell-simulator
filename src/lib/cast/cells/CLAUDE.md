# src/lib/cast/cells

The performers. A parcel belonged to exactly one track; **a cell _is_ one
track**, and what it performs is a **choreography**, not a shape.

A cell owns no geometry and no tracer loop. It writes its channel's
`TrackFlow` — which mouth its matter is born from, where its form stands, and
the kind-shaped forces laid over the element's own physics — and the shared
substrate in [`../volume/`](../volume/CLAUDE.md) advects the tracers and skins
them as one merged inked body. **The KIND says where matter goes; the ELEMENT
says how it moves and reads.** Read
[`../../../../docs/animation-volume.md`](../../../../docs/animation-volume.md)
before adding one.

## The contract

[`cell.ts`](cell.ts) is the whole seam, and it is small on purpose.

- `cellFor(track, ctx)` builds one. `ctx` is `{ seed, look, quality, channel }`,
  fixed for the cell's life: the seed starts its `Rng`, the look is the resolved
  row, quality buys form roughness only, and the channel is its seat at the
  substrate.
- `cell.update(frame)` takes one `CellFrame`: `tMs`, `beat`, `beatT`, its own
  `emission` and `drive` at that instant, and the fixed `dtMs`. That is all a
  cell may know. It writes `channel.flow` and then calls `channel.perform`.
- `cell.report()` returns a `CellReport`: how loudly it is painting, where its
  mass stands, where the form it declares is rooted and reaches, its tracer
  tallies, and the named scalars its archetype publishes. It is the whole of
  what a test may read, and it is CPU state by construction — the pixels are a
  pure function of it, so what is asserted on is the choreography and the
  population it steered.
- `cell.dispose()` gives its channel back.
- `constraint()` and `bind()` are optional and are the two halves of a coupling.
  A holder publishes a `CellConstraint` (`at`, `radius`, `closed`); the stage
  hands it to what the plan said it captured. A cell that implements neither is
  never capped, which is exactly what an uncaptured cell is.

## The laws

- **One track only.** No cell reads another cell, the score, the plan or the wall
  clock. The one cross-track path is a declared coupling, it arrives as a value,
  and neither side ever sees the other's internals. The substrate's tracer pool
  is divided once when the cast is built for the same reason: a share that moved
  with the live population would make one cell's state a function of another's.
- **Deterministic replay.** `update` is a function of (track, ctx, frames so
  far). Seeded rng only, from `ctx.seed`. Fresh-to-t and incremental stepping
  must agree, and both golden tiers check it.
- **Phase-locked patterning.** Anything a cell writes that patterns the mass is
  driven by the same phase the mass moves by. The skin polygonized off the very
  tracers the flow advects is that rule taken as far as it goes.
- **Five visible beats.** Every cell states what it does in charge, strike
  (impulse, overshoot), body (sustain, the one beat that stretches, R-02),
  release (commit) and afterglow (dissipate), as a beat table at the top of the
  file. A cell whose beats look identical is a bug, and every law suite asserts
  it.
- **The charge is silent for everything non-ambient (R-01).** A cell is _absent_
  there, not merely dark: `if (hushed(frame, channel)) return;` asks its channel
  for no tracers, which also keeps every accumulator at zero until the strike.
  `shimmer` is the sole exception, because the charge is its beat.
- **Dots may not be the body of anything.** The body is one merged marching-
  cubes mass; the substrate's chip law (cutoff, loner floor, crown melt) exists
  to kill the countable-specks look, and only crystal may lean against it.

## The catalog

| Cell                       | Track     | The choreography                                                                                                                                                         |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`jet.ts`](jet.ts)         | `jet`     | Rise along `aim` from the drawn columns' own foot lobes, pinched by the element, crown tearing and melting.                                                              |
| [`burst.ts`](burst.ts)     | `burst`   | R-01's strike as a short-fused impulse shell across the whole seal, merging into whatever stands in it.                                                                  |
| [`fan.ts`](fan.ts)         | `fan`     | Sectors along the drawn signs' bearings running outward under a ceiling, thinning as they run.                                                                           |
| [`vortex.ts`](vortex.ts)   | `vortex`  | Born turning in the drawn fold's arms on a flaring wall, herded onto them as they precess on the spin phase.                                                             |
| [`hold.ts`](hold.ts)       | `hold`    | Containment with weight and sway suspended: fills by the channel's grip, churns, breathes, spins — a gripless hold is R-16's flat rotor, a wind hold is section 6's fan. |
| [`intake.ts`](intake.ts)   | `intake`  | The signed sink: the medium condensing from all sides into the mouth, spun whole by the twist — one kernel.                                                              |
| [`shimmer.ts`](shimmer.ts) | `shimmer` | R-10's medium as a few large faint washes drifting in during the charge. Deposit zero: washes, never body.                                                               |

[`registry.ts`](registry.ts) is the one place kind is switched on, and it is
exhaustive, so a new `PrimitiveKind` fails to compile until it has a cell. R-13's
`vessel` is the last primitive without one and the score routes it into a `fan`.

`jet` reads its track id for a variant, because the score names its own tracks:
`jet-aim` is R-05's column, `jet-exhaust` R-09's valve (rooted off-centre and off
the paper), and `jet-default` R-11's quiet plume, which runs a lighter deposit
rather than a smaller pool.

## Shared work

- [`arc.ts`](arc.ts) — the energy arc read off R-01's beats: `punchAt`,
  `sootAt`, `burnAt`, and `shapeOf`, which turns an envelope into the 0..1 share
  of its own peak a channel's emission is expressed in. Pure functions of one
  frame, so they cannot drift between a fresh replay and an incremental one.
- [`perform.ts`](perform.ts) — `hushed` (the R-01 gate, one line in every cell
  but the medium's) and `reportOf`.

## Looks

A cell is handed one whole `LookRow` and may read `material` for something only
it can decide: the burst leans on `weight`, the intake strobes its mouth with
`flicker`, the vortex sways on `undulation`, the shimmer scales on
`garnishDensity`. How the row is _painted_ lives entirely in the volume's own
per-element tables (`volume/elements.ts`, `volume/pigment.ts`), resolved
sigil → element → inert exactly as the look table resolves. Looks are data
behind an ESLint wall ([`../CLAUDE.md`](../CLAUDE.md)): a cell never writes one.

## Extending

- **New cell:** add its params to `PrimitiveParams` and its `Track<K>` to the
  `ScoreTrack` union in [`../../types/spell-score.ts`](../../types/spell-score.ts),
  write `<kind>.ts` here with its beat table at the top, add the one case in
  [`registry.ts`](registry.ts), pick or add a spawn mouth in
  `../volume/flow.ts`, and add a track builder in `../score/tracks/`. Then the
  law tests: R-01 silence, five distinguishable beats, fresh-to-t identity, same
  score same report, and dispose leaving an empty channel. Put them beside the
  nearest neighbour's suite (`tests/cellsDirectional.test.ts`, `cellsSwirl`,
  `cellsHold`), and cite the ruling id each one pins. Every cast baseline moves,
  because cells are seeded from the score signature.
- **New reported scalar:** add it to the `detail` map the cell returns, and a
  probe row in `tests/golden/castProbes.ts` citing the ruling it pins.
- **New per-element behavior:** a row edit in `../volume/elements.ts` or
  `../volume/pigment.ts`, never a branch in a cell. A cell that branches on
  element has smuggled the look table into behavior.

## Related

- [`../CLAUDE.md`](../CLAUDE.md) — the cast and its layers ·
  [`../volume/CLAUDE.md`](../volume/CLAUDE.md) — the substrate these write into ·
  [`../stage/CLAUDE.md`](../stage/CLAUDE.md) — what advances them.
- [`../../../../docs/animation-volume.md`](../../../../docs/animation-volume.md)
  — the rework this layer executes ·
  [`../../../../docs/animation-spec.md`](../../../../docs/animation-spec.md) —
  every R-nn cited here · [`../../../../docs/ground-truth.md`](../../../../docs/ground-truth.md)
  — the physics the intake and vortex are argued from.
- [`../../../../tests/castCells.test.ts`](../../../../tests/castCells.test.ts) —
  the contract every cell keeps.
