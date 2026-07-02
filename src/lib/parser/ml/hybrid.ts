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

	// Calibration only adjusts rotation offsets, so it must not block prediction.
	// Use whatever angles are ready (empty on a cold start); progress results go
	// out immediately and a cold pass re-applies once calibration lands, before
	// returning its final result.
	const canonicalAngles = runtime.canonicalAngles ?? EMPTY_CANONICAL_ANGLES;

	try {
		let predictions: MlPrediction[];
		let results: RecognizedSymbol[];
		if (candidates.length === 1 || !runtime.batchSupported) {
			results = [...templateResults];
			predictions = [];
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
		} else {
			const batch = await predictCandidates(candidates, dictionary, runtime, cfg, shouldContinue);
			if (!batch) {
				debugLog(cfg, 'template-only result returned; request superseded during inference');
				return templateResults;
			}
			predictions = batch;
			results = templateResults.map((template, index) =>
				applyMlResult(template, predictions[index], cfg, candidates[index], canonicalAngles)
			);
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

		// Cold start: predictions above ran before the canonical-angle
		// calibration, so their facing offsets are unset. Wait for calibration
		// and re-apply, so the final result carries real facings and a sign is
		// never left acting as if its rotation were ignored.
		if (!canonicalAngles.size && predictions.length) {
			const calibrated = await ensureCanonicalAngles(dictionary, runtime, cfg);
			if (calibrated.size && (!shouldContinue || shouldContinue())) {
				debugLog(cfg, 'reapplying predictions with calibrated canonical angles', {
					angles: calibrated.size
				});
				results = templateResults.map((template, index) =>
					applyMlResult(template, predictions[index], cfg, candidates[index], calibrated)
				);
			}
		}
		return results;
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
