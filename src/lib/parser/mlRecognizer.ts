import * as ort from 'onnxruntime-web/webgpu';
import { emitMlDebug, type MlDebugConsoleLevel } from '../debug/mlDebug.js';
import { candidateContentKey, scopedLruCache } from './recognitionMemo.js';
import { lineSpreadRatio } from '../utils/geometry.js';
import type {
	AppConfig,
	Dictionary,
	DictionaryEntry,
	RecognitionKind,
	RecognizedSymbol,
	SymbolCandidate,
	TopMatch
} from '../types.js';

export interface MlConfig {
	enabled: boolean;
	modelUrl: string;
	classMapUrl: string;
	externalDataUrl: string;
	externalDataPath: string;
	inputSize: number;
	margin: number;
	strokeWidth: number;
	acceptConfidence: number;
	acceptMargin: number;
	overrideConfidence: number;
	overrideMargin: number;
	superConfidence: number;
	superMargin: number;
	debug: boolean;
}

interface MlRuntime {
	session: ort.InferenceSession;
	idxToId: string[];
	batchSupported: boolean;
	warmed: boolean;
	warmupPromise?: Promise<void>;
}

export interface MlPrediction {
	available: boolean;
	id: string | null;
	kind: RecognitionKind;
	entry: DictionaryEntry | null;
	confidence: number;
	angleDeg: number;
	scaleX: number;
	scaleY: number;
	centerX: number;
	centerY: number;
	topMatches: TopMatch[];
	reason?: string;
	error?: string;
}

export interface MlAcceptanceDecision {
	accept: boolean;
	reason: string;
	margin: number;
	superConfident: boolean;
	verifierPassed: boolean;
}

type OrtFeeds = Record<string, ort.Tensor>;
type OrtSessionOptions = Parameters<typeof ort.InferenceSession.create>[1];
type OrtExecutionProvider =
	NonNullable<OrtSessionOptions>['executionProviders'] extends Array<infer Provider>
		? Provider
		: string;
type ShouldContinue = () => boolean;
type MlProgress = (results: RecognizedSymbol[]) => void;
type NavigatorWithGpu = Navigator & {
	gpu?: {
		requestAdapter?: (options?: {
			powerPreference?: 'high-performance' | 'low-power';
		}) => Promise<unknown>;
	};
};

const REGION_SIGN_ID = 'region';
const REGION_MIN_LINE_SPREAD = 0.14;
// The current exported ONNX graph has a fixed batch-1 reshape near the heads.
// Keep the batched path available for a corrected export, but do not pay a
// failed OrtRun probe on every fresh browser session.
const BATCH_INFERENCE_PROBE_ENABLED = false;

let runtimePromise: Promise<MlRuntime | null> | null = null;
let runtimeKey = '';
let ortConfigured = false;
let runtimeUnavailableReason = '';

function mlConfig(config: AppConfig): MlConfig {
	const ml = config.recognition.ml;
	const modelFileName = ml.modelUrl.split('/').pop() ?? 'glyph-recognizer.onnx';
	return {
		enabled: ml.enabled,
		modelUrl: ml.modelUrl,
		classMapUrl: ml.classMapUrl,
		externalDataUrl: `${ml.modelUrl}.data`,
		externalDataPath: `${modelFileName}.data`,
		inputSize: ml.inputSize,
		margin: ml.margin,
		strokeWidth: ml.strokeWidth,
		acceptConfidence: ml.acceptConfidence,
		acceptMargin: ml.acceptMargin,
		overrideConfidence: ml.overrideConfidence,
		overrideMargin: ml.overrideMargin,
		superConfidence: ml.superConfidence,
		superMargin: ml.superMargin,
		debug: ml.debug
	};
}

function canRunInBrowser(): boolean {
	return (
		typeof fetch !== 'undefined' &&
		(typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined')
	);
}

function debugLog(
	config: MlConfig,
	message: string,
	detail?: unknown,
	consoleLevel: MlDebugConsoleLevel = 'silent'
): void {
	emitMlDebug('mlRecognizer', message, detail, config.debug, consoleLevel);
}

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	return String(error);
}

function configureOrtRuntime(): void {
	if (ortConfigured) {
		return;
	}
	ort.env.wasm.wasmPaths = '/onnxruntime/';
	ort.env.webgpu.powerPreference = 'high-performance';
	ortConfigured = true;
}

async function webGpuSupported(): Promise<boolean> {
	const gpu = typeof navigator === 'undefined' ? null : (navigator as NavigatorWithGpu).gpu;
	if (!gpu?.requestAdapter) {
		return false;
	}

	try {
		return Boolean(await gpu.requestAdapter({ powerPreference: 'high-performance' }));
	} catch {
		return false;
	}
}

async function executionProviders(): Promise<OrtExecutionProvider[]> {
	return (await webGpuSupported())
		? (['webgpu', 'wasm'] as OrtExecutionProvider[])
		: (['wasm'] as OrtExecutionProvider[]);
}

async function fetchClassMap(url: string): Promise<string[]> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`class map ${url} returned ${response.status}`);
	}
	const classToIdx = (await response.json()) as Record<string, number>;
	const idxToId: string[] = [];
	for (const [id, index] of Object.entries(classToIdx)) {
		idxToId[index] = id;
	}
	return idxToId;
}

async function loadRuntime(config: MlConfig): Promise<MlRuntime | null> {
	if (!config.enabled || !canRunInBrowser()) {
		debugLog(config, 'skipped', {
			enabled: config.enabled,
			canRunInBrowser: canRunInBrowser()
		});
		return null;
	}

	const key = `${config.modelUrl}|${config.classMapUrl}|${config.externalDataUrl}`;
	if (runtimePromise && runtimeKey === key) {
		return runtimePromise;
	}

	const loadingKey = key;
	const loadingPromise: Promise<MlRuntime | null> = (async () => {
		try {
			const providers = await executionProviders();
			debugLog(config, 'loading model', {
				modelUrl: config.modelUrl,
				classMapUrl: config.classMapUrl,
				externalDataUrl: config.externalDataUrl,
				externalDataPath: config.externalDataPath,
				executionProviders: providers
			});
			configureOrtRuntime();
			const [idxToId, session] = await Promise.all([
				fetchClassMap(config.classMapUrl),
				ort.InferenceSession.create(config.modelUrl, {
					executionProviders: providers,
					graphOptimizationLevel: 'all',
					externalData: [
						{
							path: config.externalDataPath,
							data: config.externalDataUrl
						}
					]
				})
			]);
			runtimeUnavailableReason = '';
			debugLog(config, 'model loaded', { classes: idxToId.length });
			return { session, idxToId, batchSupported: BATCH_INFERENCE_PROBE_ENABLED, warmed: false };
		} catch (error) {
			runtimeUnavailableReason = describeError(error);
			debugLog(
				config,
				'unavailable; using template recognizer only',
				{
					error: runtimeUnavailableReason
				},
				'warn'
			);
			if (runtimeKey === loadingKey) {
				runtimePromise = null;
				runtimeKey = '';
			}
			return null;
		}
	})();
	runtimeKey = loadingKey;
	runtimePromise = loadingPromise;

	return runtimePromise;
}

function dictionaryEntry(
	dictionary: Dictionary,
	id: string
): { kind: RecognitionKind; entry: DictionaryEntry } | null {
	const sigil = dictionary.sigils.find((entry) => entry.id === id);
	if (sigil) {
		return { kind: 'sigil', entry: sigil };
	}
	const sign = dictionary.signs.find((entry) => entry.id === id);
	if (sign) {
		return { kind: 'sign', entry: sign };
	}
	return null;
}

function layerAccepts(entry: DictionaryEntry, candidate: SymbolCandidate): boolean {
	if (candidate.layer === 'any') {
		return true;
	}
	if (!entry.allowedLayers?.length) {
		return candidate.layer !== 'outside';
	}
	return entry.allowedLayers.includes(candidate.layer) || candidate.nearBoundary;
}

function softmax(values: Float32Array): Float32Array {
	let max = -Infinity;
	for (const value of values) {
		if (value > max) {
			max = value;
		}
	}
	let sum = 0;
	const out = new Float32Array(values.length);
	for (let i = 0; i < values.length; i += 1) {
		const exp = Math.exp(values[i] - max);
		out[i] = exp;
		sum += exp;
	}
	for (let i = 0; i < out.length; i += 1) {
		out[i] /= sum || 1;
	}
	return out;
}

function topClassMatches(
	probs: Float32Array,
	runtime: MlRuntime,
	dictionary: Dictionary,
	limit = 3
): TopMatch[] {
	return [...probs]
		.map((confidence, index) => ({ confidence, index }))
		.sort((a, b) => b.confidence - a.confidence)
		.slice(0, limit)
		.map(({ confidence, index }) => {
			const id = runtime.idxToId[index] ?? `class:${index}`;
			const entry = dictionaryEntry(dictionary, id);
			return {
				kind: entry?.kind ?? 'unknown',
				id,
				confidence,
				source: 'ml',
				mlConfidence: confidence
			};
		});
}

function makeCanvas(size: number): HTMLCanvasElement | OffscreenCanvas {
	if (typeof OffscreenCanvas !== 'undefined') {
		return new OffscreenCanvas(size, size);
	}
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	return canvas;
}

function renderCandidateTensor(candidate: SymbolCandidate, config: MlConfig): Float32Array {
	const renderScale = 2;
	const size = config.inputSize;
	const canvasSize = size * renderScale;
	const canvas = makeCanvas(canvasSize);
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) {
		throw new Error('Could not create 2D canvas context for ML recognition.');
	}

	const marginPx = (canvasSize * config.margin) / 2;
	const usable = canvasSize - marginPx * 2;
	const bounds = candidate.bounds;
	const scale = Math.max(bounds.width, bounds.height, 1);

	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, canvasSize, canvasSize);
	ctx.strokeStyle = 'white';
	ctx.fillStyle = 'white';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = config.strokeWidth * renderScale;

	const project = (point: { x: number; y: number }) => ({
		x: marginPx + ((point.x - bounds.minX) / scale) * (usable - 1),
		y: marginPx + ((point.y - bounds.minY) / scale) * (usable - 1)
	});

	for (const stroke of candidate.strokes) {
		if (!stroke.points.length) {
			continue;
		}
		if (stroke.points.length === 1) {
			const point = project(stroke.points[0]);
			const radius = config.strokeWidth * renderScale;
			ctx.beginPath();
			ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
			ctx.fill();
			continue;
		}
		ctx.beginPath();
		const first = project(stroke.points[0]);
		ctx.moveTo(first.x, first.y);
		for (let i = 1; i < stroke.points.length; i += 1) {
			const point = project(stroke.points[i]);
			ctx.lineTo(point.x, point.y);
		}
		ctx.stroke();
	}

	const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize).data;
	const tensor = new Float32Array(size * size);

	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			let total = 0;
			for (let dy = 0; dy < renderScale; dy += 1) {
				for (let dx = 0; dx < renderScale; dx += 1) {
					const sx = x * renderScale + dx;
					const sy = y * renderScale + dy;
					total += imageData[(sy * canvasSize + sx) * 4] ?? 0;
				}
			}
			const pixel = total / (255 * renderScale * renderScale);
			tensor[y * size + x] = (pixel - 0.5) / 0.5;
		}
	}

	return tensor;
}

function outputTensor(
	results: ort.InferenceSession.ReturnType,
	names: string[],
	fallbackIndex: number
): ort.Tensor {
	const named = names.map((name) => results[name]).find(Boolean);
	const tensor = named ?? Object.values(results)[fallbackIndex];
	if (!tensor) {
		throw new Error(`Missing ONNX output ${names.join(' / ')}`);
	}
	return tensor;
}

function renderCandidatesTensor(candidates: SymbolCandidate[], config: MlConfig): Float32Array {
	const pixelsPerCandidate = config.inputSize * config.inputSize;
	const batch = new Float32Array(candidates.length * pixelsPerCandidate);
	for (let index = 0; index < candidates.length; index += 1) {
		batch.set(renderCandidateTensor(candidates[index], config), index * pixelsPerCandidate);
	}
	return batch;
}

function predictionFromOutputs(
	runtime: MlRuntime,
	dictionary: Dictionary,
	logitsTensor: ort.Tensor,
	angleTensor: ort.Tensor,
	scaleTensor: ort.Tensor,
	centerTensor: ort.Tensor,
	index: number
): MlPrediction {
	const logits = logitsTensor.data as Float32Array;
	const angle = angleTensor.data as Float32Array;
	const scale = scaleTensor.data as Float32Array;
	const center = centerTensor.data as Float32Array;
	const dims = logitsTensor.dims ?? [];
	const classCount = Number(dims[dims.length - 1] ?? runtime.idxToId.length);
	const rowOffset = index * classCount;
	const poseOffset = index * 2;
	const probs = softmax(logits.subarray(rowOffset, rowOffset + classCount));
	const topMatches = topClassMatches(probs, runtime, dictionary);
	const best = topMatches[0];
	const resolved = best ? dictionaryEntry(dictionary, best.id) : null;

	return {
		available: true,
		id: resolved?.entry.id ?? best?.id ?? null,
		kind: resolved?.kind ?? 'unknown',
		entry: resolved?.entry ?? null,
		confidence: best?.confidence ?? 0,
		angleDeg: Math.atan2(angle[poseOffset] ?? 0, angle[poseOffset + 1] ?? 1) * (180 / Math.PI),
		scaleX: scale[poseOffset] ?? 0,
		scaleY: scale[poseOffset + 1] ?? 0,
		centerX: center[poseOffset] ?? 0,
		centerY: center[poseOffset + 1] ?? 0,
		topMatches
	};
}

function predictionOutputs(results: ort.InferenceSession.ReturnType) {
	return {
		logitsTensor: outputTensor(results, ['class_logits', 'logits'], 0),
		angleTensor: outputTensor(results, ['angle'], 1),
		scaleTensor: outputTensor(results, ['scale'], 2),
		centerTensor: outputTensor(results, ['center'], 3)
	};
}

async function predictCandidateBatch(
	candidates: SymbolCandidate[],
	dictionary: Dictionary,
	runtime: MlRuntime,
	config: MlConfig,
	shouldContinue?: ShouldContinue
): Promise<MlPrediction[] | null> {
	if (shouldContinue && !shouldContinue()) {
		return null;
	}
	if (runtime.warmupPromise) {
		await runtime.warmupPromise;
	}

	const input = renderCandidatesTensor(candidates, config);
	const inputName = runtime.session.inputNames[0];
	const feeds: OrtFeeds = {
		[inputName]: new ort.Tensor('float32', input, [
			candidates.length,
			1,
			config.inputSize,
			config.inputSize
		])
	};
	const results = await runtime.session.run(feeds);
	if (shouldContinue && !shouldContinue()) {
		return null;
	}
	const outputs = predictionOutputs(results);
	const cache = predictionCacheFor(dictionary, config);

	return candidates.map((candidate, index) => {
		const prediction = predictionFromOutputs(
			runtime,
			dictionary,
			outputs.logitsTensor,
			outputs.angleTensor,
			outputs.scaleTensor,
			outputs.centerTensor,
			index
		);
		cache.set(candidateContentKey(candidate), prediction);
		return prediction;
	});
}

// Inference is deterministic per candidate ink and model, so predictions are
// memoized; during incremental drawing only the candidate the latest stroke
// changed pays an ONNX run, and stable candidates upgrade instantly.
function predictionCacheFor(dictionary: Dictionary, config: MlConfig) {
	return scopedLruCache<MlPrediction>(
		dictionary,
		`ml:${config.modelUrl}:${config.classMapUrl}`,
		512
	);
}

async function predictCandidateSingle(
	candidate: SymbolCandidate,
	dictionary: Dictionary,
	runtime: MlRuntime,
	config: MlConfig
): Promise<MlPrediction> {
	const cache = predictionCacheFor(dictionary, config);
	const cacheKey = candidateContentKey(candidate);
	const cached = cache.get(cacheKey);
	if (cached) {
		return cached;
	}
	if (runtime.warmupPromise) {
		await runtime.warmupPromise;
	}
	const input = renderCandidateTensor(candidate, config);
	const inputName = runtime.session.inputNames[0];
	const feeds: OrtFeeds = {
		[inputName]: new ort.Tensor('float32', input, [1, 1, config.inputSize, config.inputSize])
	};
	const results = await runtime.session.run(feeds);
	const outputs = predictionOutputs(results);
	const prediction = predictionFromOutputs(
		runtime,
		dictionary,
		outputs.logitsTensor,
		outputs.angleTensor,
		outputs.scaleTensor,
		outputs.centerTensor,
		0
	);
	cache.set(cacheKey, prediction);
	return prediction;
}

async function predictCandidateSingles(
	candidates: SymbolCandidate[],
	dictionary: Dictionary,
	runtime: MlRuntime,
	config: MlConfig,
	shouldContinue?: ShouldContinue
): Promise<MlPrediction[] | null> {
	const predictions: MlPrediction[] = [];
	for (const candidate of candidates) {
		if (shouldContinue && !shouldContinue()) {
			return null;
		}
		predictions.push(await predictCandidateSingle(candidate, dictionary, runtime, config));
		if (shouldContinue && !shouldContinue()) {
			return null;
		}
	}
	return predictions;
}

async function predictCandidates(
	candidates: SymbolCandidate[],
	dictionary: Dictionary,
	runtime: MlRuntime,
	config: MlConfig,
	shouldContinue?: ShouldContinue
): Promise<MlPrediction[] | null> {
	if (!candidates.length) {
		return [];
	}

	if (candidates.length === 1 || !runtime.batchSupported) {
		return predictCandidateSingles(candidates, dictionary, runtime, config, shouldContinue);
	}

	try {
		return await predictCandidateBatch(candidates, dictionary, runtime, config, shouldContinue);
	} catch (error) {
		runtime.batchSupported = false;
		debugLog(config, 'batched inference unavailable; retrying single-candidate inference', {
			candidates: candidates.length,
			error: describeError(error)
		});
		return predictCandidateSingles(candidates, dictionary, runtime, config, shouldContinue);
	}
}

function attachMlDiagnostics(
	template: RecognizedSymbol,
	ml: MlPrediction,
	accepted: boolean,
	reason?: string,
	decision?: MlAcceptanceDecision
): RecognizedSymbol {
	return {
		...template,
		diagnostics: {
			...template.diagnostics,
			ml: {
				available: ml.available,
				accepted,
				confidence: ml.confidence,
				margin: decision?.margin ?? mlConfidenceMargin(ml),
				id: ml.id,
				kind: ml.kind,
				angleDeg: ml.angleDeg,
				scaleX: ml.scaleX,
				scaleY: ml.scaleY,
				centerX: ml.centerX,
				centerY: ml.centerY,
				superConfident: decision?.superConfident,
				verifierPassed: decision?.verifierPassed,
				reason: reason ?? ml.reason,
				topMatches: ml.topMatches
			}
		}
	};
}

function attachUnavailableMlDiagnostics(
	template: RecognizedSymbol,
	reason: string
): RecognizedSymbol {
	return {
		...template,
		diagnostics: {
			...template.diagnostics,
			ml: {
				available: false,
				accepted: false,
				confidence: 0,
				margin: 0,
				id: null,
				kind: 'unknown',
				angleDeg: 0,
				scaleX: 0,
				scaleY: 0,
				centerX: 0,
				centerY: 0,
				reason,
				error: runtimeUnavailableReason || undefined,
				topMatches: []
			}
		}
	};
}

function mlConfidenceMargin(ml: MlPrediction): number {
	const first = ml.topMatches[0]?.confidence ?? ml.confidence;
	const second = ml.topMatches[1]?.confidence ?? 0;
	return Math.max(0, first - second);
}

function templateVerifierPassed(template: RecognizedSymbol): boolean {
	if (template.recognitionStatus === 'contaminated') {
		return false;
	}
	if (template.recognized || template.recognitionStatus === 'ambiguous') {
		return true;
	}

	const templateMatch = template.diagnostics.template ?? {};
	const structure = template.diagnostics.structure ?? {};
	const bestGuessConfidence =
		template.diagnostics.bestGuess?.confidence ??
		template.diagnostics.topMatches[0]?.confidence ??
		0;
	const candidateExplainedRatio = templateMatch.candidateExplainedRatio ?? 0;
	const templateCoveredRatio = templateMatch.templateCoveredRatio ?? 0;
	const unexplainedInkRatio = templateMatch.unexplainedInkRatio ?? 1;
	const structureScore = structure.score ?? 0;

	const enoughTemplateSignal = bestGuessConfidence >= 0.36;
	const enoughInkSignal =
		candidateExplainedRatio >= 0.42 && templateCoveredRatio >= 0.34 && unexplainedInkRatio <= 0.72;
	const enoughStructureSignal = structureScore >= 0.5;

	return enoughTemplateSignal && (enoughInkSignal || enoughStructureSignal);
}

function regionGeometryRejected(ml: MlPrediction, candidate: SymbolCandidate): boolean {
	if (ml.kind !== 'sign' || ml.id !== REGION_SIGN_ID) {
		return false;
	}

	return (
		lineSpreadRatio(candidate.strokes.flatMap((stroke) => stroke.points ?? [])) <
		REGION_MIN_LINE_SPREAD
	);
}

export function acceptMlResult(
	template: RecognizedSymbol,
	ml: MlPrediction,
	config: MlConfig,
	candidate: SymbolCandidate
): MlAcceptanceDecision {
	const margin = mlConfidenceMargin(ml);
	const superConfident = ml.confidence >= config.superConfidence && margin >= config.superMargin;
	const verifierPassed = templateVerifierPassed(template);
	const reject = (reason: string): MlAcceptanceDecision => ({
		accept: false,
		reason,
		margin,
		superConfident,
		verifierPassed
	});
	const accept = (reason: string): MlAcceptanceDecision => ({
		accept: true,
		reason,
		margin,
		superConfident,
		verifierPassed
	});

	if (!ml.entry || ml.kind === 'unknown') {
		return reject('unknown_class');
	}
	if (!layerAccepts(ml.entry, candidate)) {
		return reject('layer_rejected');
	}
	if (regionGeometryRejected(ml, candidate)) {
		return reject('region_geometry_rejected');
	}
	if (template.recognized && template.id === ml.id) {
		if (
			ml.confidence > template.confidence &&
			(superConfident ||
				(ml.confidence >= config.acceptConfidence && margin >= config.acceptMargin))
		) {
			return accept('reinforced_template');
		}
		return reject('agrees_with_template');
	}
	if (superConfident) {
		return accept(template.recognized ? 'super_confident_override' : 'super_confident_accept');
	}
	if (!template.recognized && !verifierPassed) {
		return reject(
			template.recognitionStatus === 'contaminated'
				? 'verifier_rejected_contaminated'
				: 'verifier_rejected_unknown_template'
		);
	}
	if (!template.recognized && ml.confidence >= config.acceptConfidence) {
		if (margin < config.acceptMargin) {
			return reject('ml_margin_below_accept');
		}
		return accept('accepted_verified_unknown_template');
	}
	if (
		template.recognized &&
		template.id !== ml.id &&
		ml.confidence >= config.overrideConfidence &&
		ml.confidence >= template.confidence + config.overrideMargin &&
		margin >= config.acceptMargin
	) {
		return accept('overrode_template');
	}
	if (ml.confidence < config.acceptConfidence) {
		return reject('ml_confidence_below_accept');
	}
	if (margin < config.acceptMargin) {
		return reject('ml_margin_below_accept');
	}
	return reject('template_preferred');
}

function applyMlResult(
	template: RecognizedSymbol,
	ml: MlPrediction,
	config: MlConfig,
	candidate: SymbolCandidate
): RecognizedSymbol {
	const decision = acceptMlResult(template, ml, config, candidate);
	debugLog(config, 'decision', {
		candidate: candidate.candidateId,
		template: {
			recognized: template.recognized,
			status: template.recognitionStatus,
			kind: template.kind,
			id: template.id,
			confidence: Number(template.confidence.toFixed(3))
		},
		ml: {
			accepted: decision.accept,
			reason: decision.reason,
			kind: ml.kind,
			id: ml.id,
			confidence: Number(ml.confidence.toFixed(3)),
			margin: Number(decision.margin.toFixed(3)),
			superConfident: decision.superConfident,
			verifierPassed: decision.verifierPassed
		}
	});
	if (!decision.accept || !ml.entry) {
		return attachMlDiagnostics(template, ml, false, decision.reason, decision);
	}

	return attachMlDiagnostics(
		{
			...template,
			recognized: true,
			recognitionStatus: 'valid',
			kind: ml.kind,
			id: ml.entry.id,
			displayName: ml.entry.displayName,
			element: ml.entry.element ?? null,
			semantic: ml.entry.semantic ?? null,
			confidence: ml.confidence,
			diagnostics: {
				...template.diagnostics,
				bestGuess: null,
				topMatches: [
					{
						kind: ml.kind,
						id: ml.entry.id,
						confidence: ml.confidence,
						source: 'ml' as const,
						mlConfidence: ml.confidence
					},
					...template.diagnostics.topMatches
				].slice(0, 3)
			}
		},
		ml,
		true,
		decision.reason,
		decision
	);
}

export async function recognizeCandidatesHybridMl(
	candidates: SymbolCandidate[],
	templateResults: RecognizedSymbol[],
	dictionary: Dictionary,
	config: AppConfig,
	shouldContinue?: ShouldContinue,
	onProgress?: MlProgress
): Promise<RecognizedSymbol[]> {
	const cfg = mlConfig(config);
	debugLog(cfg, 'hybrid recognizer called', {
		candidates: candidates.length,
		templateResults: templateResults.length
	});
	if (!candidates.length) {
		debugLog(cfg, 'skipping ml runtime load; no candidates');
		return templateResults;
	}

	const runtime = await loadRuntime(cfg);
	if (shouldContinue && !shouldContinue()) {
		debugLog(cfg, 'template-only result returned; request superseded before inference');
		return templateResults;
	}
	if (!runtime) {
		debugLog(cfg, 'template-only result returned');
		return templateResults.map((result) =>
			attachUnavailableMlDiagnostics(result, 'runtime_unavailable')
		);
	}

	try {
		if (candidates.length === 1 || !runtime.batchSupported) {
			const results = [...templateResults];
			const predictions: MlPrediction[] = [];
			for (let index = 0; index < candidates.length; index += 1) {
				if (shouldContinue && !shouldContinue()) {
					debugLog(cfg, 'template-only result returned; request superseded during inference');
					return templateResults;
				}
				const prediction = await predictCandidateSingle(
					candidates[index],
					dictionary,
					runtime,
					cfg
				);
				if (shouldContinue && !shouldContinue()) {
					debugLog(cfg, 'template-only result returned; request superseded during inference');
					return templateResults;
				}
				predictions.push(prediction);
				results[index] = applyMlResult(templateResults[index], prediction, cfg, candidates[index]);
				onProgress?.([...results]);
			}
			debugLog(
				cfg,
				'predictions ready',
				predictions.map((prediction, index) => ({
					candidate: candidates[index]?.candidateId,
					id: prediction.id,
					kind: prediction.kind,
					confidence: Number(prediction.confidence.toFixed(3)),
					topMatches: prediction.topMatches.map((match) => ({
						id: match.id,
						confidence: Number(match.confidence.toFixed(3))
					}))
				}))
			);
			return results;
		}

		const predictions = await predictCandidates(
			candidates,
			dictionary,
			runtime,
			cfg,
			shouldContinue
		);
		if (!predictions) {
			debugLog(cfg, 'template-only result returned; request superseded during inference');
			return templateResults;
		}
		debugLog(
			cfg,
			'predictions ready',
			predictions.map((prediction, index) => ({
				candidate: candidates[index]?.candidateId,
				id: prediction.id,
				kind: prediction.kind,
				confidence: Number(prediction.confidence.toFixed(3)),
				topMatches: prediction.topMatches.map((match) => ({
					id: match.id,
					confidence: Number(match.confidence.toFixed(3))
				}))
			}))
		);
		return templateResults.map((template, index) =>
			applyMlResult(template, predictions[index], cfg, candidates[index])
		);
	} catch (error) {
		debugLog(cfg, 'failed during inference; using template recognizer only', error, 'warn');
		return templateResults.map((result) =>
			attachUnavailableMlDiagnostics(result, 'inference_failed')
		);
	}
}

function startRuntimeWarmup(runtime: MlRuntime, config: MlConfig): void {
	if (runtime.warmed || runtime.warmupPromise) {
		return;
	}

	runtime.warmupPromise = (async () => {
		try {
			const input = new Float32Array(config.inputSize * config.inputSize).fill(-1);
			const inputName = runtime.session.inputNames[0];
			await runtime.session.run({
				[inputName]: new ort.Tensor('float32', input, [1, 1, config.inputSize, config.inputSize])
			});
			runtime.warmed = true;
			debugLog(config, 'warm inference complete');
		} catch (error) {
			debugLog(config, 'warm inference failed', { error: describeError(error) }, 'warn');
		} finally {
			runtime.warmupPromise = undefined;
		}
	})();
}

export function warmMlRecognizer(config: AppConfig): void {
	const cfg = mlConfig(config);
	void loadRuntime(cfg).then((runtime) => {
		if (runtime) {
			startRuntimeWarmup(runtime, cfg);
		}
	});
}
