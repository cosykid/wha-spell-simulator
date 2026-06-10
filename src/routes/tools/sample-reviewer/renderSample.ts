/**
 * @file Pure helpers for rendering a stored labelled sample as inline SVG.
 *
 * The overlay transform composes the same math as `svgStrokes.ts` (viewBox → unit box)
 * and `shapeBaker.ts` (`bakePlacementToStrokes`: scale → rotate → translate), mirroring
 * `scripts/sample-to-svg.ts` — so a correct label puts the glyph exactly where the
 * contributor saw it in the Sample Maker.
 */

import { getSymbolSvg } from '$lib/dictionary/svgStrokes.js';
import type { LabelledSample, Stroke } from '$lib/structures/labelledSample.js';

/** Round to a few decimals to keep the generated path/transform strings short. */
function n(value: number): string {
	return Number(value.toFixed(3)).toString();
}

/** The reference glyph positioned by a sample's label, ready for `<path {d} {transform}>`. */
export interface ReferenceOverlay {
	d: string;
	transform: string;
}

/** Pull viewBox size and the single path `d` out of a normalized glyph SVG. */
function parseReferenceSvg(svgText: string): { width: number; height: number; d: string } | null {
	const viewBox = svgText.match(/viewBox\s*=\s*"([^"]+)"/);
	const path = svgText.match(/<path[^>]*\sd\s*=\s*"([^"]+)"/);
	if (!viewBox || !path) return null;
	const [, , width, height] = viewBox[1]!
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return null;
	return { width, height, d: path[1]! };
}

/**
 * The label overlay for a sample, or `null` when no SVG asset exists for its signId
 * (the strokes can still be shown on their own).
 */
export function referenceOverlay(sample: LabelledSample): ReferenceOverlay | null {
	const { label, meta } = sample;

	let svgText: string;
	try {
		svgText = getSymbolSvg(label.signId);
	} catch {
		return null;
	}
	const parsed = parseReferenceSvg(svgText);
	if (!parsed) return null;

	const { width, height, d } = parsed;
	const span = Math.max(width, height) || 1;
	const scaleX = (label.scale_x * meta.referenceSize) / span;
	const scaleY = (label.scale_y * meta.referenceSize) / span;
	const deg = (label.angle * 180) / Math.PI;

	// Right-to-left: center the viewBox, scale to the placement size, rotate, translate.
	const transform =
		`translate(${n(label.translate_x)} ${n(label.translate_y)}) rotate(${n(deg)}) ` +
		`scale(${n(scaleX)} ${n(scaleY)}) translate(${n(-width / 2)} ${n(-height / 2)})`;

	return { d, transform };
}

/** One raw stroke as SVG path data (`M x y L x y …`). */
export function strokePathD(stroke: Stroke): string {
	return stroke.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`).join(' ');
}

/** Quick ink facts shown on cards and in the detail view. */
export interface SampleStats {
	strokes: number;
	points: number;
	/** Time from the first to the last captured point, in ms (`t` is rebased to 0). */
	durationMs: number;
}

export function sampleStats(sample: LabelledSample): SampleStats {
	let points = 0;
	let durationMs = 0;
	for (const stroke of sample.data) {
		points += stroke.length;
		for (const point of stroke) {
			if (point.t > durationMs) durationMs = point.t;
		}
	}
	return { strokes: sample.data.length, points, durationMs };
}

/** The capture timestamp as a short local string, or '—' when unparsable. */
export function formatCapturedAt(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? '—'
		: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
