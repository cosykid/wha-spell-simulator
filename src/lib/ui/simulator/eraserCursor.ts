/**
 * CSS cursor helpers for the simulator eraser tool.
 *
 * The eraser radius is defined in backing-store canvas pixels, but CSS cursors
 * render in screen pixels. This module keeps that conversion in one place so the
 * visible brush ring matches the actual erase footprint at any canvas size.
 *
 * @packageDocumentation
 */
/** Screen pixels. Below this the ring stops reading as a brush footprint. */
const MIN_RING_RADIUS = 4;

/**
 * Builds a data-URL cursor showing the current eraser brush footprint.
 *
 * This measures the canvas exactly as it stands on screen right now, so a caller
 * that animates the canvas has to ask again once the transform lands.
 * {@link SimulatorRuntime} does that on transitionend.
 *
 * @param glyphCanvas - The canvas whose on-screen box determines the cursor scale.
 * @param eraserRadius - Brush radius in backing-store canvas pixels.
 * @returns CSS `cursor` value with a centered SVG ring and crosshair fallback.
 */
export function eraserCursorCss(glyphCanvas: HTMLCanvasElement, eraserRadius: number): string {
	// The brush radius is in canvas pixels (1000x1000 backing store); scale it
	// to CSS pixels using the canvas's on-screen box so the cursor ring matches
	// the actual erase footprint at any layout size or zoom level. The measured
	// box is the right input rather than the zoom alone, because the eraser maps
	// pointer coordinates through the same box and the portal tilt shrinks it
	// under a transform the zoom level knows nothing about.
	const rect = glyphCanvas.getBoundingClientRect();
	const scale = rect.width > 0 ? rect.width / glyphCanvas.width : 1;
	const radius = Math.max(MIN_RING_RADIUS, eraserRadius * scale);
	const size = Math.ceil(radius * 2 + 2);
	const center = size / 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#241b16" stroke-width="1.5" opacity="0.8"/></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
}
