/**
 * @file The stage's drawing surface: the `WebGLRenderer`, the canvas it is
 * allowed to use, size bookkeeping, and context loss.
 *
 * It exists so `stage.ts` reads as a cast being performed rather than as WebGL
 * housekeeping. Nothing here knows what a score is.
 *
 * @example
 * const surface = createStageSurface(effectCanvas, { onContextRestored: () => stage.reset() });
 */

import * as THREE from 'three';

/** The context the effect layer needs: transparent, because it overlays the drawn paper. */
const CONTEXT_ATTRIBUTES = {
	alpha: true,
	antialias: true,
	powerPreference: 'high-performance'
} as const;

export interface StageSurfaceOptions {
	/**
	 * Keep the last frame readable after it is composited. The scripted-clock path
	 * renders once and stops, and a screenshot of a swapped buffer is blank.
	 */
	preserveDrawingBuffer?: boolean;
	/** Called once the browser hands the context back, so the caller can rebuild. */
	onContextRestored?: () => void;
}

export interface StageSurface {
	/** The canvas actually rendered to. Not always the one that was asked for. */
	readonly canvas: HTMLCanvasElement;
	/**
	 * The renderer itself, for the one caller that needs more than `render`: the
	 * substrate drives its own accumulation and bloom chain through it.
	 */
	readonly renderer: THREE.WebGLRenderer;
	/** True between `webglcontextlost` and `webglcontextrestored`. */
	readonly lost: boolean;
	/** Match the drawing buffer to the canvas the owner sized. */
	syncSize(): void;
	render(scene: THREE.Scene, camera: THREE.Camera): void;
	/** Wipe the frame without drawing one, for the beats that paint nothing. */
	clear(): void;
	dispose(): void;
}

/**
 * A canvas that has ever handed out a `2d` context can never return a `webgl2`
 * one, so a stage given the old painter's canvas takes an overlay of its own
 * instead. The replacement copies the original's box and stacking, so the effect
 * still lands exactly where the canvas it stands in for did.
 */
function overlayCanvasFor(original: HTMLCanvasElement): HTMLCanvasElement {
	const overlay = original.ownerDocument.createElement('canvas');
	overlay.width = original.width;
	overlay.height = original.height;
	overlay.className = original.className;
	overlay.dataset.stageOverlayFor = original.id;
	const zIndex = original.ownerDocument.defaultView?.getComputedStyle(original).zIndex ?? 'auto';
	overlay.style.cssText = `position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;z-index:${zIndex}`;
	original.parentElement?.insertBefore(overlay, original.nextSibling);
	return overlay;
}

/** A renderer on this canvas, or null when the canvas cannot host a WebGL context. */
function rendererOn(
	canvas: HTMLCanvasElement,
	options: StageSurfaceOptions
): THREE.WebGLRenderer | null {
	try {
		return new THREE.WebGLRenderer({
			canvas,
			...CONTEXT_ATTRIBUTES,
			preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
		});
	} catch {
		return null;
	}
}

export function createStageSurface(
	requested: HTMLCanvasElement,
	options: StageSurfaceOptions = {}
): StageSurface {
	// The attributes are fixed by whichever `getContext` call wins, so the renderer
	// has to be the one asking. Probing first would silently drop `alpha`.
	let canvas = requested;
	let renderer = rendererOn(canvas, options);
	let overlay: HTMLCanvasElement | null = null;
	if (!renderer) {
		overlay = overlayCanvasFor(requested);
		canvas = overlay;
		renderer = new THREE.WebGLRenderer({
			canvas,
			...CONTEXT_ATTRIBUTES,
			preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
		});
	}

	// The portal projection is written in the canvas's own backing-store pixels,
	// so the drawing buffer mirrors them exactly and the owner keeps the say over
	// device pixel ratio by sizing the canvas it passed in.
	renderer.setPixelRatio(1);
	renderer.setClearAlpha(0);
	renderer.setSize(canvas.width, canvas.height, false);

	let lost = false;
	const onLost = (event: Event) => {
		// Without this the browser never attempts a restore.
		event.preventDefault();
		lost = true;
	};
	const onRestored = () => {
		lost = false;
		renderer.setSize(canvas.width, canvas.height, false);
		options.onContextRestored?.();
	};
	canvas.addEventListener('webglcontextlost', onLost);
	canvas.addEventListener('webglcontextrestored', onRestored);

	const size = new THREE.Vector2();

	return {
		canvas,
		renderer,
		get lost() {
			return lost;
		},
		syncSize() {
			if (overlay && (overlay.width !== requested.width || overlay.height !== requested.height)) {
				overlay.width = requested.width;
				overlay.height = requested.height;
			}
			renderer.getSize(size);
			if (size.x !== canvas.width || size.y !== canvas.height) {
				renderer.setSize(canvas.width, canvas.height, false);
			}
		},
		render(scene, camera) {
			if (lost) {
				return;
			}
			renderer.render(scene, camera);
		},
		clear() {
			if (lost) {
				return;
			}
			renderer.clear();
		},
		dispose() {
			canvas.removeEventListener('webglcontextlost', onLost);
			canvas.removeEventListener('webglcontextrestored', onRestored);
			renderer.dispose();
			overlay?.remove();
		}
	};
}
