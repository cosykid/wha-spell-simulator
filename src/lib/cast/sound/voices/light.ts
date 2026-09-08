/**
 * @file Light's voice row.
 *
 * Light is "a variant of the fire sigil" that "manifests as light rather than
 * ordinary flame or heat": fire with the body taken away. Nothing in the world
 * sounds like light, so the row is built from what light is like rather than
 * what it is made of, and everything physical is spent on the room: the most
 * reverberant row in the table, mostly tone, with sparks blooming out of it.
 */

import type { VoiceRow } from '../voice.js';

export const LIGHT_VOICE: VoiceRow = {
	level: 0.7,
	body: {
		colour: 'white',
		centerHz: 5200,
		formants: [
			{ ratio: 1, q: 1.2, level: 1 },
			{ ratio: 1.7, q: 1, level: 0.45 }
		],
		tiltHz: 12000
	},
	toneMix: 0.8,
	tone: {
		baseHz: 523.25,
		partials: [
			[1, 1],
			[1.5, 0.5],
			[2, 0.35],
			[4.2, 0.12]
		],
		wave: 'sine',
		detuneCents: 7
	},
	flutter: { rateHz: 3, depth: 0.18, bandDepth: 0.1 },
	rumble: { level: 0, hz: 60 },
	drive: 0,
	space: 0.55,
	grain: { kind: 'spark', rate: 4, durMs: 320, hz: 2093, level: 0.3 },
	strike: {
		click: 0.12,
		air: { centerHz: 6000, q: 1, decayMs: 900, level: 0.7 },
		thumpHz: 0,
		thumpDecayMs: 0,
		modes: [
			{ hz: 1046.5, level: 1, decayMs: 1500 },
			{ hz: 1568, level: 0.45, decayMs: 900 },
			{ hz: 2093, level: 0.3, decayMs: 520 }
		],
		scatter: 8
	}
};
