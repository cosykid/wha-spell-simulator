/**
 * Every constant of the model that is a *guess* rather than a rule lives here,
 * mirroring the [tunable] tags in GROUND_TRUTH.md. Units: seal radius R = 1,
 * speeds in R/s.
 */
export const CONFIG = {
	// §3 burst — the bare ring's emission
	U_BURST: 0.55, //   base speed of the default burst
	L_BURST: 0.9, //    fall-off distance of the burst
	H_VIRTUAL: 0.18, // virtual source depth (near-plane flow lateral, on-axis vertical)
	BURST_STEER: 2.5, // how strongly column momentum A = (P, C₊) bends the burst direction (one budget, steered)

	// §4 column channels
	U_COLUMN: 1.15, //  speed per unit of column budget
	L_JET: 2.4, //      base jet range
	JET_RADIUS: 1.05, //jet tube radius
	JET_SOFT: 0.4, //   tube edge softness
	JET_BACK: 0.45, //  jet fade-in distance behind the seal center (upstream edge softness)
	FAN_H: 0.45, //     divergence-fan slab thickness
	FAN_RANGE: 1.4, //  divergence-fan radial fall-off

	// §6 levitation force pair
	H_LEV: 1.6, //      hover rest height per unit mean stem length (h₀ = H_LEV · λ̄)
	LEV_SHIFT: 0.35, // hover displacement per unit |P_lev|, along −P̂ (open — no canon)
	U_HOLD: 0.85, //    grip speed per unit hold channel C_lev₊
	BLOB_R: 0.28, //    spring is off inside the blob — room to churn (emergent recapture)
	BLOB_SOFT: 0.22, // spring ramp width at the blob edge
	CAP_R: 1.3, //      grip plateau radius around the hover locus (floor — the zone always spans down to the seal rim)
	CAP_FALL: 0.5, //   grip decay beyond the capture zone
	HOLD_AGE: 0, //     age rate of tracers churning inside the blob (0 = the grip sustains held magic indefinitely)
	BALL_CAP: 700, //   ball capacity, tracers per unit C_lev (W_max ∝ ηR²C_lev, §6): a full ball stops the feed
	SPIN_FALL: 0.6, //  Γ_lev spin envelope around the hover axis
	U_WASH: 0.9, //     streaming-medium wash speed per unit |C₊ẑ − P_lev| (thrust mode)

	// §7 pull — the ambient coupling
	U_PULL: 1.15, //    ambient speed per unit pull budget — brisk enough that a
	//                  real cast (durations ~6s) gathers its pool with time to burn
	PULL_TWIST_GAIN: 1.8, // extra gain on the ambient twist channel: hand-stamped
	//                  signs are short (Γ_p ~0.9 for a 3-pull pinwheel), and at
	//                  bare U_PULL the circulation reads as scatter, not spin
	L_PULL: 1.6, //     sink/push kernel fall-off (distance from the disk, × reach)
	L_PULL_SLAB: 2.0, //conveyor along-axis fall-off (× reach)
	PULL_SLAB_R: 1.0, //conveyor tube radius
	PULL_SLAB_SOFT: 0.4, // tube edge softness
	// twist vortex (§7 helical-inflow canon, §13 pinwheel prediction): the
	// structure both twist channels share — see core/vortex.ts
	TWIST_H: 2.6, //    crown height at full circulation
	TWIST_FULL: 0.9, // |Γ| at which the column reaches full height (~3 hand-drawn pulls)
	TWIST_R0: 0.2, //   funnel core radius at the foot (÷ F)
	TWIST_R1: 0.48, //  funnel core radius at the crown (÷ F)
	TWIST_LIFT: 0.55, //wall updraft speed per unit |Γ| (× channel U)
	TWIST_FEED: 0.7, // floor boundary-layer inflow gain per unit |Γ|
	TWIST_BL: 0.2, //   boundary-layer height the inflow hugs
	TWIST_SPILL: 0.5, //crown out-and-down shed gain per unit |Γ|
	TWIST_OMEGA_MAX: 5, // clamp on the renderer's whirl phase rate, rad/s
	GRASP_H: 0.25, //   grasp cushion height over the disk: pooled matter below this stops aging
	GRASP_V: 0.34, //   pooled = slower than this: transiting matter (conveyor) never charges the grasp
	GRASP_CAP: 200, //  grasp capacity, tracers per unit C_p₊ (G_max ∝ ηR²C_p₊): a full grasp kills the pull (capacitor ruling)
	// the grasp heaps its catch at the seal's heart (§7 cushion): a filled dome
	// that swells with charge. Element-agnostic — the volume look flavors it
	// (water mound, rock heap, radiant knoll); fire overrides with its whirl.
	POOL_R_BASE: 0.18, // heap radius at first catch
	POOL_R_MAX: 0.55, //  heap radius at full charge
	POOL_H_MAX: 0.46, //  heap crown height at full charge
	POOL_FULL_N: 70, //   latched motes at which the heap reaches full size
	POOL_MIN_N: 6, //     latched motes before the heap reads as a body at all
	POOL_SETTLE: 3.5, //  1/s easing of a latched mote into its heap spot
	GRASP_CHURN: 0.55, // pooled matter keeps stirring: solid-body spin (rad/s per unit Γ_p, clamped) — the arrows' turn, §12 stirred-cup
	GRASP_CHURN_MAX: 2, // |Γ_p| clamp for the churn rate
	AMBIENT_COUNT: 1800, // thin-everywhere medium tracers (ruling: the element visibly exists)
	AMBIENT_R: 2.4, //  medium seeding radius (horizontal)
	AMBIENT_H: 2.2, //  medium seeding height
	AMBIENT_STREAK_S: 0.24, // render-only: seconds of travel a gripped mote streaks over
	AMBIENT_VIS_V: 0.3, // render-only: mote speed where the medium becomes visible —
	//                  the quiet medium stays invisible (physics still tracks it);
	//                  full brightness at 2× this speed. Must sit above the slow
	//                  whole-domain sink drift a hand-drawn seal's slight inward
	//                  tilt causes, or the whole stage speckles
	AMBIENT_VIS_R: 1.5, // render-only: motes fade out beyond this seal-space radius —
	//                  only the spell's immediate stage shows its medium
	AMBIENT_VIS_R_SOFT: 0.45, // width of that radial fade band

	// §8 convergence — the lens
	CONV_FOCUS: 0.55, // F = 1 + CONV_FOCUS·Q: envelope widths ÷ F, speeds × F (pressure-box)
	CONV_PINCH: 1.2, //  burst/ambient-kernel direction pinch toward the emission axis, per unit Q
	CONV_AXIAL: 0.8, //  how much the pinch refracts rays toward the axis LINE (plume, not collimation)
	RIGID_RATE: 30, //   rigidity: per-frame blend toward the local mean, w = min(1, RIGID_RATE·Q·dt) —
	//                   the field is resampled every frame, so the blend must act per-frame to bite
	RIGID_MIN_N: 4, //   neighbours needed before a local mean is meaningful

	// §9 orb — the vessel
	K_ORB: 0.8, //      vessel radius per unit orb budget O (r = K_ORB·O / F)
	H_ORB: 0.55, //     captured C₊ lifts the vessel center above tangent (placement re-read)
	ORB_SHIFT: 0.5, //  captured P displaces the vessel along +P̂ (aim reading — §12.15, no canon)
	ORB_SETTLE: 0.55, //settle speed of contained matter (gravity is local law inside the shell)
	ORB_STIR: 0.35, //  captured Γ spins the contents: solid-body ω per unit Γ
	ORB_WALL: 0.09, //  one-way shell clip band thickness (must exceed one integration step)
	POUR_COUNT: 600, // demo pour: total motes in the bottle
	POUR_RATE: 70, //   pour motes per second
	POUR_SPEED: 1.4, // stream drive on poured motes until contained (boundary condition, not world gravity)
	POUR_DROP: 0.45, // spout height above the vessel top

	// §8 excluded volume (every seal): manifested magic occupies space
	VOL_RADIUS: 0.045, // tracer repulsion radius — sets the packing floor
	VOL_PUSH: 1.6, //    repulsion speed at full overlap
	VOL_PUSH_MAX: 4.0, //cap on the summed repulsion — must exceed the strongest grip
	//                   (U_HOLD·C_lev·F), or pressure can never balance a spring and balls slow-collapse

	// §5 region gates
	GATE_K: 7, //       fence sigmoid hardness per stage (k_d = GATE_K * n_d)
	DIR_CLUSTER_DEG: 25, // chevrons within this angle count as parallel (barrels)
	PINCH_GAP: 0.45, // max separation of an anti-parallel pair forming a pinch
	LANE_W: 0.55, //    max lateral offset for parallel chevrons to share a barrel
	RADIAL_DOT: 0.6, // |û·r̂| above this ⇒ radially aligned…
	RADIAL_MIN_R: 0.6, // …but only near the rim; deep signs are straight shutters
	RING_SPREAD_DEG: 60, // radial chevrons form a curved ring fence only if ≥2 span this much azimuth
	GLOBAL_R: 0.25, //  classes whose members sit inside this radius govern globally
	TIE_DEG: 25, //     governance tie window around the nearest class
	CH_BIAS: 0.3, //    channeling bias, base fraction of speed pushed along û
	CH_BIAS_STAGE: 0.15, // extra bias per additional aligned sign
	CH_BIAS_MAX: 1.1, //   bias saturation
	STAGE_BOOST: 0.45, //  extra reach per additional aligned sign (barrel staging)
	REACH_MAX: 3.2, //     reach saturation
	MASK_FLOOR: 0.25, // how much field survives inside a fenced zone (walls leak a bit)
	PROX_OUT: 0.22, //  how far outside the ring the source can relocate (all-outward moat)

	// element volume (render-only: marching-cubes skin over the tracer cloud)
	VOLUME_RES: 64, //        metaball grid resolution (cells per edge)
	VOLUME_STRENGTH: 0.024, //metaball strength per tracer (fatter blobs)
	VOLUME_SUBTRACT: 12, //   metaball falloff (tighter influence)
	VOLUME_ISOLATION: 60, //  field threshold the skin is polygonized at
	VOLUME_SMEAR: 0.12, //    velocity smear: bead-strand spacing per unit speed
	VOLUME_MAX_BALLS: 2200, //tracer deposit cap per frame (perf guard)
	// cohesion (render-only): each deposit is pulled toward the centroid of its
	// tracer neighbourhood, so the skin reads as one consistent fluid body
	VOLUME_COHESION: 0.65, //  0..1 pull toward the local centroid (LOOKS scales per element)
	VOLUME_COHESION_R: 0.26, //neighbourhood radius, world units
	VOLUME_COHESION_K: 8, //   neighbours at which a deposit reaches full strength
	VOLUME_LONER: 0.45, //     strength floor for isolated deposits (droplets, not bubbles)
	// ambient skinning (render-only): fast inflow motes and the gathered pool
	// deposit into the volume too, so a pull's output reads as matter, not dots
	STREAM_VMIN: 0.3, //       mote speed where stream deposits start
	STREAM_FULL: 0.85, //      mote speed at which a stream deposit reaches full strength
	STREAM_STRENGTH: 0.45, //  ball strength × VOLUME_STRENGTH for skinned inflow motes
	STREAM_RHO: 0.55, //       stream deposits only this close to the seal axis…
	STREAM_H: 0.6, //          …and this low: the dense crowd at the pyre's doorstep,
	//                         where deposits fuse — the far spiral stays streaks
	STREAM_KMIN: 6, //         cohesion neighbours a stream/pooled mote needs to deposit
	//                         (the ring-wide funnel spreads the pool ~2.6× thinner)
	//                         at all (sparse motes stay dots — no gobbet popcorn)
	PLUME_H: 3.6, //           gathered-mass flame column max height (× LOOKS.plume)
	PLUME_FULL_N: 30, //       pooled motes at which the vortex reaches full height —
	//                         low enough that a short real cast ignites before it fades
	PLUME_MIN_N: 10, //        pooled motes before the vortex ignites at all: a trace
	//                         catch (near-tangential seal, capacity ~a handful) must
	//                         not birth a tower
	PLUME_RAMP: 0.4, //        height ramp exponent over pooled fraction (sub-√: grows fast early)
	PLUME_STEP: 0.09, //       vertical ball spacing in the core spine stack
	PLUME_STRENGTH: 0.85, //   plume ball strength × VOLUME_STRENGTH at the base
	PLUME_BALLS: 900, //       tongue + spine ball budget per frame
	// gathered-fire vortex (population physics: latched motes RIDE the whirl —
	// the tornado is made of the collected matter, not painted over it)
	VORTEX_OMEGA: 4.5, //      intrinsic spin at full charge, rad/s (buoyant fire whirl)
	VORTEX_RISE: 1.15, //      crown-ward updraft at full charge, R/s
	SWAY_A: 0.045, //          axis lash amplitude per unit height^1.3…
	SWAY_MAX: 0.12, //         …clamped low: a hard whip outruns the motes' easing
	//                         and tears the upper column into floating plates
	VOLUME_SMEAR_MAX: 0.2, //  world-unit cap on a deposit's velocity smear: a fast
	//                         whirl must thicken into ribbons, not tear into beads
	VORTEX_R_BASE: 0.2, //     whirl wall radius at the foot: a tornado stands on a
	//                         tight stem and FLARES upward — base must stay under the
	//                         crown or the body reads as a tree trunk, not a funnel
	VORTEX_R_TOP: 0.42, //     wall radius at the crown (the flared funnel mouth).
	//                         Hard ceiling ~0.45: above it the 4 ropes sit farther
	//                         apart than the metaballs can bridge and the crown
	//                         shatters into floating chunks
	VORTEX_GATHER: 3.5, //     1/s easing of a latched mote onto the funnel wall
	VORTEX_PITCH: 2.7, //      helix winding, rad of azimuth per unit height — high
	//                         pitch lays the ropes near-horizontal (stacked washers);
	//                         low collapses them into vertical licks. ~2.7 keeps the
	//                         winding a steep diagonal that still wraps the silhouette
	VORTEX_BIND: 3.0, //       1/s angular easing toward the helical arm: motes must
	//                         crowd the ropes or their deposits starve the neighbour
	//                         gate and float as loose chunks
	VORTEX_STRANDS: 4, //      helical rope strands riding the funnel wall (and the
	//                         arm count the motes bind toward). Fewer, fatter ropes
	//                         leave visible grooves between them — the spiral cue
	SPINE_STRENGTH: 1.35, //   strand ball strength × VOLUME_STRENGTH (the guaranteed body)
	TONGUE_STEP: 0.13, //      ball spacing along a mote's flame lick
	TONGUE_LEAN: 0.5, //       how far a lick trails the spin, per step (s of travel)

	// particles
	MAX_PARTICLES: 6000,
	SPAWN_TRIES_PER_S: 2600, // spawn attempts per second (rejection-sampled by the mask)
	LIFE_MIN: 2.0,
	LIFE_MAX: 3.6,
	KILL_MASK: 0.02, // particles wandering behind a fence get absorbed
	KILL_DIST: 6.5,
	POINT_SIZE: 0.035
} as const;
