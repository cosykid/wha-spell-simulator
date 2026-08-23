/**
 * @file The layer a set of strokes is painted onto: one geometry of loose quads,
 * rewritten every frame in back-to-front order, in a single draw call.
 *
 * Three's own transparent sort works per object, so a mass built of hundreds of
 * overlapping stamps would need hundreds of meshes to order correctly. Writing
 * the quads myself buys exact painter order for the price of one buffer upload,
 * which is what lets the strokes stack like cels instead of z-fighting.
 *
 * The fragment shader does the last painterly thing: it eats the stamp's edge
 * with a screen-fixed paper tooth, so the silhouette breaks up under the grain
 * of the page rather than resolving into a clean vector boundary.
 */

import * as THREE from 'three';
import { slotUv, type BrushSlot } from './brushTextures.js';

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
		// turns a soft falloff into a torn edge.
		ink *= smoothstep(0.006, 0.075, ink * mix(0.7, 1.0, grain));
		if (ink < 0.004) {
			discard;
		}
		gl_FragColor = vec4(vColor, min(ink, 1.0));
	}
`;

/** One stroke, as the layer needs it: a placed, oriented, tinted quad. */
export interface QuadWrite {
	x: number;
	y: number;
	z: number;
	/** Half-extents in seal units, along the stroke's own axes. */
	halfLong: number;
	halfShort: number;
	/** Screen-space rotation of the long axis, in radians. */
	angle: number;
	slot: BrushSlot;
	/** Bits 0 and 1 mirror the stamp in u and v, so four stamps read as sixteen. */
	flip: number;
	r: number;
	g: number;
	b: number;
	alpha: number;
	/** Seal-space distance from the viewer. Larger is farther, so a layer sorts descending. */
	depth: number;
}

/**
 * A painter's-order layer of stamps. Two of these make the column: one alpha
 * blended for the mass, one additive for the hot core drawn over it.
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

	constructor(atlas: THREE.Texture, capacity: number, blending: THREE.Blending, order: number) {
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
			uniforms: { uMap: { value: atlas } },
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending
		});

		this.#geometry = geometry;
		this.mesh = new THREE.Mesh(geometry, this.#material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = order;
	}

	/**
	 * Rewrites the layer from `quads`, which the caller has already sorted
	 * back-to-front. `long`/`short` are the stroke's own axes in seal space, taken
	 * from the camera so every stamp faces the viewer square-on.
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
			const c = i * 12;
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
				color[c + k * 3] = q.r;
				color[c + k * 3 + 1] = q.g;
				color[c + k * 3 + 2] = q.b;
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
