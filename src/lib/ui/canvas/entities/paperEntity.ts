import type { Entity } from '../entity.js';

const PAPER_STOPS = [
	[0, '#ece0bd'],
	[0.45, '#e7dab4'],
	[1, '#f0e5c6']
] as const;

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
 * Simple background paper fill.
 */
export function paperEntity(): Entity {
	return {
		id: 'paper',
		z: -100,
		render(ctx) {
			renderPaper(ctx);
		}
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

/** Draws an image to cover the canvas (centre-cropped), like `background-size: cover`. */
function drawCover(
	ctx: CanvasRenderingContext2D,
	image: HTMLImageElement,
	width: number,
	height: number
): void {
	const scale = Math.max(width / image.width, height / image.height);
	const drawWidth = image.width * scale;
	const drawHeight = image.height * scale;
	ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
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
	return {
		id: 'paper',
		z: -100,
		render(ctx) {
			const { width, height } = ctx.canvas;
			renderPaper(ctx, width, height);
			const image = paperTexture(src);
			if (image) {
				drawCover(ctx, image, width, height);
			}
		}
	};
}
