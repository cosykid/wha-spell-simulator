import type { PlacementTransform, Stroke } from '$lib/types.js';

import { bakePlacementToStrokes } from '$lib/input/shapeBaker.js';
import type { Point } from '$lib/types.js';

const GRID = 256;
const INK_RADIUS = 2; // DT-grid pixels

// ---------------------------------------------------------------------------
// Euclidean distance transform
// ---------------------------------------------------------------------------

// 1D squared-distance transform (Felzenszwalb & Huttenlocher 2012), in-place.
// f[i] starts as 0 for source pixels and a large finite value for others.
// After the call, f[i] = min_j { (i-j)^2 + f_original[j] }.
function sqdt1d(f: Float32Array): void {
	const n = f.length;
	const src = f.slice();
	const v = new Int32Array(n); // parabola centers in lower envelope
	const z = new Float32Array(n + 1); // boundaries between parabolas

	let k = 0;
	v[0] = 0;
	z[0] = -Infinity;
	z[1] = Infinity;

	for (let q = 1; q < n; q++) {
		const fq = src[q] + q * q;
		let s: number;
		do {
			const r = v[k];
			s = (fq - (src[r] + r * r)) / (2 * (q - r));
			// k === 0 check prevents going negative; z[0] = -Inf always breaks naturally,
			// but the explicit guard keeps the intent clear.
			if (k === 0 || s > z[k]) break;
			k--;
			// eslint-disable-next-line no-constant-condition
		} while (true);
		k++;
		v[k] = q;
		z[k] = s;
		z[k + 1] = Infinity;
	}

	k = 0;
	for (let q = 0; q < n; q++) {
		while (z[k + 1] < q) k++;
		const r = v[k];
		f[q] = (q - r) * (q - r) + src[r];
	}
}

interface DistanceField {
	data: Float32Array; // Euclidean distance in DT-grid units
	width: number;
	height: number;
	scaleX: number; // DT grid pixels per canvas pixel
	scaleY: number;
}

function buildDistanceField(
	strokes: Stroke[],
	canvasWidth: number,
	canvasHeight: number
): DistanceField {
	const width = GRID;
	const height = GRID;
	const scaleX = width / canvasWidth;
	const scaleY = height / canvasHeight;
	// Upper bound on squared distance — must exceed the max possible (width^2 + height^2).
	const INF = width * width + height * height + 1;

	const grid = new Float32Array(width * height).fill(INF);

	// Rasterize strokes: mark grid cells within INK_RADIUS of any stroke point.
	for (const stroke of strokes) {
		for (const { x, y } of stroke.points) {
			const px = Math.round(x * scaleX);
			const py = Math.round(y * scaleY);
			for (let dy = -INK_RADIUS; dy <= INK_RADIUS; dy++) {
				for (let dx = -INK_RADIUS; dx <= INK_RADIUS; dx++) {
					if (dx * dx + dy * dy <= INK_RADIUS * INK_RADIUS) {
						const ix = Math.max(0, Math.min(width - 1, px + dx));
						const iy = Math.max(0, Math.min(height - 1, py + dy));
						grid[iy * width + ix] = 0;
					}
				}
			}
		}
	}

	// Row pass: 1D DT along x for each row.
	const rowBuf = new Float32Array(width);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) rowBuf[x] = grid[y * width + x];
		sqdt1d(rowBuf);
		for (let x = 0; x < width; x++) grid[y * width + x] = rowBuf[x];
	}

	// Column pass: 1D DT along y for each column, then sqrt → Euclidean distance.
	const colBuf = new Float32Array(height);
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) colBuf[y] = grid[y * width + x];
		sqdt1d(colBuf);
		for (let y = 0; y < height; y++) grid[y * width + x] = Math.sqrt(colBuf[y]);
	}

	return { data: grid, width, height, scaleX, scaleY };
}

// ---------------------------------------------------------------------------
// Cost function
// ---------------------------------------------------------------------------

function evalCost(
	field: DistanceField,
	baseStrokes: Point[][],
	transform: PlacementTransform
): number {
	const { data, width, height, scaleX, scaleY } = field;
	const OOB = Math.sqrt(width * width + height * height); // penalty for out-of-bounds points

	const baked = bakePlacementToStrokes({
		id: '_opt',
		kind: 'sign',
		sourceId: '',
		baseStrokes,
		transform
	});

	let total = 0;
	let count = 0;
	for (const stroke of baked) {
		for (const { x, y } of stroke.points) {
			const xi = Math.round(x * scaleX);
			const yi = Math.round(y * scaleY);
			total += xi >= 0 && xi < width && yi >= 0 && yi < height ? data[yi * width + xi] : OOB;
			count++;
		}
	}
	return count > 0 ? total / count : Infinity;
}

// ---------------------------------------------------------------------------
// Nelder-Mead simplex optimizer
// ---------------------------------------------------------------------------

function nelderMead(
	f: (p: number[]) => number,
	x0: number[],
	step: number[],
	maxIter: number
): number[] {
	const n = x0.length;

	// Initial simplex: x0 plus one vertex perturbed along each axis.
	const s = Array.from({ length: n + 1 }, (_, i) => {
		const p = x0.slice();
		if (i > 0) p[i - 1] += step[i - 1];
		return p;
	});
	const scores = s.map(f);
	const ord = Array.from({ length: n + 1 }, (_, i) => i);

	for (let iter = 0; iter < maxIter; iter++) {
		ord.sort((a, b) => scores[a] - scores[b]);
		const best = ord[0];
		const worst = ord[n];
		const secondWorst = ord[n - 1];

		// Centroid of all vertices except the worst.
		const c = new Array<number>(n).fill(0);
		for (let i = 0; i < n; i++) {
			for (let d = 0; d < n; d++) c[d] += s[ord[i]][d] / n;
		}

		// Reflection.
		const r = c.map((ci, d) => 2 * ci - s[worst][d]);
		const rScore = f(r);

		if (rScore < scores[best]) {
			// Expansion.
			const e = c.map((ci, d) => 3 * ci - 2 * s[worst][d]);
			const eScore = f(e);
			s[worst] = eScore < rScore ? e : r;
			scores[worst] = eScore < rScore ? eScore : rScore;
		} else if (rScore < scores[secondWorst]) {
			s[worst] = r;
			scores[worst] = rScore;
		} else {
			// Contraction (outer if reflection improved, inner otherwise).
			const outer = rScore < scores[worst];
			const base = outer ? r : s[worst];
			const con = c.map((ci, d) => 0.5 * ci + 0.5 * base[d]);
			const cScore = f(con);
			if (cScore < (outer ? rScore : scores[worst])) {
				s[worst] = con;
				scores[worst] = cScore;
			} else {
				// Shrink: collapse all non-best vertices toward the best.
				for (let i = 1; i <= n; i++) {
					const p = s[ord[i]];
					for (let d = 0; d < n; d++) p[d] = 0.5 * (s[best][d] + p[d]);
					scores[ord[i]] = f(p);
				}
			}
		}
	}

	ord.sort((a, b) => scores[a] - scores[b]);
	return s[ord[0]];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Refine a placement transform so the symbol overlay aligns with the drawn strokes.
 * Builds an Euclidean distance field from the strokes, then minimizes the mean
 * distance from each baked symbol point to the nearest ink using Nelder-Mead.
 * Optimizes translation, scale, and rotation jointly.
 */
export function optimizePlacement({
	strokes,
	baseStrokes,
	initial,
	canvasWidth,
	canvasHeight
}: {
	strokes: Stroke[];
	baseStrokes: Point[][];
	initial: PlacementTransform;
	canvasWidth: number;
	canvasHeight: number;
}): PlacementTransform {
	const field = buildDistanceField(strokes, canvasWidth, canvasHeight);

	const scale = Math.sqrt(initial.scaleX * initial.scaleY);
	const stepSize = scale * 0.12;

	const x0 = [initial.cx, initial.cy, initial.scaleX, initial.scaleY, initial.rotationDeg];
	const step = [stepSize, stepSize, stepSize, stepSize, 15];

	const result = nelderMead(
		([cx, cy, sx, sy, rot]) =>
			evalCost(field, baseStrokes, {
				cx,
				cy,
				scaleX: Math.max(10, sx),
				scaleY: Math.max(10, sy),
				rotationDeg: rot
			}),
		x0,
		step,
		200
	);

	return {
		cx: result[0],
		cy: result[1],
		scaleX: Math.max(10, result[2]),
		scaleY: Math.max(10, result[3]),
		rotationDeg: result[4]
	};
}
