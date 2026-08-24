/**
 * @file The prototype's stage: one WebGL surface, the portal's own camera and
 * seal root (imported read-only from cast/stage), a fixed 60Hz clock, and one
 * of three performances behind it — A the toon volume, B the rounded pigment
 * substrate, C the inked volume. `seekTo` simulates silently and paints the
 * final state, so a scripted still is bit-equal to a played one.
 */

import * as THREE from 'three';
import { aimPortalCamera, createPortalCamera } from '$lib/cast/stage/portalCamera.js';
import { createSealRoot } from '$lib/cast/stage/sealRoot.js';
import type { RingInfo } from '$lib/types.js';
import { BDraw } from './bDraw.js';
import { BPost } from './bPost.js';
import { BSim } from './bSim.js';
import { GroundWash, inkSkinMaterial } from './inkSkin.js';
import { VolumeSkin } from './skin.js';
import { stageLights, toonSkinMaterial } from './toonSkin.js';
import { STEP_S, Tracers } from './tracers.js';
import { drainAt, emissionAt } from './arc.js';
import { protoSpell, type ProtoSpell } from './spell.js';
import type { ProtoElement, ProtoStyle } from './elements.js';

/** Where the seal sits on the untilted paper, as fractions of the canvas box. */
export const RING = { centerX: 0.5, centerY: 0.7, radius: 0.34 } as const;

/** Steps of accumulation style B can still be showing. A seek paints this many. */
const TRAIL_MEMORY = 36;

const SEEDS: Record<ProtoElement, number> = { fire: 0x51a7, water: 0x33d1, wind: 0x9b3f };

export class VolumeStage {
	readonly spell: ProtoSpell;
	readonly #style: ProtoStyle;
	readonly #element: ProtoElement;
	readonly #renderer: THREE.WebGLRenderer;
	readonly #scene = new THREE.Scene();
	readonly #camera = createPortalCamera();
	readonly #sealRoot = createSealRoot();
	readonly #uTime = { value: 0 };
	#steps = 0;

	// Styles A and C: the tracer cloud and its marching-cubes skin.
	#tracers: Tracers | null = null;
	#skin: VolumeSkin | null = null;
	#skinMaterial: THREE.Material | null = null;
	#wash: GroundWash | null = null;

	// Style B: the GPU substrate.
	#bSim: BSim | null = null;
	#bDraw: BDraw | null = null;
	#bPost: BPost | null = null;

	constructor(canvas: HTMLCanvasElement, style: ProtoStyle, element: ProtoElement) {
		this.#style = style;
		this.#element = element;
		this.spell = protoSpell(element);
		this.#renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: style !== 'b',
			premultipliedAlpha: true,
			// Throwaway: every capture is a screenshot of a frame that already landed.
			preserveDrawingBuffer: true
		});
		this.#renderer.setClearColor(0x000000, 0);
		this.#renderer.toneMapping = THREE.NoToneMapping;
		this.#scene.add(this.#sealRoot);

		if (style === 'b') {
			// Raw authored pigment, as proto-hybrid: no output conversion.
			this.#renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
			this.#bSim = new BSim(this.#renderer, this.spell, element);
			const sources = this.#bSim.textures;
			this.#bDraw = new BDraw(element, this.spell.reach, sources.position, sources.velocity);
			this.#bPost = new BPost(this.#renderer, element);
			this.#sealRoot.add(this.#bDraw.mesh);
			return;
		}

		this.#tracers = new Tracers(this.spell, element, SEEDS[element]);
		if (style === 'a') {
			this.#skinMaterial = toonSkinMaterial(element, this.#uTime);
			this.#scene.add(stageLights());
		} else {
			this.#renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
			this.#skinMaterial = inkSkinMaterial(element, this.spell.reach, this.#uTime);
			this.#wash = new GroundWash(element);
			this.#sealRoot.add(this.#wash.mesh);
		}
		this.#skin = new VolumeSkin(element, this.#skinMaterial);
		this.#sealRoot.add(this.#skin.mesh);
	}

	/** Population size, for the page's readout. */
	get population(): number {
		return this.#bSim ? this.#bSim.count : (this.#tracers?.aliveCount ?? 0);
	}

	/** The cast time the last painted frame stands at. */
	get elapsedMs(): number {
		return this.#steps * STEP_S * 1000;
	}

	/** Drops the cast so the next frame starts from a cold seal. */
	reset(): void {
		this.#steps = 0;
		this.#tracers?.reset();
		this.#bSim?.seed();
		this.#bPost?.clear();
	}

	/**
	 * Advances the cast to `tMs` and paints it. Styles A/C carry no screen
	 * state, so only the final frame is painted; style B's accumulation paints
	 * the last TRAIL_MEMORY steps.
	 */
	seekTo(tMs: number): void {
		const wanted = Math.max(0, Math.round(tMs / (STEP_S * 1000)));
		if (wanted < this.#steps) {
			this.reset();
		}
		const silent = this.#style === 'b' ? Math.max(this.#steps, wanted - TRAIL_MEMORY) : wanted;
		while (this.#steps < silent) {
			this.#steps += 1;
			this.#step();
		}
		while (this.#steps < wanted) {
			this.#steps += 1;
			this.#step();
			this.#paint();
		}
		if (this.#style !== 'b') {
			this.#paint();
		}
	}

	/** One live frame: advance the fixed clock by one step and paint it. */
	advance(): void {
		this.#steps += 1;
		this.#step();
		this.#paint();
	}

	/**
	 * Advances the live clock to `tMs`, at most `maxSteps` steps. Style B
	 * paints every step (its accumulation is the picture); A and C simulate
	 * silently and paint once, because their picture is only the final state
	 * and a marching-cubes repolygonize per caught-up step is the catch-up
	 * spiral that made the cast lag its own wall clock.
	 */
	advanceTo(tMs: number, maxSteps = 5): void {
		const wanted = Math.min(Math.max(0, Math.round(tMs / (STEP_S * 1000))), this.#steps + maxSteps);
		if (wanted <= this.#steps) {
			return;
		}
		while (this.#steps < wanted) {
			this.#steps += 1;
			this.#step();
			if (this.#style === 'b') {
				this.#paint();
			}
		}
		if (this.#style !== 'b') {
			this.#paint();
		}
	}

	/** Matches the drawing buffer and the buffers behind it to the canvas box. */
	resize(width: number, height: number, pixelRatio: number): void {
		this.#renderer.setPixelRatio(pixelRatio);
		this.#renderer.setSize(width, height, false);
		const canvas = this.#renderer.domElement;
		this.#bPost?.resize(canvas.width, canvas.height);
	}

	dispose(): void {
		this.#tracers = null;
		this.#skin?.dispose();
		this.#skinMaterial?.dispose();
		this.#wash?.dispose();
		this.#bSim?.dispose();
		this.#bDraw?.dispose();
		this.#bPost?.dispose();
		this.#renderer.dispose();
	}

	#step(): void {
		const tMs = this.#steps * STEP_S * 1000;
		this.#tracers?.step(tMs);
		this.#bSim?.step(tMs);
	}

	#paint(): void {
		const tMs = this.#steps * STEP_S * 1000;
		this.#uTime.value = tMs / 1000;
		aimPortalCamera(this.#camera, { canvas: this.#renderer.domElement, ring: this.#ringInfo() });

		if (this.#style === 'b') {
			const sources = this.#bSim!.textures;
			this.#bDraw!.setSources(sources.position, sources.velocity);
			this.#bPost!.render(this.#scene, this.#camera, tMs / 1000);
			return;
		}

		this.#skin!.update(this.#tracers!);
		if (this.#wash) {
			this.#wash.update(this.#washGauge(tMs), drainAt(this.spell, tMs));
		}
		this.#renderer.render(this.#scene, this.#camera);
	}

	/** How much cast is on the ground: water reads its pool, others the arc. */
	#washGauge(tMs: number): number {
		if (this.#element === 'water') {
			const tracers = this.#tracers!;
			return Math.min(1, (tracers.pooledFraction * tracers.aliveCount) / 420);
		}
		const scale = this.#element === 'wind' ? 0.6 : 1;
		return emissionAt(this.spell, tMs) * scale;
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
