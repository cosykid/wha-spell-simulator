/**
 * @file Style C's dress: the same marching-cubes body as A, shaded as flat
 * watercolor washes with a DARK ink rim. No lights, no cel bands — pigment
 * flats posterized by height, granulated like paper, and outlined where the
 * surface turns away from the eye, so the mass reads as an ink-outlined
 * watercolor shape. Water keeps a subtle glint; nothing else speculates.
 * Underneath, a ground wash gives the cast its paper contact.
 */

import * as THREE from 'three';
import { INK_STYLE, INKS, rampGlsl, type ProtoElement } from './elements.js';

const KEY_DIR = new THREE.Vector3(2.5, 4.0, 1.5).normalize();

const INK_VERTEX = /* glsl */ `
varying vec3 vNrm;
varying vec3 vWPos;
varying vec3 vViewDir;
void main() {
	vec4 wp = modelMatrix * vec4(position, 1.0);
	vWPos = wp.xyz;
	vNrm = normalize(mat3(modelMatrix) * normal);
	vViewDir = normalize(cameraPosition - wp.xyz);
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

function inkFragment(element: ProtoElement): string {
	return /* glsl */ `
uniform float uTime;
uniform float uReach;
uniform float uOpacity;
uniform float uBands;
uniform float uRim;
uniform float uGlint;
uniform float uHeatBase;
uniform float uHeatSpan;
uniform vec3 uInk;
uniform vec3 uKeyDir;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec3 vViewDir;

${rampGlsl(element)}

void main() {
	vec3 nrm = normalize(vNrm);
	// A face can arrive flipped (double-sided isosurface); light the near side.
	if (dot(nrm, vViewDir) < 0.0) nrm = -nrm;

	// World y is seal height. Wobble keeps the wash borders hand-laid.
	float heightN = clamp(vWPos.y / uReach, 0.0, 1.3);
	float wobble = 0.10 * sin(vWPos.x * 5.1 + uTime * 1.1) * sin(vWPos.z * 4.3 - uTime * 0.9)
		+ 0.06 * sin(vWPos.y * 6.7 + uTime * 0.7);
	float heat = uHeatBase + uHeatSpan * heightN + wobble;

	// Flat washes: quantize the ramp into a few steps with soft borders.
	float hb = heat * uBands;
	float q = (floor(hb) + smoothstep(0.35, 0.65, fract(hb))) / uBands;
	vec3 wash = pigment(q);

	// Paper granulation, kept coarse so it reads as tooth rather than static.
	float grain = 0.5 + 0.5 * sin(vWPos.x * 23.0) * sin(vWPos.z * 21.0 + vWPos.y * 17.0);
	wash *= 0.95 + 0.07 * grain;

	// The ink line: fresnel runs DARK here, not bright, and only at the true
	// silhouette so the interior bumps stay wash rather than speckle.
	float fres = pow(1.0 - clamp(dot(nrm, vViewDir), 0.0, 1.0), 2.2);
	float rim = smoothstep(0.42, 0.85, fres) * uRim;
	vec3 col = mix(wash, uInk, rim);

	// Water's one concession to shine, kept subtle.
	if (uGlint > 0.0) {
		vec3 nRip = nrm;
		nRip.xz += 0.2 * vec2(
			sin(vWPos.x * 7.0 + uTime * 2.6 + vWPos.y * 3.0),
			sin(vWPos.z * 7.0 - uTime * 2.2 + vWPos.y * 4.0));
		nRip = normalize(nRip);
		float glint = smoothstep(0.95, 0.975, dot(nRip, normalize(uKeyDir + vViewDir)));
		col += vec3(0.9, 0.97, 1.0) * glint * 0.6 * uGlint;
	}

	float alpha = uOpacity * (0.88 + 0.28 * rim);
	gl_FragColor = vec4(col * alpha, alpha);
}
`;
}

/** Style C's skin material for one element. `uTime` is cast seconds. */
export function inkSkinMaterial(
	element: ProtoElement,
	reach: number,
	uTime: { value: number }
): THREE.ShaderMaterial {
	const row = INK_STYLE[element];
	const ink = INKS[element];
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime,
			uReach: { value: reach },
			uOpacity: { value: row.opacity },
			uBands: { value: row.bands },
			uRim: { value: row.rim },
			uGlint: { value: row.glint },
			uHeatBase: { value: row.heatBase },
			uHeatSpan: { value: row.heatSpan },
			uInk: { value: new THREE.Vector3(ink[0], ink[1], ink[2]) },
			uKeyDir: { value: KEY_DIR.clone() }
		},
		vertexShader: INK_VERTEX,
		fragmentShader: inkFragment(element),
		transparent: true,
		depthWrite: INK_STYLE[element].opacity > 0.5,
		side: THREE.DoubleSide,
		blending: THREE.CustomBlending,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.OneMinusSrcAlphaFactor,
		blendSrcAlpha: THREE.OneFactor,
		blendDstAlpha: THREE.OneMinusSrcAlphaFactor
	});
}

/** Per-element ground wash colors and weights: fire soots, water pools, wind dusts. */
const WASH: Record<
	ProtoElement,
	{ color: readonly [number, number, number]; strength: number; baseRadius: number; grow: number }
> = {
	fire: { color: [0.3, 0.17, 0.1], strength: 0.3, baseRadius: 0.95, grow: 0.25 },
	water: { color: [0.14, 0.34, 0.55], strength: 0.5, baseRadius: 0.55, grow: 1.15 },
	wind: { color: [0.52, 0.6, 0.57], strength: 0.09, baseRadius: 1.1, grow: 0.3 }
};

const WASH_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uRadius;
varying vec2 vLocal;

void main() {
	float r = length(vLocal);
	float wobble = 1.0 + 0.09 * sin(atan(vLocal.y, vLocal.x) * 5.0 + r * 9.0);
	float body = 1.0 - smoothstep(uRadius * 0.3, uRadius * wobble, r);
	float grain = 0.5 + 0.5 * sin(vLocal.x * 41.0) * sin(vLocal.y * 43.0);
	float alpha = uStrength * body * (0.8 + 0.25 * grain);
	gl_FragColor = vec4(uColor * alpha, alpha);
}
`;

/**
 * The paper-contact wash under a style C cast: a flat tinted circle whose
 * radius and weight the stage drives per frame (water's grows with its pool).
 */
export class GroundWash {
	readonly mesh: THREE.Mesh;
	readonly #material: THREE.ShaderMaterial;
	readonly #row: (typeof WASH)[ProtoElement];

	constructor(element: ProtoElement) {
		this.#row = WASH[element];
		this.#material = new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: new THREE.Vector3(...this.#row.color) },
				uStrength: { value: 0 },
				uRadius: { value: this.#row.baseRadius }
			},
			vertexShader: /* glsl */ `
				varying vec2 vLocal;
				void main() {
					vLocal = position.xy;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: WASH_FRAGMENT,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor
		});
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), this.#material);
		this.mesh.position.set(0, 0, 0.006);
		this.mesh.renderOrder = -1;
		this.mesh.frustumCulled = false;
		this.mesh.name = 'ground-wash';
	}

	/** `gauge` 0..1 is how much cast is on the ground; `drain` dries it out. */
	update(gauge: number, drain: number): void {
		const row = this.#row;
		this.#material.uniforms.uStrength.value = row.strength * gauge * (1 - drain);
		this.#material.uniforms.uRadius.value = row.baseRadius + row.grow * gauge;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.#material.dispose();
	}
}
