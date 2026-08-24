# The cell stage: performing the score in three.js

Status: ruled 2026-08-23, **executed 2026-08-24** on branch `animation-cells`.
All five migration steps below are done, the parcel engine is deleted, and the
contract quoted here is the one in `cast/cells/cell.ts`. This supersedes the
Canvas2D renderer ruling in
[`animation-redesign.md`](animation-redesign.md) for everything below the score,
and nothing above it. Read that document and
[`animation-spec.md`](animation-spec.md) first; every R-nn cited here is theirs.
The directory guides are [`src/lib/cast/cells/CLAUDE.md`](../src/lib/cast/cells/CLAUDE.md)
and [`src/lib/cast/stage/CLAUDE.md`](../src/lib/cast/stage/CLAUDE.md).

## Why the phase-5 output failed

The phase-5 cast is architecturally sound and visually mute. Five reasons, in
order, from the 2026-08-23 diagnosis:

1. One drawing primitive, a gradient dot. `render/sprites.ts` bakes all four
   sprite ids from the same radial-gradient circle. Nothing below `SpellIR` can
   draw a line, ribbon, sheet, tongue, shard or silhouette.
2. No macroscopic form. The aperture is a spawn surface consumed once; form has
   to emerge statistically from ≤1400 independent dots, so the eye counts
   sprites instead of reading a mass.
3. The unconditional `shimmer` dominates: its parcels live longest and look the
   same in every spell.
4. Motion is steady-state advection. Six of seven kernels ignore age; there is
   no impulse, mass, impact or settle, and the decay curve confines everything
   to about one ring radius.
5. The look table's whole surface is "sizes and tints", so elements are palette
   swaps on the same dots.

PR #76 proved the converse: its one hand-resolved structure (the Rankine vortex
cell, shader bands phase-locked to real rotation) read beautifully. The lesson
stands: **resolution, not superposition — and the resolution has to reach the
pixels.** The theory PDF closes the loop: the sign vocabulary is a small closed
set of structural archetypes, so resolving each one by hand is a finite job.

## The ruling

- The renderer moves to **three.js** (plain, no wrapper framework). A real
  perspective camera replaces the painter's projection; the portal identity is
  kept, not approximated.
- **Everything from the score up survives unchanged in role**: Reading, Plan,
  Score, the R-01 beat clock, envelopes, signatures, determinism, text goldens.
  The plan gains geometry it currently discards (below); no ruling changes.
- **`sim/` (parcels, kernels) and `render/` (painter2d, sprites) are deleted at
  cutover.** Their replacement is `cells/` + `stage/`: one bespoke _cell_ per
  track kind, performing that track's envelopes as macroscopic animated form.
- `looks/` survives as the data-only art layer (same ESLint wall, same
  sigil→element→inert resolution) but its contract grows from sizes-and-tints to
  a full **material profile**.
- A parcel belonged to exactly one track; a cell _is_ one track. The
  no-cross-track law, couplings-as-constraints, and R-20's throttle-reads-
  population-but-never-steers all carry over with the same meanings.

## Architecture

```
SpellPlan -> score/ -> SpellScore -> stage/ -> pixels
                              cells/ (one performer per track kind)
                              looks/ (material profiles, read by cells)
```

- `cast/stage/` — `CastStage`, which kept the argument list of the `CastRenderer`
  it replaced (`render(spellIR, ring, timestamp, options)`): owns the
  `WebGLRenderer`, the scene, the portal camera, DPR/resize/context-loss, and the
  frame step. Builds cells from the score once per `spellIR.signature`, disposes
  them on reset.
- `cast/stage/portalCamera.ts` — the one owner of camera numbers. It must
  reproduce `portal/`'s projection: `tests/portalCamera.test.ts` projects
  seal-space probe points through `portal/projectSeal` and through the three.js
  camera and holds the agreement inside 0.05px. The paper stays CSS-tilted DOM;
  only the effect canvas is WebGL, so the identity is what keeps effect and paper
  in one perspective.
- `cast/cells/` — the performers. `cell.ts` is the contract, `registry.ts` the
  one place kind is switched on (as `sim/primitives/registry.ts` was).
- Seal space everywhere (R-03): the stage exposes a root `Group` whose transform
  maps seal space (x right, y screen-down, z out of the paper, one unit = ring
  radius) into three.js world space. Cells never see screen or world space.

### The cell contract

As built, in `cast/cells/cell.ts`:

```ts
interface CellContext {
	seed: number; // derived from score signature + track index
	look: LookRow; // resolved material profile
	quality: number; // form roughness only, never magnitude
}

interface CellFrame {
	tMs: number; // cast time, always a whole number of steps
	beat: Beat; // the score's own beat name
	beatT: number; // 0..1 through the beat
	emission: number; // sampled from the track's emission envelope
	drive: number; // sampled from the track's drive envelope
	dtMs: number; // fixed, so fresh-to-t and incremental stepping agree
}

/** A ceiling a holder imposes on what the plan declared it captures. */
interface CellConstraint {
	at: Vec3; // seal space
	radius: number; // seal units of shell a captured form may not reach past
	closed: number; // 0..1, how closed the grip is
}

interface Cell {
	readonly group: THREE.Group; // parented under the stage's seal-space root
	update(frame: CellFrame): void;
	dispose(): void; // geometries, materials, textures
	constraint?(): CellConstraint | null; // holder side of a coupling
	bind?(constraint: CellConstraint | null): void; // captured side
}

type CellFactory = (track: ScoreTrack, ctx: CellContext) => Cell;
```

The two optional members and `CellConstraint` arrived with step 3, when the
couplings below met real form. A cell that implements neither is never capped,
which is exactly what an uncaptured cell is, so adding a cell never requires
thinking about couplings at all.

Rules, inherited and new:

- **A cell feels only its own track.** No cell reads another cell, the score, or
  the wall clock. Couplings arrive the way they did in the sim: the stage
  applies the holder's constraint to captured cells' declared bound (a ceiling
  the cell exposes, not a reach into its internals).
- **Deterministic replay.** `update` must be a function of (track, ctx, frames
  so far). Seeded RNG only, from `ctx.seed`; `Math.random` and `Date.now` are
  banned below `stage/` exactly as they were below `render/`. Fresh-to-t and
  incremental stepping must visually agree; the golden tier steps fixed
  `dtMs`.
- **Phase-locked patterning.** Any procedural surface pattern (banding, licks,
  streaks) must be driven by the same phase its geometry moves by — the PR #76
  rule that made rotation read in a still frame.
- **Beats are visible, not just structural.** Every cell states what it does in
  each beat: charge (anticipation only, R-01: nothing non-ambient manifests),
  strike (impulse, overshoot), body (sustain; only body stretches, R-02),
  release (commit/launch), afterglow (dissipate, settle). A cell whose five
  beats look identical is a bug.

### Cell catalog, round one

Form vocabulary is inked shapes — ribbons, tongues, sheets, shards, shells —
built from tube/strip geometry and instanced meshes with shader-driven ink
edges. Particles exist only as garnish attached to a form. Dots may not be the
body of anything.

| Cell      | Track     | Macroscopic form                                                                                                                                                                                                                                                             |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beam`    | `jet`     | Bright core spine along `aim` rooted in the aperture footprint; 3–5 twisting ink ribbons sheathe it, alpha-banded by axial flow phase; one feeder strand per drawn column runs in along the paper and up into the foot; tongue tip stretches at strike, feathers at release. |
| `fan`     | `fan`     | One sector sheet per drawn dispersion sign: curved fan surface with radial streak shading and a serrated leading edge that advances with drive; edge sparks as garnish.                                                                                                      |
| `burst`   | `burst`   | The strike made visible: expanding shock annulus hugging the seal plane, a brief vertical flash, and radial ink licks that scorch and fade through afterglow.                                                                                                                |
| `vortex`  | `vortex`  | The PR #76 Rankine cell, ported: helical ribbon arms on a flaring core, calm eye, floor inflow, crown spill; band shader reads the same spin phase the arms turn by.                                                                                                         |
| `hold`    | `hold`    | A contained presence at `hold.at`: soft shell with slow orbital ink rings (spin), faint tether wisps to the seal, grip pulses at strike. R-16 rotor spins without grip; R-17's inverted case never reaches a cell, because the plan resolves no hold at all.                 |
| `intake`  | `intake`  | Ambient streamlines: long curved strokes bending in from outside the seal, accelerating, swallowed with a rim flash; the exempt-own-manifestation law (ground-truth §7) is unchanged.                                                                                        |
| `ambient` | `shimmer` | R-10's medium, demoted to garnish: sparse motes and a faint seal-plane haze that inhales during charge and breathes with the beats. It may never dominate a frame.                                                                                                           |

`vessel` remains the last unbuilt primitive and keeps its `routed-vessel` path.

### Looks v2: material profiles

A `LookRow` grows from tint/size lists to a material profile consumed by cells:
palette ramp (core→edge), emissive strength, ink edge treatment (crisp/feather/
serrated), pattern (band count, noise scale), form biases (ribbon width, sheet
opacity, garnish density, trail persistence), and motion texture (flicker,
undulation, weight). Rows stay data-only behind the existing ESLint wall, still
argued from dictionary `sourceNotes` (crystal and aeroform keep their reasons),
still resolved sigil → element → `inert`. Element identity must survive with
geometry unchanged: fire licks, water sheets glassily, wind is near-invisible
speed-strokes, earth is chunky and heavy, light is pure emissive, crystal is
faceted glints.

### Geometry the plan stops discarding

Additive, ruling-neutral fields so cells can honor drawn structure:

- `SpellPlan.symmetry: number | null` — carried from the reading's n-fold snap.
- Per-family `sites` (seal-space positions + facings of the contributing signs)
  on the jet/fan/hold specs, so three columns can read as a 3-fold beam rather
  than one averaged one. Count keeps paying magnitude exactly as R-05 says;
  sites only shape form.

Score threads both into track params. Plan text goldens gain lines; no existing
line changes meaning.

## Verification

What stands after the cutover:

- The plan text golden tier stands unchanged (plus the new fields), and
  `spellScore.test.ts` still holds the beat clock and the envelopes.
- The sim step-identity test died with the sim. Its replacement is the **cast
  tier as cell-state text goldens**: `tests/golden/casts.ts` performs each lab
  preset through the real cells on a headless stage and writes what they reached
  as text at 850ms, 1100ms, 1600ms and 2600ms, with no pixels, because pure Node
  has no GL context. `tests/golden/cast.test.ts` is the gate: fresh-to-t must
  equal incremental stepping, two performances must read the same, and the charge
  must hold the ambient medium and nothing else (R-01, R-02). The probe table in
  `tests/golden/castProbes.ts` measures its claims on the state a cell actually
  reached.
- The cell contract itself is pinned in `tests/castCells.test.ts`, with per-cell
  law suites in `cellsDirectional`, `cellsSwirl` and `cellsHold`. The portal
  identity is `tests/portalCamera.test.ts` at 0.05px.
- PNG goldens moved to the WebGL canvas via the existing Playwright rig
  (headless Chromium; `preserveDrawingBuffer` only under the scripted clock or
  `?castReadback=1`, the test-only signal in `cast/stage/readback.ts`, which is
  also how the e2e beat probes read the buffer back). New goldens are
  **discriminative**: `tests-e2e/golden-look.e2e.ts` compares every pair of
  preset baselines at one matched mid-body frame (2200ms) and fails if the
  closest pair falls under `MIN_PRESET_DISTANCE`, so matching your own baseline
  is no longer enough. Only the three seals that R-11 makes render the same
  designed default are exempt, and only against each other.
- `/tools/spell-effect-lab` stays the visual iteration surface; the
  `?preset=<id>&frameMs=<n>` scripted clock works on the stage.

## Migration

All five landed on `animation-cells` in seven commits, ending at `1555135`.

1. **Scaffold** — `stage/` + contract + registry + portal-camera identity test +
   a placeholder burst cell, mounted as a lab engine only. _Done._
2. **Geometry threading** — reading → plan → score `symmetry`/`sites`, goldens
   regenerated. _Done._
3. **Cells** — beam, fan, vortex, hold, intake, ambient, burst, against looks
   v2 profiles. _Done._
4. **Cutover** — the three call sites (`simulator-runtime.svelte.ts`,
   `spell-preview.ts`, and the lab's `lab-preview.ts`, which absorbed the
   deleted `lab-engines.ts`) construct `CastStage`; seal-ink ignition joins the
   charge beat on the glyph overlay ("ink brightens", R-01). _Done._
5. **Deletion** — `sim/`, `render/painter2d.ts`, `render/sprites.ts`,
   `render/castRenderer.ts` and their tests are gone; the branch carries one
   engine, honoring the no-second-engine law. _Done._

**2026-08 addendum.** Step 5's "the branch carries one engine" is now "the branch
carries one engine per style". The Canvas2D engine restored under
`src/lib/cast/classic/` is chosen by a user preference at the canvas, never by a
spell, so the no-second-engine law holds in the form it was always protecting:
no per-spell dispatch, no fallback, no ownership boolean. See the dated section
at the end of `docs/animation-redesign.md`.
