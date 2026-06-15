import type { PlacementHandles, Vector } from '../../types.js';

const HANDLE_SIZE = 9;
const ROTATE_HANDLE_RADIUS = 5.5;

function drawHandleSquare(ctx: CanvasRenderingContext2D, point: Vector, size: number): void {
	ctx.beginPath();
	ctx.rect(point.x - size / 2, point.y - size / 2, size, size);
	ctx.fill();
	ctx.stroke();
}

export function drawSelection(
	ctx: CanvasRenderingContext2D,
	handles: PlacementHandles,
	scale = 1
): void {
	ctx.save();
	ctx.strokeStyle = 'rgba(31, 111, 115, 0.85)';
	ctx.fillStyle = 'rgba(255, 251, 233, 0.96)';
	ctx.lineWidth = 1.5 * scale;

	ctx.setLineDash([6 * scale, 4 * scale]);
	ctx.beginPath();
	handles.corners.forEach((corner, index) => {
		if (index === 0) {
			ctx.moveTo(corner.x, corner.y);
		} else {
			ctx.lineTo(corner.x, corner.y);
		}
	});
	ctx.closePath();
	ctx.stroke();
	ctx.setLineDash([]);

	ctx.beginPath();
	ctx.moveTo(handles.topMid.x, handles.topMid.y);
	ctx.lineTo(handles.rotate.x, handles.rotate.y);
	ctx.stroke();

	const handleSize = HANDLE_SIZE * scale;
	for (const corner of handles.corners) {
		drawHandleSquare(ctx, corner, handleSize);
	}
	for (const edge of handles.edgeHandles) {
		drawHandleSquare(ctx, edge, handleSize);
	}
	drawHandleSquare(ctx, handles.topMid, handleSize);

	ctx.beginPath();
	ctx.arc(handles.rotate.x, handles.rotate.y, ROTATE_HANDLE_RADIUS * scale, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}
