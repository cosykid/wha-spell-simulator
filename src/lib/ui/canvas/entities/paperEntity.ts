/**
 * @file Background paper for a canvas scene: a flat parchment gradient, or that
 * gradient with a parchment photo laid over it.
 *
 * The paper is the same pixels on every frame, so an entity composes them once
 * onto a scratch canvas and blits that copy per frame. A render loop then pays
 * one 1:1 image copy instead of a fresh gradient and a rescaled photo each time.
 */

import type { Entity } from '../entity.js';

const PAPER_STOPS = [
	[0, '#ece0bd'],
	[0.45, '#e7dab4'],
	[1, '#f0e5c6']
] as const;

/**
 * Fills a surface with the flat parchment gradient.
 *
 * This is what a composed paper starts from, what it falls back to before its
 * texture decodes, and what callers outside a scene (the spell and lab previews)
 * draw straight onto their own context.
 */
export function renderPaper(
	ctx: CanvasRenderingContext2D,
	width = ctx.canvas.width,
	height = ctx.canvas.height
): void {
	ctx.clearRect(0, 0, width, height);

	const gradient = ctx.createLinearGradient(0, 0, width, 0);
	for (const [offset, color] of PAPER_STOPS) {
		gradient.addColorStop(offset, color);
	}
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
}

/**
 * Identifies one composed paper bitmap.
 *
 * Composed pixels depend on nothing but the backing-store size and whether the
 * texture had decoded, so a resize and a late decode are the only two events
 * that force a fresh composition.
 *
 * @example
 * paperCompositionKey(900, 900, false); // '900x900:gradient'
 */
export function paperCompositionKey(width: number, height: number, textureReady: boolean): string {
	return `${width}x${height}:${textureReady ? 'textured' : 'gradient'}`;
}

/**
 * Where an image lands when it covers a surface centre-cropped, the way
 * `background-size: cover` places one.
 *
 * @example
 * const cover = coverPlacement(image.width, image.height, width, height);
 * ctx.drawImage(image, cover.x, cover.y, cover.width, cover.height);
 */
export function coverPlacement(
	imageWidth: number,
	imageHeight: number,
	width: number,
	height: number
): { x: number; y: number; width: number; height: number } {
	const scale = Math.max(width / imageWidth, height / imageHeight);
	const drawWidth = imageWidth * scale;
	const drawHeight = imageHeight * scale;
	return {
		x: (width - drawWidth) / 2,
		y: (height - drawHeight) / 2,
		width: drawWidth,
		height: drawHeight
	};
}

// Parchment photos loaded lazily and cached by url. The first frames fall back to
// the flat gradient until the image decodes; the canvas runs a rAF loop so the
// texture appears as soon as it is ready without any redraw plumbing.
const textureCache = new Map<string, { image: HTMLImageElement; ready: boolean }>();

function paperTexture(src: string): HTMLImageElement | null {
	let entry = textureCache.get(src);
	if (!entry) {
		const image = new Image();
		entry = { image, ready: false };
		image.onload = () => {
			entry!.ready = true;
		};
		image.src = src;
		textureCache.set(src, entry);
	}
	return entry.ready ? entry.image : null;
}

/**
 * Composes the paper onto a scratch canvas and keeps that canvas until its key
 * changes. Each entity owns one composer, so two surfaces of different sizes
 * never fight over a single bitmap.
 */
function createPaperComposer(texture: () => HTMLImageElement | null) {
	let composed: { key: string; canvas: HTMLCanvasElement } | null = null;

	return function composedPaper(width: number, height: number): HTMLCanvasElement | null {
		// No DOM and a zero-sized backing store both leave the caller to draw the
		// gradient onto its own context instead.
		if (typeof document === 'undefined' || width < 1 || height < 1) {
			return null;
		}

		const image = texture();
		const key = paperCompositionKey(width, height, Boolean(image));
		if (composed?.key === key) {
			return composed.canvas;
		}

		const canvas = composed?.canvas ?? document.createElement('canvas');
		// Forget the old composition before overwriting its canvas, so a scratch
		// context that fails to come back leaves nothing blank behind to blit.
		composed = null;
		// Assigning the size also resets the scratch context, so a recomposition
		// always starts from a blank surface.
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return null;
		}

		renderPaper(ctx, width, height);
		if (image) {
			const cover = coverPlacement(image.width, image.height, width, height);
			ctx.drawImage(image, cover.x, cover.y, cover.width, cover.height);
		}

		composed = { key, canvas };
		return canvas;
	};
}

function makePaperEntity(texture: () => HTMLImageElement | null): Entity {
	const composedPaper = createPaperComposer(texture);
	return {
		id: 'paper',
		z: -100,
		render(ctx) {
			const { width, height } = ctx.canvas;
			const paper = composedPaper(width, height);
			if (!paper) {
				renderPaper(ctx, width, height);
				return;
			}
			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(paper, 0, 0);
		}
	};
}

/**
 * Simple background paper fill.
 */
export function paperEntity(): Entity {
	return makePaperEntity(() => null);
}

/**
 * Background paper that draws a parchment texture over the gradient fallback. Used
 * by the simulator so the activated paper carries a real surface as it tilts into
 * the portal. The texture is part of the canvas pixels, so it foreshortens with the
 * tilt for free.
 *
 * @example
 * createScene([texturedPaperEntity('/images/background.jpg'), ...])
 */
export function texturedPaperEntity(src: string): Entity {
	return makePaperEntity(() => paperTexture(src));
}
