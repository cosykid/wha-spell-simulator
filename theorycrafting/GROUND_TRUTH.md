# WHA Magic — Ground Truth (v0.5)

Formal rules for simulating drawn spells, as agreed in theorycrafting sessions.
Scope: **column / dispersion / region / levitation / pull / convergence / orb** signs,
elemental sigils treated as equivalent (levitation introduces the first per-element
_property_, §6; convergence introduces the first _modifier_ sign and the
excluded-volume transport mechanic, §8; orb introduces the first _containment
boundary_ and gravity as local law, §9).
Status tags: **[agreed]** settled by discussion, **[canon]** anchored in source material,
**[tunable]** free constant exposed in the simulator config, **[open]** unresolved.

---

## 1. The seal

A seal is a tuple $(\text{ring}, \text{sigil}, \text{signs})$:

- **Ring**: circle of radius $R$ centered at the origin of its plane, unit normal $\hat z$
  (the ink side). All sign geometry is expressed in seal units, i.e. lengths are divided
  by $R$, so a drawing's _shape_ is scale-free. **[agreed]**
- **Disk wall** **[canon]**: the spell affects "all directions except under it". The open
  disk $\rho < 1,\ z = 0$ is a slip wall: flow satisfies $u_z \ge 0$ on it. Only the disk —
  the rest of the plane is free. **[agreed]**
- **Quality** $\eta \in [0,1]$: drawing precision. Multiplies output power; below a
  threshold the spell fizzles into the bare shockwave. **[canon: messy/small seals are
  weaker or fail]** (not yet in the sim).
- **Sigil**: selects element $E$ and (future) create-vs-manipulate mode. Position and size
  within the ring do not change behavior. **[canon, with noted exceptions]** (A first
  instance of manipulate mode already exists by _sign grammar_: pull-only seals, §7.)

## 2. Power and scaling — intensive vs extensive **[agreed]**

- Sign shape (dimensionless lengths $\lambda_i = \ell_i / R$) is **intensive**: it sets
  per-parcel drive, i.e. **exit speed** $u_0 \propto S$ (total sign budget, §3).
- Ring area is **extensive**: it sets the aperture, i.e. **throughput**
  $\dot m \propto \eta R^2$.
- Consequences: momentum flux $\propto R^2 S$, power $\propto R^2 S^2$. Uniformly
  rescaling a drawing keeps speed and multiplies throughput by the area ratio.
- Canon anchors: linked small seals replicate a big one (only works if speed is
  scale-free and rate is additive in area); Coco's oversized grasping wind uprooted a
  tree (same shape → same wind speed, area-scaled total force).

## 3. Default emission — the burst **[canon]**

A bare closed ring releases an isotropic burst above the plane (the "shockwave").
Modeled as a steady hemispherical fan from a virtual point slightly below the disk
center, decaying with distance from the disk:

$$
u_{\text{burst}}(\mathbf X) \;=\; U_B \,
\exp\!\Big(-\frac{d_{\text{disk}}(\mathbf X)}{L_B \cdot \text{reach}}\Big)\;
\widehat{\big(x,\; z + h_0,\; y\big)}
$$

with $d_{\text{disk}}$ the distance to the disk, $h_0$ a small offset making near-plane
flow lateral and on-axis flow vertical. $U_B, L_B, h_0$ **[tunable]**. Region signs
_shape_ this burst; column signs _steer_ it — **one budget**: the emission direction is
bent along the column aggregate $\mathbf A = \mathbf P + C_+\hat z$ (§4),

$$\hat v \;\mapsto\; \widehat{\hat v + k_S\,\mathbf A}, \qquad k_S \ \textbf{[tunable]}$$

so a driven seal produces a single steered flow, not an isotropic leak superposed on a
jet (a lone rim column must not vent out its own back). With no columns $\mathbf A = 0$
and the burst stays isotropic; balanced rings ($\mathbf P = 0$) steer it along $C_+\hat z$
(extra collimation for watershot); divergent rings ($C < 0$) leave it untouched — the fan
carries the eruption. **[agreed]**

The burst is the **default** spend, not an unconditional one: a seal whose only
budget-bearing signs are pull emits no burst at all — its entire output is the ambient
coupling (§7 manifestation ruling). **[agreed — ruling 2026-07-03]** Orb-bearing seals
join this manipulate-mode family: their entire output is the vessel (§9).
**[agreed — ruling 2026-07-04]**

## 4. Column signs — the flux law **[agreed]**

**Parsing.** Each column sign yields an application point $\mathbf p_i$ (stem ∩ crossbar),
unit direction $\hat u_i$ (along the stem, away from the crossbar), and length
$\lambda_i$. In-plane radial/tangential units at the sign:
$\hat r_i = \mathbf p_i / |\mathbf p_i|$, $\hat t_i = \hat z \times \hat r_i$, radial
weight $w_i = \min(|\mathbf p_i|, 1)$.

**Flux decomposition.** The seal compiles to four aggregates:

$$
S = \sum_i \lambda_i \qquad
\mathbf P = \sum_i \lambda_i \hat u_i \qquad
C = -\sum_i \lambda_i w_i\,(\hat u_i \cdot \hat r_i) \qquad
\Gamma = \sum_i \lambda_i w_i\,(\hat u_i \cdot \hat t_i)
$$

- $\mathbf P$ — net **lateral** jet momentum (in-plane).
- $C > 0$ — **convergence**: opposed inward flux clashes above the wall and is
  redirected along $+\hat z$ (vertical jet momentum).
- $C < 0$ — **divergence** $D = -C$: radial spread hugging the plane (the
  dispersion-like mode; canon: inverted column ≈ dispersion).
- $\Gamma$ — **circulation**: swirl about the seal axis. Prediction **[agreed]**: a
  tangential pinwheel of columns ($\mathbf P = 0, C = 0, \Gamma = S$) is a vortex.

**Emission.** Jet axis $\hat d \parallel \mathbf P + \max(C,0)\,\hat z$, speed
$\propto U_C\,|\mathbf P + C_+ \hat z|$, carried in a tube of radius $\approx 1$ extruded
from the disk along $\hat d$ with range $L_J \cdot \text{reach}$ **[tunable]**. The same
aggregate steers the burst (§3), so magic behind a lone sign rises and folds into the
jet instead of leaking backward. Fan and swirl fields are added analogously (§10).

**Canon checks.** Balanced inward ring → vertical jet (watershot, light beam).
One longer sign → tilt **in the direction the long sign points**
**[canon: Sign_Length_Demo]**, $\tan\alpha = |\mathbf P| / C$. Outward ring → radial
eruption (crystal shard, snugstone). Central diameter-spanning column ($w \approx 0$) →
flat directed shot (flame shot).

**[open — unopposed convergence]** A _single_ inward sign at the rim gets
$C = \lambda w > 0$ under this law and lifts at up to 45°, even though nothing opposes
it. The alternative (only _cancelled_ flux converts to vertical, i.e. the original
"clash bookkeeping" $V = S - |\mathbf P|$ with a divergence discriminator) keeps a lone
sign purely lateral. No canon distinguishes them; flame shot's true seal has its column
applied at $w \approx 0.6$–$0.75$, so the flux law predicts a diagonally _rising_ flame
(which arguably matches the panel — Coco shoots upward at a flying leech). Kept as flux
law **[agreed]**; revisit if it feels wrong in the sim.

**Dispersion sign** = column vector + a temporal envelope: same contribution to
$(S, \mathbf P, C, \Gamma)$, but the budget is spent as a slow leak (lower rate, longer
duration) instead of a burst. **[agreed]** (temporal envelope not yet in the steady-state
sim).

## 5. Region signs — fences, governance, exhaust **[agreed]**

Region signs contribute **zero momentum** — they never enter $(S, \mathbf P, C, \Gamma)$.
They constrain _where the spell's own magic may exist and move_. Own-magic only: they do
not block foreign matter. **[agreed]**

**Parsing.** Each chevron yields position $\mathbf p_i$ and apex direction $\hat u_i$.
Size has no assigned role yet **[open — no canon]**.

**Direction classes.** Signs cluster into classes $d$ of near-parallel $\hat u$
(threshold ≈ 25°). An opposed pair is two classes. Each class carries:

- a **fence** — the boundary of its allowed half:
  - _planar_ class (general $\hat u$): line through the **rearmost** member,
    allowed side $\{\mathbf x : \mathbf x \cdot \hat u_d \ge b_d\}$,
    $b_d = \min_i \mathbf p_i \cdot \hat u_d$. **[agreed — the "R5 ruling"]**
  - _radial ring_ (≥2 radially aligned chevrons of the same sense, spread over ≥60° of
    azimuth): they fuse into one curved fence following the circle $\rho = \rho_d$
    (mean member radius); inward-pointing allows $\rho \le \rho_d$, outward allows
    $\rho \ge \rho_d$. Curved fences are a **collective** property — a _lone_ radially
    aligned chevron stays a straight shutter (demo R2: a rim chevron channels the flow
    laterally, it does not collimate). Rim pinch pairs keep per-sign curvature (the
    ring-band of floating drops).
  - classes whose members all sit near the center are **global** and use planar fences
    through the center (the "pin": crossed pairs collapse manifestation to a point).
- a **stage count** $n_d$ (member count). Staging is how extra aligned ink pays off
  **[agreed]**: gate hardness $k_d \propto n_d$, channeling bias grows with $n_d$, and
  total reach is boosted:
  $\text{reach} = 1 + \beta \sum_d (n_d - 1)$, $\beta$ **[tunable]**.

**Governance** (which classes act where): azimuthal Voronoi by _nearest member sign_,
with a tie window (≈25°) so co-located opposed pairs both govern; global classes govern
everywhere; points near the axis are governed by all classes. **[agreed]**

**Mask (manifestation region).** At a point $\mathbf x$ (horizontal projection), with
$\sigma$ the logistic function and $k_d = k_0 n_d$:

$$
m(\mathbf x) \;=\; \prod_{d \,\in\, \text{governing}(\mathbf x)}
\sigma\!\big(k_d \cdot s_d(\mathbf x)\big),
\qquad
s_d = \begin{cases}
\mathbf x \cdot \hat u_d - b_d & \text{planar} \\
\rho_d - \rho & \text{radial-in} \\
\rho - \rho_d & \text{radial-out}
\end{cases}
$$

Magic (spawning, in the sim) is weighted by $m(\mathbf x) \cdot \text{prox}(\mathbf x)$,
where prox is 1 on the disk and decays just outside it — this is exactly the "red
region" of the demo diagrams, including the all-outward annulus that relocates the
source _outside_ the ring.

**Exhaust (velocity gating).** Region acts on moving magic like a one-way louver, applied
along the trajectory (transport does the global work — collimation _emerges_ from
repeated local clipping as particles cross sectors):

for each governing class, with $\hat u_{\text{eff}}$ = class direction (planar) or
$\pm\hat\rho(\mathbf x)$ (radial):

1. **Clip**: remove the backward component,
   $u \leftarrow u - \min(0,\, u \cdot \hat u_{\text{eff}})\, \hat u_{\text{eff}}$.
2. **Bias**: add channeling push $\;u \mathrel{+}= \beta_{\text{ch}}(n_d)\,|u_0|\,\hat u_{\text{eff}}$.
3. **Conserve**: rescale to the pre-gate speed $|u_0|$ (the pressure-box principle: the
   blocked budget re-exits through what is open). If fully blocked, exhaust vertically
   ($+\hat z$ is the one direction no in-plane chevron can forbid).

Consequences reproduced by this single rule + transport: all-inward → collimated
vertical column; single side gate → lateral channel; all-outward → outward moat fan;
opposed ring → rising curtain on the ring line; stacked gates → harder, farther beam
(flame shot's "confine and extend"); half-ring gates on a column jet → diagonal surge
(rising wave).

**Constraint vs drive** **[agreed]**: column is an engine, region is a valve, and they
compose rather than conflict. A gate opposing a column jet vetoes the direction; the
column's budget still spends, re-exiting through the open cone (e.g. a south-driving
column against a north-pointing gate yields an up-and-north fountain). Contradictory
seals waste ink, not casters — no crash. The same seal geometry with a column vs a
chevron differs only in power: the column version is a fast jet, the chevron version a
gently channeled burst.

## 6. Levitation signs — the force pair **[agreed]**

**Parsing.** The levitation glyph is a column with an arrowhead (tail crossbar, stem,
arrow tip — `icons/levitation.svg`). Parse identically to column: application point
$\mathbf p_i$ = stem ∩ tail crossbar, direction $\hat u_i$ toward the arrowhead,
length $\lambda_i$ = stem. Same flux decomposition, into a **separate budget**:

$$
L = \sum_i \lambda_i \qquad
\mathbf P_{lev} = \sum_i \lambda_i \hat u_i \qquad
C_{lev} = -\sum_i \lambda_i w_i\,(\hat u_i \cdot \hat r_i) \qquad
\Gamma_{lev} = \sum_i \lambda_i w_i\,(\hat u_i \cdot \hat t_i)
$$

Levitation contributes **nothing** to the column aggregates $(S, \mathbf P, C, \Gamma)$.
The symmetry: **column couples the sign budget to the element flow; levitation couples
it to bodies** — same vector algebra, different target.

**The law [agreed — ruling: force pair, not a sigil switch].** Levitation creates a
force pair between the seal's **substrate** (what it is drawn on) and the **mass
occupying the zone above the seal** — the spell's own manifestation plus payload
bodies:

- **Hold channel.** $C_{lev} > 0$ (cancelled flux, same clash rule as column) is the
  grip: a **damped spring** anchored at the hover locus
  $X_0 = (-s\,\mathbf P_{lev},\ h_0)$. Restoring both ways — it supports weight from
  below and recaptures escape from above.
- **Rest length ∝ sign length [agreed — ruling].** $h_0 = H_{lev}\,\bar\lambda$, with
  $\bar\lambda = L/N$ the mean stem length: keeping the held mass constant, longer
  signs place it further out — the spring reading of `Lev_Diagram`. Load compresses
  the spring toward the seal; **weight capacity** (before the blob bottoms out)
  $W_{max} \propto \eta R^2\, C_{lev}$. This _is_ the canon "sign size ↔ weight
  capacity" ($\lambda$ enters $C_{lev}$ linearly), with ring area as the extensive
  factor per §2. (Canon's "sigil size ↔ effect power" exception stays unmodeled,
  §12.) $H_{lev}$, $s$ **[tunable]**.
- **Lateral channel.** $\mathbf P_{lev}$ orients the pair: the substrate is thrust
  along $+\hat P_{lev}$ **[canon — skysoaring; anime confirms movement in the arrow
  direction]**, so the zone mass receives $-\hat P_{lev}$, and a held blob hovers
  displaced by $-s\,\mathbf P_{lev}$. The displacement _sign_ is **[open — no canon]**:
  every attested hold-mode seal is balanced. It is fixed here by pair consistency with
  skysoaring (note: this flips the $+\hat P_{lev}$ guess in the original proposal —
  the tepee/strut intuition would push the locus the other way, but it predicts
  backward skysoaring thrust, so it loses).
- **Torque.** $\Gamma_{lev}$ exchanges angular momentum: held mass spins about the
  hover axis. A levitation pinwheel is a **rotor** (prediction).

**Modes are element properties, not two spells [agreed].** The wiki's "two functions
depending on the sigil" is a confounded sample — every hold-mode example is a balanced
ring on an immovable substrate, every thrust-mode example is wind. What actually
differs is whether the pair can _grip_ the manifestation:

- **Fire / water / light** (earth and crystal presumed) manifest a holdable blob →
  gripped together with payload and held at $X_0$; the reaction sinks the held weight
  into the substrate — a pyreball on a hand-held page is a tray. Pyreball ✓,
  wall-anchored floatglow lamp (the lamp-top payload is physically held aloft) ✓.
- **Wind** is ambient fluid streaming through the grip → sustained pumping. Wash along
  $C_{lev,+}\hat z - \mathbf P_{lev}$ (out of the ink face, opposite the lateral
  arrows); reaction thrust on the substrate along
  $\mathbf P_{lev} - C_{lev,+}\hat z$ (into/behind the ink face). Skysoaring (spanning
  arrow → forward thrust) ✓; sylph shoes (balanced ring on the sole, ink facing down →
  wearer pushed up) ✓; predictions: a ground-mounted wind-levitation ring is a **fan**
  (updraft wash, ground pressed down), a levitation pinwheel with wind is a rotor.

This is the first crack in strict element equivalence (§1): a per-element **grip**
flag (`ELEMENT_GRIP` in the sim), not per-element laws.

**Burst suppression is emergent [agreed — ruling].** No explicit rule: the spring is
off inside the blob radius $r_b$ (the ball keeps room to churn) and outcompetes the
burst beyond it, so burst-launched magic is recaptured into a stable churning ball.
The capture zone always spans the whole zone above the seal — the plateau reaches the
rim however high the locus sits — otherwise a far-hovering ball's grip loses to the
burst near the plane and sprays a skirt. $r_b$, grip speed **[tunable]**.

**Fill to capacity [agreed — ruling 2026-07-02].** The grip _sustains_ held magic (no
dissipation inside the blob), so the disk's feed accumulates in the ball; once the
held mass reaches the weight capacity $W_{max} \propto \eta R^2 C_{lev}$ the seal
stops manifesting. The visible spell is a brief fill transient, then just the
suspended ball — this supersedes the earlier "continuously fed from the disk"
reading. Capacity per unit $C_{lev}$, held-age rate **[tunable]**.

**Deferred [agreed — ruling].** v1 simulates the element blob only; the payload sphere
(making $W_{max}$ visible; canon use is cooking yams) is a later chapter, as is the
movable substrate that skysoaring properly needs — the honest interim is a
thrust-vector readout. Rising platform of water stays parked with its outward-column
puzzle. Caveat: a lone seal-spanning levitation arrow inherits §4's
unopposed-convergence question ($C_{lev} = \lambda w > 0$ tilts its wash); kept
symmetric with the column ruling.

## 7. Pull signs — the ambient coupling **[agreed]**

**Parsing.** The pull glyph is an arrow with a hollow triangular head and a chevron
tip, and no tail crossbar (`icons/pull.svg`). Application point $\mathbf p_i$ = the
**tail end**, direction $\hat u_i$ = tail → tip (the way the arrow points), length
$\lambda_i$ = the full tail-to-tip length. **[agreed — ruling]** Uniform with §4/§6:
every directional sign applies at its rear end and points along its arrow. Same
in-plane units and radial weight $w_i$ as §4.

**The third coupling.** Column couples the sign budget to the spell's own element
flow (§4); levitation couples it to bodies (§6); **pull couples it to ambient matter
of the seal's element** — matter already in the environment **[canon: "anything
matching its seal's sigil… pulled towards the seal"]**. Separate budget, same algebra:

$$
K = \sum_i \lambda_i \qquad
\mathbf P_p = \sum_i \lambda_i \hat u_i \qquad
C_p = -\sum_i \lambda_i w_i\,(\hat u_i \cdot \hat r_i) \qquad
\Gamma_p = \sum_i \lambda_i w_i\,(\hat u_i \cdot \hat t_i)
$$

Pull contributes **nothing** to $(S, \mathbf P, C, \Gamma)$ or the levitation budget.
**Own manifestation is exempt [agreed — ruling]:** the field acts only on the
_ambient_ population — otherwise grasping wind swallows its own burst and flame
burst's beam collapses back into its own ring (canon shows pull and column
coexisting on one ring). Population tags never change; ambient matter delivered to
the seal stays ambient.

**Pull-only seals manifest nothing [agreed — ruling 2026-07-03].** A seal whose
only budget-bearing signs are pull does not manifest its own element at all: no
shockwave, no own population — the whole output is spent on the ambient coupling
(the seal runs in pure _manipulate_ mode; cf. §1's create-vs-manipulate note).
Column or levitation signs on the same ring restore manifestation — flame burst's
column fires its beam while the pull inhales **[canon: coexistence]**. Region and
convergence do **not** restore it: the valve and the lens act on whatever the seal
emits (here the ambient field, per the field-gating and seal-wide-lens rulings)
and manifest nothing themselves — a vacuum snout and a focused intake stay silent.
So grasping wind is pure intake: ambient air streaming to a seal that emits no
wind of its own.

**The ambient field.** Pull drives a velocity field acting only on ambient E-matter:

$$
u_{\text{amb}}(\mathbf X) = U_P \Big[
-\,C_p\;\hat b(\mathbf X)\,\phi_{\text{burst}}
\;+\; |\mathbf P_p|\,\hat P_p\,\phi_{\text{slab}}
\;+\; \Gamma_p\,\hat t\,\phi_{\text{swirl}}
\Big]
$$

- **Sink = reversed burst.** $\hat b$ is §3's hemispherical fan direction. $C_p > 0$
  (arrows inward) reverses it: inflow converging onto the disk — vertical on-axis,
  lateral near the plane. $C_p < 0$ (inverted signs) is the same kernel un-reversed:
  **push** **[agreed — ruling: signed kernel, not a planar fan]**. Pull's convergence
  has **no clash** — arriving momentum is eaten by the grasp — so push is the sink's
  exact time-reverse (the wiki fan diagram draws the two modes as mirrors). Column's
  plane-hugging divergence fan came from clash bookkeeping that pull doesn't have.
- **Lateral drag.** A slab through the seal along $\pm\hat P_p$; matter inside is
  carried along $+\hat P_p$ — caught upstream, carried across, delivered downstream.
- **Twist.** Swirl about the axis, sense = sign of $\Gamma_p$. The wiki diagram's
  margin notes are the flux law verbatim: pull weakens as the cosine of the slant,
  twist grows as the sine, effects turn the way the arrows point, 90° = pure twist.

**Twist is a vortex column, not a flat stir [agreed — ruling].** $\phi_{\text{swirl}}$
is a Rankine column with the secondary cell every real vortex carries: tangential
flow solid-body inside a narrow core that flares with height, boundary-layer inflow
along the floor feeding a rising updraft on the funnel wall, and an out-and-down
spill at the crown that closes the cell — matter cycles through the whirl instead of
riding a merry-go-round. Crown height grows with $|\Gamma_p|$ (saturating), core
widths ÷ $F$, speeds × $F$ (§8). This is what makes the apple-plucking vortex lift
(canon: slanted pulls raise fruit through the air, not around it) and a tangential
pinwheel a standing tornado of ambient matter — while storing nothing: the grasp
capacitor still charges only through the sink (stirred-cup unchanged). The own-magic
swirl channel (§4) shares the same structure — §13's pinwheel row manifests a vortex,
not a spinning disk. Heights, radii, cell gains **[tunable]** (`TWIST_*`, vortex.ts).

**Region gates the field, not the matter [agreed — ruling].** $u_{\text{amb}}$ is the
spell's own magic acting at a distance, so it passes the §5 exhaust pipeline
(clip → bias → conserve) like any own-magic velocity; the **mask never applies to
foreign matter** (§5's letter stands — a fence is not a wall to a rock, and ambient
tracers are never absorbed by masks). Consequence: pull + region composes exactly
like column + region — a chevron barrel on a pull ring is a **directional intake**
(vacuum snout) inhaling only through the open cone, with staged hardness and reach
(prediction).

**The grasp — charge to capacity [agreed — ruling].** Arriving matter stagnates
against the disk wall into a pooled cushion (emergent: sink kernel + wall; the one
legislated bit is that grasped matter stops aging). The grasp is a **capacitor**:
grasped mass counts against a capacity $G_{max} \propto \eta R^2\, C_{p,+}$ and the
**sink channel** throttles by the remaining fraction — it charges fast, then the
intake dies away as material gathers. Self-limiting; mirror of §6's fill-to-capacity.
Only the sink throttles: it is the channel that stores. The twist and the conveyor
move matter without storing it and keep acting on a charged grasp (the stirred-cup
keeps stirring; a near-tangential pinwheel's sliver of capacity would otherwise
charge instantly and silence its own swirl). Push mode gathers nothing and never
self-limits; a pure lateral conveyor passes matter through without pooling and also
runs indefinitely. $U_P$, envelopes, capacity per unit $C_{p,+}$ **[tunable]**.

**Reaction [agreed — ruling].** The pair is real: the substrate is yanked toward the
grasped matter (an oversized grasping wind exerts tree-uprooting force, braced by the
caster — the §6 tray reading, pointed the other way). In the sim the seal is anchored
to immovable ground, so the reaction sinks into the anchor — unmodeled. Movable
substrates remain one future chapter shared with skysoaring.

**Ambient medium [agreed — ruling].** Every element exists as a **thin ambient
medium** seeded through the domain (the medium is visible even when nothing pulls),
density **[tunable]**. Ambient tracers feel only $u_{\text{amb}}$ (never
burst/jet/fan/swirl/lev); own tracers never feel $u_{\text{amb}}$.

**Scaling.** §2 unchanged: ambient inflow speed is intensive ($\propto$ budget),
total drag force extensive ($\propto \eta R^2$). Grasping wind's uprooted tree — the
§2 anchor — is now natively modeled.

**Canon checks.** Grasping wind (wind + inward pull ring): ambient air streams to the
seal, light payloads ride the current ✓ (payload bodies deferred, §12). Slanted
signs: helical inflow, twist sense = arrow turn — the apple-plucking vortex ✓.
Wall bend (earth + two parallel pulls): ambient earth dragged along the arrows
relative to the seal ✓ (its extra signs unmodeled). Flame burst: pull and column
coexist on one ring without interference (decoupled populations) — the column
restores the manifestation the pull-only rule suppresses ✓; its air-as-fuel
reading is cross-element combustion, parked. Water cage's lone-sign shove is a
**linked two-seal spell — out of scope**: linking may carry its own rules (§12).
A lone pull sign inherits §4's unopposed-convergence caveat, kept symmetric.

## 8. Convergence signs — the lens **[agreed]**

**Parsing.** The convergence glyph is a closed **regular** triangle
(`icons/convergence.svg`). Size $\lambda_i$ = side length in seal units, position =
centroid. **Orientation is ignored [agreed — ruling]:** the equilateral glyph is
120°-symmetric, so an "apex direction" is only defined modulo rotation — inward vs
outward vs slanted readings blur into each other, and no mirrored canon
distinguishes them (the wiki's "semi-directional" call rests on the wall-of-wind
panel, not in our mirror — parked, §12). Position enters nothing either: focus is a
property of the whole seal, the triangles just have to be _somewhere_ on it.

**The budget.** $Q = \sum_i \lambda_i$, one-sided ($Q \ge 0$; there is no
anti-focus configuration). Convergence contributes nothing to the column,
levitation, or pull budgets — and unlike those three it is **not a coupling**: no
force pair, no reaction, no capacity, no momentum. It is the first **modifier**
sign. The grammar: column = engine, region = valve, levitation = spring, pull =
ambient coupling, **convergence = lens** on whatever the rest of the seal does.

**The law [agreed — ruling: lens, not a focal spring, not a spawn pin].** The
focus factor

$$F = 1 + k_F\, Q \qquad k_F\ \textbf{[tunable]}$$

tightens every field the seal emits: envelope **widths** (jet tube, divergence
fan, swirl, levitation blob and capture ramp, wash tube) are divided by $F$, and
the **burst is refracted** toward the emission axis _line_ by $Q$ (reusing §3's
one-budget steering; rays converge toward the axis like light through a lens —
a focused bare ring is a narrow rising plume, a candle flame, not a merely
collimated brush, not an isotropic leak, and not a point source). **Speeds rise with $F$**:
the same budget through a narrower throat (the §5 pressure-box principle,
applied radially). Reach is _not_ extended — throw belongs to region staging
(§5); open in §12.

**Seal-wide scope [agreed — ruling].** The lens also focuses the ambient field
$u_{\text{amb}}$ (§7) — it is the spell's own magic acting at a distance, exactly
the §5/§7 precedent — so a focused pull ring inhales through a narrower, more
axial throat. Focus shapes _everything the seal emits_; it still never touches
another seal's fields or foreign matter.

**Rigidity [agreed — ruling].** Focused magic "packs tightly together and
becomes somewhat rigid" **[canon — the SBOS design session, ch. 7]**: inside the
packed manifestation, tracer velocities relax toward the local mean at a rate
$\propto Q$ **[tunable]** — the blob moves as one body instead of a swarm. This
is what turns the pyreball's churn into the floatglow lamp's steady glow, and a
breeze into the sylph shoes' load-bearing strut.

**Excluded volume [agreed — ruling; global mechanic].** Introduced with this
chapter but active on **every** seal: manifested magic _occupies volume_.
Tracers repel at short range (a density pressure), so packing can never collapse
to a point, and a held ball keeps the size its content dictates rather than
being squeezed indefinitely by its spring (this also fixes the waterball's slow
squish). Convergence packs _against_ this floor — focus raises density toward
the incompressible limit, it does not defeat it. Repulsion radius and strength
**[tunable]**.

**Composition.**

- **With levitation [agreed]:** blob radius shrinks by $F$, churn is damped, but
  $W_{max}$ is untouched (capacity belongs to $C_{lev}$, §6): the ball gets
  smaller, denser, steadier — the pyreball → floatglow-lamp contrast, and why
  both attested convergence seals alternate it with levitation. With wind, the
  wash tube narrows and stiffens at the same thrust readout (sylph shoes).
- **With region:** orthogonal — region rules _where_ magic may exist and move,
  convergence _how tightly it is packed_; gating applies after focusing.
- **No dud:** with nothing else on the ring the lens still acts (the burst is
  itself an emission). Convergence-only seals are weak but never contradictory.

**Canon checks.** Wall-anchored floatglow lamp (light + lev ring + conv ×4):
compact, steady held orb — the lamp-grade delta levitation alone can't produce ✓.
Sylph shoes (wind + alternating lev/conv): narrow rigid wash column bearing the
wearer ✓ (movable substrate still deferred). SBOS packing line ✓ in element
analog (foreign sand belongs to the bodies chapter). Prediction: columns +
convergence = tighter, faster jet — the ancient light beacon's rim triangles, if
that reading survives.

## 9. Orb signs — the vessel **[agreed]**

**Parsing.** The orb glyph is a circle with a line through it (`icons/orb.svg`);
the line overshoots the circle on both sides. **Non-directional [canon: wiki
class]**: the attested seal draws the line at 45°, the icon vertical —
orientation is ignored, and position is ignored too (a whole-seal property,
like convergence). $\lambda_i$ = circle **diameter** in seal units; budget
$O = \sum_i \lambda_i$, one-sided. Orb contributes nothing to the column,
levitation, or pull budgets. **[agreed — ruling 2026-07-04]**

**The law [agreed — rulings 2026-07-04].** Grammar: column = engine, region =
valve, levitation = spring, pull = ambient coupling, convergence = lens,
**orb = vessel** — a one-way spherical boundary of radius
$r_{orb} = k_O\, O / F$ ($k_O$ **[tunable]**; the lens shrinks the vessel, §8)
that holds the sigil's element. Second member of the manipulate-mode family
(§3, §7). Four rulings:

1. **Universal containment — the shell is population-blind.** Any E-matter
   tracer crossing the shell inward is contained: own magic and ambient alike
   (the first mechanic that ignores population tags). Canon's "material will
   only collect if it is added in directly" holds _because orb seals manifest
   nothing_ (ruling 3), not because the shell reads tags. Non-E matter passes
   untouched (pull's sigil-match precedent; payload bodies stay a later
   chapter). The shell is geometry, not a field — region exhaust never
   applies to it (it is the disk wall's cousin, not an emission).
2. **Column is re-read as placement — no jet.** On an orb-bearing seal the
   column aggregate $\mathbf A = \mathbf P + C_+\hat z$ never fires; it
   **aims the vessel** instead — §3's principle survives: $\mathbf A$ is
   always the seal's aim; with a flow it steers the flow, with a vessel it
   parks the vessel. Sphere center at height $h = r_{orb} + H_O\, C_+$
   (tangent to the disk by default; columns lift it — the height reading of
   `Orb_Diagram`; $C < 0$ **clamps** at tangent), displaced laterally by
   $s_O \mathbf P$ **along $+\hat P$** (the aim reading: the vessel parks
   where the jet would have gone — note this is the _opposite_ sign of the
   levitation hover displacement, chosen by a different analogy; no canon,
   the attested seal is balanced). Captured $\Gamma$ **stirs** the contents:
   solid-body swirl about the vessel axis. $H_O$, $s_O$, stir rate
   **[tunable]**.
3. **Manipulate mode.** An orb-bearing seal emits no burst and manifests no
   own element — the entire output is the boundary (extends the pull-only
   ruling 2026-07-03). Column does **not** restore manifestation here — the
   vessel captures its budget (contrast §7, where a column on a pull ring
   fires). Pull coexists and composes (see below); levitation is **[open —
   §12.14]**.
4. **Gravity is local law.** Contained tracers feel a settle velocity $g_O$
   **[tunable]** and rest on the shell; the §8 excluded volume does the
   pooling, so canon's **bottom-up cup filling is emergent** ("still affected
   by gravity… like a bucket or a cup"). No global gravity: the ambient
   medium stays a floating suspension. The pour is a demo **boundary
   condition** — a scripted spawner whose stream of ambient tracers carries
   a downward drive until contained (rate, speed **[tunable]**) — not world
   physics.

**Shell mechanics.** One-way membrane: inward crossings are free; from
inside, the outward normal velocity component is clipped at the boundary
(the disk-wall primitive). Contained matter **stops aging** (grasp/hold
precedent). **Capacity is geometric and emergent**: excluded volume sets the
packing density, a full sphere has no room — new arrivals are rejected at
the packed surface and shed down the outside. No capacity constant;
self-limiting like the §6 fill and the §7 capacitor, but for free.

**Scaling (§2).** All lengths in seal units, so the sphere scales with $R$
and capacity goes as $R^3$ — the first extensive exponent above 2. Noted,
not legislated **[open — no canon]**.

**Composition.**

- **+ pull**: the intake delivers ambient E-matter through the shell — a
  **self-filling canteen** (prediction). Shell-caught matter **counts
  against the grasp capacity $G_{max}$** (the shell is a raised grasp), so
  the intake throttles as the cup fills — self-limiting. **[agreed —
  ruling 2026-07-04]**
- **+ convergence**: envelope widths ÷ $F$ → $r_{orb}/F$, a smaller, denser
  cup; the speed boost has nothing to act on (prediction).
- **+ region**: an orb seal emits no own-magic velocity, so fences have
  nothing to gate — orthogonal (they still gate a coexisting pull field:
  a directional canteen).
- **+ levitation**: unattested (a cup that also grips its contents — a
  thermos); **parked, §12.14**.

**Canon checks.** Water Orb (ch. 53: inverted water sigil + 2 balanced
columns + 4 orbs; Qifrey pours water in): silent seal, invisible sphere
lifted by the columns' $C_+$, poured water contained, pooling bottom-up,
held indefinitely ✓. The inverted sigil is discounted (no known effect,
sigil geometry out of scope §1).

## 10. Composed velocity field (as implemented)

World frame: seal plane = $xz$, up = $y$; seal 2D coords map $(x, y_{2D}) \to (x, z)$.
Given the compiled nozzle $(S, \mathbf P, C, \Gamma, \text{gates}, \text{reach})$, at a
point $\mathbf X$ with height $h$, horizontal radius $\rho$, horizontal units
$\hat\rho, \hat t$:

$$
u(\mathbf X) = \underbrace{u_{\text{burst}}}_{\text{§3}}
\;+\; \underbrace{U_C\,\big|\mathbf A\big|\,\hat d\,\;\phi_{\text{jet}}(\mathbf X)}_{\mathbf A = (\mathbf P,\, C_+),\ \hat d = \mathbf A / |\mathbf A|}
\;+\; U_C\, D\,\hat\rho\,\;\phi_{\text{fan}}(\mathbf X)
\;+\; U_C\, \Gamma\,\hat t\,\;\phi_{\text{swirl}}(\mathbf X)
\;+\; u_{\text{lev}}(\mathbf X)
$$

where the levitation term (§6) depends on the element's grip: for holdable elements a
spring toward the hover locus plus spin,

$$
u_{\text{lev}} = U_H\, C_{lev,+}\,\;g\big(|\mathbf X - X_0|\big)\,\widehat{(X_0 - \mathbf X)}
\;+\; U_H\, \Gamma_{lev}\,\hat t_{X_0}\,\;\phi_{\text{spin}}(\mathbf X)
$$

with $g$ zero inside the blob radius, full through the capture zone, decaying beyond
(the emergent-recapture profile); for streaming wind, a jet-like wash tube along
$\mathbf W = C_{lev,+}\hat z - \mathbf P_{lev}$. Then region gating (§5), then the disk
wall ($u_y \ge 0$ when $h \approx 0,\ \rho < 1$).
Envelopes $\phi$ are smooth tube / slab / rim profiles with ranges scaled by
$\text{reach}$; convergence divides their **widths** by $F$, multiplies speeds by
$F$, and pinches the burst toward the emission axis (§8). All constants live in
`sim/src/config.ts` **[tunable]**.

Particles are passive tracers: $\dot{\mathbf X} = u(\mathbf X)$, spawned with density
$m \cdot \text{prox}$, absorbed when they wander into $m \approx 0$ (behind a fence).
Tracers churning inside a held blob stop aging and count toward the ball's fill;
the spawn rate throttles by the remaining capacity (§6 fill ruling).
Two §8 mechanics live in **transport**, not the field (they are population-level,
so single-path traces cannot see them): the excluded-volume pressure (short-range
tracer repulsion, every seal) and rigidity (velocity relaxation toward the local
neighbourhood mean at rate $\propto Q$). The §9 vessel lives there too, and it is
**population-blind**: inside the shell every E-matter tracer feels the settle
velocity and the stir; at the boundary the outward normal component is clipped
(one-way); contained tracers stop aging. Under a vessel the ambient population
also runs the excluded-volume pass — pooling and the geometric capacity are
population effects.

A second, decoupled tracer population carries the **ambient medium** (§7): seeded
thinly everywhere, advected by $\dot{\mathbf X} = u_{\text{amb}}(\mathbf X)$ — passed
through the same exhaust gating (the mask never applies and ambient tracers are never
absorbed), scaled by the grasp throttle $(1 - \text{grasped}/G_{max})$. Ambient
tracers stagnating on the disk become the grasped pool: they stop aging and count
toward the charge. Own tracers never feel $u_{\text{amb}}$; ambient tracers never
feel the own-magic terms. A pull-only seal (no column, no levitation) emits no
own-magic field and spawns no own tracers at all — $u(\mathbf X) \equiv 0$, the
ambient population is the entire spell (§7 manifestation ruling). An orb-bearing
seal is silent the same way — its column aggregates are captured by the vessel
(§9), so the contained ambient population (poured or inhaled) is the spell.

## 11. Scorecard

| Case                           | Construction                                | Model output                                                                               | Anchor                                      |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Blank ring                     | —                                           | hemispherical burst                                                                        | canon (shockwave)                           |
| Watershot / light beam         | balanced inward columns                     | vertical jet, speed ∝ S                                                                    | canon                                       |
| Coco's misfire                 | one longer column                           | jet tilts where the long sign points                                                       | canon image                                 |
| Lone rim column                | one inward sign at the rim                  | single steered flow — rear magic folds into the ~40° jet, no backward leak                 | agreed (§3: one budget, steered)            |
| Flame shot                     | central column + 2×5 forward chevrons       | flat-ish forward beam, collimated, extended reach                                          | canon (see §4 open)                         |
| Crystal shard / snugstone      | outward (inverted) columns                  | radial eruption / gentle spread                                                            | canon                                       |
| Pinwheel                       | tangential columns                          | vortex                                                                                     | prediction                                  |
| Region all-inward              | 4 inward chevrons                           | whole disk, collimated up                                                                  | wiki demo L1                                |
| Region all-outward             | 4 outward chevrons                          | annular moat, outward fan, empty interior                                                  | demo L2                                     |
| Opposed pairs on ring          | 4 in+out pairs                              | rising curtain on the ring                                                                 | demo L3, floating drops                     |
| Pairs across the middle        | 4 pairs on a diameter                       | rising curtain on the line                                                                 | demo L4                                     |
| Center pin                     | crossed opposed pairs at center             | point-source vertical beam                                                                 | demo L5                                     |
| Single shutter                 | one chevron at depth $t$                    | source clipped to the front of its line, lateral channel                                   | demo R2–R4                                  |
| Shutter + stage                | aligned pair (rim + deep)                   | full-disk source, harder/farther channel                                                   | demo R5 ruling                              |
| Rising wave                    | balanced columns + half-ring chevrons       | diagonal surge                                                                             | canon (orientation to verify)               |
| Water bolt                     | one-sided chevrons (+ bolt)                 | fast lateral channel                                                                       | canon                                       |
| Pyreball                       | fire + 4 inward lev arrows on the diagonals | churning ball held at $h_0$: fills from the disk, feed stops at capacity                   | canon + fill ruling                         |
| Waterball, long signs          | same seal, water, stems ×1.6                | same ball, hovering higher ($h_0 \propto \bar\lambda$), fills then stops                   | agreed (§6 spring + fill rulings)           |
| Skysoaring (interim)           | wind + one spanning lev arrow               | wash streams opposite the arrow; substrate thrust readout along it                         | canon (anime); movable seal deferred        |
| Wind lev ring                  | wind + balanced inward lev arrows           | vertical fan updraft, downward thrust readout                                              | prediction (sylph-shoes analog)             |
| Grasping wind                  | wind + 4 inward pull                        | ambient air streams to the seal, pools; no own shockwave; intake dies as the grasp charges | canon + capacitor & manifestation rulings   |
| Grasping wind, slanted         | same, signs slanted                         | helical ambient inflow, twist turning the way the arrows point                             | canon + wiki diagram                        |
| Pull pinwheel                  | 4 tangential pull                           | flat ambient swirl, zero net inflow, nothing manifests                                     | wiki diagram + manifestation ruling         |
| Repel ring                     | 4 inverted (outward) pull                   | hemispherical ambient push — up on axis, lateral near the plane; no self-limit             | wiki ("likely pushes") + diagram            |
| Vacuum snout                   | inward pull ring + chevron barrel           | one-sided staged intake through the open cone                                              | prediction (§7 field-gating ruling)         |
| Earth conveyor                 | 2 parallel pull signs                       | ambient earth dragged along the arrows across the seal                                     | canon (wall bend, loose)                    |
| Flame burst                    | central fire column + 4 inward pull         | jet fires while ambient matter is inhaled — the column restores manifestation              | canon (coexistence)                         |
| Floatglow lamp (wall-anchored) | light + 4 inward lev + 4 conv               | held ball, smaller/denser/steady vs pyreball; same capacity                                | canon + lens ruling                         |
| Sylph strut                    | wind + alternating lev/conv ring            | wash tube narrowed, stiffened; thrust readout unchanged                                    | canon (sylph shoes)                         |
| Bare focus                     | fire + 4 conv only                          | burst pinched into a candle plume — no hold, no point leak                                 | lens ruling (vs focal-spring reading)       |
| Focused watershot              | inward columns + 4 conv                     | tighter, faster vertical jet                                                               | prediction (light-beacon rhyme)             |
| Conv orientation               | same seal, triangles rotated                | identical output                                                                           | ruling (orientation ignored, 120° symmetry) |
| Focused intake                 | inward pull ring + 4 conv                   | narrower, more axial ambient inflow                                                        | prediction (§8 seal-wide lens)              |
| Water Orb                      | 2 balanced columns + 4 orbs + pour          | silent seal; invisible sphere lifted by C₊; poured water contained, pools bottom-up, held  | canon ch. 53 + §9 rulings                   |
| Bare cup                       | 4 orbs + pour                               | sphere tangent to the disk, cup fills on the seal                                          | §9 (tangent default)                        |
| Lopsided cup                   | one column + 4 orbs + pour                  | sphere displaced along +P̂ and lifted                                                       | prediction (aim reading, no canon)          |
| Self-filling canteen           | 4 orbs + inward pull ring                   | ambient inhaled into the shell; intake throttles as the cup fills                          | prediction + ruling (shell = raised grasp)  |
| Stirred cup                    | 4 orbs + column pinwheel + pour             | captured Γ swirls the contents                                                             | prediction (whole aggregate re-reads)       |
| Focused cup                    | 4 orbs + 4 conv + pour                      | smaller, denser cup (r ÷ F)                                                                | prediction (§8 widths ruling)               |
| Overfill                       | thimble orbs + big pour                     | full shell rejects arrivals — spill sheds outside                                          | §9 (emergent geometric capacity)            |

Parked for the next chapters: rising platform of water (incl. its outward-column
puzzle), payload bodies + movable substrates (levitation thrust and the pull yank
share the chapter), linked seals (water cage's cross-seal pull), temporal envelopes
(dispersion duration), quality $\eta$, create-vs-manipulate distinction.

## 12. Open questions

1. Unopposed convergence (§4): flux law vs clash bookkeeping for lone off-center
   signs (inherited by levitation and pull).
2. Region sign **size**: hardness? governance width? (no canon)
3. Exact chevron orientation in the Rising Wave panel.
4. Constants: everything in `sim/src/config.ts` is a first guess to be tuned by eye
   against the manga panels.
5. Levitation hover displacement for unbalanced hold seals: magnitude and sign of
   $-s\,\mathbf P_{lev}$ (§6 — sign fixed only by pair consistency, no canon).
6. Outward-pointing levitation arrows: $C_{lev} < 0$ grips nothing under §6 — does
   canon ever show one?
7. Canon's "sigil size ↔ levitation effect power" — the one attested exception to
   sigil-size irrelevance (§1); unmodeled.
8. Grasp discharge (§7): canon never shows a grasp releasing or overfilling;
   capacity and charge-rate constants are invented **[tunable]**. Does grasped
   matter leak back into the medium when the seal is lifted? (Shared by the
   orb vessel, §9 — contained water must go _somewhere_ when the seal lifts.)
9. Fully-fenced pull (§7): the conserve step exhausts inhaled matter vertically —
   the pressure-box principle applied to the pull field. Plausible, unattested.
10. Convergence orientation (§8): the wiki classes the sign semi-directional on
    the wall-of-wind panel (not mirrored locally); the model ignores orientation
    entirely (120° symmetry ruling) and has no anti-focus mode — revisit with
    the panel in hand.
11. Does focus extend reach/throw? v1 trades width for speed only; a tighter
    plume arguably carries further (the beacon reading). No canon.
12. Rigidity vs foreign loads (§8): packed magic should bear weight (SBOS's
    dragon) — unmeasurable until the payload-bodies chapter.
13. Fizzle vs manipulate mode (§7): a botched seal "fizzles into the bare
    shockwave" (§1) — does a low-quality pull-only seal burst anyway, even
    though its healthy form suppresses the burst? Quality is not in the sim.
    (Orb-bearing seals inherit the same question, §9.)
14. Levitation on an orb seal (§9): a cup that also grips its contents — a
    thermos. Unattested; parked. The sim's incidental behavior is the §7
    precedent (lev restores manifestation) with the shell containing whatever
    the grip holds — not legislated.
15. Vessel lateral placement sign (§9): $+\hat P$ chosen by the aim reading,
    but levitation's hover locus sits at $-s\,\mathbf P_{lev}$ — the two
    displacement laws disagree by analogy choice, and no canon shows an
    unbalanced orb seal. Revisit if one appears.
16. Orb capacity scales as $R^3$ (§9) while every other extensive quantity
    scales as $R^2$ (§2). Geometric necessity of the vessel reading; no canon
    anchor either way.
