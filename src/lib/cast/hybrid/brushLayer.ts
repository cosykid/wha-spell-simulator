/**
 * @file The layer a set of brush marks is painted onto: one geometry of loose
 * quads, rewritten every frame in back-to-front order, in a single draw call.
 *
 * Three's own transparent sort works per object, so a crowd of overlapping
 * stamps would need one mesh each to order correctly. Writing the quads myself
 * buys exact painter order for the price of one buffer upload, which is what
 * lets the marks stack like cels over the fluid instead of z-fighting it.
 *
 * The blend is the fluid's: premultiplied `ONE / ONE_MINUS_SRC_ALPHA`, so the
 * marks composite into the same accumulation buffer the mass is drawn into and
 * pick up the same feedback smear. A layer that gives up its alpha turns the
 * same equation into a pure add, which is how the hot core layer is drawn.
 */

import * as THREE from 'three';
import { slotUv } from './brushSlot.js';
import type { QuadWrite } from './markPool.js';

const VERTEX_SHADER = /* glsl */ `
	attribute vec3 aColor;
	attribute float aAlpha;
	varying vec2 vUv;
	varying vec3 vColor;
	varying float vAlpha;
	void main() {
		vUv = uv;
		vColor = aColor;
		vAlpha = aAlpha;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform sampler2D uMap;
	uniform float uAdditive;
	varying vec2 vUv;
	varying vec3 vColor;
	varying float vAlpha;

	float tooth(vec2 p) {
		return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
	}

	void main() {
		float ink = texture2D(uMap, vUv).a * vAlpha;
		// Coarse, screen-fixed tooth: the page has a grain and the pigment sits in
		// it. Fine enough to break an edge, never fine enough to read as noise.
		float grain = tooth(floor(gl_FragCoord.xy * 0.34));
		ink *= mix(0.84, 1.06, grain);
		// The tooth bites hardest where the stamp is already thin, which is what
		// turns a soft falloff into a torn edge. The band is wide on purpose: a
		// narrow one cuts a hard contour, and a hard contour is a vector shape.
		ink *= smoothstep(0.004, 0.078, ink * mix(0.7, 1.0, grain));
		ink = min(ink, 1.0);
		if (ink < 0.004) {
			discard;
		}
		gl_FragColor = vec4(vColor * ink, ink * (1.0 - uAdditive));
	}
`;

/**
 * A painter's-order layer of stamps. `addShare` is how much of a mark adds
 * rather than covers: zero composites it like pigment on paper, one turns the
 * same blend into a pure add, and between the two a mark can glow without a
 * crowd of them stacking into a white hole.
 */
export class BrushLayer {
	readonly mesh: THREE.Mesh;
	readonly #position: THREE.BufferAttribute;
	readonly #uv: THREE.BufferAttribute;
	readonly #color: THREE.BufferAttribute;
	readonly #alpha: THREE.BufferAttribute;
	readonly #geometry: THREE.BufferGeometry;
	readonly #material: THREE.ShaderMaterial;
	readonly #capacity: number;

	constructor(atlas: THREE.Texture, capacity: number, addShare: number, order: number) {
		this.#capacity = capacity;
		const geometry = new THREE.BufferGeometry();
		const verts = capacity * 4;
		this.#position = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(
			THREE.DynamicDrawUsage
		);
		this.#uv = new THREE.BufferAttribute(new Float32Array(verts * 2), 2).setUsage(
			THREE.DynamicDrawUsage
		);
		this.#color = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(
			THREE.DynamicDrawUsage
		);
		this.#alpha = new THREE.BufferAttribute(new Float32Array(verts), 1).setUsage(
			THREE.DynamicDrawUsage
		);
		geometry.setAttribute('position', this.#position);
		geometry.setAttribute('uv', this.#uv);
		geometry.setAttribute('aColor', this.#color);
		geometry.setAttribute('aAlpha', this.#alpha);

		const indices = new Uint16Array(capacity * 6);
		for (let i = 0; i < capacity; i += 1) {
			const v = i * 4;
			indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
		}
		geometry.setIndex(new THREE.BufferAttribute(indices, 1));
		// The seal root is left-handed, so every triangle under it winds the other
		// way and a culled quad would show its back.
		this.#material = new THREE.ShaderMaterial({
			uniforms: { uMap: { value: atlas }, uAdditive: { value: addShare } },
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor
		});

		this.#geometry = geometry;
		this.mesh = new THREE.Mesh(geometry, this.#material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = order;
	}

	/**
	 * Rewrites the layer from `quads`, which the caller has already sorted
	 * back-to-front. `right`/`up` are the camera's own axes in seal space, so
	 * every stamp faces the viewer square-on.
	 */
	write(quads: readonly QuadWrite[], right: THREE.Vector3, up: THREE.Vector3): void {
		const position = this.#position.array as Float32Array;
		const uv = this.#uv.array as Float32Array;
		const color = this.#color.array as Float32Array;
		const alpha = this.#alpha.array as Float32Array;
		// An over-full frame drops its farthest quads rather than writing past the
		// buffer, because the list is sorted back to front.
		const start = Math.max(0, quads.length - this.#capacity);
		const count = quads.length - start;

		for (let i = 0; i < count; i += 1) {
			const q = quads[start + i];
			const cos = Math.cos(q.angle);
			const sin = Math.sin(q.angle);
			const lx = (right.x * cos + up.x * sin) * q.halfLong;
			const ly = (right.y * cos + up.y * sin) * q.halfLong;
			const lz = (right.z * cos + up.z * sin) * q.halfLong;
			const sx = (-right.x * sin + up.x * cos) * q.halfShort;
			const sy = (-right.y * sin + up.y * cos) * q.halfShort;
			const sz = (-right.z * sin + up.z * cos) * q.halfShort;
			const [u0, v0, u1, v1] = slotUv(q.slot, q.flip);

			const p = i * 12;
			const t = i * 8;
			const a = i * 4;
			const corners = [
				[-1, -1, u0, v0],
				[1, -1, u1, v0],
				[1, 1, u1, v1],
				[-1, 1, u0, v1]
			];
			for (let k = 0; k < 4; k += 1) {
				const [sl, ss, cu, cv] = corners[k];
				position[p + k * 3] = q.x + lx * sl + sx * ss;
				position[p + k * 3 + 1] = q.y + ly * sl + sy * ss;
				position[p + k * 3 + 2] = q.z + lz * sl + sz * ss;
				uv[t + k * 2] = cu;
				uv[t + k * 2 + 1] = cv;
				color[p + k * 3] = q.r;
				color[p + k * 3 + 1] = q.g;
				color[p + k * 3 + 2] = q.b;
				alpha[a + k] = q.alpha;
			}
		}

		this.#position.needsUpdate = true;
		this.#uv.needsUpdate = true;
		this.#color.needsUpdate = true;
		this.#alpha.needsUpdate = true;
		this.#geometry.setDrawRange(0, count * 6);
	}

	dispose(): void {
		this.#geometry.dispose();
		this.#material.dispose();
	}
}
