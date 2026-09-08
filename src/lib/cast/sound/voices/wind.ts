/**
 * @file Wind's voice row.
 *
 * Wind "moves and manipulates air" and creates none, so what is heard is the
 * path rather than the parcel: pink noise through a narrow resonance that
 * wanders further than anything else in the table, because a gust is a change
 * of direction and not a change of level. Nothing is thrown off, and the strike
 * is a gust with no edge and no mass to land.
 */

import type { VoiceRow } from '../voice.js';

export const WIND_VOICE: VoiceRow = {
	level: 0.8,
	body: {
		colour: 'pink',
		centerHz: 1200,
		formants: [
			{ ratio: 0.5, q: 1.6, level: 0.7 },
			{ ratio: 1, q: 2.4, level: 1 },
			{ ratio: 2.2, q: 1.4, level: 0.4 }
		],
		tiltHz: 9000
	},
	toneMix: 0,
	tone: { baseHz: 220, partials: [[1, 1]], wave: 'sine', detuneCents: 8 },
	flutter: { rateHz: 0.45, depth: 0.5, bandDepth: 0.55 },
	rumble: { level: 0.06, hz: 80 },
	drive: 0,
	space: 0.2,
	grain: null,
	strike: {
		click: 0,
		air: { centerHz: 1000, q: 0.8, decayMs: 700, level: 0.9 },
		thumpHz: 0,
		thumpDecayMs: 0,
		modes: [],
		scatter: 0
	}
};
