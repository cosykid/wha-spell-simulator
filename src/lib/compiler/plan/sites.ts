/**
 * @file The drawn arrangement the column fold flattens away: where each
 * contributing sign sat and which way it faced.
 *
 * R-05 reads a family of signs as four numbers, which is what makes three
 * columns and one triple-length column the same aim. That is the right answer
 * for magnitude and the wrong one for form, so the plan carries the placements
 * beside the fold. Nothing here pays into a budget and nothing here is a second
 * aim: sites are evidence about shape, and only the cast reads them.
 *
 * @example
 * resolveSites(columnFamilySigns); // { column: [...], dispersion: [...] }
 */

import { angleDegFromCenter } from '../../utils/geometry.js';
import { isFacingTrusted } from '../reading/trust.js';
import type { PlanSites, SignReading, Site, Vector } from '../../types.js';

const ORIGIN: Vector = { x: 0, y: 0 };

/** The manifestation whose sites the fan performs. Everything else in the family is the jet's. */
const DISPERSION = 'dispersion';

function siteOf(sign: SignReading): Site {
	return {
		at: sign.at,
		// R-06: a sign the reading does not trust adds power, not direction. Zeroing
		// the facing here keeps that true below the plan, where the fold's own skip
		// is no longer visible.
		facing: isFacingTrusted(sign) ? sign.facing : { x: 0, y: 0 }
	};
}

function radiusOf(at: Vector): number {
	return Math.hypot(at.x, at.y);
}

/**
 * Ordered around the seal counter-clockwise from east, then outward, then by
 * facing. Signs arrive in stroke order, which two drawings of the same
 * arrangement do not share, and a plan has to serialize the same way twice.
 */
function sitesOf(signs: SignReading[]): Site[] {
	return signs
		.map(siteOf)
		.sort(
			(a, b) =>
				angleDegFromCenter(a.at, ORIGIN) - angleDegFromCenter(b.at, ORIGIN) ||
				radiusOf(a.at) - radiusOf(b.at) ||
				a.facing.x - b.facing.x ||
				a.facing.y - b.facing.y
		);
}

/**
 * Splits one family's ink into the two lists the score threads. R-08 makes
 * dispersion contribute to the fold exactly as a column does, so the aggregate
 * cannot separate them and the authored manifestation is the only honest cut.
 * Ink that joins the column family later reads as column ink here until a ruling
 * says otherwise.
 */
export function resolveSites(columnFamily: SignReading[]): PlanSites {
	return {
		column: sitesOf(columnFamily.filter((sign) => sign.manifestation !== DISPERSION)),
		dispersion: sitesOf(columnFamily.filter((sign) => sign.manifestation === DISPERSION))
	};
}
