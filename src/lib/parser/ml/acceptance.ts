import { lineSpreadRatio, normalizeAngleDeg } from '../../utils/geometry.js';
import type { RecognizedSymbol, SymbolCandidate } from '../../types.js';
import { REGION_MIN_LINE_SPREAD, REGION_SIGN_ID } from '../glyphConstants.js';
import { debugLog } from './config.js';
import { layerAccepts } from './dictionary.js';
import { getRuntimeUnavailableReason } from './runtime.js';
import type { MlAcceptanceDecision, MlConfig, MlPrediction } from './types.js';

/** Adds ML diagnostics to a template recognition without changing the template result. */
export function attachMlDiagnostics(
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

/** Adds diagnostics explaining why ML could not run. */
export function attachUnavailableMlDiagnostics(
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
				error: getRuntimeUnavailableReason() || undefined,
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

/** Decides whether ML should reinforce, override, or defer to template recognition. */
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

/** Applies an accepted ML result or attaches diagnostics when rejected. */
export function applyMlResult(
	template: RecognizedSymbol,
	ml: MlPrediction,
	config: MlConfig,
	candidate: SymbolCandidate,
	canonicalAngles: Map<string, number>
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
			referenceSizeNorm: ml.entry.referenceSizeNorm ?? null,
			confidence: ml.confidence,
			rotationOffsetDeg: normalizeAngleDeg(ml.angleDeg - (canonicalAngles.get(ml.entry.id) ?? 0)),
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
