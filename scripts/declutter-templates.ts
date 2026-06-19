#!/usr/bin/env node
/**
 * Reduce a sigil's strokeTemplate from a noisy digitizer capture down to the
 * handful of strokes a person would actually draw, without changing the inked
 * shape the recognizer sees.
 *
 * Two operations, in order:
 *   1. Stitch fragments. Digitizer captures shatter a single pen stroke into
 *      many short pieces whose endpoints nearly touch (e.g. earth's lower-right
 *      diagonal). Greedily join such pieces back into one polyline. Only joins
 *      when at least one side is short, so two substantial strokes are never
 *      fused into each other.
 *   2. Drop redundant micro-strokes. Stray dots and stubs left over after
 *      stitching (path length below the recognizer's own simplified-example
 *      threshold) are removed when every one of their points already lies on a
 *      retained stroke. A sub-threshold stroke that is NOT covered is a real
 *      isolated mark and is kept (and reported).
 *
 * The result is verified to preserve the shape: the cleaned strokes are scored
 * against the original with the real ink matcher and the chamfer (inked-shape)
 * distance must stay within SHAPE_DRIFT_TOLERANCE. Point-cloud drift is reported
 * for information only -- it rises by design, because the noisy original spent
 * one point-cloud sample on every stray dot and removing them redistributes the
 * fixed budget along the real strokes (closer to how a person draws), not
 * because the shape changed.
 *
 * Usage:
 *   node --import tsx scripts/declutter-templates.ts [files...]   # dry run
 *   node --import tsx scripts/declutter-templates.ts --write [files...]
 *
 * With no files, processes the five elemental sigils named by the simulator.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { distance, pathLength } from '../src/lib/utils/geometry.js';
import { SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH } from '../src/lib/parser/shape-matcher/constants.js';
import {
	normalizeStrokesForShape,
	pointCloudDistance
} from '../src/lib/parser/shape-matcher/normalization.js';
import { renderNormalizedInk, scoreChamferDistance } from '../src/lib/parser/shape-matcher/ink.js';
import type { Point } from '../src/lib/types.js';

const DEFAULT_FILES = ['01-fire', '02-water', '03-wind-directs-air', '04-earth', '05-light'].map(
	(id) => `src/lib/dictionary/sigils/${id}.json`
);

/** Max endpoint gap (in template units) treated as a continuation to stitch. */
const STITCH_GAP = 0.02;
/** Only stitch when one side has at most this many points (never fuse two long strokes). */
const STITCH_SHORT_MAX = 16;
/** A sub-threshold stroke is redundant when every point is within this of a kept stroke. */
const COVER_DISTANCE = 0.03;
/** Chamfer (inked-shape) drift allowed between the original and cleaned shape. */
const SHAPE_DRIFT_TOLERANCE = 0.02;

type Stroke = Point[];

function dropRepeatedPoints(stroke: Stroke): Stroke {
	const out: Stroke = [];
	for (const point of stroke) {
		const last = out[out.length - 1];
		if (!last || distance(last, point) > 1e-6) {
			out.push({ x: point.x, y: point.y });
		}
	}
	return out;
}

function reversed(stroke: Stroke): Stroke {
	return [...stroke].reverse();
}

/**
 * Greedily concatenate strokes whose endpoints nearly meet. Each pass joins the
 * single closest eligible pair, so chains reconstruct one continuation at a time.
 */
function stitchFragments(strokes: Stroke[]): Stroke[] {
	const chains = strokes.map((stroke) => stroke.slice());

	for (;;) {
		let best: { i: number; j: number; gap: number; merged: Stroke } | null = null;

		for (let i = 0; i < chains.length; i += 1) {
			for (let j = i + 1; j < chains.length; j += 1) {
				const a = chains[i];
				const b = chains[j];
				if (a.length > STITCH_SHORT_MAX && b.length > STITCH_SHORT_MAX) {
					continue;
				}

				// Four ways two polylines can meet end-to-end; pick the smallest gap.
				const ends: Array<{ gap: number; merged: Stroke }> = [
					{ gap: distance(a[a.length - 1], b[0]), merged: [...a, ...b.slice(1)] },
					{
						gap: distance(a[a.length - 1], b[b.length - 1]),
						merged: [...a, ...reversed(b).slice(1)]
					},
					{ gap: distance(a[0], b[0]), merged: [...reversed(a), ...b.slice(1)] },
					{ gap: distance(a[0], b[b.length - 1]), merged: [...b, ...a.slice(1)] }
				];
				const local = ends.reduce((min, option) => (option.gap < min.gap ? option : min));
				if (local.gap <= STITCH_GAP && (!best || local.gap < best.gap)) {
					best = { i, j, gap: local.gap, merged: local.merged };
				}
			}
		}

		if (!best) {
			break;
		}
		chains[best.i] = best.merged;
		chains.splice(best.j, 1);
	}

	return chains;
}

function minDistanceToStroke(point: Point, stroke: Stroke): number {
	let best = Infinity;
	for (let index = 1; index < stroke.length; index += 1) {
		best = Math.min(best, pointToSegment(point, stroke[index - 1], stroke[index]));
	}
	if (stroke.length === 1) {
		best = distance(point, stroke[0]);
	}
	return best;
}

function pointToSegment(point: Point, start: Point, end: Point): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq < 1e-12) {
		return distance(point, start);
	}
	const t = Math.max(
		0,
		Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq)
	);
	return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function isCoveredBy(stroke: Stroke, others: Stroke[]): boolean {
	return stroke.every((point) =>
		others.some((other) => minDistanceToStroke(point, other) <= COVER_DISTANCE)
	);
}

interface CleanResult {
	strokes: Stroke[];
	kept: number;
	dropped: number;
	uncoveredKept: number;
}

function declutter(strokes: Stroke[]): CleanResult {
	const stitched = stitchFragments(strokes.map(dropRepeatedPoints)).filter((s) => s.length > 0);

	const substantial = stitched.filter(
		(s) => pathLength(s) >= SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH
	);
	const micro = stitched.filter((s) => pathLength(s) < SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH);

	const result: Stroke[] = [...substantial];
	let dropped = 0;
	let uncoveredKept = 0;
	for (const stroke of micro) {
		if (isCoveredBy(stroke, substantial)) {
			dropped += 1;
		} else {
			result.push(stroke);
			uncoveredKept += 1;
		}
	}

	return { strokes: result, kept: result.length, dropped, uncoveredKept };
}

function shapeDrift(
	original: Stroke[],
	cleaned: Stroke[]
): { pointCloud: number; chamfer: number } {
	const a = normalizeStrokesForShape(original);
	const b = normalizeStrokesForShape(cleaned);
	const chamfer = scoreChamferDistance(
		renderNormalizedInk(a.strokes),
		renderNormalizedInk(b.strokes)
	);
	return {
		pointCloud: pointCloudDistance(a.pointCloud, b.pointCloud),
		chamfer: chamfer.chamferDistance
	};
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const write = args.includes('--write');
	const files = args.filter((arg) => arg !== '--write');
	const targets = (files.length ? files : DEFAULT_FILES).map((file) => resolve(file));

	let failures = 0;
	for (const file of targets) {
		const json = JSON.parse(await readFile(file, 'utf8'));
		const original: Stroke[] = json.strokeTemplate.strokes;
		const { strokes, kept, dropped, uncoveredKept } = declutter(original);
		const drift = shapeDrift(original, strokes);

		const ok = drift.chamfer <= SHAPE_DRIFT_TOLERANCE;
		const name = file.split('/').pop();
		console.log(
			`${name}: ${original.length} -> ${kept} strokes ` +
				`(dropped ${dropped} redundant, kept ${uncoveredKept} small) | ` +
				`drift pc=${drift.pointCloud.toFixed(4)} chamfer=${drift.chamfer.toFixed(4)} ${ok ? 'OK' : 'DRIFT!'}`
		);
		if (!ok) {
			failures += 1;
			continue;
		}

		if (write) {
			json.strokeTemplate.strokes = strokes;
			await writeFile(file, `${JSON.stringify(json, null, '\t')}\n`);
		}
	}

	if (failures) {
		console.error(`\n${failures} file(s) exceeded shape drift tolerance; not written.`);
		process.exit(1);
	}
	if (!write) {
		console.log('\nDry run. Re-run with --write to apply.');
	}
}

main();
