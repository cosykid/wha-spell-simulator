/**
 * @file How the one tracer budget is divided among a cast's tracks: once, when
 * the cast is built, from numbers every track declares up front. A five-track
 * spell costs what a one-track spell costs, and a share that moved with the
 * live population would make one cell's state a function of another's, which
 * the cell contract forbids. A seat allocation is not a conversation.
 */

import { TRACER_BUDGET } from './tuning.js';
import type { PlayedKind, ScoreTrack } from '../../types.js';

/**
 * How much of the frame each archetype has to fill. A column or a whirl is the
 * subject of its own cast; the strike is loud but brief; the medium is the
 * room the shot is lit in and may never out-read what it surrounds.
 */
const KIND_WEIGHT: Record<PlayedKind, number> = {
	jet: 1,
	fan: 0.9,
	vortex: 1,
	burst: 0.5,
	hold: 0.7,
	intake: 0.75,
	shimmer: 0.3
};

/** Emission gain at which a track's own demand reads half as loud as it can. */
const HALF_GAIN = 120;

/** Tracers the thinnest channel still seats, so nothing is starved out. */
const MIN_SEATS = 90;

function demand(track: ScoreTrack): number {
	const gain = Math.abs(track.emission.gain);
	return KIND_WEIGHT[track.kind] * (0.35 + (0.65 * gain) / (gain + HALF_GAIN));
}

/** Tracer seats per track, in track order, summing to the budget. */
export function allocateSeats(tracks: readonly ScoreTrack[]): number[] {
	const demands = tracks.map(demand);
	const total = demands.reduce((sum, one) => sum + one, 0) || 1;
	const seats = demands.map((one) =>
		Math.max(MIN_SEATS, Math.floor((one / total) * TRACER_BUDGET))
	);
	const used = seats.reduce((sum, one) => sum + one, 0);
	if (used < TRACER_BUDGET) {
		// Hand the rounding remainder to the hungriest channel rather than losing it.
		seats[demands.indexOf(Math.max(...demands))] += TRACER_BUDGET - used;
	} else if (used > TRACER_BUDGET) {
		// Only reachable when the floors add up past the budget on a very crowded
		// score. Trim the hungriest, which is the one that can spare it.
		let over = used - TRACER_BUDGET;
		for (let i = 0; i < seats.length && over > 0; i += 1) {
			const spare = Math.min(over, seats[i] - MIN_SEATS);
			seats[i] -= spare;
			over -= spare;
		}
	}
	return seats;
}
