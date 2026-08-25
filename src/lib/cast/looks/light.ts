/**
 * @file Light's look row. Light is pure emission, so every role is additive,
 * runs the largest sizes in the table, and leans on overlap rather than on
 * trails: a crowd of light parcels is supposed to bloom into one glow.
 *
 * The dictionary makes it "a variant of the fire sigil" that "manifests as light
 * rather than ordinary flame or heat", so its material is fire with everything
 * but the emission taken away. It keeps fire's full emission and drops fire's
 * texture: it is the one row with no procedural break-up at all, it does not
 * flicker, it is unbanded, and its edge is crisp, because a beam ends where it
 * ends. Weight is the table's minimum, since light has no body to accelerate,
 * and its afterimage is long, because a glow outlives the thing that made it.
 */

import type { LookRow } from './look.js';

const FLARE = [255, 252, 214] as const;
const GLOW = [255, 249, 180] as const;
const GOLD = [244, 214, 118] as const;

export const LIGHT_LOOKS: LookRow = {
	material: {
		emissive: 1,
		opacity: 0.45,
		edge: 'crisp',
		bands: 0,
		noiseScale: 0,
		ribbonWidth: 0.2,
		garnishDensity: 0.45,
		trailPersistence: 0.7,
		flicker: 0.12,
		undulation: 0.3,
		weight: 0.05
	},
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
