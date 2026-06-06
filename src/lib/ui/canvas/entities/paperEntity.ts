import type { Entity } from '../entity.js';

/**
 * Simple background paper fill.
 */
export function paperEntity(): Entity {
	return {
		id: 'paper',
		z: -100,
		render(ctx) {
			const { width, height } = ctx.canvas;
			ctx.clearRect(0, 0, width, height);
			const gradient = ctx.createLinearGradient(0, 0, width, 0);
			gradient.addColorStop(0, '#f7dfac');
			gradient.addColorStop(0.45, '#f4df9f');
			gradient.addColorStop(1, '#fae8a5');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
	};
}
