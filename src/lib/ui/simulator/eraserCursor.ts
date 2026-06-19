/**
 * CSS cursor helpers for the simulator eraser tool.
 *
 * The eraser radius is defined in backing-store canvas pixels, but CSS cursors
 * render in screen pixels. This module keeps that conversion in one place so the
 * visible brush ring matches the actual erase footprint at any canvas size.
 *
 * @packageDocumentation
 */
/**
 * Builds a data-URL cursor showing the current eraser brush footprint.
 *
 * @param glyphCanvas - The canvas whose CSS size determines the cursor scale.
 * @param eraserRadius - Brush radius in backing-store canvas pixels.
 * @returns CSS `cursor` value with a centered SVG ring and crosshair fallback.
 */
export function eraserCursorCss(glyphCanvas: HTMLCanvasElement, eraserRadius: number): string {
	// The brush radius is in canvas pixels (1000x1000 backing store); scale it
	// to CSS pixels using the canvas's on-screen box so the cursor ring matches
	// the actual erase footprint at any layout size or zoom level.
	const rect = glyphCanvas.getBoundingClientRect();
	const scale = rect.width > 0 ? rect.width / glyphCanvas.width : 1;
	const radius = Math.max(4, eraserRadius * scale);
	const size = Math.ceil(radius * 2 + 2);
	const center = size / 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#241b16" stroke-width="1.5" opacity="0.8"/></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
}
