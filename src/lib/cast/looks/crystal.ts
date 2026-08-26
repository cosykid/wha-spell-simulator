/**
 * @file Crystal's look row. Crystal's element is earth, and this row is the
 * reason the table is keyed on sigil id rather than on element (PDF defect I).
 *
 * The dictionary argues it: "Crystal creates and manipulates crystalline
 * objects." Objects, so the matter roles keep earth's `source-over` — a facet
 * occludes the facet behind it. Crystalline, so the tints part company with
 * earth entirely: cool where earth's are warm, and the widest core-to-edge fall
 * in the table, which is what makes a face read as lit rather than as colored.
 *
 * The material says the same two things again. Objects, so the fill sits just
 * under earth's and the weight just under it too, a shard being heavy but
 * smaller than a slab. Crystalline, so emission runs well above earth's without
 * reaching the two light sources, the edge is serrated into facets, the ribbon
 * is a narrow blade, and it breaks up more coarsely than any row that breaks up
 * at all, because a facet is a wide flat plane and not a grain. Two numbers
 * carry the row on their own: undulation is exactly zero, since a lattice that
 * waves is not a lattice, and flicker is second only to fire's, because a facet
 * either catches the light or it does not. Its bands are facet divisions turning
 * past the eye rather than stripes on a flow, and its afterimage is the table's
 * shortest: a clod smears, and a shard does not.
 */

import type { LookRow } from './look.js';

/** The lit face, near white so the core-to-edge fall is the table's steepest. */
const FACET = [236, 248, 255] as const;
/** The stone's own color, cool where earth's `GRIT` is warm. */
const QUARTZ = [150, 198, 232] as const;
/** The shadowed edge. Deep and blue, which is what makes the facet read as hard. */
const SEAM = [40, 66, 102] as const;

export const CRYSTAL_LOOKS: LookRow = {
	material: {
		emissive: 0.55,
		opacity: 0.88,
		edge: 'serrated',
		bands: 4,
		noiseScale: 0.35,
		ribbonWidth: 0.09,
		garnishDensity: 0.55,
		trailPersistence: 0.04,
		flicker: 0.42,
		undulation: 0,
		weight: 0.85
	},
	core: {
		tint: { core: [255, 255, 255], edge: FACET },
		blend: 'lighter'
	},
	body: {
		tint: { core: FACET, edge: SEAM },
		blend: 'source-over'
	},
	wisp: {
		tint: { core: QUARTZ, edge: SEAM },
		blend: 'lighter'
	},
	ember: {
		tint: { core: [255, 255, 255], edge: QUARTZ },
		blend: 'lighter'
	},
	skin: {
		tint: { core: QUARTZ, edge: SEAM },
		blend: 'source-over'
	}
};
