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
