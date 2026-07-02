import assert from 'node:assert/strict';
import test from 'node:test';

import {
	acceptMlResult,
	recognizeCandidatesHybridMl,
	type MlConfig,
	type MlPrediction
} from '../src/lib/parser/ml/index.js';
import type {
	AppConfig,
	Dictionary,
	DictionaryEntry,
	RecognizedSymbol,
	RecognitionStatus,
	SymbolCandidate
} from '../src/lib/types.js';

const mlConfig: MlConfig = {
	enabled: true,
	modelUrl: '/models/glyph-recognizer.onnx',
	classMapUrl: '/models/glyph-class-to-idx.json',
	externalDataUrl: '/models/glyph-recognizer.onnx.data',
	externalDataPath: 'glyph-recognizer.onnx.data',
	inputSize: 224,
	margin: 0.2,
	strokeWidth: 2,
	acceptConfidence: 0.74,
	acceptMargin: 0.16,
	overrideConfidence: 0.84,
	overrideMargin: 0.18,
	superConfidence: 0.94,
	superMargin: 0.28,
	debug: false
};

const appConfig = {
	recognition: {
		ml: {
			enabled: true,
			modelUrl: '/models/glyph-recognizer.onnx',
			classMapUrl: '/models/glyph-class-to-idx.json',
			inputSize: 224,
			margin: 0.2,
			strokeWidth: 2,
			acceptConfidence: 0.74,
			acceptMargin: 0.16,
			overrideConfidence: 0.84,
			overrideMargin: 0.18,
			superConfidence: 0.94,
			superMargin: 0.28,
			debug: false
		}
	}
} as AppConfig;

const dictionary: Dictionary = {
	sigils: [],
	signs: []
};

const fireEntry: DictionaryEntry = {
	id: 'fire',
	displayName: 'Fire',
	element: 'fire',
	allowedLayers: ['center']
};

const regionEntry: DictionaryEntry = {
	id: 'region',
	displayName: 'Region',
	allowedLayers: ['middle', 'outer']
};

const candidate: SymbolCandidate = {
	candidateId: 'c1',
	strokeIds: ['s1'],
	rawStrokeCount: 1,
	cleanedStrokeCount: 1,
	bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
	center: { x: 50, y: 50 },
	radiusNorm: 0.2,
	angleDeg: 0,
	layer: 'center',
	nearBoundary: false,
	sizeNorm: 0.2,
	lengthNorm: 0.2,
	orientationDeg: 0,
	directedOrientationDeg: 0,
	radialFacing: 'unclear',
	overdrawAmount: 0,
	neatness: 0.9,
	strokes: [{ id: 's1', points: [{ x: 0, y: 0 }] }]
};

function recognition(
	overrides: Partial<RecognizedSymbol> = {},
	diagnosticOverrides: {
		bestGuessConfidence?: number;
		candidateExplainedRatio?: number;
		templateCoveredRatio?: number;
		unexplainedInkRatio?: number;
		structureScore?: number;
	} = {}
): RecognizedSymbol {
	const status = overrides.recognitionStatus ?? ('unknown' as RecognitionStatus);
	const recognized = overrides.recognized ?? false;
	return {
		candidateId: 'c1',
		strokeIds: ['s1'],
		layer: 'center',
		nearBoundary: false,
		radiusNorm: 0.2,
		angleDeg: 0,
		sizeNorm: 0.2,
		lengthNorm: 0.2,
		orientationDeg: 0,
		directedOrientationDeg: 0,
		radialFacing: 'unclear',
		rotationOffsetDeg: 0,
		overdrawAmount: 0,
		neatness: 0.9,
		recognized,
		recognitionStatus: status,
		kind: recognized ? 'sigil' : 'unknown',
		id: recognized ? 'water' : null,
		displayName: recognized ? 'Water' : null,
		element: recognized ? 'water' : null,
		semantic: null,
		confidence: recognized ? 0.72 : 0,
		shape: {},
		diagnostics: {
			bestGuess: diagnosticOverrides.bestGuessConfidence
				? {
						kind: 'sigil',
						id: 'fire',
						confidence: diagnosticOverrides.bestGuessConfidence
					}
				: null,
			recognitionRotationDeg: 0,
			template: {
				candidateExplainedRatio: diagnosticOverrides.candidateExplainedRatio ?? 0,
				templateCoveredRatio: diagnosticOverrides.templateCoveredRatio ?? 0,
				unexplainedInkRatio: diagnosticOverrides.unexplainedInkRatio ?? 1
			},
			structure: {
				score: diagnosticOverrides.structureScore ?? 0
			},
			topMatches: diagnosticOverrides.bestGuessConfidence
				? [
						{
							kind: 'sigil',
							id: 'fire',
							confidence: diagnosticOverrides.bestGuessConfidence,
							source: 'template'
						}
					]
				: []
		},
		...overrides
	};
}

function mlPrediction(
	entry: DictionaryEntry,
	confidence: number,
	secondConfidence: number,
	kind: MlPrediction['kind'] = 'sigil'
): MlPrediction {
	return {
		available: true,
		id: entry.id,
		kind,
		entry,
		confidence,
		angleDeg: 0,
		scaleX: 1,
		scaleY: 1,
		centerX: 0.5,
		centerY: 0.5,
		topMatches: [
			{
				kind,
				id: entry.id,
				confidence,
				source: 'ml',
				mlConfidence: confidence
			},
			{
				kind: 'sigil',
				id: 'water',
				confidence: secondConfidence,
				source: 'ml',
				mlConfidence: secondConfidence
			}
		]
	};
}

test('hybrid ML skips runtime loading when there are no candidates', async () => {
	const result = await recognizeCandidatesHybridMl([], [], dictionary, appConfig);

	assert.deepEqual(result, []);
});

test('ML does not rescue a template-unknown candidate with no glyph-like verifier signal', () => {
	const decision = acceptMlResult(
		recognition(),
		mlPrediction(fireEntry, 0.82, 0.48),
		mlConfig,
		candidate
	);

	assert.equal(decision.accept, false);
	assert.equal(decision.reason, 'verifier_rejected_unknown_template');
});

test('ML rescues a template-unknown candidate when the verifier sees glyph-like evidence', () => {
	const decision = acceptMlResult(
		recognition(
			{},
			{
				bestGuessConfidence: 0.44,
				candidateExplainedRatio: 0.58,
				templateCoveredRatio: 0.5,
				unexplainedInkRatio: 0.4
			}
		),
		mlPrediction(fireEntry, 0.82, 0.48),
		mlConfig,
		candidate
	);

	assert.equal(decision.accept, true);
	assert.equal(decision.reason, 'accepted_verified_unknown_template');
});

test('super-confident ML can accept even when the template verifier is not convinced', () => {
	const decision = acceptMlResult(
		recognition(),
		mlPrediction(fireEntry, 0.96, 0.58),
		mlConfig,
		candidate
	);

	assert.equal(decision.accept, true);
	assert.equal(decision.reason, 'super_confident_accept');
	assert.equal(decision.superConfident, true);
});

test('super-confident ML can override a different template recognition', () => {
	const decision = acceptMlResult(
		recognition({
			recognized: true,
			recognitionStatus: 'valid',
			kind: 'sigil',
			id: 'water',
			displayName: 'Water',
			element: 'water',
			confidence: 0.9
		}),
		mlPrediction(fireEntry, 0.96, 0.58),
		mlConfig,
		candidate
	);

	assert.equal(decision.accept, true);
	assert.equal(decision.reason, 'super_confident_override');
});

test('ordinary ML override still needs enough separation from the runner-up class', () => {
	const decision = acceptMlResult(
		recognition({
			recognized: true,
			recognitionStatus: 'valid',
			kind: 'sigil',
			id: 'water',
			displayName: 'Water',
			element: 'water',
			confidence: 0.62
		}),
		mlPrediction(fireEntry, 0.86, 0.78),
		mlConfig,
		candidate
	);

	assert.equal(decision.accept, false);
	assert.equal(decision.reason, 'ml_margin_below_accept');
});

test('ML still respects dictionary layer constraints', () => {
	const outerCandidate: SymbolCandidate = { ...candidate, layer: 'outer' };
	const decision = acceptMlResult(
		recognition(),
		mlPrediction(fireEntry, 0.98, 0.3),
		mlConfig,
		outerCandidate
	);

	assert.equal(decision.accept, false);
	assert.equal(decision.reason, 'layer_rejected');
});

test('super-confident ML does not accept region for straight-line ink', () => {
	const straightLineCandidate: SymbolCandidate = {
		...candidate,
		layer: 'outer',
		bounds: { minX: 0, minY: 0, maxX: 220, maxY: 4, width: 220, height: 4 },
		center: { x: 110, y: 2 },
		orientationDeg: 0,
		directedOrientationDeg: 0,
		strokes: [
			{
				id: 's1',
				points: [
					{ x: 0, y: 0 },
					{ x: 70, y: 1 },
					{ x: 140, y: 2 },
					{ x: 220, y: 4 }
				]
			}
		]
	};

	const decision = acceptMlResult(
		recognition(),
		mlPrediction(regionEntry, 0.99, 0.2, 'sign'),
		mlConfig,
		straightLineCandidate
	);

	assert.equal(decision.accept, false);
	assert.equal(decision.reason, 'region_geometry_rejected');
	assert.equal(decision.superConfident, true);
});

test('super-confident ML can still accept region-shaped bent ink', () => {
	const bentRegionCandidate: SymbolCandidate = {
		...candidate,
		layer: 'outer',
		bounds: { minX: 0, minY: 0, maxX: 220, maxY: 120, width: 220, height: 120 },
		center: { x: 110, y: 60 },
		strokes: [
			{
				id: 's1',
				points: [
					{ x: 0, y: 120 },
					{ x: 110, y: 0 },
					{ x: 220, y: 120 }
				]
			}
		]
	};

	const decision = acceptMlResult(
		recognition(),
		mlPrediction(regionEntry, 0.99, 0.2, 'sign'),
		mlConfig,
		bentRegionCandidate
	);

	assert.equal(decision.accept, true);
	assert.equal(decision.reason, 'super_confident_accept');
});

test('accepted ML leaves facing unset until canonical angles are calibrated', async () => {
	const { applyMlResult } = await import('../src/lib/parser/ml/acceptance.js');
	const prediction = { ...mlPrediction(fireEntry, 0.96, 0.58), angleDeg: 126 };

	const cold = applyMlResult(recognition(), prediction, mlConfig, candidate, new Map());
	assert.equal(cold.diagnostics.ml?.accepted, true);
	assert.equal(cold.rotationOffsetDeg, undefined, 'no facing fabricated from a raw pose angle');

	const calibrated = applyMlResult(
		recognition(),
		prediction,
		mlConfig,
		candidate,
		new Map([[fireEntry.id, 122]])
	);
	assert.equal(calibrated.rotationOffsetDeg, 4, 'calibrated offset is pose minus canonical');
});
