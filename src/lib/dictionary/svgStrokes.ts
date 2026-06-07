import type { Point } from '../types.js';

/**
 * Turns the normalized glyph SVGs in `./svg` into the unit-box `baseStrokes` a
 * {@link Placement} expects (see `makeSymbolEntity` / `bakePlacementToStrokes`).
 *
 * The SVGs are produced by `scripts/normalize-svgs.mjs`: one `<path>` of absolute
 * commands whose `viewBox` tightly bounds the centerline. We sample each subpath
 * into a polyline and map it into `[0,1]²` centered on (0.5, 0.5), preserving the
 * glyph's aspect ratio. These strokes are the on-screen *reference* only — they are
 * never stored in a sample — so uniform-length sampling is plenty.
 */

/** Raw SVG text, eagerly bundled so lookups are synchronous. */
const RAW_SVGS = import.meta.glob('./svg/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** Map filename stem (e.g. "column") to its raw SVG text. */
const SVG_BY_ID: Record<string, string> = Object.fromEntries(
	Object.entries(RAW_SVGS).map(([path, text]) => [
		path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/, ''),
		text
	])
);

/** Spacing between sampled points, in viewBox units. Smaller = smoother. */
const SAMPLE_SPACING = 0.25;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The raw SVG markup for a sign id, for thumbnails. Throws if unknown. */
export function getSymbolSvg(id: string): string {
	const svg = SVG_BY_ID[id];
	if (!svg) {
		throw new Error(`No SVG asset for symbol "${id}"`);
	}
	return svg;
}

/**
 * Convert a sign's SVG path into unit-box `baseStrokes`. Each `M`-delimited subpath
 * becomes one stroke (one pen-down trace). Browser-only: relies on the DOM to parse
 * and measure the path.
 */
export function loadSymbolBaseStrokes(id: string): Point[][] {
	const { width, height, subpaths } = parseSvg(getSymbolSvg(id));
	const span = Math.max(width, height) || 1;

	// A hidden host keeps detached path measurement reliable across browsers.
	const host = document.createElementNS(SVG_NS, 'svg');
	host.setAttribute('width', '0');
	host.setAttribute('height', '0');
	host.style.position = 'absolute';
	host.style.visibility = 'hidden';
	document.body.appendChild(host);

	try {
		return subpaths.map((d) => samplePath(host, d, width, height, span));
	} finally {
		host.remove();
	}
}

interface ParsedSvg {
	width: number;
	height: number;
	subpaths: string[];
}

function parseSvg(svgText: string): ParsedSvg {
	const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
	const svg = doc.querySelector('svg');
	const path = doc.querySelector('path');
	if (!svg || !path) {
		throw new Error('SVG asset is missing its <svg> or <path>');
	}

	const viewBox = (svg.getAttribute('viewBox') ?? '')
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	const [, , width, height] = viewBox;
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		throw new Error('SVG asset has no usable viewBox');
	}

	const d = path.getAttribute('d') ?? '';
	// The normalizer emits absolute commands, so subpaths start at an uppercase `M`.
	const subpaths = d
		.split(/(?=M)/)
		.map((s) => s.trim())
		.filter(Boolean);

	return { width, height, subpaths };
}

/** Sample one subpath into unit-box points, centered and aspect-preserving. */
function samplePath(
	host: SVGSVGElement,
	d: string,
	width: number,
	height: number,
	span: number
): Point[] {
	const path = document.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', d);
	host.appendChild(path);

	try {
		const length = path.getTotalLength();
		const steps = Math.max(1, Math.ceil(length / SAMPLE_SPACING));
		const points: Point[] = [];
		for (let i = 0; i <= steps; i += 1) {
			const { x, y } = path.getPointAtLength((length * i) / steps);
			points.push({ x: 0.5 + (x - width / 2) / span, y: 0.5 + (y - height / 2) / span });
		}
		return points;
	} finally {
		path.remove();
	}
}
