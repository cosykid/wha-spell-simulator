# Levitation — RESOLVED (2026-07-02)

The proposal that used to live here was ruled on and promoted to ground truth:
the law, parsing, evidence anchors and predictions are now **GROUND_TRUTH.md §6**
(field terms §8, scorecard rows §9, leftover unknowns §10 — renumbered when pull
landed as §7). Implemented in the sim
as the `levitation` sign kind; presets 20–23 (pyreball ×2, skysoaring readout,
ground-fan prediction) carry the executable checks.

## Rulings

1. **Force pair, not a sigil switch.** One law; hold vs thrust falls out of a
   per-element _grip_ property (`ELEMENT_GRIP`) — wind streams through the grip,
   everything else manifests a holdable blob.
2. **Hover height is sign-length-driven.** The pair is a spring whose rest
   length grows with stem length: $h_0 = H_{lev}\bar\lambda$. Constant mass,
   longer signs → held further out. (Weight capacity still scales with sign size
   through $C_{lev}$, so the canon capacity line survives untouched.)
3. **No payload in v1** — the element blob only. Payload sphere (visible
   $W_{max}$, yam cooking) is a later chapter.
4. **Burst suppression is emergent recapture only.** No explicit rule: the
   spring is off inside the blob radius and outcompetes the burst beyond it.
5. **Fill to capacity (2026-07-02).** The grip sustains held magic, so the
   disk's feed _accumulates_: manifestation stops once the held mass reaches
   $W_{max} \propto C_{lev}$. Supersedes ruling 4's "continuously fed" reading —
   the steady state is just the suspended ball. The capture zone also always
   spans down to the seal rim, so the feed converges instead of spraying a
   skirt when the ball hovers high.

## One deliberate deviation from the original proposal

The proposal guessed the unbalanced hover locus shifts along **+P̂_lev**. Under
the force-pair ruling it must be **−P̂_lev**: skysoaring (anime) fixes the
substrate side of the pair to +P̂_lev, so the mass side gets −P̂_lev. The strut
intuition behind the original guess predicts backward skysoaring thrust, so it
loses. No canon shows an unbalanced hold seal — parked as GROUND_TRUTH §9.5.
