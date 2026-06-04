import { formatNumber } from '../utils/geometry.js';
import type { Stroke, ClassifiedDrawing, SpellIR } from '../types.js';

export interface DiagnosticState {
	rawStrokes: { strokeCount: number; pointCount: number; drawOrder: string[] };
	ring: unknown;
	classifications: unknown;
	candidates: unknown;
	recognitions: unknown;
	glyphAST: unknown;
	spellIR: unknown;
}

function roundForDisplay(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(roundForDisplay);
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, item]) => [
				key,
				roundForDisplay(item)
			])
		);
	}
	return formatNumber(value as number);
}

export function buildDiagnosticState({
	rawStrokes,
	pipeline,
	spellIR
}: {
	rawStrokes: Stroke[];
	pipeline: ClassifiedDrawing | null | undefined;
	spellIR: SpellIR | null | undefined;
}): DiagnosticState {
	return roundForDisplay({
		rawStrokes: {
			strokeCount: rawStrokes.length,
			pointCount: rawStrokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
			drawOrder: rawStrokes.map((stroke) => stroke.id)
		},
		ring: pipeline?.glyphAST?.ring ?? null,
		classifications: pipeline?.classifications ?? [],
		candidates: (pipeline?.candidates ?? []).map((candidate) => {
			const { strokes: _strokes, ...publicCandidate } = candidate;
			return publicCandidate;
		}),
		recognitions: pipeline?.recognitions ?? [],
		glyphAST: pipeline?.glyphAST ?? null,
		spellIR
	}) as DiagnosticState;
}
