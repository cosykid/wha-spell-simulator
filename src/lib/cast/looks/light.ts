/**
 * @file Light's look row. Light is pure emission, so every role is additive,
 * runs the largest sizes in the table, and leans on overlap rather than on
 * trails: a crowd of light parcels is supposed to bloom into one glow.
 */

import { PLACEHOLDER_MATERIAL, type LookRow } from './look.js';

const FLARE = [255, 252, 214] as const;
const GLOW = [255, 249, 180] as const;
const GOLD = [244, 214, 118] as const;

export const LIGHT_LOOKS: LookRow = {
	material: PLACEHOLDER_MATERIAL,
	core: {
		sprite: 'spark',
		tint: { core: [255, 255, 255], edge: FLARE },
		sizePx: [5, 18],
		trail: { frames: 2, widthScale: 0.7 },
		blend: 'lighter',
		stretch: 0.5,
		fade: 'decay'
	},
	body: {
		sprite: 'disc',
		tint: { core: FLARE, edge: GLOW },
		sizePx: [7, 18],
		trail: { frames: 3, widthScale: 0.65 },
		blend: 'lighter',
		stretch: 0.8,
		fade: 'decay'
	},
	wisp: {
		sprite: 'disc',
		tint: { core: GLOW, edge: GOLD },
		sizePx: [7, 16],
		trail: { frames: 4, widthScale: 0.55 },
		blend: 'lighter',
		stretch: 0.6,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: [255, 255, 255], edge: GOLD },
		sizePx: [2, 6],
		trail: { frames: 4, widthScale: 0.45 },
		blend: 'lighter',
		stretch: 2,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: FLARE, edge: GOLD },
		sizePx: [9, 16],
		trail: null,
		blend: 'source-over',
		stretch: 0.2,
		fade: 'leak'
	}
};
