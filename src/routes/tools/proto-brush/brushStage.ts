/**
 * @file The WebGL half: a scene, the portal's own camera, and the two brush
 * layers the column is painted into.
 *
 * The camera and the seal root are imported from the shipped stage rather than
 * re-derived, because the whole point of judging a style in context is that the
 * pigment sits on the same tilted paper the app draws. Everything else here is
 * throwaway glue for the bake-off.
 */

import * as THREE from 'three';
import { aimPortalCamera, createPortalCamera } from '$lib/cast/stage/portalCamera.js';
import { createSealRoot } from '$lib/cast/stage/sealRoot.js';
import { BrushLayer } from './brushMesh.js';
import { BrushColumn } from './brushStrokes.js';
import { createBrushAtlas } from './brushTextures.js';
import { brushSpell, type BrushSpell } from './brushSpell.js';
import type { RingInfo } from '$lib/types.js';

/** Quads each layer can hold. The mass takes the bulk; the hot core is a subset. */
const MASS_CAPACITY = 400;
const HOT_CAPACITY = 200;

/** The prototype's renderer: build once, `render(ring, tMs)` per frame. */
export class BrushStage {
	readonly spell: BrushSpell;
	readonly #renderer: THREE.WebGLRenderer;
	readonly #scene = new THREE.Scene();
	readonly #camera = createPortalCamera();
	readonly #sealRoot = createSealRoot();
	readonly #atlas: THREE.CanvasTexture;
	readonly #mass: BrushLayer;
	readonly #hot: BrushLayer;
	readonly #column: BrushColumn;
	readonly #right = new THREE.Vector3();
	readonly #up = new THREE.Vector3();
	readonly #size = new THREE.Vector2();

	constructor(canvas: HTMLCanvasElement, options: { preserveDrawingBuffer?: boolean } = {}) {
		this.#renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
		});
		this.#renderer.setPixelRatio(1);
		this.#renderer.setClearAlpha(0);
		this.#renderer.setSize(canvas.width, canvas.height, false);

		this.#atlas = createBrushAtlas();
		this.#mass = new BrushLayer(this.#atlas, MASS_CAPACITY, THREE.NormalBlending, 1);
		this.#hot = new BrushLayer(this.#atlas, HOT_CAPACITY, THREE.AdditiveBlending, 2);
		this.#sealRoot.add(this.#mass.mesh, this.#hot.mesh);
		this.#scene.add(this.#sealRoot);

		this.spell = brushSpell();
		this.#column = new BrushColumn(this.spell);
	}

	/** Drop the cast in flight so the next frame replays it from the charge. */
	reset(): void {
		this.#column.reset();
	}

	/** Advances to `tMs` on the cast clock and paints one frame. */
	render(ring: RingInfo, tMs: number): void {
		const canvas = this.#renderer.domElement;
		const size = this.#renderer.getSize(this.#size);
		if (size.x !== canvas.width || size.y !== canvas.height) {
			this.#renderer.setSize(canvas.width, canvas.height, false);
		}

		if (tMs < 0 || tMs > this.spell.totalMs) {
			this.#renderer.clear();
			return;
		}

		this.#column.stepTo(tMs);
		aimPortalCamera(this.#camera, { canvas, ring });
		// The seal root's matrix is the axis swap, and the swap is its own inverse,
		// so a world basis vector becomes a seal one by reading it back swapped.
		const m = this.#camera.matrixWorld.elements;
		this.#right.set(m[0], m[2], m[1]);
		this.#up.set(m[4], m[6], m[5]);

		const quads = this.#column.collect(tMs);
		this.#mass.write(quads.mass, this.#right, this.#up);
		this.#hot.write(quads.hot, this.#right, this.#up);
		this.#renderer.render(this.#scene, this.#camera);
	}

	dispose(): void {
		this.#mass.dispose();
		this.#hot.dispose();
		this.#atlas.dispose();
		this.#renderer.dispose();
	}
}
