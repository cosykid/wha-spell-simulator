/**
 * @file The inert voice row: what a cast sounds like when nothing else claims it.
 *
 * R-11 rules that "manifests nothing" is a look and not an absence, and the same
 * holds here. A low draft with a faint floor, nothing thrown off, and a dull
 * shockwave for a strike. Something happened, and it had no element.
 */

import type { VoiceRow } from '../voice.js';

export const INERT_VOICE: VoiceRow = {
	level: 0.45,
	body: {
		colour: 'brown',
		centerHz: 420,
		formants: [
			{ ratio: 0.5, q: 0.8, level: 0.7 },
			{ ratio: 1, q: 0.7, level: 1 }
		],
		tiltHz: 4000
	},
	toneMix: 0,
	tone: { baseHz: 82, partials: [[1, 1]], wave: 'sine', detuneCents: 5 },
	flutter: { rateHz: 0.35, depth: 0.25, bandDepth: 0.2 },
	rumble: { level: 0.22, hz: 48 },
	drive: 0.15,
	space: 0.25,
	grain: null,
	strike: {
		click: 0.25,
		air: { centerHz: 600, q: 0.7, decayMs: 320, level: 0.85 },
		thumpHz: 85,
		thumpDecayMs: 280,
		modes: [],
		scatter: 0
	}
};
