# The cell stage: performing the score in three.js

Status: ruling, 2026-08-23. This supersedes the Canvas2D renderer ruling in
[`animation-redesign.md`](animation-redesign.md) for everything below the score,
and nothing above it. Read that document and
[`animation-spec.md`](animation-spec.md) first; every R-nn cited here is theirs.

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

- `cast/stage/` — `CastStage`, seam-compatible with `CastRenderer`
  (`render(spellIR, ring, timestamp, options)`): owns the `WebGLRenderer`, the
  scene, the portal camera, DPR/resize/context-loss, and the frame step. Builds
  cells from the score once per `spellIR.signature`, disposes them on reset.
- `cast/stage/portalCamera.ts` — the one owner of camera numbers. It must
  reproduce `portal/`'s projection: a unit test projects seal-space probe points
  through `portal/projectSeal` and through the three.js camera and asserts pixel
  agreement within epsilon. The paper stays CSS-tilted DOM; only the effect
  canvas is WebGL, so the identity is what keeps effect and paper in one
  perspective.
- `cast/cells/` — the performers. `cell.ts` is the contract, `registry.ts` the
  one place kind is switched on (as `sim/primitives/registry.ts` was).
- Seal space everywhere (R-03): the stage exposes a root `Group` whose transform
  maps seal space (x right, y screen-down, z out of the paper, one unit = ring
  radius) into three.js world space. Cells never see screen or world space.

### The cell contract

```ts
interface CellContext {
	seed: number; // derived from score signature + track index
	look: LookRow; // resolved material profile
	quality: number;
}

interface CellFrame {
	tMs: number; // cast time
	beat: BeatName;
	beatT: number; // 0..1 through the beat
	emission: number; // sampled from the track's emission envelope
	drive: number; // sampled from the track's drive envelope
	dtMs: number; // fixed in golden mode
}

interface Cell {
	readonly group: THREE.Group; // parented under the stage's seal-space root
	update(frame: CellFrame): void;
	dispose(): void; // geometries, materials, textures
}

type CellFactory = (track: ScoreTrack, ctx: CellContext) => Cell;
```

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

| Cell      | Track     | Macroscopic form                                                                                                                                                                                     |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beam`    | `jet`     | Bright core spine along `aim` rooted in the aperture footprint; 3–5 twisting ink ribbons sheathe it, alpha-banded by axial flow phase; tongue tip stretches at strike, feathers at release.          |
| `fan`     | `fan`     | A sector sheet: curved fan surface with radial streak shading and a serrated leading edge that advances with drive; edge sparks as garnish.                                                          |
| `burst`   | `burst`   | The strike made visible: expanding shock annulus hugging the seal plane, a brief vertical flash, and radial ink licks that scorch and fade through afterglow.                                        |
| `vortex`  | `vortex`  | The PR #76 Rankine cell, ported: helical ribbon arms on a flaring core, calm eye, floor inflow, crown spill; band shader reads the same spin phase the arms turn by.                                 |
| `hold`    | `hold`    | A contained presence at `hold.at`: soft shell with slow orbital ink rings (spin), faint tether wisps to the seal, grip pulses at strike. R-16 rotor spins without grip; R-17 inverted grips nothing. |
| `intake`  | `intake`  | Ambient streamlines: long curved strokes bending in from outside the seal, accelerating, swallowed with a rim flash; the exempt-own-manifestation law (ground-truth §7) is unchanged.                |
| `ambient` | `shimmer` | R-10's medium, demoted to garnish: sparse motes and a faint seal-plane haze that inhales during charge and breathes with the beats. It may never dominate a frame.                                   |

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

- The plan/score text golden tiers stand unchanged (plus the new fields).
- The sim step-identity test dies with the sim; its replacement is a stage
  determinism test: fixed-step frames at t and fresh builds stepped to t must
  match on cell state probes.
- PNG goldens move to the WebGL canvas via the existing Playwright rig
  (headless SwiftShader; `preserveDrawingBuffer` only in the scripted-clock
  path). New goldens must be **discriminative**: the rig asserts that distinct
  presets differ from each other by a floor, not just that each matches its own
  baseline — the phase-5 goldens passed while five spells rendered identically,
  and that must be structurally impossible to repeat.
- `/tools/spell-effect-lab` stays the visual iteration surface; the
  `?preset=<id>&frameMs=<n>` scripted clock keeps working on the stage.

## Migration

1. **Scaffold** — `stage/` + contract + registry + portal-camera identity test +
   a placeholder burst cell, mounted as a lab engine only.
2. **Geometry threading** — reading → plan → score `symmetry`/`sites`, goldens
   regenerated.
3. **Cells** — beam, fan, vortex, hold, intake, ambient, burst, against looks
   v2 profiles.
4. **Cutover** — the three call sites (`simulator-runtime.svelte.ts`,
   `spell-preview.ts`, `lab-engines.ts`) construct `CastStage`; seal-ink
   ignition joins the charge beat on the glyph overlay ("ink brightens", R-01).
5. **Deletion** — `sim/`, `render/painter2d.ts`, `render/sprites.ts`,
   `render/castRenderer.ts` and their tests go; the branch merges with one
   engine, honoring the no-second-engine law.
