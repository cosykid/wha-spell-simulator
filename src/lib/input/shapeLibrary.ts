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
import { CONFIG } from '../config.js';

const RING_SEGMENTS = 88;
const RING_GAP_DEG = 45;

// The ring's diameter as a fraction of the visible drawing area. Sized off the
// visible short axis (not the full backing square, which sits partly off-screen on
// non-square viewports) so a dropped ring matches the guide ring recognition draws.
// Glyphs derive their size from this diameter, since a glyph's "regular" size is
// defined relative to the ring.
const RING_SIZE_RATIO = 0.72;

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

// Largest side of a template's ink bounding box in unit (0..1) space. Templates
// pad their box by different amounts, so this converts a target ink footprint into
// the placement-box scale that produces it.
function maxUnitExtent(strokes: Point[][]): number {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const stroke of strokes) {
		for (const point of stroke) {
			minX = Math.min(minX, point.x);
			minY = Math.min(minY, point.y);
			maxX = Math.max(maxX, point.x);
			maxY = Math.max(maxY, point.y);
		}
	}
	return Math.max(maxX - minX, maxY - minY);
}

// A glyph's placement box, as a fraction of the ring diameter, that makes its drawn
// ink land at regular (1x) size: its `referenceSizeNorm` (the ring-relative footprint
// a normal instance occupies) divided by how much of the template box the ink fills.
function glyphRingFraction(entry: SigilEntry | SignEntry, strokes: Point[][]): number {
	const referenceSizeNorm =
		entry.referenceSizeNorm ?? CONFIG.renderer.effectSize.defaultReferenceSizeNorm;
	return referenceSizeNorm / Math.max(maxUnitExtent(strokes), 1e-6);
}

function templateItems(
	entries: (SigilEntry | SignEntry)[] | undefined,
	kind: PlacementKind
): ShapeItem[] {
	return (entries ?? [])
		.filter((entry) => entry.strokeTemplate?.strokes?.length)
		.map((entry) => {
			const baseStrokes = cloneStrokes(entry.strokeTemplate!.strokes);
			return {
				id: `${kind}:${entry.id}`,
				kind,
				sourceId: entry.id,
				label: entry.displayName ?? entry.id,
				element: kind === 'sigil' ? ((entry as SigilEntry).element ?? null) : null,
				baseStrokes,
				regularRingFraction: glyphRingFraction(entry, baseStrokes)
			};
		});
}

export function buildShapeLibrary(dictionary: Dictionary): ShapeLibrary {
	const ring: ShapeItem = {
		id: 'ring',
		kind: 'ring',
		sourceId: 'ring',
		label: 'Spell Ring',
		element: null,
		baseStrokes: ringBaseStrokes(),
		// The ring is the diameter, so its box spans the whole ring.
		regularRingFraction: 1
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

/**
 * Default transform for a shape dropped from the palette at `point`.
 *
 * @param referenceSize - Logical paper size (the visible drawing area's short
 *   axis) that the ring diameter and glyph footprints are measured against.
 */
export function defaultTransformForShape(
	item: ShapeItem,
	point: Vector,
	referenceSize: number
): PlacementTransform {
	const ringDiameter = Math.max(1, referenceSize) * RING_SIZE_RATIO;
	const size = ringDiameter * item.regularRingFraction;
	return {
		cx: point.x,
		cy: point.y,
		scaleX: size,
		scaleY: size,
		rotationDeg: 0
	};
}

// Fraction of a shape's own size to nudge a pasted copy by. Scaling the nudge
// with the shape keeps it proportionate for both small signs and large rings.
const PASTE_OFFSET_RATIO = 0.12;

/**
 * Offsets a transform for a pasted copy so it lands clearly off the original
 * instead of hiding it. Feeding the result back in cascades repeated pastes,
 * because each copy nudges further from the previous one.
 */
export function offsetTransformForPaste(transform: PlacementTransform): PlacementTransform {
	return {
		...transform,
		cx: transform.cx + transform.scaleX * PASTE_OFFSET_RATIO,
		cy: transform.cy + transform.scaleY * PASTE_OFFSET_RATIO
	};
}
