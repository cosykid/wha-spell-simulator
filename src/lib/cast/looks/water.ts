/**
 * @file Water's look row. Water has body: the roles run larger and rounder than
 * fire's, stretch less, and `skin` is opaque, because a sheet of water reads as
 * a surface rather than as light.
 *
 * The dictionary says water spells "often collect existing water rather than
 * generating it from nothing", so this row is a substance before it is an
 * effect. Its material is the exact opposite of fire's: flicker is zero,
 * because water that strobes stops being water, and undulation is the table's
 * maximum, because a gathered sheet swells and rolls the whole time it is up. It
 * carries the most bands of any row, since a moving water surface shows its own
 * flow as ridges, and it is glassy rather than lit: a crisp edge, almost no
 * break-up, modest emission, and enough weight that it falls and settles.
 */

import type { LookRow } from './look.js';

const FOAM = [128, 218, 255] as const;
const DEEP = [18, 122, 218] as const;
const SHADOW = [10, 62, 122] as const;

export const WATER_LOOKS: LookRow = {
	material: {
		emissive: 0.35,
		opacity: 0.65,
		edge: 'crisp',
		bands: 7,
		noiseScale: 0.9,
		ribbonWidth: 0.26,
		garnishDensity: 0.35,
		trailPersistence: 0.4,
		flicker: 0,
		undulation: 0.9,
		weight: 0.62
	},
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
