# Orb — RESOLVED (2026-07-04)

The proposal that used to live here was ruled on and promoted to ground truth:
**GROUND_TRUTH.md §9** (vessel mechanics in the composed field §10, scorecard
rows §11, leftover unknowns §12.14–16). Orb is the **vessel** — column =
engine, region = valve, levitation = spring, pull = ambient coupling,
convergence = lens, **orb = vessel**: a one-way spherical boundary
($r = k_O \sum\lambda / F$) that contains the sigil's element, placed by the
_captured_ column aggregate. Second manipulate-mode sign, first containment
boundary, and gravity's entry into the model as **local law**. Implemented as
the `orb` sign kind + the vessel transport pass in `sim/src/mechanics.ts` +
the pour/containment plumbing in the ambient population.

## Rulings

Four forks were settled in the pre-proposal interview, three more (plus four
recommendations confirmed wholesale) at ruling time:

1. **Universal containment.** The shell is population-blind: any E-matter
   crossing inward is contained, own magic and ambient alike — the first
   mechanic that ignores population tags. "Only collects if added directly"
   holds because orb seals manifest nothing (R3), not because the shell
   reads tags. Non-E matter passes (pull's sigil-match precedent).
2. **Column re-read as placement — no jet.** §3's aim principle survives:
   $\mathbf A$ always says where the seal's output goes; with a vessel it
   parks the vessel. Height $= r + H_O C_+$ (tangent default, C<0 clamps),
   lateral shift along **+P̂** (the aim reading — the vessel parks where the
   jet would have gone; note this flips the levitation-locus analogy, §12.15),
   Γ **stirs** the contents (the whole aggregate re-reads). Column does NOT
   restore manifestation on an orb seal — the vessel eats its budget.
3. **Manipulate mode.** Orb-bearing seals emit no burst and manifest no own
   element (extends the pull-only ruling 2026-07-03). Qifrey's quiet
   dialogue-scene spell is quiet by law.
4. **Gravity is local law.** Settle + shell support inside the vessel only;
   excluded volume (§8) makes bottom-up cup filling _emergent_. The pour is
   a demo boundary condition (driven spawner stream), not world physics;
   the ambient medium stays a floating suspension.
5. **Size is ink-read.** $r \propto \sum\lambda$ (glyph diameters), lensed by
   $F$ — canon's four quarter-ring glyphs give a ring-sized sphere. Capacity
   is **geometric and emergent** (excluded volume): no capacity constant;
   a full shell rejects arrivals and the spill sheds outside.
6. **Canteen bookkeeping.** Shell-contained matter counts against the pull
   grasp capacity $G_{max}$ — the shell is a raised grasp — so a
   self-filling canteen throttles its own intake. Self-limiting house style.
7. **Parked**: levitation on an orb seal (thermos, §12.14), discharge on
   seal lift (shared with the grasp, §12.8), the $R^3$ capacity exponent
   (§12.16).

## Notes from implementation

- The one-way shell is a **ratchet compressor**: the pour drive can stuff
  motes past the packed surface while it sits inside the shell, so effective
  capacity is a few × naive packing. Overfill therefore needs a genuinely
  tiny thimble (the edge preset uses λ = 0.03 glyphs).
- Presets 43–49 carry the executable checks (canon cup, bare cup, lopsided
  cup, canteen, stirred cup, focused cup, overfill probe). Population-level
  claims run the real `AmbientMedium` headlessly; PNGs for vessel presets
  render the real population too (`traceVesselPopulation`), with the
  canonically-invisible shell drawn as a faint diagram outline.
- Renumbering: composed field is now §10, scorecard §11, open questions §12.
