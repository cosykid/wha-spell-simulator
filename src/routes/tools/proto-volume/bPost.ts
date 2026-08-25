/**
 * @file Style B's screen chain runner: fade the accumulation forward, draw the
 * stamp scene into it, blur a copy into the metaball field, and composite the
 * thresholded, ink-rimmed body out to the canvas. Structure copied from
 * proto-hybrid's PostFx; the bloom is gone, the metaball pass replaced it.
 */

import * as THREE from 'three';
import { B_QUAD_VERTEX } from './bSim.glsl.js';
import { B_BLUR, B_COMPOSITE, B_TRAIL_FADE } from './bPost.glsl.js';
import { INKS, SUBSTRATE, type ProtoElement } from './elements.js';

/** Fraction of the canvas the accumulation runs at. */
const TRAIL_SCALE = 0.78;
/** Fraction of the trail the metaball field runs at. */
const SOFT_SCALE = 0.5;

/** Per-element trail cooling: fire soots, water deepens, wind just thins. */
const COOL: Record<ProtoElement, readonly [number, number, number]> = {
	fire: [0.995, 0.965, 0.94],
	water: [0.962, 0.988, 0.996],
	wind: [0.97, 0.97, 0.97]
};

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
		vertexShader: B_QUAD_VERTEX,
		fragmentShader,
		depthTest: false,
		depthWrite: false,
		transparent: true,
		blending: THREE.NoBlending
	});
}

export class BPost {
	readonly #renderer: THREE.WebGLRenderer;
	readonly #row: (typeof SUBSTRATE)[ProtoElement];
	readonly #scene = new THREE.Scene();
	readonly #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
	readonly #quad: THREE.Mesh;
	readonly #fade: THREE.ShaderMaterial;
	readonly #blur: THREE.ShaderMaterial;
	readonly #composite: THREE.ShaderMaterial;
	#trailA: THREE.WebGLRenderTarget;
	#trailB: THREE.WebGLRenderTarget;
	#softA: THREE.WebGLRenderTarget;
	#softB: THREE.WebGLRenderTarget;
	#width = 2;
	#height = 2;

	constructor(renderer: THREE.WebGLRenderer, element: ProtoElement) {
		this.#renderer = renderer;
		this.#row = SUBSTRATE[element];
		this.#trailA = target(2, 2);
		this.#trailB = target(2, 2);
		this.#softA = target(2, 2);
		this.#softB = target(2, 2);

		const cool = COOL[element];
		const ink = INKS[element];
		this.#fade = pass(B_TRAIL_FADE, {
			uTrail: { value: null },
			uFade: { value: this.#row.fade },
			uDrift: { value: this.#row.drift },
			uBlur: { value: 0.0012 },
			uCool: { value: new THREE.Vector3(cool[0], cool[1], cool[2]) }
		});
		this.#blur = pass(B_BLUR, {
			uSource: { value: null },
			uStep: { value: new THREE.Vector2() }
		});
		this.#composite = pass(B_COMPOSITE, {
			uTrail: { value: null },
			uSoft: { value: null },
			uTexel: { value: new THREE.Vector2(1 / 2, 1 / 2) },
			uThreshLo: { value: this.#row.threshLo },
			uThreshHi: { value: this.#row.threshHi },
			uRim: { value: this.#row.rim },
			uGlint: { value: this.#row.glint },
			uBodyAlpha: { value: this.#row.bodyAlpha },
			uSub: { value: this.#row.sub },
			uSharpMix: { value: this.#row.sharpMix },
			uSharpBody: { value: this.#row.sharpBody },
			uTime: { value: 0 },
			uInk: { value: new THREE.Vector3(ink[0], ink[1], ink[2]) }
		});

		this.#quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#fade);
		this.#quad.frustumCulled = false;
		this.#scene.add(this.#quad);
	}

	resize(width: number, height: number): void {
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
		const sw = Math.max(2, Math.round(w * SOFT_SCALE));
		const sh = Math.max(2, Math.round(h * SOFT_SCALE));
		for (const rt of [this.#softA, this.#softB]) {
			rt.setSize(sw, sh);
		}
		(this.#composite.uniforms.uTexel.value as THREE.Vector2).set(1 / sw, 1 / sh);
		this.clear();
	}

	clear(): void {
		for (const rt of [this.#trailA, this.#trailB, this.#softA, this.#softB]) {
			this.#renderer.setRenderTarget(rt);
			this.#renderer.setClearColor(0x000000, 0);
			this.#renderer.clear(true, false, false);
		}
		this.#renderer.setRenderTarget(null);
	}

	/** One screen step: fade, accumulate the stamps, soften, composite out. */
	render(scene: THREE.Scene, camera: THREE.Camera, tS: number): void {
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

		// Two separable passes at two radii: the metaball field. The vertical
		// radius can run longer (wind), which rounds a scalloped crown.
		const radius = this.#row.blurPx;
		const ry = radius * this.#row.blurYScale;
		this.#blurOnce(this.#trailA.texture, this.#softA, radius / this.#softA.width, 0);
		this.#blurOnce(this.#softA.texture, this.#softB, 0, ry / this.#softA.height);
		this.#blurOnce(this.#softB.texture, this.#softA, (radius * 2.1) / this.#softA.width, 0);
		this.#blurOnce(this.#softA.texture, this.#softB, 0, (ry * 2.1) / this.#softA.height);

		this.#composite.uniforms.uTrail.value = this.#trailA.texture;
		this.#composite.uniforms.uSoft.value = this.#softB.texture;
		this.#composite.uniforms.uTime.value = tS;
		this.#draw(this.#composite, null);
	}

	dispose(): void {
		this.#quad.geometry.dispose();
		for (const material of [this.#fade, this.#blur, this.#composite]) {
			material.dispose();
		}
		for (const rt of [this.#trailA, this.#trailB, this.#softA, this.#softB]) {
			rt.dispose();
		}
	}

	#blurOnce(from: THREE.Texture, to: THREE.WebGLRenderTarget, x: number, y: number): void {
		this.#blur.uniforms.uSource.value = from;
		(this.#blur.uniforms.uStep.value as THREE.Vector2).set(x, y);
		this.#draw(this.#blur, to);
	}

	#draw(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null): void {
		this.#quad.material = material;
		this.#renderer.setRenderTarget(to);
		this.#renderer.render(this.#scene, this.#camera);
		this.#renderer.setRenderTarget(null);
	}
}
