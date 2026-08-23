/**
 * @file The beam's core spine: the bright shaft a column throws, from the flare
 * standing in the aperture to the tongue at its head.
 *
 * A lathe whose profile the vertex shader builds every frame from two numbers,
 * so the shaft lengthens, fattens and sharpens without a geometry rebuild. The
 * silhouette is the point: a flared foot, a pinched throat, a long shaft, and a
 * tongue that comes to a point rather than ending in a rim.
 *
 * Local +Z is the beam axis. The cell rotates the whole spine onto `aim`, so
 * nothing here knows which way the column points.
 *
 * @example
 * const spine = createBeamSpine({ look, hot: row.core, material });
 * spine.setShaft({ length: 3.2, width: 0.4, alpha: 0.8, tip: 1, flow: 2.4 });
 */

import * as THREE from 'three';
import { FLOW_INK_GLSL, bandDepth } from './flowInk.js';
import { inkBlending, inkColor } from '../ink.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Rings up the shaft, and sides around it. Enough that the tongue reads as a point. */
const AXIAL_STEPS = 36;
const AROUND_STEPS = 22;

/** Where along the shaft the tongue starts tapering to its point. */
const TONGUE_START = 0.58;

const VERTEX_SHADER = /* glsl */ `
	uniform float uLength;
	uniform float uWidth;
	uniform float uTip;
	attribute float aAxial;
	attribute float aAround;
	varying float vAxial;
	varying vec3 vNormal;
	varying vec3 vView;

	// A thrown column, not an extruded pipe: it flares into the surface it stands
	// on, pinches at the throat, and comes to a tongue.
	float shaftProfile(float a) {
		float foot = 1.0 + 0.5 * (1.0 - smoothstep(0.0, 0.09, a));
		float throat = mix(1.0, 0.66, smoothstep(0.1, 0.62, a));
		float tongue = 1.0 - smoothstep(TONGUE_START - 0.22 * uTip, 1.0, a);
		return foot * throat * tongue;
	}

	void main() {
		float radius = uWidth * shaftProfile(aAxial);
		vec3 seal = vec3(cos(aAround) * radius, sin(aAround) * radius, aAxial * uLength);
		vAxial = aAxial;
		// The lathe's own normal is radial, which is all the rim term below needs.
		vNormal = normalize(normalMatrix * vec3(cos(aAround), sin(aAround), 0.0));
		vec4 viewPosition = modelViewMatrix * vec4(seal, 1.0);
		vView = -viewPosition.xyz;
		gl_Position = projectionMatrix * viewPosition;
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uFlow;
	uniform float uBands;
	uniform float uBandDepth;
	uniform float uFlicker;
	uniform float uNoiseScale;
	uniform float uEmissive;
	uniform float uTip;
	varying float vAxial;
	varying vec3 vNormal;
	varying vec3 vView;

	${FLOW_INK_GLSL}

	void main() {
		// A grazing surface is the shaft's silhouette, where a sheath of light piles up.
		float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
		// The column spends itself as it climbs, so the root is the hot end.
		float spend = 1.0 - smoothstep(0.05, 0.9, vAxial);
		float tongue = smoothstep(0.82, 1.0, vAxial) * uTip;
		float band = flowBand(vAxial, uBands, uFlow, uBandDepth);
		// Chunked at the row's own break-up frequency: a flame jitters in lengths of
		// itself, and a per-pixel hash would only be grain.
		float jitter = inkFlicker(floor(vAxial * uNoiseScale) * 3.7, uFlow, uFlicker);
		float alpha = uAlpha * (0.3 + 0.7 * rim) * (0.35 + 0.75 * spend + tongue) * band * jitter;
		if (alpha < 0.003) discard;
		float hot = clamp(spend * (0.45 + 0.55 * uEmissive) + tongue, 0.0, 1.0);
		gl_FragColor = vec4(mix(uEdge, uCore, hot), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the shaft stands this frame, in seal units along the axis. */
export interface Shaft {
	/** Distance from the root to the tongue's point. */
	length: number;
	/** Radius at the throat. The foot flares wider and the tongue tapers off it. */
	width: number;
	alpha: number;
	/** 0..1, how far the tongue is thrown past the shaft. Peaks at the strike. */
	tip: number;
	/** Turns of the axial flow pattern, shared with the ribbons that sheathe it. */
	flow: number;
}

export interface BeamSpine {
	readonly mesh: THREE.Mesh;
	setShaft(shaft: Shaft): void;
	dispose(): void;
}

function spineGeometry(): THREE.BufferGeometry {
	const rings = AXIAL_STEPS + 1;
	const sides = AROUND_STEPS + 1;
	const count = rings * sides;
	const position = new Float32Array(count * 3);
	const axial = new Float32Array(count);
	const around = new Float32Array(count);

	for (let ring = 0; ring < rings; ring += 1) {
		for (let side = 0; side < sides; side += 1) {
			const index = ring * sides + side;
			const theta = (side / AROUND_STEPS) * Math.PI * 2;
			axial[index] = ring / AXIAL_STEPS;
			around[index] = theta;
			// The vertex shader places the real point; `position` only exists because
			// three requires the attribute.
			position[index * 3] = Math.cos(theta);
			position[index * 3 + 1] = Math.sin(theta);
			position[index * 3 + 2] = axial[index];
		}
	}

	const indices: number[] = [];
	for (let ring = 0; ring < AXIAL_STEPS; ring += 1) {
		for (let side = 0; side < AROUND_STEPS; side += 1) {
			const a = ring * sides + side;
			const b = a + sides;
			indices.push(a, b, b + 1, a, b + 1, a + 1);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aAxial', new THREE.BufferAttribute(axial, 1));
	geometry.setAttribute('aAround', new THREE.BufferAttribute(around, 1));
	geometry.setIndex(indices);
	return geometry;
}

/**
 * One spine. It runs from the row's hot center at the foot to the track's own
 * element color at the head, which is the two look roles saying the one thing a
 * shaft of anything looks like: white where it is spent, elemental where it is
 * spending. The caller owns the motion and calls {@link BeamSpine.setShaft} once
 * per step.
 */
export function createBeamSpine(options: {
	/** The track's own role. It owns the silhouette color and the compositing. */
	look: Look;
	/** The row's `core` role: the hot center of an event. */
	hot: Look;
	material: MaterialProfile;
}): BeamSpine {
	const { look, material } = options;
	const geometry = spineGeometry();
	const material3d = new THREE.ShaderMaterial({
		uniforms: {
			uLength: { value: 0 },
			uWidth: { value: 0 },
			uTip: { value: 0 },
			uAlpha: { value: 0 },
			uFlow: { value: 0 },
			uBands: { value: material.bands },
			uBandDepth: { value: bandDepth(material) },
			uFlicker: { value: material.flicker },
			uNoiseScale: { value: Math.max(material.noiseScale, 1) },
			uEmissive: { value: material.emissive },
			uCore: { value: inkColor(options.hot.tint.core) },
			uEdge: { value: inkColor(look.tint.edge) }
		},
		defines: { TONGUE_START: TONGUE_START.toFixed(2) },
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		// The seal root's matrix is a reflection, so culled faces would show the inside.
		side: THREE.DoubleSide,
		blending: inkBlending(look)
	});

	const mesh = new THREE.Mesh(geometry, material3d);
	// The shader moves every vertex, so the geometry's own bounds say nothing.
	mesh.frustumCulled = false;

	return {
		mesh,
		setShaft(shaft) {
			const uniforms = material3d.uniforms;
			uniforms.uLength.value = shaft.length;
			uniforms.uWidth.value = shaft.width;
			uniforms.uTip.value = shaft.tip;
			uniforms.uAlpha.value = shaft.alpha;
			uniforms.uFlow.value = shaft.flow;
			mesh.visible = shaft.alpha > 0 && shaft.length > 0;
		},
		dispose() {
			geometry.dispose();
			material3d.dispose();
		}
	};
}
