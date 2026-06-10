import type {
	Dictionary,
	PlacementKind,
	PlacementTransform,
	Point,
	ShapeItem,
	ShapeLibrary,
	SigilEntry,
	SignEntry,
	Vector
} from '../types.js';

const RING_SEGMENTS = 88;
const RING_GAP_DEG = 45;

function cloneStrokes(strokes: Point[][]): Point[][] {
	return strokes.map((points) =>
		points.map((point) => ({ x: Number(point.x), y: Number(point.y) }))
	);
}

// A unit-circle arc centered on (0.5, 0.5) with a gap, so a stamped ring lands as a
// prepared (open) boundary rather than instantly sealing the spell. The gap is closed
// by hand once the rest of the diagram is in place, which activates the spell.
function ringBaseStrokes(): Point[][] {
	const sweep = 360 - RING_GAP_DEG;
	const points: Point[] = [];
	for (let index = 0; index <= RING_SEGMENTS; index += 1) {
		const angle = ((RING_GAP_DEG / 2 + (index / RING_SEGMENTS) * sweep) * Math.PI) / 180;
		points.push({ x: 0.5 + Math.cos(angle) * 0.5, y: 0.5 + Math.sin(angle) * 0.5 });
	}
	return [points];
}

function templateItems(
	entries: readonly (SigilEntry | SignEntry)[] | undefined,
	kind: PlacementKind
): ShapeItem[] {
	return (entries ?? [])
		.filter((entry) => entry.strokeTemplate?.strokes?.length)
		.map((entry) => ({
			id: `${kind}:${entry.id}`,
			kind,
			sourceId: entry.id,
			label: entry.displayName ?? entry.id,
			element: entry.kind === 'sigil' ? (entry.element ?? null) : null,
			baseStrokes: cloneStrokes(entry.strokeTemplate!.strokes)
		}));
}

export function buildShapeLibrary(dictionary: Dictionary): ShapeLibrary {
	const ring: ShapeItem = {
		id: 'ring',
		kind: 'ring',
		sourceId: 'ring',
		label: 'Spell Ring',
		element: null,
		baseStrokes: ringBaseStrokes()
	};
	const sigils = templateItems(dictionary?.sigils, 'sigil');
	const signs = templateItems(dictionary?.signs, 'sign');

	return {
		ring,
		sigils,
		signs,
		items: [ring, ...sigils, ...signs]
	};
}

export function defaultTransformForShape(
	item: ShapeItem,
	point: Vector,
	canvas: { width: number; height: number }
): PlacementTransform {
	const minDimension = Math.max(1, Math.min(canvas.width, canvas.height));
	const size = item.kind === 'ring' ? minDimension * 0.62 : minDimension * 0.22;
	return {
		cx: point.x,
		cy: point.y,
		scaleX: size,
		scaleY: size,
		rotationDeg: 0
	};
}
