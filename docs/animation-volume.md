# The inked volume: one body per element

Status: ruled and **executed 2026-08-25** on branch `animation-cells`. This
replaces the visual layer below the score for the `stage` style, and nothing
above it. Read [`animation-spec.md`](animation-spec.md),
[`animation-cells.md`](animation-cells.md) and
[`animation-hybrid.md`](animation-hybrid.md) first; every `R-nn` cited here is
the spec's, and every one of them still holds. The directory guides are
[`src/lib/cast/volume/CLAUDE.md`](../src/lib/cast/volume/CLAUDE.md) and
[`src/lib/cast/cells/CLAUDE.md`](../src/lib/cast/cells/CLAUDE.md).

## Why the hybrid substrate failed

The hybrid fluid-and-brush vocabulary was rejected on 2026-08-25 as "jagged
glass shards": the GPU parcel sprites and torn brush licks resolved, at
production scale, into angular translucent chips rather than into a mass. A
three-way bake-off followed (`src/routes/tools/proto-*`), and **C — inked
volume** was approved: a CPU tracer cloud skinned by marching cubes into ONE
merged rounded body per element, shaded as flat height-stepped watercolor
washes with granulation and a fresnel-driven DARK ink contour, water keeping a
subtle specular glint, and a per-element ground wash carrying paper contact.
No lick quads, no additive neon, no visible particles, no angular shards.

The six axes every visual decision answers to, from the bake-off review:

1. Not CG or hologram — no neon additive glow.
2. Dense continuous mass, never countable particles.
3. Organic turbulent motion, not stiff.
4. Pigment-on-paper palette.
5. Rounded merged silhouettes — never angular shards or chips.
6. Elements literally behave differently (motion and surface character), not
   palette swaps.

## The ruling

- **The score and everything above it is untouched.** Reading, Plan, Score, the
  R-01 beat clock, envelopes, signatures, determinism, the plan text goldens.
  The engine seam (`cast/engine.ts`, `selectEngine.ts`), `cast/stage/` (portal
  camera, fixed step, readback) and `cast/classic/**` are untouched.
- **`cast/hybrid/` is deleted**, brush marks, parcel textures, accumulation and
  all. Its replacement is `cast/volume/`.
- **One volume per element row present in the plan.** Every non-ambient track
  deposits its tracers into one shared marching-cubes field — same medium
  merges, so the burst and the column standing in it fuse into one body. A v1
  score is single-layer and single-element, so today that is one body per cast;
  the law is stated per element so R-12's nesting can add a second without a
  new rule.
- **The KIND says where matter goes; the ELEMENT says how it moves and
  reads.** A cell writes a `TrackFlow` (spawn mouth, origin and axis, reach and
  footprint, and the kind's own forces: swirl, signed ring sink, gather,
  ceiling, drift). The element contributes a `MOTION` row (buoyancy, gravity,
  drag, turbulence, gusts, pinch, tear, floor behavior), a `SKIN` row (how its
  field fuses) and a pigment row (ramp, rim ink, wash steps, ground wash). The
  kind x element cross product is the whole vocabulary, and neither half may
  reach into the other.
- **CPU tracers, seeded, fixed-step.** Advection runs on the stage's own 120Hz
  product clock with each channel's own `mulberry32` stream; `Math.random` and
  clock reads stay banned. The skin is stateless per paint — the field is
  rebuilt from the live tracers every repolygonize — so pixels are a pure
  function of CPU state and the camera, and fresh-to-t equals incremental
  stepping with no accumulation contract left to keep.
- `CastStage` keeps its name, its `CastEngine` seam, its
  `render(spellIR, ring, timestamp, options)` signature, its three call sites,
  the 120Hz product clock, the portal camera and the `?castReadback=1`
  contract.

## The substrate's laws, with their numbers

### The chip law

Any metaball below about two grid cells polygonizes as an angular chip — the
exact rejected failure. Mitigations, all load-bearing:

- **Binary deposit cutoff** `VOLUME.cutoff = 0.42`: a deposit's weight
  (`(0.16 + 0.84·fade) · channelDeposit`, times the cohesion crowd factor) is
  either past the cutoff or the deposit is not made at all.
- **Ball radius clears two cells**: base `strength 0.037` against
  `subtract 12` at `res 56` gives a full ball √(0.037·0.6/12)·56 ≈ 2.4 cells.
  `castVolume.test.ts` re-derives this, so a resolution change cannot silently
  reopen the chip regime.
- **Cohesion with a loner floor**: deposits contract toward the local tracer
  centroid (`cohesion 0.65 · row`, radius `0.3`, saturating at 8 neighbours),
  and isolated deposits fall to the row's `loner` floor and melt below the
  cutoff instead of chipping. Every row keeps `loner < 0.5` except crystal.
- **The steep crown melt**: above a row's `tearFrom`, fade is multiplied by
  `1 − 0.97·smoothstep((hn − tearFrom)/0.42)`. The first build used a gentle
  melt and it parked deposits exactly at the cutoff, which is where the strike
  flakes came from; steepness is the fix, not a taste.
- **Fade ramp-in capped by life**: `min(age / min(0.25, life·0.35), 1)`.
  Without the cap, the strike's short-fused impulse parcels spent their whole
  life under the cutoff and the strike rendered as a pile of separate chips.

Crystal is the one row that leans into the law deliberately — sparse cohesion
(0.18), a high loner floor (0.55), no smoothing, chunky deposits (strength
2.0) and flat-shaded facet normals — and the unit suite pins that it stays the
only one.

### One field, eight rows

The per-element tables live in `volume/elements.ts` (motion, skin) and
`volume/pigment.ts` (ramps, rim inks, ink-skin rows, ground-wash rows).
Resolution is the look table's own rule: sigil row, else element row, else the
designed `inert` default (R-11), implemented in `volumeElementFor` and pinned
in the unit suite. The rows, as designed:

| row      | motion identity                                                        | skin identity                                | pigment identity                                  |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| fire     | buoyant (3.4), turbulent (3.1), pinched column, crown tears and melts  | raw metaballs, mild cohesion, one soft pass  | soot→red→orange→pale ramp, heat falls with height |
| water    | heavy (g 3.3), three braided sub-jets, pools and spreads, drains       | low iso + smear + 2 passes: one rounded body | indigo→foam, rim ink strongest, the one glint     |
| wind     | fastest (rise 2–3), gusts 4.2, barely pinched, short lives             | few fat smeared deposits fuse into ribbons   | palest celadon, opacity 0.28                      |
| earth    | ballistic lobs (g 4.2, five sub-jets), lands, piles, mound persists    | compact fat blobs, no streaking              | matte shale→ochre→sand, opacity 1                 |
| light    | near-weightless rise, soft stir, melts high                            | longest smear: rising shafts                 | deep amber→pale gold, no bloom ever               |
| crystal  | grows: slow leaning spires on six fixed azimuths, near-zero turbulence | the chip law leaned into; facet normals      | violet seam→ice facet, stillest wobble            |
| aeroform | wind read as a volume: slower, softer, longer-lived                    | fat soft merged body                         | barely-inked celadon-gray, opacity 0.2            |
| inert    | small, low-energy, desaturated (R-11's designed default)               | modest everything                            | ash grays, opacity 0.5                            |

Two rows carry state on the paper: water's pool block spreads
(`spread 0.85, ageRate 0.28`) and earth's mounds (`spread 0.12, dragXY 6,
ageRate 0.06` — the rubble outlives the cast's body and dries out on the
afterglow's `drain`). Fire, and every row above the tear line, melts instead.

### The heat axis is measured

The ink skin posterizes its ramp along seal height, but against the band the
visible mass actually occupies (`VolumeSubstrate.heatBand`, a min/max over
live tracers with a 0.5-unit floor), not against a declared reach. A held ball
is hot at its own base wherever it hovers; a column keeps its paper-to-crown
axis. The first build declared the axis and every hold rendered as spent
crown.

### The strike, the beats

`punchAt` keeps the hybrid's window digit for digit (`riseT 0.08`,
`fallT 0.275`, `windowT 0.78` of the fixed 320ms strike). The five beats per
kind stand as beat tables at the top of each cell: charge 980 silent for
everything but the medium, strike the impulse surge, body elastic, release
(spawn stops and the mass drains — water pours off and pools, fire burns out
upward, earth slumps into its mound), afterglow (the ground wash lingers and
drains on the cells' own `drain` flag).

### The charge-beat ambient

Required, and in the volume vocabulary: the shimmer cell's tracers are drawn
as at most 64 large granulated washes (`volume/ambient.ts`, one baked blot,
instanced, premultiplied over, billboarded in seal space), tinted from the
element's own ramp at 0.42 lifted toward paper. The medium's deposit into the
body field is **zero by law** — washes, never body — and its weight multiplier
is 0.12 so water's world drifts instead of raining. The e2e charge contract
(`fire-shoot.e2e.ts`: charge coverage above zero and under half of body) is
the gate the numbers were sized against; the first sizing failed it at 0.8–1.0
of body and the shipped numbers measure about 0.1–0.2.

### The sink is a ring attractor

Positive `sink` gathers matter at the `pool` radius and pushes it back out of
the exact center — that one signed term keeps the vortex eye hollow (R-16's
hollow via the substrate rather than a special case) and feeds the intake
mouth; negative is a plain outward push for the fan and the burst. The intake
spawns its medium as **four slowly precessing dense streams** rather than as a
thin annulus: a population spread over the whole rim can never reach merge
density, and unmerged deposits are chips. The hold suspends its element's
weight (`weightMul 0.12`) — levitation is the suspension of weight, or a water
ball sags through its own shell.

### A swirl carries turning arms

The marching-cubes skin of an axisymmetric mass shows **no rotation at all**,
however fast its tracers orbit: the isosurface of a statistically uniform
annulus is rotation-invariant, so the first build's vortex read as a bonfire
that happened to have angular momentum, and R-16's rotor as a shivering pea.
The fix is the phase-locked-patterning law taken literally. A flow may declare
`arms` (the vortex snaps the drawn fold 3..6, a turning hold takes its row's
banding), an `armPhase` the **cell** advances on the same spin phase the mass
is driven by, an `armGain` (tangential herding toward the nearest arm — strong
enough to beat the element's own churn, or the arms wash back out), and an
`armPitch` that trails the pattern with height so a funnel reads wound the way
it turns. The swirl and hover mouths sort birth azimuth into the arms, so
matter arrives already patterned and the herding only keeps it. Two supporting
terms came out of the same diagnosis: `gustMul` (a hold quiets its element's
sway the way it suspends its weight, and a funnel halves it, or wind's ±4.2
gusts shred the pattern) and `squash` (the hover mouth flattened toward its
equator — R-16's rotor is a **flat** swirl, wide at 2.6× the gripped ball's
stance, not a held pea). The vortex also drives coherence over churn now:
`turbMul 0.35`, `pinchMul 0.55` (the pinch only acts outside the boundary, so
it can never fill the eye), `sink ×1.9`, and birth on the local flared wall.
`castVolume.test.ts` pins the mechanism — an armless swirl stays uniform
(4-fold resultant < 0.15), an armed one concentrates (> 0.3), and the pattern
angle tracks the phase to within 0.3 rad on the fold circle. A hold whose spin
is under 0.3 rad/s keeps the round unpatterned shell, so a still water orb
never stands lobed.

### What a frame costs

The skin repolygonizes at most once per `render` call, on the 60Hz
`PAINT_EVERY = 2` cadence (`PAINT_BURST = 1`): a call that fell behind
advances the tracers in full and paints only its final state, which is the
prototype's `advanceTo` lesson (paint-per-caught-up-step is the catch-up
spiral). At display rates above 60Hz the mesh may lag one sim step; it never
interpolates. Turbulence curl lands on one step in three at three times the
gain (25ms cadence), which is the advection's whole cost contained.

## Performance

Measured on this hardware (Apple Silicon, ANGLE Metal), the reference cast —
fire-shoot's seal on the real simulator route, production settings, rAF
throttled to a 60fps cadence and the handler timed so every sample is one
painted frame (two 120Hz steps + one repolygonize):

- **median 4.72ms, p95 23.53ms, mean 6.96ms** over 240 painted frames
  (`frametime.json` in the capture set; budget was median ≤ 8.3ms, p95 ≤ 33ms).

The engine lands on **ladder rung 1 (tune)** and needed only it: res 56
(from the prototype's 64), `maxBalls 1600` (from 2200), smoothing folded to
0–2 passes per row, curl on the stride. Rung 2 (half-rate repolygonize) and
rung 3 (GPU raymarch) were not needed. The max sample (~175ms) is the
per-element shader compile, which lands once, on `attach`, inside the 980ms
charge — the compile budget the charge beat exists to absorb. Water and earth
(2 and 1 smoothing passes, more grounded mass) run heavier than fire but were
not separately gated; under SwiftShader the whole look tier (63 baselines)
regenerates in under two minutes, several times faster than the hybrid engine
it replaced, because the raster load is one modest mesh instead of 16k
sprites and a post chain.

## The golden tiers, redesigned

The cast tier serialized channel reports plus per-channel field probes of the
hybrid flow function; the flow function is gone. It now serializes, per track:
the unchanged `CellReport` (ink, centroid, root, tip, tracer tallies, the
archetype's named scalars) and the channel's **tracer digest** — fade-weighted
mass in four height bands and three radial rings (legible in a diff: "the
column's mass moved a height band"), plus an FNV-1a hash of a quantized
6×6×4 occupancy grid a tuning drift cannot dodge. Everything is quantized
before it is printed or hashed. Both of the tier's laws survive unchanged:
fresh-to-t equals incremental, and distinct presets produce distinct text.
The probe table (`castProbes.ts`) changed instrument for nothing: every row
reads the same report fields it read before, and no threshold moved.

The unit suite gained `castVolume.test.ts` (the element matrix's completeness
and its deliberate differences, the chip-law numbers, replay determinism,
water pools vs earth mounds, the crown melt, the ring attractor's hollow, the
gather's containment, the pool division, the ground gauge) and lost
`castHybrid.test.ts` with the substrate it pinned.

The look tier's 63 `cast-*` baselines were regenerated and the discriminative
floor passes; the 33 `classic-*` baselines are byte-untouched. The
driven-clock rule stands: golden frames are walked at 60fps, never jumped —
the pixels are stateless per paint now, but the tracer state they are a
function of builds frame over frame.

## Verification, as run

- `npm run check` — 0 errors.
- `npm run test:unit` — 314 pass (300 carried + 14 volume laws).
- `npm run test:golden` — 65 pass; all 19 cast and 19 plan baselines
  regenerated deliberately.
- `npx playwright test golden-look` — 97 pass (63 stage baselines
  regenerated, 33 classic compared and untouched, discriminative floor).
- `npx playwright test fire-shoot classic-shoot eraser shape-placement
canvas-resize` — all pass, under the default (SwiftShader) config; the two
  historically rasterizer-bound specs passed without hardware fallback,
  because the volume engine is lighter under software raster than the hybrid
  was.
- DB specs stay skipped (`E2E_DB` off).

## Pending `cast/CLAUDE.md` text

`src/lib/cast/CLAUDE.md` carries another session's uncommitted work, so its
text is deferred here the way the hybrid rework deferred its own. When that
file is next edited:

Its "Below the score, the performer" paragraph should read:

> **Below the score, the performer is a cell over a shared tracer volume** —
> see [`../../../docs/animation-volume.md`](../../../docs/animation-volume.md).
> A cell owns no geometry and no tracer loop: it writes its channel's
> `TrackFlow` and the substrate in `cast/volume/` advects one seeded CPU
> tracer population per track and skins every track's matter into one merged
> marching-cubes body per element, shaded as flat watercolor washes with a
> dark ink contour over a per-element ground wash. `cast/hybrid/` and the
> parcel-brush vocabulary it held are gone. Everything from the score up is
> unchanged in role.

Its file map's `cells/` line should drop "`forms/` holds the geometry each
cell is built from" (there are no forms), and the map should gain:

> - [`volume/`](volume/CLAUDE.md) — the substrate every cell performs on: the
>   per-element behavior matrix, the CPU tracer populations, the marching-cubes
>   skin with its ink shader, the ground wash and the charge-beat ambient.

Its "New form" extension recipe should be struck; the replacement is
`volume/CLAUDE.md`'s recipes (a new element row is six table rows; a new
mouth is a `SPAWN` case). Its note on the looks import wall should name
`cast/volume` in the restricted list, which `eslint.config.js` already
enforces. Its R-20 paragraph's "held parcels stop aging" sentence should say
the grip contains and suspends weight (`gather` + `weightMul`) — the volume's
hold keeps mass by containment rather than by pausing ages.

Two stale pointers of the same standing: `looks/look.ts`'s `@file` (another
session's WIP) references machinery this rework replaced, and the root
`CLAUDE.md` cast list now names `volume/` (edited with this change, since it
is not under the other session's diff).

## What is deferred

- **A motion-design pass per element.** Every row moves and reads distinctly
  and no row is empty or neon, but only fire, water, wind and earth have been
  reviewed in motion; light, crystal, aeroform and inert are designed in
  stills.
- **The fan's sheet reads as lobes rather than as one sheet** at some frames:
  its sectors merge late where the signs sit far apart. A `narrow`-like
  azimuthal smear for the sector mouth is the likely fix.
- **The intake's streams are chunky.** They read as drawn-in matter (the
  chips are gone), but the caterpillar lobing along each stream would round
  out with a stream-aligned smear axis, which the skin does not yet have.
- **Water's glint under SwiftShader** is a touch stronger than on hardware
  (different derivative precision); within the look tolerance, noted for the
  next art pass.
- **`vessel`** remains R-13's last unbuilt primitive and keeps its
  `routed-vessel` path.

## 2026-08-25 addendum: the swirl rework

The shipped vortex and rotor were judged not working ("swirl animation not
working as intended"): measured, the vortex's mass was azimuthally uniform
(8-sector histogram flat, 45% of it inside r 0.5 — no hollow, no visible
turn) and the rotor's mean tangential speed was a tenth of its spin. The fix
is the arm vocabulary above, plus the vortex retune and the rotor stance. It
moved exactly two cast baselines (`column-pinwheel`, `levitation-pinwheel`)
and their four strike/body look snapshots; every other baseline is
byte-identical, which is the no-collateral proof. The lab now honours
`?sigil=` (and a valid `?preset=`) on the live clock too, not only under the
golden tier's scripted one — a live capture of a named cast needs no UI
scripting beyond a value-changing preset select (a same-value select fires no
change event and restarts nothing).

Two grid-hygiene laws followed the same day, found on a long fed library
cast. A pool's settled spread now runs out at its row's `edge` (water 1.6,
earth 1.15): without it the puddle grew without bound and the polygonizer
clipped it against the grid box into a straight-edged glass slab. And
deposits fade out inside `VOLUME.wallMargin` of the grid's x/y walls, so no
surface can ever close against the box as a flat face. Every cast baseline
moved a hash (the golden sigil is water, and water pools in every cast); the
look tier moved nothing.

**Library revival.** The shared library's rows all predate the Reading and
Plan layers, and the stage engine replayed every one of them as R-11's inert
plan — a gray puff regardless of ink. `src/lib/ui/library/reviveSpell.ts` now
re-reads a legacy row's stored drawing through the same classifier the
simulator runs (template pass plus the ML refinement, which is what reads
rotated signs — the template matcher alone drops anything past its ±15°
frame) and resolves the plan under current canon before the card's driver is
built. Modern rows pass through untouched, classic replays are unaffected,
and a failed revival falls back to the stored row exactly as before.
