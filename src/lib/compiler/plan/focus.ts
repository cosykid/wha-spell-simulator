/**
 * @file R-13's lens: the convergence family as one scalar.
 *
 * Convergence is the first modifier sign — no force pair, no reaction, no
 * momentum. Orientation and position are ignored on purpose: the glyph is an
 * equilateral triangle, so an apex direction is only defined modulo a third of a
 * turn, and focus is a property of the whole seal (`docs/ground-truth.md`
 * section 8). Only the drawn size counts.
 */

import type { SignReading } from '../../types.js';

const FOCUS_TUNING = {
	/** How much lens one seal unit of convergence ink buys. */
	lensPerLength: 0.6
};

/**
 * The lens factor `F = 1 + k * Q`. It is one-sided: there is no anti-focus
 * arrangement, so a seal with no convergence ink reads exactly 1 and every
 * envelope width it would divide stays untouched.
 */
export function resolveFocus(convergence: SignReading[]): number {
	const budget = convergence.reduce((total, sign) => total + sign.length, 0);
	return 1 + FOCUS_TUNING.lensPerLength * budget;
}
