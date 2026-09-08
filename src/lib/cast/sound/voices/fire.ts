/**
 * @file Fire's voice row.
 *
 * Fire is a light source with a body of noise, and almost none of that noise is
 * high: a real flame is a brown roar under 400Hz with a breath of hiss over it,
 * guttering several times a second, popping as it takes hold. It drives the air
 * harder than anything but earth. The strike is a whoomph, all air and no edge,
 * because a flame has no surface to slap.
 */

import type { VoiceRow } from '../voice.js';

export const FIRE_VOICE: VoiceRow = {
	level: 1,
	body: {
		colour: 'brown',
		centerHz: 300,
		formants: [
			{ ratio: 0.3, q: 0.7, level: 1 },
			{ ratio: 1, q: 0.9, level: 0.75 },
			{ ratio: 5, q: 0.6, level: 0.3 },
			{ ratio: 12, q: 0.8, level: 0.12 }
		],
		tiltHz: 5200
	},
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
	flutter: { rateHz: 7, depth: 0.45, bandDepth: 0.25 },
	rumble: { level: 0.34, hz: 55 },
	drive: 0.25,
	space: 0.26,
	grain: { kind: 'crackle', rate: 16, durMs: 26, hz: 1500, level: 0.55 },
	strike: {
		click: 0.15,
		air: { centerHz: 700, q: 0.5, decayMs: 520, level: 1 },
		thumpHz: 88,
		thumpDecayMs: 340,
		modes: [{ hz: 62, level: 0.3, decayMs: 700 }],
		scatter: 12
	}
};
