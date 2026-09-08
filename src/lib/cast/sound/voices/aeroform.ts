/**
 * @file Aeroform's voice row.
 *
 * Aeroform "creates and manipulates air, but does not itself move that air".
 * Wind is a path and aeroform is a volume, so the resonances that make wind a
 * whistle are opened here into a soft veil that swells rather than gusts.
 * Nothing is thrown off and the strike is a puff.
 */

import type { VoiceRow } from '../voice.js';

export const AEROFORM_VOICE: VoiceRow = {
	level: 0.6,
	body: {
		colour: 'pink',
		centerHz: 2200,
		formants: [
			{ ratio: 0.45, q: 0.7, level: 0.7 },
			{ ratio: 1, q: 0.6, level: 1 }
		],
		tiltHz: 8000
	},
	toneMix: 0,
	tone: { baseHz: 196, partials: [[1, 1]], wave: 'sine', detuneCents: 6 },
	flutter: { rateHz: 0.3, depth: 0.28, bandDepth: 0.3 },
	rumble: { level: 0, hz: 60 },
	drive: 0,
	space: 0.3,
	grain: null,
	strike: {
		click: 0,
		air: { centerHz: 1600, q: 0.5, decayMs: 400, level: 0.75 },
		thumpHz: 0,
		thumpDecayMs: 0,
		modes: [],
		scatter: 0
	}
};
