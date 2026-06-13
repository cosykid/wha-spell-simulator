/// <reference lib="webworker" />
import { classifyDrawingPhasedLocal } from './drawingClassifier.js';
import { warmMlRecognizer } from './mlRecognizer.js';
import type { AppConfig, ClassifiedDrawing, Dictionary, RingInfo, Stroke } from '../types.js';
import type { RecognitionExample } from './shapeMatcher.js';

interface InitMessage {
	type: 'init';
	dictionary: Dictionary;
	config: AppConfig;
	recognitionExamples: RecognitionExample[];
}

interface ClassifyMessage {
	type: 'classify';
	id: number;
	strokes: Stroke[];
	previousRing?: RingInfo | null;
	canvasWidth?: number;
	canvasHeight?: number;
}

type InboundMessage = InitMessage | ClassifyMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let dictionary: Dictionary | null = null;
let config: AppConfig | null = null;
let recognitionExamples: RecognitionExample[] = [];
let latestClassifyId = 0;

ctx.onmessage = (event: MessageEvent<InboundMessage>) => {
	const message = event.data;

	if (message.type === 'init') {
		dictionary = message.dictionary;
		config = message.config;
		recognitionExamples = message.recognitionExamples ?? [];
		warmMlRecognizer(config);
		return;
	}

	if (!dictionary || !config) {
		ctx.postMessage({ id: message.id, error: 'drawing classifier worker not initialized' });
		return;
	}

	latestClassifyId = message.id;

	void (async () => {
		try {
			const result: ClassifiedDrawing | null = await classifyDrawingPhasedLocal(
				{
					strokes: message.strokes,
					previousRing: message.previousRing,
					canvasWidth: message.canvasWidth,
					canvasHeight: message.canvasHeight,
					dictionary,
					config,
					recognitionExamples
				},
				(templateResult) => {
					if (message.id === latestClassifyId) {
						ctx.postMessage({ id: message.id, phase: 'template', result: templateResult });
					}
				},
				() => message.id === latestClassifyId,
				(mlProgressResult) => {
					if (message.id === latestClassifyId) {
						ctx.postMessage({
							id: message.id,
							phase: 'ml',
							result: mlProgressResult,
							final: false
						});
					}
				}
			);
			if (result && message.id === latestClassifyId) {
				ctx.postMessage({ id: message.id, phase: 'ml', result, final: true });
			}
		} catch (error) {
			if (message.id === latestClassifyId) {
				ctx.postMessage({ id: message.id, error: String(error) });
			}
		}
	})();
};
