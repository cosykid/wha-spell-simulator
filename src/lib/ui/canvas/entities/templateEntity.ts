import { CONFIG } from '$config';
import type { Point, StrokeTemplate } from '../../../types.js';
import { drawingBounds, templatePointToCanvas } from '../../strokeTemplateView.js';
import type { Entity } from '../entity.js';

export function templateBoundsEntity(template: StrokeTemplate): Entity {
	return {
		id: 'template-bounds',
		z: -30,
		render(ctx) {
			const bounds = drawingBounds(template, ctx.canvas.width, ctx.canvas.height);
			ctx.save();
			ctx.strokeStyle = 'rgba(36, 27, 22, 0.18)';
			ctx.lineWidth = 1;
			ctx.setLineDash([8, 8]);
			ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
			ctx.restore();
		}
	};
}

export function templateStrokeEntity(points: Point[], id: string, template: StrokeTemplate): Entity {
	return {
		id,
		z: 0,
		render(ctx) {
			if (points.length < 2) return;
			const bounds = drawingBounds(template, ctx.canvas.width, ctx.canvas.height);
			const [first, ...rest] = points.map((p) => templatePointToCanvas(p, bounds));
			ctx.save();
			ctx.strokeStyle = CONFIG.renderer.inkColor;
			ctx.lineWidth = 7;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			ctx.moveTo(first.x, first.y);
			for (const point of rest) {
				ctx.lineTo(point.x, point.y);
			}
			ctx.stroke();
			ctx.restore();
		}
	};
}
