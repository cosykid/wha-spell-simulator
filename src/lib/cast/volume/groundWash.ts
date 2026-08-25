/**
 * @file The paper-contact wash under a cast: a flat tinted circle on the seal
 * plane whose weight and radius follow the mass actually near the ground, so
 * fire soots while it burns, water's puddle grows with its pool, earth's dust
 * skirts its mound, and light warms the paper it stands on. It lingers into
 * the afterglow and drains with it, which is that beat's whole content.
 */

import * as THREE from 'three';
import { WASH, type WashRow } from './pigment.js';
import type { VolumeElement } from './elements.js';

const WASH_VERTEX = /* glsl */ `
varying vec2 vLocal;
void main() {
	vLocal = position.xy;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WASH_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uRadius;
varying vec2 vLocal;

void main() {
	float r = length(vLocal);
	float wobble = 1.0 + 0.09 * sin(atan(vLocal.y, vLocal.x) * 5.0 + r * 9.0);
	float body = 1.0 - smoothstep(uRadius * 0.3, uRadius * wobble, r);
	float grain = 0.5 + 0.5 * sin(vLocal.x * 27.1 + vLocal.y * 7.9) * sin(vLocal.y * 23.7 - vLocal.x * 5.3);
	float alpha = uStrength * body * (0.88 + 0.16 * grain);
	gl_FragColor = vec4(uColor * alpha, alpha);
}
`;

export class GroundWash {
	readonly mesh: THREE.Mesh;
	readonly #material: THREE.ShaderMaterial;
	#row: WashRow = WASH.inert;

	constructor() {
		this.#material = new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: new THREE.Vector3(...this.#row.color) },
				uStrength: { value: 0 },
				uRadius: { value: this.#row.baseRadius }
			},
			vertexShader: WASH_VERTEX,
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

	/** Points the wash at one cast's element row. */
	attach(element: VolumeElement): void {
		this.#row = WASH[element];
		const [r, g, b] = this.#row.color;
		(this.#material.uniforms.uColor.value as THREE.Vector3).set(r, g, b);
		this.update(0, 0);
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
