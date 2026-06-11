import type { Point, PointerType, Stroke } from '$lib/types.js';
import { canvasPointFromEvent, shouldKeepPoint } from '$lib/input/pointerNormalizer.js';
import { makeStrokeEntity, renderStrokeInk } from '../entities/strokeEntity.js';

import type { Attachment } from 'svelte/attachments';
import { CONFIG } from '$lib/config.js';
import type { CanvasBehavior } from '../canvasBehavior.js';
import type { Scene } from '../scene.svelte.js';
import { SvelteMap } from 'svelte/reactivity';
import { addEntity } from '../commands.js';
import { pathLength } from '$lib/utils/geometry.js';

export interface DrawTool extends CanvasBehavior {
	getCurrentStroke(): Stroke | null;
	/** Reset pan/zoom transform back to identity (call after clear/submit). */
	resetPanZoom(): void;
}

/** The in-progress stroke is drawn fainter than committed ink. */
const PREVIEW_ALPHA = 0.72;

const MIN_PAN_ZOOM_SCALE = 0.5;
const MAX_PAN_ZOOM_SCALE = 8;

/**
 * Captures freehand pointer input and commits each finished stroke to the scene as a
 * `StrokeEntity` via an `addEntity` command, so it joins the shared undo history. The
 * in-progress stroke is drawn as a transient overlay through {@link CanvasBehavior.render}.
 *
 * On touch devices, two simultaneous fingers trigger pan/zoom via a CSS transform applied
 * to the canvas wrapper element (`canvas.parentElement`). Single-finger always draws.
 */
export function createDrawTool(scene: Scene): DrawTool {
	let current = $state<Point[]>([]);
	let committed = 0;

	// CSS pan/zoom state — applied to the canvas-surface wrapper div.
	let panX = 0;
	let panY = 0;
	let panScale = 1;

	function applyPanZoom(surface: HTMLElement): void {
		if (panX === 0 && panY === 0 && panScale === 1) {
			surface.style.transform = '';
		} else {
			surface.style.transform = `translate(${panX}px, ${panY}px) scale(${panScale})`;
		}
	}

	function getCurrentStroke(): Stroke | null {
		if (current.length === 0) {
			return null;
		}
		return { id: 'preview', points: current.map((point) => ({ ...point })) };
	}

	function resetPanZoom(): void {
		panX = 0;
		panY = 0;
		panScale = 1;
		// Apply immediately to any live canvas surface.
		const surface = liveSurface;
		if (surface) {
			surface.style.transform = '';
		}
	}

	// Held reference to the canvas-surface div, so resetPanZoom() works outside the attachment.
	let liveSurface: HTMLElement | null = null;

	const attach: Attachment<HTMLCanvasElement> = (canvas) => {
		liveSurface = canvas.parentElement;
		// transform-origin: 0 0 lets us use simple translate + scale math.
		if (liveSurface) liveSurface.style.transformOrigin = '0 0';

		let pointerId: number | null = null;
		let currentPointerType: PointerType = 'unknown';

		// All currently-active pointers (in client/viewport coordinates, for pan/zoom math).
		const activePointers = new SvelteMap<number, { x: number; y: number }>();
		let pinching = false;
		let prevPinchMidX = 0;
		let prevPinchMidY = 0;
		let prevPinchDist = 1;

		function enterPinch(): void {
			if (activePointers.size < 2) return;
			pinching = true;
			const [p1, p2] = [...activePointers.values()];
			// Store in raw CLIENT coordinates; focal point math is done per-frame in handlePointerMove.
			prevPinchMidX = (p1.x + p2.x) / 2;
			prevPinchMidY = (p1.y + p2.y) / 2;
			prevPinchDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
		}

		function handlePointerDown(event: PointerEvent): void {
			if (event.button !== undefined && event.button !== 0) {
				return;
			}
			event.preventDefault();

			activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (activePointers.size >= 2) {
				// Cancel any in-progress drawing stroke when a second finger appears.
				if (pointerId !== null) {
					try {
						canvas.releasePointerCapture(pointerId);
					} catch {
						// ignore
					}
					pointerId = null;
					current = [];
				}
				if (!pinching) {
					enterPinch();
				}
				return;
			}

			// Single finger: start drawing.
			pointerId = event.pointerId;
			currentPointerType =
				event.pointerType === 'pen' ||
				event.pointerType === 'touch' ||
				event.pointerType === 'mouse'
					? event.pointerType
					: 'unknown';
			canvas.setPointerCapture?.(event.pointerId);
			current = [canvasPointFromEvent(event, canvas)];
		}

		function handlePointerMove(event: PointerEvent): void {
			if (activePointers.has(event.pointerId)) {
				activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			}

			if (pinching) {
				if (activePointers.size < 2) return;
				const [p1, p2] = [...activePointers.values()];
				// prevPinchMid and newMid are in raw CLIENT coordinates.
				const newMidX = (p1.x + p2.x) / 2;
				const newMidY = (p1.y + p2.y) / 2;
				const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;

				const f = newDist / prevPinchDist;
				const newScale = Math.min(MAX_PAN_ZOOM_SCALE, Math.max(MIN_PAN_ZOOM_SCALE, panScale * f));
				const actualF = newScale / panScale;

				// Get canvas-surface's CURRENT visual top-left (includes existing transform).
				// With transform-origin: 0 0, bcrLeft = naturalLeft + panX, so naturalLeft = bcrLeft - panX.
				// Correct focal-point formula: new_panX = (prevMid - bcrLeft) * (1 - actualF) + panX + (newMid - prevMid)
				const bcr = canvas.parentElement?.getBoundingClientRect();
				const bcrLeft = bcr?.left ?? 0;
				const bcrTop = bcr?.top ?? 0;
				panX = (prevPinchMidX - bcrLeft) * (1 - actualF) + panX + (newMidX - prevPinchMidX);
				panY = (prevPinchMidY - bcrTop) * (1 - actualF) + panY + (newMidY - prevPinchMidY);
				panScale = newScale;

				const surface = canvas.parentElement;
				if (surface) applyPanZoom(surface);

				prevPinchMidX = newMidX;
				prevPinchMidY = newMidY;
				prevPinchDist = newDist;
				return;
			}

			if (pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			const point = canvasPointFromEvent(event, canvas);
			if (shouldKeepPoint(current, point, CONFIG.input.minPointDistance)) {
				current = [...current, point];
			}
		}

		function handlePointerUp(event: PointerEvent): void {
			activePointers.delete(event.pointerId);

			if (pinching) {
				if (activePointers.size < 2) {
					pinching = false;
				}
				return;
			}

			if (pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			canvas.releasePointerCapture?.(event.pointerId);

			const points = current;
			current = [];
			pointerId = null;

			if (points.length >= 2 && pathLength(points) >= CONFIG.input.minStrokeLength) {
				const now = performance.now();
				const stroke: Stroke = {
					id: `s${(committed += 1)}`,
					points: points.map((point) => ({ ...point })),
					startedAt: points[0]?.t ?? now,
					endedAt: points[points.length - 1]?.t ?? now,
					pointerType: currentPointerType
				};
				scene.do(addEntity(scene, makeStrokeEntity(stroke)));
			}
		}

		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerUp);

		return () => {
			liveSurface = null;
			canvas.removeEventListener('pointerdown', handlePointerDown);
			canvas.removeEventListener('pointermove', handlePointerMove);
			canvas.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointercancel', handlePointerUp);
		};
	};

	return {
		attach,
		getCurrentStroke,
		resetPanZoom,
		render(ctx) {
			const preview = getCurrentStroke();
			if (preview) {
				renderStrokeInk(ctx, preview, PREVIEW_ALPHA);
			}
		}
	};
}
