/**
 * @file Water's voice row.
 *
 * Water "often collects existing water rather than generating it", so it is a
 * substance before it is an effect. What a body of moving water actually sounds
 * like is bubbles: the rush is pink noise, and the bubbles rising through it
 * are where the water is. The strike is a splash, a bright burst and a shower
 * of them.
 */

import type { VoiceRow } from '../voice.js';

export const WATER_VOICE: VoiceRow = {
	level: 0.85,
	body: {
		colour: 'pink',
		centerHz: 900,
		formants: [
			{ ratio: 0.35, q: 1.2, level: 0.9 },
			{ ratio: 1, q: 0.8, level: 1 },
			{ ratio: 2.6, q: 0.9, level: 0.45 }
		],
		tiltHz: 7000
	},
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
	flutter: { rateHz: 1.6, depth: 0.3, bandDepth: 0.3 },
	rumble: { level: 0.2, hz: 70 },
	drive: 0.1,
	space: 0.34,
	grain: { kind: 'bubble', rate: 15, durMs: 42, hz: 680, level: 0.4 },
	strike: {
		click: 0.3,
		air: { centerHz: 2400, q: 0.5, decayMs: 420, level: 1 },
		thumpHz: 58,
		thumpDecayMs: 260,
		modes: [],
		scatter: 26
	}
};
