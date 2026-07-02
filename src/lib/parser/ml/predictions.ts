import * as ort from 'onnxruntime-web/webgpu';
import { candidateContentKey, scopedLruCache } from '../recognitionMemo.js';
import { normalizeAngleDeg } from '../../utils/geometry.js';
import type { Dictionary, DictionaryEntry, SymbolCandidate, TopMatch } from '../../types.js';
import { debugLog, describeError } from './config.js';
import { dictionaryEntry } from './dictionary.js';
import { runSession } from './sessionQueue.js';
import {
	canonicalCandidateFromEntry,
	renderCandidateTensor,
	type RenderableCandidate
} from './rendering.js';
import type { MlConfig, MlPrediction, MlRuntime, ShouldContinue } from './types.js';

// Pose test-time augmentation: the head is noisy on a single rotated render, so
// each candidate is rendered at these rotations and the de-rotated pose angles
// are combined with a circular median. The class is a summed-softmax vote across
// the same renders, which also rescues glyphs the model rejects at one rotation.
export const POSE_TTA_ROTATIONS_DEG = [0, 45, 90, 135, 180, 225, 270, 315];

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

function angleDegFromRow(angle: Float32Array, row: number): number {
	const offset = row * 2;
	return Math.atan2(angle[offset] ?? 0, angle[offset + 1] ?? 1) * (180 / Math.PI);
}

type PredictionOutputs = ReturnType<typeof predictionOutputs>;

/** One row of raw model outputs, before any TTA aggregation. */
interface RawRow {
	probs: Float32Array;
	angleDeg: number;
	scaleX: number;
	scaleY: number;
	centerX: number;
	centerY: number;
}

function extractRow(outputs: PredictionOutputs, runtime: MlRuntime, index: number): RawRow {
	const logits = outputs.logitsTensor.data as Float32Array;
	const dims = outputs.logitsTensor.dims ?? [];
	const classCount = Number(dims[dims.length - 1] ?? runtime.idxToId.length);
	const scale = outputs.scaleTensor.data as Float32Array;
	const center = outputs.centerTensor.data as Float32Array;
	const poseOffset = index * 2;
	return {
		probs: softmax(logits.subarray(index * classCount, index * classCount + classCount)),
		angleDeg: angleDegFromRow(outputs.angleTensor.data as Float32Array, index),
		scaleX: scale[poseOffset] ?? 0,
		scaleY: scale[poseOffset + 1] ?? 0,
		centerX: center[poseOffset] ?? 0,
		centerY: center[poseOffset + 1] ?? 0
	};
}

/** Runs a set of rendered inputs, one row each, batched when the runtime supports it. */
async function inferRows(
	inputs: Float32Array[],
	runtime: MlRuntime,
	config: MlConfig,
	shouldContinue?: ShouldContinue
): Promise<RawRow[] | null> {
	if (!inputs.length) {
		return [];
	}
	const size = config.inputSize;
	const pixels = size * size;
	const inputName = runtime.session.inputNames[0];

	if (runtime.batchSupported && inputs.length > 1) {
		try {
			const batch = new Float32Array(inputs.length * pixels);
			inputs.forEach((input, index) => batch.set(input, index * pixels));
			const results = await runSession(runtime, {
				[inputName]: new ort.Tensor('float32', batch, [inputs.length, 1, size, size])
			});
			const outputs = predictionOutputs(results);
			return inputs.map((_, index) => extractRow(outputs, runtime, index));
		} catch (error) {
			runtime.batchSupported = false;
			debugLog(config, 'batched inference unavailable; retrying single-row inference', {
				rows: inputs.length,
				error: describeError(error)
			});
		}
	}

	const rows: RawRow[] = [];
	for (const input of inputs) {
		if (shouldContinue && !shouldContinue()) {
			return null;
		}
		const results = await runSession(runtime, {
			[inputName]: new ort.Tensor('float32', input, [1, 1, size, size])
		});
		rows.push(extractRow(predictionOutputs(results), runtime, 0));
	}
	return rows;
}

/** Mean resultant length in [0, 1]; 1 means the angles are identical. */
function circularConcentration(anglesDeg: number[]): number {
	let sumX = 0;
	let sumY = 0;
	for (const deg of anglesDeg) {
		const rad = (deg * Math.PI) / 180;
		sumX += Math.cos(rad);
		sumY += Math.sin(rad);
	}
	return anglesDeg.length ? Math.hypot(sumX, sumY) / anglesDeg.length : 0;
}

/** Angle minimizing total circular distance to the set. Robust to a lone outlier. */
function circularMedianDeg(anglesDeg: number[]): number {
	let best = anglesDeg[0] ?? 0;
	let bestCost = Infinity;
	for (const candidate of anglesDeg) {
		let cost = 0;
		for (const other of anglesDeg) {
			cost += Math.abs(((other - candidate + 540) % 360) - 180);
		}
		if (cost < bestCost) {
			bestCost = cost;
			best = candidate;
		}
	}
	return best;
}

// The pose head tracks input rotation, so undoing the render rotation on each
// sample recovers estimates of the same true angle. sign is the model's
// equivariance direction (+1 = output grows with the rotation we applied).
function deRotate(angleOuts: number[], rotationsDeg: number[], sign: 1 | -1): number[] {
	return angleOuts.map((deg, index) => deg - sign * rotationsDeg[index]);
}

function aggregatePoseAngle(angleOuts: number[], rotationsDeg: number[], sign?: 1 | -1): number {
	// Before calibration fixes the model's sign, pick whichever direction makes
	// the de-rotated samples cluster; after, reuse the calibrated sign so a
	// candidate's pose and its canonical baseline share one convention.
	const chosen =
		sign != null
			? deRotate(angleOuts, rotationsDeg, sign)
			: circularConcentration(deRotate(angleOuts, rotationsDeg, 1)) >=
				  circularConcentration(deRotate(angleOuts, rotationsDeg, -1))
				? deRotate(angleOuts, rotationsDeg, 1)
				: deRotate(angleOuts, rotationsDeg, -1);
	return normalizeAngleDeg(circularMedianDeg(chosen));
}

function aggregateProbs(rows: RawRow[]): Float32Array {
	const summed = new Float32Array(rows[0].probs.length);
	for (const row of rows) {
		for (let i = 0; i < summed.length; i += 1) {
			summed[i] += row.probs[i];
		}
	}
	for (let i = 0; i < summed.length; i += 1) {
		summed[i] /= rows.length;
	}
	return summed;
}

function aggregatePrediction(
	rows: RawRow[],
	runtime: MlRuntime,
	dictionary: Dictionary
): MlPrediction {
	const probs = aggregateProbs(rows);
	const topMatches = topClassMatches(probs, runtime, dictionary);
	const best = topMatches[0];
	const resolved = best ? dictionaryEntry(dictionary, best.id) : null;
	const base = rows[0];
	return {
		available: true,
		id: resolved?.entry.id ?? best?.id ?? null,
		kind: resolved?.kind ?? 'unknown',
		entry: resolved?.entry ?? null,
		confidence: best?.confidence ?? 0,
		angleDeg: aggregatePoseAngle(
			rows.map((row) => row.angleDeg),
			POSE_TTA_ROTATIONS_DEG,
			runtime.poseRotationSign
		),
		scaleX: base.scaleX,
		scaleY: base.scaleY,
		centerX: base.centerX,
		centerY: base.centerY,
		topMatches
	};
}

function renderRotations(candidate: RenderableCandidate, config: MlConfig): Float32Array[] {
	return POSE_TTA_ROTATIONS_DEG.map((deg) => renderCandidateTensor(candidate, config, deg));
}

interface RenderedEntry {
	entry: DictionaryEntry;
	candidate: RenderableCandidate;
}

function renderCanonicalEntries(entries: DictionaryEntry[]): RenderedEntry[] {
	const rendered: RenderedEntry[] = [];
	for (const entry of entries) {
		const candidate = canonicalCandidateFromEntry(entry);
		if (candidate) {
			rendered.push({ entry, candidate });
		}
	}
	return rendered;
}

/** Calibrates each glyph's canonical pose angle, TTA-averaged, in one batched pass. */
async function canonicalAnglesTta(
	rendered: RenderedEntry[],
	runtime: MlRuntime,
	config: MlConfig
): Promise<Map<string, number>> {
	const angles = new Map<string, number>();
	if (!rendered.length) {
		return angles;
	}
	const inputs: Float32Array[] = [];
	for (const item of rendered) {
		inputs.push(...renderRotations(item.candidate, config));
	}
	const rows = await inferRows(inputs, runtime, config);
	if (!rows) {
		return angles;
	}

	// The canonical set spans every glyph, so it is the most reliable place to
	// vote on the model's equivariance sign once and reuse it for candidates.
	const stride = POSE_TTA_ROTATIONS_DEG.length;
	const outsPerEntry = rendered.map((_, index) =>
		rows.slice(index * stride, index * stride + stride).map((row) => row.angleDeg)
	);
	let concentrationPlus = 0;
	let concentrationMinus = 0;
	for (const outs of outsPerEntry) {
		concentrationPlus += circularConcentration(deRotate(outs, POSE_TTA_ROTATIONS_DEG, 1));
		concentrationMinus += circularConcentration(deRotate(outs, POSE_TTA_ROTATIONS_DEG, -1));
	}
	const sign: 1 | -1 = concentrationPlus >= concentrationMinus ? 1 : -1;
	runtime.poseRotationSign = sign;

	rendered.forEach((item, index) => {
		angles.set(
			item.entry.id,
			aggregatePoseAngle(outsPerEntry[index], POSE_TTA_ROTATIONS_DEG, sign)
		);
	});
	return angles;
}

/** Computes canonical glyph pose offsets once per loaded runtime. */
export function ensureCanonicalAngles(
	dictionary: Dictionary,
	runtime: MlRuntime,
	config: MlConfig
): Promise<Map<string, number>> {
	if (!runtime.canonicalAnglesPromise) {
		runtime.canonicalAnglesPromise = (async () => {
			const rendered = renderCanonicalEntries([...dictionary.sigils, ...dictionary.signs]);
			let angles: Map<string, number>;
			try {
				angles = await canonicalAnglesTta(rendered, runtime, config);
			} catch (error) {
				debugLog(config, 'canonical angle calibration failed', {
					error: describeError(error)
				});
				angles = new Map();
			}
			runtime.canonicalAngles = angles;
			debugLog(config, 'canonical angles ready', { count: angles.size });
			return angles;
		})();
	}
	return runtime.canonicalAnglesPromise;
}

function predictionCacheFor(dictionary: Dictionary, config: MlConfig) {
	return scopedLruCache<MlPrediction>(
		dictionary,
		`ml:${config.modelUrl}:${config.classMapUrl}`,
		512
	);
}

/** Predicts one candidate with pose TTA, using the per-dictionary prediction cache. */
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
	const rows = await inferRows(renderRotations(candidate, config), runtime, config);
	if (!rows) {
		throw new Error('ML inference returned no rows');
	}
	const prediction = aggregatePrediction(rows, runtime, dictionary);
	cache.set(cacheKey, prediction);
	return prediction;
}

/** Predicts a candidate set with pose TTA, batching all renders into one pass. */
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
	if (shouldContinue && !shouldContinue()) {
		return null;
	}
	if (runtime.warmupPromise) {
		await runtime.warmupPromise;
	}

	const inputs: Float32Array[] = [];
	for (const candidate of candidates) {
		inputs.push(...renderRotations(candidate, config));
	}
	if (shouldContinue && !shouldContinue()) {
		return null;
	}
	const rows = await inferRows(inputs, runtime, config, shouldContinue);
	if (!rows) {
		return null;
	}

	const stride = POSE_TTA_ROTATIONS_DEG.length;
	const cache = predictionCacheFor(dictionary, config);
	return candidates.map((candidate, index) => {
		const slice = rows.slice(index * stride, index * stride + stride);
		const prediction = aggregatePrediction(slice, runtime, dictionary);
		cache.set(candidateContentKey(candidate), prediction);
		return prediction;
	});
}
