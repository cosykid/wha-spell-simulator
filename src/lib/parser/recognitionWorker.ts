/// <reference lib="webworker" />
import { recognizeCandidates } from './recognition/index.js';
import type { AppConfig, Dictionary, SymbolCandidate } from '../types.js';
import type { RecognitionExample } from './shape-matcher/index.js';

interface InitMessage {
	type: 'init';
	dictionary: Dictionary;
	config: AppConfig;
	recognitionExamples: RecognitionExample[];
}

interface RecognizeMessage {
	type: 'recognize';
	id: number;
	candidate: SymbolCandidate;
}

type InboundMessage = InitMessage | RecognizeMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// The dictionary, config, and examples are sent once per session and held here,
// so the recognizer's per-dictionary example caches warm up once and persist
// across every candidate this worker scores.
let dictionary: Dictionary | null = null;
let config: AppConfig | null = null;
let recognitionExamples: RecognitionExample[] = [];

ctx.onmessage = (event: MessageEvent<InboundMessage>) => {
	const message = event.data;

	if (message.type === 'init') {
		dictionary = message.dictionary;
		config = message.config;
		recognitionExamples = message.recognitionExamples ?? [];
		return;
	}

	if (message.type === 'recognize') {
		if (!dictionary || !config) {
			ctx.postMessage({ id: message.id, error: 'recognition worker not initialized' });
			return;
		}
		try {
			const result = recognizeCandidates(
				[message.candidate],
				dictionary,
				config,
				recognitionExamples
			)[0];
			ctx.postMessage({ id: message.id, result });
		} catch (error) {
			ctx.postMessage({ id: message.id, error: String(error) });
		}
	}
};
