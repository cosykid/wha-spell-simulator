import { clamp } from '../../utils/geometry.js';
import type {
	StrokeTemplate,
	SymbolCandidate,
	TemplateMatch,
	TemplateMatchOptions
} from '../../types.js';
import { ROTATION_STABILITY_MARGIN } from './constants.js';
import { candidateInk, compareInk, templateInk } from './ink.js';
import { normalizedRotationMagnitude, rotationSet } from './rotations.js';

/**
 * Scores a grouped candidate directly against one stroke template.
 *
 * This matcher works entirely in normalized ink space and is useful for tools
 * that need a quick template-only comparison without full dictionary recognition.
 */
export function scoreStrokeTemplate(
	candidate: SymbolCandidate,
	strokeTemplate: StrokeTemplate,
	options: TemplateMatchOptions = {}
): TemplateMatch {
	if (!strokeTemplate?.strokes?.length) {
		return {
			available: false,
			confidence: 0,
			rotationDeg: 0,
			recognitionRotationDeg: 0,
			inkScore: 0,
			softDiceScore: 0,
			candidateExplainedRatio: 0,
			templateCoveredRatio: 0,
			unexplainedInkRatio: 1,
			missingInkRatio: 1,
			contaminationRisk: 1,
			requiredCellCoverage: 0,
			forbiddenCellInkRatio: 1,
			regionScore: 0
		};
	}

	const referenceInk = templateInk(strokeTemplate);

	let best = {
		rotationDeg: 0,
		rankingScore: -1,
		inkScore: 0,
		candidateExplainedRatio: 0,
		templateCoveredRatio: 0,
		softDiceScore: 0,
		unexplainedInkRatio: 1,
		missingInkRatio: 1,
		contaminationRisk: 1,
		requiredCellCoverage: 0,
		forbiddenCellInkRatio: 1,
		regionScore: 0
	};

	for (const rotationDeg of rotationSet(options)) {
		const inkMatch = compareInk(candidateInk(candidate, rotationDeg), referenceInk);
		const rotationPenalty = normalizedRotationMagnitude(rotationDeg) * ROTATION_STABILITY_MARGIN;
		const rankingScore = inkMatch.inkScore - rotationPenalty;
		if (rankingScore > best.rankingScore) {
			best = {
				rotationDeg,
				rankingScore,
				...inkMatch
			};
		}
	}

	const contaminationCap =
		best.unexplainedInkRatio > 0.36 && best.templateCoveredRatio < 0.82
			? clamp(0.62 - (best.unexplainedInkRatio - 0.36) * 0.8, 0.2, 1)
			: 1;

	return {
		available: true,
		confidence: Math.min(clamp(best.rankingScore), contaminationCap),
		rotationDeg: best.rotationDeg,
		recognitionRotationDeg: best.rotationDeg,
		inkScore: best.inkScore,
		softDiceScore: best.softDiceScore,
		candidateExplainedRatio: best.candidateExplainedRatio,
		templateCoveredRatio: best.templateCoveredRatio,
		unexplainedInkRatio: best.unexplainedInkRatio,
		missingInkRatio: best.missingInkRatio,
		contaminationRisk: best.contaminationRisk,
		requiredCellCoverage: best.requiredCellCoverage,
		forbiddenCellInkRatio: best.forbiddenCellInkRatio,
		regionScore: best.regionScore
	};
}
