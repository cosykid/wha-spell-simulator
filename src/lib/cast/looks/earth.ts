/**
 * @file Earth's look row. Earth is the one element that is not light: `body`,
 * `skin` and `wisp` composite `source-over` so a grain occludes the grain behind
 * it instead of glowing through it, and only the strike keeps an additive core.
 * Trails are short, because a clod does not smear.
 */

import { PLACEHOLDER_MATERIAL, type LookRow } from './look.js';

const GRIT = [214, 189, 148] as const;
const LOAM = [111, 83, 45] as const;
const SHALE = [66, 50, 32] as const;

export const EARTH_LOOKS: LookRow = {
	material: PLACEHOLDER_MATERIAL,
	core: {
		sprite: 'spark',
		tint: { core: [255, 210, 138], edge: GRIT },
		sizePx: [4, 14],
		trail: { frames: 2, widthScale: 0.55 },
		blend: 'lighter',
		stretch: 0.5,
		fade: 'decay'
	},
	body: {
		sprite: 'disc',
		tint: { core: GRIT, edge: LOAM },
		sizePx: [6, 13],
		trail: null,
		blend: 'source-over',
		stretch: 0.35,
		fade: 'decay'
	},
	wisp: {
		sprite: 'disc',
		tint: { core: LOAM, edge: SHALE },
		sizePx: [4, 10],
		trail: { frames: 2, widthScale: 0.45 },
		blend: 'source-over',
		stretch: 0.4,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: GRIT, edge: LOAM },
		sizePx: [2, 5],
		trail: { frames: 3, widthScale: 0.4 },
		blend: 'lighter',
		stretch: 1.6,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: GRIT, edge: SHALE },
		sizePx: [8, 14],
		trail: null,
		blend: 'source-over',
		stretch: 0.15,
		fade: 'leak'
	}
};
