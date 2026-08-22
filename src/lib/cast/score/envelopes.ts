/**
 * @file The six curves an {@link Envelope} may take, and how an envelope is read
 * at a millisecond on the cast clock.
 *
 * A curve is a pure shaping function on `u`, the fraction of the way through the
 * envelope's window. Gain is separate on purpose: the curve says _when_ a track
 * is loud and the gain says _how_ loud, so R-08's "lower gain, longer body" is
 * two independent edits rather than one fudged number.
 *
 * | curve  | u=0 | u=1 | shape                                          |
 * | ------ | --- | --- | ---------------------------------------------- |
 * | attack | 0   | 1   | quick onset, then flattens                     |
 * | hold   | 1   | 1   | flat                                           |
 * | decay  | 1   | 0   | falls fast, gone early                         |
 * | pulse  | 0   | 0   | one half-sine hump, peaking at the middle      |
 * | leak   | 1   | 0   | falls slowly, still half strength past halfway |
 * | swell  | 0   | 1   | slow start, arrives late                       |
 *
 * @example
 * evaluateEnvelope({ from: 'strike', to: 'body', curve: 'attack', gain: 150 }, beats, 1400);
 */

import { progressThrough, spanOf } from './beats.js';
import { clamp } from '../../utils/geometry.js';
import type { Beat, BeatWindow, CurveId, Envelope } from '../../types.js';

type Curve = (u: number) => number;

/** The curve table. Every entry is pure, defined on 0..1, and peaks at 1. */
export const CURVES: Record<CurveId, Curve> = {
	attack: (u) => 1 - (1 - u) * (1 - u),
	hold: () => 1,
	decay: (u) => (1 - u) * (1 - u),
	pulse: (u) => Math.sin(Math.PI * u),
	// R-08's leak: the square root keeps a dispersion track alive well past the
	// point `decay` has given up, which is what "longer body" means in time.
	leak: (u) => Math.sqrt(1 - u),
	swell: (u) => u * u
};

/** The curve's shape at `u`, with `u` clamped into the window it belongs to. */
export function curveAt(curve: CurveId, u: number): number {
	return CURVES[curve](clamp(u));
}

/** The beat-clock window an envelope covers, from its `from` beat to its `to` beat. */
export function envelopeWindow(envelope: Envelope, beats: Record<Beat, BeatWindow>): BeatWindow {
	return spanOf(beats, envelope.from, envelope.to);
}

/**
 * The envelope's value at `tMs`: zero outside its window, `gain * curve(u)`
 * inside it. Outside-is-zero is what makes R-02 structural — a track whose
 * emission ends at `body` cannot emit one parcel into `release`.
 */
export function evaluateEnvelope(
	envelope: Envelope,
	beats: Record<Beat, BeatWindow>,
	tMs: number
): number {
	const window = envelopeWindow(envelope, beats);
	if (tMs < window.startMs || tMs >= window.endMs) {
		return 0;
	}
	return envelope.gain * curveAt(envelope.curve, progressThrough(window, tMs));
}
