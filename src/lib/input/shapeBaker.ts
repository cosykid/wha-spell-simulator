import type {
	Placement,
	PlacementHandle,
	PlacementHandles,
	PlacementTransform,
	Stroke,
	Vector
} from '../types.js';
import { degreesToRadians, distance, radiansToDegrees } from '../utils/geometry.js';

export const HANDLE_HIT_RADIUS = 12;
const MIN_SHAPE_SIZE = 24;
export const ROTATE_HANDLE_OFFSET = 28;

export function clampShapeSize(value: number): number {
	return Math.max(MIN_SHAPE_SIZE, value);
}

function transformBasis(transform: PlacementTransform): { cos: number; sin: number } {
	const angle = degreesToRadians(transform.rotationDeg ?? 0);
	return { cos: Math.cos(angle), sin: Math.sin(angle) };
}

function localToCanvas(
	transform: PlacementTransform,
	basis: { cos: number; sin: number },
	lx: number,
	ly: number
): Vector {
	return {
		x: transform.cx + lx * basis.cos - ly * basis.sin,
		y: transform.cy + lx * basis.sin + ly * basis.cos
	};
}

/**
 * Transforms a unit-box placement point into canvas space.
 *
 * Placement templates are centered on (0.5, 0.5); keeping this helper shared
 * ensures Canvas entity rendering and recognition baking do not drift apart.
 */
export function createPlacementPointMapper(
	transform: PlacementTransform
): (point: Vector) => Vector {
	const basis = transformBasis(transform);
	return (point) =>
		localToCanvas(
			transform,
			basis,
			(point.x - 0.5) * transform.scaleX,
			(point.y - 0.5) * transform.scaleY
		);
}

/** Convenience wrapper for callers that only need to transform one point. */
export function placementPointToCanvas(transform: PlacementTransform, point: Vector): Vector {
	return createPlacementPointMapper(transform)(point);
}

// Map a canvas point back into the placement's unrotated, centered frame.
export function toLocalPoint(transform: PlacementTransform, point: Vector): Vector {
	const basis = transformBasis(transform);
	const dx = point.x - transform.cx;
	const dy = point.y - transform.cy;
	return {
		x: dx * basis.cos + dy * basis.sin,
		y: -dx * basis.sin + dy * basis.cos
	};
}

// A placement stores template strokes in a unit box centered on (0.5, 0.5). Baking
// scales, rotates, and translates those points into canvas-space ink strokes that the
// parser reads exactly like freehand input.
export function bakePlacementToStrokes(placement: Placement): Stroke[] {
	const { transform } = placement;
	const toCanvas = createPlacementPointMapper(transform);
	return placement.baseStrokes.map((points, strokeIndex) => ({
		id: `${placement.id}.${strokeIndex}`,
		points: points.map((point) => {
			const canvasPoint = toCanvas(point);
			return { x: canvasPoint.x, y: canvasPoint.y, t: 0 };
		}),
		startedAt: 0,
		endedAt: 0
	}));
}

export function placementHandles(
	placement: Placement,
	rotateHandleOffset = ROTATE_HANDLE_OFFSET
): PlacementHandles {
	const { transform } = placement;
	const basis = transformBasis(transform);
	const hx = transform.scaleX / 2;
	const hy = transform.scaleY / 2;
	const corner = (lx: number, ly: number) => localToCanvas(transform, basis, lx, ly);
	return {
		center: { x: transform.cx, y: transform.cy },
		corners: [corner(-hx, -hy), corner(hx, -hy), corner(hx, hy), corner(-hx, hy)],
		edgeHandles: [
			{ type: 'elongate-x', ...corner(hx, 0) },
			{ type: 'elongate-x-left', ...corner(-hx, 0) },
			{ type: 'elongate-y', ...corner(0, hy) }
		],
		topMid: corner(0, -hy),
		rotate: corner(0, -hy - rotateHandleOffset)
	};
}

export function hitTestPlacement(placement: Placement, point: Vector, pad = 6): boolean {
	const local = toLocalPoint(placement.transform, point);
	return (
		Math.abs(local.x) <= placement.transform.scaleX / 2 + pad &&
		Math.abs(local.y) <= placement.transform.scaleY / 2 + pad
	);
}

export function hitTestHandles(
	placement: Placement,
	point: Vector,
	radius = HANDLE_HIT_RADIUS,
	rotateHandleOffset = ROTATE_HANDLE_OFFSET
): PlacementHandle | null {
	const handles = placementHandles(placement, rotateHandleOffset);
	const candidates: PlacementHandle[] = [
		{ type: 'rotate', x: handles.rotate.x, y: handles.rotate.y },
		{ type: 'elongate-y-top', x: handles.topMid.x, y: handles.topMid.y },
		...handles.corners.map(
			(corner): PlacementHandle => ({ type: 'scale', x: corner.x, y: corner.y })
		),
		...handles.edgeHandles
	];
	// Pick the nearest candidate (not the first within range): large touch hit radii can
	// overlap on a small placement, and the finger should win the handle it is closest to.
	let best: PlacementHandle | null = null;
	let bestDistance = Infinity;
	for (const handle of candidates) {
		const handleDistance = distance(point, handle);
		if (handleDistance <= radius && handleDistance < bestDistance) {
			best = handle;
			bestDistance = handleDistance;
		}
	}
	return best;
}

export function rotationDegToPoint(transform: PlacementTransform, point: Vector): number {
	return radiansToDegrees(Math.atan2(point.x - transform.cx, -(point.y - transform.cy)));
}
