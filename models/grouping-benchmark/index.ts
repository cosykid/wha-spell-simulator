/**
 * Stroke grouping benchmark. Composes spells from real hand-drawn glyph samples
 * and reports how often the parser recovers each glyph's stroke set exactly.
 *
 * Four scenarios, each `count` spells from a fixed seed so runs compare:
 * a lone center sigil, a sigil with one to three ring signs, a sign drawn as
 * close to the sigil as a careful hand would, and two signs side by side.
 *
 * Usage:
 *   npm run bench:grouping -- [count] [galleryPrefix]
 *
 * With a gallery prefix, each scenario writes `<prefix>-<scenario>.html` with
 * the first failures drawn, one colour per glyph and a box per candidate.
 *
 * Requires the labelled corpus at `.artifacts/glyph-training/labelled_samples_vector-all.jsonl`.
 */
import { writeFileSync } from 'node:fs';

import { CONFIG } from '../../src/lib/config.js';
import { classifyDrawing } from '../../src/lib/parser/classifier/index.js';
import type { ClassifiedDrawing } from '../../src/lib/types.js';
import { pathLength } from '../../src/lib/utils/geometry.js';
import { readRealDictionary } from '../../tests/dictionaryFixtures.js';
import {
	createSpellComposer,
	mulberry32,
	ringCenter,
	ringRadius,
	ringStrokes,
	SCENARIOS,
	type Placed,
	type Scenario
} from './spells.js';

const SEED = 7;
const dictionary = readRealDictionary();
const composeSpell = createSpellComposer(dictionary);

interface Shown {
	scenario: Scenario;
	glyphs: Placed[];
	result: ClassifiedDrawing;
	note: string;
}

interface Outcome {
	exact: number;
	total: number;
	overMerged: number;
	split: number;
	timeMs: number[];
	failures: Shown[];
	byLabel: Map<string, { exact: number; total: number }>;
}

function evaluate(scenario: Scenario, count: number): Outcome {
	const rng = mulberry32(SEED);
	const out: Outcome = {
		exact: 0,
		total: 0,
		overMerged: 0,
		split: 0,
		timeMs: [],
		failures: [],
		byLabel: new Map()
	};
	for (let index = 0; index < count; index += 1) {
		const glyphs = composeSpell(rng, scenario, index);
		const strokes = [...ringStrokes(), ...glyphs.flatMap((glyph) => glyph.strokes)];
		const started = performance.now();
		const result = classifyDrawing({ strokes, previousRing: null, dictionary, config: CONFIG });
		out.timeMs.push(performance.now() - started);
		if (!result.ring.complete) {
			out.failures.push({ scenario, glyphs, result, note: 'ring not complete' });
			continue;
		}
		const kept = new Set(
			strokes.filter((s) => pathLength(s.points) >= CONFIG.input.minStrokeLength).map((s) => s.id)
		);
		const candidates = result.candidates.map((candidate) => new Set(candidate.strokeIds));
		const notes: string[] = [];
		for (const glyph of glyphs) {
			const expected = new Set(glyph.strokes.map((s) => s.id).filter((id) => kept.has(id)));
			if (!expected.size) {
				continue;
			}
			const stat = out.byLabel.get(glyph.label) ?? { exact: 0, total: 0 };
			out.byLabel.set(glyph.label, stat);
			out.total += 1;
			stat.total += 1;
			const touching = candidates.filter((set) => [...expected].some((id) => set.has(id)));
			const merged = touching.some((set) => [...set].some((id) => !expected.has(id)));
			if (touching.length === 1 && !merged) {
				out.exact += 1;
				stat.exact += 1;
				continue;
			}
			if (merged) {
				out.overMerged += 1;
			}
			if (touching.length > 1) {
				out.split += 1;
			}
			notes.push(`${glyph.label}: ${merged ? 'over-merged' : `split into ${touching.length}`}`);
		}
		if (notes.length) {
			out.failures.push({ scenario, glyphs, result, note: notes.join('; ') });
		}
	}
	return out;
}

function svgFor(shown: Shown): string {
	const colours = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085'];
	const ink = shown.glyphs.flatMap((glyph, index) =>
		glyph.strokes.map(
			(stroke) =>
				`<polyline fill="none" stroke="${colours[index % colours.length]}" stroke-width="3" points="${stroke.points.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ')}"/>`
		)
	);
	const boxes = shown.result.candidates.map((candidate, index) => {
		const recognition = shown.result.recognitions[index];
		const label = recognition?.recognized
			? recognition.id
			: `?${recognition?.diagnostics?.bestGuess?.id ?? ''}`;
		const { minX, minY, width, height } = candidate.bounds;
		return `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="none" stroke="#000" stroke-dasharray="4 3"/><text x="${minX}" y="${minY - 3}" font-size="14" font-family="sans-serif">${label}</text>`;
	});
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="500" height="500" style="border:1px solid #ccc;margin:4px">${ink.join('')}${boxes.join('')}<circle cx="${ringCenter.x}" cy="${ringCenter.y}" r="${ringRadius}" fill="none" stroke="#999"/><text x="10" y="990" font-size="16" font-family="sans-serif">${shown.scenario}: ${shown.note}</text></svg>`;
}

function percent(part: number, whole: number): string {
	return `${((part / Math.max(1, whole)) * 100).toFixed(1)}%`;
}

const count = Number(process.argv[2] ?? 100);
const galleryPrefix = process.argv[3];
for (const scenario of SCENARIOS) {
	const outcome = evaluate(scenario, count);
	const times = [...outcome.timeMs].sort((a, b) => a - b);
	const at = (share: number) =>
		times[Math.min(times.length - 1, Math.floor(times.length * share))].toFixed(0);
	console.log(
		`${scenario.padEnd(12)} glyphs=${outcome.total} exact=${percent(outcome.exact, outcome.total)} overMerged=${outcome.overMerged} split=${outcome.split} | ms med=${at(0.5)} p90=${at(0.9)} max=${at(1)}`
	);
	console.log(
		'   ' +
			[...outcome.byLabel.entries()]
				.sort()
				.map(([label, stat]) => `${label} ${stat.exact}/${stat.total}`)
				.join('  ')
	);
	if (galleryPrefix) {
		writeFileSync(
			`${galleryPrefix}-${scenario}.html`,
			`<html><body style="font-family:sans-serif;margin:0">${outcome.failures.slice(0, 12).map(svgFor).join('')}</body></html>`
		);
	}
}
