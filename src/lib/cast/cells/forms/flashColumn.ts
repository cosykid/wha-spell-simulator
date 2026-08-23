/**
 * @file The flash column: the brief vertical flare a strike throws off the seal.
 *
 * A flared open tube standing on the seal plane, rooted at the paper and gone by
 * the crown, brightest where the surface turns away from the viewer so the tube
 * reads as a sheath of light rather than a cardboard pipe.
 *
 * @example
 * const flash = createFlashColumn({ look, licks: 5, phase: 0.4 });
 * flash.setFlare({ radius: 0.3, height: 1.4, alpha: 1, phase: 0.4 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Look } from '../../looks/look.js';

const RADIAL_SEGMENTS = 40;

/** Foot radius over crown radius: the tube flares as it climbs. */
const FOOT_RADIUS = 0.34;

const VERTEX_SHADER = /* glsl */ `
	varying vec2 vUv;
	varying vec3 vNormal;
	varying vec3 vView;

	void main() {
		vUv = uv;
		vNormal = normalize(normalMatrix * normal);
		vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
		vView = -viewPosition.xyz;
		gl_Position = projectionMatrix * viewPosition;
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uLicks;
	uniform float uPhase;
	varying vec2 vUv;
	varying vec3 vNormal;
	varying vec3 vView;

	void main() {
		// Rooted at the seal, spent by the crown, so the flare never ends in a rim.
		float column = (1.0 - vUv.y) * (1.0 - vUv.y);
		// Grazing surface is the silhouette of the tube, which is where a sheath of
		// light piles up.
		float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
		float licks = 0.7 + 0.3 * sin(vUv.x * 6.2831853 * uLicks + uPhase);
		float alpha = uAlpha * column * (0.55 + 0.45 * rim) * licks;
		if (alpha < 0.002) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, column), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** The flare this frame, in seal units. */
export interface Flare {
	radius: number;
	height: number;
	alpha: number;
	/** Radians. Advanced by the caller from the phase its geometry moves by. */
	phase: number;
}

export interface FlashColumn {
	readonly mesh: THREE.Mesh;
	setFlare(flare: Flare): void;
	dispose(): void;
}

export function createFlashColumn(options: { look: Look; licks: number }): FlashColumn {
	const geometry = new THREE.CylinderGeometry(
		1,
		FOOT_RADIUS,
		1,
		RADIAL_SEGMENTS,
		1,
		/* openEnded */ true
	);
	// Stand the tube on its own foot, so scaling grows it upward off the paper
	// instead of sinking half of it through.
	geometry.translate(0, 0.5, 0);

	const material = new THREE.ShaderMaterial({
		uniforms: {
			uAlpha: { value: 0 },
			uLicks: { value: options.licks },
			uPhase: { value: 0 },
			uCore: { value: inkColor(options.look.tint.core) },
			uEdge: { value: inkColor(options.look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		// The seal root's matrix is a reflection, so culling would show the inside.
		side: THREE.DoubleSide,
		blending: inkBlending(options.look)
	});

	const mesh = new THREE.Mesh(geometry, material);
	// Cylinders are built along local +Y; seal space climbs along +z.
	mesh.rotation.x = Math.PI / 2;

	return {
		mesh,
		setFlare(flare) {
			mesh.scale.set(flare.radius, flare.height, flare.radius);
			material.uniforms.uAlpha.value = flare.alpha;
			material.uniforms.uPhase.value = flare.phase;
			mesh.visible = flare.alpha > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
