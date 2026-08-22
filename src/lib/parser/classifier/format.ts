import { formatNumber } from '../../utils/geometry.js';
import type { Recognition, SymbolCandidate } from '../../types.js';

/** Rounds numeric parser diagnostics so snapshots and debug output stay readable. */
export function roundedDeep(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(roundedDeep);
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundedDeep(item)]));
	}
	return formatNumber(value);
}

/** Applies parser numeric rounding while preserving the caller's structural type. */
export function roundedValue<T>(value: T): T {
	return roundedDeep(value) as T;
}

/** Drops raw stroke geometry before candidates are embedded in the glyph AST. */
export function stripCandidate(candidate: SymbolCandidate) {
	const { strokes: _strokes, ...publicCandidate } = candidate;
	return publicCandidate;
}

/**
 * Removes heavy diagnostics from public AST recognition entries. The compact
 * ML verdict stays: the reading's facing only trusts rotationOffsetDeg
 * when the ML pose head accepted the sign, so dropping it would silently
 * reset every sign to canon inward facing.
 */
export function stripRecognitionDiagnostics(recognition: Recognition | null) {
	if (!recognition) {
		return null;
	}
	const { diagnostics, ...publicRecognition } = recognition;
	if (diagnostics?.ml) {
		return {
			...publicRecognition,
			diagnostics: {
				recognitionRotationDeg: diagnostics.recognitionRotationDeg,
				template: {},
				structure: {},
				topMatches: [],
				ml: diagnostics.ml
			}
		};
	}
	return publicRecognition;
}
