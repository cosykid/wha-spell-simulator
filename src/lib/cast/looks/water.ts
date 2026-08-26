/**
 * @file Water's look row. Water has body: `skin` composites `source-over`,
 * because a sheet of water reads as a surface rather than as light, and the
 * tints run deep where fire's run hot.
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
		tint: { core: [186, 238, 255], edge: FOAM },
		blend: 'lighter'
	},
	body: {
		tint: { core: FOAM, edge: DEEP },
		blend: 'lighter'
	},
	wisp: {
		tint: { core: DEEP, edge: SHADOW },
		blend: 'lighter'
	},
	ember: {
		tint: { core: [222, 246, 255], edge: FOAM },
		blend: 'lighter'
	},
	skin: {
		tint: { core: FOAM, edge: DEEP },
		blend: 'source-over'
	}
};
