/**
 * @file Group hypotheses: the stroke sets the partition search may choose from.
 *
 * Geometry proposes first: every single stroke and every node of the
 * single-linkage merge tree over affinity, so each hypothesis is a spatially
 * coherent cluster. Recognition proposes second: once a hypothesis reads as a
 * clean glyph, whatever the component holds besides it is a hypothesis too.
 * That is how a sigil keeps its far dots when a sign sits closer to its body
 * than the dots do, because no chain of nearest neighbours passes the sign by.
 */
import type { CleanedStroke } from '../../types.js';
import { MAX_GROUP_STROKES, MAX_SYMBOL_SIZE_NORM } from './constants.js';
import type { ComponentContext, GroupHypothesis } from './types.js';

function fitsSymbol(strokes: CleanedStroke[], members: number[], ringRadius: number): boolean {
	if (!members.length || members.length > MAX_GROUP_STROKES) {
		return false;
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const index of members) {
		const bounds = strokes[index].metrics.bounds;
		minX = Math.min(minX, bounds.minX);
		minY = Math.min(minY, bounds.minY);
		maxX = Math.max(maxX, bounds.maxX);
		maxY = Math.max(maxY, bounds.maxY);
	}
	return Math.max(maxX - minX, maxY - minY) / Math.max(1, ringRadius * 2) <= MAX_SYMBOL_SIZE_NORM;
}

function membersOfMask(mask: number, count: number): number[] {
	const members: number[] = [];
	for (let index = 0; index < count; index += 1) {
		if (mask & (1 << index)) {
			members.push(index);
		}
	}
	return members;
}

/** The distinct groups proposed for one component, each at most one symbol in size. */
export class HypothesisSet {
	private readonly byMask = new Map<number, GroupHypothesis>();
	/** Bitmask naming every stroke of the component. */
	readonly full: number;

	constructor(
		private readonly strokes: CleanedStroke[],
		private readonly ringRadius: number
	) {
		this.full = (1 << strokes.length) - 1;
	}

	/** Records a group unless it is a repeat or too large to be a symbol. Returns what was added. */
	add(members: number[]): GroupHypothesis | null {
		const mask = members.reduce((bits, index) => bits | (1 << index), 0);
		if (this.byMask.has(mask) || !fitsSymbol(this.strokes, members, this.ringRadius)) {
			return null;
		}
		const hypothesis = { mask, members: [...members].sort((a, b) => a - b) };
		this.byMask.set(mask, hypothesis);
		return hypothesis;
	}

	addMask(mask: number): GroupHypothesis | null {
		return this.add(membersOfMask(mask, this.strokes.length));
	}
}

/** Every single stroke and every node of the single-linkage merge tree. */
export function proposeByAffinity(
	set: HypothesisSet,
	context: ComponentContext
): GroupHypothesis[] {
	const count = context.strokes.length;
	const added: GroupHypothesis[] = [];
	const keep = (hypothesis: GroupHypothesis | null) => {
		if (hypothesis) {
			added.push(hypothesis);
		}
	};
	for (let index = 0; index < count; index += 1) {
		keep(set.add([index]));
	}

	const edges: { a: number; b: number; affinity: number }[] = [];
	for (let a = 0; a < count; a += 1) {
		for (let b = a + 1; b < count; b += 1) {
			if (context.affinity[a][b] > 0) {
				edges.push({ a, b, affinity: context.affinity[a][b] });
			}
		}
	}
	edges.sort((x, y) => y.affinity - x.affinity || x.a - y.a || x.b - y.b);

	const parent = Array.from({ length: count }, (_, index) => index);
	const members = Array.from({ length: count }, (_, index) => [index]);
	const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
	for (const edge of edges) {
		const rootA = find(edge.a);
		const rootB = find(edge.b);
		if (rootA === rootB) {
			continue;
		}
		parent[rootB] = rootA;
		members[rootA] = [...members[rootA], ...members[rootB]];
		keep(set.add(members[rootA]));
	}
	return added;
}

/**
 * What the component holds besides one or two clean glyphs. Returns only the
 * groups this proposal added, so the caller values nothing twice.
 */
export function proposeLeftovers(set: HypothesisSet, clean: GroupHypothesis[]): GroupHypothesis[] {
	const added: GroupHypothesis[] = [];
	const keep = (mask: number) => {
		const hypothesis = mask ? set.addMask(mask) : null;
		if (hypothesis) {
			added.push(hypothesis);
		}
	};
	for (const first of clean) {
		keep(set.full & ~first.mask);
		for (const second of clean) {
			if (second !== first && !(second.mask & first.mask)) {
				keep(set.full & ~first.mask & ~second.mask);
			}
		}
	}
	return added;
}
