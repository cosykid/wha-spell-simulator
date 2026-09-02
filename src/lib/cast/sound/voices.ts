/**
 * @file `VOICES` and the one rule for reading it: sigil row, else element row,
 * else inert. The same resolution as `looks/table.ts`, for the same reason:
 * crystal is not earth and aeroform is not wind, and a row of their own is the
 * only place that difference is allowed to live.
 *
 * Each row is argued from the dictionary's `sourceNotes` the way its look row
 * is, and from the look row's own material profile where the two agree: fire
 * flickers, water swells, earth has weight, light has no body.
 *
 * Resolution never returns undefined, so nothing in the sound layer branches on
 * element. A silent element is a missing table row, not a code path.
 *
 * @example
 * const voice = voiceRow({ sigil: 'crystal', element: 'earth' });
 */

import type { ElementId } from '../../types.js';
import type { VoiceRow, VoiceTable } from './voice.js';

/**
 * Fire is a light source with a body of noise: a roar in the low mids, a
 * quick flicker on it, and the crackle the dictionary's "flame and heat" throws
 * off. The strike is a whump, low and soft-edged, because a flame has no
 * surface to slap.
 */
export const FIRE_VOICE: VoiceRow = {
	level: 0.9,
	body: { centerHz: 520, q: 0.9 },
	toneMix: 0,
	tone: {
		baseHz: 110,
		partials: [
			[1, 1],
			[2, 0.35]
		],
		wave: 'sine',
		detuneCents: 6
	},
	wobble: { rateHz: 6, depth: 0.22 },
	rumble: { level: 0.35, hz: 48 },
	grain: { kind: 'crackle', rate: 22, durMs: 14, hz: 2400, sweep: 1, level: 0.7 },
	strike: { thumpHz: 110, noise: { centerHz: 900, q: 0.7 }, toneHz: null, decayMs: 420 }
};

/**
 * Water "often collects existing water rather than generating it", so it is a
 * substance before it is an effect: a rush low and broad, swelling slowly and
 * never flickering, with bubbles rising through it. The strike is a splash,
 * bright noise over a dull thump.
 */
export const WATER_VOICE: VoiceRow = {
	level: 0.85,
	body: { centerHz: 760, q: 0.55 },
	toneMix: 0,
	tone: {
		baseHz: 130,
		partials: [
			[1, 1],
			[2, 0.25]
		],
		wave: 'sine',
		detuneCents: 5
	},
	wobble: { rateHz: 0.7, depth: 0.5 },
	rumble: { level: 0.18, hz: 60 },
	grain: { kind: 'blip', rate: 5, durMs: 90, hz: 620, sweep: 2.2, level: 0.45 },
	strike: { thumpHz: 70, noise: { centerHz: 2200, q: 0.6 }, toneHz: null, decayMs: 520 }
};

/**
 * Wind "moves and manipulates air" and creates none, so what is heard is the
 * path rather than the parcel: a narrow whistle sweeping slowly, no floor
 * under it, nothing thrown off. The strike is a gust with no thump at all,
 * because there is no mass to land.
 */
export const WIND_VOICE: VoiceRow = {
	level: 0.8,
	body: { centerHz: 1400, q: 3.2 },
	toneMix: 0,
	tone: { baseHz: 220, partials: [[1, 1]], wave: 'sine', detuneCents: 8 },
	wobble: { rateHz: 0.35, depth: 0.6 },
	rumble: { level: 0.05, hz: 70 },
	grain: null,
	strike: { thumpHz: 0, noise: { centerHz: 1200, q: 1.2 }, toneHz: null, decayMs: 600 }
};

/**
 * Earth is the sigil of might and the one element that is matter first: the
 * body sits at the bottom of the band, the floor is the heaviest in the table,
 * grit chips off it, and the strike is a thud. Its wobble is nearly nothing,
 * because a slab does not sway.
 */
export const EARTH_VOICE: VoiceRow = {
	level: 1,
	body: { centerHz: 180, q: 0.8 },
	toneMix: 0,
	tone: {
		baseHz: 55,
		partials: [
			[1, 1],
			[2, 0.4]
		],
		wave: 'sine',
		detuneCents: 4
	},
	wobble: { rateHz: 0.2, depth: 0.1 },
	rumble: { level: 0.7, hz: 38 },
	grain: { kind: 'crackle', rate: 9, durMs: 26, hz: 700, sweep: 1, level: 0.6 },
	strike: { thumpHz: 80, noise: { centerHz: 300, q: 0.8 }, toneHz: null, decayMs: 500 }
};

/**
 * Light is "a variant of the fire sigil" that "manifests as light rather than
 * ordinary flame or heat": fire with the body taken away. It is nearly all
 * tone, a chord with a slow tremolo, and its noise sits far above the roar.
 * Twinkles are the grain, and the strike rings a chime rather than landing.
 */
export const LIGHT_VOICE: VoiceRow = {
	level: 0.7,
	body: { centerHz: 6000, q: 1 },
	toneMix: 0.85,
	tone: {
		baseHz: 523.25,
		partials: [
			[1, 1],
			[1.5, 0.55],
			[2, 0.4]
		],
		wave: 'sine',
		detuneCents: 7
	},
	wobble: { rateHz: 5, depth: 0.15 },
	rumble: { level: 0, hz: 60 },
	grain: { kind: 'blip', rate: 3, durMs: 220, hz: 2093, sweep: 1, level: 0.35 },
	strike: { thumpHz: 0, noise: { centerHz: 5000, q: 2 }, toneHz: 1046.5, decayMs: 900 }
};

/**
 * Crystal "creates and manipulates crystalline objects": earth's matter with a
 * glassy voice. The tone rings inharmonic partials, the way a struck bell or a
 * glass does, with no wobble because a lattice does not wave. Tinkles fall
 * off it as the grain, and the strike is a ping.
 */
export const CRYSTAL_VOICE: VoiceRow = {
	level: 0.75,
	body: { centerHz: 3200, q: 2.4 },
	toneMix: 0.7,
	tone: {
		baseHz: 880,
		partials: [
			[1, 1],
			[2.76, 0.45],
			[5.4, 0.2]
		],
		wave: 'sine',
		detuneCents: 3
	},
	wobble: { rateHz: 0, depth: 0 },
	rumble: { level: 0.12, hz: 55 },
	grain: { kind: 'blip', rate: 6, durMs: 160, hz: 3520, sweep: 0.97, level: 0.4 },
	strike: { thumpHz: 60, noise: { centerHz: 4000, q: 3 }, toneHz: 1760, decayMs: 1200 }
};

/**
 * Aeroform "creates and manipulates air, but does not itself move that air".
 * Wind is a path and aeroform is a volume, so this row is wind's whistle opened
 * into a soft, high veil that swells slowly. Nothing is thrown off and the
 * strike is a puff.
 */
export const AEROFORM_VOICE: VoiceRow = {
	level: 0.6,
	body: { centerHz: 2600, q: 0.5 },
	toneMix: 0,
	tone: { baseHz: 196, partials: [[1, 1]], wave: 'sine', detuneCents: 6 },
	wobble: { rateHz: 0.25, depth: 0.3 },
	rumble: { level: 0, hz: 60 },
	grain: null,
	strike: { thumpHz: 0, noise: { centerHz: 1800, q: 0.5 }, toneHz: null, decayMs: 380 }
};

/**
 * The inert row: what a cast sounds like when nothing else claims it. R-11
 * rules that "manifests nothing" is a look and not an absence, and the same
 * holds here: a low draft with a faint floor, nothing thrown off, and the bare
 * shockwave for a strike. Something happened, and it had no element.
 */
export const INERT_VOICE: VoiceRow = {
	level: 0.45,
	body: { centerHz: 400, q: 0.6 },
	toneMix: 0,
	tone: { baseHz: 82, partials: [[1, 1]], wave: 'sine', detuneCents: 5 },
	wobble: { rateHz: 0.3, depth: 0.2 },
	rumble: { level: 0.2, hz: 45 },
	grain: null,
	strike: { thumpHz: 90, noise: { centerHz: 600, q: 0.8 }, toneHz: null, decayMs: 300 }
};

/**
 * Rows keyed on sigil id. The five element ids are rows too, and they are the
 * fallback tier every sigil without a row of its own lands on.
 */
export const VOICES: VoiceTable = {
	fire: FIRE_VOICE,
	water: WATER_VOICE,
	wind: WIND_VOICE,
	earth: EARTH_VOICE,
	light: LIGHT_VOICE,
	crystal: CRYSTAL_VOICE,
	aeroform: AEROFORM_VOICE
};

/** What a cast sounds from: the sigil that was drawn, and the element behind it. */
export interface VoiceKey {
	sigil: string | null;
	element: ElementId | null;
}

/**
 * The row a cast sounds from. The `table` parameter is the seam the precedence
 * tests drive; callers pass the real one by omitting it.
 */
export function voiceRow(key: VoiceKey, table: VoiceTable = VOICES): VoiceRow {
	const bySigil = key.sigil ? table[key.sigil] : undefined;
	const byElement = key.element ? table[key.element] : undefined;
	return bySigil ?? byElement ?? INERT_VOICE;
}
