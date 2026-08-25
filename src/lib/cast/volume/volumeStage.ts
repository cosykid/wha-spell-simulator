/**
 * @file The GPU half of the volume substrate: the marching-cubes skin, the
 * ink-skin material, the ground wash and the ambient washes, assembled under
 * one group the stage parents into seal space.
 *
 * The skin is stateless per paint — the field is rebuilt from the live tracers
 * every repolygonize — so pixels are a pure function of the CPU tracer state
 * and the camera, which is what lets fresh-to-t and incremental stepping agree
 * without an accumulation contract.
 *
 * It belongs to the stage, not to a cast: the geometry buffers and the blot
 * atlas are the same for every spell. A cast attaches its element row, which
 * builds that element's material once and compiles it during the charge —
 * the 980ms of ambient-only content is exactly the budget a compile fits in.
 *
 * @example
 * const volume = new VolumeStage(renderer);
 * sealRoot.add(volume.group);
 * volume.attach(substrate, scene, camera);
 * volume.paint(scene, camera, tMs);
 */

import * as THREE from 'three';
import { AmbientWashes } from './ambient.js';
import { GroundWash } from './groundWash.js';
import { inkSkinMaterial, type InkSkinHandles } from './inkSkin.js';
import { VolumeSkin } from './skin.js';
import { WASH_GAUGE } from './tuning.js';
import type { VolumeElement } from './elements.js';
import type { VolumeSubstrate } from './substrate.js';

export class VolumeStage {
	readonly group = new THREE.Group();
	readonly #renderer: THREE.WebGLRenderer;
	readonly #skin: VolumeSkin;
	readonly #wash: GroundWash;
	readonly #ambient: AmbientWashes;
	readonly #placeholder: THREE.MeshBasicMaterial;
	readonly #right = new THREE.Vector3();
	readonly #up = new THREE.Vector3();
	readonly #heatBand = { lo: 0, hi: 1.5 };
	#ink: InkSkinHandles | null = null;
	#inkElement: VolumeElement | null = null;
	#substrate: VolumeSubstrate | null = null;
	#warmed = false;

	constructor(renderer: THREE.WebGLRenderer) {
		this.#renderer = renderer;
		// The pigment is authored in display space: no tone map, no conversion.
		this.#renderer.toneMapping = THREE.NoToneMapping;
		this.#renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
		this.#placeholder = new THREE.MeshBasicMaterial({ visible: false });
		this.#skin = new VolumeSkin(this.#placeholder);
		this.#wash = new GroundWash();
		this.#ambient = new AmbientWashes();
		this.group.name = 'volume-substrate';
		this.group.add(this.#skin.mesh, this.#wash.mesh, this.#ambient.mesh);
	}

	/**
	 * Allocates and compiles what can be paid for before a seal is closed: the
	 * polygonizer's buffers and the wash programs. The ink skin itself is per
	 * element, so its compile lands on `attach`, inside the charge beat.
	 */
	warm(scene: THREE.Scene, camera: THREE.Camera): void {
		if (this.#warmed) {
			return;
		}
		this.#warmed = true;
		this.#renderer.compile(scene, camera);
	}

	/** Points the volume at one cast: its element row and its channels. */
	attach(substrate: VolumeSubstrate, scene: THREE.Scene, camera: THREE.Camera): void {
		this.#substrate = substrate;
		const element = substrate.element;
		if (this.#inkElement !== element) {
			this.#ink?.material.dispose();
			this.#ink = inkSkinMaterial(element);
			this.#inkElement = element;
			this.#skin.mesh.material = this.#ink.material;
		}
		this.#skin.attach(substrate.skin);
		this.#wash.attach(element);
		this.#ambient.attach(element);
		// Compile the element's program now, during the charge, rather than on
		// the first frame the body shows triangles.
		this.#renderer.compile(scene, camera);
	}

	/**
	 * One repolygonize and redraw at `tMs`. The camera must already be aimed:
	 * the ambient washes billboard against it.
	 */
	paint(scene: THREE.Scene, camera: THREE.Camera, tMs: number): void {
		const substrate = this.#substrate;
		if (!substrate) {
			return;
		}
		if (this.#ink) {
			this.#ink.uTime.value = tMs / 1000;
			substrate.heatBand(this.#heatBand);
			this.#ink.uHeatLo.value = this.#heatBand.lo;
			this.#ink.uHeatHi.value = this.#heatBand.hi;
		}
		this.#skin.update(substrate);
		this.#wash.update(Math.min(1, substrate.groundMass() / WASH_GAUGE.fullAt), substrate.drain());
		// The seal root's matrix is the axis swap, and the swap is its own
		// inverse, so a world basis vector becomes a seal one by reading it back
		// swapped.
		const m = camera.matrixWorld.elements;
		this.#right.set(m[0], m[2], m[1]);
		this.#up.set(m[4], m[6], m[5]);
		const medium = substrate.channels.find((channel) => channel.kind === 'shimmer');
		if (medium) {
			this.#ambient.update(medium, this.#right, this.#up);
		} else {
			this.#ambient.mesh.count = 0;
		}
		this.#renderer.render(scene, camera);
	}

	/** Redraw what already stands, for a frame that advanced no paintable step. */
	present(scene: THREE.Scene, camera: THREE.Camera): void {
		if (!this.#substrate) {
			return;
		}
		this.#renderer.render(scene, camera);
	}

	/** Drops the cast in flight: no channels, no triangles, no washes. */
	detach(): void {
		this.#substrate = null;
		this.#skin.detach();
		this.#ambient.mesh.count = 0;
		this.#wash.update(0, 1);
	}

	dispose(): void {
		this.#skin.dispose();
		this.#wash.dispose();
		this.#ambient.dispose();
		this.#ink?.material.dispose();
		this.#placeholder.dispose();
	}
}
