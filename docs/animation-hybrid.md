# The hybrid substrate: pigment on paper

Status: ruled and **executed 2026-08-24** on branch `animation-cells`. This
replaces the visual layer below the score for the `stage` style, and nothing
above it. Read [`animation-spec.md`](animation-spec.md) and
[`animation-cells.md`](animation-cells.md) first; every `R-nn` cited here is
theirs, and every one of them still holds. The directory guides are
[`src/lib/cast/hybrid/CLAUDE.md`](../src/lib/cast/hybrid/CLAUDE.md),
[`src/lib/cast/cells/CLAUDE.md`](../src/lib/cast/cells/CLAUDE.md) and
[`src/lib/cast/stage/CLAUDE.md`](../src/lib/cast/stage/CLAUDE.md).

## Why the cell vocabulary failed

The cell stage was architecturally right and visually wrong. It was rejected on
2026-08-24 on four axes, and the four are the rubric everything below is judged
against:

1. **Too CG.** Parametric three.js forms — cones, ribbons, point sprites — read
   as a hologram rather than as something drawn. The seal is a page from a manga
   and the effect was a game engine standing on it.
2. **Too sparse and thin.** A few hundred instanced ribbons cannot make a mass.
   The eye counted the forms.
3. **Motion too stiff.** Every form moved by a uniform write on a beat table, so
   the whole shape eased together. Nothing tore, nothing lagged, nothing frayed.
4. **Too glowy.** Additive blending everywhere, so every element resolved to the
   same neon core with a coloured halo.

A three-way bake-off followed (`src/routes/tools/proto-*`). The **hybrid
fluid-and-brush** prototype was approved: a dense GPU parcel mass carrying
pigment, drawn brush licks torn off its own silhouette, soot above it, and a
warm ramp on the cream paper. It reads as ink and gouache on the page, which is
what the four axes were asking for.

The taste reference for swirling motion is PR #76's dense energetic swirl, and
the reference frames for fire are the prototype's own.

## The ruling

- **The score and everything above it is untouched.** Reading, Plan, Score, the
  R-01 beat clock, envelopes, signatures, determinism, the plan text goldens. The
  score is the choreography; this is what performs it.
- **`cells/forms/` dies.** A cell owns no geometry at all now. What it owns is a
  choreography: the flow shape its parcels feel, the arc its brush marks are laid
  at, and whatever it accumulates of its own.
- **One shared substrate paints every track.** `cast/hybrid/` holds a GPU parcel
  field, a CPU brush population, one pigment ramp and one accumulation buffer,
  and every cell performs on it through a `Channel`.
- **An archetype is a field shape plus a spawn program plus a mark behaviour.**
  Not a kernel and not a mesh. That is why seven of them can look like one hand
  drew them, and why adding an eighth costs a file rather than a vocabulary.
- **An element is a palette and a set of material multipliers.** A row may be
  denser, hotter, heavier or thinner than the reference. It may not invent a
  shape.
- `CastStage` keeps its name, its `CastEngine` seam, its `render(spellIR, ring,
timestamp, options)` signature, its three call sites, the 120Hz product clock,
  the portal camera and the `?castReadback=1` contract.

## The substrate's laws

### One field, written twice

`hybrid/flow.ts` is the field on the CPU and `hybrid/flow.glsl.ts` is the same
field on the GPU: the same hash, the same trilinear value noise, the same
four-sample curl, and the same terms reading the same constants from
`hybrid/tuning.ts`. A brush mark integrating `flowAccel` travels the streamline a
parcel beside it travels, which is what stops the marks reading as a second
effect laid over the first. **Change one and change the other.**

The terms, all of them shared by all seven archetypes:

| term         | what it is                                                     |
| ------------ | -------------------------------------------------------------- |
| `buoyancy`   | drive along the shape's own axis, strongest while hot and low  |
| `converge`   | the pinch toward a wandering, lobed boundary                   |
| `swirl`      | rigid-body rotation about that axis                            |
| `sink`       | a signed **ring attractor** at `pool`, never a sink at a point |
| `drift`      | lateral drag                                                   |
| `gather`     | containment: outside `holdRadius`, drawn back onto the locus   |
| `ceiling`    | a lid the flow is pushed back under                            |
| `turbulence` | two curl octaves, finer and stronger the higher a parcel is    |

The sink being a **ring attractor** rather than a point sink is load-bearing:
matter gathers at a radius and is gently pushed back out of the exact centre. A
point sink piles the ambient medium into a stain over the seal, which is what the
first build did.

### The anti-confetti law

A mark's alpha is gated by the mass under it:
`cover^0.85 · (1 − 0.34·smoothstep(0.8, 1, cover))`, where `cover` is
`massDensity` — the coverage of the parcel mass at that point, which falls to
zero with the channel's own emission. **Marks exist only where mass supports
them.** Smoke is the one exception and it is deliberate: a crown carries on above
the body, because that is where smoke goes.

### Silhouette-aware spawning

`boundaryRadius` is the surface the field pinches parcels toward; the drawn edge
stands at `FLOW.silhouette` (2.05) times it, because the pinch is an attractor
and not a wall. `mark.ts:findTear` rejection-samples up to four `(θ, along)`
sites against `MARK.tearBar × rng()`; the tear score is outward flow (1.3×) plus
boundary bulge (2.4×) plus screen payoff (2.1×). An accepted score scales the
mark's size by `1 + 0.85·torn` and its peak alpha by `1 + 0.5·torn`.

One search serves every archetype, because every archetype pinches toward the
same parameterised boundary: a column's narrows with height, a funnel's widens
(the same term with a negative `narrow`), a fan's is a low ring.

### The strike is its own class

`PUNCH` parcels live 0.24–0.44s, are born across `footprint × 0.9`, carry a
radial impulse, and are told apart in the draw program by `life ≤ PUNCH.lifeMax`.
`punchAt` is `clamp(beatT / 0.08) · exp(−beatT / 0.275)` inside the strike beat
and zero everywhere else — R-02 fixes the strike at 320ms, so a fraction of it is
a fixed number of milliseconds.

### The accumulation, and what a frame costs

The mass is drawn first, the brush marks straight over it in painter order, and
the whole composite goes through one feedback pass (`hybrid/postFx.ts`), so the
marks pick up the mass's own smear and sit _in_ the paint.

Two dials keep the smear a property of the cast rather than of the machine:

- `PAINT_EVERY = 2`. The trail deposits once per two steps of the 120Hz product
  clock, so how much smear a cast carries follows the step count and not the
  display's rate. At sixty frames a second that is one deposit a frame.
- `PAINT_BURST = 3`. One `render` call may deposit at most three times, however
  many steps it has to advance. A paint costs primitive setup for the whole
  pool, so a call that fell behind and tried to paint every step it simulated
  would take longer than the frame it was already late for, and be later still
  next time. The cap breaks that spiral: the flow is always advanced in full,
  and what a slow frame gives up is smear it had no time to draw.

The look tier's harness therefore **walks the clock at sixty frames a second**
for both engines. A baseline is a picture of a frame a display could show, and
both engines carry state a frame builds on — classic steps a particle system per
call, the stage accumulates a trail — so jumping would give the stage a frame no
display ever shows.

The other half of that budget is the first frame. Nothing the substrate holds
depends on a score, so `SubstrateStage` belongs to the stage rather than to a
cast: it compiles its programs and bakes its two stamp atlases on the first
frame the stage ever draws, and a cast only re-points the ramp, the material
multipliers and the channel map. On a software rasterizer that compile is most
of a second, and it used to land on the strike.

A parcel's cost is vertex work and primitive setup rather than pixels, which is
why the draw program reads exactly **one** texel per parcel: the row map, whose
spare lanes carry the channel's heat, veil and grain. Four fetches to one nearly
halved the cost of a paint.

### The turbulence stride

Two curl octaves cost about two hundred hashes a parcel, which is more than
everything else in the field put together. The impulse is applied on one step in
three at three times the gain (`TURBULENCE_STRIDE`), so the time average is
unchanged and the cadence is 25ms. It is a uniform rather than a per-parcel
stagger on purpose: a staggered branch diverges across a warp and saves nothing.
The CPU brush already re-reads the field on the same cadence
(`MARK.fieldStride`).

### One pool, divided once

`hybrid/pool.ts` divides a fixed budget — `SIM_SIZE² = 16,384` parcels and 760
brush marks — among a score's tracks by what each archetype has to fill, **once,
when the cast is built**. A five-track spell costs what a one-track spell costs.
Allocating once matters for more than speed: a share that moved with the live
population would make one cell's state a function of another's, and a cell may
feel only its own track. A seat allocation is not a conversation.

The budget is a fixed constant rather than a quality tier. `CellContext.quality`
is form roughness and never magnitude (`cells/CLAUDE.md`), and a pool that shrank
with drawing quality would make a sloppy seal a quieter one. Quality still buys
what it always bought: how far a boundary wanders, how scattered a ring hangs.

### One ramp, many rows

`hybrid/palette.ts` samples a stop list; `hybrid/pigments.ts` turns a `LookRow`
into one. Fire's stops are the hand-authored list the prototype was approved on,
kept digit for digit. Every other row derives its nine stops mechanically from
the six tints it already carries — `wisp` cold, `body` the mass, `core` the hot
centre — so no row is unpainted and none is a shader fork. The ramp travels to
the GPU as a 1D texture, so a row change costs one upload.

The eleven-number `MaterialProfile` becomes nine multipliers on substrate dials
(`materialInk`). A row cannot invent a shape; it can only be denser, hotter,
heavier or thinner than the reference. `coreLift` is the one that keeps the
non-lit rows honest: how hard the hot core _adds_ is the row's own emission, and
letting every row add alike is what turns pigment into neon.

## The three prototype defects, and their fixes

1. **No true dark ink.** A fourth mark kind, `ink`, is a small population of
   near-black outline strokes riding the leading edges: short-lived, thin,
   composited rather than added, and drawn from a colour off the heat axis
   (`Palette.ink`). Its share is the row's own edge treatment — a crisp row draws
   its own outline, a feathered one has none to draw. A shock leaves none at all.
2. **A sepia dust ring at the strike.** Three causes, three fixes. A punch parcel
   lying on the plate is now cut on its own age (`DRAW.punchPlateKill`), because
   it was young by its own clock all the way to the end of a very short life. The
   accumulation is cut to nothing below `POST.trailFloor`, because the last
   thousandth of a wash lingers as a veil over cream. And `massDensity` now falls
   to zero with a channel's emission, so the strike's own marks die with the
   strike instead of lying on the paper as confetti.
3. **A nameable bell.** The boundary carries two standing azimuthal lobes
   (three-fold and two-fold) that shear with height, on top of the isotropic
   wander that only roughened a cone without unmaking it. The column's mouth also
   sits off-centre by a seeded wobble. `tests/castHybrid.test.ts` pins the
   widest-to-narrowest ratio above 1.4 so no tuning pass quietly rounds it off.

## The seven archetypes

| kind      | field shape                                              | spawn    | marks                                        |
| --------- | -------------------------------------------------------- | -------- | -------------------------------------------- |
| `jet`     | buoyant rise along `aim`, pinched, lightly swirled       | `column` | licks torn off the boundary, punch at strike |
| `burst`   | negative pinch, wide and short-lived                     | `splash` | punch smears only; no outline, no smoke      |
| `fan`     | shallow rise under a ceiling, outward sink, capped front | `sector` | flat washes pooling outward                  |
| `vortex`  | swirl-dominant, flaring boundary, ring-fed foot          | `swirl`  | torn tangentially off a widening wall        |
| `hold`    | containment at the locus, no rise to speak of            | `hover`  | born all around the shell, above and below   |
| `intake`  | signed sink toward the mouth, twist lifts                | `sink`   | long strokes drawn in, faint                 |
| `shimmer` | broad, slow, drawn onto a ring                           | `medium` | few, large, near-transparent                 |

Each one's beat table is at the top of its own file in `cast/cells/`.

Two of them exist for rulings rather than for physics. `shimmer` is R-10's
medium and the only cell R-01 gives the charge beat to; it is **pigment, not
light**, and it runs a great many parcels at a thirteenth of the substrate's
opacity, because a thin population at full opacity is exactly the countable dots
this rework exists to be rid of. `intake` is ambient by law (ground truth §7
exempts the spell's own manifestation from the pull field) and stays quiet enough
that it can never out-read what it surrounds.

## The golden tier, redesigned

The cast tier serialized a three.js scene graph, and there is no longer one. It
now serializes what put the mass there, which is the honest thing to assert on:

- **`CellReport`** — how loudly a cell paints (`ink`), where its mass stands
  (`at`), where its declared form is rooted and reaches (`from`, `tip`), how many
  marks it holds and has ever laid, and the named scalars its archetype
  publishes.
- **Field probes** — each channel's own flow measured at four fixed seal-space
  points a cell cannot choose.
- **The ceiling** a holder publishes, unchanged.

Both of the tier's laws survive: stepping fresh to a timestamp is identical to
stepping there incrementally, and distinct presets produce distinct text. Nothing
GPU-only is in it, because pure Node has no context and the look tier owns pixels.

The probe table changed instrument and not one claim. A row that read a uniform
off a named mesh reads the scalar that archetype publishes; a row that read a
mesh's world position reads the root or the tip the cell declares. Every ruling
that had a row still has one and no threshold moved.

The look tier's 63 `cast-*` baselines were regenerated, which is the point of the
rework. The 33 `classic-*` baselines, the classic tolerance and the seeded
`Math.random` init are untouched.

## Pending `cast/CLAUDE.md` text

`src/lib/cast/CLAUDE.md` carries another session's uncommitted work, so this
paragraph is deferred here the way the classic restoration deferred its own.
When that file is next edited, its "Below the score, the performer is the cell
stage" paragraph should read:

> **Below the score, the performer is a cell over a shared pigment substrate** —
> see [`../../../docs/animation-hybrid.md`](../../../docs/animation-hybrid.md).
> A cell owns no geometry: it writes the flow shape its parcels feel and the arc
> its brush marks are laid at, and `cast/hybrid/` paints both on one shared pool
> through one pigment ramp and one accumulation buffer. `cells/forms/` and the
> parametric vocabulary it held are gone. Everything from the score up is
> unchanged in role.

And its file map should gain:

> - [`hybrid/`](hybrid/CLAUDE.md) — the substrate: the flow field written twice,
>   the GPU parcel pool, the CPU brush population, the pigment ramp, and the
>   accumulation every track lands in.

Its "New form" extension recipe (`a module in cells/forms/`) should be struck:
there are no forms. The replacement is `hybrid/CLAUDE.md`'s "new archetype"
recipe, which is a `FlowShape` and a spawn mouth. Its note on the looks import
wall should add `cast/hybrid` to the list, which `eslint.config.js` already
enforces.

Two other files carry a stale pointer for the same reason and are another
session's. `looks/look.ts`'s `@file` names `cells/ink.ts`, which is deleted — a
look's tints reach the GPU through `hybrid/pigments.ts` now. And the root
`CLAUDE.md`'s directory-guide list should gain a line under `src/lib/cast/`:

> - [`src/lib/cast/hybrid/`](src/lib/cast/hybrid/CLAUDE.md) — the substrate every
>   cell paints with: one flow field written twice, a shared parcel pool, a brush
>   population, one pigment ramp

Until then the new directory is reachable from `cells/CLAUDE.md` and
`stage/CLAUDE.md`, both of which link to it.

## What is deferred

- **A per-element art pass.** Fire is the art-directed reference; the other seven
  rows derive their palettes and material multipliers mechanically. Every row
  renders credibly and distinctly, and none is empty, broken or neon, but none of
  them has been designed.
- **The vortex reads as a swirl rather than as a whirlwind.** It is still the
  weakest archetype. The tuning pass this document asked for has been taken —
  the parcel life is up to 1.3s against a lighter drag so a parcel completes more
  of a turn before it burns out, and the pinch is down from 0.8 to 0.22 so the
  foot's own ring attractor can hold the eye open instead of being fought for it
  — and the body beat now carries visible tangential streaking and an open
  middle. What is left is the release: as the wall lets go, the mass thins into
  separate dashes rather than tearing. That is the one place in the engine the
  countable-specks look still shows, it predates this pass, and fixing it means
  binding the stretch to the coverage under it rather than to speed alone.
- **The intake is legible rather than designed.** Its whole population lies on
  the plate, where the fragment program holds every parcel near the ramp's floor,
  so a channel heat of half put the entire wash on the row's darkest stops and
  the pull read as a stain. Heat is now 0.76 and the veil 0.12, which buys the
  row's own mid tints and stops the overlapping washes stacking into a slab. It
  is chromatic and it reads as the medium being moved, but it is still flatter
  than the mass archetypes: the wash has little internal structure of its own.
  The proper fix is the per-channel plate multiplier `DRAW.baseOpacity` is
  currently the global stand-in for, which needs a lane in the row map.
- **`vessel`** remains R-13's last unbuilt primitive and keeps its `routed-fan`
  path.

## 2026-08-25 addendum: the hybrid substrate is retired

The rework this document records was itself replaced the day after it was
marked executed. At production scale the parcel sprites and torn brush licks
resolved into angular translucent chips — "jagged glass shards" — failing the
very axes this document opens with. A second bake-off
(`src/routes/tools/proto-volume`) approved **C, the inked volume**: a CPU
tracer cloud skinned by marching cubes into one merged body per element,
shaded as flat watercolor washes with a dark ink contour over a per-element
ground wash.

`cast/hybrid/` is deleted; its replacement is `cast/volume/`, ruled in
[`animation-volume.md`](animation-volume.md). What this document ruled about
everything ABOVE the substrate still stands and was carried over: the score
and beats untouched, a cell as one track's choreography, the shared pool
divided once, quality as roughness never magnitude, the strike's punch window,
the ring attractor rather than a point sink, and the R-01/R-10 ambient laws.
The "Pending `cast/CLAUDE.md` text" above is superseded by the equivalent
section of `animation-volume.md`.
