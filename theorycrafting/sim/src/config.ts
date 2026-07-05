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
	SWIRL_H: 1.3, //    swirl envelope height

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
	U_PULL: 0.9, //     ambient speed per unit pull budget
	L_PULL: 1.6, //     sink/push kernel fall-off (distance from the disk, × reach)
	L_PULL_SLAB: 2.0, //conveyor along-axis fall-off (× reach)
	PULL_SLAB_R: 1.0, //conveyor tube radius
	PULL_SLAB_SOFT: 0.4, // tube edge softness
	GRASP_H: 0.25, //   grasp cushion height over the disk: pooled matter below this stops aging
	GRASP_V: 0.08, //   pooled = slower than this: transiting matter (conveyor) never charges the grasp
	GRASP_CAP: 200, //  grasp capacity, tracers per unit C_p₊ (G_max ∝ ηR²C_p₊): a full grasp kills the pull (capacitor ruling)
	AMBIENT_COUNT: 1400, // thin-everywhere medium tracers (ruling: the element visibly exists)
	AMBIENT_R: 2.4, //  medium seeding radius (horizontal)
	AMBIENT_H: 2.2, //  medium seeding height

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

	// particles
	MAX_PARTICLES: 6000,
	SPAWN_TRIES_PER_S: 2600, // spawn attempts per second (rejection-sampled by the mask)
	LIFE_MIN: 2.0,
	LIFE_MAX: 3.6,
	KILL_MASK: 0.02, // particles wandering behind a fence get absorbed
	KILL_DIST: 6.5,
	POINT_SIZE: 0.035
} as const;
