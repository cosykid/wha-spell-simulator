# Spell Behavior Specification

Status: draft, 2026-08-22. This is the "Section 5" the original design PDF left
as TBD: what a cast spell does, in space and in time. The architecture that
implements it lives in [`animation-redesign.md`](animation-redesign.md).

Every ruling carries a stable id (`R-xx`) and a status tag so a law test can
cite the ruling it pins:

- `[canon]` — anchored in source material (see `theorycrafting/GROUND_TRUTH.md`
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
position. The first `SpellField` implementation shipped this lean inverted,
pinned in place by its own tests.
[`../src/lib/field/CLAUDE.md`](../src/lib/field/CLAUDE.md) documents the
corrected lean.

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
| 2   | 3+               | rim      | all inward  | `disc`                 | up                             |
| 3   | 3+               | rim      | all outward | `annulus(1.0, 1.5)`    | outward plus small up          |
| 4   | 2+ opposed pairs | rim      | paired      | `annulus(0.85, 1.05)`  | up                             |
| 5   | 2+ opposed pairs | one arc  | paired      | `annulus(..., arcDeg)` | up                             |
| 6   | any              | center   | crossed     | `point(0,0)`           | up                             |
| 7   | 1                | rim      | inward      | `disc` biased opposite | up                             |
| 8   | 1                | center   | outward     | `sector` far side      | lateral outward                |
| 9   | 1                | mid      | outward     | `band` at mid radius   | lateral outward                |
| 10  | 2+ collinear     | any      | agreeing    | `disc`                 | lateral along facing, n scales |

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

Each blocks one law test and needs an authorial ruling, not an engineering
guess:

1. **Unopposed convergence.** A half-ring of inward columns: a diagonal geyser
   (flux reading) or a flat ground-hugging surge (clash reading)? This is the
   most common hand-drawn arrangement.
2. **Cancelled ink.** Four signs whose moments cancel: blank ring, boosted
   burst, or a true quadrupole flow? "Your drawing did nothing" needs a
   designed answer either way.
3. **Levitation rotor.** Does tangential levitation circulation spin without a
   grip?
4. **Inverted levitation.** Dud, press, or repulsor?
5. **Column plus levitation.** Does drive beat grip, or does hold have
   right-of-way?
6. **Chevron fusion.** How many agreeing radial chevrons complete a circular
   fence?
7. **Fill-to-capacity.** Canon says a levitation seal stops manifesting once
   full, which on a six-second cast reads as breakage. May timing override the
   law, or must the look sell the stop?
