import { cleanStrokes } from './strokeCleaner.js';
import { detectRing } from './ringDetector.js';
import { classifyStrokesAgainstRing } from './coordinateNormalizer.js';
import { buildSymbolCandidates } from './strokeGrouper.js';
import { recognizeCandidates } from './symbolRecognizer.js';
import { recognizeCandidatesAsync } from './recognitionPool.js';
import { recognizeCandidatesHybridMl } from './mlRecognizer.js';
import { GLYPH_WARNINGS } from './glyphWarnings.js';
import { emitMlDebug } from '../debug/mlDebug.js';
import {
	allPoints,
	angleDegFromCenter,
	boundsForStrokes,
	centerOfBounds,
	clamp,
	directedStrokeAngle,
	dominantAxisOrientationDeg,
	endpointClosedness,
	formatNumber,
	mean,
	strokeLength,
	vectorFromAngleDeg
} from '../utils/geometry.js';
import type { RecognitionExample } from './shapeMatcher.js';
import type {
	AppConfig,
	ClassifiedDrawing,
	CleanedStroke,
	Dictionary,
	GlobalMetrics,
	GlyphAST,
	Recognition,
	RecognizedSymbol,
	RingInfo,
	Stroke,
	SymbolCandidate,
	Vector
} from '../types.js';

function roundedDeep(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(roundedDeep);
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundedDeep(item)]));
	}
	return formatNumber(value);
}

// Assuming a sigil has to be in the center of the ring, so reward the score a little bit
function primarySigilScore(sigil: Recognition): number {
	const layerBonus = sigil.layer === 'center' ? 0.12 : sigil.radiusNorm <= 0.45 ? 0.06 : 0;
	return sigil.confidence + layerBonus;
}

function recognizedSigils(recognitions: Recognition[]): Recognition[] {
	return recognitions
		.filter((recognition) => recognition.recognized && recognition.kind === 'sigil')
		.sort((a, b) => b.confidence - a.confidence);
}

function selectPrimarySigil(sigils: Recognition[]): Recognition | null {
	return [...sigils].sort((a, b) => primarySigilScore(b) - primarySigilScore(a))[0] ?? null;
}

function summarizeUnknowns(candidates: SymbolCandidate[], recognitions: Recognition[]) {
	const byCandidate = new Map(
		recognitions.map((recognition) => [recognition.candidateId, recognition])
	);
	return candidates
		.filter((candidate) => !byCandidate.get(candidate.candidateId)?.recognized)
		.map((candidate) => {
			const recognition = byCandidate.get(candidate.candidateId);
			return {
				candidateId: candidate.candidateId,
				strokeIds: candidate.strokeIds,
				layer: candidate.layer,
				radiusNorm: candidate.radiusNorm,
				angleDeg: candidate.angleDeg,
				reason: recognition?.recognitionStatus ?? 'no_confident_match',
				bestGuess: recognition?.diagnostics?.bestGuess ?? null
			};
		});
}

function calculateDirectionalBias(signs: Recognition[]): Vector {
	if (!signs.length) {
		return { x: 0, y: 0 };
	}

	const vector = signs.reduce(
		(sum, sign) => {
			const direction = vectorFromAngleDeg(sign.angleDeg);
			const weight =
				sign.confidence * sign.neatness * Math.max(0.3, sign.sizeNorm + sign.lengthNorm);
			return {
				x: sum.x + direction.x * weight,
				y: sum.y + direction.y * weight
			};
		},
		{ x: 0, y: 0 }
	);

	const magnitude = Math.hypot(vector.x, vector.y);
	if (magnitude < 0.001) {
		return { x: 0, y: 0 };
	}
	return {
		x: vector.x / magnitude,
		y: vector.y / magnitude
	};
}

function calculateGlobalMetrics(
	ring: RingInfo,
	recognitions: Recognition[],
	unknowns: unknown[]
): GlobalMetrics {
	const recognized = recognitions.filter((recognition) => recognition.recognized);
	const neatnessAverage = mean(
		[ring.neatness ?? 0, ...recognized.map((recognition) => recognition.neatness ?? 0.6)].filter(
			(value) => value > 0
		)
	);
	const signs = recognized.filter((recognition) => recognition.kind === 'sign');
	const directionalBias = calculateDirectionalBias(signs);
	const unknownPenalty = clamp(unknowns.length / 6);
	const contaminatedPenalty = clamp(
		recognitions.filter((recognition) => recognition.recognitionStatus === 'contaminated').length /
			4
	);
	const ambiguousPenalty = clamp(
		recognitions.filter((recognition) => recognition.recognitionStatus === 'ambiguous').length / 5
	);
	const messyPenalty = clamp(
		recognitions.filter((recognition) => recognition.recognitionStatus === 'valid_messy').length / 8
	);

	return {
		neatness: clamp(neatnessAverage || 0),
		radialSymmetry: clamp(1 - Math.hypot(directionalBias.x, directionalBias.y) * 0.35),
		instability: clamp(
			0.22 +
				unknownPenalty * 0.34 +
				contaminatedPenalty * 0.22 +
				ambiguousPenalty * 0.12 +
				messyPenalty * 0.08 +
				(1 - (ring.neatness ?? 0.4)) * 0.36
		)
	};
}

function stripCandidate(candidate: SymbolCandidate) {
	const { strokes, ...publicCandidate } = candidate;
	void strokes;
	return publicCandidate;
}

function stripRecognitionDiagnostics(recognition: Recognition | null) {
	if (!recognition) {
		return null;
	}
	const { diagnostics, ...publicRecognition } = recognition;
	void diagnostics;
	return publicRecognition;
}

function warningList(
	ring: RingInfo,
	primarySigil: Recognition | null,
	unsupportedMultipleSigils: unknown[],
	unknowns: Array<{ radiusNorm: number }>,
	recognitions: Recognition[]
): string[] {
	const warnings: string[] = [];
	if (!ring.found) {
		warnings.push(GLYPH_WARNINGS.noRingDetected);
	} else if (!ring.complete) {
		warnings.push(GLYPH_WARNINGS.ringIncomplete);
	}
	if (ring.unsupportedNestedRings?.length) {
		warnings.push(GLYPH_WARNINGS.unsupportedNestedRing);
	}
	if (ring.unsupportedMultipleRings?.length) {
		warnings.push(GLYPH_WARNINGS.unsupportedMultipleRings);
	}
	if (unsupportedMultipleSigils.length) {
		warnings.push(GLYPH_WARNINGS.unsupportedMultipleSigils);
	}
	if (!primarySigil) {
		warnings.push(GLYPH_WARNINGS.missingPrimarySigil);
	}
	if (unknowns.some((unknown) => unknown.radiusNorm <= 0.36)) {
		warnings.push(GLYPH_WARNINGS.centerUnknownContamination);
	}
	if (recognitions.some((recognition) => recognition.recognized && recognition.nearBoundary)) {
		warnings.push(GLYPH_WARNINGS.symbolNearLayerBoundary);
	}
	if (recognitions.some((recognition) => recognition.recognitionStatus === 'contaminated')) {
		warnings.push(GLYPH_WARNINGS.symbolContaminated);
	}
	if (recognitions.some((recognition) => recognition.recognitionStatus === 'ambiguous')) {
		warnings.push(GLYPH_WARNINGS.symbolAmbiguous);
	}
	if (recognitions.some((recognition) => recognition.recognitionStatus === 'valid_messy')) {
		warnings.push(GLYPH_WARNINGS.symbolMessy);
	}
	return warnings;
}

function buildNoRingPreviewCandidate(strokes: Stroke[]): SymbolCandidate | null {
	const points = allPoints(strokes);
	if (!points.length) {
		return null;
	}

	const bounds = boundsForStrokes(strokes);
	const center = centerOfBounds(bounds);
	const length = strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
	const size = Math.max(bounds.width, bounds.height, 1);
	const syntheticRingRadius = Math.max(size * 1.35, 1);
	const orientationDeg = dominantAxisOrientationDeg(points);
	const directedOrientationDeg = directedStrokeAngle(strokes);
	const compactPerimeter = Math.max(1, (bounds.width + bounds.height) * 2);
	const overdrawAmount = clamp(length / compactPerimeter - 0.72, 0, 1);

	return {
		candidateId: 'preview-symbol',
		strokeIds: strokes.map((stroke) => stroke.id),
		rawStrokeCount: strokes.length,
		cleanedStrokeCount: strokes.length,
		bounds,
		center,
		radiusNorm: 0.5,
		angleDeg: angleDegFromCenter(center, center),
		layer: 'any',
		nearBoundary: false,
		sizeNorm: size / Math.max(1, syntheticRingRadius * 2),
		lengthNorm: length / Math.max(1, Math.PI * 2 * syntheticRingRadius),
		orientationDeg,
		directedOrientationDeg,
		radialFacing: 'unclear',
		closedness: endpointClosedness(strokes, size),
		overdrawAmount,
		neatness: clamp(0.92 - overdrawAmount * 0.28 - Math.max(0, strokes.length - 4) * 0.035),
		strokes
	};
}

// Reuse one sigil-only dictionary per source dictionary: recognition caches are
// keyed by dictionary identity (WeakMap), so allocating a fresh object per call
// would silently rebuild dictionary examples on every no-ring recompute.
const sigilOnlyDictionaries = new WeakMap<Dictionary, Dictionary>();

function sigilOnlyDictionaryFor(dictionary: Dictionary): Dictionary {
	let sigilOnly = sigilOnlyDictionaries.get(dictionary);
	if (!sigilOnly) {
		sigilOnly = { sigils: dictionary.sigils, signs: [] };
		sigilOnlyDictionaries.set(dictionary, sigilOnly);
	}
	return sigilOnly;
}

function noRingPreview(
	cleanedStrokes: CleanedStroke[],
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[],
	guideRing: RingInfo | null = null
): NoRingPreview {
	if (guideRing) {
		const classifications = classifyStrokesAgainstRing(cleanedStrokes, guideRing, config);
		const candidates = buildSymbolCandidates(
			cleanedStrokes,
			classifications,
			guideRing,
			config,
			dictionary,
			recognitionExamples
		);
		return {
			classifications,
			candidates,
			recognitionDictionary: dictionary,
			recognitionExamples
		};
	}

	const sigilOnlyDictionary = sigilOnlyDictionaryFor(dictionary);
	const sigilExamples = recognitionExamples.filter((example) => example.kind === 'sigil');
	const candidate = buildNoRingPreviewCandidate(cleanedStrokes);
	if (!candidate) {
		return {
			classifications: [] as ReturnType<typeof classifyStrokesAgainstRing>,
			candidates: [] as SymbolCandidate[],
			recognitionDictionary: sigilOnlyDictionary,
			recognitionExamples: sigilExamples
		};
	}

	return {
		classifications: [] as ReturnType<typeof classifyStrokesAgainstRing>,
		candidates: [candidate],
		recognitionDictionary: sigilOnlyDictionary,
		recognitionExamples: sigilExamples
	};
}

export interface ClassifyDrawingInput {
	strokes: Stroke[];
	previousRing?: RingInfo | null;
	canvasWidth?: number;
	canvasHeight?: number;
	dictionary: Dictionary;
	config: AppConfig;
	recognitionExamples?: RecognitionExample[];
}

interface RecognitionPrep {
	cleanedStrokes: Stroke[];
	ring: RingInfo;
	classifications: ReturnType<typeof classifyStrokesAgainstRing>;
	candidates: SymbolCandidate[];
}

interface NoRingPreview {
	classifications: ReturnType<typeof classifyStrokesAgainstRing>;
	candidates: SymbolCandidate[];
	recognitionDictionary: Dictionary;
	recognitionExamples: RecognitionExample[];
}

interface NoRingRecognitionPrep extends RecognitionPrep {
	recognitionDictionary: Dictionary;
	recognitionExamples: RecognitionExample[];
}

// Brief pause between posting the template result and starting ML so a rapid
// follow-up stroke can supersede the pass before it renders tensors. Cached
// predictions make a superseded pass cheap, so this stays short.
const ML_START_DEBOUNCE_MS = 100;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs everything up to (but not including) final candidate recognition. Returns
// a finished drawing for the no-ring preview path, or the prep needed to score
// candidates. Both the sync and async entrypoints share this so the only thing
// that differs between them is how the final recognition pass is dispatched.
function prepareRecognition(
	input: ClassifyDrawingInput
): { noRing: NoRingRecognitionPrep } | { prep: RecognitionPrep } {
	const {
		strokes,
		previousRing = null,
		canvasWidth,
		canvasHeight,
		dictionary,
		config,
		recognitionExamples = []
	} = input;
	const cleanedStrokes = cleanStrokes(strokes, config);
	const ring = detectRing(cleanedStrokes, previousRing, config);

	if (!ring.found) {
		const guideRing =
			canvasWidth && canvasHeight
				? {
						found: true,
						complete: false,
						center: { x: canvasWidth / 2, y: canvasHeight / 2 },
						radius: Math.min(canvasWidth, canvasHeight) * 0.36,
						strokeIds: [] as string[]
					}
				: null;
		const preview = noRingPreview(
			cleanedStrokes,
			dictionary,
			config,
			recognitionExamples,
			guideRing
		);
		return {
			noRing: {
				cleanedStrokes,
				ring,
				candidates: preview.candidates,
				classifications: preview.classifications,
				recognitionDictionary: preview.recognitionDictionary,
				recognitionExamples: preview.recognitionExamples
			}
		};
	}

	const classifications = classifyStrokesAgainstRing(cleanedStrokes, ring, config);
	const decompositionDictionary = ring.complete ? dictionary : undefined;
	const candidates = buildSymbolCandidates(
		cleanedStrokes,
		classifications,
		ring,
		config,
		decompositionDictionary
	);

	return { prep: { cleanedStrokes, ring, classifications, candidates } };
}

// Builds the final ClassifiedDrawing from already-scored recognitions. Shared by
// the sync and async paths; whichever produced `recognitions` does not matter.
function assembleDrawing(
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
		classifications: roundedDeep(classifications) as unknown[],
		candidates,
		recognitions: roundedDeep(recognitions) as Recognition[],
		glyphAST
	};
}

function assembleNoRingDrawing(
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
		classifications: roundedDeep(prep.classifications) as unknown[],
		candidates: prep.candidates,
		recognitions: roundedDeep(recognitions) as Recognition[],
		glyphAST
	};
}

type PreparedRecognition = { noRing: NoRingRecognitionPrep } | { prep: RecognitionPrep };

function templateRecognitionsFor(
	prepared: PreparedRecognition,
	input: ClassifyDrawingInput
): RecognizedSymbol[] {
	if ('noRing' in prepared) {
		return recognizeCandidates(
			prepared.noRing.candidates,
			prepared.noRing.recognitionDictionary,
			input.config,
			prepared.noRing.recognitionExamples
		);
	}

	return recognizeCandidates(
		prepared.prep.candidates,
		input.dictionary,
		input.config,
		input.recognitionExamples ?? []
	);
}

async function hybridMlRecognitionsFor(
	prepared: PreparedRecognition,
	templateResults: RecognizedSymbol[],
	input: ClassifyDrawingInput,
	shouldContinue?: () => boolean,
	onProgress?: (recognitions: RecognizedSymbol[]) => void
): Promise<RecognizedSymbol[]> {
	if ('noRing' in prepared) {
		return recognizeCandidatesHybridMl(
			prepared.noRing.candidates,
			templateResults,
			prepared.noRing.recognitionDictionary,
			input.config,
			shouldContinue,
			onProgress
		);
	}

	return recognizeCandidatesHybridMl(
		prepared.prep.candidates,
		templateResults,
		input.dictionary,
		input.config,
		shouldContinue,
		onProgress
	);
}

function assemblePreparedDrawing(
	prepared: PreparedRecognition,
	recognitions: Recognition[],
	config: AppConfig
): ClassifiedDrawing {
	if ('noRing' in prepared) {
		return assembleNoRingDrawing(prepared.noRing, recognitions, config);
	}
	return assembleDrawing(prepared.prep, recognitions, config);
}

export function classifyDrawing(input: ClassifyDrawingInput): ClassifiedDrawing {
	const prepared = prepareRecognition(input);
	const recognitions = templateRecognitionsFor(prepared, input);
	return assemblePreparedDrawing(prepared, recognitions, input.config);
}

export async function classifyDrawingPhasedLocal(
	input: ClassifyDrawingInput,
	onTemplateResult?: (result: ClassifiedDrawing) => void,
	shouldContinue?: () => boolean,
	onMlProgress?: (result: ClassifiedDrawing) => void
): Promise<ClassifiedDrawing | null> {
	const prepared = prepareRecognition(input);
	const templateResults = templateRecognitionsFor(prepared, input);
	const templateDrawing = assemblePreparedDrawing(prepared, templateResults, input.config);
	onTemplateResult?.(templateDrawing);

	if (shouldContinue && !shouldContinue()) {
		return null;
	}

	await delay(ML_START_DEBOUNCE_MS);
	if (shouldContinue && !shouldContinue()) {
		return null;
	}

	const hybridResults = await hybridMlRecognitionsFor(
		prepared,
		templateResults,
		input,
		shouldContinue,
		(progressResults) => {
			if (!shouldContinue || shouldContinue()) {
				onMlProgress?.(assemblePreparedDrawing(prepared, progressResults, input.config));
			}
		}
	);
	if (shouldContinue && !shouldContinue()) {
		return null;
	}
	return assemblePreparedDrawing(prepared, hybridResults, input.config);
}

// Same result as classifyDrawing, but the heavy per-candidate recognition pass
// is fanned out across a long-lived Web Worker pool so it runs in parallel,
// off the UI thread. Prep (cleaning, ring detection, candidate grouping) is
// comparatively cheap and stays on the calling thread; recognition is the
// dominant cost and the only part that benefits from parallelism. The pool
// degrades to the synchronous recognizer when workers are unavailable, so
// callers always get an identical ClassifiedDrawing either way.
export async function classifyDrawingAsync(
	input: ClassifyDrawingInput
): Promise<ClassifiedDrawing> {
	const prepared = prepareRecognition(input);
	if ('noRing' in prepared) {
		emitMlDebug(
			'drawingClassifier',
			'classifier no-ring candidates',
			{ candidates: prepared.noRing.candidates.length },
			input.config.recognition.ml.debug
		);
		const recognitions = await recognizeCandidatesAsync(
			prepared.noRing.candidates,
			prepared.noRing.recognitionDictionary,
			input.config,
			prepared.noRing.recognitionExamples
		);
		return assembleNoRingDrawing(prepared.noRing, recognitions, input.config);
	}

	emitMlDebug(
		'drawingClassifier',
		'classifier ring candidates',
		{ candidates: prepared.prep.candidates.length },
		input.config.recognition.ml.debug
	);
	const recognitions = await recognizeCandidatesAsync(
		prepared.prep.candidates,
		input.dictionary,
		input.config,
		input.recognitionExamples ?? []
	);
	return assembleDrawing(prepared.prep, recognitions, input.config);
}
