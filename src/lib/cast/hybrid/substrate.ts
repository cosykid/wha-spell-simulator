/**
 * @file The substrate every cell performs on, and the channel each cell is
 * handed a seat at.
 *
 * A cell no longer owns geometry. It owns a **choreography**: the flow shape its
 * parcels feel, the arc its brush marks are laid at, and whatever it accumulates
 * of its own. The pigment — the parcel field, the marks, the ramp, the
 * accumulation — is one shared machine, which is what lets seven archetypes look
 * like one hand drew them and cost one budget between them.
 *
 * This half is pure CPU and pure arithmetic: no three.js, no context, no clock.
 * The GPU half lives in `substrateStage.ts`, and the golden tier performs a
 * whole cast through this one in plain Node.
 *
 * @example
 * const substrate = new Substrate(tracks, look, key, score.signature);
 * substrate.channels[0].shape.buoyancy = 3.6;
 * substrate.channels[0].perform(tMs, dtS);
 */

import { blankShape, type FlowShape } from './flow.js';
import { MarkPool, type MarkArc, type SwarmQuads } from './markPool.js';
import { materialInk, pigmentsFor, type MaterialInk, type PigmentKey } from './pigments.js';
import { allocatePool, rowChannelMap, type PoolSlice } from './pool.js';
import { newParamBuffer, packShape } from './params.js';
import { hashSeed } from '../rng.js';
import type { Palette } from './palette.js';
import type { LookRow } from '../looks/look.js';
import type { ScoreTrack } from '../../types.js';

/** What a channel reached, in seal space. The golden tier reads this and no more. */
export interface ChannelReading {
	/** Seal-space centroid of the live marks. Where the mass actually is. */
	x: number;
	y: number;
	z: number;
	/** Farthest a live mark stands from the seal origin. */
	reach: number;
	/** Mean speed of the live marks, seal units per second. */
	speed: number;
}

/**
 * One track's seat at the substrate: the shape its parcels feel, the arc its
 * marks are laid at, and the pool that lays them.
 *
 * A cell writes {@link shape} and {@link arc} during its own update and then
 * calls {@link perform}. Nothing else in the cast may write either.
 */
export class Channel {
	readonly shape: FlowShape = blankShape();
	readonly slice: PoolSlice;
	readonly marks: MarkPool;
	/** The row's material multipliers, so a cell never invents its own ink. */
	readonly ink: MaterialInk;
	/**
	 * What the marks are being laid at right now. Rate, punch, soot and the row's
	 * own alpha and size, rewritten by the cell every step.
	 */
	readonly arc: MarkArc;

	constructor(slice: PoolSlice, seed: number, palette: Palette, ink: MaterialInk) {
		this.slice = slice;
		this.ink = ink;
		this.marks = new MarkPool(slice.marks, seed, palette);
		this.arc = {
			drive: 0,
			punch: 0,
			soot: 0,
			alpha: ink.markAlpha,
			size: ink.markSize,
			ceiling: ink.ceiling,
			life: 1,
			rate: 0,
			inkShare: ink.inkShare,
			crownShare: 1,
			tongueShare: 0.22
		};
	}

	/** Parcels this channel owns. Fixed for the life of the cast. */
	get parcels(): number {
		return this.slice.parcels;
	}

	/** Live brush marks, and every mark this channel has ever laid. */
	get live(): number {
		return this.marks.live;
	}

	get born(): number {
		return this.marks.born;
	}

	/** Advances this channel's brush population one fixed step of the cast clock. */
	perform(tMs: number, dtS: number): void {
		this.marks.step(this.shape, this.arc, tMs, dtS);
	}

	/** Where this channel's mass stands, for the golden tier and the probes. */
	read(out: ChannelReading): void {
		this.marks.measure(out);
	}

	/** Drops everything in flight so the cast replays from the charge. */
	reset(): void {
		this.marks.reset();
	}
}

/** The shared pigment machine, one per cast. */
export class Substrate {
	readonly channels: Channel[];
	readonly palette: Palette;
	readonly ink: MaterialInk;
	/** One row per channel, uploaded to the GPU each step. */
	readonly params: Float32Array = newParamBuffer();
	/** One texel per parcel-texture row, saying which channel owns it. */
	readonly rowMap: Float32Array;
	readonly #quads: SwarmQuads = { laid: [], added: [] };

	constructor(tracks: readonly ScoreTrack[], look: LookRow, key: PigmentKey, signature: string) {
		this.palette = pigmentsFor(key, look);
		this.ink = materialInk(look);
		const slices = allocatePool(tracks);
		this.rowMap = rowChannelMap(slices);
		this.channels = slices.map(
			(slice) =>
				new Channel(
					slice,
					// One stream per channel, seeded exactly as its cell is, so a mark and
					// the form that laid it can never disagree about which cast this is.
					hashSeed(`${signature}:marks:${slice.index}`),
					this.palette,
					this.ink
				)
		);
	}

	/** Writes every channel's shape into the params buffer for the GPU to read. */
	pack(): void {
		for (const channel of this.channels) {
			packShape(this.params, channel.slice.index, channel.shape);
		}
	}

	/**
	 * Every channel's live marks as two painter-ordered lists. Farthest first, so
	 * a layer can be written straight into a buffer and drawn in one call.
	 */
	collect(tMs: number): SwarmQuads {
		this.#quads.laid.length = 0;
		this.#quads.added.length = 0;
		for (const channel of this.channels) {
			channel.marks.collect(this.#quads, channel.shape, channel.arc, tMs);
		}
		this.#quads.laid.sort(byDepth);
		this.#quads.added.sort(byDepth);
		return this.#quads;
	}

	reset(): void {
		for (const channel of this.channels) {
			channel.reset();
		}
	}
}

/** Farthest first: `depth` grows with distance from the viewer. */
function byDepth(a: { depth: number }, b: { depth: number }): number {
	return b.depth - a.depth;
}
