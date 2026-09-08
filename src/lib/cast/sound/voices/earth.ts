/**
 * @file Earth's voice row.
 *
 * Earth is the sigil of might and the one element that is matter first: a brown
 * body at the bottom of the band, the heaviest floor in the table, and almost
 * no flutter, because a slab does not sway. Grit bounces off it. The strike is
 * a boulder landing, three modes deep and a scatter of chips.
 */

import type { VoiceRow } from '../voice.js';

export const EARTH_VOICE: VoiceRow = {
	level: 1,
	body: {
		colour: 'brown',
		centerHz: 110,
		formants: [
			{ ratio: 1, q: 1.1, level: 1 },
			{ ratio: 2.6, q: 0.9, level: 0.5 },
			{ ratio: 9, q: 0.7, level: 0.16 }
		],
		tiltHz: 2600
	},
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
	flutter: { rateHz: 0.25, depth: 0.12, bandDepth: 0.08 },
	rumble: { level: 0.72, hz: 40 },
	drive: 0.3,
	space: 0.3,
	grain: { kind: 'grit', rate: 11, durMs: 40, hz: 900, level: 0.5 },
	strike: {
		click: 0.35,
		air: { centerHz: 260, q: 0.7, decayMs: 520, level: 0.9 },
		thumpHz: 62,
		thumpDecayMs: 620,
		modes: [
			{ hz: 58, level: 1, decayMs: 900 },
			{ hz: 97, level: 0.5, decayMs: 420 },
			{ hz: 183, level: 0.22, decayMs: 190 }
		],
		scatter: 14
	}
};
