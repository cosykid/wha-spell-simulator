/**
 * @file What the field needs to know about one channel, and the mouths a parcel
 * can be born from.
 *
 * An archetype is not a kernel in this engine: it is this struct filled in
 * differently plus a spawn program, which is why a column, a whirl and a sink
 * can share a substrate and still read as themselves. `flow.ts` is what the
 * struct means, `params.ts` is how it travels to the GPU, and
 * `spawn.glsl.ts` is where each mouth is written out.
 */

import { FLOW } from './tuning.js';

/** Which mouth a channel's parcels are born from. Mirrored as an int in GLSL. */
export const SPAWN = {
	/** A disc at the origin rising along the axis, fed by drawn column sites. */
	column: 0,
	/** The strike: born wide across the footprint and thrown outward and up. */
	splash: 1,
	/** An arc of the seal plane, running outward and barely leaving the paper. */
	sector: 2,
	/** A ring at the funnel foot, tangential and climbing. */
	swirl: 3,
	/** Far out and heading in, or the reverse on a negative draw. */
	sink: 4,
	/** The seal disc, lifted toward a hover locus. */
	hover: 5,
	/** R-10's medium: seeded through the domain and drawn onto the ring. */
	medium: 6
} as const;

export type SpawnKind = (typeof SPAWN)[keyof typeof SPAWN];

/**
 * Everything the field needs to know about one channel. Seal space and seconds
 * throughout. A cell writes this every step and the substrate hands it to both
 * populations, so the struct is the whole interface between choreography and
 * pigment.
 */
export interface FlowShape {
	/** Where the mass is rooted. */
	originX: number;
	originY: number;
	originZ: number;
	/** Unit. The direction the drive pushes and the axis the pinch measures from. */
	axisX: number;
	axisY: number;
	axisZ: number;
	/** Seal units across the mouth. */
	footprint: number;
	/** Seal units along the axis the flow spends itself over. */
	reach: number;
	/** Seal units per second at the mouth. */
	speed: number;
	/** Acceleration along the axis on a fully hot parcel. */
	buoyancy: number;
	/** Pinch onto the axis. Negative spreads off it. */
	converge: number;
	/** Tangential rate about the axis, per second at unit radius. */
	swirl: number;
	/** Radial rate toward the origin. Negative pushes away: one signed term. */
	sink: number;
	/** Seal units where the sink peaks, so the centre is a pool and not a spike. */
	pool: number;
	/** Lateral drag, seal units per second squared. */
	driftX: number;
	driftY: number;
	/** Seal units above the paper the flow is held under. Zero means no lid. */
	ceiling: number;
	/** Per second the mass outside `holdRadius` is drawn back onto the origin. */
	gather: number;
	holdRadius: number;
	/** Curl-noise acceleration at full gain. */
	turbulence: number;
	/** Velocity lost per second at age zero. */
	drag: number;
	/** Fraction of the footprint the boundary pinches away by full height. */
	narrow: number;
	/** How far the boundary wanders, as a fraction of itself. */
	wander: number;
	/** Seeded, so no two casts carry the same standing lobes. */
	lobePhase: number;
	/**
	 * The lowest fraction of `reach` a brush mark may be born at. A column has
	 * nothing to tear off down at its foot; a fan is all foot. CPU only: the
	 * parcels never ask.
	 */
	markFloor: number;
	/** Seconds a parcel burns for, before its own spread. */
	lifeS: number;
	lifeSpreadS: number;
	spawn: SpawnKind;
	/** Drawn sites feeding this channel, packed `at.x, at.y, facing.x, facing.y`. */
	sites: Float32Array;
	siteCount: number;
	/** Fraction of this channel's parcels that should be alive, 0..1. */
	emission: number;
	/**
	 * Where this channel sits on the heat ramp, as a multiplier. One is the
	 * spell's own fire; a third is the ambient medium, which is pigment and never
	 * light. It is the only thing a channel says about its own colour.
	 */
	heat: number;
	/**
	 * How thickly this channel's parcels are laid, as a multiplier on the
	 * substrate's own opacity. The medium is a veil, so it runs a great many very
	 * faint parcels rather than a few dark ones: a thin population at full
	 * opacity is the countable-dots look this rework exists to be rid of.
	 */
	veil: number;
	/** Multiplier on parcel size. Big and faint is haze; small and dark is grit. */
	grain: number;
	/** The strike's overpressure, 0..1. */
	punch: number;
	/** How fast a parcel burns through its own life. Rises through the release. */
	burn: number;
}

/** A shape at rest: an upright column of no size, so a cell only writes what it means. */
export function blankShape(): FlowShape {
	return {
		originX: 0,
		originY: 0,
		originZ: 0,
		axisX: 0,
		axisY: 0,
		axisZ: 1,
		footprint: 0.4,
		reach: 1.4,
		speed: 0,
		buoyancy: 0,
		converge: 0,
		swirl: 0,
		sink: 0,
		pool: 0.4,
		driftX: 0,
		driftY: 0,
		ceiling: 0,
		gather: 0,
		holdRadius: 0,
		turbulence: FLOW.turbulence,
		drag: FLOW.drag,
		narrow: FLOW.narrow,
		wander: FLOW.boundaryWander,
		lobePhase: 0,
		markFloor: 0.34,
		lifeS: FLOW.lifeS,
		lifeSpreadS: FLOW.lifeSpreadS,
		spawn: SPAWN.column,
		sites: new Float32Array(16),
		siteCount: 0,
		emission: 0,
		heat: 1,
		veil: 1,
		grain: 1,
		punch: 0,
		burn: 1
	};
}
