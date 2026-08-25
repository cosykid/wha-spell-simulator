/**
 * @file Every dial the fluid has, in one place, so a bake-off iteration is a
 * number edit rather than a shader hunt. Throwaway: no test pins these.
 */

/** Square edge of the simulation texture. 256 -> 65,536 particles. */
export const SIM_SIZE = 256;

/** The fixed simulation step, in seconds. Capture and playback both use it. */
export const STEP_S = 1 / 60;

/** Flow forces, in seal units and seconds. */
export const FLOW = {
	/** Upward acceleration on a fully hot parcel. */
	buoyancy: 3.6,
	/** Velocity lost per second at age zero. Age adds more on top. */
	drag: 1.9,
	/** How far above the seal the column has spent itself and starts to flare. */
	reachScale: 1.0,
	/** Fraction of the base footprint the column pinches away by full height. */
	narrow: 0.85,
	/** Curl-noise acceleration at full gain. */
	turbulence: 3.3,
	/** Spatial frequency of the first curl octave, per seal unit. */
	noiseScale: 1.35,
	/** Seal units per second the noise field slides downward, so the flow feels fed. */
	noiseRise: 0.7,
	/** Lazy rotation about the column axis, radians per second at the rim. */
	swirl: 0.5,
	/** Seconds a parcel burns for, before the strike and body multipliers. */
	lifeS: 0.5,
	lifeSpreadS: 1.15
} as const;

/** Sprite and palette dials. */
export const DRAW = {
	/** Sprite radius in seal units at birth. */
	size: 0.1,
	/** How much a sprite swells as it cools. */
	growth: 1.9,
	/** Screen stretch per seal unit per second of view-space speed. */
	stretch: 0.22,
	/** Peak opacity of one sprite. Low: the mass is built by overlap, not by sprites. */
	opacity: 0.22,
	/** Age fraction that still counts as the hottest sliver and blends additively. */
	coreAge: 0.062
} as const;

/** Feedback, bloom and composite. */
export const POST = {
	/** Per-step survival of the accumulation buffer. */
	trailFade: 0.74,
	/** Seal-plane pixels the accumulation drifts upward per step, as a UV fraction. */
	trailDrift: 0.0011,
	/** Blur radius of the accumulation re-sample, in UV. */
	trailBlur: 0.0013,
	/** Luminance a pixel needs before it blooms at all. */
	bloomThreshold: 0.84,
	bloomKnee: 0.28,
	/** How much bloom is added back. Subtle by intent. */
	bloomStrength: 0.26,
	/** How much of the bloom leaks into alpha, so glow reads over the paper. */
	bloomAlpha: 0.1
} as const;

/**
 * The pigment ramp, sampled by age. Authored as display-space sRGB triples: the
 * renderer does no colour management, so what is written here is what lands.
 */
export const PIGMENT = {
	/** Only the very core, and only for `DRAW.coreAge` of a parcel's life. */
	core: [1.0, 0.93, 0.78],
	amber: [1.0, 0.67, 0.19],
	orange: [0.95, 0.42, 0.1],
	vermilion: [0.74, 0.16, 0.08],
	ember: [0.42, 0.15, 0.09],
	soot: [0.3, 0.22, 0.18],
	/** The charge beat's inward motes: unlit ink, not fire. */
	mote: [0.5, 0.34, 0.22]
} as const;
