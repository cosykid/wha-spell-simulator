import type { AppConfig, Dictionary, RecognizedSymbol, SymbolCandidate } from '../../types.js';
import { debugLog, mlConfig } from './config.js';
import { applyMlResult, attachUnavailableMlDiagnostics } from './acceptance.js';
import { ensureCanonicalAngles, predictCandidateSingle, predictCandidates } from './predictions.js';
import { loadRuntime } from './runtime.js';
import type { MlPrediction, MlProgress, ShouldContinue } from './types.js';

/** Rotation falls back to uncorrected (offset 0) until calibration finishes. */
const EMPTY_CANONICAL_ANGLES: Map<string, number> = new Map();

/**
 * Refines template recognition with ML predictions when the browser runtime is available.
 *
 * The template result is always the fallback and progress baseline. ML may
 * reinforce or override individual candidates only after verifier checks pass.
 */
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

	// Calibration only adjusts rendered rotation, so it must not block prediction.
	// Use whatever angles are ready (empty on a cold start) and kick off the
	// background calibration below, after this pass's predictions are queued.
	const canonicalAngles = runtime.canonicalAngles ?? EMPTY_CANONICAL_ANGLES;

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
				results[index] = applyMlResult(
					templateResults[index],
					prediction,
					cfg,
					candidates[index],
					canonicalAngles
				);
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
			applyMlResult(template, predictions[index], cfg, candidates[index], canonicalAngles)
		);
	} catch (error) {
		debugLog(cfg, 'failed during inference; using template recognizer only', error, 'warn');
		return templateResults.map((result) =>
			attachUnavailableMlDiagnostics(result, 'inference_failed')
		);
	} finally {
		// Warm calibration in the background for later recognitions. Memoized, so it
		// runs once; placed here so its GPU work queues after this pass's predictions
		// rather than blocking the first result behind an ~8s cold compile.
		void ensureCanonicalAngles(dictionary, runtime, cfg);
	}
}
