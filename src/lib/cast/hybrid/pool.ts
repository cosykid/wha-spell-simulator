/**
 * @file How the one shared pool is divided among a cast's tracks.
 *
 * The substrate carries a fixed budget of parcels and brush marks whatever the
 * score asks for, so a five-track spell costs what a one-track spell costs. That
 * is the whole reason a shared substrate is worth having, and it is why the
 * division happens **once, when the cast is built**, from numbers every track
 * declares up front.
 *
 * Allocating once rather than per step matters for more than speed: a share that
 * moved with the live population would make one cell's state a function of
 * another's, and a cell may feel only its own track. A seat allocation is not a
 * conversation.
 */

import { MARK, SIM_SIZE } from './tuning.js';
import { MAX_CHANNELS } from './params.js';
import type { PlayedKind, ScoreTrack } from '../../types.js';

/**
 * How much of the frame each archetype has to fill. A column and a whirl are the
 * subject of their own cast; a strike is loud but brief; the medium is the room
 * the shot is lit in and may never out-read what it surrounds.
 */
const KIND_WEIGHT: Record<PlayedKind, number> = {
	jet: 1,
	fan: 0.9,
	vortex: 1,
	burst: 0.55,
	hold: 0.6,
	intake: 0.8,
	shimmer: 0.35
};

/** Emission gain at which a track's own demand reads half as loud as it can. */
const HALF_GAIN = 120;

/** Parcel-texture rows the thinnest channel still gets, so nothing is starved out. */
const MIN_ROWS = 6;

/** Marks the thinnest channel still gets. */
const MIN_MARKS = 40;

/** One track's seat at the substrate. Fixed for the life of the cast. */
export interface PoolSlice {
	/** Row of the params texture this channel's shape is written to. */
	index: number;
	/** First parcel-texture row this channel owns, and how many. */
	rowStart: number;
	rowCount: number;
	/** Parcels that follows from the rows. */
	parcels: number;
	/** Brush marks this channel's pool may hold at once. */
	marks: number;
}

function demand(track: ScoreTrack): number {
	const gain = Math.abs(track.emission.gain);
	return KIND_WEIGHT[track.kind] * (0.35 + (0.65 * gain) / (gain + HALF_GAIN));
}

/**
 * Divides the pool among a score's tracks by what each one has to fill.
 *
 * A score past {@link MAX_CHANNELS} tracks would overrun the params texture, so
 * the tail is dropped rather than silently wrapping onto another channel's row.
 * No plan in the corpus reaches it: the most any seal resolves is five.
 */
export function allocatePool(tracks: readonly ScoreTrack[]): PoolSlice[] {
	const kept = tracks.slice(0, MAX_CHANNELS);
	const demands = kept.map(demand);
	const total = demands.reduce((sum, one) => sum + one, 0) || 1;

	const rows = demands.map((one) => Math.max(MIN_ROWS, Math.floor((one / total) * SIM_SIZE)));
	// Hand the rounding remainder to the hungriest channel rather than losing it.
	const used = rows.reduce((sum, one) => sum + one, 0);
	if (used < SIM_SIZE) {
		const biggest = demands.indexOf(Math.max(...demands));
		rows[biggest] += SIM_SIZE - used;
	} else if (used > SIM_SIZE) {
		// Only reachable at the channel ceiling, where the floors add up past the
		// texture. Trim the hungriest, which is the one that can spare it.
		let over = used - SIM_SIZE;
		for (let i = 0; i < rows.length && over > 0; i += 1) {
			const spare = Math.min(over, rows[i] - MIN_ROWS);
			rows[i] -= spare;
			over -= spare;
		}
	}

	let rowStart = 0;
	return kept.map((track, index) => {
		const rowCount = rows[index];
		const slice: PoolSlice = {
			index,
			rowStart,
			rowCount,
			parcels: rowCount * SIM_SIZE,
			marks: Math.max(MIN_MARKS, Math.round((demands[index] / total) * MARK.pool))
		};
		rowStart += rowCount;
		return slice;
	});
}

/**
 * The row-to-channel map the parcel programs look their own shape up through,
 * as one texel per parcel-texture row. Normalised, because a byte texture is the
 * only kind every context filters the same way.
 */
export function rowChannelMap(slices: readonly PoolSlice[]): Float32Array {
	const data = new Float32Array(SIM_SIZE);
	for (const slice of slices) {
		for (let row = slice.rowStart; row < slice.rowStart + slice.rowCount; row += 1) {
			data[row] = slice.index / MAX_CHANNELS;
		}
	}
	return data;
}
