// SpellField — typed force operators compiled from recognized signs.
//
// Seal space: origin at the ring center, unit length = ring radius, x to the
// right, y matching canvas coordinates (positive toward the screen bottom),
// z out of the paper. The compiler builds one field per spell; the renderer
// superposes the sources at each particle position every frame.

import type { Vector } from './geometry.js';

/** A force sample in seal space; z points out of the paper. */
export interface FieldVector {
	x: number;
	y: number;
	z: number;
}

/**
 * Column: a beam out of the seal. Each column also leans the beam along the way
 * its sign points, so a canonically inward sign throws the beam past the center
 * to its far side and balanced columns cancel into a straight beam. The lean
 * grows with how far off center the sign sits; a centered column beams straight.
 */
export interface AxialSource {
	kind: 'axial';
	sign: string;
	/** Seal-space position of the sign; its distance off center scales the lean. */
	at: Vector;
	/** Unit seal-plane direction the sign faces; the beam leans this way. */
	direction: Vector;
	strength: number;
}

/**
 * The pull family as one operator: the inward-pointing unit field rotated by
 * `twistDeg`. 0 pulls straight toward `center`, +/-90 is pure rotation, 180
 * pushes straight out — matching canon pull, angled pull, inverted pull, and
 * dispersion as points on one dial.
 */
export interface RadialSource {
	kind: 'radial';
	sign: string;
	/** Seal center for pull/dispersion/collection, the focus point for convergence. */
	center: Vector;
	twistDeg: number;
	strength: number;
}

/** Region's push: a local jet along the sign's facing, strongest near the sign. */
export interface DirectedSource {
	kind: 'directed';
	sign: string;
	at: Vector;
	/** Unit seal-plane direction the sign faces. */
	direction: Vector;
	strength: number;
}

/**
 * Levitation and float: lift opposing gravity plus pressure blown inward
 * along the sign's own axis, strongest near the sign. The hovering orb is
 * emergent, not baked in: it forms only where opposing signs press the magic
 * from both sides. A lone or one-sided sign has nothing pushing back, so the
 * magic blows across the seal and away — canon's unbalanced spell.
 */
export interface BuoyancySource {
	kind: 'buoyancy';
	sign: string;
	/** Seal-space position the pressure blows inward from. */
	at: Vector;
	strength: number;
}

export type FieldSource = AxialSource | RadialSource | DirectedSource | BuoyancySource;

/**
 * Where region signs let the effect manifest, from their aggregate facing:
 * all inward confines it inside the ring, all outward excludes the inside,
 * opposed pairs pin it onto the ring itself, and a one-sided arrangement
 * emits a sector toward that side.
 */
export type SpawnDomainMode = 'anywhere' | 'inside' | 'outside' | 'ring' | 'sector';

export interface SpawnDomain {
	mode: SpawnDomainMode;
	/** Unit vector toward the emission side; only present for 'sector'. */
	direction?: Vector;
	/** Combined influence of the region signs that produced this domain. */
	strength: number;
}

/** The compiled force field: superpose `sources`, spawn within `domain`. */
export interface SpellField {
	sources: FieldSource[];
	domain: SpawnDomain;
}
