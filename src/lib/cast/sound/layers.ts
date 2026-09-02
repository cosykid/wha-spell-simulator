/**
 * @file A score track as a sound layer: the same envelope the cell performs,
 * sampled as loudness on the cast clock, plus the motion its kind gives it.
 *
 * The kind says how the sound moves, the way it says where matter goes: a jet
 * pushes and pans where it aims, an intake inhales upward through the body, a
 * vortex circles at its own spin, a hold hums and bobs. What the sound is made
 * of is the voice row's business, and nothing here reads one.
 *
 * A track's emission drops to zero the instant its window ends (R-02 makes
 * that structural), and matter goes on coasting after it. A layer coasts too:
 * past its window the loudness falls along the score's own `decay` curve, and
 * everything is silent by the end of the afterglow.
 */

import { BEAT_MS, progressThrough } from '../score/beats.js';
import { curveAt, envelopeWindow, evaluateEnvelope } from '../score/envelopes.js';
import { FAN_TUNING } from '../score/tracks/fan.js';
import { HOLD_TUNING } from '../score/tracks/hold.js';
import { INTAKE_TUNING } from '../score/tracks/intake.js';
import { JET_TUNING } from '../score/tracks/jet.js';
import { SHIMMER_TUNING } from '../score/tracks/shimmer.js';
import { VORTEX_TUNING } from '../score/tracks/vortex.js';
import { aboveFloor } from '../score/tracks/gain.js';
import { shapeOf } from '../cells/arc.js';
import { clamp } from '../../utils/geometry.js';
import type { Beat, BeatWindow, Envelope, ScoreTrack } from '../../types.js';

/** Milliseconds between loudness samples. */
export const SAMPLE_MS = 10;

/** Every kind a layer may be: the six played kinds that sustain, and R-01's charge. */
export type LayerKind = 'charge' | 'shimmer' | 'jet' | 'fan' | 'vortex' | 'hold' | 'intake';

/** The band's centre as a multiple of the row's, at the layer's start and `overMs` later. */
export interface Sweep {
	from: number;
	to: number;
	overMs: number;
}

/** How a layer moves. Motion is kind-shaped: a row never sets any of it. */
export interface Motion {
	/** Stereo position, -1 left to 1 right. */
	pan: number;
	/** Turns per second the position circles at. Zero holds still. */
	spinHz: number;
	sweep: Sweep;
	/** Amplitude tremolo in Hz, zero for none. */
	tremoloHz: number;
	/** Tone against noise for this layer, or null to take the row's own mix. */
	toneMix: number | null;
}

export interface SoundLayer {
	id: string;
	kind: LayerKind;
	startMs: number;
	/** Where the sampled loudness reaches zero and stays there. */
	endMs: number;
	/** 0..1 loudness every {@link SAMPLE_MS} from `startMs` to `endMs`. The last sample is always zero. */
	gain: number[];
	motion: Motion;
}

/** Each kind's loudness at full strength, before the row's own trim. */
const LAYER_LEVEL: Record<LayerKind, number> = {
	charge: 0.75,
	shimmer: 0.2,
	jet: 0.85,
	fan: 0.6,
	vortex: 0.75,
	hold: 0.55,
	intake: 0.7
};

/** The emission rate a kind reaches at full ink, so a faint track is a quiet layer. */
const FULL_RATE: Record<Exclude<LayerKind, 'charge'>, number> = {
	shimmer: SHIMMER_TUNING.rate,
	jet: JET_TUNING.rate,
	fan: FAN_TUNING.rate,
	vortex: VORTEX_TUNING.rate,
	hold: HOLD_TUNING.rate,
	intake: INTAKE_TUNING.rate
};

/** The quietest a track with any ink behind it sounds, as a fraction of its kind's level. */
const STRENGTH_FLOOR = 0.35;

/** How long a layer coasts past its window. The charge hands over to the strike, everything else to the release. */
const COAST_MS: Record<'charge' | 'track', number> = {
	charge: BEAT_MS.strike,
	track: BEAT_MS.release
};

const STILL: Motion = {
	pan: 0,
	spinHz: 0,
	sweep: { from: 1, to: 1, overMs: 0 },
	tremoloHz: 0,
	toneMix: null
};

const TWO_PI = Math.PI * 2;

/** A tangential rate on a circle of `radius` seal units, as turns per second. */
function turnsPerSecond(tangential: number, radius: number): number {
	return radius > 0 ? tangential / (TWO_PI * radius) : 0;
}

/** The loudness of `layer` at `tMs`, zero outside it. */
export function gainAt(layer: SoundLayer, tMs: number): number {
	const index = Math.round((tMs - layer.startMs) / SAMPLE_MS);
	return index < 0 || index >= layer.gain.length ? 0 : layer.gain[index];
}

/**
 * Loudness sampled over a window and the coast after it, cooled to silence
 * through the afterglow. `shape` is the 0..1 share of the layer's own peak at a
 * millisecond inside the window.
 */
function sampleGain(
	window: BeatWindow,
	coastMs: number,
	beats: Record<Beat, BeatWindow>,
	totalMs: number,
	level: number,
	shape: (tMs: number) => number
): { gain: number[]; endMs: number } {
	const endMs = Math.min(window.endMs + coastMs, totalMs);
	const atWindowEnd = shape(window.endMs - 1);
	const count = Math.max(2, Math.floor((endMs - window.startMs) / SAMPLE_MS) + 1);
	const gain: number[] = [];
	for (let index = 0; index < count; index += 1) {
		const tMs = window.startMs + index * SAMPLE_MS;
		const inside = tMs < window.endMs;
		const value = inside
			? shape(tMs)
			: atWindowEnd * curveAt('decay', (tMs - window.endMs) / coastMs);
		const cooling = 1 - progressThrough(beats.afterglow, tMs);
		gain.push(clamp(value * cooling * level));
	}
	gain[gain.length - 1] = 0;
	return { gain, endMs };
}

/** How a track's kind moves its layer. */
function motionFor(track: ScoreTrack): Motion {
	switch (track.kind) {
		case 'jet':
			// A push: the band rises into the beam over the strike, panned where it aims.
			return {
				...STILL,
				pan: clamp(track.params.axis.x, -1, 1) * 0.7,
				sweep: { from: 0.6, to: 1, overMs: BEAT_MS.strike }
			};
		case 'fan':
			// A sheet spreading: broad, sinking slowly, turning only if it stirs.
			return {
				...STILL,
				spinHz: turnsPerSecond(track.params.swirl, track.params.core),
				sweep: { from: 0.8, to: 0.7, overMs: BEAT_MS.release * 4 }
			};
		case 'vortex':
			return {
				...STILL,
				spinHz: turnsPerSecond(
					track.params.spin,
					(track.params.footRadius + track.params.crownRadius) / 2
				),
				sweep: { from: 0.9, to: 1.1, overMs: BEAT_MS.release * 4 }
			};
		case 'hold':
			// A held mass hums rather than hisses, and breathes at its own bob.
			return {
				...STILL,
				pan: clamp(track.params.at.x, -1, 1) * 0.5,
				spinHz: turnsPerSecond(track.params.spin, track.params.radius),
				tremoloHz: track.params.bobRate / TWO_PI,
				toneMix: 0.8
			};
		case 'intake':
			// An inhale: the band climbs the whole body long, circling if the pull twists.
			return {
				...STILL,
				pan: track.params.lateral.x * 0.4,
				spinHz: turnsPerSecond(track.params.swirl, track.params.pool),
				sweep: { from: 0.7, to: 1.6, overMs: BEAT_MS.release * 6 }
			};
		default:
			return STILL;
	}
}

/**
 * The envelope a layer follows. A hold's emission is section 6's fill
 * transient, over well inside the body, but the grip does not let go until the
 * release, and its drive is what says so.
 */
function envelopeOf(track: ScoreTrack): Envelope {
	return track.kind === 'hold' ? track.drive : track.emission;
}

/**
 * One track as a layer, or null for the burst, which is an event rather than a
 * layer and is cued by `cues.ts` as the strike.
 */
export function layerFor(
	track: ScoreTrack,
	beats: Record<Beat, BeatWindow>,
	totalMs: number
): SoundLayer | null {
	if (track.kind === 'burst') {
		return null;
	}
	const kind = track.kind;
	const envelope = envelopeOf(track);
	const window = envelopeWindow(envelope, beats);
	const strength = clamp(track.emission.gain / FULL_RATE[kind]);
	const level = LAYER_LEVEL[kind] * aboveFloor(STRENGTH_FLOOR, strength);
	const { gain, endMs } = sampleGain(window, COAST_MS.track, beats, totalMs, level, (tMs) =>
		shapeOf(evaluateEnvelope(envelope, beats, tMs), envelope.gain)
	);
	return { id: track.id, kind, startMs: window.startMs, endMs, gain, motion: motionFor(track) };
}

/**
 * R-01's charge as a layer: "ink brightens, ambient medium draws inward". No
 * track carries it, because it is the beat's content rather than the spell's,
 * so it is designed here: a swell over the whole charge, the band opening as
 * it rises, handed over to the strike.
 */
export function chargeLayer(beats: Record<Beat, BeatWindow>, totalMs: number): SoundLayer {
	const window = beats.charge;
	const { gain, endMs } = sampleGain(
		window,
		COAST_MS.charge,
		beats,
		totalMs,
		LAYER_LEVEL.charge,
		(tMs) => curveAt('swell', progressThrough(window, tMs))
	);
	return {
		id: 'charge',
		kind: 'charge',
		startMs: window.startMs,
		endMs,
		gain,
		motion: { ...STILL, sweep: { from: 0.5, to: 1.4, overMs: window.endMs - window.startMs } }
	};
}
