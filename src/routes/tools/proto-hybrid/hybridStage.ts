/**
 * @file The prototype's stage: the WebGL surface, the portal's own camera, the
 * seal root, and the fixed clock that drives both populations.
 *
 * The two halves are one scene and one accumulation buffer. The fluid body is
 * drawn first, the brush marks straight over it in painter order, and the whole
 * thing goes through the same feedback pass — so the licks pick up the mass's
 * own smear and sit *in* the paint rather than on top of it.
 *
 * The camera and the seal root are imported from `cast/stage/` read-only, so the
 * column stands in the same perspective as the paper the page tilts underneath.
 */

import * as THREE from 'three';
import { aimPortalCamera, createPortalCamera } from '$lib/cast/stage/portalCamera.js';
import { createSealRoot } from '$lib/cast/stage/sealRoot.js';
import type { RingInfo } from '$lib/types.js';
import { BrushLayer } from './brushMesh.js';
import { createBrushAtlas } from './brushStamps.js';
import { FluidDraw } from './fluidDraw.js';
import { FluidSim } from './fluidSim.js';
import { LickSwarm } from './lickSwarm.js';
import { PostFx } from './postFx.js';
import { hybridSpell, type HybridSpell } from './hybridSpell.js';
import { LICK, STEP_S } from './tuning.js';

/**
 * Where the seal sits on the untilted paper, as fractions of the canvas box. Set
 * low and large: the column is what the bake-off is judging, so it gets the
 * frame, and the paper gets what is left.
 */
export const RING = { centerX: 0.5, centerY: 0.66, radius: 0.38 } as const;

/** Steps whose accumulation still shows. A seek only paints this many. */
const TRAIL_MEMORY = 36;

/** Quads each brush layer can hold. Most of the crowd is licks. */
const LAID_CAPACITY = 420;
const ADDED_CAPACITY = 620;

export class HybridStage {
	readonly spell: HybridSpell;
	readonly #renderer: THREE.WebGLRenderer;
	readonly #scene = new THREE.Scene();
	readonly #camera = createPortalCamera();
	readonly #sealRoot = createSealRoot();
	readonly #sim: FluidSim;
	readonly #draw: FluidDraw;
	readonly #swarm: LickSwarm;
	readonly #atlas: THREE.CanvasTexture;
	readonly #laid: BrushLayer;
	readonly #added: BrushLayer;
	readonly #post: PostFx;
	readonly #right = new THREE.Vector3();
	readonly #up = new THREE.Vector3();
	#steps = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.spell = hybridSpell();
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
		this.#swarm = new LickSwarm(this.spell);
		this.#atlas = createBrushAtlas();
		this.#laid = new BrushLayer(this.#atlas, LAID_CAPACITY, 0, 1);
		this.#added = new BrushLayer(this.#atlas, ADDED_CAPACITY, LICK.addShare, 2);
		this.#post = new PostFx(this.#renderer);

		this.#sealRoot.add(this.#draw.mesh, this.#laid.mesh, this.#added.mesh);
		this.#scene.add(this.#sealRoot);
	}

	/** How many parcels are in flight, for the page's readout. */
	get parcelCount(): number {
		return this.#sim.count;
	}

	/** How many brush marks the pool carries, for the page's readout. */
	get markCount(): number {
		return LICK.pool;
	}

	/** The cast time the last painted frame stands at. */
	get elapsedMs(): number {
		return this.#steps * STEP_S * 1000;
	}

	/** Drops the cast so the next frame starts from a cold seal. */
	reset() {
		this.#steps = 0;
		this.#swarm.reset();
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
		}
		const silent = Math.max(this.#steps, wanted - TRAIL_MEMORY);
		while (this.#steps < silent) {
			this.#steps += 1;
			this.#stepBoth();
		}
		while (this.#steps < wanted) {
			this.#steps += 1;
			this.#stepBoth();
			this.#paint();
		}
	}

	/** One live frame: advance the fixed clock by one step and paint it. */
	advance() {
		this.#steps += 1;
		this.#stepBoth();
		this.#paint();
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
		this.#laid.dispose();
		this.#added.dispose();
		this.#atlas.dispose();
		this.#post.dispose();
		this.#renderer.dispose();
	}

	#stepBoth() {
		const tMs = this.#steps * STEP_S * 1000;
		this.#sim.step(tMs);
		this.#swarm.step(tMs);
	}

	#paint() {
		const tMs = this.#steps * STEP_S * 1000;
		const sources = this.#sim.textures;
		this.#draw.setSources(sources.position, sources.velocity);
		aimPortalCamera(this.#camera, { canvas: this.#renderer.domElement, ring: this.#ringInfo() });
		// The seal root's matrix is the axis swap, and the swap is its own inverse,
		// so a world basis vector becomes a seal one by reading it back swapped.
		const m = this.#camera.matrixWorld.elements;
		this.#right.set(m[0], m[2], m[1]);
		this.#up.set(m[4], m[6], m[5]);

		const quads = this.#swarm.collect(tMs);
		this.#laid.write(quads.laid, this.#right, this.#up);
		this.#added.write(quads.added, this.#right, this.#up);
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
