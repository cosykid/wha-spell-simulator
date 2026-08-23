/**
 * @file Water's look row. Water has body: the roles run larger and rounder than
 * fire's, stretch less, and `skin` is opaque, because a sheet of water reads as
 * a surface rather than as light.
 */

import { PLACEHOLDER_MATERIAL, type LookRow } from './look.js';

const FOAM = [128, 218, 255] as const;
const DEEP = [18, 122, 218] as const;
const SHADOW = [10, 62, 122] as const;

export const WATER_LOOKS: LookRow = {
	material: PLACEHOLDER_MATERIAL,
	core: {
		sprite: 'spark',
		tint: { core: [186, 238, 255], edge: FOAM },
		sizePx: [4, 15],
		trail: { frames: 3, widthScale: 0.6 },
		blend: 'lighter',
		stretch: 0.7,
		fade: 'decay'
	},
	body: {
		sprite: 'disc',
		tint: { core: FOAM, edge: DEEP },
		sizePx: [6, 15],
		trail: { frames: 4, widthScale: 0.6 },
		blend: 'lighter',
		stretch: 1.1,
		fade: 'decay'
	},
	wisp: {
		sprite: 'disc',
		tint: { core: DEEP, edge: SHADOW },
		sizePx: [6, 14],
		trail: { frames: 5, widthScale: 0.5 },
		blend: 'lighter',
		stretch: 0.8,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: [222, 246, 255], edge: FOAM },
		sizePx: [2, 5],
		trail: { frames: 4, widthScale: 0.42 },
		blend: 'lighter',
		stretch: 2,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: FOAM, edge: DEEP },
		sizePx: [8, 15],
		trail: null,
		blend: 'source-over',
		stretch: 0.25,
		fade: 'leak'
	}
};
