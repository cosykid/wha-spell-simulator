/**
 * @file Exact cover over valued hypotheses: the partition of a component whose
 * groups sum to the highest value.
 *
 * States are bitmasks of covered strokes. Each step assigns the lowest
 * uncovered stroke to one hypothesis that holds it, so every partition is
 * enumerated once. Singles are always among the hypotheses, so a cover always
 * exists. Past the state budget the search hands over to a greedy cover.
 */
import { PARTITION_STATE_BUDGET } from './constants.js';
import type { ValuedGroup } from './types.js';

interface Step {
	value: number;
	choice: ValuedGroup | null;
}

function lowestUncovered(covered: number, full: number): number {
	const free = ~covered & full;
	return 31 - Math.clz32(free & -free);
}

function greedyCover(full: number, groups: ValuedGroup[]): ValuedGroup[] {
	const ranked = [...groups].sort((a, b) => b.value - a.value);
	const chosen: ValuedGroup[] = [];
	let covered = 0;
	while (covered !== full) {
		const next = ranked.find((group) => (group.mask & covered) === 0)!;
		chosen.push(next);
		covered |= next.mask;
	}
	return chosen;
}

/** The highest-value set of disjoint groups covering every stroke. */
export function bestPartition(strokeCount: number, groups: ValuedGroup[]): ValuedGroup[] {
	const full = (1 << strokeCount) - 1;
	const byLowestBit = new Map<number, ValuedGroup[]>();
	for (const group of groups) {
		const bit = 31 - Math.clz32(group.mask & -group.mask);
		byLowestBit.set(bit, [...(byLowestBit.get(bit) ?? []), group]);
	}

	const memo = new Map<number, Step>();
	let overBudget = false;
	const solve = (covered: number): Step => {
		if (covered === full) {
			return { value: 0, choice: null };
		}
		const known = memo.get(covered);
		if (known) {
			return known;
		}
		if (memo.size > PARTITION_STATE_BUDGET) {
			overBudget = true;
			return { value: -Infinity, choice: null };
		}
		let best: Step = { value: -Infinity, choice: null };
		for (const group of byLowestBit.get(lowestUncovered(covered, full)) ?? []) {
			if (group.mask & covered) {
				continue;
			}
			const rest = solve(covered | group.mask);
			const value = group.value + rest.value;
			if (value > best.value) {
				best = { value, choice: group };
			}
		}
		memo.set(covered, best);
		return best;
	};

	const root = solve(0);
	if (overBudget || !Number.isFinite(root.value)) {
		return greedyCover(full, groups);
	}
	const chosen: ValuedGroup[] = [];
	let covered = 0;
	for (let step = root; step.choice; step = solve(covered)) {
		chosen.push(step.choice);
		covered |= step.choice.mask;
		if (covered === full) {
			break;
		}
	}
	return chosen;
}
