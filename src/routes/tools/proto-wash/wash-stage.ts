/**
 * @file The stage: a renderer on one canvas, the portal's own camera, the proxy
 * column under the seal root, and the post chain over both.
 *
 * The camera and the seal root are imported from `cast/stage/` read-only, so the
 * prototype sits on the same tilted paper the app does and a frame is judgeable
 * in context. Everything else is local to this route.
 */

import * as THREE from 'three';
import { aimPortalCamera, createPortalCamera } from '$lib/cast/stage/portalCamera.js';
import { createSealRoot } from '$lib/cast/stage/sealRoot.js';
import type { RingInfo } from '$lib/types.js';
import { WashColumn } from './wash-column.js';
import { WashPost, WASH_POST_DEFAULTS, type WashPostSettings } from './wash-post.js';
import { buildWashCast, sampleWashCue, type WashCast, type WashCue } from './wash-spell.js';

/** Fixed step for the scripted clock, so a captured frame is the same every run. */
const SCRIPT_STEP_MS = 1000 / 120;

/**
 * The test ring the whole page is laid out around: the Spell Effect Lab's own
 * default, so the portal numbers land where the app puts them.
 */
export function washRing(width: number, height: number): RingInfo {
	return {
		found: true,
		complete: true,
		center: { x: width / 2, y: height * 0.56 },
		radius: Math.min(width, height) * 0.34,
		strokeIds: ['wash-ring']
	};
}

export class WashStage {
	readonly cast: WashCast;
	readonly #renderer: THREE.WebGLRenderer;
	readonly #scene: THREE.Scene;
	readonly #camera: THREE.PerspectiveCamera;
	readonly #column: WashColumn;
	readonly #post: WashPost;
	readonly #canvas: HTMLCanvasElement;
	#flow = 0;
	#smokeFlow = 0;
	#lastMs: number | null = null;
	#settings: WashPostSettings = { ...WASH_POST_DEFAULTS };

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
		this.cast = buildWashCast();
		this.#renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: false,
			// A prototype is screenshotted between frames, so the buffer has to survive.
			preserveDrawingBuffer: true,
			powerPreference: 'high-performance'
		});
		this.#renderer.setPixelRatio(1);
		this.#renderer.setClearColor(0x000000, 0);
		this.#renderer.setSize(canvas.width, canvas.height, false);

		this.#scene = new THREE.Scene();
		const sealRoot = createSealRoot();
		this.#scene.add(sealRoot);
		this.#column = new WashColumn(this.cast);
		sealRoot.add(this.#column.mesh);

		this.#camera = createPortalCamera();
		this.#post = new WashPost(this.#renderer, this.#scene, this.#camera);
		this.#post.setSize(canvas.width, canvas.height);
	}

	setPost(settings: WashPostSettings): void {
		this.#settings = settings;
	}

	/** Advance the flow to `tMs` on wall time and paint one frame. */
	render(tMs: number): WashCue {
		const previous = this.#lastMs ?? tMs;
		const stepMs = tMs < previous ? 0 : Math.min(tMs - previous, 60);
		this.#lastMs = tMs;
		const cue = sampleWashCue(tMs);
		if (tMs < previous) {
			this.#flow = 0;
			this.#smokeFlow = 0;
		}
		this.#flow += (stepMs / 1000) * flowRate(cue);
		this.#smokeFlow += (stepMs / 1000) * smokeRate(cue);
		this.#paint(cue);
		return cue;
	}

	/**
	 * Step the flow from zero to `tMs` on a fixed clock, then paint once. The
	 * capture path uses it so a screenshot lands on the same frame every run.
	 */
	renderScripted(tMs: number): WashCue {
		this.#flow = 0;
		this.#smokeFlow = 0;
		const steps = Math.max(1, Math.round(tMs / SCRIPT_STEP_MS));
		for (let step = 1; step <= steps; step += 1) {
			const stepCue = sampleWashCue(step * SCRIPT_STEP_MS);
			this.#flow += (SCRIPT_STEP_MS / 1000) * flowRate(stepCue);
			this.#smokeFlow += (SCRIPT_STEP_MS / 1000) * smokeRate(stepCue);
		}
		this.#lastMs = tMs;
		const cue = sampleWashCue(tMs);
		this.#paint(cue);
		return cue;
	}

	/** Restart the cast from the strike. */
	reset(): void {
		this.#flow = 0;
		this.#smokeFlow = 0;
		this.#lastMs = null;
	}

	dispose(): void {
		this.#column.dispose();
		this.#post.dispose();
		this.#renderer.dispose();
	}

	#paint(cue: WashCue): void {
		this.#syncSize();
		aimPortalCamera(this.#camera, {
			canvas: this.#canvas,
			ring: washRing(this.#canvas.width, this.#canvas.height)
		});
		this.#column.update(cue, this.#flow, this.#smokeFlow);
		this.#post.apply(this.#settings);
		this.#post.render();
	}

	#syncSize(): void {
		const size = new THREE.Vector2();
		this.#renderer.getSize(size);
		if (size.x !== this.#canvas.width || size.y !== this.#canvas.height) {
			this.#renderer.setSize(this.#canvas.width, this.#canvas.height, false);
			this.#post.setSize(this.#canvas.width, this.#canvas.height);
		}
	}
}

/** Cycles per second a packet climbs the column at. Fast on the punch. */
function flowRate(cue: WashCue): number {
	return 0.55 + 1.25 * cue.drive + 1.7 * cue.strike + 0.25 * cue.medium;
}

/** Smoke drifts at its own, slower pace, and keeps drifting once the flame is out. */
function smokeRate(cue: WashCue): number {
	return 0.16 + 0.26 * cue.drive + 0.2 * cue.strike;
}
