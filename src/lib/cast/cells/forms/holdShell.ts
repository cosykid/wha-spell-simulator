/**
 * @file The hold shell: the soft translucent skin around a held place in the air.
 *
 * A sphere whose surface only really exists where it turns away from the viewer,
 * so it reads as a held volume rather than a ball of paint. The rim sharpens as
 * the grip closes, the whole skin undulates on the same bob phase the ball
 * breathes by, and the strike's grip pulse runs a bright band from the equator
 * out to the poles.
 *
 * @example
 * const shell = createHoldShell({ look, material });
 * shell.setShell({ radius: 0.3, alpha: 0.7, grip: 0.5, pulse: 0, phase: 1.2 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

const SEGMENTS = { around: 40, down: 28 } as const;

/** How far the undulation may swell the skin, as a fraction of its radius. */
const SWELL = 0.09;

/** How hard the ink outline is drawn, by the material's edge treatment. */
const CONTOUR: Record<MaterialProfile['edge'], number> = {
	crisp: 0.85,
	serrated: 0.7,
	feather: 0.3
};

const VERTEX_SHADER = /* glsl */ `
	uniform float uUndulation;
	uniform float uPhase;
	varying vec3 vNormal;
	varying vec3 vView;
	varying float vBelt;

	void main() {
		vec3 unit = normalize(position);
		// Low-frequency waviness on the same phase the ball breathes by, so a
		// water shell rolls and a crystal one does not move at all.
		float swell = 1.0 + uUndulation * ${SWELL.toFixed(3)} * sin(unit.z * 3.0 + uPhase);
		vec3 seal = unit * swell;
		vNormal = normalize(normalMatrix * unit);
		vec4 viewPosition = modelViewMatrix * vec4(seal, 1.0);
		vView = -viewPosition.xyz;
		// Where the point sits between the equator and a pole, which is the axis
		// the grip pulse travels along.
		vBelt = abs(unit.z);
		gl_Position = projectionMatrix * viewPosition;
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uFill;
	uniform float uGrip;
	uniform float uPulse;
	uniform float uEmissive;
	uniform float uContour;
	varying vec3 vNormal;
	varying vec3 vView;
	varying float vBelt;

	void main() {
		// Grazing surface is the silhouette, and a shell is mostly silhouette.
		float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
		// A closed grip draws the skin into a tight bright edge; an open one is
		// a vague haze with no surface to speak of.
		float skin = pow(rim, mix(1.4, 3.2, uGrip));
		// The strike's pulse: one bright belt thrown from the equator to the poles.
		// uPulse is how far along that travel the belt is, and it is brightest
		// halfway, so the grip closing reads as a wave rather than a flash.
		float belt = sin(uPulse * 3.14159265) * exp(-pow((vBelt - uPulse) * 6.0, 2.0));
		// The drawn outline. Ink gives a form a silhouette; without one a shell is
		// a smudge, whatever its fill is doing.
		float contour = uContour * pow(rim, 9.0);
		float alpha = uAlpha * (skin * (0.55 + 0.45 * uEmissive) + uFill * 0.35 + belt + contour);
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, min(1.0, skin + belt + contour)), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** The shell this frame, in seal units. */
export interface ShellState {
	radius: number;
	alpha: number;
	/** 0..1, how closed the grip is. Sharpens the skin into an edge. */
	grip: number;
	/** 0..1, how far the strike's grip pulse has travelled from equator to pole. */
	pulse: number;
	/** Radians. The bob the ball breathes by; the undulation reads the same one. */
	phase: number;
}

export interface HoldShell {
	readonly mesh: THREE.Mesh;
	setShell(state: ShellState): void;
	dispose(): void;
}

export function createHoldShell(options: { look: Look; material: MaterialProfile }): HoldShell {
	const geometry = new THREE.SphereGeometry(1, SEGMENTS.around, SEGMENTS.down);
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uAlpha: { value: 0 },
			uGrip: { value: 0 },
			uPulse: { value: 0 },
			uPhase: { value: 0 },
			// The body's own fill: earth is a mass with an inside, wind barely has one.
			uFill: { value: options.material.opacity },
			uEmissive: { value: options.material.emissive },
			uContour: { value: CONTOUR[options.material.edge] },
			uUndulation: { value: options.material.undulation },
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
	mesh.frustumCulled = false;

	return {
		mesh,
		setShell(state) {
			mesh.scale.setScalar(state.radius);
			material.uniforms.uAlpha.value = state.alpha;
			material.uniforms.uGrip.value = state.grip;
			material.uniforms.uPulse.value = state.pulse;
			material.uniforms.uPhase.value = state.phase;
			mesh.visible = state.alpha > 0 && state.radius > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
