/**
 * @file Crystal's voice row.
 *
 * Crystal "creates and manipulates crystalline objects": earth's matter with a
 * glassy voice. Struck glass is inharmonic modes whose highs die first, and
 * that unequal decay is the whole difference between glass and a beep. The
 * lattice does not wave, so there is nearly no flutter, and tinkles fall off it.
 */

import type { VoiceRow } from '../voice.js';

export const CRYSTAL_VOICE: VoiceRow = {
	level: 0.75,
	body: {
		colour: 'white',
		centerHz: 3600,
		formants: [
			{ ratio: 1, q: 3, level: 1 },
			{ ratio: 2.1, q: 2.6, level: 0.45 }
		],
		tiltHz: 14000
	},
	toneMix: 0.72,
	tone: {
		baseHz: 880,
		partials: [
			[1, 1],
			[2.76, 0.4],
			[5.4, 0.18],
			[8.93, 0.07]
		],
		wave: 'sine',
		detuneCents: 3
	},
	flutter: { rateHz: 0.8, depth: 0.06, bandDepth: 0.02 },
	rumble: { level: 0.12, hz: 60 },
	drive: 0,
	space: 0.45,
	grain: { kind: 'chime', rate: 6, durMs: 220, hz: 3520, level: 0.32 },
	strike: {
		click: 0.5,
		air: { centerHz: 5200, q: 2.5, decayMs: 260, level: 0.8 },
		thumpHz: 70,
		thumpDecayMs: 120,
		modes: [
			{ hz: 1760, level: 1, decayMs: 1800 },
			{ hz: 4858, level: 0.4, decayMs: 700 },
			{ hz: 9504, level: 0.14, decayMs: 260 }
		],
		scatter: 16
	}
};
