# src/lib/cast/volume

The substrate: the one machine every cell performs on. A CPU tracer cloud per
track, advected by its element's physics under its kind's forces, skinned by
one marching-cubes surface into ONE merged body per element, shaded as flat
watercolor washes with a dark ink contour, over a per-element ground wash. The
charge-beat ambient is the same tracers drawn as a few faint washes.

It exists because the hybrid parcel-brush vocabulary it replaced read as
jagged glass shards. Read
[`../../../../docs/animation-volume.md`](../../../../docs/animation-volume.md)
before changing anything here; every rule below is one of that document's.

Seal space everywhere (spec R-03): origin at the ring center, one unit = the
ring radius, x right, y screen-down, z out of the paper.

## The shape of it

```
cells/  ->  VolumeChannel  ->  TrackFlow (the kind's choreography)
                 |
       TracerPop (CPU: element MOTION x TrackFlow, fixed 120Hz step)
                 |
     +-----------+---------------+----------------+
     |           |               |                |
 VolumeSkin   GroundWash   AmbientWashes     (golden tier reads
 (MC + ink)   (paper)      (shimmer only)     the arrays directly)
```

A cell writes its channel's `TrackFlow` and calls `perform`. It never touches
a mesh, a material, a texture, or the tracer loop. **An archetype is a spawn
mouth plus a flow**; **an element is a `MOTION` row, a `SKIN` row and a
pigment row**, and the cross product is the whole vocabulary.

## File map

CPU half — pure arithmetic, no three.js, so a whole cast performs in plain
Node for the golden tier:

- [`substrate.ts`](substrate.ts) — `VolumeSubstrate` and `VolumeChannel`: the
  seam cells write through, the pool division, and the gauges the GPU half
  reads (`groundMass`, `heatBand`, `drain`).
- [`elements.ts`](elements.ts) — the behavior matrix: `MOTION` (how each of
  the eight rows moves) and `SKIN` (how its field fuses), plus
  `volumeElementFor`, the sigil → element → inert resolution.
- [`flow.ts`](flow.ts) — `TrackFlow`, the seven spawn mouths, and the pinch
  boundary with its standing lobes.
- [`tracers.ts`](tracers.ts) — `TracerPop`: spawn, advection, ageing, the
  crown melt, measurement and the quantized digest.
- [`pigment.ts`](pigment.ts) — the eight pigment ramps (JS and emitted GLSL),
  rim inks, the ink-skin rows and the ground-wash rows.
- [`noise.ts`](noise.ts) — the hash, the value noise and the curl.
- [`pool.ts`](pool.ts) — how the one tracer budget is divided, once.
- [`tuning.ts`](tuning.ts) — every shared dial: the step, the paint cadence,
  the marching-cubes numbers and the chip-law constants.

GPU half — three.js, owned by the stage:

- [`volumeStage.ts`](volumeStage.ts) — the assembly: warm, attach, paint,
  present, detach.
- [`skin.ts`](skin.ts) — `VolumeSkin`: metaball deposit, cohesion, smoothing,
  repolygonize.
- [`inkSkin.ts`](inkSkin.ts) — the watercolor-and-ink shader, one program per
  element row.
- [`groundWash.ts`](groundWash.ts) — the paper-contact circle.
- [`ambient.ts`](ambient.ts) — the charge-beat washes over the shimmer
  channel's tracers.

## Invariants and gotchas

**The chip law.** Any metaball below about two grid cells polygonizes as an
angular chip — the exact look this rework replaced. Four mitigations, all
load-bearing: the binary deposit cutoff (`VOLUME.cutoff`; a deposit is big
enough to render round or not made at all), the cohesion loner floor (isolated
deposits melt instead of chipping), the steep crown melt in `tracers.ts` (a
tip fades below the cutoff before it can freeze), and a base `strength` sized
so a full ball clears two cells at `VOLUME.res`. Change the resolution and
re-derive the strength before judging a frame. Crystal is the one row allowed
to lean the other way, and `castVolume.test.ts` pins that it stays the only
one.

**Same medium merges.** Every non-shimmer channel deposits into the one field,
so a burst and the column standing in it fuse — that is the physics, not a
bug. The shimmer channel's deposit is zero by law: R-10's medium is washes on
the paper and may never merge into the manifestation it surrounds.

**The skin is stateless per paint.** The field is rebuilt from the live
tracers every repolygonize, so pixels are a pure function of CPU state and the
camera. All determinism lives in `TracerPop`: seeded rng only, fixed 120Hz
steps, turbulence on a stride (`TURBULENCE_STRIDE`) at compensating gain.
`Math.random` and clock reads are banned here exactly as below `stage/`.

**One repolygonize per render call, at most.** `PAINT_EVERY` holds the cadence
at 60Hz and `PAINT_BURST` is one: a call that fell behind simulates silently
and paints its final state. Painting every caught-up step is the catch-up
spiral the prototype diagnosed. The mesh may lag one sim step at high display
rates; it never interpolates.

**The sink is a ring attractor, never a point sink.** A positive `sink`
gathers matter at the `pool` radius and pushes it back out of the exact
center, which is what keeps a vortex eye and an intake mouth open. A negative
`sink` is a plain outward push. One signed term, no second kernel.

**A swirl carries turning arms, or it does not read.** The skin of an
axisymmetric mass shows no rotation however fast its tracers orbit. A flow
that turns declares `arms`, an `armPhase` its cell advances on the same spin
phase the mass moves by, an `armGain` herding matter tangentially onto the
nearest arm, and an `armPitch` winding the pattern helical with height; the
swirl and hover mouths sort birth azimuth into those arms. `gustMul` and
`squash` are the same diagnosis: a hold quiets its element's sway the way it
suspends its weight, and R-16's rotor is a flat disc, not a held pea.
`castVolume.test.ts` pins that an armless swirl stays uniform, an armed one
concentrates, and the pattern turns with the phase.

**The heat axis is measured, not declared.** `heatBand` reads the vertical
band the visible mass occupies, so a held ball is hot at its own base wherever
it hovers and a column keeps its paper-to-crown axis. Do not replace it with
a declared reach: that is what painted every hold as spent crown.

**The pool is divided once, when the cast is built.** A share that moved with
the live population would make one cell's state a function of another's, and a
cell may feel only its own track (`../cells/CLAUDE.md`).

**Quality buys form roughness and never magnitude.** The tracer budget is a
fixed constant; quality reaches the substrate only as boundary wander.

**A row may not invent a shape.** An element row is motion physics, field
fusing and pigment. If a look needs new geometry vocabulary, that is a kind
question and belongs in a cell's flow, argued against the spec first.

**The GLSL ramp is emitted from the JS stop list** (`rampGlsl`), so the two
cannot drift. If a ramp changes, both halves change by construction — there is
nothing to keep in sync by hand.

## Extending

- **A new element row:** one row in each of `MOTION`, `SKIN`, `RAMPS`, `INKS`,
  `INK_STYLE`, `WASH`. `castVolume.test.ts`'s completeness test fails until
  all six exist. Argue the row from its look row's `@file` block, and keep the
  loner floor under 0.5 unless the angular read is the design.
- **A new spawn mouth:** a member on `SPAWN`, a case in `spawnAt`, and a cell
  that asks for it. If it needs a force the advection lacks, add the term to
  `TrackFlow` and `tracers.ts` — never a second integrator.
- **A new gauge for the GPU half:** a method on `VolumeSubstrate` beside
  `groundMass`, reading tracer state only.
- **Never from here:** the score, another channel, or the look table (data,
  behind an ESLint wall — the `no-restricted-imports` rule in
  `eslint.config.js` names this directory).

## Related

- [`../cells/CLAUDE.md`](../cells/CLAUDE.md) — the choreographers that write
  into it · [`../stage/CLAUDE.md`](../stage/CLAUDE.md) — what advances and
  paints it.
- [`../../../../docs/animation-volume.md`](../../../../docs/animation-volume.md)
  — the ruling this directory executes ·
  [`../../../../docs/animation-spec.md`](../../../../docs/animation-spec.md) —
  every R-nn cited here.
- [`../../../../tests/castVolume.test.ts`](../../../../tests/castVolume.test.ts)
  — the laws above, as assertions.
