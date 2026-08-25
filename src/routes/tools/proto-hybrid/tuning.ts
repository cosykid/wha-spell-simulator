/**
 * @file Every dial the hybrid has, in one place, so a bake-off iteration is a
 * number edit rather than a shader hunt. Throwaway: no test pins these.
 *
 * The flow numbers are read twice — as GLSL uniforms by the GPU fluid, and
 * directly by the CPU brush population in `flowField.ts` — which is what makes
 * "both systems ride the same field" a fact rather than a claim.
 */

/** Square edge of the simulation texture. 256 -> 65,536 parcels. */
export const SIM_SIZE = 256;

/** The fixed step both halves advance on, in seconds. Capture and playback share it. */
export const STEP_S = 1 / 60;

/** Flow forces, in seal units and seconds. The field both populations obey. */
export const FLOW = {
	/** Upward acceleration on a fully hot parcel. */
	buoyancy: 3.6,
	/** Velocity lost per second at age zero. Age adds more on top. */
	drag: 1.9,
	/** How far above the seal the column has spent itself. */
	reachScale: 1.0,
	/** Fraction of the base footprint the column pinches away by full height. A
	 *  hard pinch draws a cone, and the licks lie on this surface, so the cone
	 *  would be the one shape a viewer could name. */
	narrow: 0.62,
	/** How far the pinch boundary wanders, as a fraction of itself. */
	boundaryWander: 0.62,
	/** How far past the pinch the mass actually reaches. The pinch is an attractor,
	 *  not a wall, and turbulence carries parcels well beyond it, so the edge a
	 *  viewer sees stands at this multiple of the surface the shader aims for. */
	silhouette: 2.05,
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

/**
 * The strike's own population. It is a punch, not a rising slug: born wide and
 * high-spread across the seal, thrown at wildly different speeds so no coherent
 * front survives, and burned out inside a third of a second.
 */
export const PUNCH = {
	/** Fraction of strike-time spawns that belong to the punch rather than the column. */
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
	spread: 0.9
} as const;

/** Sprite and palette dials for the fluid body. */
export const DRAW = {
	/** Sprite radius in seal units at birth. */
	size: 0.1,
	/** How much a sprite swells as it cools. */
	growth: 1.9,
	/** Screen stretch per seal unit per second of view-space speed. */
	stretch: 0.22,
	/** Peak opacity of one sprite. Low: the mass is built by overlap, not by sprites. */
	opacity: 0.24,
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
	punchSwell: 1.1
} as const;

/** The brush population: the licks that give the mass its hand-inked identity. */
export const LICK = {
	/** Marks the pool can hold. The live count peaks a little under it. */
	pool: 820,
	/** Live marks allowed at once, so the roar has a ceiling. */
	liveCap: 760,
	/** Candidate sites drawn per spawn before one is accepted. */
	tearSamples: 4,
	/** Tear score a candidate has to beat, against a random draw, to be accepted. */
	tearBar: 2.4,
	/** How much of a lick adds rather than covers. Pure add stacks into a white
	 *  hole; this much keeps the tongue hot without letting a crowd blow out. */
	addShare: 0.6,
	/** Where inside its own boundary a lick is laid, as a fraction of it. A mark
	 *  centred on the edge hangs half off the mass; centred inside it, only the
	 *  tip clears the silhouette, which is what an accent does. */
	insetLow: 0.66,
	insetHigh: 1.1,
	/** How fast a mark takes up the field's velocity. Low lags, high snaps. */
	inertiaLow: 2.4,
	inertiaHigh: 7.5,
	/** Peak opacity of a lick before the mass under it modulates it. A mark laid on
	 *  a dense body has to out-state it or the body simply eats it. */
	peakLow: 0.17,
	peakHigh: 0.4,
	/** Seal half-length of a lick at birth. Small and many: a big mark is a blade. */
	sizeLow: 0.13,
	sizeHigh: 0.38,
	/** Mass coverage a lick needs under it to stay visible. Kills confetti. */
	clingPower: 0.85
} as const;

/** Feedback, bloom and composite. */
export const POST = {
	/** Fraction of the canvas the accumulation runs at. Softness against edge. */
	trailScale: 0.78,
	/** Per-step survival of the accumulation buffer. */
	trailFade: 0.72,
	/** Seal-plane pixels the accumulation drifts upward per step, as a UV fraction. */
	trailDrift: 0.0011,
	/** Blur radius of the accumulation re-sample, in UV. */
	trailBlur: 0.0012,
	/** Luminance a pixel needs before it blooms at all. */
	bloomThreshold: 0.86,
	bloomKnee: 0.26,
	/** How much bloom is added back. Subtle by intent. */
	bloomStrength: 0.24,
	/** How much of the bloom leaks into alpha, so glow reads over the paper. */
	bloomAlpha: 0.09
} as const;
