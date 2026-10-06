/**
 * @file Who keeps company with whom among one paint's deposits: for each
 * candidate, how many candidates stand inside the cohesion radius (itself
 * included) and the sum of where they stand. The skin turns that into a pull
 * toward the centroid and a weight that grows with company, so gaps close
 * into one surface while stragglers thin and melt.
 *
 * A held ball puts nearly every deposit inside every other's radius, which
 * makes this the skin's heaviest loop, so it does each pair's work once.
 * Candidates are counting-sorted into radius-wide cells, which lays a row of
 * cells end to end, and each candidate measures itself only against the
 * neighbours after it in that order, crediting both sides of every pair it
 * finds close. Both sides would have measured the same distance, because
 * `a - b` is exactly `-(b - a)` in floating point.
 *
 * Neither the split nor the order can change a sum. Every coordinate is a
 * float32 in [0, 1], and a double holds any sum of fewer than 2048 of them
 * exactly. (Exactness needs coordinates at least 2^-19 from the grid wall, a
 * margin the wall fade has already emptied of deposits.)
 *
 * @example
 * const cohesion = new Cohesion(TRACER_BUDGET, VOLUME.cohesionR / SPAN);
 * cohesion.gather(candidates, count);
 * const centroidX = cohesion.sum[j * 3] / cohesion.company[j];
 */

/**
 * The rows of cells after a candidate's own, as (dz, dy) offsets. Its own row
 * is walked from the candidate onward, and every row before it is some other
 * candidate's row after.
 */
const ROWS_AFTER = [
	[0, 1],
	[1, -1],
	[1, 0],
	[1, 1]
] as const;

export class Cohesion {
	/** How many candidates stand inside each one's radius, itself included. */
	readonly company: Int32Array;
	/** Where they stand, summed: three per candidate, in grid-normalized units. */
	readonly sum: Float64Array;
	readonly #radius: number;
	/** Cells per axis, each at least one radius wide. */
	readonly #cells: number;
	/** Where each cell's run begins in sorted order. One past the last cell ends it. */
	readonly #start: Int32Array;
	readonly #cursor: Int32Array;
	readonly #cellOf: Int32Array;
	/** The rest are indexed in sorted order: which candidate, where, and its tally. */
	readonly #candidate: Int32Array;
	readonly #xs: Float32Array;
	readonly #ys: Float32Array;
	readonly #zs: Float32Array;
	readonly #tally: Int32Array;
	readonly #sumX: Float64Array;
	readonly #sumY: Float64Array;
	readonly #sumZ: Float64Array;

	constructor(capacity: number, radius: number) {
		this.#radius = radius;
		this.#cells = Math.max(1, Math.floor(1 / radius));
		const cells = this.#cells ** 3;
		this.#start = new Int32Array(cells + 1);
		this.#cursor = new Int32Array(cells);
		this.company = new Int32Array(capacity);
		this.sum = new Float64Array(capacity * 3);
		this.#cellOf = new Int32Array(capacity);
		this.#candidate = new Int32Array(capacity);
		this.#xs = new Float32Array(capacity);
		this.#ys = new Float32Array(capacity);
		this.#zs = new Float32Array(capacity);
		this.#tally = new Int32Array(capacity);
		this.#sumX = new Float64Array(capacity);
		this.#sumY = new Float64Array(capacity);
		this.#sumZ = new Float64Array(capacity);
	}

	/** Fills `company` and `sum` for the first `count` candidates of `pos`. */
	gather(pos: Float32Array, count: number): void {
		this.#sort(pos, count);
		const g = this.#cells;
		const r2 = this.#radius * this.#radius;
		const start = this.#start;
		const xs = this.#xs;
		const ys = this.#ys;
		const zs = this.#zs;
		const tally = this.#tally;
		const sumX = this.#sumX;
		const sumY = this.#sumY;
		const sumZ = this.#sumZ;
		for (let a = 0; a < count; a += 1) {
			// Every candidate is its own company.
			tally[a] = 1;
			sumX[a] = xs[a];
			sumY[a] = ys[a];
			sumZ[a] = zs[a];
		}
		for (let a = 0; a < count; a += 1) {
			const x = xs[a];
			const y = ys[a];
			const z = zs[a];
			const cx = this.#cell(x);
			const cy = this.#cell(y);
			const cz = this.#cell(z);
			const x0 = Math.max(0, cx - 1);
			const x1 = Math.min(g - 1, cx + 1);
			let k = 0;
			let mx = 0;
			let my = 0;
			let mz = 0;
			for (let r = -1; r < ROWS_AFTER.length; r += 1) {
				const zc = r < 0 ? cz : cz + ROWS_AFTER[r][0];
				const yc = r < 0 ? cy : cy + ROWS_AFTER[r][1];
				if (zc >= g || yc < 0 || yc >= g) continue;
				const row = (zc * g + yc) * g;
				const to = start[row + x1 + 1];
				for (let b = r < 0 ? a + 1 : start[row + x0]; b < to; b += 1) {
					const ex = xs[b] - x;
					const ey = ys[b] - y;
					const ez = zs[b] - z;
					if (ex * ex + ey * ey + ez * ez > r2) continue;
					k += 1;
					mx += xs[b];
					my += ys[b];
					mz += zs[b];
					tally[b] += 1;
					sumX[b] += x;
					sumY[b] += y;
					sumZ[b] += z;
				}
			}
			tally[a] += k;
			sumX[a] += mx;
			sumY[a] += my;
			sumZ[a] += mz;
		}
		for (let p = 0; p < count; p += 1) {
			const j = this.#candidate[p];
			this.company[j] = tally[p];
			this.sum[j * 3] = sumX[p];
			this.sum[j * 3 + 1] = sumY[p];
			this.sum[j * 3 + 2] = sumZ[p];
		}
	}

	#cell(v: number): number {
		return Math.min(this.#cells - 1, (v * this.#cells) | 0);
	}

	/** Counting sort: every candidate copied into its cell's run. */
	#sort(pos: Float32Array, count: number): void {
		const g = this.#cells;
		const start = this.#start;
		const cursor = this.#cursor;
		const cellOf = this.#cellOf;
		start.fill(0);
		for (let j = 0; j < count; j += 1) {
			const c =
				(this.#cell(pos[j * 3 + 2]) * g + this.#cell(pos[j * 3 + 1])) * g + this.#cell(pos[j * 3]);
			cellOf[j] = c;
			start[c + 1] += 1;
		}
		for (let c = 1; c < start.length; c += 1) start[c] += start[c - 1];
		cursor.set(start.subarray(0, cursor.length));
		for (let j = 0; j < count; j += 1) {
			const p = cursor[cellOf[j]]++;
			this.#candidate[p] = j;
			this.#xs[p] = pos[j * 3];
			this.#ys[p] = pos[j * 3 + 1];
			this.#zs[p] = pos[j * 3 + 2];
		}
	}
}
