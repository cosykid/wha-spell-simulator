import type { Entity } from '../entity.js';

/**
 * Reference grid drawn behind all other entities.
 * Each cell is `cellSize` × `cellSize` canvas pixels, subdivided into `subdivisions`
 * equal sub-cells. The grid is centred on the canvas so that cell boundaries line up
 * with the default stamp position (canvas centre).
 */
export function gridEntity(cellSize: number, subdivisions = 4): Entity {
	return {
		id: 'grid',
		z: -90,
		render(ctx) {
			const { width, height } = ctx.canvas;
			const subSize = cellSize / subdivisions;

			// Offset so the bottom-left corner of a stamp placed at canvas centre coincides
			// with a grid corner. The stamp centre is (width/2, height/2) and its half-size
			// equals cellSize/2, so the bottom-left corner is at
			// (width/2 − cellSize/2,  height/2 + cellSize/2).
			const ox = (((width / 2 - cellSize / 2) % cellSize) + cellSize) % cellSize;
			const oy = (((height / 2 + cellSize / 2) % cellSize) + cellSize) % cellSize;

			ctx.save();

			// Sub-division lines (very faint).
			ctx.strokeStyle = 'rgba(36, 27, 22, 0.07)';
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			const sox = ox % subSize;
			const soy = oy % subSize;
			for (let x = sox; x <= width; x += subSize) {
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
			}
			for (let y = soy; y <= height; y += subSize) {
				ctx.moveTo(0, y);
				ctx.lineTo(width, y);
			}
			ctx.stroke();

			// Main cell lines (more visible).
			ctx.strokeStyle = 'rgba(36, 27, 22, 0.15)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			for (let x = ox; x <= width; x += cellSize) {
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
			}
			for (let y = oy; y <= height; y += cellSize) {
				ctx.moveTo(0, y);
				ctx.lineTo(width, y);
			}
			ctx.stroke();

			ctx.restore();
		}
	};
}
