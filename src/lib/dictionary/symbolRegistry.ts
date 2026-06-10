import type { SymbolEntryBase } from '../types.js';

/**
 * Id-keyed lookup for dictionary symbols. Construction registers every entry
 * and rejects duplicate ids, so a copy-pasted definition fails at startup
 * instead of silently entering the recognition corpus.
 */
export class SymbolRegistry<E extends SymbolEntryBase> {
	private readonly entries = new Map<string, E>();

	constructor(entries: readonly E[] = []) {
		for (const entry of entries) {
			this.register(entry);
		}
	}

	register(entry: E): void {
		if (this.entries.has(entry.id)) {
			throw new Error(`Duplicate dictionary symbol id: "${entry.id}"`);
		}
		this.entries.set(entry.id, entry);
	}

	has(id: string): boolean {
		return this.entries.has(id);
	}

	get(id: string): E | undefined {
		return this.entries.get(id);
	}

	require(id: string): E {
		const entry = this.entries.get(id);
		if (!entry) {
			throw new Error(`Unknown dictionary symbol id: "${id}". Known ids: ${this.ids().join(', ')}`);
		}
		return entry;
	}

	ids(): string[] {
		return [...this.entries.keys()];
	}

	all(): E[] {
		return [...this.entries.values()];
	}
}
