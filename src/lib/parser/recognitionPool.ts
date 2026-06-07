import { recognizeCandidates } from './symbolRecognizer.js';
import type { AppConfig, Dictionary, RecognizedSymbol, SymbolCandidate } from '../types.js';
import type { RecognitionExample } from './shapeMatcher.js';

// Final candidate recognition is the dominant cost once decomposition is cheap,
// and each candidate is scored independently. This module fans those per-
// candidate scores across a long-lived Web Worker pool. When learned examples
// are loaded, even a single candidate can be expensive, so it also goes through
// a worker. The pool degrades to the synchronous recognizer when workers are
// unavailable or fail, so callers get an identical RecognizedSymbol[] regardless
// of which path runs.

const MIN_CANDIDATES_FOR_PARALLEL = 2;
const MAX_WORKERS = 8;
const EMPTY_EXAMPLES: RecognitionExample[] = [];

interface PoolWorker {
	worker: Worker;
	taskId: number | null;
}

interface InFlightTask {
	resolve: (value: RecognizedSymbol) => void;
	reject: (reason: unknown) => void;
}

interface QueuedTask {
	taskId: number;
	candidate: SymbolCandidate;
}

let pool: PoolWorker[] | null = null;
let sessionDictionary: Dictionary | null = null;
let sessionConfig: AppConfig | null = null;
let sessionExamples: RecognitionExample[] | null = null;
let nextTaskId = 1;
const inFlight = new Map<number, InFlightTask>();
const queue: QueuedTask[] = [];

function workersSupported(): boolean {
	return typeof Worker !== 'undefined' && typeof URL !== 'undefined';
}

function poolSize(): number {
	if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
		return Math.max(1, Math.min(MAX_WORKERS, navigator.hardwareConcurrency - 1));
	}
	return 4;
}

function rejectAllPending(reason: unknown): void {
	for (const task of inFlight.values()) {
		task.reject(reason);
	}
	inFlight.clear();
	queue.length = 0;
}

function teardownPool(reason?: unknown): void {
	rejectAllPending(reason ?? new Error('recognition pool torn down'));
	if (pool) {
		for (const entry of pool) {
			entry.worker.terminate();
		}
	}
	pool = null;
	sessionDictionary = null;
	sessionConfig = null;
	sessionExamples = null;
}

function pumpQueue(): void {
	if (!pool) {
		return;
	}
	for (const entry of pool) {
		if (entry.taskId !== null) {
			continue;
		}
		const next = queue.shift();
		if (!next) {
			break;
		}
		entry.taskId = next.taskId;
		entry.worker.postMessage({ type: 'recognize', id: next.taskId, candidate: next.candidate });
	}
}

function handleWorkerMessage(entry: PoolWorker, event: MessageEvent): void {
	const { id, result, error } = event.data ?? {};
	const task = typeof id === 'number' ? inFlight.get(id) : undefined;
	if (task) {
		inFlight.delete(id);
	}
	entry.taskId = null;
	if (task) {
		if (error) {
			task.reject(new Error(String(error)));
		} else {
			task.resolve(result as RecognizedSymbol);
		}
	}
	pumpQueue();
}

function ensurePool(
	dictionary: Dictionary,
	config: AppConfig,
	examples: RecognitionExample[]
): PoolWorker[] {
	// The pool is a fixed size for the whole session and reused across strokes.
	// It must NOT be rebuilt when the candidate count changes: each rebuild
	// re-clones the entire dictionary + learned assets into every worker via
	// postMessage, which is expensive and runs on the calling thread. Candidates
	// are instead queued across the existing workers (see pumpQueue), so a fixed
	// pool handles any number of candidates. Only a change to the dictionary or
	// learned assets (stable references between reloads) rebuilds it.
	if (
		pool &&
		sessionDictionary === dictionary &&
		sessionConfig === config &&
		sessionExamples === examples
	) {
		return pool;
	}

	teardownPool();

	const workers: PoolWorker[] = [];
	const size = poolSize();
	for (let index = 0; index < size; index += 1) {
		const worker = new Worker(new URL('./recognitionWorker.ts', import.meta.url), {
			type: 'module'
		});
		const entry: PoolWorker = { worker, taskId: null };
		worker.onmessage = (event) => handleWorkerMessage(entry, event);
		worker.onerror = () => teardownPool(new Error('recognition worker error'));
		worker.postMessage({
			type: 'init',
			dictionary,
			config,
			recognitionExamples: examples
		});
		workers.push(entry);
	}

	pool = workers;
	sessionDictionary = dictionary;
	sessionConfig = config;
	sessionExamples = examples;
	return workers;
}

function dispatch(candidate: SymbolCandidate): Promise<RecognizedSymbol> {
	return new Promise<RecognizedSymbol>((resolve, reject) => {
		const taskId = nextTaskId;
		nextTaskId += 1;
		inFlight.set(taskId, { resolve, reject });
		queue.push({ taskId, candidate });
		pumpQueue();
	});
}

export async function recognizeCandidatesAsync(
	candidates: SymbolCandidate[],
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[] = EMPTY_EXAMPLES
): Promise<RecognizedSymbol[]> {
	const examples = recognitionExamples.length ? recognitionExamples : EMPTY_EXAMPLES;
	const hasLearnedAssets = examples.length > 0;

	if (
		!workersSupported() ||
		(!hasLearnedAssets && candidates.length < MIN_CANDIDATES_FOR_PARALLEL)
	) {
		return recognizeCandidates(candidates, dictionary, config, examples);
	}

	try {
		ensurePool(dictionary, config, examples);
		return await Promise.all(candidates.map((candidate) => dispatch(candidate)));
	} catch {
		teardownPool();
		return recognizeCandidates(candidates, dictionary, config, examples);
	}
}

// Exposed so the UI can release workers when the parser is no longer mounted.
export function disposeRecognitionPool(): void {
	teardownPool();
}
