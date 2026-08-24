/**
 * @file How a {@link FlowShape} travels to the GPU: one row of a small float
 * texture per channel.
 *
 * A uniform array would do, but ESSL only indexes one by a loop counter, so
 * every parcel would scan every channel to find its own. A texture row is a
 * lookup, and it is also the reason a five-track score costs a five-track
 * upload rather than five shader programs.
 *
 * The layout is written once here and read back by name in `flow.glsl.ts`, so
 * the two cannot drift.
 */

import type { FlowShape } from './flow.js';

/** Channels one cast may carry. A score has one track per resolved primitive. */
export const MAX_CHANNELS = 8;

/** RGBA texels one channel's row occupies. Four of them are its drawn sites. */
export const PARAM_TEXELS = 13;

/** The texel each group of four numbers sits in. Read back by `flow.glsl.ts`. */
export const PARAM_SLOT = {
	origin: 0,
	axis: 1,
	drive: 2,
	field: 3,
	hold: 4,
	shape: 5,
	life: 6,
	arc: 7,
	/** Read by the draw program alone, so a parcel costs one lookup for its ink. */
	paint: 8,
	sites: 9
} as const;

/** Floats one channel's row holds. */
export const PARAM_FLOATS = PARAM_TEXELS * 4;

/**
 * Writes one channel's shape into `data` at `row`. Every number the field reads
 * is here; nothing else about a cell reaches the GPU.
 */
export function packShape(data: Float32Array, row: number, shape: FlowShape): void {
	const at = row * PARAM_FLOATS;
	const put = (slot: number, a: number, b: number, c: number, d: number) => {
		const i = at + slot * 4;
		data[i] = a;
		data[i + 1] = b;
		data[i + 2] = c;
		data[i + 3] = d;
	};
	put(PARAM_SLOT.origin, shape.originX, shape.originY, shape.originZ, shape.footprint);
	put(PARAM_SLOT.axis, shape.axisX, shape.axisY, shape.axisZ, shape.reach);
	put(PARAM_SLOT.drive, shape.speed, shape.buoyancy, shape.converge, shape.swirl);
	put(PARAM_SLOT.field, shape.sink, shape.driftX, shape.driftY, shape.ceiling);
	put(PARAM_SLOT.hold, shape.gather, shape.holdRadius, shape.turbulence, shape.drag);
	put(PARAM_SLOT.shape, shape.narrow, shape.wander, shape.lobePhase, shape.pool);
	put(PARAM_SLOT.life, shape.lifeS, shape.lifeSpreadS, shape.spawn, shape.siteCount);
	put(PARAM_SLOT.arc, shape.emission, 0, shape.punch, shape.burn);
	put(PARAM_SLOT.paint, shape.heat, shape.veil, shape.grain, 0);
	for (let site = 0; site < 4; site += 1) {
		put(
			PARAM_SLOT.sites + site,
			shape.sites[site * 4],
			shape.sites[site * 4 + 1],
			shape.sites[site * 4 + 2],
			shape.sites[site * 4 + 3]
		);
	}
}

/** A blank params buffer, sized for the whole cast. */
export function newParamBuffer(): Float32Array {
	return new Float32Array(MAX_CHANNELS * PARAM_FLOATS);
}
