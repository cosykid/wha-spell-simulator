/**
 * @file Composes benchmark spells: real samples placed on a ring the way a
 * careful hand would place them.
 */
import type { Dictionary, Point, Stroke } from '../../src/lib/types.js';
import {
	angleDegFromCenter,
	boundsForStrokes,
	degreesToRadians
} from '../../src/lib/utils/geometry.js';
import { loadCorpus, rotate } from './corpus.js';

export const SCENARIOS = ['sigil-only', 'sigil+signs', 'tight-sign', 'two-signs'] as const;
export type Scenario = (typeof SCENARIOS)[number];
export type Rng = () => number;

export interface Placed {
	label: string;
	strokes: Stroke[];
}

export const ringCenter = { x: 500, y: 500 };
export const ringRadius = 380;

export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(rng: Rng, list: T[]): T {
	return list[Math.floor(rng() * list.length)];
}

function arcStroke(id: string, startDeg: number, endDeg: number, steps: number): Stroke {
	const points: Point[] = [];
	for (let i = 0; i <= steps; i += 1) {
		const r = degreesToRadians(startDeg + (endDeg - startDeg) * (i / steps));
		points.push({
			x: ringCenter.x + Math.cos(r) * ringRadius,
			y: ringCenter.y + Math.sin(r) * ringRadius
		});
	}
	return { id, points };
}

export function ringStrokes(): Stroke[] {
	return [arcStroke('ring-open', 25, 335, 220), arcStroke('ring-close', 335, 385, 40)];
}

function signCenterAt(angleDeg: number, radiusNorm: number): Point {
	const r = degreesToRadians(angleDeg);
	// Ring angles are math convention with y up, so flip y back to canvas.
	return {
		x: ringCenter.x + Math.cos(r) * ringRadius * radiusNorm,
		y: ringCenter.y - Math.sin(r) * ringRadius * radiusNorm
	};
}

function boundsGap(a: Stroke[], b: Stroke[]): number {
	const ba = boundsForStrokes(a);
	const bb = boundsForStrokes(b);
	const dx = Math.max(0, ba.minX - bb.maxX, bb.minX - ba.maxX);
	const dy = Math.max(0, ba.minY - bb.maxY, bb.minY - ba.maxY);
	return Math.hypot(dx, dy);
}

/** Walks `place` outward until the new glyph clears `first` by `gap`, never overlapping. */
function placedClearOf(first: Placed, gap: number, place: (step: number) => Placed): Placed | null {
	for (let step = 0; step <= 90; step += 1) {
		const next = place(step);
		if (boundsGap(first.strokes, next.strokes) >= gap) {
			return next;
		}
	}
	return null;
}

/** A composer over the corpus samples that the dictionary knows. */
export function createSpellComposer(dictionary: Dictionary) {
	const corpus = loadCorpus(dictionary);
	const referenceSize = new Map(
		[...dictionary.sigils, ...dictionary.signs].map((entry) => [
			entry.id,
			entry.referenceSizeNorm ?? 0.3
		])
	);
	const sigilLabels = dictionary.sigils.map((entry) => entry.id).filter((id) => corpus.has(id));
	const signLabels = dictionary.signs.map((entry) => entry.id).filter((id) => corpus.has(id));

	/** Places a random sample of `label` at a regular size, signs facing the ring center. */
	const glyphAt = (rng: Rng, label: string, center: Point, prefix: string): Placed => {
		const sample = pick(rng, corpus.get(label)!);
		const size = referenceSize.get(label)! * ringRadius * 2 * (0.8 + rng() * 0.5);
		const rotationDeg =
			sample.kind === 'sign' ? 270 - angleDegFromCenter(center, ringCenter) : (rng() - 0.5) * 20;
		const radians = degreesToRadians(rotationDeg);
		const strokes = sample.strokes.map((stroke, index) => ({
			id: `${prefix}-${index + 1}`,
			points: stroke.map((p) =>
				rotate({ x: center.x + p.x * size, y: center.y + p.y * size }, center, radians)
			)
		}));
		return { label, strokes };
	};

	return (rng: Rng, scenario: Scenario, index: number): Placed[] => {
		const prefix = (slot: number) => `g${index}-${slot}`;
		if (scenario === 'sigil-only') {
			return [glyphAt(rng, sigilLabels[index % sigilLabels.length], ringCenter, prefix(0))];
		}
		if (scenario === 'sigil+signs') {
			const glyphs = [glyphAt(rng, pick(rng, sigilLabels), ringCenter, prefix(0))];
			const count = 1 + Math.floor(rng() * 3);
			const base = rng() * 360;
			for (let slot = 1; slot <= count; slot += 1) {
				const angle = base + (slot * 360) / count + (rng() - 0.5) * 30;
				// Draw order matters: the label before the radius keeps the spells of
				// earlier runs, so results stay comparable across versions.
				const label = pick(rng, signLabels);
				const center = signCenterAt(angle, 0.6 + rng() * 0.2);
				glyphs.push(glyphAt(rng, label, center, prefix(slot)));
			}
			return glyphs;
		}
		// A careful hand leaves a clear gap of 2% to 15% of the ring radius.
		const gap = ringRadius * (0.02 + rng() * 0.13);
		const label = pick(rng, signLabels);
		const sampleSeed = Math.floor(rng() * 1e9);
		if (scenario === 'tight-sign') {
			const sigil = glyphAt(rng, sigilLabels[index % sigilLabels.length], ringCenter, prefix(0));
			const angle = rng() * 360;
			const sign = placedClearOf(sigil, gap, (step) =>
				glyphAt(mulberry32(sampleSeed), label, signCenterAt(angle, 0.3 + step * 0.01), prefix(1))
			);
			return sign ? [sigil, sign] : [sigil];
		}
		const base = rng() * 360;
		const first = glyphAt(
			rng,
			signLabels[index % signLabels.length],
			signCenterAt(base, 0.68),
			prefix(0)
		);
		const second = placedClearOf(first, gap, (step) =>
			glyphAt(mulberry32(sampleSeed), label, signCenterAt(base + 5 + step, 0.68), prefix(1))
		);
		return second ? [first, second] : [first];
	};
}
