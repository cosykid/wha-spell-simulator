# Spell Behavior Specification

Status: draft, 2026-08-22. This is the "Section 5" the original design PDF left
as TBD: what a cast spell does, in space and in time. The architecture that
implements it lives in [`animation-redesign.md`](animation-redesign.md).

Every ruling carries a stable id (`R-xx`) and a status tag so a law test can
cite the ruling it pins:

- `[canon]` — anchored in source material (see [`ground-truth.md`](ground-truth.md)
  and its wiki captures for citations).
- `[ruled]` — decided here for the simulator. Changing one is a deliberate,
  visible edit, never a tuning drift.
- `[deferred]` — not built yet, with a stated default so the engine never hits
  an undefined case.

## R-01, R-02 — Timing and beats `[ruled]`

A cast is a one-shot performance. Time is structured into five beats:

| Beat        | Length  | Elastic | Content                                                             |
| ----------- | ------- | ------- | ------------------------------------------------------------------- |
| `charge`    | 980 ms  | no      | Equals the portal tilt. Ink brightens, ambient medium draws inward. |
| `strike`    | 320 ms  | no      | The impulse: burst ring, first parcels at peak drive.               |
| `body`      | elastic | **yes** | The spell's character.                                              |
| `release`   | 760 ms  | no      | Emission stops, drive decays, parcels coast.                        |
| `afterglow` | 420 ms  | no      | Alpha to zero, ink cools.                                           |

`totalMs = clamp(spellIR.duration * 1000, 3080, 8480)` and
`bodyMs = clamp(totalMs - 2480, 600, 6000)`.

**R-02: only `body` stretches.** Attack and release read as events. Stretching
them reads as slow motion. This is the direct fix for the failed attempts'
"tornado peaks after the spell fades": nothing may still be charging when
`release` begins.

The `charge` beat is content, not dead time. Today the canvas is idle for the
980 ms tilt, which wastes 17% of the cast.

## R-03, R-04 — Canvas-to-world mapping `[ruled]`

Seal space: origin at ring center, one unit = ring radius, x right, y
screen-down, z out of the paper. World space: the seal plane is the ground,
`(x, y, z)_seal maps to (X, Z, Y)_world` with +Y up. One conversion function,
owned by the portal module.

**R-04: one context only.** The simulator's world is a seal on a surface with
the portal facing the viewer. Canon cases where context redirects the spell
(Wall Breaker affecting the ground below despite upward columns) are out of
scope, declared rather than silently assumed.

## R-05, R-06 — The column vector law `[canon + ruled]`

The PDF's worked example `(1,0,1) + (-1,0,1) = (0,0,2)` does not type-check:
nothing is drawn out of the page, so the third component cannot be an input.
**It is the output of the clash.** Correct formulation, 2D in, 3D out:

```ts
interface ColumnAggregate {
	budget: number; // S
	lateral: Vec2; // P
	convergence: number; // C
	circulation: number; // Gamma
}

// Per sign i: position p_i, unit facing u_i, length l_i,
//   rHat = normalise(p_i), tHat = perp(rHat), w_i = min(|p_i|, 1)
// S     = sum( l_i )
// P     = sum( l_i * u_i )                          in-plane net momentum
// C     = -sum( l_i * w_i * dot(u_i, rHat_i) )      convergence (scalar)
// Gamma =  sum( l_i * w_i * dot(u_i, tHat_i) )      circulation (scalar)

export function aimVector(a: ColumnAggregate): Vec3 {
	return { x: a.lateral.x, y: a.lateral.y, z: Math.max(a.convergence, 0) };
}
export function dispersionScalar(a: ColumnAggregate): number {
	return Math.max(-a.convergence, 0);
}
```

Worked check: two opposed inward columns at +x and -x with `l = 1, w = 1` give
`P = 0`, `C = 2`, so the aim is `(0, 0, 2)` — exactly the PDF's answer, with a
2D input. Rotation is `Gamma`, sign convention positive = counter-clockwise
viewed from +z, mapped to a vortex track's spin rate.

Note the jet tilts **where the long sign points**, not toward the long sign's
position. The first force-field implementation shipped this lean inverted,
pinned in place by its own tests, which is why the law test in
[`../tests/spellPlan.test.ts`](../tests/spellPlan.test.ts) states the direction
in words and a probe row measures it on the parcels.

**R-06: sloppy drawings add power, not direction.** A sign whose facing trust
falls below the floor contributes `length` to `S` only, never to `P`, `C`, or
`Gamma`.

## R-07, R-08 — Inverted column and dispersion `[ruled]`

There is no separate "inverted column" behavior. There is one aim vector and
one fan term:

- Outward columns give `C < 0`, so dispersion `D > 0`: a plane-hugging radial
  fan (canon Snugstone's dispersal).
- A central column with `w` near 0 gives `C` near 0 with large `P`: a flat
  directed push (canon Flame Shot).

Both "conflicting" canon readings fall out of the same two numbers.

**R-08: column versus dispersion is a timing distinction.** The dispersion sign
contributes identically to `(S, P, C, Gamma)` but its tracks carry the `leak`
curve: lower gain, longer body. The PDF's unresolved spatial ambiguity resolves
in the time domain.

## R-09 — Region grammar `[ruled]`

The region sign's uncaptioned 10-case diagram, as a real function:

```ts
export type Aperture =
	| { kind: 'disc'; bias?: Vec2 }
	| { kind: 'annulus'; inner: number; outer: number; arcDeg?: number; bearingDeg?: number }
	| { kind: 'sector'; bearingDeg: number; halfAngleDeg: number; inner: number; outer: number }
	| { kind: 'band'; normal: Vec2; offset: number; width: number }
	| { kind: 'point'; at: Vec2 };

export interface Region {
	aperture: Aperture; // which part of the seal disc emits
	exhaust: Vec3; // emission direction
	hardness: number; // how strictly the aperture masks
	reach: number;
}

export function resolveRegion(chevrons: SignReading[]): Region;
```

Resolution is a **ranked rule table** over `(count, radial position class,
facing class)` — never a threshold on fused geometry, so there is no cliff
where 60 degrees of separation reads one way and 59 another:

| #   | Chevrons         | Position | Facing      | Aperture               | Exhaust                        |
| --- | ---------------- | -------- | ----------- | ---------------------- | ------------------------------ |
| 1   | 0                | -        | -           | `disc`                 | omnidirectional                |
| 2   | 2+, spread 60°+  | rim      | all inward  | `disc`                 | up                             |
| 3   | 2+, spread 60°+  | rim      | all outward | `annulus(1.0, 1.5)`    | outward plus small up          |
| 4   | 2+ opposed pairs | rim      | paired      | `annulus(0.85, 1.05)`  | up                             |
| 5   | 2+ opposed pairs | one arc  | paired      | `annulus(..., arcDeg)` | up                             |
| 6   | any              | center   | crossed     | `point(0,0)`           | up                             |
| 7   | 1                | rim      | inward      | `disc` biased opposite | up                             |
| 8   | 1                | center   | outward     | `sector` far side      | lateral outward                |
| 9   | 1                | mid      | outward     | `band` at mid radius   | lateral outward                |
| 10  | 2+ collinear     | any      | agreeing    | `disc`                 | lateral along facing, n scales |

Rows 2 and 3 carry R-19's fusion rule: two members complete a fence when they
span at least 60 degrees of azimuth, and an opposed pair (row 4) means two
direction classes, never two antipodal positions of the same sense.

`hardness` and `reach` grow with member count. Chevron size has no canon:
`[deferred, default: size scales hardness only, never geometry]`.

## R-10, R-11 — Create versus modify, and the world `[ruled]`

The world contains exactly three things: the spell's **own** manifestation, a
thin **ambient medium** of the seal's element seeded through the domain, and
the **substrate** (the paper). Create-class sigils emit into the `own`
population. Manipulate-only sigils (earth, wind) always emit into `ambient`.
Sigil class is a data-table column, not a code branch.

**R-11: "manifests nothing" is a look, not an absence.** A pull-only seal
manifests no element by law, but the product renders the ambient medium
visibly streaming inward. The renderer has no empty path and no ownership
boolean, which structurally kills the past "spell active but blank canvas"
bug.

## R-12 — Nesting `[deferred]`

Default: only the outermost complete ring compiles. Inner rings are recognized
and reported as unsimulated. The hook exists from day one: a score holds a
list of layers, always length 1 in v1. When built, nesting is **simultaneous**,
inner-as-modifier of the outer's element and aperture (the "in tandem" canon
reading wins over "inner activates first", because sequential composition
needs a second timeline).

## R-13 — Composition order `[ruled]`

The PDF's Type 1/2/3 precedence scheme is unnecessary. Each sign family
contributes to a **separate budget** and owns a different verb:

- column: engine (aim, dispersion, circulation)
- region: valve (aperture, exhaust)
- levitation: spring (hold)
- pull: ambient coupling (intake)
- convergence: lens (focus)
- orb: vessel `[deferred]`

Nothing overrides anything, so no precedence rule is needed. The term
"direction sign" is abolished: four families were being called directional
with four different meanings. Crush forcing whole-spell modify mode is
`[deferred, default: crush contributes power only]`.

## R-14 — Unopposed convergence `[ruled]`

Convergence is not gated on opposition. `C` enters the aim exactly as R-05
states it, whether or not another sign cancels the flux that produced it.

A half-ring of inward columns is therefore a **steep diagonal geyser**, not a
ground-hugging surge: three signs spanning 180 degrees lift at 71.6 degrees,
nine at 60.8, and the continuous limit is `atan(pi/2)` = 57.5. A lone rim sign
is the shallow end of the same law at 45 degrees, and the `column-unbalanced`
preset, whose sign sits at radius 0.8, at 38.7.

This ratifies the standing choice in [`ground-truth.md`](ground-truth.md)
section 4 ("Kept as flux law **[agreed]**"), which weighed the alternative
clash-bookkeeping reading `V = S - |P|` and kept flux because Flame Shot's
column sits at `w = 0.6` to `0.75`, so a diagonally rising flame matches the
panel. The revisit trigger it attached, "if it feels wrong in the sim", is
discharged here: section 4 was uneasy about the _lone_ sign at 45 degrees, but
the arrangement this spec asked about is the half-ring, and a half-ring reads
as a geyser leaning off its open side rather than as a 45-degree compromise.

Sections 6 and 7 bind levitation and pull to whatever the column gets, so R-14
rules `hold.ts` and `intake.ts` too.

## R-15 — Cancelled ink `[ruled]`

Ink whose moments cancel **fires the bare shockwave and buys nothing with it**.

Section 3 fixes half of this already: the burst is "the default spend, not an
unconditional one", and the list of seals that suppress it is closed — pull-only
seals, and orb-bearing seals. Cancelled columns are budget-bearing column ink,
so the ring fires. With `A = P + C₊ẑ = 0` there is nothing to steer it, so it
fires isotropically.

R-15 adds the loudness: cancelled flux does **not** convert to impulse. At the
burst, a cancelling seal is indistinguishable from an unmarked ring.

The reason is that section 1 already spends the bare shockwave on a neighbouring
failure — a seal below the quality threshold "fizzles into the bare shockwave".
Cancelled ink is a second cause of the same outcome, and the caster learns one
reading for both. Scaling the burst by `S` instead would teach that
contradictory ink is rewarded, and it is not what the previous engine did: its
burst magnitude carried no `S` term at all.

The budget still survives on the plan, so the arrangement stays legible in a
plan text and to any later ruling.

## R-16 — The levitation rotor `[ruled]`

Tangential levitation circulation **spins without a grip**. `resolveHold`
returns a hold whenever `|Γ_lev|` clears the floor, with `grip` at zero, and the
hold track carries the spin.

Both source statements support it and neither gates spin on the grip. Section 6:
"`Γ_lev` exchanges angular momentum: held mass spins about the hover axis. A
levitation pinwheel is a **rotor**." Section 10 states the spin term as an
independent addend, not a factor inside `C_lev,+`. The previous implementation
nested spin inside the grip and its own preset called that a defect, so the dud
this engine inherited is that bug rather than that spec.

A gripless hold lifts nothing. The rotor is a flat tangential swirl at the rest
height, which is what the `hold` kernel already produces when its lift parameter
sits at the floor.

## R-17 — Inverted levitation `[ruled]`

`C_lev < 0` grips nothing, and that is the ruling: **a dud, named**.

Section 12.6 states the mechanism and then asks the only question that could
overturn it, "does canon ever show one?", and no attested case exists. The
column's inversion is ruled the other way (R-07: outward columns disperse) but
that reading is anchored in Snugstone's dispersal. Levitation has no such
anchor, so a press or a repulsor would be invented behavior rather than derived
behavior.

What R-17 changes is legibility. A gripless levitation seal now says which kind
it is: `levitation-inverted` where the convergence points outward, and
`levitation-inert` where the ink closed neither a grip nor a rotor. Before this
ruling both arrangements produced identical plans, identical tracks and one
shared note, so neither could be tested and neither could be told from the other
in a golden. Tangential ink no longer lands here at all — under R-16 it resolves
to a hold.

## R-18 — Drive versus grip `[ruled]`

**Drive wins while driven, grip wins on coast.** A hold captures a parcel only
once it has effectively arrived, so a live column passes through the grip and
only its spent parcels are caught.

R-13's separate budgets do not settle this, and never did. Under the field
engine they appeared to, because separate budgets fed one summed velocity field
and section 10's composition was literal addition, so "nothing overrides
anything" held for free. This engine deleted superposition: a parcel belongs to
one track and feels one kernel, and the only cross-track path is a positional
constraint. R-13 rules out precedence _between budgets_. It says nothing about
what a parcel does when two resolved primitives claim the same volume, and R-18
is that missing rule.

The resolution is the move R-08 makes for dispersion: a conflict with no spatial
answer gets a temporal one. `captureSpeed` is this ruling's constant rather than
a stopgap awaiting one.

## R-19 — Chevron fusion `[ruled]`

**Two agreeing radial chevrons complete a fence**, provided they span at least
60 degrees of azimuth. Fusion is collective, so a lone radially aligned chevron
stays a straight shutter.

This restores [`ground-truth.md`](ground-truth.md) section 5, which is tagged
`[agreed]` and states the rule directly: a radial ring is two or more radially
aligned chevrons of the same sense spread over at least 60 degrees of azimuth,
fusing into one curved fence. R-09's table discretized that to three members and
swapped the azimuth test for a widest-gap gate. R-19 puts both back. The wiki
demo panels all happen to use four chevrons, but they demonstrate rather than
state a minimum, so they bound nothing.

Completion is a threshold; **staging is not**. Section 5 keeps hardness
continuous in member count, and R-09's scalars keep that shape.

R-19 also repairs what hid the old threshold: opposed pairs were counted by
position alone, so two chevrons of the _same_ sense registered as a pair and
took the rim-pinch row, which made two outward chevrons exhaust upward instead
of into the moat. A pair is two direction classes, per section 5.

## R-20 — Fill to capacity `[ruled]`

A levitation seal **stops manifesting once the held mass reaches capacity**,
with `W_max ∝ η R² C_lev`. The visible spell is a fill transient and then a
suspended ball.

This is not a new ruling. Section 6 decided it on 2026-07-02, superseding an
earlier "continuously fed from the disk" reading, and it is absent from section
12's open register. Its constants are tagged tunable; its behavior is not. What
was open is mechanical: the ruled fill was implemented as a population-level
spawn throttle, and this engine's `Primitive` contract had no way to read a
population.

`Primitive` therefore gains a fourth member beside `spawn`, `velocity` and
`constrain`:

```ts
throttle?(params: PrimitiveParams, state: CastState): number;
```

It returns an emission multiplier derived from the live parcel list each step.
It never accumulates, so the fresh-versus-incremental bit-identity contract
survives: replaying to a timestamp recomputes the same gate from the same state.

Section 6's other half comes with it. The grip "sustains held magic (no
dissipation inside the blob)", so held parcels stop aging. Without that the ball
never reaches capacity on a long cast — it swells for about three seconds and
then evaporates, which is a worse failure than the breakage this question was
raised about.

## PDF defect register

The original design PDF's defects (A through M), each with its resolution:

| #   | Defect                                              | Resolution                                                                                                                        |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A   | Animation section empty                             | This document.                                                                                                                    |
| B   | World mapping undefined                             | R-03, R-04.                                                                                                                       |
| C   | Column vector math does not type-check              | R-05. Convergence is derived, never drawn.                                                                                        |
| D   | Inverted column defined three conflicting ways      | R-07, R-08. One law, one timing switch.                                                                                           |
| E   | Region is a picture with no legend                  | R-09.                                                                                                                             |
| F   | Sigil-size contradiction                            | Sigil size sets `effectScale` only. Levitation's exception deferred.                                                              |
| G   | Nesting sequential or simultaneous                  | R-12, default single layer.                                                                                                       |
| H   | Composition order undefined                         | R-13, separate budgets.                                                                                                           |
| I   | 14% sign coverage, crystal/aeriform unrepresentable | Every sign gets a table row, `unmodeled: true` yields a visible default. Looks key on sigil id, so crystal and aeroform get rows. |
| J   | Canon snapping blocked on a nonexistent library     | Seam exists, table ships empty.                                                                                                   |
| K   | Create-vs-modify has no simulation meaning          | R-10. Targeting signs (crosshair, diamond, window) deferred, default ignored.                                                     |
| L   | Linear versus non-linear processing                 | A two-pass fold (gather budgets, then resolve) over one layer.                                                                    |
| M   | Uncertainty markers in a build spec                 | Every statement here carries `[canon]`, `[ruled R-xx]`, or `[deferred]`.                                                          |

## Open canon questions

All seven are ruled. They were raised here because this spec was written
treating [`ground-truth.md`](ground-truth.md) as unavailable; in fact it takes a
documented position on five of them, two with ruling dates. The register below
records where each landed and what actually decided it.

| Question               | Ruling | Outcome                            | Decided by                              |
| ---------------------- | ------ | ---------------------------------- | --------------------------------------- |
| Unopposed convergence  | R-14   | Flux law, ratified                 | section 4's standing `[agreed]` choice  |
| Cancelled ink          | R-15   | Bare shockwave, no impulse         | section 3 plus section 1's fizzle look  |
| Levitation rotor       | R-16   | Spins without a grip               | sections 6 and 10, against prior code   |
| Inverted levitation    | R-17   | Dud, named distinctly              | section 12.6; no attested case          |
| Column plus levitation | R-18   | Drive while driven, grip on coast  | authorial, in R-08's timing idiom       |
| Chevron fusion         | R-19   | Two members, spread 60°+           | section 5's `[agreed]` radial-ring rule |
| Fill to capacity       | R-20   | Real capacity, via a throttle hook | section 6's ruling of 2026-07-02        |

Three of these exposed defects rather than choices, and those are fixed with
their rulings: a hold declared no couplings at all on a pure levitation seal, so
the burst escaped the grip and sprayed section 6's skirt; opposed pairs were
counted by position without reading facing; and questions 3 and 4 produced
byte-identical artifacts, so neither could be tested.

Still deferred, and untouched by these rulings: nesting (R-12), crush forcing
modify mode and the orb vessel (R-13), chevron size and targeting signs (R-09,
defect K), and — upstream in ground-truth section 12 — the levitation hover
displacement sign (12.5), the sigil-size exception for levitation power (12.7,
defect F), and grasp discharge (12.8).
