import { analyzeStrokes, type AnalysisResult } from './sigilDetector.js';
import type { AppConfig, Dictionary, Stroke } from '../types.js';

// Latest-wins channel to a single off-thread analysis worker. The detector lab
// only ever cares about the most recent drawing, so at most one analysis is in
// flight at a time and any frames that arrive while the worker is busy collapse
// into a single pending request (intermediate ones are dropped). The result of
// each analysis therefore trails the live ink by ~one analysis, while the main
// thread stays free for drawing. Falls back to a synchronous analysis when
// workers are unavailable, so callers get an identical AnalysisResult either way.

interface AnalyzeRequest {
	strokes: Stroke[];
	mode: string;
	canvasWidth: number;
	canvasHeight: number;
}

interface WorkerResponse {
	id: number;
	result?: AnalysisResult;
	error?: string;
}

let worker: Worker | null = null;
let sessionDictionary: Dictionary | null = null;
let sessionConfig: AppConfig | null = null;

let nextId = 1;
let inFlightId: number | null = null;
let pending: AnalyzeRequest | null = null;
let resultHandler: ((result: AnalysisResult) => void) | null = null;

function workersSupported(): boolean {
	return typeof Worker !== 'undefined' && typeof URL !== 'undefined';
}

function flush(): void {
	if (!worker || pending === null || inFlightId !== null) {
		return;
	}
	inFlightId = nextId;
	nextId += 1;
	worker.postMessage({ type: 'analyze', id: inFlightId, ...pending });
	pending = null;
}

function ensureWorker(dictionary: Dictionary, config: AppConfig): Worker | null {
	if (!workersSupported()) {
		return null;
	}
	// Rebuilt only when the dictionary or config reference changes (stable between
	// reloads), so the worker — and its warm per-entry caches — persists for the
	// whole session rather than being recreated per request.
	if (worker && sessionDictionary === dictionary && sessionConfig === config) {
		return worker;
	}

	disposeSigilAnalysis();
	try {
		const created = new Worker(new URL('./sigilAnalysisWorker.ts', import.meta.url), {
			type: 'module'
		});
		created.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const { id, result, error } = event.data ?? {};
			if (id !== inFlightId) {
				return; // stale response for a superseded request
			}
			inFlightId = null;
			if (!error && result) {
				resultHandler?.(result);
			}
			flush(); // run whatever queued up while the worker was busy
		};
		created.onerror = () => disposeSigilAnalysis();
		created.postMessage({ type: 'init', dictionary, config });

		worker = created;
		sessionDictionary = dictionary;
		sessionConfig = config;
		return worker;
	} catch {
		disposeSigilAnalysis();
		return null;
	}
}

/**
 * Requests an analysis of the current drawing. Coalesces with any request still
 * in flight (latest wins) and delivers the result via `onResult`. `dictionary`,
 * `config`, and `strokes` must be plain (non-reactive) data so they can be
 * cloned to the worker — snapshot Svelte state before passing it in.
 */
export function requestSigilAnalysis(
	dictionary: Dictionary,
	config: AppConfig,
	strokes: Stroke[],
	mode: string,
	canvasWidth: number,
	canvasHeight: number,
	onResult: (result: AnalysisResult) => void
): void {
	const active = ensureWorker(dictionary, config);
	resultHandler = onResult;

	if (!active) {
		// No worker (unsupported or failed to start): analyze inline so the lab
		// still works, accepting that this blocks the main thread.
		onResult(analyzeStrokes({ strokes, dictionary, mode, canvasWidth, canvasHeight, config }));
		return;
	}

	pending = { strokes, mode, canvasWidth, canvasHeight };
	flush();
}

/** Terminates the worker and clears channel state. Call when the lab unmounts. */
export function disposeSigilAnalysis(): void {
	if (worker) {
		worker.terminate();
	}
	worker = null;
	sessionDictionary = null;
	sessionConfig = null;
	inFlightId = null;
	pending = null;
	resultHandler = null;
}
