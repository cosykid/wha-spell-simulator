/**
 * @file Wind's look row. Air has no body of its own: every role is faint, wide
 * and heavily trailed, so what the viewer reads is the path rather than the
 * parcel. `skin` still carries a surface, because wind manipulates something
 * visible even when it manifests nothing itself (R-11).
 */

import { PLACEHOLDER_MATERIAL, type LookRow } from './look.js';

const AIR = [224, 248, 231] as const;
const HAZE = [184, 232, 215] as const;
const DUST = [140, 186, 178] as const;

export const WIND_LOOKS: LookRow = {
	material: PLACEHOLDER_MATERIAL,
	core: {
		sprite: 'spark',
		tint: { core: [222, 252, 240], edge: AIR },
		sizePx: [4, 14],
		trail: { frames: 4, widthScale: 0.58 },
		blend: 'lighter',
		stretch: 1.2,
		fade: 'decay'
	},
	body: {
		sprite: 'streak',
		tint: { core: AIR, edge: HAZE },
		sizePx: [4, 12],
		trail: { frames: 6, widthScale: 0.55 },
		blend: 'lighter',
		stretch: 2.2,
		fade: 'decay'
	},
	wisp: {
		sprite: 'streak',
		tint: { core: HAZE, edge: DUST },
		sizePx: [4, 11],
		trail: { frames: 6, widthScale: 0.5 },
		blend: 'lighter',
		stretch: 2.6,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: AIR, edge: HAZE },
		sizePx: [2, 5],
		trail: { frames: 5, widthScale: 0.4 },
		blend: 'lighter',
		stretch: 3,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: HAZE, edge: DUST },
		sizePx: [7, 13],
		trail: null,
		blend: 'source-over',
		stretch: 0.3,
		fade: 'leak'
	}
};
