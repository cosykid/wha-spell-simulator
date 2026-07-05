# WHA Spell Simulator

Interactive three.js demo of the model in [../GROUND_TRUTH.md](../GROUND_TRUTH.md).

## Run

```bash
cd sim
npm install   # first time only
npm run dev   # vite on http://localhost:5173
```

(Node was installed via nvm; interactive shells pick it up from `.bashrc`.
From scripts use `bash ci.sh install|check|test|dev`.)

## Test

```bash
npm test                       # or: bash ci.sh test
npm test -- --only=engine      # filter presets by name substring
npm test -- --probe=0,0.3,0.5  # print u(X) at a point for every preset
```

`test/checks.ts` holds one entry per preset name — GROUND_TRUTH §11's scorecard
as executable assertions (a renamed preset fails loudly; thresholds pin the
qualitative claim, not the tuning). Every run also renders a snapshot per
preset to `test/out/NN-<preset>.png` for visual verification: **left** = top
view (north = up), **right** = side view (north = right, height = up). Red
glow = spawn mask, steel = ring + sign glyphs, element color = tracer paths.
The tracers are deterministic (seeded) and use the exact spawn/advect/kill
rules of the live demo, so the PNGs are faithful stills of it.

## Architecture

| File               | Role                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model.ts`     | Seal / sign types, element colors & icons, per-element grip flag                                                                                                                                                                                                                                                                                          |
| `src/nozzle.ts`    | **Layer 1**: signs → `(S, P, C, Γ)` flux decomposition + levitation force-pair bundle `(L, P_lev, C_lev, Γ_lev, h₀, x₀, grip)` + pull ambient bundle `(K, P_p, C_p, Γ_p, cap)` + orb vessel bundle `(O, r, x, h, stir)` — which _captures_ the column aggregates (§9 placement re-read) — + region gate units (pinch / barrel / single), governance, mask |
| `src/field.ts`     | **Layer 2**: the velocity fields — own magic `u(X)` (burst + jet + fan + swirl + levitation grip/wash, then region clip/bias/conserve, then the disk wall) and ambient `u_amb(X)` (signed sink/push kernel + conveyor slab + twist, exhaust-gated but never masked)                                                                                       |
| `src/spells.ts`    | The preset catalog. **Add spells here** — compose `columnRing`, `regionRing`, `opposedRing`, `midlinePairs`, `centerPin`, `levitationRing`, `pullRing`, `convergenceRing`, `orbCorners`, `columnAt`, `regionAt`, `levitationAt`, `pullAt`, `convergenceAt`, `orbAt` (+ `pour: true` for the §9 demo spout)                                                |
| `src/config.ts`    | Every tunable constant, mirroring `[tunable]` tags in the ground truth                                                                                                                                                                                                                                                                                    |
| `src/mechanics.ts` | Transport-level population mechanics: excluded volume (every seal) + rigidity (∝ Q) + the §9 vessel (settle, stir, one-way shell — population-blind)                                                                                                                                                                                                      |
| `src/render/*`     | Seal drawing (ring, signs, SVG sigil), mask overlay, particle tracers, ambient medium motes (`AmbientMedium`: thin-everywhere cloud, grasp latch + capacitor throttle), element volume (marching-cubes toon skin over the tracer cloud — render-only, reads `pos/vel/alive/fade` from `Particles`)                                                        |
| `test/*`           | Node harness: scorecard checks + PNG snapshots, no browser needed                                                                                                                                                                                                                                                                                         |

Particles are passive tracers of the steady field (`Ẋ = u(X)`), spawned with
density = mask × proximity (so the spawn footprint reproduces the wiki demo's
red regions) and absorbed behind fences. The ambient medium is a second,
decoupled population (`Ẋ = u_amb(X)`) — persistent motes that only pull
seals address; motes that stall in the grasp cushion are latched and charge
the capacitor until the pull dies at `G_max ∝ C_p₊`. Pull-only seals (no
column/levitation) manifest nothing — `Nozzle.manifests` gates the burst and
own-tracer spawning, so the ambient medium is their whole output (§7).
Orb-bearing seals are silent the same way (§9): the vessel captures the
column budget, and the ambient population — poured from the demo spout
and/or inhaled by a coexisting pull — is the spell. Under a vessel the
ambient motes also run the excluded-volume pass, so the cup's bottom-up
fill and its geometric capacity are emergent; shell-contained motes count
toward the grasp capacitor (the shell is a raised grasp).

Debug hook: `window.__wha = { nozzle, maskAt, spawnWeight, v2, CONFIG, SPELLS }`
refreshes on every spell switch — probe the model from the browser console.
The `VOLUME_*` knobs in `CONFIG` are re-read every frame, so the element
volume can be tuned live (`__wha.CONFIG.VOLUME_STRENGTH = …`), and `SPELLS`
is mutable — set `__wha.SPELLS[i].element = "water"` and re-select the preset
to view any seal in another element.
