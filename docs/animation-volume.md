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

**The spun column (R-21).** The revived firenado exposed the next gap: its
inward columns author a clash beam and its twisted pulls author helical
intake, and the two rendered as parts — a beam standing in four discrete
inflow branches crawling over the paper. Ruled as R-21 in
`docs/animation-spec.md`: a strongly helical intake feeding a clash column
spins the whole column into a single vortex. The fusion lives in
`compiler/plan/spinUp.ts` — the clash, the draw and the swirl pay the
circulation, the vertical aim and the `IntakeSpec` are consumed, and the plan
notes `spun-column` — so the score compiles one vortex track where jet plus
intake used to stand. The transfer gains are calibrated so a real hand-drawn
whirl seal (magnitudes far below the synthetic lab corpus) lands where the
lab's own pinwheel does on the vortex saturation curve. The vortex track also
slimmed to tornado proportions (height 2.1, crown 0.58 against a 0.3 foot):
a whirl is taller than it is wide, or it reads as a goblet. The lab preset
`spun-column` pins the arrangement across all three golden tiers; only
`column-pinwheel`'s baselines moved with the proportions, and the charge
frame stayed byte-identical.

**The condensing halo, the ring pour, and the drying splash (2026-08-25,
after the manga pass; halo 2026-08-26).** The library's pull seals showed the same disease the
firenado had, below the ruling layer this time: the sink mouth birthed the
medium as four discrete precessing streams, so every pull — straight or
slanted, strong or weak — wore radial supply branches, and the sector mouth
carved dispersion into per-sign wedges. Canon draws neither. Grasping Wind
raises "a wind current" toward the seal — one current, and slanted keystones
make "a vortex", one vortex (manga ch. 14); a dispersion-signed spell pours
"out on all sides … like an overflowing bucket" (ch. 10); and Billowing
Collection turns what it gathers into a single cloud (ch. 7). Symmetry in a
seal is syntax, not anatomy: the drawn signs say what the spell does, and the
effect answers as one body, never as one limb per sign.

Three changes carry that reading, all below the score:

- The sink mouth births a condensing halo, angle-uniform by law. The first
  fix here was one connected arc bending in to the mouth, and it was wrong
  the same way the four streams were: a limb from one bearing is still
  anatomy — a seal drinks from everywhere at once, so no bearing may be
  favored, whether four or one. The mass sits in the radius instead: a share
  of births lands inside the mouth disc itself (the collection converting to
  its one cloud — otherwise the ring attractor parks every arrival at the
  pool radius and the halo reads as a wreath of beads around a hole), the
  rest crowd steeply toward it, and the tail thins below the skin's deposit
  cutoff into wash. The steep crowd is load-bearing: the mid-halo is the
  marginal band where deposits skin but do not merge, which is where
  countable clods appear. The twist draws no spiral lane either — it spins
  the whole halo (birth velocity blends radial draw with tangential twist by
  §7's share, and the fill share yields to the twist so a wound pull keeps
  its eye open): a straight pull is a flat all-sides inflow, a slanted one is
  one vortex turning as one body. Reach follows emission, so a faint pull
  hugs the mouth and still clears the cutoff. Some births crowd an
  angle-uniform ring front walking inward at a fixed pace — swallowed one
  wave after another, a surge, never a knot at one bearing. Reversed, the
  halo is born at the brim all around and spills over: one signed kernel.
  The inhaled medium's own churn is damped hard (`turbMul` 0.3, `gustMul`
  0.35): left at full, the arrivals dwelling at the mouth get herded into
  curl pockets and the one tide breaks into countable balls.
- The sector mouth keeps a ring backbone: with drawn sites the pour is 45%
  site-directed over a wider spread and 55% ring, so the skirt is one
  scalloped body that fills toward the drawn signs rather than four blades.
- The burst's splash now dries through the body (`drain` ramps from the
  body's start instead of waiting for the afterglow). Left on the element's
  own pool clock, the strike's scattered drops rode the pool spread to its
  edge and stood the whole cast as a ring of countable beads — on column
  seals the fed pool hides them, on pull seals they stood naked. The residue
  is the ground wash's business, not the skin's.

Every cast text moved (the burst is unconditional) and every stage look
baseline was regenerated; the classic set is untouched. Drying the residue
also exposed that `levitation-inverted` compiles to the identical quiet-plume
score as `none`, `swirl-pushes` and `column-cancelled` — its distance to them
had been splash-residue seed noise — so it joined the floor test's inert set
where it always belonged.

## 2026-09-02 addendum: the canon physics pass

[`ground-truth.md`](ground-truth.md)'s mechanics had reached the score and
the cells (the levitation pair's balance and its fill, the lens shrinking a
blob, the region valve) but not the substrate, which still suspended every
element the same way under a grip, let a spring squeeze a held ball to
whatever size its stiffness dictated, and moved light, earth and crystal as
three more plumes with different numbers. This pass carries four of the
ground truth's mechanics into the substrate and re-argues four element rows
from the panels, under the taste axes the volume ruling stands on. Nothing
above `SpellIR` moved; the score gained one field.

**The grip is the element's (section 6).** The pair's force balance holds
what it can get purchase on, and section 6's own table says wind gives it
none: "a ground-mounted wind-levitation ring is a fan". So `MOTION` carries
a `grip` per row (fire, water, light, earth, crystal 1; wind 0; aeroform
0.4, a body of created air the pair half holds), and three things read it,
none of them a cell naming an element. The hover mouth births a streaming
element on the disc under the locus and throws it up through it, instead of
through the shell at rest. The gather contains a streaming element only
across the axis, a tube rather than a sphere, and leaves its whole weight
on it, so it washes through the pair and out over the top. And the hold
cell's fill grows by the channel's `grip`, so a wind hold pumps for the
whole cast, never closes, and never caps the column it is coupled to: the
wind `column-levitation` stands taller at the end of the body than the
water one the grip closes on. `cellsHold.test.ts` pins that, and
`castVolume.test.ts` pins that wind in a hover flow streams (mean vertical
speed over 0.8, clearing the shell) where water hangs.

**Manifested magic occupies room, and focus makes it rigid (section 8).**
Two population-wide mechanics now act on the turbulence stride at its
compensating gain, reading the neighbourhood through one hashed grid rebuilt
from the arrays each stride step ([`neighbourhood.ts`](../src/lib/cast/volume/neighbourhood.ts)),
so both stay pure functions of the state. The excluded volume: airborne
tracers of one channel push apart inside `EXCLUDED.radius` (0.085 seal
units) at up to `strength` (1.8) for a full overlap, the push capped at twice
that however dense the crowd. It is what section 8 asked for against "the
waterball's slow squish": a held ball is now as big as its content, and the
law test squeezes 120 and 1200 tracers onto a 0.05 shell with a hard gather
and reads the 1200 standing a third wider. Focus packs against it by
shrinking the radius (cube root of the lens) rather than removing it, which
is section 8's "toward the incompressible limit". Rigidity: each airborne
tracer's velocity relaxes toward its neighbours' mean at
`RIGIDITY_PER_FOCUS` (4) per unit of lens above one, so a focused blob moves
as one body; at focus 2.5 the local velocity scatter in a held ball halves.
The plan's `focus` travels to the substrate as `SpellScore.focus` and
`VolumeKey.focus`, because no single track owns it. Every lab preset has a
lens of one, so the goldens carry none of the rigidity and the law test
constructs it directly. A neighbour pushes with its fade rather than its
presence, so a crown melting past the tear line or a short-fused strike
parcel takes no room, and a thin wall is left to its pinch. The strength is
deliberately low: at 3 the push spread the gripless rotor's dense disc, and
1.8 keeps the ball law with margin. (The pinwheel's crown chips in the
after captures are the vortex's own standing crown weakness under a new
seed: its population digest reads the same to three decimals with the push
on and off, and the same as at `HEAD`.)

**Matter that stops sets, and matter that lands heaps.** The pool block
grew two dials. `settleSpeed`: airborne matter slower than it, once clear of
the mouth, sets where it stands, a third settled state (`FROZEN`) that
neither spreads nor heaps nor feels the sink, and never melts. Only crystal
sets it, and `castVolume.test.ts` pins that it stays the only row. `heap`:
a landed tracer stands its row's thickness above the floor where the landed
crowd is dense (`HEAP.crowd` neighbours inside `HEAP.radius`), so earth's
mound has height (0.4) and water's puddle next to none (0.05). The mound
gauge reads the landed earth standing a third of a unit up where the water
lies flat.

**A pull holds its cushion (section 7).** The kind's positive sink now acts
on the settled mass too, at half strength: what an intake grasps stays a
cushion gathered at the mouth (the pooled radius under a 1.5 sink is a
quarter smaller than under none), and a whirl's foot gathers on its wall,
instead of the puddle running out from under either. The grasp capacitor's
transient itself is still the envelope's `leak`; this is the standing half
of it.

**Four rows re-argued from the panels.**

- _Light_ was a plume of near-weightless washes and lingered through the
  afterglow like smoke. Light radiates: it now leaves the mouth fast and
  straight (rise 1.5–2.1, pinch 5, no gust, no swirl, a sixth of the old
  stir), lives 0.45–0.8s so the shaft stands only while the seal feeds it,
  and the skin's long smear turns the fast beads into the shaft. The beam
  runs half fire's width and is gone within a second of the feed stopping,
  which canon's light beam is. Brightness is still the pigment's, never a
  bloom.
- _Earth_ was a rubble fountain, five lobs of clods in dead air. Canon
  manipulates ground (sand bridges, bent walls) and never throws it: the
  launch is now a slow thick heave (rise 0.55–1.15 under gravity 5, four
  wide lobes), the floor block piles harder and spreads less, and the heap
  makes the persistent mound the afterglow dries out.
- _Crystal_ was a rounded blue heap, the one row where facets were correct
  wearing none. It is now grown: six fixed azimuths leaning out from the
  mouth at a wide spread of speeds under a hard drag, each ray setting as it
  stops, so the cast paints standing pillars fused at the base, jagged at
  the top, that hold until the afterglow drains them. No pinch bends the
  rays back onto a column and no weight bends them down.
- _Wind_ and _aeroform_ melted their crowns too high and the gusts flung
  the tips off as countable chunks. Both tear earlier and faster (wind from
  0.8 of reach at rate 2.6, aeroform from 0.85 at 2.4) and stand a little
  lower, so the crown thins to nothing inside the body.

**The held ball.** Canon's pyreball is a ball the size of a hand over its
page, not a bead: the hold's shell is 0.3 seal units (from 0.22), divided by
the lens as section 8 composes the two (pyreball to floatglow lamp). Inside
the grip the element's own turbulence now runs at full strength and at 2.5
times finer a scale than its row's (`turbScaleMul`, a new flow field): at
the row's scale a ball the size of one curl only sways, at a finer one its
surface boils, and a held fire is still a fire. R-16's rotor keeps its old
absolute size (`ROTOR.stance` 1.9 against the wider shell) and its old
angular rate: the score's `spin` scales with the shell, because the bisect
of the rotor's spreading found neither the push nor the gather but the
slower pattern, which lets the arm herding over-drive the orbit until the
disc reaches the ring and breaks into countable blobs. Its gripless gather
is firmer for the same reason (`GRIPLESS` 0.3).

**What moved.** Every cast text, because `focus` joined the score and the
score signature seeds every cell, and every stage look baseline; the
classic set is untouched. The step costs 0.25–0.8ms per cast in Node
across all channels with the neighbourhood on the stride, inside the frame
budget's margin. `castVolume.test.ts` gained seven laws (the grip, the
excluded volume, rigidity, crystal's setting, earth's heap, the light beam,
the pooled sink) and `cellsHold.test.ts` one (the fan); the `levitation`
probe rows gained the hold's `purchase`.

**Deliberately left.** Section 1's quality-multiplies-power stays an open
canon question against the volume ruling's "quality buys form roughness and
never magnitude"; nothing here touched it. The grasp capacitor's charge
transient is still approximated by the envelope. Aeroform's 0.4 is a
design choice, not a reading of a panel. And the excluded volume is global
by law but sized against the thin walls, so a row that wants a denser body
raises its own spawn, not the push.
