/**
 * @file The prototype's stage: the WebGL surface, the portal's own camera, the
 * seal root, and the fixed clock that drives the fluid.
 *
 * The camera and the seal root are imported from `cast/stage/` read-only, so the
 * mass stands in the same perspective as the paper the page tilts underneath it.
 * Everything else here is local to the bake-off.
 */

import * as THREE from 'three';
import { aimPortalCamera, createPortalCamera } from '$lib/cast/stage/portalCamera.js';
import { createSealRoot } from '$lib/cast/stage/sealRoot.js';
import type { RingInfo } from '$lib/types.js';
import { FluidDraw } from './fluidDraw.js';
import { FluidSim } from './fluidSim.js';
import { PostFx } from './postFx.js';
import { protoFluidSpell, type FluidSpell } from './spell.js';
import { STEP_S } from './tuning.js';

/** Where the test ring sits on the untilted paper, as fractions of the canvas box. */
export const RING = { centerX: 0.5, centerY: 0.72, radius: 0.4 } as const;

/** Steps whose accumulation still shows. A seek only renders this many for real. */
const TRAIL_MEMORY = 34;

export class FluidStage {
	readonly spell: FluidSpell;
	readonly #renderer: THREE.WebGLRenderer;
	readonly #scene = new THREE.Scene();
	readonly #camera = createPortalCamera();
	readonly #sealRoot = createSealRoot();
	readonly #sim: FluidSim;
	readonly #draw: FluidDraw;
	readonly #post: PostFx;
	#steps = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.spell = protoFluidSpell();
		this.#renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: false,
			premultipliedAlpha: true,
			// Throwaway: every capture is a screenshot of a frame that already landed.
			preserveDrawingBuffer: true
		});
		this.#renderer.setClearColor(0x000000, 0);
		this.#renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
		this.#renderer.toneMapping = THREE.NoToneMapping;
		this.#renderer.autoClearColor = true;

		this.#sim = new FluidSim(this.#renderer, this.spell);
		const sources = this.#sim.textures;
		this.#draw = new FluidDraw(sources.position, sources.velocity);
		this.#post = new PostFx(this.#renderer);

		this.#sealRoot.add(this.#draw.mesh);
		this.#scene.add(this.#sealRoot);
	}

	/** How many parcels are in flight, for the page's readout. */
	get parcelCount(): number {
		return this.#sim.count;
	}

	/** Drops the cast so the next frame starts from a cold seal. */
	reset() {
		this.#steps = 0;
		this.#post.clear();
	}

	/**
	 * Advances the cast to `tMs` and paints it. Steps older than the accumulation
	 * can remember are simulated but not drawn, so a scripted seek to four seconds
	 * costs the flow but not the fill rate.
	 */
	seekTo(tMs: number) {
		const wanted = Math.max(0, Math.round(tMs / (STEP_S * 1000)));
		if (wanted < this.#steps) {
			this.reset();
			this.#sim.step(0);
		}
		const silent = Math.max(this.#steps, wanted - TRAIL_MEMORY);
		while (this.#steps < silent) {
			this.#steps += 1;
			this.#sim.step(this.#steps * STEP_S * 1000);
		}
		while (this.#steps < wanted) {
			this.#steps += 1;
			this.#stepAndPaint();
		}
	}

	/** One live frame: advance the fixed clock by one step and paint it. */
	advance() {
		this.#steps += 1;
		this.#stepAndPaint();
	}

	/** The cast time the last painted frame stands at. */
	get elapsedMs(): number {
		return this.#steps * STEP_S * 1000;
	}

	/** Matches the drawing buffer and the buffers behind it to the canvas box. */
	resize(width: number, height: number, pixelRatio: number) {
		this.#renderer.setPixelRatio(pixelRatio);
		this.#renderer.setSize(width, height, false);
		const canvas = this.#renderer.domElement;
		this.#post.resize(canvas.width, canvas.height);
	}

	dispose() {
		this.#sim.dispose();
		this.#draw.dispose();
		this.#post.dispose();
		this.#renderer.dispose();
	}

	#stepAndPaint() {
		const tMs = this.#steps * STEP_S * 1000;
		this.#sim.step(tMs);
		const sources = this.#sim.textures;
		this.#draw.setSources(sources.position, sources.velocity);
		aimPortalCamera(this.#camera, { canvas: this.#renderer.domElement, ring: this.#ringInfo() });
		this.#post.render(this.#scene, this.#camera);
	}

	#ringInfo(): RingInfo {
		const canvas = this.#renderer.domElement;
		return {
			found: true,
			complete: true,
			center: { x: canvas.width * RING.centerX, y: canvas.height * RING.centerY },
			radius: Math.min(canvas.width, canvas.height) * RING.radius,
			strokeIds: ['proto-ring']
		};
	}
}
