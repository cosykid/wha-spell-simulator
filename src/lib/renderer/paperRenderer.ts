import type { AppConfig, RingInfo } from '../types.js';

import { degreesToRadians } from '../utils/geometry.js';

/**
 * @deprecated Background rendering now lives in the canvas entity. See {@link makePaperEntity}
 * in `src/lib/ui/canvas/entities/paperEntity.ts`.
 */
export function drawPaper(ctx: CanvasRenderingContext2D, width: number, height: number): void {
	ctx.clearRect(0, 0, width, height);

	const gradient = ctx.createLinearGradient(0, 0, width, 0);
	gradient.addColorStop(0, '#ece0bd');
	gradient.addColorStop(0.45, '#e7dab4');
	gradient.addColorStop(1, '#f0e5c6');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
}

export function drawGuides(
	ctx: CanvasRenderingContext2D,
	ring: RingInfo | null | undefined,
	width: number,
	height: number,
	config: AppConfig
): void {
	const center = ring?.found ? ring.center : { x: width / 2, y: height / 2 };
	const radius = ring?.found ? ring.radius : Math.min(width, height) * 0.36;
	const guideRadii = [
		radius * config.layers.centerMax,
		radius * config.layers.middleMax,
		radius * config.layers.outerMax,
		radius
	];

	ctx.save();
	ctx.strokeStyle = config.renderer.guideColor;
	ctx.lineWidth = 1;
	ctx.setLineDash([8, 10]);
	for (const guideRadius of guideRadii) {
		ctx.beginPath();
		ctx.arc(center.x, center.y, guideRadius, 0, Math.PI * 2);
		ctx.stroke();
	}

	ctx.setLineDash([5, 16]);
	for (let angle = 0; angle < 360; angle += 45) {
		const radians = degreesToRadians(angle);
		ctx.beginPath();
		ctx.moveTo(center.x, center.y);
		ctx.lineTo(center.x + Math.cos(radians) * radius, center.y - Math.sin(radians) * radius);
		ctx.stroke();
	}
	ctx.restore();
}
