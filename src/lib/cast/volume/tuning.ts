/**
 * @file Every dial the volume substrate shares across elements, in one place.
 * The per-element numbers live in `elements.ts` and `pigment.ts`; this file is
 * the machinery they multiply.
 *
 * The chip law is the load-bearing lesson from the bake-off: any metaball
 * below about two grid cells polygonizes as an angular chip, which is the
 * exact rejected failure. Three numbers here enforce its mitigations — the
 * binary deposit cutoff, the loner floor, and a ball radius that clears two
 * cells at the working resolution. Change the resolution and re-derive
 * `strength` before judging a frame.
 */

/** Tracers the whole cast shares, divided once among its tracks (`pool.ts`). */
export const TRACER_BUDGET = 2600;

/** The fixed step both halves advance on, in seconds. The stage owns the clock. */
export const STEP_S = 1 / 120;

/** Steps of the stage's 120Hz clock between skin repolygonizes. Two: 60Hz. */
export const PAINT_EVERY = 2;

/**
 * Repolygonizes one `render` call may take, however many steps it advances.
 * One: the skin is stateless per paint (the field is rebuilt from the live
 * tracers every time), so a call that fell behind simulates silently and
 * paints only its final state. Painting every caught-up step is the catch-up
 * spiral the prototype diagnosed.
 */
export const PAINT_BURST = 1;

/**
 * Steps between turbulence impulses, applied at this multiple of the gain so
 * the time average is unchanged. Curl noise is the advection's whole cost, and
 * a 25ms cadence is far below anything a viewer resolves.
 */
export const TURBULENCE_STRIDE = 3;

/** The marching-cubes field and its chip mitigations. */
export const VOLUME = {
	/** Grid resolution per axis. The perf ladder's first rung moves this. */
	res: 56,
	/**
	 * Base deposit strength before the per-element `strengthScale`. Sized so a
	 * full-weight ball spans just over two grid cells at `res` (chip law):
	 * radius = sqrt(strength * 0.6 / subtract) in grid-normalized units.
	 */
	strength: 0.037,
	subtract: 12,
	isolation: 60,
	/** Velocity smear per seal unit per second, before the element's scale. */
	smear: 0.12,
	/** Metaballs one repolygonize may deposit, across every channel. */
	maxBalls: 1600,
	/** Cohesion pull toward the local centroid, before the element's scale. */
	cohesion: 0.65,
	/** Cohesion neighbourhood radius, seal units. */
	cohesionR: 0.3,
	/** Neighbours at which cohesion weight saturates. */
	cohesionK: 8,
	/**
	 * The binary deposit cutoff: a weight below this is not deposited at all,
	 * because a deposit that faint can only ever render as a stray grid chip.
	 */
	cutoff: 0.42,
	/** Fade below which a tracer is skipped before it is even weighed. */
	fadeFloor: 0.08
} as const;

/** Grid footprint in seal units: x,y in [-SPAN/2, SPAN/2], z in [Z0, Z0+SPAN]. */
export const SPAN = 4.4;
export const Z0 = -0.1;

/**
 * How far the pinch boundary wanders as a fraction of itself, at drawing
 * quality one. Quality buys form roughness and never magnitude: a sloppier
 * seal wanders further, it does not burn less brightly.
 */
export const BOUNDARY_WANDER = 0.62;

/**
 * The strike's overpressure window, as fractions of the 320ms strike beat.
 * Carried over from the hybrid engine digit for digit: R-02 fixes the beat, so
 * a fraction of it is a fixed number of milliseconds.
 */
export const PUNCH = {
	windowT: 0.78,
	fallT: 0.275,
	riseT: 0.08
} as const;

/** The charge-beat ambient: R-10's medium as drifting washes on the paper. */
export const AMBIENT = {
	/** Washes the medium may show at once. Few and large, never countable dust. */
	quads: 64,
	/** Wash radius in seal units at full fade. */
	size: 0.22,
	/** Peak alpha of one wash. The e2e charge probe counts pixels above 0.125. */
	alpha: 0.3,
	/** How much a wash stretches along its own velocity. */
	stretch: 1.4
} as const;

/** The ground wash: how tracer mass near the paper converts to paper contact. */
export const WASH_GAUGE = {
	/** Seal units above the paper that still count as touching it. */
	nearZ: 0.16,
	/** Grounded tracers at which the wash reads fully developed. */
	fullAt: 260
} as const;
