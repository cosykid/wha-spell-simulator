# src/lib/cast

The cast: a resolved `SpellPlan` performed as a finite, timed, replayable
animation. Four layers, in order, each with one job:

```
SpellPlan -> score/ -> SpellScore -> sim/ -> Parcel[] -> render/ -> pixels
                                                looks/ (data, read by render/)
```

This directory is the redesign's replacement for [`../field/`](../field/CLAUDE.md)
and [`../renderer/effects/`](../renderer/CLAUDE.md). It is lab-only until the
phase 5 cutover: the simulator route still renders through `SpellEffectRenderer`
and knows nothing about `cast/`. Read
[`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md) and
[`../../../docs/animation-spec.md`](../../../docs/animation-spec.md) before
changing anything here; every rule below is one of theirs.

Seal space, as everywhere below `SpellIR`: origin at the ring center, one unit =
the ring radius, x right, y screen-down, z out of the paper (spec R-03).

## File map

- `score/` — [`compileScore.ts`](score/compileScore.ts) plan to timeline,
  [`beats.ts`](score/beats.ts) the R-01 clock, [`envelopes.ts`](score/envelopes.ts)
  the six curves, `tracks/{burst,jet,fan,vortex,hold,intake,shimmer}.ts` one
  builder per primitive, `tracks/gain.ts` the shared saturation.
- `sim/` — [`cast.ts`](sim/cast.ts) the fixed-step loop and `CastState`,
  [`parcel.ts`](sim/parcel.ts), [`aperture.ts`](sim/aperture.ts) the R-09 spawn
  surface, [`rng.ts`](sim/rng.ts), [`falloff.ts`](sim/falloff.ts),
  `primitives/{burst,jet,fan,vortex,hold,intake,shimmer}.ts` the kernels plus
  [`registry.ts`](sim/primitives/registry.ts), the one place kind is switched on.
- `render/` — [`castRenderer.ts`](render/castRenderer.ts) the engine,
  [`painter2d.ts`](render/painter2d.ts) parcels to pixels,
  [`sprites.ts`](render/sprites.ts) the baked atlas.
- `looks/` — [`look.ts`](looks/look.ts) the contract,
  [`table.ts`](looks/table.ts) `LOOKS` and resolution, one file per row
  (`fire`, `water`, `wind`, `earth`, `light`, `inert`).
- [`vec3.ts`](vec3.ts) — the seal-space vector math the score and sim run on.
  `utils/geometry.ts` owns the in-plane `Vector` helpers.

Types live in [`../types/spell-score.ts`](../types/spell-score.ts), so a shape
crossing the seam is declared once.

## How it works

**Score.** `compileScore(plan, { signature, duration })` lays R-01's five beats
over `totalMs` and turns the plan's primitives into tracks. Every track carries
an `emission` envelope (parcels per second) and a `drive` envelope (velocity
scale), and both are required fields, so a track without timing does not compile.
Two tracks are unconditional: `shimmer-ambient` (R-10's medium) and `burst`
(R-01's strike). R-13's `vessel` is the last primitive without a kernel, and a
plan asking for one is routed into a fan with a `routed-vessel` note rather than
dropped.

**Sim.** `stepTo(score, state, targetMs)` advances a `CastState` in whole
`CAST.stepMs` steps. Each step emits per track, steers every parcel onto its own
track's kernel, moves it, then constrains it. Parcels leave when they age out or
pass `CAST.bounds`.

**Paint.** `CastRenderer.render(spellIR, ring, timestamp, options)` takes the
same arguments as `SpellEffectRenderer.render`, so the cutover is a swap. It
compiles the score once per `spellIR.signature`, maps wall clock to cast time
from `activatedAt`, steps the state, and hands the parcels to `paintCast`. The
painter projects each parcel through [`../portal/`](../portal/CLAUDE.md), sorts
by `depth`, sizes it from the look's range and its own `fade` curve, attenuates
by depth, stretches it along the projected velocity, and blits the baked sprite.

## Invariants and gotchas

**A parcel belongs to exactly one track and feels only that track's kernel.**
This one sentence replaces the field's sum-over-sources, and it is the reason a
few percent of incidental bias can no longer drift the whole domain. A kernel
takes its own params, a point and an age. Never give it a second track, the
parcel list, or the score.

**The one cross-track path is a declared coupling, and it is a constraint, not a
kernel.** Where the plan says `{ holder: 'hold', captures: [...] }` the score
writes `capturedBy` on those tracks and `cast.ts` runs the holder's `constrain`
after the parcel's own. A captured parcel still feels exactly one flow; it just
also meets a ceiling. Nothing else in the sim may reach across tracks, and
anything that wants to has to be declared in `plan/` first, where a text golden
can see it.

**Stepping fresh to a timestamp is bit-identical to stepping there
incrementally.** The clock is `steps * stepMs`, a product and never a running
sum; `parcel.ageS` is derived from `bornStep` and never accumulated; the only
randomness is `state.rng`, seeded from the score. The golden tiers stand on this.
If you add state to the sim, it has to survive the same test in
[`../../../tests/castSim.test.ts`](../../../tests/castSim.test.ts).

**Never call `Math.random` or read a clock below `render/`.** The renderer owns
the only `timestamp`, and it converts it to cast time immediately.

**Only `body` stretches (R-02).** A longer spell buys body time and nothing else.
No emission envelope may reach into `release`.

**The charge beat is silent for everything the seal manifests, and only for
that.** R-01 makes the charge content rather than dead time — "ink brightens,
ambient medium draws inward" — so `shimmer` is the one track whose emission opens
there, and every other track still starts at the strike. The law is _zero
non-ambient parcels during charge_, not zero parcels. The cast clock still starts
at `activatedAt`, so the charge beat spans the portal tilt.

**Every score carries the ambient medium (R-10).** `shimmer-ambient` is
unconditional and always `population: 'ambient'`, whatever class the sigil
belongs to, because it is the world rather than the spell. `intake` is ambient by
law too: `docs/ground-truth.md` section 7 exempts the spell's own manifestation
from the pull field, or grasping wind would swallow its own burst. Those two are
the only tracks that ignore `plan.mode`.

**Looks may not import from `compiler/plan/` or `cast/sim/`.** One
`no-restricted-imports` rule in [`../../../eslint.config.js`](../../../eslint.config.js)
enforces it. Looks are data, and the moment data can reach behavior an art fix
starts arriving as a physics term again, which is the root cause the table
exists to kill.

**Resolution never returns undefined, so nothing branches on element.**
`lookRow` falls sigil, then element, then the designed `inert` row. R-11 makes
"manifests nothing" a look, so there is no empty path in the renderer and no
ownership boolean. If something is unpainted, that is a missing table row.

**The painter owns no portal numbers.** Screen position, painter order and size
attenuation all come from `projectSeal`. Ground distance and height share one
elevation, so a parcel and the paper it rose from cannot fall out of perspective.
`sizePx` is screen pixels, matching the renderer it replaces.

**Do not reorder `state.parcels`.** Painter order is a sorted copy. The array's
own order is part of the replay contract.

**A cast is a one-shot.** Before `activatedAt` and after `score.totalMs` the
renderer paints nothing, and both are ordinary early returns, not special cases.

## Extending

- **New look, or new art for an element:** edit that element's row in `looks/`.
  Nothing else may change. Sizes and tints are the whole surface.
- **New sigil row (crystal, aeroform, phase 4):** add `looks/<sigil>.ts` and one
  line in `LOOKS`. Keying is by sigil id, so it takes precedence over the element
  row underneath it automatically.
- **New primitive (`vessel` is the last one left):** add its params to
  `PrimitiveParams` in `types/spell-score.ts`, add it to the `ScoreTrack` union,
  write a kernel in `sim/primitives/`, add three rows in
  `sim/primitives/registry.ts` (the switches are exhaustive, so TypeScript names
  the ones you missed), add a track builder in `score/tracks/`, and delete its
  `routed-*` stand-in from `compileScore.ts`. The painter needs no change: a new
  track picks an existing `LookRole`.
- **New role:** add it to `LookRole`, then every row in `looks/` stops
  type-checking until it is filled in. That is the point.
- **Iterate visually:** `/tools/spell-effect-lab`, engine `cast`. The
  scripted-clock hook is `?preset=<id>&frameMs=<n>&engine=cast`.

## Related

- [`../types/spell-score.ts`](../types/spell-score.ts) — the score's shapes ·
  [`../types/spell-plan.ts`](../types/spell-plan.ts) — its input.
- [`../compiler/CLAUDE.md`](../compiler/CLAUDE.md) — the plan this performs.
- [`../portal/CLAUDE.md`](../portal/CLAUDE.md) — the tilted paper it paints on.
- [`../../../tests/CLAUDE.md`](../../../tests/CLAUDE.md) — the motion, cast, plan
  and look golden tiers, and which change moves which baseline.
