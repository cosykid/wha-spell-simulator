/**
 * @file Every dial the hybrid substrate has, in one place, so a look pass is a
 * number edit rather than a shader hunt.
 *
 * The {@link FLOW} numbers are read twice — as GPU uniforms by the parcel field
 * and directly by the CPU brush population in `flow.ts` — which is what makes
 * "both populations ride the same field" a fact rather than a claim. Change one
 * and change the other.
 */

/**
 * Square edge of the parcel texture. The whole cast shares this one pool and
 * partitions it by track (`pool.ts`), so a five-track score costs what a
 * one-track score costs.
 *
 * 128 is a budget rather than a taste. A parcel costs vertex work and primitive
 * setup rather than pixels, and the look tier's headless rasterizer manages
 * about a million triangles a second, so sixteen thousand parcels is what a
 * frame can afford to lay down sixty times a second on a software device.
 */
export const SIM_SIZE = 128;

/** The fixed step both halves advance on, in seconds. The stage owns the clock. */
export const STEP_S = 1 / 120;

/** Steps of the stage's 120Hz clock between paints. Two: the trail deposits at 60Hz. */
export const PAINT_EVERY = 2;

/**
 * Steps between turbulence impulses on the GPU, applied at this multiple of the
 * gain so the time average is unchanged. Two curl octaves are the substrate's
 * whole cost, and 25ms is far below anything a viewer resolves. The CPU brush
 * already re-reads the field on the same cadence (`MARK.fieldStride`).
 */
export const TURBULENCE_STRIDE = 3;

/**
 * Deposits one `render` call may take, however many steps it has to advance.
 *
 * A paint costs primitive setup for the whole parcel pool, so a call that fell
 * behind and tried to paint every step it simulates would take longer than the
 * frame it is already late for, and be later still next time. The cap breaks
 * that spiral: the flow is always advanced in full, and what a slow frame gives
 * up is smear it had no time to draw anyway. At sixty frames a second it never
 * binds, because two steps of the product clock are one deposit.
 */
export const PAINT_BURST = 3;

/** Flow forces, in seal units and seconds. The field both populations obey. */
export const FLOW = {
	/** Acceleration along the shape's own axis on a fully hot parcel. */
	buoyancy: 3.6,
	/** Velocity lost per second at age zero. Age adds more on top. */
	drag: 1.9,
	/** Fraction of the base footprint a column pinches away by full height. */
	narrow: 0.62,
	/** How far the pinch boundary wanders, as a fraction of itself. */
	boundaryWander: 0.62,
	/**
	 * Standing azimuthal lobes on the boundary, as fractions of it. The wander
	 * alone is isotropic, so it roughens a cone without unmaking it; these two
	 * harmonics shear with height and give the mass shoulders a viewer cannot
	 * name. Defect 3 of the prototype review.
	 */
	lobeThree: 0.3,
	lobeTwo: 0.22,
	/** How fast the two-fold lobe rotates with height, radians per seal unit. */
	lobeShear: 1.35,
	/**
	 * How far past the pinch the mass actually reaches. The pinch is an attractor,
	 * not a wall, and turbulence carries parcels well beyond it, so the edge a
	 * viewer sees stands at this multiple of the surface the field aims for.
	 */
	silhouette: 2.05,
	/** Curl-noise acceleration at full gain. */
	turbulence: 3.3,
	/** Spatial frequency of the first curl octave, per seal unit. */
	noiseScale: 1.35,
	/** Seal units per second the noise field slides, so the flow feels fed. */
	noiseRise: 0.7,
	/** Seconds a parcel burns for, before the shape's own multipliers. */
	lifeS: 0.5,
	lifeSpreadS: 1.15
} as const;

/**
 * The strike's own population. It is a punch, not a rising slug: born wide and
 * high-spread across the footprint, thrown at wildly different speeds so no
 * coherent front survives, and burned out inside a third of a second.
 */
export const PUNCH = {
	/** Fraction of strike-time spawns that belong to the punch rather than the body. */
	share: 0.86,
	/** Seconds a punch parcel burns for, before its own spread. */
	lifeS: 0.24,
	lifeSpreadS: 0.2,
	/** Longest a punch parcel can live. The draw program tells the two apart by it. */
	lifeMax: 0.46,
	/** Multiplier spread on the nozzle speed, so the front tears instead of slabbing. */
	riseLow: 1.2,
	riseHigh: 4.2,
	/** How far past the footprint the punch flashes across the seal. */
	spread: 0.9,
	/** Fraction of the strike beat the overpressure is concentrated into. */
	windowT: 0.78,
	/** Time constant of its fall, as a fraction of the strike beat. */
	fallT: 0.275,
	/** Fraction of the strike beat the overpressure takes to arrive. */
	riseT: 0.08
} as const;

/** Sprite and ramp dials for the parcel body. */
export const DRAW = {
	/** Sprite edge in seal units at birth. */
	size: 0.115,
	/** How much a sprite swells as it cools. */
	growth: 1.9,
	/** Screen stretch per seal unit per second of view-space speed. */
	stretch: 0.22,
	/** Peak opacity of one sprite. Low: the mass is built by overlap, not by sprites. */
	opacity: 0.26,
	/** Age fraction that may still burn in the core sliver, where the shape allows. */
	coreAge: 0.44,
	/** Height below which the base binds into washes rather than specks. */
	baseWashZ: 0.42,
	/** How much bigger a sprite is where it touches the paper. Overlap, not sparkle. */
	baseSwell: 1.7,
	/** Per-sprite opacity at the paper, as a fraction of `opacity`. */
	baseOpacity: 0.34,
	/** Seal radius the warm near-white core is confined inside. */
	coreRadius: 0.33,
	/** Height the core sliver lifts off the paper before it may burn white. */
	coreFloorZ: 0.1,
	/** Height the core sliver has spent itself. Above it the mass is pigment only. */
	coreTopZ: 0.72,
	/** Punch parcels are a blast: bigger and softer than the body. */
	punchSwell: 1.1,
	/**
	 * How hard a spent punch parcel lying on the plate is erased. The prototype
	 * left a sepia dust ring there because a punch parcel is young by its own
	 * clock all the way to the end of a very short life, so the base wash never
	 * faded. Defect 2 of the review: the punch's plate wash is cut on its own age.
	 */
	punchPlateKill: 0.92
} as const;

/** The brush population: the marks that give the mass its hand-inked identity. */
export const MARK = {
	/** Marks the whole cast may hold, partitioned across its tracks by `pool.ts`. */
	pool: 760,
	/** Candidate sites drawn per spawn before one is accepted. */
	tearSamples: 4,
	/** Tear score a candidate has to beat, against a random draw, to be accepted. */
	tearBar: 2.4,
	/** How much of a lick adds rather than covers, so a crowd never blows out. */
	addShare: 0.6,
	/** Where inside its own boundary a lick is laid, as a fraction of it. */
	insetLow: 0.66,
	insetHigh: 1.1,
	/** How fast a mark takes up the field's velocity. Low lags, high snaps. */
	inertiaLow: 2.4,
	inertiaHigh: 7.5,
	/** Peak opacity of a mark before the mass under it modulates it. */
	peakLow: 0.17,
	peakHigh: 0.4,
	/** Seal half-length of a lick at birth. Small and many: a big mark is a blade. */
	sizeLow: 0.13,
	sizeHigh: 0.38,
	/** Mass coverage a mark needs under it to stay visible. Kills confetti. */
	clingPower: 0.85,
	/** Steps between field samples for one mark, staggered across the pool. */
	fieldStride: 3,
	/** Marks born per second at full emission, per track. */
	rate: 500,
	/** How much harder the strike tears marks off the front. */
	punchRate: 1700
} as const;

/** Feedback, bloom and composite. */
export const POST = {
	/**
	 * Fraction of the canvas the accumulation runs at. Softness against edge, and
	 * the one dial that decides whether the look tier's headless rasterizer can
	 * afford a hundred paints a baseline.
	 */
	trailScale: 0.62,
	/** Per-paint survival of the accumulation buffer. */
	trailFade: 0.72,
	/** Seal-plane pixels the accumulation drifts upward per paint, as a UV fraction. */
	trailDrift: 0.0011,
	/** Blur radius of the accumulation re-sample, in UV. */
	trailBlur: 0.0015,
	/**
	 * Alpha the accumulation is cut to nothing at. Without a floor the last
	 * thousandth of a wash lingers as a sepia veil over the cream, which is half
	 * of the dust ring defect 2 names.
	 */
	trailFloor: 0.0045,
	/** Luminance a pixel needs before it blooms at all. */
	bloomThreshold: 0.86,
	bloomKnee: 0.26,
	/** How much bloom is added back. Subtle by intent. */
	bloomStrength: 0.24,
	/** How much of the bloom leaks into alpha, so glow reads over the paper. */
	bloomAlpha: 0.09
} as const;
