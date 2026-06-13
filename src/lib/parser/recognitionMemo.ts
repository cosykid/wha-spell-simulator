import type { Stroke, SymbolCandidate } from '../types.js';

// Memoization for the pure, expensive recognition passes. Every stroke commit
// reclassifies the whole drawing from scratch, so without a cache the template
// matcher re-scores every candidate (and every decomposition tree node) on every
// recompute even though only the newest stroke changed. Keys are content hashes
// of the candidate's strokes plus its ring-relative pose, so identical ink under
// an identical ring always reuses the previous score regardless of object
// identity (strokes are structured-cloned across the worker boundary).

export class LruCache<V> {
	private map = new Map<string, V>();

	constructor(private readonly capacity: number) {}

	get(key: string): V | undefined {
		if (!this.map.has(key)) {
			return undefined;
		}
		const value = this.map.get(key) as V;
		this.map.delete(key);
		this.map.set(key, value);
		return value;
	}

	set(key: string, value: V): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		}
		this.map.set(key, value);
		if (this.map.size > this.capacity) {
			const oldest = this.map.keys().next().value;
			if (oldest !== undefined) {
				this.map.delete(oldest);
			}
		}
	}
}

// Caches are scoped by an identity object (the dictionary) via WeakMap so a new
// dictionary snapshot can never serve stale results, plus a string key for the
// value-level inputs (example ids, thresholds, model URLs). The per-scope map is
// kept tiny: scope keys are stable in the app, and tests that vary them only pay
// a cold cache.
const MAX_SCOPE_KEYS = 4;
const scopeCaches = new WeakMap<object, Map<string, LruCache<unknown>>>();

export function scopedLruCache<V>(scope: object, scopeKey: string, capacity: number): LruCache<V> {
	let byKey = scopeCaches.get(scope);
	if (!byKey) {
		byKey = new Map();
		scopeCaches.set(scope, byKey);
	}
	let cache = byKey.get(scopeKey);
	if (!cache) {
		if (byKey.size >= MAX_SCOPE_KEYS) {
			byKey.clear();
		}
		cache = new LruCache<unknown>(capacity);
		byKey.set(scopeKey, cache);
	}
	return cache as LruCache<V>;
}

function strokeContentKey(stroke: Stroke): string {
	const points = stroke.points ?? [];
	let hashX = 0;
	let hashY = 0;
	for (const point of points) {
		hashX = ((hashX * 31) % 1e9) + point.x;
		hashY = ((hashY * 31) % 1e9) + point.y;
	}
	return `${stroke.id}#${points.length}#${hashX.toFixed(4)}#${hashY.toFixed(4)}`;
}

// The pose fields capture everything the ring contributes to recognition
// (layer, polar position, normalized size), so the ring itself does not need to
// be part of the key.
export function candidateContentKey(candidate: SymbolCandidate): string {
	return [
		candidate.layer,
		candidate.nearBoundary ? 1 : 0,
		candidate.radiusNorm.toFixed(4),
		candidate.angleDeg.toFixed(3),
		candidate.sizeNorm.toFixed(4),
		candidate.lengthNorm.toFixed(4),
		candidate.strokes.map(strokeContentKey).join('|')
	].join('~');
}
