/**
 * @file Light's look row. Light is pure emission: every role but `skin` is
 * additive and every tint sits near white, so a crowd of light parcels is
 * supposed to bloom into one glow rather than read as separate things.
 *
 * The dictionary makes it "a variant of the fire sigil" that "manifests as light
 * rather than ordinary flame or heat", so its material is fire with everything
 * but the emission taken away. It keeps fire's full emission and drops fire's
 * flicker, and like fire it is unbanded. Weight is the table's minimum, since
 * light has no body to accelerate.
 */

import type { LookRow } from './look.js';

const FLARE = [255, 252, 214] as const;
const GLOW = [255, 249, 180] as const;
const GOLD = [244, 214, 118] as const;

export const LIGHT_LOOKS: LookRow = {
	material: {
		emissive: 1,
		bands: 0,
		garnishDensity: 0.45,
		flicker: 0.12,
		undulation: 0.3,
		weight: 0.05
	},
	core: {
		tint: { core: [255, 255, 255], edge: FLARE },
		blend: 'lighter'
	},
	body: {
		tint: { core: FLARE, edge: GLOW },
		blend: 'lighter'
	},
	wisp: {
		tint: { core: GLOW, edge: GOLD },
		blend: 'lighter'
	},
	ember: {
		tint: { core: [255, 255, 255], edge: GOLD },
		blend: 'lighter'
	},
	skin: {
		tint: { core: FLARE, edge: GOLD },
		blend: 'source-over'
	}
};
