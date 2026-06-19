import * as ort from 'onnxruntime-web/webgpu';
import { candidateContentKey, scopedLruCache } from '../recognitionMemo.js';
import type { Dictionary, SymbolCandidate, TopMatch } from '../../types.js';
import { debugLog, describeError } from './config.js';
import { dictionaryEntry } from './dictionary.js';
import {
	canonicalCandidateFromEntry,
	renderCandidatesTensor,
	renderCandidateTensor
} from './rendering.js';
import type { MlConfig, MlPrediction, MlRuntime, OrtFeeds, ShouldContinue } from './types.js';

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

function predictionOutputs(results: ort.InferenceSession.ReturnType) {
	return {
		logitsTensor: outputTensor(results, ['class_logits', 'logits'], 0),
		angleTensor: outputTensor(results, ['angle'], 1),
		scaleTensor: outputTensor(results, ['scale'], 2),
		centerTensor: outputTensor(results, ['center'], 3)
	};
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

async function canonicalAngleForEntry(
	entry: NonNullable<MlPrediction['entry']>,
	runtime: MlRuntime,
	config: MlConfig
): Promise<number | null> {
	const candidate = canonicalCandidateFromEntry(entry);
	if (!candidate) {
		return null;
	}
	const input = renderCandidateTensor(candidate, config);
	const inputName = runtime.session.inputNames[0];
	const results = await runtime.session.run({
		[inputName]: new ort.Tensor('float32', input, [1, 1, config.inputSize, config.inputSize])
	});
	const angle = outputTensor(results, ['angle'], 1).data as Float32Array;
	return Math.atan2(angle[0] ?? 0, angle[1] ?? 1) * (180 / Math.PI);
}

/** Computes canonical glyph pose offsets once per loaded runtime. */
export function ensureCanonicalAngles(
	dictionary: Dictionary,
	runtime: MlRuntime,
	config: MlConfig
): Promise<Map<string, number>> {
	if (!runtime.canonicalAnglesPromise) {
		runtime.canonicalAnglesPromise = (async () => {
			const angles = new Map<string, number>();
			for (const entry of [...dictionary.sigils, ...dictionary.signs]) {
				try {
					const angle = await canonicalAngleForEntry(entry, runtime, config);
					if (angle !== null) {
						angles.set(entry.id, angle);
					}
				} catch (error) {
					debugLog(config, 'canonical angle failed', { id: entry.id, error: describeError(error) });
				}
			}
			debugLog(config, 'canonical angles ready', { count: angles.size });
			return angles;
		})();
	}
	return runtime.canonicalAnglesPromise;
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

function predictionCacheFor(dictionary: Dictionary, config: MlConfig) {
	return scopedLruCache<MlPrediction>(
		dictionary,
		`ml:${config.modelUrl}:${config.classMapUrl}`,
		512
	);
}

/** Predicts one candidate, using the per-dictionary ML prediction cache. */
export async function predictCandidateSingle(
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

/** Predicts a candidate set, falling back from batch inference to singles if needed. */
export async function predictCandidates(
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
