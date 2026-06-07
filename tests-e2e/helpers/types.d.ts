/** A point in normalized canvas space, where both axes run 0..1. */
export interface NormPoint {
	x: number;
	y: number;
}

/** A single pen stroke: an ordered list of normalized points. */
export type NormStroke = NormPoint[];

/** Circle geometry in normalized canvas space. */
export interface RingGeometry {
	center: NormPoint;
	radius: number;
}
