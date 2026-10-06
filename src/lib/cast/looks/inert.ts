/**
 * @file The inert row: what a cast is painted as when nothing else claims it.
 *
 * R-11 rules that "manifests nothing" is a look and not an absence, so this row
 * is designed rather than defaulted. It reads as unlit matter caught in the
 * seal's draft: colorless, dim, slow to arrive and slow to leave. A viewer
 * should see that something happened and that it had no element.
 *
 * It is also the reason `lookRow` can promise it never returns undefined, which
 * is what keeps the renderer's empty path from ever being written.
 *
 * The material is designed to lose every comparison it can lose. Emission and
 * garnish budget are the table's minimum, because nothing lit is being made and
 * nothing is being thrown off. Its swell sits low, and its weight is middling,
 * which is what makes it slow to arrive and slow to leave. Faint is not absent,
 * but that half of R-11 is the score's to keep rather than this row's: every
 * score strikes, and a seal that manifests nothing still gets a designed default.
 */

import type { LookRow } from './look.js';

const ASH = [206, 206, 199] as const;
const SLATE = [126, 130, 132] as const;
const VOID_INK = [58, 62, 66] as const;

export const INERT_LOOKS: LookRow = {
	material: {
		emissive: 0.02,
		bands: 0,
		garnishDensity: 0.1,
		flicker: 0.08,
		undulation: 0.2,
		weight: 0.5
	},
	core: {
		tint: { core: [222, 224, 218], edge: ASH },
		blend: 'lighter'
	},
	body: {
		tint: { core: ASH, edge: SLATE },
		blend: 'lighter'
	},
	wisp: {
		tint: { core: SLATE, edge: VOID_INK },
		blend: 'lighter'
	},
	ember: {
		tint: { core: ASH, edge: SLATE },
		blend: 'lighter'
	},
	skin: {
		tint: { core: SLATE, edge: VOID_INK },
		blend: 'source-over'
	}
};
