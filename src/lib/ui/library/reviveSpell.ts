/**
 * @file Revives a legacy library row for the stage engine. Rows saved before
 * the Reading and Plan layers landed carry neither, and the stage replay fell
 * back to R-11's inert plan — a gray puff for every pre-redesign spell,
 * whatever its ink says. The stored drawing is still whole, so the replay
 * re-reads it through the same classifier the simulator runs (the template
 * pass, then the ML refinement that reads rotated signs) and resolves the
 * plan under current canon. A modern row passes through untouched.
 *
 * One classification runs at a time: the classifier client supersedes
 * concurrent requests by design, because it serves one live drawing. A wall
 * of cards queues here instead, and each drawing derives once, cached by the
 * IR's own content signature.
 */
import { CONFIG } from '../../config.js';
import { loadDictionary } from '../../dictionary/dictionaryLoader.js';
import { bakePlacementToStrokes } from '../../input/shapeBaker.js';
import { classifyDrawingOffThread } from '../../parser/drawingClassifierClient.js';
import { readSeal } from '../../compiler/reading/readSeal.js';
import { resolvePlan } from '../../compiler/plan/resolvePlan.js';
import { deserializeSpellPreset, type SpellPresetData } from '../../structures/spellPreset.js';
import type { ClassifiedDrawing, SpellIR } from '../../types.js';

/** Canvas size the stored drawing is re-read at. Any fixed size works; the
 * parser normalizes ring-relative, so this only sets stroke resolution. */
const READ_SIZE = 1024;

/** How long to wait for the ML refinement before settling for the template
 * pass. The first inference pays the runtime load; later spells are fast. */
const ML_WAIT_MS = 6000;

const revived = new Map<string, Promise<SpellIR>>();

/** The one-at-a-time gate in front of the classifier client. */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
	const next = queue.then(job, job);
	queue = next.catch(() => undefined);
	return next;
}

/** The classifier's settled result: the ML refinement, or the template pass
 * if no refinement arrives inside the window. */
async function classifySettled(data: SpellPresetData): Promise<ClassifiedDrawing> {
	const drawing = deserializeSpellPreset(data, READ_SIZE);
	const strokes = [
		...drawing.strokes,
		...drawing.placements.flatMap((placement) => bakePlacementToStrokes(placement))
	];
	const dictionary = await loadDictionary();
	let settle: (result: ClassifiedDrawing) => void;
	const refined = new Promise<ClassifiedDrawing>((resolve) => {
		settle = resolve;
	});
	const template = await classifyDrawingOffThread(
		{
			strokes,
			previousRing: null,
			canvasWidth: READ_SIZE,
			canvasHeight: READ_SIZE,
			guideReferenceSize: READ_SIZE,
			dictionary,
			config: CONFIG
		},
		(mlResult) => settle(mlResult)
	);
	const timeout = new Promise<ClassifiedDrawing>((resolve) => {
		setTimeout(() => resolve(template), ML_WAIT_MS);
	});
	return Promise.race([refined, timeout]);
}

/**
 * The stored IR with a reading and plan the stage engine can perform. Modern
 * rows return as they are; a failed re-read returns the stored row too, which
 * replays inert exactly as it did before this existed.
 */
export function reviveSpellIr(data: SpellPresetData, stored: SpellIR): Promise<SpellIR> {
	if (stored.reading && stored.plan) {
		return Promise.resolve(stored);
	}
	const key = stored.signature;
	const cached = revived.get(key);
	if (cached) {
		return cached;
	}
	const job = enqueue(async () => {
		const classified = await classifySettled(data);
		const reading = readSeal(classified.glyphAST);
		const plan = resolvePlan(reading);
		return {
			...stored,
			reading,
			plan,
			sigil: reading.sigil ?? stored.sigil,
			element: reading.element ?? stored.element
		};
	}).catch((error) => {
		console.error('spell revival failed, replaying stored row', error);
		return stored;
	});
	revived.set(key, job);
	return job;
}
