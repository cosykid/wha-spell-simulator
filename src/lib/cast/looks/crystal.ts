/**
 * @file Crystal's look row. Crystal's element is earth, and this row is the
 * reason the table is keyed on sigil id rather than on element (PDF defect I).
 *
 * The dictionary argues it: "Crystal creates and manipulates crystalline
 * objects." Objects, so the matter roles keep earth's `source-over` — a facet
 * occludes the facet behind it. Crystalline, so everything else parts company
 * with earth: the lit roles are specular rather than warm, they run the `glint`
 * sprite instead of a round spark, the tints are cool and the core-to-edge
 * contrast is the widest in the table, and the trails are nearly gone. A clod
 * smears; a shard either catches the light or it does not.
 *
 * The entry's semantics point the same way — more focus, less spread, a positive
 * `lifetimeBias` — so the sizes sit tighter than earth's and the matter roles
 * `leak` instead of decaying: a shard persists where a clod crumbles.
 */

import type { LookRow } from './look.js';

/** The lit face, near white so the core-to-edge fall is the table's steepest. */
const FACET = [236, 248, 255] as const;
/** The stone's own colour, cool where earth's `GRIT` is warm. */
const QUARTZ = [150, 198, 232] as const;
/** The shadowed edge. Deep and blue, which is what makes the facet read as hard. */
const SEAM = [40, 66, 102] as const;

export const CRYSTAL_LOOKS: LookRow = {
	core: {
		sprite: 'glint',
		tint: { core: [255, 255, 255], edge: FACET },
		sizePx: [4, 15],
		trail: null,
		blend: 'lighter',
		stretch: 0.3,
		fade: 'decay'
	},
	body: {
		sprite: 'disc',
		tint: { core: FACET, edge: SEAM },
		sizePx: [5, 11],
		trail: null,
		blend: 'source-over',
		stretch: 0.2,
		fade: 'leak'
	},
	wisp: {
		sprite: 'glint',
		tint: { core: QUARTZ, edge: SEAM },
		sizePx: [3, 9],
		trail: { frames: 1, widthScale: 0.4 },
		blend: 'lighter',
		stretch: 0.5,
		fade: 'leak'
	},
	ember: {
		sprite: 'glint',
		tint: { core: [255, 255, 255], edge: QUARTZ },
		sizePx: [2, 5],
		trail: { frames: 1, widthScale: 0.35 },
		blend: 'lighter',
		stretch: 0.8,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: QUARTZ, edge: SEAM },
		sizePx: [7, 13],
		trail: null,
		blend: 'source-over',
		stretch: 0.1,
		fade: 'leak'
	}
};
