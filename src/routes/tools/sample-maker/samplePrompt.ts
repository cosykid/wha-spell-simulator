import type { SampleSymbol } from './symbols.js';

export interface SignSampleCount {
	signId: string;
	count: number;
}

export type SampleCountLookup = Record<string, number>;

export function createSampleCountLookup(counts: SignSampleCount[]): SampleCountLookup {
	return Object.fromEntries(
		counts.map((count) => [
			count.signId,
			Number.isFinite(count.count) ? Math.max(0, count.count) : 0
		])
	);
}

export function sampleCountForSymbol(symbolId: string, countsBySign: SampleCountLookup): number {
	return countsBySign[symbolId] ?? 0;
}

export function samplePromptWeight(symbol: SampleSymbol, countsBySign: SampleCountLookup): number {
	const counts = Object.values(countsBySign);
	const targetCount = counts.length ? Math.max(...counts) : 0;
	const currentCount = sampleCountForSymbol(symbol.id, countsBySign);
	const deficitWeight = Math.max(1, targetCount - currentCount + 1);
	return deficitWeight * deficitWeight;
}

/**
 * Pick signs by deficit rather than uniformly: the current highest-count sign sets
 * the balancing target, and lower-count signs get exponentially more chances.
 */
export function chooseSuggestedSymbol(
	symbols: SampleSymbol[],
	counts: SignSampleCount[],
	random: () => number = Math.random
): SampleSymbol | null {
	if (!symbols.length) return null;

	const countsBySign = createSampleCountLookup(counts);
	const weights = symbols.map((symbol) => samplePromptWeight(symbol, countsBySign));
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	let cursor = random() * totalWeight;

	for (let index = 0; index < symbols.length; index += 1) {
		cursor -= weights[index];
		if (cursor < 0) {
			return symbols[index];
		}
	}

	return symbols.at(-1) ?? null;
}
