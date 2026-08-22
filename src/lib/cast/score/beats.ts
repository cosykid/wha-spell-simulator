/**
 * @file R-01 and R-02, the beat clock: the five windows a cast is cut into, and
 * where a millisecond sits among them.
 *
 * R-02 is the shape of this file: **only `body` stretches.** Attack and release
 * read as events, so stretching them reads as slow motion. The four fixed beats
 * add up to a constant, and a longer spell buys body time and nothing else.
 *
 * @example
 * const beats = buildBeats(totalMsFor(spellIR.duration));
 * beatAt(beats, 1100); // 'strike'
 */

import { PORTAL } from '../../portal/portal.js';
import { clamp } from '../../utils/geometry.js';
import type { Beat, BeatWindow } from '../../types.js';

/** R-01. Beat lengths in milliseconds. `body` is the elastic one and is computed. */
export const BEAT_MS = {
	// The charge beat is the portal tilt, so the paper always finishes tilting
	// before the spell erupts. One source: never restate the number.
	charge: PORTAL.tiltMs,
	strike: 320,
	release: 760,
	afterglow: 420
} as const;

/** Everything R-02 forbids stretching, summed. */
export const FIXED_MS = BEAT_MS.charge + BEAT_MS.strike + BEAT_MS.release + BEAT_MS.afterglow;

export const TOTAL_MS_RANGE = { min: 3080, max: 8480 } as const;
export const BODY_MS_RANGE = { min: 600, max: 6000 } as const;

/** The beats in performance order. */
export const BEAT_ORDER: readonly Beat[] = ['charge', 'strike', 'body', 'release', 'afterglow'];

/** R-01. `totalMs = clamp(duration * 1000, 3080, 8480)`. */
export function totalMsFor(durationSeconds: number): number {
	return clamp(durationSeconds * 1000, TOTAL_MS_RANGE.min, TOTAL_MS_RANGE.max);
}

/** R-01/R-02. The elastic beat: everything the fixed four leave over. */
export function bodyMsFor(totalMs: number): number {
	return clamp(totalMs - FIXED_MS, BODY_MS_RANGE.min, BODY_MS_RANGE.max);
}

/** The cast clock: each beat's window, laid end to end from zero. */
export function buildBeats(totalMs: number): Record<Beat, BeatWindow> {
	const lengths: Record<Beat, number> = {
		charge: BEAT_MS.charge,
		strike: BEAT_MS.strike,
		body: bodyMsFor(totalMs),
		release: BEAT_MS.release,
		afterglow: BEAT_MS.afterglow
	};
	const beats = {} as Record<Beat, BeatWindow>;
	let startMs = 0;
	for (const beat of BEAT_ORDER) {
		beats[beat] = { startMs, endMs: startMs + lengths[beat] };
		startMs += lengths[beat];
	}
	return beats;
}

/** The window spanning `from`'s start to `to`'s end, the way an envelope reads a pair. */
export function spanOf(beats: Record<Beat, BeatWindow>, from: Beat, to: Beat): BeatWindow {
	return { startMs: beats[from].startMs, endMs: beats[to].endMs };
}

/** Which beat `tMs` sits in. Times past the cast belong to `afterglow`. */
export function beatAt(beats: Record<Beat, BeatWindow>, tMs: number): Beat {
	for (const beat of BEAT_ORDER) {
		if (tMs < beats[beat].endMs) {
			return beat;
		}
	}
	return 'afterglow';
}

/** How far through a window `tMs` sits, 0 at its start and 1 at its end. */
export function progressThrough(window: BeatWindow, tMs: number): number {
	const length = window.endMs - window.startMs;
	if (length <= 0) {
		return tMs < window.startMs ? 0 : 1;
	}
	return clamp((tMs - window.startMs) / length);
}

/** Whether `beat` comes at or before `other`. Envelope windows are validated with it. */
export function beatAtOrBefore(beat: Beat, other: Beat): boolean {
	return BEAT_ORDER.indexOf(beat) <= BEAT_ORDER.indexOf(other);
}
