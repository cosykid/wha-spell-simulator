/**
 * @file The energy arc every cell shares, read off R-01's beats rather than
 * hand-timed against a clock.
 *
 * Everything here is a pure function of one {@link CellFrame}, so it holds no
 * state and cannot drift between a fresh replay and an incremental one.
 */

import { PUNCH } from '../volume/tuning.js';
import { clamp } from '../../utils/geometry.js';
import type { Beat } from '../../types.js';
import type { CellFrame } from './cell.js';

/** How the beats shape a quantity. One entry per beat, `t` its own progress. */
export type BeatShape = Record<Beat, (t: number) => number>;

/** Reads a beat table at this frame. */
export function shapeAt(table: BeatShape, frame: CellFrame): number {
	return table[frame.beat](frame.beatT);
}

/**
 * An envelope as a 0..1 share of its own peak. A cell wants the _shape_ of its
 * emission rather than its parcels-per-second, because the substrate's density
 * is a fraction of a fixed pool.
 */
export function shapeOf(value: number, gain: number): number {
	return gain > 0 ? clamp(value / gain) : 0;
}

/**
 * The strike's overpressure, 0..1. A spike that is over well inside the 320ms
 * strike beat: the punch has to read as an event, and anything still rising at
 * the body reads as a slug instead. The beat never stretches (R-02), so a
 * fraction of it is a fixed number of milliseconds.
 */
export function punchAt(frame: CellFrame): number {
	if (frame.beat !== 'strike' || frame.beatT > PUNCH.windowT) {
		return 0;
	}
	// Arriving over a few frames rather than one, so the front has a spread of
	// ages in it and never lands as a single flat tone.
	return clamp(frame.beatT / PUNCH.riseT) * Math.exp(-frame.beatT / PUNCH.fallT);
}

/** How much of the cast has cooled to smoke, 0..1. It cools the pigment. */
export function sootAt(frame: CellFrame): number {
	switch (frame.beat) {
		case 'charge':
		case 'strike':
			return 0;
		case 'body':
			return 0.15 * frame.beatT;
		case 'release':
			return 0.15 + 0.6 * frame.beatT;
		case 'afterglow':
			return 0.75 + 0.25 * frame.beatT;
	}
}

/**
 * How fast a parcel burns through its own life. One while the spell is fed;
 * rising through the release, so the mass already in the air cools and thins
 * instead of hanging on past the cast.
 */
export function burnAt(frame: CellFrame): number {
	if (frame.beat === 'release') {
		return 1 + 3.1 * frame.beatT * frame.beatT;
	}
	return frame.beat === 'afterglow' ? 4.1 + 2 * frame.beatT : 1;
}
