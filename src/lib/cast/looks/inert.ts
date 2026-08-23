/**
 * @file The inert row: what a cast is painted as when nothing else claims it.
 *
 * R-11 rules that "manifests nothing" is a look and not an absence, so this row
 * is designed rather than defaulted. It reads as unlit matter caught in the
 * seal's draft: colorless, dim, slow to arrive and slow to leave, with long
 * trails so the motion is legible even though the parcels are not bright. A
 * viewer should see that something happened and that it had no element.
 *
 * It is also the reason `lookRow` can promise it never returns undefined, which
 * is what keeps the renderer's empty path from ever being written.
 */

import { PLACEHOLDER_MATERIAL, type LookRow } from './look.js';

const ASH = [206, 206, 199] as const;
const SLATE = [126, 130, 132] as const;
const VOID_INK = [58, 62, 66] as const;

export const INERT_LOOKS: LookRow = {
	material: PLACEHOLDER_MATERIAL,
	core: {
		sprite: 'spark',
		tint: { core: [222, 224, 218], edge: ASH },
		sizePx: [4, 13],
		trail: { frames: 3, widthScale: 0.55 },
		blend: 'lighter',
		stretch: 0.6,
		fade: 'decay'
	},
	body: {
		sprite: 'disc',
		tint: { core: ASH, edge: SLATE },
		sizePx: [5, 12],
		trail: { frames: 5, widthScale: 0.5 },
		blend: 'lighter',
		stretch: 0.9,
		fade: 'leak'
	},
	wisp: {
		sprite: 'disc',
		tint: { core: SLATE, edge: VOID_INK },
		sizePx: [5, 11],
		trail: { frames: 6, widthScale: 0.45 },
		blend: 'lighter',
		stretch: 0.8,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: ASH, edge: SLATE },
		sizePx: [2, 4],
		trail: { frames: 4, widthScale: 0.4 },
		blend: 'lighter',
		stretch: 1.8,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: SLATE, edge: VOID_INK },
		sizePx: [7, 13],
		trail: null,
		blend: 'source-over',
		stretch: 0.2,
		fade: 'leak'
	}
};
