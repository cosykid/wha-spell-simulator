#!/usr/bin/env node
/**
 * Batch-normalize Inkscape-exported glyph SVGs into "scale 1" source assets.
 *
 * For each .svg in the target folder it:
 *   1. Flattens every ancestor/element `transform` into the path coordinates.
 *   2. Converts <line>/<polyline>/<polygon>/<rect>/<circle>/<ellipse> to path
 *      data (so all geometry is treated uniformly).
 *   3. Computes the tight CENTERLINE bounding box across all geometry
 *      (exact bezier extrema, not just anchor points) and shifts it to (0,0).
 *   4. Rewrites the viewBox to that bbox, dropping intrinsic width/height so
 *      render size is controlled by the consumer (REFERENCE_SIZE). Natural
 *      aspect ratio is preserved.
 *   5. Emits a clean <path> per render style — outlined geometry shares one
 *      uniform stroke, while filled geometry (e.g. solid dots) keeps its fill —
 *      and strips all Inkscape/editor cruft (comments, <defs>, metadata, ids,
 *      namespaces).
 *
 * The viewBox bounds the centerline geometry, so round stroke caps extend
 * slightly past the edges by design — render the overlay <svg> with
 * `overflow: visible` so they aren't clipped.
 *
 * Usage:
 *   node scripts/normalize-svgs.mjs <folder> [options]
 *
 * Options:
 *   --out <dir>        Write normalized files to <dir> instead of in place.
 *   --dry-run          Report what would change; write nothing.
 *   --stroke-width <n> Stroke width in viewBox units (default: keep detected, else 1).
 *   --precision <n>    Decimal places for coordinates (default: 4).
 *   -h, --help         Show this help.
 *
 * Examples:
 *   node scripts/normalize-svgs.mjs src/lib/dictionary/svg
 *   node scripts/normalize-svgs.mjs src/lib/dictionary/svg --dry-run
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import svgpath from 'svgpath';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const opts = { strokeWidth: 1, precision: 4, dryRun: false, out: null, folder: null };
	opts.strokeWidthExplicit = argv.includes('--stroke-width');
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case '-h':
			case '--help':
				opts.help = true;
				break;
			case '--dry-run':
				opts.dryRun = true;
				break;
			case '--out':
				opts.out = argv[++i];
				break;
			case '--stroke-width':
				opts.strokeWidth = Number(argv[++i]);
				break;
			case '--precision':
				opts.precision = Number(argv[++i]);
				break;
			default:
				if (arg.startsWith('-')) {
					throw new Error(`Unknown option: ${arg}`);
				}
				opts.folder = arg;
		}
	}
	return opts;
}

const HELP = `Normalize Inkscape glyph SVGs into "scale 1" source assets.

Usage:
  node scripts/normalize-svgs.mjs <folder> [options]

Options:
  --out <dir>         Write to <dir> instead of overwriting in place.
  --dry-run           Report changes without writing.
  --stroke-width <n>  Stroke width in viewBox units (default: keep detected, else 1).
  --precision <n>     Decimal places for coordinates (default: 4).
  -h, --help          Show this help.`;

// ---------------------------------------------------------------------------
// Tiny tag scanner: walks elements in document order while tracking the
// transform stack, so transforms on any ancestor are accounted for. Good
// enough for editor-exported SVGs (no CDATA / exotic content in glyph files).
// ---------------------------------------------------------------------------

const TAG_RE = /<\/?([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const UNSUPPORTED_SHAPES = new Set(['text', 'image', 'use']);

function getAttr(attrs, name) {
	const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`));
	return m ? m[1] : null;
}

/**
 * Returns { paths: [{ d, transform, fill, stroked }], detectedStrokeWidth, warnings }.
 * `fill` is the element's fill colour (or null when not filled) and `stroked`
 * is whether the element draws a stroke — so filled and outlined geometry can be
 * re-emitted with the right paint instead of being flattened to a single style.
 */
function extractGeometry(svg) {
	const paths = [];
	const warnings = [];
	const stack = []; // transform strings of currently-open ancestors (outer -> inner)
	let detectedStrokeWidth = null;

	let m;
	TAG_RE.lastIndex = 0;
	while ((m = TAG_RE.exec(svg)) !== null) {
		const [, rawName, attrs, selfSlash] = m;
		const name = rawName.toLowerCase();
		const isClosing = m[0].startsWith('</');
		const isSelfClosing = selfSlash === '/' || isClosing;

		if (isClosing) {
			stack.pop();
			continue;
		}

		const own = getAttr(attrs, 'transform');
		const combined = [...stack, own].filter(Boolean).join(' ');

		if (detectedStrokeWidth == null) {
			const sw = readStrokeWidth(attrs);
			if (sw != null) detectedStrokeWidth = sw;
		}

		const d = geometryToPath(name, attrs);
		if (d) {
			const fillRaw = readPaint(attrs, 'fill');
			const strokeRaw = readPaint(attrs, 'stroke');
			const fill = fillRaw && fillRaw !== 'none' ? fillRaw : null;
			let stroked = strokeRaw != null && strokeRaw !== 'none';
			// Geometry with neither paint specified would be invisible; keep the
			// historical behaviour of stroking it so nothing silently disappears.
			if (!fill && !stroked) stroked = true;
			paths.push({ d, transform: combined, fill, stroked });
		} else if (UNSUPPORTED_SHAPES.has(name)) {
			warnings.push(`unsupported <${name}> skipped (convert to a path in Inkscape)`);
		}

		if (!isSelfClosing) {
			// Container element: keep its transform on the stack until </>.
			stack.push(own || '');
		}
	}

	return { paths, detectedStrokeWidth, warnings };
}

function readStrokeWidth(attrs) {
	const direct = getAttr(attrs, 'stroke-width');
	if (direct != null && direct !== '') return Number(direct);
	const style = getAttr(attrs, 'style');
	if (style) {
		const sm = style.match(/stroke-width\s*:\s*([\d.]+)/);
		if (sm) return Number(sm[1]);
	}
	return null;
}

/** Read a paint property (`fill` / `stroke`) from a presentation attr or style. */
function readPaint(attrs, prop) {
	const direct = getAttr(attrs, prop);
	if (direct != null && direct !== '') return direct.trim();
	const style = getAttr(attrs, 'style');
	if (style) {
		const sm = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
		if (sm) return sm[1].trim();
	}
	return null;
}

/** Convert a supported geometry element into path data, or null. */
function geometryToPath(name, attrs) {
	switch (name) {
		case 'path':
			return getAttr(attrs, 'd');
		case 'line': {
			const x1 = getAttr(attrs, 'x1') ?? 0;
			const y1 = getAttr(attrs, 'y1') ?? 0;
			const x2 = getAttr(attrs, 'x2') ?? 0;
			const y2 = getAttr(attrs, 'y2') ?? 0;
			return `M ${x1} ${y1} L ${x2} ${y2}`;
		}
		case 'polyline':
		case 'polygon': {
			const pts = (getAttr(attrs, 'points') || '')
				.trim()
				.split(/[\s,]+/)
				.map(Number);
			if (pts.length < 4) return null;
			let d = `M ${pts[0]} ${pts[1]}`;
			for (let i = 2; i < pts.length - 1; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
			if (name === 'polygon') d += ' Z';
			return d;
		}
		case 'rect': {
			const x = Number(getAttr(attrs, 'x') ?? 0);
			const y = Number(getAttr(attrs, 'y') ?? 0);
			const w = Number(getAttr(attrs, 'width') ?? 0);
			const h = Number(getAttr(attrs, 'height') ?? 0);
			if (!(w > 0) || !(h > 0)) return null;
			// Corner radii: rx/ry default to each other when only one is given.
			const rxRaw = getAttr(attrs, 'rx');
			const ryRaw = getAttr(attrs, 'ry');
			let rx = rxRaw != null ? Number(rxRaw) : NaN;
			let ry = ryRaw != null ? Number(ryRaw) : NaN;
			if (Number.isNaN(rx)) rx = ry;
			if (Number.isNaN(ry)) ry = rx;
			rx = Math.min(Math.max(rx || 0, 0), w / 2);
			ry = Math.min(Math.max(ry || 0, 0), h / 2);
			if (!(rx > 0) || !(ry > 0)) {
				return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
			}
			return (
				`M ${x + rx} ${y} h ${w - 2 * rx} a ${rx} ${ry} 0 0 1 ${rx} ${ry} ` +
				`v ${h - 2 * ry} a ${rx} ${ry} 0 0 1 ${-rx} ${ry} h ${-(w - 2 * rx)} ` +
				`a ${rx} ${ry} 0 0 1 ${-rx} ${-ry} v ${-(h - 2 * ry)} a ${rx} ${ry} 0 0 1 ${rx} ${-ry} Z`
			);
		}
		case 'circle': {
			const cx = Number(getAttr(attrs, 'cx') ?? 0);
			const cy = Number(getAttr(attrs, 'cy') ?? 0);
			const r = Number(getAttr(attrs, 'r') ?? 0);
			if (!(r > 0)) return null;
			return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
		}
		case 'ellipse': {
			const cx = Number(getAttr(attrs, 'cx') ?? 0);
			const cy = Number(getAttr(attrs, 'cy') ?? 0);
			const rx = Number(getAttr(attrs, 'rx') ?? 0);
			const ry = Number(getAttr(attrs, 'ry') ?? 0);
			if (!(rx > 0) || !(ry > 0)) return null;
			return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
		}
		default:
			return null;
	}
}

// ---------------------------------------------------------------------------
// Bounding box of path geometry (centerline), including exact bezier extrema.
// ---------------------------------------------------------------------------

function cubicAt(t, p0, p1, p2, p3) {
	const mt = 1 - t;
	return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function quadAt(t, p0, p1, p2) {
	const mt = 1 - t;
	return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

/** Parameter values where a cubic component is stationary (B'(t) = 0). */
function cubicExtremaT(p0, p1, p2, p3) {
	const A = p1 - p0;
	const B = p2 - p1;
	const C = p3 - p2;
	return solveQuadratic(A - 2 * B + C, 2 * (B - A), A);
}

/** Parameter value where a quadratic component is stationary. */
function quadExtremaT(p0, p1, p2) {
	const denom = p0 - 2 * p1 + p2;
	if (Math.abs(denom) < 1e-12) return [];
	return [(p0 - p1) / denom];
}

function solveQuadratic(a, b, c) {
	if (Math.abs(a) < 1e-12) {
		if (Math.abs(b) < 1e-12) return [];
		return [-c / b];
	}
	const disc = b * b - 4 * a * c;
	if (disc < 0) return [];
	const sq = Math.sqrt(disc);
	return [(-b + sq) / (2 * a), (-b - sq) / (2 * a)];
}

/** Expand `box` to cover one path's geometry, after applying `transform`. */
function accumulateBBox(d, transform, box) {
	const sp = transform ? svgpath(d).transform(transform) : svgpath(d);
	sp.abs().unarc().unshort();

	const include = (x, y) => {
		if (x < box.minX) box.minX = x;
		if (y < box.minY) box.minY = y;
		if (x > box.maxX) box.maxX = x;
		if (y > box.maxY) box.maxY = y;
	};

	sp.iterate((seg, _i, x, y) => {
		switch (seg[0]) {
			case 'M':
			case 'L':
				include(seg[1], seg[2]);
				break;
			case 'H':
				include(seg[1], y);
				break;
			case 'V':
				include(x, seg[1]);
				break;
			case 'Q': {
				const [, x1, y1, ex, ey] = seg;
				include(x, y);
				include(ex, ey);
				for (const t of quadExtremaT(x, x1, ex)) {
					if (t > 0 && t < 1) include(quadAt(t, x, x1, ex), quadAt(t, y, y1, ey));
				}
				for (const t of quadExtremaT(y, y1, ey)) {
					if (t > 0 && t < 1) include(quadAt(t, x, x1, ex), quadAt(t, y, y1, ey));
				}
				break;
			}
			case 'C': {
				const [, x1, y1, x2, y2, ex, ey] = seg;
				include(x, y);
				include(ex, ey);
				for (const t of cubicExtremaT(x, x1, x2, ex)) {
					if (t > 0 && t < 1) include(cubicAt(t, x, x1, x2, ex), cubicAt(t, y, y1, y2, ey));
				}
				for (const t of cubicExtremaT(y, y1, y2, ey)) {
					if (t > 0 && t < 1) include(cubicAt(t, x, x1, x2, ex), cubicAt(t, y, y1, y2, ey));
				}
				break;
			}
			// Z introduces no new geometry.
		}
	});
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function round(n, precision) {
	const f = 10 ** precision;
	return Math.round(n * f) / f;
}

function normalizeSvg(svg, opts) {
	const { paths, detectedStrokeWidth, warnings } = extractGeometry(svg);
	if (paths.length === 0) {
		return { svg: null, warnings: [...warnings, 'no supported geometry found'] };
	}

	const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	for (const { d, transform } of paths) accumulateBBox(d, transform, box);

	if (!Number.isFinite(box.minX)) {
		return { svg: null, warnings: [...warnings, 'could not compute a bounding box'] };
	}

	const width = round(box.maxX - box.minX, opts.precision);
	const height = round(box.maxY - box.minY, opts.precision);
	const shift = `translate(${-box.minX} ${-box.minY})`;

	const strokeWidth = opts.strokeWidthExplicit
		? opts.strokeWidth
		: (detectedStrokeWidth ?? opts.strokeWidth);

	// Group geometry by render style (fill colour + whether it is stroked) so a
	// filled dot stays filled while outlined glyphs keep the uniform stroke,
	// rather than collapsing everything into a single fill="none" path.
	const groups = new Map();
	for (const { d, transform, fill, stroked } of paths) {
		const key = `${fill ?? 'none'}|${stroked}`;
		const sp = transform ? svgpath(d).transform(transform) : svgpath(d);
		const normalized = sp.transform(shift).abs().round(opts.precision).toString().trim();
		const group = groups.get(key);
		if (group) group.ds.push(normalized);
		else groups.set(key, { fill, stroked, ds: [normalized] });
	}

	const pathTags = [...groups.values()]
		.map(({ fill, stroked, ds }) => {
			const d = ds.join(' ');
			const stroke = stroked
				? `stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
				: `stroke="none"`;
			return `  <path d="${d}"\n        fill="${fill ?? 'none'}" ${stroke} />`;
		})
		.join('\n');

	const out =
		`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n` +
		`${pathTags}\n` +
		`</svg>\n`;

	return { svg: out, width, height, warnings };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help || !opts.folder) {
		console.log(HELP);
		process.exit(opts.help ? 0 : 1);
	}

	const folder = resolve(opts.folder);
	const entries = (await readdir(folder)).filter((f) => f.toLowerCase().endsWith('.svg'));
	if (entries.length === 0) {
		console.error(`No .svg files in ${folder}`);
		process.exit(1);
	}

	if (opts.out) await mkdir(resolve(opts.out), { recursive: true });

	let changed = 0;
	for (const file of entries.sort()) {
		const srcPath = join(folder, file);
		const original = await readFile(srcPath, 'utf8');
		const { svg, width, height, warnings } = normalizeSvg(original, opts);

		const tag = warnings.length ? `  (${warnings.join('; ')})` : '';
		if (!svg) {
			console.warn(`✗ ${file}${tag}`);
			continue;
		}

		const destPath = opts.out ? join(resolve(opts.out), basename(file)) : srcPath;
		const willChange = Boolean(opts.out) || svg !== original;
		console.log(`${willChange ? '✓' : '·'} ${file}  →  viewBox 0 0 ${width} ${height}${tag}`);

		if (!opts.dryRun && willChange) {
			await writeFile(destPath, svg);
			changed++;
		}
	}

	const verb = opts.dryRun ? 'would write' : 'wrote';
	const count = opts.dryRun ? entries.length : changed;
	console.log(`\n${verb} ${count} file(s)${opts.out ? ` to ${opts.out}` : ''}.`);
	if (!opts.dryRun && !opts.out) {
		console.log(
			'Reminder: render overlays with `overflow: visible` so round stroke caps are not clipped.'
		);
	}
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
