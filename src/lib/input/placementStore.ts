import type { Placement, PlacementStore, PlacementTransform } from '../types.js';

export function createPlacementStore(): PlacementStore {
	let placements: Placement[] = [];
	let nextId = 1;

	return {
		add({ kind, sourceId, baseStrokes, transform }: Omit<Placement, 'id'>): Placement {
			const placement: Placement = {
				id: `p${nextId++}`,
				kind,
				sourceId,
				baseStrokes,
				transform: { ...transform }
			};
			placements = [...placements, placement];
			return placement;
		},

		update(id: string, patch: Partial<PlacementTransform>): Placement | null {
			placements = placements.map((placement) =>
				placement.id === id
					? { ...placement, transform: { ...placement.transform, ...patch } }
					: placement
			);
			return placements.find((placement) => placement.id === id) ?? null;
		},

		remove(id: string): Placement | null {
			const removed = placements.find((placement) => placement.id === id) ?? null;
			placements = placements.filter((placement) => placement.id !== id);
			return removed;
		},

		get(id: string): Placement | null {
			return placements.find((placement) => placement.id === id) ?? null;
		},

		clear(): void {
			placements = [];
			nextId = 1;
		},

		load(loaded: Placement[]): void {
			placements = loaded.map((placement) => ({
				...placement,
				transform: { ...placement.transform }
			}));
			nextId = placements.reduce((max, placement) => {
				const match = /^p(\d+)$/.exec(placement.id);
				return match ? Math.max(max, Number(match[1]) + 1) : max;
			}, 1);
		},

		getPlacements(): Placement[] {
			return placements;
		},

		count(): number {
			return placements.length;
		}
	};
}
