/**
 * @file The energy arc, hand-timed over the compiled score's beats.
 *
 * The score says where the beats fall; how hard each one hits is authored here,
 * because the bake-off is judging a read, not a physics term. The shape is the
 * brief: a quiet gathering charge, a hard punch on the strike, a roaring body
 * that breathes rather than holds, and a decay that cools to soot.
 */

import type { Beat, BeatWindow } from '$lib/types.js';

/** How the column is being driven at one instant of the cast. */
export interface ArcSample {
	/** Strokes per second the column is born at. */
	emission: number;
	/** Velocity scale on the flow field. */
	drive: number;
	/** 0 while the fire is fed, 1 once it is only smoke. Cools the pigment. */
	soot: number;
	/** Extra alpha and size on the strike, so the punch reads as an impact. */
	punch: number;
	/** 0 during the charge, 1 once the column is alive. */
	risen: number;
}

/** Milliseconds of the strike the punch is concentrated into. */
const PUNCH_MS = 190;

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function progress(window: BeatWindow, tMs: number): number {
	const span = window.endMs - window.startMs;
	return span <= 0 ? 1 : clamp01((tMs - window.startMs) / span);
}

function easeOut(u: number): number {
	return 1 - (1 - u) * (1 - u);
}

/**
 * The arc at `tMs` on the cast clock. Every branch is one beat, in order, so the
 * whole shape is readable top to bottom.
 */
export function sampleArc(beats: Record<Beat, BeatWindow>, tMs: number): ArcSample {
	if (tMs < beats.charge.endMs) {
		// Quiet buildup: ambient pigment washes inward over the tilting paper and
		// a few embers wake on the ring. Nothing has erupted yet.
		const u = progress(beats.charge, tMs);
		return {
			emission: 20 + 78 * u ** 1.6,
			drive: 0.22 + 0.3 * u,
			soot: 0.5 - 0.34 * u,
			punch: 0,
			risen: 0.06 * u
		};
	}

	if (tMs < beats.strike.endMs) {
		// The punch. A wall of pigment is thrown at once, then the rate falls off
		// fast so the strike reads as an event and not as a longer body.
		const since = tMs - beats.strike.startMs;
		const spike = Math.exp(-since / (PUNCH_MS * 0.42));
		const u = progress(beats.strike, tMs);
		return {
			emission: 120 + 1750 * spike,
			drive: 1.05 + 1.65 * spike,
			soot: 0,
			punch: spike,
			risen: easeOut(u)
		};
	}

	if (tMs < beats.body.endMs) {
		// The roar. Emission breathes so the mass never settles into a shape, and
		// the column keeps climbing slightly through the beat.
		const u = progress(beats.body, tMs);
		const breath = 1 + 0.17 * Math.sin(u * 17.3) + 0.09 * Math.sin(u * 41.1 + 1.7);
		return {
			emission: (430 - 70 * u) * breath,
			drive: (1.02 + 0.1 * u) * (1 + 0.07 * Math.sin(u * 23.7 + 0.4)),
			soot: 0.16 * u,
			punch: 0,
			risen: 1
		};
	}

	if (tMs < beats.release.endMs) {
		// Decay. The feed is cut and the column starves from the bottom up.
		const u = progress(beats.release, tMs);
		return {
			emission: 284 * (1 - u) * (1 - u) * (1 - u),
			drive: 1.12 - 0.5 * u,
			soot: 0.16 + 0.62 * u,
			punch: 0,
			risen: 1 - 0.35 * u
		};
	}

	const u = progress(beats.afterglow, tMs);
	return {
		emission: 0,
		drive: 0.62 - 0.34 * u,
		soot: 0.78 + 0.22 * u,
		punch: 0,
		risen: 0.65 * (1 - u)
	};
}
