/**
 * @file The grain schedule: when a substance throws something off, and at what
 * pitch. Crackle for fire and earth, bubbles for water, twinkles for light,
 * tinkles for crystal.
 *
 * Phase-locked patterning, the cells' own law: a grain is only ever thrown off
 * the manifestation while it is loud, so the schedule is drawn against the
 * layers' own gain and thins with them. The draw is seeded from the score
 * signature through the cast's one `Rng`, so the same spell always crackles the
 * same way and nothing here reads a clock.
 */

import { mulberry32 } from '../rng.js';
import type { Grain } from './voice.js';
import { gainAt, type SoundLayer } from './layers.js';

/** One grain on the cast clock. */
export interface GrainCue {
	atMs: number;
	durMs: number;
	hz: number;
	level: number;
}

/** Semitones of pitch scatter either side of the row's own grain pitch. */
const PITCH_SCATTER = { crackle: 12, blip: 5 } as const;

/** Grain length scatter, as a fraction of the row's own length either way. */
const LENGTH_SCATTER = 0.3;

/** The quietest a grain is thrown at, as a fraction of the row's level. */
const LEVEL_FLOOR = 0.5;

/**
 * The manifestation's own loudness at `tMs`: the loudest of the layers the seal
 * itself performs. The charge swell and the ambient medium are the world, not
 * the spell, so they throw nothing off.
 */
function manifestedLoudness(layers: readonly SoundLayer[], tMs: number): number {
	let loudest = 0;
	for (const layer of layers) {
		if (layer.kind === 'charge' || layer.kind === 'shimmer') {
			continue;
		}
		loudest = Math.max(loudest, gainAt(layer, tMs));
	}
	return loudest;
}

/**
 * Draws the grains a cast throws off between `fromMs` and `toMs`. One slot per
 * `1 / rate` seconds, each kept with a probability equal to the manifestation's
 * loudness at that moment, so a faint plume barely crackles and a full beam
 * crackles at the row's own rate.
 */
export function grainSchedule(
	grain: Grain | null,
	layers: readonly SoundLayer[],
	fromMs: number,
	toMs: number,
	seed: number
): GrainCue[] {
	if (!grain || grain.rate <= 0) {
		return [];
	}
	const rng = mulberry32(seed);
	const slotMs = 1000 / grain.rate;
	const scatter = PITCH_SCATTER[grain.kind];
	const cues: GrainCue[] = [];
	for (let slot = fromMs; slot < toMs; slot += slotMs) {
		// Every slot draws the same five numbers whether or not it keeps the grain,
		// so a change in loudness moves only the grains it should.
		const jitter = rng();
		const keep = rng();
		const pitch = rng();
		const length = rng();
		const level = rng();
		const atMs = slot + jitter * slotMs;
		if (atMs >= toMs || keep >= manifestedLoudness(layers, atMs)) {
			continue;
		}
		cues.push({
			atMs: Math.round(atMs),
			durMs: grain.durMs * (1 + (length * 2 - 1) * LENGTH_SCATTER),
			hz: grain.hz * Math.pow(2, ((pitch * 2 - 1) * scatter) / 12),
			level: grain.level * (LEVEL_FLOOR + (1 - LEVEL_FLOOR) * level)
		});
	}
	return cues;
}
