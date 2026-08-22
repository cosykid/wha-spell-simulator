/**
 * @file R-05, the column vector law: the fold from signs to
 * `(S, P, C, Gamma)`, and the two derived readings the plan hangs on it.
 *
 * The PDF's worked example `(1,0,1) + (-1,0,1) = (0,0,2)` does not type-check —
 * nothing is drawn out of the page, so the third component cannot be an input.
 * It is the output of the clash: two opposed inward columns at +x and -x with
 * `l = 1, w = 1` give `P = 0` and `C = 2`, so the aim is `(0, 0, 2)`.
 *
 * The levitation and pull families run the same algebra into their own budgets
 * (`docs/ground-truth.md` sections 6 and 7), which is why {@link foldAggregate}
 * takes any sign list. R-13 keeps the budgets apart; this file only does the sum.
 *
 * @example
 * const aggregate = foldAggregate(columnSigns);
 * const aim = aimVector(aggregate); // (0, 0, 2) for the worked check
 */

import { isFacingTrusted } from '../reading/trust.js';
import type { SignReading, Vec3, Vector } from '../../types.js';

export interface ColumnAggregate {
	/** S — total drawn length, the ink budget. */
	budget: number;
	/** P — in-plane net momentum. */
	lateral: Vector;
	/** C — convergence. Positive is a clash redirected out of the page, negative a fan. */
	convergence: number;
	/** Gamma — circulation. Positive is counter-clockwise seen from +z. */
	circulation: number;
}

export const EMPTY_AGGREGATE: ColumnAggregate = {
	budget: 0,
	lateral: { x: 0, y: 0 },
	convergence: 0,
	circulation: 0
};

/**
 * The tangential unit at a sign, `tHat`. Seal space puts y screen-down, so a
 * quarter turn counter-clockwise as the drawer sees it maps `(x, y)` to
 * `(y, -x)`: at the east rim it points screen-up.
 */
function tangentialUnit(radial: Vector): Vector {
	return { x: radial.y, y: -radial.x };
}

/** `rHat`, or zero for a sign sitting on the center where no radial direction exists. */
function radialUnit(at: Vector): Vector {
	const radius = Math.hypot(at.x, at.y);
	if (radius < 1e-9) {
		return { x: 0, y: 0 };
	}
	return { x: at.x / radius, y: at.y / radius };
}

/**
 * Folds one sign family into its aggregate. R-06: a sign whose facing trust
 * falls below the floor contributes its length to the budget only, never to
 * lateral, convergence or circulation — sloppy drawings add power, not direction.
 */
export function foldAggregate(signs: SignReading[]): ColumnAggregate {
	let budget = 0;
	let lateralX = 0;
	let lateralY = 0;
	let convergence = 0;
	let circulation = 0;

	for (const sign of signs) {
		budget += sign.length;
		if (!isFacingTrusted(sign)) {
			continue;
		}
		const radial = radialUnit(sign.at);
		const tangential = tangentialUnit(radial);
		const weight = Math.min(Math.hypot(sign.at.x, sign.at.y), 1);
		lateralX += sign.length * sign.facing.x;
		lateralY += sign.length * sign.facing.y;
		convergence -= sign.length * weight * (sign.facing.x * radial.x + sign.facing.y * radial.y);
		circulation +=
			sign.length * weight * (sign.facing.x * tangential.x + sign.facing.y * tangential.y);
	}

	return {
		budget,
		lateral: { x: lateralX, y: lateralY },
		convergence,
		circulation
	};
}

/**
 * R-05. The jet tilts where the long sign points, never toward the long sign's
 * position: a long column drawn on the left pointing right throws the beam right.
 */
export function aimVector(aggregate: ColumnAggregate): Vec3 {
	return {
		x: aggregate.lateral.x,
		y: aggregate.lateral.y,
		z: Math.max(aggregate.convergence, 0)
	};
}

/** R-07. Outward columns give `C < 0`, which is a plane-hugging radial fan. */
export function dispersionScalar(aggregate: ColumnAggregate): number {
	return Math.max(-aggregate.convergence, 0);
}
