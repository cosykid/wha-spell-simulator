import { canvasPointFromEvent, shouldKeepPoint } from "./pointerNormalizer.js";
import { pathLength } from "../utils/geometry.js";
import type { Point, Stroke, StrokeStore, AppConfig, DrawingCaptureCallbacks } from "../types.js";

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
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.enabled = true;
  }

  disable(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.enabled = false;
  }

  getCurrentStroke(): Stroke | null {
    if (this.currentPoints.length === 0) {
      return null;
    }
    return {
      id: "preview",
      points: this.currentPoints.map((point) => ({ ...point }))
    };
  }

  clearPreview(): void {
    this.currentPoints = [];
    this.pointerId = null;
  }

  private _handlePointerDown(event: PointerEvent): void {
    if (this.locked) {
      event.preventDefault();
      return;
    }
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.currentPoints = [canvasPointFromEvent(event, this.canvas)];
    this.callbacks.onPreview?.(this.getCurrentStroke());
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
      this.callbacks.onPreview?.(this.getCurrentStroke());
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
}
