# Effect Rendering Notes

**Superseded.** Since the phase 5 cutover the simulator renders spells through
`src/lib/cast/`, described in [`animation-redesign.md`](animation-redesign.md)
and [`animation-spec.md`](animation-spec.md). Everything below documents the
field engine, which now runs only in the Spell Effect Lab's `field` option and
the library preview, and which the second half of phase 5 deletes. Kept until
then so the code that still exists still has notes.

The effect renderer turns `SpellIR` into particles on the effect canvas. It is visual-only code: gameplay meaning belongs in the compiler, while these files decide how a compiled spell should look.

## Two Renderers

`SpellEffectRenderer` dispatches on `spellIR.field`:

- Signs present (`field.sources` non-empty): the field renderer (`fieldEffect.ts`) advects particles through the compiled force field. One renderer for every element; behavior comes from the field, not the element.
- No signs (sigil only): the per-element renderers below (`fire`, `water`, `wind`, `earth`, `light`), driven by the global scalars.

## Field Renderer

Particles live in seal space and are advected through `sampleFieldForce(field, position, height)`:

- Spawn positions come from `spawnDomainPosition(field.domain)`, so region signs decide where particles appear (inside, outside, on the ring, a sector, or anywhere).
- Each frame, `sampleFieldForce` returns the summed `x`/`y`/`z` force at the particle. In-plane force accelerates it; `z` lifts it up the seal axis; a constant gravity pulls it back. `buoyancy` lift fades with `height`, so held magic settles into a hovering mass instead of climbing forever.
- Particles are projected onto the tilted portal (`z` shifts them up-screen) and tinted by an element palette.
- Particles live for `spellLifetimeFrames` and fade with `emission` (`steadyParticleAlpha`), so held forms persist steadily and the whole effect fades out together. This is why the field renderer reads as a held beam or blob, not a repeating spray.

Emergent behaviors (from summing sources alone): balanced columns cancel their lean into one straight beam; angled pulls swirl around a hollow vortex eye, and a strong pinwheel of them climbs into a tornado (Grasping Wind) while a weak lone swirl stays a flat whirlpool pinned by gravity; opposed region pushes cancel; opposing levitation signs squeeze a hovering orb into being between them, while a lone levitation sign has nothing pushing back and blows the magic away without ever forming an orb.

## Shared Model

All active element effects start from the same renderer model:

- `activePortalPlane()` projects the completed ring into a tilted ellipse. Particles emit from that portal instead of the flat paper ring.
- `portalOutDirection()` converts paper-local `direction.x`, `direction.y`, and `direction.z` into a 2D screen direction. Positive `z` lifts the effect upward from the paper.
- `elementFlow()` packages `direction`, perpendicular `side`, `effectScale`, `focus`, and `convergence` for element files.
- `narrowedByFocusAndConvergence()` reduces source width and jitter. More focus means a tighter stream. More convergence means particles spawn closer to the compressed centerline.
- `convergenceFlow()` builds the shared convergence centerline, progress, radius, and rigidity controls.
- `convergePoint()` compresses points sideways around the current effect path. It does not pull the whole effect back toward the paper plane.
- `scaledParticleCount()` scales the particle budget by `emission`, then caps it with `config.renderer.particleCap`.

The renderer treats `dt` as frame units at roughly 60 FPS. Particle velocities are tuned in pixels per frame, then multiplied by `dt`.

## SpellIR Inputs

The most important renderer inputs are:

- `effectScale`: grows the portal area, particle size, and particle count. The compiler derives it from primary sigil size.
- `force`: increases speed, pressure, particle size, and active distance.
- `spread`: widens the source area and adds sideways noise.
- `stability`: lowers wobble and increases damping. Lower stability makes particles drift and flicker more.
- `gravity`: keeps water and fire moving as streams when high. Low gravity becomes suspension.
- `focus`: narrows source width and jitter.
- `convergence`: compresses the effect's sideways spread around its current path while preserving forward motion.
- `emission`: fades spawning and alpha near the end of the spell lifetime.

## Element Behaviors

### Fire

Fire uses glowing radial particles. Normal fire is a fast stream along `direction`; low-gravity fire switches to a suspended flame cloud above the portal.

Key calculations:

- Source area shrinks with `focus` and `convergence`.
- Speed scales with `force`, `effectScale`, and suspension.
- Particle radius scales with `force` and `effectScale`.
- Low `stability` adds flicker and wander.
- Suspended fire uses home positions, spring tension, and damping so particles hover instead of leaving the portal.

### Water

Water uses local 3D-like coordinates: `forward`, `height`, `depth`, and `lateral`. Those values are projected back to the 2D canvas each frame.

Key calculations:

- `pressure` comes from `force` and `effectScale`.
- `horizontalSpeed` and `verticalSpeed` mix pressure with the compiled direction.
- `gravityForce` pulls free-stream height down. Low gravity switches water to a suspended blob-like cluster.
- `streamLength` limits how far a free stream can travel.
- Water draws broad mass first, then inner core, then small deterministic highlights.
- Suspended water uses the same spring-home idea as suspended fire, but in local coordinates.

### Wind

Wind is a set of curved line particles. Each particle travels in the compiled direction with a small curl velocity.

Key calculations:

- Source radii and surface jitter use the shared focus and convergence narrowing helper.
- Speed scales with `force` and `effectScale`.
- Curl increases when `stability` is low.
- Particle depth increases alpha and line width over lifetime.

### Earth

Earth is a stream of square particles. It moves slower and heavier than wind, with larger damping.

Key calculations:

- Source radii and surface jitter use the shared focus and convergence narrowing helper.
- Speed is lower than other elements and scales with `force`.
- Particle size grows slightly with lifetime depth.
- Convergence reduces velocity and display size as the material compresses inward.

### Light

Light is a narrow beam made from particles with short trails. Each particle stores a trail and is steered back toward its lane.

Key calculations:

- Speed is deterministic per flow, then randomized per particle.
- `laneCohesion` pulls particles back to their ideal beam path.
- `lateralDamping` removes sideways velocity.
- `trailLength` grows with `stability`, making cleaner spells look smoother.
- Multiple stroke passes draw a wide glow, a middle beam, and a bright core.
