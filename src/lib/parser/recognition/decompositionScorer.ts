/**
 * @file The wholeness scorer grouping asks about each stroke group.
 *
 * Wholeness answers "how much does this ink read as one complete glyph?"
 * rather than "which glyph is it?". It is the best shape match over the
 * dictionary examples, times the layer fit, discounted for template ink the
 * group leaves uncovered and for a footprint far from the entry's regular
 * size, so half a glyph and a stray tick both score low even when their
 * shapes match some template well.
 */
import { clamp } from '../../utils/geometry.js';
import { candidateContentKey, scopedLruCache } from '../recognitionMemo.js';
import { recognitionPlanForSymbol } from '../signRotation.js';
import { scoreRecognitionExample, type RecognitionExample } from '../shape-matcher/index.js';
import type { AppConfig, Dictionary, RecognitionKind, SymbolCandidate } from '../../types.js';
import {
	DECOMPOSITION_COVERAGE_FLOOR,
	DECOMPOSITION_COVERAGE_FULL,
	DECOMPOSITION_DOMINANT_SIGIL_SCORE,
	DECOMPOSITION_SIZE_RATIO_FADE,
	DECOMPOSITION_SIZE_RATIO_MAX,
	DECOMPOSITION_SIZE_RATIO_MIN
} from './constants.js';
import {
	examplesByRecognitionKey,
	recognitionEntriesFor,
	type RecognitionEntry
} from './entries.js';
import { recognitionExamplesFor } from './examples.js';
import { allowedLayerScore } from './thresholds.js';
import type { DecompositionMatch, DecompositionScorer } from './types.js';

const NO_MATCH: DecompositionMatch = {
	wholeness: 0,
	coveredRatio: 0,
	sizeRatio: 1,
	kind: 'unknown',
	id: null
};

/** Discounts a match for template ink the candidate never explains. */
function coverageFactor(coveredRatio: number): number {
	return clamp(
		(coveredRatio - DECOMPOSITION_COVERAGE_FLOOR) /
			(DECOMPOSITION_COVERAGE_FULL - DECOMPOSITION_COVERAGE_FLOOR)
	);
}

/** Discounts a match whose footprint is far from the entry's regular size. */
function sizePrior(kind: RecognitionKind, sizeRatio: number): number {
	if (sizeRatio < DECOMPOSITION_SIZE_RATIO_MIN) {
		return clamp(sizeRatio / DECOMPOSITION_SIZE_RATIO_MIN);
	}
	const ceiling =
		kind === 'sign' ? DECOMPOSITION_SIZE_RATIO_MAX.sign : DECOMPOSITION_SIZE_RATIO_MAX.sigil;
	if (sizeRatio > ceiling) {
		return clamp(1 - (sizeRatio - ceiling) / DECOMPOSITION_SIZE_RATIO_FADE);
	}
	return 1;
}

/** Creates the cached wholeness scorer for one dictionary. */
export function createDecompositionScorer(
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[] = []
): DecompositionScorer {
	const allExamples = recognitionExamplesFor(dictionary, recognitionExamples);
	const entries = recognitionEntriesFor(dictionary, examplesByRecognitionKey(allExamples));
	const defaultReferenceSize = config.renderer.effectSize.defaultReferenceSizeNorm;
	const cache = scopedLruCache<DecompositionMatch>(
		dictionary,
		`decomposition:${allExamples.map((example) => example.id).join(',')}:${defaultReferenceSize}`,
		2048
	);

	const bestForEntry = (
		{ kind, entry, examples }: RecognitionEntry,
		candidate: SymbolCandidate
	): DecompositionMatch => {
		const layerScore = allowedLayerScore(entry, candidate);
		if (layerScore < 0.5) {
			return NO_MATCH;
		}
		const plan = recognitionPlanForSymbol(kind, entry, candidate);
		const sizeRatio = candidate.sizeNorm / (entry.referenceSizeNorm ?? defaultReferenceSize);
		let best = NO_MATCH;
		for (const example of examples) {
			// Chamfer picks the rotation and $P refines only that one. Grouping
			// scores dozens of groups per drawing, and the full rotation search showed.
			const match = scoreRecognitionExample(plan.candidate.strokes, example, {
				...plan.options,
				chamferLeadsRotation: true
			});
			const coveredRatio = match.templateCoveredRatio;
			const wholeness =
				match.confidence * layerScore * coverageFactor(coveredRatio) * sizePrior(kind, sizeRatio);
			if (wholeness > best.wholeness) {
				best = { wholeness, coveredRatio, sizeRatio, kind, id: entry.id };
			}
		}
		return best;
	};

	return (candidate: SymbolCandidate): DecompositionMatch => {
		const cacheKey = candidateContentKey(candidate);
		const cached = cache.get(cacheKey);
		if (cached) {
			return cached;
		}
		let best = NO_MATCH;
		for (const entry of entries) {
			// A clear sigil is never a sign, so sign scoring waits for a weak sigil read.
			if (entry.kind === 'sign' && best.wholeness >= DECOMPOSITION_DOMINANT_SIGIL_SCORE) {
				break;
			}
			const match = bestForEntry(entry, candidate);
			if (match.wholeness > best.wholeness) {
				best = match;
			}
		}
		cache.set(cacheKey, best);
		return best;
	};
}
