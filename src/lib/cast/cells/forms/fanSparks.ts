/**
 * @file The garnish on the fan's leading edge: a few dozen ink slivers thrown
 * off the front as it advances.
 *
 * Garnish, and never the body: the sheet is the form, and these only exist to
 * say the front is moving. They are instanced off one three-vertex dart and
 * placed entirely in the vertex shader from a seeded angle and a seeded offset
 * into the same phase the sheet flows on, so a step costs one uniform write and
 * the replay is exact.
 *
 * @example
 * const sparks = createFanSparks({ look, material, sectors, rng });
 * sparks.setSpray({ outer: 1.6, lift: 0.2, size: 0.1, alpha: 0.7, flow: 1.2 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Rng } from '../../stage/rng.js';
import type { FanSector } from './fanSheet.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Slivers on the emptiest row's edge, and on the busiest. Dozens, by ruling. */
const SPARKS = { min: 10, max: 48 };

/** How far past the front a sliver flies, as a fraction of the front's radius. */
const SPREAD = 0.22;

/** Lives per turn of the flow phase. Faster than the banding, so sparks read as thrown. */
const LIVES_PER_TURN = 2.5;

const VERTEX_SHADER = /* glsl */ `
	uniform float uOuter;
	uniform float uLift;
	uniform float uSize;
	uniform float uAlpha;
	uniform float uFlow;
	attribute float iAngle;
	attribute float iPhase;
	attribute float iScale;
	varying float vAlpha;
	varying float vShade;

	void main() {
		float life = fract(iPhase + uFlow * ${LIVES_PER_TURN.toFixed(1)});
		float radius = uOuter * (1.0 + ${SPREAD.toFixed(2)} * life);
		vec2 outward = vec2(cos(iAngle), sin(iAngle));
		vec2 sideways = vec2(-outward.y, outward.x);
		float size = uSize * iScale * (1.0 - 0.55 * life);
		vec2 seal = outward * radius + outward * position.y * size + sideways * position.x * size;
		// A sliver climbs as it leaves, which is what separates it from the sheet.
		float lift = uLift * (0.4 + 1.8 * life);
		vAlpha = uAlpha * sin(3.1415927 * life);
		vShade = position.y * 0.5 + 0.5;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, lift, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	varying float vAlpha;
	varying float vShade;

	void main() {
		if (vAlpha < 0.004) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, vShade), vAlpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the spray sits this frame, in seal units. */
export interface Spray {
	/** The front the slivers leave from. */
	outer: number;
	lift: number;
	/** Length of one sliver. */
	size: number;
	alpha: number;
	/** Turns of the fan's flow phase. Each sliver is offset into it by its own seed. */
	flow: number;
}

export interface FanSparks {
	readonly mesh: THREE.Mesh;
	/** How many slivers this row's garnish budget bought. */
	readonly count: number;
	setSpray(spray: Spray): void;
	dispose(): void;
}

/** A dart pointing along +y, in the local frame the vertex shader lays on the rim. */
function dartGeometry(): THREE.InstancedBufferGeometry {
	const geometry = new THREE.InstancedBufferGeometry();
	const dart = new Float32Array([0, 1, 0, -0.34, -0.6, 0, 0.34, -0.6, 0]);
	geometry.setAttribute('position', new THREE.BufferAttribute(dart, 3));
	return geometry;
}

/**
 * One spray, seeded across the sectors it garnishes. The count comes from the
 * row's `garnishDensity`, so a row that throws nothing off gets the floor and no
 * row gets thousands.
 */
export function createFanSparks(options: {
	look: Look;
	material: MaterialProfile;
	sectors: readonly FanSector[];
	rng: Rng;
}): FanSparks {
	const { look, material, sectors, rng } = options;
	const count = Math.round(SPARKS.min + (SPARKS.max - SPARKS.min) * material.garnishDensity);
	const geometry = dartGeometry();
	const angle = new Float32Array(count);
	const phase = new Float32Array(count);
	const scale = new Float32Array(count);
	for (let index = 0; index < count; index += 1) {
		const sector = sectors[index % sectors.length];
		angle[index] = sector.bearing + (rng() * 2 - 1) * sector.halfAngle;
		phase[index] = rng();
		scale[index] = 0.6 + rng() * 0.8;
	}
	geometry.setAttribute('iAngle', new THREE.InstancedBufferAttribute(angle, 1));
	geometry.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phase, 1));
	geometry.setAttribute('iScale', new THREE.InstancedBufferAttribute(scale, 1));
	geometry.instanceCount = count;

	const shader = new THREE.ShaderMaterial({
		uniforms: {
			uOuter: { value: 0 },
			uLift: { value: 0 },
			uSize: { value: 0 },
			uAlpha: { value: 0 },
			uFlow: { value: 0 },
			uCore: { value: inkColor(look.tint.core) },
			uEdge: { value: inkColor(look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		blending: inkBlending(look)
	});

	const mesh = new THREE.Mesh(geometry, shader);
	mesh.frustumCulled = false;

	return {
		mesh,
		count,
		setSpray(spray) {
			const uniforms = shader.uniforms;
			uniforms.uOuter.value = spray.outer;
			uniforms.uLift.value = spray.lift;
			uniforms.uSize.value = spray.size;
			uniforms.uAlpha.value = spray.alpha;
			uniforms.uFlow.value = spray.flow;
			mesh.visible = spray.alpha > 0;
		},
		dispose() {
			geometry.dispose();
			shader.dispose();
		}
	};
}
