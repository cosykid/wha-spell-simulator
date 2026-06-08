/** @file Helpers for generating stroke data for E2E tests */

import { NormPoint, NormStroke } from './types';

/**
 * Traces a circular arc, sampling one point per `stepDeg` degrees. Angles use
 * screen orientation (0 = +x, 90 = straight down). `endDeg` may exceed 360 to
 * sweep past the start; pass `endDeg = startDeg + 350` to leave a 10 degree gap.
 */
export function circleStroke(
	center: NormPoint,
	radius: number,
	startDeg: number,
	endDeg: number,
	stepDeg = 4
): NormStroke {
	const stroke: NormStroke = [];
	const direction = Math.sign(endDeg - startDeg) || 1;
	for (
		let angle = startDeg;
		direction > 0 ? angle <= endDeg : angle >= endDeg;
		angle += direction * stepDeg
	) {
		const radians = (angle * Math.PI) / 180;
		stroke.push({
			x: center.x + radius * Math.cos(radians),
			y: center.y + radius * Math.sin(radians)
		});
	}
	return stroke;
}
