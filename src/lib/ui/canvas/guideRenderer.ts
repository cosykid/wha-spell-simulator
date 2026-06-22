import type { AppConfig, RingInfo } from '../../types.js';
import { degreesToRadians } from '../../utils/geometry.js';

export function drawGuides(
	ctx: CanvasRenderingContext2D,
	ring: RingInfo | null | undefined,
	width: number,
	height: number,
	config: AppConfig,
	/**
	 * Reference length the default (no ring drawn) guide is sized against. Defaults
	 * to the full canvas. The simulator passes the visible viewport's short axis so
	 * the guide fits on screen even when the canvas is a cover-square that overflows
	 * the viewport (see canvasSizing.ts / SimulatorStage).
	 */
	referenceSize = Math.min(width, height)
): void {
	const center = ring?.found ? ring.center : { x: width / 2, y: height / 2 };
	const radius = ring?.found ? ring.radius : referenceSize * 0.36;
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
