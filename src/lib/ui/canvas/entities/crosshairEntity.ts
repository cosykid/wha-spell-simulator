import type { Entity } from '../entity.js';

export function crosshairEntity(): Entity {
	return {
		id: 'crosshair',
		z: -50,
		render(ctx) {
			const { width, height } = ctx.canvas;
			ctx.save();
			ctx.strokeStyle = 'rgba(36, 27, 22, 0.24)';
			ctx.lineWidth = 1;
			ctx.setLineDash([8, 8]);
			ctx.beginPath();
			ctx.moveTo(width / 2, 0);
			ctx.lineTo(width / 2, height);
			ctx.moveTo(0, height / 2);
			ctx.lineTo(width, height / 2);
			ctx.stroke();
			ctx.restore();
		}
	};
}
