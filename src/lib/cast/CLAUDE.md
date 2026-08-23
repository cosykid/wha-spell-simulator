# src/lib/cast

The cast: a resolved `SpellPlan` performed as a finite, timed, replayable
animation. Four layers, in order, each with one job:

```
SpellPlan -> score/ -> SpellScore -> stage/ -> pixels
                              cells/ (one performer per track kind)
                              looks/ (material profiles, read by cells)
```

This directory replaced the force field and the six effect renderers the redesign
deleted, and it is the **only** effect path: the simulator's canvas, the Spell
Effect Lab's preview, and the library book's replay all run it. There is no
second engine, no ownership boolean and no fallback branch anywhere below
`SpellIR`. Read
[`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md) and
[`../../../docs/animation-spec.md`](../../../docs/animation-spec.md) before
changing anything here; every rule below is one of theirs.

**Below the score, the performer is the cell stage** — see
[`../../../docs/animation-cells.md`](../../../docs/animation-cells.md), which
pointed the three call sites at `CastStage`. Everything from the score up is
unchanged in role. The Canvas2D engine the stage replaced is gone: `sim/`'s
parcels and kernels and `render/`'s painter and baked sprite atlas were deleted
at cutover, so the no-second-engine law holds below `SpellIR` as well as above
it.

Seal space, as everywhere below `SpellIR`: origin at the ring center, one unit =
the ring radius, x right, y screen-down, z out of the paper (spec R-03).

## File map

- `score/` — [`compileScore.ts`](score/compileScore.ts) plan to timeline,
  [`beats.ts`](score/beats.ts) the R-01 clock, [`envelopes.ts`](score/envelopes.ts)
  the six curves, `tracks/{burst,jet,fan,vortex,hold,intake,shimmer}.ts` one
  builder per primitive, `tracks/gain.ts` the shared saturation.
- [`stage/`](stage/CLAUDE.md) — [`stage.ts`](stage/stage.ts) `CastStage`, the
  engine the three call sites construct, over [`surface.ts`](stage/surface.ts)
  (the `WebGLRenderer` and its canvas), [`frames.ts`](stage/frames.ts) (the fixed
  step and the couplings), [`portalCamera.ts`](stage/portalCamera.ts) and
  [`sealRoot.ts`](stage/sealRoot.ts).
- [`cells/`](cells/CLAUDE.md) — one performer per track kind, over
  [`cell.ts`](cells/cell.ts) the contract and [`registry.ts`](cells/registry.ts),
  the one place kind is switched on. `forms/` holds the geometry each cell is
  built from.
- `looks/` — [`look.ts`](looks/look.ts) the contract,
  [`table.ts`](looks/table.ts) `LOOKS` and resolution, one file per row
  (`fire`, `water`, `wind`, `earth`, `light`, `crystal`, `aeroform`, `inert`).
- [`vec3.ts`](vec3.ts) — the seal-space vector math the score and cells run on.
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

**Stage.** `CastStage.render(spellIR, ring, timestamp, options)` kept the
argument list of the renderer it replaced, which is what made the cutover a swap.
It compiles the score once per `spellIR.signature`, builds one cell per track
against the resolved look row, maps wall clock to cast time from `activatedAt`,
and advances every cell in whole `STAGE.stepMs` steps. Each cell performs its own
track's envelopes as macroscopic form under the seal-space root, the holder's
ceiling is handed to what it captures, and the portal camera reproduces
[`../portal/`](../portal/CLAUDE.md)'s projection so the effect and the paper stay
in one perspective.

## Invariants and gotchas

**A cell is exactly one track, and feels only that track.** This one sentence
replaces the field's sum-over-sources, and it is the reason a few percent of
incidental bias can no longer drift the whole domain. A cell is built from its
track and its context, and advanced by frames carrying its own two envelopes.
Never give it a second track, another cell, or the score.

**R-20's fill-to-capacity lives inside the cell that holds it.** The sim needed a
`throttle` member for it, because held mass is not something a per-parcel
function can see. A cell is the whole track, so `hold` accumulates its own mass
against `capacity` and approaches it without reaching it. That fill is the one
thing it derives from its own history, and all it may steer is this cell's form
and the ceiling it publishes.

**The one cross-track path is a declared coupling, and it is a constraint, not a
flow.** Where the plan says `{ holder: 'hold', captures: [...] }` the score
writes `capturedBy` on those tracks, and [`stage/frames.ts`](stage/frames.ts)
hands the holder's published ceiling to each captured cell after every cell has
taken the step. A captured cell still feels exactly one track; it just also meets
a ceiling. Nothing else below the score may reach across tracks, and anything
that wants to has to be declared in `plan/` first, where a text golden can see
it.

**Stepping fresh to a timestamp is bit-identical to stepping there
incrementally.** The clock is `steps * stepMs`, a product and never a running
sum; a cell that integrates anything integrates it on the same fixed `dtMs` at
every frame rate, so the same step count always reaches the same state; the only
randomness is each cell's own seeded `Rng`. The golden tiers stand on this. If you add state to a cell, it has to survive the same test in
[`../../../tests/golden/cast.test.ts`](../../../tests/golden/cast.test.ts).

**Never call `Math.random` or read a clock below `stage/`.** The stage owns the
only `timestamp`, and it converts it to cast time immediately.

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

**Looks may not import from `compiler/plan/`, `cast/cells/` or `cast/stage/`.** One
`no-restricted-imports` rule in [`../../../eslint.config.js`](../../../eslint.config.js)
enforces it. Looks are data, and the moment data can reach behavior an art fix
starts arriving as a physics term again, which is the root cause the table
exists to kill.

**Resolution never returns undefined, so nothing branches on element.**
`lookRow` falls sigil, then element, then the designed `inert` row. R-11 makes
"manifests nothing" a look, so there is no empty path in the renderer and no
ownership boolean. If something is unpainted, that is a missing table row.

**The table is seven rows and the last two are the reason it exists.** Five
element rows, `crystal` above earth, `aeroform` above wind. Both are argued from
the dictionary's `sourceNotes`, not from taste: crystal "creates and manipulates
crystalline objects", so it keeps earth's occluding `source-over` on the matter
roles and parts company everywhere else (cool tints, the widest core-to-edge
contrast in the table, the `glint` sprite, almost no trails); aeroform "creates
and manipulates air, but does not itself move that air", so it is wind read as a
volume rather than as a path (soft discs, the larger sizes, a fraction of wind's
stretch, and `leak` wherever wind decays). Those two rows are PDF defect I
closed: they were unrepresentable while looks keyed on element, and adding them
touched nothing but `table.ts`. That is the whole claim the layer makes.

**The stage owns no portal numbers.** The camera in
[`stage/portalCamera.ts`](stage/portalCamera.ts) is read off the portal's own
ellipse and reproduces `projectSeal` to within 0.05px, so a form and the paper it
rose from cannot fall out of perspective. Every number it uses comes from
[`../portal/`](../portal/CLAUDE.md).

**Do not reorder a layer's tracks.** A cell is seeded from the score signature
and its own track index, so moving a track re-seeds every form after it. The
order is part of the replay contract, and every cast baseline moves with it.

**A cast is a one-shot.** Before `activatedAt` and after `score.totalMs` the
stage paints nothing, and both are ordinary early returns, not special cases.

## Extending

- **New look, or new art for an element:** edit that element's row in `looks/`.
  Nothing else may change. The role tints and the row's `material` profile are
  the whole surface.
- **New sigil row:** add `looks/<sigil>.ts` and one line in `LOOKS`, the way
  `crystal` and `aeroform` did. Keying is by sigil id, so it takes precedence
  over the element row underneath it automatically. Argue the row from the
  sigil's dictionary `sourceNotes` in its `@file` block, and pin the argument in
  [`../../../tests/castLooks.test.ts`](../../../tests/castLooks.test.ts) so a
  later tuning pass cannot quietly undo it.
- **New form:** a module in `cells/forms/` returning geometry and material, built
  along local +Z if it is a shaft. Forms are shapes; a cell is what performs one.
- **New primitive (`vessel` is the last one left):** add its params to
  `PrimitiveParams` in `types/spell-score.ts`, add it to the `ScoreTrack` union,
  write a cell in `cells/`, add one case in
  [`cells/registry.ts`](cells/registry.ts) (the switch is exhaustive, so
  TypeScript names the one you missed), add a track builder in `score/tracks/`,
  and delete its `routed-*` stand-in from `compileScore.ts`. The stage needs no
  change: a new track picks an existing `LookRole`.
- **New role:** add it to `LookRole`, then every row in `looks/` stops
  type-checking until it is filled in. That is the point.
- **Iterate visually:** `/tools/spell-effect-lab`. The scripted-clock hook the
  look tier drives is `?preset=<id>&frameMs=<n>&sigil=<id>`.

## Related

- [`cells/CLAUDE.md`](cells/CLAUDE.md) — the performers and their forms ·
  [`stage/CLAUDE.md`](stage/CLAUDE.md) — the camera, the step and the surface.
- [`../types/spell-score.ts`](../types/spell-score.ts) — the score's shapes ·
  [`../types/spell-plan.ts`](../types/spell-plan.ts) — its input.
- [`../compiler/CLAUDE.md`](../compiler/CLAUDE.md) — the plan this performs.
- [`../portal/CLAUDE.md`](../portal/CLAUDE.md) — the tilted paper it paints on.
- [`../../../tests/CLAUDE.md`](../../../tests/CLAUDE.md) — the cast, plan and
  look golden tiers, and which change moves which baseline.
