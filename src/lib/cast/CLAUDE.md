# src/lib/cast

The cast: a resolved `SpellPlan` performed as a finite, timed, replayable
animation, in one of two styles the person casting picks. The `stage` style is
five layers, each with one job:

```
SpellPlan -> score/ -> SpellScore -> stage/ -> pixels
                              cells/  (one choreographer per track kind)
                              volume/ (the substrate the cells perform on)
                              looks/  (material profiles, read by cells)
```

The `classic` style is the Canvas2D engine the redesign deleted, restored under
[`classic/`](classic/CLAUDE.md). It performs `SpellIR` directly, with no plan and
no score, and it is frozen: a new ruling, primitive or look row lands in the
stage style and classic does not follow it.

Every cast is drawn here: the simulator's canvas, the Spell Effect Lab's preview
and the library book's replay each hold a `CastEngine` built in this directory.
Read [`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md)
and [`../../../docs/animation-spec.md`](../../../docs/animation-spec.md) before
changing anything here. Every rule below traces back to them, and is the stage
style's unless it names classic.

**One engine per style, and the person casting picks it.** A stored
`EffectStyle` ([`../structures/effectStyle.ts`](../structures/effectStyle.ts)) is
read once, at the canvas, and [`selectEngine.ts`](selectEngine.ts) is the one
place it becomes an engine. Both engines implement [`engine.ts`](engine.ts)'s
`CastEngine` with the same `render(spellIR, ring, timestamp, options)`, so a host
holds the interface and never the class. The no-second-engine law holds in the
form it was always protecting. No `SpellIR` reaches the choice, neither engine
can hand a cast to the other, neither has an "it drew nothing, try the other"
path, and there is no ownership boolean anywhere below `SpellIR`.

**Below the score, the performer is a cell over a shared tracer volume.** It is
ruled in [`../../../docs/animation-volume.md`](../../../docs/animation-volume.md).
A cell owns no geometry and no tracer loop. It writes its channel's `TrackFlow`,
and the substrate in [`volume/`](volume/CLAUDE.md) advects one seeded CPU tracer
population per track and skins every track's matter into one merged
marching-cubes body per element, shaded as flat watercolor washes with a dark
ink contour over a per-element ground wash. `cast/hybrid/` and the parcel-brush
vocabulary it held are gone, and so is the cell stage's `cells/forms/` before
it. Everything from the score up is unchanged in role.

Seal space, as everywhere below `SpellIR`: origin at the ring center, one unit =
the ring radius, x right, y screen-down, z out of the paper (spec R-03).

## File map

- [`engine.ts`](engine.ts): `CastEngine`, the seam both engines implement and
  every host holds, and `isCasting`, the one predicate both gate on.
  [`selectEngine.ts`](selectEngine.ts): `createCastEngine`, the one place a
  style becomes an engine.
- `score/`: [`compileScore.ts`](score/compileScore.ts) plan to timeline,
  [`beats.ts`](score/beats.ts) the R-01 clock, [`envelopes.ts`](score/envelopes.ts)
  the six curves, `tracks/{burst,jet,fan,vortex,hold,intake,shimmer,weave}.ts`
  one builder per primitive, `tracks/weaveCurrents.ts` R-23's authored currents,
  `tracks/gain.ts` the shared saturation.
- [`stage/`](stage/CLAUDE.md): [`stage.ts`](stage/stage.ts) `CastStage`, the
  stage style's engine, over [`surface.ts`](stage/surface.ts) (the
  `WebGLRenderer` and its canvas), [`frames.ts`](stage/frames.ts) (the fixed step
  and the couplings), [`portalCamera.ts`](stage/portalCamera.ts) and
  [`sealRoot.ts`](stage/sealRoot.ts).
- [`cells/`](cells/CLAUDE.md): one choreographer per track kind, over
  [`cell.ts`](cells/cell.ts) the contract and [`registry.ts`](cells/registry.ts),
  the one place kind is switched on.
- [`volume/`](volume/CLAUDE.md): the substrate every cell performs on. The
  per-element behavior matrix, the CPU tracer populations, the marching-cubes skin
  with its ink shader, the ground wash and the charge-beat ambient.
- `looks/`: [`look.ts`](looks/look.ts) the contract,
  [`table.ts`](looks/table.ts) `LOOKS` and resolution, one file per row (`fire`,
  `water`, `wind`, `earth`, `light`, `crystal`, `aeroform`, `inert`).
- [`classic/`](classic/CLAUDE.md): `ClassicCast`, the classic style's engine. The
  Canvas2D renderer restored from `b439a01`, with its force field and its element
  effects, frozen.
- [`sound/`](sound/CLAUDE.md): the cast heard. The same score performed as
  synthesized audio, one voice row per substance, beside the engines and
  independent of both.
- [`rng.ts`](rng.ts): the cast's seeded `Rng` and the hash that seeds it, kept in
  one copy so a stream never disagrees with the one a baseline was recorded from.
  [`vec3.ts`](vec3.ts): the seal-space vector math the score and cells run on.
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
argument list of the renderer it replaced, which is what made the cutover a swap
and what lets classic stand behind the same seam. It builds a cast once per
performance (`spellIR.signature` and the `activatedAt` that separates two casts
of one drawing): the score, one look row, one `VolumeSubstrate` with its tracer
pool divided among the tracks, and one cell per track over its own channel. It
maps wall clock to cast time from `activatedAt` and advances every cell in whole
`STAGE.stepMs` steps. In each step a cell writes its own track's envelopes into
its channel's flow and the channel advances its tracers, and then the holder's
ceiling is handed to what it captures. The skin repolygonizes at most once per
call under the seal-space root, and the portal camera reproduces
[`../portal/`](../portal/CLAUDE.md)'s projection so the effect and the paper stay
in one perspective.

**Classic.** `ClassicCast.render` takes the same four arguments and draws with
Canvas2D. It derives its force field from `spellIR.reading`, holds every effect
back until the portal has finished tilting, and picks which of its own renderers
draws. [`classic/CLAUDE.md`](classic/CLAUDE.md) has the rest, including why a
frame number fitted to one style means nothing to the other.

## Invariants and gotchas

**A cell is exactly one track, and feels only that track.** This one sentence
replaces the field's sum-over-sources, and it is the reason a few percent of
incidental bias can no longer drift the whole domain. A cell is built from its
track and its context, and advanced by frames carrying its own two envelopes.
Never give it a second track, another cell, or the score.

**R-20's fill-to-capacity lives inside the cell that holds it.** The sim needed a
`throttle` member for it, because held mass is not something a per-parcel
function can see. A cell is the whole track, so `hold` accumulates its own mass
against `capacity` and approaches it without reaching it. Only the share its
channel's `grip` gives the pair purchase on counts, which is why a wind hold never
fills. What it holds is kept by containment rather than by pausing ages. The
grip's `gather` draws matter back inside the shell and its `weightMul` suspends
the weight of what it can grip, while every tracer keeps ageing on a longer life
(`lifeMul`). All the fill may steer is this cell's own flow and the ceiling it
publishes.

**The one cross-track path is a declared coupling, and it is a constraint, not a
flow.** Where the plan says `{ holder: 'hold', captures: [...] }` the score
writes `capturedBy` on those tracks, and [`stage/frames.ts`](stage/frames.ts)
hands the holder's published ceiling to each captured cell after every cell has
taken the step. A captured cell still feels exactly one track; it just also meets
a ceiling. Nothing else below the score may reach across tracks, and anything
that wants to has to be declared in `plan/` first, where a text golden can see
it. The skin fusing every track's matter into one body is paint, not a path: no
channel's tracers ever feel another's.

**Stepping fresh to a timestamp is bit-identical to stepping there
incrementally.** The clock is `steps * stepMs`, a product and never a running
sum. Anything a cell or a tracer population integrates, it integrates on the same
fixed `dtMs` at every frame rate, so the same step count always reaches the same
state. The only randomness comes from the seeded streams in [`rng.ts`](rng.ts)
that each cell and each channel's tracers start from. The golden tiers stand on
this. If you add state to a cell or to the volume, it has to survive the same
test in [`../../../tests/golden/cast.test.ts`](../../../tests/golden/cast.test.ts).

**Never call `Math.random` or read a clock below `stage/`.** The stage owns the
only `timestamp`, and it converts it to cast time immediately. The frozen classic
engine is the one place below `SpellIR` that calls `Math.random`, and
[`classic/CLAUDE.md`](classic/CLAUDE.md) says why it may.

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

**Looks may not import from `compiler/plan/`, `cast/cells/`, `cast/stage/` or
`cast/volume/`.** One `no-restricted-imports` rule in
[`../../../eslint.config.js`](../../../eslint.config.js) enforces it. Looks are
data, and the moment data can reach behavior an art fix starts arriving as a
physics term again, which is the root cause the table exists to kill.

**A look tint paints nothing on its own.** Neither style reads one. The stage
hands the resolved row to its cells, and they read its `material` fields for
what only a cell can decide (a turning hold's arm count from `bands`, a burst's
`weight`). Every field has a reader. How a row is painted lives in the volume's
own tables, with color and wash in `volume/pigment.ts` and motion and fusing in
`volume/elements.ts`. Those were derived from the look tints and never read them,
so an art change lands there.

**Resolution never returns undefined, so nothing branches on element.**
`lookRow` falls sigil, then element, then the designed `inert` row, and the
volume's `volumeElementFor` and the sound's `voiceRow` resolve their own rows the
same way. R-11 makes "manifests nothing" a look, so there is no empty path in the
renderer and no ownership boolean. If something is unpainted, that is a missing
table row.

**The table is seven rows and the last two are the reason it exists.** Five
element rows, `crystal` above earth, `aeroform` above wind. Both are argued from
the dictionary's `sourceNotes`, not from taste. Crystal "creates and manipulates
crystalline objects", so it keeps earth's occluding `source-over` on the matter
roles and parts company everywhere else (cool tints, the widest core-to-edge fall
in the table, no undulation at all and the hardest flicker short of fire's).
Aeroform "creates and manipulates air, but does not itself move that air", so it
is wind read as a volume rather than as a path (the shallowest fall in the table
against wind's, more weight, and a fraction of wind's flicker and garnish). Those
two rows are PDF defect I closed: they were unrepresentable while looks keyed on
element, and adding them touched nothing but `table.ts`. That is the whole claim
the layer makes. The volume now carries both rows' painted identity in rows of
its own.

**The stage owns no portal numbers.** The camera in
[`stage/portalCamera.ts`](stage/portalCamera.ts) is read off the portal's own
ellipse and reproduces `projectSeal` to within 0.05px, so a form and the paper it
rose from cannot fall out of perspective. Every number it uses comes from
[`../portal/`](../portal/CLAUDE.md).

**Do not reorder a layer's tracks.** A cell and its channel's tracers are both
seeded from the score signature and the track's own index, so moving a track
re-seeds every track after it. The order is part of the replay contract, and
every cast baseline moves with it.

**A cast is a one-shot.** Before `activatedAt` and after `score.totalMs` the
stage paints nothing, and both are ordinary early returns, not special cases.

## Extending

Every recipe here is the stage style's. `classic/` is frozen and takes none of
them.

- **New look or motion for an element:** a row edit in the volume's own tables,
  with color and wash in `volume/pigment.ts` and motion and fusing in
  `volume/elements.ts`. Nothing else may change, and no cell may branch on
  element.
- **New sigil row:** a sigil whose art parts company with its element, the way
  `crystal` and `aeroform` do, gets a row in every table that resolves sigil
  before element. That is `looks/<sigil>.ts` and one line in `LOOKS`, the six
  volume rows in [`volume/CLAUDE.md`](volume/CLAUDE.md)'s "new element row"
  recipe, and a voice in [`sound/`](sound/CLAUDE.md) if it should sound different
  too. Keying is by sigil id, so each row takes precedence over the element row
  underneath it automatically. Argue the row from the sigil's dictionary
  `sourceNotes` in its `@file` block, and pin the argument in
  [`../../../tests/castLooks.test.ts`](../../../tests/castLooks.test.ts) so a
  later tuning pass cannot quietly undo it.
- **New spawn mouth, or a per-element fact a cell needs:** follow
  [`volume/CLAUDE.md`](volume/CLAUDE.md)'s recipes. A mouth is a `SPAWN` case,
  and a per-element fact is a `MOTION` column the channel publishes the way it
  publishes `grip`. There are no forms to add, because a cell owns no geometry.
- **New primitive (`vessel` is the last one left):** add its params to
  `PrimitiveParams` in `types/spell-score.ts`, add it to the `ScoreTrack` union,
  write a cell in `cells/` that picks or adds a spawn mouth, add one case in
  [`cells/registry.ts`](cells/registry.ts) and one `KIND_WEIGHT` row in
  `volume/pool.ts` (TypeScript names whichever you missed), add a track builder
  in `score/tracks/`, and retire its `routed-*` stand-in (`vesselFan` and its
  note row in `compileScore.ts`). The stage needs no change: a new track picks an
  existing `LookRole`. [`cells/CLAUDE.md`](cells/CLAUDE.md) lists the law tests a
  new cell owes.
- **New role:** add it to `LookRole`, then every row in `looks/` stops
  type-checking until it is filled in. That is the point.
- **Iterate visually:** `/tools/spell-effect-lab`. The scripted-clock hook the
  look tier drives is `?preset=<id>&frameMs=<n>&sigil=<id>`, and
  `&engine=classic` renders it in the classic style.

## Related

- [`cells/CLAUDE.md`](cells/CLAUDE.md): the choreographers ·
  [`volume/CLAUDE.md`](volume/CLAUDE.md): the substrate they perform on ·
  [`stage/CLAUDE.md`](stage/CLAUDE.md): the camera, the step and the surface.
- [`classic/CLAUDE.md`](classic/CLAUDE.md): the frozen second style ·
  [`sound/CLAUDE.md`](sound/CLAUDE.md): the cast heard ·
  [`../structures/effectStyle.ts`](../structures/effectStyle.ts): the preference
  that picks between them.
- [`../types/spell-score.ts`](../types/spell-score.ts): the score's shapes ·
  [`../types/spell-plan.ts`](../types/spell-plan.ts): its input.
- [`../compiler/CLAUDE.md`](../compiler/CLAUDE.md): the plan this performs.
- [`../portal/CLAUDE.md`](../portal/CLAUDE.md): the tilted paper both styles
  paint on.
- [`../../../tests/CLAUDE.md`](../../../tests/CLAUDE.md): the cast, plan and look
  golden tiers, and which change moves which baseline.
