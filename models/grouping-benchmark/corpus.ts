/**
 * @file The labelled hand-drawn corpus, canonicalized for placement.
 *
 * Requires `.artifacts/glyph-training/labelled_samples_vector-all.jsonl`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Dictionary, Point } from '../../src/lib/types.js';
import { boundsForStrokes } from '../../src/lib/utils/geometry.js';

const CORPUS = fileURLToPath(
	new URL('../../.artifacts/glyph-training/labelled_samples_vector-all.jsonl', import.meta.url)
);

export interface Sample {
	label: string;
	kind: 'sigil' | 'sign';
	/** Template pose, bbox centred on the origin, longest side 1. */
	strokes: Point[][];
}

export function rotate(point: Point, center: Point, radians: number): Point {
	const x = point.x - center.x;
	const y = point.y - center.y;
	return {
		x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
		y: center.y + x * Math.sin(radians) + y * Math.cos(radians)
	};
}

/** Undoes the labelled pose so every sample sits in its template pose. */
function canonical(strokes: Point[][], angleRad: number): Point[][] {
	const rotated = strokes.map((stroke) =>
		stroke.map((p) => rotate(p, { x: 0.5, y: 0.5 }, -angleRad))
	);
	const { minX, maxX, minY, maxY } = boundsForStrokes(rotated.map((points) => ({ points })));
	const size = Math.max(maxX - minX, maxY - minY, 1e-6);
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return rotated.map((stroke) =>
		stroke.map((p) => ({ x: (p.x - cx) / size, y: (p.y - cy) / size }))
	);
}

/** Samples by label, skipping those the labeller rotated far from template pose. */
export function loadCorpus(dictionary: Dictionary, maxAngleRad = 0.35): Map<string, Sample[]> {
	const kinds = new Map<string, Sample['kind']>();
	dictionary.sigils.forEach((entry) => kinds.set(entry.id, 'sigil'));
	dictionary.signs.forEach((entry) => kinds.set(entry.id, 'sign'));
	const byLabel = new Map<string, Sample[]>();
	for (const line of readFileSync(CORPUS, 'utf8').trim().split('\n')) {
		const raw = JSON.parse(line) as { sign: string; data: Point[][]; pose: { angle: number } };
		const kind = kinds.get(raw.sign);
		if (!kind || Math.abs(raw.pose.angle) > maxAngleRad) {
			continue;
		}
		const list = byLabel.get(raw.sign) ?? [];
		list.push({ label: raw.sign, kind, strokes: canonical(raw.data, raw.pose.angle) });
		byLabel.set(raw.sign, list);
	}
	return byLabel;
}
