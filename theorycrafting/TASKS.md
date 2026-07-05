# Fix the Column Sign (done)

There's one case I'd like you to fix is the "Lone rim column - engine". Currently it shows two flows: one in the direction of the sign (correct) and one exiting the rim from the back of the sign (wrong). This is probably because you are superposing the isotropic burst and the column jet, but the column should control the direction of the flow (one budget, steered).

# Theorycraft and implement the "pull" sign (done)

Researched (todo_pull.md → rulings → GROUND_TRUTH §7), implemented as the
`pull` sign kind + the ambient medium population; presets 24–29 carry the
executable checks.

# Pull-only seals affect ambient only — no shockwave (done)

Ruling 2026-07-03 (GROUND_TRUTH §7 + todo_pull.md R8): a seal whose only
budget-bearing signs are pull manifests nothing — no elemental shockwave;
the ambient coupling is the whole spell. Column/levitation restore
manifestation (new "Flame burst — column + pull ring" preset pins the
canon coexistence); region/convergence do not. Implemented as
`Nozzle.manifests` gating the burst term, own-tracer spawning and harness
traces.

# Theorycraft and implement the "convergence" sign (done)

Researched (todo_convergence.md → rulings → GROUND_TRUTH §8), implemented as
the `convergence` sign kind (the lens: scalar Q, orientation ignored) + the
excluded-volume & rigidity population mechanics in sim/src/mechanics.ts;
presets 37–41 (floatglow lamp, candle plume, beam lens, sylph strut, focused
intake) carry the executable checks. The excluded-volume mechanic also fixed
the waterball squish.

# Theorycraft and implement the "orb" sign (done)

Researched (todo_orb.md → interview + rulings → GROUND_TRUTH §9), implemented
as the `orb` sign kind (the vessel: one-way population-blind shell, column
budget captured as placement, manipulate mode, gravity as local law inside)

- the vessel transport pass in sim/src/mechanics.ts + the pour spawner and
  containment/grasp accounting in the ambient population. Presets 43–49
  (Water Orb canon cup, bare cup, lopsided cup, self-filling canteen, stirred
  cup, focused cup, overfill thimble) carry the executable checks. Sections
  renumbered: composed field §10, scorecard §11, open questions §12.
