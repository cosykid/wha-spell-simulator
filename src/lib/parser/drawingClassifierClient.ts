import { classifyDrawingAsync, type ClassifyDrawingInput } from './classifier/index.js';
import { disposeRecognitionPool } from './recognitionPool.js';
import type { AppConfig, ClassifiedDrawing, Dictionary } from '../types.js';
import type { RecognitionExample } from './shape-matcher/index.js';

const EMPTY_EXAMPLES: RecognitionExample[] = [];
const SUPERSEDED_ERROR_NAME = 'DrawingClassifierSupersededError';

interface WorkerResponse {
	id: number;
	phase?: 'template' | 'ml';
	result?: ClassifiedDrawing;
	final?: boolean;
	error?: string;
}

interface ClientRequest {
	id: number;
	settled: boolean;
	resolve: (result: ClassifiedDrawing) => void;
	reject: (reason: unknown) => void;
	onMlResult?: (result: ClassifiedDrawing) => void;
}

let worker: Worker | null = null;
let sessionDictionary: Dictionary | null = null;
let sessionConfig: AppConfig | null = null;
let sessionExamples: RecognitionExample[] | null = null;
let nextId = 1;
let latestRequestId = 0;
const requests = new Map<number, ClientRequest>();

class DrawingClassifierSupersededError extends Error {
	constructor() {
		super('drawing classifier request superseded');
		this.name = SUPERSEDED_ERROR_NAME;
	}
}

export function isDrawingClassifierSuperseded(error: unknown): boolean {
	return error instanceof Error && error.name === SUPERSEDED_ERROR_NAME;
}

function workersSupported(): boolean {
	return typeof Worker !== 'undefined' && typeof URL !== 'undefined';
}

function rejectPending(reason: unknown): void {
	for (const request of requests.values()) {
		if (!request.settled) {
			request.reject(reason);
		}
	}
	requests.clear();
}

function postInit(
	created: Worker,
	dictionary: Dictionary,
	config: AppConfig,
	examples: RecognitionExample[]
) {
	created.postMessage({
		type: 'init',
		dictionary,
		config,
		recognitionExamples: examples
	});
}

function handleMessage(event: MessageEvent<WorkerResponse>): void {
	const { id, phase = 'ml', result, final = true, error } = event.data ?? {};
	const request = requests.get(id);
	if (!request) {
		return;
	}
	if (id !== latestRequestId) {
		if (!request.settled) {
			request.reject(new DrawingClassifierSupersededError());
		}
		requests.delete(id);
		return;
	}
	if (error) {
		if (!request.settled) {
			request.reject(new Error(error));
		}
		requests.delete(id);
		return;
	}
	if (!result) {
		if (!request.settled) {
			request.reject(new Error('drawing classifier worker returned no result'));
		}
		requests.delete(id);
		return;
	}

	if (phase === 'template' && !request.settled) {
		request.resolve(result);
		request.settled = true;
		return;
	}

	if (phase === 'ml') {
		if (request.settled) {
			request.onMlResult?.(result);
		} else {
			request.resolve(result);
			request.settled = true;
		}
		if (final) {
			requests.delete(id);
		}
	}
}

function ensureWorker(
	dictionary: Dictionary,
	config: AppConfig,
	examples: RecognitionExample[]
): Worker | null {
	if (!workersSupported()) {
		return null;
	}
	if (
		worker &&
		sessionDictionary === dictionary &&
		sessionConfig === config &&
		sessionExamples === examples
	) {
		return worker;
	}

	disposeDrawingClassifierClient();
	try {
		const created = new Worker(new URL('./drawingClassifierWorker.ts', import.meta.url), {
			type: 'module'
		});
		created.onmessage = handleMessage;
		created.onerror = () => disposeDrawingClassifierClient();
		postInit(created, dictionary, config, examples);

		worker = created;
		sessionDictionary = dictionary;
		sessionConfig = config;
		sessionExamples = examples;
		return worker;
	} catch {
		disposeDrawingClassifierClient();
		return null;
	}
}

export function warmDrawingClassifierWorker(
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[] = EMPTY_EXAMPLES
): void {
	const examples = recognitionExamples.length ? recognitionExamples : EMPTY_EXAMPLES;
	ensureWorker(dictionary, config, examples);
}

export function classifyDrawingOffThread(input: ClassifyDrawingInput): Promise<ClassifiedDrawing>;
export function classifyDrawingOffThread(
	input: ClassifyDrawingInput,
	onMlResult: (result: ClassifiedDrawing) => void
): Promise<ClassifiedDrawing>;
export function classifyDrawingOffThread(
	input: ClassifyDrawingInput,
	onMlResult?: (result: ClassifiedDrawing) => void
): Promise<ClassifiedDrawing> {
	const examples = input.recognitionExamples?.length ? input.recognitionExamples : EMPTY_EXAMPLES;
	const active = ensureWorker(input.dictionary, input.config, examples);
	if (!active) {
		return classifyDrawingAsync({ ...input, recognitionExamples: examples });
	}

	return new Promise<ClassifiedDrawing>((resolve, reject) => {
		const id = nextId;
		nextId += 1;
		latestRequestId = id;
		for (const [requestId, request] of requests) {
			if (!request.settled) {
				request.reject(new DrawingClassifierSupersededError());
			}
			requests.delete(requestId);
		}
		requests.set(id, {
			id,
			settled: false,
			resolve,
			reject,
			onMlResult
		});
		active.postMessage({
			type: 'classify',
			id,
			strokes: input.strokes,
			previousRing: input.previousRing,
			canvasWidth: input.canvasWidth,
			canvasHeight: input.canvasHeight,
			guideReferenceSize: input.guideReferenceSize
		});
	});
}

export function disposeDrawingClassifierClient(): void {
	rejectPending(new Error('drawing classifier worker disposed'));
	if (worker) {
		worker.terminate();
	}
	worker = null;
	sessionDictionary = null;
	sessionConfig = null;
	sessionExamples = null;
	disposeRecognitionPool();
}
