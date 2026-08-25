/**
 * @file The screen chain: an accumulation buffer the parcels are drawn into, a
 * small separable bloom off it, and one composite out to the canvas.
 *
 * The accumulation is what buys motion. Each step the buffer is re-sampled a
 * little blurred, drifting upward and cooling, then multiplied down; the parcels
 * are drawn on top of that rather than onto a cleared frame. What the eye reads
 * is a continuous smear of where the mass has been, not the parcels themselves.
 */

import * as THREE from 'three';
import { QUAD_VERTEX } from './sim.glsl.js';
import { BLOOM_BLUR, BLOOM_BRIGHT, COMPOSITE, TRAIL_FADE } from './post.glsl.js';
import { POST } from './tuning.js';

/** Fraction of the canvas the accumulation runs at. Softness is the point. */
const TRAIL_SCALE = 0.62;
const BLOOM_SCALE = 0.25;

function target(width: number, height: number): THREE.WebGLRenderTarget {
	return new THREE.WebGLRenderTarget(Math.max(2, width), Math.max(2, height), {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: false,
		stencilBuffer: false,
		generateMipmaps: false
	});
}

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
	return new THREE.ShaderMaterial({
		uniforms,
		vertexShader: QUAD_VERTEX,
		fragmentShader,
		depthTest: false,
		depthWrite: false,
		transparent: true,
		blending: THREE.NoBlending
	});
}

export class PostFx {
	readonly #renderer: THREE.WebGLRenderer;
	readonly #scene = new THREE.Scene();
	readonly #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
	readonly #quad: THREE.Mesh;
	readonly #fade: THREE.ShaderMaterial;
	readonly #bright: THREE.ShaderMaterial;
	readonly #blur: THREE.ShaderMaterial;
	readonly #composite: THREE.ShaderMaterial;
	#trailA: THREE.WebGLRenderTarget;
	#trailB: THREE.WebGLRenderTarget;
	#bloomA: THREE.WebGLRenderTarget;
	#bloomB: THREE.WebGLRenderTarget;
	#width = 2;
	#height = 2;

	constructor(renderer: THREE.WebGLRenderer) {
		this.#renderer = renderer;
		this.#trailA = target(2, 2);
		this.#trailB = target(2, 2);
		this.#bloomA = target(2, 2);
		this.#bloomB = target(2, 2);

		this.#fade = pass(TRAIL_FADE, {
			uTrail: { value: null },
			uFade: { value: POST.trailFade },
			uDrift: { value: POST.trailDrift },
			uBlur: { value: POST.trailBlur },
			uCool: { value: new THREE.Vector3(0.995, 0.965, 0.94) }
		});
		this.#bright = pass(BLOOM_BRIGHT, {
			uSource: { value: null },
			uThreshold: { value: POST.bloomThreshold },
			uKnee: { value: POST.bloomKnee }
		});
		this.#blur = pass(BLOOM_BLUR, {
			uSource: { value: null },
			uStep: { value: new THREE.Vector2() }
		});
		this.#composite = pass(COMPOSITE, {
			uTrail: { value: null },
			uBloom: { value: null },
			uStrength: { value: POST.bloomStrength },
			uBloomAlpha: { value: POST.bloomAlpha }
		});
		this.#composite.blending = THREE.NoBlending;

		this.#quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#fade);
		this.#quad.frustumCulled = false;
		this.#scene.add(this.#quad);
	}

	/** Matches the buffers to a canvas of this backing-store size. */
	resize(width: number, height: number) {
		const w = Math.max(2, Math.round(width * TRAIL_SCALE));
		const h = Math.max(2, Math.round(height * TRAIL_SCALE));
		if (w === this.#width && h === this.#height) {
			return;
		}
		this.#width = w;
		this.#height = h;
		for (const rt of [this.#trailA, this.#trailB]) {
			rt.setSize(w, h);
		}
		for (const rt of [this.#bloomA, this.#bloomB]) {
			rt.setSize(
				Math.max(2, Math.round(w * BLOOM_SCALE)),
				Math.max(2, Math.round(h * BLOOM_SCALE))
			);
		}
		this.clear();
	}

	/** Drops the accumulation, so a restart does not inherit the last cast's smoke. */
	clear() {
		for (const rt of [this.#trailA, this.#trailB, this.#bloomA, this.#bloomB]) {
			this.#renderer.setRenderTarget(rt);
			this.#renderer.setClearColor(0x000000, 0);
			this.#renderer.clear(true, false, false);
		}
		this.#renderer.setRenderTarget(null);
	}

	/**
	 * One screen step: fade the accumulation forward, draw the mass into it, bloom
	 * it, and composite to the canvas.
	 */
	render(scene: THREE.Scene, camera: THREE.Camera) {
		this.#fade.uniforms.uTrail.value = this.#trailA.texture;
		this.#draw(this.#fade, this.#trailB);

		this.#renderer.autoClear = false;
		this.#renderer.setRenderTarget(this.#trailB);
		this.#renderer.render(scene, camera);
		this.#renderer.setRenderTarget(null);
		this.#renderer.autoClear = true;

		const swap = this.#trailA;
		this.#trailA = this.#trailB;
		this.#trailB = swap;

		this.#bloom(this.#trailA.texture);

		this.#composite.uniforms.uTrail.value = this.#trailA.texture;
		this.#composite.uniforms.uBloom.value = this.#bloomA.texture;
		this.#draw(this.#composite, null);
	}

	dispose() {
		this.#quad.geometry.dispose();
		for (const material of [this.#fade, this.#bright, this.#blur, this.#composite]) {
			material.dispose();
		}
		for (const rt of [this.#trailA, this.#trailB, this.#bloomA, this.#bloomB]) {
			rt.dispose();
		}
	}

	#bloom(source: THREE.Texture) {
		const width = this.#bloomA.width;
		const height = this.#bloomA.height;
		this.#bright.uniforms.uSource.value = source;
		this.#draw(this.#bright, this.#bloomA);
		for (const radius of [1, 2.6]) {
			this.#blurOnce(this.#bloomA, this.#bloomB, radius / width, 0);
			this.#blurOnce(this.#bloomB, this.#bloomA, 0, radius / height);
		}
	}

	#blurOnce(from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, x: number, y: number) {
		this.#blur.uniforms.uSource.value = from.texture;
		(this.#blur.uniforms.uStep.value as THREE.Vector2).set(x, y);
		this.#draw(this.#blur, to);
	}

	#draw(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
		this.#quad.material = material;
		this.#renderer.setRenderTarget(to);
		this.#renderer.render(this.#scene, this.#camera);
		this.#renderer.setRenderTarget(null);
	}
}
