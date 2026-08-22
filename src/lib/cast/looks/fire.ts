/**
 * @file Fire's look row. Fire is a light source, so every role but `skin` is
 * additive, stretches hard, and trails: a flame reads as motion smeared over
 * the frame it was in.
 *
 * The tints are carried over from the field renderer's palette so the phase 5
 * cutover changes a spell's motion without changing its color.
 */

import type { LookRow } from './look.js';

const HOT = [255, 242, 160] as const;
const FLAME = [243, 116, 43] as const;
const SMOKE = [120, 62, 38] as const;

export const FIRE_LOOKS: LookRow = {
	core: {
		sprite: 'spark',
		tint: { core: [255, 238, 186], edge: HOT },
		sizePx: [4, 16],
		trail: { frames: 3, widthScale: 0.62 },
		blend: 'lighter',
		stretch: 0.9,
		fade: 'decay'
	},
	body: {
		sprite: 'disc',
		tint: { core: HOT, edge: FLAME },
		sizePx: [6, 16],
		trail: { frames: 4, widthScale: 0.58 },
		blend: 'lighter',
		stretch: 1.4,
		fade: 'decay'
	},
	wisp: {
		sprite: 'disc',
		tint: { core: FLAME, edge: SMOKE },
		sizePx: [7, 15],
		trail: { frames: 5, widthScale: 0.5 },
		blend: 'lighter',
		stretch: 1,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: [255, 232, 150], edge: FLAME },
		sizePx: [2, 6],
		trail: { frames: 4, widthScale: 0.45 },
		blend: 'lighter',
		stretch: 2.4,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: FLAME, edge: SMOKE },
		sizePx: [8, 14],
		trail: null,
		blend: 'source-over',
		stretch: 0.2,
		fade: 'leak'
	}
};
