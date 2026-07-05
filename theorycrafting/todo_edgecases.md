# Edge cases with the current signs — probes (2026-07-02)

Seven presets added to `sim/src/spells.ts` (the `Edge:` block at the end of the
catalog, snapshots `24-…` to `30-…`). Each one is the cheapest seal that forces
an open question in GROUND_TRUTH §9 — or a gap the current signs expose — to
give a concrete answer. Checks in `sim/test/checks.ts` pin the **current law**
where it is disputed, labeled as pins, so a ruling that changes the law fails
loudly and gets re-pinned deliberately. Rulings at the end.

---

## 1. Half ring — surge angle probe (§9.1, snapshot 24)

Three inward columns clustered on the south rim (az 240/270/300, λ=0.45,
r=0.85). This is the sharpest discriminator for the unopposed-convergence
question, much starker than the lone rim column:

- **Flux law (current)**: C = Σλw = 1.15, |P| = 1.23 → surge rises at
  tan⁻¹(C/|P|) ≈ **43°**. Verified: the snapshot shows a clean diagonal sheet.
- **Clash bookkeeping**: V = S − |P| = 1.35 − 1.23 = **0.12** → nearly flat
  (≈6° lift), a ground-hugging wave.

The lone rim column only mildly separates the two laws; here the _whole seal
character_ changes — diagonal geyser vs flat surge. A witch drawing a half
ring plausibly wants "push everything north": the flat reading. But the flux
law's diagonal is exactly the Rising Wave shape _without_ needing region
signs — which cuts both ways (canon's rising wave _does_ use chevrons, which
suggests columns alone would NOT have risen → weak evidence for clash).

## 2. Quadrupole — cancelled ink (§9.1's mirror, snapshot 25)

Two inward columns on ±x, two outward on ±z, equal weight (λ=0.3, w=0.7 all):
S = 1.2 yet **P = C = Γ = 0** exactly. Three readings, three different spells:

- **Flux law (current)**: all first moments vanish → indistinguishable from a
  blank ring. Verified: the snapshot is an isotropic burst; the check pins
  u(east) ≡ u(north). Four signs of ink do literally nothing.
- **Clash bookkeeping**: V = S − |P| = 1.2 → a vertical jet as strong as a
  small watershot (unless the divergence discriminator eats the outward pair
  first — the old model needed that extra rule anyway).
- **A real nozzle**: inflow along x, outflow along z — two opposed lateral
  fans fed sideways. The flux decomposition truncates at first moments and
  _cannot represent this_, whatever we rule on §9.1.

This is also where §2's "exit speed u₀ ∝ S" quietly breaks: the sim's burst
speed is a constant U_BURST, unscaled by S, so spent-but-cancelled budget
vanishes without a trace. Options: accept ink-waste (consistent with §5's
"contradictory seals waste ink"), scale the burst by leftover budget, or add
a genuine quadrupole term.

## 3. Two chevrons — quarter arc (§9.2-adjacent, snapshot 26)

Inward chevrons at E and N only (90° apart ≥ RING_SPREAD 60°) fuse into a
**full-circle** radial fence: the naked SW quadrant is collimated as hard as
the covered NE one. Verified: mask(-0.8,-0.8) ≈ 0.04, SW flow rises with no
outward component.

The discontinuity ladder is severe: **one** rim chevron = straight shutter,
lateral river (demo R2); **two** at ≥60° = full dome (this preset); and two at
59° would snap back to a pair of straight shutters. Demo L1 used four. No
canon shows a 2-chevron collimator. Candidate refinements: (a) keep — magic
"completes the circle" from any agreeing sample; (b) curved fence spans only
the azimuth arc the members cover (+margin), open elsewhere — needs
arc-sector fences; (c) raise the bar (≥3 members, or ≥180° spread) for full
fusion. Note the real §9.2 (does chevron _size_ mean anything?) still has no
probe: `RegionSign` has no size field at all.

## 4. Lev pinwheel — rotor? (§6 spec vs implementation, snapshot 27)

Four tangential lev arrows, fire: C_lev = 0, Γ_lev = 1.8. GROUND_TRUTH §6
_predicts_ "a levitation pinwheel is a rotor", and §7's formula adds the spin
term unconditionally — but `field.ts` nests spin inside `C_lev > 0`, so this
seal is a **dud**: the snapshot is a bare isotropic burst, zero swirl (the
check pins u_t = 0). The spec and the sim disagree; one of them must move.

Physics of each option: (a) _§7 as written_ — Γ_lev torques the zone mass
whether or not anything is held; a fire pinwheel swirls its own manifestation
aloft (a lazy fire-tornado, distinct from the column pinwheel's driven
vortex), and the wind version needs a Γ term in the wash branch (currently
absent — the wind rotor prediction is also unrealizable). (b) _Grip-required_
— torque needs a held mass to act on; pure pinwheel is a dud and §6's rotor
prediction gets amended to "pinwheel **+ hold** (slanted arrows) is a rotor".
Note (b) has an awkward edge: an _infinitesimal_ inward slant would summon
the full spin term discontinuously.

## 5. Lopsided grip — lev misfire (§9.5, snapshot 28)

Four inward lev arrows, the east one ×2 (λ̄=0.625 → h₀=1.0): P_lev = (−0.5, 0)
points west, and under the current ruling the ball hovers displaced **east**
(x₀ = −s·P_lev = +0.175), toward the long sign. Verified: visible off-axis
ball in the snapshot.

The aesthetic datum this preset makes visible: it is the **mirror** of Coco's
misfire. Column ring + long east sign → jet tilts _west, where the sign
points_. Lev ring + long east sign → ball shifts _east, away from where it
points_. Same drawing mistake, opposite displacement, because the held mass
sits on the reaction side of the pair. If a manga panel ever shows a lopsided
hold seal, this is the first thing to check. Until then: keep the
pair-consistency sign (locked to skysoaring thrust), and treat LEV_SHIFT
(0.35) as pure taste?

## 6. Inverted lev ring — press or dud? (§9.6, snapshot 29)

Four outward lev arrows (tails pulled in so heads reach the rim), crystal:
C_lev = −0.8 grips nothing under §6 — verified dud, bare burst, ink wasted.
Candidate laws if canon ever shows one:

- **Dud (current)**: the hold channel is one-sided; negative convergence
  simply fails to grip. Cheapest, consistent with "waste, don't crash".
- **Press**: read the spring as _signed_ — C_lev < 0 anchors the locus at
  −h₀, i.e. the pair pins zone mass **down onto the substrate** (anti-hover:
  a paperweight / clamp seal). The reaction would push the substrate _up_,
  which flirts with a self-lifting seal — probably why canon avoids it.
- **Repulsor**: the time-reverse of recapture — bodies flung radially out of
  the zone. This overlaps heavily with what the _pull_ sign's inverted mode
  already promises (todo_pull.md), which argues for keeping lev one-sided and
  letting pull own "push".

## 7. Fountain vs grip — jet through the ball (new open question, snapshot 30)

Watershot ring (C = 3.06) **plus** a lev hold ring (C_lev = 1.7), water.
GROUND_TRUTH composes column and levitation by field superposition (§7) but no
scorecard row ever mixes them, and no canon seal does either. Current outcome,
verified: the jet (∝ U_C·C ≈ 3.5) outruns the grip (∝ U_H·C_lev ≈ 1.4)
everywhere on the axis — **the ball never forms, the feed never stops**, and
the fill-to-capacity ruling is moot for this seal.

The snapshot shows the interesting part: the grip _pinches_ the escaping
fountain into a much tighter column above the locus — the lev ring acts as an
emergent **collimating lens** on a jet it cannot capture. That is a
defensible physical answer ("drive beats grip, but grip shapes"), and it
composes cleanly with §5's engine/valve grammar: column = engine, region =
valve, levitation = **spring** — and springs strain against flow, they don't
veto it. The alternative reading: the hold has right-of-way over _own_ magic
up to capacity (ball forms, fills at jet speed, overflow continues as a jet),
making capacity a valve on the engine. That needs a new rule; the current
behavior needs none.

---

## Rulings needed

1. **§9.1, surge angle** (presets 1+2 decide together): (a) keep the flux law
   — one-sided inward flux lifts, half ring surges at ≈43°, quadrupole is a
   blank ring; (b) clash bookkeeping — only mutually-opposed flux converts to
   vertical, half ring nearly flat, quadrupole jets _vertically_ (plus the
   divergence discriminator to stop outward pairs from counting); (c) pairwise
   opposed-flux matching — C counts only flux matched by opposing sectors:
   half ring flat _and_ quadrupole stays a blank ring (most machinery, most
   physical).
2. **Quadrupole / spent ink**: independent of 1 — is "cancelled budget
   vanishes" acceptable (§5 waste precedent), or should leftover S boost the
   bare burst (§2's u₀ ∝ S taken literally), or do we want a true quadrupole
   field term (in along the inward axis, out along the outward one)?
3. **Curved-fence fusion**: (a) keep — 2 agreeing radial chevrons ≥60° apart
   complete the full circle; (b) fence spans only the covered arc + margin;
   (c) full circle needs ≥3 members or ≥180° spread, else straight shutters.
4. **Lev rotor**: (a) align sim to §7 — spin acts without grip (fire pinwheel
   = lazy fire tornado; add the missing Γ term to the wind wash so the wind
   rotor prediction is realizable); (b) align §6/§7 to sim — torque requires
   a held mass, pure pinwheel is a dud, rotor prediction amended to "slanted
   pinwheel". If (b): is the discontinuity at infinitesimal slant acceptable?
5. **§9.5 lopsided hold**: confirm the displacement stays sign-locked to
   skysoaring (ball toward the long sign, mirror of the column misfire) with
   LEV_SHIFT a pure [tunable], or is the misfire-mirror asymmetry itself
   suspicious enough to revisit?
6. **§9.6 inverted lev**: (a) dud (current); (b) signed spring — a press that
   pins the zone onto the substrate; (c) repulsor (or: leave "push" to the
   pull sign's inverted mode and keep lev one-sided).
7. **Column + levitation composition**: (a) keep superposition — drive beats
   grip, the hold acts as an emergent collimating lens on the fountain (what
   the sim already shows); (b) hold has right-of-way over own magic up to
   capacity — ball forms, overflow jets; (c) declare the combination
   ink-contradictory (grip vetoes nothing, spends nothing).
