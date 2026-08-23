/**
 * @file The beam's sheath: three to five ink ribbons twisting around the spine.
 *
 * Each ribbon is a strip laid on an invisible cylinder around the axis, and the
 * turn it has made by a given height is `twist * height - flow`. The alpha bands
 * that run up it read the **same** `flow`, so the ink visibly climbs the column
 * in a still frame instead of the ribbons merely being striped.
 *
 * Local +Z is the beam axis, as it is for the spine the ribbons sheathe.
 *
 * @example
 * const ribbons = createBeamRibbons({ look, material, count: 4, roughness: 0.4, rng });
 * ribbons.setSheath({ length: 3.2, radius: 0.5, width: 0.2, alpha: 0.7, flow: 2.4, feather: 0.9 });
 */

import * as THREE from 'three';
import { FLOW_INK_GLSL, bandDepth, edgeMode } from './flowInk.js';
import { inkBlending, inkColor } from '../ink.js';
import type { Rng } from '../../stage/rng.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Steps up one ribbon. The twist is a helix, so it needs the segments to be smooth. */
const SEGMENTS = 44;

/** Turns a ribbon makes over the whole shaft, before the flow phase turns it further. */
const TWIST_TURNS = 0.85;

/** Seal units the sampling step used for the ribbon's tangent spans. */
const TANGENT_STEP = 0.02;

const VERTEX_SHADER = /* glsl */ `
	uniform float uLength;
	uniform float uRadius;
	uniform float uWidth;
	uniform float uFlow;
	uniform float uUndulation;
	uniform float uNoiseScale;
	attribute float aAxial;
	attribute float aSide;
	attribute float aTurn;
	attribute float aSeed;
	varying float vAxial;
	varying float vSide;
	varying float vSeed;

	// The sheath hugs the throat and opens at the foot, so the ribbons read as
	// drawn out of the aperture rather than wrapped around a pole.
	float sheathRadius(float a) {
		float foot = 1.0 + 0.45 * (1.0 - smoothstep(0.0, 0.24, a));
		float spread = 1.0 + 0.2 * smoothstep(0.5, 1.0, a);
		float swell = uUndulation * sin((a * uNoiseScale + uFlow) * 6.2831853 + aSeed * 6.2831853);
		return uRadius * foot * spread + swell;
	}

	vec3 strandAt(float a) {
		float turn = aTurn + (a * ${TWIST_TURNS.toFixed(2)} - uFlow) * 6.2831853;
		float radius = sheathRadius(a);
		return vec3(cos(turn) * radius, sin(turn) * radius, a * uLength);
	}

	void main() {
		vec3 center = strandAt(aAxial);
		vec3 ahead = strandAt(min(aAxial + ${TANGENT_STEP.toFixed(2)}, 1.0));
		vec3 behind = strandAt(max(aAxial - ${TANGENT_STEP.toFixed(2)}, 0.0));
		vec3 tangent = normalize(ahead - behind);
		// Across the cylinder's surface, so the ribbon lies on the sheath instead of
		// standing off it like a fin.
		vec3 outward = normalize(vec3(center.xy, 0.0));
		vec3 across = normalize(cross(tangent, outward));
		float width = uWidth * (0.55 + 0.45 * (1.0 - smoothstep(0.35, 1.0, aAxial)));
		vec3 seal = center + across * aSide * width;
		vAxial = aAxial;
		vSide = aSide;
		vSeed = aSeed;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uFlow;
	uniform float uBands;
	uniform float uBandDepth;
	uniform float uEdgeMode;
	uniform float uFlicker;
	uniform float uNoiseScale;
	uniform float uFeather;
	uniform float uOpacity;
	varying float vAxial;
	varying float vSide;
	varying float vSeed;

	${FLOW_INK_GLSL}

	void main() {
		float edge = inkEdge(vSide, uEdgeMode, vAxial * 9.0 - uFlow);
		float band = flowBand(vAxial, uBands, uFlow, uBandDepth);
		// The ribbons are drawn out of the foot and give up at the head, and the
		// caller pulls \`uFeather\` down through the release to feather them away.
		float carry = smoothstep(0.0, 0.08, vAxial) * (1.0 - smoothstep(uFeather, 1.0, vAxial));
		float jitter = inkFlicker(vSeed * 31.0 + floor(vAxial * uNoiseScale) * 3.7, uFlow, uFlicker);
		float alpha = uAlpha * edge * band * carry * jitter * (0.45 + 0.55 * uOpacity);
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, band * (1.0 - 0.6 * abs(vSide))), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the sheath sits this frame, in seal units. */
export interface Sheath {
	length: number;
	/** Radius of the cylinder the ribbons twist around, at the throat. */
	radius: number;
	/** Half-width of one ribbon. */
	width: number;
	alpha: number;
	/** Turns. The same axial flow phase the spine is banded by. */
	flow: number;
	/** Height, 0..1, past which the ribbons feather out. Falls through the release. */
	feather: number;
}

export interface BeamRibbons {
	readonly mesh: THREE.Mesh;
	setSheath(sheath: Sheath): void;
	dispose(): void;
}

function ribbonsGeometry(count: number, roughness: number, rng: Rng): THREE.BufferGeometry {
	const perRibbon = (SEGMENTS + 1) * 2;
	const total = count * perRibbon;
	const position = new Float32Array(total * 3);
	const axial = new Float32Array(total);
	const side = new Float32Array(total);
	const turn = new Float32Array(total);
	const seed = new Float32Array(total);

	for (let ribbon = 0; ribbon < count; ribbon += 1) {
		// Evenly spaced around the axis, then nudged by however sloppily the seal was
		// drawn, so a sheath reads as hand-drawn ink rather than as a machined cage.
		const baseTurn = (ribbon / count) * Math.PI * 2 + (rng() - 0.5) * roughness;
		const ribbonSeed = rng();
		for (let step = 0; step <= SEGMENTS; step += 1) {
			for (let edge = 0; edge < 2; edge += 1) {
				const index = ribbon * perRibbon + step * 2 + edge;
				axial[index] = step / SEGMENTS;
				side[index] = edge === 0 ? -1 : 1;
				turn[index] = baseTurn;
				seed[index] = ribbonSeed;
				position[index * 3 + 2] = axial[index];
			}
		}
	}

	const indices: number[] = [];
	for (let ribbon = 0; ribbon < count; ribbon += 1) {
		const base = ribbon * perRibbon;
		for (let step = 0; step < SEGMENTS; step += 1) {
			const a = base + step * 2;
			indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aAxial', new THREE.BufferAttribute(axial, 1));
	geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
	geometry.setAttribute('aTurn', new THREE.BufferAttribute(turn, 1));
	geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
	geometry.setIndex(indices);
	return geometry;
}

/**
 * One sheath of `count` ribbons. The count is the cell's business (the seal's
 * own fold, or the columns that were drawn); the form only twists what it is
 * given.
 */
export function createBeamRibbons(options: {
	look: Look;
	material: MaterialProfile;
	count: number;
	/** 0 is a machined cage, 1 is a sloppy hand. The cell reads it off the seal's quality. */
	roughness: number;
	rng: Rng;
}): BeamRibbons {
	const { look, material, count } = options;
	const geometry = ribbonsGeometry(count, options.roughness, options.rng);
	const shader = new THREE.ShaderMaterial({
		uniforms: {
			uLength: { value: 0 },
			uRadius: { value: 0 },
			uWidth: { value: 0 },
			uAlpha: { value: 0 },
			uFlow: { value: 0 },
			uFeather: { value: 1 },
			uBands: { value: Math.max(material.bands, 3) },
			uBandDepth: { value: bandDepth(material) },
			uEdgeMode: { value: edgeMode(material) },
			uFlicker: { value: material.flicker },
			uOpacity: { value: material.opacity },
			uUndulation: { value: material.undulation * 0.12 },
			uNoiseScale: { value: Math.max(material.noiseScale, 0.5) },
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
		setSheath(sheath) {
			const uniforms = shader.uniforms;
			uniforms.uLength.value = sheath.length;
			uniforms.uRadius.value = sheath.radius;
			uniforms.uWidth.value = sheath.width;
			uniforms.uAlpha.value = sheath.alpha;
			uniforms.uFlow.value = sheath.flow;
			uniforms.uFeather.value = sheath.feather;
			mesh.visible = sheath.alpha > 0 && sheath.length > 0;
		},
		dispose() {
			geometry.dispose();
			shader.dispose();
		}
	};
}
