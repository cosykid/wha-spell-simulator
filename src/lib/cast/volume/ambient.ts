/**
 * @file The charge-beat ambient, in the volume vocabulary: R-10's thin medium
 * as a few large, faint watercolor washes drifting in over the paper, driven
 * by the shimmer channel's own tracers. The charge is content, not dead time
 * (R-01): while the portal tilts, these washes are the whole picture.
 *
 * They are washes, never dots: each quad is a broad granulated blot at low
 * alpha, composited rather than added, and the population is deliberately
 * small so the medium reads as weather on the page. It may never dominate a
 * frame — the alpha cap lives in `tuning.ts` and the shimmer cell's emission
 * is capped again on top of it.
 */

import * as THREE from 'three';
import { AMBIENT } from './tuning.js';
import { ambientTint } from './pigment.js';
import type { VolumeChannel } from './substrate.js';
import type { VolumeElement } from './elements.js';

/** The blot: one soft-edged granulated stamp every wash instance samples. */
function bakeBlot(): THREE.CanvasTexture {
	const size = 128;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const half = size / 2;
	const image = ctx.createImageData(size, size);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const dx = (x - half) / half;
			const dy = (y - half) / half;
			const r = Math.hypot(dx, dy);
			// A wobbled edge so the blot reads laid by hand, and coarse granulation
			// so it reads as pigment settling into tooth rather than as a sprite.
			const angle = Math.atan2(dy, dx);
			const edge = 0.82 + 0.14 * Math.sin(angle * 5 + 1.7) + 0.09 * Math.sin(angle * 9 - 0.6);
			const body = Math.max(0, 1 - Math.pow(r / edge, 2.2));
			const grain = 0.82 + 0.18 * Math.sin(x * 0.61) * Math.sin(y * 0.53 + x * 0.11);
			const a = Math.round(255 * Math.min(1, body * grain));
			const i = (y * size + x) * 4;
			image.data[i] = 255;
			image.data[i + 1] = 255;
			image.data[i + 2] = 255;
			image.data[i + 3] = a;
		}
	}
	ctx.putImageData(image, 0, 0);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.NoColorSpace;
	return texture;
}

const AMBIENT_VERTEX = /* glsl */ `
attribute float instanceAlpha;
varying vec2 vUv;
varying float vAlpha;
void main() {
	vUv = uv;
	vAlpha = instanceAlpha;
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const AMBIENT_FRAGMENT = /* glsl */ `
uniform sampler2D uBlot;
uniform vec3 uTint;
varying vec2 vUv;
varying float vAlpha;
void main() {
	float blot = texture2D(uBlot, vUv).a;
	float alpha = blot * vAlpha;
	gl_FragColor = vec4(uTint * alpha, alpha);
}
`;

export class AmbientWashes {
	readonly mesh: THREE.InstancedMesh;
	readonly #material: THREE.ShaderMaterial;
	readonly #blot: THREE.CanvasTexture;
	readonly #alphas: THREE.InstancedBufferAttribute;
	readonly #matrix = new THREE.Matrix4();
	readonly #normal = new THREE.Vector3();

	constructor() {
		this.#blot = bakeBlot();
		this.#material = new THREE.ShaderMaterial({
			uniforms: {
				uBlot: { value: this.#blot },
				uTint: { value: new THREE.Vector3(0.5, 0.5, 0.5) }
			},
			vertexShader: AMBIENT_VERTEX,
			fragmentShader: AMBIENT_FRAGMENT,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor
		});
		const quad = new THREE.PlaneGeometry(1, 1);
		this.mesh = new THREE.InstancedMesh(quad, this.#material, AMBIENT.quads);
		this.#alphas = new THREE.InstancedBufferAttribute(new Float32Array(AMBIENT.quads), 1);
		this.#alphas.setUsage(THREE.DynamicDrawUsage);
		quad.setAttribute('instanceAlpha', this.#alphas);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.count = 0;
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = -0.5;
		this.mesh.name = 'ambient-washes';
	}

	/** Points the washes at one cast's element tint. */
	attach(element: VolumeElement): void {
		const tint = ambientTint(element);
		(this.#material.uniforms.uTint.value as THREE.Vector3).set(tint.r, tint.g, tint.b);
	}

	/**
	 * Rebuilds every instance from the medium's live tracers, billboarded
	 * against the camera. `right` and `up` are the camera's basis already
	 * converted to seal space (the stage owns that conversion). Stateless per
	 * paint: the same tracer arrays always produce the same washes.
	 */
	update(channel: VolumeChannel, right: THREE.Vector3, up: THREE.Vector3): void {
		const { pos, vel, alive, fade, capacity } = channel.tracers;
		const veil = channel.flow.emission;
		this.#normal.crossVectors(right, up);
		let count = 0;
		for (let i = 0; i < capacity && count < AMBIENT.quads; i += 1) {
			if (!alive[i] || fade[i] <= 0.02) continue;
			const speed = Math.hypot(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]);
			const size = AMBIENT.size * (0.55 + 0.8 * fade[i]);
			const sx = size * (1 + AMBIENT.stretch * Math.min(0.6, speed));
			const m = this.#matrix;
			m.set(
				right.x * sx,
				up.x * size,
				this.#normal.x,
				pos[i * 3],
				right.y * sx,
				up.y * size,
				this.#normal.y,
				pos[i * 3 + 1],
				right.z * sx,
				up.z * size,
				this.#normal.z,
				pos[i * 3 + 2],
				0,
				0,
				0,
				1
			);
			this.mesh.setMatrixAt(count, m);
			this.#alphas.setX(count, AMBIENT.alpha * fade[i] * Math.min(1, veil * 3));
			count += 1;
		}
		this.mesh.count = count;
		this.mesh.instanceMatrix.needsUpdate = true;
		this.#alphas.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.#material.dispose();
		this.#blot.dispose();
	}
}
