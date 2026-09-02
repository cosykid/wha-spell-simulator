/**
 * @file `compileSoundScore`: a `SpellScore` as a sound score, the whole cast's
 * audio laid out on the cast clock before a note of it plays.
 *
 * It is a pure function of the score, so it is unit-tested where the score is
 * and reads no clock. The stage performs the score as cells; this performs the
 * same score as loudness: one layer per sustaining track, one strike cue for
 * R-01's impulse, and the grains a substance throws off while it is loud. The
 * synth in `perform.ts` then only has to schedule what is written here.
 *
 * @example
 * const sound = compileSoundScore(compileScore(spellIR.plan, spellIR));
 * sound.layers.map((layer) => layer.kind); // ['charge', 'shimmer', 'jet', ...]
 */

import { BURST_TUNING } from '../score/tracks/burst.js';
import { scoreTracks } from '../score/compileScore.js';
import { hashSeed } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import { grainSchedule, type GrainCue } from './grains.js';
import { chargeLayer, layerFor, type SoundLayer } from './layers.js';
import { voiceRow } from './voices.js';
import type { VoiceRow } from './voice.js';
import type { Beat, BeatWindow, SpellScore } from '../../types.js';

export type { GrainCue } from './grains.js';
export type { LayerKind, Motion, SoundLayer, Sweep } from './layers.js';
export { gainAt, SAMPLE_MS } from './layers.js';

/**
 * R-01's strike. `strength` follows the burst track's own gain, which R-15
 * already floors: a cancelled seal strikes exactly as an unmarked ring does.
 */
export interface StrikeCue {
	atMs: number;
	/** 0..1, the burst's share of the loudest strike a plan can buy. */
	strength: number;
}

export interface SoundScore {
	voice: VoiceRow;
	totalMs: number;
	beats: Record<Beat, BeatWindow>;
	layers: SoundLayer[];
	strike: StrikeCue;
	grains: GrainCue[];
	/** The score's own signature. Identical signature means identical sound. */
	signature: string;
}

/** The whole cast as sound, keyed and seeded exactly as the cells are. */
export function compileSoundScore(score: SpellScore): SoundScore {
	const { beats, totalMs } = score;
	const tracks = scoreTracks(score);
	const layers: SoundLayer[] = [chargeLayer(beats, totalMs)];
	let strikeStrength: number = BURST_TUNING.floorStrength;
	for (const track of tracks) {
		if (track.kind === 'burst') {
			strikeStrength = clamp(track.emission.gain / BURST_TUNING.rate);
			continue;
		}
		const layer = layerFor(track, beats, totalMs);
		if (layer) {
			layers.push(layer);
		}
	}
	const voice = voiceRow({ sigil: score.sigil, element: score.element });
	return {
		voice,
		totalMs,
		beats,
		layers,
		strike: { atMs: beats.strike.startMs, strength: strikeStrength },
		// The seal throws nothing off before it strikes (R-01), and nothing at all
		// once the afterglow has cooled it.
		grains: grainSchedule(
			voice.grain,
			layers,
			beats.strike.startMs,
			beats.afterglow.startMs,
			hashSeed(`${score.signature}:sound`)
		),
		signature: score.signature
	};
}
