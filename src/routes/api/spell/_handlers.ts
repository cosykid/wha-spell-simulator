import { json } from '@sveltejs/kit';
import { compileSpell } from '$lib/compiler/spellBuilder.js';
import { classifyDrawing } from '$lib/parser/drawingClassifier.js';
import { directionFromTiltAngles, directionFromSurfaceVector } from '$lib/compiler/spellDirection.js';
import { calculateSpellQuality, calculateSpellStability } from '$lib/compiler/spellQuality.js';
import { buildSpellIR, valuesFromSpellIR, defaultControlValues } from '$lib/ui/spellEffectLab.js';
import { analyzeStrokes } from '$lib/ui/sigilDetector.js';
import { CONFIG } from '$lib/config.js';
import type { Dictionary, Stroke, GlyphAST } from '$lib/types.js';

import sigils from '$lib/dictionary/sigils.json';
import signs from '$lib/dictionary/signs.json';
import sampleSpells from '$lib/dictionary/sample-spells.json';

const dictionary: Dictionary = { sigils, signs, sampleSpells } as Dictionary;

const DEFAULT_CANVAS_W = 1200;

function parseStrokes(rawStrokes: unknown[], canvasW: number, aspectRatio: number): Stroke[] {
	const canvasH = canvasW / aspectRatio;
	if (Array.isArray(rawStrokes[0])) {
		return (rawStrokes as { x: number; y: number }[][]).map((points, i) => ({
			id: `s${i + 1}`,
			points: points.map((p) => ({ x: p.x * canvasW, y: p.y * canvasH }))
		}));
	}
	return rawStrokes as Stroke[];
}

function requireStrokes(body: Record<string, unknown>): Stroke[] | Response {
	const raw = body.strokes;
	if (!raw || !Array.isArray(raw)) {
		return json({ error: 'strokes array required' }, { status: 400 }) as unknown as Response;
	}
	const canvasW: number = (body.canvasWidth as number) ?? DEFAULT_CANVAS_W;
	const aspect: number = (body.sourceAspectRatio as number) ?? 1;
	return parseStrokes(raw, canvasW, aspect);
}

export async function handleSpell({ request }: { request: Request }) {
	try {
		const body: Record<string, unknown> = await request.json();
		const strokes = requireStrokes(body);
		if (strokes instanceof Response) return strokes;

		const pipeline = classifyDrawing({
			strokes,
			previousRing: (body.previousRing as never) ?? null,
			dictionary,
			config: CONFIG
		});

		const spellIR = compileSpell({ glyphAST: pipeline.glyphAST, config: CONFIG });
		return json({ spellIR, glyphAST: pipeline.glyphAST });
	} catch (err) {
		return json({ error: String(err) }, { status: 500 });
	}
}

export async function handleAnalyze({ request }: { request: Request }) {
	try {
		const body: Record<string, unknown> = await request.json();
		const strokes = requireStrokes(body);
		if (strokes instanceof Response) return strokes;

		const canvasW: number = (body.canvasWidth as number) ?? DEFAULT_CANVAS_W;
		const aspect: number = (body.sourceAspectRatio as number) ?? 1;
		const canvasH: number = (body.canvasHeight as number) ?? canvasW / aspect;
		const mode: string = (body.mode as string) ?? 'all';

		const result = analyzeStrokes({
			strokes,
			dictionary,
			mode,
			canvasWidth: canvasW,
			canvasHeight: canvasH,
			config: CONFIG
		});

		return json({ ...result, matches: result.matches.slice(0, 10) });
	} catch (err) {
		return json({ error: String(err) }, { status: 500 });
	}
}

export async function handleQuality({ request }: { request: Request }) {
	try {
		const body: Record<string, unknown> = await request.json();
		const glyphAST = body.glyphAST as GlyphAST | undefined;

		if (!glyphAST || typeof glyphAST !== 'object') {
			return json({ error: 'glyphAST object required' }, { status: 400 });
		}

		return json({
			quality: calculateSpellQuality(glyphAST),
			stability: calculateSpellStability(glyphAST, CONFIG)
		});
	} catch (err) {
		return json({ error: String(err) }, { status: 500 });
	}
}

export async function handleDirection({ request }: { request: Request }) {
	try {
		const body: Record<string, unknown> = await request.json();

		if (body.surfaceX !== undefined || body.surfaceY !== undefined) {
			const surfaceX = Number(body.surfaceX ?? 0);
			const surfaceY = Number(body.surfaceY ?? 0);
			const force = Number(body.force ?? 0);

			if (Number.isNaN(surfaceX) || Number.isNaN(surfaceY) || Number.isNaN(force)) {
				return json({ error: 'surfaceX, surfaceY, and force must be numbers' }, { status: 400 });
			}

			return json({
				direction: directionFromSurfaceVector({ x: surfaceX, y: surfaceY }, force),
				mode: 'surface'
			});
		}

		const xTiltDeg = Number(body.xTiltDeg ?? 0);
		const yTiltDeg = Number(body.yTiltDeg ?? 0);

		if (Number.isNaN(xTiltDeg) || Number.isNaN(yTiltDeg)) {
			return json({ error: 'xTiltDeg and yTiltDeg must be numbers' }, { status: 400 });
		}

		return json({
			direction: directionFromTiltAngles(xTiltDeg, yTiltDeg),
			mode: 'tilt'
		});
	} catch (err) {
		return json({ error: String(err) }, { status: 500 });
	}
}

export async function handleEffectLab({ request }: { request: Request }) {
	try {
		const body: Record<string, unknown> = await request.json();
		const values = { ...defaultControlValues(), ...((body.values as Record<string, number>) ?? {}) };
		const element = (body.element as string) ?? 'water';
		const activatedAt = (body.activatedAt as number | null) ?? null;

		const spellIR = buildSpellIR({ values, element: element as never, activatedAt, config: CONFIG });
		return json({ spellIR, values });
	} catch (err) {
		return json({ error: String(err) }, { status: 500 });
	}
}

export async function handleEffectLabFromIR({ request }: { request: Request }) {
	try {
		const body: Record<string, unknown> = await request.json();

		if (!body.spellIR || typeof body.spellIR !== 'object') {
			return json({ error: 'spellIR object required' }, { status: 400 });
		}

		const result = valuesFromSpellIR(body.spellIR, defaultControlValues());
		return json(result);
	} catch (err) {
		return json({ error: String(err) }, { status: 400 });
	}
}

export async function handleDictionary({ url }: { url: URL }) {
	try {
		const kind = url.searchParams.get('kind') ?? 'all';
		const id = url.searchParams.get('id')?.toLowerCase();
		const element = url.searchParams.get('element')?.toLowerCase();
		const q = url.searchParams.get('q')?.toLowerCase();

		function matchEntry(entry: { id?: string; name?: string; element?: string }): boolean {
			if (id && entry.id?.toLowerCase() !== id) return false;
			if (element && entry.element?.toLowerCase() !== element) return false;
			if (q && !entry.id?.toLowerCase().includes(q) && !entry.name?.toLowerCase().includes(q))
				return false;
			return true;
		}

		const filteredSigils = kind === 'all' || kind === 'sigils' ? dictionary.sigils.filter(matchEntry) : [];
		const filteredSigns = kind === 'all' || kind === 'signs' ? dictionary.signs.filter(matchEntry) : [];
		const filteredSamples = kind === 'all' || kind === 'samples' ? (dictionary.sampleSpells ?? []) : [];

		return json({
			sigils: filteredSigils,
			signs: filteredSigns,
			sampleSpells: filteredSamples,
			total: filteredSigils.length + filteredSigns.length + filteredSamples.length
		});
	} catch (err) {
		return json({ error: String(err) }, { status: 500 });
	}
}
