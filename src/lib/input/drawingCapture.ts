import { canvasPointFromEvent, shouldKeepPoint } from './pointerNormalizer.js';
import { pathLength } from '../utils/geometry.js';
import type { Point, Stroke, StrokeStore, AppConfig, DrawingCaptureCallbacks } from '../types.js';

export class DrawingCapture {
	canvas: HTMLCanvasElement;
	strokeStore: StrokeStore;
	config: AppConfig;
	callbacks: DrawingCaptureCallbacks;
	currentPoints: Point[];
	pointerId: number | null;
	enabled: boolean;
	locked: boolean;

	// Bound handler references so they can be removed by reference
	handlePointerDown: (event: PointerEvent) => void;
	handlePointerMove: (event: PointerEvent) => void;
	handlePointerUp: (event: PointerEvent) => void;
	handlePointerCancel: (event: PointerEvent) => void;

	constructor(
		canvas: HTMLCanvasElement,
		strokeStore: StrokeStore,
		config: AppConfig,
		callbacks: DrawingCaptureCallbacks = {}
	) {
		this.canvas = canvas;
		this.strokeStore = strokeStore;
		this.config = config;
		this.callbacks = callbacks;
		this.currentPoints = [];
		this.pointerId = null;
		this.enabled = false;
		this.locked = false;

		this.handlePointerDown = this._handlePointerDown.bind(this);
		this.handlePointerMove = this._handlePointerMove.bind(this);
		this.handlePointerUp = this._handlePointerUp.bind(this);
		this.handlePointerCancel = this._handlePointerCancel.bind(this);
	}

	setLocked(locked: boolean): void {
		this.locked = locked;
		if (locked) {
			this.clearPreview();
		}
	}

	enable(): void {
		if (this.enabled) {
			return;
		}
		this.canvas.addEventListener('pointerdown', this.handlePointerDown);
		this.canvas.addEventListener('pointermove', this.handlePointerMove);
		this.canvas.addEventListener('pointerup', this.handlePointerUp);
		this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
		this.enabled = true;
	}

	disable(): void {
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
		this.canvas.removeEventListener('pointermove', this.handlePointerMove);
		this.canvas.removeEventListener('pointerup', this.handlePointerUp);
		this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
		this.enabled = false;
	}

	getCurrentStroke(): Stroke | null {
		if (this.currentPoints.length === 0) {
			return null;
		}
		return {
			id: 'preview',
			points: this.currentPoints.map((point) => ({ ...point }))
		};
	}

	getCurrentStrokeView(): Stroke | null {
		if (this.currentPoints.length === 0) {
			return null;
		}
		return {
			id: 'preview',
			points: this.currentPoints
		};
	}

	clearPreview(): void {
		this.currentPoints = [];
		this.pointerId = null;
	}

	private _handlePointerDown(event: PointerEvent): void {
		if (this.locked) {
			event.preventDefault();
			// A primary tap on locked paper still means "draw here", so the host
			// gets to hear it and may release whatever holds the lock.
			if (event.button === undefined || event.button === 0) {
				this.callbacks.onLockedPointerDown?.();
			}
			return;
		}
		// One pointer owns the canvas until its stroke finishes. A palm landing or a
		// second finger would otherwise take the capture over, and the stroke in
		// flight would be lost because its pointerup no longer matches `pointerId`.
		if (this.pointerId !== null) {
			return;
		}
		if (event.button !== undefined && event.button !== 0) {
			return;
		}
		event.preventDefault();
		this.pointerId = event.pointerId;
		this.canvas.setPointerCapture?.(event.pointerId);
		this.currentPoints = [canvasPointFromEvent(event, this.canvas)];
		this.callbacks.onStart?.();
		if (this.callbacks.onPreview) {
			this.callbacks.onPreview(this.getCurrentStroke());
		}
	}

	private _handlePointerMove(event: PointerEvent): void {
		if (this.locked) {
			event.preventDefault();
			return;
		}
		if (this.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		const point = canvasPointFromEvent(event, this.canvas);
		if (shouldKeepPoint(this.currentPoints, point, this.config.input.minPointDistance)) {
			this.currentPoints.push(point);
			if (this.callbacks.onPreview) {
				this.callbacks.onPreview(this.getCurrentStroke());
			}
		}
	}

	private _handlePointerUp(event: PointerEvent): void {
		if (this.locked) {
			event.preventDefault();
			this.clearPreview();
			return;
		}
		if (this.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		this.canvas.releasePointerCapture?.(event.pointerId);

		const points = this.currentPoints;
		this.clearPreview();

		if (points.length >= 2 && pathLength(points) >= this.config.input.minStrokeLength) {
			this.strokeStore.addStroke(points);
			this.callbacks.onCommit?.();
			return;
		}

		this.callbacks.onPreview?.(null);
	}

	/**
	 * Throws away the stroke in flight. A pointer is cancelled when something else
	 * takes the gesture over, such as an OS edge swipe or palm rejection, so what
	 * was drawn so far is not ink the user chose to commit.
	 */
	private _handlePointerCancel(event: PointerEvent): void {
		if (this.pointerId !== event.pointerId) {
			return;
		}
		// A cancelled pointer is no longer active, so the browser has already given
		// back the capture this canvas took.
		this.clearPreview();
		this.callbacks.onPreview?.(null);
	}
}
