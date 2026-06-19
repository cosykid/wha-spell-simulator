import { GLYPH_WARNINGS } from '../glyphWarnings.js';
import type { AppConfig, ClassifiedDrawing, GlyphAST, Recognition } from '../../types.js';
import {
	roundedDeep,
	roundedValue,
	stripCandidate,
	stripRecognitionDiagnostics
} from './format.js';
import {
	calculateGlobalMetrics,
	recognizedSigils,
	selectPrimarySigil,
	summarizeUnknowns,
	warningList
} from './metrics.js';
import type { NoRingRecognitionPrep, PreparedRecognition, RecognitionPrep } from './types.js';

/** Builds the final classified drawing from already-scored recognitions. */
export function assembleDrawing(
	prep: RecognitionPrep,
	recognitions: Recognition[],
	config: AppConfig
): ClassifiedDrawing {
	const { cleanedStrokes, ring, classifications, candidates } = prep;
	const sigils = recognizedSigils(recognitions);
	const primarySigil = selectPrimarySigil(sigils);
	const unsupportedMultipleSigils = sigils
		.filter((recognition) => recognition.candidateId !== primarySigil?.candidateId)
		.map(stripRecognitionDiagnostics);
	const signs = recognitions
		.filter((recognition) => recognition.recognized && recognition.kind === 'sign')
		.map(stripRecognitionDiagnostics);
	const unknowns = summarizeUnknowns(candidates, recognitions);
	const globalMetrics = calculateGlobalMetrics(ring, recognitions, unknowns);
	const warnings = warningList(
		ring,
		primarySigil,
		unsupportedMultipleSigils,
		unknowns,
		recognitions
	);

	const glyphAST = roundedDeep({
		type: 'GlyphAST',
		version: config.appVersion,
		ring,
		candidates: candidates.map(stripCandidate),
		primarySigil: stripRecognitionDiagnostics(primarySigil),
		unsupportedMultipleSigils,
		signs,
		unknowns,
		globalMetrics,
		warnings
	}) as GlyphAST;

	return {
		cleanedStrokes,
		ring,
		classifications: roundedValue(classifications),
		candidates,
		recognitions: roundedValue(recognitions),
		glyphAST
	};
}

/** Builds a classified drawing while the user has not drawn a detectable ring. */
export function assembleNoRingDrawing(
	prep: NoRingRecognitionPrep,
	recognitions: Recognition[],
	config: AppConfig
): ClassifiedDrawing {
	const glyphAST: GlyphAST = {
		type: 'GlyphAST',
		version: config.appVersion,
		ring: prep.ring,
		candidates: [],
		primarySigil: null,
		unsupportedMultipleSigils: [],
		signs: [],
		unknowns: [],
		globalMetrics: {
			neatness: 0,
			radialSymmetry: 0,
			instability: 1
		},
		warnings: [GLYPH_WARNINGS.noRingDetected]
	};

	return {
		cleanedStrokes: prep.cleanedStrokes,
		ring: prep.ring,
		classifications: roundedValue(prep.classifications),
		candidates: prep.candidates,
		recognitions: roundedValue(recognitions),
		glyphAST
	};
}

/** Dispatches assembly for ring and no-ring prepared states. */
export function assemblePreparedDrawing(
	prepared: PreparedRecognition,
	recognitions: Recognition[],
	config: AppConfig
): ClassifiedDrawing {
	if ('noRing' in prepared) {
		return assembleNoRingDrawing(prepared.noRing, recognitions, config);
	}
	return assembleDrawing(prepared.prep, recognitions, config);
}
