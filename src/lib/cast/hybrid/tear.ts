/**
 * @file Where on the mass a brush mark is born.
 *
 * A mark is an accent drawn *on* the pigment, so it may not be placed anywhere
 * the mass is not. Every birth site is found on the mass's own wandering
 * boundary — the surface the field pinches its parcels toward — and among a
 * handful of candidates the one that is tearing hardest wins.
 *
 * One search serves every archetype, because every archetype pinches toward the
 * same parameterised boundary. A column's is a narrowing cone, a whirl's a
 * flaring funnel, a fan's a low ring; the search does not know which.
 */

import {
	boundaryRadius,
	flowAccel,
	silhouetteRadius,
	type FlowSample,
	type FlowShape
} from './flow.js';
import { FLOW, MARK } from './tuning.js';
import { smoothstep } from './noise.js';
import type { Rng } from '../rng.js';

/**
 * How hard the mass is tearing at a point on its edge: turbulence pushing out
 * through the boundary, a boundary already bulged into a shoulder, and the
 * screen-space payoff of an accent there.
 */
function tearAt(
	sample: FlowSample,
	shape: FlowShape,
	angle: number,
	along: number,
	tSec: number
): number {
	const pinch = boundaryRadius(shape, angle, along, tSec);
	const edge = pinch * FLOW.silhouette;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	flowAccel(
		sample,
		shape,
		shape.originX + cos * edge,
		shape.originY + sin * edge,
		shape.originZ + along * shape.axisZ,
		tSec,
		0.45
	);
	const outward = sample.x * cos + sample.y * sin;
	const hn = along / Math.max(shape.reach, 1e-3);
	const shoulder =
		pinch / (shape.footprint * (1 - shape.narrow * smoothstep(0, 0.95, hn)) + 0.04) - 1;
	// The silhouette reads at the screen edges of the mass and on its near face;
	// a mark behind it is a mark nobody sees.
	const facing = 0.78 * Math.abs(cos) + 0.22 * (0.5 + 0.5 * sin);
	return 1.3 * Math.max(0, outward) + 2.4 * Math.max(0, shoulder) + 2.1 * facing;
}

/** The site the search settled on, so the caller can reuse the numbers. */
export interface BirthSite {
	angle: number;
	along: number;
	edge: number;
	/** How hard the mass was tearing there. The mark is drawn to match. */
	tear: number;
}

/**
 * Draws places on the boundary until one is tearing hard enough to accept.
 *
 * Rejection rather than best-of-N: keeping the single best candidate every frame
 * marches the whole crowd onto the same shoulder, and a knot of marks in one
 * place is the blob this direction is trying not to be.
 */
export function findTear(
	sample: FlowSample,
	rng: Rng,
	shape: FlowShape,
	tSec: number,
	risen: number
): BirthSite {
	let site: BirthSite = {
		angle: 0,
		along: 0,
		edge: shape.footprint * FLOW.silhouette,
		tear: 0
	};
	for (let i = 0; i < MARK.tearSamples; i += 1) {
		const angle = rng() * Math.PI * 2;
		// The upper reaches and the shoulders, where the mass sheds; never only the
		// crown, or the accents float free of the body they belong to. A shape that
		// hugs the plane says so with its own floor.
		const span = shape.markFloor + (1.19 - shape.markFloor) * rng() ** 0.72;
		const along = shape.reach * span * (0.4 + 0.6 * risen);
		const tear = tearAt(sample, shape, angle, along, tSec);
		site = { angle, along, edge: silhouetteRadius(shape, angle, along, tSec), tear };
		if (tear > MARK.tearBar * rng()) {
			break;
		}
	}
	return site;
}
