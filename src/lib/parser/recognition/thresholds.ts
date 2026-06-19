import type { AppConfig, DictionaryEntry, SymbolCandidate } from '../../types.js';
import { RECOGNITION_AMBIGUITY_GAP } from './constants.js';
import type { EntryStrokeTemplate, RecognitionThresholds } from './types.js';
import { clamp } from '../../utils/geometry.js';

/** Scores how well a candidate's radial layer matches a dictionary entry. */
export function allowedLayerScore(entry: DictionaryEntry, candidate: SymbolCandidate): number {
	if (candidate.layer === 'any') {
		return 1;
	}
	if (!entry.allowedLayers?.length) {
		return 0.75;
	}
	if (entry.allowedLayers.includes(candidate.layer)) {
		return 1;
	}
	if (candidate.nearBoundary) {
		return 0.72;
	}
	return 0.34;
}

/** Smoothly maps a value into a preferred inclusive range. */
export function rangeScore(value: number, min: number, max: number): number {
	if (value < min) {
		return clamp(value / Math.max(0.001, min));
	}
	if (value > max) {
		return clamp(1 - (value - max) / Math.max(0.001, max));
	}
	return 1;
}

/** Returns the stroke template used to score a dictionary entry, when present. */
export function entryStrokeTemplate(entry: DictionaryEntry): EntryStrokeTemplate {
	return entry.strokeTemplate ?? null;
}

/** Applies parser recognition defaults around configurable recognition thresholds. */
export function recognitionThresholds(config: AppConfig): RecognitionThresholds {
	const recognition = config.recognition ?? {};
	return {
		minConfidence: recognition.minConfidence ?? 0.48,
		ambiguityGap: RECOGNITION_AMBIGUITY_GAP,
		contaminationThreshold: recognition.contaminationThreshold ?? 0.5,
		minTemplateCoverage: recognition.minTemplateCoverage ?? 0.55
	};
}
