import type { SampleSymbol } from './symbols.js';

type Strategy<T> = () => T | null;

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

/**
 * Weight a sign by how far it trails the best-covered sign: the current highest count sets the
 * balancing target, and the gap is squared so lower-count signs get exponentially more chances.
 */
export function samplePromptWeight(symbol: SampleSymbol, countsBySign: SampleCountLookup): number {
	const counts = Object.values(countsBySign);
	const targetCount = counts.length ? Math.max(...counts) : 0;
	const currentCount = sampleCountForSymbol(symbol.id, countsBySign);
	const deficitWeight = Math.max(1, targetCount - currentCount + 1);
	return deficitWeight * deficitWeight;
}

export class SamplePicker<T> {
	current = $state<T | null>(null);
	readonly #strategy: Strategy<T>;

	constructor(strategy: Strategy<T>) {
		this.#strategy = strategy;
	}

	suggest(): void {
		this.current = this.#strategy();
	}

	pick(item: T): void {
		this.current = item;
	}
}

export const uniformSample =
	<T>(arr: T[]): Strategy<T> =>
	() =>
		arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

/**
 * Pick signs by deficit rather than uniformly, biasing toward the ones we lack the most examples
 * of (see {@link samplePromptWeight}). `counts` is a getter rather than a snapshot so the strategy
 * reads the latest (reactive) sample counts each time it's invoked, keeping the count weighting out
 * of the components that just preview the pick.
 */
export const weightedSample =
	(
		symbols: SampleSymbol[],
		counts: () => SignSampleCount[],
		random: () => number = Math.random
	): Strategy<SampleSymbol> =>
	() => {
		if (!symbols.length) return null;

		const countsBySign = createSampleCountLookup(counts());
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
	};
