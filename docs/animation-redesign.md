# Animation System Redesign

Status: draft, 2026-08-22. The plan for replacing the effect renderer and the
`SpellField` model. The behavioral rulings it implements live in
[`animation-spec.md`](animation-spec.md). Supersedes
[`Plan for converting spells to animations.md`](<Plan for converting spells to animations.md>)
and, on cutover, [`effect-rendering.md`](effect-rendering.md).

Context: two three.js attempts (PR #74 `theorycrafting`, PR #76
`tc-field-canvas-rework`) were abandoned. Their post-mortem drives every
decision here. Root causes, condensed: a lossy sign-to-moments projection with
a hard expressive ceiling, physics-first look-last layering, no notion of a
5 to 6 second performance, three forked behavior models, a boolean 2D/3D
handoff, and verification that could not see.

## The idea in one paragraph

A drawing no longer feeds a global force field that particles sample. Instead
it **resolves** to an explicit, finite plan of named motion primitives, each
with authored timing. Reading (gate recognition noise) then Plan (apply canon
rules) then Score (author the timeline) then Sim (advect parcels per track)
then Paint (data-driven looks). One behavior model, one renderer, deterministic
end to end, verified by golden frames.

```
Recognition[] -> READING -> PLAN -> [ SpellIR seam ] -> SCORE -> SIM -> PAINT
               (gate noise) (rule)                  (author time) (advect) (pixels)
```

## Why not keep the field

Main's `SpellField` is a better projection than the PRs' `(S, P, C, Gamma)`
moments, but it shares the fatal property: **behavior is emergent from a
global sum**, so every source acts at every point. Observed consequences: a
hand-drawn tangential sign picks up a few percent of incidental inward bias
and the whole domain drifts; cancelling arrangements produce literal nothing;
every art fix must be smuggled in as a physics term because there is nowhere
else to put it.

The fix is resolution, not superposition. The plan names a finite list of
tracks. Parcels belong to exactly one track and feel only that track's local
velocity kernel. Cross-track interaction exists only where the plan declares a
coupling. The field math survives as the _implementation of individual
kernels_ (the vortex eye, hover ceiling, and falloff curves move into
`vortex.ts` and `hold.ts`). What dies is the sum-over-sources loop.

Drawings still matter continuously: the aggregates (budget, aim, dispersion,
circulation, aperture, quality) are continuous functions of the ink.

## The five layers

### 1. Reading — `Recognition[] -> SealReading`

Pure, in `compiler/reading/`. Contract: **downstream code never sees a raw
`Recognition`.** Recognition noise caused as many failures as physics did
(poses off by 122 degrees, a dropped `ml.accepted` flag silently zeroing every
facing, incidental bias drifting the domain), so gating it is a layer, not a
constraint.

```ts
export type FacingSource = 'ml-pose' | 'template-rotation' | 'stroke-geometry' | 'canonical';
export type FacingClass = 'inward' | 'outward' | 'tangential-cw' | 'tangential-ccw' | 'oblique';

export interface SignReading {
	id: string; // dictionary sign id
	manifestation: string; // from the sign JSON, never inferred
	at: Vec2; // seal space
	length: number; // seal units
	facing: Vec2; // unit, in-plane
	facingClass: FacingClass; // quantized. Rules branch on this
	facingSource: FacingSource;
	facingTrust: number; // 0..1, gates interpretation
	power: number; // 0..1, size and layer only. NOT confidence
}

export interface SealReading {
	signs: SignReading[];
	sigil: string | null; // sigil id, not element: crystal != earth
	element: ElementId | null;
	quality: number; // the drawing's overall precision
	symmetry: number | null; // n-fold symmetry detected, after snapping
	notes: ReadingNote[]; // 'facing-untrusted', 'snapped-4-fold', ...
}
```

Four rules, each a small unit-tested module: a **facing source hierarchy**
(ML pose, then template rotation, then stroke geometry, then canonical inward,
with declining trust, so a missing ML verdict degrades instead of collapsing);
**dead-band and quantization** (small twists snap to zero, facing quantizes to
a class with hysteresis, so a wild pose error becomes a visibly wrong bucket
instead of a smeared continuum); **symmetry snapping** (signs near even
spacing snap exact, so a hand-drawn four-column ring makes a straight beam,
not a wobble); and **trust is not power** (today `signInfluence` multiplies
confidence into strength, conflating "how sure are we" with "how strong is
it").

### 2. Plan — `SealReading -> SpellPlan`

Pure, in `compiler/plan/`. **The only place canon rulings live.** Small,
serializable, text-diffable, which gives a cheap regression tier below PNG
diffing.

```ts
export interface SpellPlan {
	version: 1;
	sigil: string | null;
	element: ElementId | null;
	mode: 'create' | 'manipulate'; // which population tracks emit into
	aim: Vec3; // R-05
	dispersion: number;
	circulation: number;
	budget: number;
	aperture: Aperture; // R-09
	hold: HoldSpec | null; // levitation
	intake: IntakeSpec | null; // pull
	vessel: VesselSpec | null; // orb, deferred, always null in v1
	focus: number;
	quality: number;
	couplings: Coupling[]; // e.g. { holder: 'hold', captures: ['jet'] }
	notes: PlanNote[]; // 'inert-quadrupole', 'facing-untrusted'
}
```

`couplings` makes interactions (column plus levitation) declared and visible
in a text golden instead of emergent from a superposition nobody predicted.
Canon-spell snapping stays a seam with an empty table:
`snapPlan(fingerprint, plan)` over a `Record<Fingerprint, Partial<SpellPlan>>`,
filled only after the open canon questions are ruled.

### 3. Score — `SpellPlan + SpellIR -> SpellScore`

Pure, deterministic, seeded, in `cast/score/`. The layer neither failed
attempt had. Time is the primary axis: beats per
[`animation-spec.md`](animation-spec.md) R-01, and every track carries
emission and drive envelopes. **A track without envelopes does not
type-check**, which is how "timing must be authored" becomes structural.

```ts
export type Beat = 'charge' | 'strike' | 'body' | 'release' | 'afterglow';
export type CurveId = 'attack' | 'hold' | 'decay' | 'pulse' | 'leak' | 'swell';

export interface Envelope {
	from: Beat;
	to: Beat;
	curve: CurveId;
	gain: number;
}

export type PrimitiveKind =
	| 'jet'
	| 'fan'
	| 'vortex'
	| 'hold'
	| 'intake'
	| 'vessel'
	| 'burst'
	| 'shimmer';

export interface Track<K extends PrimitiveKind = PrimitiveKind> {
	id: string; // stable, derived from the plan. Goldens key on it
	kind: K;
	population: 'own' | 'ambient'; // R-10
	params: PrimitiveParams[K]; // typed per kind
	emission: Envelope; // parcels per second
	drive: Envelope; // velocity scale
	look: LookRole; // 'core' | 'body' | 'wisp' | 'ember' | 'skin'
}

export interface SpellScore {
	version: 1;
	seed: number; // derived from SpellIR.signature
	sigil: string | null;
	element: ElementId | null;
	totalMs: number;
	beats: Record<Beat, { startMs: number; endMs: number }>;
	layers: ScoreLayer[]; // always length 1 in v1. The nesting hook (R-12)
	signature: string; // identical signature means identical cast
}
```

### 4. Sim — thin, fixed-step, replayable

In `cast/sim/`. Fixed `dt = 1/120 s` accumulator, `mulberry32` seeded from the
score. The current renderer `dt` in "60fps frame units clamped to a range" is
deleted: it is a frame-rate-dependence generator and already produced
frame-rate-dependent streak lengths.

```ts
export interface CastState {
	tMs: number;
	parcels: Parcel[];
	rng: Rng;
}

/** Stepping fresh to targetMs must be bit-identical to stepping there
 *  incrementally. This is what makes golden frames trivial. */
export function stepTo(score: SpellScore, state: CastState, targetMs: number): CastState;
export function simulateTo(score: SpellScore, targetMs: number): CastState;

export interface Primitive<P> {
	kind: PrimitiveKind;
	spawn(params: P, aperture: Aperture, rng: Rng): Parcel;
	velocity(params: P, at: Vec3, ageS: number): Vec3; // pure, local, no globals
	constrain?(params: P, parcel: Parcel): void; // floor, shell, capacity
}
```

### 5. Paint — one renderer, data-driven looks

In `cast/render/` and `cast/looks/`. Looks are data and **may not import from
plan or sim** (one ESLint `no-restricted-imports` rule). This scales the one
architectural idea from the failed PRs that worked, the `LOOKS` table, and
keys it on **sigil id** with element fallback so crystal and aeroform are
representable.

```ts
export interface Look {
	sprite: SpriteId;
	tint: { core: Rgb; edge: Rgb };
	sizePx: [min: number, max: number];
	trail: { frames: number; widthScale: number } | null;
	blend: 'lighter' | 'source-over';
	stretch: number; // sprite elongation along velocity
	fade: CurveId;
}
export const LOOKS: Record<string /* sigil id */, Record<LookRole, Look>>;
```

## Renderer technology ruling: Canvas2D, no three.js

Argued from the post-mortem, not from taste:

1. Both attempts died on **look work in 3D**, not on 2D limits: marching cubes
   producing chunk soup and hollow screws, shaders hand-phase-locked to
   geometry, months on fire while wind stayed invisible.
2. A pluggable 2D/3D backend is the widest interface in the system and it
   already leaked once: `render() -> true` conflated "drew something" with
   "owns this spell" and blanked the canvas. Two backends also means two look
   tables, which is the forked-model root cause reborn.
3. Headless determinism favors 2D: the motion golden tier is pure TS. A WebGL
   golden harness needs headless GL and is fragile in CI.
4. The product is a 5.5 to 6 second interpretive one-shot on a tilted seal.
   Additive sprite blitting from a pre-baked atlas, velocity-stretched sprites
   and trails cover the vocabulary at a few thousand parcels. The quality
   lever is sprite art and compositing, not polygon count.
5. Cost of being wrong is low: `Primitive.velocity` and `Look` are
   renderer-agnostic, so a second painter for one element later is a contained
   change, not a planned architecture.

Deferred escape hatch (phase 6, flag-gated): one full-screen WebGL post-pass
over the finished 2D frame for bloom and heat shimmer. Additive, stateless,
cannot fork the behavior model. It is not a backend.

**The portal.** Keep the illusion, kill the duplication. One module,
`src/lib/portal/portal.ts`, owns the projection (salvaging the
`elevation = asin(scaleY)` identity from the branch's `portalCamera.ts`,
rewritten without three), and the CSS reads its numbers via custom properties
written once at runtime. Its `depth` output gives painter-order sorting and
size attenuation, which the 2D effects never had and which is most of why they
read flat. This also fixes the current inconsistency where particle height
uses a 0.8 foreshortening while the ground plane implies 0.898.

## Module layout

```
src/lib/
  compiler/
    reading/   readSeal.ts  facing.ts  symmetry.ts  trust.ts
    plan/      resolvePlan.ts  columns.ts  region.ts  hold.ts  intake.ts  focus.ts  snap.ts
    spellBuilder.ts            (unchanged role, now emits SpellIR.plan)
  cast/
    score/     compileScore.ts  beats.ts  envelopes.ts  tracks/{jet,fan,vortex,hold,intake,burst,shimmer}.ts
    sim/       cast.ts  parcel.ts  rng.ts  primitives/{...}.ts
    render/    castRenderer.ts  painter2d.ts  sprites.ts
    looks/     look.ts  table.ts  {fire,water,wind,earth,light,crystal,aeroform}.ts
  portal/      portal.ts
  types/       seal-reading.ts  spell-plan.ts  spell-score.ts
tests/
  golden/      rasterizer.ts  png.ts  probes.ts
```

Every file is one responsibility, well under the 300-line guide.

## Fate of the existing code

| Path                                       | Fate                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/spell-field.ts`                     | Replaced by `spell-plan.ts` and `spell-score.ts`. `SpawnDomain` becomes `Aperture`. Deleted at phase 5.                                     |
| `field/buildSpellField.ts`                 | Superseded by `compiler/plan/`. `facingTwistDeg` moves into `reading/facing.ts` and gets the hierarchy.                                     |
| `field/sampleField.ts`                     | File deleted, math salvaged: the vortex eye, hover ceiling and falloffs become primitive kernel bodies.                                     |
| `renderer/effects/{five element}Effect.ts` | Deleted. They are the third behavior model and the reason a fallback branch exists.                                                         |
| `renderer/effects/fieldEffect.ts`          | Deleted, replaced by `cast/render/`.                                                                                                        |
| `renderer/effects/effectUtils.ts`          | Split: portal math to `portal/`, particle helpers to `cast/sim/`, the rest deleted with its consumers.                                      |
| `renderer/spellEffectRenderer.ts`          | Becomes `cast/render/castRenderer.ts`. Guide/prepared/invalid drawing moves to `glyphOverlayRenderer.ts` (UI feedback, not spell behavior). |
| `ui/spellEffectLabPresets.ts`              | Kept and grown into the golden corpus.                                                                                                      |
| `tests/spellField.test.ts`                 | Rewritten as `tests/spellPlan.test.ts` law tests, each citing a ruling id.                                                                  |
| `SpellIR`                                  | Keeps scalars, `signature`, `activatedAt` and `carrySpellActivation`. `field` is replaced by `plan`, plus `reading` for the debug overlay.  |

## Root-cause coverage

| #   | Root cause                           | Mechanism                                                                                                   | Prevented                                                                                   |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Forked behavior models               | One resolver, one sim, one painter. The per-element renderers and the fallback branch are deleted.          | Partly. Nothing mechanically stops a new fork. There is just nowhere obvious to attach one. |
| 2   | Lossy projection, expressive ceiling | Resolution replaces superposition. Cancelling ink resolves to a named primitive or a designed `inert` look. | Yes                                                                                         |
| 3   | Physics-first, look-last             | Looks are data, import-restricted. An art change touches one table row.                                     | Yes                                                                                         |
| 4   | No performance model                 | Beats and mandatory envelopes. A track without timing does not compile.                                     | Yes                                                                                         |
| 5   | Coupled 133-constant config          | Constants live with their owner. Known-good couplings baked as derived values, never two dials.             | Partly. In-kernel coupling is real physics.                                                 |
| 6   | Tests pinned canon guesses           | Law tests cite ruling ids. Look goldens assert nothing about canon. Re-ruling is a visible edit.            | Yes                                                                                         |
| 7   | Boolean 2D/3D handoff                | One renderer, no fallback, no ownership flag. "Nothing" is a look (R-11).                                   | Yes                                                                                         |
| 8   | God files                            | One-responsibility layout. Recommend a `check:filesize` CI step, otherwise unguarded.                       | No                                                                                          |
| 9   | Verification could not see           | Plan text snapshots, law tests, PNG goldens in two views. Taste stays human, in the lab.                    | Partly                                                                                      |

## Migration plan

Each phase lands on main independently, keeps main shippable, and has one
observable gate.

- **Phase 0 — verification rig and portal unification.** Salvage the pure-TS
  software rasterizer and PNG encoder from the `theorycrafting` branch into
  `tests/golden/` (zero dependencies). Two golden tiers: **motion** (pure
  Node, renderer-independent) and **look** (Playwright screenshots at fixed
  timestamps). Rewrite the old scorecard closures as a probe table
  `{ presetId, atMs, point, expect, rulingId }`. Collapse the CSS/JS portal
  duplication into `portal/portal.ts`.
  Gate: `test:golden` green and byte-identical across two runs, PNGs for all
  12 lab presets.
- **Phase 1 — the Reading.** Lands and feeds the existing `buildSpellField`.
  Gate: a hand-drawn pinwheel visibly swirls in the app; unit tests for
  dead-band, hysteresis, symmetry snap, and the 122-degree pose case. A
  shippable win on its own.
- **Phase 2 — the Plan.** `SpellIR.plan` alongside `SpellIR.field`, engine
  selector in the lab only.
  Gate: text snapshots for the lab presets and scorecard rows; law tests for
  R-05 through R-09.
- **Phase 3 — score, sim, painter, first family.** `jet`/`fan`/`burst`, all
  elements, lab only.
  Gate: motion goldens for the column presets; the beat structure visible;
  fresh-vs-incremental simulation bit-identical.
- **Phase 4 — remaining primitives and looks.** `vortex`, `hold`, `intake`,
  `shimmer`; seven sigil look rows.
  Gate: every preset and scorecard row has both golden tiers.
- **Phase 5 — cutover and deletion.** Simulator switches to `cast/`. Delete
  `field/`, `renderer/effects/`, `SpellIR.field`, the engine flag.
  Gate: `fire-shoot.e2e.ts` green with lit-pixel assertions replaced by a
  look-golden diff. Net line count down by roughly 2000.
- **Phase 6 — optional.** Canon snap table (after the spec's open questions
  are ruled). Flag-gated WebGL post-pass.

Salvage register: `png.ts`, `render.ts`, `mulberry32` from branch
`theorycrafting`; the portal identity, `vortex.ts` Rankine cell (with its
spill-above-updraft-fade rule), the adapter's one-thin-seam idea, and the
LOOKS table schema from branch `tc-field-canvas-rework`; `GROUND_TRUTH.md`
wholesale as the spec of intent. One lesson to carry even though its code is
not salvaged: a procedural shader must read the same phase its geometry turns
by, or the volume reads as mush (relevant if the phase 6 post-pass ever grows
motion). Keep both branches until phases 0 and 4 have extracted these, then
close PRs #74 and #76.

## Alternatives considered

- **Patch the current field** (map the four missing signs, fix the lean, add
  envelopes): cheapest, but leaves superposition, the five dead renderers, no
  time model and no verification. Rebuilds the same ceiling.
- **Finish PR #76 in Canvas2D**: carries the moment truncation and the coupled
  config across; the ceiling comes with it.
- **Pure clip playback, no simulation**: maximally authored, but the product's
  premise is that the drawing matters continuously, and nobody on the team is
  an animator. Its best idea is merged: a primitive is a clip-shaped kernel.
- **Grid fluid sim**: expensive, hard to keep deterministic cross-platform,
  and physics-first again.
- **three.js with look-table discipline**: discipline is exactly what failed.

## Engineering choices still open

- Playwright as the look-golden renderer versus a native canvas dependency
  (mitigation: motion tier is the primary gate; look tier pins CI chromium
  with a small per-pixel tolerance).
- Parcel budget on mobile; sprite atlas baked at build versus first cast.
- Whether the portal tilt leaves CSS entirely.
- Whether a cheap geometric facing fallback is worth building under the ML
  pose head (the hierarchy makes its absence degrade, a second tier would
  raise the floor for every drawn spell).
- The `check:filesize` CI step.
