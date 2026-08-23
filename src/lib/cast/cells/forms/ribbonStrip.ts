/**
 * @file A batch of ribbon strips: the one geometry a wound arm and a travelling
 * stroke are both made of.
 *
 * Every ribbon in the cell stage is the same thing — a run of quads carrying
 * "how far along" and "which side of the ribbon", with the vertex shader placing
 * the real point from those two numbers. The batch adds per-strip constants
 * (which arm, which bearing, which seed), repeated onto every vertex of that
 * strip, so an arm or a stroke keeps its own character without a uniform array
 * the shader would have to index dynamically.
 *
 * @example
 * const geometry = ribbonStrips({
 * 	strips: 5,
 * 	segments: 84,
 * 	constants: { aArm: (strip) => strip, aSeed: (strip) => seeds[strip] }
 * });
 */

import * as THREE from 'three';

export interface RibbonStripSpec {
	/** How many ribbons the batch holds. */
	strips: number;
	/** Samples along one ribbon. More for a ribbon that bends more. */
	segments: number;
	/** Extra attributes, one value per strip, repeated onto its vertices. */
	constants: Record<string, (strip: number) => number>;
}

/**
 * The batch as one indexed geometry. Every vertex carries `aAlong` (0 at the
 * ribbon's head, 1 at its tail) and `aSide` (-1 or 1 across it), plus whatever
 * `constants` names. `position` is filled with `aAlong` only because three
 * expects the attribute; the shader never reads it.
 */
export function ribbonStrips(spec: RibbonStripSpec): THREE.BufferGeometry {
	const perStrip = (spec.segments + 1) * 2;
	const vertices = spec.strips * perStrip;
	const position = new Float32Array(vertices * 3);
	const along = new Float32Array(vertices);
	const side = new Float32Array(vertices);
	const constants = Object.entries(spec.constants).map(
		([name, valueFor]) => [name, valueFor, new Float32Array(vertices)] as const
	);
	const indices: number[] = [];

	for (let strip = 0; strip < spec.strips; strip += 1) {
		for (let i = 0; i <= spec.segments; i += 1) {
			for (let s = 0; s < 2; s += 1) {
				const index = strip * perStrip + i * 2 + s;
				along[index] = i / spec.segments;
				side[index] = s === 0 ? -1 : 1;
				position[index * 3] = along[index];
				for (const [, valueFor, buffer] of constants) {
					buffer[index] = valueFor(strip);
				}
			}
			if (i < spec.segments) {
				const base = strip * perStrip + i * 2;
				indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
			}
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
	geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
	for (const [name, , buffer] of constants) {
		geometry.setAttribute(name, new THREE.BufferAttribute(buffer, 1));
	}
	geometry.setIndex(indices);
	return geometry;
}
