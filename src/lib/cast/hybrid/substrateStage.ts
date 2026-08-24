/**
 * @file The GPU half of the substrate: the parcel field, the mass it draws, the
 * two brush layers over it, and the one accumulation buffer they all land in.
 *
 * Painter order is the whole point. The mass is drawn first, the brush marks
 * straight over it, and the composite goes through the same feedback pass — so
 * the marks pick up the mass's own smear and sit *in* the paint rather than on
 * top of it.
 *
 * **It belongs to the stage, not to a cast.** Nothing it holds depends on a
 * score: the shaders, the two stamp atlases and the buffers are the same for
 * every spell, and a cast only re-points the ramp, the material multipliers and
 * the channel map. That is what lets {@link SubstrateStage.warm} pay the
 * compile-and-bake cost while the caster is still drawing, instead of stalling
 * the first frame of the cast by ten seconds.
 *
 * @example
 * const pigment = new SubstrateStage(renderer);
 * sealRoot.add(pigment.group);
 * pigment.attach(substrate);
 * pigment.step(1 / 120, tSec, steps);
 * pigment.paint(scene, camera, tMs);
 */

import * as THREE from 'three';
import { BrushLayer } from './brushLayer.js';
import { createBrushAtlas } from './brushAtlas.js';
import { ParcelDraw } from './parcelDraw.js';
import { ParcelField } from './parcelField.js';
import { PostFx } from './postFx.js';
import { MARK, STEP_S } from './tuning.js';
import type { Substrate } from './substrate.js';

/**
 * Quads each layer can hold. Most of the crowd is licks, and the laid layer
 * carries the washes, the soot and the outline ink between them.
 */
const LAID_CAPACITY = Math.round(MARK.pool * 0.62);
const ADDED_CAPACITY = Math.round(MARK.pool * 0.92);

export class SubstrateStage {
	readonly group = new THREE.Group();
	readonly #field: ParcelField;
	readonly #draw: ParcelDraw;
	readonly #atlas: THREE.CanvasTexture;
	readonly #laid: BrushLayer;
	readonly #added: BrushLayer;
	readonly #post: PostFx;
	readonly #right = new THREE.Vector3();
	readonly #up = new THREE.Vector3();
	#substrate: Substrate | null = null;
	#warmed = false;

	constructor(renderer: THREE.WebGLRenderer) {
		this.#field = new ParcelField(renderer);
		this.#draw = new ParcelDraw(this.#field);
		this.#atlas = createBrushAtlas();
		this.#laid = new BrushLayer(this.#atlas, LAID_CAPACITY, 0, 1);
		this.#added = new BrushLayer(this.#atlas, ADDED_CAPACITY, MARK.addShare, 2);
		this.#post = new PostFx(renderer);
		this.group.name = 'hybrid-substrate';
		this.group.add(this.#draw.mesh, this.#laid.mesh, this.#added.mesh);
	}

	/**
	 * Compiles and uploads everything once, on an empty field, so the first frame
	 * of a real cast is a frame and not a stall. Under a software rasterizer the
	 * parcel program alone takes seconds to build, and the cast clock is running
	 * by the time the score exists.
	 */
	warm(scene: THREE.Scene, camera: THREE.Camera): void {
		if (this.#warmed) {
			return;
		}
		this.#warmed = true;
		this.#field.step(STEP_S, 0, 0);
		this.paint(scene, camera, 0);
		this.#post.clear();
	}

	/** Points the pigment at one cast: its channels, its ramp, its material. */
	attach(substrate: Substrate): void {
		this.#substrate = substrate;
		this.#field.setSubstrate(substrate);
		this.#draw.setPalette(substrate.palette, substrate.ink);
		this.#post.clear();
	}

	/** One fixed step of the parcel field, on whatever shapes the cells just wrote. */
	step(dtS: number, tSec: number, steps: number): void {
		this.#field.step(dtS, tSec, steps);
	}

	/**
	 * One screen step: point the mass at the field's newest textures, lay the
	 * brush marks over it in painter order, and put the whole composite through
	 * the accumulation.
	 */
	paint(scene: THREE.Scene, camera: THREE.Camera, tMs: number): void {
		const sources = this.#field.textures;
		this.#draw.setSources(sources.position, sources.velocity);
		// The seal root's matrix is the axis swap, and the swap is its own inverse,
		// so a world basis vector becomes a seal one by reading it back swapped.
		const m = camera.matrixWorld.elements;
		this.#right.set(m[0], m[2], m[1]);
		this.#up.set(m[4], m[6], m[5]);

		const quads = this.#substrate?.collect(tMs);
		this.#laid.write(quads?.laid ?? [], this.#right, this.#up);
		this.#added.write(quads?.added ?? [], this.#right, this.#up);
		this.#post.render(scene, camera);
	}

	/** The composite as it already stands, for a frame that advanced no step. */
	present(): void {
		this.#post.present();
	}

	/** Matches the accumulation to a canvas of this backing-store size. */
	resize(width: number, height: number): void {
		this.#post.resize(width, height);
	}

	/** Drops the cast in flight: no channels, no parcels, no accumulation. */
	detach(): void {
		this.#substrate = null;
		this.#field.setSubstrate(null);
		this.#post.clear();
	}

	dispose(): void {
		this.#field.dispose();
		this.#draw.dispose();
		this.#laid.dispose();
		this.#added.dispose();
		this.#atlas.dispose();
		this.#post.dispose();
	}
}
