/// <reference lib="webworker" />
import { classifyDrawingPhasedLocal } from './classifier/index.js';
import { warmMlRecognizer } from './ml/index.js';
import type { AppConfig, ClassifiedDrawing, Dictionary, RingInfo, Stroke } from '../types.js';
import type { RecognitionExample } from './shape-matcher/index.js';

interface InitMessage {
	type: 'init';
	dictionary: Dictionary;
	config: AppConfig;
	recognitionExamples: RecognitionExample[];
}

/** Asks for the ML runtime, which `init` deliberately leaves unloaded. */
interface WarmMlMessage {
	type: 'warm-ml';
}

interface ClassifyMessage {
	type: 'classify';
	id: number;
	strokes: Stroke[];
	previousRing?: RingInfo | null;
	canvasWidth?: number;
	canvasHeight?: number;
	guideReferenceSize?: number;
}

type InboundMessage = InitMessage | WarmMlMessage | ClassifyMessage;

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
		return;
	}

	// The ML runtime is roughly 25 MB of weights and wasm, so init leaves it
	// unloaded and the client asks for it once the reader picks up the pen. A
	// visitor who never draws never pays for it. Repeats are free: every stage
	// `warmMlRecognizer` starts is memoized.
	if (message.type === 'warm-ml') {
		if (dictionary && config) {
			warmMlRecognizer(config, dictionary);
		}
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
					guideReferenceSize: message.guideReferenceSize,
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
