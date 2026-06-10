/// <reference lib="webworker" />
import { analyzeStrokes } from './sigilDetector.js';
import type { AppConfig, Dictionary, Stroke } from '../types.js';

// Scoring the whole dictionary (clean -> candidate -> per-entry rotation/ink
// matching -> recognition) takes ~100ms, far longer than the gap between pointer
// samples, so it runs here off the main thread. The dictionary and config are
// sent once per session (mirroring recognitionWorker) and held so per-entry
// caches warm up once and persist across every analysis this worker runs.

interface InitMessage {
	type: 'init';
	dictionary: Dictionary;
	config: AppConfig;
}

interface AnalyzeMessage {
	type: 'analyze';
	id: number;
	strokes: Stroke[];
	mode: string;
	canvasWidth: number;
	canvasHeight: number;
}

type InboundMessage = InitMessage | AnalyzeMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let dictionary: Dictionary | null = null;
let config: AppConfig | null = null;

ctx.onmessage = (event: MessageEvent<InboundMessage>) => {
	const message = event.data;

	if (message.type === 'init') {
		dictionary = message.dictionary;
		config = message.config;
		return;
	}

	if (message.type === 'analyze') {
		if (!dictionary || !config) {
			ctx.postMessage({ id: message.id, error: 'sigil analysis worker not initialized' });
			return;
		}
		try {
			const result = analyzeStrokes({
				strokes: message.strokes,
				dictionary,
				mode: message.mode,
				canvasWidth: message.canvasWidth,
				canvasHeight: message.canvasHeight,
				config
			});
			ctx.postMessage({ id: message.id, result });
		} catch (error) {
			ctx.postMessage({ id: message.id, error: String(error) });
		}
	}
};
