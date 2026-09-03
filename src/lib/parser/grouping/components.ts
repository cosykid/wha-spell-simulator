/**
 * @file Connected components over affinity. A component is the widest set of
 * strokes that could share a glyph, so partition search never crosses one.
 */
import type { AffinityMatrix } from './types.js';

/** Components of `indexes` linked by affinity at or above `minAffinity`, each sorted. */
export function affinityComponents(
	indexes: number[],
	affinity: AffinityMatrix,
	minAffinity: number
): number[][] {
	const visited = new Set<number>();
	const components: number[][] = [];
	for (const start of indexes) {
		if (visited.has(start)) {
			continue;
		}
		const component: number[] = [];
		const queue = [start];
		visited.add(start);
		while (queue.length) {
			const current = queue.shift()!;
			component.push(current);
			for (const next of indexes) {
				if (!visited.has(next) && affinity[current][next] >= minAffinity) {
					visited.add(next);
					queue.push(next);
				}
			}
		}
		components.push(component.sort((a, b) => a - b));
	}
	return components;
}

/**
 * Splits a component too large for the partition search by demanding stronger
 * links, step by step. A component that stays oversized even under the
 * strongest links is returned whole.
 */
export function boundedComponents(
	component: number[],
	affinity: AffinityMatrix,
	minAffinity: number,
	maxSize: number
): number[][] {
	if (component.length <= maxSize) {
		return [component];
	}
	const stricter = minAffinity + 0.2;
	if (stricter > 0.95) {
		return [component];
	}
	return affinityComponents(component, affinity, stricter).flatMap((piece) =>
		boundedComponents(piece, affinity, stricter, maxSize)
	);
}
