/**
 * Pure helpers for the Stroke Template Viewer tool: parsing and validating a
 * pasted strokeTemplate, fitting it into a canvas, and summarizing metrics.
 * No DOM/canvas access lives here so the logic stays testable.
 */
import type { StrokeTemplate, Point } from "../types.js";

/** A draw rectangle used to fit a template into a canvas. */
interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Accepts either a bare strokeTemplate object or a full dictionary entry. */
export function parseTemplate(value: string): unknown {
  const parsed = JSON.parse(value);
  return (parsed as { strokeTemplate?: unknown }).strokeTemplate ?? parsed;
}

/** Validates and normalizes a strokeTemplate, throwing on malformed input. */
export function validateTemplate(template: unknown): StrokeTemplate {
  if (!template || typeof template !== "object" || !Array.isArray((template as Record<string, unknown>).strokes)) {
    throw new Error("JSON must be a strokeTemplate object or an entry with strokeTemplate.");
  }

  const raw = template as Record<string, unknown>;
  const strokes = (raw.strokes as unknown[]).map((stroke) => {
    if (!Array.isArray(stroke)) {
      throw new Error("Each stroke must be an array of points.");
    }
    return (stroke as Record<string, unknown>[])
      .map((point) => ({
        x: Number(point.x),
        y: Number(point.y)
      }))
      .filter((point): point is Point => Number.isFinite(point.x) && Number.isFinite(point.y));
  });

  if (!strokes.some((stroke) => stroke.length > 1)) {
    throw new Error("Template must contain at least one stroke with two valid points.");
  }

  return {
    sourceAspectRatio: Number(raw.sourceAspectRatio) || 1,
    strokes
  };
}

/** Computes the centered, aspect-preserving draw rectangle for a template. */
export function drawingBounds(template: StrokeTemplate, width: number, height: number): DrawRect {
  const padding = width * 0.1;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const aspect = Math.max(0.1, template.sourceAspectRatio);
  let drawWidth = availableWidth;
  let drawHeight = drawWidth / aspect;

  if (drawHeight > availableHeight) {
    drawHeight = availableHeight;
    drawWidth = drawHeight * aspect;
  }

  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  };
}

/** Maps a normalized 0..1 template point into canvas coordinates. */
export function templatePointToCanvas(point: Point, bounds: DrawRect): Point {
  return {
    x: bounds.x + point.x * bounds.width,
    y: bounds.y + point.y * bounds.height
  };
}

/** Summarizes the structural metrics shown alongside the preview. */
export function templateMetrics(template: StrokeTemplate): {
  sourceAspectRatio: number;
  strokeCount: number;
  pointCount: number;
} {
  const strokeCount = template.strokes.length;
  const pointCount = template.strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  return {
    sourceAspectRatio: Math.round(template.sourceAspectRatio * 1000) / 1000,
    strokeCount,
    pointCount
  };
}
